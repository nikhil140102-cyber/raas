import { randomBytes } from 'crypto';

export const STAGES = [
  { id: 'pending', label: 'Pending', color: '#98A2B3' },
  { id: 'shortlisted', label: 'Shortlisted', color: '#4F46E5' },
  { id: 'screening', label: 'Screening', color: '#175CD3' },
  { id: 'forwarded', label: 'Forwarded to client', color: '#B54708' },
  { id: 'interview', label: 'Client interview', color: '#6941C6' },
  { id: 'selected', label: 'Selected', color: '#067647' },
  { id: 'rejected', label: 'Rejected', color: '#B42318' },
];
export const stageLabel = (id) => STAGES.find((s) => s.id === id)?.label || id;

export const PORTALS = [
  { id: 'careers', name: 'AvaStars careers page', mode: 'Automatic' },
  { id: 'google', name: 'Google for Jobs', mode: 'Automatic' },
  { id: 'indeed', name: 'Indeed', mode: 'Assisted posting' },
  { id: 'linkedin', name: 'LinkedIn', mode: 'Assisted posting' },
  { id: 'naukri', name: 'Naukri', mode: 'Assisted posting' },
  { id: 'social', name: 'Social media', mode: 'Copy and share' },
];

export const SCREENING_STATUS = {
  requested: 'Waiting for slot',
  booked: 'Booked',
  calling: 'On call',
  completed: 'Completed',
  no_answer: 'No answer',
  failed: 'Call failed',
  declined: 'Declined',
  human_requested: 'Wants a human',
};

export const REJECT_REASONS = ['Skills gap', 'Over budget', 'Notice period too long', 'Experience mismatch', 'Location / work mode', 'Not a culture fit', 'Position on hold', 'Candidate not interested'];

export const token = (n = 18) => randomBytes(n).toString('base64url');

export function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export const lakh = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '—' : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 })} L`);
export const ctcRange = (a, b) => (a || b ? `₹${a ?? '?'}–${b ?? '?'} L` : '—');
export const expRange = (a, b) => (a || b ? `${a ?? 0}–${b ?? '+'} yrs` : '—');
export const notice = (d) => (d === null || d === undefined ? '—' : Number(d) === 0 ? 'Immediate' : `${d} days`);

export function fmtDate(d, withTime = true) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) });
}

export function hoursLeft(due) {
  return Math.round((new Date(due).getTime() - Date.now()) / 36e5);
}

export function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function list(v) {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  return String(v || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

/**
 * Public address of the app, used in every shared link and email.
 * Only http(s) addresses are accepted: a mistake like pasting the database URL into APP_URL
 * must never end up in public links. Falls back to Vercel's own production address.
 */
export function appUrl(path = '') {
  const ok = (u) => /^https?:\/\/[^\s@]+$/i.test(String(u || '').trim());
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const base = ok(process.env.APP_URL) ? process.env.APP_URL.trim()
    : vercel ? `https://${vercel}`
      : 'http://localhost:3000';
  return base.replace(/\/$/, '') + path;
}

export const appUrlProblem = () => (process.env.APP_URL && !/^https?:\/\/[^\s@]+$/i.test(process.env.APP_URL.trim())
  ? 'APP_URL is not a website address (it must start with https://). Links use the Vercel address instead. Fix APP_URL in your environment variables.'
  : null);

export function scoreTone(n) {
  if (n === null || n === undefined) return 'gray';
  return n >= 80 ? 'green' : n >= 65 ? 'amber' : 'gray';
}
