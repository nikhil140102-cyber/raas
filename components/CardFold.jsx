'use client';
// Pipeline card that shows only the name and ATS match %; the arrow opens the rest (pay, notice, tags, stage).
import { useEffect, useState } from 'react';

const KEY = 'avs_cards_open';
const readPref = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

export default function CardFold({ head, label, children }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(readPref());
    const all = (e) => setOpen(Boolean(e.detail));
    window.addEventListener('avs-cards', all);
    return () => window.removeEventListener('avs-cards', all);
  }, []);
  return (
    <div className={`pcard fold${open ? ' open' : ''}`}>
      <div className="top">
        {head}
        <button type="button" className="foldbtn" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} details for ${label}`} title={open ? 'Hide details' : 'Show details'} onClick={() => setOpen((o) => !o)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
      {open ? <div className="foldbody">{children}</div> : null}
    </div>
  );
}

/** "Show all details" / "Hide all details" for every card on the board (remembered in this browser). */
export function FoldAll() {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(readPref()); }, []);
  const set = (v) => { setOpen(v); try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* storage blocked */ } window.dispatchEvent(new CustomEvent('avs-cards', { detail: v })); };
  return <button type="button" className="btn sm" onClick={() => set(!open)} aria-pressed={open}>{open ? 'Hide all card details' : 'Show all card details'}</button>;
}
