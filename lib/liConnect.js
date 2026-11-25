'use client';
// Asks the AvaStars Collector extension (if installed) to send a LinkedIn connection request.
// The extension opens the profile, clicks LinkedIn's Connect → "Send without a note", and records it in AvaStars.
// Without the extension (or an older one) the profile just opens and you click Connect yourself.

const extVersion = () => (typeof document !== 'undefined' && document.documentElement.getAttribute('data-avastars-ext')) || '';
const atLeast = (v, want) => {
  const a = v.split('.').map(Number); const b = want.split('.').map(Number);
  for (let i = 0; i < b.length; i++) { if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i]; }
  return true;
};
export const canAutoConnect = () => atLeast(extVersion() || '0', '1.8.0');

/** Returns { mode: 'auto' } when the extension took it, { mode: 'manual' } when the profile was just opened, or { mode: 'error', error }. */
export function sendConnect(url, name) {
  if (!canAutoConnect()) { window.open(url, '_blank', 'noopener'); return Promise.resolve({ mode: 'manual' }); }
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    const done = (r) => { window.removeEventListener('message', on); clearTimeout(t); resolve(r); };
    const on = (e) => {
      if (e.source !== window || e.data?.type !== 'AVASTARS_LI_CONNECT_ACK' || e.data.id !== id) return;
      done(e.data.ok ? { mode: 'auto' } : { mode: 'error', error: e.data.error || 'The extension could not start.' });
    };
    const t = setTimeout(() => { window.open(url, '_blank', 'noopener'); done({ mode: 'manual' }); }, 2500);
    window.addEventListener('message', on);
    window.postMessage({ type: 'AVASTARS_LI_CONNECT', id, url, name: String(name || '').slice(0, 80) }, window.location.origin);
  });
}

/**
 * "Create post on LinkedIn": the extension (1.9+) opens LinkedIn, starts a post and types the text in;
 * you click Post (or LinkedIn's clock icon to schedule). Without it, LinkedIn's share box opens with the
 * text (the text is also copied, in case LinkedIn drops it).
 */
export function createLinkedInPost(text, jobId) {
  const fallback = () => {
    navigator.clipboard?.writeText(text).catch(() => {});
    window.open(`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    return { mode: 'manual' };
  };
  if (!atLeast(extVersion() || '0', '1.9.0')) return Promise.resolve(fallback());
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    const done = (r) => { window.removeEventListener('message', on); clearTimeout(t); resolve(r); };
    const on = (e) => {
      if (e.source !== window || e.data?.type !== 'AVASTARS_LI_POST_ACK' || e.data.id !== id) return;
      done(e.data.ok ? { mode: 'auto' } : { mode: 'error', error: e.data.error || 'The extension could not start.' });
    };
    const t = setTimeout(() => done(fallback()), 2500);
    window.addEventListener('message', on);
    window.postMessage({ type: 'AVASTARS_LI_POST', id, text: String(text || '').slice(0, 3000), jobId: Number(jobId) || null }, window.location.origin);
  });
}
