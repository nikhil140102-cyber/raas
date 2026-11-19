import { q } from '@/lib/db';
import { Header, Pill, Flash } from '@/components/ui';
import { fmtDate, appUrl } from '@/lib/util';
import { callSettings } from '@/lib/screening';
import { providerName } from '@/lib/voice';
import { aiEnabled } from '@/lib/ai';
import { saveCallSettings } from '../../_actions/screening';
import { addUser, changePassword, loadSample } from '../../_actions/settings';

export const metadata = { title: 'Settings — AvaStars Hire' };

export default async function SettingsPage({ searchParams }) {
  const sp = await searchParams;
  const st = await callSettings();
  const users = await q('SELECT email, name, created_at FROM users ORDER BY id');
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
          <section className="card">
            <h2>Team</h2>
            {users.map((u) => <div key={u.email} className="small"><span className="strong">{u.name}</span> · {u.email}</div>)}
            <form action={addUser} className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <label className="field">Name<input name="name" /></label>
              <label className="field">Email<input name="email" type="email" required /></label>
              <label className="field">Password (8+ characters)<input name="password" type="password" required minLength={8} /></label>
              <button className="btn" type="submit">Add user</button>
            </form>
          </section>
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
