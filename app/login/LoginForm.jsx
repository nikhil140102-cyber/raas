'use client';
import { useActionState } from 'react';
import { login } from '../_actions/auth';

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="stack" style={{ gap: 14 }}>
      <label className="field">Email<input type="email" name="email" required autoComplete="username" /></label>
      <label className="field">Password<input type="password" name="password" required autoComplete="current-password" /></label>
      {state?.error ? <p className="error" role="alert">{state.error}</p> : null}
      <button className="btn primary" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
