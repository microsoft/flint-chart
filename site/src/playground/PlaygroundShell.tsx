import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { siteTheme } from '../shared/theme';
import './playground.css';

type NavLeaf = { to: string; label: string };
type NavEntry = NavLeaf | { group: string; children: NavLeaf[] };

const pages: NavEntry[] = [
  { to: 'illustrations', label: 'Illustrations' },
  { to: 'mcp-ui', label: 'MCP UI test' },
  { to: 'labs', label: 'Labs' },
  { to: 'demo-wall', label: 'Demo wall' },
  {
    group: 'Theme labs',
    children: [
      { to: 'theme-labs', label: 'Theme lab' },
      { to: 'theme-lab-r2', label: 'Theme lab R2' },
      { to: 'theme-lab-real', label: 'Theme lab real' },
      { to: 'style-references', label: 'Style references' },
    ],
  },
  { to: 'full-test-cases', label: 'Full test cases' },
];

function ThemeLabsMenu({ group, children }: { group: string; children: NavLeaf[] }) {
  const { pathname } = useLocation();
  // A page may carry further segments (style-references/swiss), so match the
  // page rather than the end of the path.
  const active = children.some((c) => pathname.includes(`/${c.to}`));
  return (
    <div className="dev-nav-group">
      <button
        type="button"
        className={active ? 'dev-nav-link dev-nav-link-active dev-nav-group-toggle' : 'dev-nav-link dev-nav-group-toggle'}
        aria-haspopup="true"
      >
        {group} <span aria-hidden="true" className="dev-nav-caret">▾</span>
      </button>
      <div className="dev-nav-dropdown" role="menu">
        {children.map((page) => (
          <NavLink
            key={page.to}
            to={page.to}
            role="menuitem"
            className={({ isActive }) => isActive ? 'dev-nav-link dev-nav-link-active' : 'dev-nav-link'}
          >
            {page.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export function PlaygroundShell() {
  return (
    <div className="dev-shell">
      <header className="dev-header">
        <Link to="/" className="dev-brand" style={{ textDecoration: 'none', color: 'inherit' }} title="Back to the main site">
          <strong>flint dev</strong>
        </Link>
        <nav className="dev-nav" aria-label="Dev pages">
          {pages.map((page) => (
            'group' in page ? (
              <ThemeLabsMenu key={page.group} group={page.group} children={page.children} />
            ) : (
              <NavLink
                key={page.to}
                to={page.to}
                className={({ isActive }) => isActive ? 'dev-nav-link dev-nav-link-active' : 'dev-nav-link'}
              >
                {page.label}
              </NavLink>
            )
          ))}
          <Link to="/" className="dev-nav-link" style={{ marginLeft: 12, color: siteTheme.accent }}>
            ← Back to site
          </Link>
        </nav>
      </header>
      <main className="dev-content" style={{ color: siteTheme.text }}>
        <Outlet />
      </main>
    </div>
  );
}