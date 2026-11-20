'use server';
import { redirect } from 'next/navigation';
import { q, one } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { randomInt } from 'crypto';
import { requireUser, requirePerm, hashPassword, checkPassword } from '@/lib/auth';
import { ROLES, roleLabel } from '@/lib/roles';

const back = (msg) => redirect('/settings?msg=' + encodeURIComponent(msg) + '#users');

export async function addUser(formData) {
  await requirePerm('users.manage');
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const role = ROLES[formData.get('role')] ? String(formData.get('role')) : 'intern';
  const name = String(formData.get('name') || '').trim() || 'Recruiter';
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) back('A valid email and a password of 8+ characters are required.');
  const added = await one('INSERT INTO users (email, name, password_hash, role) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING RETURNING id', [email, name, hashPassword(password), role]);
  if (!added) back(`${email} already has an account.`);
  back(`${name} (${email}) added as ${roleLabel(role)}. Share the login link and their starting password with them.`);
}

/** Change role, rename, deactivate/reactivate or reset password. The last active admin is protected. */
export async function updateUser(formData) {
  const me = await requirePerm('users.manage');
  const id = Number(formData.get('id'));
  const op = String(formData.get('op') || '');
  const u = await one('SELECT * FROM users WHERE id = $1', [id]);
  if (!u) back('User not found.');
  const otherAdmins = await one("SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND active AND id <> $1", [id]);
  const losesAdmin = (op === 'role' && u.role === 'admin' && formData.get('role') !== 'admin') || (op === 'deactivate' && u.role === 'admin');
  if (losesAdmin && !otherAdmins.n) back('There must always be at least one active admin. Make someone else an admin first.');
  if (op === 'deactivate' && u.id === me.id) back("You can't deactivate your own account.");
  if (op === 'role') {
    const role = String(formData.get('role'));
    if (!ROLES[role]) back('Unknown role.');
    await q('UPDATE users SET role = $2 WHERE id = $1', [id, role]);
    revalidatePath('/settings');
    back(`${u.name} is now ${roleLabel(role)}.`);
  }
  if (op === 'deactivate' || op === 'activate') {
    await q('UPDATE users SET active = $2 WHERE id = $1', [id, op === 'activate']);
    back(op === 'activate' ? `${u.name} can sign in again.` : `${u.name} is deactivated and can no longer sign in. Their work stays in the app.`);
  }
  if (op === 'password') {
    const pw = String(formData.get('password') || '');
    if (pw.length < 8) back('The new password must be at least 8 characters.');
    await q('UPDATE users SET password_hash = $2 WHERE id = $1', [id, hashPassword(pw)]);
    back(`Password reset for ${u.name}. Send them the new password.`);
  }
  if (op === 'name') {
    const name = String(formData.get('name') || '').trim();
    if (name) await q('UPDATE users SET name = $2 WHERE id = $1', [id, name]);
    back('Name updated.');
  }
  back('Nothing changed.');
}

export async function loadSample() {
  await requirePerm('settings.manage');
  const { loadSampleData } = await import('@/lib/sample');
  let msg;
  try { const r = await loadSampleData(); msg = `Sample data loaded: ${r.jobs} jobs and ${r.candidates} candidates.`; } catch (e) { msg = e.message; }
  redirect('/?sample=1&msg=' + encodeURIComponent(msg));
}

export async function changePassword(formData) {
  const user = await requireUser();
  const row = await one('SELECT password_hash FROM users WHERE id = $1', [user.id]);
  if (!checkPassword(String(formData.get('current') || ''), row.password_hash)) redirect('/settings?msg=' + encodeURIComponent('Current password is wrong.'));
  const next = String(formData.get('next') || '');
  if (next.length < 8) redirect('/settings?msg=' + encodeURIComponent('New password must be at least 8 characters.'));
  await q('UPDATE users SET password_hash = $2 WHERE id = $1', [user.id, hashPassword(next)]);
  redirect('/settings?msg=' + encodeURIComponent('Password changed.'));
}

/** Adds many users at once from lines like "Name, email, role". Returns generated passwords to show once. */
export async function bulkAddUsers(prev, formData) {
  await requirePerm('users.manage');
  const fallback = ROLES[formData.get('role')] ? String(formData.get('role')) : 'intern';
  const lines = String(formData.get('lines') || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: 'Add at least one line: Name, email, role' };
  if (lines.length > 100) return { error: 'Add up to 100 users at a time.' };
  const alias = { admin: 'admin', hr: 'hr', recruiter: 'hr', 'hr / recruiter': 'hr', intern: 'intern', trainee: 'intern' };
  const created = []; const skipped = [];
  for (const line of lines) {
    const parts = line.split(/[,;\t]/).map((x) => x.trim()).filter(Boolean);
    const email = (parts.find((x) => x.includes('@')) || '').toLowerCase();
    const name = parts.find((x) => !x.includes('@') && !alias[x.toLowerCase()]) || email.split('@')[0];
    const role = alias[(parts.find((x) => alias[x.toLowerCase()]) || '').toLowerCase()] || fallback;
    if (!/^\S+@\S+\.\S+$/.test(email)) { skipped.push({ line, why: 'no valid email' }); continue; }
    const password = generatePassword();
    const row = await one('INSERT INTO users (email, name, password_hash, role) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING RETURNING id', [email, name, hashPassword(password), role]);
    if (!row) { skipped.push({ line, why: 'already has an account' }); continue; }
    created.push({ name, email, role: roleLabel(role), password });
  }
  revalidatePath('/settings');
  return { created, skipped };
}

function generatePassword() {
  const words = ['Ava', 'Star', 'Hire', 'Team', 'Mint', 'Blue', 'Nova', 'Peak'];
  return `${words[randomInt(words.length)]}${words[randomInt(words.length)]}${randomInt(1000, 9999)}`;
}
