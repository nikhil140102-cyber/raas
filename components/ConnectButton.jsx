'use client';
import { useTransition } from 'react';
import { markConnectSent } from '@/app/_actions/sourcing';

/** Opens the person's LinkedIn profile (you click LinkedIn's Connect there) and records the request. */
export default function ConnectButton({ id, url, sentAt, name }) {
  const [pending, start] = useTransition();
  const send = (undo) => { const fd = new FormData(); fd.set('cand_id', String(id)); if (undo) fd.set('undo', '1'); start(() => markConnectSent(fd)); };
  if (sentAt) {
    return (
      <span className="row" style={{ gap: 6 }}>
        <span className="pill green">Request sent {new Date(sentAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
        <button type="button" className="linkbtn tiny" disabled={pending} onClick={() => send(true)} aria-label={`Undo request for ${name}`}>Undo</button>
      </span>
    );
  }
  return (
    <button type="button" className="btn sm primary" disabled={pending || !url} aria-label={`Connect with ${name} on LinkedIn`}
      onClick={() => { window.open(url, '_blank', 'noopener'); send(false); }}>
      {pending ? 'Saving…' : 'Connect on LinkedIn'}
    </button>
  );
}
