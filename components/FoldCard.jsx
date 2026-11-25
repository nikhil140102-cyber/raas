'use client';
import { useEffect, useId, useState } from 'react';

/** A card with an Open / Close toggle in its header. The choice is remembered in this browser (per `id`). */
export default function FoldCard({ id, anchor, title, hint, defaultOpen = false, as: Tag = 'section', actions = null, children, ...rest }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const key = `avs_fold_${id}`;
  useEffect(() => {
    try { const v = localStorage.getItem(key); if (v === '1' || v === '0') setOpen(v === '1'); } catch { /* storage blocked */ }
    if (anchor && window.location.hash === `#${anchor}`) setOpen(true);
  }, [key, anchor]);
  const toggle = () => setOpen((o) => { try { localStorage.setItem(key, o ? '0' : '1'); } catch { /* storage blocked */ } return !o; });
  return (
    <Tag id={anchor} className="card" style={{ gap: 12 }} {...rest}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', alignItems: 'flex-start', gap: 10 }}>
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls={bodyId}
          style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2>{title}</h2>{hint ? <p className="small muted">{hint}</p> : null}
        </button>
        <span className="row" style={{ gap: 8, flex: 'none' }}>
          {open ? actions : null}
          <button type="button" className="btn sm" onClick={toggle} aria-expanded={open} aria-controls={bodyId} aria-label={`${open ? 'Close' : 'Open'} ${title}`}>
            {open ? 'Close ▴' : 'Open ▾'}
          </button>
        </span>
      </div>
      {open ? <div id={bodyId} className="stack" style={{ gap: 12 }}>{children}</div> : null}
    </Tag>
  );
}
