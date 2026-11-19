// Shared filter form (server component). Works with lib/filters.js.
import Link from 'next/link';
import { SORTS, activeFilterCount } from '@/lib/filters';

export default function FilterBar({ base, f, jobs = [], jobId, showJobPicker = false, jobLabel = 'Match % for job', keep = {}, defaultSort = 'match' }) {
  const count = activeFilterCount(f);
  return (
    <form className="filters" aria-label="Filters">
      {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="filters-row">
        <label className="field grow">Search skills, title or name<input type="search" name="q" defaultValue={f.q} placeholder="e.g. terraform eks" /></label>
        {showJobPicker ? (
          <label className="field">{jobLabel}
            <select name="job" defaultValue={jobId || ''}>
              <option value="">Best match (any job)</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
          </label>
        ) : null}
        <label className="field">Sort by
          <select name="sort" defaultValue={f.sort || defaultSort}>{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </label>
        <label className="field">Order
          <select name="dir" defaultValue={f.dir}><option value="desc">High → low (newest first)</option><option value="asc">Low → high (oldest first)</option></select>
        </label>
      </div>
      <div className="filters-row">
        <label className="field">Min match %<input type="number" name="min" min="0" max="100" defaultValue={f.minMatch ?? ''} placeholder="e.g. 70" /></label>
        <label className="field">Experience (yrs)
          <span className="pair"><input type="number" step="any" name="exp_min" defaultValue={f.expMin ?? ''} placeholder="from" aria-label="Experience from" /><input type="number" step="any" name="exp_max" defaultValue={f.expMax ?? ''} placeholder="to" aria-label="Experience to" /></span>
        </label>
        <label className="field">Max ECTC (₹ L)<input type="number" step="any" name="ectc_max" defaultValue={f.ectcMax ?? ''} /></label>
        <label className="field">Max notice (days)<input type="number" name="np_max" defaultValue={f.npMax ?? ''} /></label>
      </div>
      <div className="filters-row">
        <label className="field grow">Only these locations <span className="hint">comma separated</span><input name="loc" defaultValue={f.loc.join(', ')} placeholder="e.g. Pune, Noida" /></label>
        <label className="field grow">Exclude locations <span className="hint">comma separated</span><input name="xloc" defaultValue={f.xloc.join(', ')} placeholder="e.g. Chennai, Kolkata" /></label>
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
      <div className="row" style={{ gap: 10 }}>
        <button className="btn primary" type="submit">Apply filters</button>
        {count ? <Link className="btn" href={`${base}${keep.job ? `?job=${keep.job}` : jobId && !showJobPicker ? `?job=${jobId}` : ''}`}>Clear ({count})</Link> : null}
        <span className="small muted">Candidates with no location in their resume are kept when you exclude locations.</span>
      </div>
    </form>
  );
}
