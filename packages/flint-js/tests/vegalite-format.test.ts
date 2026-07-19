// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { formatSpecToLabelExpr, formatSpecToVegaExpr } from '../src/vegalite/format';

describe('Vega-Lite semantic formatting', () => {
    it('formats an arbitrary derived value with semantic affixes', () => {
        expect(formatSpecToVegaExpr(
            { pattern: ',.2f', prefix: '$' },
            'datum.flintSparkAvg',
        )).toBe("'$' + format(datum.flintSparkAvg, ',.2f')");
    });

    it('supports affixes without forcing a number pattern', () => {
        expect(formatSpecToVegaExpr(
            { suffix: ' kg' },
            'datum["weight"]',
        )).toBe("datum[\"weight\"] + ' kg'");
    });

    it('escapes affixes embedded in Vega string literals', () => {
        expect(formatSpecToVegaExpr(
            { pattern: ',.1f', prefix: "owner's ", suffix: '\\unit' },
            'datum.value',
        )).toBe("'owner\\'s ' + format(datum.value, ',.1f') + '\\\\unit'");
    });

    it('applies abbreviation to an arbitrary value expression', () => {
        const expr = formatSpecToVegaExpr(
            { abbreviate: true, prefix: '$' },
            'datum.total',
        );
        expect(expr).toContain("'$' + (abs(datum.total) >= 1e12");
        expect(expr).toContain("format(datum.total / 1e3, '~g') + 'K'");
        expect(expr).toContain("format(datum.total, ',')");
    });

    it('leaves a pure axis pattern to Vega-Lite format', () => {
        expect(formatSpecToLabelExpr({ pattern: ',.2f' })).toBeNull();
        expect(formatSpecToLabelExpr({ pattern: ',.2f', prefix: '$' }))
            .toBe("'$' + format(datum.value, ',.2f')");
    });
});