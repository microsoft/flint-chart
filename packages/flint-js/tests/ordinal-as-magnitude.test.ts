// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';

// A rank is an order, not a magnitude: 1st is ahead of 5th but not five times
// anything. A template that encodes it as a bar length therefore renders the
// ranking backwards — last place gets the longest, and the output is well-formed,
// so nothing downstream questions it.
const RANKED = [
    { Engine: 'Inworld TTS-2', Rank: 1, Score: 91 },
    { Engine: 'xAI leo', Rank: 2, Score: 84 },
    { Engine: 'Kokoro am_michael', Rank: 3, Score: 77 },
    { Engine: 'Gemini', Rank: 4, Score: 63 },
    { Engine: 'Inworld 1.5-max', Rank: 5, Score: 51 },
];

function warningsFor(chartType: string, xField: string, semantic: Record<string, string>) {
    const spec: any = assembleVegaLite({
        data: { values: RANKED },
        semantic_types: semantic,
        chart_spec: {
            chartType,
            encodings: { y: { field: 'Engine' }, x: { field: xField } },
            baseSize: { width: 560, height: 280 },
        },
    } as any);
    return ((spec._warnings ?? []) as any[]).filter((w) => w.code === 'ordinal-as-magnitude');
}

describe('ordinal bound to a length encoding', () => {
    it('warns when Bar Table compiles Rank as a bar length', () => {
        const warnings = warningsFor('Bar Table', 'Rank', { Engine: 'Name', Rank: 'Rank' });

        expect(warnings).toHaveLength(1);
        expect(warnings[0].severity).toBe('warning');
        expect(warnings[0].channel).toBe('x');
        expect(warnings[0].field).toBe('Rank');
        expect(warnings[0].message).toContain('Bar Table');
    });

    it('stays quiet for Bar Chart, which encodes the same Rank by position', () => {
        // Semantics resolve Rank to ordinal for both templates; only Bar Table
        // overrides that. Keying the check on the compiled spec is what keeps this
        // case silent.
        expect(warningsFor('Bar Chart', 'Rank', { Engine: 'Name', Rank: 'Rank' })).toHaveLength(0);
    });

    it('stays quiet when a real magnitude drives the bar', () => {
        expect(warningsFor('Bar Table', 'Score', { Engine: 'Name', Score: 'Score' })).toHaveLength(0);
    });

    it('does not fire on a template whose mark encodes by position', () => {
        // Line Chart is markCognitiveChannel 'position', so a Rank axis there is
        // the documented behaviour rather than a fabricated magnitude.
        const spec: any = assembleVegaLite({
            data: { values: RANKED },
            semantic_types: { Engine: 'Name', Rank: 'Rank' },
            chart_spec: {
                chartType: 'Line Chart',
                encodings: { x: { field: 'Engine' }, y: { field: 'Rank' } },
                baseSize: { width: 560, height: 280 },
            },
        } as any);
        const warnings = ((spec._warnings ?? []) as any[]).filter(
            (w) => w.code === 'ordinal-as-magnitude',
        );
        expect(warnings).toHaveLength(0);
    });
});
