import { saveClient } from '../../_actions/clients';
import { formatQuestions } from '@/lib/questions';

export default function ClientForm({ client = {} }) {
  return (
    <form action={saveClient} className="card">
      {client.id ? <input type="hidden" name="id" value={client.id} /> : null}
      <h2>{client.id ? 'Client details' : 'New client'}</h2>
      <div className="grid">
        <label className="field">Company name *<input name="name" required defaultValue={client.name || ''} /></label>
        <label className="field">Cloud platform<input name="cloud" defaultValue={client.cloud || ''} placeholder="AWS, Azure, GCP" /></label>
        <label className="field">City<input name="city" defaultValue={client.city || ''} /></label>
        <label className="field">Revenue (₹ Cr)<input name="revenue_cr" type="number" step="any" defaultValue={client.revenue_cr ?? ''} /></label>
        <label className="field">Contact name<input name="contact_name" defaultValue={client.contact_name || ''} /></label>
        <label className="field">Contact email<input name="contact_email" type="email" defaultValue={client.contact_email || ''} /></label>
        <label className="field">Contact phone<input name="contact_phone" type="tel" defaultValue={client.contact_phone || ''} /></label>
        <label className="field">Status
          <select name="status" defaultValue={client.status || 'active'}>
            <option value="active">active</option><option value="agreement sent">agreement sent</option><option value="on hold">on hold</option>
          </select>
        </label>
      </div>
      <label className="field">Notes<textarea name="notes" rows={3} defaultValue={client.notes || ''} /></label>
      <label className="field">Standard AI call questions for this client <span className="hint">Asked on every job for this client, after the job&apos;s own questions. One per line; add “| type” if you like.</span>
        <textarea name="questions" rows={4} defaultValue={formatQuestions(client.screening_questions)} placeholder="Are you comfortable with rotational shifts? | Yes / no" />
      </label>
      <button className="btn primary" type="submit" style={{ alignSelf: 'flex-start' }}>Save client</button>
    </form>
  );
}
