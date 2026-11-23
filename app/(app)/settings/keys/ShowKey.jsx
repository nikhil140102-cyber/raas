'use client';
import { useState } from 'react';

/** Lets an admin see and copy a key the app generates (to paste into the Chrome extension, Zapier or a cron service). */
export default function ShowKey({ value, label }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setShown(true); }
  }
  return (
    <span className="row tiny" style={{ gap: 8, flexWrap: 'wrap' }}>
      {shown ? <code style={{ userSelect: 'all', wordBreak: 'break-all' }} aria-label={`${label} value`}>{value}</code> : null}
      <button type="button" className="btn sm" onClick={() => setShown((s) => !s)}>{shown ? 'Hide' : 'Show'}</button>
      <button type="button" className="btn sm" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
    </span>
  );
}
