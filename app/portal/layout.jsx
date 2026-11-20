import Link from 'next/link';
import { requireClientUser } from '@/lib/auth';
import { one } from '@/lib/db';
import { initials } from '@/lib/util';
import { logout } from '../_actions/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Client portal — AvaStars', robots: { index: false } };

export default async function PortalLayout({ children }) {
  const me = await requireClientUser();
  const company = await one('SELECT name FROM clients WHERE id = $1', [me.client_id]);
  return (
    <div className="portal">
      <header className="portal-top">
        <Link href="/portal" className="brand"><span className="logo">A</span> AvaStars <span className="muted">· Client portal</span></Link>
        <span className="spacer" />
        <span className="small strong">{company?.name}</span>
        <Link href="/portal/account" className="me"><span className="avatar sm">{initials(me.name)}</span><span className="small">{me.name}</span></Link>
        <form action={logout}><button className="btn sm" type="submit">Sign out</button></form>
      </header>
      <main className="container" style={{ maxWidth: 1280 }}>{children}</main>
    </div>
  );
}
