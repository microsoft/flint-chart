// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Plotly 专用调色板定义。
// 承接 core/color-decisions.ts 中的抽象 colormap 信息（schemeType / schemeId / categoryCount），
// 但真正的颜色数组与选盘策略完全在 Plotly backend 本地实现，并尽量贴近 Plotly 默认配色。

import type { ColorDecision, ColorMapType } from '../core/color-decisions';

export type PlotlyPaletteId = 'plotly10' | 'light24' | 'viridis' | 'RdBu' | string;

export interface PlotlyColorMapDef {
    id: PlotlyPaletteId;
    type: ColorMapType;
    supportsDiscrete: boolean;
    supportsContinuous: boolean;
    background: 'light' | 'dark' | 'any';
    colorblindSafe?: boolean;
    maxCategories?: number;
    diverging?: boolean;
    preferredMidpoint?: number;
    colors: string[];
}

/**
 * Plotly 常用的基础配色。plotly10 即 plotly.js 默认 `layout.colorway`；
 * light24 对应 px.colors.qualitative.Light24 的前 20 色，用于高基数类别。
 */
const PLOTLY_COLOR_MAPS: PlotlyColorMapDef[] = [
    {
        id: 'plotly10',
        type: 'categorical',
        supportsDiscrete: true,
        supportsContinuous: false,
        background: 'any',
        maxCategories: 10,
        colorblindSafe: false,
        colors: [
            '#636efa', // blue-violet
            '#EF553B', // red-orange
            '#00cc96', // green
            '#ab63fa', // purple
            '#FFA15A', // orange
            '#19d3f3', // cyan
            '#FF6692', // pink
            '#B6E880', // light green
            '#FF97FF', // magenta
            '#FECB52', // yellow
        ],
    },
    {
        id: 'light24',
        type: 'categorical',
        supportsDiscrete: true,
        supportsContinuous: false,
        background: 'light',
        maxCategories: 24,
        colorblindSafe: false,
        colors: [
            '#FD3216', '#00FE35', '#6A76FC', '#FED4C4', '#FE00CE',
            '#0DF9FF', '#F6F926', '#FF9616', '#479B55', '#EEA6FB',
            '#DC587D', '#D626FF', '#6E899C', '#00B5F7', '#B68E00',
            '#C9FBE5', '#FF0092', '#22FFA7', '#E3EE9E', '#86CE00',
            '#BC7196', '#7E7DCD', '#FC6955', '#E48F72',
        ],
    },
    {
        id: 'viridis',
        type: 'sequential',
        supportsDiscrete: true,
        supportsContinuous: true,
        background: 'any',
        colorblindSafe: true,
        colors: [
            '#440154', '#46327e', '#365c8d', '#277f8e',
            '#1fa187', '#4ac16d', '#a0da39', '#fde725',
        ],
    },
    {
        id: 'RdBu',
        type: 'diverging',
        supportsDiscrete: true,
        supportsContinuous: true,
        background: 'any',
        diverging: true,
        preferredMidpoint: 0,
        colors: [
            '#b2182b', '#d6604d', '#f4a582', '#fddbc7',
            '#f7f7f7',
            '#d1e5f0', '#92c5de', '#4393c3', '#2166ac',
        ],
    },
];

function getMapById(id: PlotlyPaletteId | undefined): PlotlyColorMapDef | undefined {
    if (!id) return undefined;
    const key = String(id).toLowerCase();
    return PLOTLY_COLOR_MAPS.find(m => m.id.toLowerCase() === key);
}

export function getPaletteForScheme(id: PlotlyPaletteId): string[] | undefined {
    const entry = getMapById(id);
    return entry?.colors;
}

/**
 * Plotly 侧的「选盘」函数：等价于 chartjs/colormap.ts 的 pickChartJsPalette。
 *
 * 策略：
 *   1）若用户显式指定了 schemeId，则优先按该 id 取 palette。
 *   2）否则根据 schemeType + categoryCount 自动挑选合适的盘：
 *        - categorical：按类别数量在 plotly10 / light24 之间选；
 *        - sequential：优先 viridis；
 *        - diverging ：优先 RdBu。
 *   3）若都无法命中，回退到 Plotly 默认 categorical palette（plotly10）。
 */
export function pickPlotlyPalette(decision: ColorDecision | undefined): string[] {
    if (!decision) {
        const fallback = getPaletteForScheme('plotly10');
        return fallback && fallback.length ? fallback : [];
    }

    const { schemeType, schemeId, categoryCount } = decision;

    if (schemeId) {
        const fromId = getPaletteForScheme(schemeId);
        if (fromId && fromId.length > 0) {
            return fromId;
        }
    }

    const mapsOfType = PLOTLY_COLOR_MAPS.filter(m => m.type === schemeType);

    if (schemeType === 'categorical') {
        const k = categoryCount ?? 0;
        const candidates = mapsOfType.filter(m => m.supportsDiscrete);
        if (candidates.length) {
            const byCapacity = candidates
                .filter(m => m.maxCategories == null || m.maxCategories >= k)
                .sort((a, b) => (a.maxCategories ?? Infinity) - (b.maxCategories ?? Infinity));
            const picked = byCapacity[0] ?? candidates[0];
            if (picked.colors.length) {
                return picked.colors;
            }
        }
    } else if (schemeType === 'sequential') {
        const seq = mapsOfType.find(m => m.supportsContinuous) ?? getMapById('viridis');
        if (seq && seq.colors.length) {
            return seq.colors;
        }
    } else if (schemeType === 'diverging') {
        const divergingFirst = mapsOfType.find(m => m.diverging) ?? getMapById('RdBu');
        if (divergingFirst && divergingFirst.colors.length) {
            return divergingFirst.colors;
        }
    }

    const fallback = getPaletteForScheme('plotly10');
    return fallback && fallback.length ? fallback : [];
}
