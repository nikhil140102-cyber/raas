// Shared by the Inbound API routes (Zapier/Make/n8n, partners and the AvaStars Collector Chrome extension).
// Two kinds of key work: the shared Inbound API key (Settings → Keys & connections) and a personal
// extension key each team member gets from the "Chrome extension" page (stops working if their account is deactivated).
import { NextResponse } from 'next/server';
import { timingSafeEqual, createHash, randomBytes } from 'crypto';
import { cfg } from './config';
import { one, q } from './db';
import { can } from './roles';

// Auth is a Bearer key (never cookies), so allowing any origin is safe and lets the extension call from any site.
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-api-key',
  'Access-Control-Max-Age': '86400',
};

export const json = (data, status = 200) => NextResponse.json(data, { status, headers: CORS });
export const preflight = () => new NextResponse(null, { status: 204, headers: CORS });

const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const given = (req) => (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim() || (req.headers.get('x-api-key') || '').trim();

/** Makes a new personal extension key for a user (the old one stops working). Returns the plain key once. */
export async function issueExtensionKey(userId) {
  const key = `avsx_${userId}_${randomBytes(24).toString('hex')}`;
  await q('UPDATE users SET ext_token_hash = $2, ext_connected_at = now() WHERE id = $1', [userId, sha(key)]);
  return key;
}

function sharedKeyOk(key) {
  const shared = cfg('INBOUND_API_KEY') || '';
  if (shared.length < 16 || !key) return false;
  const a = Buffer.from(key); const b = Buffer.from(shared);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Checks the request's key. Returns { res } (an error response to send back) or { user } (null for the shared key).
 */
export async function inboundGuard(req) {
  const key = given(req);
  const m = key.match(/^avsx_(\d+)_[0-9a-f]{48}$/);
  if (m) {
    const u = await one('SELECT id, name, role, active, ext_token_hash FROM users WHERE id = $1', [Number(m[1])]);
    const h = sha(key);
    if (u && u.active && u.ext_token_hash && u.ext_token_hash.length === h.length && timingSafeEqual(Buffer.from(u.ext_token_hash), Buffer.from(h)) && can(u, 'candidates.edit')) {
      q('UPDATE users SET ext_last_used = now() WHERE id = $1', [u.id]).catch(() => {});
      return { user: { id: u.id, name: u.name } };
    }
    return { res: json({ error: 'This extension key is no longer valid. Open AvaStars → Chrome extension and click Connect again.' }, 401) };
  }
  if (!cfg('INBOUND_API_KEY')) return { res: json({ error: 'Not connected. Open AvaStars → Chrome extension and click Connect.' }, 401) };
  if (!sharedKeyOk(key)) return { res: json({ error: 'Invalid API key. Open AvaStars → Chrome extension and click Connect.' }, 401) };
  return { user: null };
}
