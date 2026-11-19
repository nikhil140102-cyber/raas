import Link from 'next/link';
import { q } from '@/lib/db';
import PublicHeader from '@/components/PublicHeader';
import { expRange, ctcRange, fmtDate } from '@/lib/util';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Careers — AvaStars',
  description: 'Open jobs at growing companies in India. Apply in 2 minutes.',
  openGraph: { title: 'Open jobs — AvaStars Careers', description: 'Open jobs at growing companies in India. Apply in 2 minutes.', siteName: 'AvaStars Careers' },
};

export default async function Careers({ searchParams }) {
  const sp = await searchParams;
  const term = String(sp.q || '').trim();
  const city = String(sp.city || '').trim();
  const jobs = await q(`
    SELECT * FROM jobs WHERE status = 'open'
      AND ($1 = '' OR title ILIKE $2 OR mandatory_skills::text ILIKE $2 OR description ILIKE $2)
      AND ($3 = '' OR location ILIKE $4)
    ORDER BY created_at DESC`, [term, `%${term}%`, city, `%${city}%`]);
  const cities = [...new Set((await q(`SELECT DISTINCT split_part(location, ' ', 1) AS c FROM jobs WHERE status = 'open' AND location IS NOT NULL`)).map((r) => r.c.replace(/[,(]/g, '')))];

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <PublicHeader title="AvaStars Careers" right={<nav className="row small strong" style={{ gap: 20 }}><a href="#roles" style={{ textDecoration: 'none' }}>Open roles</a></nav>} />
      <section style={{ background: 'var(--bg)', padding: '48px 32px 36px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <h1 style={{ fontSize: 36, letterSpacing: '-0.02em', maxWidth: 720 }}>Cloud jobs at India&apos;s growing AWS, Azure and GCP partners</h1>
          <p className="sub" style={{ fontSize: 16, maxWidth: 640 }}>We hire for cloud companies across India. Apply once and we match you to the right roles.</p>
          <form className="row" role="search" style={{ alignItems: 'flex-end', maxWidth: 760 }}>
            <label className="field" style={{ flex: '2 1 260px' }}>Role or skill<input type="search" name="q" defaultValue={term} placeholder="e.g. DevOps, Terraform" /></label>
            <label className="field" style={{ flex: '1 1 180px' }}>City<select name="city" defaultValue={city}><option value="">All cities</option>{cities.map((c) => <option key={c}>{c}</option>)}</select></label>
            <button className="btn primary" type="submit">Search</button>
          </form>
        </div>
      </section>
      <main id="roles" className="container">
        <span className="small strong muted">{jobs.length} open role(s)</span>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
          {jobs.map((j) => (
            <Link key={j.id} href={`/careers/${j.slug}`} className="card" style={{ textDecoration: 'none', color: 'inherit', gap: 8 }}>
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><span style={{ fontSize: 16, fontWeight: 600 }}>{j.title}</span><span className="tiny muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(j.created_at, false)}</span></div>
              <span className="small muted">{j.public_company || 'AvaStars client'}</span>
              <div className="row" style={{ gap: 6 }}>
                <span className="tag" style={{ height: 26, padding: '0 10px', fontSize: 12 }}>{j.location} · {j.work_mode}</span>
                <span className="tag" style={{ height: 26, padding: '0 10px', fontSize: 12 }}>{expRange(j.exp_min, j.exp_max)}</span>
                {j.ctc_min || j.ctc_max ? <span className="pill green" style={{ height: 26 }}>{ctcRange(j.ctc_min, j.ctc_max)}</span> : null}
              </div>
            </Link>
          ))}
        </div>
        {!jobs.length ? <div className="empty">No open roles match your search right now.</div> : null}
      </main>
      <footer style={{ padding: '20px 32px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }} className="small muted">
        <span>AvaStars Careers · Apply once and we match you to the right roles.</span>
        <a href="/login" style={{ color: 'var(--muted)' }}>HR login</a>
      </footer>
    </div>
  );
}
