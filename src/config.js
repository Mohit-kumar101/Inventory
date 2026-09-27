function normalizeUrl(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

export const config = {
  useMock: import.meta.env.VITE_USE_MOCK === 'true',
  scriptUrl: normalizeUrl(import.meta.env.VITE_APPS_SCRIPT_URL),
  apiToken: String(import.meta.env.VITE_API_TOKEN || '').trim(),
  publicUrl: String(import.meta.env.VITE_PUBLIC_URL || 'https://mohit-kumar101.github.io/Inventory/').trim(),
};

export function missingConfig() {
  if (config.useMock) return [];
  const missing = [];
  if (!config.scriptUrl) missing.push('VITE_APPS_SCRIPT_URL');
  if (!config.apiToken) missing.push('VITE_API_TOKEN');
  return missing;
}

export function scriptUrlWarning() {
  if (config.useMock || !config.scriptUrl) return '';
  if (!config.scriptUrl.startsWith('https://script.google.com/macros/s/')) {
    return 'The Apps Script URL should start with https://script.google.com/macros/s/ and end with /exec.';
  }
  if (config.scriptUrl.endsWith('/dev')) {
    return 'This URL ends with /dev. Phones cannot use that address. Deploy the web app and use the /exec URL.';
  }
  if (!config.scriptUrl.endsWith('/exec')) {
    return 'The Apps Script URL should end with /exec.';
  }
  return '';
}
