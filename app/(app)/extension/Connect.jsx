'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Detects the AvaStars Collector extension and connects it to this app with the user's personal key. */
export default function Connect({ connectedAt }) {
  const router = useRouter();
  const [ext, setExt] = useState(null); // installed version, or null
  const [state, setState] = useState('idle'); // idle | working | done | error
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const read = () => setExt(document.documentElement.getAttribute('data-avastars-ext'));
    read();
    const t = setInterval(read, 1500);
    const onMsg = (e) => {
      if (e.source !== window || e.origin !== window.location.origin) return;
      if (e.data?.type === 'AVASTARS_CONNECTED') { setState('done'); setMsg('Connected. Open the extension from the Chrome toolbar; it is ready to use.'); router.refresh(); }
      if (e.data?.type === 'AVASTARS_CONNECT_CANCELLED') { setState('error'); setMsg('Connection was cancelled in the extension. Click Connect again and choose OK.'); }
    };
    window.addEventListener('message', onMsg);
    return () => { clearInterval(t); window.removeEventListener('message', onMsg); };
  }, [router]);

  async function connect() {
    setState('working'); setMsg('Connecting…');
    try {
      const res = await fetch('/api/extension/connect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      window.postMessage({ type: 'AVASTARS_CONNECT', key: data.key, name: data.name, appUrl: window.location.origin }, window.location.origin);
      setMsg('Confirm in the box Chrome shows ("Connect AvaStars Collector…?") by clicking OK.');
      setTimeout(() => setState((s) => { if (s === 'working') { setMsg('No answer from the extension. Reload this page (F5) and click Connect again.'); return 'error'; } return s; }), 30000);
    } catch (e) {
      setState('error'); setMsg(e.message);
    }
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <span className={`pill ${ext ? 'green' : 'gray'}`}>{ext ? `Extension found (v${ext})` : 'Extension not found in this Chrome yet'}</span>
        {connectedAt && state !== 'done' ? <span className="pill blue">You connected on {new Date(connectedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span> : null}
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button type="button" className="btn primary" onClick={connect} disabled={!ext || state === 'working'}>
          {state === 'working' ? 'Connecting…' : connectedAt ? 'Connect again' : 'Connect the extension'}
        </button>
        {!ext ? <span className="tiny muted">Do steps 1–2 first. After loading the extension, press F5 on this page.</span> : null}
      </div>
      {msg ? <div className={`notice ${state === 'done' ? 'ok' : state === 'error' ? 'warn' : 'info'}`} role="status">{msg}</div> : null}
    </div>
  );
}
