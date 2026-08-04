// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * The houses at 16 pixels.
 *
 * A theme picker has to say what a house *looks like* before the reader has
 * seen a chart in it, and a word cannot: "Economist" and "Datawrapper" are both
 * blue bars on white to anyone who has not met them. So each icon is a tiny
 * chart drawn in the house's own decisions — its canvas, the first three of its
 * categorical set, the weight of its rules — rather than an invented glyph.
 * Nothing here is a colour the house does not already use.
 *
 * They are authored in one file on purpose. An icon set is only legible as a
 * set: what makes each one recognisable is the thing it does that its
 * neighbours do not, and that can only be judged side by side. At this size
 * there is room for exactly one such difference each, so every house gets one
 * and only one:
 *
 *   flint          no house at all — one flat grey trio, no signature
 *   nyt            a black headline bar over the plot, the way its charts lead
 *   economist      the red flag, top left
 *   nature         a bare black L of axis and thin journal bars, no grid
 *   mckinsey       bars laid horizontally, the deck-chart posture
 *   datawrapper    horizontal grid ruling read through the bars
 *   powerbi        the dark canvas
 *   powerbi-light  the same bright series on white, with a faint grid
 *   swiss          heavy structural black rules on warm paper
 *   cartoon        rounded bar tops and a thick soft outline
 *
 * Each is a complete SVG document so a caller can put it straight in an `<img>`
 * or inline it. 16×16 with a half-pixel inset frame: the frame is what lets a
 * white house read as a *tile* rather than as marks floating on the toolbar.
 */

/** Shared geometry, so the set lines up when the icons sit next to each other. */
const BASELINE = 12.5;

function tile(canvas: string, frame: string, body: string, radius = 2): string {
    return [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">',
        `<rect x=".5" y=".5" width="15" height="15" rx="${radius}" fill="${canvas}" stroke="${frame}"/>`,
        body,
        '</svg>',
    ].join('');
}

/** Three upright bars on the shared baseline, at the heights the set uses. */
function bars(
    colors: [string, string, string],
    heights: [number, number, number],
    width = 2.6,
    radius = 0,
): string {
    const x = [3, 6.7, 10.4];
    return colors
        .map((fill, i) => {
            const h = heights[i];
            const rx = radius ? ` rx="${radius}"` : '';
            return `<rect x="${x[i]}" y="${BASELINE - h}" width="${width}" height="${h}" fill="${fill}"${rx}/>`;
        })
        .join('');
}

/** A horizontal rule — a baseline, a gridline, the pale ruling behind bars. */
function rule(x1: number, y: number, x2: number, stroke: string, width = 1): string {
    return `<path d="M${x1} ${y}H${x2}" stroke="${stroke}" stroke-width="${width}"/>`;
}

/** No house: flint's own defaults, stated plainly so "none" is a visible choice. */
export const FLINT_ICON = tile(
    '#ffffff',
    '#dcdcdc',
    bars(['#4c78a8', '#f58518', '#e45756'], [6.5, 8.5, 5]) +
        rule(2.6, BASELINE, 13.4, '#bdbdbd'),
);

/** A black headline bar, then the plot — the order an NYT chart is read in. */
export const NYT_ICON = tile(
    '#ffffff',
    '#dcdcdc',
    '<rect x="3" y="2.4" width="7" height="1.3" fill="#121212"/>' +
        bars(['#2f6b9a', '#c2352b', '#4a8b6f'], [6, 7.6, 4.6]) +
        rule(2.6, BASELINE, 13.4, '#121212'),
);

/** The red flag in the corner, and the house blues under one pale rule. */
export const ECONOMIST_ICON = tile(
    '#ffffff',
    '#dcdcdc',
    '<rect x="2.6" y="2.3" width="4.6" height="1.6" fill="#e3120b"/>' +
        bars(['#006ba2', '#3ebcd2', '#ebb434'], [6, 7.6, 4.6]) +
        rule(2.6, BASELINE, 13.4, '#121317'),
);

/** A bare black L and thin bars: a journal figure, no grid, no ornament. */
export const NATURE_ICON = tile(
    '#ffffff',
    '#dcdcdc',
    bars(['#0072b2', '#e69f00', '#009e73'], [6.2, 8, 4.6], 2) +
        `<path d="M3 3.2V${BASELINE}H13.4" fill="none" stroke="#000000" stroke-width="1.2"/>`,
);

/** Bars laid on their side against a single spine — the deck-chart posture. */
export const MCKINSEY_ICON = tile(
    '#ffffff',
    '#dcdcdc',
    '<rect x="4" y="3.4" width="8.6" height="2.4" fill="#051c2c"/>' +
        '<rect x="4" y="6.9" width="6.4" height="2.4" fill="#2251ff"/>' +
        '<rect x="4" y="10.4" width="4.2" height="2.4" fill="#00a9f4"/>' +
        '<path d="M3.5 3V13" stroke="#051c2c" stroke-width="1"/>',
);

/** Grid ruling read straight through the bars, the way its charts are gridded. */
export const DATAWRAPPER_ICON = tile(
    '#ffffff',
    '#dcdcdc',
    rule(2.6, 5.5, 13.4, '#b3b3b3') +
        rule(2.6, 8, 13.4, '#b3b3b3') +
        rule(2.6, 10.5, 13.4, '#b3b3b3') +
        bars(['#18a1cd', '#e2a233', '#c04a4a'], [6.5, 8.5, 5], 2.2) +
        rule(2.6, BASELINE, 13.4, '#333333'),
);

/** The dark canvas, which is the whole point of the house. */
export const POWERBI_ICON = tile(
    '#1b1a19',
    '#3b3a39',
    rule(2.6, 7.6, 13.4, '#3b3a39') +
        bars(['#118dff', '#e66c37', '#3bd1c7'], [6.5, 8.5, 5]) +
        rule(2.6, BASELINE, 13.4, '#3b3a39'),
);

/** The same series, on white — the pair reads as one house in two surfaces. */
export const POWERBI_LIGHT_ICON = tile(
    '#ffffff',
    '#d2d0ce',
    rule(2.6, 7.6, 13.4, '#dcdcdc') +
        bars(['#118dff', '#12239e', '#e66c37'], [6.5, 8.5, 5]) +
        rule(2.6, BASELINE, 13.4, '#d2d0ce'),
);

/** Warm paper, square marks, and axes drawn as structure rather than hinted. */
export const SWISS_ICON = tile(
    '#f4f1ea',
    '#d9d5cc',
    bars(['#e2231a', '#1a1a1a', '#0067a5'], [6.2, 8.2, 4.8]) +
        `<path d="M3 3V${BASELINE}H13.4" fill="none" stroke="#1a1a1a" stroke-width="1.6"/>`,
    0,
);

/** Rounded tops and a thick soft rule: the drawn-by-hand register. */
export const CARTOON_ICON = tile(
    '#fffdf5',
    '#ece5d6',
    bars(['#3aa9ff', '#ff5d5d', '#ffc23c'], [6.4, 8.4, 5], 2.8, 1.3) +
        rule(2.6, BASELINE, 13.4, '#2e2b28', 1.7),
    3.5,
);
