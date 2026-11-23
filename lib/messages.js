import { cfg } from './config';
// Email and WhatsApp. Every message is stored in the Outbox; it is only sent
// when SMTP / WhatsApp settings exist.
import { q } from './db';

let transporter;
async function getTransport() {
  if (!cfg('SMTP_HOST')) return null;
  if (!transporter) {
    const nodemailer = (await import('nodemailer')).default;
    transporter = nodemailer.createTransport({
      host: cfg('SMTP_HOST'),
      port: Number(cfg('SMTP_PORT') || 587),
      secure: Number(cfg('SMTP_PORT')) === 465,
      auth: cfg('SMTP_USER') ? { user: cfg('SMTP_USER'), pass: cfg('SMTP_PASS') } : undefined,
    });
  }
  return transporter;
}

export async function sendEmail({ to, subject, text, attachments }) {
  if (!to) return { status: 'skipped' };
  const t = await getTransport();
  let status = 'logged'; let error = null;
  if (t) {
    try {
      await t.sendMail({ from: cfg('SMTP_FROM') || cfg('SMTP_USER'), to, subject, text, attachments });
      status = 'sent';
    } catch (e) {
      status = 'failed'; error = e.message;
    }
  }
  await q('INSERT INTO messages (channel, to_addr, subject, body, status, error) VALUES ($1,$2,$3,$4,$5,$6)', ['email', to, subject, text, status, error]);
  return { status, error };
}

export async function sendWhatsApp({ to, text }) {
  if (!to) return { status: 'skipped' };
  let status = 'logged'; let error = null;
  if (cfg('WHATSAPP_WEBHOOK_URL')) {
    try {
      const res = await fetch(cfg('WHATSAPP_WEBHOOK_URL'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cfg('WHATSAPP_WEBHOOK_TOKEN') ? { authorization: `Bearer ${cfg('WHATSAPP_WEBHOOK_TOKEN')}` } : {}) },
        body: JSON.stringify({ to, text }),
      });
      status = res.ok ? 'sent' : 'failed';
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (e) {
      status = 'failed'; error = e.message;
    }
  }
  await q('INSERT INTO messages (channel, to_addr, subject, body, status, error) VALUES ($1,$2,$3,$4,$5,$6)', ['whatsapp', to, null, text, status, error]);
  return { status, error };
}
