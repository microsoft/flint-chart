import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { siteTheme } from '../shared/theme';
import './playground.css';

type NavLeaf = { to: string; label: string; end?: boolean };
/** A heading splits a long menu into topics; it is not a link. */
type NavItem = NavLeaf | { heading: string };
type NavEntry = NavLeaf | { group: string; children: NavItem[] };

const pages: NavEntry[] = [
  {
    group: 'Charts',
    children: [
      { to: 'illustrations', label: 'Gallery', end: true },
      { to: 'illustrations/architecture', label: 'Architecture' },
      { to: '/dev/design', label: 'Design blueprint' },
      { to: 'demo-wall', label: 'Demo wall' },
      { to: 'full-test-cases', label: 'Full test cases' },
    ],
  },
  {
    group: 'Layout',
    children: [
      { heading: 'Tools' },
      { to: 'layout-inspector', label: 'Layout inspector' },
      { to: 'layout-plan', label: 'Layout plan demos' },
      { to: 'labs', label: 'Figures: colour, bands, dodge' },
      { heading: 'Fit and overflow' },
      { to: 'canvas-fit', label: 'Canvas fit' },
      { to: 'viewport', label: 'Viewport and clipping' },
      { heading: 'Axes and titles' },
      { to: 'axis-label', label: 'Axis labels' },
      { to: 'time-axes', label: 'Time axes' },
      { to: 'titles', label: 'Titles' },
      { heading: 'Marks, colour and maps' },
      { to: 'density', label: 'Density' },
      { to: 'heatmaps', label: 'Heatmaps' },
      { to: 'legend', label: 'Legend' },
      { to: 'colour', label: 'Colour' },
      { to: 'maps', label: 'Maps' },
    ],
  },
  {
    group: 'Backend layout',
    children: [
      { to: 'backend-layout/echarts', label: 'ECharts' },
      { to: 'backend-layout/chartjs', label: 'Chart.js' },
      { to: 'backend-layout/plotly', label: 'Plotly' },
    ],
  },
  {
    group: 'Interactions',
    children: [
      { to: 'interaction-test-cases', label: 'Test cases' },
      { to: 'interaction-coverage', label: 'Coverage' },
      { to: 'baseline', label: 'Baseline behaviour' },
      { to: 'tooltip-compare', label: 'Tooltip: Vega-Lite vs baseline' },
      { to: 'baseline-sweep', label: 'Baseline sweep (all chart types)' },
      { to: 'interaction-conflicts', label: 'Conflict cases' },
      { to: 'chart-api-design', label: 'API design: FlintChart' },
      { to: 'annotation-lab', label: 'Annotation lab' },
      { to: 'annotation-captions', label: 'Annotation captions' },
      { to: 'muted-annotations', label: 'Muted annotations' },
      { to: 'interaction-dashboard', label: 'Demo: dashboard' },
      { to: 'external-to-chart', label: 'Demo: external to chart' },
      { to: 'chart-to-external', label: 'Demo: chart to external' },
      { to: 'interactive-data-report', label: 'Demo: interactive data report' },
    ],
  },
  {
    group: 'Themes',
    children: [
      { to: 'theme-labs', label: 'Theme lab' },
      { to: 'new-theme-test', label: 'Style guides' },
      { to: 'theme-improvement', label: 'Theme improvement' },
      { to: 'row-names', label: 'Names above bars' },
    ],
  },
  {
    group: 'Release examples',
    children: [
      { to: 'release-examples/1.1', label: '1.1' },
      { to: 'release-examples/1.0.0', label: '1.0.0' },
      { to: 'fun/greek', label: 'Greek myths on maps' },
    ],
  },
  {
    group: 'Tools',
    children: [
      { to: 'mcp-ui', label: 'MCP UI test' },
      { to: 'mcp-stories', label: 'MCP chat stories' },
      { to: 'debug-gym', label: 'Debug gym' },
      { to: 'interaction-coverage', label: 'Interaction coverage' },
    ],
  },
  // Eval runs are local (site/public/eval is gitignored), so the tab exists only in dev builds.
  ...(import.meta.env.DEV ? [{ to: 'eval', label: 'Eval' }] : []),
];

function NavGroupMenu({ group, children }: { group: string; children: NavItem[] }) {
  const { pathname } = useLocation();
  const leaves = children.filter((c): c is NavLeaf => 'to' in c);
  // A page may carry further segments, so match the page rather than the end of the path.
  const active = leaves.some((c) => pathname.includes(`/${c.to}`));
  return (
    <div className="dev-nav-group">
      <button
        type="button"
        className={active ? 'dev-nav-link dev-nav-link-active dev-nav-group-toggle' : 'dev-nav-link dev-nav-group-toggle'}
        aria-haspopup="true"
      >
        {group} <span aria-hidden="true" className="dev-nav-caret">▾</span>
      </button>
      <div className="dev-nav-dropdown">
        <div className="dev-nav-dropdown-panel" role="menu">
          {children.map((page) => ('heading' in page ? (
            <div key={page.heading} className="dev-nav-heading" role="presentation">{page.heading}</div>
          ) : (
            <NavLink
              key={page.to}
              to={page.to}
              end={page.end}
              role="menuitem"
              // Focus would keep the menu open (`:focus-within`) after the page it opened.
              onClick={(event) => event.currentTarget.blur()}
              className={({ isActive }) => isActive ? 'dev-nav-link dev-nav-link-active' : 'dev-nav-link'}
            >
              {page.label}
            </NavLink>
          )))}
        </div>
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