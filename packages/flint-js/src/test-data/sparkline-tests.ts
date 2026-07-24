// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Type } from './df-types';
import { TestCase, makeField, makeEncodingItem } from './types';
import { realSparklineCases } from './real-world-tests';
import { seededRandom, genDates, genCategories } from './generators';

// ============================================================================
// Sparkline Tests — small-multiples "sparkline table" strips.
//
// One compact row per series. The matrix varies the number of series and the
// points-per-series so we exercise tight vertical packing (3 → 8 → 15 strips)
// at a few densities, plus a couple of single-series and ordinal-x cases.
//
// Series field is a Category (nominal) bound to `color`; the template remaps
// it onto `row`, so each series gets its own short strip.
// ============================================================================

interface SparkMatrixEntry {
    /** Number of series (= number of stacked strips). 1 → single sparkline. */
    series: number;
    /** Points per series. */
    perSeries: number;
    /** 'T' temporal x or 'O' ordinal x. */
    x: 'T' | 'O';
    /** ~20% random dropout to test sparse strips. */
    sparse?: boolean;
    desc: string;
    extraTags?: string[];
}

const SPARK_MATRIX: SparkMatrixEntry[] = [
    // ── Single sparkline (the minimal dataword) ─────────────────────
    { series: 1, perSeries: 30, x: 'T', desc: 'Single sparkline — 30-point time series' },

    // ── Small / medium / large strip stacks ─────────────────────────
    { series: 3, perSeries: 24, x: 'T', desc: '3 series → 3 strips (KPI table)' },
    { series: 8, perSeries: 36, x: 'T', desc: '8 series → 8 strips (dense pack)' },
    { series: 15, perSeries: 48, x: 'T', desc: '15 series → 15 strips (tight pack stress)', extraTags: ['stress'] },

    // ── Variations ──────────────────────────────────────────────────
    { series: 6, perSeries: 30, x: 'T', sparse: true, desc: '6 series × 30 pts, ~20% missing (sparse strips)' },
    { series: 5, perSeries: 12, x: 'O', desc: '5 series over 12 ordinal stages' },
    { series: 10, perSeries: 60, x: 'T', desc: '10 series × 60 pts (high temporal density)', extraTags: ['large'] },
];

const ORDINAL_STAGES = (n: number): string[] =>
    Array.from({ length: n }, (_, i) => `Q${i + 1}`);

/** Smooth random-walk values (momentum + noise), kept non-negative. */
function genWalk(n: number, base: number, volatility: number, rand: () => number): number[] {
    const v: number[] = [base];
    let m = 0;
    for (let i = 1; i < n; i++) {
        m = 0.7 * m + (rand() - 0.5) * volatility;
        v.push(Math.round(Math.max(0, v[i - 1] + m)));
    }
    return v;
}

function buildSparkTitle(e: SparkMatrixEntry): string {
    const xLabel = e.x === 'T' ? 'T' : 'O';
    const parts = [`${e.series}×${xLabel}`];
    parts.push(`(${e.perSeries} pts/series)`);
    if (e.sparse) parts.push('sparse');
    return parts.join(' ');
}

function buildSparkTags(e: SparkMatrixEntry, n: number): string[] {
    const tags: string[] = ['quantitative'];
    if (e.x === 'T') tags.push('temporal');
    else tags.push('ordinal');
    if (e.series > 1) tags.push('color', 'small-multiples');
    if (e.sparse) tags.push('sparse');
    if (n <= 30) tags.push('small');
    else if (n <= 150) tags.push('medium');
    else tags.push('large');
    if (e.extraTags) tags.push(...e.extraTags);
    return [...new Set(tags)];
}

function sparkMatrixToTestCase(e: SparkMatrixEntry, rand: () => number): TestCase {
    const xValues: any[] = e.x === 'T'
        ? genDates(e.perSeries, 2021)
        : ORDINAL_STAGES(e.perSeries);

    const seriesNames = e.series > 1 ? genCategories('Metric', e.series) : [null];

    const data: Record<string, any>[] = [];
    for (let s = 0; s < e.series; s++) {
        const base = 40 + Math.round(rand() * 160);
        const vol = 8 + rand() * 28;
        const yValues = genWalk(xValues.length, base, vol, rand);
        for (let i = 0; i < xValues.length; i++) {
            if (e.sparse && rand() < 0.2) continue;
            const row: Record<string, any> = {
                Date: xValues[i],
                Value: yValues[i],
            };
            if (e.series > 1) row.Metric = seriesNames[s];
            data.push(row);
        }
    }

    const metadata: TestCase['metadata'] = {
        Date: {
            type: e.x === 'T' ? Type.Date : Type.String,
            semanticType: e.x === 'T' ? 'Date' : 'Category',
            levels: e.x === 'T' ? [] : xValues as any[],
        },
        Value: { type: Type.Number, semanticType: 'Quantity', levels: [] },
    };
    const fields = [makeField('Date'), makeField('Value')];
    const encodingMap: TestCase['encodingMap'] = {
        x: makeEncodingItem('Date'),
        y: makeEncodingItem('Value'),
    };
    if (e.series > 1) {
        metadata.Metric = { type: Type.String, semanticType: 'Category', levels: seriesNames as any[] };
        fields.push(makeField('Metric'));
        encodingMap.color = makeEncodingItem('Metric');
    }

    return {
        title: buildSparkTitle(e),
        description: e.desc,
        tags: buildSparkTags(e, data.length),
        chartType: 'Sparkline',
        data,
        fields,
        metadata,
        encodingMap,
    };
}

export function genSparklineTests(): TestCase[] {
    const rand = seededRandom(0x5A8C);
    return [...SPARK_MATRIX.map(e => sparkMatrixToTestCase(e, rand)), ...realSparklineCases()];
}
