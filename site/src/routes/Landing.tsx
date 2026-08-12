import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import type { TFunction } from 'i18next';
import { LocaleLink } from '../i18n/LocaleLink';
import { TEST_GENERATORS, makeField, makeEncodingItem, buildMetadata, type TestCase } from 'flint-chart/test-data';
import { THEME_PRESETS } from 'flint-chart';
import { SiteNavBar, MicrosoftDisclosures, GitHubIcon, LabIcon } from '../components/SiteShell';
import { WallChart } from '../components/WallChart';
import { ScaleToFit } from '../components/ScaleToFit';
import { GalleryOptionsBar, ThemeControl } from '../components/GalleryOptionsBar';
import { SpecPipelineFigure } from '../components/SpecPipelineFigure';
import { testCaseToFlintSummary, testCaseToAssemblyInput, withHouse } from '../shared/test-case-utils';
import { buildPanelModel, withoutEchoedOverrides } from '../shared/chart-options';
import { CHART_CATEGORIES } from '../shared/chart-categories';
import { MOVIE_RATINGS } from './movie-ratings-data';
import {
  ALL_BACKENDS,
  BACKEND_LABELS,
  getSupportedBackends,
  type PreviewBackend,
} from '../shared/supported-backends';
import { GITHUB_REPO, siteTheme } from '../shared/theme';
import flintLogo from '../assets/flint-logo.svg';

/**
 * Front page: flat "paper" look inspired by Microsoft data-formulator. A
 * paper-white canvas with a faint grid, hairline borders, and no drop shadows.
 * Copy is written to read plainly, with one interactive spec→chart example.
 */
export function Landing() {
  const { t } = useTranslation();
  const features = useMemo(() => getFeatures(t), [t]);

  return (
    <div style={pageStyle}>
      <style>{landingInteractiveStyles}</style>
      <SiteNavBar flush />

      <main style={mainStyle}>
        {/* ---- Hero ------------------------------------------------------ */}
        <section style={{ ...sectionStyle, paddingTop: 88, paddingBottom: 36 }}>
          <div style={heroLockupStyle}>
            <img src={flintLogo} alt="" aria-hidden="true" style={heroLogoStyle} />
            <div style={heroHeadingBlockStyle}>
              <h1 style={heroTitleStyle}>{t('landing.heroTitle')}</h1>
              <div style={heroAttributionStyle}>{t('landing.attribution')}</div>
            </div>
          </div>

          <div className="landing-lead-columns" style={leadColumnsStyle}>
            <div style={leadTextColStyle}>
              <p style={leadStyle}>
                {t('landing.leadBefore')}{' '}
                <LeadHighlight>{t('landing.leadHighlight1')}</LeadHighlight>
                {t('landing.leadMiddle')}{' '}
                <LeadHighlight>
                  {t('landing.leadHighlight2', {
                    chartTypes: CHART_FAMILY_COUNT,
                    backends: BACKEND_ROSTER_LINKS.length,
                  })}
                </LeadHighlight>
                . {t('landing.themeLead')}
              </p>

              <div style={rostersStyle}>
                <div className="landing-backend-roster" style={backendRosterStyle} aria-label={t('landing.backendRosterLabel')}>
                  <span className="landing-backend-roster-label" style={backendRosterLabelStyle}>
                    {t('landing.backendRosterLabel')}
                  </span>
                  {BACKEND_ROSTER_LINKS.map((backend, index) => (
                    <span key={backend.label} style={backendRosterItemStyle}>
                      {index > 0 && <span aria-hidden="true" style={backendRosterSeparatorStyle} />}
                      <LocaleLink className="landing-backend-link" to={backend.to} style={backendRosterLinkStyle}>
                        {backend.label}
                      </LocaleLink>
                    </span>
                  ))}
                </div>
                <div className="landing-backend-roster" style={backendRosterStyle} aria-label={t('landing.themeRosterLabel')}>
                  <span className="landing-backend-roster-label" style={backendRosterLabelStyle}>
                    {t('landing.themeRosterLabel')}
                  </span>
                  {THEME_ROSTER_PREVIEW.map((theme, index) => (
                    <span key={theme.id} style={backendRosterItemStyle}>
                      {index > 0 && <span aria-hidden="true" style={backendRosterSeparatorStyle} />}
                      <LocaleLink
                        className="landing-backend-link"
                        to={`/themes?theme=${theme.id}`}
                        style={backendRosterLinkStyle}
                      >
                        {theme.label}
                      </LocaleLink>
                    </span>
                  ))}
                  <span style={backendRosterItemStyle}>
                    <span aria-hidden="true" style={backendRosterSeparatorStyle} />
                    <LocaleLink className="landing-backend-link" to="/themes" style={backendRosterMoreLinkStyle}>
                      {t('landing.themeRosterMore', { count: THEME_ROSTER_REMAINDER })}
                    </LocaleLink>
                  </span>
                </div>
              </div>

              <div style={installLinesStyle}>
                <div style={installLineStyle}>
                  <span style={promptMarkStyle}>&gt;</span>{' '}
                  <Trans
                    i18nKey="landing.installNpm"
                    components={{
                      npmLink: (
                        <LocaleLink
                          to="/documentation/getting-started#javascript-typescript"
                          className="landing-skill-link"
                          style={installLineLinkStyle}
                        />
                      ),
                    }}
                  />
                </div>
                <div style={installLineStyle}>
                  <span style={promptMarkStyle}>&gt;</span>{' '}
                  <Trans
                    i18nKey="landing.installMcp"
                    components={{
                      mcpLink: (
                        <LocaleLink to="/mcp" className="landing-skill-link" style={installLineLinkStyle} />
                      ),
                      skillLink: (
                        <a
                          href="https://skills.sh/microsoft/flint-chart/flint-chart-author"
                          className="landing-skill-link"
                          style={installLineLinkStyle}
                          target="_blank"
                          rel="noreferrer"
                        />
                      ),
                    }}
                  />
                </div>
                <div style={installLineStyle}>
                  <span style={promptMarkStyle}>&gt;</span>{' '}
                  <Trans
                    i18nKey="landing.installGallery"
                    values={{ chartTypes: CHART_FAMILY_COUNT, examples: CHART_GALLERY_ENTRY_COUNT }}
                    components={{
                      galleryLink: (
                        <LocaleLink to="/gallery" className="landing-skill-link" style={installLineLinkStyle} />
                      ),
                      themesLink: (
                        <LocaleLink to="/themes" className="landing-skill-link" style={installLineLinkStyle} />
                      ),
                    }}
                  />
                </div>
                <div style={installLineStyle}>
                  <span style={{ ...promptMarkStyle, display: 'inline-flex', verticalAlign: '-2px' }} aria-hidden="true">
                    <LabIcon size={14} />
                  </span>{' '}
                  <Trans
                    i18nKey="landing.installThemeLab"
                    components={{
                      themeLabLink: (
                        <LocaleLink to="/theme-lab" className="landing-skill-link" style={installLineLinkStyle} />
                      ),
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="landing-hero-actions" style={leadButtonsColStyle}>
              <div style={actionBoxStyle}>
                <HeroCTA
                  to="/themes"
                  label={t('landing.ctaThemes')}
                  attention
                  variant="secondary"
                />
                <HeroCTA to="/gallery" label={t('landing.ctaGallery')} variant="secondary" />
                <HeroCTA to="/mcp" label={t('landing.ctaMcp')} variant="secondary" />
                <HeroCTA
                  href={GITHUB_REPO}
                  label={t('landing.ctaGithub')}
                  icon={<GitHubIcon size={17} />}
                  variant="secondary"
                />
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

        {/* ---- News ---------------------------------------------------- */}
        <section className="landing-news" style={newsSectionStyle}>
          <h2 style={newsHeadingStyle}>{t('landing.news.title')}</h2>
          <div style={newsListStyle}>
            {([
              { key: 'release050', href: `${GITHUB_REPO}/releases/tag/0.5.0`, linkLabel: 'v0.5.0' },
              { key: 'release040', href: `${GITHUB_REPO}/releases/tag/0.4.0`, linkLabel: 'v0.4.0' },
              { key: 'dynamicWidgets', href: `${GITHUB_REPO}/releases/tag/0.3.0`, linkLabel: 'v0.3.0' },
            ] as const).map((update) => (
              <article className="landing-news-item" style={newsItemStyle} key={update.key}>
                <time style={newsDateStyle} dateTime={t(`landing.news.${update.key}.dateTime`)}>
                  {t(`landing.news.${update.key}.date`)}
                </time>
                <p style={newsTextStyle}>{t(`landing.news.${update.key}.text`)}</p>
                {update.href && (
                  <a
                    className="site-text-link"
                    style={newsLinkStyle}
                    href={update.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {update.linkLabel}
                  </a>
                )}
              </article>
            ))}
          </div>
        </section>

        {/* ---- Feature cards (alternating text / visual) -------------- */}
        <section style={howItWorksSectionStyle}>
          <div style={showcaseIntroStyle}>
            <h1 style={showcaseHeadingStyle}>{t('landing.howItWorks')}</h1>
            <div style={showcaseIntroBodyStyle}>
              <p style={showcaseIntroTextStyle}>
                {t('landing.howItWorksBody')}
              </p>
              <div className="landing-docs-actions" style={showcaseIntroCtaColStyle}>
                <div style={actionBoxStyle}>
                  <HeroCTA
                    className="landing-docs-cta"
                    to="/documentation/overview"
                    label={t('landing.ctaDocs')}
                    variant="secondary"
                  />
                </div>
              </div>
            </div>
          </div>
          <PipelineDiagram />
          <div style={featureGridStyle}>
            {features.map((feature, i) => (
              <article key={feature.id} style={featureGridItemStyle}>
                <div style={featureGridTextStyle}>
                  <h2 style={featureTitleStyle}>
                    <span style={featureNumberStyle}>{i + 1}.</span>
                    {feature.isNew ? <span aria-hidden="true" style={attentionStarStyle}>★</span> : null}
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
            {t('landing.closingTitle')}
          </h2>
          <p style={{ margin: '0 0 30px', color: siteTheme.text, fontSize: 16, lineHeight: 1.7 }}>
            {t('landing.closingBody')}
          </p>
          <div style={{ ...ctaRowStyle, marginTop: 0, justifyContent: 'center' }}>
            <a href={GITHUB_REPO} style={primaryBtn} target="_blank" rel="noreferrer">
              {t('landing.viewGithub')}
            </a>
            <LocaleLink to="/gallery" style={secondaryBtn}>
              {t('landing.seeGallery')}
            </LocaleLink>
          </div>
          <p style={{ margin: '32px 0 0', color: siteTheme.text, fontSize: 16, lineHeight: 1.7 }}>
            <Trans
              i18nKey="landing.closingCollab"
              components={{
                msr: (
                  <a
                    className="site-text-link"
                    style={contributorLinkStyle}
                    href="https://www.microsoft.com/en-us/research/"
                    target="_blank"
                    rel="noreferrer"
                  />
                ),
                ideas: (
                  <a
                    className="site-text-link"
                    style={contributorLinkStyle}
                    href="https://ideas-lab.net/"
                    target="_blank"
                    rel="noreferrer"
                  />
                ),
              }}
            />
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

type ShowcaseExampleKey =
  | 'facetedLine'
  | 'heatmap'
  | 'waterfall'
  | 'sunburst'
  | 'donut'
  | 'regression'
  | 'sortedBar';

interface ShowcaseExample {
  id: string;
  exampleKey: ShowcaseExampleKey;
  generator?: string;
  index?: number;
  /** Prefer a named generator case so inserted gallery cases cannot shift it. */
  testTitle?: string;
  /** Pre-built test case (for examples not backed by a gallery generator). */
  testCase?: TestCase;
  /** Optional canvas override; narrower widths force facet panels to wrap. */
  canvasSize?: { width: number; height: number };
  /** Showcase-only defaults applied without changing the underlying gallery case. */
  defaultChartProperties?: Record<string, unknown>;
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

/**
 * The canvas every showcase example is drawn on.
 *
 * `ScaleToFit` only ever scales a chart *down*, so a chart authored smaller
 * than the pane sits at its own size in the middle of it with the surrounding
 * space wasted. Handing the compiler a canvas of roughly the pane's own
 * proportions is what makes the chart fill it — and it is the compiler, not a
 * CSS stretch, that decides what to do with the room, so the charts stay in
 * proportion. Measured against the real 561 × 465 pane box, 560 × 440 fills it
 * best across all seven: 68–100% of its width and 79–100% of its height,
 * against 56–87% and as little as 17% before.
 */
const SHOWCASE_CANVAS = { width: 560, height: 440 };

function randomWelcomeTheme(): string {
  const themeIds = Object.keys(THEME_PRESETS);
  return themeIds[Math.floor(Math.random() * themeIds.length)] ?? 'pop';
}

const SHOWCASE_EXAMPLES: ShowcaseExample[] = [
  {
    id: 'waterfall',
    exampleKey: 'waterfall',
    generator: 'Omni: Waterfall',
    index: 0,
  },
  {
    id: 'line',
    exampleKey: 'facetedLine',
    generator: 'Omni: Line',
    index: 0,
    // Four regions, so two columns is a 2x2 block. Four columns would be a
    // single row: it compiles to a 2.62 aspect against a pane of 1.21 and fills
    // only 46% of the pane's height, where 2x2 fills 95%.
    defaultChartProperties: { facetColumns: 2 },
  },
  {
    id: 'heatmap',
    exampleKey: 'heatmap',
    generator: 'Heatmap',
    testTitle: 'Average monthly temperature by city',
  },
  {
    id: 'sunburst',
    exampleKey: 'sunburst',
    generator: 'Omni: Sunburst',
    index: 0,
  },
  {
    id: 'donut',
    exampleKey: 'donut',
    testCase: moviesDonut(),
  },
  {
    id: 'regression',
    exampleKey: 'regression',
    testCase: moviesRegression(),
  },
  {
    id: 'sorted-bar',
    exampleKey: 'sortedBar',
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
  attention,
}: {
  label: string;
  icon?: ReactNode;
  to?: string;
  href?: string;
  variant: 'primary' | 'secondary';
  className?: string;
  attention?: boolean;
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
        {attention ? <span aria-hidden="true" style={attentionStarStyle}>★</span> : null}
        {label}
      </a>
    );
  }

  return (
    <LocaleLink className={ctaClassName} to={to ?? '/'} style={heroCtaStyle(variant, active)} {...handlers}>
      {icon}
      {attention ? <span aria-hidden="true" style={attentionStarStyle}>★</span> : null}
      {label}
    </LocaleLink>
  );
}

function HeroShowcase() {
  const { t } = useTranslation();
  const [exampleIdx, setExampleIdx] = useState(0);
  const [selectedBackend, setSelectedBackend] = useState<PreviewBackend>('vegalite');
  const [tempOptions, setTempOptions] = useState<Record<string, unknown>>({});
  const [welcomeTheme] = useState(randomWelcomeTheme);
  // The house every showcase chart is drawn in. It is deliberately *not* reset
  // as the carousel moves: the point of a house is that it holds across a set
  // of charts, so a reader who picks one sees the whole carousel answer to it.
  // Only Vega-Lite reads `theme_spec`, so the switch is offered on that backend
  // alone — an inert switch reads as a bug in the theme.
  const [themeId, setThemeId] = useState<string | undefined>(welcomeTheme);
  const [previewTheme, setPreviewTheme] = useState<{ id: string | undefined } | null>(null);

  const example = SHOWCASE_EXAMPLES[exampleIdx];
  // What the chart says, in words. Every example carries one: a chart of bare
  // numbers names nothing on its own, and several houses drop axis titles on
  // the understanding that this line is carrying the subject.
  const headline = useMemo(
    () => ({
      title: t(`landing.examples.${example.exampleKey}.title`),
      subtitle: t(`landing.examples.${example.exampleKey}.subtitle`),
    }),
    [t, example.exampleKey],
  );
  const canvasSize = example.canvasSize ?? SHOWCASE_CANVAS;
  const galleryTestCase = useTestCase(example.generator ?? '', example.index ?? 0, example.testTitle);
  const testCase = example.testCase ?? galleryTestCase;
  const supported = useMemo(
    () => (testCase ? getSupportedBackends(testCase.chartType) : []),
    [testCase],
  );
  // Keep the chosen backend when the new example supports it; otherwise fall
  // back to that example's first available backend.
  const backend = supported.includes(selectedBackend) ? selectedBackend : supported[0] ?? 'vegalite';
  const effectiveOptions = useMemo(
    () => ({ ...example.defaultChartProperties, ...tempOptions }),
    [example.defaultChartProperties, tempOptions],
  );

  useEffect(() => {
    setTempOptions({});
    setPreviewTheme(null);
  }, [exampleIdx, backend]);

  const canTheme = backend === 'vegalite';
  const activeTheme = canTheme ? (previewTheme ? previewTheme.id : themeId) : undefined;

  // A house that paints its own canvas draws a coloured rectangle of the
  // chart's *own* size, and `ScaleToFit` centres that rectangle in a pane it
  // rarely fills exactly — so a dark house reads as a dark card floating on
  // white paper, with the space around it belonging to the site rather than to
  // the chart. Carrying the house's canvas colour out to the pane closes the
  // gap: the chart's surface and the room around it become one surface, which
  // is what the house is actually claiming. Only the viewport is painted — the
  // options bar below it is site furniture, and site-coloured text on a dark
  // house would be unreadable.
  const houseCanvas = useMemo(
    () => (activeTheme ? THEME_PRESETS[activeTheme]?.spec?.ink?.surface?.canvas : undefined),
    [activeTheme],
  );

  const displayInput = useMemo(() => {
    if (!testCase) return null;
    const base = withHouse(testCaseToAssemblyInput(testCase, canvasSize), activeTheme, canTheme);
    return {
      ...base,
      chart_spec: {
        ...base.chart_spec,
        ...headline,
        chartProperties: { ...base.chart_spec.chartProperties, ...effectiveOptions },
      },
    };
  }, [testCase, effectiveOptions, activeTheme, canTheme, canvasSize, headline]);

  // A house can change what a chart *is*, not only how it looks — the NYT puts
  // points on a line. Those are defaults, so they yield to anything the bar has
  // stated, and a value the reader never really chose would silently outrank
  // the new house. Let go of the ones that were only echoing the old one.
  const chooseTheme = (next: string | undefined) => {
    if (displayInput) setTempOptions((options) => withoutEchoedOverrides(displayInput, options));
    setThemeId(next);
    setPreviewTheme(null);
  };

  const panelModel = useMemo(
    () => (displayInput ? buildPanelModel(displayInput, backend) : null),
    [displayInput, backend],
  );

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
          aria-label={t('landing.prevExample')}
          title={t('landing.prevExample')}
          style={pagerArrowStyle}
        >
          <ChevronIcon dir="left" />
        </button>

        <div className="landing-showcase-card" style={{ ...showcaseCardStyle, flex: 1, minWidth: 0 }}>
          <div className="landing-spec-pane" style={{ ...showcasePaneStyle, ...specPaneStyle }}>
            <div style={paneHeaderRowStyle}>
              <span style={paneLabelStyle}>{t('landing.flintSpec')}</span>
            </div>
            <FlintSpecCode
              testCase={testCase}
              canvasSize={canvasSize}
              chartPropertyOverrides={effectiveOptions}
              themeId={activeTheme}
              useThemeCanvas={canTheme}
              headline={headline}
            />
          </div>

          <div className="landing-chart-pane" style={{ ...showcasePaneStyle, ...chartPaneStyle, borderLeft: `1px solid ${HAIRLINE}` }}>
            <div className="landing-pane-header" style={paneHeaderRowStyle}>
              {canTheme ? (
                <ThemeControl
                  themeId={themeId}
                  onTheme={chooseTheme}
                  onPreview={(id) => setPreviewTheme({ id })}
                  onPreviewEnd={() => setPreviewTheme(null)}
                  placement="bottom"
                  prominent
                />
              ) : (
                <span style={paneLabelStyle}>{BACKEND_LABELS[backend]}</span>
              )}
              <div className="landing-backend-toggle" style={backendToggleStyle} role="tablist" aria-label={t('landing.backendAria')}>
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
            <div className="landing-chart-canvas" style={chartCanvasStyle}>
              <div
                style={{
                  ...chartViewportStyle,
                  ...(houseCanvas
                    ? { background: houseCanvas, borderRadius: siteTheme.radius }
                    : {}),
                }}
              >
                <ScaleToFit fill height={465} padding={8}>
                  <WallChart
                    testCase={testCase}
                    backend={backend}
                    canvasSize={canvasSize}
                    chartPropertyOverrides={effectiveOptions}
                    themeId={activeTheme}
                    useThemeCanvas={canTheme}
                    headline={headline}
                  />
                </ScaleToFit>
              </div>
              {panelModel && displayInput && (
                <div className="landing-canvas-options" style={canvasOptionsStyle}>
                  <GalleryOptionsBar
                    model={panelModel}
                    chartType={displayInput.chart_spec.chartType}
                    canReset={Object.keys(tempOptions).length > 0 || themeId !== welcomeTheme}
                    onReset={() => {
                      setTempOptions({});
                      setThemeId(welcomeTheme);
                    }}
                    onChange={(key, value) =>
                      setTempOptions((current) => {
                        const next = { ...current };
                        if (value === undefined) delete next[key];
                        else next[key] = value;
                        return next;
                      })
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          className="landing-carousel-arrow"
          type="button"
          onClick={goNext}
          aria-label={t('landing.nextExample')}
          title={t('landing.nextExample')}
          style={pagerArrowStyle}
        >
          <ChevronIcon dir="right" />
        </button>
      </div>
      {/* Example pager dots */}
      <div style={{ ...dotsRowStyle, marginTop: 16 }} role="tablist" aria-label={t('landing.exampleAria')}>
        {SHOWCASE_EXAMPLES.map((ex, i) => {
          const label = t(`landing.examples.${ex.exampleKey}.label`);
          return (
          <button
            key={ex.id}
            type="button"
            role="tab"
            aria-selected={i === exampleIdx}
            aria-label={label}
            title={label}
            onClick={() => setExampleIdx(i)}
            style={dotStyle(i === exampleIdx)}
          />
          );
        })}
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

function FlintSpecCode({
  testCase,
  canvasSize,
  chartPropertyOverrides,
  themeId,
  useThemeCanvas,
  headline,
}: {
  testCase: TestCase;
  canvasSize?: { width: number; height: number };
  chartPropertyOverrides?: Record<string, unknown>;
  themeId?: string;
  useThemeCanvas?: boolean;
  headline?: { title?: string; subtitle?: string };
}) {
  const text = useMemo(() => {
    const summary = testCaseToFlintSummary(testCase);
    const chartSpec = {
      ...summary.chart_spec,
      ...(headline?.title ? { title: headline.title } : {}),
      ...(headline?.subtitle ? { subtitle: headline.subtitle } : {}),
      ...(canvasSize ? { baseSize: canvasSize } : {}),
      ...(chartPropertyOverrides && Object.keys(chartPropertyOverrides).length > 0
        ? {
            chartProperties: {
              ...summary.chart_spec.chartProperties,
              ...chartPropertyOverrides,
            },
          }
        : {}),
    };
    const withCanvas = withHouse({ ...summary, chart_spec: chartSpec }, themeId, useThemeCanvas);
    const body = JSON.stringify(withCanvas, null, 2);
    return body.replace(/^{\n/, '{\n  "data": {...},\n');
  }, [testCase, canvasSize, chartPropertyOverrides, themeId, useThemeCanvas, headline?.title, headline?.subtitle]);
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

const BACKEND_ROSTER_LINKS = [
  { label: 'Vega-Lite', to: '/documentation/reference-vegalite' },
  { label: 'ECharts', to: '/documentation/reference-echarts' },
  { label: 'Chart.js', to: '/documentation/reference-chartjs' },
  { label: 'Plotly', to: '/documentation/reference-plotly' },
  { label: 'Excel', to: '/gallery/excel' },
] as const;
const THEME_ROSTER_PREVIEW = [
  ...Object.values(THEME_PRESETS).slice(0, 5),
  THEME_PRESETS.pop,
];
const THEME_ROSTER_REMAINDER = Object.keys(THEME_PRESETS).length - THEME_ROSTER_PREVIEW.length;
const CHART_GALLERY_ENTRY_COUNT = CHART_CATEGORIES.reduce(
  (count, category) => count + category.charts.length,
  0,
);

// Lead paragraph shown in the hero (the single intro to Flint).
interface Feature {
  id: string;
  title: string;
  body: string;
  // Optional concrete example rendered as a callout beneath the body.
  example?: string;
  // Before/after demo shown alongside the text, illustrating the feature.
  demo?: () => FeatureDemoConfig;
  isNew?: boolean;
}

function getFeatures(t: TFunction): Feature[] {
  return [
    {
      id: 'semantic',
      title: t('landing.features.semantic.title'),
      body: t('landing.features.semantic.body'),
      example: t('landing.features.semantic.example'),
      demo: demoSemanticTypes,
    },
    {
      id: 'layout',
      title: t('landing.features.layout.title'),
      body: t('landing.features.layout.body'),
      example: t('landing.features.layout.example'),
      demo: demoLayout,
    },
    {
      id: 'adapt',
      title: t('landing.features.adapt.title'),
      body: t('landing.features.adapt.body'),
      example: t('landing.features.adapt.example'),
      demo: demoAdapt,
    },
    {
      id: 'backends',
      title: t('landing.features.backends.title'),
      body: t('landing.features.backends.body', {
        chartTypes: CHART_FAMILY_COUNT,
        examples: CHART_GALLERY_ENTRY_COUNT,
      }),
      example: t('landing.features.backends.example'),
      demo: demoBackends,
    },
    {
      id: 'themes',
      title: t('landing.features.themes.title'),
      body: t('landing.features.themes.body'),
      example: t('landing.features.themes.example'),
      demo: demoThemes,
      isNew: true,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function useTestCase(generator: string, index = 0, title?: string): TestCase | null {
  return useMemo(() => {
    const gen = TEST_GENERATORS[generator];
    if (!gen) return null;
    try {
      const all = gen();
      if (title) return all.find((testCase) => testCase.title === title) ?? null;
      return all[index] ?? all[0] ?? null;
    } catch {
      return null;
    }
  }, [generator, index, title]);
}

/* ------------------------------------------------------------------ */
/* Feature before/after demos                                          */
/* ------------------------------------------------------------------ */

type DemoStage =
  | { kind: 'spec'; label: string; testCase: TestCase }
  | {
      kind: 'chart';
      label: string;
      testCase: TestCase;
      backend: PreviewBackend;
      themeId?: string;
      headline?: { title?: string; subtitle?: string };
    };

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

// Card 5: the data and ChartSpec stay fixed; only the formal theme changes.
// A grouped bar exposes the whole system at once: palette, bar geometry,
// axes/grid, legend, labels, typography, and spacing.
function demoThemes(): FeatureDemoConfig {
  const grouped = themedRevenue();
  const headline = {
    title: 'Quarterly revenue by region',
    subtitle: 'Three product lines across six markets',
  };
  return {
    before: {
      kind: 'chart',
      label: 'Economist',
      testCase: grouped,
      backend: 'vegalite',
      themeId: 'economist',
      headline,
    },
    after: {
      kind: 'chart',
      label: 'Swiss',
      testCase: grouped,
      backend: 'vegalite',
      themeId: 'swiss',
      headline,
    },
  };
}

function themedRevenue(): TestCase {
  const markets = ['North America', 'Europe', 'East Asia', 'South Asia', 'Latin America', 'Africa'];
  const products = ['Cloud', 'Devices', 'Services'];
  const data = markets.flatMap((market, marketIndex) =>
    products.map((product, productIndex) => ({
      Market: market,
      Product: product,
      Revenue: Math.round(28 + 54 * Math.abs(Math.sin(marketIndex * 0.83 + productIndex * 1.61 + 0.4))),
    })),
  );
  return {
    title: 'Quarterly revenue by region',
    description: '',
    tags: [],
    chartType: 'Grouped Bar Chart',
    data,
    fields: [makeField('Market'), makeField('Product'), makeField('Revenue')],
    metadata: buildMetadata(data),
    encodingMap: {
      x: makeEncodingItem('Market'),
      y: makeEncodingItem('Revenue'),
      color: makeEncodingItem('Product'),
      group: makeEncodingItem('Product'),
    },
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
      <WallChart
        testCase={stage.testCase}
        backend={pickBackend(stage.testCase, stage.backend)}
        themeId={stage.themeId}
        headline={stage.headline}
      />
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

const newsSectionStyle: CSSProperties = {
  ...sectionStyle,
  display: 'grid',
  gridTemplateColumns: '140px minmax(0, 1fr)',
  gap: 32,
  paddingTop: 28,
  paddingBottom: 28,
  borderTop: `1px solid ${HAIRLINE}`,
  borderBottom: `1px solid ${HAIRLINE}`,
};

const newsHeadingStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.4,
  fontWeight: 650,
};

const newsListStyle: CSSProperties = {
  display: 'grid',
};

const newsItemStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '118px minmax(0, 1fr) 64px',
  gap: 18,
  padding: '5px 0',
};

const newsDateStyle: CSSProperties = {
  color: siteTheme.textMuted,
  fontSize: 13,
  lineHeight: 1.6,
  fontVariantNumeric: 'tabular-nums',
};

const newsTextStyle: CSSProperties = {
  margin: 0,
  color: siteTheme.text,
  fontSize: 14,
  lineHeight: 1.6,
};

const newsLinkStyle: CSSProperties = {
  color: siteTheme.accent,
  fontSize: 13,
  lineHeight: 1.6,
  textAlign: 'right',
  whiteSpace: 'nowrap',
  textDecorationColor: 'currentColor',
  textUnderlineOffset: 3,
};

const heroTitleStyle: CSSProperties = {
  fontSize: 42,
  lineHeight: 1.18,
  margin: 0,
  maxWidth: 960,
  fontWeight: 700,
  letterSpacing: '-0.02em',
};

const heroLockupStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  margin: '0 0 46px',
};

const heroHeadingBlockStyle: CSSProperties = {
  minWidth: 0,
};

const heroLogoStyle: CSSProperties = {
  display: 'block',
  flex: '0 0 auto',
  width: 40,
  height: 40,
  marginTop: 7,
};

const heroAttributionStyle: CSSProperties = {
  margin: '14px 0 0',
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

const backendRosterStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  flexWrap: 'wrap',
  gap: '5px 0',
  color: siteTheme.textMuted,
  minHeight: 18,
  lineHeight: '18px',
};

const rostersStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  flexWrap: 'wrap',
  gap: '5px 26px',
  marginTop: 13,
};

const backendRosterLabelStyle: CSSProperties = {
  marginRight: 10,
  color: siteTheme.textMuted,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.05em',
  lineHeight: '18px',
  textTransform: 'uppercase',
};

const backendRosterItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  whiteSpace: 'nowrap',
};

const backendRosterLinkStyle: CSSProperties = {
  color: siteTheme.text,
  fontSize: 14,
  fontWeight: 550,
  lineHeight: '18px',
  textDecorationLine: 'underline',
  textDecorationColor: 'transparent',
  textDecorationThickness: '1px',
  textUnderlineOffset: '3px',
  transition: 'color 120ms ease, text-decoration-color 120ms ease',
};

const backendRosterMoreLinkStyle: CSSProperties = {
  ...backendRosterLinkStyle,
  color: siteTheme.textMuted,
  fontWeight: 500,
};

const backendRosterSeparatorStyle: CSSProperties = {
  alignSelf: 'center',
  flex: '0 0 auto',
  width: 1,
  height: 13,
  margin: '0 9px',
  background: HAIRLINE,
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

  .landing-backend-link:hover,
  .landing-backend-link:focus-visible {
    text-decoration-color: ${siteTheme.textMuted} !important;
  }

  .landing-backend-link:focus-visible {
    outline: 2px solid ${siteTheme.accent};
    outline-offset: 2px;
    border-radius: 2px;
  }

  .landing-showcase-row {
    width: calc(100% + 96px);
    margin-left: -48px;
    margin-right: -48px;
  }

  .landing-pipeline-figure--mobile {
    display: none;
  }

  @media (min-width: 901px) {
    .landing-showcase-card {
      grid-template-columns: minmax(300px, 1.05fr) minmax(0, 1.55fr);
      height: 560px;
    }

    .landing-showcase-card > .landing-spec-pane,
    .landing-showcase-card > .landing-chart-pane {
      height: 100%;
      min-width: 0 !important;
      overflow: hidden;
    }
  }

  .landing-spec-pane pre {
    scrollbar-width: none;
  }

  .landing-spec-pane pre::-webkit-scrollbar {
    display: none;
  }

  .landing-canvas-options .gopt-bar {
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px 8px;
    max-width: 100%;
    overflow: visible;
  }

  @media (max-width: 900px) {
    .landing-showcase-row {
      width: 100%;
      margin-left: 0;
      margin-right: 0;
    }

    .landing-showcase-card {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 300px 430px;
      height: 730px;
    }

    .landing-showcase-card > .landing-spec-pane,
    .landing-showcase-card > .landing-chart-pane {
      width: 100%;
      min-width: 0 !important;
      overflow: hidden;
    }

    .landing-chart-pane {
      border-left: 0 !important;
      border-top: 1px solid ${HAIRLINE} !important;
    }
  }

  @media (max-width: 640px) {
    .landing-backend-roster-label {
      flex-basis: 100%;
      margin-right: 0 !important;
    }

    .landing-news {
      grid-template-columns: 1fr !important;
      gap: 12px !important;
    }

    .landing-news-item {
      grid-template-columns: minmax(0, 1fr) auto !important;
      gap: 0 16px !important;
      padding: 7px 0 !important;
    }

    .landing-news-item time {
      grid-column: 1;
    }

    .landing-news-item p {
      grid-column: 1;
    }

    .landing-news-item a {
      grid-column: 2;
      grid-row: 1 / span 2;
      align-self: center;
    }

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

    .landing-canvas-options {
      max-width: calc(100% - 20px) !important;
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
  display: 'grid',
  border: `1px solid ${HAIRLINE}`,
  borderRadius: siteTheme.radius,
  background: PAPER,
  overflow: 'hidden',
};

const showcasePaneStyle: CSSProperties = {
  flex: '1 1 360px',
  minWidth: 300,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
};

const specPaneStyle: CSSProperties = {
  flex: '0.9 1 320px',
  minWidth: 300,
};

/** The compiled-chart pane gets extra width so wide charts render larger. */
const chartPaneStyle: CSSProperties = {
  flex: '1.7 1 520px',
};

const chartCanvasStyle: CSSProperties = {
  position: 'relative',
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  padding: '4px 12px 10px',
  boxSizing: 'border-box',
};

const chartViewportStyle: CSSProperties = {
  position: 'relative',
  flex: 1,
  minHeight: 0,
  width: '100%',
};

const canvasOptionsStyle: CSSProperties = {
  flex: '0 0 auto',
  width: '100%',
  minHeight: 34,
  padding: '4px 2px 2px',
  background: 'transparent',
  boxSizing: 'border-box',
  overflow: 'visible',
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

const specPreStyle: CSSProperties = {
  margin: 0,
  padding: '4px 16px 16px',
  fontFamily: siteTheme.fontMono,
  // Sized so the whole spec is *visible*, not scrolled. The pane hides its
  // scrollbar, so a spec that overflows looks truncated rather than scrollable —
  // and the point of the panel is that the reader can see the entire spec next
  // to the chart it produced. The longest of the seven runs 27 raw lines and
  // wraps to 28 in this pane; at 12/1.4 that is 470px against a 515px budget.
  // Line *count* dominates, not wrapping, so widening the pane alone cannot buy
  // the room — the leading has to give.
  fontSize: 12,
  lineHeight: 1.4,
  color: siteTheme.text,
  background: PAPER,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  overflowX: 'hidden',
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
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

const attentionStarStyle: CSSProperties = {
  flex: '0 0 auto',
  color: '#b26a00',
  fontSize: 13,
  lineHeight: 1,
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
    position: 'relative',
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
