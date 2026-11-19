// Shared candidate filters and sorting for the Resume database and the Pipeline.
import { list } from './util';

export const SORTS = {
  match: { label: 'ATS match %', sql: 'match_score' },
  exp: { label: 'Experience', sql: 'total_exp' },
  ectc: { label: 'Expected CTC', sql: 'ectc' },
  cctc: { label: 'Current CTC', sql: 'cctc' },
  notice: { label: 'Notice period', sql: 'notice_days' },
  name: { label: 'Name', sql: 'lower(name)' },
  added: { label: 'Date added', sql: 'created_at' },
};

/** Reads filters from the URL. Locations are comma separated ("Pune, Noida"). */
export function readFilters(sp) {
  const n = (k) => (sp[k] !== undefined && sp[k] !== '' && Number.isFinite(Number(sp[k])) ? Number(sp[k]) : null);
  const sort = SORTS[sp.sort] ? sp.sort : null;
  return {
    q: String(sp.q || '').trim(),
    expMin: n('exp_min'), expMax: n('exp_max'),
    npMax: n('np_max'), ectcMax: n('ectc_max'), minMatch: n('min'),
    loc: list(sp.loc), xloc: list(sp.xloc),
    sameCity: sp.samecity === '1',
    xJobCity: sp.xjobcity === '1',
    sort, dir: sp.dir === 'asc' ? 'asc' : 'desc',
  };
}

export const jobCity = (job) => String(job?.location || '').replace(/\(.*?\)/g, '').split(/[,/]/)[0].trim();

/**
 * Builds WHERE conditions on candidate alias `c`. Pushes values into `params`.
 * Unknown locations are kept by "exclude" filters (so nobody is hidden just because the resume had no city).
 */
export function candidateWhere(f, params, job = null) {
  const where = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  f.q.split(/\s+/).filter(Boolean).forEach((t) => {
    const x = p(`%${t}%`);
    where.push(`(c.name ILIKE ${x} OR c.current_title ILIKE ${x} OR c.skills::text ILIKE ${x} OR c.resume_text ILIKE ${x})`);
  });
  if (f.expMin !== null) where.push(`c.total_exp >= ${p(f.expMin)}`);
  if (f.expMax !== null) where.push(`c.total_exp <= ${p(f.expMax)}`);
  if (f.npMax !== null) where.push(`c.notice_days <= ${p(f.npMax)}`);
  if (f.ectcMax !== null) where.push(`c.ectc <= ${p(f.ectcMax)}`);
  if (f.loc.length) where.push(`(${f.loc.map((l) => `c.location ILIKE ${p(`%${l}%`)}`).join(' OR ')})`);
  f.xloc.forEach((l) => where.push(`COALESCE(c.location, '') NOT ILIKE ${p(`%${l}%`)}`));
  const city = jobCity(job);
  if (job && city && f.sameCity) where.push(`c.location ILIKE ${p(`%${city}%`)}`);
  if (job && city && f.xJobCity) where.push(`COALESCE(c.location, '') NOT ILIKE ${p(`%${city}%`)}`);
  return where;
}

export function orderBy(f, fallback = 'match') {
  const key = f.sort || fallback;
  return `${SORTS[key].sql} ${f.dir.toUpperCase()} NULLS LAST, id DESC`;
}

/** Link for a sortable column header: first click sorts high→low (A→Z for name), next click flips. */
export function sortHref(base, sp, key) {
  const current = SORTS[sp.sort] ? sp.sort : null;
  const firstDir = key === 'name' ? 'asc' : 'desc';
  const dir = current === key ? (sp.dir === 'asc' ? 'desc' : 'asc') : firstDir;
  const params = new URLSearchParams({ ...sp, sort: key, dir });
  params.delete('page');
  return `${base}?${params}`;
}

export function activeFilterCount(f) {
  return [f.q, f.expMin !== null, f.expMax !== null, f.npMax !== null, f.ectcMax !== null, f.minMatch !== null, f.loc.length, f.xloc.length, f.sameCity, f.xJobCity].filter(Boolean).length;
}
