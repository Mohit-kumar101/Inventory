/**
 * Inventory movement logger.
 *
 * Bound to one private Google Sheet. Deploy as a web app that executes as you.
 * The sheet is never shared. Callers do not receive Google credentials.
 *
 * Script properties (Project Settings → Script properties), never pasted here:
 *   API_TOKEN    required to append a transaction
 *   ADMIN_TOKEN  required to read history; must be different from API_TOKEN
 *
 * Full setup, deployment, and access-control notes are in the project README.
 */

var HEADERS = [
  'Transaction ID',
  'Date',
  'Time',
  'Timestamp',
  'Movement',
  'FG Number',
  'Description',
  'Part Number',
  'Company',
  'Quantity',
  'Technician',
  'Work Order',
];

var RECENT_WINDOW = 400;
var PAGE_SIZE_DEFAULT = 20;
var PAGE_SIZE_MAX = 50;
var IDEMPOTENCY_SECONDS = 21600;

function spreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw userError(
      'Open this script from the sheet with Extensions, then Apps Script. A standalone script cannot see the sheet.'
    );
  }
  return ss;
}

function doGet() {
  return json({
    ok: true,
    service: 'inventory-movement',
    message: 'POST transactions from the inventory app. This address does not list any rows.',
  });
}

function doPost(e) {
  try {
    var payload = parsePayload(e);
    var props = PropertiesService.getScriptProperties();
    if (payload.action === 'append') return json(appendTransaction(payload, props));
    if (payload.action === 'import') return json(importTransactions(payload, props));
    if (payload.action === 'list') return json(listTransactions(payload, props));
    if (payload.action === 'export') return json(exportTransactions(payload, props));
    if (payload.action === 'previewDelete') return json(previewDelete(payload, props));
    if (payload.action === 'deleteBefore') return json(deleteBefore(payload, props));
    throw userError('Unknown action.');
  } catch (err) {
    Logger.log(err && err.stack ? err.stack : err);
    var message = err && err.public ? err.message : 'Could not complete the request. Try again.';
    return json({ ok: false, error: message });
  }
}

/**
 * Run once from the Apps Script editor after pasting this file.
 * Creates the Transactions tab and header row. Does not delete data rows.
 */
function installSheet() {
  var ss = spreadsheet();
  var sheet = ss.getSheetByName('Transactions');
  if (!sheet) {
    var only = ss.getSheets().length === 1 ? ss.getSheets()[0] : null;
    if (only && only.getLastRow() === 0) {
      only.setName('Transactions');
      sheet = only;
    } else {
      sheet = ss.insertSheet('Transactions');
    }
  }

  var lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('B:D').setNumberFormat('@');
    sheet.getRange('J:J').setNumberFormat('0');
  } else {
    assertHeaders(sheet);
  }

  var widths = [220, 120, 100, 190, 110, 140, 280, 160, 180, 100, 160, 150];
  for (var i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);

  ensureReceipts(ss);
  Logger.log('Transactions sheet is ready.');
  Logger.log('Spreadsheet timezone: ' + ss.getSpreadsheetTimeZone());
  Logger.log('Change it under File → Settings if Date and Time should use another zone.');
}

/**
 * Run from the editor to confirm setup without printing secret values.
 */
function checkSetup() {
  var props = PropertiesService.getScriptProperties();
  var api = props.getProperty('API_TOKEN') || '';
  var admin = props.getProperty('ADMIN_TOKEN') || '';
  var sheet = spreadsheet().getSheetByName('Transactions');
  Logger.log('Transactions sheet: ' + (sheet ? 'found' : 'MISSING — run installSheet'));
  Logger.log('API_TOKEN: ' + (api ? 'set (' + api.length + ' characters)' : 'MISSING'));
  Logger.log('ADMIN_TOKEN: ' + (admin ? 'set (' + admin.length + ' characters)' : 'MISSING'));
  Logger.log('Tokens are different: ' + (api && admin && api !== admin));
  if (sheet && sheet.getLastRow() > 0) {
    try {
      assertHeaders(sheet);
      Logger.log('Header row matches.');
    } catch (err) {
      Logger.log(err.message);
    }
  }
}

function appendTransaction(payload, props) {
  assertConfigured(props);
  if (!tokensMatch(payload.token, props.getProperty('API_TOKEN'))) {
    throw userError('Request was not authorized.');
  }

  var key = String(payload.idempotencyKey || '').trim();
  if (!/^[A-Za-z0-9-]{16,80}$/.test(key)) {
    throw userError('The submission could not be identified. Go back and try again.');
  }

  var cache = CacheService.getScriptCache();
  var cacheKey = 'idem_' + key;
  var duplicate = duplicateResponse(cache, cacheKey);
  if (duplicate) return duplicate;

  var record = validateTransaction(payload);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw userError('The sheet is busy. Wait a moment and try again.');
  }

  try {
    duplicate = duplicateResponse(cache, cacheKey);
    if (duplicate) return duplicate;

    var sheet = requireSheet();
    var now = new Date();
    var zone = spreadsheet().getSpreadsheetTimeZone();
    var transactionId = newTransactionId(now, zone);
    var date = Utilities.formatDate(now, zone, 'yyyy-MM-dd');
    var time = Utilities.formatDate(now, zone, 'HH:mm:ss');
    var timestamp = Utilities.formatDate(now, zone, 'yyyy-MM-dd HH:mm:ss');

    sheet.appendRow([
      transactionId,
      date,
      time,
      timestamp,
      record.movement,
      sheetText(record.fgNumber),
      sheetText(record.description),
      sheetText(record.partNumber),
      sheetText(record.company),
      record.quantity,
      sheetText(record.technician),
      sheetText(record.workOrder),
    ]);
    SpreadsheetApp.flush();

    var summary = {
      transactionId: transactionId,
      date: date,
      time: time,
      timestamp: timestamp,
      movement: record.movement,
      quantity: record.quantity,
    };
    cache.put(cacheKey, JSON.stringify(summary), IDEMPOTENCY_SECONDS);
    rememberReceipt(key, summary.transactionId, date);
    return { ok: true, duplicate: false, transaction: summary };
  } finally {
    lock.releaseLock();
  }
}

function importTransactions(payload, props) {
  assertConfigured(props);
  if (!tokensMatch(payload.token, props.getProperty('API_TOKEN'))) {
    throw userError('Request was not authorized.');
  }
  var entries = payload.entries;
  if (!entries || !entries.length) throw userError('There are no entries to import.');
  if (entries.length > 200) throw userError('Import up to 200 entries at a time. Narrow the dates.');

  var prepared = [];
  for (var i = 0; i < entries.length; i++) prepared.push(prepareImport(entries[i]));

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw userError('The sheet is busy. Wait a moment and try again.');
  try {
    var sheet = requireSheet();
    var receipts = ensureReceipts(spreadsheet());
    var known = receiptMap(receipts);
    var zone = spreadsheet().getSpreadsheetTimeZone();
    var results = [];
    var imported = 0;
    var skipped = 0;
    for (var n = 0; n < prepared.length; n++) {
      var item = prepared[n];
      if (known[item.localId]) {
        skipped++;
        results.push({ localId: item.localId, transactionId: known[item.localId], duplicate: true });
        continue;
      }
      var transactionId = newTransactionId(new Date(), zone);
      sheet.appendRow([
        transactionId,
        item.date,
        item.time,
        item.date + ' ' + item.time,
        item.movement,
        sheetText(item.fgNumber),
        sheetText(item.description),
        sheetText(item.partNumber),
        sheetText(item.company),
        item.quantity,
        sheetText(item.technician),
        sheetText(item.workOrder),
      ]);
      receipts.appendRow([item.localId, transactionId, item.date]);
      known[item.localId] = transactionId;
      imported++;
      results.push({ localId: item.localId, transactionId: transactionId, duplicate: false });
    }
    SpreadsheetApp.flush();
    return { ok: true, imported: imported, skipped: skipped, results: results };
  } finally {
    lock.releaseLock();
  }
}

function prepareImport(entry) {
  var record = validateTransaction(entry);
  var localId = String(entry.localId || '').trim();
  var date = String(entry.date || '').trim();
  var time = String(entry.time || '').trim();
  if (!/^[A-Za-z0-9-]{16,80}$/.test(localId)) throw userError('One entry could not be identified.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}:\d{2}$/.test(time)) {
    throw userError('One entry has a missing date or time.');
  }
  record.localId = localId;
  record.date = date;
  record.time = time;
  return record;
}

function ensureReceipts(ss) {
  var sheet = ss.getSheetByName('Receipts');
  if (!sheet) {
    sheet = ss.insertSheet('Receipts');
    sheet.getRange(1, 1, 1, 3).setValues([['Idempotency Key', 'Transaction ID', 'Date']]);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('A:C').setNumberFormat('@');
  }
  if (ss.getSheets().length > 1) sheet.hideSheet();
  return sheet;
}

function receiptMap(sheet) {
  var map = {};
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return map;
  var values = sheet.getRange(2, 1, lastRow, 2).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0]) map[String(values[i][0])] = String(values[i][1] || '');
  }
  return map;
}

function rememberReceipt(key, transactionId, date) {
  var receipts = ensureReceipts(spreadsheet());
  var known = receiptMap(receipts);
  if (known[key]) return;
  receipts.appendRow([key, transactionId, date]);
}

function listTransactions(payload, props) {
  assertAdmin(payload, props);
  var pageSize = clampInteger(payload.pageSize, PAGE_SIZE_DEFAULT, 1, PAGE_SIZE_MAX);
  var requestedPage = clampInteger(payload.page, 1, 1, 100000);
  var collected = collectRows(payload);
  var pageCount = Math.max(1, Math.ceil(collected.rows.length / pageSize));
  var page = Math.min(requestedPage, pageCount);
  var start = (page - 1) * pageSize;
  return {
    ok: true,
    rows: collected.rows.slice(start, start + pageSize),
    page: page,
    pageSize: pageSize,
    total: collected.rows.length,
    windowed: collected.windowed,
  };
}

function exportTransactions(payload, props) {
  assertAdmin(payload, props);
  var collected = collectRows(payload);
  if (collected.rows.length > 5000) {
    throw userError('That range has more than 5000 rows. Narrow the dates and try again.');
  }
  return {
    ok: true,
    rows: collected.rows,
    total: collected.rows.length,
    windowed: collected.windowed,
  };
}

function previewDelete(payload, props) {
  assertAdmin(payload, props);
  var cutoff = cleanCutoff(payload.before);
  var matches = rowsOnOrBefore(requireSheet(), cutoff);
  return { ok: true, before: cutoff, count: matches.length };
}

function deleteBefore(payload, props) {
  assertAdmin(payload, props);
  if (payload.confirm !== true) throw userError('Confirm the deletion before it runs.');
  var cutoff = cleanCutoff(payload.before);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw userError('The sheet is busy. Wait a moment and try again.');
  try {
    var sheet = requireSheet();
    var matches = rowsOnOrBefore(sheet, cutoff);
    deleteRowNumbers(sheet, matches);
    return { ok: true, before: cutoff, deleted: matches.length };
  } finally {
    lock.releaseLock();
  }
}

function collectRows(payload) {
  var filters = readFilters(payload);
  var sheet = requireSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { rows: [], windowed: false };

  var hasDate = filters.dateFrom || filters.dateTo;
  var windowed = false;
  var startRow = 2;
  if (!hasDate && lastRow - 1 > RECENT_WINDOW) {
    startRow = lastRow - RECENT_WINDOW + 1;
    windowed = true;
  }

  var values = sheet.getRange(startRow, 1, lastRow, HEADERS.length).getValues();
  var filtered = [];
  for (var i = values.length - 1; i >= 0; i--) {
    var row = mapRow(values[i]);
    if (!row.transactionId) continue;
    if (!rowMatches(row, filters)) continue;
    filtered.push(row);
  }
  return { rows: filtered, windowed: windowed };
}

function readFilters(payload) {
  var dateFrom = String(payload.dateFrom || '').trim();
  var dateTo = String(payload.dateTo || '').trim();
  if (!dateFrom && !dateTo && payload.date) {
    dateFrom = String(payload.date).trim();
    dateTo = dateFrom;
  }
  if (dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) throw userError('Use a start date in YYYY-MM-DD format.');
  if (dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) throw userError('Use an end date in YYYY-MM-DD format.');
  if (dateFrom && dateTo && dateFrom > dateTo) throw userError('The start date must be on or before the end date.');
  var movement = String(payload.movement || '').trim();
  if (movement && movement !== 'OUT' && movement !== 'RETURN') {
    throw userError('Movement filter must be OUT or RETURN.');
  }
  return {
    dateFrom: dateFrom,
    dateTo: dateTo,
    technician: String(payload.technician || '').trim().toLowerCase(),
    partNumber: String(payload.partNumber || '').trim().toLowerCase(),
    movement: movement,
  };
}

function rowMatches(row, filters) {
  if (filters.dateFrom && row.date < filters.dateFrom) return false;
  if (filters.dateTo && row.date > filters.dateTo) return false;
  if (filters.movement && row.movement !== filters.movement) return false;
  if (filters.technician && row.technician.toLowerCase().indexOf(filters.technician) === -1) return false;
  if (filters.partNumber && row.partNumber.toLowerCase().indexOf(filters.partNumber) === -1) return false;
  return true;
}

function cleanCutoff(value) {
  var cutoff = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
    throw userError('Choose the last date to remove, in YYYY-MM-DD format.');
  }
  return cutoff;
}

function rowsOnOrBefore(sheet, cutoff) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var dates = sheet.getRange(2, 2, lastRow, 2).getValues();
  var rowNumbers = [];
  for (var i = 0; i < dates.length; i++) {
    var date = cellDate(dates[i][0]);
    if (date && date <= cutoff) rowNumbers.push(i + 2);
  }
  return rowNumbers;
}

function deleteRowNumbers(sheet, rowNumbers) {
  if (!rowNumbers.length) return;
  var ranges = [];
  var start = rowNumbers[0];
  var count = 1;
  for (var i = 1; i < rowNumbers.length; i++) {
    if (rowNumbers[i] === start + count) {
      count++;
    } else {
      ranges.push([start, count]);
      start = rowNumbers[i];
      count = 1;
    }
  }
  ranges.push([start, count]);
  for (var j = ranges.length - 1; j >= 0; j--) {
    sheet.deleteRows(ranges[j][0], ranges[j][1]);
  }
}

function assertAdmin(payload, props) {
  assertConfigured(props);
  if (!tokensMatch(payload.adminToken, props.getProperty('ADMIN_TOKEN'))) {
    throw userError('Request was not authorized.');
  }
}

function pageResult(rows, page, pageSize, windowed) {
  return {
    ok: true,
    rows: rows,
    page: page,
    pageSize: pageSize,
    total: rows.length,
    windowed: windowed,
  };
}

function mapRow(values) {
  return {
    transactionId: cellText(values[0]),
    date: cellDate(values[1]),
    time: cellTime(values[2]),
    timestamp: cellText(values[3]),
    movement: cellText(values[4]),
    fgNumber: cellText(values[5]),
    description: cellText(values[6]),
    partNumber: cellText(values[7]),
    company: cellText(values[8]),
    quantity: cellQuantity(values[9]),
    technician: cellText(values[10]),
    workOrder: cellText(values[11]),
  };
}

function validateTransaction(payload) {
  var movement = String(payload.movement || '').trim();
  if (movement !== 'OUT' && movement !== 'RETURN') {
    throw userError('Choose take out or put back before saving.');
  }

  var fgNumber = cleanText(payload.fgNumber, 80);
  var description = cleanText(payload.description, 300);
  var partNumber = cleanText(payload.partNumber, 80);
  var company = cleanText(payload.company, 120);
  var technician = cleanText(payload.technician, 80);
  var workOrder = cleanText(payload.workOrder, 80);

  if (!description) throw userError('Description is required.');
  if (!partNumber) throw userError('Part number is required.');
  if (!company) throw userError('Company is required.');
  if (!technician) throw userError('Technician is required.');

  return {
    movement: movement,
    fgNumber: fgNumber,
    description: description,
    partNumber: partNumber,
    company: company,
    quantity: cleanQuantity(payload.quantity),
    technician: technician,
    workOrder: workOrder,
  };
}

function cleanText(value, max) {
  var text = String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > max) throw userError('One of the fields is too long.');
  return text;
}

function cleanQuantity(value) {
  if (typeof value === 'number') {
    if (!isFinite(value) || Math.floor(value) !== value || value < 1 || value > 999999) {
      throw userError('Quantity must be a whole number from 1 to 999999.');
    }
    return value;
  }
  var text = String(value == null ? '' : value).trim();
  if (!/^[1-9]\d{0,5}$/.test(text)) {
    throw userError('Quantity must be a whole number from 1 to 999999.');
  }
  return Number(text);
}

function requireSheet() {
  var sheet = spreadsheet().getSheetByName('Transactions');
  if (!sheet) {
    throw userError('The Transactions sheet is missing. Run installSheet in the Apps Script editor.');
  }
  assertHeaders(sheet);
  return sheet;
}

function assertHeaders(sheet) {
  var headers = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  for (var i = 0; i < HEADERS.length; i++) {
    if (headers[i] !== HEADERS[i]) {
      throw userError(
        'The Transactions header row does not match. Existing rows were left as they are.'
      );
    }
  }
}

function assertConfigured(props) {
  var api = props.getProperty('API_TOKEN') || '';
  var admin = props.getProperty('ADMIN_TOKEN') || '';
  if (!api || !admin) {
    throw userError('Server is missing API_TOKEN or ADMIN_TOKEN in Script properties.');
  }
  if (api === admin) {
    throw userError('API_TOKEN and ADMIN_TOKEN must be different values.');
  }
}

function tokensMatch(provided, expected) {
  var a = String(provided || '');
  var b = String(expected || '');
  if (!b || a.length !== b.length) return false;
  var mismatch = 0;
  for (var i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function newTransactionId(now, zone) {
  var stamp = Utilities.formatDate(now, zone, 'yyyyMMdd-HHmmss');
  var rand = Utilities.getUuid().replace(/-/g, '').substring(0, 8);
  return 'TXN-' + stamp + '-' + rand;
}

function sheetText(value) {
  var text = String(value || '');
  if (/^[=+\-@]/.test(text)) return "'" + text;
  return text;
}

function duplicateResponse(cache, cacheKey) {
  var existing = cache.get(cacheKey);
  if (!existing) return null;
  var transaction = null;
  try {
    transaction = JSON.parse(existing);
  } catch (err) {
    transaction = null;
  }
  return { ok: true, duplicate: true, transaction: transaction };
}

function cellText(value) {
  if (value instanceof Date) {
    var zone = spreadsheet().getSpreadsheetTimeZone();
    return Utilities.formatDate(value, zone, 'yyyy-MM-dd HH:mm:ss');
  }
  return String(value == null ? '' : value);
}

function cellDate(value) {
  if (value instanceof Date) {
    var zone = spreadsheet().getSpreadsheetTimeZone();
    return Utilities.formatDate(value, zone, 'yyyy-MM-dd');
  }
  return String(value == null ? '' : value).substring(0, 10);
}

function cellTime(value) {
  if (value instanceof Date) {
    var zone = spreadsheet().getSpreadsheetTimeZone();
    return Utilities.formatDate(value, zone, 'HH:mm:ss');
  }
  var text = String(value == null ? '' : value);
  var match = text.match(/(\d{2}:\d{2}:\d{2})/);
  return match ? match[1] : text;
}

function cellQuantity(value) {
  if (typeof value === 'number') return value;
  var text = String(value == null ? '' : value).trim();
  return /^[1-9]\d{0,5}$/.test(text) ? Number(text) : text;
}

function clampInteger(value, fallback, min, max) {
  var number = Number(value);
  if (!isFinite(number)) return fallback;
  number = Math.floor(number);
  if (number < min) return min;
  if (number > max) return max;
  return number;
}

function parsePayload(e) {
  if (!e || !e.postData || !e.postData.contents) throw userError('Missing request body.');
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    throw userError('Request body must be JSON.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw userError('Request body must be a JSON object.');
  }
  return data;
}

function userError(message) {
  var error = new Error(message);
  error.public = true;
  return error;
}

function json(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON
  );
}
