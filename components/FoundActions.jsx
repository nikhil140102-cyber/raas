'use client';
import { useState, useTransition } from 'react';
import { saveFoundPerson } from '@/app/_actions/sourcing';

/** Save / Connect buttons for a person found by the Google search on the Sourcing page. */
export default function FoundActions({ person, jobId, savedId, sentAt }) {
  const [state, setState] = useState({ id: savedId || null, sent: sentAt || null, match: null, error: '' });
  const [pending, start] = useTransition();
  const run = (connect) => start(async () => {
    try {
      const r = await saveFoundPerson(person, jobId, connect);
      setState((s) => ({ ...s, id: r.id, match: r.match ?? s.match, sent: connect ? new Date().toISOString() : s.sent, error: '' }));
    } catch (e) { setState((s) => ({ ...s, error: e.message || 'Could not save' })); }
  });
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {state.id ? <a className="pill blue" href={`/candidates/${state.id}`}>Saved{typeof state.match === 'number' ? ` · ${state.match}%` : ''}</a>
        : <button type="button" className="btn sm" disabled={pending} onClick={() => run(false)}>{pending ? '…' : 'Save'}</button>}
      {state.sent ? <span className="pill green">Request sent</span> : (
        <button type="button" className="btn sm primary" disabled={pending} aria-label={`Connect with ${person.name} on LinkedIn`}
          onClick={() => { window.open(person.profile_url, '_blank', 'noopener'); run(true); }}>
          Connect on LinkedIn
        </button>
      )}
      {state.error ? <span className="tiny" style={{ color: 'var(--red, #B42318)' }}>{state.error}</span> : null}
    </span>
  );
}
