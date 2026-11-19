import AppShell from '@/components/AppShell';
import { requireUser } from '@/lib/auth';
import { logout } from '../_actions/auth';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }) {
  const user = await requireUser();
  return <AppShell user={user} logout={logout}>{children}</AppShell>;
}
