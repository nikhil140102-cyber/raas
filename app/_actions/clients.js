'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { q, one, setSetting } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { num, list } from '@/lib/util';
import { parseQuestions } from '@/lib/questions';
import { j } from '@/lib/db';

const s = (fd, k) => String(fd.get(k) || '').trim() || null;

export async function saveClient(formData) {
  await requireUser();
  const id = num(formData.get('id'));
  const vals = [s(formData, 'name'), s(formData, 'cloud'), s(formData, 'city'), num(formData.get('revenue_cr')), s(formData, 'contact_name'), s(formData, 'contact_email'), s(formData, 'contact_phone'), s(formData, 'status') || 'active', s(formData, 'notes'), j(parseQuestions(formData.get('questions')))];
  if (!vals[0]) throw new Error('Client name is required');
  let clientId = id;
  if (id) {
    await q('UPDATE clients SET name=$2, cloud=$3, city=$4, revenue_cr=$5, contact_name=$6, contact_email=$7, contact_phone=$8, status=$9, notes=$10, screening_questions=$11::jsonb WHERE id=$1', [id, ...vals]);
  } else {
    clientId = (await one('INSERT INTO clients (name, cloud, city, revenue_cr, contact_name, contact_email, contact_phone, status, notes, screening_questions) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING id', vals)).id;
  }
  revalidatePath('/clients');
  redirect(`/clients/${clientId}`);
}

export async function addProspect(formData) {
  await requireUser();
  const name = s(formData, 'name');
  if (!name) return;
  await q('INSERT INTO prospects (name, cloud, city, revenue_cr, signal, source) VALUES ($1,$2,$3,$4,$5,$6)', [name, s(formData, 'cloud'), s(formData, 'city'), num(formData.get('revenue_cr')), s(formData, 'signal'), s(formData, 'source') || 'Manual']);
  revalidatePath('/clients');
}

/** CSV columns: name, cloud, city, revenue_cr, signal, source (header row optional). */
export async function importProspects(formData) {
  await requireUser();
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
  await requireUser();
  const p = await one('SELECT * FROM prospects WHERE id = $1', [num(formData.get('id'))]);
  if (!p) return;
  const c = await one('INSERT INTO clients (name, cloud, city, revenue_cr, status, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [p.name, p.cloud, p.city, p.revenue_cr, 'agreement sent', p.signal]);
  await q(`UPDATE prospects SET status = 'converted' WHERE id = $1`, [p.id]);
  revalidatePath('/clients');
  redirect(`/clients/${c.id}`);
}

export async function setProspectStatus(formData) {
  await requireUser();
  await q('UPDATE prospects SET status = $2 WHERE id = $1', [num(formData.get('id')), s(formData, 'status')]);
  revalidatePath('/clients');
}

export async function saveIcp(formData) {
  await requireUser();
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
