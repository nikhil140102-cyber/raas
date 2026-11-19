'use client';
// Small filter controls that sit in a table header row and submit the page's filter form.
export function ColSelect({ form, name, value, options, label }) {
  return (
    <select form={form} name={name} defaultValue={value} aria-label={label} className="colf" onChange={(e) => e.target.form?.requestSubmit()}>
      {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select>
  );
}
