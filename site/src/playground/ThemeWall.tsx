// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Theme wall — one house, eighteen charts, all on screen at once.
 *
 * The demo wall exists to check cases: every chart Flint can draw, grouped by
 * family, so a broken one is easy to find. This page borrows its shape but
 * asks a different question — what does a *house* feel like? — and answers it
 * the only way that question can be answered, by putting enough different
 * marks side by side that the styling is the only thing they have in common.
 *
 * So the selection is the whole design. Eighteen cases in a 6×3 wall, no two
 * of them the same chart type, spread across families: something continuous,
 * something categorical, something ranked, something part-to-whole, something
 * with a legend, something with a matrix of cells. A house that only knows how
 * to style a bar chart has nowhere to hide on a wall like this, and one that
 * holds together across all of them is telling you it is a real house.
 *
 * Everything else is deliberately the demo wall's, down to the tile size and
 * the grid: uniform tiles, charts shrunk to fit rather than re-laid-out, a
 * title and a one-line description beneath. Earlier versions of this page
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
 * matrix, wedge, stem, slope, dumbbell, ribbon, bar, rank, radar, histogram,
 * diverging bar, bridge, pyramid, bubble and grouped bar.
 *
 * Every one is a Vega-Lite case on purpose. A Plotly fallback ignores
 * `theme_spec`, and a tile that refused to change with the switch would say
 * something false about the house.
 *
 * Eighteen fills a 6×3 wall. One per chart type, chosen so the set covers the
 * mark vocabulary and so no two tiles retell the same dataset. Box, violin and
 * strip plots are absent on purpose: their aspect is set by the number of
 * categories on the discrete axis, and the real datasets behind them only have
 * three groups, which leaves them far too tall or far too wide for a uniform
 * tile.
 */
const IDS = [
    'keeling', 'driving', 'seattle-range', 'temp-heatmap', 'browser-pie', 'co2-lollipop',
    'life-expectancy', 'lifeexp-dumbbell', 'electricity-mix-area', 'big-mac', 'olympic-bump', 'nutrition-radar',
    'faithful-hist', 'trust-likert', 'population-waterfall', 'us-pyramid', 'gapminder-bubble', 'earnings-education',
];

const CASE_BY_ID = new Map(PREVIEW_CASES.map((c) => [c.id, c]));

/**
 * Wall-specific captions, because a tile is not a gallery entry.
 *
 * A case's own title has to stand alone on the gallery page, so it carries the
 * subject, the units and the date range at once — "Keeling Curve — atmospheric
 * CO₂ at Mauna Loa (annual mean)". In a 214px tile that wraps to two lines, and
 * sixteen of the eighteen did. Two-line titles are the thing that makes this
 * wall look untidy: the captions stop being a quiet baseline under the charts
 * and start competing with them, which is exactly backwards on a page whose
 * whole subject is what the charts look like.
 *
 * So each tile gets a title short enough to hold one line at the narrowest
 * column, and the units and dates move down into the blurb, which had room.
 * The originals stay untouched — the gallery still needs them.
 *
 * Every string here is measured, not guessed: titles at 12px/600 and blurbs at
 * 10.5px/400 against Inter at a 214px content width. The widest title uses 83%
 * of its line, which leaves enough headroom to survive a font fallback.
 */
const CAPTIONS: Record<string, { title: string; blurb: string }> = {
    'keeling': { title: 'Keeling Curve', blurb: 'Atmospheric CO₂ at Mauna Loa, 316 ppm to 421 and still climbing.' },
    'driving': { title: 'Driving shifts into reverse', blurb: 'Miles driven per person against the price of gas, 1956–2010.' },
    'seattle-range': { title: 'Seattle temperature range', blurb: 'Average daily low to high, month by month.' },
    'temp-heatmap': { title: 'Monthly temperature by city', blurb: 'Tropics warm all year, Moscow frozen, Sydney running backwards.' },
    'browser-pie': { title: 'Desktop browser share', blurb: 'Chrome takes two thirds; Safari and Edge tie far behind.' },
    'co2-lollipop': { title: 'CO₂ emissions per person', blurb: 'Sixteen countries spanning a twentyfold range, in tonnes.' },
    'life-expectancy': { title: 'Life expectancy, 2000 to 2021', blurb: 'Almost every country rose. The US line dips through COVID.' },
    'lifeexp-dumbbell': { title: 'The female–male life gap', blurb: 'Each bar spans male to female life expectancy in one country.' },
    'electricity-mix-area': { title: 'World electricity mix', blurb: 'Coal holds its share for thirty years as wind and solar arrive.' },
    'big-mac': { title: 'The Big Mac index', blurb: 'One burger, priced worldwide: a rough gauge of what money buys.' },
    'olympic-bump': { title: 'Olympic medal-table rank', blurb: 'Four Summer Games, 2012 to 2024, with first place on top.' },
    'nutrition-radar': { title: 'Almonds, oats and yogurt', blurb: 'Five nutrients per 100 g; each food traces its own polygon.' },
    'faithful-hist': { title: 'Old Faithful eruptions', blurb: 'Two humps, near two minutes and four and a half. A mean hides both.' },
    'trust-likert': { title: 'Confidence in US institutions', blurb: 'Centred on the neutral split: trust left, doubt right.' },
    'population-waterfall': { title: 'World population, 1950 to 2020', blurb: 'A bridge from 2.5 to 7.9 billion, one step per UN sub-region.' },
    'us-pyramid': { title: 'US population by age and sex', blurb: 'Age bands stacked upward, the sexes mirrored either side of zero.' },
    'gapminder-bubble': { title: 'Wealth against health', blurb: 'Rosling’s bubbles: size is population, colour is continent.' },
    'earnings-education': { title: 'Earnings by education and sex', blurb: 'Two gaps at once: the ladder, and the gap inside every rung.' },
};

const captionFor = (c: PreviewCase) => CAPTIONS[c.id] ?? { title: c.title, blurb: c.blurb };

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

    const caption = captionFor(c);

    return (
        <article
            title={`${c.title}\n${c.blurb}\n${c.source} · ${c.license} · ${c.data.length} rows`}
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
            {/* Both captions are measured to fit — one line of title, at most two
                of blurb — and both reserve their height so the tiles below stay
                on a common baseline. The clamps are a backstop for a font
                fallback or a very narrow column, not the expected case. */}
            <div
                style={{
                    marginTop: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    lineHeight: 1.3,
                    color: siteTheme.text,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                }}
            >
                {caption.title}
            </div>
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
                {caption.blurb}
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
