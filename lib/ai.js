import { cfg } from './config';
// Claude API helpers with keyword-based fallbacks when no API key is set.
import { list } from './util';

export const aiEnabled = () => Boolean(cfg('ANTHROPIC_API_KEY'));

async function claude(system, prompt, maxTokens = 2000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': cfg('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg('AI_MODEL') || 'claude-haiku-5-5',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `AI request failed (${res.status})`);
  return (data.content || []).map((c) => c.text || '').join('');
}

function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AI did not return JSON');
  return JSON.parse(m[0]);
}

export async function claudeJson(system, prompt, maxTokens) {
  return parseJson(await claude(system + '\nReply with one JSON object only, no other text.', prompt, maxTokens));
}

// ---------------------------------------------------------------- resumes
const SKILL_WORDS = ['AWS', 'Azure', 'GCP', 'Google Cloud', 'Terraform', 'Kubernetes', 'EKS', 'AKS', 'GKE', 'Docker', 'Helm', 'ArgoCD', 'Jenkins', 'GitHub Actions', 'GitLab CI', 'CI/CD', 'Ansible', 'Linux', 'Python', 'Go', 'Java', 'JavaScript', 'TypeScript', 'Node.js', 'React', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Kafka', 'Spark', 'Airflow', 'BigQuery', 'Snowflake', 'Prometheus', 'Grafana', 'ELK', 'Datadog', 'CloudFormation', 'Bash', 'Networking', 'Security', 'IAM', 'Lambda', 'Serverless', 'Microservices', 'DevOps', 'SRE', 'Machine Learning', 'Data Engineering', 'Sales', 'Pre-sales', 'Salesforce'];

const CITIES = ['Bangalore', 'Bengaluru', 'Mumbai', 'Navi Mumbai', 'Thane', 'Pune', 'Hyderabad', 'Secunderabad', 'Chennai', 'Delhi', 'New Delhi', 'Noida', 'Greater Noida', 'Gurgaon', 'Gurugram', 'Ghaziabad', 'Faridabad', 'Kolkata', 'Ahmedabad', 'Coimbatore', 'Kochi', 'Cochin', 'Trivandrum', 'Thiruvananthapuram', 'Jaipur', 'Indore', 'Chandigarh', 'Mohali', 'Lucknow', 'Bhubaneswar', 'Nagpur', 'Vadodara', 'Surat', 'Mysore', 'Mysuru', 'Mangalore', 'Visakhapatnam', 'Madurai', 'Bhopal', 'Dehradun', 'Remote'];
const HEADINGS = /^(resume|curriculum vitae|cv|profile|summary|professional summary|objective|career objective|contact|skills|technical skills|experience|work experience|education|projects|personal details)$/i;

/** Money in lakhs: "18 LPA", "18.5 lakhs", "₹18,00,000", "INR 1800000", "18 L". */
function lakhsAfter(text, labelRe) {
  const m = text.match(new RegExp(`(?:${labelRe.source})[^0-9₹]{0,25}(?:₹|rs\\.?|inr)?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(lpa|lakhs?|lacs?|l\\b|k\\b|per annum|p\\.a\\.?)?`, 'i'));
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  if (n >= 100000) n = n / 100000;          // rupees -> lakhs
  else if (/^k$/i.test(m[2] || '') && n > 100) n = (n * 1000) / 100000;
  if (n <= 0 || n > 500) return null;
  return Math.round(n * 10) / 10;
}

function noticeDays(text) {
  const m = text.match(/notice\s*(?:period)?\s*[:\-–]?\s*(?:of\s*)?(immediate(?:ly)?|serving[^\n]{0,30}|\d{1,3}\s*(?:days?|weeks?|months?))/i);
  if (!m) return /immediate joiner|available immediately|can join immediately/i.test(text) ? 0 : null;
  const v = m[1].toLowerCase();
  if (v.startsWith('immediate')) return 0;
  const num = Number((v.match(/\d+/) || [])[0]);
  if (!num) return /serving/.test(v) ? 30 : null;
  if (v.includes('month')) return num * 30;
  if (v.includes('week')) return num * 7;
  return num;
}

function fallbackExtract(text) {
  const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || null;
  const phoneRaw = (text.match(/(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/) || [])[0];
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const lines = text.split(/\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const top = lines.slice(0, 15);

  // Name: first short, letters-only line near the top that isn't a heading.
  let name = top.find((l) => /^[A-Za-z][A-Za-z .'-]{2,40}$/.test(l) && l.split(' ').length <= 4 && !HEADINGS.test(l)) || null;
  if (!name && email) name = email.split('@')[0].replace(/[._\d]+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase()) || null;

  // Title / company: "Title at Company", "Title | Company", "Title, Company" in the first lines.
  let current_title = null; let current_company = null;
  for (const l of top) {
    if (l === name || l.includes('@')) continue;
    const m = l.match(/^([A-Za-z][A-Za-z /&().-]{2,60}?)\s+(?:at|@|\||-|–|,)\s+([A-Z][A-Za-z0-9&.' -]{1,60}?)(?:,|\||$|\s+\(|\s+-)/);
    if (m && /(engineer|developer|manager|lead|architect|analyst|consultant|admin|administrator|specialist|executive|designer|scientist|head|director|officer|associate|sre|devops|tester|qa)/i.test(m[1])) {
      current_title = m[1].trim(); current_company = m[2].trim(); break;
    }
  }
  if (!current_title) {
    const t = top.find((l) => l !== name && /^(senior |sr\.? |lead |principal |junior |jr\.? )?[A-Za-z /]{0,30}(engineer|developer|manager|architect|analyst|consultant|administrator|specialist|designer|scientist|lead)\b[A-Za-z /]{0,20}$/i.test(l));
    if (t) current_title = t;
  }

  // Location: a known Indian city near the top (or anywhere, as a last resort).
  const cityIn = (s) => CITIES.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(s));
  const location = cityIn(top.join(' ')) || cityIn(lines.join(' ').slice(0, 3000)) || null;

  const lower = text.toLowerCase();
  const skills = SKILL_WORDS.filter((sk) => new RegExp(`(^|[^a-z])${sk.toLowerCase().replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([^a-z]|$)`).test(lower));
  const exp = text.match(/(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years|yrs|year)(?:\s+of)?(?:\s+\w+){0,3}\s+experience/i) || text.match(/experience[^0-9]{0,20}(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years|yrs)/i) || text.match(/(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years|yrs)/i);

  const cctc = lakhsAfter(text, /(?:current|present|existing)\s*(?:ctc|salary|package|compensation)|\bcctc\b/) ?? lakhsAfter(text, /(?<![a-z])ctc\b/);
  const ectc = lakhsAfter(text, /(?:expected|desired)\s*(?:ctc|salary|package|compensation)|\bectc\b/);

  return {
    name: name || 'Unknown', email, phone, current_title, current_company, location,
    total_exp: exp ? Number(exp[1]) : null, cctc, ectc, notice_days: noticeDays(text),
    skills, summary: lines.slice(0, 4).join(' ').slice(0, 300), experience: [], education: [],
  };
}

export function normalizePhone(p) {
  if (!p) return null;
  const digits = String(p).replace(/\D/g, '');
  if (digits.length === 10) return '+91' + digits;
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
  return digits ? '+' + digits : null;
}

export async function extractResume(text) {
  if (!aiEnabled()) return fallbackExtract(text);
  try {
    const out = await claudeJson(
      'You read resumes for an Indian recruitment agency. Extract facts exactly as written. Use null when a value is not in the resume. CTC values are in lakhs per annum (e.g. 18.5). notice_days is a number of days (0 = immediate).',
      `Return JSON with keys: name, email, phone, current_title, current_company, location, total_exp (years, number), cctc, ectc, notice_days, skills (array of short skill names), summary (2 sentences, factual), experience (array of {role, company, when, points}), education (array of {degree, school, year}).\n\nResume:\n"""${text.slice(0, 15000)}"""`,
      2500,
    );
    out.phone = normalizePhone(out.phone);
    out.skills = list(out.skills);
    return { ...fallbackExtract(text), ...Object.fromEntries(Object.entries(out).filter(([, v]) => v !== null && v !== undefined)) };
  } catch (e) {
    console.error('extractResume AI failed, using fallback:', e.message);
    return fallbackExtract(text);
  }
}

// ---------------------------------------------------------------- matching
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
/** Whole-word match, so "Java" does not match "JavaScript" and "Go" does not match "Google". */
const hasTerm = (hay, term) => new RegExp(`(^|[^a-z0-9+#])${escapeRe(term.toLowerCase())}($|[^a-z0-9+#])`).test(hay);

/** "B2B Sales" also matches "B2B & B2C Sales": every word of a multi-word skill appears somewhere. */
const STOP = new Set(['and', 'or', 'of', 'the', 'in', 'with', 'for', 'a', 'an', 'to', '&', '/']);
function allWords(hay, term) {
  const words = term.toLowerCase().split(/[\s/&,-]+/).filter((w) => w && !STOP.has(w));
  return words.length > 1 && words.every((w) => hasTerm(hay, w));
}

function keywordHits(required, candidateSkills, text) {
  const hay = `${candidateSkills.join(' | ')} | ${text || ''}`.toLowerCase();
  const hit = [];
  const miss = [];
  for (const r of required) {
    const main = String(r).replace(/\s*\(.*\)\s*/, '').trim();
    const alt = (String(r).match(/\(([^)]+)\)/) || [])[1];
    const ok = (main && (hasTerm(hay, main) || allWords(hay, main))) || (alt && hasTerm(hay, alt.trim()));
    (ok ? hit : miss).push(r);
  }
  return { hit, miss };
}

/**
 * Scores a candidate for a job (0–100):
 * 50 must-have skills · 10 preferred skills · 20 experience · 10 budget · 10 location/work mode.
 * Capped at 50 when fewer than half of the must-have skills are present.
 */
export async function scoreMatch(job, cand) {
  const must = [...(job.mandatory_skills || []), ...(job.required_certs || [])];
  const pref = [...(job.preferred_skills || []), ...(job.preferred_certs || [])];
  let mustHit; let mustMiss; let prefHit; let strengths = []; let gaps = []; let summary = '';

  if (aiEnabled()) {
    try {
      const out = await claudeJson(
        'You are a careful technical recruiter. Judge skill matches using the resume evidence, treating synonyms as matches (e.g. "EKS" satisfies "Kubernetes (EKS)"). Do not invent experience.',
        `Job: ${job.title}\nMust-have skills and certifications: ${JSON.stringify(must)}\nPreferred skills and certifications: ${JSON.stringify(pref)}\nHiring manager notes: ${JSON.stringify(job.hm_notes || {})}\n\nCandidate: ${cand.current_title || ''} at ${cand.current_company || ''}, ${cand.total_exp ?? '?'} yrs\nSkills: ${JSON.stringify(cand.skills || [])}\nResume text:\n"""${(cand.resume_text || '').slice(0, 9000)}"""\n\nReturn JSON: {"must_matched": [...], "must_missing": [...], "preferred_matched": [...], "strengths": [up to 3 short phrases], "gaps": [up to 3 short phrases], "summary": "one sentence"}`,
        1200,
      );
      mustHit = list(out.must_matched); mustMiss = list(out.must_missing); prefHit = list(out.preferred_matched);
      strengths = list(out.strengths); gaps = list(out.gaps); summary = out.summary || '';
    } catch (e) {
      console.error('scoreMatch AI failed, using keywords:', e.message);
    }
  }
  if (!mustHit) {
    const m = keywordHits(must, cand.skills || [], cand.resume_text);
    mustHit = m.hit; mustMiss = m.miss;
    prefHit = keywordHits(pref, cand.skills || [], cand.resume_text).hit;
  }

  const mustPts = must.length ? (mustHit.length / must.length) * 50 : 50;
  const prefPts = pref.length ? (prefHit.length / pref.length) * 10 : 10;

  let expPts = 10;
  const e = cand.total_exp;
  if (e !== null && e !== undefined) {
    const lo = job.exp_min ?? 0; const hi = job.exp_max ?? 99;
    if (e >= lo && e <= hi) expPts = 20;
    else if (e < lo) expPts = Math.max(0, 20 - (lo - e) * 6);
    else expPts = Math.max(8, 20 - (e - hi) * 3);
  }

  let budgetPts = 6;
  if (cand.ectc && job.ctc_max) budgetPts = cand.ectc <= job.ctc_max ? 10 : cand.ectc <= job.ctc_max * 1.1 ? 5 : 0;

  let locPts = 6;
  if (job.work_mode === 'Remote') locPts = 10;
  else if (cand.location && job.location) {
    const city = String(job.location).split(/[,(]/)[0].trim().toLowerCase();
    locPts = String(cand.location).toLowerCase().includes(city) ? 10 : 4;
  }

  let score = Math.round(mustPts + prefPts + expPts + budgetPts + locPts);
  // Missing more than half of the must-have skills caps the match at 50%, whatever else fits.
  const capped = must.length > 0 && mustHit.length / must.length < 0.5 && score > 50;
  if (capped) score = 50;
  if (!strengths.length && mustHit.length) strengths = [`Has ${mustHit.slice(0, 4).join(', ')}`];
  if (!gaps.length && mustMiss.length) gaps = [`Missing ${mustMiss.join(', ')}`];

  return {
    score,
    detail: {
      must_matched: mustHit, must_missing: mustMiss, preferred_matched: prefHit,
      breakdown: { skills: Math.round(mustPts), preferred: Math.round(prefPts), experience: Math.round(expPts), budget: budgetPts, location: locPts },
      strengths, gaps, summary, capped, by: aiEnabled() ? 'ai' : 'keywords',
    },
  };
}

// ---------------------------------------------------------------- job helpers
export async function draftJD(job) {
  const base = `${job.title} — ${job.location || ''} (${job.work_mode || ''}), ${job.exp_min ?? ''}–${job.exp_max ?? ''} years.`;
  if (!aiEnabled()) {
    return `We are hiring a ${job.title} to join a growing cloud team in ${job.location || 'India'} (${job.work_mode}).\n\nResponsibilities:\n- Own day-to-day delivery for the area this role covers\n- Work with engineering, customers and stakeholders to ship reliable work\n- Improve automation, documentation and quality over time\n\nMust have: ${(job.mandatory_skills || []).join(', ') || '[add must-have skills]'}.\nGood to have: ${(job.preferred_skills || []).join(', ') || '[add good-to-have skills]'}.${(job.required_certs || []).length ? `\nRequired certifications: ${job.required_certs.join(', ')}.` : ''}${(job.preferred_certs || []).length ? `\nPreferred certifications: ${job.preferred_certs.join(', ')}.` : ''}\nExperience: ${job.exp_min ?? '?'}–${job.exp_max ?? '?'} years. Employment: ${job.employment_type}.`;
  }
  return claude(
    'You write clear, plain job descriptions for an Indian recruitment agency. No hype, no emoji, no invented benefits or company facts. Use short sections: summary line, Responsibilities (4–6 bullets), Must have, Good to have.',
    `Role: ${base}\nMust have: ${(job.mandatory_skills || []).join(', ')}\nGood to have: ${(job.preferred_skills || []).join(', ')}\nRequired certifications: ${(job.required_certs || []).join(', ') || 'none'}\nPreferred certifications: ${(job.preferred_certs || []).join(', ') || 'none'}\nHiring manager notes: ${JSON.stringify(job.hm_notes || {})}\nEmployment type: ${job.employment_type}. Joining: ${job.joining_timeline || ''}.`,
    1200,
  );
}

export async function suggestQuestions(job) {
  const standard = [
    { q: 'What is your current CTC and expected CTC?', type: 'Salary' },
    { q: 'What is your notice period? Can it be bought out or shortened?', type: 'Notice period' },
    { q: `Are you open to working ${String(job.work_mode || '').toLowerCase()} from ${job.location || 'the job location'}?`, type: 'Yes / no' },
  ];
  if (!aiEnabled()) {
    const skillQs = (job.mandatory_skills || []).slice(0, 2).map((s) => ({ q: `Tell me about a project where you used ${s}. What was your part?`, type: 'Open answer' }));
    return [...skillQs, ...standard];
  }
  try {
    const out = await claudeJson(
      'You write short phone-screening questions an AI voice agent will ask. Each must be answerable in under a minute, spoken aloud.',
      `Job: ${job.title}\nMust have: ${(job.mandatory_skills || []).join(', ')}\nNotes: ${JSON.stringify(job.hm_notes || {})}\nReturn JSON {"questions": [{"q": "...", "type": "Open answer"}]} with 2–3 role-specific technical questions only.`,
      800,
    );
    return [...(out.questions || []).slice(0, 3), ...standard];
  } catch {
    return standard;
  }
}

// ---------------------------------------------------------------- calls
export async function scoreCall(questions, transcript) {
  if (!transcript || !transcript.trim()) return { score: null, summary: 'No transcript received.', answers: [], facts: {} };
  if (!aiEnabled()) {
    return {
      score: null,
      summary: '',
      answers: questions.map((x) => ({ q: x.q, a: '', rating: null })),
      facts: {},
    };
  }
  const out = await claudeJson(
    'You review a recorded phone screening between an AI recruiter and a candidate. Rate each answer 1–10 for how well it fits the question and the role. Quote facts, never invent them. If a question was not answered, rating is null.',
    `Questions:\n${questions.map((x, i) => `${i + 1}. ${x.q}`).join('\n')}\n\nTranscript:\n"""${transcript.slice(0, 20000)}"""\n\nReturn JSON {"answers":[{"q":"...","a":"short summary of the answer","rating":8}], "score": overall 1-10 with one decimal, "summary": "2 sentences for the hiring client", "facts": {"cctc": lakhs or null, "ectc": lakhs or null, "notice_days": number or null}}`,
    2000,
  );
  return { score: out.score ?? null, summary: out.summary || '', answers: out.answers || [], facts: out.facts || {} };
}

// ---------------------------------------------------------------- scanned files and JD import
const IMAGE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
export const imageMime = (filename = '') => IMAGE_TYPES[(filename.toLowerCase().match(/\.[a-z]+$/) || [''])[0]] || null;

/** Reads the text out of a scanned PDF or a photo/screenshot of a document. Needs ANTHROPIC_API_KEY. */
export async function readDocumentWithAI(buffer, filename, mime) {
  if (!aiEnabled()) throw new Error('This file is a scanned image, so it has no readable text. Add ANTHROPIC_API_KEY in Vercel to read scanned resumes, or upload a text PDF/Word file.');
  const img = imageMime(filename) || (/^image\//.test(mime || '') ? mime : null);
  const block = img
    ? { type: 'image', source: { type: 'base64', media_type: img, data: Buffer.from(buffer).toString('base64') } }
    : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(buffer).toString('base64') } };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': cfg('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: cfg('AI_MODEL') || 'claude-haiku-5-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: [block, { type: 'text', text: 'Transcribe all the text in this document exactly, top to bottom, as plain text. Keep headings and bullet points on their own lines. Output only the text.' }] }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `AI request failed (${res.status})`);
  return (data.content || []).map((c) => c.text || '').join('');
}

const num1 = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

function fallbackJD(text) {
  const t = text.replace(/\r/g, '');
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const out = {};
  const labelled = (re) => { const m = t.match(re); return m ? m[1].trim() : null; };
  out.title = labelled(/(?:job\s*title|position|role|designation)\s*[:\-–]\s*(.+)/i)
    || lines.find((l) => l.length < 70 && !/^(job description|jd|about|company|overview)\b/i.test(l)) || null;
  if (out.title) out.title = out.title.replace(/^(job description|jd)\s*[:\-–]\s*/i, '').slice(0, 80);
  const exp = t.match(/(\d+(?:\.\d+)?)\s*(?:\+|plus)?\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:years|yrs)/i) || t.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years|yrs)/i);
  if (exp) { out.exp_min = num1(exp[1]); out.exp_max = num1(exp[2]); }
  const ctc = t.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?|l\b)/i) || t.match(/(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?)/i);
  if (ctc) { out.ctc_min = ctc[2] ? num1(ctc[1]) : null; out.ctc_max = num1(ctc[2] || ctc[1]); }
  out.location = labelled(/(?:job\s*)?location\s*[:\-–]\s*(.+)/i) || CITIES.find((c) => new RegExp(`\\b${c}\\b`, 'i').test(t)) || null;
  if (/\bremote\b/i.test(t) && !/\bnot remote\b/i.test(t)) out.work_mode = 'Remote';
  if (/\bhybrid\b/i.test(t)) out.work_mode = 'Hybrid';
  if (/\b(work from office|wfo|on-?site)\b/i.test(t)) out.work_mode = 'WFO';
  if (/\bcontract to hire|c2h\b/i.test(t)) out.employment_type = 'Contract to hire';
  else if (/\bcontract(ual)?\b/i.test(t)) out.employment_type = 'Contract';
  const open = t.match(/(\d+)\s*(?:openings|positions|vacanc)/i);
  if (open) out.openings = num1(open[1]);
  const section = (re) => {
    const i = lines.findIndex((l) => re.test(l));
    if (i < 0) return [];
    const items = [];
    for (const l of lines.slice(i + 1)) {
      if (/^[A-Z][A-Za-z /&-]{2,40}:?$/.test(l) && !/^[•\-*]/.test(l) && items.length) break;
      items.push(l.replace(/^[•\-*\d.)\s]+/, ''));
      if (items.length >= 12) break;
    }
    return items;
  };
  const isCert = (l) => /certifi/i.test(l);
  // Short bullet lines under a "Must have" heading are skills as written; long sentences are scanned for known skills.
  const skillsFrom = (arr) => [...new Set(arr.filter((l) => !isCert(l)).flatMap((l) => (l.length <= 40 ? l.split(/\s*[,;]\s*/) : SKILL_WORDS.filter((s) => hasTerm(l.toLowerCase(), s)))).map((x) => x.replace(/[.:]$/, '').trim()).filter(Boolean))];
  const mustLines = section(/^(must[- ]?have|mandatory|required skills|requirements|key skills|skills required|skills)\b/i);
  const prefLines = section(/^(good[- ]?to[- ]?have|preferred|nice[- ]?to[- ]?have|desired)/i);
  out.mandatory_skills = mustLines.length ? skillsFrom(mustLines) : SKILL_WORDS.filter((s) => hasTerm(t.toLowerCase(), s));
  out.preferred_skills = skillsFrom(prefLines).filter((s) => !out.mandatory_skills.includes(s));
  const certLines = lines.filter(isCert);
  const certName = (l) => l.replace(/^[•\-*\d.)\s]+/, '').replace(/\b(is\s+)?(preferred|required|mandatory|a plus|good to have|must)\b.*$/i, '').replace(/\s*certification\s*$/i, '').trim();
  out.required_certs = certLines.filter((l) => !/preferred|good to have|a plus|nice to have/i.test(l)).map(certName).filter((x) => x && x.length < 70);
  out.preferred_certs = certLines.filter((l) => /preferred|good to have|a plus|nice to have/i.test(l)).map(certName).filter((x) => x && x.length < 70);
  out.description = t.trim();
  return out;
}

/** Turns a pasted or uploaded job description into requirement fields. */
export async function extractJD(text) {
  const base = fallbackJD(text);
  if (!aiEnabled()) return { ...base, by: 'keywords' };
  try {
    const out = await claudeJson(
      'You read job descriptions for an Indian recruitment agency and fill in a job requirement form. Use only facts in the text; use null or [] when something is not stated. CTC is in lakhs per annum (e.g. 18 for 18 LPA). Experience in years.',
      `Return JSON with keys: title, openings (number), employment_type ("Permanent" | "Contract" | "Contract to hire"), work_mode ("WFO" | "Hybrid" | "Remote"), location, exp_min, exp_max, ctc_min, ctc_max, joining_timeline ("Immediate" | "Within 30 days" | "Within 60 days" | "Within 90 days" or null), mandatory_skills (array of short skill names), preferred_skills (array), required_certs (array of certification names), preferred_certs (array), description (the job description, cleaned up as plain text with short sections and bullets; keep all the original requirements), questions (array of 4-6 short screening questions for a phone call).\n\nJob description:\n"""${text.slice(0, 15000)}"""`,
      3000,
    );
    const clean = Object.fromEntries(Object.entries(out).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length) && v !== ''));
    return { ...base, ...clean, by: 'ai' };
  } catch (e) {
    console.error('extractJD AI failed, using fallback:', e.message);
    return { ...base, by: 'keywords' };
  }
}
