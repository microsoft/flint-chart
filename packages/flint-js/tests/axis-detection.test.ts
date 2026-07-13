// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import {
    detectBandedAxisForceDiscrete,
    detectBandedAxisFromSemantics,
    type ChannelSemantics,
} from '../src/core';

const semantics = (
    field: string,
    type: ChannelSemantics['type'],
): ChannelSemantics => ({
    field,
    type,
    semanticAnnotation: { semanticType: 'Unknown' },
});

describe('detectBandedAxisFromSemantics', () => {
    it('selects an already-discrete axis', () => {
        const result = detectBandedAxisFromSemantics({
            x: semantics('category', 'nominal'),
            y: semantics('value', 'quantitative'),
        }, []);

        expect(result).toEqual({ axis: 'x' });
    });

    it('honors preferAxis when both axes are continuous', () => {
        const result = detectBandedAxisFromSemantics({
            x: semantics('first', 'quantitative'),
            y: semantics('second', 'quantitative'),
        }, [], { preferAxis: 'y' });

        expect(result).toEqual({ axis: 'y' });
    });

    it('returns a discrete type override for a single populated axis', () => {
        const result = detectBandedAxisFromSemantics({
            x: semantics('date', 'temporal'),
        }, [{ date: '2026-01-01' }]);

        expect(result).toEqual({
            axis: 'x',
            resolvedTypes: { x: 'ordinal' },
        });
    });
});

describe('detectBandedAxisForceDiscrete', () => {
    it('forces the selected continuous axis to a discrete type', () => {
        const result = detectBandedAxisForceDiscrete({
            x: semantics('first', 'quantitative'),
            y: semantics('second', 'quantitative'),
        }, [
            { first: 1, second: 10 },
            { first: 2, second: 20 },
        ], { preferAxis: 'y' });

        expect(result).toEqual({
            axis: 'y',
            resolvedTypes: { y: 'ordinal' },
        });
    });
});