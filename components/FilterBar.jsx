// Shared filter form (server component). Works with lib/filters.js.
// Compact by design: one search row; everything else sits under "More filters".
// With columnFilters, the per-column filters live in the table header (they submit this form via form="…").
import Link from 'next/link';
import { SORTS, activeFilterCount } from '@/lib/filters';

export default function FilterBar({ base, f, jobs = [], jobId, showJobPicker = false, jobLabel = 'Match % for job', keep = {}, defaultSort = 'match', id = 'filters', columnFilters = false }) {
  const count = activeFilterCount(f);
  const moreCount = columnFilters
    ? [f.xloc.length, f.sameCity, f.xJobCity].filter(Boolean).length
    : [f.minMatch !== null, f.expMin !== null || f.expMax !== null, f.ectcMax !== null, f.npMax !== null, f.loc.length, f.xloc.length, f.sameCity, f.xJobCity].filter(Boolean).length;
  const clearHref = `${base}${keep.job ? `?job=${keep.job}` : jobId && !showJobPicker ? `?job=${jobId}` : ''}`;
  return (
    <form id={id} className="filters compact" aria-label="Filters">
      {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {columnFilters ? <><input type="hidden" name="sort" value={f.sort || defaultSort} /><input type="hidden" name="dir" value={f.dir} /></> : null}
      <div className="filters-row">
        <input className="grow" type="search" name="q" defaultValue={f.q} placeholder="Search skills, title, name or resume text…" aria-label="Search" />
        {showJobPicker ? (
          <select name="job" defaultValue={jobId || ''} aria-label={jobLabel} title={jobLabel}>
            <option value="">Match %: best of any job</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>Match %: {j.title}</option>)}
          </select>
        ) : null}
        {!columnFilters ? (
          <>
            <select name="sort" defaultValue={f.sort || defaultSort} aria-label="Sort by">{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>Sort: {v.label}</option>)}</select>
            <select name="dir" defaultValue={f.dir} aria-label="Order"><option value="desc">High → low</option><option value="asc">Low → high</option></select>
          </>
        ) : null}
        <button className="btn primary sm" type="submit">Apply</button>
        {count ? <Link className="btn sm" href={clearHref}>Clear ({count})</Link> : null}
      </div>
      <details className="more" open={moreCount > 0}>
        <summary className="small strong">More filters{moreCount ? ` (${moreCount})` : ''}</summary>
        <div className="filters-row">
          {!columnFilters ? (
            <>
              <label className="field">Min match %<input type="number" name="min" min="0" max="100" defaultValue={f.minMatch ?? ''} placeholder="e.g. 70" /></label>
              <label className="field">Experience (yrs)
                <span className="pair"><input type="number" step="any" name="exp_min" defaultValue={f.expMin ?? ''} placeholder="from" aria-label="Experience from" /><input type="number" step="any" name="exp_max" defaultValue={f.expMax ?? ''} placeholder="to" aria-label="Experience to" /></span>
              </label>
              <label className="field">Max ECTC (₹ L)<input type="number" step="any" name="ectc_max" defaultValue={f.ectcMax ?? ''} /></label>
              <label className="field">Max notice (days)<input type="number" name="np_max" defaultValue={f.npMax ?? ''} /></label>
              <label className="field grow">Only these locations<input name="loc" defaultValue={f.loc.join(', ')} placeholder="e.g. Pune, Noida" /></label>
            </>
          ) : null}
          <label className="field grow">Exclude locations<input name="xloc" defaultValue={f.xloc.join(', ')} placeholder="e.g. Chennai, Kolkata" /></label>
          {jobId ? (
            <fieldset className="field">
              <legend>Job location</legend>
              <span className="row" style={{ gap: 8 }}>
                <label className="check sm"><input type="checkbox" name="samecity" value="1" defaultChecked={f.sameCity} /> Same city only</label>
                <label className="check sm"><input type="checkbox" name="xjobcity" value="1" defaultChecked={f.xJobCity} /> Exclude job city</label>
              </span>
            </fieldset>
          ) : null}
        </div>
        <p className="tiny muted">Separate several locations with commas. Candidates with no location in their resume are kept when you exclude locations.</p>
      </details>
    </form>
  );
}
