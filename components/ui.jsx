// Small presentational helpers shared by server pages.
import { STAGES, scoreTone } from '@/lib/util';
import Icon from './Icon';

export function Pill({ tone = 'gray', children }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function Score({ value }) {
  if (value === null || value === undefined) return <span className="score gray">—</span>;
  return <span className={`score ${scoreTone(value)}`} title="Match with the job">{value}%</span>;
}

export function StagePill({ stage }) {
  const s = STAGES.find((x) => x.id === stage);
  const tone = { pending: 'gray', shortlisted: 'indigo', screening: 'blue', forwarded: 'amber', interview: 'indigo', selected: 'green', rejected: 'red' }[stage] || 'gray';
  return <Pill tone={tone}>{s?.label || stage}</Pill>;
}

export function Header({ title, sub, crumbs, children }) {
  return (
    <>
      {crumbs ? <nav aria-label="Breadcrumb" className="crumbs">{crumbs}</nav> : null}
      <header className="header">
        <div className="titles">
          {typeof title === 'string' ? <h1>{title}</h1> : title}
          {sub ? <p className="sub">{sub}</p> : null}
        </div>
        {children ? <div className="row">{children}</div> : null}
      </header>
    </>
  );
}

export function Kpi({ label, value, note, noteColor, icon, tone = 'indigo' }) {
  return (
    <div className={`card kpi tone-${tone}`}>
      <div className="kpi-top">
        <span className="label">{label}</span>
        {icon ? <span className="ico"><Icon name={icon} size={22} /></span> : null}
      </div>
      <span className="value">{value}</span>
      {note ? <span className="note" style={noteColor ? { color: noteColor } : undefined}>{note}</span> : null}
    </div>
  );
}

export function Flash({ msg, tone = 'ok' }) {
  if (!msg) return null;
  return <div className={`notice ${tone}`} role="status">{msg}</div>;
}
