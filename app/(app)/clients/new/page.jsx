import Link from 'next/link';
import { Header } from '@/components/ui';
import ClientForm from '../ClientForm';
import { requirePagePerm } from '@/lib/auth';

export const metadata = { title: 'New client \u2014 AvaStars Hire' };

export default async function NewClient() {
  await requirePagePerm('clients.edit', '/clients');
  return (
    <>
      <Header title="Add client" crumbs={<><Link href="/clients">Clients</Link> / New</>} />
      <ClientForm />
    </>
  );
}
