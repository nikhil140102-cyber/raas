// Sourcing: statuses for prospects and the search links built from skills.
export const SOURCING_STATUSES = [['to_contact', 'To contact'], ['messaged', 'Messaged'], ['replied', 'Replied'], ['interested', 'Interested'], ['not_interested', 'Not interested']];

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
