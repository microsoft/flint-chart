// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { assembleVegaLite } from '../src';
import { resolveDisplayUnit } from '../src/core/field-semantics';

const values = [
    { country: 'Peru', gain: 33.49 },
    { country: 'Iran', gain: 32.34 },
];

function bars(unit?: string, themed = true): any {
    return assembleVegaLite({
        data: { values },
        semantic_types: {
            country: 'Country',
            gain: unit ? { semanticType: 'Duration', unit } : 'Duration',
        },
        chart_spec: {
            chartType: 'Bar Chart',
            encodings: { x: 'country', y: 'gain' },
            baseSize: { width: 400, height: 300 },
        },
        ...(themed ? { theme_spec: 'economist' } : {}),
    } as any) as any;
}

describe('explicit unit display policy', () => {
    it('does not infer a visible unit from the semantic type', () => {
        const axis = bars()._theme.decisions.axes.y;
        expect(axis.unit).toBeUndefined();
        expect(axis.title.unit).toBeUndefined();
    });

    it('places a declared compact unit beside values', () => {
        const axis = bars('kg')._theme.decisions.axes.y;
        expect(axis.unit).toMatchObject({ text: 'kg' });
        expect(axis.title.unit).toBeUndefined();
    });

    it('normalizes conventional compact unit names', () => {
        expect(resolveDisplayUnit({ semanticType: 'Duration', unit: 'hours' }))
            .toEqual({ text: 'hr', placement: 'value', position: 'suffix' });
        expect(resolveDisplayUnit({ semanticType: 'Amount', unit: 'USD' }))
            .toEqual({ text: '$', placement: 'value', position: 'prefix' });
    });

    it('places a declared lexical unit beside the field name', () => {
        const axis = bars('years')._theme.decisions.axes.y;
        expect(axis.unit).toBeUndefined();
        expect(axis.title.unit).toBe('years');

        const unthemed = bars('years', false);
        expect(unthemed.encoding.y.title).toBe('gain (years)');
    });

    it('does not display prose as a unit', () => {
        expect(resolveDisplayUnit({
            semanticType: 'Quantity',
            unit: 'per working-age resident in constant prices',
        })).toBeUndefined();
    });
});
