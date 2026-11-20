'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { q, one, setSetting } from '@/lib/db';
import { requireUser, requirePerm } from '@/lib/auth';
import { num, list } from '@/lib/util';
import { parseQuestions } from '@/lib/questions';
import { j } from '@/lib/db';

const s = (fd, k) => String(fd.get(k) || '').trim() || null;

/** Contacts come in as parallel lists (one entry per row). The primary contact is stored first. */
function readContacts(fd) {
  const col = (k) => fd.getAll(`contact_${k}`).map((v) => String(v || '').trim());
  const names = col('name'); const posts = col('post'); const emails = col('email'); const phones = col('phone'); const remarks = col('remarks');
  const primary = Number(fd.get('contact_primary')) || 0;
  const rows = names.map((name, i) => ({ post: posts[i] || '', name, email: emails[i] || '', phone: phones[i] || '', remarks: remarks[i] || '', primary: i === primary }))
    .filter((c) => c.name || c.email || c.phone);
  if (rows.length && !rows.some((c) => c.primary)) rows[0].primary = true;
  return rows.sort((a, b) => Number(b.primary) - Number(a.primary));
}

export async function saveClient(formData) {
  await requirePerm('clients.edit');
  const id = num(formData.get('id'));
  const contacts = readContacts(formData);
  const p = contacts[0] || {};
  const vals = [s(formData, 'name'), s(formData, 'cloud'), s(formData, 'city'), p.name || null, p.email || null, p.phone || null, s(formData, 'status') || 'active', s(formData, 'notes'), j(parseQuestions(formData.get('questions'))), j(contacts)];
  if (!vals[0]) throw new Error('Client name is required');
  let clientId = id;
  if (id) {
    await q('UPDATE clients SET name=$2, cloud=$3, city=$4, contact_name=$5, contact_email=$6, contact_phone=$7, status=$8, notes=$9, screening_questions=$10::jsonb, contacts=$11::jsonb WHERE id=$1', [id, ...vals]);
  } else {
    clientId = (await one('INSERT INTO clients (name, cloud, city, contact_name, contact_email, contact_phone, status, notes, screening_questions, contacts) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb) RETURNING id', vals)).id;
  }
  revalidatePath('/clients');
  redirect(`/clients/${clientId}`);
}

export async function addProspect(formData) {
  await requirePerm('clients.edit');
  const name = s(formData, 'name');
  if (!name) return;
  await q('INSERT INTO prospects (name, cloud, city, revenue_cr, signal, source) VALUES ($1,$2,$3,$4,$5,$6)', [name, s(formData, 'cloud'), s(formData, 'city'), num(formData.get('revenue_cr')), s(formData, 'signal'), s(formData, 'source') || 'Manual']);
  revalidatePath('/clients');
}

/** CSV columns: name, cloud, city, revenue_cr, signal, source (header row optional). */
export async function importProspects(formData) {
  await requirePerm('clients.edit');
  const file = formData.get('file');
  const text = file && typeof file.text === 'function' ? await file.text() : String(formData.get('csv') || '');
  const rows = text.split(/\r?\n/).map((l) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))).filter((r) => r[0]);
  if (rows[0] && /name/i.test(rows[0][0])) rows.shift();
  for (const r of rows) {
    await q('INSERT INTO prospects (name, cloud, city, revenue_cr, signal, source) VALUES ($1,$2,$3,$4,$5,$6)', [r[0], r[1] || null, r[2] || null, num(r[3]), r[4] || null, r[5] || 'CSV import']);
  }
  revalidatePath('/clients');
  redirect('/clients?tab=prospects&imported=' + rows.length);
}

export async function convertProspect(formData) {
  await requirePerm('clients.edit');
  const p = await one('SELECT * FROM prospects WHERE id = $1', [num(formData.get('id'))]);
  if (!p) return;
  const c = await one('INSERT INTO clients (name, cloud, city, revenue_cr, status, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [p.name, p.cloud, p.city, p.revenue_cr, 'agreement sent', p.signal]);
  await q(`UPDATE prospects SET status = 'converted' WHERE id = $1`, [p.id]);
  revalidatePath('/clients');
  redirect(`/clients/${c.id}`);
}

export async function setProspectStatus(formData) {
  await requirePerm('clients.edit');
  await q('UPDATE prospects SET status = $2 WHERE id = $1', [num(formData.get('id')), s(formData, 'status')]);
  revalidatePath('/clients');
}

export async function saveIcp(formData) {
  await requirePerm('clients.edit');
  await setSetting('icp', {
    clouds: list(formData.get('clouds')),
    country: s(formData, 'country') || 'India',
    revenueMin: num(formData.get('revenueMin')),
    revenueMax: num(formData.get('revenueMax')),
    cities: list(formData.get('cities')),
  });
  revalidatePath('/clients');
  redirect('/clients?tab=prospects');
}
