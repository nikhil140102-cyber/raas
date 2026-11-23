import { NextResponse } from 'next/server';
import { importUser } from '@/lib/importAuth';
import { logImportRun } from '@/lib/importer';

export const runtime = 'nodejs';

/** Records an import run's totals for the "Recent imports" list. */
export async function POST(req) {
  const { me, error } = await importUser();
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const n = (v) => Math.max(0, Math.min(100000, Number(v) || 0));
  await logImportRun(me.name, String(b.kind || 'file').slice(0, 20), String(b.source || '').slice(0, 60), {
    total: n(b.total), created: n(b.created), merged: n(b.merged), failed: n(b.failed), resumes: n(b.resumes), from: String(b.from || '').slice(0, 10), to: String(b.to || '').slice(0, 10), file: String(b.file || '').slice(0, 120),
  });
  return NextResponse.json({ ok: true });
}
