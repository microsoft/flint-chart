// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Theme wall — one house, twenty-one charts, all on screen at once.
 *
 * The demo wall exists to check cases: every chart Flint can draw, grouped by
 * family, so a broken one is easy to find. This page borrows its shape but
 * asks a different question — what does a *house* feel like? — and answers it
 * the only way that question can be answered, by putting enough different
 * marks side by side that the styling is the only thing they have in common.
 *
 * So the selection is the whole design. Twenty-one cases, no two of them the
 * same chart type, spread across families: something continuous, something
 * categorical, something ranked, something part-to-whole, something with a
 * legend, something with a matrix of cells. A house that only knows how to
 * style a bar chart has nowhere to hide on a wall like this, and one that
 * holds together across all of them is telling you it is a real house.
 *
 * Everything else is deliberately the demo wall's, down to the tile size and
 * the grid: uniform tiles, charts shrunk to fit rather than re-laid-out, the
 * case's own title and provenance beneath. Earlier versions of this page
 * packed the charts at their natural sizes to squeeze the gaps out, which
 * bought density at the cost of cropping legends and hiding charts below the
 * fold. A tile that shows the whole chart is worth more here than a wall with
 * no seams.
 */

import { useMemo, useState } from 'react';
import { BACKENDS } from '../shared/supported-backends';
import { VegaLiteView } from '../components/VegaLiteView';
import { ScaleToFit } from '../components/ScaleToFit';
import { siteTheme } from '../shared/theme';
import { ThemePicker } from './ThemePicker';
import { PREVIEW_CASES, type PreviewCase } from './new-case-preview-data';

/**
 * The selection, in the order it reads best: line, connected scatter, band,
 * matrix, box, wedge, stem, slope, dumbbell, ribbon, bar, stacked area, rank,
 * radar, histogram, strip, diverging bar, waterfall, violin, stream and bubble.
 *
 * Every one is a Vega-Lite case on purpose. A Plotly fallback ignores
 * `theme_spec`, and a tile that refused to change with the switch would say
 * something false about the house.
 */
// Eighteen cases — a 6×3 wall. One per chart type, chosen so the set covers
// the mark vocabulary (line, area, bar, point, radial, matrix, bridge) and so
// no two tiles retell the same dataset. Box/violin/strip plots are absent on
// purpose: their aspect is set by the number of categories on the discrete
// axis, and the real datasets behind them only have three groups, which makes
// them either far too tall or far too wide for a uniform tile.
const IDS = [
    'keeling', 'driving', 'seattle-range', 'temp-heatmap', 'browser-pie', 'co2-lollipop',
    'life-expectancy', 'lifeexp-dumbbell', 'electricity-mix-area', 'big-mac', 'olympic-bump', 'nutrition-radar',
    'faithful-hist', 'trust-likert', 'population-waterfall', 'us-pyramid', 'gapminder-bubble', 'earnings-education',
];

const CASE_BY_ID = new Map(PREVIEW_CASES.map((c) => [c.id, c]));

function buildInput(c: PreviewCase, themeId: string | undefined) {
    return {
        data: { values: c.data },
        semantic_types: c.semantic_types,
        chart_spec: {
            chartType: c.chartType,
            encodings: c.encodings,
            baseSize: { width: 300, height: 200 },
            ...(c.chartProperties ? { chartProperties: c.chartProperties } : {}),
        },
        ...(themeId ? { theme_spec: themeId } : {}),
    } as any;
}

function Tile({ c, themeId }: { c: PreviewCase; themeId: string | undefined }) {
    const compiled = useMemo(() => {
        try {
            return { ok: true as const, value: BACKENDS.vegalite.assemble(buildInput(c, themeId)) };
        } catch (err) {
            return { ok: false as const, err };
        }
    }, [c, themeId]);

    return (
        <article
            title={`${c.blurb}\n${c.source} · ${c.license} · ${c.data.length} rows`}
            style={{ padding: 8, borderRadius: 10, minWidth: 0, transition: 'background 120ms ease' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = siteTheme.hover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
            <ScaleToFit height={168} minHeight={110} adaptiveHeight padding={2}>
                {compiled.ok ? (
                    <VegaLiteView spec={compiled.value} />
                ) : (
                    <pre style={{ color: siteTheme.error, fontSize: 11, whiteSpace: 'pre-wrap', margin: 0 }}>
                        {String((compiled.err as Error)?.message ?? compiled.err)}
                    </pre>
                )}
            </ScaleToFit>
            <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, lineHeight: 1.3, color: siteTheme.text }}>
                {c.title}
            </div>
            {/* the case's own one-liner, clamped to two lines so a long blurb
                cannot push the tiles out of alignment with each other */}
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
                    minHeight: `${Math.round(10.5 * 1.35 * 2)}px`,
                }}
            >
                {c.blurb}
            </div>
        </article>
    );
}

export function ThemeWall() {
    const [themeId, setThemeId] = useState<string | undefined>(undefined);
    const cases = useMemo(
        () => IDS.map((id) => CASE_BY_ID.get(id)).filter((c): c is PreviewCase => Boolean(c)),
        [],
    );

    return (
        <div className="dev-page">
            <header className="dev-page-heading">
                <h1>
                    Theme wall{' '}
                    <span style={{ fontSize: 14, fontWeight: 400, color: siteTheme.navInactive }}>
                        ({cases.length} chart types, one house)
                    </span>
                </h1>
                <div style={{ marginTop: 10 }}>
                    <ThemePicker themeId={themeId} onTheme={setThemeId} />
                </div>
            </header>
            <div
                style={{
                    width: 'min(100%, 1500px)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                    gap: 10,
                }}
            >
                {cases.map((c) => (
                    <Tile key={c.id} c={c} themeId={themeId} />
                ))}
            </div>
        </div>
    );
}
