export function TextField({ id, label, hint, error, ...props }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        <span>{label}</span>
        {hint ? <span className="hint">{hint}</span> : null}
      </label>
      <input
        {...props}
        id={id}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextAreaField({ id, label, hint, error, ...props }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        <span>{label}</span>
        {hint ? <span className="hint">{hint}</span> : null}
      </label>
      <textarea
        {...props}
        id={id}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
