// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite, THEME_PRESETS } from '../src';
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

describe('title block position', () => {
    it('places a title below the chart when the house treats it as a caption', () => {
        const spec = bars({
            ...house({ axisTitles: 'always' }),
            layout: { titleBlock: { position: 'bottom' } },
        }, 'Monthly rainfall');

        expect(spec.config.title.orient).toBe('bottom');
        expect(spec._theme.decisions.title.position).toBe('bottom');
    });

    it('keeps titles above the chart by default', () => {
        const spec = bars(house({ axisTitles: 'always' }), 'Monthly rainfall');

        expect(spec.config.title.orient).toBe('top');
        expect(spec._theme.decisions.title.position).toBe('top');
    });

    it('places the Nature title as a centered caption below the figure', () => {
        const spec = bars(THEME_PRESETS.nature.spec, 'Monthly rainfall');

        expect(spec.config.title.orient).toBe('bottom');
        expect(spec.config.title.anchor).toBe('middle');
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
 * A masthead tab is canvas furniture — branding anchored to the graphic frame.
 *
 * The Economist's red tab sits at the very top-left of the graphic, flush with
 * the title's own margin, and has nothing to do with the plot. So it is not a
 * concat child (which would pin to the plot's data rectangle and drift right on
 * a wide axis gutter) — it is recorded in `usermeta` for the renderer to draw
 * onto the SVG, and a strip of top padding is reserved so it opens the graphic
 * above the headline.
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

    it('records the tab as canvas furniture, flush with the title, and keeps the title on the graphic', () => {
        const spec = withTab();
        // The tab is not wrapped into a concat — it draws onto the canvas.
        expect(spec.vconcat).toBeUndefined();
        const tabs = spec.usermeta?.flintCanvasFurniture;
        expect(Array.isArray(tabs)).toBe(true);
        expect(tabs).toHaveLength(1);
        const tab = tabs[0];
        expect(tab.kind).toBe('mastheadTab');
        expect(tab.color).toBe('#e3120b');
        expect(tab.width).toBe(26);
        expect(tab.height).toBe(3);
        // The tab anchors to the same left margin the title anchors to.
        const pad = spec.padding;
        const left = typeof pad === 'number' ? pad : pad.left;
        expect(tab.x).toBe(left);
        // A band of top padding is reserved so the tab opens above the headline.
        const top = typeof pad === 'number' ? pad : pad.top;
        expect(top).toBeGreaterThanOrEqual(tab.y + tab.height);
        // The headline stays on the graphic frame.
        expect(spec.title).toBeTruthy();
    });
});

describe('a headline wider than its block', () => {
    const LONG = 'Driving Shifts Into Reverse — miles driven per person against the price of gas, 1956 to 2010';
    const PENGUINS = 'Palmer Penguins — flipper length vs body mass';

    function titled(headline: string): any {
        return assembleVegaLite({
            data: { values: MONTHLY },
            semantic_types: { Month: 'Month', Rainfall: 'Amount' },
            chart_spec: {
                chartType: 'Bar Chart',
                title: headline,
                encodings: { x: 'Month', y: 'Rainfall' },
            },
            theme_spec: THEME_PRESETS.nyt.spec,
        } as any) as any;
    }

    /** A wide plot, where a headline of ordinary length only just overhangs. */
    function scattered(headline: string, themeId: string): any {
        const rows = Array.from({ length: 40 }, (_, i) => ({
            flipper: 178 + (i % 20) * 3,
            mass: 3200 + ((i * 137) % 2800),
            species: ['Adelie', 'Chinstrap', 'Gentoo'][i % 3],
        }));
        return assembleVegaLite({
            data: { values: rows },
            semantic_types: { flipper: 'Amount', mass: 'Amount', species: 'Category' },
            chart_spec: {
                chartType: 'Scatter Plot',
                title: headline,
                encodings: { x: 'flipper', y: 'mass', color: 'species' },
            },
            theme_spec: (THEME_PRESETS as any)[themeId].spec,
        } as any) as any;
    }

    it('leaves a headline that fits alone', () => {
        expect(titled('Rain keeps falling').title.text).toBe('Rain keeps falling');
    });

    it('lets a headline that only overhangs stand, in every house', () => {
        for (const id of Object.keys(THEME_PRESETS)) {
            const text = scattered(PENGUINS, id).title.text;
            expect(Array.isArray(text), `${id} broke a headline it could have carried`).toBe(false);
        }
    });

    it('breaks a headline that will not fit even set down a size', () => {
        const spec = titled(LONG);
        expect(Array.isArray(spec.title.text)).toBe(true);
        expect(spec.title.text.length).toBeGreaterThan(1);
        // Nothing is lost or reordered in the break.
        expect(spec.title.text.join(' ')).toBe(LONG);
    });

    it('breaks over even lines, not one full line and an orphan', () => {
        const lines: string[] = scattered(LONG, 'economist').title.text;
        expect(lines.length).toBeGreaterThan(1);
        const lengths = lines.map((l) => l.length);
        expect(Math.min(...lengths)).toBeGreaterThan(Math.max(...lengths) * 0.6);
    });

    it('takes the lines it gains out of the plot, not out of the canvas', () => {
        const plot = (s: any) => s.config?.view?.continuousHeight;
        expect(plot(titled(LONG))).toBeLessThan(plot(titled('Rain keeps falling')));
    });
});

describe('a closing rule under a banded plot', () => {
    /** The synthetic rect a footerRule is drawn as, if one was drawn. */
    function closingRule(spec: any): any {
        return (spec.vconcat ?? []).find((child: any) => child.__themeSynthetic && child.mark?.type === 'rect');
    }

    function ruled(): any {
        const themeSpec = {
            id: 'ruled',
            label: 'Ruled',
            ink: { surface: { canvas: '#ffffff' }, series: { single: '#333333' } },
            furniture: [{ kind: 'footerRule', anchor: 'bottomLeft', color: '#dcdcdc', height: 1 }],
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

    it('runs the width of the bands, not the width a continuous plot would have taken', () => {
        const spec = ruled();
        const rule = closingRule(spec);
        expect(rule).toBeTruthy();
        const continuous = spec.config?.view?.continuousWidth;
        expect(typeof continuous).toBe('number');
        // Four months at Vega-Lite's own step is nowhere near a continuous plot,
        // and a rule drawn at that width would stretch the canvas to meet it.
        expect(rule.width).toBeLessThan(continuous);
    });
});
