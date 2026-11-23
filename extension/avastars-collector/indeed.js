// AvaStars Collector — Indeed for Employers support.
// These functions run inside an Indeed tab (chrome.scripting.executeScript), so each one must be self-contained.
// Page structure checked on employers.indeed.com (Nov 2026): job rows, candidate list, candidate view.

const INDEED = {
  jobsUrl: 'https://employers.indeed.com/jobs?status=open%2Cpaused',
  listUrl: (employerJobId, status) => `https://employers.indeed.com/candidates?employerJobId=${encodeURIComponent(employerJobId)}&statusName=${status === 'New' ? 'New' : 'All'}&tab=manage`,

  /** Jobs page: every posted job with its applicant counts (drafts have no applicants and are skipped). */
  readJobs: async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // Indeed builds the list after the page loads; give it up to ~25 s (it can be slow on first open).
    for (let i = 0; i < 50 && !document.querySelector('tr[data-testid="job-row"]'); i++) await wait(500);
    await wait(800); // let the counts fill in
    const num = (el) => Number(((el && el.textContent) || '').replace(/\D/g, '')) || 0;
    const jobs = [];
    for (const row of document.querySelectorAll('tr[data-testid="job-row"]')) {
      const link = row.querySelector('a[data-testid="UnifiedJobTldLink"][href*="/jobs/view"]');
      if (!link) continue;
      const id = new URL(link.href).searchParams.get('employerJobId');
      if (!id) continue;
      const lines = row.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
      const status = lines.find((l) => /^(open|paused|closed)$/i.test(l)) || '';
      jobs.push({
        id,
        title: link.textContent.replace(/\s+/g, ' ').trim(),
        all: num(row.querySelector('[data-testid="candidates-pipeline-hosted-all-link"]')),
        fresh: num(row.querySelector('[data-testid="candidates-pipeline-hosted-new-link"]')),
        status,
      });
    }
    const loggedOut = /login|signin|auth/i.test(location.pathname + location.hostname) || !!document.querySelector('input[type="password"]');
    const rowCount = document.querySelectorAll('tr[data-testid="job-row"]').length;
    return { jobs, loggedOut, rowCount, path: location.hostname + location.pathname, title: document.title.slice(0, 60), hidden: document.visibilityState === 'hidden' };
  },

  /** Candidate list page: the rows on the current page plus paging info. */
  readList: async (previousFirst) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const firstHref = () => document.querySelector('[data-testid="table-row"] a[data-testid="NameCell"]')?.href || '';
    for (let i = 0; i < 30; i++) {
      const counter = document.querySelector('[data-testid="pagination-candidate-counter"]');
      const empty = /no candidates|no applicants|0 candidates/i.test(document.body.innerText.slice(0, 20000)) && !firstHref();
      if ((firstHref() && firstHref() !== previousFirst) || (empty && i > 4) || (counter && !firstHref() && i > 6)) break;
      await wait(500);
    }
    const rows = [...document.querySelectorAll('[data-testid="table-row"]')].map((r) => {
      const a = r.querySelector('a[data-testid="NameCell"]');
      return {
        name: (a?.textContent || '').replace(/\s+/g, ' ').trim(),
        href: a?.href || '',
        location: (r.querySelector('[data-testid="CandidateInfoColumn-location"]')?.textContent || '').replace(/\s+/g, ' ').trim(),
        applied: (r.querySelector('[data-testid="CandidateInfoColumn-apply"]')?.textContent || '').replace(/\s+/g, ' ').trim(),
      };
    }).filter((r) => r.href);
    const nav = document.querySelector('nav[aria-label="pagination"]');
    const next = nav && [...nav.querySelectorAll('button')].find((b) => /next/i.test(b.textContent || b.getAttribute('aria-label') || ''));
    return {
      rows,
      counter: document.querySelector('[data-testid="pagination-candidate-counter"]')?.textContent || '',
      hasNext: Boolean(next && !next.disabled && next.getAttribute('aria-disabled') !== 'true'),
      loggedOut: /login|signin|auth/i.test(location.pathname),
    };
  },

  /** Clicks "Next" on the candidate list. */
  nextPage: () => {
    const nav = document.querySelector('nav[aria-label="pagination"]');
    const next = nav && [...nav.querySelectorAll('button')].find((b) => /next/i.test(b.textContent || b.getAttribute('aria-label') || ''));
    if (!next || next.disabled) return false;
    next.click();
    return true;
  },

  /** Candidate page: waits for the resume and returns it as base64 (it is already loaded in the page). */
  readProfile: async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let link = null;
    for (let i = 0; i < 24; i++) {
      link = document.querySelector('[data-testid="download-resume-inline"]')?.closest('a') || document.querySelector('a[data-testid="download-resume-moreActions"]');
      if (link?.href) break;
      if (i > 10 && document.querySelector('[data-testid="candidate-review-page"]') && !document.querySelector('[data-testid="ProfileResumePanel"]')) break;
      await wait(500);
    }
    const out = { location: '' };
    const plate = document.querySelector('[data-testid="name-plate-item"]');
    if (plate) out.location = plate.textContent.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!link?.href) return { ...out, noResume: true };
    try {
      const res = await fetch(link.href);
      const blob = await res.blob();
      if (blob.size > 8 * 1024 * 1024) return { ...out, error: 'Resume is over 8 MB' };
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
      return { ...out, b64: btoa(s), filename: link.getAttribute('download') || 'resume.pdf', mime: blob.type || 'application/pdf' };
    } catch (e) {
      return { ...out, error: `Could not read the resume (${e.message})` };
    }
  },
};
