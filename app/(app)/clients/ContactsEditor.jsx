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
    <fieldset className={`contacts${rows.length > 1 ? '' : ' single'}`}>
      <legend className="strong">Contacts</legend>
      <p className="hint" style={{ margin: 0 }}>Add the primary contact and any alternates. The primary contact is used for job updates and shortlists.</p>
      <input type="hidden" name="contact_primary" value={primary} />
      <div className="contact-grid contact-head" aria-hidden="true">
        <span>Primary</span><span>Post / designation</span><span>Name</span><span>Email</span><span>Phone</span>{rows.length > 1 ? <span /> : null}
      </div>
      {rows.map((c, i) => (
        <div key={c.key} className={`contact-grid contact-row${i === primary ? ' is-primary' : ''}`}>
          <label className="pick" title={i === primary ? 'Primary contact' : 'Make primary'}>
            <input type="radio" name="contact_primary_pick" checked={i === primary} onChange={() => setPrimary(i)} aria-label={`Primary contact: ${c.name || `contact ${i + 1}`}`} />
          </label>
          <input name="contact_post" value={c.post} onChange={(e) => set(i, 'post', e.target.value)} placeholder="HR Manager" aria-label="Post / designation" />
          <input name="contact_name" value={c.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder="Name" aria-label="Name" />
          <input name="contact_email" type="email" value={c.email} onChange={(e) => set(i, 'email', e.target.value)} placeholder="name@company.com" aria-label="Email" />
          <input name="contact_phone" type="tel" value={c.phone} onChange={(e) => set(i, 'phone', e.target.value)} placeholder="+91 …" aria-label="Phone" />
          {rows.length > 1 ? <button type="button" className="btn sm icon-x" onClick={() => remove(i)} aria-label={`Remove contact ${c.name || i + 1}`} title="Remove">✕</button> : null}
          <input className="remarks" name="contact_remarks" value={c.remarks} onChange={(e) => set(i, 'remarks', e.target.value)} placeholder="Remarks (optional), e.g. approves offers, reachable after 4 pm" aria-label="Remarks" />
        </div>
      ))}
      <div><button type="button" className="btn sm" onClick={add}>+ Add another contact</button></div>
    </fieldset>
  );
}
