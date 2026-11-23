'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';
import { q, one, j, reloadConfig } from '@/lib/db';
import { requirePerm } from '@/lib/auth';
import { CONFIG_KEYS, SECRET_KEYS, CONFIG_GROUPS, encrypt } from '@/lib/config';

const OPTION_DEFAULT = Object.fromEntries(CONFIG_GROUPS.flatMap((g) => g.fields.filter((f) => f.options).map((f) => [f.key, f.options[0]])));

/** Saves Settings → Keys & connections. Blank secret fields keep the saved value; "Clear" removes it (falls back to Vercel). */
export async function saveConfig(formData) {
  const me = await requirePerm('secrets.manage');
  const row = await one("SELECT value FROM settings WHERE key = 'app_config'");
  const stored = { ...(row?.value || {}) };
  const changed = [];
  for (const key of CONFIG_KEYS) {
    if (!formData.has(key) && !formData.has(`clear_${key}`)) continue;
    if (formData.get(`clear_${key}`)) {
      if (key in stored) { delete stored[key]; changed.push(`${key} (cleared)`); }
      continue;
    }
    let v = String(formData.get(key) ?? '').trim();
    if (formData.get(`gen_${key}`)) v = randomBytes(24).toString('hex');
    if (SECRET_KEYS.has(key)) {
      if (!v) continue; // blank = keep what is saved
      stored[key] = encrypt(v); changed.push(key);
    } else if (!(key in stored) && v === (process.env[key] || OPTION_DEFAULT[key] || '')) {
      continue; // unchanged from the Vercel value or the default: keep using it
    } else if ((stored[key] || '') !== v) {
      if (v) stored[key] = v; else delete stored[key];
      changed.push(key);
    }
  }
  if (stored.APP_URL && !/^https?:\/\/[^\s@]+$/i.test(stored.APP_URL)) redirect('/settings/keys?msg=' + encodeURIComponent('App URL must start with https:// and be a website address. Nothing was saved.'));
  await q(`INSERT INTO settings (key, value) VALUES ('app_config', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [j(stored)]);
  if (changed.length) await q('INSERT INTO config_audit (user_id, user_name, keys) VALUES ($1,$2,$3::jsonb)', [me.id, me.name, j(changed)]);
  await reloadConfig();
  revalidatePath('/settings');
  redirect('/settings/keys?msg=' + encodeURIComponent(changed.length ? `Saved: ${changed.join(', ')}. Changes apply within about 30 seconds everywhere.` : 'Nothing changed.'));
}
