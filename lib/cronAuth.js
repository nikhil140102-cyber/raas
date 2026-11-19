export function cronAllowed(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const url = new URL(req.url);
  return req.headers.get('authorization') === `Bearer ${secret}` || url.searchParams.get('secret') === secret;
}
