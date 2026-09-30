// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import { assembleVegaLite } from '../src';
import { TEST_GENERATORS } from '../src/test-data';

describe('Bar Table labels', () => {
    it.each([undefined, 'nyt', 'economist', 'swiss'])('wraps within the final label column (%s)', async (preset) => {
        const data = [...TEST_GENERATORS['Bar Table']()[8].data, { Initiative: 'Short', Budget: 1000 }];
        const spec: any = assembleVegaLite({
            data: { values: data },
            semantic_types: { Initiative: 'Category', Budget: 'Quantity' },
            chart_spec: {
                chartType: 'Bar Table', title: 'Programme spend',
                encodings: { y: 'Initiative', x: 'Budget' },
            },
            ...(preset ? { theme_spec: preset } : {}),
        });
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        try {
            await view.runAsync();
            const labels: any[] = [];
            const bars: any[] = [];
            const visit = (item: any): void => {
                if (item.mark?.role === 'axis-label' && item.opacity !== 0) labels.push(item);
                if (item.mark?.role === 'mark' && item.mark?.marktype === 'rect') bars.push(item);
                for (const child of item.items ?? []) visit(child);
            };
            visit((view.scenegraph() as any).root);
            expect(labels).toHaveLength(data.length);
            const privacy = labels.find(item => String(item.datum.value).startsWith('Global Privacy'));
            expect(privacy.text).toHaveLength(2);
            expect(privacy.text[0]).toContain('Compliance');
            const short = labels.find(item => item.datum.value === 'Short');
            expect(Array.isArray(short.text) ? short.text : [short.text]).toEqual(['Short']);
            for (const label of labels) {
                const lines = Array.isArray(label.text) ? label.text : [label.text];
                expect(lines.length).toBeLessThanOrEqual(2);
                expect(lines.join(' ')).toBe(label.datum.value);
                expect(label.bounds.width()).toBeLessThanOrEqual(label.limit + 1);
                expect(label.tooltip).toBe(label.datum.value);
                expect(label.description).toBe(label.datum.value);
                const bar = bars.find(item => item.datum.Initiative === label.datum.value);
                expect(bar).toBeDefined();
                expect(Math.abs((label.bounds.y1 + label.bounds.y2) / 2 - (bar.y + bar.height / 2))).toBeLessThanOrEqual(1.5);
            }
            const ordered = labels.sort((first, second) => first.bounds.y1 - second.bounds.y1);
            for (let index = 1; index < ordered.length; index++) {
                expect(ordered[index].bounds.y1 - ordered[index - 1].bounds.y2).toBeGreaterThanOrEqual(4);
            }
        } finally {
            view.finalize();
        }
    });

    it('uses single-line ellipsis when dense rows have no room for wrapping', () => {
        const spec: any = assembleVegaLite({
            data: { values: Array.from({ length: 50 }, (_, index) => ({
                Initiative: `Regional Infrastructure and Public Transportation Modernization Programme ${index}`, Budget: 1000 + index,
            })) },
            semantic_types: { Initiative: 'Category', Budget: 'Quantity' },
            chart_spec: { chartType: 'Bar Table', encodings: { y: 'Initiative', x: 'Budget' }, chartProperties: { maxRows: 0 } },
        });
        expect(spec.hconcat[0].encoding.y.axis.labelExpr).toBeUndefined();
        expect(spec.hconcat[0].encoding.y.axis.labelLimit).toBe(220);
    });

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