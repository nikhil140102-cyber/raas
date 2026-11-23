import Link from 'next/link';
import { q } from '@/lib/db';
import { requirePagePerm } from '@/lib/auth';
import { aiEnabled } from '@/lib/ai';
import { openJobs } from '@/lib/importer';
import { fmtDate } from '@/lib/util';
import { Header, Flash } from '@/components/ui';
import Importer from './Importer';

export const metadata = { title: 'Import applicants — AvaStars Hire' };

export default async function ImportPage({ searchParams }) {
  const sp = await searchParams;
  const me = await requirePagePerm('candidates.edit', '/resumes');
  const jobs = await openJobs();
  const runs = await q('SELECT * FROM import_runs ORDER BY id DESC LIMIT 8');
  return (
    <>
      <Header title="Import applicants" sub="Bring in people who applied on Indeed, Naukri, LinkedIn or any other portal — with a date filter — and put them on the right job." crumbs={<><Link href="/resumes">Resumes</Link> / Import</>} />
      <Flash msg={sp.msg} />
      {!aiEnabled() ? <div className="notice warn">AI is off (no Anthropic key), so pasted pages are read with simple rules and resumes get keyword matching. Files from portals still import fully.</div> : null}
      <Importer jobs={jobs.map((j) => ({ id: j.id, title: j.title, client: j.client || '' }))} ai={aiEnabled()} />

      <div className="grid3">
        <section className="card">
          <h2>Chrome extension: one-click collect</h2>
          <p className="small muted">The <strong>AvaStars Collector</strong> adds a side panel in Chrome. Pick the dates, click <em>Load my Indeed jobs</em>, tick jobs and <em>Collect &amp; send</em>: every applicant comes in with their resume. On Naukri or any other page, use <em>Scan this page</em>.</p>
          <Link className="btn primary sm" href="/extension">{me.ext_connected_at ? 'Extension: download & reconnect' : 'Set up the extension (2 min)'}</Link>
          <p className="tiny muted">Download, add to Chrome and connect with one click: no app address or API key to type.{me.ext_connected_at ? ' You have connected it already.' : ''}</p>
        </section>
        <section className="card">
          <h2>Which way to use</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            <li><strong>Many applicants at once:</strong> export the list from the portal and use <em>Excel / CSV file</em> above. Add the resume ZIP to get match %.</li>
            <li><strong>Every day, quickly:</strong> the Chrome extension, set to <em>Today</em> or <em>Last 7 days</em>.</li>
            <li><strong>One or two people, or an email:</strong> <em>Paste from a page</em>.</li>
            <li><strong>Automatic from other tools:</strong> Zapier / Make / your website can post to the Inbound API (Settings).</li>
          </ul>
          <p className="tiny muted">Already-known people are matched by email or phone and updated, never duplicated. HR edits are never overwritten.</p>
        </section>
        <section className="card">
          <h2>Recent imports</h2>
          {runs.length ? (
            <div className="stack" style={{ gap: 6 }}>
              {runs.map((r) => (
                <div key={r.id} className="small" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}><span className="strong">{r.source || 'Import'} · {r.kind === 'extension' ? 'Extension' : r.kind === 'paste' ? 'Pasted' : 'File'}</span><span className="tiny muted">{fmtDate(r.created_at)}</span></div>
                  <div className="tiny muted">{r.summary.created ?? 0} new · {r.summary.merged ?? 0} updated{r.summary.failed ? ` · ${r.summary.failed} failed` : ''}{r.summary.from || r.summary.to ? ` · applied ${r.summary.from || '…'} to ${r.summary.to || '…'}` : ''}{r.user_name ? ` · by ${r.user_name}` : ''}</div>
                </div>
              ))}
            </div>
          ) : <p className="small muted">No imports yet.</p>}
        </section>
      </div>
    </>
  );
}
