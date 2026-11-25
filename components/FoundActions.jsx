'use client';
import { useEffect, useState, useTransition } from 'react';
import { saveFoundPerson, connectStatus, setConnectSent } from '@/app/_actions/sourcing';
import { sendConnect } from '@/lib/liConnect';

/**
 * Save / Connect for a person on the Sourcing page.
 * With the AvaStars extension (1.8+), "Send connection request" opens the profile, clicks LinkedIn's Connect →
 * "Send without a note", and the row turns "Request sent" once LinkedIn shows Pending.
 * Without it, the profile opens and you click Connect yourself ("I sent it" records it by hand).
 */
export function ConnectControls({ id: initialId, url, name, sentAt, ensureId, onId }) {
  const [state, setState] = useState({ id: initialId || null, sent: sentAt || null, phase: '', error: '' });
  const [pending, start] = useTransition();
  const getId = async () => {
    if (state.id) return state.id;
    const id = ensureId ? await ensureId() : null;
    if (id) { setState((s) => ({ ...s, id })); onId?.(id); }
    return id;
  };
  const connect = () => start(async () => {
    setState((s) => ({ ...s, error: '', phase: 'starting' }));
    try { await getId(); } catch (e) { setState((s) => ({ ...s, phase: '', error: e.message || 'Could not save' })); return; }
    const r = await sendConnect(url, name);
    if (r.mode === 'error') setState((s) => ({ ...s, phase: '', error: r.error }));
    else setState((s) => ({ ...s, phase: r.mode }));
  });
  const mark = (sent) => start(async () => {
    try {
      const id = await getId();
      await setConnectSent(id, sent);
      setState((s) => ({ ...s, sent: sent ? new Date().toISOString() : null, phase: '', error: '' }));
    } catch (e) { setState((s) => ({ ...s, error: e.message || 'Could not update' })); }
  });

  // Waiting on LinkedIn: check every few seconds whether the request was recorded.
  useEffect(() => {
    if (!['auto', 'manual'].includes(state.phase) || state.sent) return undefined;
    let n = 0;
    const check = async () => {
      n++;
      const r = await connectStatus(url).catch(() => null);
      if (r?.sent) setState((s) => ({ ...s, id: r.id || s.id, sent: r.sent, phase: '' }));
      else if (state.phase === 'auto' && n > 40) setState((s) => ({ ...s, phase: 'manual' }));
    };
    const t = setInterval(check, 3000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', check); };
  }, [state.phase, state.sent, url]);

  if (state.sent) {
    return (
      <span className="row" style={{ gap: 6, alignItems: 'center' }}>
        <span className="pill green">Request sent {new Date(state.sent).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
        <button type="button" className="linkbtn tiny" disabled={pending} onClick={() => mark(false)} aria-label={`Undo request for ${name}`}>Undo</button>
      </span>
    );
  }
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
      {state.phase === 'auto' || state.phase === 'starting' ? (
        <span className="pill amber">Sending on LinkedIn…</span>
      ) : state.phase === 'manual' ? (
        <>
          <span className="pill amber" title="Click Connect on the LinkedIn tab, then come back here.">Click Connect on LinkedIn</span>
          <button type="button" className="btn sm" disabled={pending} onClick={() => mark(true)}>I sent it</button>
        </>
      ) : (
        <button type="button" className="btn sm primary" disabled={pending || !url} aria-label={`Send ${name} a LinkedIn connection request`} onClick={connect}>
          Send connection request
        </button>
      )}
      {state.error ? <span className="tiny" style={{ color: 'var(--red, #B42318)', maxWidth: 260 }}>{state.error}</span> : null}
    </span>
  );
}

export default function FoundActions({ person, jobId, savedId, sentAt }) {
  const [saved, setSaved] = useState({ id: savedId || null, match: null, error: '' });
  const [pending, start] = useTransition();
  const ensureId = async () => {
    if (saved.id) return saved.id;
    const r = await saveFoundPerson(person, jobId, false);
    setSaved({ id: r.id, match: r.match, error: '' });
    return r.id;
  };
  const save = () => start(async () => { try { await ensureId(); } catch (e) { setSaved((s) => ({ ...s, error: e.message || 'Could not save' })); } });
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
      {saved.id ? <a className="pill blue" href={`/candidates/${saved.id}`}>Saved{typeof saved.match === 'number' ? ` · ${saved.match}%` : ''}</a>
        : <button type="button" className="btn sm" disabled={pending} onClick={save}>{pending ? '…' : 'Save'}</button>}
      <ConnectControls id={saved.id} url={person.profile_url} name={person.name} sentAt={sentAt} ensureId={ensureId} />
      {saved.error ? <span className="tiny" style={{ color: 'var(--red, #B42318)' }}>{saved.error}</span> : null}
    </span>
  );
}
