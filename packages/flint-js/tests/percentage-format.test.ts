import { describe, expect, it } from 'vitest';
import { resolveFormat } from '../src/core/field-semantics';

describe('percentage representation annotations', () => {
    const values = [0.5, 1.8, 2.4, 3, 1.2];

    it('uses an explicit fractional scale even when most values exceed one', () => {
        expect(resolveFormat('PercentageChange', {
            semanticType: 'PercentageChange',
            intrinsicDomain: [0, 3],
            percentScale: 'fraction',
        }, values)).toEqual({
            format: { pattern: '.0~%' },
            tooltipFormat: { pattern: '.1%' },
        });
    });

    it('uses an explicit percent-point scale even when most values are at most one', () => {
        expect(resolveFormat('Percentage', {
            semanticType: 'Percentage',
            intrinsicDomain: [0, 100],
            percentScale: 'percent',
        }, [0.2, 0.4, 0.5, 0.8, 3])).toEqual({
            tooltipFormat: { pattern: '.1f', suffix: '%' },
        });
    });

    it('keeps data-driven detection when no explicit scale is supplied', () => {
        expect(resolveFormat('PercentageChange', {
            semanticType: 'PercentageChange',
            intrinsicDomain: [0, 3],
        }, values)).toEqual({
            tooltipFormat: { pattern: '.1f', suffix: '%' },
        });
    });
});
