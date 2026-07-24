// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Test-data generators for the 2-D density contour chart — Density Contour
 * (`histogram2dcontour`). A Plotly-only statistical chart: both axes are
 * continuous measures, binned and smoothed into density iso-contours (Vega-Lite
 * has no contour mark). See design-docs/plotly-stats-charts.md.
 */

import { Type } from './df-types';
import { TestCase, makeField, makeEncodingItem } from './types';
import { seededRandom } from './generators';

/** Build a correlated bivariate cloud (roughly Gaussian) for 2-D density demos. */
function bivariateCloud(n: number, seed: number, xLabel: string, yLabel: string, corr: number): any[] {
    const rand = seededRandom(seed);
    const gauss = () => (rand() + rand() + rand() + rand() - 2) * 1.5; // ~N(0, ~1)
    const rows: any[] = [];
    for (let i = 0; i < n; i++) {
        const a = gauss();
        const b = corr * a + Math.sqrt(1 - corr * corr) * gauss();
        rows.push({
            [xLabel]: Math.round((50 + a * 12) * 10) / 10,
            [yLabel]: Math.round((40 + b * 10) * 10) / 10,
        });
    }
    return rows;
}

function density2dMeta(xLabel: string, yLabel: string) {
    return {
        [xLabel]: { type: Type.Number, semanticType: 'Quantity', levels: [] },
        [yLabel]: { type: Type.Number, semanticType: 'Quantity', levels: [] },
    };
}

export function genDensityContourTests(): TestCase[] {
    const tests: TestCase[] = [];

    {
        const data = bivariateCloud(700, 81, 'X', 'Y', 0.6);
        tests.push({
            title: 'Correlated Cloud (700 pts)',
            description: 'Smoothed 2-D density contours over a scatter of raw points',
            tags: ['quantitative', 'density', 'medium'],
            chartType: 'Density Contour',
            data,
            fields: [makeField('X'), makeField('Y')],
            metadata: density2dMeta('X', 'Y'),
            encodingMap: { x: makeEncodingItem('X'), y: makeEncodingItem('Y') },
        });
    }

    {
        // Two overlapping clouds → visibly multi-modal density.
        const a = bivariateCloud(400, 82, 'Feature 1', 'Feature 2', 0.5);
        const b = bivariateCloud(400, 83, 'Feature 1', 'Feature 2', 0.5)
            .map(r => ({ 'Feature 1': r['Feature 1'] + 35, 'Feature 2': r['Feature 2'] + 28 }));
        const data = [...a, ...b];
        tests.push({
            title: 'Bimodal Density (800 pts)',
            description: 'Two clusters — contour lines reveal both modes',
            tags: ['quantitative', 'density', 'large'],
            chartType: 'Density Contour',
            data,
            fields: [makeField('Feature 1'), makeField('Feature 2')],
            metadata: density2dMeta('Feature 1', 'Feature 2'),
            encodingMap: { x: makeEncodingItem('Feature 1'), y: makeEncodingItem('Feature 2') },
        });
    }

    return tests;
}
