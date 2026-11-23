import { logImportRun } from '@/lib/importer';
import { json, preflight, inboundGuard } from '@/lib/inbound';

export const runtime = 'nodejs';

/** The Chrome extension reports each batch's totals here for the "Recent imports" list. */
export async function POST(req) {
  const auth = await inboundGuard(req);
  if (auth.res) return auth.res;
  const b = await req.json().catch(() => ({}));
  const n = (v) => Math.max(0, Math.min(100000, Number(v) || 0));
  await logImportRun(auth.user?.name || 'Chrome extension', 'extension', String(b.source || '').slice(0, 60), {
    total: n(b.total), created: n(b.created), merged: n(b.merged), failed: n(b.failed), resumes: n(b.resumes), from: String(b.from || '').slice(0, 10), to: String(b.to || '').slice(0, 10),
  });
  return json({ ok: true });
}
export const OPTIONS = preflight;
