// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/** How Chart.js (4) sets the furniture the layout plans, from its plugin and scale defaults. */

import type { BackendProfile, KeyGeometry } from '../core/backend-profile';

/** Chart.js' default family. */
export const CJS_FONT = "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif";

const lineHeight = 1.2;

/** Chart.js' legend: a 40 px box, half an em to its text, entries `padding` (10 px) apart and around. */
export const CHARTJS_PROFILE: BackendProfile = {
    id: 'chartjs',
    font: CJS_FONT,
    key: {
        lead: 40 + 6,
        symbol: 12,
        gap: 10,
        rowGap: 10,
        pad: { x: 10, y: 10 },
        entryHeight: (fontSize, lines) => (lines > 1 ? lines * fontSize * lineHeight : fontSize),
        lineHeight,
        wrap: 'flow',
        breakAt: 'over',
        rowTitle: 'top',
        titleGap: 0,
        titleRowGap: 0,
        // A legend beside the chart area wraps into more columns where it overruns the height.
        sideColumns: 'many',
    },
    edge: 10,
    // An 8 px tick and 3 px padding before its label.
    tickLabelGap: 8 + 3,
    axisTitleGap: 8,
    labelLineHeight: lineHeight,
    labelBoxHeight: lineHeight,
    axisPad: 0,
};

/** The key geometry a legend draws with at this size, its own `labels` settings over the defaults. */
export function cjsKeyGeometry(labels: any, fontSize: number): KeyGeometry {
    const base = CHARTJS_PROFILE.key;
    const box = labels?.boxWidth ?? 40;
    const boxHeight = labels?.boxHeight ?? fontSize;
    const padding = labels?.padding ?? 10;
    return {
        ...base,
        lead: box + fontSize / 2,
        symbol: Math.max(box, boxHeight),
        gap: padding,
        rowGap: padding,
        pad: { x: padding, y: padding },
        entryHeight: (size, lines) => (lines > 1 ? lines * size * lineHeight : Math.max(size, boxHeight)),
    };
}
