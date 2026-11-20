// Pipeline "Jobs" view: one row per requirement with candidate counts, status and quick actions (Indeed-style).
import Link from 'next/link';
import { q } from '@/lib/db';
import { Pill } from '@/components/ui';
import { AutoSelect } from '@/components/client';
import { initials, fmtDate } from '@/lib/util';
import { can } from '@/lib/roles';
import { setJobStatus } from '../../_actions/jobs';
import { careersUrl } from '@/lib/posting';

const STATUS = { open: ['Open', 'green'], paused: ['Paused', 'amber'], closed: ['Closed', 'gray'] };
const STATUS_FILTERS = [['active', 'Open & paused'], ['open', 'Open'], ['paused', 'Paused'], ['closed', 'Closed'], ['all', 'All']];

function ago(d) {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const m = Math.floor(days / 30);
  return m < 12 ? `${m} month${m > 1 ? 's' : ''} ago` : `${Math.floor(m / 12)} year(s) ago`;
}

export default async function JobsView({ sp, me }) {
  const st = STATUS_FILTERS.some(([k]) => k === sp.status) ? sp.status : 'active';
  const title = String(sp.title || '').trim();
  const loc = String(sp.loc || '').trim();
  const client = Number(sp.client) || null;
  const sort = sp.sort === 'title' ? 'title' : sp.sort === 'oldest' ? 'oldest' : 'newest';
  const params = [];
  const where = [];
  if (st === 'active') where.push(`j.status IN ('open','paused')`);
  else if (st !== 'all') { params.push(st); where.push(`j.status = $${params.length}`); }
  if (title) { params.push(`%${title}%`); where.push(`j.title ILIKE $${params.length}`); }
  if (loc) { params.push(`%${loc}%`); where.push(`j.location ILIKE $${params.length}`); }
  if (client) { params.push(client); where.push(`j.client_id = $${params.length}`); }
  const order = sort === 'title' ? 'j.title ASC' : sort === 'oldest' ? 'j.created_at ASC' : 'j.created_at DESC';
  const jobs = await q(`
    SELECT j.*, c.name AS client, u.name AS owner,
      count(a.id)::int AS all_n,
      count(a.id) FILTER (WHERE a.stage = 'pending')::int AS new_n,
      count(a.id) FILTER (WHERE a.stage <> 'rejected' AND a.match_score >= COALESCE(j.min_score, 60))::int AS match_n,
      count(a.id) FILTER (WHERE a.stage IN ('shortlisted','screening'))::int AS short_n,
      count(a.id) FILTER (WHERE a.stage IN ('forwarded','interview'))::int AS client_n,
      count(a.id) FILTER (WHERE a.stage IN ('selected','joined'))::int AS sel_n
    FROM jobs j
    LEFT JOIN clients c ON c.id = j.client_id
    LEFT JOIN users u ON u.id = j.created_by
    LEFT JOIN applications a ON a.job_id = j.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    GROUP BY j.id, c.name, u.name ORDER BY ${order}`, params);
  const locations = (await q(`SELECT DISTINCT location FROM jobs WHERE location IS NOT NULL AND location <> '' ORDER BY location`)).map((r) => r.location);
  const clients = await q('SELECT id, name FROM clients ORDER BY name');
  const editable = can(me, 'jobs.edit');
  const here = `/pipeline?${new URLSearchParams(Object.entries({ view: 'jobs', status: st === 'active' ? '' : st, title, loc, client: client || '', sort: sort === 'newest' ? '' : sort }).filter(([, v]) => v))}`;
  const filtersOn = [st !== 'active', title, loc, client].filter(Boolean).length;

  return (
    <section className="stack" style={{ gap: 14 }}>
      <form className="jobs-filters" action="/pipeline">
        <input type="hidden" name="view" value="jobs" />
        <select name="status" defaultValue={st} aria-label="Status">
          {STATUS_FILTERS.map(([k, l]) => <option key={k} value={k}>Status: {l}</option>)}
        </select>
        <input type="search" name="title" defaultValue={title} placeholder="Job title" aria-label="Job title" />
        <select name="loc" defaultValue={loc} aria-label="Location">
          <option value="">Location: all</option>
          {locations.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select name="client" defaultValue={client || ''} aria-label="Client">
          <option value="">Client: all</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="sort" defaultValue={sort} aria-label="Sort">
          <option value="newest">Date posted: newest</option><option value="oldest">Date posted: oldest</option><option value="title">Job title A–Z</option>
        </select>
        <button className="btn primary sm" type="submit">Apply</button>
        {filtersOn ? <Link href="/pipeline?view=jobs" className="btn sm">Clear ({filtersOn})</Link> : null}
        <span className="strong" style={{ marginLeft: 'auto' }}>{jobs.length} result{jobs.length === 1 ? '' : 's'}</span>
      </form>

      <div className="card flush">
        <div className="tablewrap">
          <table className="t jobs-table">
            <thead><tr><th>Job title</th><th>Candidates</th><th>Date posted</th><th>Owner</th><th>Job status</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {!jobs.length ? <tr><td colSpan={6} className="empty">No jobs match these filters.</td></tr> : null}
              {jobs.map((j) => {
                const [label, tone] = STATUS[j.status] || [j.status, 'gray'];
                const board = `/pipeline?job=${j.id}`;
                return [
                  <tr key={j.id} className={j.status !== 'open' ? 'is-muted' : undefined}>
                    <td className="namecell" style={{ minWidth: 240 }}>
                      <Link href={board} className="jobtitle">{j.title}</Link>
                      <div>{[j.client, j.location, j.work_mode].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td>
                      <div className="counts">
                        <Link href={board}><b>{j.all_n}</b><span>All</span></Link>
                        <Link href={board}><b>{j.new_n}</b><span>New</span></Link>
                        <Link href={`${board}&min=${j.min_score ?? 60}`}><b>{j.match_n}</b><span>Matches</span></Link>
                        <Link href={board}><b>{j.short_n}</b><span>Shortlisted</span></Link>
                        <Link href={board}><b>{j.client_n}</b><span>Client</span></Link>
                        <Link href={board}><b>{j.sel_n}</b><span>Selected</span></Link>
                      </div>
                    </td>
                    <td className="small" style={{ whiteSpace: 'nowrap' }}>{ago(j.created_at)}<div className="tiny muted">{fmtDate(j.created_at, false)}</div></td>
                    <td>{j.owner ? <span className="avatar sm" title={j.owner}>{initials(j.owner)}</span> : <span className="muted">—</span>}</td>
                    <td style={{ minWidth: 140 }}>
                      {editable ? (
                        <AutoSelect action={setJobStatus} name="status" value={j.status} label="" className={`status-select st-${j.status}`} hidden={{ job_id: j.id, back: here }}
                          options={[{ value: 'open', label: '● Open' }, { value: 'paused', label: '● Paused' }, { value: 'closed', label: '● Closed' }]} />
                      ) : <Pill tone={tone}>{label}</Pill>}
                    </td>
                    <td>
                      <details className="menu">
                        <summary className="btn sm" aria-label={`Actions for ${j.title}`}>•••</summary>
                        <div className="menu-pop">
                          <Link href={board}>View candidates (board)</Link>
                          <Link href={`/jobs/${j.id}`}>Job overview</Link>
                          {editable ? <Link href={`/jobs/${j.id}/edit`}>Edit requirement</Link> : null}
                          {can(me, 'jobs.post') ? <Link href={`/jobs/${j.id}/announce`}>Post & announce</Link> : null}
                          <Link href={`/resumes?job=${j.id}`}>Find matching resumes</Link>
                          {j.status === 'open' ? <a href={careersUrl(j)} target="_blank" rel="noreferrer">Public job page ↗</a> : null}
                        </div>
                      </details>
                    </td>
                  </tr>,
                  j.status === 'paused' ? (
                    <tr key={`${j.id}-paused`} className="paused-row">
                      <td colSpan={6}>
                        <div className="paused-banner">
                          <span><strong>This job is paused.</strong> It&apos;s hidden from the careers page and new applications are stopped. Reopen it?</span>
                          {editable ? (
                            <span className="row" style={{ gap: 8 }}>
                              <form action={setJobStatus}><input type="hidden" name="job_id" value={j.id} /><input type="hidden" name="status" value="open" /><input type="hidden" name="back" value={here} /><button className="btn sm primary" type="submit">Reopen</button></form>
                              <form action={setJobStatus}><input type="hidden" name="job_id" value={j.id} /><input type="hidden" name="status" value="closed" /><input type="hidden" name="back" value={here} /><button className="btn sm" type="submit">Close job</button></form>
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
