// Resume intake: read the file, extract a profile, merge duplicates, attach to a job and score it.
import { q, one, j, logActivity } from './db';
import { extractResume, scoreMatch, normalizePhone, readDocumentWithAI, imageMime } from './ai';

/** Postgres cannot store the NUL character (some PDFs contain it), so strip it and other control characters. */
export const cleanText = (t) => String(t || '').replace(/\u0000/g, '').replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');

export async function extractText(buffer, filename, mime) {
  return cleanText(await readText(buffer, filename, mime));
}

async function readText(buffer, filename, mime) {
  const name = (filename || '').toLowerCase();
  if (name.endsWith('.pdf') || mime === 'application/pdf') {
    const { extractText: pdfText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await pdfText(pdf, { mergePages: true });
    return text;
  }
  if (name.endsWith('.docx') || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = (await import('mammoth')).default;
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return value;
  }
  if (name.endsWith('.txt')) return Buffer.from(buffer).toString('utf8');
  if (imageMime(name) || /^image\/(jpeg|png|webp)$/.test(mime || '')) return readDocumentWithAI(buffer, filename, mime);
  throw new Error('Only PDF, Word (.docx), .txt and image (JPG/PNG) files are supported. Save old .doc files as .docx.');
}

export async function findDuplicate(email, phone) {
  if (email) {
    const c = await one('SELECT * FROM candidates WHERE lower(email) = lower($1) LIMIT 1', [email]);
    if (c) return c;
  }
  if (phone) {
    const c = await one('SELECT * FROM candidates WHERE phone = $1 LIMIT 1', [phone]);
    if (c) return c;
  }
  return null;
}

/**
 * @returns {{status:'created'|'merged'|'failed', candidateId?:number, applicationId?:number, score?:number, error?:string, name?:string}}
 */
export async function ingestResume({ buffer, filename, mime, source = 'Bulk upload', jobId = null, overrides = {} }) {
  let text;
  try {
    text = await extractText(buffer, filename, mime);
  } catch (e) {
    await q('INSERT INTO files (filename, mime, size, data, source, parse_error) VALUES ($1,$2,$3,$4,$5,$6)', [filename, mime, buffer.length, Buffer.from(buffer), source, e.message]);
    return { status: 'failed', error: e.message, name: filename };
  }
  let scanError = '';
  const isPdf = (filename || '').toLowerCase().endsWith('.pdf') || mime === 'application/pdf';
  if (isPdf && (!text || text.replace(/\s/g, '').length < 80)) {
    // Scanned PDF or a design-tool export saved as pictures: let AI read it.
    try { text = cleanText(await readDocumentWithAI(buffer, filename, mime)); } catch (e) { text = ''; scanError = e.message; }
  }
  if (!text || text.replace(/\s/g, '').length < 80) {
    const msg = scanError || 'No readable text — probably a scanned image. Review manually.';
    await q('INSERT INTO files (filename, mime, size, data, source, parse_error) VALUES ($1,$2,$3,$4,$5,$6)', [filename, mime, buffer.length, Buffer.from(buffer), source, msg]);
    return { status: 'failed', error: msg, name: filename };
  }

  const p = { ...(await extractResume(text)), ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== null && v !== undefined && v !== '')) };
  p.phone = normalizePhone(p.phone);
  const dup = await findDuplicate(p.email, p.phone);

  let candidateId;
  let status;
  if (dup) {
    status = 'merged';
    candidateId = dup.id;
    await q(
      `UPDATE candidates SET
        name = COALESCE(NULLIF($2,'Unknown'), name), email = COALESCE($3, email), phone = COALESCE($4, phone),
        current_title = COALESCE($5, current_title), current_company = COALESCE($6, current_company), location = COALESCE($7, location),
        total_exp = COALESCE($8, total_exp), cctc = COALESCE($9, cctc), ectc = COALESCE($10, ectc), notice_days = COALESCE($11, notice_days),
        skills = $12::jsonb, summary = COALESCE($13, summary), experience = $14::jsonb, education = $15::jsonb, resume_text = $16, updated_at = now()
       WHERE id = $1`,
      [candidateId, p.name, p.email, p.phone, p.current_title, p.current_company, p.location, p.total_exp, p.cctc, p.ectc, p.notice_days,
        j([...new Set([...(dup.skills || []), ...(p.skills || [])])]), p.summary, j(p.experience?.length ? p.experience : dup.experience), j(p.education?.length ? p.education : dup.education), text],
    );
    await logActivity(candidateId, null, `New resume received (${source}) and merged with the existing profile.`);
  } else {
    status = 'created';
    const row = await one(
      `INSERT INTO candidates (name, email, phone, current_title, current_company, location, total_exp, cctc, ectc, notice_days, skills, summary, experience, education, resume_text, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb,$14::jsonb,$15,$16) RETURNING id`,
      [p.name || 'Unknown', p.email, p.phone, p.current_title, p.current_company, p.location, p.total_exp, p.cctc, p.ectc, p.notice_days,
        j(p.skills || []), p.summary, j(p.experience || []), j(p.education || []), text, source],
    );
    candidateId = row.id;
    await logActivity(candidateId, null, `Resume received (${source}) and read automatically.`);
  }
  await q('INSERT INTO files (candidate_id, filename, mime, size, data, source) VALUES ($1,$2,$3,$4,$5,$6)', [candidateId, filename, mime, buffer.length, Buffer.from(buffer), source]);

  let applicationId; let score; let bestJob = null;
  if (jobId) {
    const r = await addToJob(Number(jobId), candidateId, source);
    applicationId = r.applicationId; score = r.score;
  } else {
    // No job picked: score against every open job so the match % shows straight away.
    const best = await matchToOpenJobs(candidateId, source);
    if (best) { score = best.score; bestJob = best.title; }
  }
  return { status, candidateId, applicationId, score, bestJob, name: p.name };
}

async function saveScore(jobId, candidateId, score, detail) {
  await q(
    `INSERT INTO candidate_scores (candidate_id, job_id, score, detail, scored_at) VALUES ($1,$2,$3,$4::jsonb,now())
     ON CONFLICT (candidate_id, job_id) DO UPDATE SET score = EXCLUDED.score, detail = EXCLUDED.detail, scored_at = now()`,
    [candidateId, jobId, score, j(detail)],
  );
}

/**
 * Creates (or re-scores) an application and applies the job's auto-filter.
 * Used when HR deliberately puts a candidate on a job (tagged upload, careers apply, "add to job").
 */
export async function addToJob(jobId, candidateId, source, pre = null) {
  const job = await one('SELECT * FROM jobs WHERE id = $1', [jobId]);
  const cand = await one('SELECT * FROM candidates WHERE id = $1', [candidateId]);
  if (!job || !cand) throw new Error('Job or candidate not found');
  const { score, detail } = pre || (await scoreMatch(job, cand));
  await saveScore(jobId, candidateId, score, detail);
  const low = score < (job.min_score ?? 60);
  const existing = await one('SELECT id, stage, reject_reason FROM applications WHERE job_id = $1 AND candidate_id = $2', [jobId, candidateId]);
  let applicationId;
  if (existing) {
    applicationId = existing.id;
    await q('UPDATE applications SET match_score = $2, match_detail = $3::jsonb, updated_at = now() WHERE id = $1', [applicationId, score, j(detail)]);
    // Only auto-sorted candidates move; anything HR has moved by hand stays where it is.
    if (existing.stage === 'pending' && low) {
      await q(`UPDATE applications SET stage = 'rejected', reject_reason = $2 WHERE id = $1`, [applicationId, `Low match (${score}%)`]);
    } else if (existing.stage === 'rejected' && !low) {
      await q(`UPDATE applications SET stage = 'pending', reject_reason = NULL WHERE id = $1 AND reject_reason LIKE 'Low match%'`, [applicationId]);
    }
  } else {
    const row = await one(
      `INSERT INTO applications (job_id, candidate_id, stage, source, match_score, match_detail, reject_reason)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING id`,
      [jobId, candidateId, low ? 'rejected' : 'pending', source, score, j(detail), low ? `Low match (${score}%)` : null],
    );
    applicationId = row.id;
    await logActivity(candidateId, applicationId, `Matched to ${job.title}: ${score}%${low ? ' — below the cut-off, moved to Rejected.' : '.'}`);
  }
  return { applicationId, score };
}

/**
 * Scores one candidate against one job. Always saves the match %, and adds the
 * candidate to the job's pipeline only when the score reaches the job's cut-off.
 */
export async function scoreAgainstJob(job, cand, source = 'Database match') {
  const { score, detail } = await scoreMatch(job, cand);
  await saveScore(job.id, cand.id, score, detail);
  let added = false;
  const exists = await one('SELECT id FROM applications WHERE job_id = $1 AND candidate_id = $2', [job.id, cand.id]);
  if (exists) {
    await addToJob(job.id, cand.id, source, { score, detail }); // updates the score and re-sorts if needed
  } else if (score >= (job.min_score ?? 60)) {
    await addToJob(job.id, cand.id, source, { score, detail });
    added = true;
  }
  return { score, added };
}

/** After an untagged upload: score the new resume against every open job. */
export async function matchToOpenJobs(candidateId, source, skipJobId = null) {
  const jobs = await q(`SELECT * FROM jobs WHERE status = 'open' AND ($1::int IS NULL OR id <> $1)`, [skipJobId]);
  const cand = await one('SELECT * FROM candidates WHERE id = $1', [candidateId]);
  let best = null;
  for (const job of jobs) {
    const r = await scoreAgainstJob(job, cand, source);
    if (!best || r.score > best.score) best = { ...r, title: job.title };
  }
  return best;
}
