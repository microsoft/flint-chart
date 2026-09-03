import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { siteTheme } from '../shared/theme';
import './playground.css';

type NavLeaf = { to: string; label: string; end?: boolean };
type NavEntry = NavLeaf | { group: string; children: NavLeaf[] };

const pages: NavEntry[] = [
  {
    group: 'Charts',
    children: [
      { to: 'illustrations', label: 'Gallery', end: true },
      { to: 'illustrations/architecture', label: 'Architecture' },
      { to: 'demo-wall', label: 'Demo wall' },
      { to: 'full-test-cases', label: 'Full test cases' },
      { to: 'new-case-preview', label: 'New case preview' },
    ],
  },
  {
    group: 'Layout',
    children: [
      { to: 'labs', label: 'Overview' },
      { to: 'overflow-viewport', label: 'Overflow viewport' },
      { to: 'band-stretching', label: 'Band stretching' },
    ],
  },
  {
    group: 'Interactions',
    children: [
      { to: 'click-focus', label: 'Test cases' },
      { to: 'bespoke-interaction', label: 'Advanced prototypes' },
      { to: 'annotation-lab', label: 'Annotation lab' },
      { to: 'interaction-candidates', label: 'References' },
      { to: 'interaction-dashboard', label: 'Demo: dashboard' },
      { to: 'external-to-chart', label: 'Demo: external to chart' },
      { to: 'chart-to-external', label: 'Demo: chart to external' },
    ],
  },
  {
    group: 'Themes',
    children: [
      { to: 'theme-labs', label: 'Theme lab' },
      { to: 'theme-lab-r2', label: 'R2 evaluation' },
      { to: 'theme-lab-real', label: 'Real-world evaluation' },
      { to: 'label-experiment', label: 'Label experiment' },
      { to: 'style-references', label: 'Style references' },
    ],
  },
  {
    group: 'Tools',
    children: [
      { to: 'mcp-ui', label: 'MCP UI test' },
      { to: 'debug-gym', label: 'Debug gym' },
      { to: 'year-legend', label: 'Year legend' },
      { to: 'interaction-coverage', label: 'Interaction coverage' },
    ],
  },
];

function NavGroupMenu({ group, children }: { group: string; children: NavLeaf[] }) {
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
            end={page.end}
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
              <NavGroupMenu key={page.group} group={page.group} children={page.children} />
            ) : (
              <NavLink
                key={page.to}
                to={page.to}
                end={page.end}
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