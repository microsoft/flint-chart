// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * ECDF Plot (Empirical Cumulative Distribution Function) test data.
 *
 * An ECDF plots each value of a quantitative measure against the proportion of
 * observations ≤ that value — a non-decreasing step rising from ~0 to 1.0. It is
 * the cumulative cousin of the histogram/density: the read is "what fraction of
 * the data is below this value", and groups can be compared by how far their
 * curves shift left/right. These generators cover the shapes an ECDF is built
 * for: a single clean S-curve, multiple shifted groups by color, values crossing
 * zero (negatives), small n (chunky steps) vs large n (smooth), a skewed
 * long-right-tail distribution, and a faceted case. Every case maps `x` (the
 * measure); grouped cases add `color`; the faceted case adds `column`.
 *
 * `genEcdfTests`        — the canonical (Vega-Lite) gallery + coverage set.
 * `genEChartsEcdfTests` — curated subset for the ECharts wall.
 * `genChartJsEcdfTests` — curated subset for the Chart.js wall.
 */

import { Type } from './df-types';
import { TestCase, makeField, makeEncodingItem } from './types';
import { realEcdfCases } from './real-world-tests';
import { seededRandom } from './generators';

/** Standard-normal sample via Box–Muller. */
function normal(rand: () => number, mean: number, sd: number): number {
    const u1 = Math.max(rand(), 1e-9);
    const u2 = rand();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Log-normal sample (long right tail). */
function lognormal(rand: () => number, mu: number, sigma: number): number {
    return Math.exp(normal(rand, mu, sigma));
}

const round = (v: number, dp = 0) => {
    const f = Math.pow(10, dp);
    return Math.round(v * f) / f;
};

export function genEcdfTests(): TestCase[] {
    const tests: TestCase[] = [];
    const rand = seededRandom(5309);

    // 1. BASIC — API response times, ~120 samples, one clean S-curve.
    {
        const data = Array.from({ length: 120 }, () => ({
            'Response Time (ms)': Math.max(8, round(normal(rand, 240, 55))),
        }));
        tests.push({
            title: 'API response times (basic)',
            description: 'Empirical CDF of ~120 response times — the minimum useful ECDF (one S-curve)',
            tags: ['quantitative', 'single', 'medium', 'gallery'],
            chartType: 'ECDF Plot',
            data,
            fields: [makeField('Response Time (ms)')],
            metadata: {
                'Response Time (ms)': { type: Type.Number, semanticType: 'Duration', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Response Time (ms)') },
        });
    }

    // 2. ADVANCED — control vs treatment test scores; treatment's curve sits to
    //    the RIGHT (larger values), the canonical two-group ECDF comparison.
    {
        const groups: Array<{ name: string; mean: number; sd: number }> = [
            { name: 'Control', mean: 62, sd: 12 },
            { name: 'Treatment', mean: 74, sd: 11 },
        ];
        const data: any[] = [];
        for (const g of groups) {
            for (let i = 0; i < 130; i++) {
                data.push({
                    Score: Math.max(0, Math.min(100, round(normal(rand, g.mean, g.sd)))),
                    Group: g.name,
                });
            }
        }
        tests.push({
            title: 'Test scores: control vs treatment + Color',
            description: 'Two ECDF curves by group — the treatment curve is right-shifted (higher scores)',
            tags: ['quantitative', 'color', 'multi', 'medium', 'gallery'],
            chartType: 'ECDF Plot',
            data,
            fields: [makeField('Score'), makeField('Group')],
            metadata: {
                Score: { type: Type.Number, semanticType: 'Score', levels: [] },
                Group: { type: Type.String, semanticType: 'Category', levels: groups.map(g => g.name) },
            },
            encodingMap: { x: makeEncodingItem('Score'), color: makeEncodingItem('Group') },
        });
    }

    // 3. Negatives — standardized residuals centered at 0, spanning negatives.
    {
        const data = Array.from({ length: 100 }, () => ({
            'Std residual': round(normal(rand, 0, 1), 2),
        }));
        tests.push({
            title: 'Standardized residuals crossing zero (negatives)',
            description: 'ECDF of values centered on zero — the curve passes ~0.5 at x = 0',
            tags: ['quantitative', 'negative', 'single', 'medium'],
            chartType: 'ECDF Plot',
            data,
            fields: [makeField('Std residual')],
            metadata: {
                'Std residual': { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Std residual') },
        });
    }

    // 4. Small n — only 15 reaction times, so the steps are visibly chunky.
    {
        const data = Array.from({ length: 15 }, () => ({
            'Reaction (s)': round(0.18 + lognormal(rand, -1.4, 0.4), 3),
        }));
        tests.push({
            title: 'Reaction times, small sample (n = 15)',
            description: 'A 15-point ECDF — few observations make each 1/n step clearly visible',
            tags: ['quantitative', 'single', 'small', 'low-cardinality'],
            chartType: 'ECDF Plot',
            data,
            fields: [makeField('Reaction (s)')],
            metadata: {
                'Reaction (s)': { type: Type.Number, semanticType: 'Duration', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Reaction (s)') },
        });
    }

    // 5. Large n — 600 measurements, a smooth near-continuous S-curve.
    {
        const data = Array.from({ length: 600 }, () => ({
            'Part width (mm)': round(normal(rand, 50, 2.5), 2),
        }));
        tests.push({
            title: 'Manufactured part widths, large sample (n = 600)',
            description: 'A dense 600-point ECDF — the steps blend into a smooth S-curve',
            tags: ['quantitative', 'single', 'large', 'dense'],
            chartType: 'ECDF Plot',
            data,
            fields: [makeField('Part width (mm)')],
            metadata: {
                'Part width (mm)': { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Part width (mm)') },
        });
    }

    // 6. Skewed — household income with a long right tail.
    {
        const data = Array.from({ length: 150 }, () => ({
            'Income ($k)': round(20 + lognormal(rand, 3.3, 0.7), 1),
        }));
        tests.push({
            title: 'Household income (skewed, long right tail)',
            description: 'ECDF of a right-skewed measure — the curve rises steeply then flattens into the tail',
            tags: ['quantitative', 'single', 'skewed', 'medium'],
            chartType: 'ECDF Plot',
            data,
            fields: [makeField('Income ($k)')],
            metadata: {
                'Income ($k)': { type: Type.Number, semanticType: 'Amount', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Income ($k)') },
        });
    }

    // 7. Three groups — request latency across three regions, all shifted.
    {
        const regions: Array<{ name: string; mu: number; sigma: number }> = [
            { name: 'us-east', mu: 3.9, sigma: 0.35 },
            { name: 'eu-west', mu: 4.2, sigma: 0.4 },
            { name: 'ap-south', mu: 4.6, sigma: 0.5 },
        ];
        const data: any[] = [];
        for (const r of regions) {
            for (let i = 0; i < 90; i++) {
                data.push({
                    'Latency (ms)': round(lognormal(rand, r.mu, r.sigma)),
                    Region: r.name,
                });
            }
        }
        tests.push({
            title: 'Request latency across 3 regions + Color',
            description: 'Three ECDF curves — progressively right-shifted latency distributions by region',
            tags: ['quantitative', 'color', 'multi', 'skewed', 'medium'],
            chartType: 'ECDF Plot',
            data,
            fields: [makeField('Latency (ms)'), makeField('Region')],
            metadata: {
                'Latency (ms)': { type: Type.Number, semanticType: 'Duration', levels: [] },
                Region: { type: Type.String, semanticType: 'Category', levels: regions.map(r => r.name) },
            },
            encodingMap: { x: makeEncodingItem('Latency (ms)'), color: makeEncodingItem('Region') },
        });
    }

    // 8. Faceted — exam scores as small multiples, one panel per subject.
    {
        const subjects: Array<{ name: string; mean: number; sd: number }> = [
            { name: 'Math', mean: 68, sd: 14 },
            { name: 'Reading', mean: 75, sd: 10 },
            { name: 'Science', mean: 71, sd: 12 },
        ];
        const data: any[] = [];
        for (const s of subjects) {
            for (let i = 0; i < 90; i++) {
                data.push({
                    Score: Math.max(0, Math.min(100, round(normal(rand, s.mean, s.sd)))),
                    Subject: s.name,
                });
            }
        }
        tests.push({
            title: 'Exam scores faceted by subject (column)',
            description: 'One ECDF per subject as small multiples — a column-faceted distribution comparison',
            tags: ['quantitative', 'facet', 'multi', 'medium'],
            chartType: 'ECDF Plot',
            data,
            fields: [makeField('Score'), makeField('Subject')],
            metadata: {
                Score: { type: Type.Number, semanticType: 'Score', levels: [] },
                Subject: { type: Type.String, semanticType: 'Category', levels: subjects.map(s => s.name) },
            },
            encodingMap: { x: makeEncodingItem('Score'), column: makeEncodingItem('Subject') },
        });
    }

    return [...tests, ...realEcdfCases()];
}

/**
 * ECharts wall variants — the cases that read cleanly as one stepped line per
 * group on a value x-axis (basic single curve, two/three shifted color groups,
 * a small-n chunky curve, and the negatives case).
 */
export function genEChartsEcdfTests(): TestCase[] {
    const all = genEcdfTests();
    const pick = (title: string) => all.find(t => t.title === title)!;
    return [
        pick('API response times (basic)'),
        pick('Test scores: control vs treatment + Color'),
        pick('Request latency across 3 regions + Color'),
        pick('Standardized residuals crossing zero (negatives)'),
        pick('Reaction times, small sample (n = 15)'),
    ];
}

/**
 * Chart.js wall variants — one stepped line dataset per group on a linear
 * x-axis (basic single curve, two shifted color groups, a skewed curve, and a
 * smooth large-n curve).
 */
export function genChartJsEcdfTests(): TestCase[] {
    const all = genEcdfTests();
    const pick = (title: string) => all.find(t => t.title === title)!;
    return [
        pick('API response times (basic)'),
        pick('Test scores: control vs treatment + Color'),
        pick('Household income (skewed, long right tail)'),
        pick('Manufactured part widths, large sample (n = 600)'),
    ];
}
