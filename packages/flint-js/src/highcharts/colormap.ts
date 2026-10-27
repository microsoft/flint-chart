// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Highcharts palette definitions + palette-selection logic.
 *
 * Mirrors echarts/colormap.ts: the abstract decision (schemeType /
 * categoryCount / schemeId) comes from core/color-decisions; the choice of
 * concrete colors is Highcharts-local. Highcharts consumes a top-level
 * `colors` array on the chart options, so palettes here are plain hex lists.
 */

import type { ColorDecision, ColorMapType } from '../core/color-decisions';
import { DEFAULT_COLORS } from './templates/utils';

export type HighchartsPaletteId = 'cat10' | 'cat20' | 'viridis' | 'RdBu' | string;

export interface HighchartsColorMapDef {
    id: HighchartsPaletteId;
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
 * Highcharts default palette (v11+): the library's own categorical default,
 * extended with a 20-slot variant for higher-cardinality legends.
 */
const HIGHCHARTS_COLOR_MAPS: HighchartsColorMapDef[] = [
    {
        id: 'cat10',
        type: 'categorical',
        supportsDiscrete: true,
        supportsContinuous: false,
        background: 'any',
        maxCategories: 10,
        colorblindSafe: false,
        colors: [
            '#2f7ed8', '#0d233a', '#8bbc21', '#910000', '#1aadce',
            '#492970', '#f28f43', '#77a1e5', '#c42525', '#a6c96a',
        ],
    },
    {
        id: 'cat20',
        type: 'categorical',
        supportsDiscrete: true,
        supportsContinuous: false,
        background: 'any',
        maxCategories: 20,
        colorblindSafe: false,
        colors: [
            '#2f7ed8', '#0d233a', '#8bbc21', '#910000', '#1aadce',
            '#492970', '#f28f43', '#77a1e5', '#c42525', '#a6c96a',
            '#2f7ed8', '#0d233a', '#8bbc21', '#910000', '#1aadce',
            '#492970', '#f28f43', '#77a1e5', '#c42525', '#a6c96a',
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
        colorblindSafe: false,
        diverging: true,
        preferredMidpoint: 0,
        colors: [
            '#b2182b', '#d6604d', '#f4a582', '#fddbc7',
            '#f7f7f7',
            '#d1e5f0', '#92c5de', '#4393c3', '#2166ac',
        ],
    },
];

function getMapById(id: HighchartsPaletteId | undefined): HighchartsColorMapDef | undefined {
    if (!id) return undefined;
    const key = String(id).toLowerCase();
    return HIGHCHARTS_COLOR_MAPS.find(m => m.id.toLowerCase() === key);
}

export function getPaletteForScheme(id: HighchartsPaletteId): string[] | undefined {
    const entry = getMapById(id);
    return entry?.colors;
}

/**
 * Pick the concrete palette for a color decision (Highcharts-local).
 *
 * 1. An explicit schemeId wins when it maps to a known palette.
 * 2. Otherwise choose by schemeType + categoryCount:
 *       - categorical → cat10 / cat20 by capacity
 *    - sequential  → viridis
 *    - diverging   → RdBu
 * 3. Fall back to the Highcharts default palette.
 */
export function pickHighchartsPalette(decision: ColorDecision | undefined): string[] {
    if (!decision) {
        return DEFAULT_COLORS;
    }

    const { schemeType, schemeId, categoryCount } = decision;

    if (schemeId) {
        const fromId = getPaletteForScheme(schemeId);
        if (fromId && fromId.length > 0) {
            return fromId;
        }
    }

    const mapsOfType = HIGHCHARTS_COLOR_MAPS.filter(m => m.type === schemeType);

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

    return DEFAULT_COLORS;
}
