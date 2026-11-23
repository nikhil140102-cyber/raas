import { cfg } from './config';
export function cronAllowed(req) {
  const secret = cfg('CRON_SECRET');
  if (!secret) return process.env.NODE_ENV !== 'production';
  const url = new URL(req.url);
  return req.headers.get('authorization') === `Bearer ${secret}` || url.searchParams.get('secret') === secret;
}
