import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, one } from '@/lib/db';
import { Header } from '@/components/ui';
import JobForm from '../../JobForm';

export default async function EditJob({ params }) {
  const { id } = await params;
  const job = await one('SELECT * FROM jobs WHERE id = $1', [Number(id)]);
  if (!job) notFound();
  const clients = await q('SELECT id, name, contact_name, contact_email, contact_phone FROM clients ORDER BY name');
  return (
    <>
      <Header title={`Edit: ${job.title}`} crumbs={<><Link href="/jobs">Jobs</Link> / <Link href={`/jobs/${job.id}`}>{job.title}</Link> / Edit</>} />
      <JobForm job={job} clients={clients} />
    </>
  );
}
