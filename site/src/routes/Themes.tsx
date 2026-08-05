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
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { THEME_PRESETS, DEFAULT_THEME_ICON } from 'flint-chart';
import { BACKENDS } from '../shared/supported-backends';
import { VegaLiteView } from '../components/VegaLiteView';
import { ScaleToFit } from '../components/ScaleToFit';
import { SiteShell } from '../components/SiteShell';
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
function buildInput(c: PreviewCase, title: string, themeId: string | undefined) {
  return {
    data: { values: c.data },
    semantic_types: c.semantic_types,
    chart_spec: {
      chartType: c.chartType,
      encodings: c.encodings,
      baseSize: { width: 300, height: 200 },
      title,
      ...(c.chartProperties ? { chartProperties: c.chartProperties } : {}),
    },
    ...(themeId ? { theme_spec: themeId } : {}),
  } as any;
}

function Tile({ c, themeId }: { c: PreviewCase; themeId: string | undefined }) {
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
      return { ok: true as const, value: BACKENDS.vegalite.assemble(buildInput(c, title, themeId)) };
    } catch (err) {
      return { ok: false as const, err };
    }
  }, [c, title, themeId]);

  return (
    <article
      title={`${c.title}\n${c.blurb}\n${c.source} · ${c.license} · ${c.data.length} rows`}
      style={{ padding: 8, borderRadius: 10, minWidth: 0, transition: 'background 120ms ease' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = siteTheme.hover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <ScaleToFit height={CHART_H} minHeight={110} adaptiveHeight padding={2}>
        {compiled.ok ? (
          <VegaLiteView spec={compiled.value} />
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
        borderRadius: 10,
        background: 'rgba(0, 0, 0, 0.04)',
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
              borderRadius: 7,
              border: selected ? `1px solid ${siteTheme.accent}` : '1px solid transparent',
              background: selected ? siteTheme.surface : 'transparent',
              color: selected ? siteTheme.text : siteTheme.navInactive,
              whiteSpace: 'nowrap',
            }}
          >
            <img
              src={iconUrl(choice.icon)}
              alt=""
              style={{ width: 15, height: 15, display: 'block', opacity: selected ? 1 : 0.6 }}
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
  const [themeId, setThemeId] = useState<string | undefined>(undefined);

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
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: siteTheme.surface }}>
        {/* Wider than the site's 1180px text column on purpose. Eighteen tiles
            only read as a 6×3 wall if six of them fit a row at a size where the
            charts are still legible; at 1180 the tiles come out 159px and the
            marks stop being readable. Prose stays capped at 720. */}
        <div style={{ maxWidth: 1500, margin: '0 auto', padding: '36px 40px 96px' }}>
          <header style={{ marginBottom: 4 }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>{t('themes.title')}</h1>
            <p style={{ margin: '10px 0 0', maxWidth: 720, fontSize: 14.5, lineHeight: 1.6, color: siteTheme.textMuted }}>
              {t('themes.lead')}
            </p>
            <p style={{ margin: '8px 0 0', maxWidth: 900, fontSize: 13.5, lineHeight: 1.6, color: siteTheme.textMuted }}>
              {t('themes.concept')}
            </p>
            <div
              className="themes-principles"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 20,
                maxWidth: 1080,
                marginTop: 16,
              }}
            >
              {(['layout', 'semantics', 'identity'] as const).map((principle) => (
                <div
                  key={principle}
                  style={{ display: 'grid', gridTemplateColumns: '8px minmax(0, 1fr)', gap: 9, alignItems: 'start' }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 7,
                      height: 7,
                      marginTop: 6,
                      borderRadius: '50%',
                      background: siteTheme.accent,
                    }}
                  />
                  <div>
                    <strong style={{ display: 'block', marginBottom: 3, fontSize: 13.5, color: siteTheme.text }}>
                      {t(`themes.principles.${principle}.title`)}
                    </strong>
                    <span style={{ fontSize: 12.5, lineHeight: 1.5, color: siteTheme.textMuted }}>
                      {t(`themes.principles.${principle}.body`)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ margin: '14px 0 0', maxWidth: 900, fontSize: 13.5, lineHeight: 1.6, color: siteTheme.textMuted }}>
              {t('themes.generalization')}
            </p>
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
            <ThemeBar themeId={themeId} onTheme={setThemeId} choices={choices} />
            <p style={{ margin: '10px 0 0', maxWidth: 820, fontSize: 13.5, lineHeight: 1.55, color: siteTheme.text }}>
              <strong>{selectedTheme.label}.</strong>{' '}
              <span style={{ color: siteTheme.textMuted }}>{selectedTheme.description}</span>
            </p>
            {/* The switch is a preview of one line of spec, so the page shows
                that line and keeps it in step with the buttons. Otherwise the
                reader leaves having enjoyed the wall without learning the one
                thing they need to reproduce it. */}
            <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, color: siteTheme.textMuted }}>
              {t('themes.usageBefore')}{' '}
              <code style={codeStyle}>"theme_spec": {JSON.stringify(themeId ?? 'theme-id')}</code>{' '}
              {t('themes.usageAfter')}
            </p>
          </div>

          <div
            className="themes-wall"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
              gap: 10,
            }}
          >
            {cases.map((c) => (
              <Tile key={c.id} c={c} themeId={themeId} />
            ))}
          </div>
        </div>
      </div>
    </SiteShell>
  );
}

const codeStyle: CSSProperties = {
  padding: '2px 6px',
  borderRadius: 5,
  fontFamily: siteTheme.fontMono,
  fontSize: 12,
  color: siteTheme.text,
  background: 'rgba(0, 0, 0, 0.05)',
};

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
  @media (max-width: 760px)  { .themes-principles { grid-template-columns: minmax(0, 1fr) !important; gap: 10px !important; } }
  @media (max-width: 1330px) { .themes-wall { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; } }
  @media (max-width: 910px)  { .themes-wall { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; } }
  @media (max-width: 700px)  { .themes-wall { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } }
  @media (max-width: 490px)  { .themes-wall { grid-template-columns: minmax(0, 1fr) !important; } }
`;
