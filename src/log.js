const LOG_KEY = 'inventory.log';

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(rows) {
  localStorage.setItem(LOG_KEY, JSON.stringify(rows));
}

function stamp(now) {
  const pad = (value) => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return { date, time, timestamp: `${date} ${time}` };
}

function newLocalId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function saveEntry(fields) {
  const when = stamp(new Date());
  const entry = {
    localId: newLocalId(),
    ...when,
    movement: fields.movement,
    fgNumber: fields.fgNumber,
    description: fields.description,
    partNumber: fields.partNumber,
    company: fields.company,
    quantity: fields.quantity,
    technician: fields.technician,
    workOrder: fields.workOrder,
    imported: false,
    transactionId: '',
  };
  const rows = readAll();
  rows.push(entry);
  writeAll(rows.slice(-2000));
  return entry;
}

export function listEntries() {
  return readAll().slice().reverse();
}

export function filterEntries(rows, filters) {
  const dateFrom = filters.dateFrom || '';
  const dateTo = filters.dateTo || '';
  const technician = (filters.technician || '').trim().toLowerCase();
  const partNumber = (filters.partNumber || '').trim().toLowerCase();
  const movement = filters.movement || '';
  return rows.filter((row) => {
    if (dateFrom && row.date < dateFrom) return false;
    if (dateTo && row.date > dateTo) return false;
    if (movement && row.movement !== movement) return false;
    if (technician && !row.technician.toLowerCase().includes(technician)) return false;
    if (partNumber && !row.partNumber.toLowerCase().includes(partNumber)) return false;
    return true;
  });
}

export function markImported(results) {
  const byId = new Map(results.map((item) => [item.localId, item.transactionId]));
  const rows = readAll().map((row) => {
    if (!byId.has(row.localId)) return row;
    return { ...row, imported: true, transactionId: byId.get(row.localId) || row.transactionId };
  });
  writeAll(rows);
}

export function deleteOnOrBefore(cutoff) {
  const rows = readAll();
  const kept = rows.filter((row) => !row.date || row.date > cutoff);
  writeAll(kept);
  return rows.length - kept.length;
}
