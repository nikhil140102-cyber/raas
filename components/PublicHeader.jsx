export default function PublicHeader({ right, href = '/careers', title = 'AvaStars' }) {
  return (
    <header className="pubhead">
      <a href={href} className="row" style={{ gap: 10, textDecoration: 'none', color: 'var(--ink)' }}>
        <span className="logo">A</span>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
      </a>
      {right}
    </header>
  );
}
