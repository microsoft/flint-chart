// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Themes — one house, eighteen charts, all on screen at once.
 *
 * The gallery answers "what can Flint draw?". This page answers a different
 * question — "what does a *house* feel like?" — and answers it the only way
 * that question can be answered, by putting enough different marks side by
 * side that the styling is the only thing they have in common.
 *
 * So the selection is the whole design. Eighteen cases in a wall, no two of
 * them the same chart type, spread across families: something continuous,
 * something categorical, something ranked, something part-to-whole, something
 * with a legend, something with a matrix of cells. A house that only knows how
 * to style a bar chart has nowhere to hide on a wall like this, and one that
 * holds together across all of them is telling you it is a real house.
 *
 * The tiles are uniform and the charts are shrunk to fit rather than
 * re-laid-out. An earlier version packed them at their natural sizes to
 * squeeze the gaps out, which bought density at the cost of cropping legends
 * and hiding charts below the fold. A tile that shows the whole chart is worth
 * more here than a wall with no seams.
 */

import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, FlaskConical } from 'lucide-react';
import { THEME_PRESETS, DEFAULT_THEME_ICON } from 'flint-chart';
import { LocaleLink } from '../i18n/LocaleLink';
import { FlintView } from '../components/FlintView';
import { ScaleToFit } from '../components/ScaleToFit';
import { SiteShell } from '../components/SiteShell';
import { ThemeChartModal } from '../components/ThemeChartModal';
import { siteTheme } from '../shared/theme';
import { PREVIEW_CASES, type PreviewCase } from '../shared/preview-cases';

/**
 * The selection groups similarly sized previews, from taller charts to shorter
 * ones, so grid rows waste less vertical space. The order stays stable across
 * themes to make comparisons easy.
 *
 * Every one is a Vega-Lite case on purpose. The other backends ignore
 * `theme_spec`, and a tile that refused to change with the switch would say
 * something false about the house.
 *
 * One per chart type, chosen so the set covers the mark vocabulary and so no
 * two tiles retell the same dataset. Box, violin and strip plots are absent on
 * purpose: their aspect is set by the number of categories on the discrete
 * axis, and the real datasets behind them only have three groups, which leaves
 * them far too tall or far too wide for a uniform tile.
 */
const IDS = [
  'browser-pie', 'population-waterfall', 'gapminder-bubble', 'nutrition-radar', 'seattle-range',
  'co2-lollipop', 'driving', 'keeling', 'big-mac', 'faithful-hist',
  'olympic-bump', 'life-expectancy', 'earnings-education', 'electricity-mix-area', 'trust-likert',
  'temp-heatmap', 'lifeexp-dumbbell', 'us-pyramid',
];

const CASE_BY_ID = new Map(PREVIEW_CASES.map((c) => [c.id, c]));

/** HTML caption metrics: blurb row 2 + 10.5×1.35×2. */
const BLURB_H = 30;
const CHART_H = 190;

type ThemeChoice = { id: string | undefined; label: string; icon: string };

const iconUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/**
 * The headline goes through the theme; the description stays in HTML.
 *
 * `chart_spec.title` is not decoration to the compiler. A house whose
 * `axisTitles` policy is `omit` is leaning on the headline to name the
 * measure, and a chart authored without one gets its axis titles put back
 * (core/theme/ground.ts — "omit is a delegation, not a deletion"). Measured
 * across this wall, giving the charts a headline drops a further 11–19 axis
 * titles under nyt, economist, datawrapper, mckinsey and powerbi — so a wall
 * with the titles in HTML would be showing six of the nine houses in a mode
 * they were not designed for.
 *
 * The deck is the loose part, and it stays out. Measured, a headline alone
 * costs +30px of chart height; a headline with its deck costs +47px, because
 * the deck is a full sentence that wraps inside the canvas and then takes the
 * house's title-block gap on top. Splitting them buys the same axis-title
 * delegation (37 titles dropped either way, across all five `omit` houses) for
 * 17px less chart height, and still leaves a description under every tile.
 */
function buildInput(
  c: PreviewCase,
  title: string,
  theme: string | undefined,
  baseSize = { width: 300, height: 200 },
) {
  return {
    data: { values: c.data },
    semantic_types: c.semantic_types,
    chart_spec: {
      chartType: c.chartType,
      encodings: c.encodings,
      baseSize,
      title,
      ...(c.chartProperties ? { chartProperties: c.chartProperties } : {}),
    },
    ...(theme ? { theme_spec: theme } : {}),
  } as any;
}

function Tile({
  c,
  theme,
  onOpen,
}: {
  c: PreviewCase;
  theme: string | undefined;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  // Wall-specific captions, because a tile is not a gallery entry. A case's own
  // title has to stand alone on the gallery page, so it carries the subject,
  // the units and the date range at once — "Keeling Curve — atmospheric CO₂ at
  // Mauna Loa (annual mean)". In a tile this narrow that wraps to two lines,
  // and two-line titles are the thing that makes a wall look untidy: the
  // captions stop being a quiet baseline under the charts and start competing
  // with them, which is backwards on a page whose whole subject is what the
  // charts look like. So each tile gets a short title, and the units and dates
  // move down into the blurb, which had room.
  const title = t(`themes.cases.${c.id}.title`, c.title);
  const blurb = t(`themes.cases.${c.id}.blurb`, c.blurb);

  const input = useMemo(() => buildInput(c, title, theme), [c, title, theme]);

  return (
    <article
      className="themes-tile"
      data-preview-id={c.id}
      title={`${c.title}\n${c.blurb}\n${c.source} · ${c.license} · ${c.data.length} rows`}
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
      style={{ padding: 8, borderRadius: 4, minWidth: 0, transition: 'background 120ms ease', cursor: 'zoom-in' }}
    >
      <ScaleToFit height={CHART_H} minHeight={110} adaptiveHeight padding={2}>
        <FlintView spec={input} renderer="svg" compact />
      </ScaleToFit>
      {/* Measured to fit in at most two lines, and reserving its height so the
          tiles stay on a common baseline. The clamp is a backstop for a font
          fallback or a very narrow column, not the expected case. */}
      <div
        style={{
          marginTop: 2,
          fontSize: 10.5,
          lineHeight: 1.35,
          color: siteTheme.navInactive,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          minHeight: `${BLURB_H - 2}px`,
        }}
      >
        {blurb}
      </div>
    </article>
  );
}

/**
 * The house switch, named rather than icon-only.
 *
 * On the playground this control carried no words, because a developer already
 * knows the houses and the wall wanted the space. Here the names *are* the
 * point: a reader who has never heard of Flint cannot switch to "the
 * Economist's house" from a pictogram, and the whole page is an invitation to
 * compare houses by name.
 */
function ThemeBar({
  themeId,
  onTheme,
  choices,
}: {
  themeId: string | undefined;
  onTheme: (id: string | undefined) => void;
  choices: ThemeChoice[];
}) {
  const { t } = useTranslation();
  return (
    <div
      role="radiogroup"
      aria-label={t('themes.switchAria')}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        padding: 4,
        borderRadius: 8,
        background: 'rgba(0, 0, 0, 0.05)',
      }}
    >
      {choices.map((choice) => {
        const selected = choice.id === themeId;
        return (
          <button
            key={choice.id ?? 'flint'}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onTheme(choice.id)}
            style={{
              height: 30,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 10px',
              cursor: 'pointer',
              fontSize: 12.5,
              fontWeight: selected ? 600 : 400,
              borderRadius: 6,
              border: 0,
              // The tray holds the containment, so the chip lifts with a fill
              // and a shadow rather than a second border inside the first.
              background: selected ? siteTheme.surface : 'transparent',
              boxShadow: selected ? '0 1px 2px rgba(31, 35, 40, 0.16)' : undefined,
              color: selected ? siteTheme.text : siteTheme.textMuted,
              whiteSpace: 'nowrap',
            }}
          >
            <img
              src={iconUrl(choice.icon)}
              alt=""
              style={{ width: 15, height: 15, display: 'block', opacity: selected ? 1 : 0.85 }}
            />
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}

export function Themes() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [openCase, setOpenCase] = useState<PreviewCase | null>(null);
  const requestedTheme = searchParams.get('theme') ?? undefined;
  const themeId = requestedTheme && THEME_PRESETS[requestedTheme] ? requestedTheme : undefined;
  const setThemeId = (id: string | undefined) => {
    const next = new URLSearchParams(searchParams);
    next.delete('layout');
    if (id) next.set('theme', id);
    else next.delete('theme');
    setSearchParams(next, { replace: true });
  };

  // "Flint default" is a choice in the row rather than an empty slot, because
  // not theming is the baseline every house is read against.
  const choices = useMemo<ThemeChoice[]>(
    () => [
      {
        id: undefined,
        label: t('themes.flintDefault'),
        icon: DEFAULT_THEME_ICON,
      },
      ...Object.values(THEME_PRESETS).map((p) => ({
        id: p.id,
        label: p.label,
        icon: p.icon,
      })),
    ],
    [t],
  );

  const cases = useMemo(
    () => IDS.map((id) => CASE_BY_ID.get(id)).filter((c): c is PreviewCase => Boolean(c)),
    [],
  );

  return (
    <SiteShell>
      <style>{wallStyles}</style>
      <div
        className="themes-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          backgroundColor: siteTheme.surface,
          backgroundImage: `
            linear-gradient(90deg, ${siteTheme.grid} 1px, transparent 1px),
            linear-gradient(0deg, ${siteTheme.grid} 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px',
        }}
      >
        <article className="themes-article">
          <header className="themes-intro">
            <div className="themes-title-row">
              <h1>
                {t('themes.title')}
              </h1>
            </div>
            <div className="themes-prose">
              <p>
                {t('themes.concept')}
              </p>
              <div className="themes-actions">
                <LocaleLink className="themes-cta" to="/documentation/theme-spec">
                  <BookOpen className="themes-cta-icon" size={18} aria-hidden="true" />
                  <span>{t('themes.docsPointer')}</span>
                </LocaleLink>
                <LocaleLink className="themes-cta" to="/theme-lab">
                  <FlaskConical className="themes-cta-icon" size={18} aria-hidden="true" />
                  <span>{t('themes.themeLabCta')}</span>
                </LocaleLink>
              </div>
            </div>
          </header>

          <div className="themes-preview">
            <div
              className="themes-selector"
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 2,
                padding: '12px 0',
                background: siteTheme.surface,
              }}
            >
              <div>
                <div className="themes-controls-row">
                  <ThemeBar
                    themeId={themeId}
                    onTheme={setThemeId}
                    choices={choices}
                  />
                </div>
              </div>
            </div>

            <div className="themes-wall">
              {cases.map((c) => (
                <Tile key={c.id} c={c} theme={themeId} onOpen={() => setOpenCase(c)} />
              ))}
            </div>
          </div>
          <section className="themes-how" aria-labelledby="themes-how-title">
            <h2 id="themes-how-title">{t('themes.howItWorks.title')}</h2>
            <p>
              <Trans i18nKey="themes.howItWorks.intro" components={{ code: <code /> }} />
            </p>
            <div className="themes-principles">
              {(['layout', 'semantics', 'identity'] as const).map((principle) => (
                <div className="themes-principle" key={principle}>
                  <strong>{t(`themes.principles.${principle}.title`)}</strong>
                  <span>
                    <Trans i18nKey={`themes.principles.${principle}.body`} components={{ code: <code /> }} />
                  </span>
                </div>
              ))}
            </div>
            <p>{t('themes.howItWorks.compiler')}</p>
            <h3>{t('themes.howItWorks.applyTitle')}</h3>
            <p>
              <Trans i18nKey="themes.howItWorks.apply" components={{ code: <code /> }} />
            </p>
            <pre className="themes-code"><code>{JSON.stringify({
              theme_spec: 'economist',
            }, null, 2)}</code></pre>
            <p>
              <Trans i18nKey="themes.howItWorks.mcpReuse" components={{ code: <code /> }} />
            </p>
            <p className="themes-availability">{t('themes.howItWorks.availability')}</p>
            <h3>{t('themes.howItWorks.customizeTitle')}</h3>
            <p>
              <Trans
                i18nKey="themes.howItWorks.customize"
                components={{
                  docs: <LocaleLink className="site-text-link" to="/documentation/theme-spec" />,
                  lab: <LocaleLink className="site-text-link" to="/theme-lab" />,
                }}
              />
            </p>
          </section>
        </article>
      </div>
      {openCase && <ThemeChartModal previewCase={openCase} theme={themeId} onClose={() => setOpenCase(null)} />}
    </SiteShell>
  );
}

const wallStyles = `
  .themes-article {
    width: 100%;
    max-width: 1008px;
    margin: 0 auto;
    padding: 62px 24px 72px;
    box-sizing: border-box;
  }
  .themes-intro, .themes-preview, .themes-selector, .themes-wall, .themes-how {
    width: 100%;
    max-width: 832px;
    min-width: 0;
    margin: 0 auto;
  }
  .themes-title-row h1 {
    margin: 0 0 34px;
    font-size: 36px;
    line-height: 1.2;
    font-weight: 700;
    letter-spacing: 0;
  }
  .themes-prose { font-size: 16.5px; line-height: 1.65; color: ${siteTheme.text}; }
  .themes-prose p { margin: 0 0 20px; }
  .themes-intro { margin-bottom: 24px; }
  .themes-how {
    margin-top: 40px;
    padding-top: 28px;
    border-top: 1px solid ${siteTheme.border};
    font-size: 16px;
    line-height: 1.75;
    color: ${siteTheme.text};
  }
  .themes-how h2 { margin: 0 0 20px; font-size: 22px; line-height: 1.35; }
  .themes-how h3 { margin: 28px 0 14px; font-size: 18px; line-height: 1.4; }
  .themes-how p { margin: 0 0 20px; }
  .themes-code {
    margin: 0 0 16px;
    padding: 16px;
    background: ${siteTheme.hover};
    border: 1px solid ${siteTheme.border};
    border-radius: 4px;
    font-size: 12px;
    line-height: 1.6;
    overflow-x: auto;
  }
  .themes-principles { margin: 20px 0 24px; border-top: 1px solid ${siteTheme.border}; }
  .themes-principle {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 22px;
    padding: 15px 0;
    border-bottom: 1px solid ${siteTheme.border};
    font-size: 14px;
    line-height: 1.65;
  }
  .themes-principle span { color: ${siteTheme.textMuted}; }
  .themes-how .themes-availability { font-size: 13px; color: ${siteTheme.textMuted}; }
  .themes-wall {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 12px;
    box-sizing: border-box;
  }
  .themes-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 24px;
  }
  .themes-cta {
    width: fit-content;
    max-width: 100%;
    box-sizing: border-box;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 11px 18px;
    border: 1px solid rgba(0, 0, 0, 0.24);
    border-radius: ${siteTheme.radius}px;
    background: ${siteTheme.surface};
    color: ${siteTheme.text};
    font-size: 14.5px;
    font-weight: 600;
    line-height: 1.2;
    text-decoration: none;
    transition: background 0.12s ease, border-color 0.12s ease, transform 0.12s ease;
  }
  .themes-cta-icon {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .themes-cta:hover,
  .themes-cta:focus-visible {
    background: ${siteTheme.hover};
    border-color: rgba(0, 0, 0, 0.42);
    transform: translateY(-1px);
  }
  .themes-cta:focus-visible {
    outline: 2px solid ${siteTheme.accent};
    outline-offset: 2px;
  }
  .themes-controls-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .themes-tile:hover { background: ${siteTheme.hover}; }
  .themes-wall [role="button"]:focus-visible {
    outline: 2px solid ${siteTheme.accent};
    outline-offset: 2px;
  }
  @media (max-width: 520px)  {
    .themes-principle { grid-template-columns: minmax(0, 1fr) !important; gap: 4px !important; }
  }
  @media (max-width: 1000px) {
    .themes-wall { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
  @media (max-width: 900px) {
    .themes-wall { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (max-width: 700px)  {
    .themes-wall { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  }
  @media (max-width: 490px)  {
    .themes-wall { grid-template-columns: minmax(0, 1fr) !important; }
  }
`;
