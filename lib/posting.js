// Ready-to-paste job posts for each portal, plus Google for Jobs structured data.
import { appUrl } from './util';

const PORTAL_URLS = {
  linkedin: 'https://www.linkedin.com/job-posting/',
  indeed: 'https://employers.indeed.com/p/post-job',
  naukri: 'https://recruit.naukri.com/',
};
export const portalUrl = (id) => PORTAL_URLS[id] || null;

export function careersUrl(job) {
  return appUrl(`/careers/${job.slug}`);
}

/** Apply link with UTM tags so you can see which platform each applicant came from. Search engines use the clean canonical link. */
export function trackedUrl(job, platform) {
  if (!platform) return careersUrl(job);
  const p = new URLSearchParams({ utm_source: platform, utm_medium: 'social', utm_campaign: job.slug });
  return `${careersUrl(job)}?${p}`;
}

function facts(job) {
  return [
    job.location && `Location: ${job.location} (${job.work_mode})`,
    (job.exp_min || job.exp_max) && `Experience: ${job.exp_min ?? 0}–${job.exp_max ?? '+'} years`,
    (job.ctc_min || job.ctc_max) && `CTC: ₹${job.ctc_min ?? '?'}–${job.ctc_max ?? '?'} lakhs per year`,
    `Employment: ${job.employment_type}`,
    job.joining_timeline && `Joining: ${job.joining_timeline}`,
    job.openings > 1 && `Openings: ${job.openings}`,
  ].filter(Boolean);
}

export function portalPost(job, portal) {
  const must = (job.mandatory_skills || []).join(', ');
  const pref = (job.preferred_skills || []).join(', ');
  const link = careersUrl(job);
  if (portal === 'social') {
    return `We're hiring: ${job.title} — ${job.location} (${job.work_mode}).\n${job.exp_min ?? ''}–${job.exp_max ?? ''} years with ${(job.mandatory_skills || []).slice(0, 3).join(', ')}.\nApply in 2 minutes: ${link}`;
  }
  return [
    job.title,
    '',
    ...facts(job),
    '',
    job.description || '',
    '',
    must && `Must have: ${must}`,
    pref && `Good to have: ${pref}`,
    '',
    portal === 'naukri' || portal === 'linkedin' || portal === 'indeed' ? `Apply here or at ${link}` : '',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n').trim();
}

export function jobPostingJsonLd(job) {
  const lakh = 100000;
  const remote = job.work_mode === 'Remote';
  const valid = new Date(new Date(job.created_at).getTime() + 60 * 864e5);
  return {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description: (job.description || job.title).replace(/\n/g, '<br>'),
    datePosted: new Date(job.created_at).toISOString().slice(0, 10),
    validThrough: valid.toISOString(),
    employmentType: /contract/i.test(job.employment_type) ? 'CONTRACTOR' : 'FULL_TIME',
    hiringOrganization: { '@type': 'Organization', name: job.public_company || 'AvaStars', sameAs: appUrl('/careers') },
    jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: String(job.location || '').split(/[,(]/)[0].trim(), addressCountry: 'IN' } },
    ...(remote ? { jobLocationType: 'TELECOMMUTE', applicantLocationRequirements: { '@type': 'Country', name: 'India' } } : {}),
    ...(job.ctc_min || job.ctc_max
      ? { baseSalary: { '@type': 'MonetaryAmount', currency: 'INR', value: { '@type': 'QuantitativeValue', minValue: (job.ctc_min || job.ctc_max) * lakh, maxValue: (job.ctc_max || job.ctc_min) * lakh, unitText: 'YEAR' } } }
      : {}),
    ...(job.exp_min ? { experienceRequirements: { '@type': 'OccupationalExperienceRequirements', monthsOfExperience: job.exp_min * 12 } } : {}),
  };
}
