import { extractApplicants } from '@/lib/importer';
import { json, preflight, inboundGuard } from '@/lib/inbound';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Finds applicants in text from a portal page (sent by the Chrome extension). Nothing is saved here. */
export async function POST(req) {
  const auth = await inboundGuard(req);
  if (auth.res) return auth.res;
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Send JSON: {"text": "...", "url": "...", "source": "Indeed"}' }, 400); }
  const text = String(body?.text || '');
  if (!text.trim()) return json({ error: 'No page text received.' }, 400);
  try {
    const r = await extractApplicants(text, { url: String(body.url || '').slice(0, 500), source: String(body.source || '').slice(0, 40) });
    return json({ ok: true, ...r });
  } catch (e) {
    console.error(e);
    return json({ error: e.message || 'Could not read the page.' }, 500);
  }
}
export const OPTIONS = preflight;
