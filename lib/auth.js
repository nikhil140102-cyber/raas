import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { q, one } from './db';
import { SESSION_COOKIE, verifySession } from './session';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function checkPassword(password, stored) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const test = scryptSync(password, salt, 64);
  const real = Buffer.from(hash, 'hex');
  return real.length === test.length && timingSafeEqual(real, test);
}

/** Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD when no users exist. */
export async function ensureAdmin() {
  const row = await one('SELECT count(*)::int AS n FROM users');
  if (row.n > 0) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@avastars.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'changeme123';
  await q('INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)', [email, 'HR Admin', hashPassword(password)]);
}

export async function currentUser() {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return one('SELECT id, email, name, role FROM users WHERE id = $1', [session.uid]);
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}
