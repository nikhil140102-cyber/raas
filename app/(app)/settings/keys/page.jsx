import Link from 'next/link';
import { q, reloadConfig } from '@/lib/db';
import { requirePagePerm } from '@/lib/auth';
import { Header, Flash, Pill } from '@/components/ui';
import { CONFIG_GROUPS, cfg, cfgSource, cfgBroken, mask } from '@/lib/config';
import { fmtDate } from '@/lib/util';
import { saveConfig } from '../../../_actions/config';
import ShowKey from './ShowKey';

export const metadata = { title: 'Keys & connections — AvaStars Hire' };
const SRC = { app: ['Saved in app', 'green'], env: ['From Vercel', 'blue'], none: ['Not set', 'gray'] };

export default async function KeysPage({ searchParams }) {
  const sp = await searchParams;
  await requirePagePerm('secrets.manage', '/settings');
  await reloadConfig();
  const broken = cfgBroken();
  const audit = await q('SELECT user_name, keys, at FROM config_audit ORDER BY id DESC LIMIT 8');
  return (
    <>
      <Header title="Keys & connections" sub="Admins can add or change API keys here without touching Vercel. Values saved here win over Vercel's environment variables." crumbs={<><Link href="/settings">Settings</Link> / Keys & connections</>} />
      <Flash msg={sp.msg} />
      {broken.length ? <div className="notice warn">These saved secrets can&apos;t be read because AUTH_SECRET changed: {broken.join(', ')}. Enter them again.</div> : null}
      <form action={saveConfig} className="stack" style={{ gap: 18 }}>
        {CONFIG_GROUPS.map((g) => (
          <section key={g.id} className="card">
            <div className="titles"><h2>{g.title}</h2><p className="small muted">{g.about}</p></div>
            <div className="keys-grid">
              {g.fields.map((f) => {
                const src = cfgSource(f.key);
                const cur = cfg(f.key) || '';
                return (
                  <div key={f.key} className="field">
                    <span className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                      <span className="strong">{f.label}</span>
                      <Pill tone={SRC[src][1]}>{SRC[src][0]}</Pill>
                    </span>
                    {f.options ? (
                      <select name={f.key} defaultValue={cur || f.options[0]} aria-label={f.label}>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
                    ) : f.secret ? (
                      <input name={f.key} type="password" autoComplete="new-password" placeholder={cur ? `${mask(cur)} (leave blank to keep)` : f.placeholder || 'Paste the key'} aria-label={f.label} />
                    ) : (
                      <input name={f.key} defaultValue={src === 'app' ? cur : ''} placeholder={src === 'env' ? `${cur} (from Vercel)` : f.placeholder || ''} aria-label={f.label} />
                    )}
                    {f.generate && cur ? <ShowKey value={cur} label={f.label} /> : null}
                    <span className="row tiny" style={{ gap: 12 }}>
                      <code className="muted">{f.key}</code>
                      {f.generate ? <label className="check sm"><input type="checkbox" name={`gen_${f.key}`} value="1" /> Generate a new one</label> : null}
                      {src === 'app' ? <label className="check sm"><input type="checkbox" name={`clear_${f.key}`} value="1" /> Clear (use Vercel value)</label> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        <div className="row" style={{ gap: 10 }}>
          <button className="btn primary" type="submit">Save changes</button>
          <span className="small muted">Secrets are encrypted in the database. Keys the app generates (inbound API, cron, webhook) can be shown and copied by admins; other keys are never shown in full again. DATABASE_URL and AUTH_SECRET stay in Vercel.</span>
        </div>
      </form>
      <section className="card">
        <h2>Change history</h2>
        {!audit.length ? <p className="small muted">No changes yet.</p> : (
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            {audit.map((a, i) => <li key={i}>{fmtDate(a.at)} · {a.user_name}: {(a.keys || []).join(', ')}</li>)}
          </ul>
        )}
      </section>
    </>
  );
}
