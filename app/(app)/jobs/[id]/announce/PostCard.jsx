'use client';
import { useState, useTransition } from 'react';
import { logShare } from '../../../../_actions/social';

/** One platform: sample styles to pick from, editable text, copy, share button and "mark as shared". */
export default function PostCard({ jobId, platform, name, hint, samples, shareUrl, link, children }) {
  const [pick, setPick] = useState(0);
  const [text, setText] = useState(samples[0]?.text || '');
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setNote('Copied. Paste it in the post box.'); } catch { setNote('Select the text and copy it manually.'); }
  };
  const record = () => start(async () => { await logShare(jobId, platform, text); setNote('Saved to the share history.'); });
  // WhatsApp, X and Telegram take the edited text; LinkedIn and Facebook only take the link.
  const liveUrl = platform === 'whatsapp' ? `https://wa.me/?text=${encodeURIComponent(text)}`
    : platform === 'x' ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
      : platform === 'telegram' ? `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text.replace(link, '').trim())}`
        : shareUrl;

  return (
    <article className="card" style={{ gap: 12 }}>
      <div className="titles"><h2>{name}</h2><p className="small muted">{hint}</p></div>
      {samples.length > 1 ? (
        <div className="row" role="radiogroup" aria-label={`${name} sample posts`} style={{ gap: 6 }}>
          <span className="tiny strong muted">Sample:</span>
          {samples.map((x, i) => (
            <button key={x.label} type="button" role="radio" aria-checked={pick === i} className={`chip${pick === i ? ' on' : ''}`} style={{ border: 0, cursor: 'pointer' }}
              onClick={() => { setPick(i); setText(x.text); setNote(''); }}>{x.label}</button>
          ))}
        </div>
      ) : null}
      <label className="field"><span className="sr">{name} post</span>
        <textarea name="body" form={`li-form-${platform}`} rows={platform === 'linkedin' ? 10 : 6} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn sm" onClick={copy}>Copy text</button>
        {liveUrl ? (
          <a className="btn sm primary" href={liveUrl} target="_blank" rel="noreferrer" onClick={() => { if (platform === 'linkedin' || platform === 'facebook') copy(); record(); }}>
            {platform === 'linkedin' || platform === 'facebook' ? `Copy + open ${name}` : `Share on ${name}`}
          </a>
        ) : null}
        <button type="button" className="btn sm" onClick={record} disabled={pending}>Mark as shared</button>
        {children}
      </div>
      {platform === 'linkedin' || platform === 'facebook' ? <span className="tiny muted">{name} only takes the link, so the text is copied for you: paste it into the post box that opens.</span> : null}
      {note ? <span className="small" style={{ color: 'var(--green)' }} role="status">{note}</span> : null}
    </article>
  );
}
