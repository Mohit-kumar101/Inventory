import { useCallback, useEffect, useState } from 'react';
import { downloadExcel, excelFilename } from '../excel.js';
import { TextField } from '../components/Fields.jsx';
import { deleteBefore, exportTransactions, previewDelete } from '../api.js';

const EMPTY_FILTERS = { dateFrom: '', dateTo: '', technician: '', partNumber: '', movement: '' };
const PAGE_SIZE = 20;

export function HistoryPage() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    document.title = session ? 'Transaction history' : 'History';
  }, [session]);

  if (!session) return <HistoryLock onOpen={setSession} />;
  return <HistoryBody adminToken={session.adminToken} initial={session.initial} />;
}

function HistoryLock({ onOpen }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (checking) return;
    setChecking(true);
    try {
      const initial = await exportTransactions({ adminToken: password, ...EMPTY_FILTERS });
      onOpen({ adminToken: password, initial });
    } catch (err) {
      const message = err.message || '';
      setError(/not authorized/i.test(message) ? 'That password is not correct.' : message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <section>
      <h1>History</h1>
      <p className="lede">Enter the password to open history.</p>
      <form onSubmit={submit} noValidate>
        <TextField
          id="historyPassword"
          label="Password"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="done"
          value={password}
          error={error}
          onChange={(event) => {
            setPassword(event.target.value);
            setError('');
          }}
        />
        <button type="submit" className="primary" disabled={checking} aria-busy={checking}>
          {checking ? 'Checking…' : 'Open history'}
        </button>
      </form>
    </section>
  );
}

function HistoryBody({ adminToken, initial }) {
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(initial.rows || []);
  const [windowed, setWindowed] = useState(Boolean(initial.windowed));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cutoff, setCutoff] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  useEffect(() => {
    document.title = 'Transaction history';
  }, []);

  const filtered = rows;
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, safePage * PAGE_SIZE);

  const load = useCallback(
    async (filters) => {
      setLoading(true);
      try {
        const data = await exportTransactions({ adminToken, ...filters });
        setRows(data.rows || []);
        setWindowed(Boolean(data.windowed));
        setError('');
        return true;
      } catch (err) {
        setError(err.message || 'Could not load history.');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [adminToken]
  );

  function refresh() {
    return load(applied);
  }

  async function applyFilters(event) {
    event.preventDefault();
    if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) {
      setError('The start date must be on or before the end date.');
      return;
    }
    setNotice('');
    setPage(1);
    const next = { ...draft };
    if (await load(next)) setApplied(next);
  }

  function downloadMatching() {
    if (!filtered.length) {
      setError('There are no entries to download for these days.');
      return;
    }
    downloadExcel(filtered, excelFilename(applied));
    setError('');
    setNotice(`Downloaded ${filtered.length} entries. Open the file in Excel.`);
  }

  async function reviewOldEntries() {
    setPendingDelete(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
      setError('Choose the last date to remove.');
      return;
    }
    try {
      const data = await previewDelete({ adminToken, before: cutoff });
      setError('');
      setPendingDelete({ before: data.before, count: data.count });
    } catch (err) {
      setError(err.message || 'Could not check old entries.');
    }
  }

  async function confirmDelete() {
    if (!pendingDelete?.count) return;
    const agreed = window.confirm(
      `Remove ${pendingDelete.count} entries dated on or before ${pendingDelete.before}? Download Excel first if you still need them.`
    );
    if (!agreed) return;
    try {
      const data = await deleteBefore({ adminToken, before: pendingDelete.before });
      setPendingDelete(null);
      await refresh();
      setNotice(`Removed ${data.deleted} entries.`);
    } catch (err) {
      setError(err.message || 'Could not remove entries.');
    }
  }

  return (
    <section>
      <div className="history-head">
        <h1>History</h1>
        <p className="sheet-name">Transactions</p>
      </div>
      <p className="lede">
        Choose the days, then download them as Excel.
      </p>

      <form className="filters" onSubmit={applyFilters}>
        <TextField
          id="filterFrom"
          label="From"
          type="date"
          value={draft.dateFrom}
          onChange={(event) => setDraft((current) => ({ ...current, dateFrom: event.target.value }))}
        />
        <TextField
          id="filterTo"
          label="To"
          type="date"
          value={draft.dateTo}
          onChange={(event) => setDraft((current) => ({ ...current, dateTo: event.target.value }))}
        />
        <label className="field" htmlFor="filterMovement">
          <span>Movement</span>
          <select
            id="filterMovement"
            value={draft.movement}
            onChange={(event) => setDraft((current) => ({ ...current, movement: event.target.value }))}
          >
            <option value="">All</option>
            <option value="OUT">OUT</option>
            <option value="RETURN">RETURN</option>
          </select>
        </label>
        <TextField
          id="filterTechnician"
          label="Employee"
          value={draft.technician}
          autoCapitalize="words"
          onChange={(event) => setDraft((current) => ({ ...current, technician: event.target.value }))}
        />
        <TextField
          id="filterPart"
          label="Part number"
          value={draft.partNumber}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => setDraft((current) => ({ ...current, partNumber: event.target.value }))}
        />
        <div className="filter-actions">
          <button type="submit" className="primary" disabled={loading} aria-busy={loading}>
            {loading ? 'Loading…' : 'Apply days'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={loading}
            onClick={async () => {
              setDraft(EMPTY_FILTERS);
              setPage(1);
              setNotice('');
              if (await load(EMPTY_FILTERS)) setApplied(EMPTY_FILTERS);
            }}
          >
            Clear
          </button>
          <button type="button" className="secondary" disabled={loading} onClick={refresh}>
            Refresh
          </button>
        </div>
      </form>

      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="note" role="status">
          {notice}
        </p>
      ) : null}

      {windowed ? (
        <p className="note" role="status">
          Showing the latest 400 entries. Choose From or To dates to search older ones.
        </p>
      ) : null}

      <div className="import-bar">
        <p>
          {total === 0 ? 'No entries for these days.' : `Showing ${from}–${to} of ${total}`}
        </p>
        <button type="button" className="primary" disabled={total === 0} onClick={downloadMatching}>
          Download Excel
        </button>
      </div>

      <div className="cards">
        {visible.map((row) => (
          <article className="card" key={row.transactionId}>
            <div className="card-top">
              <span className={row.movement === 'OUT' ? 'pill out' : 'pill back'}>{row.movement}</span>
              <span className="txn-id">Transaction {row.transactionId}</span>
            </div>
            <p className="card-title">{row.description}</p>
            <dl className="facts">
              <div>
                <dt>Date</dt>
                <dd>{row.date}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>{row.time}</dd>
              </div>
              <div>
                <dt>Part number</dt>
                <dd>{row.partNumber}</dd>
              </div>
              <div>
                <dt>Quantity</dt>
                <dd>{row.quantity}</dd>
              </div>
              <div>
                <dt>Company</dt>
                <dd>{row.company}</dd>
              </div>
              <div>
                <dt>Employee</dt>
                <dd>{row.technician}</dd>
              </div>
              <div>
                <dt>FG number</dt>
                <dd>{row.fgNumber || 'No FG number'}</dd>
              </div>
              <div>
                <dt>Work order</dt>
                <dd>{row.workOrder || 'None'}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      {total > PAGE_SIZE ? (
        <div className="pager">
          <button type="button" className="secondary" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
            Previous
          </button>
          <button
            type="button"
            className="secondary"
            disabled={safePage * PAGE_SIZE >= total}
            onClick={() => setPage(safePage + 1)}
          >
            Next
          </button>
        </div>
      ) : null}

      <section className="danger-panel">
        <h2>Remove old entries</h2>
        <p className="fine">Download Excel first if you still need these entries.</p>
        <TextField
          id="deleteBefore"
          label="Remove on or before"
          type="date"
          value={cutoff}
          onChange={(event) => {
            setCutoff(event.target.value);
            setPendingDelete(null);
          }}
        />
        <div className="filter-actions">
          <button type="button" className="secondary" onClick={reviewOldEntries}>
            Check old entries
          </button>
        </div>
        {pendingDelete ? (
          <div className="confirm-delete">
            <p>
              {pendingDelete.count
                ? `${pendingDelete.count} entries dated on or before ${pendingDelete.before}.`
                : `No entries dated on or before ${pendingDelete.before}.`}
            </p>
            {pendingDelete.count ? (
              <button type="button" className="danger" onClick={confirmDelete}>
                Remove entries
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </section>
  );
}
