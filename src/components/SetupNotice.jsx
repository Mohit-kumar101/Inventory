import { missingConfig, scriptUrlWarning } from '../config.js';

export function needsSetup() {
  return missingConfig().length > 0;
}

export function SetupNotice() {
  const missing = missingConfig();
  const warning = scriptUrlWarning();

  if (missing.length) {
    return (
      <section className="panel" role="alert">
        <h1>Setup still needed</h1>
        <p>This copy of the site is not connected to Google Sheets.</p>
        <ul className="missing">
          {missing.map((item) => (
            <li key={item}>
              <code>{item}</code>
            </li>
          ))}
        </ul>
        <p>
          Add those values to <code>.env</code>, or set <code>VITE_USE_MOCK=true</code> to practice in
          this browser. Restart the dev server after saving the file.
        </p>
      </section>
    );
  }

  if (!warning) return null;

  return (
    <p className="alert" role="status">
      {warning}
    </p>
  );
}
