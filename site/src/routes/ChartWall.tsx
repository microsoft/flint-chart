import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TEST_GENERATORS, type TestCase } from 'flint-chart/test-data';
import { SiteShell } from '../components/SiteShell';
import { CodeBlock } from '../components/CodeBlock';
import { ChartThumb } from '../components/ChartThumb';
import { WallChart } from '../components/WallChart';
import { ChartCodeModal } from '../components/ChartCodeModal';
import {
  CHART_CATEGORIES,
  type ChartCategory,
  type ChartEntry,
} from '../shared/chart-categories';
import { selectVariants } from '../shared/wall-variants';
import { CHART_FAMILIES, familyForChart } from '../shared/wall-families';
import { humanizeVariants } from '../shared/wall-title';
import type { PreviewBackend } from '../shared/supported-backends';
import { siteTheme, CONTENT_MAX_WIDTH } from '../shared/theme';
import { scrollNavItemIntoView } from '../shared/scroll-to-heading';

const MAX_VARIANTS = 4;
const TILE_CHART_HEIGHT = 190;
const SIDEBAR_WIDTH = 232;
const SCROLL_SPY_ROOT_MARGIN = '-12% 0px -75% 0px';

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
function buildGroups(charts: ChartEntry[]): FamilyGroup[] {
  const sectionsByFamily = new Map<string, ChartSection[]>();

  for (const chart of charts) {
    const full = loadTests(chart.generator);
    const variants = selectVariants(full, MAX_VARIANTS);
    if (variants.length === 0) continue;
    const indices = variants.map((v) => full.indexOf(v));
    const titles = humanizeVariants(variants);
    const tiles = variants.map((testCase, pos) => ({
      chart,
      testCase,
      title: titles[pos],
      pos,
      variants,
      indices,
    }));
    const familyId = familyForChart(chart);
    const bucket = sectionsByFamily.get(familyId) ?? [];
    bucket.push({ chart, tiles });
    sectionsByFamily.set(familyId, bucket);
  }

  return CHART_FAMILIES.map((family) => ({
    id: family.id,
    label: family.label,
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
  const category = resolveCategory(backendParam);

  const mainRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const navScrollingRef = useRef(false);
  const [activeId, setActiveId] = useState('');
  const [active, setActive] = useState<ActiveModal | null>(null);

  // Keep the URL canonical (e.g. /wall -> /wall/vegalite) without adding history.
  useEffect(() => {
    if (backendParam !== category.id) {
      navigate(`/wall/${category.id}`, { replace: true });
    }
  }, [backendParam, category.id, navigate]);

  const groups = useMemo(() => buildGroups(category.charts), [category]);
  const sectionIds = useMemo(
    () => groups.flatMap((g) => g.sections.map((s) => s.chart.id)),
    [groups],
  );
  const totalTiles = groups.reduce(
    (sum, g) => sum + g.sections.reduce((n, s) => n + s.tiles.length, 0),
    0,
  );

  // Reset the highlight + scroll position when the backend changes.
  useEffect(() => {
    setActiveId(sectionIds[0] ?? '');
    mainRef.current?.scrollTo({ top: 0 });
  }, [category.id, sectionIds]);

  // Scroll-spy: highlight the topmost visible chart-type section.
  useEffect(() => {
    const root = mainRef.current;
    if (!root) return;

    const els = sectionIds
      .map((id) => root.querySelector<HTMLElement>(`#${CSS.escape(id)}`))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const intersecting = new Set<HTMLElement>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          if (entry.isIntersecting) intersecting.add(el);
          else intersecting.delete(el);
        }
        if (navScrollingRef.current) return;

        let topEl: HTMLElement | null = null;
        let topValue = Infinity;
        for (const el of intersecting) {
          const top = el.getBoundingClientRect().top;
          if (top < topValue) {
            topValue = top;
            topEl = el;
          }
        }
        if (topEl) setActiveId(topEl.id);
      },
      { root, rootMargin: SCROLL_SPY_ROOT_MARGIN, threshold: 0 },
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sectionIds]);

  const scrollToChart = useCallback((id: string) => {
    const root = mainRef.current;
    const target = root?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!root || !target) return;

    setActiveId(id);
    navScrollingRef.current = true;
    const rootTop = root.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    root.scrollTo({ top: root.scrollTop + targetTop - rootTop - 8, behavior: 'smooth' });
    window.setTimeout(() => {
      navScrollingRef.current = false;
    }, 700);
  }, []);

  // Bring the active chart type into view in the sidebar, but only when it has
  // scrolled out of the sidebar's visible area. Discrete (on activeId change),
  // so it never forms a scroll feedback loop.
  useEffect(() => {
    if (!activeId) return;
    const sidebar = sidebarRef.current;
    const item = sidebar?.querySelector<HTMLElement>(
      `[data-chart-nav="${CSS.escape(activeId)}"]`,
    );
    scrollNavItemIntoView(sidebar, item ?? null);
  }, [activeId]);

  return (
    <SiteShell>
      <div
        ref={mainRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          background: siteTheme.surface,
        }}
      >
        <div
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
            activeId={activeId}
            onNavigate={scrollToChart}
            onSelectBackend={(id) => navigate(`/wall/${id}`)}
          />

          <main style={{ flex: 1, minWidth: 0 }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 40px 96px' }}>
              <header style={{ marginBottom: 18 }}>
                <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: -0.4 }}>
                  Example Gallery ({category.label} backend)
                </h1>
              </header>

              <BackendIntro category={category} totalTiles={totalTiles} />

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
  activeId,
  onNavigate,
  onSelectBackend,
}: {
  sidebarRef: Ref<HTMLElement>;
  category: ChartCategory;
  groups: FamilyGroup[];
  activeId: string;
  onNavigate: (id: string) => void;
  onSelectBackend: (id: PreviewBackend) => void;
}) {
  return (
    <aside
      ref={sidebarRef}
      className="app-sidebar"
      style={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
        maxHeight: '100vh',
        overflowY: 'auto',
        background: 'transparent',
        padding: '18px 0 28px',
      }}
    >
      <div style={sidebarEyebrowStyle}>Galleries</div>
      <div style={{ padding: '0 10px' }}>
        {CHART_CATEGORIES.map((c) => (
          <BackendNavItem
            key={c.id}
            label={c.label}
            active={c.id === category.id}
            onClick={() => onSelectBackend(c.id)}
          />
        ))}
      </div>

      <div
        style={{
          margin: '16px 16px 0',
          borderTop: `1px solid ${siteTheme.border}`,
        }}
      />

      <div style={{ ...sidebarEyebrowStyle, paddingTop: 14 }}>Chart types</div>

      {groups.map((group) => (
        <div key={group.id} style={{ marginTop: 10 }}>
          {group.sections.map((section) => (
            <SidebarItem
              key={section.chart.id}
              chart={section.chart}
              active={activeId === section.chart.id}
              onClick={() => onNavigate(section.chart.id)}
            />
          ))}
        </div>
      ))}
    </aside>
  );
}

function SidebarItem({
  chart,
  active,
  onClick,
}: {
  chart: ChartEntry;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      data-chart-nav={chart.id}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: '100%',
        padding: '5px 16px 5px 18px',
        border: 0,
        textAlign: 'left',
        background: active ? siteTheme.accentBg : hovered ? '#eef1f4' : 'transparent',
        boxShadow: active ? `inset 3px 0 0 ${siteTheme.accent}` : undefined,
        color: active ? siteTheme.accent : siteTheme.text,
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
      }}
    >
      <img
        src={chart.icon}
        alt=""
        aria-hidden="true"
        style={{ width: 17, height: 17, flexShrink: 0 }}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {chart.label.replace(/\s*\*$/, '')}
      </span>
    </button>
  );
}

function BackendNavItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block',
        width: '100%',
        padding: '7px 12px',
        marginBottom: 2,
        border: `1px solid ${active ? siteTheme.accent : 'transparent'}`,
        borderRadius: siteTheme.radius,
        textAlign: 'left',
        background: active ? siteTheme.accentBg : hovered ? '#eef1f4' : 'transparent',
        color: active ? siteTheme.accent : siteTheme.text,
        cursor: 'pointer',
        fontSize: 13.5,
        fontWeight: active ? 600 : 500,
      }}
    >
      {label}
    </button>
  );
}

function BackendIntro({ category, totalTiles }: { category: ChartCategory; totalTiles: number }) {
  const typeNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const chart of category.charts) {
      const name = chart.label.replace(/\s*\*$/, '');
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
    return names;
  }, [category]);

  const resultNames: Record<PreviewBackend, string> = {
    vegalite: 'spec',
    echarts: 'option',
    chartjs: 'config',
  };
  const snippet = `import { ${category.fn} } from 'flint-chart';

const ${resultNames[category.id]} = ${category.fn}(input);`;

  return (
    <div style={{ marginTop: 22 }}>
      <p
        style={{
          margin: 0,
          maxWidth: 720,
          color: siteTheme.textMuted,
          fontSize: 14,
          lineHeight: 1.65,
        }}
      >
        {category.description} Pass a Flint <code style={inlineCodeStyle}>input</code> (data,
        semantic types, and a chart spec) to <code style={inlineCodeStyle}>{category.fn}()</code>.
      </p>

      <CodeBlock customStyle={{ marginTop: 12, maxWidth: 560, fontSize: 12.5 }}>
        {snippet}
      </CodeBlock>

      <p
        style={{
          margin: '10px 0 0',
          maxWidth: 720,
          color: siteTheme.textMuted,
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        See{' '}
        <Link
          to="/documentation/getting-started#compile-your-chart"
          style={{ color: siteTheme.accent, fontWeight: 600 }}
        >
          Compile your chart
        </Link>{' '}
        for the app integration pattern.
      </p>

      <p
        style={{
          margin: '12px 0 0',
          maxWidth: 760,
          fontSize: 13,
          color: siteTheme.textMuted,
          lineHeight: 1.6,
        }}
      >
        The {category.label} backend supports{' '}
        <strong style={{ color: siteTheme.text, fontWeight: 600 }}>
          {typeNames.length} chart types
        </strong>{' '}
        across {totalTiles} curated examples — including {typeNames.join(', ')}.
      </p>
    </div>
  );
}

function VariantCard({ tile, onOpen }: { tile: Tile; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);

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
          <ChartThumb height={TILE_CHART_HEIGHT} hovered={hovered}>
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

const sidebarEyebrowStyle: CSSProperties = {
  padding: '0 16px 8px',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: siteTheme.textMuted,
};

const inlineCodeStyle: CSSProperties = {
  fontFamily: siteTheme.fontMono,
  fontSize: 12.5,
  background: siteTheme.bg,
  border: `1px solid ${siteTheme.border}`,
  borderRadius: 4,
  padding: '1px 5px',
};
