import Link from 'next/link';
import { q } from '@/lib/db';
import { Header } from '@/components/ui';
import JobForm from '../JobForm';
import { requirePagePerm } from '@/lib/auth';

export const metadata = { title: 'New requirement — AvaStars Hire' };

export default async function NewJob({ searchParams }) {
  const sp = await searchParams;
  await requirePagePerm('jobs.edit', '/jobs');
  const clients = await q('SELECT id, name, contact_name, contact_email, contact_phone FROM clients ORDER BY name');
  return (
    <>
      <Header title="New requirement" sub="Steps 1 and 2: the client's requirements and the hiring manager call" crumbs={<><Link href="/jobs">Jobs</Link> / New requirement</>} />
      <JobForm clients={clients} clientId={sp.client} />
    </>
  );
}
