import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { type ThemeSpec } from 'flint-chart';
import { JsonCodeMirror } from '../components/JsonCodeMirror';
import { ScaleToFit } from '../components/ScaleToFit';
import { GitHubIcon, LabIcon, SiteShell } from '../components/SiteShell';
import { ThemeChartModal } from '../components/ThemeChartModal';
import { VegaLiteView } from '../components/VegaLiteView';
import { LocaleLink } from '../i18n/LocaleLink';
import { PREVIEW_CASES, type PreviewCase } from '../shared/preview-cases';
import { BACKENDS } from '../shared/supported-backends';
import { GITHUB_REPO, siteTheme } from '../shared/theme';

const IDS = [
  'keeling', 'driving', 'seattle-range', 'temp-heatmap', 'browser-pie', 'co2-lollipop',
  'life-expectancy', 'lifeexp-dumbbell', 'electricity-mix-area', 'big-mac', 'olympic-bump', 'nutrition-radar',
  'faithful-hist', 'trust-likert', 'population-waterfall', 'us-pyramid', 'gapminder-bubble', 'earnings-education',
];

const CASE_BY_ID = new Map(PREVIEW_CASES.map((previewCase) => [previewCase.id, previewCase]));
const CHART_HEIGHT = 190;

const STARTER_THEME: ThemeSpec = {
  id: 'signal-studio',
  label: 'Signal Studio',
  ink: {
    surface: {
      source: 'house',
      canvas: '#f3f7f6',
      plot: '#ffffff',
      panel: '#e8f0ee',
    },
    text: {
      primary: '#16302b',
      secondary: '#536561',
      muted: '#899a96',
    },
    structure: {
      grid: '#d8e3e0',
      axis: '#16302b',
      rule: '#16302b',
      connector: '#a4b6b1',
    },
    series: {
      single: '#00897b',
      categorical: ['#00897b', '#e84a3c', '#f2b134', '#3867d6', '#9b51e0', '#d81b60'],
      sequential: {
        stops: ['#e4f3f0', '#9bd5ca', '#45b4a5', '#00897b', '#00594f'],
        space: 'lab',
        endpointsAgainstSurface: true,
      },
      diverging: {
        stops: ['#3867d6', '#9eb9f2', '#f3f7f6', '#f2a39b', '#e84a3c'],
        neutral: '#f3f7f6',
        space: 'lab',
        endpointsAgainstSurface: true,
      },
      status: {
        positive: '#00897b',
        negative: '#e84a3c',
        neutral: '#899a96',
      },
      overflow: '#899a96',
    },
    accent: '#e84a3c',
  },
  type: {
    minSize: 9,
    headline: { weight: 'bold', color: '#16302b' },
    deck: { color: '#536561' },
    valueLabel: { weight: 'semibold' },
  },
  structure: {
    grid: {
      measure: 'quiet',
      category: 'omit',
      style: 'solid',
      weight: 0.8,
    },
    baseline: 'full',
    frame: 'omit',
  },
  marks: {
    bandFraction: 0.74,
    strokeWeight: 2.4,
    strokeCap: 'round',
    strokeJoin: 'round',
    interpolation: 'monotone',
    fillOpacity: 0.9,
    cornerRadius: 4,
    separator: { presence: 'quiet', width: 1, source: 'surface' },
    slice: { gap: 1.5, gapStyle: 'rule' },
  },
  layout: { density: 'normal' },
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
  labels: { truncation: 'wrap', flush: true, angle: 'auto' },
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

const DEMO_THEMES = [
  { theme: STARTER_THEME, colors: ['#00897b', '#e84a3c', '#f2b134'] },
  { theme: MICROSOFT_FLUENT_THEME, colors: ['#0078d4', '#c43e1c', '#4f7b00'] },
  { theme: PEOPLES_DAILY_THEME, colors: ['#9e1b16', '#1f4e79', '#6b5b2a'] },
] as const;

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
  const compiled = useMemo(() => {
    try {
      return { ok: true as const, value: BACKENDS.vegalite.assemble(buildInput(previewCase, title, theme)) };
    } catch (error) {
      return { ok: false as const, error };
    }
  }, [previewCase, theme, title]);

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
        {compiled.ok ? (
          <VegaLiteView spec={compiled.value} />
        ) : (
          <pre className="theme-lab-error">{String((compiled.error as Error)?.message ?? compiled.error)}</pre>
        )}
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
  const [customTheme, setCustomTheme] = useState<ThemeSpec>(STARTER_THEME);
  const [themeDraft, setThemeDraft] = useState(() => JSON.stringify(STARTER_THEME, null, 2));
  const [activeDemoId, setActiveDemoId] = useState(STARTER_THEME.id);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const cases = useMemo(
    () => IDS.map((id) => CASE_BY_ID.get(id)).filter((previewCase): previewCase is PreviewCase => Boolean(previewCase)),
    [],
  );
  const formattedThemeDraft = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(themeDraft), null, 2);
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

  const applyDemoTheme = (theme: ThemeSpec) => {
    const nextDraft = JSON.stringify(theme, null, 2);
    setCustomTheme(theme);
    setThemeDraft(nextDraft);
    setThemeError(null);
    setActiveDemoId(theme.id);
  };

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
            <div className="theme-lab-title-row">
              <h1>
                <span className="theme-lab-title-icon"><LabIcon size={25} /></span>
                {t('themeLab.title')}
              </h1>
            </div>
            <div>
              <p className="theme-lab-lead">{t('themeLab.lead')}</p>
              <ol className="theme-lab-steps">
                <li>{t('themeLab.steps.generate')}</li>
                <li>{t('themeLab.steps.preview')}</li>
                <li>
                  {t('themeLab.steps.shareReady')}{' '}
                  <a className="theme-lab-share-link" href={SHARE_URL} target="_blank" rel="noreferrer">
                    <GitHubIcon size={15} />
                    {t('themeLab.steps.shareLink')}
                  </a>{t('themeLab.steps.shareSuffix')}
                </li>
              </ol>
              <p className="theme-lab-docs-pointer">
                <Trans
                  i18nKey="themeLab.docsPointer"
                  components={{
                    docsLink: <LocaleLink className="site-text-link" to="/documentation/theme-spec" />,
                  }}
                />
              </p>
            </div>
            <div className="theme-lab-prompt-column">
              <div className="theme-lab-prompt-block">
                <button type="button" onClick={copyStarterPrompt}>
                  <span aria-hidden="true">{promptCopied ? '✓' : '⧉'}</span>
                  {promptCopied ? t('themeLab.copied') : t('themeLab.copyPrompt')}
                </button>
                <pre>{t('themeLab.prompt')}</pre>
              </div>
            </div>
          </header>

          <div className="theme-lab-demo-bar" aria-label={t('themeLab.demoAria')}>
            <span>{t('themeLab.inspiration')}</span>
            <div className="theme-lab-demo-options">
              {DEMO_THEMES.map(({ theme, colors }) => (
                <button
                  key={theme.id}
                  type="button"
                  aria-pressed={activeDemoId === theme.id}
                  onClick={() => applyDemoTheme(theme)}
                >
                  <span className="theme-lab-demo-swatches" aria-hidden="true">
                    {colors.map((color) => <i key={color} style={{ background: color }} />)}
                  </span>
                  {t(`themeLab.demos.${theme.id}`, theme.label ?? theme.id ?? '')}
                </button>
              ))}
            </div>
          </div>

          <div className="theme-lab-workspace">
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
      {openCase && <ThemeChartModal previewCase={openCase} theme={customTheme} onClose={() => setOpenCase(null)} />}
    </SiteShell>
  );
}

const styles = `
  .theme-lab-page { flex: 1; min-height: 0; overflow-y: auto; background-color: ${siteTheme.surface}; background-image: linear-gradient(90deg, ${siteTheme.grid} 1px, transparent 1px), linear-gradient(0deg, ${siteTheme.grid} 1px, transparent 1px); background-size: 24px 24px; }
  .theme-lab-inner { max-width: 1500px; margin: 0 auto; padding: 36px 40px 96px; }
  .theme-lab-intro { display: grid; grid-template-columns: minmax(280px, 0.8fr) minmax(0, 1.45fr); column-gap: 72px; row-gap: 16px; max-width: 1180px; margin: 0 auto 28px; align-items: start; }
  .theme-lab-title-row { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .theme-lab-title-row h1 { display: flex; align-items: center; gap: 9px; margin: 0; font-size: 28px; line-height: 1.2; font-weight: 700; letter-spacing: -0.02em; }
  .theme-lab-title-icon { display: inline-flex; color: ${siteTheme.textMuted}; }
  .theme-lab-lead { margin: 0; color: ${siteTheme.text}; font-size: 15px; line-height: 1.65; }
  .theme-lab-steps { margin: 12px 0 0; padding: 0 0 0 24px; color: ${siteTheme.text}; font-size: 15px; line-height: 1.65; }
  .theme-lab-steps li { margin-bottom: 4px; }
  .theme-lab-steps a { color: ${siteTheme.accent}; text-decoration: none; }
  .theme-lab-steps a:hover { text-decoration: underline; }
  .theme-lab-share-link { display: inline-flex; align-items: center; gap: 5px; }
  .theme-lab-docs-pointer { margin: 8px 0 0; color: ${siteTheme.text}; font-size: 15px; line-height: 1.65; }
  .theme-lab-prompt-block { position: relative; overflow: hidden; margin: 0 0 8px; border: 1px solid ${siteTheme.border}; border-radius: 8px; background: ${siteTheme.surface}; }
  .theme-lab-prompt-block button { position: absolute; top: 8px; right: 8px; display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border: 0; border-radius: 6px; background: rgba(0, 0, 0, 0.06); color: ${siteTheme.text}; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .theme-lab-prompt-block button:hover { background: ${siteTheme.text}; color: ${siteTheme.surface}; }
  .theme-lab-prompt-block button span { font-size: 13px; line-height: 1; }
  .theme-lab-prompt-block pre { max-height: 220px; margin: 0; padding: 14px 16px; padding-right: 128px; overflow: auto; color: ${siteTheme.text}; font-family: ${siteTheme.fontMono}; font-size: 13px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
  .theme-lab-demo-bar { display: flex; align-items: center; gap: 10px; min-height: 34px; max-width: 1180px; margin: 0 auto 12px; }
  .theme-lab-demo-bar > span { flex: 0 0 auto; color: ${siteTheme.textMuted}; font-size: 12.5px; }
  .theme-lab-demo-options { display: flex; align-items: center; gap: 4px; min-width: 0; overflow-x: auto; padding: 4px; border-radius: 8px; background: rgba(0, 0, 0, 0.05); }
  .theme-lab-demo-options button { height: 28px; display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; padding: 0 9px; border: 0; border-radius: 6px; background: transparent; color: ${siteTheme.textMuted}; font: inherit; font-size: 12.5px; cursor: pointer; }
  .theme-lab-demo-options button:hover { color: ${siteTheme.text}; }
  .theme-lab-demo-options button[aria-pressed="true"] { background: ${siteTheme.surface}; box-shadow: 0 1px 2px rgba(31, 35, 40, 0.16); color: ${siteTheme.text}; font-weight: 600; }
  .theme-lab-demo-options button:focus-visible { outline: 2px solid ${siteTheme.accent}; outline-offset: 1px; }
  .theme-lab-demo-swatches { display: inline-flex; overflow: hidden; width: 21px; height: 9px; border-radius: 1px; }
  .theme-lab-demo-swatches i { flex: 1; min-width: 0; }
  .theme-lab-workspace { display: grid; grid-template-columns: minmax(390px, 0.42fr) minmax(0, 0.58fr); gap: 16px; max-width: 1180px; margin: 0 auto; align-items: start; }
  .theme-lab-panel { position: sticky; top: 0; height: min(740px, calc(100vh - 48px)); min-height: 600px; display: flex; flex-direction: column; overflow: hidden; border: 1px solid ${siteTheme.border}; border-radius: 6px; background: ${siteTheme.surface}; box-shadow: 0 1px 2px rgba(31, 35, 40, 0.06); }
  .theme-lab-editor { flex: 1; min-height: 0; overflow: hidden; }
  .theme-lab-editor > div, .theme-lab-editor .cm-editor { height: 100%; min-height: 0; }
  .theme-lab-editor .cm-scroller { overflow: auto; }
  .theme-lab-format-button { position: absolute; top: 8px; right: 12px; z-index: 5; padding: 5px 9px; border: 0; border-radius: 6px; background: rgba(0, 0, 0, 0.06); color: ${siteTheme.text}; font: inherit; font-size: 12px; font-weight: 600; line-height: 1.25; cursor: pointer; }
  .theme-lab-format-button:hover, .theme-lab-format-button:focus-visible { background: ${siteTheme.text}; color: ${siteTheme.surface}; outline: none; }
  .theme-lab-format-button:disabled { opacity: 0.45; cursor: default; }
  .theme-lab-format-button:disabled:hover { background: rgba(0, 0, 0, 0.06); color: ${siteTheme.text}; }
  .theme-lab-status { min-height: 32px; display: flex; align-items: center; padding: 7px 12px; border-top: 1px solid ${siteTheme.border}; color: #0b6a0b; font-size: 11.5px; line-height: 1.35; }
  .theme-lab-status--error { color: ${siteTheme.error}; }
  .theme-lab-wall { display: grid; grid-template-columns: repeat(3, minmax(0, 220px)); justify-content: start; gap: 5px; align-self: start; padding: 4px 8px 38px; overflow: visible; }
  .theme-lab-tile { --scatter-x: 0px; --scatter-y: 0px; --scatter-r: 0deg; position: relative; align-self: start; z-index: 1; min-width: 0; margin: -3px -4px -28px; padding: 10px 10px 15px; border: 1px solid rgba(0, 0, 0, 0.14); border-radius: 2px; background: #fff; box-shadow: 0 3px 9px rgba(31, 35, 40, 0.15), 0 12px 24px rgba(31, 35, 40, 0.07); transform: translate3d(var(--scatter-x), var(--scatter-y), 0) rotate(var(--scatter-r)); transform-origin: 50% 50%; cursor: zoom-in; }
  .theme-lab-tile:hover, .theme-lab-tile:focus-visible { z-index: 20; box-shadow: 0 8px 18px rgba(31, 35, 40, 0.2), 0 18px 34px rgba(31, 35, 40, 0.1); transform: translate3d(var(--scatter-x), calc(var(--scatter-y) - 7px), 0) rotate(0deg); }
  .theme-lab-tile:focus-visible { outline: 2px solid ${siteTheme.accent}; outline-offset: 2px; }
  .theme-lab-tile:nth-child(6n + 1) { --scatter-x: 7px; --scatter-y: 5px; --scatter-r: -2.1deg; }
  .theme-lab-tile:nth-child(6n + 2) { --scatter-x: -4px; --scatter-y: -7px; --scatter-r: 1.4deg; }
  .theme-lab-tile:nth-child(6n + 3) { --scatter-x: 5px; --scatter-y: 9px; --scatter-r: -0.8deg; }
  .theme-lab-tile:nth-child(6n + 4) { --scatter-x: -8px; --scatter-y: 1px; --scatter-r: 2.3deg; }
  .theme-lab-tile:nth-child(6n + 5) { --scatter-x: 3px; --scatter-y: -5px; --scatter-r: -1.5deg; }
  .theme-lab-tile:nth-child(6n) { --scatter-x: -6px; --scatter-y: 8px; --scatter-r: 1deg; }
  .theme-lab-tile-caption { margin-top: 2px; min-height: 28px; overflow: hidden; color: ${siteTheme.textMuted}; display: -webkit-box; font-size: 11.5px; line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .theme-lab-error { margin: 0; color: ${siteTheme.error}; font-size: 11px; white-space: pre-wrap; }
  @media (max-width: 1120px) { .theme-lab-workspace { grid-template-columns: minmax(0, 1fr); } .theme-lab-panel { position: relative; top: auto; height: 620px; } .theme-lab-wall { grid-template-columns: repeat(4, minmax(0, 220px)); } }
  @media (max-width: 840px) { .theme-lab-intro { grid-template-columns: minmax(0, 1fr); gap: 26px; } .theme-lab-title-row { align-items: flex-start; } }
  @media (max-width: 940px) { .theme-lab-wall { grid-template-columns: repeat(3, minmax(0, 220px)); } }
  @media (max-width: 700px) { .theme-lab-inner { padding: 28px 20px 72px; } .theme-lab-demo-bar { align-items: flex-start; flex-direction: column; gap: 4px; } .theme-lab-demo-options { width: 100%; } .theme-lab-wall { grid-template-columns: repeat(2, minmax(0, 220px)); padding: 22px 8px 30px; } .theme-lab-tile { margin: -1px -2px -16px; } }
  @media (max-width: 420px) { .theme-lab-wall { grid-template-columns: minmax(0, 220px); } }
`;