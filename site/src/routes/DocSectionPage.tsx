import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { MarkdownView } from '../components/MarkdownView';
import {
  SidebarNav,
  SidebarNavItem,
  SidebarNavSection,
  SIDEBAR_NAV_WIDTH,
} from '../components/SidebarNav';
import { SiteShell } from '../components/SiteShell';
import { useLocale } from '../i18n/LocaleContext';
import type { DocSection } from '../shared/docs-catalog';
import {
  getDocEntry,
  getDocGroups,
} from '../shared/docs-catalog';
import { getDocMarkdown } from '../shared/load-docs';
import { DOC_SCROLL_TO_KEY, scrollToHeading, scrollNavItemIntoView } from '../shared/scroll-to-heading';
import { CONTENT_MAX_WIDTH, siteTheme } from '../shared/theme';

export function DocSectionPage({ section }: { section: DocSection }) {
  const { t } = useTranslation();
  const { locale, lp } = useLocale();
  const mainRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const groups = getDocGroups(section);
  const docs = groups.flatMap((g) => g.docs);
  const firstSlug = docs[0]?.slug;
  const activeSlug = slug ?? firstSlug;
  const entry = activeSlug ? getDocEntry(section, activeSlug) : undefined;
  const loaded = entry ? getDocMarkdown(entry, locale) : null;
  const markdown = loaded?.markdown ?? null;
  const usedFallback = loaded?.usedFallback ?? false;

  // Canonicalize a slug-less URL (/documentation) to the first doc WITHOUT a
  // redirect render. We render the default doc immediately and only replace the
  // URL in place, so the shell never unmounts — avoiding the blank flash a
  // returned <Navigate> caused. Keeping every hook unconditional also prevents
  // the "rendered more hooks" crash when moving between the /documentation and
  // /documentation/:slug routes (they share this component instance).
  useEffect(() => {
    if (!slug && firstSlug) {
      navigate(lp(`/${section}/${firstSlug}`), { replace: true });
    }
  }, [slug, section, firstSlug, navigate, lp]);

  // Reset scroll to top when the active doc changes, unless a heading anchor
  // is pending (handled by the next effect).
  useEffect(() => {
    const stored = sessionStorage.getItem(DOC_SCROLL_TO_KEY);
    const hash = location.hash ? decodeURIComponent(location.hash.slice(1)) : '';
    if (!stored && !hash) {
      mainRef.current?.scrollTo({ top: 0 });
    }
  }, [activeSlug, location.hash]);

  useEffect(() => {
    const stored = sessionStorage.getItem(DOC_SCROLL_TO_KEY);
    const hash = location.hash ? decodeURIComponent(location.hash.slice(1)) : '';
    const pending = stored ?? hash;
    if (!pending || !markdown) return;
    if (stored) sessionStorage.removeItem(DOC_SCROLL_TO_KEY);
    const timer = window.setTimeout(() => {
      scrollToHeading(pending, mainRef.current);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [markdown, activeSlug, location.hash]);

  // Bring the active doc into view in the sidebar, but only when it has
  // scrolled out of view. Discrete (on active-doc change), so it never forms a
  // scroll feedback loop or fights the user.
  useEffect(() => {
    if (!activeSlug) return;
    const sidebar = sidebarRef.current;
    const item = sidebar?.querySelector<HTMLElement>(
      `[data-doc-nav="${CSS.escape(activeSlug)}"]`,
    );
    scrollNavItemIntoView(sidebar, item ?? null);
  }, [activeSlug]);

  return (
    <SiteShell>
      <style>{docResponsiveStyles}</style>
      <div
        ref={mainRef}
        className="doc-scroll-root"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <div
          className="doc-layout"
          data-doc-layout=""
          style={{
            display: 'grid',
            gridTemplateColumns: `${SIDEBAR_NAV_WIDTH}px 1fr`,
            alignItems: 'start',
            width: '100%',
            maxWidth: CONTENT_MAX_WIDTH,
            margin: '0 auto',
          }}
        >
          <SidebarNav sidebarRef={sidebarRef}>
            {groups.map((group, gi) => (
              <SidebarNavSection
                key={group.id}
                label={t(`docs.groups.${group.id}`)}
                first={gi === 0}
              >
                {group.docs.map((doc) => {
                  const active = doc.slug === activeSlug;
                  return (
                    <SidebarNavItem
                      key={doc.slug}
                      as="link"
                      active={active}
                      to={lp(`/${section}/${doc.slug}`)}
                      icon={doc.icon}
                      dataAttr={{ 'data-doc-nav': doc.slug }}
                    >
                      {t(`docs.entries.${doc.slug}.title`)}
                    </SidebarNavItem>
                  );
                })}
              </SidebarNavSection>
            ))}
          </SidebarNav>

          <main className="doc-main" data-doc-main="" style={{ minWidth: 0, padding: '24px 32px 48px' }}>
            <MobileDocPicker
              section={section}
              groups={groups}
              activeSlug={activeSlug}
              onNavigate={(nextSlug) => {
                mainRef.current?.scrollTo({ top: 0 });
                navigate(lp(`/${section}/${nextSlug}`));
              }}
            />
            {!entry || !markdown ? (
              <p style={{ color: siteTheme.textMuted }}>{t('docs.notFound')}</p>
            ) : (
              <>
                {usedFallback ? (
                  <p
                    style={{
                      margin: '0 0 16px',
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'rgba(31, 35, 40, 0.06)',
                      color: siteTheme.textMuted,
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    {t('docs.fallbackNote')}
                  </p>
                ) : null}
                <MarkdownView source={markdown} scrollContainerRef={mainRef} />
              </>
            )}
          </main>
        </div>
      </div>
    </SiteShell>
  );
}

function MobileDocPicker({
  section,
  groups,
  activeSlug,
  onNavigate,
}: {
  section: DocSection;
  groups: ReturnType<typeof getDocGroups>;
  activeSlug?: string;
  onNavigate: (slug: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="doc-mobile-picker" style={docMobilePickerStyle}>
      <span style={docMobilePickerLabelStyle}>{t('docs.mobileLabel')}</span>
      <select
        value={activeSlug ?? ''}
        onChange={(event) => onNavigate(event.currentTarget.value)}
        style={docMobileSelectStyle}
        aria-label={t('docs.mobileAria')}
      >
        {groups.map((group) => (
          <optgroup key={group.id} label={t(`docs.groups.${group.id}`)}>
            {group.docs.map((doc) => (
              <option key={doc.slug} value={doc.slug}>
                {t(`docs.entries.${doc.slug}.title`)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span style={docMobilePathStyle}>/{section}</span>
    </label>
  );
}

const docMobilePickerStyle: React.CSSProperties = {
  display: 'none',
};

const docMobilePickerLabelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: siteTheme.textMuted,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const docMobileSelectStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 40,
  padding: '7px 12px',
  border: `1px solid ${siteTheme.border}`,
  borderRadius: 8,
  background: siteTheme.surface,
  color: siteTheme.text,
  font: 'inherit',
  fontSize: 15,
};

const docMobilePathStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 6,
  color: siteTheme.textMuted,
  fontSize: 12,
};

const docResponsiveStyles = `
  @media (max-width: 640px) {
    .doc-scroll-root {
      overflow-x: hidden !important;
    }

    .doc-layout {
      display: block !important;
      max-width: none !important;
    }

    .doc-layout .app-sidebar {
      display: none !important;
    }

    .doc-main {
      padding: 22px 20px 56px !important;
    }

    .doc-mobile-picker {
      display: block !important;
      margin-bottom: 22px;
    }

    .doc-markdown {
      max-width: none !important;
      font-size: 15.5px !important;
      line-height: 1.68 !important;
    }

    .doc-markdown h1 {
      font-size: 26px !important;
      line-height: 1.16 !important;
    }

    .doc-markdown h2 {
      font-size: 19px !important;
      line-height: 1.25 !important;
    }
  }
`;
