'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  ['/', 'Dashboard'],
  ['/clients', 'Clients'],
  ['/jobs', 'Jobs & posting'],
  ['/resumes', 'Resume database'],
  ['/pipeline', 'Pipeline'],
  ['/screening', 'AI screening'],
  ['/interviews', 'Interviews & offers'],
  ['/settings', 'Settings'],
];

export default function Sidebar({ user, logout }) {
  const path = usePathname();
  const active = (href) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
  return (
    <nav className="side" aria-label="Main">
      <Link href="/" className="brand">
        <span className="logo">A</span>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>AvaStars Hire</span>
          <span className="tiny muted">Recruitment workspace</span>
        </span>
      </Link>
      <span className="navlabel">Workspace</span>
      {NAV.map(([href, label]) => (
        <Link key={href} href={href} className="navlink" aria-current={active(href) ? 'page' : undefined}>
          <span className="mark" aria-hidden="true" />
          {label}
        </Link>
      ))}
      <span className="navlabel">Shared pages</span>
      <a href="/careers" target="_blank" rel="noreferrer" className="navlink"><span className="mark" aria-hidden="true" style={{ borderRadius: '50%' }} />Careers page ↗</a>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderTop: '1px solid var(--line)' }}>
        <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>HR</span>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <span className="small strong">{user?.name}</span>
          <span className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</span>
        </span>
        <form action={logout}><button className="linkbtn" type="submit">Log out</button></form>
      </div>
    </nav>
  );
}
