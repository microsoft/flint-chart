import { useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TEST_GENERATORS, makeField, makeEncodingItem, buildMetadata, type TestCase } from 'flint-chart/test-data';
import { SiteNavBar, MicrosoftDisclosures, GitHubIcon } from '../components/SiteShell';
import { WallChart } from '../components/WallChart';
import { ScaleToFit } from '../components/ScaleToFit';
import { SpecPipelineFigure } from '../components/SpecPipelineFigure';
import { testCaseToFlintSummary, testCaseToAssemblyInput } from '../shared/test-case-utils';
import { buildGalleryEditorHref, openEditorWithPayload } from '../shared/editor-payload';
import { CHART_CATEGORIES } from '../shared/chart-categories';
import { MOVIE_RATINGS } from './movie-ratings-data';
import {
  ALL_BACKENDS,
  BACKEND_LABELS,
  getSupportedBackends,
  type PreviewBackend,
} from '../shared/supported-backends';
import { GITHUB_REPO, siteTheme } from '../shared/theme';
import overviewImg from '../assets/flint-overview.png';

/**
 * Front page: flat "paper" look inspired by Microsoft data-formulator. A
 * paper-white canvas with a faint grid, hairline borders, and no drop shadows.
 * Copy is written to read plainly, with one interactive spec→chart example.
 */
export function Landing() {
  return (
    <div style={pageStyle}>
      <style>{landingInteractiveStyles}</style>
      <SiteNavBar flush />

      <main style={mainStyle}>
        {/* ---- Hero ------------------------------------------------------ */}
        <section style={{ ...sectionStyle, paddingTop: 88, paddingBottom: 36 }}>
          <h1 style={heroTitleStyle}>Flint: A Visualization Language for the AI Era</h1>
          <div style={heroAttributionStyle}>A Microsoft Research project</div>

          <div className="landing-lead-columns" style={leadColumnsStyle}>
            <div style={leadTextColStyle}>
              <p style={leadStyle}>{LEAD_INTRO}</p>

              <div style={installLinesStyle}>
                <div style={installLineStyle}>
                  <span style={promptMarkStyle}>&gt;</span> Install Flint with{' '}
                  <Link
                    to="/documentation/getting-started#javascript-typescript"
                    className="landing-skill-link"
                    style={installLineLinkStyle}
                  >
                    npm
                  </Link>{' '}
                  (TypeScript / JavaScript).
                </div>
                <div style={installLineStyle}>
                  <span style={promptMarkStyle}>&gt;</span> To use Flint in agent workflows, check the{' '}
                  <Link
                    to="/mcp"
                    className="landing-skill-link"
                    style={installLineLinkStyle}
                  >
                    MCP server
                  </Link>
                  .
                </div>
                <div style={installLineStyle}>
                  <span style={promptMarkStyle}>&gt;</span> Explore {CHART_FAMILY_COUNT} chart types and{' '}
                  {CHART_GALLERY_ENTRY_COUNT} examples in the{' '}
                  <Link to="/gallery" className="landing-skill-link" style={installLineLinkStyle}>
                    gallery
                  </Link>
                  .
                </div>
              </div>
            </div>
            <div className="landing-hero-actions" style={leadButtonsColStyle}>
              <div style={actionBoxStyle}>
                <HeroCTA to="/gallery" label="Explore Gallery" variant="secondary" />
                <HeroCTA to="/mcp" label="Get MCP Server" variant="secondary" />
                <HeroCTA href={GITHUB_REPO} label="Visit GitHub" icon={<GitHubIcon size={17} />} variant="secondary" />
              </div>
            </div>
          </div>
        </section>

        {/* ---- Overview figure (paper teaser) -------------------------- */}
        {/* Hidden for now
        <section style={overviewSectionStyle}>
          <figure style={overviewFigureStyle}>
            <img
              src={overviewImg}
              alt="Flint workflow: an agent infers a dataSpec from a raw table, a short chartSpec is written, and Flint compiles it into a faceted line chart, then a grouped bar, waterfall, heatmap, and sunburst as the spec is edited."
              style={overviewImgStyle}
            />
            <figcaption style={overviewCaptionStyle}>
              One workflow, end to end. An agent infers a dataSpec from the raw table
              (what each field means and how it behaves), you write a short chartSpec,
              and Flint compiles it into a polished chart. Change a line of the spec to
              move between a faceted line chart, grouped bar, waterfall, heatmap, or
              sunburst, or switch the rendering engine, all without touching the
              low-level details.
            </figcaption>
          </figure>
        </section>
        */}

        {/* ---- Interactive example: spec -> chart --------------------- */}
        <HeroShowcase />

        {/* ---- Feature cards (alternating text / visual) -------------- */}
        <section style={howItWorksSectionStyle}>
          <div style={showcaseIntroStyle}>
            <h1 style={showcaseHeadingStyle}>How it works?</h1>
            <div style={showcaseIntroBodyStyle}>
              <p style={showcaseIntroTextStyle}>
                Flint starts with a compact spec: the data, semantic types,
                and the chart spec. From there, the compiler produces a complete backend-native spec (shown
                here in Vega-Lite) filling with the necessary low-level details and renders a good-looking chart. 
              </p>
              <div className="landing-docs-actions" style={showcaseIntroCtaColStyle}>
                <div style={actionBoxStyle}>
                  <HeroCTA className="landing-docs-cta" to="/documentation/overview" label="Read the docs" variant="secondary" />
                </div>
              </div>
            </div>
          </div>
          <PipelineDiagram />
          <div style={featureGridStyle}>
            {FEATURES.map((feature, i) => (
              <article key={feature.title} style={featureGridItemStyle}>
                <div style={featureGridTextStyle}>
                  <h2 style={featureTitleStyle}>
                    <span style={featureNumberStyle}>{i + 1}.</span>
                    {feature.title}
                  </h2>
                  <p style={featureBodyStyle}>{feature.body}</p>
                </div>
                {feature.demo && (
                  <div style={featureGridVisualStyle}>
                    <FeatureDemoView build={feature.demo} />
                  </div>
                )}
                {feature.example && (
                  <p style={featureExampleStyle} aria-label={`Example: ${feature.example}`}>
                    {feature.example}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>

        {/* ---- Closing CTA -------------------------------------------- */}
        <section style={{ ...sectionStyle, paddingTop: 56, paddingBottom: 88, textAlign: 'center' }}>
          <h2 style={{ fontSize: 26, margin: '0 0 14px', fontWeight: 500 }}>
            Start building with Flint.
          </h2>
          <p style={{ margin: '0 0 30px', color: siteTheme.text, fontSize: 16, lineHeight: 1.7 }}>
            Open source and ready to use. Start from GitHub or browse examples in the gallery.
          </p>
          <div style={{ ...ctaRowStyle, marginTop: 0, justifyContent: 'center' }}>
            <a href={GITHUB_REPO} style={primaryBtn} target="_blank" rel="noreferrer">
              View on GitHub
            </a>
            <Link to="/gallery" style={secondaryBtn}>
              Browse the gallery
            </Link>
          </div>
          <p style={{ margin: '32px 0 0', color: siteTheme.text, fontSize: 16, lineHeight: 1.7 }}>
            Flint is built by{' '}
            <a
              className="site-text-link"
              style={contributorLinkStyle}
              href="https://www.microsoft.com/en-us/research/"
              target="_blank"
              rel="noreferrer"
            >
              Microsoft Research
            </a>{' '}
            in collaboration with the{' '}
            <a
              className="site-text-link"
              style={contributorLinkStyle}
              href="https://ideas-lab.net/"
              target="_blank"
              rel="noreferrer"
            >
              IDEAS Lab
            </a>
            , Renmin University of China.
          </p>
        </section>
      </main>
      <MicrosoftDisclosures />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Interactive showcase                                                */
/* ------------------------------------------------------------------ */

interface ShowcaseExample {
  id: string;
  label: string;
  caption: string;
  generator?: string;
  index?: number;
  /** Pre-built test case (for examples not backed by a gallery generator). */
  testCase?: TestCase;
  /** Optional canvas override; narrower widths force facet panels to wrap. */
  canvasSize?: { width: number; height: number };
}

/* ---- Chart-property examples (real data-formulator "movies" dataset) ---- */

// Film counts by MPAA rating across the full 3,201-row Vega movies corpus.
const MOVIE_MPAA: Array<[rating: string, films: number]> = [
  ['R', 1194],
  ['PG-13', 865],
  ['PG', 354],
  ['Not Rated', 94],
  ['G', 79],
  ['NC-17', 8],
];

/** Pie made into a donut purely by an `innerRadius` chart property. */
function moviesDonut(): TestCase {
  const data = MOVIE_MPAA.map(([Rating, Films]) => ({ Rating, Films }));
  return {
    title: 'Films by MPAA rating',
    description: '',
    tags: [],
    chartType: 'Pie Chart',
    data,
    fields: [makeField('Rating'), makeField('Films')],
    metadata: buildMetadata(data),
    encodingMap: { color: makeEncodingItem('Rating'), size: makeEncodingItem('Films') },
    chartProperties: { innerRadius: 50 },
  };
}

/** Scatter + fitted trend line via the `Regression` chart type. */
function moviesRegression(): TestCase {
  const data = MOVIE_RATINGS.map(([rt, imdb]) => ({
    'Rotten Tomatoes': rt,
    'IMDB Rating': imdb,
  }));
  return {
    title: 'Critic vs audience scores',
    description: '',
    tags: [],
    chartType: 'Regression',
    data,
    fields: [makeField('Rotten Tomatoes'), makeField('IMDB Rating')],
    metadata: buildMetadata(data),
    encodingMap: {
      x: makeEncodingItem('Rotten Tomatoes'),
      y: makeEncodingItem('IMDB Rating'),
    },
  };
}

// Film counts by major genre.
const MOVIE_GENRE: Array<[genre: string, films: number]> = [
  ['Drama', 789],
  ['Comedy', 675],
  ['Action', 420],
  ['Adventure', 274],
  ['Thriller/Suspense', 239],
  ['Horror', 219],
  ['Romantic Comedy', 137],
  ['Musical', 53],
  ['Documentary', 43],
  ['Black Comedy', 36],
  ['Western', 36],
];

/** Bars ordered by descending film count via a sort-by-measure (`-y`) override. */
function moviesSortedBar(): TestCase {
  const data = MOVIE_GENRE.map(([Genre, Films]) => ({ Genre, Films }));
  return {
    title: 'Films by genre (most to fewest)',
    description: '',
    tags: [],
    chartType: 'Bar Chart',
    data,
    fields: [makeField('Genre'), makeField('Films')],
    metadata: buildMetadata(data),
    encodingMap: {
      x: makeEncodingItem('Genre', { sortBy: 'y', sortOrder: 'descending' }),
      y: makeEncodingItem('Films'),
    },
  };
}

const SHOWCASE_EXAMPLES: ShowcaseExample[] = [
  {
    id: 'line',
    label: 'Faceted line chart',
    caption: 'Monthly active users by region, laid out as small multiples over time.',
    generator: 'Omni: Line',
    index: 0,
    canvasSize: { width: 300, height: 600 },
  },
  {
    id: 'heatmap',
    label: 'Diverging heatmap',
    caption: 'Net user gains and losses by region and month, shown with zero-centered color.',
    generator: 'Omni: Heatmap',
    index: 0,
  },
  {
    id: 'waterfall',
    label: 'Waterfall',
    caption: 'Monthly gains and losses accumulated into the running user total for the year.',
    generator: 'Omni: Waterfall',
    index: 0,
  },
  {
    id: 'sunburst',
    label: 'Sunburst',
    caption: 'User activity broken into a three-level hierarchy: region, game type, and game.',
    generator: 'Omni: Sunburst',
    index: 0,
  },
  {
    id: 'donut',
    label: 'Donut chart',
    caption: 'Film ratings as proportional slices, with an inner radius applied from the chart spec.',
    testCase: moviesDonut(),
  },
  {
    id: 'regression',
    label: 'Regression scatter',
    caption: 'Critic and audience scores with a fitted trend line to reveal their relationship.',
    testCase: moviesRegression(),
  },
  {
    id: 'sorted-bar',
    label: 'Sorted bar chart',
    caption: 'Film genres ordered by count, from the most common to the least.',
    testCase: moviesSortedBar(),
  },
];


function HeroCTA({
  label,
  icon,
  to,
  href,
  variant,
  className,
}: {
  label: string;
  icon?: ReactNode;
  to?: string;
  href?: string;
  variant: 'primary' | 'secondary';
  className?: string;
}) {
  const [active, setActive] = useState(false);
  const handlers = {
    onMouseEnter: () => setActive(true),
    onMouseLeave: () => setActive(false),
    onFocus: () => setActive(true),
    onBlur: () => setActive(false),
  };
  const ctaClassName = ['landing-hero-cta', className].filter(Boolean).join(' ');

  if (href) {
    return (
      <a className={ctaClassName} href={href} style={heroCtaStyle(variant, active)} target="_blank" rel="noreferrer" {...handlers}>
        {icon}
        {label}
      </a>
    );
  }

  return (
    <Link className={ctaClassName} to={to ?? '/'} style={heroCtaStyle(variant, active)} {...handlers}>
      {icon}
      {label}
    </Link>
  );
}

function HeroShowcase() {
  const [exampleIdx, setExampleIdx] = useState(0);
  const [selectedBackend, setSelectedBackend] = useState<PreviewBackend>('vegalite');

  const example = SHOWCASE_EXAMPLES[exampleIdx];
  const galleryTestCase = useTestCase(example.generator ?? '', example.index ?? 0);
  const testCase = example.testCase ?? galleryTestCase;
  const supported = useMemo(
    () => (testCase ? getSupportedBackends(testCase.chartType) : []),
    [testCase],
  );
  // Keep the chosen backend when the new example supports it; otherwise fall
  // back to that example's first available backend.
  const backend = supported.includes(selectedBackend) ? selectedBackend : supported[0] ?? 'vegalite';

  if (!testCase) return null;

  const count = SHOWCASE_EXAMPLES.length;
  const goPrev = () => setExampleIdx((i) => (i - 1 + count) % count);
  const goNext = () => setExampleIdx((i) => (i + 1) % count);

  return (
    <section style={heroShowcaseSectionStyle}>
      <div className="landing-showcase-row" style={carouselRowStyle}>
        <button
          className="landing-carousel-arrow"
          type="button"
          onClick={goPrev}
          aria-label="Previous example"
          title="Previous example"
          style={pagerArrowStyle}
        >
          <ChevronIcon dir="left" />
        </button>

        <div className="landing-showcase-card" style={{ ...showcaseCardStyle, flex: 1, minWidth: 0 }}>
          <div style={showcasePaneStyle}>
            <div style={paneHeaderRowStyle}>
              <span style={paneLabelStyle}>Flint spec</span>
              <OpenEditorButton
                href={
                  example.generator
                    ? buildGalleryEditorHref(example.generator, example.index ?? 0)
                    : undefined
                }
                onActivate={
                  example.generator
                    ? undefined
                    : () => openEditorWithPayload(testCaseToAssemblyInput(testCase))
                }
              />
            </div>
            <FlintSpecCode testCase={testCase} canvasSize={example.canvasSize} />
          </div>

          <div className="landing-chart-pane" style={{ ...showcasePaneStyle, ...chartPaneStyle, borderLeft: `1px solid ${HAIRLINE}` }}>
            <div className="landing-pane-header" style={paneHeaderRowStyle}>
              <span style={paneLabelStyle}>Compiled chart</span>
              <div className="landing-backend-toggle" style={backendToggleStyle} role="tablist" aria-label="Rendering backend">
                {ALL_BACKENDS.map((b) => {
                  const isSupported = supported.includes(b);
                  const active = b === backend;
                  return (
                    <button
                      key={b}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      disabled={!isSupported}
                      onClick={() => setSelectedBackend(b)}
                      title={isSupported ? `Render with ${BACKEND_LABELS[b]}` : `${BACKEND_LABELS[b]} doesn’t support this chart`}
                      style={backendBtnStyle(active, isSupported)}
                    >
                      {BACKEND_LABELS[b]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ padding: '4px 12px 14px' }}>
              <ScaleToFit height={360} minHeight={236} padding={6} adaptiveHeight>
                <WallChart testCase={testCase} backend={backend} canvasSize={example.canvasSize} />
              </ScaleToFit>
            </div>
          </div>
        </div>

        <button
          className="landing-carousel-arrow"
          type="button"
          onClick={goNext}
          aria-label="Next example"
          title="Next example"
          style={pagerArrowStyle}
        >
          <ChevronIcon dir="right" />
        </button>
      </div>
      <p style={showcaseCaptionStyle}>
        <strong style={{ color: siteTheme.text, fontWeight: 600 }}>{example.label}.</strong>{' '}
        {example.caption}
      </p>

      {/* Example pager dots */}
      <div style={{ ...dotsRowStyle, marginTop: 16 }} role="tablist" aria-label="Example">
        {SHOWCASE_EXAMPLES.map((ex, i) => (
          <button
            key={ex.id}
            type="button"
            role="tab"
            aria-selected={i === exampleIdx}
            aria-label={ex.label}
            title={ex.label}
            onClick={() => setExampleIdx(i)}
            style={dotStyle(i === exampleIdx)}
          />
        ))}
      </div>
    </section>
  );
}

function ChevronIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OpenEditorButton({
  href,
  onActivate,
}: {
  href?: string;
  onActivate?: () => string;
}) {
  const [active, setActive] = useState(false);
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (onActivate) {
      e.preventDefault();
      window.location.hash = onActivate();
    }
  };
  return (
    <a
      href={href ?? '#/editor'}
      style={openEditorBtnStyle(active)}
      title="Open this example in the editor"
      onClick={handleClick}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      Open in editor →
    </a>
  );
}

function FlintSpecCode({ testCase, canvasSize }: { testCase: TestCase; canvasSize?: { width: number; height: number } }) {
  const text = useMemo(() => {
    const summary = testCaseToFlintSummary(testCase);
    const withCanvas = canvasSize
      ? { ...summary, chart_spec: { ...summary.chart_spec, baseSize: canvasSize } }
      : summary;
    const body = JSON.stringify(withCanvas, null, 2);
    return body.replace(/^{\n/, '{\n  "data": {...},\n');
  }, [testCase, canvasSize]);
  return <pre style={specPreStyle}>{text}</pre>;
}

/* ------------------------------------------------------------------ */
/* "How it works" pipeline diagram                                     */
/*                                                                     */
/* Static three-panel explainer (compact Flint spec → compiled         */
/* backend-native spec → rendered chart), reusing the figure from the  */
/* dev playground, scaled to fit the section column.                   */
/* ------------------------------------------------------------------ */

function PipelineDiagram() {
  return (
    <>
      <figure className="landing-pipeline-figure--desktop" style={pipelineFigureStyle}>
        <ScaleToFit height={520} minHeight={260} padding={0} adaptiveHeight>
          <SpecPipelineFigure />
        </ScaleToFit>
      </figure>
      <figure className="landing-pipeline-figure--mobile" style={pipelineFigureStyle}>
        <SpecPipelineFigure orientation="vertical" />
      </figure>
    </>
  );
}

/*                                                                     */
/* Edit the copy below to rewrite the landing copy. The intro uses     */
/* small inline highlights; feature title/body/example strings stay    */
/* plain so they can be reworded without touching JSX.                 */
/* ------------------------------------------------------------------ */

function LeadHighlight({ children }: { children: string }) {
  return <span style={leadHighlightStyle}>{children}</span>;
}

const CHART_FAMILY_COUNT = new Set(
  CHART_CATEGORIES.flatMap((category) =>
    category.charts.map((chart) => chart.label.replace(/\s+\*$/u, '')),
  ),
).size;
const CHART_GALLERY_ENTRY_COUNT = CHART_CATEGORIES.reduce(
  (count, category) => count + category.charts.length,
  0,
);

// Lead paragraph shown in the hero (the single intro to Flint).
const LEAD_INTRO = (
  <>
    Flint is a visualization intermediate language that lets{' '}
    <LeadHighlight>AI agents reliably create expressive, good-looking charts from simple, human-editable chart specs</LeadHighlight>. Instead of requiring verbose
    low-level parameters such as scales, axes, spacing, and layout, the Flint compiler derives
    optimized chart settings from the data, semantic types, chart type, and encodings. {' '}
    <LeadHighlight>{`Flint supports ${CHART_FAMILY_COUNT} chart types, and it supports rendering in Vega-Lite, ECharts, and Chart.js`}</LeadHighlight>.
  </>
);

interface Feature {
  title: string;
  body: string;
  // Optional concrete example rendered as a callout beneath the body.
  example?: string;
  // Before/after demo shown alongside the text, illustrating the feature.
  demo?: () => FeatureDemoConfig;
}

const FEATURES: Feature[] = [
  {
    title: 'Specify with semantic types',
    body:
      'Flint uses semantic types to capture meanings of data fields ' +
      '(e.g., Rank, YearMonth, Delta, Temperature), and uses them to infer the low-level chart configuration like parsing, scale, axes, formatting and color schemes. ',
    example:
      'For this heatmap of net new users gains by game and month, Flint determines the temporal value parser, axis formatting, and diverging color scheme and midpoint based on the semantic types of the fields.',
    demo: demoSemanticTypes,
  },
  {
    title: 'Automatic layout optimization',
    body:
      'Flint optimizes the chart layout based on an elastic layout model and banking principles. ' + 
      'The compiler dynamically manages sizing, spacing, and arrangement so the chart nicely fits into the canvas. ',
    example:
      'As the grouped bar chart number increases, Flint stretches the canvas and reduces the band width so the dense version still fits the canvas nicely, similar to how springs settle into an expandable container.',
    demo: demoLayout,
  },
  {
    title: 'Easy to generate and adapt',
    body:
      'Without fragile low-level parameters, Flint specs can be easily ' +
      'generated and adapted by users. Changing a chart design requires only switching ' +
      'the chart type and rebinding visual encodings, and the compiler cascades the new ' +
      'encoding choices to the low-level settings.',
    example:
      'The user can easily turn a faceted bar chart of the 2000 U.S. Census population distribution by gender and age into a pyramid chart by switching the chart type. The compiler handles the rest.',
    demo: demoAdapt,
  },
  {
    title: 'Render with different backends',
    body:
      `Flint supports ${CHART_FAMILY_COUNT} chart types across Vega-Lite, ECharts, and Chart.js, with ${CHART_GALLERY_ENTRY_COUNT} backend-specific examples in the gallery. ` +
      'Despite their different APIs and programming models, Flint hides them behind a unified interface. The user can easily switch to different backends and leverage their unique features.',
    example:
      'Vega-Lite has no native sunburst, but the user can easily switch to ECharts. The sunburst chart is a better alternative than the grouped bar chart for visualizing the hierarchy of region \u00d7 gameType \u00d7 game.',
    demo: demoBackends,
  },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function useTestCase(generator: string, index = 0): TestCase | null {
  return useMemo(() => {
    const gen = TEST_GENERATORS[generator];
    if (!gen) return null;
    try {
      const all = gen();
      return all[index] ?? all[0] ?? null;
    } catch {
      return null;
    }
  }, [generator, index]);
}

/* ------------------------------------------------------------------ */
/* Feature before/after demos                                          */
/* ------------------------------------------------------------------ */

type DemoStage =
  | { kind: 'spec'; label: string; testCase: TestCase }
  | { kind: 'chart'; label: string; testCase: TestCase; backend: PreviewBackend };

interface FeatureDemoConfig {
  before: DemoStage;
  after: DemoStage;
}

/** First test case for an Omni generator key. */
function omni(key: string): TestCase {
  return TEST_GENERATORS[key]!()[0];
}

/** Clone a test case, changing only its chart type (encodings preserved). */
function asChartType(base: TestCase, chartType: string): TestCase {
  return { ...base, chartType };
}

/** A synthetic grouped bar chart with `nCats` categories × `nGroups` series (for layout demos). */
function synthGroupedBar(nCats: number, nGroups: number, title: string): TestCase {
  const series = Array.from({ length: nGroups }, (_, g) => 'Series ' + String.fromCharCode(65 + g));
  const data: Array<Record<string, unknown>> = [];
  for (let i = 0; i < nCats; i++) {
    const item = 'G' + String(i + 1).padStart(2, '0');
    for (let g = 0; g < nGroups; g++) {
      data.push({
        item,
        series: series[g],
        value: Math.round(20 + 55 * Math.abs(Math.sin(i * 0.9 + g * 1.7 + 0.5))),
      });
    }
  }
  return {
    title,
    description: '',
    tags: [],
    chartType: 'Grouped Bar Chart',
    data,
    fields: [makeField('item'), makeField('series'), makeField('value')],
    metadata: buildMetadata(data),
    encodingMap: {
      x: makeEncodingItem('item'),
      y: makeEncodingItem('value'),
      color: makeEncodingItem('series'),
      group: makeEncodingItem('series'),
    },
  };
}

// Card 1: the same spec compiles to a chart (data spec / semantic types highlighted).
function demoSemanticTypes(): FeatureDemoConfig {
  const tc = omni('Omni: Heatmap');
  return {
    before: { kind: 'spec', label: 'Flint spec', testCase: tc },
    after: { kind: 'chart', label: 'Compiled chart', testCase: tc, backend: 'vegalite' },
  };
}

// Card 2: same grouped-bar spec, more categories — the layout adapts from sparse to dense.
function demoLayout(): FeatureDemoConfig {
  return {
    before: { kind: 'chart', label: 'Sparse · 5 × 3', testCase: synthGroupedBar(5, 3, 'Sparse grouped bar'), backend: 'vegalite' },
    after: { kind: 'chart', label: 'Dense · 22 × 3', testCase: synthGroupedBar(22, 3, 'Dense grouped bar'), backend: 'vegalite' },
  };
}

// Card 3: same encoding, different chart type — a faceted bar becomes a pyramid.
//
// Real data: U.S. resident population by 5-year age band and sex, 2000 census
// (the same source Vega-Lite's own population-pyramid example draws from).
const US_POP_2000: Array<[band: string, male: number, female: number]> = [
  ['0–4', 9735380, 9310714],
  ['5–9', 10552146, 10069564],
  ['10–14', 10563233, 10022524],
  ['15–19', 10237419, 9692669],
  ['20–24', 9731315, 9324244],
  ['25–29', 9659493, 9518507],
  ['30–34', 10205879, 10119296],
  ['35–39', 11475182, 11635647],
  ['40–44', 11320252, 11488578],
  ['45–49', 9925006, 10261253],
  ['50–54', 8507934, 8911133],
  ['55–59', 6459082, 6921268],
  ['60–64', 5123399, 5668961],
  ['65–69', 4453623, 4804784],
  ['70–74', 3792145, 5184855],
  ['75–79', 2912655, 4355644],
  ['80–84', 1902638, 3221898],
  ['85–89', 970357, 1981156],
  ['90+', 336303, 1064581],
];

/** Long-format population table built from the real 2000 census slice (millions). */
function usPopulationPyramid(): TestCase {
  const data: Array<Record<string, unknown>> = [];
  for (const [band, male, female] of US_POP_2000) {
    data.push({ 'Age Band': band, Sex: 'Male', People: Math.round(male / 1e5) / 10 });
    data.push({ 'Age Band': band, Sex: 'Female', People: Math.round(female / 1e5) / 10 });
  }
  return {
    title: 'U.S. population by age and sex (2000)',
    description: '',
    tags: [],
    chartType: 'Pyramid Chart',
    data,
    fields: [makeField('Age Band'), makeField('People'), makeField('Sex')],
    metadata: buildMetadata(data),
    encodingMap: {
      y: makeEncodingItem('Age Band'),
      x: makeEncodingItem('People'),
      color: makeEncodingItem('Sex'),
    },
  };
}

function demoAdapt(): FeatureDemoConfig {
  const pyr = usPopulationPyramid();
  const facetedBar: TestCase = {
    ...pyr,
    chartType: 'Bar Chart',
    encodingMap: {
      x: makeEncodingItem('Age Band'),
      y: makeEncodingItem('People'),
      column: makeEncodingItem('Sex'),
    },
  };
  return {
    before: { kind: 'chart', label: 'Faceted bar', testCase: facetedBar, backend: 'vegalite' },
    after: { kind: 'chart', label: 'Pyramid', testCase: pyr, backend: 'vegalite' },
  };
}

// Card 4: a Vega-Lite faceted bar and an ECharts sunburst of the same story.
function demoBackends(): FeatureDemoConfig {
  const line = omni('Omni: Line');
  const sun = omni('Omni: Sunburst');
  return {
    before: { kind: 'chart', label: 'Vega-Lite faceted bar', testCase: asChartType(line, 'Bar Chart'), backend: 'vegalite' },
    after: { kind: 'chart', label: 'ECharts sunburst', testCase: sun, backend: 'echarts' },
  };
}

/** Pick the requested backend, or the first one that supports the chart type. */
function pickBackend(t: TestCase, want: PreviewBackend): PreviewBackend {
  const supported = getSupportedBackends(t.chartType);
  return supported.includes(want) ? want : supported[0] ?? 'vegalite';
}

/** A Flint spec with the data spec (semantic types) block color-highlighted. */
function HighlightedFlintSpec({ testCase }: { testCase: TestCase }) {
  const lines = useMemo(() => {
    const json = JSON.stringify(testCaseToFlintSummary(testCase), null, 2);
    const all = json.split('\n');
    // Mark the lines that make up the "semantic_types" (data spec) block.
    let start = -1;
    let end = all.length - 1;
    let depth = 0;
    let opened = false;
    for (let i = 0; i < all.length; i++) {
      if (start === -1 && all[i].includes('"semantic_types"')) start = i;
      if (start !== -1 && i >= start) {
        for (const ch of all[i]) {
          if (ch === '{') {
            depth++;
            opened = true;
          } else if (ch === '}') depth--;
        }
        if (opened && depth === 0) {
          end = i;
          break;
        }
      }
    }
    return all.map((text, i) => ({ text, hot: start !== -1 && i >= start && i <= end }));
  }, [testCase]);

  return (
    <pre style={demoSpecPreStyle}>
      {lines.map((ln, i) => (
        <div key={i} style={ln.hot ? demoSpecHotLineStyle : undefined}>
          {ln.text || ' '}
        </div>
      ))}
    </pre>
  );
}

/** The visual content of a single demo stage (a highlighted spec or a chart). */
function DemoStageContent({ stage }: { stage: DemoStage }) {
  if (stage.kind === 'spec') {
    return <HighlightedFlintSpec testCase={stage.testCase} />;
  }
  return (
    <ScaleToFit height={250} padding={6}>
      <WallChart testCase={stage.testCase} backend={pickBackend(stage.testCase, stage.backend)} />
    </ScaleToFit>
  );
}

/**
 * Two overlapping cards in fixed positions. The "before" state sits at the
 * top-left, the "after" state sits at the bottom-right and is shown in front
 * by default. Hovering (or focusing / tapping) a card raises that card in
 * front of the other one, without moving either card; with nothing hovered
 * the "after" card stays in front.
 */
function FeatureDemoView({ build }: { build: () => FeatureDemoConfig }) {
  const demo = useMemo(() => build(), [build]);
  const [hovered, setHovered] = useState<'top' | 'bottom' | null>(null);

  // Slot in front: the hovered card, or the "after" (bottom) card by default.
  const frontSlot: 'top' | 'bottom' = hovered ?? 'bottom';

  const cardHandlers = (slot: 'top' | 'bottom') => ({
    tabIndex: 0,
    onMouseEnter: () => setHovered(slot),
    onMouseLeave: () => setHovered((h) => (h === slot ? null : h)),
    onFocus: () => setHovered(slot),
    onBlur: () => setHovered((h) => (h === slot ? null : h)),
    onClick: () => setHovered(slot),
  });

  return (
    <div style={featureStackStyle} role="group" aria-label={`Compare ${demo.after.label} with ${demo.before.label}`}>
      <div
        style={{ ...featureStackCardStyle, ...stackCardPos('bottom'), ...stackCardEmphasis(frontSlot === 'bottom') }}
        aria-hidden={frontSlot !== 'bottom'}
        title={demo.after.label}
        {...cardHandlers('bottom')}
      >
        <span style={stackBadgeStyle}>{demo.after.label}</span>
        <DemoStageContent stage={demo.after} />
      </div>
      <div
        style={{ ...featureStackCardStyle, ...stackCardPos('top'), ...stackCardEmphasis(frontSlot === 'top') }}
        aria-hidden={frontSlot !== 'top'}
        title={demo.before.label}
        {...cardHandlers('top')}
      >
        <span style={stackBadgeStyle}>{demo.before.label}</span>
        <DemoStageContent stage={demo.before} />
      </div>
    </div>
  );
}

/** Fixed resting position for a stacked card. The position never changes on hover. */
function stackCardPos(slot: 'top' | 'bottom'): CSSProperties {
  return slot === 'top'
    ? { transform: 'translate(0px, 0px) rotate(0deg)' }
    : { transform: `translate(${PEEK}px, ${PEEK}px) rotate(1.4deg)` };
}

/** Emphasis for the active (front) vs. inactive (behind) card. Position is unchanged. */
function stackCardEmphasis(active: boolean): CSSProperties {
  return active
    ? { opacity: 1, filter: 'none', zIndex: 3, boxShadow: SOFT_SHADOW }
    : { opacity: 0.9, filter: 'brightness(0.97) saturate(0.95)', zIndex: 1, boxShadow: FLAT_SHADOW };
}

/* ------------------------------------------------------------------ */
/* Flat "paper" tokens (front page)                                    */
/* ------------------------------------------------------------------ */

const PAPER = '#ffffff';
const HAIRLINE = 'rgba(0, 0, 0, 0.10)';
const NEUTRAL_FILL = 'rgba(0, 0, 0, 0.04)';
const GRID_LINE = 'rgba(0, 0, 0, 0.02)';

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: siteTheme.fontSans,
  color: siteTheme.text,
  background: PAPER,
};

const mainStyle: CSSProperties = {
  flex: 1,
  width: '100%',
  // Faint, flat grid for texture without depth (data-formulator paper look).
  backgroundImage: `
    linear-gradient(90deg, ${GRID_LINE} 1px, transparent 1px),
    linear-gradient(0deg, ${GRID_LINE} 1px, transparent 1px)
  `,
  backgroundSize: '24px 24px',
};

const sectionStyle: CSSProperties = {
  maxWidth: 1040,
  margin: '0 auto',
  padding: '40px 24px',
  width: '100%',
  boxSizing: 'border-box',
};

const heroShowcaseSectionStyle: CSSProperties = {
  ...sectionStyle,
  paddingTop: 34,
  paddingBottom: 34,
};

const howItWorksSectionStyle: CSSProperties = {
  ...sectionStyle,
  paddingTop: 64,
  paddingBottom: 48,
};

const heroTitleStyle: CSSProperties = {
  fontSize: 42,
  lineHeight: 1.18,
  margin: '0 0 14px',
  maxWidth: 960,
  fontWeight: 700,
  letterSpacing: '-0.02em',
};

const heroAttributionStyle: CSSProperties = {
  margin: '0 0 46px',
  color: siteTheme.textMuted,
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: '0.03em',
};

const leadColumnsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: 72,
  flexWrap: 'wrap',
};

const leadTextColStyle: CSSProperties = {
  flex: '1 1 420px',
  minWidth: 0,
};

const leadButtonsColStyle: CSSProperties = {
  flex: '0 0 auto',
  width: 210,
  display: 'flex',
  flexDirection: 'column',
  paddingTop: 8,
};

const actionBoxStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 10,
  paddingTop: 2,
};

const leadStyle: CSSProperties = {
  fontSize: 17,
  color: siteTheme.text,
  lineHeight: 1.65,
  margin: 0,
  fontWeight: 400,
};

const leadHighlightStyle: CSSProperties = {
  fontWeight: 600,
  color: 'inherit',
};

const installLinesStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  margin: '28px 0 0',
};

const installLineStyle: CSSProperties = {
  color: siteTheme.text,
  fontSize: 15.5,
  lineHeight: 1.65,
};

const promptMarkStyle: CSSProperties = {
  fontFamily: siteTheme.fontMono,
  color: siteTheme.textMuted,
  userSelect: 'none',
};

const installLineLinkStyle: CSSProperties = {
  color: siteTheme.accent,
  fontWeight: 500,
  textDecoration: 'none',
  transition: 'color 120ms ease',
};

const landingInteractiveStyles = `
  .landing-hero-cta:focus-visible {
    outline: 2px solid ${siteTheme.accent};
    outline-offset: 2px;
  }

  .landing-showcase-row {
    width: calc(100% + 96px);
    margin-left: -48px;
    margin-right: -48px;
  }

  .landing-pipeline-figure--mobile {
    display: none;
  }

  @media (max-width: 900px) {
    .landing-showcase-row {
      width: 100%;
      margin-left: 0;
      margin-right: 0;
    }
  }

  @media (max-width: 640px) {
    .landing-lead-columns {
      gap: 24px !important;
    }

    .landing-hero-actions {
      width: 100% !important;
      border-left: 0 !important;
      border-top: 1px solid ${HAIRLINE} !important;
      padding-left: 0 !important;
      padding-top: 18px !important;
    }

    .landing-docs-actions {
      width: 100% !important;
      max-width: 220px;
      border-left: 0 !important;
      padding-left: 0 !important;
      justify-content: flex-start !important;
    }

    .landing-docs-cta {
      padding-top: 7px !important;
      padding-bottom: 7px !important;
      line-height: 1.1 !important;
    }

    .landing-showcase-row {
      align-items: stretch !important;
      justify-content: center;
      flex-wrap: wrap;
      gap: 10px 12px !important;
    }

    .landing-showcase-card {
      order: 1;
      flex: 0 0 100% !important;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }

    .landing-carousel-arrow {
      order: 2;
    }

    .landing-chart-pane {
      border-left: 0 !important;
      border-top: 1px solid ${HAIRLINE} !important;
    }

    .landing-pane-header {
      flex-direction: column;
      flex-wrap: wrap;
      align-items: flex-start !important;
      justify-content: flex-start !important;
      gap: 4px;
    }

    .landing-backend-toggle {
      max-width: calc(100vw - 72px);
      margin-left: 14px;
      margin-top: 0 !important;
      margin-bottom: 8px;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .landing-backend-toggle::-webkit-scrollbar {
      display: none;
    }

    .landing-pipeline-figure--desktop {
      display: none;
    }

    .landing-pipeline-figure--mobile {
      display: block;
      margin-bottom: 42px !important;
    }
  }
`;

const ctaRowStyle: CSSProperties = {
  display: 'flex',
  gap: 12,
  marginTop: 28,
  flexWrap: 'wrap',
  justifyContent: 'center',
};

const contributorLinkStyle: CSSProperties = {
  color: siteTheme.accent,
  textDecoration: 'none',
  fontWeight: 500,
};

const overviewSectionStyle: CSSProperties = {
  maxWidth: 960,
  margin: '0 auto',
  padding: '16px 24px 8px',
  width: '100%',
  boxSizing: 'border-box',
};

const overviewFigureStyle: CSSProperties = {
  margin: 0,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: siteTheme.radius,
  background: PAPER,
  padding: 16,
};

const overviewImgStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: 'auto',
};

const overviewCaptionStyle: CSSProperties = {
  margin: '14px auto 0',
  maxWidth: 760,
  textAlign: 'center',
  color: siteTheme.text,
  fontSize: 13.5,
  lineHeight: 1.6,
};

const showcaseCardStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  border: `1px solid ${HAIRLINE}`,
  borderRadius: siteTheme.radius,
  background: PAPER,
  overflow: 'hidden',
};

const showcasePaneStyle: CSSProperties = {
  flex: '1 1 360px',
  minWidth: 300,
  display: 'flex',
  flexDirection: 'column',
};

/** The compiled-chart pane gets extra width so wide charts render larger. */
const chartPaneStyle: CSSProperties = {
  flex: '1.35 1 440px',
};

const paneHeaderRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  paddingRight: 10,
};

const paneLabelStyle: CSSProperties = {
  padding: '10px 14px 2px',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: siteTheme.textMuted,
};

function openEditorBtnStyle(active: boolean): CSSProperties {
  return {
    margin: '6px 10px 0 0',
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
    color: active ? siteTheme.text : siteTheme.textMuted,
    background: active ? NEUTRAL_FILL : 'transparent',
    border: `1px solid ${HAIRLINE}`,
    borderRadius: siteTheme.radius,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s, color 0.15s',
  };
}

const backendToggleStyle: CSSProperties = {
  display: 'inline-flex',
  gap: 2,
  padding: 2,
  marginTop: 6,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: siteTheme.radius,
  background: PAPER,
};

function backendBtnStyle(active: boolean, supported: boolean): CSSProperties {
  return {
    padding: '4px 10px',
    border: 0,
    borderRadius: 4,
    background: active ? siteTheme.accent : 'transparent',
    color: active ? '#fff' : supported ? siteTheme.text : 'rgba(0,0,0,0.32)',
    fontSize: 12,
    fontWeight: active ? 600 : 500,
    cursor: supported ? 'pointer' : 'not-allowed',
    fontFamily: 'inherit',
  };
}

const carouselRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const showcaseIntroStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  margin: '0 0 30px',
};

const showcaseHeadingStyle: CSSProperties = {
  fontSize: 30,
  fontWeight: 600,
  margin: '0 0 18px',
  letterSpacing: '0.01em',
};

const showcaseIntroBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'stretch',
  gap: 72,
  flexWrap: 'wrap',
};

const showcaseIntroTextStyle: CSSProperties = {
  flex: '1 1 560px',
  minWidth: 0,
  maxWidth: 760,
  fontSize: 17,
  color: siteTheme.text,
  lineHeight: 1.65,
  margin: 0,
};

const showcaseIntroCtaColStyle: CSSProperties = {
  flex: '0 0 auto',
  width: 190,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  borderLeft: `1px solid ${HAIRLINE}`,
  paddingLeft: 28,
};

const pagerArrowStyle: CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  padding: 0,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 999,
  background: PAPER,
  color: siteTheme.text,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const dotsRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: 10,
};

function dotStyle(active: boolean): CSSProperties {
  return {
    width: active ? 22 : 9,
    height: 9,
    padding: 0,
    border: 0,
    borderRadius: 999,
    background: active ? siteTheme.accent : 'rgba(0,0,0,0.18)',
    cursor: 'pointer',
    transition: 'width 0.15s ease, background 0.15s ease',
  };
}

const showcaseCaptionStyle: CSSProperties = {
  maxWidth: 760,
  margin: '16px auto 0',
  textAlign: 'center',
  color: siteTheme.text,
  fontSize: 14.5,
  lineHeight: 1.55,
};

const specPreStyle: CSSProperties = {
  margin: 0,
  padding: '4px 16px 16px',
  fontFamily: siteTheme.fontMono,
  fontSize: 12.5,
  lineHeight: 1.55,
  color: siteTheme.text,
  background: PAPER,
  overflowX: 'auto',
  flex: 1,
};

const pipelineFigureStyle: CSSProperties = {
  margin: '8px 0 54px',
};

const featureTransitionStyle: CSSProperties = {
  maxWidth: 760,
  margin: '0 0 28px',
};

const featureTransitionTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 15.5,
  lineHeight: 1.65,
  color: siteTheme.text,
};

const featureGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))',
  gap: '44px 56px',
  alignItems: 'start',
};

const featureGridItemStyle: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
};

const featureGridVisualStyle: CSSProperties = {
  minWidth: 0,
  height: 360,
  marginTop: 0,
};

const featureGridTextStyle: CSSProperties = {
  minWidth: 0,
  maxWidth: 620,
};

// Overlapping before/after cards (Halden-style fan on hover).
const PEEK = 64;
const SOFT_SHADOW = '0 10px 30px rgba(0, 0, 0, 0.13)';
const FLAT_SHADOW = '0 1px 2px rgba(0, 0, 0, 0.05)';
const cardTransition = 'opacity 0.28s ease, box-shadow 0.28s ease, filter 0.28s ease';

const featureStackStyle: CSSProperties = {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: '1fr',
  gridTemplateRows: 'minmax(0, 1fr)',
  height: '100%',
  boxSizing: 'border-box',
  cursor: 'pointer',
  outline: 'none',
  // Reserve room for the peeking corner and the slight hover rotation.
  padding: 10,
  paddingRight: PEEK + 12,
  paddingBottom: PEEK + 12,
};

const featureStackCardStyle: CSSProperties = {
  gridArea: '1 / 1',
  position: 'relative',
  minHeight: 0,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: siteTheme.radius,
  background: PAPER,
  padding: '12px 14px',
  overflow: 'hidden',
  transition: cardTransition,
  willChange: 'opacity',
};

const stackBadgeStyle: CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 10,
  zIndex: 2,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.02em',
  color: siteTheme.textMuted,
  background: 'rgba(255, 255, 255, 0.86)',
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 999,
  padding: '2px 8px',
  pointerEvents: 'none',
};

// Flint spec shown in a demo viewport, with the data spec block highlighted.
// The surrounding card clips overflow, so the pre itself never scrolls — it
// renders the (short) summary spec in full without an unintended scrollbar.
const demoSpecPreStyle: CSSProperties = {
  margin: 0,
  padding: '2px 4px',
  fontFamily: siteTheme.fontMono,
  fontSize: 12,
  lineHeight: 1.5,
  color: siteTheme.text,
  background: PAPER,
  overflow: 'hidden',
};

const demoSpecHotLineStyle: CSSProperties = {
  background: siteTheme.accentBg,
  boxShadow: `inset 2px 0 0 ${siteTheme.accent}`,
  color: siteTheme.text,
};

const featureTitleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 9,
  fontSize: 20,
  lineHeight: 1.35,
  fontWeight: 500,
  margin: '0 0 14px',
};

const featureNumberStyle: CSSProperties = {
  color: siteTheme.accent,
  fontSize: 18,
  fontWeight: 500,
  fontVariantNumeric: 'tabular-nums',
};

const featureBodyStyle: CSSProperties = {
  fontSize: 15.5,
  color: siteTheme.text,
  lineHeight: 1.75,
  margin: 0,
};

function featureExampleRowStyle(): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    margin: '12px 0 0',
    // Paragraph stays first so its left border lines up with the text above;
    // the arrow trails on the right.
    flexDirection: 'row',
  };
}

const featureExampleStyle: CSSProperties = {
  margin: '0',
  padding: 0,
  fontSize: 14,
  lineHeight: 1.7,
  color: siteTheme.textMuted,
};

const codeStyle: CSSProperties = {
  background: NEUTRAL_FILL,
  padding: '2px 6px',
  borderRadius: 4,
  fontSize: '0.9em',
  fontFamily: siteTheme.fontMono,
};

const primaryBtn: CSSProperties = {
  display: 'inline-block',
  padding: '11px 22px',
  background: siteTheme.accent,
  color: '#fff',
  borderRadius: siteTheme.radius,
  textDecoration: 'none',
  fontWeight: 500,
  fontSize: 14.5,
};

const secondaryBtn: CSSProperties = {
  display: 'inline-block',
  padding: '11px 22px',
  background: PAPER,
  color: siteTheme.text,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: siteTheme.radius,
  textDecoration: 'none',
  fontWeight: 500,
  fontSize: 14.5,
};

function heroCtaStyle(variant: 'primary' | 'secondary', active: boolean): CSSProperties {
  const base: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    minHeight: 44,
    boxSizing: 'border-box',
    textAlign: 'center',
    padding: '11px 18px',
    borderRadius: siteTheme.radius,
    textDecoration: 'none',
    fontSize: 14.5,
    fontWeight: 600,
    lineHeight: 1.2,
    border: '1px solid transparent',
    transform: active ? 'translateY(-1px)' : 'translateY(0)',
    transition: 'background 0.12s ease, border-color 0.12s ease, transform 0.12s ease',
  };
  if (variant === 'primary') {
    return {
      ...base,
      color: '#fff',
      background: active ? '#006abc' : siteTheme.accent,
    };
  }
  return {
    ...base,
    color: siteTheme.text,
    background: active ? siteTheme.hover : PAPER,
    borderColor: active ? 'rgba(0, 0, 0, 0.42)' : 'rgba(0, 0, 0, 0.24)',
  };
}
