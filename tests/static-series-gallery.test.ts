// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
    assembleVegaLite,
    assembleECharts,
    assembleChartjs,
    assembleGoFish,
} from '../src';
import {
    STATIC_SERIES_GALLERY_EXAMPLES,
} from '../src/test-data/static-series-tests';

/**
 * Verify that all static series gallery examples compile through every backend
 * without throwing. This catches regressions in the normalization + downstream
 * pipeline when examples are added/modified.
 *
 * Note: Not all chart types are available in all backends (e.g., Dotted Line
 * is VL/EC only), so we catch unknown-type errors gracefully.
 */
describe('static series gallery examples', () => {
    for (const { label, input } of STATIC_SERIES_GALLERY_EXAMPLES) {
        describe(label, () => {
            it('assembles via Vega-Lite (if supported)', () => {
                try {
                    const spec = assembleVegaLite(input as any);
                    expect(spec).toBeDefined();
                    expect(spec.encoding || spec.layer).toBeDefined();
                } catch (e: any) {
                    expect(e.message).toContain('Unknown chart type');
                }
            });

            it('assembles via ECharts (if supported)', () => {
                try {
                    const option = assembleECharts(input as any);
                    expect(option).toBeDefined();
                    expect(option.series?.length).toBeGreaterThanOrEqual(2);
                } catch (e: any) {
                    expect(e.message).toContain('Unknown ECharts chart type');
                }
            });

            it('assembles via Chart.js (if supported)', () => {
                try {
                    const config = assembleChartjs(input as any);
                    expect(config).toBeDefined();
                } catch (e: any) {
                    // Chart type not supported in Chart.js backend — expected
                    expect(e.message).toContain('Unknown Chart.js chart type');
                }
            });

            it('assembles via GoFish (if supported)', () => {
                try {
                    const spec = assembleGoFish(input as any);
                    expect(spec).toBeDefined();
                    expect(spec._gofish).toBeDefined();
                } catch (e: any) {
                    // Chart type not supported in GoFish backend — expected
                    expect(e.message).toContain('Unknown GoFish chart type');
                }
            });
        });
    }
});
