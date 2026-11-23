// Applicant import: reads Indeed / Naukri / LinkedIn exports (CSV, Excel, "Excel" HTML tables),
// text copied from a portal page, and the Chrome extension's page scans, then adds the
// applicants to the database and the right job. Shared by the Import page and the Inbound API.
import JSZip from 'jszip';
import { q, one, logActivity } from './db';
import { aiEnabled, claudeJson } from './ai';
import { ingestResume, findDuplicate, addToJob } from './ingest';
import { cleanApplicant, parseDate, parseExperience, todayIST, matchJobTitle } from './applicant';

export * from './applicant';

const clip = (v, max = 200) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim().slice(0, max));

// ---------------------------------------------------------------- spreadsheets
const decodeXml = (s) => String(s || '')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&nbsp;|&#160;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t', '|'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

const colIndex = (ref) => {
  const letters = (ref.match(/^[A-Z]+/) || ['A'])[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

async function parseXlsx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const shared = [];
  const ss = zip.file('xl/sharedStrings.xml');
  if (ss) {
    const xml = await ss.async('string');
    for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) || []) shared.push(decodeXml((si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).join('')));
  }
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = zip.file('xl/workbook.xml'); const rels = zip.file('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const rid = ((await wb.async('string')).match(/<sheet\b[^>]*r:id="([^"]+)"/) || [])[1];
    const target = rid ? ((await rels.async('string')).match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`)) || [])[1] : null;
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const sheet = zip.file(sheetPath) || zip.file(/xl\/worksheets\/sheet\d+\.xml/)[0];
  if (!sheet) throw new Error('No worksheet found in this Excel file.');
  const xml = await sheet.async('string');
  const rows = [];
  for (const rowXml of xml.match(/<row\b[\s\S]*?<\/row>/g) || []) {
    const row = [];
    for (const c of rowXml.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || []) {
      const attrs = c.match(/^<c\b([^>]*)/)[1];
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
      const t = (attrs.match(/\bt="([^"]+)"/) || [])[1];
      const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = '';
      if (t === 's') val = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') val = decodeXml((c.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).join(''));
      else val = decodeXml(v ?? '');
      row[ref ? colIndex(ref) : row.length] = String(val).trim();
    }
    rows.push(Array.from(row, (x) => x ?? ''));
  }
  return rows.filter((r) => r.some(Boolean));
}

function parseHtmlTable(html) {
  const rows = [];
  for (const tr of html.match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
    const cells = (tr.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map((td) => decodeXml(td.replace(/<br\s*\/?>/gi, ' ')).replace(/\s+/g, ' ').trim());
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

function parseSpreadsheetMl(xml) {
  const rows = [];
  for (const r of xml.match(/<(?:ss:)?Row\b[\s\S]*?<\/(?:ss:)?Row>/g) || []) {
    const cells = (r.match(/<(?:ss:)?Cell\b[\s\S]*?<\/(?:ss:)?Cell>|<(?:ss:)?Cell\b[^>]*\/>/g) || []).map((c) => decodeXml((c.match(/<(?:ss:)?Data\b[^>]*>([\s\S]*?)<\/(?:ss:)?Data>/) || [])[1] || '').trim());
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

/** Reads CSV, Excel (.xlsx) and the HTML/XML files portals save with an .xls name. Returns rows of strings. */
export async function readSheet(buffer, filename = '') {
  const buf = Buffer.from(buffer);
  const name = filename.toLowerCase();
  if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) {
    throw new Error('This is an old-style Excel file (.xls). Open it in Excel or Google Sheets, choose "Save as" → .xlsx or .csv, and upload that file.');
  }
  if (buf[0] === 0x50 && buf[1] === 0x4b) return parseXlsx(buf);
  const text = buf.toString('utf8').replace(/^﻿/, '');
  const head = text.slice(0, 2000).toLowerCase();
  if (/<table|<tr\b/.test(head) || (/^\s*</.test(text) && /<table/i.test(text))) return parseHtmlTable(text);
  if (/<workbook|<ss:workbook|urn:schemas-microsoft-com:office:spreadsheet/.test(head)) return parseSpreadsheetMl(text);
  if (/\.(xlsx|xls)$/.test(name) && /[\u0000-\u0008]/.test(text.slice(0, 200))) throw new Error('Could not read this Excel file. Save it as .xlsx or .csv and try again.');
  return parseCsv(text);
}

// ---------------------------------------------------------------- page text (paste / extension)
const NAME_LINE = /^[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]*){0,3}$/;
const NOT_NAME = /^(home|jobs?|candidates?|applicants?|messages?|search|filter|sort|status|reviewed|shortlist(?:ed)?|reject(?:ed)?|interested|not interested|download|view|resume|cv|email|phone|call|next|previous|page|location|experience|skills|applied|new|all|open|closed|settings|help|sign out|employer|dashboard|analytics|responses?|inbox)$/i;

const PLACE = /^(pune|mumbai|navi mumbai|thane|delhi|new delhi|noida|greater noida|gurgaon|gurugram|ghaziabad|faridabad|bangalore|bengaluru|hyderabad|secunderabad|chennai|kolkata|ahmedabad|jaipur|indore|chandigarh|mohali|lucknow|kochi|cochin|coimbatore|nagpur|surat|vadodara|bhopal|bhubaneswar|mysore|mysuru|mangalore|trivandrum|remote|india|maharashtra|karnataka|tamil nadu|telangana|gujarat|rajasthan|kerala|haryana|uttar pradesh|west bengal|madhya pradesh)\b/i;
const isName = (x) => NAME_LINE.test(x) && !NOT_NAME.test(x) && !PLACE.test(x) && x.split(' ').length <= 4;

function regexApplicants(text) {
  const lines = String(text).split(/\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = []; let last = -1;
  lines.forEach((l, i) => {
    const email = (l.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0];
    const phone = (l.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/) || [])[0];
    if (!email && !phone) return;
    const prev = out[out.length - 1];
    if (prev && i - last <= 2 && ((email && !prev.email) || (phone && !prev.phone))) {
      if (email) prev.email = email; if (phone) prev.phone = phone; last = i; return;
    }
    // The person's name is the first name-like line after the previous applicant's contact details.
    const start = Math.max(last + 1, i - 8);
    let nameIdx = -1;
    for (let k = start; k <= i; k++) if (isName(lines[k])) { nameIdx = k; break; }
    const from = nameIdx >= 0 ? nameIdx : start;
    let end = Math.min(lines.length, i + 4);
    for (let k = i + 1; k < end; k++) if (isName(lines[k]) || /@|(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/.test(lines[k])) { end = k; break; }
    const block = lines.slice(from, end);
    const applied = block.map((x) => (/(appl|receiv|ago|today|yesterday)/i.test(x) ? parseDate(x) : null)).find(Boolean) || block.map((x) => parseDate(x)).find(Boolean) || null;
    const expLine = block.find((x) => /\d+(\.\d+)?\s*(yrs?|years?)/i.test(x));
    const place = block.find((x) => PLACE.test(x));
    out.push({ name: nameIdx >= 0 ? lines[nameIdx] : '', email, phone, applied_on: applied, total_exp: expLine ? parseExperience(expLine) : null, location: place ? place.split(',')[0] : '' });
    last = i;
  });
  return out;
}

const EXTRACT_SYSTEM = `You read text copied from a job portal (Indeed, Naukri, LinkedIn, Foundit, Shine or similar): an applicant list, an applicant's profile, or an application email.
Return every real job applicant in it. Ignore menus, buttons, filters, ads, the employer's own staff and anything that is not an applicant. Never invent data: leave a field null when the text does not state it.`;

/** Finds applicants in copied page text. Uses AI when a key is set, simple rules otherwise. */
export async function extractApplicants(text, { url = '', source = '' } = {}) {
  const src = String(text || '').replace(/\u0000/g, '').slice(0, 120000);
  if (!src.trim()) return { applicants: [], ai: false };
  const today = todayIST();
  let raw = []; let usedAI = false; let warning = '';
  if (aiEnabled()) {
    const lines = src.split(/\n/); const chunks = []; let cur = '';
    for (const l of lines) { if ((cur + l).length > 15000 && cur) { chunks.push(cur); cur = ''; } cur += `${l}\n`; }
    if (cur.trim()) chunks.push(cur);
    try {
      for (const chunk of chunks.slice(0, 8)) {
        const out = await claudeJson(EXTRACT_SYSTEM, `Today is ${today} (India). Page: ${url || 'unknown'}${source ? ` (${source})` : ''}.
Turn relative dates ("2 days ago", "Yesterday") into real dates using today's date.

Reply as {"applicants":[{"name":"","email":null,"phone":null,"location":null,"applied_on":"YYYY-MM-DD or null","job_title":"job they applied for or null","current_title":null,"current_company":null,"total_exp":"e.g. 5 years 2 months or null","notice":null,"cctc":null,"ectc":null,"skills":[],"profile_url":null}]}

TEXT:
${chunk}`, 8000);
        raw.push(...(out.applicants || []));
      }
      usedAI = true;
      if (chunks.length > 8) warning = 'The page was very long; only the first part was read. Scan smaller pages (fewer results per page).';
    } catch (e) {
      warning = `AI reading failed (${e.message}); used simple rules instead.`;
      raw = regexApplicants(src);
    }
  } else {
    raw = regexApplicants(src);
    warning = 'AI is off, so only applicants whose email or phone is visible on the page were found. Add the Anthropic key for much better results.';
  }
  const seen = new Set(); const applicants = [];
  for (const r of raw) {
    const a = cleanApplicant(r);
    if (!a.name && !a.email && !a.phone) continue;
    const key = a.email || a.phone || `${a.name.toLowerCase()}|${a.job_title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key); applicants.push(a);
  }
  return { applicants, ai: usedAI, warning };
}

// ---------------------------------------------------------------- saving
export async function openJobs() {
  return q(`SELECT j.id, j.title, j.slug, c.name AS client FROM jobs j LEFT JOIN clients c ON c.id = j.client_id WHERE j.status IN ('open','paused') ORDER BY j.created_at DESC`);
}

const appliedTs = (day) => (day ? `${day}T12:00:00+05:30` : null);

/** Puts a candidate on a job without scoring (no resume yet) and remembers the applied date. */
export async function addPending(jobId, candidateId, source, appliedOn) {
  const row = await one(
    `INSERT INTO applications (job_id, candidate_id, stage, source, applied_at) VALUES ($1,$2,'pending',$3,$4)
     ON CONFLICT (job_id, candidate_id) DO UPDATE SET applied_at = COALESCE(applications.applied_at, EXCLUDED.applied_at)
     RETURNING id`,
    [jobId, candidateId, source, appliedTs(appliedOn)],
  );
  return row.id;
}

async function setApplied(applicationId, appliedOn) {
  if (applicationId && appliedOn) await q('UPDATE applications SET applied_at = COALESCE(applied_at, $2) WHERE id = $1', [applicationId, appliedTs(appliedOn)]);
}

/**
 * Adds one applicant: with a resume it is read and scored; without one a basic profile is made
 * (or an existing one filled in) and put on the job as Pending until the resume arrives.
 * @returns {{status:'created'|'merged'|'failed', candidateId?:number, applicationId?:number, score?:number, name?:string, job?:string, error?:string}}
 */
export async function importApplicant({ applicant, resume = null, jobId = null, autoJob = false, jobs = null, source = 'Import', notes = '' }) {
  const a = cleanApplicant(applicant);
  let job = null;
  if (jobId) job = (jobs || (await openJobs())).find((j) => j.id === Number(jobId)) || null;
  else if (autoJob && a.job_title) job = matchJobTitle(a.job_title, jobs || (await openJobs()));
  const label = `${source}${a.applied_on ? `, applied ${a.applied_on}` : ''}`;

  if (resume?.buffer?.length) {
    const r = await ingestResume({ buffer: resume.buffer, filename: resume.filename || 'resume.pdf', mime: resume.mime || '', source, jobId: job?.id || null,
      overrides: { name: a.name, email: a.email, phone: a.phone, location: a.location } });
    if (r.status === 'failed') return { status: 'failed', error: r.error, name: a.name || resume.filename };
    await fillMissing(r.candidateId, a);
    await setApplied(r.applicationId, a.applied_on);
    if (notes) await logActivity(r.candidateId, r.applicationId, `Note from ${source}: ${clip(notes, 1000)}`);
    return { ...r, name: r.name || a.name, job: job?.title || r.bestJob || null };
  }

  if (!a.name && !a.email && !a.phone) return { status: 'failed', error: 'No name, email or phone found.' };
  let dup = await findDuplicate(a.email, a.phone);
  if (!dup && a.profile_url) dup = await one('SELECT * FROM candidates WHERE profile_url = $1 LIMIT 1', [a.profile_url]);
  if (!dup && !a.email && !a.phone && a.name) dup = await one('SELECT * FROM candidates WHERE lower(name) = lower($1) AND source = $2 AND email IS NULL AND phone IS NULL LIMIT 1', [a.name, source]);
  let id = dup?.id;
  if (id) await fillMissing(id, a);
  else {
    id = (await one(
      `INSERT INTO candidates (name, email, phone, location, current_title, current_company, total_exp, cctc, ectc, notice_days, skills, source, profile_url, summary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14) RETURNING id`,
      [a.name || 'Unknown', a.email || null, a.phone || null, a.location || null, a.current_title || null, a.current_company || null, a.total_exp, a.cctc, a.ectc, a.notice_days,
        JSON.stringify(a.skills), source, a.profile_url || null, `Added from ${source} without a resume.${a.email || a.phone ? '' : ' Contact details still needed.'} Upload or ask for the CV to get a match %.`],
    )).id;
  }
  let applicationId = null; let score;
  if (job) {
    const hasResume = dup?.resume_text && dup.resume_text.length > 80;
    if (hasResume) ({ applicationId, score } = await addToJob(job.id, id, source));
    else applicationId = await addPending(job.id, id, source, a.applied_on);
    await setApplied(applicationId, a.applied_on);
  }
  await logActivity(id, applicationId, `${dup ? 'Updated' : 'Added'} from ${label}${job ? ` for ${job.title}` : ''}${notes ? `: ${clip(notes, 1000)}` : ''}${dup?.resume_text ? '.' : ' (no resume yet).'}`);
  return { status: dup ? 'merged' : 'created', candidateId: id, applicationId, score, name: a.name || a.email || a.phone, job: job?.title || null, resume: false };
}

/** Fills only the empty fields of an existing profile, so imports never overwrite what HR edited. */
async function fillMissing(id, a) {
  await q(
    `UPDATE candidates SET
      name = CASE WHEN name IS NULL OR name = 'Unknown' THEN COALESCE(NULLIF($2,''), name) ELSE name END,
      email = COALESCE(email, NULLIF($3,'')), phone = COALESCE(phone, NULLIF($4,'')), location = COALESCE(location, NULLIF($5,'')),
      current_title = COALESCE(current_title, NULLIF($6,'')), current_company = COALESCE(current_company, NULLIF($7,'')),
      total_exp = COALESCE(total_exp, $8), cctc = COALESCE(cctc, $9), ectc = COALESCE(ectc, $10), notice_days = COALESCE(notice_days, $11),
      profile_url = COALESCE(profile_url, NULLIF($12,'')), updated_at = now()
     WHERE id = $1`,
    [id, a.name, a.email, a.phone, a.location, a.current_title, a.current_company, a.total_exp, a.cctc, a.ectc, a.notice_days, a.profile_url],
  );
}

export async function logImportRun(userName, kind, source, summary) {
  await q('INSERT INTO import_runs (user_name, kind, source, summary) VALUES ($1,$2,$3,$4::jsonb)', [userName || null, kind, source || null, JSON.stringify(summary || {})]).catch(() => {});
}
