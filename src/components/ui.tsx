import { useEffect, useState, type ReactNode } from 'react';

export function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <button className="section-header" onClick={() => setOpen(!open)}>
        <span className={`chev ${open ? 'open' : ''}`}>▸</span>
        {title}
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label" title={hint}>
        {label}
      </span>
      {children}
    </label>
  );
}

// Numeric input that lets the user type freely and commits parsed values
function useDraft(value: string, commit: (raw: string) => void) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);
  return {
    value: draft,
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false);
      commit(draft);
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setDraft(e.target.value);
      commit(e.target.value);
    },
  };
}

// All fields these back (dollar amounts, ages, calendar years) are naturally
// non-negative, and startYear/endYear=0 means "auto" — so a floor of 0
// covers every current use. Number.isFinite (not just !isNaN) also rejects
// "Infinity"/"-Infinity", which parseFloat/parseInt otherwise happily accept
// and would silently poison the projection math downstream.
export function MoneyInput({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  const props = useDraft(value.toLocaleString('en-US'), (raw) => {
    const n = parseFloat(raw.replace(/[$,\s]/g, ''));
    if (Number.isFinite(n)) onChange(Math.max(min, n));
  });
  return <input className="num" inputMode="decimal" {...props} />;
}

export function IntInput({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  const props = useDraft(String(value), (raw) => {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n)) onChange(Math.max(min, n));
  });
  return <input className="num narrow" inputMode="numeric" {...props} />;
}

// Displays/edits as percent, stores a fraction (7 ↔ 0.07)
export function PercentInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const props = useDraft(String(Math.round(value * 10000) / 100), (raw) => {
    const n = parseFloat(raw.replace(/%/g, ''));
    if (Number.isFinite(n)) onChange(n / 100);
  });
  return (
    <span className="pct-wrap">
      <input className="num narrow" inputMode="decimal" {...props} />
      <span className="pct-sign">%</span>
    </span>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`toggle ${value ? 'on' : ''}`}
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
    >
      <span className="knob" />
      <span className="toggle-text">{value ? 'Yes' : 'No'}</span>
    </button>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <select className="num select" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function StatTile({
  label,
  value,
  detail,
  tone,
  hint,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'good' | 'bad';
  hint?: string;
}) {
  return (
    <div className="stat-tile" title={hint}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ?? ''}`}>{value}</div>
      {detail && <div className="stat-detail">{detail}</div>}
    </div>
  );
}
