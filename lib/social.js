// Hiring announcements: ready-made posts per platform, share links,
// and direct posting to the signed-in HR person's LinkedIn profile.
import { aiEnabled, claudeJson } from './ai';
import { appUrl } from './util';
import { careersUrl } from './posting';

export const PLATFORMS = [
  { id: 'linkedin', name: 'LinkedIn', hint: 'Post on your profile or the company page. Links get a preview card with the job details.' },
  { id: 'whatsapp', name: 'WhatsApp', hint: 'Share in groups, communities and status.' },
  { id: 'x', name: 'X (Twitter)', hint: 'Short post with the apply link.' },
  { id: 'facebook', name: 'Facebook', hint: 'Share to your page or job groups.' },
  { id: 'instagram', name: 'Instagram', hint: 'Caption for a post or story. Put the apply link in your bio or story link sticker.' },
  { id: 'telegram', name: 'Telegram', hint: 'Share in job channels and groups.' },
];

const tag = (s) => '#' + String(s).replace(/\(.*?\)/g, '').replace(/[^A-Za-z0-9]+/g, '');
const lpa = (job) => (job.ctc_min || job.ctc_max ? `₹${job.ctc_min ?? '?'}–${job.ctc_max ?? '?'} LPA` : null);
const exp = (job) => (job.exp_min || job.exp_max ? `${job.exp_min ?? 0}–${job.exp_max ?? '+'} yrs` : null);

/** Sample posts: 2-3 ready-made styles per platform that HR can pick and post as-is. */
function templates(job) {
  const link = careersUrl(job);
  const where = [job.location, job.work_mode].filter(Boolean).join(' · ');
  const must = (job.mandatory_skills || []).slice(0, 5);
  const city = job.location ? String(job.location).split(/[ ,(]/)[0] : '';
  const tags = [...must.slice(0, 3).map(tag), '#hiring', '#jobs', city ? tag(city) + 'Jobs' : null].filter(Boolean).join(' ');
  const facts = [where && `📍 ${where}`, exp(job) && `💼 ${exp(job)}`, lpa(job) && `💰 ${lpa(job)}`, job.openings > 1 && `👥 ${job.openings} openings`].filter(Boolean).join('\n');
  const join = job.joining_timeline ? ` Joining: ${job.joining_timeline.toLowerCase()}.` : '';
  return {
    linkedin: [
      { label: 'Professional', text: `We're hiring: ${job.title}\n\n${facts}\n\nWhat you'll need:\n${must.map((x) => `• ${x}`).join('\n')}\n\nKnow someone who fits? Tag them or share this post.\n\nApply in 2 minutes: ${link}\n\n${tags}` },
      { label: 'Short & quick', text: `Hiring now: ${job.title} (${where}${exp(job) ? `, ${exp(job)}` : ''}).\nSkills: ${must.join(', ')}.${lpa(job) ? `\nCTC: ${lpa(job)}.` : ''}\n\nApply here 👉 ${link}\n\n${tags}` },
      { label: 'Referral ask', text: `My network, I need your help 🙌\n\nWe're looking for a ${job.title} in ${job.location || 'India'} (${job.work_mode}).${exp(job) ? ` ${exp(job)} of experience` : ''}${must.length ? ` with ${must.slice(0, 3).join(', ')}` : ''}.${join}\n\nIf this sounds like you or someone you know, apply or share: ${link}\n\nA comment or repost helps it reach the right person. Thank you!\n\n${tags}` },
    ],
    whatsapp: [
      { label: 'Group message', text: `*We're hiring: ${job.title}*\n${facts}\nSkills: ${must.join(', ')}\n\nApply here: ${link}\nPlease share with anyone who fits 🙏` },
      { label: 'Status / short', text: `Hiring: ${job.title} · ${where}${lpa(job) ? ` · ${lpa(job)}` : ''}\nApply: ${link}` },
    ],
    x: [
      { label: 'Standard', text: `We're hiring a ${job.title} (${where}${exp(job) ? `, ${exp(job)}` : ''}). Skills: ${must.slice(0, 3).join(', ')}. Apply: ${link} ${tags.split(' ').slice(0, 3).join(' ')}` },
      { label: 'Referral ask', text: `Know a ${job.title} in ${city || 'India'}? We're hiring${lpa(job) ? ` (${lpa(job)})` : ''}. Apply or share: ${link} #hiring` },
    ],
    facebook: [
      { label: 'Page post', text: `📢 We're hiring: ${job.title}\n\n${facts}\nSkills: ${must.join(', ')}\n\nApply in 2 minutes: ${link}` },
      { label: 'Job group post', text: `Job opening: ${job.title}\nLocation: ${where}\n${exp(job) ? `Experience: ${exp(job)}\n` : ''}${lpa(job) ? `CTC: ${lpa(job)}\n` : ''}Skills: ${must.join(', ')}\n\nApply here: ${link}` },
    ],
    instagram: [
      { label: 'Post caption', text: `We're hiring! ${job.title}\n\n${facts}\nSkills: ${must.join(', ')}\n\nApply via the link in bio.\n\n${tags}` },
      { label: 'Story text', text: `HIRING\n${job.title}\n${where}\nTap the link to apply` },
    ],
    telegram: [
      { label: 'Channel post', text: `🔔 Job: ${job.title}\n${facts}\nSkills: ${must.join(', ')}\nApply: ${link}` },
    ],
  };
}

/** Posts for every platform: sample styles, plus an AI-written version first when a key is set. */
export async function buildPosts(job) {
  const base = templates(job);
  if (!aiEnabled()) return base;
  try {
    const link = careersUrl(job);
    const out = await claudeJson(
      'You write hiring announcements for an Indian recruitment agency. Plain, friendly, specific. Never invent benefits, company names or facts that are not given. Every post must contain the apply link exactly as given.',
      `Job: ${job.title}\nShown company name: ${job.public_company || 'AvaStars (recruiting for a client)'}\nLocation: ${job.location} (${job.work_mode})\nExperience: ${exp(job) || 'not given'}\nSalary: ${lpa(job) || 'not given'}\nOpenings: ${job.openings}\nMust have: ${(job.mandatory_skills || []).join(', ')}\nGood to have: ${(job.preferred_skills || []).join(', ')}\nJob summary: ${(job.description || '').slice(0, 1200)}\nApply link: ${link}\n\nReturn JSON with keys linkedin (120-200 words, short lines, 3-5 hashtags at the end), whatsapp (under 70 words, *bold* title), x (under 260 characters including the link), facebook (60-100 words), instagram (caption, says "link in bio", hashtags), telegram (under 60 words).`,
      1800,
    );
    const merged = {};
    for (const k of Object.keys(base)) {
      let t = typeof out[k] === 'string' ? out[k].trim() : '';
      if (t && k !== 'instagram' && !t.includes(link)) t += `\n\nApply: ${link}`;
      merged[k] = t ? [{ label: 'AI-written', text: t }, ...base[k]] : base[k];
    }
    return merged;
  } catch (e) {
    console.error('buildPosts AI failed, using samples:', e.message);
    return base;
  }
}

// ---------------------------------------------------------------- job portal forms (Indeed, Naukri)
const PORTAL_FORMS = {
  indeed: { name: 'Indeed', url: 'https://employers.indeed.com/p/post-job' },
  naukri: { name: 'Naukri.com', url: 'https://recruit.naukri.com/' },
};

/** The job laid out in the same order as each portal's "post a job" form, one copyable field at a time. */
export function portalKit(job, portal) {
  const must = (job.mandatory_skills || []).join(', ');
  const pref = (job.preferred_skills || []).join(', ');
  const mode = { WFO: 'On-site (work from office)', Hybrid: 'Hybrid', Remote: 'Remote' }[job.work_mode] || job.work_mode;
  const type = /contract/i.test(job.employment_type) ? (/hire/i.test(job.employment_type) ? 'Contract to hire' : 'Contract') : 'Full-time / Permanent';
  const city = String(job.location || '').replace(/\(.*?\)/g, '').trim();
  const questions = (job.screening_questions || []).map((x, i) => `${i + 1}. ${x.q}`).join('\n');
  const description = [
    job.description || '',
    must && `\nMust have: ${must}`,
    pref && `Good to have: ${pref}`,
    job.joining_timeline && `Joining: ${job.joining_timeline}`,
    `\nApply directly: ${careersUrl(job)}`,
  ].filter(Boolean).join('\n').trim();
  const pay = job.ctc_min || job.ctc_max;
  if (portal === 'indeed') {
    return {
      ...PORTAL_FORMS.indeed,
      fields: [
        ['Job title', job.title],
        ['Job location (city)', city],
        ['Work setting', mode],
        ['Job type', type],
        ['Number of people to hire', String(job.openings || 1)],
        ['Pay (per year, INR)', pay ? `₹${(job.ctc_min ?? job.ctc_max) * 100000} – ₹${(job.ctc_max ?? job.ctc_min) * 100000}` : 'Not disclosed'],
        ['Experience', exp(job) || 'Not specified'],
        ['Skills', must],
        ['Job description', description],
        ['Screening questions', questions || 'None'],
      ],
    };
  }
  return {
    ...PORTAL_FORMS.naukri,
    fields: [
      ['Job title / designation', job.title],
      ['Employment type', type],
      ['Key skills', [must, pref].filter(Boolean).join(', ')],
      ['Work experience (years)', job.exp_min || job.exp_max ? `${job.exp_min ?? 0} to ${job.exp_max ?? (job.exp_min ?? 0) + 5}` : 'Not specified'],
      ['Annual CTC (lakhs)', pay ? `${job.ctc_min ?? job.ctc_max} to ${job.ctc_max ?? job.ctc_min} Lacs` : 'Not disclosed'],
      ['Job location(s)', city],
      ['Work mode', mode],
      ['Number of vacancies', String(job.openings || 1)],
      ['Job description', description],
      ['Industry / department / education', 'Pick these from Naukri’s drop-downs (not in this requirement)'],
    ],
  };
}

/** Links that open each app's share screen. LinkedIn and Facebook only accept the link (the preview card comes from the job page). */
export function shareLinks(job) {
  const link = careersUrl(job);
  const e = encodeURIComponent;
  return {
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${e(link)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${e(link)}`,
    instagram: null,
    // WhatsApp, X and Telegram links are built in the browser from the edited text.
    whatsapp: 'text', x: 'text', telegram: 'text',
  };
}

// ---------------------------------------------------------------- LinkedIn API (profile posting)
export const linkedinConfigured = () => Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
export const linkedinRedirect = () => appUrl('/api/linkedin/callback');

export function linkedinAuthUrl(state) {
  const p = new URLSearchParams({ response_type: 'code', client_id: process.env.LINKEDIN_CLIENT_ID, redirect_uri: linkedinRedirect(), state, scope: 'openid profile w_member_social' });
  return `https://www.linkedin.com/oauth/v2/authorization?${p}`;
}

export async function linkedinExchange(code) {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: linkedinRedirect(), client_id: process.env.LINKEDIN_CLIENT_ID, client_secret: process.env.LINKEDIN_CLIENT_SECRET }),
  });
  const tok = await res.json();
  if (!res.ok) throw new Error(tok.error_description || tok.error || `LinkedIn token error ${res.status}`);
  const me = await (await fetch('https://api.linkedin.com/v2/userinfo', { headers: { authorization: `Bearer ${tok.access_token}` } })).json();
  if (!me.sub) throw new Error('Could not read your LinkedIn profile');
  return { token: tok.access_token, expiresAt: Date.now() + (tok.expires_in || 0) * 1000, sub: me.sub, name: me.name || 'LinkedIn member' };
}

// LinkedIn's post text format treats these characters as markup, so they must be escaped.
// Hashtags are converted to LinkedIn's hashtag template so they stay clickable.
function littleText(s) {
  return String(s)
    .replace(/[\\|{}@[\]()<>*_~]/g, (c) => `\\${c}`)
    .replace(/#(\w+)/g, '{hashtag|\\#|$1}');
}

export async function linkedinPost(conn, text, job) {
  const res = await fetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${conn.token}`,
      'content-type': 'application/json',
      'LinkedIn-Version': process.env.LINKEDIN_API_VERSION || '202608',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: `urn:li:person:${conn.sub}`,
      commentary: littleText(text),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { article: { source: careersUrl(job), title: `We're hiring: ${job.title}`, description: [job.location, job.work_mode, lpa(job)].filter(Boolean).join(' · ') } },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LinkedIn said ${res.status}: ${body.slice(0, 200)}`);
  }
  const urn = res.headers.get('x-restli-id');
  return urn ? `https://www.linkedin.com/feed/update/${urn}/` : null;
}
