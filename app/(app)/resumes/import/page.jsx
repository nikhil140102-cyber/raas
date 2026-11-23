import Link from 'next/link';
import { q } from '@/lib/db';
import { requirePagePerm } from '@/lib/auth';
import { can } from '@/lib/roles';
import { cfg } from '@/lib/config';
import { aiEnabled } from '@/lib/ai';
import { openJobs } from '@/lib/importer';
import { appUrl, fmtDate } from '@/lib/util';
import { Header, Flash, Pill } from '@/components/ui';
import Importer from './Importer';

export const metadata = { title: 'Import applicants — AvaStars Hire' };

export default async function ImportPage({ searchParams }) {
  const sp = await searchParams;
  const me = await requirePagePerm('candidates.edit', '/resumes');
  const jobs = await openJobs();
  const runs = await q('SELECT * FROM import_runs ORDER BY id DESC LIMIT 8');
  const keySet = Boolean(cfg('INBOUND_API_KEY'));
  return (
    <>
      <Header title="Import applicants" sub="Bring in people who applied on Indeed, Naukri, LinkedIn or any other portal — with a date filter — and put them on the right job." crumbs={<><Link href="/resumes">Resumes</Link> / Import</>} />
      <Flash msg={sp.msg} />
      {!aiEnabled() ? <div className="notice warn">AI is off (no Anthropic key), so pasted pages are read with simple rules and resumes get keyword matching. Files from portals still import fully.</div> : null}
      <Importer jobs={jobs.map((j) => ({ id: j.id, title: j.title, client: j.client || '' }))} ai={aiEnabled()} />

      <div className="grid3">
        <section className="card">
          <h2>Chrome extension: one-click collect</h2>
          <p className="small muted">The <strong>AvaStars Collector</strong> adds a side panel in Chrome. Open your Indeed or Naukri applicants page, pick the dates, click <em>Scan this page</em>, then <em>Send to AvaStars</em>. It can also send each resume you download.</p>
          <a className="btn primary sm" href="/avastars-collector.zip" download>Download the extension (.zip)</a>
          <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
            <li>Unzip it to a folder you&apos;ll keep (e.g. Documents\avastars-collector).</li>
            <li>Open <code>chrome://extensions</code>, turn on <strong>Developer mode</strong>, click <strong>Load unpacked</strong> and pick that folder.</li>
            <li>Click the AvaStars icon → <strong>Settings</strong>, paste the app address <code>{appUrl('')}</code> and the Inbound API key.</li>
          </ol>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small">Inbound API key</span>
            {keySet ? <Pill tone="green">Set</Pill> : <Pill tone="amber">Not set</Pill>}
          </div>
          {!keySet ? <p className="tiny muted">{can(me, 'secrets.manage') ? <>Add it in <Link href="/settings/keys">Settings → Keys & connections</Link> (Automation).</> : 'Ask an admin to add the Inbound API key.'}</p> : can(me, 'secrets.manage') ? <p className="tiny muted">Find or change it in <Link href="/settings/keys">Keys & connections</Link>.</p> : <p className="tiny muted">Ask an admin for the key.</p>}
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
