import { useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { THEME_PRESETS, type ThemeSpec } from 'flint-chart';
import { JsonCodeMirror } from '../components/JsonCodeMirror';
import { ScaleToFit } from '../components/ScaleToFit';
import { Check, Copy } from 'lucide-react';
import { SiteShell } from '../components/SiteShell';
import { ThemeChartModal } from '../components/ThemeChartModal';
import { FlintView } from '../components/FlintView';
import { LocaleLink } from '../i18n/LocaleLink';
import { PREVIEW_CASES, type PreviewCase } from '../shared/preview-cases';
import { compactJson } from '../shared/compact-json';
import { revealInScroller } from '../shared/reveal-in-scroller';
import { loadHouses, type HouseChoice } from '../shared/house-themes';
import { ThemeSwatches } from '../components/ThemeSwatches';
import { BACKENDS } from '../shared/supported-backends';
import { CONTENT_MAX_WIDTH, GITHUB_REPO, siteTheme } from '../shared/theme';

/** An edit being typed draws at once: it is a draft, not a change to watch. */
const JUMP = { duration: 0 };

/**
 * The preview wall, in rows of four charts of a like height — measured as the mean drawn height
 * across Flint's defaults and a dozen houses, so a row stays even whichever theme is in view: the
 * tall waterfall, pie, bubbles and bump chart first; then the time series and bars; the
 * multi-series and radar; the banded and diverging bars; the heat map and lollipop last.
 */
const IDS = [
  'population-waterfall', 'browser-pie', 'gapminder-bubble', 'olympic-bump',
  'faithful-hist', 'keeling', 'driving', 'big-mac',
  'electricity-mix-area', 'seattle-range', 'life-expectancy', 'nutrition-radar',
  'earnings-education', 'us-pyramid', 'trust-likert', 'lifeexp-dumbbell',
  'temp-heatmap', 'co2-lollipop',
];

const CASE_BY_ID = new Map(PREVIEW_CASES.map((previewCase) => [previewCase.id, previewCase]));
const CHART_HEIGHT = 190;

export const GOOGLE_MATERIAL_THEME: ThemeSpec = {
  id: 'google-material',
  label: 'Google Material',
  ink: {
    surface: {
      source: 'house',
      canvas: '#ffffff',
      plot: '#ffffff',
      panel: '#fafafa',
    },
    text: {
      primary: '#212121',
      secondary: '#757575',
      muted: '#9e9e9e',
      inverse: '#ffffff',
    },
    structure: {
      grid: '#e0e0e0',
      axis: '#e0e0e0',
      rule: '#e0e0e0',
      zero: '#e0e0e0',
      connector: '#9e9e9e',
    },
    series: {
      // The 2014 Material palette at the 400 step — the level Material's own
      // chart examples use. Not the Google product blues: a chart is content,
      // and the brand marque is not a categorical scale.
      single: '#7e57c2',
      categorical: ['#7e57c2', '#26a69a', '#ffa726', '#42a5f5', '#ec407a', '#66bb6a'],
      categoricalExtended: [
        '#7e57c2', '#26a69a', '#ffa726', '#42a5f5', '#ec407a', '#66bb6a',
        '#5c6bc0', '#26c6da', '#ff7043', '#29b6f6', '#ab47bc', '#9ccc65',
      ],
      sequential: {
        stops: ['#ede7f6', '#b39ddb', '#7e57c2', '#5e35b1', '#4527a0'],
        space: 'lab',
        endpointsAgainstSurface: true,
        consumption: 'interpolate',
      },
      diverging: {
        stops: ['#42a5f5', '#90caf9', '#eceff1', '#ef9a9a', '#ef5350'],
        neutral: '#eceff1',
        space: 'lab',
        endpointsAgainstSurface: true,
        consumption: 'interpolate',
      },
      status: {
        positive: '#66bb6a',
        negative: '#ef5350',
        neutral: '#9e9e9e',
      },
      overflow: '#bdbdbd',
    },
    accent: '#7e57c2',
  },
  type: {
    minSize: 9,
    // Material's emphasis ladder on a light surface: 87% for what is read
    // first, 60% for the scaffolding, 38% only for what may be skipped. 38%
    // ink on white is ~2.8:1 and fails AA, so it never carries a label.
    headline: {
      family: "'Roboto', 'Helvetica Neue', Arial, sans-serif",
      size: 'text.400',
      weight: 'regular',
      color: '#212121',
    },
    deck: { family: "'Roboto', sans-serif", size: 'text.200', weight: 'regular', color: '#757575' },
    axisLabel: { family: "'Roboto', sans-serif", size: 'text.100', weight: 'regular', color: '#757575' },
    axisTitle: { family: "'Roboto', sans-serif", size: 'text.100', weight: 'regular', color: '#757575' },
    valueLabel: { family: "'Roboto', sans-serif", size: 'text.100', weight: 'regular', color: '#424242' },
    keyLabel: { family: "'Roboto', sans-serif", size: 'text.100', weight: 'regular', color: '#424242' },
    annotation: { family: "'Roboto', sans-serif", size: 'text.100', weight: 'regular', color: '#616161' },
    footnote: { family: "'Roboto', sans-serif", size: 'text.100', weight: 'regular', color: '#9e9e9e' },
    display: { family: "'Roboto', sans-serif", size: 'text.hero900', weight: 'regular', color: '#212121' },
  },
  structure: {
    axis: {
      categorical: {
        line: 'omit', ticks: 'omit', labelGap: 10, tickLabels: 'observed',
      },
      // Material seats the value scale on the far side and titles it above,
      // so the reading runs left-to-right into the numbers rather than away.
      measure: {
        line: 'omit', ticks: 'omit', labelGap: 10, placement: 'opposite', tickDensity: 'sparse',
      },
    },
    grid: {
      measure: 'quiet',
      category: 'omit',
      style: 'dashed',
      dash: [6, 4],
      weight: 1,
      zero: 'quiet',
    },
    baseline: 'omit',
    frame: 'omit',
  },
  marks: {
    // A white cut between stacked bands is the Material tell — the bands read
    // as separate quantities without a second ink entering the chart.
    separator: { presence: 'full', width: 2, source: 'surface' },
  },
  geometry: {
    line: { width: 2.5, cap: 'round', join: 'round', interpolation: 'linear' },
    point: { presence: 'omit', size: 36, fill: 'solid' },
    area: { opacity: 1, edge: 'omit' },
    band: { fraction: 0.7, cornerRadius: 0, opacity: 1 },
    arc: { cornerRadius: 0, gap: 2, gapStyle: 'pad' },
    cell: { gap: 2, cornerRadius: 2 },
  },
  labels: { truncation: 'ellipsis', flush: true },
  legend: {
    show: 'always', placement: ['bottom'], direction: 'horizontal',
    title: 'omit', suppressWhenAxisNames: true,
  },
  dataLabels: { show: 'never', placement: 'outsideMark', inkMode: 'fixed' },
  annotation: {
    unit: 'never', axisTitles: 'whenAmbiguous', axisTitlePlacement: 'flatAboveAxis',
    unitsInAxisTitle: true, pointEmphasis: 'never', pointLabels: 'never',
    numberFormat: { precision: 'auto', thousands: 'suffix' },
  },
  facets: {
    header: { presence: 'full', style: 'flushLabel', fieldTitle: 'omit' },
    panelFrame: 'omit', axisRepetition: 'edgeOnly', spacing: 'normal',
    preferredColumns: 3, sharedScale: 'whenComparable',
  },
  layout: {
    density: 'airy', targetWidth: 640,
    titleBlock: { anchor: 'start', position: 'top', gap: 'loose', deckGap: 'tight' },
    bandStep: 28,
  },
  variants: [
    {
      when: { seriesCount: { gte: 4 } },
      then: { geometry: { line: { width: 2 } } },
      because: 'five boroughs on one plot — a lighter stroke keeps the lines apart',
    },
  ],
};

const MICROSOFT_FLUENT_THEME: ThemeSpec = {
  extends: 'powerbi-light',
  id: 'microsoft-fluent',
  label: 'Microsoft Fluent',
  ink: {
    surface: { source: 'house', canvas: '#ffffff', plot: '#ffffff', panel: '#f5f5f5' },
    text: { primary: '#242424', secondary: '#616161', muted: '#8a8886', inverse: '#ffffff' },
    structure: {
      axis: '#b3b0ad', grid: '#e1dfdd', frame: '#d2d0ce', rule: '#8a8886',
      zero: '#8a8886', connector: '#8a8886',
    },
    series: {
      single: '#0078d4',
      categorical: ['#0078d4', '#c43e1c', '#4f7b00', '#744da9', '#986f0b', '#008272'],
      categoricalExtended: [
        '#0078d4', '#c43e1c', '#4f7b00', '#744da9', '#986f0b', '#008272',
        '#005a9e', '#a4262c', '#0b6a0b', '#5c2e91', '#8e562e', '#004b50',
      ],
      overflow: '#797775',
      sequential: {
        stops: ['#deecf9', '#9ccbee', '#4f9bd8', '#0078d4', '#004578'],
        space: 'lab', endpointsAgainstSurface: true, consumption: 'interpolate',
      },
      diverging: {
        stops: ['#0078d4', '#83b9e1', '#f3f2f1', '#e89a80', '#c43e1c'],
        neutral: '#f3f2f1', space: 'lab', endpointsAgainstSurface: true, consumption: 'interpolate',
      },
      status: { positive: '#107c10', negative: '#d13438', neutral: '#797775' },
    },
    accent: '#0078d4',
  },
  type: {
    minSize: 9,
    headline: {
      family: "'Segoe UI', system-ui, sans-serif", size: 'text.300',
      weight: 'semibold', color: '#242424',
    },
    axisLabel: { family: "'Segoe UI', system-ui, sans-serif", size: 'text.100', color: '#616161' },
    valueLabel: { family: "'Segoe UI', system-ui, sans-serif", weight: 'semibold' },
    display: { family: "'Segoe UI', system-ui, sans-serif", size: 'text.hero900', weight: 'semibold' },
  },
  structure: {
    grid: { measure: 'hairline', category: 'omit', style: 'solid', weight: 1 },
    frame: 'omit', baseline: 'quiet',
  },
  marks: {
    bandFraction: 0.72, strokeWeight: 2, strokeCap: 'round', strokeJoin: 'round',
    cornerRadius: 2, fillOpacity: 0.92,
  },
  dataLabels: { show: 'whenTheyFit', placement: 'atMark', inkMode: 'contrastWithMark' },
  layout: { density: 'compact', targetWidth: 640 },
};

const PEOPLES_DAILY_THEME: ThemeSpec = {
  id: 'peoples-daily',
  label: "People's Daily",
  ink: {
    surface: { source: 'house', canvas: '#fffdf8', plot: '#fffdf8', panel: '#f5f0e6' },
    text: { primary: '#1a1714', secondary: '#4b4540', muted: '#77706a', inverse: '#ffffff' },
    structure: {
      axis: '#312d29', grid: '#d8d1c6', frame: '#8d857c', rule: '#1a1714',
      zero: '#9e1b16', connector: '#69625c',
    },
    series: {
      single: '#9e1b16',
      categorical: ['#9e1b16', '#1f4e79', '#6b5b2a', '#3f6b4f', '#6a3d5f', '#8a4b2a'],
      categoricalExtended: [
        '#9e1b16', '#1f4e79', '#6b5b2a', '#3f6b4f', '#6a3d5f', '#8a4b2a',
        '#b33a2b', '#315f8c', '#89753a', '#557c61', '#80506f', '#a3613c',
      ],
      overflow: '#77706a',
      sequential: {
        stops: ['#f3e2dc', '#d99887', '#b74735', '#7f130f'],
        space: 'lab', endpointsAgainstSurface: true, consumption: 'interpolate',
      },
      diverging: {
        stops: ['#1f4e79', '#86a5be', '#f5f0e6', '#d99887', '#9e1b16'],
        neutral: '#f5f0e6', space: 'lab', endpointsAgainstSurface: true, consumption: 'interpolate',
      },
      status: { positive: '#386641', negative: '#9e1b16', neutral: '#77706a' },
    },
    accent: '#9e1b16',
  },
  type: {
    minSize: 9,
    headline: {
      family: "'Songti SC', SimSun, 'Noto Serif CJK SC', serif", size: 'text.400',
      weight: 'bold', color: '#1a1714',
    },
    deck: {
      family: "'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif",
      size: 'text.100', color: '#4b4540',
    },
    axisLabel: {
      family: "'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif",
      size: 'text.100', color: '#4b4540',
    },
    valueLabel: {
      family: "'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif",
      size: 'text.100', weight: 'semibold',
    },
    display: {
      family: "'Songti SC', SimSun, 'Noto Serif CJK SC', serif",
      size: 'text.hero900', weight: 'bold', color: '#9e1b16',
    },
  },
  structure: {
    axis: {
      categorical: {
        line: 'full', lineWeight: 1, ticks: 'full', tickLength: 'short',
        tickDirection: 'outward', labelGap: 7, tickLabels: 'all',
      },
      measure: {
        line: 'full', lineWeight: 1, ticks: 'full', tickLength: 'short',
        tickDirection: 'outward', labelGap: 7, tickDensity: 'normal',
      },
    },
    grid: { measure: 'hairline', category: 'omit', style: 'solid', weight: 0.6, zero: 'emphasised' },
    frame: 'omit', baseline: 'full',
  },
  marks: {
    bandFraction: 0.68, strokeWeight: 2, strokeCap: 'square', strokeJoin: 'miter',
    interpolation: 'linear', fillOpacity: 0.94, cornerRadius: 0,
    separator: { presence: 'hairline', width: 1, source: 'surface' },
    slice: { gap: 1, gapStyle: 'rule' },
  },
  labels: { truncation: 'wrap', flush: true },
  legend: {
    show: 'always', placement: ['top', 'right', 'bottom'], direction: 'horizontal',
    title: 'whenAmbiguous', maxSwatches: 8, suppressWhenAxisNames: true,
  },
  dataLabels: { show: 'whenTheyFit', placement: 'outsideMark', inkMode: 'fixed' },
  annotation: {
    unit: 'everyTick', axisTitles: 'always', axisTitlePlacement: 'flatAboveAxis',
    unitsInAxisTitle: true, pointEmphasis: 'endpoints', pointLabels: 'endpoints',
    numberFormat: { precision: 'auto', thousands: 'separator' },
  },
  furniture: [
    { kind: 'headerRule', anchor: 'topLeft', color: '#9e1b16', height: 4 },
    { kind: 'footerRule', anchor: 'bottomLeft', color: '#1a1714', height: 1 },
  ],
  facets: {
    header: { presence: 'full', style: 'flushLabel', fieldTitle: 'always' },
    panelFrame: 'hairline', axisRepetition: 'edgeOnly', spacing: 'compact',
    preferredColumns: 3, sharedScale: 'whenComparable',
  },
  layout: {
    density: 'compact', targetWidth: 640,
    titleBlock: { anchor: 'start', position: 'top', gap: 'tight', deckGap: 'tight' },
    bandStep: 26,
  },
};

/** The houses Flint ships, as the Visual Themes page lists them. */
const PRESETS = Object.values(THEME_PRESETS);

const DEMO_THEMES = [
  { theme: GOOGLE_MATERIAL_THEME },
  { theme: MICROSOFT_FLUENT_THEME },
  { theme: PEOPLES_DAILY_THEME },
] as const;


/** Characters a line of the editor holds before it scrolls: the JSON is laid out to fit. */
const EDITOR_WIDTH = 56;

const SHARE_URL = `${GITHUB_REPO}/issues/new?title=${encodeURIComponent('[Theme] Share a custom ThemeSpec')}&body=${encodeURIComponent('Paste your ThemeSpec JSON below and include a screenshot or short description of the visual direction.\n\n```json\n\n```')}`;

function buildInput(
  previewCase: PreviewCase,
  title: string,
  theme: ThemeSpec,
  baseSize = { width: 300, height: 200 },
) {
  return {
    data: { values: previewCase.data },
    semantic_types: previewCase.semantic_types,
    chart_spec: {
      chartType: previewCase.chartType,
      encodings: previewCase.encodings,
      baseSize,
      title,
      ...(previewCase.chartProperties ? { chartProperties: previewCase.chartProperties } : {}),
    },
    theme_spec: theme,
  } as any;
}

function PreviewTile({
  previewCase,
  theme,
  onOpen,
}: {
  previewCase: PreviewCase;
  theme: ThemeSpec;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const title = t(`themes.cases.${previewCase.id}.title`, previewCase.title);
  const blurb = t(`themes.cases.${previewCase.id}.blurb`, previewCase.blurb);
  const input = useMemo(() => buildInput(previewCase, title, theme), [previewCase, theme, title]);

  return (
    <article
      className="theme-lab-tile"
      role="button"
      tabIndex={0}
      aria-label={`${title}. ${blurb}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <ScaleToFit height={CHART_HEIGHT} minHeight={110} adaptiveHeight padding={2}>
        <FlintView spec={input} renderer="svg" compact transition={JUMP} />
      </ScaleToFit>
      <div className="theme-lab-tile-caption">{blurb}</div>
    </article>
  );
}

function parseThemeSpec(text: string, objectError: string): ThemeSpec {
  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(objectError);
  }
  return value as ThemeSpec;
}

export function ThemeLab() {
  const { t } = useTranslation();
  const [openCase, setOpenCase] = useState<PreviewCase | null>(null);
  const [customTheme, setCustomTheme] = useState<ThemeSpec>(GOOGLE_MATERIAL_THEME);
  const [themeDraft, setThemeDraft] = useState(() => compactJson(GOOGLE_MATERIAL_THEME, EDITOR_WIDTH));
  // The choice in view, by group: `preset:economist`, `custom:google-material`, `custom:economist` (a house).
  const [activeDemoId, setActiveDemoId] = useState<string | undefined>(`custom:${GOOGLE_MATERIAL_THEME.id}`);
  const starterTrayRef = useRef<HTMLDivElement>(null);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  // A style-guide house opened from the Visual Themes page (`?house=datadog`); it joins the Custom list.
  const [searchParams] = useSearchParams();
  const [houses, setHouses] = useState<HouseChoice[]>([]);
  // A deep-linked house may sit below the tray's fold.
  useEffect(() => {
    revealInScroller(starterTrayRef.current, starterTrayRef.current?.querySelector('[aria-pressed="true"]') ?? null);
  }, [activeDemoId, houses.length]);
  useEffect(() => {
    let live = true;
    void loadHouses().then((list) => { if (live) setHouses(list); });
    return () => { live = false; };
  }, []);
  const cases = useMemo(
    () => IDS.map((id) => CASE_BY_ID.get(id)).filter((previewCase): previewCase is PreviewCase => Boolean(previewCase)),
    [],
  );
  // What the theme in view is about: a built-in's line, or the house's research summary.
  const activeAbout = useMemo(() => {
    const preset = PRESETS.find((p) => `preset:${p.id}` === activeDemoId);
    if (preset) return { name: preset.label, text: preset.description };
    const demo = DEMO_THEMES.find(({ theme }) => `custom:${theme.id}` === activeDemoId);
    if (demo) return { name: t(`themeLab.demos.${demo.theme.id}`, demo.theme.label ?? ''), text: t(`themeLab.about.${demo.theme.id}`) };
    const house = houses.find((h) => `house:${h.id}` === activeDemoId);
    return house ? { name: house.name, text: house.about } : null;
  }, [activeDemoId, houses, t]);

  const formattedThemeDraft = useMemo(() => {
    try {
      return compactJson(JSON.parse(themeDraft), EDITOR_WIDTH);
    } catch {
      return null;
    }
  }, [themeDraft]);

  const updateThemeDraft = (value: string) => {
    setThemeDraft(value);
    setActiveDemoId(undefined);
    try {
      const nextTheme = parseThemeSpec(value, t('themeLab.objectError'));
      for (const previewCase of cases) {
        BACKENDS.vegalite.assemble(buildInput(previewCase, previewCase.title, nextTheme));
      }
      setCustomTheme(nextTheme);
      setThemeError(null);
    } catch (error) {
      setThemeError(String((error as Error)?.message ?? error));
    }
  };

  const applyDemoTheme = (theme: ThemeSpec, key: string) => {
    const nextDraft = compactJson(theme, EDITOR_WIDTH);
    setCustomTheme(theme);
    setThemeDraft(nextDraft);
    setThemeError(null);
    setActiveDemoId(key);
  };

  // Opened from Visual Themes: `?preset=economist` or `?house=datadog` starts the editor from that theme.
  const linkedPreset = searchParams.get('preset');
  const linkedHouseId = searchParams.get('house');
  useEffect(() => {
    const preset = linkedPreset ? THEME_PRESETS[linkedPreset] : undefined;
    if (preset) {
      applyDemoTheme(preset.spec, `preset:${preset.id}`);
      return;
    }
    if (!linkedHouseId) return;
    let live = true;
    void loadHouses().then((list) => {
      const house = list.find((h) => h.id === linkedHouseId);
      if (!live || !house) return;
      applyDemoTheme(house.theme, `house:${house.id}`);
    });
    return () => { live = false; };
    // Applied once per link, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedPreset, linkedHouseId]);

  const copyStarterPrompt = async () => {
    try {
      await navigator.clipboard.writeText(t('themeLab.prompt'));
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 1600);
    } catch {
      setPromptCopied(false);
    }
  };

  return (
    <SiteShell>
      <style>{styles}</style>
      <div className="theme-lab-page">
        <div className="theme-lab-inner">
          <header className="theme-lab-intro">
            <h1>{t('themeLab.title')}</h1>
            <p className="theme-lab-lead">{t('themeLab.lead')}</p>
            <ol className="theme-lab-steps">
              <li>
                <strong><span>1</span>{t('themeLab.steps.generateTitle')}</strong>
                {t('themeLab.steps.generate')}
                <span className="theme-lab-step-actions">
                  <button type="button" className="theme-lab-copy" onClick={copyStarterPrompt}>
                    {promptCopied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                    {promptCopied ? t('themeLab.copied') : t('themeLab.copyPromptCta')}
                  </button>
                  <button type="button" className="theme-lab-view" aria-expanded={promptOpen} onClick={() => setPromptOpen((open) => !open)}>
                    {promptOpen ? t('themeLab.hidePrompt') : t('themeLab.viewPrompt')}
                  </button>
                </span>
              </li>
              <li>
                <strong><span>2</span>{t('themeLab.steps.previewTitle')}</strong>
                {t('themeLab.steps.preview')}
              </li>
              <li>
                <strong><span>3</span>{t('themeLab.steps.shareTitle')}</strong>
                {t('themeLab.steps.shareReady')}{' '}
                <a href={SHARE_URL} target="_blank" rel="noreferrer">{t('themeLab.steps.shareLink')}</a>.
              </li>
            </ol>
            {promptOpen && <pre className="theme-lab-prompt">{t('themeLab.prompt')}</pre>}
          </header>

          <h2 className="theme-lab-h2">{t('themeLab.playTitle')}</h2>
          <section className="theme-lab-starters" aria-label={t('themeLab.housesAria')}>
            <div ref={starterTrayRef} className="theme-lab-starter-tray">
              {DEMO_THEMES.map(({ theme }) => (
                <button key={`custom:${theme.id}`} type="button" aria-pressed={activeDemoId === `custom:${theme.id}`} onClick={() => applyDemoTheme(theme, `custom:${theme.id}`)}>
                  <ThemeSwatches theme={theme} />
                  <span>{t(`themeLab.demos.${theme.id}`, theme.label ?? theme.id ?? '')}</span>
                </button>
              ))}
              {houses.map((house) => (
                <button
                  key={`house:${house.id}`}
                  type="button"
                  title={house.org}
                  aria-pressed={activeDemoId === `house:${house.id}`}
                  onClick={() => applyDemoTheme(house.theme, `house:${house.id}`)}
                >
                  <ThemeSwatches theme={house.theme} />
                  <span>{house.name}</span>
                </button>
              ))}
            </div>
            <p className="theme-lab-credit">
              <Trans i18nKey="themeLab.housesCredit" components={{ site: <a href="https://www.datavizstyleguide.com/" target="_blank" rel="noreferrer" /> }} />
            </p>
          </section>

          <div className="theme-lab-about" aria-live="polite">
            <strong>{activeAbout?.name ?? t('themeLab.customDraft')}</strong>
            {activeAbout && <span>{activeAbout.text}</span>}
          </div>
          <div className="theme-lab-workspace">
            <div className="theme-lab-panel-cell">
            <aside className="theme-lab-panel" aria-label={t('themeLab.editorAria')}>
              <button
                className="theme-lab-format-button"
                type="button"
                disabled={formattedThemeDraft === null || formattedThemeDraft === themeDraft}
                onClick={() => {
                  if (formattedThemeDraft !== null) updateThemeDraft(formattedThemeDraft);
                }}
              >
                {t('themeLab.formatJson')}
              </button>
              <div className="theme-lab-editor">
                <JsonCodeMirror value={themeDraft} onChange={updateThemeDraft} foldKeys={[]} />
              </div>
              <div className={`theme-lab-status${themeError ? ' theme-lab-status--error' : ''}`} role="status">
                {themeError ?? t('themeLab.validSpec')}
              </div>
            </aside>
            </div>
            <div className="theme-lab-preview">
              <div className="theme-lab-wall">
                {cases.map((previewCase) => (
                  <PreviewTile
                    key={previewCase.id}
                    previewCase={previewCase}
                    theme={customTheme}
                    onOpen={() => setOpenCase(previewCase)}
                  />
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
      {openCase && <ThemeChartModal previewCase={openCase} theme={customTheme} onClose={() => setOpenCase(null)} />}
    </SiteShell>
  );
}

const styles = `
  .theme-lab-page { flex: 1; min-height: 0; overflow-y: auto; background: ${siteTheme.surface}; }
  .theme-lab-inner { width: 100%; max-width: ${CONTENT_MAX_WIDTH}px; margin: 0 auto; padding: 28px 32px 72px; box-sizing: border-box; }
  .theme-lab-intro { font-size: 15px; line-height: 1.65; color: ${siteTheme.text}; }
  .theme-lab-intro h1 { margin: 0 0 16px; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
  .theme-lab-lead { margin: 0 0 18px; }
  .theme-lab-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 0 0 14px; padding: 0; list-style: none; }
  .theme-lab-steps li { padding: 12px 14px; border: 1px solid ${siteTheme.border}; border-radius: ${siteTheme.radius}px; color: ${siteTheme.textMuted}; font-size: 13.5px; line-height: 1.55; }
  .theme-lab-steps strong { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; color: ${siteTheme.text}; font-size: 14px; }
  .theme-lab-steps strong span { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: ${siteTheme.text}; color: ${siteTheme.surface}; font-size: 11.5px; font-weight: 700; }
  .theme-lab-intro a { color: ${siteTheme.accent}; text-decoration: none; }
  .theme-lab-intro a:hover { text-decoration: underline; }
  .theme-lab-prompt { margin: 0 0 14px; padding: 12px 14px; max-height: 220px; overflow: auto; border-radius: ${siteTheme.radius}px; background: ${siteTheme.hover}; font-family: ${siteTheme.fontMono}; font-size: 12px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; color: ${siteTheme.text}; }
  .theme-lab-step-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-top: 10px; }
  .theme-lab-copy { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 0; border-radius: 6px; background: ${siteTheme.text}; color: ${siteTheme.surface}; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .theme-lab-copy:hover { opacity: 0.88; }
  .theme-lab-view { padding: 0; border: 0; background: none; color: ${siteTheme.accent}; font: inherit; font-size: 12.5px; cursor: pointer; }
  .theme-lab-view:hover { text-decoration: underline; }
  .theme-lab-copy:focus-visible, .theme-lab-view:focus-visible { outline: 2px solid ${siteTheme.accent}; outline-offset: 2px; }
  .theme-lab-h2 { margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 1px solid ${siteTheme.border}; font-size: 20px; font-weight: 600; }
  .theme-lab-starters { margin-bottom: 16px; }
  .theme-lab-credit { margin: 6px 4px 0; color: ${siteTheme.textMuted}; font-size: 12px; line-height: 1.5; text-align: right; }
  .theme-lab-credit a { color: inherit; text-decoration: underline; text-decoration-color: rgba(0, 0, 0, 0.3); text-underline-offset: 2px; }
  .theme-lab-credit a:hover { color: ${siteTheme.text}; }
  .theme-lab-starter-tray { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; max-height: 140px; overflow-y: auto; overscroll-behavior: contain; padding: 4px; border-radius: 8px; background: rgba(0, 0, 0, 0.05); }
  .theme-lab-starter-tray button { height: 30px; display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: ${siteTheme.textMuted}; font: inherit; font-size: 12.5px; white-space: nowrap; cursor: pointer; }
  .theme-lab-starter-tray button:hover { color: ${siteTheme.text}; }
  .theme-lab-starter-tray button[aria-pressed="true"] { background: ${siteTheme.surface}; box-shadow: 0 1px 2px rgba(31, 35, 40, 0.16); color: ${siteTheme.text}; font-weight: 600; }
  .theme-lab-starter-tray button:focus-visible { outline: 2px solid ${siteTheme.accent}; outline-offset: 1px; }
  .theme-lab-workspace { display: grid; grid-template-columns: minmax(380px, 0.42fr) minmax(0, 0.58fr); gap: 20px; align-items: stretch; }
  .theme-lab-panel { position: relative; min-height: 560px; height: 100%; max-height: 100%; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; border: 1px solid ${siteTheme.border}; border-radius: ${siteTheme.radius}px; background: ${siteTheme.surface}; }
  .theme-lab-panel-cell { position: relative; min-height: 560px; }
  .theme-lab-panel-cell > .theme-lab-panel { position: absolute; inset: 0; }
  .theme-lab-editor { flex: 1; min-height: 0; overflow: hidden; }
  .theme-lab-editor > div, .theme-lab-editor .cm-editor { height: 100%; min-height: 0; }
  .theme-lab-editor .cm-scroller { overflow: auto; }
  .theme-lab-format-button { position: absolute; top: 8px; right: 12px; z-index: 5; padding: 5px 9px; border: 0; border-radius: 6px; background: rgba(0, 0, 0, 0.06); color: ${siteTheme.text}; font: inherit; font-size: 12px; font-weight: 600; line-height: 1.25; cursor: pointer; }
  .theme-lab-format-button:hover, .theme-lab-format-button:focus-visible { background: ${siteTheme.text}; color: ${siteTheme.surface}; outline: none; }
  .theme-lab-format-button:disabled { opacity: 0.45; cursor: default; }
  .theme-lab-format-button:disabled:hover { background: rgba(0, 0, 0, 0.06); color: ${siteTheme.text}; }
  .theme-lab-status { min-height: 32px; display: flex; align-items: center; padding: 7px 12px; border-top: 1px solid ${siteTheme.border}; color: #0b6a0b; font-size: 11.5px; line-height: 1.35; }
  .theme-lab-status--error { color: ${siteTheme.error}; }
  .theme-lab-preview { min-width: 0; }
  .theme-lab-about { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; margin: 0 0 12px; color: ${siteTheme.textMuted}; font-size: 13px; line-height: 1.55; }
  .theme-lab-about strong { color: ${siteTheme.text}; font-size: 14px; }
  .theme-lab-wall { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .theme-lab-tile { min-width: 0; padding: 8px; border-radius: 4px; cursor: zoom-in; transition: background 120ms ease; }
  .theme-lab-tile:hover { background: ${siteTheme.hover}; }
  .theme-lab-tile:focus-visible { outline: 2px solid ${siteTheme.accent}; outline-offset: 2px; }
  .theme-lab-tile-caption { margin-top: 2px; min-height: 28px; overflow: hidden; color: ${siteTheme.navInactive}; display: -webkit-box; font-size: 10.5px; line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .theme-lab-error { margin: 0; color: ${siteTheme.error}; font-size: 11px; white-space: pre-wrap; }
  @media (max-width: 1100px) { .theme-lab-wall { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 760px) { .theme-lab-steps { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 900px) { .theme-lab-workspace { grid-template-columns: minmax(0, 1fr); } .theme-lab-panel-cell { height: 520px; min-height: 0; } }
  @media (max-width: 600px) { .theme-lab-inner { padding: 24px 16px 56px; } .theme-lab-wall { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;
