import Link from 'next/link';
import { Header } from '@/components/ui';
import ClientForm from '../ClientForm';

export const metadata = { title: 'New client — AvaStars Hire' };

export default function NewClient() {
  return (
    <>
      <Header title="Add client" crumbs={<><Link href="/clients">Clients</Link> / New</>} />
      <div style={{ maxWidth: 900 }}><ClientForm /></div>
    </>
  );
}
