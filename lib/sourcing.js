// Sourcing: statuses for prospects and the search links built from skills.
export const SOURCING_STATUSES = [['to_contact', 'To contact'], ['request_sent', 'Request sent'], ['connected', 'Connected'], ['messaged', 'Messaged'], ['replied', 'Replied'], ['interested', 'Interested'], ['not_interested', 'Not interested']];

const quote = (s) => (/\s/.test(s) ? `"${s}"` : s);

/** Search links for open-to-work people with the given skills. Each opens in the recruiter's own browser. */
export function sourcingLinks({ skills = [], title = '', location = '', openToWork = true }) {
  const sk = skills.map((x) => x.trim()).filter(Boolean).slice(0, 6);
  const e = encodeURIComponent;
  const liKeywords = [openToWork ? '"open to work"' : '', title ? quote(title) : '', ...sk.map(quote), location ? quote(location) : ''].filter(Boolean).join(' ');
  const google = ['site:linkedin.com/in', openToWork ? '("open to work" OR "#opentowork")' : '', title ? `"${title}"` : '', ...sk.map((x) => `"${x}"`), location ? `"${location}"` : '', '-intitle:jobs'].filter(Boolean).join(' ');
  const posts = ['#opentowork', title, ...sk.slice(0, 3), location].filter(Boolean).join(' ');
  return [
    { id: 'li-people', name: 'LinkedIn people search', hint: 'People whose profile mentions these skills (and "open to work"). Use LinkedIn\'s filters for location and connections.', url: `https://www.linkedin.com/search/results/people/?keywords=${e(liKeywords)}&origin=GLOBAL_SEARCH_HEADER` },
    { id: 'li-posts', name: 'LinkedIn #OpenToWork posts', hint: 'Recent posts from people announcing they are looking for a job. Often the most active seekers.', url: `https://www.linkedin.com/search/results/content/?keywords=${e(posts)}&sortBy=%22date_posted%22` },
    { id: 'google', name: 'Google search of LinkedIn profiles', hint: 'Finds public profiles LinkedIn search may hide (no LinkedIn limits).', url: `https://www.google.com/search?q=${e(google)}&num=20` },
  ];
}

/** LinkedIn allows roughly 100 connection requests a week; we warn before that. */
export const WEEKLY_INVITE_LIMIT = 100;

// ---------------------------------------------------------------- finding new people (Google results via Serper.dev)
// Google's public search results for LinkedIn profiles: name, headline and a short snippet. Nothing is read
// from LinkedIn itself, and nothing is stored until a recruiter clicks Save or Connect.

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** "Rohan Negi - Site Reliability Engineer - Infosys | LinkedIn" -> { name, headline, company } */
export function parseProfileTitle(title) {
  const t = clean(title).replace(/\s*\|\s*LinkedIn.*$/i, '').replace(/\s*-\s*LinkedIn.*$/i, '');
  const parts = t.split(/\s+[-–—|]\s+/).map(clean).filter(Boolean);
  const dash = t.split(/\s+[-–—]\s+/).map(clean).filter(Boolean); // Google's "Name - Title - Company" pattern
  return { name: (parts[0] || '').replace(/,.*$/, '').slice(0, 120), headline: parts.slice(1).join(' · ').slice(0, 200), company: dash.length === 3 && !/\|/.test(dash[2]) ? dash[2].slice(0, 120) : '' };
}

export function profileSlugUrl(link) {
  const m = String(link || '').match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? `https://www.linkedin.com/in/${decodeURIComponent(m[1]).toLowerCase()}/` : null;
}

function locationFrom(snippet, wanted) {
  const s = clean(snippet);
  const m = s.match(/Location:\s*([^·|.;]+)/i) || s.match(/\b([A-Z][a-zA-Z .-]+,\s*(?:[A-Z][a-zA-Z .-]+,\s*)?India)\b/);
  if (m) return clean(m[1]).slice(0, 80);
  return wanted && s.toLowerCase().includes(wanted.toLowerCase()) ? wanted : '';
}

/** How many of the wanted skills / title words appear in what Google shows, as a %. */
export function keywordMatch(text, skills, title) {
  const t = String(text || '').toLowerCase();
  const words = [...skills.map((x) => x.trim().toLowerCase()).filter(Boolean)];
  if (title) words.push(title.toLowerCase());
  if (!words.length) return null;
  const hits = words.filter((w) => t.includes(w)).length;
  return Math.round((hits / words.length) * 100);
}

/**
 * Searches Google (through Serper.dev) for public LinkedIn profiles. Returns up to `want` people.
 * Starts strict (open to work + title + skills + city) and widens step by step when Google has too few:
 * fewer skills, then without "open to work", then without the exact title. Each page costs one credit.
 */
export async function findPeople({ apiKey, skills = [], title = '', location = '', openToWork = true, want = 20, maxCredits = 8 }) {
  const sk = skills.map((x) => x.trim()).filter(Boolean).slice(0, 6);
  const build = ({ otw, skills: s, withTitle }) => ['site:linkedin.com/in', otw ? '("open to work" OR "#opentowork" OR "immediate joiner")' : '',
    withTitle && title ? `"${title}"` : '', ...s.map((x) => `"${x}"`), location ? `"${location}"` : '', '-intitle:jobs -inurl:jobs'].filter(Boolean).join(' ');
  const plans = [];
  const add = (p) => { const q = build(p); if (!plans.some((x) => x.q === q)) plans.push({ ...p, q }); };
  add({ otw: openToWork, skills: sk, withTitle: true });
  if (sk.length > 2) add({ otw: openToWork, skills: sk.slice(0, 2), withTitle: true });
  if (openToWork) add({ otw: false, skills: sk.slice(0, 2), withTitle: true });
  if (title && sk.length) add({ otw: false, skills: sk.slice(0, 3), withTitle: false });
  if (title) add({ otw: false, skills: [], withTitle: true });

  const people = []; const seen = new Set(); let used = 0; const queries = [];
  for (const plan of plans) {
    for (let page = 1; page <= 2 && people.length < want && used < maxCredits; page++) {
      const res = await fetch(process.env.SERPER_ENDPOINT || 'https://google.serper.dev/search', { // SERPER_ENDPOINT: tests only
        method: 'POST', headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: plan.q, gl: 'in', hl: 'en', num: 10, page }),
      });
      used++;
      if (res.status === 401 || res.status === 403) throw new Error('The Serper.dev API key was refused. Check it in Settings → Keys & connections → Sourcing.');
      if (res.status === 429 || res.status === 402) throw new Error('Serper.dev says the free searches are used up (or too many at once). Add credits at serper.dev or try later.');
      if (!res.ok) throw new Error(`Search service error (HTTP ${res.status}).`);
      const data = await res.json();
      const organic = data.organic || [];
      if (page === 1) queries.push({ q: plan.q, results: organic.length });
      for (const r of organic) {
        const url = profileSlugUrl(r.link);
        if (!url || seen.has(url)) continue;
        const { name, headline, company } = parseProfileTitle(r.title);
        if (!name || /^(top|best|\d+)\b/i.test(name)) continue;
        seen.add(url);
        const text = `${r.title} ${r.snippet || ''}`;
        people.push({
          name, headline, company, profile_url: url, snippet: clean(r.snippet).slice(0, 300),
          location: locationFrom(r.snippet, location),
          open_to_work: /open to work|#opentowork|looking for (new )?(job|opportunit)|immediate joiner|actively (looking|seeking)/i.test(text),
          match: keywordMatch(text, sk, title),
        });
        if (people.length >= want) break;
      }
      if (organic.length < 10) break; // this search has no more pages
    }
    if (people.length >= want || used >= maxCredits) break;
  }
  // Best matches first: skill match, then open to work.
  people.sort((x, y) => (y.match ?? 0) - (x.match ?? 0) || Number(y.open_to_work) - Number(x.open_to_work));
  return { people, query: plans[0]?.q || '', queries, used };
}
