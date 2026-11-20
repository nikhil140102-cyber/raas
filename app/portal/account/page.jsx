import { requireClientUser } from '@/lib/auth';
import { Flash } from '@/components/ui';
import { changePassword } from '../../_actions/settings';

export default async function PortalAccount({ searchParams }) {
  const sp = await searchParams;
  const me = await requireClientUser();
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 520 }}>
      <h1>My account</h1>
      <p className="sub">{me.name} · {me.email}</p>
      <Flash msg={sp.msg} />
      <form action={changePassword} className="card">
        <h2>Change my password</h2>
        <label className="field">Current password<input name="current" type="password" required /></label>
        <label className="field">New password<input name="next" type="password" required minLength={8} /></label>
        <button className="btn primary" type="submit">Change password</button>
      </form>
    </div>
  );
}
