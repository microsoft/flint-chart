import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { TEST_GENERATORS, type TestCase } from 'flint-chart/test-data';
import { SiteShell } from '../components/SiteShell';
import { CodeBlock } from '../components/CodeBlock';
import {
  SidebarNav,
  SidebarNavItem,
  SidebarNavSection,
} from '../components/SidebarNav';
import { ChartThumb } from '../components/ChartThumb';
import { WallChart } from '../components/WallChart';
import { ChartCodeModal } from '../components/ChartCodeModal';
import { LocaleLink } from '../i18n/LocaleLink';
import { useLocale } from '../i18n/LocaleContext';
import {
  CHART_CATEGORIES,
  type ChartCategory,
  type ChartEntry,
} from '../shared/chart-categories';
import { selectVariants } from '../shared/wall-variants';
import { isFacetedTestCase } from '../shared/test-case-utils';
import { CHART_FAMILIES, familyForChart } from '../shared/wall-families';
import { localizeChartLabel, localizeFamilyLabel } from '../shared/gallery-labels';
import { humanizeVariants } from '../shared/wall-title';
import type { Locale } from '../i18n/locales';
import type { PreviewBackend } from '../shared/supported-backends';
import { siteTheme, CONTENT_MAX_WIDTH } from '../shared/theme';
import { scrollNavItemIntoView } from '../shared/scroll-to-heading';

const MAX_VARIANTS = 4;
const TILE_CHART_HEIGHT = 190;
const SCROLL_SPY_ACTIVATION_RATIO = 0.45;
const SCROLL_SPY_VISIBLE_MARGIN = 24;

function loadTests(generator: string): TestCase[] {
  const gen = TEST_GENERATORS[generator];
  if (!gen) return [];
  try {
    return gen();
  } catch (err) {
    console.error('test generator failed', generator, err);
    return [];
  }
}

/** One thumbnail = one curated example of a specific chart type. */
interface Tile {
  chart: ChartEntry;
  testCase: TestCase;
  /** Human-readable, gallery-style caption for this example. */
  title: string;
  /** Position of this example within its chart's curated variant list. */
  pos: number;
  /** All curated variants of this chart (drives the modal carousel). */
  variants: TestCase[];
  /** Absolute index of each curated variant in the generator output. */
  indices: number[];
}

/** One section = one chart type and its curated example tiles. */
interface ChartSection {
  chart: ChartEntry;
  tiles: Tile[];
}

/** A family groups several related chart-type sections under one heading. */
interface FamilyGroup {
  id: string;
  label: string;
  sections: ChartSection[];
}

/**
 * Build one section per chart type (fine-grained), then cluster those sections
 * under their gallery family so related chart types stay together while each
 * type keeps its own heading and sidebar entry.
 */
function buildGroups(charts: ChartEntry[], locale: Locale): FamilyGroup[] {
  const sectionsByFamily = new Map<string, ChartSection[]>();

  for (const chart of charts) {
    const full = loadTests(chart.generator);
    const variants = selectVariants(full, MAX_VARIANTS);
    if (variants.length === 0) continue;
    const indices = variants.map((v) => full.indexOf(v));
    const titles = humanizeVariants(variants, locale);
    const tiles = variants.map((testCase, pos) => ({
      chart,
      testCase,
      title: titles[pos],
      pos,
      variants,
      indices,
    }));
    const familyId = familyForChart(chart);
    const localizedChart = { ...chart, label: localizeChartLabel(chart.label, locale) };
    const bucket = sectionsByFamily.get(familyId) ?? [];
    bucket.push({
      chart: localizedChart,
      tiles: tiles.map((tile) => ({ ...tile, chart: localizedChart })),
    });
    sectionsByFamily.set(familyId, bucket);
  }

  return CHART_FAMILIES.map((family) => ({
    id: family.id,
    label: localizeFamilyLabel(family.id, family.label, locale),
    sections: sectionsByFamily.get(family.id) ?? [],
  })).filter((group) => group.sections.length > 0);
}

function resolveCategory(backendParam?: string): ChartCategory {
  return CHART_CATEGORIES.find((c) => c.id === backendParam) ?? CHART_CATEGORIES[0];
}

interface ActiveModal {
  chart: ChartEntry;
  tests: TestCase[];
  editorIndices: number[];
  index: number;
}

export function ChartWall() {
  const { backend: backendParam } = useParams<{ backend?: string }>();
  const navigate = useNavigate();
  const { locale, lp } = useLocale();
  const { t } = useTranslation();
  const category = resolveCategory(backendParam);

  const mainRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const navScrollingRef = useRef(false);
  const [activeChartId, setActiveChartId] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveModal | null>(null);

  // Keep the URL canonical (e.g. /gallery -> /gallery/vegalite) without adding history.
  useEffect(() => {
    if (backendParam !== category.id) {
      navigate(lp(`/gallery/${category.id}`), { replace: true });
    }
  }, [backendParam, category.id, navigate, lp]);

  const groups = useMemo(() => buildGroups(category.charts, locale), [category, locale]);
  const sectionIds = useMemo(
    () => groups.flatMap((g) => g.sections.map((s) => s.chart.id)),
    [groups],
  );

  // Reset the highlight + scroll position when the backend changes.
  useEffect(() => {
    setActiveChartId(null);
    mainRef.current?.scrollTo({ top: 0 });
  }, [category.id]);

  // Scroll-spy: highlight the latest chart heading that has crossed the reading
  // zone. The gallery/backend selection is route state and remains independent.
  useEffect(() => {
    const root = mainRef.current;
    if (!root) return;

    const updateActiveSection = () => {
      if (navScrollingRef.current) return;

      const rootRect = root.getBoundingClientRect();
      const activationY = rootRect.top + rootRect.height * SCROLL_SPY_ACTIVATION_RATIO;
      const targets = sectionIds
        .map((id) => ({
          id,
          el: root.querySelector<HTMLElement>(`#${CSS.escape(id)}`),
        }))
        .filter((target): target is { id: string; el: HTMLElement } => target.el !== null);

      let firstVisibleId: string | null = null;
      let firstVisibleTop = Infinity;
      let crossedActiveId: string | null = null;
      let nextTop = -Infinity;
      for (const target of targets) {
        const rect = target.el.getBoundingClientRect();
        const top = rect.top;
        const bottom = rect.bottom;
        const isVisible = bottom > rootRect.top + SCROLL_SPY_VISIBLE_MARGIN
          && top < rootRect.bottom - SCROLL_SPY_VISIBLE_MARGIN;
        if (isVisible && top < firstVisibleTop) {
          firstVisibleTop = top;
          firstVisibleId = target.id;
        }
        if (top <= activationY && top > nextTop) {
          nextTop = top;
          crossedActiveId = target.id;
        }
      }

      const nextActiveId = crossedActiveId ?? firstVisibleId;
      setActiveChartId((current) => (current === nextActiveId ? current : nextActiveId));
    };

    updateActiveSection();
    root.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('resize', updateActiveSection);
    return () => {
      root.removeEventListener('scroll', updateActiveSection);
      window.removeEventListener('resize', updateActiveSection);
    };
  }, [sectionIds]);

  const scrollToGallery = useCallback((id: PreviewBackend) => {
    if (id !== category.id) {
      navigate(lp(`/gallery/${id}`));
      return;
    }

    const root = mainRef.current;
    if (!root) return;

    setActiveChartId(null);
    navScrollingRef.current = true;
    root.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => {
      navScrollingRef.current = false;
    }, 700);
  }, [category.id, navigate, lp]);

  const scrollToChart = useCallback((id: string) => {
    const root = mainRef.current;
    const target = root?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!root || !target) return;

    setActiveChartId(id);
    navScrollingRef.current = true;
    const rootTop = root.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    root.scrollTo({ top: root.scrollTop + targetTop - rootTop - 8, behavior: 'smooth' });
    window.setTimeout(() => {
      navScrollingRef.current = false;
    }, 700);
  }, []);

  // Bring the relevant sidebar item into view only when it has scrolled out of
  // the sidebar's visible area. The backend stays selected from the route; the
  // chart row follows the right-pane scroll position.
  useEffect(() => {
    const sidebar = sidebarRef.current;
    const firstSectionId = sectionIds[0] ?? null;
    if (!sidebar) return;

    if (!activeChartId || activeChartId === firstSectionId) {
      sidebar.scrollTop = 0;
      return;
    }

    const selector = `[data-chart-nav="${CSS.escape(activeChartId)}"]`;
    const item = sidebar?.querySelector<HTMLElement>(selector);
    scrollNavItemIntoView(sidebar, item ?? null);
  }, [activeChartId, category.id, sectionIds]);

  return (
    <SiteShell>
      <style>{galleryResponsiveStyles}</style>
      <div
        ref={mainRef}
        className="gallery-scroll-root"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          background: siteTheme.surface,
        }}
      >
        <div
          className="gallery-layout"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            width: '100%',
            maxWidth: CONTENT_MAX_WIDTH,
            margin: '0 auto',
          }}
        >
          <WallSidebar
            sidebarRef={sidebarRef}
            category={category}
            groups={groups}
            activeChartId={activeChartId}
            onNavigate={scrollToChart}
            onSelectBackend={scrollToGallery}
          />

          <main style={{ flex: 1, minWidth: 0 }}>
            <div className="gallery-content" style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 40px 96px' }}>
              <header className="gallery-header" style={{ marginBottom: 18 }}>
                <h1 className="gallery-title" style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: -0.4 }}>
                  {t('gallery.title')}
                  <span className="gallery-title-backend">
                    {' '}
                    {t('gallery.titleBackend', { backend: category.label })}
                  </span>
                </h1>
                <MobileBackendTabs category={category} onSelectBackend={scrollToGallery} />
              </header>

              <BackendIntro
                category={category}
                groups={groups}
                onNavigate={scrollToChart}
              />

            {groups.map((group) => (
              <div key={group.id} style={{ marginTop: 44 }}>
                {group.sections.map((section) => (
                  <section
                    key={section.chart.id}
                    id={section.chart.id}
                    style={{ marginTop: 22, scrollMarginTop: 12 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
                      <img
                        src={section.chart.icon}
                        alt=""
                        aria-hidden="true"
                        style={{ width: 19, height: 19, flexShrink: 0 }}
                      />
                      <h2
                        style={{
                          margin: 0,
                          fontSize: 16,
                          fontWeight: 600,
                          letterSpacing: -0.2,
                          color: siteTheme.text,
                        }}
                      >
                        {section.chart.label}
                      </h2>
                    </div>

                    <div
                      className="gallery-card-grid"
                      data-gallery-grid=""
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                        gap: '30px 34px',
                        alignItems: 'start',
                      }}
                    >
                      {section.tiles.map((tile) => (
                        <VariantCard
                          key={`${tile.chart.id}-${tile.pos}`}
                          tile={tile}
                          onOpen={() =>
                            setActive({
                              chart: tile.chart,
                              tests: tile.variants,
                              editorIndices: tile.indices,
                              index: tile.pos,
                            })
                          }
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ))}
            </div>
          </main>
        </div>
      </div>

      {active && (
        <ChartCodeModal
          chart={active.chart}
          tests={active.tests}
          initialIndex={active.index}
          editorIndices={active.editorIndices}
          onClose={() => setActive(null)}
        />
      )}
    </SiteShell>
  );
}

function WallSidebar({
  sidebarRef,
  category,
  groups,
  activeChartId,
  onNavigate,
  onSelectBackend,
}: {
  sidebarRef: Ref<HTMLElement>;
  category: ChartCategory;
  groups: FamilyGroup[];
  activeChartId: string | null;
  onNavigate: (id: string) => void;
  onSelectBackend: (id: PreviewBackend) => void;
}) {
  const { t } = useTranslation();
  return (
    <SidebarNav sidebarRef={sidebarRef}>
      <SidebarNavSection label={t('gallery.sidebars.galleries')} first>
        {CHART_CATEGORIES.map((c) => (
          <BackendNavItem
            key={c.id}
            label={c.label}
            active={c.id === category.id}
            dataAttr={{ 'data-gallery-nav': c.id }}
            onClick={() => onSelectBackend(c.id)}
          />
        ))}
      </SidebarNavSection>

      <SidebarNavSection label={t('gallery.sidebars.chartTypes')}>
        {groups.map((group, index) => (
          <div
            key={group.id}
            style={{ ...chartTypeNavGroupStyle, marginTop: index === 0 ? 2 : 16 }}
          >
            <div style={chartTypeNavGroupLabelStyle}>{group.label}</div>
            {group.sections.map((section) => (
              <SidebarItem
                key={section.chart.id}
                chart={section.chart}
                active={activeChartId === section.chart.id}
                onClick={() => onNavigate(section.chart.id)}
              />
            ))}
          </div>
        ))}
      </SidebarNavSection>
    </SidebarNav>
  );
}

const chartTypeNavGroupStyle: CSSProperties = {
  paddingTop: 2,
};

const chartTypeNavGroupLabelStyle: CSSProperties = {
  padding: '0 12px 5px 16px',
  color: siteTheme.textMuted,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  lineHeight: 1.4,
};

function SidebarItem({
  chart,
  active,
  onClick,
}: {
  chart: ChartEntry;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <SidebarNavItem
      active={active}
      icon={chart.icon}
      onClick={onClick}
      dataAttr={{ 'data-chart-nav': chart.id }}
    >
      {chart.label.replace(/\s*\*$/, '')}
    </SidebarNavItem>
  );
}

function BackendNavItem({
  label,
  active,
  dataAttr,
  onClick,
}: {
  label: string;
  active: boolean;
  dataAttr?: Record<string, string>;
  onClick: () => void;
}) {
  return (
    <SidebarNavItem
      onClick={onClick}
      active={active}
      dataAttr={dataAttr}
    >
      {label}
    </SidebarNavItem>
  );
}

function MobileBackendTabs({
  category,
  onSelectBackend,
}: {
  category: ChartCategory;
  onSelectBackend: (id: PreviewBackend) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="gallery-mobile-backends" aria-label={t('gallery.mobileBackendsAria')}>
      {CHART_CATEGORIES.map((candidate) => {
        const active = candidate.id === category.id;
        return (
          <button
            key={candidate.id}
            type="button"
            onClick={() => onSelectBackend(candidate.id)}
            aria-pressed={active}
            style={{
              ...mobileBackendTabStyle,
              background: active ? siteTheme.text : siteTheme.surface,
              color: active ? '#fff' : siteTheme.text,
              borderColor: active ? siteTheme.text : siteTheme.border,
            }}
          >
            {candidate.label}
          </button>
        );
      })}
    </div>
  );
}

function BackendIntro({
  category,
  groups,
  onNavigate,
}: {
  category: ChartCategory;
  groups: FamilyGroup[];
  onNavigate: (id: string) => void;
}) {
  const { t } = useTranslation();
  // One clickable chip per rendered chart-type section (deduped by display
  // name), so every chip reliably jumps to a section that exists on the wall.
  const chartLinks = useMemo(() => {
    const seen = new Set<string>();
    const links: ChartLink[] = [];
    for (const group of groups) {
      for (const section of group.sections) {
        const label = section.chart.label.replace(/\s*\*$/, '');
        if (seen.has(label)) continue;
        seen.add(label);
        links.push({ id: section.chart.id, label, icon: section.chart.icon });
      }
    }
    return links;
  }, [groups]);

  const resultNames: Record<PreviewBackend, string> = {
    vegalite: 'spec',
    echarts: 'option',
    chartjs: 'config',
  };
  const snippet = `import { ${category.fn} } from 'flint-chart';

const ${resultNames[category.id]} = ${category.fn}(input);`;

  const backendDesc = t(`gallery.backends.${category.id}`);

  return (
    <div className="gallery-intro" data-gallery-intro="" style={{ marginTop: 22 }}>
      <p
        className="gallery-intro-copy"
        style={{
          margin: 0,
          maxWidth: 720,
          color: siteTheme.text,
          fontSize: 14,
          lineHeight: 1.65,
        }}
      >
        {backendDesc}{' '}
        <Trans
          i18nKey="gallery.intro.passInput"
          values={{ fn: category.fn }}
          components={{ code: <code style={inlineCodeStyle} /> }}
        />
      </p>

      <div className="gallery-intro-code">
        <CodeBlock customStyle={{ marginTop: 12, maxWidth: 560, fontSize: 12.5 }}>
          {snippet}
        </CodeBlock>
      </div>

      <p
        className="gallery-intro-link"
        style={{
          margin: '10px 0 0',
          maxWidth: 720,
          color: siteTheme.text,
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        <Trans
          i18nKey="gallery.intro.learnMore"
          values={{ fn: category.fn }}
          components={{
            code: <code style={inlineCodeStyle} />,
            docsLink: (
              <LocaleLink
                to="/documentation/getting-started#compile-your-chart"
                className="site-text-link"
                style={{ color: siteTheme.accent, fontWeight: 600 }}
              />
            ),
          }}
        />
      </p>

      <div className="gallery-chip-panel" style={{ margin: '12px 0 0', maxWidth: 760 }}>
        <div data-gallery-chip-list="" style={chartNameChipListStyle}>
          {chartLinks.map((link) => (
            <ChartChip key={link.id} link={link} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface ChartLink {
  id: string;
  label: string;
  icon: string;
}

/** A small, clickable chart-type chip (icon + name) that jumps to its section. */
function ChartChip({ link, onNavigate }: { link: ChartLink; onNavigate: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => onNavigate(link.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={t('gallery.jumpTo', { label: link.label })}
      style={{
        ...chartNameChipStyle,
        background: hovered ? siteTheme.accentBg : siteTheme.surface,
        borderColor: hovered ? siteTheme.accent : siteTheme.border,
        color: hovered ? siteTheme.accent : siteTheme.text,
      }}
    >
      <img src={link.icon} alt="" aria-hidden="true" style={chartNameChipIconStyle} />
      {link.label}
    </button>
  );
}

function VariantCard({ tile, onOpen }: { tile: Tile; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const faceted = isFacetedTestCase(tile.testCase);

  // Render the preview only once the card scrolls near the viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <button
      ref={ref}
      className="gallery-card"
      data-gallery-card=""
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={tile.title}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        textAlign: 'center',
        width: '100%',
        padding: 0,
        background: 'transparent',
        border: 0,
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          width: '100%',
          borderRadius: 4,
          overflow: 'hidden',
          background: siteTheme.surface,
        }}
      >
        {visible ? (
          <ChartThumb height={TILE_CHART_HEIGHT} hovered={hovered} contain={faceted}>
            <WallChart testCase={tile.testCase} backend={tile.chart.backend} />
          </ChartThumb>
        ) : (
          <div
            style={{
              height: TILE_CHART_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: siteTheme.textMuted,
              fontSize: 12,
            }}
          >
            Loading…
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 7,
          padding: '0 2px',
          fontSize: 13,
          lineHeight: 1.4,
          color: hovered ? siteTheme.accent : siteTheme.text,
          transition: 'color 150ms ease',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {tile.title}
      </div>
    </button>
  );
}

const inlineCodeStyle: CSSProperties = {
  fontFamily: siteTheme.fontMono,
  fontSize: 12.5,
  background: siteTheme.bg,
  border: `1px solid ${siteTheme.border}`,
  borderRadius: 4,
  padding: '1px 5px',
};

const chartNameChipListStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 5,
  margin: '10px 0 0',
  padding: 0,
};

const chartNameChipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontFamily: 'inherit',
  fontSize: 11.5,
  lineHeight: 1.4,
  color: siteTheme.text,
  background: siteTheme.surface,
  border: `1px solid ${siteTheme.border}`,
  borderRadius: 999,
  padding: '2px 9px 2px 6px',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  transition: 'background 0.12s ease, border-color 0.12s ease, color 0.12s ease',
};

const chartNameChipIconStyle: CSSProperties = {
  width: 13,
  height: 13,
  flexShrink: 0,
};

const mobileBackendTabStyle: CSSProperties = {
  flex: '0 0 auto',
  border: `1px solid ${siteTheme.border}`,
  borderRadius: 999,
  padding: '6px 12px',
  font: 'inherit',
  fontSize: 13,
  lineHeight: 1.2,
  cursor: 'pointer',
};

const galleryResponsiveStyles = `
  .gallery-mobile-backends {
    display: none;
  }

  @media (max-width: 640px) {
    .gallery-scroll-root {
      overflow-x: hidden !important;
    }

    .gallery-layout {
      display: block !important;
      max-width: none !important;
    }

    .gallery-layout .app-sidebar {
      display: none !important;
    }

    .gallery-content {
      max-width: none !important;
      padding: 24px 20px 72px !important;
    }

    .gallery-header {
      margin-bottom: 14px !important;
    }

    .gallery-title {
      font-size: 26px !important;
      line-height: 1.16 !important;
      letter-spacing: 0 !important;
    }

    .gallery-title-backend {
      display: none;
    }

    .gallery-mobile-backends {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding: 14px 0 2px;
      scrollbar-width: none;
    }

    .gallery-mobile-backends::-webkit-scrollbar {
      display: none;
    }

    .gallery-intro {
      margin-top: 10px !important;
      margin-bottom: 30px;
    }

    .gallery-intro-copy {
      font-size: 15.5px !important;
      line-height: 1.6 !important;
      max-width: none !important;
    }

    .gallery-intro-code,
    .gallery-intro-link,
    .gallery-chip-panel {
      display: none !important;
    }

    .gallery-card-grid {
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 22px !important;
    }

    .gallery-card {
      text-align: left !important;
    }
  }
`;
