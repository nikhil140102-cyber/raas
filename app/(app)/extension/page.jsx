import Link from 'next/link';
import { requirePagePerm } from '@/lib/auth';
import { Header, Flash } from '@/components/ui';
import Connect from './Connect';

export const metadata = { title: 'Chrome extension — AvaStars Hire' };

export default async function ExtensionPage({ searchParams }) {
  const sp = await searchParams;
  const me = await requirePagePerm('candidates.edit', '/');
  return (
    <>
      <Header title="AvaStars Collector — Chrome extension" sub="Collect applicants from Indeed (and other job portals) straight into AvaStars. One-time setup, about 2 minutes." />
      <Flash msg={sp.msg} />
      <div className="stack" style={{ gap: 16, maxWidth: 860 }}>
        <section className="card">
          <h2>1. Download</h2>
          <p className="small muted">Download the extension and unzip it into a folder you&apos;ll keep, e.g. <code>Documents\avastars-collector</code>. Don&apos;t delete that folder later; Chrome runs the extension from it.</p>
          <div><a className="btn primary" href="/avastars-collector.zip" download>Download AvaStars Collector (.zip)</a></div>
        </section>
        <section className="card">
          <h2>2. Add it to Chrome</h2>
          <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            <li>Open a new tab and go to <code>chrome://extensions</code> (copy and paste it into the address bar).</li>
            <li>Turn on <strong>Developer mode</strong> (switch at the top right).</li>
            <li>Click <strong>Load unpacked</strong> and choose the <code>avastars-collector</code> folder.</li>
            <li>Click the puzzle icon in Chrome&apos;s toolbar and <strong>pin</strong> AvaStars Collector.</li>
            <li>Come back to this page and press <strong>F5</strong>.</li>
          </ol>
          <p className="tiny muted">Already installed an older version? Unzip the new download over the same folder and click ⟳ Reload on the extension in chrome://extensions.</p>
        </section>
        <section className="card">
          <h2>3. Connect</h2>
          <p className="small muted">One click links the extension to AvaStars with your own personal key. You don&apos;t need to type the app address or any API key. Applicants you send are marked as sent by <strong>{me.name}</strong>.</p>
          <Connect connectedAt={me.ext_connected_at ? new Date(me.ext_connected_at).toISOString() : null} />
        </section>
        <section className="card">
          <h2>4. Use it</h2>
          <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            <li>Log in to Indeed for Employers in Chrome.</li>
            <li>Click the AvaStars icon. In the side panel choose the dates (e.g. 7 days).</li>
            <li><strong>Load my Indeed jobs</strong> → tick jobs → check the AvaStars job under each → <strong>Collect &amp; send</strong>.</li>
            <li>For Naukri, LinkedIn or any other page: open the list or profile and click <strong>Scan this page</strong>.</li>
          </ol>
          <p className="tiny muted">You can also import exported files from <Link href="/resumes/import">Resumes → Import</Link>.</p>
        </section>
      </div>
    </>
  );
}
