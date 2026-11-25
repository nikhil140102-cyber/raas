'use client';
import { useState } from 'react';
import FoldCard from '@/components/FoldCard';

/** The job laid out field by field for a portal's "post a job" form. Opens and closes like the post cards. */
export default function PortalKit({ kit, portal, children }) {
  const [copied, setCopied] = useState('');
  const copy = async (label, value) => {
    try { await navigator.clipboard.writeText(value); setCopied(label); setTimeout(() => setCopied(''), 1500); } catch { /* blocked */ }
  };
  const all = kit.fields.map(([k, v]) => `${k}:\n${v}`).join('\n\n');
  return (
    <FoldCard id={`portal-${portal || kit.name}`} as="article" title={kit.name} hint={`Open ${kit.name}, then copy each field into the same box on their form.`}
      actions={<>
        <button type="button" className="btn sm" onClick={() => copy('all', all)}>{copied === 'all' ? 'Copied' : 'Copy everything'}</button>
        <a className="btn sm primary" href={kit.url} target="_blank" rel="noreferrer">Open {kit.name}</a>
      </>}>
      <div className="stack" style={{ gap: 0 }}>
        {kit.fields.map(([label, value]) => (
          <div key={label} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            <span className="small strong" style={{ flex: 'none', width: 190, color: 'var(--ink2)' }}>{label}</span>
            <span className="small pre" style={{ flex: 1, minWidth: 0, maxHeight: 140, overflowY: 'auto' }}>{value}</span>
            <button type="button" className="btn sm" style={{ flex: 'none' }} onClick={() => copy(label, value)} aria-label={`Copy ${label}`}>{copied === label ? 'Copied' : 'Copy'}</button>
          </div>
        ))}
      </div>
      {children}
    </FoldCard>
  );
}
