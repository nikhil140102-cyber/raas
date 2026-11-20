import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, one } from '@/lib/db';
import { Header, Pill } from '@/components/ui';
import { expRange, ctcRange } from '@/lib/util';
import ClientForm from '../ClientForm';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/roles';

export default async function ClientPage({ params }) {
  const { id } = await params;
  const me = await requireUser();
  const client = await one('SELECT * FROM clients WHERE id = $1', [Number(id)]);
  if (!client) notFound();
  const jobs = await q(`SELECT j.*, count(a.id) FILTER (WHERE a.stage <> 'rejected')::int AS active FROM jobs j LEFT JOIN applications a ON a.job_id = j.id WHERE j.client_id = $1 GROUP BY j.id ORDER BY j.created_at DESC`, [client.id]);
  return (
    <>
      <Header title={client.name} sub={[client.cloud, client.city].filter(Boolean).join(' · ')} crumbs={<><Link href="/clients">Clients</Link> / {client.name}</>}>
        {can(me, 'jobs.edit') ? <Link href={`/jobs/new?client=${client.id}`} className="btn primary">New requirement</Link> : null}
      </Header>
      <div className="cols">
        <section className="card flush col-main">
          <div className="card-head"><h2>Requirements</h2></div>
          {jobs.length ? (
            <div className="tablewrap">
              <table className="t">
                <thead><tr><th>Role</th><th>Experience</th><th>CTC</th><th>Openings</th><th>Active candidates</th><th>Status</th></tr></thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td className="namecell"><Link href={`/jobs/${j.id}`}>{j.title}</Link><div>{j.location} · {j.work_mode}</div></td>
                      <td>{expRange(j.exp_min, j.exp_max)}</td><td>{ctcRange(j.ctc_min, j.ctc_max)}</td><td>{j.openings}</td>
                      <td><Link href={`/pipeline?job=${j.id}`}>{j.active}</Link></td>
                      <td><Pill tone={j.status === 'open' ? 'green' : 'gray'}>{j.status}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty">No requirements yet.</div>}
          {can(me, 'clients.edit') && (client.contacts || []).length ? (
            <>
              <div className="card-head" style={{ borderTop: '1px solid var(--line)' }}><h2>Contacts</h2></div>
              <div className="tablewrap">
                <table className="t">
                  <thead><tr><th>Post</th><th>Name</th><th>Email</th><th>Phone</th><th>Remarks</th></tr></thead>
                  <tbody>
                    {client.contacts.map((c, i) => (
                      <tr key={i}>
                        <td>{c.post || '—'}{c.primary ? <> <Pill tone="green">Primary</Pill></> : null}</td>
                        <td className="strong">{c.name || '—'}</td>
                        <td>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</td>
                        <td>{c.phone ? <a href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a> : '—'}</td>
                        <td className="small">{c.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
        <div className="col-side">{can(me, 'clients.edit') ? <ClientForm client={client} /> : <section className="card"><h2>Client details</h2><p className="small muted">Client contacts and commercials are managed by HR and admins.</p></section>}</div>
      </div>
    </>
  );
}
