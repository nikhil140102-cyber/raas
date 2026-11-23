import { notFound } from 'next/navigation';
import { one } from '@/lib/db';
import PublicHeader from '@/components/PublicHeader';
import { slotOptions, bookingOpen } from '@/lib/screening';
import { fmtDate, ctcRange } from '@/lib/util';
import SlotPicker from './SlotPicker';
import { requestHumanPublic } from '../../_actions/screening';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pick a call time — AvaStars', robots: { index: false } };

export default async function BookPage({ params, searchParams }) {
  const { token } = await params;
  const sp = await searchParams;
  const s = await one(
    `SELECT s.*, c.name, jb.title, jb.location, jb.work_mode, jb.ctc_min, jb.ctc_max FROM screenings s
     JOIN applications a ON a.id = s.application_id JOIN candidates c ON c.id = a.candidate_id JOIN jobs jb ON jb.id = a.job_id WHERE s.token = $1`,
    [token],
  );
  if (!s) notFound();
  const first = (s.name || '').split(' ')[0];
  const days = await slotOptions();

  let body;
  if (sp.human || s.status === 'human_requested') {
    body = <div className="card"><h1 style={{ fontSize: 22 }}>Thanks, {first}</h1><p>A recruiter from AvaStars will call you personally.</p></div>;
  } else if (s.status === 'completed') {
    body = <div className="card"><h1 style={{ fontSize: 22 }}>Your screening call is done</h1><p>Thanks, {first}. Our recruiters will get back to you soon.</p></div>;
  } else if (!(await bookingOpen(s))) {
    body = <div className="card"><h1 style={{ fontSize: 22 }}>This link is no longer active</h1><p>Thanks for your interest, {first}. If you have questions, please reply to the message from your AvaStars recruiter.</p></div>;
  } else {
    body = (
      <>
        <div className="stack" style={{ gap: 6 }}>
          <h1 style={{ fontSize: 22, lineHeight: 1.25 }}>Hi {first}, your profile matches {s.title}</h1>
          <p className="sub">Pick a time for a 10-minute screening call. {s.location} · {s.work_mode} · {ctcRange(s.ctc_min, s.ctc_max)}</p>
          {s.slot_at ? <div className="notice ok">Booked for {fmtDate(s.slot_at)} (IST). You can change it below.</div> : null}
        </div>
        <SlotPicker token={token} days={days} />
        <form action={requestHumanPublic} style={{ textAlign: 'center' }}>
          <input type="hidden" name="token" value={token} />
          <button className="linkbtn" type="submit" style={{ fontSize: 14, padding: 10 }}>I&apos;d rather speak to a human recruiter</button>
        </form>
      </>
    );
  }
  return (
    <div style={{ minHeight: '100vh' }}>
      <PublicHeader />
      <main style={{ maxWidth: 480, margin: '0 auto', padding: '24px 20px 48px', display: 'flex', flexDirection: 'column', gap: 18 }}>{body}</main>
    </div>
  );
}
