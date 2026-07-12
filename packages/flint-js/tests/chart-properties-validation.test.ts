// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';

const BASE = {
    data: {
        values: [
            { flops: 1.2e20, loss: 2.81 },
            { flops: 7.0e20, loss: 2.42 },
            { flops: 2.8e21, loss: 2.34 },
            { flops: 5.4e21, loss: 2.11 },
        ],
    },
    semantic_types: { flops: 'Quantity', loss: 'Quantity' },
};

function assemble(chartProperties: Record<string, any>): any {
    return assembleVegaLite({
        ...BASE,
        chart_spec: {
            chartType: 'Regression',
            encodings: { x: { field: 'flops' }, y: { field: 'loss' } },
            chartProperties,
        },
    });
}

/** Pull the regression transform out of the assembled layered spec. */
function regressionTransform(spec: any): any {
    const layer = spec.layer.find((l: any) =>
        (l.transform ?? []).some((t: any) => 'regression' in t),
    );
    return layer.transform.find((t: any) => 'regression' in t);
}

describe('Regression — discrete property value validation', () => {
    it('passes a valid accepted value through unchanged', () => {
        const spec = assemble({ regressionMethod: 'log' });
        expect(regressionTransform(spec).method).toBe('log');
        expect(spec._warnings).toBeUndefined();
    });

    it('coerces a known display label to its accepted value', () => {
        const spec = assemble({ regressionMethod: 'Logarithmic' });
        // The invalid label must not reach the backend transform verbatim.
        expect(regressionTransform(spec).method).toBe('log');
        const warn = (spec._warnings ?? []).find(
            (w: any) => w.code === 'coerced-option-label',
        );
        expect(warn).toBeDefined();
        expect(warn.severity).toBe('info');
    });

    it('is case-insensitive when matching a label', () => {
        const spec = assemble({ regressionMethod: 'EXPONENTIAL' });
        expect(regressionTransform(spec).method).toBe('exp');
    });

    it('drops an unrecognized value and warns instead of emitting it', () => {
        const spec = assemble({ regressionMethod: 'Nonsense' });
        // Falls back to the default (linear) → no `method` on the transform.
        expect(regressionTransform(spec).method).toBeUndefined();
        const warn = (spec._warnings ?? []).find(
            (w: any) => w.code === 'invalid-option-value',
        );
        expect(warn).toBeDefined();
        expect(warn.severity).toBe('warning');
    });

    it('leaves a valid default value without warnings', () => {
        const spec = assemble({ regressionMethod: 'linear' });
        expect(regressionTransform(spec).method).toBeUndefined();
        expect(spec._warnings).toBeUndefined();
    });
});
