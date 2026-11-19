// AI screening call questions: client standard questions + job questions, and a reusable library.
import { one, getSetting } from './db';

export const QUESTION_LIBRARY = [
  { name: 'Basics (every role)', questions: [
    { q: 'What is your current CTC and expected CTC?', type: 'Salary' },
    { q: 'What is your notice period? Can it be bought out or shortened?', type: 'Notice period' },
    { q: 'Where are you based now, and are you open to relocating?', type: 'Location' },
    { q: 'Do you have any other offers in hand?', type: 'Yes / no' },
  ] },
  { name: 'Cloud / DevOps', questions: [
    { q: 'Which cloud platform have you used most in production, and for what?', type: 'Open answer' },
    { q: 'Tell me about a CI/CD pipeline you built or owned.', type: 'Open answer' },
    { q: 'How have you used Terraform or another infrastructure-as-code tool?', type: 'Open answer' },
    { q: 'Describe a production incident you handled and what you changed after it.', type: 'Open answer' },
  ] },
  { name: 'Software developer', questions: [
    { q: 'Which languages and frameworks have you used in your last two projects?', type: 'Open answer' },
    { q: 'Tell me about the most complex feature you built end to end.', type: 'Open answer' },
    { q: 'How do you test your code before it goes to production?', type: 'Open answer' },
  ] },
  { name: 'Sales / pre-sales', questions: [
    { q: 'What did you sell in your last role, and to which kind of customers?', type: 'Open answer' },
    { q: 'What was your annual target and how much did you achieve last year?', type: 'Number' },
    { q: 'Walk me through a deal you closed from first call to signing.', type: 'Open answer' },
  ] },
  { name: 'Freshers / interns', questions: [
    { q: 'Tell me about a project you did in college and your part in it.', type: 'Open answer' },
    { q: 'Which skills from this job description have you practised, and how?', type: 'Open answer' },
    { q: 'When can you join, and are you open to working from the office?', type: 'Open answer' },
  ] },
];

export async function questionSets() {
  const custom = await getSetting('question_sets', []);
  return [...QUESTION_LIBRARY.map((s) => ({ ...s, builtIn: true })), ...custom.map((s) => ({ ...s, builtIn: false }))];
}

/** "question | type" per line → [{q, type}] */
export function parseQuestions(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [qText, type] = l.split('|').map((x) => x.trim());
    return { q: qText, type: type || 'Open answer' };
  });
}

export const formatQuestions = (qs) => (qs || []).map((x) => `${x.q} | ${x.type || 'Open answer'}`).join('\n');

// Two questions count as the same when they start the same way ("What is your notice period? …").
const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 28);

export function mergeQuestions(...lists) {
  const seen = new Set();
  const out = [];
  for (const l of lists) for (const x of l || []) { const k = key(x.q); if (x.q && !seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
}

/** What the AI actually asks on a call for this job: the job's own questions first, then the client's standard ones. */
export async function callQuestions(job) {
  const client = job.client_id ? await one('SELECT screening_questions FROM clients WHERE id = $1', [job.client_id]) : null;
  return mergeQuestions(job.screening_questions, client?.screening_questions);
}
