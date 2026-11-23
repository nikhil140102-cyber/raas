import { NextResponse } from 'next/server';
import { importUser } from '@/lib/importAuth';
import { extractApplicants } from '@/lib/importer';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Finds applicants in text copied from a portal page or email. Nothing is saved yet. */
export async function POST(req) {
  const { error } = await importUser();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  if (!String(body.text || '').trim()) return NextResponse.json({ error: 'Paste some text first.' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await extractApplicants(body.text, { source: String(body.source || '').slice(0, 40) })) });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Could not read the text.' }, { status: 500 });
  }
}
