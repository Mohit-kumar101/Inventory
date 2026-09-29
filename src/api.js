import { config } from './config.js';
import { mockRequest } from './mockApi.js';

export async function postAction(body) {
  if (config.useMock) return mockRequest(body);

  let response;
  try {
    response = await fetch(config.scriptUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach Google. Check the connection and try again.');
  }

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    if (/authorization needed|unable to open the file|sign in/i.test(text)) {
      throw new Error(
        'Google refused the request. Deploy the web app as Anyone and use the /exec URL.'
      );
    }
    throw new Error('The server returned an unexpected response. Check the Apps Script deployment.');
  }

  if (!data || data.ok !== true) {
    throw new Error(data?.error || 'The server rejected the request.');
  }
  return data;
}

export function appendTransaction(fields, idempotencyKey) {
  return postAction({
    action: 'append',
    token: config.apiToken,
    idempotencyKey,
    movement: fields.movement,
    fgNumber: fields.fgNumber,
    description: fields.description,
    partNumber: fields.partNumber,
    company: fields.company,
    quantity: fields.quantity,
    technician: fields.technician,
    workOrder: fields.workOrder,
  });
}

function historyQuery(action, input) {
  return postAction({
    action: action,
    adminToken: input.adminToken,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    technician: input.technician,
    partNumber: input.partNumber,
    movement: input.movement,
    page: input.page,
    pageSize: input.pageSize,
    before: input.before,
    confirm: input.confirm,
  });
}

export function listTransactions(input) {
  return historyQuery('list', input);
}

export function exportTransactions(input) {
  return historyQuery('export', input);
}

export function previewDelete(input) {
  return historyQuery('previewDelete', input);
}

export function deleteBefore(input) {
  return historyQuery('deleteBefore', { ...input, confirm: true });
}
