const COLUMNS = [
  ['transactionId', 'Transaction ID'],
  ['date', 'Date'],
  ['time', 'Time'],
  ['movement', 'Movement'],
  ['fgNumber', 'FG Number'],
  ['description', 'Description'],
  ['partNumber', 'Part Number'],
  ['company', 'Company'],
  ['quantity', 'Quantity'],
  ['technician', 'Technician'],
  ['workOrder', 'Work Order'],
];

function escapeCsv(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function excelFilename(filters) {
  if (filters.dateFrom && filters.dateTo) return `inventory-${filters.dateFrom}-to-${filters.dateTo}.csv`;
  if (filters.dateFrom) return `inventory-from-${filters.dateFrom}.csv`;
  if (filters.dateTo) return `inventory-through-${filters.dateTo}.csv`;
  return 'inventory-latest.csv';
}

export function downloadExcel(rows, filename) {
  const header = COLUMNS.map(([, label]) => label).join(',');
  const lines = rows.map((row) => COLUMNS.map(([key]) => escapeCsv(row[key])).join(','));
  const csv = `\uFEFF${[header, ...lines].join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
