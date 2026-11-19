'use client';
import { useState } from 'react';

/** Lets candidates forward the job to friends and groups. */
export default function ShareJob({ url, title }) {
  const [copied, setCopied] = useState(false);
  const text = `We're hiring: ${title}. Apply here: ${url}`;
  const e = encodeURIComponent;
  const links = [
    ['WhatsApp', `https://wa.me/?text=${e(text)}`],
    ['LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}`],
    ['Telegram', `https://t.me/share/url?url=${e(url)}&text=${e(`We're hiring: ${title}`)}`],
    ['X', `https://twitter.com/intent/tweet?text=${e(text)}`],
    ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`],
  ];
  return (
    <section className="row" aria-label="Share this job" style={{ gap: 8 }}>
      <span className="small strong" style={{ color: 'var(--ink2)' }}>Know someone who fits? Share:</span>
      {links.map(([name, href]) => <a key={name} className="btn sm" href={href} target="_blank" rel="noreferrer">{name}</a>)}
      <button
        type="button"
        className="btn sm"
        onClick={async () => {
          try {
            if (navigator.share) await navigator.share({ title, text: `We're hiring: ${title}`, url });
            else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }
          } catch { /* user closed the share sheet */ }
        }}
      >
        {copied ? 'Link copied' : 'Copy link'}
      </button>
    </section>
  );
}
