'use client';
// App frame with a YouTube-style menu: ☰ switches between the full menu and an
// icons-only rail on desktop, and slides the menu in/out on phones.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './Icon';
import { can, roleOf, roleLabel } from '@/lib/roles';

const NAV = [
  ['/', 'Dashboard', 'home'],
  ['/clients', 'Clients', 'building'],
  ['/jobs', 'Jobs & posting', 'briefcase'],
  ['/resumes', 'Resumes', 'file'],
  ['/pipeline', 'Pipeline', 'kanban'],
  ['/screening', 'AI screening', 'phone'],
  ['/interviews', 'Interviews', 'calendar'],
  ['/extension', 'Chrome extension', 'puzzle'],
  ['/settings', 'Settings', 'settings'],
];

export default function AppShell({ user, logout, children }) {
  const path = usePathname();
  const [mini, setMini] = useState(false);       // desktop: icons-only rail
  const [drawer, setDrawer] = useState(false);   // phone: menu open

  useEffect(() => {
    try { setMini(localStorage.getItem('avs_nav') === 'mini'); } catch { /* storage blocked */ }
  }, []);
  useEffect(() => { setDrawer(false); }, [path]);

  const toggle = () => {
    if (window.matchMedia('(max-width: 899px)').matches) { setDrawer((d) => !d); return; }
    setMini((m) => {
      try { localStorage.setItem('avs_nav', m ? 'full' : 'mini'); } catch { /* storage blocked */ }
      return !m;
    });
  };
  const active = (href) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));

  return (
    <div className={`app${mini ? ' is-mini' : ''}${drawer ? ' is-drawer' : ''}`}>
      <header className="topbar">
        <button type="button" className="iconbtn" onClick={toggle} aria-label={mini || !drawer ? 'Show or hide menu' : 'Close menu'} aria-expanded={!mini}>
          <Icon name="menu" size={22} />
        </button>
        <Link href="/" className="brand">
          <span className="logo">A</span>
          <span className="brand-name">AvaStars <span>Hire</span></span>
        </Link>
        <span className="spacer" />
        {can(user, 'jobs.edit') ? <Link href="/jobs/new" className="btn primary sm topbar-cta"><Icon name="plus" size={16} /> New requirement</Link> : null}
        <a href="/careers" target="_blank" rel="noreferrer" className="iconbtn" title="Open public careers page" aria-label="Open public careers page"><Icon name="globe" /></a>
        <div className="me">
          <span className="avatar" aria-hidden="true">{(user?.name || 'HR').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}</span>
          <span className="me-text"><span className="small strong">{user?.name}</span><span className="tiny muted">{roleLabel(roleOf(user))} · {user?.email}</span></span>
          <form action={logout}><button className="iconbtn" type="submit" title="Log out" aria-label="Log out"><Icon name="logout" size={18} /></button></form>
        </div>
      </header>

      <nav className="sidenav" aria-label="Main">
        {NAV.filter(([href]) => href !== '/interviews' || can(user, 'interviews.manage')).map(([href, l, icon]) => [href, href === '/settings' && !can(user, 'settings.manage') ? 'My account' : l, icon]).map(([href, label, icon]) => (
          <Link key={href} href={href} className="navitem" aria-current={active(href) ? 'page' : undefined} title={label}>
            <Icon name={icon} size={20} />
            <span className="navtext">{label}</span>
          </Link>
        ))}
        <div className="navsep" />
        <a href="/careers" target="_blank" rel="noreferrer" className="navitem" title="Careers page">
          <Icon name="globe" size={20} /><span className="navtext">Careers page ↗</span>
        </a>
      </nav>
      <button type="button" className="scrim" aria-label="Close menu" onClick={() => setDrawer(false)} tabIndex={drawer ? 0 : -1} />

      <main className="content">{children}</main>
    </div>
  );
}
