// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite, assemblePlotly } from '../src';

/**
 * Regression test for issue #85: the `Rank` semantic type is an ordinal, not a
 * magnitude. The Bar Table template used to length-encode it (bar length +
 * sequential colour ramp), inverting the ranking so rank 1 got the shortest,
 * palest bar. The documented behaviour is "Rank → reversed axis (1 on top),
 * discrete color".
 *
 * The fix honours that in both the Vega-Lite and Plotly Bar Table templates:
 *   - rows ordered by rank ascending (1 first / on top),
 *   - discrete colour (no magnitude ramp),
 *   - equal-length bars (no length encoding of an ordinal).
 */

const RANK_INPUT = {
    data: {
        values: [
            { Engine: 'Inworld TTS-2', Rank: 1 },
            { Engine: 'xAI leo', Rank: 2 },
            { Engine: 'Kokoro am_michael', Rank: 3 },
            { Engine: 'Gemini', Rank: 4 },
            { Engine: 'Inworld 1.5-max', Rank: 5 },
        ],
    },
    semantic_types: { Engine: 'Name', Rank: 'Rank' },
    chart_spec: {
        chartType: 'Bar Table',
        encodings: { y: { field: 'Engine' }, x: { field: 'Rank' } },
        baseSize: { width: 560, height: 280 },
    },
};

const RANK_ORDER_ASC = ['Inworld TTS-2', 'xAI leo', 'Kokoro am_michael', 'Gemini', 'Inworld 1.5-max'];

describe('Bar Table honours Rank semantic (issue #85)', () => {
    it('Vega-Lite: sorts rank ascending, discrete colour, equal-length bars', () => {
        const spec = assembleVegaLite(RANK_INPUT as never) as any;
        const barPanel = spec.hconcat[0];

        // Rank ascending: rank 1 first (top).
        expect(barPanel.encoding.y.sort).toEqual(RANK_ORDER_ASC);

        // Discrete colour scale (ordinal), not a sequential magnitude ramp.
        expect(barPanel.encoding.color.type).toBe('ordinal');
        expect(barPanel.encoding.color.scale.scheme).toBeTruthy();

        // No length encoding: bars are a constant value, not the rank field.
        expect(barPanel.encoding.x.field).toBeUndefined();
        expect(barPanel.encoding.x.datum).toBe(1);
    });

    it('Plotly: sorts rank ascending, discrete colour, equal-length bars', () => {
        const fig = assemblePlotly(RANK_INPUT as never) as any;
        const trace = (fig.data ?? []).find((t: any) => t.type === 'bar' && t.orientation === 'h');

        // Rank ascending: rank 1 first (top).
        expect(trace.y).toEqual(RANK_ORDER_ASC);

        // Equal-length bars (no magnitude encoding) and discrete colour.
        expect(trace.x.every((v: number) => v === 1)).toBe(true);
        expect(new Set(trace.marker.color).size).toBeGreaterThan(1);
    });
});
