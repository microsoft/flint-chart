import { NavLink, Link, Outlet } from 'react-router-dom';
import { siteTheme } from '../shared/theme';
import './playground.css';

const pages = [
  { to: 'illustrations', label: 'Illustrations' },
  { to: 'mcp-ui', label: 'MCP UI test' },
  { to: 'labs', label: 'Labs' },
];

export function PlaygroundShell() {
  return (
    <div className="dev-shell">
      <header className="dev-header">
        <Link to="/" className="dev-brand" style={{ textDecoration: 'none', color: 'inherit' }} title="Back to the main site">
          <strong>flint dev</strong>
        </Link>
        <nav className="dev-nav" aria-label="Dev pages">
          {pages.map((page) => (
            <NavLink
              key={page.to}
              to={page.to}
              className={({ isActive }) => isActive ? 'dev-nav-link dev-nav-link-active' : 'dev-nav-link'}
            >
              {page.label}
            </NavLink>
          ))}
          <Link to="/" className="dev-nav-link" style={{ marginLeft: 12, color: siteTheme.accent }}>
            ← Back to site
          </Link>
        </nav>
      </header>
      <main className="dev-content" style={{ color: siteTheme.text }}>
        <p className="dev-workbench-note">
          You shouldn't be here! This is the lab where I test new features. Curious what&apos;s next? Ping me and let&apos;s grab coffee.
        </p>
        <Outlet />
      </main>
    </div>
  );
}