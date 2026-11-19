import { notFound } from 'next/navigation';
import { one } from '@/lib/db';
import PublicHeader from '@/components/PublicHeader';
import { expRange, ctcRange } from '@/lib/util';
import { jobPostingJsonLd } from '@/lib/posting';
import ApplyForm from './ApplyForm';
import ShareJob from './ShareJob';
import { careersUrl } from '@/lib/posting';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const job = await one('SELECT * FROM jobs WHERE slug = $1', [slug]);
  if (!job) return { title: 'Job not found' };
  const title = `We're hiring: ${job.title}`;
  const description = [job.location && `${job.location} (${job.work_mode})`, (job.exp_min || job.exp_max) ? expRange(job.exp_min, job.exp_max) : null, job.ctc_min || job.ctc_max ? `${ctcRange(job.ctc_min, job.ctc_max)} per year` : null, 'Apply in 2 minutes.'].filter(Boolean).join(' · ');
  return {
    title: `${job.title} — ${job.location} | AvaStars Careers`,
    description,
    alternates: { canonical: careersUrl(job) },
    openGraph: { type: 'website', url: careersUrl(job), title, description, siteName: 'AvaStars Careers' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function JobPublicPage({ params }) {
  const { slug } = await params;
  const job = await one('SELECT * FROM jobs WHERE slug = $1', [slug]);
  if (!job) notFound();
  const open = job.status === 'open';
  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      {open ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingJsonLd(job)).replace(/</g, '\\u003c') }} /> : null}
      <PublicHeader title="AvaStars Careers" right={<a href="/careers" className="small strong" style={{ textDecoration: 'none' }}>All open roles</a>} />
      <main className="container" style={{ maxWidth: 880 }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1>{job.title}</h1>
          <p className="sub">{[job.public_company || 'AvaStars client', job.location, job.work_mode, (job.exp_min || job.exp_max) ? expRange(job.exp_min, job.exp_max) : null, (job.ctc_min || job.ctc_max) ? ctcRange(job.ctc_min, job.ctc_max) : null, job.employment_type].filter(Boolean).join(' · ')}</p>
        </div>
        {!open ? <div className="notice warn">This role is closed. <a href="/careers">See other open roles</a>.</div> : null}
        <section className="stack" style={{ gap: 10 }}>
          <p className="pre" style={{ lineHeight: 1.7, color: 'var(--ink2)' }}>{job.description}</p>
          {(job.mandatory_skills || []).length ? <p><strong>Must have:</strong> {job.mandatory_skills.join(', ')}</p> : null}
          {(job.preferred_skills || []).length ? <p><strong>Good to have:</strong> {job.preferred_skills.join(', ')}</p> : null}
        </section>
        {open ? <ShareJob url={careersUrl(job)} title={job.title} /> : null}
        {open ? <ApplyForm jobId={job.id} title={job.title} /> : null}
      </main>
    </div>
  );
}
