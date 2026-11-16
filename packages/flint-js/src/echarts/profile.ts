// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/** How ECharts (6) sets the furniture the layout plans, from its component defaults. */

import type { BackendProfile, KeyGeometry } from '../core/backend-profile';

/** The family ECharts' text is measured in where the chart sets none. */
export const ECHARTS_FONT = 'sans-serif';

const lineHeight = 1.2;

/** ECharts' legend defaults: a 25 × 14 icon, 5 px to its text, 10 px between entries, 5 px padding. */
export const ECHARTS_PROFILE: BackendProfile = {
    id: 'echarts',
    font: ECHARTS_FONT,
    key: {
        lead: 25 + 5,
        symbol: 14,
        gap: 10,
        rowGap: 10,
        pad: { x: 5, y: 5 },
        entryHeight: (fontSize, lines) => Math.max(14, lines * Math.ceil(fontSize * lineHeight)),
        lineHeight,
        wrap: 'flow',
        breakAt: 'over',
        rowTitle: 'top',
        titleGap: 0,
        titleRowGap: 6,
        sideColumns: 'one',
    },
    edge: 16,
    tickLabelGap: 8,
    axisTitleGap: 10,
    labelLineHeight: lineHeight,
    labelBoxHeight: lineHeight,
    axisPad: 0,
};

/** The key geometry a legend (or piecewise visual map) draws with, its own settings over the defaults. */
export function ecKeyGeometry(component: any, defaults: { itemWidth?: number; itemHeight?: number } = {}): KeyGeometry {
    const base = ECHARTS_PROFILE.key;
    const itemWidth = component?.itemWidth ?? defaults.itemWidth ?? 25;
    const itemHeight = component?.itemHeight ?? defaults.itemHeight ?? 14;
    const gap = component?.itemGap ?? base.gap;
    const pad = typeof component?.padding === 'number' ? component.padding : base.pad.x;
    return {
        ...base,
        lead: itemWidth + 5,
        symbol: itemHeight,
        gap,
        rowGap: gap,
        pad: { x: pad, y: pad },
        entryHeight: (fontSize, lines) => Math.max(itemHeight, lines * Math.ceil(fontSize * lineHeight)),
    };
}
