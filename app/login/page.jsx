import LoginForm from './LoginForm';
import { secretMissing } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in — AvaStars Hire' };

export default function LoginPage() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 28, gap: 18 }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="logo">A</span>
          <div><div className="strong" style={{ fontSize: 16 }}>AvaStars Hire</div><div className="tiny muted">Recruitment workspace</div></div>
        </div>
        <h1 style={{ fontSize: 22 }}>Sign in</h1>
        {secretMissing() ? <div className="notice warn" role="alert">Setup needed: AUTH_SECRET is not set. Add a line <code>AUTH_SECRET=</code> followed by any long random text to <code>.env.local</code>, then restart the app.</div> : null}
        <LoginForm />
      </div>
    </main>
  );
}
