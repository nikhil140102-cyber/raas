'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { q, one, j, getSetting, setSetting } from '@/lib/db';
import { requireUser, requirePerm } from '@/lib/auth';
import { num } from '@/lib/util';
import { parseQuestions, mergeQuestions, questionSets } from '@/lib/questions';

const back = (jobId, msg) => redirect(`/screening?job=${jobId}&msg=${encodeURIComponent(msg)}#questions`);

export async function saveJobQuestions(formData) {
  await requirePerm('questions.edit');
  const jobId = num(formData.get('job_id'));
  await q('UPDATE jobs SET screening_questions = $2::jsonb WHERE id = $1', [jobId, j(parseQuestions(formData.get('questions')))]);
  revalidatePath('/screening');
  back(jobId, 'Questions saved. New calls for this job will use them.');
}

export async function addSetToJob(formData) {
  await requirePerm('questions.edit');
  const jobId = num(formData.get('job_id'));
  const set = (await questionSets()).find((s) => s.name === formData.get('set'));
  if (!set) back(jobId, 'Pick a question set first.');
  const job = await one('SELECT screening_questions FROM jobs WHERE id = $1', [jobId]);
  const merged = mergeQuestions(job.screening_questions, set.questions);
  await q('UPDATE jobs SET screening_questions = $2::jsonb WHERE id = $1', [jobId, j(merged)]);
  back(jobId, `Added “${set.name}” (${merged.length - (job.screening_questions || []).length} new question(s)).`);
}

export async function saveSetFromJob(formData) {
  await requirePerm('questions.edit');
  const jobId = num(formData.get('job_id'));
  const name = String(formData.get('name') || '').trim();
  const job = await one('SELECT screening_questions FROM jobs WHERE id = $1', [jobId]);
  if (!name || !(job.screening_questions || []).length) back(jobId, 'Give the set a name, and make sure the job has questions.');
  const sets = (await getSetting('question_sets', [])).filter((s) => s.name !== name);
  sets.push({ name, questions: job.screening_questions });
  await setSetting('question_sets', sets);
  back(jobId, `Saved as question set “${name}”. You can add it to any job now.`);
}

export async function deleteSet(formData) {
  await requirePerm('questions.edit');
  const jobId = num(formData.get('job_id'));
  const name = String(formData.get('name') || '');
  await setSetting('question_sets', (await getSetting('question_sets', [])).filter((s) => s.name !== name));
  back(jobId, `Deleted question set “${name}”.`);
}
