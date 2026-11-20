// Roles and what each one may do. One place to change access for the whole app.
// Server actions call requirePerm(); pages and menus call can() to hide what a role cannot use.

export const ROLES = {
  admin: { label: 'Admin', tone: 'indigo', about: 'Full access, including users, roles and app settings.' },
  hr: { label: 'HR / Recruiter', tone: 'blue', about: 'Same as Admin except managing users: clients, jobs, screening, client sharing, interviews, offers and app settings.' },
  intern: { label: 'Intern', tone: 'gray', about: 'Sources and screens: uploads resumes, updates profiles and moves candidates up to Screening. Cannot see client fees, edit jobs or contact clients.' },
  client: { label: 'Client', tone: 'amber', about: "A login for someone at a client company. They see only their own company's jobs in the client portal: progress numbers, candidates you have shared, interviews and selections, and they give feedback there." },
};

/** Staff roles use the main app; client logins use the client portal only. */
export const STAFF_ROLES = ['admin', 'hr', 'intern'];
export const isClient = (user) => user?.role === 'client';

export const PERMISSIONS = {
  'users.manage': { label: 'Add users, change roles, deactivate accounts', roles: ['admin'] },
  'settings.manage': { label: 'App settings, integrations, call rules, sample data', roles: ['admin', 'hr'] },
  'candidates.delete': { label: 'Delete candidates', roles: ['admin', 'hr'] },
  'clients.edit': { label: 'Add and edit clients and prospects', roles: ['admin', 'hr'] },
  'clients.commercials': { label: 'See client fees, revenue and contract details', roles: ['admin', 'hr'] },
  'jobs.edit': { label: 'Create, edit, close jobs and import JDs', roles: ['admin', 'hr'] },
  'jobs.post': { label: 'Post jobs to LinkedIn, Indeed, Naukri', roles: ['admin', 'hr'] },
  'questions.edit': { label: 'Edit AI call questions and question sets', roles: ['admin', 'hr'] },
  'clients.share': { label: 'Share shortlists and resumes with clients', roles: ['admin', 'hr'] },
  'interviews.manage': { label: 'Schedule interviews and record outcomes', roles: ['admin', 'hr'] },
  'offers.manage': { label: 'Offers, negotiation and closure', roles: ['admin', 'hr'] },
  'calls.start': { label: 'Start AI screening calls', roles: ['admin', 'hr'] },
  'calls.request': { label: 'Send call-slot booking links', roles: ['admin', 'hr', 'intern'] },
  'candidates.edit': { label: 'Upload resumes, edit profiles, add to jobs, re-score', roles: ['admin', 'hr', 'intern'] },
  'pipeline.move': { label: 'Move candidates in the pipeline', roles: ['admin', 'hr', 'intern'] },
  'portal.use': { label: 'Client portal: see own company jobs, shared candidates, give feedback', roles: ['client'] },
};

/** Pipeline stages an intern may move candidates to. */
export const INTERN_STAGES = ['pending', 'shortlisted', 'screening', 'rejected'];

export const roleOf = (user) => (ROLES[user?.role] ? user.role : 'intern');
export const roleLabel = (r) => ROLES[r]?.label || r;

export function can(user, perm) {
  const p = PERMISSIONS[perm];
  if (!p) throw new Error(`Unknown permission: ${perm}`);
  return Boolean(user) && p.roles.includes(roleOf(user));
}

export function canMoveTo(user, stage) {
  return can(user, 'pipeline.move') && (roleOf(user) !== 'intern' || INTERN_STAGES.includes(stage));
}

export class AccessError extends Error {
  constructor(user, perm) {
    super(`Your role (${roleLabel(roleOf(user))}) doesn't allow this: ${PERMISSIONS[perm]?.label || perm}. Ask an admin if you need access.`);
    this.name = 'AccessError';
  }
}
