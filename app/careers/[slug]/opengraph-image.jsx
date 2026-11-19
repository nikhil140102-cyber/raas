import { ImageResponse } from 'next/og';
import { one } from '@/lib/db';

// The preview picture WhatsApp, LinkedIn, Telegram and others show when the job link is shared.
export const runtime = 'nodejs';
export const alt = 'Job opening at AvaStars';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }) {
  const { slug } = await params;
  const job = await one('SELECT * FROM jobs WHERE slug = $1', [slug]);
  const title = job?.title || 'Open roles';
  const chips = job
    ? [
      [job.location, job.work_mode].filter(Boolean).join(' · '),
      job.exp_min || job.exp_max ? `${job.exp_min ?? 0}-${job.exp_max ?? '+'} yrs` : null,
      job.ctc_min || job.ctc_max ? `INR ${job.ctc_min ?? '?'}-${job.ctc_max ?? '?'} LPA` : null,
    ].filter(Boolean)
    : [];
  const skills = (job?.mandatory_skills || []).slice(0, 5).join('  ·  ');

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 64, background: '#F6F7F9', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#4F46E5', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, fontWeight: 700 }}>A</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#101828' }}>AvaStars Careers</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: '#4F46E5', letterSpacing: 2 }}>WE&apos;RE HIRING</div>
          <div style={{ display: 'flex', fontSize: title.length > 34 ? 60 : 76, fontWeight: 700, color: '#101828', lineHeight: 1.1 }}>{title}</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {chips.map((c) => (
              <div key={c} style={{ display: 'flex', padding: '12px 22px', borderRadius: 999, background: '#FFFFFF', border: '2px solid #E4E7EC', fontSize: 28, color: '#344054' }}>{c}</div>
            ))}
          </div>
          {skills ? <div style={{ display: 'flex', fontSize: 26, color: '#5B6474' }}>{skills}</div> : null}
        </div>
        <div style={{ display: 'flex', alignSelf: 'flex-start', padding: '16px 30px', borderRadius: 14, background: '#4F46E5', color: '#FFFFFF', fontSize: 30, fontWeight: 700 }}>Apply in 2 minutes</div>
      </div>
    ),
    size,
  );
}
