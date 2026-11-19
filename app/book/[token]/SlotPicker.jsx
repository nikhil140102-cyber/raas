'use client';
import { useActionState, useState } from 'react';
import { bookSlotPublic } from '../../_actions/screening';

const time = (iso) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });

export default function SlotPicker({ token, days }) {
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, action, pending] = useActionState(bookSlotPublic, null);

  if (state?.ok) {
    const d = new Date(state.slot);
    return (
      <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: 32 }}>
        <span style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#067647" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
        <h2 style={{ fontSize: 22 }}>You&apos;re booked</h2>
        <p>We&apos;ll call you on {d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' })} at {time(state.slot)} (IST). Keep your phone nearby.</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>Change time</button>
      </div>
    );
  }
  if (!days.length) return <p className="notice warn">No slots are open right now. A recruiter will contact you.</p>;

  return (
    <form action={action} className="stack" style={{ gap: 18 }}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="slot" value={slot} />
      <div role="radiogroup" aria-label="Day" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(days.length, 3)}, minmax(0, 1fr))`, gap: 8 }}>
        {days.map((d, i) => (
          <button key={d.label} type="button" role="radio" aria-checked={day === i} className={`day${day === i ? ' on' : ''}`} onClick={() => { setDay(i); setSlot(''); }}>{d.label}</button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Time" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {days[day].slots.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={slot === s} className={`slot${slot === s ? ' on' : ''}`} onClick={() => setSlot(s)}>{time(s)}</button>
        ))}
      </div>
      <label className="card small" style={{ flexDirection: 'row', gap: 10, padding: 12, alignItems: 'flex-start', color: 'var(--ink2)', cursor: 'pointer' }}>
        <input type="checkbox" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 20, height: 20, flex: 'none', accentColor: 'var(--accent)' }} />
        <span>I agree that the call is with an AI assistant and will be recorded so AvaStars recruiters can review it.</span>
      </label>
      {state?.error ? <p className="error" role="alert">{state.error}</p> : null}
      <button type="submit" className="btn primary" disabled={!slot || !consent || pending} style={{ minHeight: 52, fontSize: 16 }}>
        {pending ? 'Booking…' : !slot ? 'Pick a time' : !consent ? 'Tick the box above to continue' : `Confirm ${days[day].label} at ${time(slot)}`}
      </button>
    </form>
  );
}
