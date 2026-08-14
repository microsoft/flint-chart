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
import { THEME_PRESETS, DEFAULT_THEME_ICON } from 'flint-chart';
import { LocaleLink } from '../i18n/LocaleLink';
import { BACKENDS } from '../shared/supported-backends';
import { VegaLiteView } from '../components/VegaLiteView';
import { ScaleToFit } from '../components/ScaleToFit';
import { SiteShell } from '../components/SiteShell';
import { ThemeChartModal } from '../components/ThemeChartModal';
import { siteTheme } from '../shared/theme';
import { PREVIEW_CASES, type PreviewCase } from '../shared/preview-cases';

/**
 * The selection, in the order it reads best: line, connected scatter, band,
 * matrix, wedge, stem, slope, dumbbell, ribbon, bar, rank, radar, histogram,
 * diverging bar, bridge, pyramid, bubble and grouped bar.
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
  'keeling', 'driving', 'seattle-range', 'temp-heatmap', 'browser-pie', 'co2-lollipop',
  'life-expectancy', 'lifeexp-dumbbell', 'electricity-mix-area', 'big-mac', 'olympic-bump', 'nutrition-radar',
  'faithful-hist', 'trust-likert', 'population-waterfall', 'us-pyramid', 'gapminder-bubble', 'earnings-education',
];

const CASE_BY_ID = new Map(PREVIEW_CASES.map((c) => [c.id, c]));

/** HTML caption metrics: blurb row 2 + 10.5×1.35×2. */
const BLURB_H = 30;
const CHART_H = 190;

type ThemeChoice = { id: string | undefined; label: string; icon: string; description: string };
type WallLayout = 'grid' | 'scatter';

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

  const compiled = useMemo(() => {
    try {
      return { ok: true as const, value: BACKENDS.vegalite.assemble(buildInput(c, title, theme)) };
    } catch (err) {
      return { ok: false as const, err };
    }
  }, [c, title, theme]);

  return (
    <article
      className="themes-tile"
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
      style={{ padding: 8, borderRadius: 10, minWidth: 0, transition: 'background 120ms ease', cursor: 'zoom-in' }}
    >
      <ScaleToFit height={CHART_H} minHeight={110} adaptiveHeight padding={2}>
        {compiled.ok ? (
          <VegaLiteView spec={compiled.value} renderer="svg" />
        ) : (
          <pre style={{ color: siteTheme.error, fontSize: 11, whiteSpace: 'pre-wrap', margin: 0 }}>
            {String((compiled.err as Error)?.message ?? compiled.err)}
          </pre>
        )}
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

function LayoutToggle({ layout, onLayout }: { layout: WallLayout; onLayout: (layout: WallLayout) => void }) {
  return (
    <div className="themes-layout-toggle" role="radiogroup" aria-label="Chart wall layout">
      {(['grid', 'scatter'] as const).map((choice) => {
        const selected = choice === layout;
        const label = choice === 'grid' ? 'Grid' : 'Scatter';
        return (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onLayout(choice)}
            title={`Show charts in a ${choice} layout`}
            style={{
              height: 30,
              padding: '0 11px',
              border: 0,
              borderRadius: 6,
              background: selected ? siteTheme.surface : 'transparent',
              boxShadow: selected ? '0 1px 2px rgba(31, 35, 40, 0.16)' : undefined,
              color: selected ? siteTheme.text : siteTheme.textMuted,
              fontSize: 12.5,
              fontWeight: selected ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {label}
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
  const layout: WallLayout = searchParams.get('layout') === 'grid' ? 'grid' : 'scatter';
  const setThemeId = (id: string | undefined) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('theme', id);
    else next.delete('theme');
    setSearchParams(next, { replace: true });
  };
  const setLayout = (nextLayout: WallLayout) => {
    const next = new URLSearchParams(searchParams);
    if (nextLayout === 'grid') next.set('layout', 'grid');
    else next.delete('layout');
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
        description: t('themes.descriptions.default'),
      },
      ...Object.values(THEME_PRESETS).map((p) => ({
        id: p.id,
        label: p.label,
        icon: p.icon,
        description: t(`themes.descriptions.${p.id}`),
      })),
    ],
    [t],
  );
  const selectedTheme = choices.find((choice) => choice.id === themeId) ?? choices[0];

  const cases = useMemo(
    () => IDS.map((id) => CASE_BY_ID.get(id)).filter((c): c is PreviewCase => Boolean(c)),
    [],
  );

  return (
    <SiteShell>
      <style>{wallStyles}</style>
      <div
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
        {/* Wider than the site's 1180px text column on purpose. Eighteen tiles
            only read as a 6×3 wall if six of them fit a row at a size where the
            charts are still legible; at 1180 the tiles come out 159px and the
            marks stop being readable. Prose stays capped at 720. */}
        <div style={{ maxWidth: 1500, margin: '0 auto', padding: '36px 40px 96px' }}>
          <header
            className="themes-intro"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(280px, 0.8fr) minmax(0, 1.45fr)',
              columnGap: 72,
              rowGap: 16,
              maxWidth: 1180,
              margin: '0 auto 20px',
              alignItems: 'start',
            }}
          >
            <div className="themes-title-row" style={{ gridColumn: '1 / -1' }}>
              <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.02em' }}>
                {t('themes.title')}
              </h1>
              <LayoutToggle layout={layout} onLayout={setLayout} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: siteTheme.text }}>
                {t('themes.concept')}
              </p>
              <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.65, color: siteTheme.text }}>
                {t('themes.generalization')}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.65, color: siteTheme.text }}>
                <Trans
                  i18nKey="themes.docsPointer"
                  components={{
                    docs: <LocaleLink className="site-text-link" to="/documentation/theme-spec" />,
                  }}
                />
              </p>
              <LocaleLink className="themes-lab-cta" to="/theme-lab">
                <svg className="themes-lab-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 3h6M10 3v6.2l-5.4 8.3A2.3 2.3 0 0 0 6.5 21h11a2.3 2.3 0 0 0 1.9-3.5L14 9.2V3M7.8 15h8.4" />
                </svg>
                <Trans
                  i18nKey="themes.themeLabCta"
                  components={{ lab: <strong /> }}
                />
              </LocaleLink>
            </div>
            <div
              className="themes-principles"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr)',
                borderTop: `1px solid ${siteTheme.border}`,
              }}
            >
              {(['layout', 'semantics', 'identity'] as const).map((principle) => (
                <div
                  className="themes-principle"
                  key={principle}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '150px minmax(0, 1fr)',
                    gap: 22,
                    padding: '15px 0',
                    borderBottom: `1px solid ${siteTheme.border}`,
                  }}
                >
                  <strong style={{ fontSize: 13.5, lineHeight: 1.5, color: siteTheme.text }}>
                    {t(`themes.principles.${principle}.title`)}
                  </strong>
                  <span style={{ fontSize: 13, lineHeight: 1.55, color: siteTheme.textMuted }}>
                    {t(`themes.principles.${principle}.body`)}
                  </span>
                </div>
              ))}
            </div>
          </header>

          {/* Sticky, because the whole page is a before-and-after: the reader
              scrolls to a chart that interests them, then switches houses to
              watch that chart change. A switch that scrolled away would force
              them back to the top for every comparison. */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              padding: '12px 0',
              background: siteTheme.surface,
            }}
          >
            <div style={{ maxWidth: 1180, margin: '0 auto' }}>
              <div className="themes-controls-row">
                <ThemeBar
                  themeId={themeId}
                  onTheme={setThemeId}
                  choices={choices}
                />
              </div>
              <p style={{ margin: '10px 0 0', maxWidth: 820, fontSize: 13.5, lineHeight: 1.55, color: siteTheme.text }}>
                <strong>{selectedTheme.label}.</strong>{' '}
                <span style={{ color: siteTheme.textMuted }}>{selectedTheme.description}</span>
              </p>
            </div>
          </div>

          <div
            className={`themes-wall themes-wall--${layout}`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
              gap: 10,
              maxWidth: 1180,
              margin: '0 auto',
            }}
          >
            {cases.map((c) => (
              <Tile key={c.id} c={c} theme={themeId} onOpen={() => setOpenCase(c)} />
            ))}
          </div>
        </div>
      </div>
      {openCase && <ThemeChartModal previewCase={openCase} theme={themeId} onClose={() => setOpenCase(null)} />}
    </SiteShell>
  );
}

/**
 * Six columns, fixed.
 *
 * The wall is a grid of eighteen and reads as 6×3 — three rows the eye can
 * take in without scrolling far, which is what makes it a *wall* rather than a
 * list. An auto-fill track would let the column count drift with the viewport,
 * and at seven or five columns the last row goes ragged and the shape stops
 * being legible. So the count is fixed, and steps down only where a tile would
 * otherwise fall below ~200px and take its chart with it. Each breakpoint is
 * that threshold solved for the column count, given 40px page padding and 10px
 * gaps.
 */
const wallStyles = `
  .themes-lab-cta {
    width: fit-content;
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 14px;
    padding: 8px 12px;
    border: 1px solid ${siteTheme.text};
    border-radius: 6px;
    background: ${siteTheme.surface};
    color: ${siteTheme.text};
    font-size: 15px;
    font-weight: 500;
    line-height: 1.4;
    text-decoration: none;
    transition: background 120ms ease, color 120ms ease;
  }
  .themes-lab-icon {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .themes-lab-cta strong {
    font-weight: 700;
    white-space: nowrap;
  }
  .themes-lab-cta:hover,
  .themes-lab-cta:focus-visible {
    background: ${siteTheme.text};
    color: ${siteTheme.surface};
  }
  .themes-lab-cta:focus-visible {
    outline: 2px solid ${siteTheme.text};
    outline-offset: 2px;
  }
  .themes-controls-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .themes-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }
  .themes-layout-toggle {
    display: flex;
    flex: 0 0 auto;
    gap: 3px;
    padding: 4px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.05);
  }
  .themes-tile:hover { background: ${siteTheme.hover}; }
  .themes-wall [role="button"]:focus-visible {
    outline: 2px solid ${siteTheme.accent};
    outline-offset: 2px;
  }
  .themes-wall { box-sizing: border-box; }
  .themes-wall--scatter {
    padding: 30px 34px 38px;
    /* The jitter needs room to lean into, so the padding sits outside the
       column the tiles share with the text rather than eating into it. */
    max-width: calc(1180px + 68px) !important;
    column-gap: 2px !important;
    row-gap: 0 !important;
    overflow: visible;
  }
  .themes-wall--scatter .themes-tile {
    --scatter-x: 0px;
    --scatter-y: 0px;
    --scatter-r: 0deg;
    position: relative;
    align-self: start;
    z-index: 1;
    margin: -3px -4px -28px;
    padding: 10px 10px 15px !important;
    border: 1px solid rgba(0, 0, 0, 0.14);
    border-radius: 2px !important;
    background: #fff;
    box-shadow: 0 1px 2px rgba(31, 35, 40, 0.09), 0 5px 12px rgba(31, 35, 40, 0.09);
    transform: translate3d(var(--scatter-x), var(--scatter-y), 0) rotate(var(--scatter-r));
    transform-origin: 50% 50%;
    transition: transform 180ms ease, box-shadow 180ms ease;
  }
  .themes-wall--scatter .themes-tile:hover,
  .themes-wall--scatter .themes-tile:focus-visible {
    z-index: 20;
    background: #fff;
    box-shadow: 0 4px 10px rgba(31, 35, 40, 0.14), 0 12px 24px rgba(31, 35, 40, 0.10);
    transform: translate3d(var(--scatter-x), calc(var(--scatter-y) - 7px), 0) rotate(0deg);
  }
  .themes-wall--scatter .themes-tile:nth-child(6n + 1) { --scatter-x: 7px;  --scatter-y: 5px;  --scatter-r: -2.1deg; }
  .themes-wall--scatter .themes-tile:nth-child(6n + 2) { --scatter-x: -4px; --scatter-y: -7px; --scatter-r: 1.4deg; }
  .themes-wall--scatter .themes-tile:nth-child(6n + 3) { --scatter-x: 5px;  --scatter-y: 9px;  --scatter-r: -0.8deg; }
  .themes-wall--scatter .themes-tile:nth-child(6n + 4) { --scatter-x: -8px; --scatter-y: 1px;  --scatter-r: 2.3deg; }
  .themes-wall--scatter .themes-tile:nth-child(6n + 5) { --scatter-x: 3px;  --scatter-y: -5px; --scatter-r: -1.5deg; }
  .themes-wall--scatter .themes-tile:nth-child(6n)     { --scatter-x: -6px; --scatter-y: 8px;  --scatter-r: 1deg; }
  .themes-wall--scatter .themes-tile:nth-child(8n + 3) { --scatter-r: 2.7deg; }
  .themes-wall--scatter .themes-tile:nth-child(11n + 1) { --scatter-y: -9px; }
  @media (max-width: 840px)  {
    .themes-intro { grid-template-columns: minmax(0, 1fr) !important; gap: 26px !important; }
    .themes-title-row { align-items: flex-start; }
  }
  @media (max-width: 520px)  {
    .themes-title-row { flex-direction: column; }
  }
  @media (max-width: 520px)  {
    .themes-principle { grid-template-columns: minmax(0, 1fr) !important; gap: 4px !important; }
  }
  @media (max-width: 1330px) {
    .themes-wall { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
  }
  @media (max-width: 1120px) {
    .themes-controls-row { flex-direction: column; }
  }
  @media (max-width: 910px)  {
    .themes-wall { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
  }
  @media (max-width: 700px)  {
    .themes-wall { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  }
  @media (max-width: 490px)  {
    .themes-wall { grid-template-columns: minmax(0, 1fr) !important; }
  }
  @media (max-width: 700px) {
    .themes-wall--scatter { padding: 22px 20px 30px; }
    .themes-wall--scatter .themes-tile { margin: -1px -2px -16px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .themes-wall--scatter .themes-tile { transition: none; }
  }
`;
