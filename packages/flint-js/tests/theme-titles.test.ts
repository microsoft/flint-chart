// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';
import type { ThemeSpec } from '../src/core/theme/types';

/**
 * Who names the numbers.
 *
 * `Jan`, `Cairo`, `Chrome` say what kind of thing they are; `26`, `5300` do
 * not, and something on the page has to. A theme can say where that naming
 * goes — the axis, the headline — but it cannot say the naming is unnecessary,
 * and the compiler holds it to that.
 */

const MONTHLY = [
    { Month: 'Jan', Rainfall: 26 },
    { Month: 'Feb', Rainfall: 20 },
    { Month: 'Mar', Rainfall: 31 },
    { Month: 'Apr', Rainfall: 14 },
];

function house(annotation: ThemeSpec['annotation'], legend?: ThemeSpec['legend']): ThemeSpec {
    return {
        id: 'house',
        label: 'House',
        ink: { surface: { canvas: '#ffffff' }, series: { single: '#333333' } },
        annotation,
        ...(legend ? { legend } : {}),
    } as ThemeSpec;
}

function bars(themeSpec: ThemeSpec, headline?: string) {
    return assembleVegaLite({
        data: { values: MONTHLY },
        semantic_types: { Month: 'Month', Rainfall: 'Amount' },
        chart_spec: {
            chartType: 'Bar Chart',
            ...(headline ? { title: headline } : {}),
            encodings: { x: 'Month', y: 'Rainfall' },
        },
        theme_spec: themeSpec,
    } as any) as any;
}

/** `null` = suppressed, `undefined` = left to Vega-Lite (the field name). */
function axisTitle(spec: any, channel: 'x' | 'y'): unknown {
    const enc = (spec.spec?.encoding ?? spec.encoding ?? spec.layer?.[0]?.encoding ?? {})[channel];
    return enc?.axis?.title;
}

describe('axis titles', () => {
    it('omits a title over labels that name their own kind', () => {
        const spec = bars(house({ axisTitles: 'whenAmbiguous' }), 'Wetter than it looks');
        expect(axisTitle(spec, 'x')).toBeNull();
    });

    it('keeps a title over a column of bare values', () => {
        const spec = bars(house({ axisTitles: 'whenAmbiguous' }), 'Wetter than it looks');
        expect(axisTitle(spec, 'y')).not.toBeNull();
    });

    it('lets a house delegate the naming to its headline', () => {
        const spec = bars(house({ axisTitles: 'omit' }), 'Wetter than it looks');
        expect(axisTitle(spec, 'y')).toBeNull();
    });

    it('puts the title back when there is no headline to delegate to', () => {
        const spec = bars(house({ axisTitles: 'omit' }));
        expect(axisTitle(spec, 'y')).not.toBeNull();
        const report = spec._theme.report.map((r: any) => r.path);
        expect(report).toContain('annotation.axisTitles');
    });
});

describe('legend titles', () => {
    const PENGUINS = [
        { Island: 'Biscoe', Species: 'Adelie', Mass: 3400 },
        { Island: 'Dream', Species: 'Gentoo', Mass: 5100 },
        { Island: 'Torgersen', Species: 'Adelie', Mass: 3700 },
        { Island: 'Biscoe', Species: 'Gentoo', Mass: 4900 },
    ];

    function keyed(colorField: string) {
        return assembleVegaLite({
            data: { values: PENGUINS },
            semantic_types: { Island: 'City', Species: 'Category', Mass: 'Amount' },
            chart_spec: {
                chartType: 'Bar Chart',
                title: 'Heavier in the west',
                encodings: { x: 'Island', y: 'Mass', color: colorField },
            },
            theme_spec: house({ axisTitles: 'omit' }, { title: 'whenAmbiguous' }),
        } as any) as any;
    }

    it('leaves a key of names untitled', () => {
        const spec = keyed('Species');
        expect(spec._theme.decisions.legend.show).toBe(true);
        expect(spec._theme.decisions.legend.title).toBe(false);
    });

    it('titles a key of values', () => {
        const spec = keyed('Mass');
        expect(spec._theme.decisions.legend.show).toBe(true);
        expect(spec._theme.decisions.legend.title).toBe(true);
    });
});

/**
 * A masthead tab opens the block above the headline.
 *
 * The Economist's red rule sits at the very top of the graphic, over the
 * title — not between the title and the plot. So a house that draws one keeps
 * the tab first in the stack and lets the headline ride down onto the plot.
 */
describe('masthead furniture', () => {
    function withTab(): any {
        const themeSpec = {
            id: 'tabbed',
            label: 'Tabbed',
            ink: { surface: { canvas: '#ffffff' }, series: { single: '#333333' } },
            annotation: { axisTitles: 'always' },
            furniture: [{ kind: 'mastheadTab', anchor: 'topLeft', color: '#e3120b', width: 26, height: 3 }],
        } as unknown as ThemeSpec;
        return assembleVegaLite({
            data: { values: MONTHLY },
            semantic_types: { Month: 'Month', Rainfall: 'Amount' },
            chart_spec: {
                chartType: 'Bar Chart',
                title: 'Rain keeps falling',
                encodings: { x: 'Month', y: 'Rainfall' },
            },
            theme_spec: themeSpec,
        } as any) as any;
    }

    it('draws the tab first and above the title', () => {
        const spec = withTab();
        expect(Array.isArray(spec.vconcat)).toBe(true);
        // The tab opens the stack.
        const first = spec.vconcat[0];
        expect(first.__themeSynthetic).toBe(true);
        expect(first.mark.type).toBe('rect');
        expect(first.mark.color).toBe('#e3120b');
        // The title has come off the outer view and ridden down onto the plot.
        expect(spec.title).toBeUndefined();
        const titled = spec.vconcat.find((v: any) => v && v.title);
        expect(titled).toBeTruthy();
    });
});
