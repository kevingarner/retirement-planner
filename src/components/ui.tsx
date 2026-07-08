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

export function MoneyInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const props = useDraft(value.toLocaleString('en-US'), (raw) => {
    const n = parseFloat(raw.replace(/[$,\s]/g, ''));
    if (!Number.isNaN(n)) onChange(n);
  });
  return <input className="num" inputMode="decimal" {...props} />;
}

export function IntInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const props = useDraft(String(value), (raw) => {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) onChange(n);
  });
  return <input className="num narrow" inputMode="numeric" {...props} />;
}

// Displays/edits as percent, stores a fraction (7 ↔ 0.07)
export function PercentInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const props = useDraft(String(Math.round(value * 10000) / 100), (raw) => {
    const n = parseFloat(raw.replace(/%/g, ''));
    if (!Number.isNaN(n)) onChange(n / 100);
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
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ?? ''}`}>{value}</div>
      {detail && <div className="stat-detail">{detail}</div>}
    </div>
  );
}
