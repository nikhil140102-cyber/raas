// Applicant fields: pure helpers shared by the server and the Import page in the browser.
// Reads portal dates, experience, CTC and notice period, and guesses spreadsheet columns.
const clip = (v, max = 200) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim().slice(0, max));

export function normalizePhone(p) {
  if (!p) return null;
  const digits = String(p).replace(/\D/g, '');
  if (digits.length === 10) return '+91' + digits;
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
  return digits ? '+' + digits : null;
}

// ---------------------------------------------------------------- dates
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m + 1)}-${pad(d)}`;
};
/** Today's date in India (the team works in IST), as YYYY-MM-DD. */
export const todayIST = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
export function shiftDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
}
const fullYear = (y) => (y < 100 ? 2000 + y : y);

/**
 * Reads the dates portals use and returns YYYY-MM-DD (or null): Excel serial numbers, 2026-11-20,
 * 20/11/2026 (Indian order unless that's impossible), 20-Nov-2026, Nov 20, 2026, "Today",
 * "Yesterday", "3 days ago", "2 weeks ago", "Applied 5d ago".
 */
export function parseDate(value, today = todayIST()) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const s = String(value).trim();
  if (!s) return null;
  const low = s.toLowerCase();
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000).toISOString().slice(0, 10);
  }
  if (/\b(just now|today|few (?:minutes|hours) ago|\d+\s*(?:h|hr|hrs|hours?|m|mins?|minutes?)\s*ago)\b/.test(low)) return today;
  if (/\byesterday\b/.test(low)) return shiftDays(today, -1);
  let m = low.match(/(\d+)\+?\s*(d|days?|w|wks?|weeks?|months?|mo)\s*ago/);
  if (m) {
    const n = Number(m[1]); const u = m[2];
    return shiftDays(today, -(u.startsWith('w') ? n * 7 : u.startsWith('mo') ? n * 30 : n));
  }
  if (/\b(a|one) (day|week|month) ago\b/.test(low)) {
    const u = low.match(/\b(?:a|one) (day|week|month) ago/)[1];
    return shiftDays(today, -({ day: 1, week: 7, month: 30 }[u]));
  }
  m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return ymd(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) {
    const a = Number(m[1]); const b = Number(m[2]); const y = fullYear(Number(m[3]));
    return b > 12 && a <= 12 ? ymd(y, a - 1, b) : ymd(y, b - 1, a);
  }
  m = low.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s\-/.,]+([a-z]{3,9})[\s\-/.,]+(\d{2,4})\b/);
  if (m && MONTHS[m[2].slice(0, 4)] !== undefined || (m && MONTHS[m[2].slice(0, 3)] !== undefined)) {
    const mo = MONTHS[m[2].slice(0, 4)] ?? MONTHS[m[2].slice(0, 3)];
    return ymd(fullYear(Number(m[3])), mo, Number(m[1]));
  }
  m = low.match(/\b([a-z]{3,9})[\s\-/.]+(\d{1,2})(?:st|nd|rd|th)?,?[\s\-/.]+(\d{4})\b/);
  if (m && (MONTHS[m[1].slice(0, 4)] ?? MONTHS[m[1].slice(0, 3)]) !== undefined) {
    return ymd(Number(m[3]), MONTHS[m[1].slice(0, 4)] ?? MONTHS[m[1].slice(0, 3)], Number(m[2]));
  }
  // "20 Nov" / "Nov 20" without a year: this year, or last year if that would be in the future.
  m = low.match(/\b(\d{1,2})\s+([a-z]{3,9})\b/) || low.match(/\b([a-z]{3,9})\s+(\d{1,2})\b/);
  if (m) {
    const [dPart, mPart] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
    const mo = MONTHS[mPart.slice(0, 4)] ?? MONTHS[mPart.slice(0, 3)];
    if (mo !== undefined) {
      const y = Number(today.slice(0, 4));
      const d = ymd(y, mo, Number(dPart));
      return d && d > today ? ymd(y - 1, mo, Number(dPart)) : d;
    }
  }
  return null;
}

export function inRange(day, from, to) {
  if (!from && !to) return true;
  if (!day) return false;
  return (!from || day >= from) && (!to || day <= to);
}

// ---------------------------------------------------------------- values
/** "5 Years 3 Months", "5.5 yrs", "5y 6m", "66 months", "Fresher" -> years (one decimal). */
export function parseExperience(v) {
  const s = clip(v, 80).toLowerCase();
  if (!s) return null;
  if (/fresher|no experience/.test(s)) return 0;
  const y = s.match(/(\d+(?:\.\d+)?)\s*(?:\+\s*)?(?:years?|yrs?|y\b)/);
  const mo = s.match(/(\d+)\s*(?:months?|mos?|m\b)/);
  if (y || mo) return Math.round(((y ? Number(y[1]) : 0) + (mo ? Number(mo[1]) / 12 : 0)) * 10) / 10;
  const n = s.match(/^(\d+(?:\.\d+)?)$/);
  return n ? Number(n[1]) : null;
}

/** "12 Lacs", "12.5 LPA", "INR 12,00,000", "1200000", "12 Lakh(s)" -> lakhs. */
export function parseLakhs(v) {
  const s = clip(v, 60).toLowerCase().replace(/,/g, '');
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  let n = Number(m[1]);
  if (/crore|cr\b/.test(s)) n *= 100;
  else if (/thousand|\bk\b/.test(s) && n < 100000) n = (n * 1000) / 100000;
  else if (n >= 10000) n /= 100000;
  return n > 0 && n < 1000 ? Math.round(n * 10) / 10 : null;
}

/** "Immediate", "15 Days or less", "1 Month", "3 Months", "Serving notice" -> days. */
export function parseNotice(v) {
  const s = clip(v, 60).toLowerCase();
  if (!s) return null;
  if (/immediate|^0$/.test(s)) return 0;
  const m = s.match(/(\d+)\s*(days?|weeks?|months?)?/);
  if (!m) return /serving/.test(s) ? 30 : null;
  const n = Number(m[1]);
  return /month/.test(m[2] || '') ? n * 30 : /week/.test(m[2] || '') ? n * 7 : n;
}

const listOf = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;|\n]/)).map((x) => clip(x, 60)).filter(Boolean).slice(0, 40);

/** Turns loose fields (from a sheet row, AI or the extension) into a clean applicant. */
export function cleanApplicant(r = {}) {
  const email = (clip(r.email, 120).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0]?.toLowerCase() || '';
  const phoneDigits = clip(r.phone, 40).replace(/[^\d+]/g, '');
  const name = clip(r.name || [r.first_name, r.last_name].filter(Boolean).join(' '), 120).replace(/^(mr|ms|mrs|dr)\.?\s+/i, '');
  const exp = typeof r.total_exp === 'number' ? r.total_exp : parseExperience(r.total_exp ?? r.experience);
  return {
    name,
    email,
    phone: phoneDigits.replace(/\D/g, '').length >= 10 ? normalizePhone(phoneDigits) : '',
    location: clip(r.location, 80),
    applied_on: parseDate(r.applied_on ?? r.applied_at ?? r.applied),
    job_title: clip(r.job_title, 150),
    current_title: clip(r.current_title, 120),
    current_company: clip(r.current_company, 120),
    total_exp: exp,
    cctc: typeof r.cctc === 'number' ? r.cctc : parseLakhs(r.cctc),
    ectc: typeof r.ectc === 'number' ? r.ectc : parseLakhs(r.ectc),
    notice_days: typeof r.notice_days === 'number' ? r.notice_days : parseNotice(r.notice ?? r.notice_days),
    skills: listOf(r.skills),
    profile_url: /^https?:\/\//i.test(clip(r.profile_url, 500)) ? clip(r.profile_url, 500) : '',
  };
}

// Field -> header names portals use (compared without spaces/punctuation). Order matters: specific first.
export const IMPORT_FIELDS = [
  ['email', 'Email', ['email', 'emailid', 'emailaddress', 'mail', 'mailid', 'candidateemail', 'primaryemail']],
  ['phone', 'Phone', ['phone', 'mobile', 'mobilenumber', 'mobileno', 'phonenumber', 'phoneno', 'contactnumber', 'contactno', 'contact', 'cell', 'telephone', 'candidatephone', 'primaryphone']],
  ['first_name', 'First name', ['firstname', 'givenname', 'fname']],
  ['last_name', 'Last name', ['lastname', 'surname', 'familyname', 'lname']],
  ['name', 'Name', ['name', 'fullname', 'candidatename', 'applicantname', 'candidate', 'applicant', 'jobseekername', 'jobseeker']],
  ['applied_on', 'Applied on', ['applieddate', 'appliedon', 'dateapplied', 'applicationdate', 'appliedat', 'responsedate', 'receivedon', 'datereceived', 'appliedtime', 'dateofapplication', 'date', 'createdon', 'createddate', 'submittedon', 'datesubmitted']],
  ['ectc', 'Expected CTC', ['expectedctc', 'expectedsalary', 'ectc', 'expectedpackage']],
  ['cctc', 'Current CTC', ['currentctc', 'ctc', 'currentsalary', 'annualsalary', 'salary', 'cctc', 'currentpackage']],
  ['notice', 'Notice period', ['noticeperiod', 'notice', 'availabletojoin', 'joiningtime', 'availability']],
  ['total_exp', 'Experience', ['totalexperience', 'experience', 'workexperience', 'exp', 'totalexp', 'yearsofexperience', 'experienceyears', 'relevantexperience']],
  ['current_title', 'Current title', ['currentdesignation', 'designation', 'currenttitle', 'currentrole', 'currentjobtitle', 'headline', 'currentposition', 'mostrecentjobtitle']],
  ['current_company', 'Current company', ['currentcompany', 'currentemployer', 'company', 'employer', 'organization', 'organisation', 'mostrecentcompany']],
  ['job_title', 'Applied for (job)', ['jobtitle', 'appliedfor', 'job', 'position', 'jobname', 'role', 'requirement', 'vacancy', 'jobposting', 'posting', 'title', 'jobappliedfor', 'positionappliedfor']],
  ['location', 'Location', ['location', 'currentlocation', 'city', 'candidatelocation', 'currentcity', 'address']],
  ['skills', 'Skills', ['skills', 'keyskills', 'keyskill', 'skillset', 'skill']],
  ['profile_url', 'Profile link', ['profileurl', 'profilelink', 'profile', 'link', 'url', 'candidateprofile']],
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Picks the header row (first row that looks like column names) and guesses which column holds what. */
export function guessMapping(rows) {
  let headerIdx = 0; let best = -1;
  rows.slice(0, 10).forEach((r, i) => {
    const hits = r.filter((h) => IMPORT_FIELDS.some(([, , syn]) => syn.includes(norm(h)))).length;
    if (hits > best) { best = hits; headerIdx = i; }
  });
  const headers = (rows[headerIdx] || []).map((h, i) => clip(h, 80) || `Column ${i + 1}`);
  const used = new Set(); const mapping = {};
  for (const exact of [true, false]) {
    for (const [field, , syn] of IMPORT_FIELDS) {
      if (mapping[field] !== undefined) continue;
      const idx = headers.findIndex((h, i) => !used.has(i) && (exact ? syn.includes(norm(h)) : syn.some((s) => s.length >= 5 && norm(h).includes(s))));
      if (idx >= 0) { mapping[field] = idx; used.add(idx); }
    }
  }
  if (mapping.name !== undefined) { delete mapping.first_name; delete mapping.last_name; }
  return { headerIdx, headers, mapping };
}

export function guessSource(headers, filename = '') {
  const s = `${filename} ${headers.join(' ')}`.toLowerCase();
  if (s.includes('naukri') || s.includes('resdex')) return 'Naukri';
  if (s.includes('indeed')) return 'Indeed';
  if (s.includes('linkedin')) return 'LinkedIn';
  return '';
}

export function rowToApplicant(row, mapping) {
  const get = (f) => (mapping[f] === undefined || mapping[f] === null || mapping[f] === '' ? '' : row[Number(mapping[f])] ?? '');
  return cleanApplicant(Object.fromEntries(IMPORT_FIELDS.map(([f]) => [f, get(f)])));
}

const words = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9+#. ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !['and', 'the', 'for', 'with', 'job', 'role', 'opening', 'urgent', 'hiring', 'sr', 'jr'].includes(w)));

/** Matches the job title a portal shows to one of our open jobs (or null if nothing is close). */
export function matchJobTitle(title, jobs) {
  const t = words(title);
  if (!t.size) return null;
  let best = null; let bestScore = 0;
  for (const j of jobs) {
    const w = words(j.title);
    if (!w.size) continue;
    if (String(title).toLowerCase().includes(String(j.title).toLowerCase())) return j;
    const inter = [...w].filter((x) => t.has(x)).length;
    const s = inter / w.size;
    if (s > bestScore) { bestScore = s; best = j; }
  }
  return bestScore >= 0.6 ? best : null;
}

