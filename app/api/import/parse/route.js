import { NextResponse } from 'next/server';
import { importUser } from '@/lib/importAuth';
import { readSheet, guessMapping, guessSource } from '@/lib/importer';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Reads an exported applicant sheet (CSV / Excel) and guesses the columns. Nothing is saved yet. */
export async function POST(req) {
  const { error } = await importUser();
  if (error) return error;
  const fd = await req.formData();
  const file = fd.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return NextResponse.json({ error: 'No file received.' }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'File is over 4 MB. Export fewer rows (e.g. a shorter date range) or save as CSV.' }, { status: 413 });
  try {
    const rows = await readSheet(Buffer.from(await file.arrayBuffer()), file.name);
    if (!rows.length) return NextResponse.json({ error: 'The file has no rows.' }, { status: 422 });
    const { headerIdx, headers, mapping } = guessMapping(rows);
    const data = rows.slice(headerIdx + 1).filter((r) => r.some(Boolean));
    if (data.length > 5000) return NextResponse.json({ error: `The file has ${data.length} rows; the limit is 5,000 per import. Split it or use a shorter date range.` }, { status: 422 });
    return NextResponse.json({ ok: true, headers, rows: data, mapping, source: guessSource(headers, file.name) });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Could not read this file.' }, { status: 422 });
  }
}
