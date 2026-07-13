import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CONTENT_MAX_WIDTH, GITHUB_REPO, siteTheme } from '../shared/theme';

const GITHUB_REPO_API = 'https://api.github.com/repos/microsoft/flint-chart';
const GITHUB_STARS_CACHE_KEY = 'flint-chart.github-stars';
const GITHUB_STARS_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

let githubStarsRequest: Promise<number | null> | undefined;

/**
 * Shared chrome: Vega-Lite-style top nav + page body + Microsoft disclosures.
 */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: siteTheme.fontSans,
        color: siteTheme.text,
        background: siteTheme.surface,
      }}
    >
      <SiteNavBar />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
      <MicrosoftDisclosures />
    </div>
  );
}

export function SiteNavBar(_props: { flush?: boolean } = {}) {
  const { pathname } = useLocation();

  return (
    <header
      className="site-nav-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        width: '100%',
        boxSizing: 'border-box',
        maxWidth: CONTENT_MAX_WIDTH,
        margin: '0 auto',
        padding: '0 20px',
        height: 48,
        background: 'transparent',
        flexShrink: 0,
      }}
    >
      <BrandLink />

      <nav className="site-nav-scroll" style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
        <NavLink to="/" active={pathname === '/'}>
          About
        </NavLink>
        <NavLink to="/mcp" active={pathname.startsWith('/mcp')}>
          MCP Server
        </NavLink>
        <NavLink to="/gallery" active={pathname.startsWith('/gallery') || pathname.startsWith('/wall')}>
          Gallery
        </NavLink>
        <NavLink
          to="/documentation"
          active={pathname.startsWith('/documentation') || pathname.startsWith('/tutorials')}
        >
          Documentation
        </NavLink>
        <NavLink to="/editor" active={pathname.startsWith('/editor')}>
          Online Editor
        </NavLink>
        {/* <NavLink to="/tutorials/quick-start" active={pathname === '/tutorials/quick-start'}>
          Usage
        </NavLink>
        <NavLinkExternal href={`${GITHUB_REPO}#ecosystem`} label="Ecosystem" /> */}
      </nav>

      <div className="site-nav-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <GitHubLink />
      </div>
    </header>
  );
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  const [hovered, setHovered] = useState(false);
  const underline = active || hovered;
  return (
    <Link
      to={to}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...navLinkStyle,
        // MCP-style: inactive tabs are a lighter gray and darken on hover.
        color: active || hovered ? siteTheme.text : siteTheme.navInactive,
        // Keep a uniform font weight so the text metrics never shift; fake the
        // bold on the active tab with a hairline text-shadow (MCP's trick).
        textShadow: active ? '-0.2px 0 0 currentColor, 0.2px 0 0 currentColor' : undefined,
        textDecorationLine: underline ? 'underline' : 'none',
        textDecorationThickness: underline ? 2 : undefined,
        textUnderlineOffset: underline ? 6 : undefined,
        // Active gets a solid dark underline; hover shows a lighter gray one.
        textDecorationColor: active ? siteTheme.text : 'rgba(0, 0, 0, 0.22)',
        transition: 'color 120ms ease, text-decoration-color 120ms ease',
      }}
    >
      {children}
    </Link>
  );
}

function NavLinkExternal({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} style={navLinkStyle} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

function BrandLink() {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to="/"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...brandStyle,
        color: hovered ? siteTheme.accent : siteTheme.text,
        transition: 'color 120ms ease',
      }}
    >
      flint-chart
    </Link>
  );
}

function GitHubLink() {
  const [hovered, setHovered] = useState(false);
  const [starCount, setStarCount] = useState<number | null>(readCachedGitHubStars);
  const compactStarCount = starCount === null ? '' : formatCompactCount(starCount);

  useEffect(() => {
    let active = true;

    void fetchGitHubStars().then((count) => {
      if (count !== null) {
        cacheGitHubStars(count);
        if (active) setStarCount(count);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <a
      href={GITHUB_REPO}
      target="_blank"
      rel="noreferrer"
      aria-label={starCount === null ? 'GitHub repository' : `GitHub repository, ${starCount.toLocaleString()} stars`}
      title={starCount === null ? 'View on GitHub' : `View on GitHub (${starCount.toLocaleString()} stars)`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...navLinkStyle,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color: hovered ? siteTheme.accent : siteTheme.text,
        transition: 'color 120ms ease',
      }}
    >
      <GitHubIcon />
      GitHub
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 4,
          width: 42,
          boxSizing: 'border-box',
          marginLeft: 4,
          paddingLeft: 9,
          borderLeft: `1px solid ${siteTheme.border}`,
          color: hovered ? siteTheme.accent : siteTheme.textMuted,
          fontSize: 12,
          fontVariantNumeric: 'tabular-nums',
          visibility: starCount === null ? 'hidden' : 'visible',
          transition: 'color 120ms ease',
        }}
      >
        <span style={{ fontSize: 10, lineHeight: 1 }}>★</span>
        {compactStarCount}
      </span>
    </a>
  );
}

function fetchGitHubStars(): Promise<number | null> {
  githubStarsRequest ??= fetch(GITHUB_REPO_API, {
    headers: { Accept: 'application/vnd.github+json' },
  })
    .then(async (response) => {
      if (!response.ok) return null;

      const payload: unknown = await response.json();
      if (
        typeof payload === 'object'
        && payload !== null
        && 'stargazers_count' in payload
        && typeof payload.stargazers_count === 'number'
      ) {
        return payload.stargazers_count;
      }
      return null;
    })
    .catch(() => null);

  return githubStarsRequest;
}

function readCachedGitHubStars(): number | null {
  try {
    const cached = JSON.parse(localStorage.getItem(GITHUB_STARS_CACHE_KEY) ?? 'null') as unknown;
    if (
      typeof cached === 'object'
      && cached !== null
      && 'count' in cached
      && 'fetchedAt' in cached
      && typeof cached.count === 'number'
      && typeof cached.fetchedAt === 'number'
      && Date.now() - cached.fetchedAt < GITHUB_STARS_CACHE_MAX_AGE
    ) {
      return cached.count;
    }
  } catch {
    // Storage may be unavailable in privacy-restricted browsing contexts.
  }
  return null;
}

function cacheGitHubStars(count: number) {
  try {
    localStorage.setItem(GITHUB_STARS_CACHE_KEY, JSON.stringify({ count, fetchedAt: Date.now() }));
  } catch {
    // The live value still renders when storage is unavailable.
  }
}

function formatCompactCount(count: number): string {
  if (count < 1_000) return String(count);
  if (count < 1_000_000) return `${(count / 1_000).toFixed(count < 10_000 ? 1 : 0).replace('.0', '')}k`;
  return `${(count / 1_000_000).toFixed(count < 10_000_000 ? 1 : 0).replace('.0', '')}m`;
}

export function GitHubIcon({ size = 15 }: { size?: number } = {}) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const brandStyle: CSSProperties = {
  color: siteTheme.text,
  textDecorationLine: 'none',
  fontWeight: 300,
  fontSize: 17,
  letterSpacing: '0.03em',
};

const navLinkStyle: CSSProperties = {
  color: siteTheme.text,
  textDecorationLine: 'none',
  fontSize: 13,
  letterSpacing: '0.01em',
};

/**
 * Required Microsoft site disclosures.
 *
 * See https://aka.ms/site-disclosures. "About our ads" is omitted — flint-chart
 * does not display third-party advertising.
 */
export function MicrosoftDisclosures() {
  const linkStyle: CSSProperties = {
    color: siteTheme.textMuted,
    textDecoration: 'none',
    marginRight: 12,
  };
  return (
    <footer
      style={{
        padding: '6px 12px',
        borderTop: `1px solid ${siteTheme.border}`,
        background: siteTheme.surface,
        color: siteTheme.textMuted,
        fontSize: 11,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
      }}
    >
      <span style={{ marginRight: 12 }}>© 2026 Microsoft</span>
      <a className="site-text-link" style={linkStyle} href="https://go.microsoft.com/fwlink/?LinkID=206977">
        Terms of Use
      </a>
      <a className="site-text-link" style={linkStyle} href="https://go.microsoft.com/fwlink/?LinkId=521839">
        Privacy &amp; Cookies
      </a>
      <a className="site-text-link" style={linkStyle} href="https://go.microsoft.com/fwlink/?linkid=2259814">
        Consumer Health Privacy
      </a>
      <a className="site-text-link" style={linkStyle} href="https://www.microsoft.com/trademarks">
        Trademarks
      </a>
    </footer>
  );
}
