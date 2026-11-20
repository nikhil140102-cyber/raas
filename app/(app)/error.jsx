'use client';
// Shown when a page or button fails. In production the server hides error details, so we explain the two usual causes.
import Link from 'next/link';

export default function AppError({ error, reset }) {
  const msg = String(error?.message || '');
  const shown = msg && !/Server Components render|digest/i.test(msg) ? msg : '';
  return (
    <section className="card" style={{ maxWidth: 640 }}>
      <h2>That didn&apos;t work</h2>
      <p className="small">{shown || "Either your role doesn't allow this action, or something went wrong on the server."}</p>
      <p className="small muted">If you think you should have access, ask an admin to check your role under Settings → Users and roles.</p>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn primary" onClick={() => reset()}>Try again</button>
        <Link href="/" className="btn">Go to dashboard</Link>
      </div>
      {error?.digest ? <p className="tiny muted">Error reference: {error.digest}</p> : null}
    </section>
  );
}
