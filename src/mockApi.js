import { validateDetails } from './validate.js';

const TX_KEY = 'inventory.mock.transactions';
const IDEM_KEY = 'inventory.mock.idempotency';
const RECENT_WINDOW = 400;

function readJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function wait() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 250);
  });
}

function append(body) {
  const checked = validateDetails({ ...body, noFg: !String(body.fgNumber || '').trim() });
  if (body.movement !== 'OUT' && body.movement !== 'RETURN') {
    throw new Error('Choose take out or put back before saving.');
  }
  if (!/^[A-Za-z0-9-]{16,80}$/.test(body.idempotencyKey || '')) {
    throw new Error('The submission could not be identified. Go back and try again.');
  }
  if (Object.keys(checked.errors).length) {
    throw new Error(Object.values(checked.errors)[0]);
  }

  const receipts = readJson(IDEM_KEY, {});
  if (receipts[body.idempotencyKey]) {
    return { ok: true, duplicate: true, transaction: receipts[body.idempotencyKey] };
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const rows = readJson(TX_KEY, []);
  const highest = rows.reduce((max, item) => Math.max(max, Number.parseInt(item.transactionId, 10) || 0), 0);
  const row = {
    transactionId: String(highest + 1),
    date,
    time,
    timestamp: `${date} ${time}`,
    movement: body.movement,
    fgNumber: checked.value.fgNumber,
    description: checked.value.description,
    partNumber: checked.value.partNumber,
    company: checked.value.company,
    quantity: checked.value.quantity,
    technician: checked.value.technician,
    workOrder: checked.value.workOrder,
  };

  rows.push(row);
  writeJson(TX_KEY, rows.slice(-500));
  receipts[body.idempotencyKey] = {
    transactionId: row.transactionId,
    date: row.date,
    time: row.time,
    timestamp: row.timestamp,
    movement: row.movement,
    quantity: row.quantity,
  };
  writeJson(IDEM_KEY, receipts);
  return { ok: true, duplicate: false, transaction: receipts[body.idempotencyKey] };
}

function requireMockAdmin(body) {
  if (String(body.adminToken || '').trim().length < 4) {
    throw new Error('Request was not authorized.');
  }
}

function filteredRows(body) {
  requireMockAdmin(body);
  const dateFrom = String(body.dateFrom || '').trim();
  const dateTo = String(body.dateTo || '').trim();
  const technician = String(body.technician || '').trim().toLowerCase();
  const partNumber = String(body.partNumber || '').trim().toLowerCase();
  const movement = String(body.movement || '').trim();
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new Error('The start date must be on or before the end date.');
  }
  const stored = readJson(TX_KEY, []);
  const hasDate = Boolean(dateFrom || dateTo);
  const windowed = !hasDate && stored.length > RECENT_WINDOW;
  const source = windowed ? stored.slice(-RECENT_WINDOW) : stored;
  const rows = source.filter((row) => {
    if (dateFrom && row.date < dateFrom) return false;
    if (dateTo && row.date > dateTo) return false;
    if (movement && row.movement !== movement) return false;
    if (technician && !row.technician.toLowerCase().includes(technician)) return false;
    if (partNumber && !row.partNumber.toLowerCase().includes(partNumber)) return false;
    return true;
  }).reverse();
  return { rows, windowed };
}

function list(body) {
  const pageSize = 20;
  const { rows, windowed } = filteredRows(body);
  const requested = Math.max(1, Number(body.page) || 1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(requested, pageCount);
  const start = (page - 1) * pageSize;
  return {
    ok: true,
    rows: rows.slice(start, start + pageSize),
    page,
    pageSize,
    total: rows.length,
    windowed,
  };
}

function exportRows(body) {
  const { rows, windowed } = filteredRows(body);
  if (rows.length > 5000) {
    throw new Error('That range has more than 5000 rows. Narrow the dates and try again.');
  }
  return { ok: true, rows, total: rows.length, windowed };
}

function previewDelete(body) {
  requireMockAdmin(body);
  const before = String(body.before || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) {
    throw new Error('Choose the last date to remove, in YYYY-MM-DD format.');
  }
  const count = readJson(TX_KEY, []).filter((row) => row.date && row.date <= before).length;
  return { ok: true, before, count };
}

function deleteBefore(body) {
  const preview = previewDelete(body);
  if (body.confirm !== true) throw new Error('Confirm the deletion before it runs.');
  const kept = readJson(TX_KEY, []).filter((row) => !row.date || row.date > preview.before);
  writeJson(TX_KEY, kept);
  return { ok: true, before: preview.before, deleted: preview.count };
}

export async function mockRequest(body) {
  await wait();
  if (body.action === 'append') return append(body);
  if (body.action === 'list') return list(body);
  if (body.action === 'export') return exportRows(body);
  if (body.action === 'previewDelete') return previewDelete(body);
  if (body.action === 'deleteBefore') return deleteBefore(body);
  throw new Error('Unknown action.');
}
