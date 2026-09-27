import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { saveEntry } from '../log.js';
import { TextAreaField, TextField } from '../components/Fields.jsx';
import { StationLink } from '../components/StationLink.jsx';
import { movementLabel, validateDetails } from '../validate.js';

function readStorage(area, key) {
  try {
    return area.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(area, key, value) {
  try {
    if (value == null) area.removeItem(key);
    else area.setItem(key, value);
  } catch {
    // A full or blocked browser store should not stop the person from finishing.
  }
}
const DRAFT_KEY = 'inventory.draft';
const TECH_KEY = 'inventory.technician';
const FIELD_ORDER = ['fgNumber', 'description', 'partNumber', 'company', 'quantity', 'technician'];

function blankForm(technician = '', remember = false) {
  return {
    step: 'movement',
    movement: '',
    noFg: false,
    fgNumber: '',
    description: '',
    partNumber: '',
    company: '',
    quantity: '',
    technician,
    rememberTechnician: remember,
    workOrder: '',
  };
}

function loadForm() {
  const remembered = readStorage(localStorage, TECH_KEY) || '';
  let draft = null;
  try {
    draft = JSON.parse(readStorage(sessionStorage, DRAFT_KEY) || 'null');
  } catch {
    draft = null;
  }

  const base = blankForm(remembered, Boolean(remembered));
  if (!draft || !['movement', 'details', 'review'].includes(draft.step)) return base;

  return {
    ...base,
    ...draft,
    technician: draft.technician || remembered,
    rememberTechnician: Boolean(draft.rememberTechnician),
  };
}

export function RecordPage() {
  const [form, setForm] = useState(loadForm);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const headingRef = useRef(null);
  const saving = useRef(false);

  useEffect(() => {
    document.title = 'Transactions';
  }, []);

  useEffect(() => {
    if (form.step === 'success') {
      writeStorage(sessionStorage, DRAFT_KEY, null);
      return;
    }
    writeStorage(sessionStorage, DRAFT_KEY, JSON.stringify(form));
  }, [form]);

  useEffect(() => {
    if (form.rememberTechnician && form.technician.trim()) {
      writeStorage(localStorage, TECH_KEY, form.technician.trim());
    } else if (!form.rememberTechnician) {
      writeStorage(localStorage, TECH_KEY, null);
    }
  }, [form.rememberTechnician, form.technician]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [form.step]);

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }));
    setErrors({});
    setSubmitError('');
  }

  function goToReview(event) {
    event.preventDefault();
    const checked = validateDetails(form);
    if (Object.keys(checked.errors).length) {
      setErrors(checked.errors);
      const first = FIELD_ORDER.find((name) => checked.errors[name]);
      document.getElementById(first)?.focus();
      return;
    }

    setErrors({});
    setSubmitError('');
    setForm((current) => ({
      ...current,
      step: 'review',
      noFg: !checked.value.fgNumber,
      fgNumber: checked.value.fgNumber,
      description: checked.value.description,
      partNumber: checked.value.partNumber,
      company: checked.value.company,
      quantity: String(checked.value.quantity),
      technician: checked.value.technician,
      workOrder: checked.value.workOrder,
    }));
  }

  async function confirmSave() {
    if (saving.current) return;
    const checked = validateDetails(form);
    if (!form.movement || Object.keys(checked.errors).length) {
      setErrors(checked.errors);
      setForm((current) => ({ ...current, step: 'details' }));
      return;
    }

    const payload = { movement: form.movement, ...checked.value };
    if (saving.current) return;
    saving.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      const entry = saveEntry(payload);
      writeStorage(sessionStorage, DRAFT_KEY, null);
      setResult(entry);
      setForm((current) => ({ ...current, step: 'success' }));
    } catch (error) {
      setSubmitError(error.message || 'Could not save this entry.');
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  }

  function recordAnother() {
    setResult(null);
    setSubmitError('');
    setErrors({});
    writeStorage(sessionStorage, DRAFT_KEY, null);
    setForm(blankForm(form.rememberTechnician ? form.technician : '', form.rememberTechnician));
  }

  return (
    <>
      {form.step === 'movement' ? (
        <MovementStep headingRef={headingRef} onChoose={(movement) => update({ movement, step: 'details' })} />
      ) : null}
      {form.step === 'details' ? (
        <DetailsStep
          form={form}
          errors={errors}
          headingRef={headingRef}
          onChange={update}
          onSubmit={goToReview}
        />
      ) : null}
      {form.step === 'review' ? (
        <ReviewStep
          form={form}
          headingRef={headingRef}
          submitting={submitting}
          submitError={submitError}
          onEdit={() => update({ step: 'details' })}
          onConfirm={confirmSave}
        />
      ) : null}
      {form.step === 'success' ? (
        <SuccessStep form={form} result={result} headingRef={headingRef} onAnother={recordAnother} />
      ) : null}
    </>
  );
}

function MovementStep({ headingRef, onChoose }) {
  return (
    <section>
      <p className="step">Step 1 of 3</p>
      <h1 ref={headingRef} tabIndex={-1}>
        What are you doing?
      </h1>
      <p className="lede">Choose OUT or RETURN, then enter the part.</p>
      <div className="choices">
        <button type="button" className="choice out" onClick={() => onChoose('OUT')}>
          <strong>OUT</strong>
          <span>Take part out</span>
        </button>
        <button type="button" className="choice back" onClick={() => onChoose('RETURN')}>
          <strong>RETURN</strong>
          <span>Put part back</span>
        </button>
      </div>
      <StationLink />
    </section>
  );
}

function DetailsStep({ form, errors, headingRef, onChange, onSubmit }) {
  return (
    <section>
      <p className="step">Step 2 of 3</p>
      <div className="movement-row">
        <span className={form.movement === 'OUT' ? 'pill out' : 'pill back'}>
          {movementLabel(form.movement)}
        </span>
        <button type="button" className="text-button" onClick={() => onChange({ step: 'movement' })}>
          Change
        </button>
      </div>
      <h1 ref={headingRef} tabIndex={-1}>
        Part details
      </h1>
      <form onSubmit={onSubmit} noValidate autoComplete="off">
        <TextField
          id="fgNumber"
          label="FG number"
          value={form.fgNumber}
          maxLength={80}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          disabled={form.noFg}
          error={errors.fgNumber}
          onChange={(event) => onChange({ fgNumber: event.target.value, noFg: false })}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={form.noFg}
            onChange={(event) =>
              onChange({ noFg: event.target.checked, fgNumber: event.target.checked ? '' : form.fgNumber })
            }
          />
          <span>No FG number</span>
        </label>
        <TextAreaField
          id="description"
          label="Description"
          value={form.description}
          maxLength={300}
          rows={2}
          autoCapitalize="sentences"
          enterKeyHint="next"
          error={errors.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
        <TextField
          id="partNumber"
          label="Part number"
          value={form.partNumber}
          maxLength={80}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          error={errors.partNumber}
          onChange={(event) => onChange({ partNumber: event.target.value })}
        />
        <TextField
          id="company"
          label="Company"
          value={form.company}
          maxLength={120}
          autoCapitalize="words"
          enterKeyHint="next"
          error={errors.company}
          onChange={(event) => onChange({ company: event.target.value })}
        />
        <TextField
          id="quantity"
          label="Quantity"
          inputMode="numeric"
          pattern="[0-9]*"
          value={form.quantity}
          maxLength={6}
          enterKeyHint="next"
          error={errors.quantity}
          onChange={(event) => onChange({ quantity: event.target.value })}
        />
        <TextField
          id="technician"
          label="Employee"
          value={form.technician}
          maxLength={80}
          autoCapitalize="words"
          autoCorrect="off"
          enterKeyHint="next"
          error={errors.technician}
          onChange={(event) => onChange({ technician: event.target.value })}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={form.rememberTechnician}
            onChange={(event) => onChange({ rememberTechnician: event.target.checked })}
          />
          <span>Remember this name on this phone</span>
        </label>
        <p className="fine">Leave that off on a shared station phone.</p>
        <TextField
          id="workOrder"
          label="Work order"
          hint="Optional"
          value={form.workOrder}
          maxLength={80}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          onChange={(event) => onChange({ workOrder: event.target.value })}
        />
        <div className="dock">
          <button type="submit" className="primary">
            Review entry
          </button>
        </div>
      </form>
    </section>
  );
}

function ReviewStep({ form, headingRef, submitting, submitError, onEdit, onConfirm }) {
  const rows = [
    ['Movement', movementLabel(form.movement)],
    ['FG number', form.fgNumber || 'No FG number'],
    ['Description', form.description],
    ['Part number', form.partNumber],
    ['Company', form.company],
    ['Quantity', form.quantity],
    ['Employee', form.technician],
    ['Work order', form.workOrder || 'None'],
  ];

  return (
    <section>
      <p className="step">Step 3 of 3</p>
      <h1 ref={headingRef} tabIndex={-1}>
        Check this entry
      </h1>
      <p className="lede">Nothing is saved until you confirm.</p>
      {submitError ? (
        <p className="alert" role="alert">
          {submitError}
        </p>
      ) : null}
      <dl className="summary">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="dock stack">
        <button type="button" className="primary" onClick={onConfirm} disabled={submitting} aria-busy={submitting}>
          {submitting ? 'Saving…' : 'Save transaction'}
        </button>
        <button type="button" className="secondary" onClick={onEdit} disabled={submitting}>
          Edit details
        </button>
      </div>
    </section>
  );
}

function SuccessStep({ form, result, headingRef, onAnother }) {
  return (
    <section className="success" role="status" aria-live="polite">
      <p className="step">Done</p>
      <h1 ref={headingRef} tabIndex={-1}>
        Saved
      </h1>
      <p className="lede">Open History when you want to download these entries as Excel.</p>
      <p className="txn">
        <span>Transaction {result?.transactionId}</span>
        <strong>{result?.timestamp}</strong>
      </p>
      <ul className="recap">
        <li>{form.movement === 'OUT' ? 'OUT' : 'RETURN'} · {movementLabel(form.movement)}</li>
        <li>
          {form.partNumber} · Qty {form.quantity}
        </li>
        <li>{form.description}</li>
      </ul>
      <div className="dock stack">
        <button type="button" className="primary" onClick={onAnother}>
          Record another transaction
        </button>
        <Link className="secondary link-button" to="/history">
          Open history
        </Link>
      </div>
    </section>
  );
}
