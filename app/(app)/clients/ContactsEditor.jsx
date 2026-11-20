'use client';
import { useState } from 'react';

const blank = () => ({ post: '', name: '', email: '', phone: '', remarks: '' });

/** Client contacts: one primary plus any number of alternates. Each has post, name, email, phone and remarks. */
export default function ContactsEditor({ contacts = [] }) {
  const start = contacts.length ? contacts : [blank()];
  const [rows, setRows] = useState(start.map((c, i) => ({ ...blank(), ...c, key: i })));
  const [primary, setPrimary] = useState(Math.max(0, start.findIndex((c) => c.primary)));
  const [nextKey, setNextKey] = useState(start.length);
  const set = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const add = () => { setRows((r) => [...r, { ...blank(), key: nextKey }]); setNextKey((n) => n + 1); };
  const remove = (i) => {
    setRows((r) => r.filter((_, j) => j !== i));
    setPrimary((p) => (i === p ? 0 : i < p ? p - 1 : p));
  };
  return (
    <fieldset className="contacts">
      <legend className="strong">Contacts</legend>
      <p className="hint" style={{ margin: 0 }}>Add the primary contact and any alternates. The primary contact is used for job updates and shortlists.</p>
      <input type="hidden" name="contact_primary" value={primary} />
      {rows.map((c, i) => (
        <div key={c.key} className={`contact-row${i === primary ? ' is-primary' : ''}`}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <label className="check sm"><input type="radio" name="contact_primary_pick" checked={i === primary} onChange={() => setPrimary(i)} /> {i === primary ? <strong>Primary contact</strong> : 'Make primary'}</label>
            {rows.length > 1 ? <button type="button" className="btn sm" onClick={() => remove(i)} aria-label={`Remove contact ${c.name || i + 1}`}>Remove</button> : null}
          </div>
          <div className="grid">
            <label className="field">Post / designation<input name="contact_post" value={c.post} onChange={(e) => set(i, 'post', e.target.value)} placeholder="HR Manager" /></label>
            <label className="field">Name<input name="contact_name" value={c.name} onChange={(e) => set(i, 'name', e.target.value)} /></label>
            <label className="field">Email<input name="contact_email" type="email" value={c.email} onChange={(e) => set(i, 'email', e.target.value)} /></label>
            <label className="field">Phone<input name="contact_phone" type="tel" value={c.phone} onChange={(e) => set(i, 'phone', e.target.value)} /></label>
          </div>
          <label className="field">Remarks<input name="contact_remarks" value={c.remarks} onChange={(e) => set(i, 'remarks', e.target.value)} placeholder="e.g. Approves offers; reachable after 4 pm" /></label>
        </div>
      ))}
      <div><button type="button" className="btn sm" onClick={add}>+ Add another contact</button></div>
    </fieldset>
  );
}
