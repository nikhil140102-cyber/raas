import { cfg } from '@/lib/config';
import { NextResponse } from 'next/server';
import { cronAllowed } from '@/lib/cronAuth';
import { q } from '@/lib/db';
import { ingestResume } from '@/lib/ingest';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Reads unread emails in the careers inbox and imports PDF/DOCX attachments.
// If the subject contains an open job title, the resume is matched to that job.
export async function GET(req) {
  if (!cronAllowed(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!cfg('IMAP_HOST')) return NextResponse.json({ skipped: 'IMAP not configured' });
  const { ImapFlow } = await import('imapflow');
  const { simpleParser } = await import('mailparser');
  const jobs = await q(`SELECT id, title FROM jobs WHERE status = 'open'`);
  const client = new ImapFlow({
    host: cfg('IMAP_HOST'), port: Number(cfg('IMAP_PORT') || 993), secure: true,
    auth: { user: cfg('IMAP_USER'), pass: cfg('IMAP_PASS') }, logger: false,
  });
  const results = [];
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const uids = await client.search({ seen: false });
    for (const uid of (uids || []).slice(0, 25)) {
      const msg = await client.fetchOne(uid, { source: true }, { uid: true });
      const mail = await simpleParser(msg.source);
      const subject = (mail.subject || '').toLowerCase();
      const job = jobs.find((j) => subject.includes(j.title.toLowerCase()));
      for (const a of mail.attachments || []) {
        if (!/\.(pdf|docx)$/i.test(a.filename || '')) continue;
        const r = await ingestResume({ buffer: a.content, filename: a.filename, mime: a.contentType, source: 'Careers inbox', jobId: job?.id || null, overrides: { email: mail.from?.value?.[0]?.address } });
        results.push({ file: a.filename, status: r.status });
      }
      await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
    }
  } finally {
    lock.release();
    await client.logout();
  }
  return NextResponse.json({ imported: results.length, results });
}
