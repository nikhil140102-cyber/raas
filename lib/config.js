// App configuration that admins can edit in Settings → Keys & connections.
// Values saved in the app win over Vercel environment variables; secrets are encrypted in the database.
// DATABASE_URL and AUTH_SECRET stay in Vercel only (they are needed before the database can be read).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

export const CONFIG_GROUPS = [
  { id: 'ai', title: 'AI (Claude)', about: 'Resume reading, JD writing, call scoring and post writing.', fields: [
    { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API key', secret: true, placeholder: 'sk-ant-…' },
    { key: 'AI_MODEL', label: 'Model', placeholder: 'claude-haiku-5-5' },
  ] },
  { id: 'app', title: 'Public address', about: 'Used in job links, emails and share links.', fields: [
    { key: 'APP_URL', label: 'App URL', placeholder: 'https://raas-drab.vercel.app' },
  ] },
  { id: 'automation', title: 'Automation keys', about: 'Inbound Candidate API and scheduled jobs.', fields: [
    { key: 'INBOUND_API_KEY', label: 'Inbound API key', secret: true, generate: true },
    { key: 'CRON_SECRET', label: 'Scheduler (cron) secret', secret: true, generate: true },
  ] },
  { id: 'voice', title: 'AI voice calls', about: 'Provider for screening calls. "mock" simulates calls for testing.', fields: [
    { key: 'VOICE_PROVIDER', label: 'Provider', options: ['mock', 'bolna', 'webhook'] },
    { key: 'BOLNA_API_KEY', label: 'Bolna API key', secret: true },
    { key: 'BOLNA_AGENT_ID', label: 'Bolna agent ID' },
    { key: 'BOLNA_FROM_NUMBER', label: 'Calling number', placeholder: '+91…' },
    { key: 'BOLNA_API_URL', label: 'Bolna API URL', placeholder: 'https://api.bolna.ai/call' },
    { key: 'VOICE_DISPATCH_URL', label: 'Webhook provider URL' },
    { key: 'VOICE_WEBHOOK_SECRET', label: 'Call webhook secret', secret: true, generate: true },
  ] },
  { id: 'smtp', title: 'Sending email (SMTP)', about: 'Interview invites, shortlists and reminders.', fields: [
    { key: 'SMTP_HOST', label: 'SMTP host', placeholder: 'smtp.gmail.com' },
    { key: 'SMTP_PORT', label: 'Port', placeholder: '465' },
    { key: 'SMTP_USER', label: 'Username' },
    { key: 'SMTP_PASS', label: 'Password / app password', secret: true },
    { key: 'SMTP_FROM', label: 'From address', placeholder: 'AvaStars <careers@…>' },
  ] },
  { id: 'imap', title: 'Careers inbox (IMAP)', about: 'Imports CVs that arrive by email.', fields: [
    { key: 'IMAP_HOST', label: 'IMAP host', placeholder: 'imap.gmail.com' },
    { key: 'IMAP_PORT', label: 'Port', placeholder: '993' },
    { key: 'IMAP_USER', label: 'Username' },
    { key: 'IMAP_PASS', label: 'Password / app password', secret: true },
  ] },
  { id: 'linkedin', title: 'LinkedIn posting', about: 'One-click posting to LinkedIn.', fields: [
    { key: 'LINKEDIN_CLIENT_ID', label: 'Client ID' },
    { key: 'LINKEDIN_CLIENT_SECRET', label: 'Client secret', secret: true },
    { key: 'LINKEDIN_API_VERSION', label: 'API version', placeholder: '202608' },
  ] },
  { id: 'whatsapp', title: 'WhatsApp messages', about: 'Your WhatsApp provider webhook.', fields: [
    { key: 'WHATSAPP_WEBHOOK_URL', label: 'Webhook URL' },
    { key: 'WHATSAPP_WEBHOOK_TOKEN', label: 'Token', secret: true },
  ] },
];
export const CONFIG_KEYS = CONFIG_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
export const SECRET_KEYS = new Set(CONFIG_GROUPS.flatMap((g) => g.fields.filter((f) => f.secret).map((f) => f.key)));

const g = globalThis;
const TTL = 30000;
if (!g.__avsCfg) g.__avsCfg = { values: {}, at: 0, broken: [] };

/** Current value: saved in the app, else the environment variable. Sync; the cache is refreshed by lib/db on every query. */
export function cfg(key) {
  const v = g.__avsCfg.values[key];
  return v !== undefined && v !== null && v !== '' ? v : process.env[key];
}
export const cfgSource = (key) => (g.__avsCfg.values[key] ? 'app' : process.env[key] ? 'env' : 'none');
export const cfgBroken = () => g.__avsCfg.broken;
export const configStale = () => Date.now() - g.__avsCfg.at > TTL;

const encKey = () => createHash('sha256').update(`avs-config:${process.env.AUTH_SECRET || 'dev-only-secret'}`).digest();
export function encrypt(text) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}
export function decrypt(blob) {
  const [v, iv, tag, data] = String(blob).split(':');
  if (v !== 'v1') throw new Error('bad format');
  const d = createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}

/** Takes the raw stored object ({ KEY: value | encrypted }) and fills the cache. */
export function applyStoredConfig(stored) {
  const values = {}; const broken = [];
  for (const [k, v] of Object.entries(stored || {})) {
    if (!CONFIG_KEYS.includes(k) || v === null || v === '') continue;
    if (SECRET_KEYS.has(k)) {
      try { values[k] = decrypt(v); } catch { broken.push(k); }
    } else values[k] = String(v);
  }
  g.__avsCfg = { values, at: Date.now(), broken };
}

export const mask = (v) => (!v ? '' : v.length <= 8 ? '••••' : `••••${v.slice(-4)}`);
