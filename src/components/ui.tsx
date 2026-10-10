import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

/** A number input that allows an empty value (null) while typing. */
export function NumberInput({
  id,
  value,
  onChange,
  min,
  step = 0.01,
  placeholder,
  allowEmpty = false,
  suffix,
}: {
  id?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  step?: number;
  placeholder?: string;
  allowEmpty?: boolean;
  suffix?: string;
}) {
  return (
    <div className="with-suffix">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value ?? ''}
        min={min}
        step={step}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') onChange(allowEmpty ? null : 0);
          else if (!Number.isNaN(Number(raw))) onChange(Number(raw));
        }}
      />
      {suffix ? <span className="suffix">{suffix}</span> : null}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PersonChip({
  name,
  color,
  on,
  onToggle,
}: {
  name: string;
  color: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`chip ${on ? 'on' : ''}`}
      style={{ ['--person' as string]: color }}
      aria-pressed={on}
      onClick={onToggle}
    >
      <span className="dot" aria-hidden="true" />
      {name}
    </button>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} aria-hidden="true" />;
}

/** A modal sheet built on <dialog>: focus trap, Escape to close, backdrop tap to close. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open ? (
        <div className="sheet-body">
          <header className="sheet-head">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>
          <div className="sheet-content">{children}</div>
          {footer ? <footer className="sheet-foot">{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}
