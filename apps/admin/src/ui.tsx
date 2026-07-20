import { type ReactNode, useState } from 'react';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Banner({ kind, children }: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  return (
    <div className={`banner banner-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner-wrap">
      <span className="spinner" aria-hidden /> {label ?? 'Loading…'}
    </span>
  );
}

export function Pill({ on, labelOn = 'active', labelOff = 'revoked' }: { on: boolean; labelOn?: string; labelOff?: string }) {
  return <span className={`pill ${on ? 'pill-on' : 'pill-off'}`}>{on ? labelOn : labelOff}</span>;
}

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Turn an unknown thrown value into a display string. */
export function errMsg(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as Error).message);
  return String(err);
}
