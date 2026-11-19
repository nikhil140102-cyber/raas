import Link from 'next/link';
import { q, getSetting } from '@/lib/db';
import { Header, Pill, Flash } from '@/components/ui';
import { addProspect, importProspects, convertProspect, setProspectStatus, saveIcp } from '../../_actions/clients';

export const metadata = { title: 'Clients — AvaStars Hire' };

const DEFAULT_ICP = { clouds: ['AWS', 'Azure', 'GCP'], country: 'India', revenueMin: 50, revenueMax: 500, cities: ['Bangalore', 'Delhi NCR', 'Mumbai', 'Pune', 'Hyderabad', 'Coimbatore'] };

function icpFit(p, icp) {
  const checks = [
    !!p.cloud && icp.clouds.some((c) => p.cloud.toLowerCase().includes(c.toLowerCase())),
    p.revenue_cr !== null && p.revenue_cr >= (icp.revenueMin ?? 0) && p.revenue_cr <= (icp.revenueMax ?? 1e9),
    !!p.city && icp.cities.some((c) => p.city.toLowerCase().includes(c.toLowerCase().split(' ')[0])),
    !!p.signal,
  ];
  return checks.filter(Boolean).length;
}

export default async function ClientsPage({ searchParams }) {
  const sp = await searchParams;
  const tab = sp.tab === 'prospects' ? 'prospects' : 'clients';
  const search = String(sp.q || '').trim();
  const icp = { ...DEFAULT_ICP, ...(await getSetting('icp', {})) };
  const like = `%${search}%`;
  const clients = await q(`
    SELECT c.*, count(j.id) FILTER (WHERE j.status = 'open')::int AS open_roles,
      (SELECT round(avg(EXTRACT(EPOCH FROM (a.updated_at - s.sent_at)) / 3600))::int FROM shares s JOIN applications a ON s.application_ids @> to_jsonb(a.id) JOIN jobs jj ON jj.id = s.job_id WHERE jj.client_id = c.id AND a.client_decision IS NOT NULL) AS avg_feedback_h
    FROM clients c LEFT JOIN jobs j ON j.client_id = c.id
    WHERE ($1 = '' OR c.name ILIKE $2 OR c.contact_name ILIKE $2) GROUP BY c.id ORDER BY c.created_at DESC`, [search, like]);
  const prospects = await q(`SELECT * FROM prospects WHERE status <> 'converted' AND ($1 = '' OR name ILIKE $2) ORDER BY created_at DESC`, [search, like]);
  const counts = { clients: clients.length, prospects: prospects.length };

  return (
    <>
      <Header title="Clients" sub="Companies you hire for, and prospects that match your ideal client profile">
        <Link href="/clients/new" className="btn primary">Add client</Link>
      </Header>
      {sp.imported ? <Flash msg={`${sp.imported} prospect(s) imported.`} /> : null}

      <div className="cols">
        <section className="col-main">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <nav className="tabs" aria-label="Client lists">
              <Link href="/clients" aria-current={tab === 'clients' ? 'page' : undefined}>Clients ({counts.clients})</Link>
              <Link href="/clients?tab=prospects" aria-current={tab === 'prospects' ? 'page' : undefined}>Prospects ({counts.prospects})</Link>
            </nav>
            <form className="row" style={{ gap: 8 }}>
              {tab === 'prospects' ? <input type="hidden" name="tab" value="prospects" /> : null}
              <label className="sr" htmlFor="q">Search</label>
              <input id="q" type="search" name="q" defaultValue={search} placeholder="Company or contact" style={{ width: 240 }} />
              <button className="btn" type="submit">Search</button>
            </form>
          </div>

          {tab === 'clients' ? (
            <div className="card flush">
              {clients.length ? (
                <div className="tablewrap">
                  <table className="t" style={{ minWidth: 820 }}>
                    <thead><tr><th>Client</th><th>Cloud</th><th>City</th><th>Revenue</th><th>Open roles</th><th>Avg feedback time</th><th>Status</th></tr></thead>
                    <tbody>
                      {clients.map((c) => (
                        <tr key={c.id}>
                          <td className="namecell"><Link href={`/clients/${c.id}`}>{c.name}</Link><div>{c.contact_name || 'No contact yet'}</div></td>
                          <td>{c.cloud || '—'}</td><td>{c.city || '—'}</td><td>{c.revenue_cr ? `₹${c.revenue_cr} Cr` : '—'}</td>
                          <td>{c.open_roles}</td>
                          <td>{c.avg_feedback_h !== null ? `${c.avg_feedback_h}h` : '—'}</td>
                          <td><Pill tone={c.status === 'active' ? (c.avg_feedback_h > 24 ? 'amber' : 'green') : c.status === 'on hold' ? 'gray' : 'blue'}>{c.status === 'active' && c.avg_feedback_h > 24 ? 'Slow feedback' : c.status}</Pill></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="empty">No clients yet. <Link href="/clients/new">Add your first client</Link>.</div>}
            </div>
          ) : (
            <>
              <div className="card flush">
                {prospects.length ? (
                  <div className="tablewrap">
                    <table className="t" style={{ minWidth: 880 }}>
                      <thead><tr><th>Company</th><th>Cloud</th><th>City</th><th>Revenue</th><th>Hiring signal</th><th>Fits ICP</th><th>Status</th><th></th></tr></thead>
                      <tbody>
                        {prospects.map((p) => {
                          const fit = icpFit(p, icp);
                          return (
                            <tr key={p.id}>
                              <td className="namecell"><span className="strong">{p.name}</span><div>{p.source}</div></td>
                              <td>{p.cloud || '—'}</td><td>{p.city || '—'}</td><td>{p.revenue_cr ? `₹${p.revenue_cr} Cr` : '—'}</td>
                              <td className="small">{p.signal || '—'}</td>
                              <td><Pill tone={fit >= 4 ? 'green' : fit >= 3 ? 'amber' : 'gray'}>{fit} of 4</Pill></td>
                              <td>
                                <form action={setProspectStatus} className="row" style={{ gap: 6 }}>
                                  <input type="hidden" name="id" value={p.id} />
                                  <label className="sr" htmlFor={`ps-${p.id}`}>Status</label>
                                  <select id={`ps-${p.id}`} name="status" defaultValue={p.status} style={{ minHeight: 36, width: 130 }}>
                                    {['new', 'contacted', 'meeting booked', 'not interested'].map((x) => <option key={x}>{x}</option>)}
                                  </select>
                                  <button className="btn sm" type="submit">Save</button>
                                </form>
                              </td>
                              <td><form action={convertProspect}><input type="hidden" name="id" value={p.id} /><button className="btn sm" type="submit">Make client</button></form></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="empty">No prospects yet. Add one below or import a CSV.</div>}
              </div>
              <div className="cols">
                <form action={addProspect} className="card col-main">
                  <h2>Add a prospect</h2>
                  <div className="grid">
                    <label className="field">Company *<input name="name" required /></label>
                    <label className="field">Cloud<input name="cloud" placeholder="AWS, Azure, GCP" /></label>
                    <label className="field">City<input name="city" /></label>
                    <label className="field">Revenue (₹ Cr)<input name="revenue_cr" type="number" step="any" /></label>
                    <label className="field">Hiring signal<input name="signal" placeholder="e.g. 14 open roles on LinkedIn" /></label>
                    <label className="field">Source<select name="source"><option>LinkedIn</option><option>Indeed</option><option>Referral</option><option>Manual</option></select></label>
                  </div>
                  <button className="btn primary" type="submit" style={{ alignSelf: 'flex-start' }}>Add prospect</button>
                </form>
                <form action={importProspects} className="card col-side">
                  <h2>Import CSV</h2>
                  <p className="small muted">Columns: name, cloud, city, revenue_cr, signal, source</p>
                  <label className="field">CSV file<input type="file" name="file" accept=".csv,text/csv" required /></label>
                  <button className="btn" type="submit">Import</button>
                </form>
              </div>
            </>
          )}
        </section>

        <aside className="col-side">
          <form action={saveIcp} className="card">
            <h2>Ideal client profile</h2>
            <p className="small muted">Prospects are scored against these rules.</p>
            <label className="field">Cloud platforms<input name="clouds" defaultValue={icp.clouds.join(', ')} /></label>
            <label className="field">Country<input name="country" defaultValue={icp.country} /></label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <label className="field" style={{ flex: 1 }}>Revenue from (₹ Cr)<input name="revenueMin" type="number" defaultValue={icp.revenueMin} /></label>
              <label className="field" style={{ flex: 1 }}>to (₹ Cr)<input name="revenueMax" type="number" defaultValue={icp.revenueMax} /></label>
            </div>
            <label className="field">Focus cities<textarea name="cities" rows={2} defaultValue={icp.cities.join(', ')} /></label>
            <button className="btn" type="submit">Save profile</button>
          </form>
        </aside>
      </div>
    </>
  );
}
