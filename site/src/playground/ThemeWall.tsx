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
 * Where the headline lives — a toggle, because it is a real design question
 * and not a styling preference.
 *
 * `chart_spec.title` is not decoration to the compiler. A house whose
 * `axisTitles` policy is `omit` is leaning on the headline to name the
 * measure, and a chart authored without one gets its axis titles put back
 * (core/theme/ground.ts — "omit is a delegation, not a deletion"). Measured
 * across the wall, giving the charts a headline drops a further 11–19 axis
 * titles under nyt, economist, datawrapper, mckinsey and powerbi. So a wall
 * with the titles outside is showing six of the nine houses in a mode they
 * were not designed for. Being able to flip is the only way to see it.
 *
 * The deck is the loose part. Measured, a headline alone costs +30px of chart
 * height; a headline with its deck costs +47px, because the deck is a full
 * sentence that wraps inside the canvas and then takes the house's title-block
 * gap on top. Hence `split`, which is usually the one you want: the short
 * headline goes through the theme where it does its structural work, and the
 * sentence stays in HTML underneath where it costs the canvas nothing.
 *
 *   below  — title and description in HTML; the house never sees a headline
 *   split  — headline through the theme, description still in HTML
 *   inside — headline and deck both through the theme, nothing in HTML
 *   off    — no headline anywhere, the marks alone
 *
 * Every mode is budgeted to the same total tile height, so switching compares
 * like with like instead of turning into a comparison of sizes.
 */
export type TitleMode = 'below' | 'split' | 'inside' | 'off';

/** HTML caption metrics: title row 6 + 12×1.3; blurb row 2 + 10.5×1.35×2. */
const TITLE_H = 22;
const BLURB_H = 30;
const CHART_H = 168;

const TITLE_MODES: { id: TitleMode; label: string; hint: string }[] = [
    { id: 'below', label: 'Below', hint: 'Title and description in HTML — the house never sees a headline' },
    { id: 'split', label: 'Split', hint: 'Headline styled by the house; description stays in HTML below' },
    { id: 'inside', label: 'In chart', hint: 'Headline and deck both styled by the house' },
    { id: 'off', label: 'Off', hint: 'No headline anywhere — just the marks' },
];

/** What each mode puts in the canvas, and what it leaves to HTML. */
const inChartTitle = (m: TitleMode) => m === 'split' || m === 'inside';
const inChartDeck = (m: TitleMode) => m === 'inside';
const htmlTitle = (m: TitleMode) => m === 'below';
const htmlBlurb = (m: TitleMode) => m === 'below' || m === 'split';

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

function buildInput(c: PreviewCase, themeId: string | undefined, mode: TitleMode) {
    const caption = captionFor(c);
    return {
        data: { values: c.data },
        semantic_types: c.semantic_types,
        chart_spec: {
            chartType: c.chartType,
            encodings: c.encodings,
            baseSize: { width: 300, height: 200 },
            ...(inChartTitle(mode) ? { title: caption.title } : {}),
            ...(inChartDeck(mode) ? { subtitle: caption.blurb } : {}),
            ...(c.chartProperties ? { chartProperties: c.chartProperties } : {}),
        },
        ...(themeId ? { theme_spec: themeId } : {}),
    } as any;
}

function Tile({ c, themeId, mode }: { c: PreviewCase; themeId: string | undefined; mode: TitleMode }) {
    const compiled = useMemo(() => {
        try {
            return { ok: true as const, value: BACKENDS.vegalite.assemble(buildInput(c, themeId, mode)) };
        } catch (err) {
            return { ok: false as const, err };
        }
    }, [c, themeId, mode]);

    const caption = captionFor(c);
    // The chart takes back whatever the HTML caption is not using, so every
    // mode costs the same total tile height. Without this, moving the headline
    // into the canvas would just look like a smaller chart and the comparison
    // would be about size rather than style.
    const chartHeight = CHART_H + (htmlTitle(mode) ? 0 : TITLE_H) + (htmlBlurb(mode) ? 0 : BLURB_H);

    return (
        <article
            title={`${c.title}\n${c.blurb}\n${c.source} · ${c.license} · ${c.data.length} rows`}
            style={{ padding: 8, borderRadius: 10, minWidth: 0, transition: 'background 120ms ease' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = siteTheme.hover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
            <ScaleToFit height={chartHeight} minHeight={110} adaptiveHeight padding={2}>
                {compiled.ok ? (
                    <VegaLiteView spec={compiled.value} />
                ) : (
                    <pre style={{ color: siteTheme.error, fontSize: 11, whiteSpace: 'pre-wrap', margin: 0 }}>
                        {String((compiled.err as Error)?.message ?? compiled.err)}
                    </pre>
                )}
            </ScaleToFit>
            {/* Both captions are measured to fit — one line of title, at most two
                of blurb — and both reserve their height so the tiles stay on a
                common baseline. The clamps are a backstop for a font fallback or
                a very narrow column, not the expected case. */}
            {htmlTitle(mode) && (
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
            )}
            {htmlBlurb(mode) && (
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
                    {caption.blurb}
                </div>
            )}
        </article>
    );
}

export function ThemeWall() {
    const [themeId, setThemeId] = useState<string | undefined>(undefined);
    // `split` by default: measured, it gets exactly the same axis-title
    // delegation as putting everything in the canvas (37 titles dropped either
    // way, across all five `omit` houses) for 17px less chart height, and it
    // still leaves a description under every tile.
    const [mode, setMode] = useState<TitleMode>('split');
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
                <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <ThemePicker themeId={themeId} onTheme={setThemeId} />
                    <div
                        role="radiogroup"
                        aria-label="Headline placement"
                        style={{
                            display: 'inline-flex',
                            gap: 2,
                            padding: 3,
                            borderRadius: 8,
                            background: 'rgba(0, 0, 0, 0.05)',
                        }}
                    >
                        {TITLE_MODES.map((m) => {
                            const selected = m.id === mode;
                            return (
                                <button
                                    key={m.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    title={m.hint}
                                    onClick={() => setMode(m.id)}
                                    style={{
                                        height: 26,
                                        padding: '0 10px',
                                        cursor: 'pointer',
                                        fontSize: 12,
                                        fontWeight: selected ? 600 : 400,
                                        borderRadius: 6,
                                        border: selected ? `1px solid ${siteTheme.accent}` : '1px solid transparent',
                                        background: selected ? siteTheme.surface : 'transparent',
                                        color: selected ? siteTheme.text : siteTheme.navInactive,
                                    }}
                                >
                                    {m.label}
                                </button>
                            );
                        })}
                    </div>
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
                    <Tile key={c.id} c={c} themeId={themeId} mode={mode} />
                ))}
            </div>
        </div>
    );
}
