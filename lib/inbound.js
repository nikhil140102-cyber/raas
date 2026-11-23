// Shared by the Inbound API routes (Zapier/Make/n8n, partners and the AvaStars Collector Chrome extension).
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { cfg } from './config';

// Auth is a Bearer key (never cookies), so allowing any origin is safe and lets the extension call from any site.
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-api-key',
  'Access-Control-Max-Age': '86400',
};

export const json = (data, status = 200) => NextResponse.json(data, { status, headers: CORS });
export const preflight = () => new NextResponse(null, { status: 204, headers: CORS });

export function inboundAuthorized(req) {
  const key = cfg('INBOUND_API_KEY') || '';
  if (key.length < 16) return false;
  const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.headers.get('x-api-key') || '';
  const a = Buffer.from(given); const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Returns an error response when the key is missing or wrong, otherwise null. */
export function inboundGuard(req) {
  if (!cfg('INBOUND_API_KEY')) return json({ error: 'The Inbound API key is not set. An admin can add it in Settings → Keys & connections.' }, 503);
  if (!inboundAuthorized(req)) return json({ error: 'Invalid API key.' }, 401);
  return null;
}
