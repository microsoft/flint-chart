// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { assembleVegaLite } from '../src';

describe('Bar Table labels', () => {
    const titleText = (title: string | string[]) => Array.isArray(title) ? title.join(' ') : title;

    function barTable(unit?: string, field = 'life_expect_gain'): any {
        return assembleVegaLite({
            data: { values: [
                { country: 'Peru', [field]: 33.49 },
                { country: 'Iran', [field]: 32.34 },
            ] },
            semantic_types: {
                country: 'Country',
                [field]: unit ? { semanticType: 'Duration', unit } : 'Duration',
            },
            chart_spec: {
                chartType: 'Bar Table',
                encodings: { y: 'country', x: field },
                baseSize: { width: 600, height: 300 },
            },
            theme_spec: 'nyt',
        } as any) as any;
    }

    it('does not repeat the value as a generic annotation on each bar', () => {
        const spec = barTable('years');

        expect(spec.hconcat[0].mark.type).toBe('bar');
        expect(spec.hconcat[0].layer).toBeUndefined();
        const valuePanel = spec.hconcat.at(-1);
        expect(valuePanel.mark.type).toBe('text');
        expect(titleText(valuePanel.title.text)).toBe('life_expect_gain (years)');
        expect(valuePanel.encoding.text.type).toBe('nominal');
        expect(JSON.stringify(valuePanel.transform)).not.toContain('years');
    });

    it('prints a declared compact unit beside values', () => {
        const valuePanel = barTable('kg').hconcat.at(-1);
        expect(titleText(valuePanel.title.text)).toBe('life_expect_gain');
        expect(JSON.stringify(valuePanel.transform)).toContain(' kg');
    });

    it('does not display an undeclared unit', () => {
        const valuePanel = barTable().hconcat.at(-1);
        expect(titleText(valuePanel.title.text)).toBe('life_expect_gain');
        expect(JSON.stringify(valuePanel.transform)).not.toMatch(/years| kg/);
    });

    it('does not duplicate a lexical unit already present in the field name', () => {
        const valuePanel = barTable('years', 'life_expect_gain (years)').hconcat.at(-1);
        expect(titleText(valuePanel.title.text)).toBe('life_expect_gain (years)');
    });
});