import { q } from '@/lib/db';
import { Header, Pill, Flash } from '@/components/ui';
import { fmtDate, appUrl } from '@/lib/util';
import { callSettings } from '@/lib/screening';
import { providerName } from '@/lib/voice';
import { aiEnabled } from '@/lib/ai';
import { saveCallSettings } from '../../_actions/screening';
import { addUser, updateUser, changePassword, loadSample } from '../../_actions/settings';
import { requireUser } from '@/lib/auth';
import { can, ROLES, PERMISSIONS, roleOf, roleLabel } from '@/lib/roles';
import { ColSelect } from '@/components/ColFilter';
import { ConfirmButton } from '@/components/client';
import BulkAddUsers from '@/components/BulkAddUsers';
import Link from 'next/link';

export const metadata = { title: 'Settings — AvaStars Hire' };

export default async function SettingsPage({ searchParams }) {
  const sp = await searchParams;
  const me = await requireUser();
  if (!can(me, 'settings.manage')) return <MyAccount me={me} msg={sp.msg} />;
  const st = await callSettings();
  const users = await q('SELECT id, email, name, role, active, last_login, created_at FROM users ORDER BY active DESC, id');
  const noJobs = (await q('SELECT count(*)::int AS n FROM jobs'))[0].n === 0;
  const outbox = await q('SELECT * FROM messages ORDER BY created_at DESC LIMIT 25');
  const integrations = [
    ['Database', process.env.DATABASE_URL ? 'Postgres (DATABASE_URL)' : 'Built-in local database', !!process.env.DATABASE_URL],
    ['AI (resume reading, matching, call scoring)', aiEnabled() ? `On · ${process.env.AI_MODEL || 'claude-haiku-5-5'}` : 'Off — keyword rules only', aiEnabled()],
    ['Email (SMTP)', process.env.SMTP_HOST ? process.env.SMTP_HOST : 'Off — messages only saved in the Outbox', !!process.env.SMTP_HOST],
    ['WhatsApp', process.env.WHATSAPP_WEBHOOK_URL ? 'On' : 'Off — messages only saved in the Outbox', !!process.env.WHATSAPP_WEBHOOK_URL],
    ['Careers inbox (IMAP)', process.env.IMAP_HOST ? process.env.IMAP_USER : 'Off', !!process.env.IMAP_HOST],
    ['Voice calls', providerName() === 'mock' ? 'Test mode (no real calls)' : providerName(), providerName() !== 'mock'],
  ];
  return (
    <>
      <Header title="Settings" sub="Integrations, call rules, users and the message outbox" />
      <Flash msg={sp.msg} />
      <UsersAndRoles users={users} me={me} sp={sp} />
      <div className="cols">
        <section className="col-main">
          <section className="card">
            <h2>Integrations</h2>
            <p className="small muted">These are set with environment variables (see .env.example). Restart the app after changing them.</p>
            {integrations.map(([k, v, on]) => (
              <div key={k} className="row" style={{ justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--line)' }}><span className="strong">{k}</span><span className="row" style={{ gap: 8 }}><span className="small muted">{v}</span><Pill tone={on ? 'green' : 'gray'}>{on ? 'On' : 'Off'}</Pill></span></div>
            ))}
            <p className="tiny muted">Voice webhook URL for your provider: {appUrl(`/api/webhooks/voice/${providerName()}?secret=…`)}</p>
          </section>
          <section className="card flush">
            <div className="card-head"><h2>Outbox</h2><span className="small muted">Last 25 messages</span></div>
            {outbox.length ? (
              <div className="tablewrap">
                <table className="t" style={{ minWidth: 760 }}>
                  <thead><tr><th>When</th><th>Channel</th><th>To</th><th>Message</th><th>Status</th></tr></thead>
                  <tbody>
                    {outbox.map((m) => (
                      <tr key={m.id}>
                        <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDate(m.created_at)}</td><td>{m.channel}</td><td className="small">{m.to_addr}</td>
                        <td className="small"><details><summary style={{ cursor: 'pointer' }}>{m.subject || (m.body || '').slice(0, 60)}</summary><p className="pre" style={{ marginTop: 6 }}>{m.body}</p></details></td>
                        <td><Pill tone={m.status === 'sent' ? 'green' : m.status === 'failed' ? 'red' : 'gray'}>{m.status}</Pill>{m.error ? <div className="tiny muted">{m.error}</div> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="empty">No messages yet.</div>}
          </section>
        </section>
        <aside className="col-side">
          <form action={saveCallSettings} className="card">
            <h2>AI call rules</h2>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <label className="field" style={{ flex: 1 }}>Calls from (IST)<input type="time" name="windowStart" defaultValue={st.windowStart} /></label>
              <label className="field" style={{ flex: 1 }}>until<input type="time" name="windowEnd" defaultValue={st.windowEnd} /></label>
            </div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <label className="field" style={{ flex: 1 }}>Slot (min)<input type="number" name="slotMinutes" defaultValue={st.slotMinutes} /></label>
              <label className="field" style={{ flex: 1 }}>Days offered<input type="number" name="days" defaultValue={st.days} /></label>
            </div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <label className="field" style={{ flex: 1 }}>Max attempts<input type="number" name="maxAttempts" defaultValue={st.maxAttempts} /></label>
              <label className="field" style={{ flex: 1 }}>Retry after (h)<input type="number" name="retryHours" defaultValue={st.retryHours} /></label>
            </div>
            <button className="btn" type="submit">Save rules</button>
          </form>
          {noJobs ? (
            <form action={loadSample} className="card">
              <h2>Try it with sample data</h2>
              <p className="small muted">Adds 3 sample clients, 2 jobs and 8 fictional candidates so you can click through every step. Only works on an empty workspace.</p>
              <button className="btn" type="submit">Load sample data</button>
            </form>
          ) : null}
          <form action={changePassword} className="card">
            <h2>Change my password</h2>
            <label className="field">Current password<input name="current" type="password" required /></label>
            <label className="field">New password<input name="next" type="password" required minLength={8} /></label>
            <button className="btn" type="submit">Change password</button>
          </form>
        </aside>
      </div>
    </>
  );
}

function RolePill({ role }) {
  const r = ROLES[role] || ROLES.intern;
  return <Pill tone={r.tone}>{r.label}</Pill>;
}

function UsersAndRoles({ users: all, me, sp }) {
  const roleOptions = Object.entries(ROLES).map(([k, v]) => [k, v.label]);
  const roleTab = ROLES[sp.role] ? sp.role : '';
  const find = String(sp.u || '').trim().toLowerCase();
  const users = all.filter((u) => (!roleTab || roleOf(u) === roleTab) && (!find || `${u.name} ${u.email}`.toLowerCase().includes(find)));
  const countOf = (r) => all.filter((u) => roleOf(u) === r && u.active).length;
  const tabHref = (r) => `/settings?${new URLSearchParams({ ...(r ? { role: r } : {}), ...(find ? { u: find } : {}) })}#users`;
  return (
    <section id="users" className="card flush">
      <div className="card-head"><h2>Users and roles</h2><span className="small muted">{all.filter((u) => u.active).length} active · {all.length} total · add as many accounts per role as you need</span></div>
      <div className="row" style={{ justifyContent: 'space-between', padding: '0 20px' }}>
        <nav className="tabs" aria-label="Filter users by role">
          <Link href={tabHref('')} aria-current={!roleTab ? 'page' : undefined}>All ({all.length})</Link>
          {roleOptions.map(([k, l]) => <Link key={k} href={tabHref(k)} aria-current={roleTab === k ? 'page' : undefined}>{l} ({countOf(k)})</Link>)}
        </nav>
        <form className="row" style={{ gap: 6 }} action="/settings#users">
          {roleTab ? <input type="hidden" name="role" value={roleTab} /> : null}
          <input type="search" name="u" defaultValue={find} placeholder="Search name or email" aria-label="Search users" style={{ width: 220, minHeight: 36 }} />
          <button className="btn sm" type="submit">Search</button>
        </form>
      </div>
      <div className="tablewrap">
        <table className="t" style={{ minWidth: 900 }}>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Actions</th></tr></thead>
          <tbody>
            {!users.length ? <tr><td colSpan={6} className="empty">No users match.</td></tr> : null}
            {users.map((u) => (
              <tr key={u.id} style={u.active ? undefined : { opacity: 0.55 }}>
                <td className="strong">{u.name}{u.id === me.id ? <span className="tiny muted"> (you)</span> : null}</td>
                <td className="small">{u.email}</td>
                <td>
                  <form id={`role-${u.id}`} action={updateUser}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="op" value="role" /></form>
                  <ColSelect form={`role-${u.id}`} name="role" value={roleOf(u)} label={`Role for ${u.name}`} options={roleOptions} />
                </td>
                <td><Pill tone={u.active ? 'green' : 'gray'}>{u.active ? 'Active' : 'Deactivated'}</Pill></td>
                <td className="tiny muted" style={{ whiteSpace: 'nowrap' }}>{u.last_login ? fmtDate(u.last_login) : 'Never'}</td>
                <td>
                  <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <details className="pop">
                      <summary className="btn sm">Reset password</summary>
                      <form action={updateUser} className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'nowrap' }}>
                        <input type="hidden" name="id" value={u.id} /><input type="hidden" name="op" value="password" />
                        <input name="password" type="text" minLength={8} required placeholder="New password (8+)" aria-label={`New password for ${u.name}`} style={{ minWidth: 160 }} />
                        <button className="btn sm primary" type="submit">Set</button>
                      </form>
                    </details>
                    {u.id !== me.id ? (
                      <form action={updateUser}>
                        <input type="hidden" name="id" value={u.id} /><input type="hidden" name="op" value={u.active ? 'deactivate' : 'activate'} />
                        {u.active ? <ConfirmButton className="btn sm" message={`Deactivate ${u.name}? They won't be able to sign in. Their work stays in the app.`}>Deactivate</ConfirmButton> : <button className="btn sm" type="submit">Reactivate</button>}
                      </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cols" style={{ padding: 20, gap: 20 }}>
        <div className="col-main stack" style={{ gap: 20 }}>
        <form id="add-user" action={addUser} className="stack">
          <h3>Add a team member</h3>
          <div className="grid">
            <label className="field">Name<input name="name" required /></label>
            <label className="field">Email<input name="email" type="email" required /></label>
            <label className="field">Starting password (8+ characters)<input name="password" type="text" required minLength={8} /></label>
            <label className="field">Role
              <select name="role" defaultValue="hr">{roleOptions.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
          </div>
          <div><button className="btn primary" type="submit">Add user</button></div>
          <p className="tiny muted">They sign in at {appUrl('/login')} and can change their password under My account.</p>
        </form>
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}><BulkAddUsers roles={roleOptions} /></div>
        </div>
        <div className="col-side stack">
          <h3>Roles</h3>
          {Object.entries(ROLES).map(([k, r]) => <div key={k} className="small"><RolePill role={k} /> <span className="muted">{r.about}</span></div>)}
        </div>
      </div>
      <details style={{ padding: '0 20px 20px' }}>
        <summary className="small strong" style={{ cursor: 'pointer', color: 'var(--accent)' }}>What each role can do</summary>
        <div className="tablewrap" style={{ marginTop: 10 }}>
          <table className="t">
            <thead><tr><th>Permission</th>{Object.values(ROLES).map((r) => <th key={r.label} style={{ textAlign: 'center' }}>{r.label}</th>)}</tr></thead>
            <tbody>
              {Object.entries(PERMISSIONS).map(([k, p]) => (
                <tr key={k}><td className="small">{p.label}</td>{Object.keys(ROLES).map((r) => <td key={r} style={{ textAlign: 'center' }}>{p.roles.includes(r) ? '✓' : <span className="muted">—</span>}</td>)}</tr>
              ))}
              <tr><td className="small">Pipeline stages they can move candidates to</td><td style={{ textAlign: 'center' }} className="small">All</td><td style={{ textAlign: 'center' }} className="small">All</td><td style={{ textAlign: 'center' }} className="small">Pending, Shortlisted, Screening, Rejected</td></tr>
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function MyAccount({ me, msg }) {
  const mine = Object.values(PERMISSIONS).filter((p) => p.roles.includes(roleOf(me)));
  return (
    <>
      <Header title="My account" sub={`${me.name} · ${me.email}`} />
      <Flash msg={msg} />
      <div className="cols">
        <section className="col-main card">
          <h2>Your role: <RolePill role={roleOf(me)} /></h2>
          <p className="small muted">{ROLES[roleOf(me)].about}</p>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>{mine.map((p) => <li key={p.label}>{p.label}</li>)}</ul>
          <p className="tiny muted">Need more access? Ask an admin to change your role.</p>
        </section>
        <aside className="col-side">
          <form action={changePassword} className="card">
            <h2>Change my password</h2>
            <label className="field">Current password<input name="current" type="password" required /></label>
            <label className="field">New password<input name="next" type="password" required minLength={8} /></label>
            <button className="btn" type="submit">Change password</button>
          </form>
        </aside>
      </div>
    </>
  );
}
