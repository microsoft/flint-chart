import { Fragment, useCallback, useEffect, useMemo, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import type { TFunction } from 'i18next';
import { LocaleLink } from '../i18n/LocaleLink';
import { TEST_GENERATORS, makeField, makeEncodingItem, buildMetadata, type TestCase } from 'flint-chart/test-data';
import { INTERACTION_PRESET_TYPES, THEME_PRESETS, type ChartAssemblyInput, type InteractionSpec } from 'flint-chart';
import { FlintChart } from 'flint-chart/react';
import type { ChartChange } from 'flint-chart/interactive';
import { SiteNavBar, MicrosoftDisclosures, GitHubIcon } from '../components/SiteShell';
import { WallChart } from '../components/WallChart';
import { ScaleToFit } from '../components/ScaleToFit';
import { GalleryOptionsBar, ThemeControl } from '../components/GalleryOptionsBar';
import { SpecPipelineFigure } from '../components/SpecPipelineFigure';
import { CodeBlock } from '../components/CodeBlock';
import stringify from 'json-stringify-pretty-compact';
import { testCaseToFlintSummary, testCaseToAssemblyInput, withHouse, withHouseId } from '../shared/test-case-utils';
import { buildPanelModel, withoutEchoedOverrides } from '../shared/chart-options';
import { CHART_CATEGORIES } from '../shared/chart-categories';
import { MOVIE_RATINGS } from './movie-ratings-data';
import gapminderCsv from '../assets/gapminder-five-year.csv?raw';
import classicDatasets from '../data/classic-datasets.json';
import { version as FLINT_VERSION } from '../../../packages/flint-js/package.json';
import { csvParseRows } from 'd3-dsv';
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
              <a className="site-text-link" style={heroVersionStyle} href={`${GITHUB_REPO}/blob/main/CHANGELOG.md`}
                target="_blank" rel="noreferrer">v{FLINT_VERSION}</a>
            </div>
          </div>

          <div className="landing-lead-columns" style={leadColumnsStyle}>
            <div style={leadTextColStyle}>
              <p style={leadStyle}>
                {t('landing.leadBefore')}{' '}
                <LeadHighlight>{t('landing.leadHighlight1')}</LeadHighlight>
                {t('landing.leadStop')}
                <Trans
                  i18nKey="landing.leadAvailability"
                  components={{
                    mcp: <LocaleLink className="site-text-link" style={contributorLinkStyle} to="/mcp" />,
                    npm: <a className="site-text-link" style={contributorLinkStyle} href="https://www.npmjs.com/package/flint-chart" target="_blank" rel="noreferrer" />,
                  }}
                />
              </p>
              <p style={{ ...leadStyle, marginTop: 14 }}>
                {t('landing.leadHighlight2', {
                  chartTypes: CHART_FAMILY_COUNT,
                  backends: BACKEND_ROSTER_LINKS.length,
                  themes: Object.keys(THEME_PRESETS).length,
                  presets: INTERACTION_PRESET_TYPES.length,
                })}
                {t('landing.leadStop')}
                <Trans
                  i18nKey="landing.leadAfter"
                  components={{
                    themeLab: <LocaleLink className="site-text-link" style={contributorLinkStyle} to="/theme-lab" />,
                    advanced: <LocaleLink className="site-text-link" style={contributorLinkStyle} to="/interactions/advanced" />,
                  }}
                />
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
                <div className="landing-backend-roster" style={backendRosterStyle} aria-label={t('landing.interactionRosterLabel')}>
                  <span className="landing-backend-roster-label" style={backendRosterLabelStyle}>
                    {t('landing.interactionRosterLabel')}
                  </span>
                  {INTERACTION_ROSTER_PREVIEW.map((preset, index) => (
                    <span key={preset.mode} style={backendRosterItemStyle}>
                      {index > 0 && <span aria-hidden="true" style={backendRosterSeparatorStyle} />}
                      <LocaleLink
                        className="landing-backend-link"
                        to={`/interactions/gallery/${preset.mode}`}
                        style={backendRosterLinkStyle}
                      >
                        {preset.label}
                      </LocaleLink>
                    </span>
                  ))}
                  <span style={backendRosterItemStyle}>
                    <span aria-hidden="true" style={backendRosterSeparatorStyle} />
                    <LocaleLink className="landing-backend-link" to="/interactions/gallery" style={backendRosterMoreLinkStyle}>
                      {t('landing.themeRosterMore', { count: INTERACTION_PRESET_TYPES.length - INTERACTION_ROSTER_PREVIEW.length })}
                    </LocaleLink>
                  </span>
                </div>
              </div>
            </div>
            <div className="landing-hero-actions" style={leadButtonsColStyle}>
              <div style={actionBoxStyle}>
                <HeroCTA
                  to="/interactions"
                  label={t('landing.ctaInteractions')}
                  attention
                  variant="secondary"
                />
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
              { key: 'release100', to: '/interactions', linkLabel: 'Interactive' },
              { key: 'release051', href: `${GITHUB_REPO}/blob/main/CHANGELOG.md`, linkLabel: 'Changelog' },
              { key: 'release050', href: `${GITHUB_REPO}/releases/tag/0.5.0`, linkLabel: 'v0.5.0' },
            ] as { key: string; href?: string; to?: string; linkLabel: string }[]).map((update) => (
              <article className="landing-news-item" style={newsItemStyle} key={update.key}>
                <time style={newsDateStyle} dateTime={t(`landing.news.${update.key}.dateTime`)}>
                  {t(`landing.news.${update.key}.date`)}
                </time>
                <p style={newsTextStyle}>{t(`landing.news.${update.key}.text`)}</p>
                {update.to && (
                  <LocaleLink className="site-text-link" style={newsLinkStyle} to={update.to}>
                    {update.linkLabel}
                  </LocaleLink>
                )}
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
                    <span>{feature.title}</span>
                  </h2>
                  <p style={featureBodyStyle}>{feature.body}</p>
                </div>
                {feature.demo && (
                  <div style={featureGridVisualStyle}>
                    <FeatureDemoView build={feature.demo} />
                  </div>
                )}
                {feature.visual && <div style={featureGridVisualStyle}>{feature.visual}</div>}
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
          <div style={{ margin: '40px 0 0', color: siteTheme.text, fontSize: 14, lineHeight: 1.5 }}>
            <Contributors label={t('landing.contributors')} />
          </div>
        </section>
      </main>
      <MicrosoftDisclosures />
    </div>
  );
}

// GitHub snapshot by contribution count; refreshed from the API when it is reachable.
const CONTRIBUTORS_SNAPSHOT = [
  'Chenglong-MS', 'xavier-shaw', 'IAMkecheng', 'zl190', 'lx9days', 'spboyer', 'taoche', 'zhb-y-agent',
  'zhnd', 'yelper', 'chen1plus', 'FGRibreau', 'Hughhhhcoder', 'joshpoll', 'nyxst4ck', 'fix2015',
];

function Contributors({ label }: { label: string }) {
  const [logins, setLogins] = useState(CONTRIBUTORS_SNAPSHOT);
  useEffect(() => {
    const controller = new AbortController();
    fetch('https://api.github.com/repos/microsoft/flint-chart/contributors?per_page=100', { signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then((rows: { login?: unknown; type?: unknown }[] | null) => {
        const users = rows?.filter(row => row.type === 'User' && typeof row.login === 'string').map(row => row.login as string);
        if (users?.length) setLogins(users);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return <>
    <a className="site-text-link" style={{ ...contributorLinkStyle, color: siteTheme.text, fontSize: 15, fontWeight: 600 }}
      href={`${GITHUB_REPO}/graphs/contributors`} target="_blank" rel="noreferrer">{label}</a>
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px 18px', maxWidth: 760, margin: '14px auto 0' }}>
      {logins.map(login => <a key={login} className="site-text-link" style={contributorChipStyle}
        href={`https://github.com/${encodeURIComponent(login)}`} target="_blank" rel="noreferrer">
        <img src={`https://github.com/${encodeURIComponent(login)}.png?size=56`} alt="" width={28} height={28}
          loading="lazy" style={contributorAvatarStyle} />
        {login}
      </a>)}
    </div>
  </>;
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
  | 'sortedBar'
  | 'gapminder'
  | 'penguins'
  | 'worldCup'
  | 'selectionChat'
  | 'countryTable'
  | 'continentTable'
  | 'movingAverage'
  | 'climatePhase';

interface ShowcaseApplication {
  /** The Advanced Interactions case that carries the application's full code, when it has one. */
  caseId?: string;
  /** The width the application is laid out at before it is scaled into the pane. */
  width: number;
  /** How far the pane may enlarge it; text-heavy applications stay at their own size. */
  maxScale?: number;
  /** The house the application opens in; the reader can still switch it. */
  theme?: string;
  load(): Promise<{ Demo: ComponentType<{ themeId: string | null }>; spec: ChartAssemblyInput }>;
}

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
  /** Presets the chart mounts with; only the Vega-Lite backend runs them. */
  interactions?: InteractionSpec['interactions'];
  /** An application built around the chart; the spec pane shows only the chart's spec. */
  application?: ShowcaseApplication;
  /** Shown with the applications, as an interaction rather than a chart type. */
  interactionGroup?: boolean;
  /** Lines for a callout over the chart while the reader has a selection. */
  summarizeSelection?: (rows: readonly Record<string, unknown>[]) => string[];
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

/** Every country in Gapminder's 2007 snapshot, as a Rosling bubble chart. */
function gapminder2007(): TestCase {
  const data = csvParseRows(gapminderCsv).slice(1)
    .filter(([, year]) => year === '2007')
    .map(([Country, , pop, Continent, life, gdp]) => ({
      Country,
      Continent,
      'GDP per capita': Math.round(Number(gdp)),
      'Life expectancy': Number(life),
      'Population (M)': Math.round(Number(pop) / 1e5) / 10,
    }));
  const metadata = buildMetadata(data);
  metadata.Country.semanticType = 'Country';
  return {
    title: 'Gapminder 2007',
    description: '',
    tags: [],
    chartType: 'Scatter Plot',
    data,
    fields: ['Country', 'Continent', 'GDP per capita', 'Life expectancy', 'Population (M)'].map((name) => makeField(name)),
    metadata,
    encodingMap: {
      x: makeEncodingItem('GDP per capita'),
      y: makeEncodingItem('Life expectancy'),
      size: makeEncodingItem('Population (M)'),
      color: makeEncodingItem('Continent'),
    },
    chartProperties: { logScale_x: true },
  };
}

/** All 342 measured Palmer penguins, in place of the gallery case's small sample. */
function palmerPenguins(): TestCase {
  const sample = TEST_GENERATORS['Scatter Plot']()
    .find((testCase) => testCase.title === 'Palmer Penguins — flipper length vs body mass')!;
  const { columns, rows } = classicDatasets.penguins;
  const data = rows.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])))
    .map(({ Species, 'Flipper length (mm)': flipper, 'Body mass (g)': mass }) =>
      ({ Species, 'Flipper length (mm)': flipper, 'Body mass (g)': mass }));
  return { ...sample, data };
}

/** What a lasso around some penguins caught: how many, of which species, and their average build. */
function penguinSelectionSummary(rows: readonly Record<string, unknown>[]): string[] {
  const species = new Map<string, number>();
  for (const row of rows) species.set(String(row.Species), (species.get(String(row.Species)) ?? 0) + 1);
  const mean = (field: string) => rows.reduce((total, row) => total + Number(row[field]), 0) / rows.length;
  return [
    `${rows.length} penguin${rows.length === 1 ? '' : 's'} selected`,
    [...species].map(([name, count]) => `${name} ${count}`).join(' · '),
    `Avg flipper ${mean('Flipper length (mm)').toFixed(0)} mm · Avg mass ${Math.round(mean('Body mass (g)')).toLocaleString('en-US')} g`,
  ];
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
    interactions: [{ type: 'click-highlight' }],
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
    // Six series in four panels: following one platform across panels reads better than a readout.
    interactions: [{ type: 'hover-group-focus', options: { groupBy: 'gameType' } }, { type: 'legend-toggle' }],
  },
  {
    id: 'gapminder',
    exampleKey: 'gapminder',
    testCase: gapminder2007(),
    interactions: [{ type: 'click-highlight' }, { type: 'brush-zoom' }],
  },
  {
    id: 'heatmap',
    exampleKey: 'heatmap',
    generator: 'Heatmap',
    testTitle: 'Average monthly temperature by city',
    interactions: [{ type: 'hover-group-focus', options: { groupBy: 'City' } }],
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
    interactions: [{ type: 'click-highlight', options: { targets: ['mark', 'legend'] } }],
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
    interactions: [{ type: 'click-highlight', options: { targets: ['mark', 'discreteAxis'] } }],
  },
  {
    id: 'country-table',
    exampleKey: 'countryTable',
    application: {
      width: 560,
      theme: 'powerbi-light',
      load: () => withApplicationStyles(Promise.all([
        import('../playground/ExternalToChartLab'),
        import('../playground/interaction-demo-data'),
      ]).then(([lab, data]) => ({ Demo: lab.CountryTableStage, spec: data.countriesFixture.input }))),
    },
  },
  {
    id: 'continent-table',
    exampleKey: 'continentTable',
    application: {
      width: 560,
      theme: 'powerbi-light',
      load: () => withApplicationStyles(Promise.all([
        import('../playground/ExternalToChartLab'),
        import('../playground/interaction-demo-data'),
      ]).then(([lab, data]) => ({ Demo: lab.ContinentTableStage, spec: data.countriesFixture.input }))),
    },
  },
  {
    id: 'penguins',
    exampleKey: 'penguins',
    testCase: palmerPenguins(),
    interactions: [{ type: 'lasso-select' }, { type: 'legend-toggle' }],
    interactionGroup: true,
    summarizeSelection: penguinSelectionSummary,
  },
  {
    id: 'world-cup',
    exampleKey: 'worldCup',
    application: {
      caseId: 'click-a-team',
      theme: 'nyt',
      width: 760,
      load: () => withApplicationStyles(import('../playground/WorldCupScorersDemo')
        .then((module) => ({ Demo: module.WorldCupScorersDemo, spec: module.TEAMS_SPEC }))),
    },
  },
  {
    id: 'selection-chat',
    exampleKey: 'selectionChat',
    application: {
      caseId: 'brush-for-the-agent',
      theme: 'economist',
      width: 600,
      maxScale: 1,
      load: () => withApplicationStyles(Promise.all([
        import('../playground/InteractiveDataReportLab'),
        import('../playground/interactive-data-report-content'),
      ]).then(([lab, content]) => ({
        Demo: ({ themeId }) => <div className="it-page idr-page app-demo-embed"><lab.SelectionChatDemo spec={content.SELECTION_CHAT} editable={false} themeId={themeId} /></div>,
        spec: content.SELECTION_CHAT.fixture.input,
      }))),
    },
  },
  {
    id: 'moving-average',
    exampleKey: 'movingAverage',
    application: {
      caseId: 'moving-average',
      theme: 'swiss',
      width: 640,
      load: () => withApplicationStyles(import('../playground/MovingAverageStage')
        .then((module) => ({ Demo: module.MovingAverageStage, spec: module.SPEC }))),
    },
  },
  {
    id: 'climate-phase',
    exampleKey: 'climatePhase',
    application: {
      caseId: 'climate-phase-portrait',
      theme: 'datawrapper',
      width: 640,
      load: () => withApplicationStyles(import('../playground/ClimatePhaseStage')
        .then((module) => ({
          Demo: function ClimateDemo({ themeId }: { themeId: string | null }) {
            const { t } = useTranslation();
            return <module.ClimatePhaseStage compact height={440} showReadout hint={t('landing.examples.climatePhase.hint')} themeId={themeId} />;
          },
          spec: module.READOUT_CHART_INPUT,
        }))),
    },
  },
];

/** The stylesheets the Advanced Interactions page loads for its applications. */
function withApplicationStyles<T>(module: Promise<T>): Promise<T> {
  return Promise.all([
    module,
    import('../playground/click-focus-lab.css'),
    import('../playground/interaction-transport.css'),
    import('../playground/bespoke-interaction-lab.css'),
    import('../playground/release-examples/application-demos.css'),
  ]).then(([loaded]) => loaded);
}


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
  const baseTestCase = example.testCase ?? galleryTestCase;
  const supported = useMemo(
    () => (baseTestCase ? getSupportedBackends(baseTestCase.chartType) : []),
    [baseTestCase],
  );
  // Keep the chosen backend when the new example supports it; otherwise fall
  // back to that example's first available backend.
  const backend = supported.includes(selectedBackend) ? selectedBackend : supported[0] ?? 'vegalite';
  const testCase = useMemo(
    () => (baseTestCase && example.interactions && backend === 'vegalite'
      ? { ...baseTestCase, interactionSpec: { interactions: example.interactions } }
      : baseTestCase),
    [baseTestCase, example.interactions, backend],
  );
  const effectiveOptions = useMemo(
    () => ({ ...example.defaultChartProperties, ...tempOptions }),
    [example.defaultChartProperties, tempOptions],
  );

  const [selectionSummary, setSelectionSummary] = useState<string[] | null>(null);
  useEffect(() => {
    setTempOptions({});
    setPreviewTheme(null);
    setSelectionSummary(null);
  }, [exampleIdx, backend]);

  const summarize = example.summarizeSelection;
  const handleChartChange = useCallback((change: ChartChange) => {
    const rows = change.state.selected.map((element) => element.value as Record<string, unknown>);
    setSelectionSummary(summarize && rows.length > 0 ? summarize(rows) : null);
  }, [summarize]);

  const preferredTheme = example.application?.theme;
  useEffect(() => {
    if (preferredTheme) setThemeId(preferredTheme);
  }, [exampleIdx, preferredTheme]);

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

  if (!testCase && !example.application) return null;

  const count = SHOWCASE_EXAMPLES.length;
  const goPrev = () => setExampleIdx((i) => (i - 1 + count) % count);
  const goNext = () => setExampleIdx((i) => (i + 1) % count);

  return (
    <section style={heroShowcaseSectionStyle}>
      <div className="landing-example-tabs" style={exampleTabsStyle} role="tablist" aria-label={t('landing.exampleAria')}>
        {SHOWCASE_EXAMPLES.map((ex, i) => {
          // The interactions follow the single charts, set off by a rule.
          const inGroup = (entry?: ShowcaseExample) => Boolean(entry?.application || entry?.interactionGroup);
          const firstApplication = inGroup(ex) && !inGroup(SHOWCASE_EXAMPLES[i - 1]);
          return (
            <Fragment key={ex.id}>
              {firstApplication && <span aria-hidden="true" style={exampleTabRuleStyle} />}
              <button
                type="button"
                role="tab"
                className="landing-example-tab"
                aria-selected={i === exampleIdx}
                onClick={() => setExampleIdx(i)}
                style={exampleTabStyle(i === exampleIdx)}
              >
                {firstApplication && <span aria-hidden="true" style={{ ...attentionStarStyle, marginRight: 5 }}>★</span>}
                {t(`landing.examples.${ex.exampleKey}.label`)}
              </button>
            </Fragment>
          );
        })}
      </div>
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

        {example.application ? (
          <ShowcaseApplicationCard
            key={example.id}
            exampleKey={example.exampleKey}
            application={example.application}
            themeId={previewTheme ? previewTheme.id : themeId}
            themeControl={(
              <ThemeControl
                themeId={themeId}
                onTheme={chooseTheme}
                onPreview={(id) => setPreviewTheme({ id })}
                onPreviewEnd={() => setPreviewTheme(null)}
                placement="bottom"
                prominent
              />
            )}
          />
        ) : testCase && (
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
                    onChange={summarize ? handleChartChange : undefined}
                  />
                </ScaleToFit>
                {selectionSummary && (
                  <div style={selectionCalloutStyle} aria-live="polite">
                    {selectionSummary.map((line, index) => (
                      <div key={line} style={index === 0 ? { fontWeight: 600, color: siteTheme.text } : undefined}>{line}</div>
                    ))}
                    <span aria-hidden="true" style={selectionCalloutTailStyle} />
                  </div>
                )}
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
        )}

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
    </section>
  );
}

function ShowcaseApplicationCard({
  exampleKey,
  application,
  themeId,
  themeControl,
}: {
  exampleKey: ShowcaseExampleKey;
  application: ShowcaseApplication;
  /** The carousel's house; none is Flint's default. */
  themeId: string | undefined;
  themeControl: ReactNode;
}) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<Awaited<ReturnType<ShowcaseApplication['load']>> | null>(null);
  useEffect(() => {
    let live = true;
    void application.load().then((next) => { if (live) setLoaded(next); });
    return () => { live = false; };
  }, [application]);
  const house = themeId ?? null;
  const specText = useMemo(() => {
    if (!loaded) return '';
    // The application's own code is on the Advanced Interactions page; here only the chart is specified.
    const spec: Record<string, unknown> = { ...withHouseId(loaded.spec, house) };
    delete spec.data;
    delete spec.options;
    return stringify(spec, { maxLength: 52 }).replace(/^{\n/, '{\n  "data": {...},\n');
  }, [loaded, house]);

  return (
    <div className="landing-showcase-card" style={{ ...showcaseCardStyle, flex: 1, minWidth: 0 }}>
      <div className="landing-spec-pane" style={{ ...showcasePaneStyle, ...specPaneStyle }}>
        <div style={paneHeaderRowStyle}>
          <span style={paneLabelStyle}>{t('landing.flintSpec')}</span>
        </div>
        {loaded && <CodeBlock language="json" variant="light" wrapLongLines customStyle={specPreStyle}>{specText}</CodeBlock>}
        {loaded && (
          <p style={applicationNoteStyle}>
            <Trans
              i18nKey="landing.applicationNote"
              components={{ api: <LocaleLink className="site-text-link" to="/documentation/interaction-api" /> }}
            />
            {application.caseId && (
              <>
                {' '}
                <LocaleLink className="site-text-link" to={`/interactions/advanced?case=${application.caseId}`}>
                  {t('landing.applicationCode')}
                </LocaleLink>
              </>
            )}
          </p>
        )}
      </div>
      <div className="landing-chart-pane" style={{ ...showcasePaneStyle, ...chartPaneStyle, borderLeft: `1px solid ${HAIRLINE}` }}>
        <div className="landing-pane-header" style={paneHeaderRowStyle}>
          {themeControl}
          <span style={paneLabelStyle}>{t(`landing.examples.${exampleKey}.label`)}</span>
        </div>
        <div className="landing-chart-canvas landing-application" style={chartCanvasStyle}>
          <div style={chartViewportStyle}>
            {loaded && (
              <ScaleToFit fill height={465} padding={8} maxScale={application.maxScale ?? 1.3}>
                <div style={{ width: application.width }} data-app={exampleKey}><loaded.Demo themeId={house} /></div>
              </ScaleToFit>
            )}
          </div>
        </div>
      </div>
    </div>
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
    // The chart_spec's objects get one entry per line; the rest stays compact.
    const expanded = ['encodings', 'chartProperties', 'canvasSize', 'baseSize'] as const;
    const chartSpecOut: Record<string, unknown> = { ...withCanvas.chart_spec };
    for (const key of expanded) {
      if (chartSpecOut[key] && typeof chartSpecOut[key] === 'object') chartSpecOut[key] = `__${key}__`;
    }
    let text = stringify({
      ...withCanvas,
      chart_spec: chartSpecOut,
      ...(testCase.interactionSpec ? { interaction_spec: testCase.interactionSpec } : {}),
    }, { maxLength: 52 });
    for (const key of expanded) {
      const value = (withCanvas.chart_spec as Record<string, unknown>)[key];
      if (value && typeof value === 'object') {
        text = text.replace(`"__${key}__"`, JSON.stringify(value, null, 2).replace(/\n/g, '\n    '));
      }
    }
    return text.replace(/^{\n/, '{\n  "data": {...},\n');
  }, [testCase, canvasSize, chartPropertyOverrides, themeId, useThemeCanvas, headline?.title, headline?.subtitle]);
  return <CodeBlock language="json" variant="light" wrapLongLines customStyle={specPreStyle}>{text}</CodeBlock>;
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
const INTERACTION_ROSTER_PREVIEW = [
  { mode: 'click-highlight', label: 'Click highlight' },
  { mode: 'brush-x', label: 'Brush' },
  { mode: 'inspect-index', label: 'Hover readout' },
  { mode: 'brush-zoom', label: 'Zoom' },
  { mode: 'legend-toggle', label: 'Legend toggle' },
  { mode: 'filter-controls', label: 'Filters' },
] as const;

// Lead paragraph shown in the hero (the single intro to Flint).
interface Feature {
  id: string;
  title: ReactNode;
  body: string;
  // Before/after demo shown alongside the text, illustrating the feature.
  demo?: () => FeatureDemoConfig;
  // A live visual in place of the before/after cards.
  visual?: ReactNode;
  isNew?: boolean;
}

function getFeatures(t: TFunction): Feature[] {
  const title = (id: string) => (
    <Trans i18nKey={`landing.features.${id}.title`} components={{ hl: <span style={featureTitleHighlightStyle} /> }} />
  );
  return [
    {
      id: 'semantic',
      title: title('semantic'),
      body: t('landing.features.semantic.body'),
      demo: demoSemanticTypes,
    },
    {
      id: 'chart',
      title: title('chart'),
      body: t('landing.features.chart.body'),
      demo: demoLayout,
    },
    {
      id: 'themes',
      title: title('themes'),
      body: t('landing.features.themes.body', { themes: Object.keys(THEME_PRESETS).length }),
      demo: demoThemes,
      isNew: true,
    },
    {
      id: 'interactions',
      title: title('interactions'),
      body: t('landing.features.interactions.body', { presets: INTERACTION_PRESET_TYPES.length }),
      visual: <InteractionDemo label={t('landing.features.interactions.demoLabel')} />,
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

// Card 3: the data and ChartSpec stay fixed; only the formal theme changes.
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

// Card 4: the gallery's two-line food-price case, read with the inspect-index preset.
function InteractionDemo({ label }: { label: string }) {
  const [spec, setSpec] = useState<ChartAssemblyInput | null>(null);
  useEffect(() => {
    let alive = true;
    // Loaded on demand so the price table stays out of the landing bundle.
    import('../data/cpi-food-prices.json').then(({ default: foodPrices }) => {
      if (!alive) return;
      const values = foodPrices.values
        .filter(({ item }) => item === 'Eggs' || item === 'White bread')
        .map(({ month, price, item }) => ({ Month: month, Price: price, Food: item }));
      setSpec({
        data: { values },
        semantic_types: { Month: 'Date', Price: 'Currency', Food: 'Category' },
        field_display_names: { Price: 'Average price (USD)' },
        chart_spec: {
          chartType: 'Line Chart',
          title: 'U.S. food prices',
          encodings: { x: { field: 'Month' }, y: { field: 'Price' }, color: { field: 'Food' } },
          baseSize: { width: 420, height: 240 },
        },
        interaction_spec: { interactions: [{ type: 'inspect-index', options: { show: 'all' } }] },
      } as ChartAssemblyInput);
    });
    return () => { alive = false; };
  }, []);
  return (
    <div style={featureLiveStyle}>
      <div style={featureLiveCardStyle}>
        <span style={stackBadgeStyle}>{label}</span>
        {spec && (
          <ScaleToFit height={300} padding={6}>
            <FlintChart spec={spec} renderer="svg" ariaLabel="U.S. food prices" />
          </ScaleToFit>
        )}
      </div>
    </div>
  );
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

/** A Flint spec with the data spec (semantic types) block highlighted. */
function HighlightedFlintSpec({ testCase }: { testCase: TestCase }) {
  const { json, hotLines } = useMemo(() => {
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
    const hotLines = start === -1 ? [] : Array.from({ length: end - start + 1 }, (_, i) => start + i + 1);
    return { json, hotLines };
  }, [testCase]);

  return (
    <CodeBlock language="json" variant="light" highlightLines={hotLines} customStyle={demoSpecPreStyle}>
      {json}
    </CodeBlock>
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
  gridTemplateColumns: '110px minmax(0, 1fr)',
  gap: 24,
  paddingTop: 16,
  paddingBottom: 16,
  borderTop: `1px solid ${HAIRLINE}`,
  borderBottom: `1px solid ${HAIRLINE}`,
};

const newsHeadingStyle: CSSProperties = {
  margin: 0,
  fontSize: 17,
  lineHeight: 1.5,
  fontWeight: 650,
};

const newsListStyle: CSSProperties = {
  display: 'grid',
};

const newsItemStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '112px minmax(0, 1fr) 72px',
  gap: 16,
  padding: '2px 0',
};

const newsDateStyle: CSSProperties = {
  color: siteTheme.textMuted,
  fontSize: 12.5,
  lineHeight: 1.6,
  fontVariantNumeric: 'tabular-nums',
};

const newsTextStyle: CSSProperties = {
  margin: 0,
  color: siteTheme.text,
  fontSize: 13.5,
  lineHeight: 1.55,
};

const newsLinkStyle: CSSProperties = {
  color: siteTheme.accent,
  fontSize: 12.5,
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

const heroVersionStyle: CSSProperties = {
  display: 'inline-block',
  marginTop: 8,
  color: siteTheme.textMuted,
  fontSize: 14,
  fontVariantNumeric: 'tabular-nums',
  textDecoration: 'none',
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

  /* A long string that wraps continues under its key, not at the left edge. */
  .landing-spec-pane code > span {
    display: block;
    padding-left: 6ch;
    text-indent: -6ch;
  }

  .landing-example-tab:hover {
    color: ${siteTheme.text} !important;
  }

  .landing-example-tab:focus-visible {
    outline: 2px solid ${siteTheme.accent};
    outline-offset: -2px;
  }

  /* The pane header already names the application. */
  .landing-application .it-example-header {
    display: none;
  }

  /* The pane is the card, so the application's own frame would be a second one. */
  .landing-application .it-workspace {
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  /* The chart takes the conversation's width; the text keeps its size. */
  .landing-application .idr-chat-window .idr-chat-chart-bubble {
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
  }

  /* The pane is taller than wide: the chart leads and the table runs beneath it. */
  .landing-application :is([data-app='countryTable'], [data-app='continentTable']) .it-workspace-external {
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }

  .landing-application :is([data-app='countryTable'], [data-app='continentTable']) .it-chart-panel {
    order: -1;
    padding: 0 0 10px;
    border-left: 0;
  }

  .landing-application :is([data-app='countryTable'], [data-app='continentTable']) .it-control-panel {
    padding: 14px 0 0;
    border-top: 1px solid #e9edef;
  }

  .landing-application :is([data-app='countryTable'], [data-app='continentTable']) .it-control-content {
    margin-top: 8px;
  }

  .landing-application [data-app='countryTable'] .it-country-table-scroll {
    max-height: 112px;
  }

  /* The climate readout runs as one row under the chart rather than a column beside it. */
  .landing-application .climate-phase-shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .landing-application .climate-phase-shell .ic-flint-dimpvis-panel {
    border: 0;
    background: transparent;
  }

  .landing-application .climate-phase-hint {
    margin: 8px 4px 0;
    color: #57606a;
    font-size: 13px;
  }

  .landing-application .climate-phase-readout {
    grid-column: 1;
    grid-row: auto;
    display: flex;
    align-items: center;
    gap: 28px;
    margin: 10px 0 0;
    padding: 0 4px;
  }

  .landing-application .climate-phase-readout-header {
    gap: 10px;
    margin: 0;
  }

  .landing-application .climate-phase-readout dl {
    grid-auto-flow: column;
    grid-template-rows: auto auto;
    column-gap: 28px;
    row-gap: 0;
  }

  .landing-application .climate-phase-readout dd {
    margin: 0;
    font-size: 18px;
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

    .landing-example-tabs {
      margin: 0 0 12px !important;
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

const contributorChipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  color: siteTheme.text,
  textDecoration: 'none',
};

const contributorAvatarStyle: CSSProperties = {
  borderRadius: '50%',
  border: `1px solid ${siteTheme.border}`,
  background: siteTheme.hover,
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

const selectionCalloutStyle: CSSProperties = {
  position: 'absolute',
  top: 10,
  right: 10,
  zIndex: 5,
  display: 'grid',
  gap: 2,
  padding: '8px 12px',
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 8,
  background: 'rgba(255, 255, 255, 0.94)',
  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.08)',
  color: siteTheme.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
  fontVariantNumeric: 'tabular-nums',
  pointerEvents: 'none',
};

// A notch on the callout's lower edge, pointing down into the chart.
const selectionCalloutTailStyle: CSSProperties = {
  position: 'absolute',
  bottom: -5,
  left: 22,
  width: 9,
  height: 9,
  background: 'rgb(255, 255, 255)',
  borderRight: `1px solid ${HAIRLINE}`,
  borderBottom: `1px solid ${HAIRLINE}`,
  transform: 'rotate(45deg)',
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

// Aligned with the card: the pager arrows and their gap sit either side of it.
const exampleTabsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0 2px',
  margin: '0 48px 14px',
  borderBottom: `1px solid ${HAIRLINE}`,
};

const exampleTabRuleStyle: CSSProperties = {
  alignSelf: 'center',
  width: 1,
  height: 14,
  margin: '0 6px',
  background: HAIRLINE,
};

function exampleTabStyle(active: boolean): CSSProperties {
  return {
    minHeight: 30,
    padding: '6px 7px',
    marginBottom: -1,
    border: 0,
    borderBottom: `2px solid ${active ? siteTheme.accent : 'transparent'}`,
    background: 'transparent',
    color: active ? siteTheme.text : siteTheme.textMuted,
    fontFamily: 'inherit',
    fontSize: 12.5,
    fontWeight: active ? 600 : 500,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  };
}

const applicationNoteStyle: CSSProperties = {
  margin: '4px 16px 16px',
  paddingTop: 12,
  borderTop: `1px solid ${HAIRLINE}`,
  color: siteTheme.textMuted,
  fontSize: 13,
  lineHeight: 1.5,
};

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

const featureLiveStyle: CSSProperties = {
  height: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px 24px 10px',
};

const featureLiveCardStyle: CSSProperties = {
  ...featureStackCardStyle,
  height: '100%',
  boxSizing: 'border-box',
  padding: '30px 14px 12px',
  boxShadow: SOFT_SHADOW,
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

const featureTitleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 9,
  fontSize: 20,
  lineHeight: 1.35,
  fontWeight: 500,
  margin: '0 0 14px',
};

const featureTitleHighlightStyle: CSSProperties = {
  textDecoration: 'underline',
  textDecorationColor: 'rgba(0, 0, 0, 0.22)',
  textDecorationThickness: 2,
  textUnderlineOffset: 5,
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
      color: PAPER,
      background: active ? '#000' : siteTheme.text,
      borderColor: active ? '#000' : siteTheme.text,
    };
  }
  return {
    ...base,
    color: siteTheme.text,
    background: active ? siteTheme.hover : PAPER,
    borderColor: active ? 'rgba(0, 0, 0, 0.42)' : 'rgba(0, 0, 0, 0.24)',
  };
}
