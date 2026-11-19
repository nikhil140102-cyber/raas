import { NextResponse } from 'next/server';
import { q, one } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { aiEnabled } from '@/lib/ai';
import { scoreAgainstJob } from '@/lib/ingest';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Scores resumes in the database against one job, a small batch per request
 * (so it never times out). The browser keeps calling until done = true.
 * Body: { jobId, after: lastCandidateId, force: re-score people already scored }
 */
export async function POST(req) {
  if (!(await currentUser())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { jobId, after = 0, force = false } = await req.json();
  const job = await one('SELECT * FROM jobs WHERE id = $1', [Number(jobId)]);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  const limit = aiEnabled() ? 6 : 150;
  const filter = `c.id > $2 AND ($3::boolean OR NOT EXISTS (SELECT 1 FROM candidate_scores s WHERE s.job_id = $1 AND s.candidate_id = c.id))`;
  const remaining = (await one(`SELECT count(*)::int AS n FROM candidates c WHERE ${filter}`, [job.id, Number(after), !!force])).n;
  const batch = await q(`SELECT * FROM candidates c WHERE ${filter} ORDER BY c.id LIMIT ${limit}`, [job.id, Number(after), !!force]);
  let added = 0;
  for (const cand of batch) {
    const r = await scoreAgainstJob(job, cand);
    if (r.added) added++;
  }
  return NextResponse.json({
    processed: batch.length,
    added,
    remaining,
    next: batch.length ? batch[batch.length - 1].id : Number(after),
    done: batch.length < limit,
  });
}
