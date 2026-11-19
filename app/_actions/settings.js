'use server';
import { redirect } from 'next/navigation';
import { q, one } from '@/lib/db';
import { requireUser, hashPassword, checkPassword } from '@/lib/auth';

export async function addUser(formData) {
  await requireUser();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  if (!email || password.length < 8) redirect('/settings?msg=' + encodeURIComponent('Email and a password of 8+ characters are required.'));
  await q('INSERT INTO users (email, name, password_hash) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING', [email, String(formData.get('name') || 'Recruiter'), hashPassword(password)]);
  redirect('/settings?msg=' + encodeURIComponent(`User ${email} added.`));
}

export async function loadSample() {
  await requireUser();
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
