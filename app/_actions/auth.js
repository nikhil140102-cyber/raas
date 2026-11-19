'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { one } from '@/lib/db';
import { checkPassword, ensureAdmin } from '@/lib/auth';
import { SESSION_COOKIE, signSession, secretMissing } from '@/lib/session';

export async function login(prev, formData) {
  if (secretMissing()) return { error: 'AUTH_SECRET is not set. Add AUTH_SECRET=<any long random text> to .env.local and restart the app.' };
  await ensureAdmin();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const user = await one('SELECT * FROM users WHERE email = $1', [email]);
  if (!user || !checkPassword(password, user.password_hash)) return { error: 'Email or password is wrong.' };
  const tokenValue = await signSession({ uid: user.id, exp: Date.now() + 14 * 864e5 });
  (await cookies()).set(SESSION_COOKIE, tokenValue, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 14 * 86400 });
  redirect('/');
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
