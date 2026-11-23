import { cfg } from '@/lib/config';
import Link from 'next/link';
import { q, one } from '@/lib/db';
import { Header, Score, Pill, Flash } from '@/components/ui';
import { lakh, notice, fmtDate } from '@/lib/util';
import Uploader from './Uploader';
import MatchRunner from '@/components/MatchRunner';
import RereadRunner from '@/components/RereadRunner';
import { aiEnabled } from '@/lib/ai';
import FilterBar from '@/components/FilterBar';
import { ColSelect } from '@/components/ColFilter';
import BulkJobBar, { SelectAll, Tick } from '@/components/BulkJobBar';
import { readFilters, candidateWhere, orderBy, sortHref } from '@/lib/filters';

export const metadata = { title: 'Resume database — AvaStars Hire' };

export default async function ResumesPage({ searchParams }) {
  const sp = await searchParams;
  const f = readFilters(sp);
  const page = Math.max(1, Number(sp.page || 1));
  const forJob = Number(sp.job) || null;
  const job = forJob ? await one('SELECT * FROM jobs WHERE id = $1', [forJob]) : null;

  const params = [];
  const where = candidateWhere(f, params, job);
  params.push(forJob);
  const jp = `$${params.length}`;
  const outer = [];
  if (f.minMatch !== null) { params.push(f.minMatch); outer.push(`match_score >= $${params.length}`); }
  const defaultSort = forJob ? 'match' : 'added';
  // Match % for one chosen job, or the best match across all jobs. count(*) OVER() gives the total for paging.
  const rows = await q(`
    WITH base AS (
      SELECT c.id, c.name, c.current_title, c.current_company, c.total_exp, c.skills, c.location, c.cctc, c.ectc, c.notice_days, c.source, c.created_at,
        best.score AS match_score, best.title AS best_job, best.job_id AS best_job_id
      FROM candidates c
      LEFT JOIN LATERAL (SELECT s.score, j.title, j.id AS job_id FROM candidate_scores s JOIN jobs j ON j.id = s.job_id
        WHERE s.candidate_id = c.id AND (${jp}::int IS NULL OR s.job_id = ${jp}) ORDER BY s.score DESC LIMIT 1) best ON true
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    )
    SELECT base.*, count(*) OVER()::int AS total,
      (SELECT a.id FROM applications a WHERE a.candidate_id = base.id AND a.job_id = base.best_job_id) AS app_id,
      (SELECT a.stage FROM applications a WHERE a.candidate_id = base.id AND a.job_id = base.best_job_id) AS app_stage
    FROM base ${outer.length ? `WHERE ${outer.join(' AND ')}` : ''}
    ORDER BY ${orderBy(f, defaultSort)} LIMIT 50 OFFSET ${(page - 1) * 50}`, params);
  const total = { n: rows[0]?.total ?? 0 };
  const all = await one('SELECT count(*)::int AS n FROM candidates');
  const missing = await one(`SELECT count(*)::int AS n FROM candidates WHERE current_title IS NULL OR cctc IS NULL OR ectc IS NULL OR notice_days IS NULL OR location IS NULL`);
  const unscored = await one(`SELECT count(*)::int AS n FROM candidates c WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.status = 'open' AND NOT EXISTS (SELECT 1 FROM candidate_scores s WHERE s.job_id = j.id AND s.candidate_id = c.id))`);
  const jobs = await q(`SELECT j.id, j.title, c.name AS client FROM jobs j LEFT JOIN clients c ON c.id = j.client_id WHERE j.status = 'open' ORDER BY j.created_at DESC`);
  const failed = sp.failed ? await q('SELECT id, filename, parse_error, created_at FROM files WHERE parse_error IS NOT NULL ORDER BY created_at DESC LIMIT 30') : [];
  const failedCount = await one('SELECT count(*)::int AS n FROM files WHERE parse_error IS NOT NULL');
  const inbox = Boolean(cfg('IMAP_HOST'));
  const showUpload = sp.upload === '1';
  const { upload: _u, ...spNoUpload } = sp;
  const sources = (await q("SELECT DISTINCT source FROM candidates WHERE source IS NOT NULL AND source <> '' ORDER BY source")).map((r) => r.source);
  const F = 'filters';

  return (
    <>
      <Header title="Resume database" sub={`${all.n} profile(s) · duplicates merged by email and phone`}>
        {showUpload ? null : <Link href={`/resumes?${new URLSearchParams({ ...sp, upload: '1' })}#upload`} className="btn primary">Upload resumes</Link>}
      </Header>
      <Flash msg={sp.msg} />
      {!aiEnabled() ? <div className="notice warn">AI is switched off (no ANTHROPIC_API_KEY). Resumes are read with simple rules, so title, company, CTC and notice period are only found when the resume states them clearly, and match % uses keyword matching. Add the key in your environment for full reading and smarter matching.</div> : null}
      {showUpload ? <Uploader jobs={jobs} closeHref={`/resumes${Object.keys(spNoUpload).length ? `?${new URLSearchParams(spNoUpload)}` : ''}`} /> : null}
      <div className="grid3">
          <section className="card">
            <h2>Automatic imports</h2>
            <div className="row" style={{ justifyContent: 'space-between' }}><div><div className="strong">Careers page apply form</div><div className="tiny muted">Saves straight to the database</div></div><Pill tone="green">On</Pill></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><div><div className="strong">Careers inbox (IMAP)</div><div className="tiny muted">{inbox ? `${cfg('IMAP_USER')} · checked by cron` : 'Set IMAP_* in the environment'}</div></div><Pill tone={inbox ? 'green' : 'gray'}>{inbox ? 'On' : 'Off'}</Pill></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><div><div className="strong">OneDrive folder</div><div className="tiny muted">Planned for a later phase</div></div><Pill tone="gray">Later</Pill></div>
            {failedCount.n ? <Link href="/resumes?failed=1" className="small strong">{failedCount.n} file(s) could not be read →</Link> : null}
          </section>
          <section className="card">
            <h2>Match %</h2>
            <p className="small muted">New uploads are scored against every open job automatically. {unscored.n ? `${unscored.n} resume(s) still need scoring for at least one open job.` : 'Every resume is scored for every open job.'}</p>
            <MatchRunner jobs={jobs.map((j) => ({ id: j.id, title: j.title }))} label="Match all resumes to open jobs" />
            <MatchRunner jobs={jobs.map((j) => ({ id: j.id, title: j.title }))} force label="Re-score everyone (after re-reading or editing jobs)" className="btn sm" />
          </section>
          <section className="card">
            <h2>Missing details</h2>
            <p className="small muted">{missing.n} profile(s) are missing title, location, CTC, expected CTC or notice period. Re-read fills what the resume states; anything still empty can be asked on the AI call or typed on the profile.</p>
            <RereadRunner />
          </section>
        </div>

      {failed.length ? (
        <section className="card">
          <h2>Files that could not be read</h2>
          {failed.map((f) => (
            <div key={f.id} className="row small" style={{ justifyContent: 'space-between' }}>
              <a href={`/api/files/${f.id}`}>{f.filename}</a><span className="muted">{f.parse_error}</span><span className="muted">{fmtDate(f.created_at)}</span>
            </div>
          ))}
        </section>
      ) : null}

      <section className="card flush">
        <FilterBar base="/resumes" f={f} jobs={jobs} jobId={forJob} showJobPicker defaultSort={defaultSort} id={F} columnFilters />
        <div className="row small muted" style={{ padding: '0 20px 12px' }}>Showing {total.n} of {all.n}{forJob && job ? ` · match % for ${job.title}` : ''}. Click a column title to sort; type in the boxes under the titles and press Enter to filter.</div>
        <BulkJobBar jobs={jobs} back={`/resumes${Object.keys(spNoUpload).length ? `?${new URLSearchParams(Object.fromEntries(Object.entries(spNoUpload).filter(([k]) => k !== 'msg')))}` : ''}`} stages={[['pending', 'Pending'], ['shortlisted', 'Shortlisted']]} />
        {(
          <div className="tablewrap">
            <table className="t" style={{ minWidth: 1150 }}>
              <thead><tr>
                <th style={{ width: 36 }}><SelectAll /></th>
                <SortTh label="Candidate" k="name" sp={sp} f={f} def={defaultSort} />
                <SortTh label="Exp" k="exp" sp={sp} f={f} def={defaultSort} />
                <th>Top skills</th><th>Location</th>
                <SortTh label="CCTC → ECTC" k="ectc" sp={sp} f={f} def={defaultSort} />
                <SortTh label="Notice" k="notice" sp={sp} f={f} def={defaultSort} />
                <th>Source</th>
                <SortTh label={forJob ? 'ATS match %' : 'Best ATS match %'} k="match" sp={sp} f={f} def={defaultSort} />
                <SortTh label="Added" k="added" sp={sp} f={f} def={defaultSort} />
              </tr>
              <tr className="colfilters">
                <th />
                <th><input form={F} className="colf" name="name" defaultValue={f.name} placeholder="Name, title, company" aria-label="Filter by name" /></th>
                <th><span className="pair"><input form={F} className="colf" type="number" step="any" name="exp_min" defaultValue={f.expMin ?? ''} placeholder="min" aria-label="Experience from" /><input form={F} className="colf" type="number" step="any" name="exp_max" defaultValue={f.expMax ?? ''} placeholder="max" aria-label="Experience to" /></span></th>
                <th><input form={F} className="colf" name="skill" defaultValue={f.skill} placeholder="e.g. AWS, Sales" aria-label="Filter by skill" /></th>
                <th><input form={F} className="colf" name="loc" defaultValue={f.loc.join(', ')} placeholder="e.g. Pune, Noida" aria-label="Only these locations" /></th>
                <th><input form={F} className="colf" type="number" step="any" name="ectc_max" defaultValue={f.ectcMax ?? ''} placeholder="Max ECTC ₹L" aria-label="Maximum expected CTC" /></th>
                <th><ColSelect form={F} name="np_max" value={f.npMax ?? ''} label="Maximum notice" options={[['', 'Any'], ['0', 'Immediate'], ['15', '≤ 15 d'], ['30', '≤ 30 d'], ['60', '≤ 60 d'], ['90', '≤ 90 d']]} /></th>
                <th><ColSelect form={F} name="source" value={f.source} label="Source" options={[['', 'All'], ...sources.map((x) => [x, x])]} /></th>
                <th><ColSelect form={F} name="min" value={f.minMatch ?? ''} label="Minimum match" options={[['', 'Any %'], ['40', '≥ 40%'], ['50', '≥ 50%'], ['60', '≥ 60%'], ['70', '≥ 70%'], ['80', '≥ 80%'], ['90', '≥ 90%']]} /></th>
                <th><ColSelect form={F} name="added" value={f.addedDays ?? ''} label="Added within" options={[['', 'Any time'], ['1', 'Today'], ['7', '7 days'], ['30', '30 days'], ['90', '90 days']]} /></th>
              </tr></thead>
              <tbody>
                {!rows.length ? <tr><td colSpan={10} className="empty">No candidates match these filters.</td></tr> : null}
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><Tick id={r.id} name={r.name} /></td>
                    <td className="namecell"><Link href={`/candidates/${r.id}${r.app_id ? `?app=${r.app_id}` : ''}`}>{r.name}</Link><div>{[r.current_title, r.current_company].filter(Boolean).join(' · ') || '—'}</div></td>
                    <td>{r.total_exp ? `${r.total_exp} yrs` : '—'}</td>
                    <td className="small">{(r.skills || []).slice(0, 3).join(', ') || '—'}</td>
                    <td>{r.location || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.cctc || r.ectc ? `${lakh(r.cctc)} → ${lakh(r.ectc)}` : <span className="tiny muted">Not in resume</span>}</td>
                    <td>{notice(r.notice_days)}</td>
                    <td className="small">{r.source || '—'}</td>
                    <td><div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><Score value={r.match_score} /><span className="tiny muted">{r.best_job ? (r.app_stage === 'rejected' ? `${r.best_job} · rejected` : r.app_id ? `${r.best_job} · in pipeline` : `${r.best_job} · below cut-off`) : 'Not scored yet'}</span></div></td>
                    <td className="tiny muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.created_at, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total.n > 50 ? (
          <div className="row" style={{ padding: 16, justifyContent: 'flex-end' }}>
            {page > 1 ? <Link className="btn sm" href={`/resumes?${new URLSearchParams({ ...sp, page: String(page - 1) })}`}>Previous</Link> : null}
            <span className="small muted">Page {page} of {Math.ceil(total.n / 50)}</span>
            {page * 50 < total.n ? <Link className="btn sm" href={`/resumes?${new URLSearchParams({ ...sp, page: String(page + 1) })}`}>Next</Link> : null}
          </div>
        ) : null}
      </section>
    </>
  );
}

function SortTh({ label, k, sp, f, def }) {
  const active = (f.sort || def) === k;
  const arrow = active ? (f.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th aria-sort={active ? (f.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <Link href={sortHref('/resumes', { ...sp, sort: f.sort || def, dir: f.dir }, k)} className={`sortlink${active ? ' on' : ''}`}>{label}{arrow}</Link>
    </th>
  );
}
