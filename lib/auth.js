import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { q, one } from './db';
import { SESSION_COOKIE, verifySession } from './session';
import { can, AccessError, isClient } from './roles';

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
  return one('SELECT id, email, name, role, client_id, ext_connected_at FROM users WHERE id = $1 AND active', [session.uid]);
}

/** Signed-in staff member (not a client login), or null. For API routes. */
export async function currentStaff() {
  const u = await currentUser();
  return u && !isClient(u) ? u : null;
}

/** Client portal: signed in as a client login. Staff are sent to the main app. */
export async function requireClientUser() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!isClient(user)) redirect('/');
  if (!user.client_id) redirect('/login?msg=' + encodeURIComponent('Your login is not linked to a company yet. Ask your AvaStars contact.'));
  return user;
}

/** For server actions: signed in AND allowed. Throws a readable error otherwise. */
export async function requirePerm(perm) {
  const user = await requireUser();
  if (!can(user, perm)) throw new AccessError(user, perm);
  return user;
}

/** For pages: sends people without access back with a message instead of an error screen. */
export async function requirePagePerm(perm, back = '/') {
  const user = await requireUser();
  if (!can(user, perm)) redirect(`${back}${back.includes('?') ? '&' : '?'}msg=${encodeURIComponent(new AccessError(user, perm).message)}`);
  return user;
}

/** Staff only: client logins are sent to the client portal. Pass { allowClient: true } for shared actions. */
export async function requireUser({ allowClient = false } = {}) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (isClient(user) && !allowClient) redirect('/portal');
  return user;
}
