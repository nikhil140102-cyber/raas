import Link from 'next/link';
import { notFound } from 'next/navigation';
import { one } from '@/lib/db';
import { Header, Flash } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { resumeModel } from '@/lib/resumeExport';
import { saveClientResume, resetClientResume } from '../../../../_actions/candidates';

export default async function ResumeEditor({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const c = await one('SELECT * FROM candidates WHERE id = $1', [Number(id)]);
  if (!c) notFound();
  const app = sp.app ? await one('SELECT * FROM applications WHERE id = $1 AND candidate_id = $2', [Number(sp.app), c.id]) : null;
  const screening = app ? await one(`SELECT score, summary FROM screenings WHERE application_id = $1 AND status = 'completed' ORDER BY id DESC LIMIT 1`, [app.id]) : null;
  const m = resumeModel(c, screening, app?.match_score);
  const qs = `app=${app?.id || ''}`;
  const exps = [...m.experience, { role: '', when: '', points: '' }];

  return (
    <>
      <Header title="Client-ready resume" sub="Edit the resume, then download Word or PDF to share with the client" crumbs={<><Link href={`/candidates/${c.id}?${qs}`}>{c.name}</Link> / Client-ready resume</>}>
        <a className="btn" href={`/api/candidates/${c.id}/export?format=docx&${qs}`}>Download Word</a>
        <a className="btn" href={`/api/candidates/${c.id}/export?format=pdf&${qs}`}>Download PDF</a>
      </Header>
      <Flash msg={sp.saved ? 'Saved. The preview and downloads use this version.' : ''} />
      <div className="cols">
        <form action={saveClientResume} className="col-main" style={{ flex: '1 1 440px' }}>
          <input type="hidden" name="id" value={c.id} /><input type="hidden" name="app" value={app?.id || ''} />
          <section className="card" style={{ gap: 4 }}>
            <h2 style={{ marginBottom: 8 }}>Sharing options</h2>
            {[['hideContact', 'Hide contact details', 'Client contacts the candidate through you'], ['brand', 'Add AvaStars header', 'Your name and a reference number'], ['includeSummary', 'Include screening summary', 'Match score, call score and notes']].map(([k, label, hint]) => (
              <label key={k} className="row" style={{ justifyContent: 'space-between', minHeight: 48, borderBottom: '1px solid var(--line)', cursor: 'pointer', flexWrap: 'nowrap' }}>
                <span className="stack" style={{ gap: 2 }}><span className="strong">{label}</span><span className="tiny muted">{hint}</span></span>
                <input type="checkbox" name={k} defaultChecked={m.options[k]} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
              </label>
            ))}
          </section>
          <section className="card">
            <h2>Content</h2>
            <label className="field">Headline<input name="headline" defaultValue={m.headline} /></label>
            <label className="field">Summary<textarea name="summary" rows={4} defaultValue={m.summary} /></label>
            <fieldset className="stack">
              <legend>Experience (leave a role empty to remove it)</legend>
              {exps.map((e, i) => (
                <div key={i} className="stack soft" style={{ gap: 8, background: '#fff', border: '1px solid var(--line)' }}>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <label className="field" style={{ flex: 2 }}>Role · company<input name="exp_role" defaultValue={e.role} placeholder={i === exps.length - 1 ? 'Add a role' : ''} /></label>
                    <label className="field" style={{ flex: 1 }}>When<input name="exp_when" defaultValue={e.when} /></label>
                  </div>
                  <label className="field">What they did<textarea name="exp_points" rows={3} defaultValue={e.points} /></label>
                </div>
              ))}
            </fieldset>
            <label className="field">Skills<textarea name="skills" rows={2} defaultValue={m.skills} /></label>
            <label className="field">Education (one per line)<textarea name="education" rows={2} defaultValue={m.education} /></label>
            <div className="row">
              <SubmitButton pendingText="Saving…">Save and update preview</SubmitButton>
            </div>
          </section>
        </form>

        <section aria-label="Preview" className="col-main" style={{ flex: '1 1 520px', gap: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small strong muted">Preview · A4</span>
            <form action={resetClientResume}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="app" value={app?.id || ''} /><button className="linkbtn" type="submit">Reset to the original resume</button></form>
          </div>
          <article style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 4, boxShadow: '0 8px 24px rgba(16,24,40,.08)', padding: '44px 48px', display: 'flex', flexDirection: 'column', gap: 18, minHeight: 900 }}>
            {m.options.brand ? <div className="row" style={{ justifyContent: 'space-between', paddingBottom: 14, borderBottom: '2px solid var(--accent)' }}><span style={{ fontWeight: 700, color: 'var(--accent-ink)' }}>AvaStars</span><span className="tiny muted">Candidate profile · Ref {m.ref}</span></div> : null}
            <div className="stack" style={{ gap: 4 }}><h2 style={{ fontSize: 22, fontWeight: 700 }}>{m.name}</h2><span className="small" style={{ color: 'var(--ink2)' }}>{m.headline}</span><span className="tiny muted">{m.contact}</span></div>
            <div className="facts soft" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>{m.facts.map(([k, v]) => <div key={k} className="fact"><span>{k}</span><span>{v}</span></div>)}</div>
            {m.screeningLine ? <div className="stack" style={{ gap: 6, padding: 12, border: '1px solid var(--accent-line)', borderRadius: 6, background: 'var(--accent-soft)' }}><span className="tiny strong" style={{ color: 'var(--accent-ink)' }}>{m.screeningLine.title}</span>{m.screeningLine.text ? <span className="small" style={{ color: 'var(--ink2)' }}>{m.screeningLine.text}</span> : null}</div> : null}
            {m.summary ? <div className="stack" style={{ gap: 6 }}><h3 className="tiny" style={{ letterSpacing: '.05em', color: 'var(--accent-ink)' }}>SUMMARY</h3><p className="small" style={{ color: 'var(--ink2)', lineHeight: 1.6 }}>{m.summary}</p></div> : null}
            {m.experience.length ? (
              <div className="stack" style={{ gap: 10 }}>
                <h3 className="tiny" style={{ letterSpacing: '.05em', color: 'var(--accent-ink)' }}>EXPERIENCE</h3>
                {m.experience.map((e, i) => <div key={i} className="stack" style={{ gap: 3 }}><div className="row" style={{ justifyContent: 'space-between' }}><span className="strong small">{e.role}</span><span className="tiny muted">{e.when}</span></div><span className="small" style={{ color: 'var(--ink2)', lineHeight: 1.55 }}>{e.points}</span></div>)}
              </div>
            ) : null}
            {m.skills ? <div className="stack" style={{ gap: 6 }}><h3 className="tiny" style={{ letterSpacing: '.05em', color: 'var(--accent-ink)' }}>SKILLS</h3><p className="small" style={{ color: 'var(--ink2)' }}>{m.skills}</p></div> : null}
            {m.education ? <div className="stack" style={{ gap: 6 }}><h3 className="tiny" style={{ letterSpacing: '.05em', color: 'var(--accent-ink)' }}>EDUCATION</h3><p className="small pre" style={{ color: 'var(--ink2)' }}>{m.education}</p></div> : null}
          </article>
        </section>
      </div>
    </>
  );
}
