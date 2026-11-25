'use client';
import { useState, useTransition } from 'react';
import { logShare } from '../../../../_actions/social';
import { createSchedule } from '../../../../_actions/schedules';
import { createLinkedInPost } from '@/lib/liConnect';

/** One platform: sample styles to pick from, editable text, copy, share button and "mark as shared". */
export default function PostCard({ jobId, platform, name, hint, samples, shareUrl, link, defaultOpen = false, team = null, userId = null, istNow = '', children }) {
  const [open, setOpen] = useState(defaultOpen);
  const [pick, setPick] = useState(0);
  const [text, setText] = useState(samples[0]?.text || '');
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();
  const [sched, setSched] = useState(false);
  const isLi = platform === 'linkedin';
  const createPost = () => start(async () => {
    const r = await createLinkedInPost(text, jobId);
    if (r.mode === 'auto') { setNote('LinkedIn is opening with your post written in. Check it, then click Post — or the clock icon next to Post to schedule it.'); }
    else if (r.mode === 'error') setNote(r.error);
    else setNote('LinkedIn opened with the post. If the box is empty, paste (Ctrl+V) — the text is copied. Install AvaStars Collector 1.9 to have it typed in for you.');
  });

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
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <button type="button" className="titles" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={`post-${platform}`} style={{ all: 'unset', cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2>{name}</h2><p className="small muted">{hint}</p>
        </button>
        <button type="button" className="btn sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={`post-${platform}`} aria-label={`${open ? 'Close' : 'Open'} ${name} post`}>
          {open ? 'Close ▴' : 'Open ▾'}
        </button>
      </div>
      {open ? <div id={`post-${platform}`} className="stack" style={{ gap: 12 }}>
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
        {isLi ? <button type="button" className="btn sm primary" onClick={createPost} disabled={pending || !text.trim()}>Create post on LinkedIn</button> : null}
        <button type="button" className="btn sm" onClick={copy}>Copy text</button>
        {liveUrl ? (
          <a className={`btn sm${isLi ? '' : ' primary'}`} href={liveUrl} target="_blank" rel="noreferrer" onClick={() => { if (platform === 'linkedin' || platform === 'facebook') copy(); record(); }}>
            {platform === 'linkedin' || platform === 'facebook' ? `Copy + open ${name}` : `Share on ${name}`}
          </a>
        ) : null}
        <button type="button" className="btn sm" onClick={record} disabled={pending}>Mark as shared</button>
        {isLi && team ? <button type="button" className="btn sm" onClick={() => setSched((v) => !v)} aria-expanded={sched}>{sched ? 'Cancel schedule' : 'Schedule this post'}</button> : null}
        {children}
      </div>
      {isLi && team && sched ? (
        <form action={createSchedule} className="row" style={{ gap: 10, alignItems: 'flex-end', padding: 12, borderRadius: 10, background: 'var(--accent-soft)' }}>
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="portal" value="linkedin_post" />
          <input type="hidden" name="body" value={text} />
          <label className="field" style={{ flex: '1 1 200px' }}>When (India time)<input type="datetime-local" name="when" min={istNow} defaultValue={istNow} required /></label>
          <label className="field" style={{ flex: '1 1 180px' }}>Who posts it
            <select name="assigned_to" defaultValue={userId || ''}>
              {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              <option value="">Anyone in the team</option>
            </select>
          </label>
          <button className="btn sm primary" type="submit" style={{ minHeight: 44 }}>Schedule</button>
          <span className="tiny muted" style={{ flexBasis: '100%' }}>At that time they get a reminder; the extension writes this exact text into LinkedIn and they click Post.</span>
        </form>
      ) : null}
      {isLi ? <span className="tiny muted">“Create post on LinkedIn” writes the post for you (AvaStars extension); you only click Post, or the clock icon to schedule it on LinkedIn.</span>
        : platform === 'facebook' ? <span className="tiny muted">{name} only takes the link, so the text is copied for you: paste it into the post box that opens.</span> : null}
      {note ? <span className="small" style={{ color: 'var(--green)' }} role="status">{note}</span> : null}
      </div> : null}
    </article>
  );
}
