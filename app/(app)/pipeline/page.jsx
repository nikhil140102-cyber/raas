import Link from 'next/link';
import { q, one } from '@/lib/db';
import { Header, Score, Flash } from '@/components/ui';
import { AutoSelect } from '@/components/client';
import { STAGES, lakh, notice, SCREENING_STATUS, hoursLeft } from '@/lib/util';
import { moveStage, bulkAction } from '../../_actions/candidates';
import { requireUser } from '@/lib/auth';
import { can, canMoveTo } from '@/lib/roles';
import MatchRunner from '@/components/MatchRunner';
import FilterBar from '@/components/FilterBar';
import { readFilters, candidateWhere, orderBy, activeFilterCount, SORTS } from '@/lib/filters';
import JobsView from './JobsView';

function ViewSwitch({ view }) {
  return (
    <nav className="tabs view-switch" aria-label="Pipeline view">
      <Link href="/pipeline?view=jobs" aria-current={view === 'jobs' ? 'page' : undefined}>☰ Jobs view</Link>
      <Link href="/pipeline?view=board" aria-current={view === 'board' ? 'page' : undefined}>▦ Board view</Link>
    </nav>
  );
}

export const metadata = { title: 'Pipeline — AvaStars Hire' };

function cardTag(a) {
  if (a.stage === 'rejected') return [a.reject_reason || 'Rejected', 'red'];
  if (a.stage === 'forwarded') {
    if (a.client_decision) return [a.client_decision === 'yes' ? 'Client said yes' : 'Client said no', a.client_decision === 'yes' ? 'green' : 'red'];
    if (a.due_at) { const h = hoursLeft(a.due_at); return [h < 0 ? `Feedback overdue ${-h}h` : `Feedback due ${h}h`, h < 0 ? 'red' : 'amber']; }
  }
  if (a.s_status === 'completed') return [`Call score ${a.s_score ?? '—'}`, 'green'];
  if (a.s_status) return [SCREENING_STATUS[a.s_status], a.s_status === 'human_requested' ? 'red' : 'blue'];
  if (a.stage === 'selected') return ['Offer stage', 'green'];
  return null;
}

export default async function PipelinePage({ searchParams }) {
  const sp = await searchParams;
  // Jobs view is the landing view; opening a job (or choosing Board view) shows the candidate board.
  const view = sp.view === 'board' || sp.job ? 'board' : 'jobs';
  if (view === 'jobs') {
    const me = await requireUser();
    return (
      <>
        <Header title="Pipeline" sub="All requirements at a glance. Open a job to work on its candidates.">
          <ViewSwitch view="jobs" />
        </Header>
        <JobsView sp={sp} me={me} />
      </>
    );
  }
  const jobs = await q(`SELECT j.id, j.title, c.name AS client, (SELECT count(*)::int FROM applications a WHERE a.job_id = j.id AND a.stage <> 'rejected') AS n FROM jobs j LEFT JOIN clients c ON c.id = j.client_id WHERE j.status = 'open' ORDER BY j.created_at DESC`);
  const busiest = await one(`SELECT a.job_id FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.status = 'open' ORDER BY a.updated_at DESC LIMIT 1`);
  const jobId = Number(sp.job) || busiest?.job_id || jobs[0]?.id;
  if (!jobId) {
    return (<><Header title="Pipeline" /><div className="card empty">Create a job first. <Link href="/jobs/new">New requirement</Link></div></>);
  }
  const job = await one('SELECT * FROM jobs WHERE id = $1', [jobId]);
  const f = readFilters(sp);
  const params = [jobId];
  const where = ['a.job_id = $1', ...candidateWhere(f, params, job)];
  if (f.minMatch !== null) { params.push(f.minMatch); where.push(`a.match_score >= $${params.length}`); }
  const apps = await q(`
    SELECT * FROM (
      SELECT a.*, c.name, c.current_title, c.current_company, c.cctc, c.ectc, c.notice_days, c.total_exp, c.location, c.created_at AS c_created,
        s.status AS s_status, s.score AS s_score,
        (SELECT due_at FROM shares sh WHERE sh.job_id = a.job_id AND sh.application_ids @> to_jsonb(a.id) ORDER BY sent_at DESC LIMIT 1) AS due_at
      FROM applications a JOIN candidates c ON c.id = a.candidate_id
      LEFT JOIN LATERAL (SELECT status, score FROM screenings WHERE application_id = a.id ORDER BY id DESC LIMIT 1) s ON true
      WHERE ${where.join(' AND ')}
    ) x ORDER BY ${orderBy(f, 'match')}`, params);

  const byStage = Object.fromEntries(STAGES.map((s) => [s.id, []]));
  apps.forEach((a) => (byStage[a.stage] || byStage.pending).push(a));
  const me = await requireUser();
  const stageOptions = STAGES.filter((s) => canMoveTo(me, s.id)).map((s) => ({ value: s.id, label: s.label }));

  return (
    <>
      <Header title="Pipeline" sub={`${job.title} · ${apps.length} candidate(s) · below ${job.min_score}% match goes to Rejected`}>
        <ViewSwitch view="board" />
        <Link href="/resumes?upload=1#upload" className="btn">Upload resumes</Link>
        <MatchRunner jobs={[{ id: job.id, title: job.title }]} label="Match database resumes to this job" />
      </Header>
      <nav className="tabs" aria-label="Open jobs" style={{ flexWrap: 'wrap', alignSelf: 'flex-start' }}>
        {jobs.map((jb) => <Link key={jb.id} href={`/pipeline?job=${jb.id}`} aria-current={jb.id === jobId ? 'page' : undefined}>{jb.title}{jb.client ? ` · ${jb.client}` : ''} ({jb.n})</Link>)}
      </nav>
      <Flash msg={sp.msg || (sp.matched !== undefined ? `${sp.matched} new candidate(s) added from the database.` : '')} />

      <details className="card" open={activeFilterCount(f) > 0}>
        <summary className="strong" style={{ cursor: 'pointer' }}>Filters &amp; sorting{activeFilterCount(f) ? ` (${activeFilterCount(f)} on)` : ''} · sorted by {SORTS[f.sort || 'match'].label} {f.dir === 'asc' ? '(low → high)' : '(high → low)'}</summary>
        <FilterBar base="/pipeline" f={f} jobId={jobId} keep={{ job: jobId }} />
      </details>

      <form action={bulkAction} className="stack" style={{ gap: 14 }}>
        <input type="hidden" name="job_id" value={jobId} />
        <div className="row" style={{ gap: 8 }}>
          <span className="small strong" style={{ color: 'var(--ink2)' }}>With ticked candidates:</span>
          <button className="btn sm" type="submit" name="bulk" value="shortlist">Shortlist</button>
          <button className="btn sm" type="submit" name="bulk" value="slot">Ask for AI call slot</button>
          {can(me, 'clients.share') ? <button className="btn sm primary" type="submit" name="bulk" value="share">Send to client</button> : null}
          <button className="btn sm danger" type="submit" name="bulk" value="reject">Reject</button>
        </div>
        <div className="board-wrap">
          <div className="board">
            {STAGES.map((st) => (
              <section key={st.id} className="column" aria-label={st.label} style={{ '--col': st.color, background: `${st.color}12` }}>
                <div className="column-head">
                  <div className="row" style={{ gap: 8 }}><span className="dot" style={{ background: st.color }} aria-hidden="true" /><h2 style={{ fontSize: 14 }}>{st.label}</h2></div>
                  <span className="small strong muted">{byStage[st.id].length}</span>
                </div>
                {byStage[st.id].slice(0, 60).map((a) => {
                  const tag = cardTag(a);
                  return (
                    <div key={a.id} className="pcard">
                      <div className="top">
                        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', minWidth: 0 }}>
                          <input type="checkbox" name="app" value={a.id} style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--accent)' }} aria-label={`Select ${a.name}`} />
                          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <Link href={`/candidates/${a.candidate_id}?app=${a.id}`} className="nm">{a.name}</Link>
                            <span className="tiny muted">{[a.current_title, a.current_company].filter(Boolean).join(' · ') || '—'}</span>
                          </span>
                        </label>
                        <Score value={a.match_score} />
                      </div>
                      <div className="mini">
                        <div><span>CCTC</span><span>{lakh(a.cctc)}</span></div>
                        <div><span>ECTC</span><span>{lakh(a.ectc)}</span></div>
                        <div><span>Notice</span><span>{notice(a.notice_days)}</span></div>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <span className="tag">{a.source || '—'}</span>
                        {a.location ? <span className="tag">{a.location}</span> : null}
                        {tag ? <span className={`pill ${tag[1]}`} style={{ height: 22, fontSize: 11 }}>{tag[0]}</span> : null}
                      </div>
                      {canMoveTo(me, a.stage) ? <AutoSelect action={moveStage} name="stage" value={a.stage} options={stageOptions} hidden={{ app_id: a.id }} /> : null}
                    </div>
                  );
                })}
                {byStage[st.id].length > 60 ? <span className="tiny muted">+{byStage[st.id].length - 60} more — use the filters</span> : null}
              </section>
            ))}
          </div>
        </div>
      </form>
    </>
  );
}
