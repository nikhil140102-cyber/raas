'use client';
import { useActionState } from 'react';
import { bulkAddUsers } from '@/app/_actions/settings';
import { CopyButton } from './client';

/** Paste many people at once; shows each new login with a generated password (shown only once). */
export default function BulkAddUsers({ roles }) {
  const [state, action, pending] = useActionState(bulkAddUsers, null);
  const logins = (state?.created || []).map((u) => `${u.name} (${u.role})\nEmail: ${u.email}\nPassword: ${u.password}`).join('\n\n');
  return (
    <form action={action} className="stack">
      <h3>Add several at once</h3>
      <label className="field">One person per line: Name, email, role
        <textarea name="lines" rows={5} placeholder={'Riya Sharma, riya@avastars.in, hr\nAman Gupta, aman@avastars.in, intern\nKaran Mehta, karan@avastars.in, intern'} />
      </label>
      <div className="row" style={{ alignItems: 'flex-end', gap: 10 }}>
        <label className="field">Role when a line has none
          <select name="role" defaultValue="intern">{roles.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <button className="btn primary" type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create accounts'}</button>
      </div>
      {state?.error ? <p className="error" role="alert">{state.error}</p> : null}
      {state?.created?.length ? (
        <div className="notice ok" role="status" style={{ display: 'block' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{state.created.length} account(s) created. Copy these passwords now; they won&apos;t be shown again.</strong>
            <CopyButton text={logins} label="Copy all logins" />
          </div>
          <table className="t" style={{ marginTop: 8 }}>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Password</th></tr></thead>
            <tbody>{state.created.map((u) => <tr key={u.email}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td><td><code>{u.password}</code></td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
      {state?.skipped?.length ? <div className="notice warn" style={{ display: 'block' }}>Skipped {state.skipped.length}: {state.skipped.map((x) => `“${x.line}” (${x.why})`).join('; ')}</div> : null}
    </form>
  );
}
