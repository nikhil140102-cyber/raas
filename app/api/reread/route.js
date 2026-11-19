import { NextResponse } from 'next/server';
import { q, one, j } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { aiEnabled, extractResume } from '@/lib/ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Re-reads stored resume text and fills in details that are still empty
 * (title, company, location, experience, CTC, expected CTC, notice period, skills).
 * Never overwrites values HR has already entered. Body: { after: lastCandidateId }
 */
export async function POST(req) {
  if (!(await currentUser())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { after = 0 } = await req.json();
  const limit = aiEnabled() ? 5 : 200;
  const remaining = (await one('SELECT count(*)::int AS n FROM candidates WHERE id > $1 AND resume_text IS NOT NULL', [Number(after)])).n;
  const batch = await q(`SELECT * FROM candidates WHERE id > $1 AND resume_text IS NOT NULL ORDER BY id LIMIT ${limit}`, [Number(after)]);
  let filled = 0;
  for (const c of batch) {
    const p = await extractResume(c.resume_text);
    const skills = [...new Set([...(c.skills || []), ...(p.skills || [])])];
    const row = await one(
      `UPDATE candidates SET
         name = CASE WHEN name = 'Unknown' AND $2::text IS NOT NULL THEN $2 ELSE name END,
         current_title = COALESCE(current_title, $3), current_company = COALESCE(current_company, $4), location = COALESCE(location, $5),
         total_exp = COALESCE(total_exp, $6), cctc = COALESCE(cctc, $7), ectc = COALESCE(ectc, $8), notice_days = COALESCE(notice_days, $9),
         skills = $10::jsonb, summary = COALESCE(summary, $11),
         experience = CASE WHEN experience = '[]'::jsonb THEN $12::jsonb ELSE experience END,
         education = CASE WHEN education = '[]'::jsonb THEN $13::jsonb ELSE education END,
         updated_at = now()
       WHERE id = $1
       RETURNING (current_title IS DISTINCT FROM $14 OR cctc IS DISTINCT FROM $15 OR notice_days IS DISTINCT FROM $16 OR location IS DISTINCT FROM $17) AS changed`,
      [c.id, p.name && p.name !== 'Unknown' ? p.name : null, p.current_title, p.current_company, p.location, p.total_exp, p.cctc, p.ectc, p.notice_days,
        j(skills), p.summary, j(p.experience || []), j(p.education || []), c.current_title, c.cctc, c.notice_days, c.location],
    );
    if (row?.changed) filled++;
  }
  return NextResponse.json({ processed: batch.length, filled, remaining, next: batch.length ? batch[batch.length - 1].id : Number(after), done: batch.length < limit });
}
