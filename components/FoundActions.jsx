'use client';
import { useEffect, useState, useTransition } from 'react';
import { saveFoundPerson, connectStatus, setConnectSent } from '@/app/_actions/sourcing';

/**
 * Save / Connect buttons for a person found on the Sourcing page.
 * "Connect on LinkedIn" only OPENS the profile — the request is sent when you click LinkedIn's own Connect.
 * The AvaStars extension sees LinkedIn's button turn to "Pending" and records it; this row then shows
 * "Request sent" when you come back to this tab. "I sent it" records it by hand (no extension).
 */
export default function FoundActions({ person, jobId, savedId, sentAt }) {
  const [state, setState] = useState({ id: savedId || null, sent: sentAt || null, opened: false, match: null, error: '' });
  const [pending, start] = useTransition();

  const save = () => start(async () => {
    try {
      const r = await saveFoundPerson(person, jobId, false);
      setState((s) => ({ ...s, id: r.id, match: r.match ?? s.match, error: '' }));
    } catch (e) { setState((s) => ({ ...s, error: e.message || 'Could not save' })); }
  });
  const open = () => {
    window.open(person.profile_url, '_blank', 'noopener');
    setState((s) => ({ ...s, opened: true }));
    if (!state.id) save();
  };
  const mark = (sent) => start(async () => {
    try {
      let id = state.id;
      if (!id) { const r = await saveFoundPerson(person, jobId, false); id = r.id; }
      await setConnectSent(id, sent);
      setState((s) => ({ ...s, id, sent: sent ? new Date().toISOString() : null, opened: false, error: '' }));
    } catch (e) { setState((s) => ({ ...s, error: e.message || 'Could not update' })); }
  });

  // Back from LinkedIn? Ask the app whether the extension recorded the request.
  useEffect(() => {
    if (!state.opened || state.sent) return undefined;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const r = await connectStatus(person.profile_url).catch(() => null);
      if (r?.sent) setState((s) => ({ ...s, id: r.id || s.id, sent: r.sent, opened: false }));
    };
    const t = setInterval(check, 4000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', check); };
  }, [state.opened, state.sent, person.profile_url]);

  return (
    <span className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
      {state.id ? <a className="pill blue" href={`/candidates/${state.id}`}>Saved{typeof state.match === 'number' ? ` · ${state.match}%` : ''}</a>
        : <button type="button" className="btn sm" disabled={pending} onClick={save}>{pending ? '…' : 'Save'}</button>}
      {state.sent ? (
        <>
          <span className="pill green">Request sent</span>
          <button type="button" className="btn sm" disabled={pending} title="Not actually sent on LinkedIn? Undo" onClick={() => mark(false)}>Undo</button>
        </>
      ) : state.opened ? (
        <>
          <span className="pill amber" title="Click Connect on the LinkedIn tab. With the AvaStars extension on, this changes to Request sent by itself.">Waiting for Connect on LinkedIn…</span>
          <button type="button" className="btn sm" disabled={pending} onClick={() => mark(true)}>I sent it</button>
        </>
      ) : (
        <button type="button" className="btn sm primary" aria-label={`Open ${person.name}'s LinkedIn profile to connect`} onClick={open}>
          Connect on LinkedIn
        </button>
      )}
      {state.error ? <span className="tiny" style={{ color: 'var(--red, #B42318)' }}>{state.error}</span> : null}
    </span>
  );
}
