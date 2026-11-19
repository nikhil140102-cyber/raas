'use client';
// Small interactive pieces used across pages.
import { useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';

export function CopyButton({ text, label = 'Copy', className = 'btn sm' }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked */ }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

/** A select that runs a server action as soon as the value changes. */
export function AutoSelect({ action, name, value, options, hidden = {}, label, className }) {
  const [pending, start] = useTransition();
  return (
    <label className={className} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label ? <span className="tiny strong" style={{ color: 'var(--ink2)' }}>{label}</span> : <span className="sr">Change {name}</span>}
      <select
        name={name}
        defaultValue={value}
        disabled={pending}
        onChange={(e) => {
          const fd = new FormData();
          fd.set(name, e.target.value);
          Object.entries(hidden).forEach(([k, v]) => fd.set(k, String(v)));
          start(() => action(fd));
        }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function SubmitButton({ children, className = 'btn primary', pendingText = 'Working…', ...rest }) {
  // Works inside <form action={serverAction}>
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending} {...rest}>{pending ? pendingText : children}</button>;
}

/** Ask before running a destructive form action. */
export function ConfirmButton({ children, message, className = 'btn danger' }) {
  return (
    <button type="submit" className={className} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
