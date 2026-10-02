import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { LocaleLink } from '../i18n/LocaleLink';
import { useLocale } from '../i18n/LocaleContext';
import { stripLocale } from '../i18n/paths';
import type { Locale } from '../i18n/locales';
import { CONTENT_MAX_WIDTH, DISCORD_INVITE, GITHUB_REPO, LANDING_SCROLL_TO_KEY, WECHAT_SECTION_ID, siteTheme } from '../shared/theme';
import { scrollToHeading } from '../shared/scroll-to-heading';

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
  const logical = stripLocale(pathname);
  const { t } = useTranslation();

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
        <NavLink to="/" active={logical === '/'}>
          {t('nav.about')}
        </NavLink>
        <NavLink to="/mcp" active={logical.startsWith('/mcp')}>
          {t('nav.mcp')}
        </NavLink>
        <NavLink to="/themes" active={logical.startsWith('/themes')}>
          {t('nav.themes')}
        </NavLink>
        <NavLink to="/gallery" active={logical.startsWith('/gallery') || logical.startsWith('/wall')}>
          {t('nav.gallery')}
        </NavLink>
        <NavLink
          to="/documentation"
          active={logical.startsWith('/documentation') || logical.startsWith('/tutorials')}
        >
          {t('nav.documentation')}
        </NavLink>
        <PlaygroundsMenu logicalPath={logical} />
      </nav>

      <div className="site-nav-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <LanguageSwitch />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <WeChatLink />
          <DiscordLink />
        </div>
        <GitHubLink />
      </div>
    </header>
  );
}

function PlaygroundsMenu({ logicalPath }: { logicalPath: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = logicalPath.startsWith('/editor')
  || logicalPath.startsWith('/theme-lab') || logicalPath.startsWith('/playgrounds/');
  const underline = active || hovered || open;

  useEffect(() => setOpen(false), [logicalPath]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      containerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault();
      setOpen(true);
      window.requestAnimationFrame(() => {
        containerRef.current?.querySelector<HTMLAnchorElement>('[role="menuitem"]')?.focus();
      });
    }
  };

  const items = [
    { to: '/editor', label: t('nav.editor') },
    { to: '/theme-lab', label: t('nav.themeLab'), icon: 'lab' as const },
    { to: '/playgrounds/auto-layout', label: t('nav.autoLayoutPlayground') },
  ];

  return (
    <div
      ref={containerRef}
      className="site-nav-menu"
      onKeyDown={onKeyDown}
      style={{ position: 'relative', display: 'inline-flex', alignSelf: 'stretch', alignItems: 'center' }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          ...navLinkStyle,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: 0,
          border: 0,
          background: 'transparent',
          color: active || hovered || open ? siteTheme.text : siteTheme.navInactive,
          textShadow: active ? '-0.2px 0 0 currentColor, 0.2px 0 0 currentColor' : undefined,
          cursor: 'pointer',
          transition: 'color 120ms ease',
        }}
      >
        {/* Underline the label only, so the caret stays outside the tab rule. */}
        <span
          style={{
            textDecorationLine: underline ? 'underline' : 'none',
            textDecorationThickness: underline ? 2 : undefined,
            textUnderlineOffset: underline ? 6 : undefined,
            textDecorationColor: active ? siteTheme.text : 'rgba(0, 0, 0, 0.22)',
            transition: 'text-decoration-color 120ms ease',
          }}
        >
          {t('nav.playgrounds')}
        </span>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            fontSize: 9,
            lineHeight: 1,
          }}
        >
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={t('nav.playgrounds')}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 300,
            display: 'flex',
            flexDirection: 'column',
            width: 180,
            padding: 6,
            gap: 2,
            border: `1px solid ${siteTheme.border}`,
            borderRadius: 7,
            background: siteTheme.surface,
            boxShadow: '0 8px 28px rgba(31, 35, 40, 0.14)',
          }}
        >
          {items.map((item) => (
            <LocaleLink
              key={item.to}
              to={item.to}
              role="menuitem"
              className="site-nav-menu-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 10px',
                borderRadius: 4,
                color: siteTheme.text,
                fontSize: 12.5,
                lineHeight: 1.35,
                textDecoration: 'none',
                textAlign: 'left',
                whiteSpace: 'nowrap',
              }}
            >
              {item.icon === 'lab' ? (
                <span style={{ display: 'inline-flex', color: siteTheme.textMuted }}>
                  <LabIcon size={14} />
                </span>
              ) : null}
              {item.label}
            </LocaleLink>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  const [hovered, setHovered] = useState(false);
  const underline = active || hovered;
  return (
    <LocaleLink
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
    </LocaleLink>
  );
}

function BrandLink() {
  const [hovered, setHovered] = useState(false);
  return (
    <LocaleLink
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
    </LocaleLink>
  );
}

function LanguageSwitch() {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();
  const options: { id: Locale; labelKey: 'nav.langEn' | 'nav.langZh' }[] = [
    { id: 'en', labelKey: 'nav.langEn' },
    { id: 'zh-CN', labelKey: 'nav.langZh' },
  ];

  return (
    <div
      role="group"
      aria-label={t('nav.langSwitchAria')}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
    >
      {options.map((opt, i) => {
        const active = locale === opt.id;
        return (
          <span key={opt.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {i > 0 ? (
              <span aria-hidden="true" style={{ color: siteTheme.border, fontSize: 12 }}>
                |
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setLocale(opt.id)}
              aria-pressed={active}
              style={{
                ...navLinkStyle,
                padding: 0,
                border: 0,
                background: 'transparent',
                cursor: 'pointer',
                color: active ? siteTheme.text : siteTheme.navInactive,
                fontWeight: active ? 600 : 400,
              }}
            >
              {t(opt.labelKey)}
            </button>
          </span>
        );
      })}
    </div>
  );
}

function WeChatLink() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { lp } = useLocale();
  const [hovered, setHovered] = useState(false);
  const logical = stripLocale(pathname);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (logical === '/') {
      scrollToHeading(WECHAT_SECTION_ID);
      return;
    }
    try {
      sessionStorage.setItem(LANDING_SCROLL_TO_KEY, WECHAT_SECTION_ID);
    } catch {
      // Privacy modes may block storage.
    }
    navigate(lp('/'));
  };

  return (
    <a
      href={lp(`/#${WECHAT_SECTION_ID}`)}
      onClick={onClick}
      aria-label={t('nav.wechatAria')}
      title={t('nav.wechatTitle')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...socialIconLinkStyle,
        color: hovered ? siteTheme.accent : siteTheme.text,
      }}
    >
      <WeChatIcon />
    </a>
  );
}

function DiscordLink() {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);

  return (
    <a
      href={DISCORD_INVITE}
      target="_blank"
      rel="noreferrer"
      aria-label={t('nav.discordAria')}
      title={t('nav.discordTitle')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...socialIconLinkStyle,
        color: hovered ? siteTheme.accent : siteTheme.text,
      }}
    >
      <DiscordIcon />
    </a>
  );
}

function GitHubLink() {
  const { t, i18n } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [starCount, setStarCount] = useState<number | null>(readCachedGitHubStars);
  const compactStarCount = starCount === null ? '' : formatCompactCount(starCount);
  const countLabel = starCount === null ? '' : starCount.toLocaleString(i18n.language);

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
      aria-label={
        starCount === null
          ? t('nav.githubAria')
          : t('nav.githubAriaStars', { count: countLabel })
      }
      title={
        starCount === null
          ? t('nav.githubTitle')
          : t('nav.githubTitleStars', { count: countLabel })
      }
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
      {t('nav.github')}
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

export function DiscordIcon({ size = 16 }: { size?: number } = {}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.07.07 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export function WeChatIcon({ size = 16 }: { size?: number } = {}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .131-.035l1.877-.858a.773.773 0 0 1 .446-.068 9.81 9.81 0 0 0 3.17.508c.447 0 .883-.033 1.309-.094-.21-.582-.327-1.2-.327-1.847 0-3.516 3.287-6.366 7.34-6.366.196 0 .39.007.582.02C17.53 4.63 13.51 2.188 8.691 2.188zm-2.548 4.4c.54 0 .978.45.978.998s-.438.998-.978.998c-.54 0-.978-.45-.978-.998s.439-.998.978-.998zm5.096 0c.54 0 .978.45.978.998s-.438.998-.978.998c-.54 0-.978-.45-.978-.998s.439-.998.978-.998zM24 13.47c0-3.176-3.162-5.75-7.06-5.75-3.899 0-7.06 2.574-7.06 5.75s3.161 5.75 7.06 5.75c.696 0 1.367-.086 2-.244a.59.59 0 0 1 .378.058l1.403.642a.25.25 0 0 0 .105.023c.127 0 .23-.103.23-.23 0-.056-.021-.11-.06-.152l-.292-1.106a.49.49 0 0 1 .177-.55C22.916 16.72 24 15.205 24 13.47zm-9.388-1.248c-.427 0-.773.356-.773.795 0 .44.346.795.773.795.427 0 .773-.356.773-.795 0-.439-.346-.795-.773-.795zm4.656 0c-.427 0-.773.356-.773.795 0 .44.346.795.773.795.427 0 .773-.356.773-.795 0-.439-.346-.795-.773-.795z" />
    </svg>
  );
}

export function LabIcon({ size = 17 }: { size?: number } = {}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 3h6M10 3v6.2l-5.4 8.3A2.3 2.3 0 0 0 6.5 21h11a2.3 2.3 0 0 0 1.9-3.5L14 9.2V3M7.8 15h8.4" />
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

const socialIconLinkStyle: CSSProperties = {
  ...navLinkStyle,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 6,
  textDecoration: 'none',
  transition: 'color 120ms ease, background 120ms ease',
};

/**
 * Required Microsoft site disclosures.
 *
 * See https://aka.ms/site-disclosures. "About our ads" is omitted — flint-chart
 * does not display third-party advertising.
 */
export function MicrosoftDisclosures() {
  const { t } = useTranslation();
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
      <span style={{ marginRight: 12 }}>{t('footer.copyright')}</span>
      <a className="site-text-link" style={linkStyle} href="https://go.microsoft.com/fwlink/?LinkID=206977">
        {t('footer.terms')}
      </a>
      <a className="site-text-link" style={linkStyle} href="https://go.microsoft.com/fwlink/?LinkId=521839">
        {t('footer.privacy')}
      </a>
      <a className="site-text-link" style={linkStyle} href="https://go.microsoft.com/fwlink/?linkid=2259814">
        {t('footer.health')}
      </a>
      <a className="site-text-link" style={linkStyle} href="https://www.microsoft.com/trademarks">
        {t('footer.trademarks')}
      </a>
    </footer>
  );
}
