// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';
import { markTypeOf } from '../src/vegalite/theme';
import { THEME_PRESETS, DEFAULT_THEME_ICON, listThemePresets, resolveThemeSpec } from '../src/core/theme/presets';
import type { ThemeSpec } from '../src/core/theme/types';

/**
 * A house may hold preferences about how a chart is *built*, not only how it
 * looks: which options a chart type takes by default, and what the compiler
 * should assume about size and stretch.
 *
 * Both are the middle of three levels. What the caller wrote in the chart spec
 * wins; the house comes next; flint's own defaults come last.
 */

const DATA = [
    { Year: 2019, Sales: 12 },
    { Year: 2020, Sales: 18 },
    { Year: 2021, Sales: 15 },
    { Year: 2022, Sales: 24 },
];

function theme(extra: Partial<ThemeSpec>): ThemeSpec {
    return {
        id: 'house',
        label: 'House',
        ink: { surface: { canvas: '#ffffff' }, series: { single: '#333333' } },
        ...extra,
    } as ThemeSpec;
}

function build(themeSpec: ThemeSpec, chartProperties?: Record<string, unknown>) {
    return assembleVegaLite({
        data: { values: DATA },
        semantic_types: { Year: 'Year', Sales: 'Quantity' },
        chart_spec: {
            chartType: 'Line Chart',
            encodings: { x: 'Year', y: 'Sales' },
            ...(chartProperties ? { chartProperties } : {}),
        },
        theme_spec: themeSpec,
    } as any) as any;
}

function markOf(spec: any): any {
    const node = spec.layer?.find((l: any) => l.mark && !l.__themeSynthetic) ?? spec;
    return typeof node.mark === 'string' ? { type: node.mark } : node.mark;
}

describe('naming a house Flint ships', () => {
    it('reads the same as passing that house in full', () => {
        const named = build('economist' as any);
        const spelled = build(THEME_PRESETS.economist.spec);
        expect(named._theme?.id).toBe('economist');
        expect(JSON.stringify(named)).toBe(JSON.stringify(spelled));
    });

    it('says so when the name is not one of ours', () => {
        expect(() => build('the-guardian' as any)).toThrow(/economist/);
    });

    it('lists every house it can resolve', () => {
        for (const { id } of listThemePresets()) {
            expect(resolveThemeSpec(id)).toBe(THEME_PRESETS[id].spec);
        }
    });

    /**
     * The guidance names a number of colours, and a number in prose drifts the
     * moment the palette beside it changes. It is the same number, so it has to
     * stay the same number — however the house chooses to word it.
     */
    it('states a colour count the house actually declares', () => {
        for (const preset of Object.values(THEME_PRESETS)) {
            const line = preset.guidance.split('\n')
                .find(l => /colour|key/i.test(l));
            const stated = line && /(\d+)/.exec(line);
            expect(stated, `${preset.id} says nothing about colour`).toBeTruthy();
            const series = preset.spec.ink.series as any;
            const declared = preset.spec.legend?.maxSwatches
                ?? (series.categorical as string[]).length;
            expect(Number(stated![1]), `${preset.id}`).toBe(declared);
        }
    });

    it('keeps the Economist zero rule structural rather than accent red', () => {
        const ink = THEME_PRESETS.economist.spec.ink;
        expect(ink.structure?.zero).toBe(ink.structure?.axis);
        expect(ink.structure?.zero).not.toBe(ink.accent);
    });
});

describe('cartoon mark character', () => {
    function scatter(count: number) {
        const values = Array.from({ length: count }, (_, i) => ({
            X: i % 100,
            Y: (i * 37) % 101,
        }));
        return assembleVegaLite({
            data: { values },
            semantic_types: { X: 'Quantity', Y: 'Quantity' },
            chart_spec: {
                chartType: 'Scatter Plot',
                encodings: { x: 'X', y: 'Y' },
                baseSize: { width: 380, height: 320 },
            },
            theme_spec: THEME_PRESETS.cartoon.spec,
        } as any) as any;
    }

    function connected(themeSpec: ThemeSpec, count: number) {
        const values = Array.from({ length: count }, (_, i) => ({
            Step: i,
            X: 50 + Math.sin(i / 4) * 20,
            Y: 50 + Math.cos(i / 5) * 20,
        }));
        return assembleVegaLite({
            data: { values },
            semantic_types: { Step: 'Order', X: 'Quantity', Y: 'Quantity' },
            chart_spec: {
                chartType: 'Connected Scatter Plot',
                encodings: { x: 'X', y: 'Y', order: 'Step' },
            },
            theme_spec: themeSpec,
        } as any) as any;
    }

    it('puts the dark sticker edge around filled points', () => {
        const spec = scatter(12);
        expect(spec.config.point.stroke).toBe('#2e2b28');
        expect(spec.config.point.strokeWidth).toBe(2.5);
        expect(spec.config.point.size).toBe(170);

        const line = build(THEME_PRESETS.cartoon.spec);
        expect(line.config.line.point.stroke).toBe('#2e2b28');
        expect(line.config.line.point.strokeWidth).toBe(2.5);
    });

    it('uses the lab weight and breathing room for chart furniture', () => {
        const spec = scatter(12);
        for (const axis of [spec.config.axisX, spec.config.axisY]) {
            expect(axis.domainWidth).toBe(2.5);
            expect(axis.labelPadding).toBe(7);
        }
        expect(spec.config.axisX.gridWidth).toBe(0);
        expect(spec.config.axisY.gridWidth).toBe(1.5);
    });

    it('shrinks a dense point cloud without flattening sparse dots', () => {
        const dense = scatter(500);
        expect(dense.config.point.size).toBeLessThan(170);
        expect(dense.config.point.size).toBeGreaterThanOrEqual(36);
        expect(dense.config.point.strokeWidth).toBeLessThan(2.5);
        expect(JSON.stringify(dense._theme?.report ?? [])).toContain('cover too much');
    });

    it('leaves area axis geometry to Vega-Lite', () => {
        const spec = assembleVegaLite({
            data: {
                values: [
                    { Year: 2020, Region: 'A', Value: 10 },
                    { Year: 2021, Region: 'A', Value: 14 },
                    { Year: 2020, Region: 'B', Value: 5 },
                    { Year: 2021, Region: 'B', Value: 8 },
                ],
            },
            semantic_types: { Year: 'Year', Region: 'Category', Value: 'Quantity' },
            chart_spec: {
                chartType: 'Area Chart',
                encodings: { x: 'Year', y: 'Value', color: 'Region' },
                chartProperties: { stackMode: 'stack' },
            },
            theme_spec: THEME_PRESETS.cartoon.spec,
        } as any) as any;
        const spine = spec.layer?.find((layer: any) =>
            layer.__themeSynthetic && markTypeOf(layer.mark) === 'rule' && layer.encoding?.x?.value === 0);
        expect(spine).toBeUndefined();
        expect(JSON.stringify(spec._theme?.report ?? [])).not.toContain('closing edge');
    });

    it('lifts the band axis over surface-stroked bars instead of redrawing it', () => {
        const spec = assembleVegaLite({
            data: { values: [{ Group: 'A', Value: 10 }, { Group: 'B', Value: 14 }] },
            semantic_types: { Group: 'Category', Value: 'Quantity' },
            chart_spec: {
                chartType: 'Bar Chart',
                encodings: { x: 'Value', y: 'Group' },
            },
            theme_spec: THEME_PRESETS.swiss.spec,
        } as any) as any;

        // No invented geometry: the old fix appended a rule at the measure's
        // zero, which sat a hair off the real domain and doubled it.
        const baseline = spec.layer?.find((layer: any) =>
            markTypeOf(layer.mark) === 'rule' &&
            layer.encoding?.x?.datum === 0 &&
            layer.encoding?.y === null);
        expect(baseline).toBeUndefined();

        // The band axis Vega already draws is simply drawn last.
        const bar = spec.layer?.find((l: any) => markTypeOf(l.mark) === 'bar');
        expect(bar.mark.stroke).toBe('#f4f1ea');
        expect(bar.encoding.y.axis.zindex).toBe(1);
        // The measure axis carries the grid, so it must stay behind the bars.
        expect(bar.encoding.x.axis?.zindex).toBeUndefined();
        expect(JSON.stringify(spec._theme?.report ?? [])).toContain('band axis is drawn over the bars');
    });

    it('leaves the band axis alone for a house that does not stroke its bars', () => {
        const spec = assembleVegaLite({
            data: { values: [{ Group: 'A', Value: 10 }, { Group: 'B', Value: 14 }] },
            semantic_types: { Group: 'Category', Value: 'Quantity' },
            chart_spec: {
                chartType: 'Bar Chart',
                encodings: { x: 'Value', y: 'Group' },
            },
            theme_spec: THEME_PRESETS.economist.spec,
        } as any) as any;
        const bar = spec.layer?.find((l: any) => markTypeOf(l.mark) === 'bar') ?? spec;
        expect(bar.encoding?.y?.axis?.zindex).toBeUndefined();
    });

    it('holds the sticker corner to a share of the bar it rounds', () => {
        const bars = (count: number) => assembleVegaLite({
            data: {
                values: Array.from({ length: count }, (_, i) => ({
                    G: `Cat${i}`, V: 100 + ((i * 37) % 400),
                })),
            },
            semantic_types: { G: 'Category', V: 'Quantity' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: 'G', y: 'V' } },
            theme_spec: THEME_PRESETS.cartoon.spec,
        } as any) as any;

        const barMark = (spec: any) =>
            (spec.layer ?? [spec]).find((l: any) => markTypeOf(l.mark) === 'bar')?.mark;

        // Wide bars have room for the house's full roundness.
        expect(bars(5).config.bar.cornerRadiusEnd).toBe(10);
        expect(barMark(bars(5))?.cornerRadiusEnd).toBeUndefined();

        // Thin bars keep the same *fraction* instead of being rounded away.
        const thin = bars(60);
        const radius = barMark(thin)?.cornerRadiusEnd;
        expect(radius).toBeLessThan(10);
        expect(radius).toBeGreaterThan(0);
        expect(JSON.stringify(thin._theme?.report ?? [])).toContain('round the bar away');
    });

    it('keeps a crowded trajectory in the lab dot-to-line proportion', () => {
        const diameter = (size: number) => 2 * Math.sqrt(size / Math.PI);
        const ratioOf = (spec: any) => {
            const mark = markOf(spec);
            return diameter(mark.point.size) / (mark.strokeWidth ?? spec.config.line.strokeWidth);
        };

        const sparse = connected(THEME_PRESETS.cartoon.spec, 8);
        // Untouched, the house's own bead: 170px² on a 5px line.
        expect(markOf(sparse).point.size).toBe(170);
        expect(markOf(sparse).strokeWidth).toBeUndefined();

        // The dot and the line shrink together, so the proportion the house
        // authored survives the crowding rather than fattening with it.
        for (const count of [20, 35, 55]) {
            const spec = connected(THEME_PRESETS.cartoon.spec, count);
            expect(markOf(spec).point.size).toBeLessThan(170);
            expect(markOf(spec).strokeWidth).toBeLessThan(5);
            expect(ratioOf(spec)).toBeCloseTo(ratioOf(sparse), 1);
        }
    });

    it('keeps connected dots in the line ink and scales a crowded cartoon path', () => {
        const swiss = connected(THEME_PRESETS.swiss.spec, 55);
        const swissMark = markOf(swiss);
        expect(swissMark.point.color).toBe(swissMark.color);
        expect(swissMark.strokeWidth).toBeUndefined();
        expect(swiss.config.line.strokeWidth).toBe(3);

        const cartoon = connected(THEME_PRESETS.cartoon.spec, 55);
        const cartoonMark = markOf(cartoon);
        expect(cartoonMark.point.color).toBe(cartoonMark.color);
        expect(cartoonMark.point.size).toBeLessThan(170);
        expect(cartoonMark.point.strokeWidth).toBeLessThan(2.5);
        expect(cartoonMark.strokeWidth).toBeLessThan(5);
        expect(JSON.stringify(cartoon._theme?.report ?? [])).toContain('same bead on the same string');
    });
});

describe('theme chartDefaults', () => {
    it('applies a house option the caller did not state', () => {
        const spec = build(theme({ chartDefaults: { 'Line Chart': { showPoints: true } } }));
        expect(markOf(spec).point).toBeTruthy();
    });

    it('yields to the same option stated in the chart spec', () => {
        const spec = build(
            theme({ chartDefaults: { 'Line Chart': { showPoints: true } } }),
            { showPoints: false },
        );
        expect(markOf(spec).point).toBeFalsy();
        expect(JSON.stringify(spec._theme?.report ?? [])).toContain('showPoints');
    });

    it('drops an option the chart type does not declare, and says so', () => {
        const spec = build(theme({ chartDefaults: { '*': { notAnOption: 3 } } }));
        expect(JSON.stringify(spec._theme?.report ?? [])).toContain('notAnOption');
    });
});

describe('theme compileDefaults', () => {
    it('supplies a base size the chart spec left open', () => {
        const wide = build(theme({ compileDefaults: { baseSize: { width: 640, height: 400 } } }));
        const narrow = build(theme({ compileDefaults: { baseSize: { width: 300, height: 400 } } }));
        expect(wide._width).toBeGreaterThan(narrow._width);
    });

    it('yields to a base size the chart spec states', () => {
        const stated = (themeSpec: ThemeSpec) => assembleVegaLite({
            data: { values: DATA },
            semantic_types: { Year: 'Year', Sales: 'Quantity' },
            chart_spec: {
                chartType: 'Line Chart',
                encodings: { x: 'Year', y: 'Sales' },
                baseSize: { width: 300, height: 200 },
            },
            theme_spec: themeSpec,
        } as any) as any;
        const housePrefersWide = stated(theme({ compileDefaults: { baseSize: { width: 900, height: 700 } } }));
        const houseSaysNothing = stated(theme({}));
        expect(housePrefersWide._width).toBe(houseSaysNothing._width);
    });
});

describe('theme annotation.unitsInAxisTitle', () => {
    const withUnit = (themeSpec: ThemeSpec) => assembleVegaLite({
        data: { values: DATA },
        semantic_types: {
            Year: 'Year',
            Sales: { semanticType: 'Amount', unit: 'kg' },
        },
        chart_spec: { chartType: 'Line Chart', encodings: { x: 'Year', y: 'Sales' } },
        theme_spec: themeSpec,
    } as any) as any;

    function yTitle(spec: any): unknown {
        const node = spec.layer?.find((l: any) => l.encoding?.y) ?? spec;
        return node.encoding?.y?.axis?.title;
    }

    it('states the unit in the title where the house keeps titles', () => {
        const spec = withUnit(theme({
            annotation: { axisTitles: 'always', unitsInAxisTitle: true },
        }));
        expect(yTitle(spec)).toBe('Sales (kg)');
    });

    it('leaves the title alone where the house has no such rule', () => {
        const spec = withUnit(theme({ annotation: { axisTitles: 'always' } }));
        expect(yTitle(spec)).not.toBe('Sales (kg)');
    });
});

describe('theme annotation.pointEmphasis', () => {
    const emphasised = (spec: any) => (spec.layer ?? []).filter(
        (l: any) => l.__themeSynthetic && markTypeOf(l.mark) === 'point',
    );

    it('dots the latest reading on a line', () => {
        const spec = build(theme({ annotation: { pointEmphasis: 'latest' } }));
        const dots = emphasised(spec);
        expect(dots).toHaveLength(1);
        expect(JSON.stringify(dots[0].transform)).toContain('row_number');
    });

    it('says nothing where the line already shows every point', () => {
        const spec = build(
            theme({ annotation: { pointEmphasis: 'latest' } }),
            { showPoints: true },
        );
        expect(emphasised(spec)).toHaveLength(0);
        expect(JSON.stringify(spec._theme?.report ?? [])).toContain('already shows every observation');
    });
});

describe('a printed value carries the unit no axis can', () => {
    const SHARES = [
        { Browser: 'Chrome', Share: 65 },
        { Browser: 'Safari', Share: 20 },
        { Browser: 'Edge', Share: 10 },
        { Browser: 'Other', Share: 5 },
    ];
    const pie = (extra: Partial<ThemeSpec>) => assembleVegaLite({
        data: { values: SHARES },
        semantic_types: { Browser: 'Category', Share: 'Quantity' },
        chart_spec: { chartType: 'Pie Chart', encodings: { size: 'Share', color: 'Browser' } },
        theme_spec: theme({
            dataLabels: { show: 'always', placement: 'atMark', inkMode: 'fixed' },
            ...extra,
        }),
    } as any) as any;

    function labelText(spec: any): any {
        const walk = (node: any, owner: any): any => {
            if (!node || typeof node !== 'object') return undefined;
            if (markTypeOf(node.mark) === 'text') return { text: node.encoding?.text, transform: owner?.transform };
            for (const key of ['layer', 'vconcat', 'hconcat', 'concat'] as const) {
                for (const child of node[key] ?? []) {
                    const found = walk(child, node);
                    if (found) return found;
                }
            }
            return node.spec ? walk(node.spec, node.spec) : undefined;
        };
        return walk(spec, spec) ?? {};
    }

    it('appends the unit to each slice value', () => {
        const spec = pie({ annotation: { unit: 'lastTick' } });
        const { text, transform } = labelText(spec);
        expect(text?.field).toBe('__flintValueWithUnit');
        expect(JSON.stringify(transform)).toContain('%');
    });

    it('carries the share % even where the house states no unit', () => {
        // A pie slice summing to 100 *is* a percentage — the % is the number's
        // meaning, not a house flourish, and the pie has no axis to hold it. So
        // it rides on the value whatever the house's axis-unit policy.
        const { text, transform } = labelText(pie({}));
        expect(text?.field).toBe('__flintValueWithUnit');
        expect(JSON.stringify(transform)).toContain('%');
    });

    it('leaves raw amounts bare — a pie that is not shares keeps its numbers', () => {
        const AMOUNTS = [
            { Browser: 'Chrome', Share: 650 },
            { Browser: 'Safari', Share: 200 },
            { Browser: 'Edge', Share: 100 },
            { Browser: 'Other', Share: 50 },
        ];
        const spec = assembleVegaLite({
            data: { values: AMOUNTS },
            semantic_types: { Browser: 'Category', Share: 'Quantity' },
            chart_spec: { chartType: 'Pie Chart', encodings: { size: 'Share', color: 'Browser' } },
            theme_spec: theme({
                dataLabels: { show: 'always', placement: 'atMark', inkMode: 'fixed' },
            }),
        } as any) as any;
        const { text } = labelText(spec);
        expect(text?.field).toBe('Share');
    });
});

describe('a cell in a grid is a position', () => {
    const GRID = [
        { City: 'Cairo', Month: 'Jan', Temp: 14 },
        { City: 'Cairo', Month: 'Feb', Temp: 16 },
        { City: 'Oslo', Month: 'Jan', Temp: -4 },
        { City: 'Oslo', Month: 'Feb', Temp: -2 },
    ];
    const heatmap = (themeSpec: ThemeSpec) => assembleVegaLite({
        data: { values: GRID },
        semantic_types: { City: 'Category', Month: 'Category', Temp: 'Quantity' },
        chart_spec: { chartType: 'Heatmap', encodings: { x: 'Month', y: 'City', color: 'Temp' } },
        theme_spec: themeSpec,
    } as any) as any;

    it('prints the value in the cell, in ink that follows the ramp', () => {
        const spec = heatmap(theme({
            dataLabels: { show: 'always', placement: 'atMark', inkMode: 'contrastWithMark' },
            ink: {
                surface: { canvas: '#ffffff' },
                series: { single: '#333333', sequential: { stops: ['#eef3f8', '#051c2c'] } },
            },
        } as Partial<ThemeSpec>));
        const label = (spec.layer ?? []).find(
            (l: any) => l.__themeSynthetic && markTypeOf(l.mark) === 'text',
        );
        expect(label).toBeTruthy();
        expect(label.encoding.text.field).toBe('Temp');
        expect(label.mark.baseline).toBe('middle');
        expect(label.encoding.color.condition?.test).toContain('Temp');
    });
});

/**
 * A wedge sits in no band, so the gap between two of them has to come out of
 * the shapes themselves. The house says how wide, and says it separately from
 * how it rules its bars — a half-pixel hairline that keeps two stacked
 * segments apart disappears entirely on a circle.
 */
describe('holding wedges apart', () => {
    const SHARE = [
        { Browser: 'Chrome', Share: 65 },
        { Browser: 'Safari', Share: 12 },
        { Browser: 'Edge', Share: 12 },
        { Browser: 'Firefox', Share: 6 },
        { Browser: 'Other', Share: 5 },
    ];
    const pie = (themeSpec: ThemeSpec, innerRadius = 0) => assembleVegaLite({
        data: { values: SHARE },
        semantic_types: { Browser: 'Category', Share: 'Percentage' },
        chart_spec: {
            chartType: innerRadius ? 'Donut Chart' : 'Pie Chart',
            encodings: { size: 'Share', color: 'Browser' },
            ...(innerRadius ? { chartProperties: { innerRadius } } : {}),
        },
        theme_spec: themeSpec,
    } as any) as any;

    const arcOf = (spec: any): any => {
        let found: any;
        JSON.stringify(spec, (_k, v) => {
            if (!found && v && (v.type === 'arc' || v === 'arc')) found = v;
            return v;
        });
        return found;
    };

    it('cuts the wedges with a rule in the surface', () => {
        const spec = pie(theme({
            marks: { slice: { gap: 1.5 } },
        } as Partial<ThemeSpec>));
        const arc = arcOf(spec);
        expect(arc.strokeWidth).toBe(1.5);
        expect(arc.stroke).toBe('#ffffff');
    });

    it('holds a donut apart the same way', () => {
        const arc = arcOf(pie(theme({ marks: { slice: { gap: 2 } } } as Partial<ThemeSpec>), 50));
        expect(arc.strokeWidth).toBe(2);
    });

    /**
     * A house that says nothing about wedges is not silent: it has already
     * said how it holds adjoining marks apart.
     */
    it('falls back to the way the house rules its bars', () => {
        const arc = arcOf(pie(theme({
            marks: { separator: { presence: 'hairline', source: 'surface', width: 1 } },
        } as Partial<ThemeSpec>)));
        expect(arc.strokeWidth).toBe(1);
    });

    it('leaves the wedges flush when the house holds nothing apart', () => {
        const arc = arcOf(pie(theme({})));
        expect(arc.strokeWidth).toBeUndefined();
    });

    it('swings the wedges apart when the house asks for an angle', () => {
        const spec = pie(theme({
            marks: { slice: { gap: 4, gapStyle: 'pad' } },
        } as Partial<ThemeSpec>));
        const arc = arcOf(spec);
        expect(arc.padAngle).toBeGreaterThan(0);
        expect(arc.stroke).toBeUndefined();
        // 5 wedges at 4px is well inside what the circumference can give.
        expect(arc.padAngle).toBeLessThan((2 * Math.PI * 0.15) / 5);
    });

    /**
     * Past a point the gaps are the chart. The house's width is honoured until
     * the pads would take a sixth of the circle between them.
     */
    it('holds the angle where the wedges would run out', () => {
        const many = Array.from({ length: 40 }, (_, i) => ({ Browser: `B${i}`, Share: 1 }));
        const spec = assembleVegaLite({
            data: { values: many },
            semantic_types: { Browser: 'Category', Share: 'Percentage' },
            chart_spec: { chartType: 'Pie Chart', encodings: { size: 'Share', color: 'Browser' } },
            theme_spec: theme({ marks: { slice: { gap: 8, gapStyle: 'pad' } } } as Partial<ThemeSpec>),
        } as any) as any;
        const arc = arcOf(spec);
        expect(arc.padAngle).toBeCloseTo((2 * Math.PI * 0.15) / 40, 6);
        expect(spec._theme.report.some((r: any) => /held at/.test(r.message))).toBe(true);
    });
});

/**
 * Two things a house says that nothing used to read: how much ink a connector
 * deserves, and how far a label sits from the mark it names.
 */
describe('stems and the labels above them', () => {
    const CO2 = [
        { Country: 'Qatar', Tonnes: 37 },
        { Country: 'UAE', Tonnes: 22 },
        { Country: 'India', Tonnes: 2 },
    ];
    const lollipop = (themeSpec: ThemeSpec) => assembleVegaLite({
        data: { values: CO2 },
        semantic_types: { Country: 'Country', Tonnes: 'Quantity' },
        chart_spec: { chartType: 'Lollipop Chart', encodings: { x: 'Country', y: 'Tonnes' } },
        theme_spec: themeSpec,
    } as any) as any;

    const layerWith = (spec: any, type: string): any => {
        let found: any;
        walkSpec(spec, (n) => {
            if (!found && n.mark && (n.mark.type ?? n.mark) === type) found = n;
        });
        return found;
    };
    function walkSpec(node: any, visit: (n: any) => void): void {
        if (!node || typeof node !== 'object') return;
        visit(node);
        for (const key of ['layer', 'hconcat', 'vconcat', 'concat']) {
            for (const child of node[key] ?? []) walkSpec(child, visit);
        }
        if (node.spec) walkSpec(node.spec, visit);
    }

    /**
     * The stem states a distance whose two ends are already drawn, so it is
     * structure, not a series.
     */
    it('demotes the stem to the house\'s structural hairline', () => {
        const spec = lollipop(theme({
            marks: { connector: { presence: 'hairline', weight: 1 } },
            ink: {
                surface: { canvas: '#ffffff' },
                series: { single: '#18a1cd' },
                structure: { rule: '#333333' },
            },
        } as Partial<ThemeSpec>));
        const stem = layerWith(spec, 'rule');
        expect(stem.mark.strokeWidth).toBe(1);
        expect(stem.mark.color).toBeTruthy();
        expect(stem.mark.color).not.toBe('#18a1cd');
    });

    /**
     * The offset is measured from the anchor, and a dot's anchor is its
     * centre: the gap has to clear the radius before it is a gap at all.
     */
    it('clears the dot before it starts counting the gap', () => {
        const spec = lollipop(theme({
            dataLabels: { show: 'always', placement: 'outsideMark' },
        } as Partial<ThemeSpec>));
        const label = layerWith(spec, 'text');
        const dot = layerWith(spec, 'circle') ?? layerWith(spec, 'point');
        const radius = Math.round(Math.sqrt(dot.mark.size / Math.PI));
        expect(radius).toBeGreaterThan(0);
        expect(label.mark.dy).toBe(-(4 + radius));
    });
});

describe('what a connector and a fit are allowed to say', () => {
    /**
     * A gridline is read through and sits at the bottom of the ordinal. A
     * connector is read as part of the mark, so a house whose rules are
     * already pale needs somewhere else to scale from.
     */
    it('scales the connector from its own ink where the house states one', () => {
        const spec = assembleVegaLite({
            data: { values: [{ Country: 'Qatar', Tonnes: 37 }, { Country: 'India', Tonnes: 2 }] },
            semantic_types: { Country: 'Country', Tonnes: 'Quantity' },
            chart_spec: { chartType: 'Lollipop Chart', encodings: { x: 'Country', y: 'Tonnes' } },
            theme_spec: theme({
                marks: { connector: { presence: 'full', weight: 1, style: 'dashed' } },
                ink: {
                    surface: { canvas: '#ffffff' },
                    series: { single: '#18a1cd' },
                    structure: { rule: '#dcdcdc', connector: '#c8c8c8' },
                },
            } as Partial<ThemeSpec>),
        } as any) as any;
        let stem: any;
        JSON.stringify(spec, (_k, v) => {
            if (!stem && v?.type === 'rule') stem = v;
            return v;
        });
        expect(stem.color).toBe('#c8c8c8');
        expect(stem.strokeDash).toEqual([4, 3]);
    });

    /**
     * A point on a line marks a reading. A fitted line has none: its vertices
     * are where the fit was sampled.
     */
    it('keeps the house\'s vertex points off a fitted line', () => {
        const rows = Array.from({ length: 12 }, (_, i) => ({ HP: 40 + i * 15, MPG: 40 - i * 2 }));
        const spec = assembleVegaLite({
            data: { values: rows },
            semantic_types: { HP: 'Quantity', MPG: 'Quantity' },
            chart_spec: {
                chartType: 'Regression',
                encodings: { x: 'HP', y: 'MPG' },
                chartProperties: { regressionMethod: 'linear' },
            },
            theme_spec: theme({
                marks: { point: { presence: 'full', size: 26 } },
            } as Partial<ThemeSpec>),
        } as any) as any;
        const fit = (spec.layer ?? []).find(
            (l: any) => (l.transform ?? []).some((t: any) => t.regression || t.loess),
        );
        expect(fit).toBeTruthy();
        expect(fit.mark.point).toBe(false);
        expect(spec.config.line.point).toBeTruthy();
    });
});

/**
 * Two dots and two connectors that a single number would get wrong. A vertex
 * marker is found against a line the eye is already on; a scatter's dot is
 * alone on the plot. A stem repeats a position already plotted; a bridge draws
 * a distance plotted nowhere else.
 */
describe('what a connector joins, and what a dot has to carry alone', () => {
    const PAIRS = [
        { Country: 'Japan', Sex: 'Male', Years: 81.5 }, { Country: 'Japan', Sex: 'Female', Years: 87.6 },
        { Country: 'Brazil', Sex: 'Male', Years: 69.0 }, { Country: 'Brazil', Sex: 'Female', Years: 76.0 },
        { Country: 'Nigeria', Sex: 'Male', Years: 51.0 }, { Country: 'Nigeria', Sex: 'Female', Years: 54.0 },
    ];

    const marks = (spec: any): any[] => {
        const out: any[] = [];
        JSON.stringify(spec, (_k, v) => {
            if (v && typeof v === 'object' && typeof v.type === 'string' && v.type !== 'quantitative') out.push(v);
            return v;
        });
        return out;
    };

    const dumbbell = (themeExtra: Partial<ThemeSpec>): any => assembleVegaLite({
        data: { values: PAIRS },
        semantic_types: { Country: 'Category', Sex: 'Category', Years: 'Quantity' },
        chart_spec: { chartType: 'Ranged Dot Plot', encodings: { y: 'Country', x: 'Years', color: 'Sex' } },
        theme_spec: theme(themeExtra as any),
    } as any) as any;

    it('draws the bridge at a mark\'s weight, not the stem\'s', () => {
        const spec = dumbbell({
            marks: {
                strokeWeight: 2,
                connector: { presence: 'full', weight: 0.8, spanWeight: 3 },
            },
            ink: { surface: { canvas: '#ffffff' }, structure: { rule: '#d3dce1' } },
        } as Partial<ThemeSpec>);
        const bridge = marks(spec).find((m: any) => m.type === 'line');
        expect(bridge.strokeWidth).toBe(3);
        // …and in structure's ink, not the ink of either dot it joins.
        expect(bridge.color).toBe('#d3dce1');
    });

    it('gives a silent house a bridge of its own line weight', () => {
        const spec = dumbbell({
            marks: { strokeWeight: 1.6, connector: { presence: 'full', weight: 0.8 } },
            ink: { surface: { canvas: '#ffffff' }, structure: { rule: '#d3dce1' } },
        } as Partial<ThemeSpec>);
        expect(marks(spec).find((m: any) => m.type === 'line').strokeWidth).toBe(1.6);
    });

    it('sizes a dot the same wherever one is drawn', () => {
        const rows = Array.from({ length: 12 }, (_, i) => ({ HP: 40 + i * 15, MPG: 40 - i * 2 }));
        const spec = assembleVegaLite({
            data: { values: rows },
            semantic_types: { HP: 'Quantity', MPG: 'Quantity' },
            chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'HP', y: 'MPG' } },
            theme_spec: theme({
                marks: { point: { presence: 'full', size: 45 } },
            } as Partial<ThemeSpec>),
        } as any) as any;
        // The scatter is drawn as `circle`, which has its own config block —
        // sizing `point` alone would have missed it entirely.
        expect(spec.config.circle.size).toBe(45);
        expect(spec.config.point.size).toBe(45);
        expect(spec.config.line.point.size).toBe(45);
    });
});

/**
 * A cell adjoins on both axes and its fill is the reading, so how far apart
 * cells stand is not the same question as how far apart bars stand — and it is
 * a real difference between houses: flush cells read as a continuous field,
 * cut cells as a table of separate readings.
 */
describe('holding cells apart', () => {
    const GRID = [
        { City: 'Cairo', Month: 'Jan', Temp: 14 }, { City: 'Cairo', Month: 'Feb', Temp: 15 },
        { City: 'Moscow', Month: 'Jan', Temp: -9 }, { City: 'Moscow', Month: 'Feb', Temp: -7 },
    ];

    const heatmap = (themeExtra: Partial<ThemeSpec>): any => assembleVegaLite({
        data: { values: GRID },
        semantic_types: { City: 'Category', Month: 'Category', Temp: 'Quantity' },
        chart_spec: { chartType: 'Heatmap', encodings: { x: 'Month', y: 'City', color: 'Temp' } },
        theme_spec: theme(themeExtra as any),
    } as any) as any;

    const cell = (spec: any): any => {
        let found: any;
        JSON.stringify(spec, (_k, v) => {
            if (!found && v?.type === 'rect') found = v;
            return v;
        });
        return found;
    };

    it('cuts the cells apart in the surface, not in an ink the scale never named', () => {
        const spec = heatmap({
            marks: { tile: { gap: 1 } },
            ink: { surface: { canvas: '#ffffff' } },
        } as Partial<ThemeSpec>);
        expect(cell(spec).strokeWidth).toBe(1);
        expect(cell(spec).stroke).toBe('#ffffff');
    });

    it('leaves the field continuous where the house cuts nothing', () => {
        const spec = heatmap({ ink: { surface: { canvas: '#ffffff' } } } as Partial<ThemeSpec>);
        // Untouched, the mark is still the bare string the template wrote.
        expect(cell(spec)?.strokeWidth).toBeUndefined();
    });

    it('holds cells apart the way it holds bars apart when it says nothing', () => {
        const spec = heatmap({
            marks: { separator: { presence: 'hairline', source: 'surface', width: 1.5 } },
            ink: { surface: { canvas: '#ffffff' } },
        } as Partial<ThemeSpec>);
        expect(cell(spec).strokeWidth).toBe(1.5);
    });
});

/**
 * A size or opacity encoding is a *value* key, not a series-name key. A bubble
 * map has no colour series — its whole legend is the size scale — so the
 * "no series legend" decision must not sweep the size key away with it.
 */
describe('keeping a value key when there is no series legend', () => {
    const CITIES = [
        { City: 'Tokyo', lon: 139, lat: 35, Pop: 37 },
        { City: 'Delhi', lon: 77, lat: 28, Pop: 32 },
        { City: 'Cairo', lon: 31, lat: 30, Pop: 22 },
    ];
    const bubble = (themeSpec: ThemeSpec) => assembleVegaLite({
        data: { values: CITIES },
        semantic_types: { City: 'Category', lon: 'Longitude', lat: 'Latitude', Pop: 'Quantity' },
        chart_spec: {
            chartType: 'Scatter Plot',
            encodings: { x: 'lon', y: 'lat', size: 'Pop' },
        },
        theme_spec: themeSpec,
    } as any) as any;

    function sizeEnc(spec: any): any {
        let found: any;
        walkSpec(spec, (n) => {
            const e = n.encoding?.size;
            if (e?.field === 'Pop') found = e;
        });
        return found;
    }
    function walkSpec(node: any, visit: (n: any) => void): void {
        if (!node || typeof node !== 'object') return;
        visit(node);
        for (const key of ['layer', 'concat', 'hconcat', 'vconcat', 'spec']) {
            const child = (node as any)[key];
            if (Array.isArray(child)) child.forEach((c) => walkSpec(c, visit));
            else if (child) walkSpec(child, visit);
        }
    }

    it('does not null the size legend when the chart names no series', () => {
        const spec = bubble(theme({ ink: { surface: { canvas: '#ffffff' } } } as Partial<ThemeSpec>));
        const size = sizeEnc(spec);
        expect(size).toBeTruthy();
        expect(size.legend).not.toBeNull();
    });
});

/**
 * A composed chart has no single plot. Anything that budgets a mark against
 * the room it has must ask the view the mark is drawn in, not the outermost
 * one, or a narrow panel is measured against a plot several times its size.
 */
describe('vertex dots are budgeted against the panel that holds them', () => {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const SPARK = MONTHS.flatMap((Month, i) =>
        ['Revenue', 'Users'].map((Metric) => ({ Metric, Month, Value: 10 + i + (Metric === 'Users' ? 5 : 0) })),
    );

    function walkScoped(node: any, outerW: number | undefined, visit: (n: any, w?: number) => void): void {
        if (!node || typeof node !== 'object') return;
        const w = typeof node.width === 'number' ? node.width : outerW;
        visit(node, w);
        for (const key of ['layer', 'concat', 'hconcat', 'vconcat']) {
            if (Array.isArray(node[key])) node[key].forEach((c: any) => walkScoped(c, w, visit));
        }
        if (node.spec) walkScoped(node.spec, w, visit);
        if (node.facet?.spec) walkScoped(node.facet.spec, w, visit);
    }

    /** Edge-to-edge ink of a dot: `size` is an area, and the stroke straddles. */
    function outerDiameter(size: number, strokeWidth: number): number {
        return 2 * Math.sqrt(size / Math.PI) + strokeWidth;
    }

    function sparkline(themeId: string): any {
        return assembleVegaLite({
            data: { values: SPARK },
            semantic_types: { Metric: 'Category', Month: 'Category', Value: 'Quantity' },
            chart_spec: {
                chartType: 'Sparkline',
                encodings: { x: 'Month', y: 'Value', color: 'Metric' },
                baseSize: { width: 300, height: 300 },
            },
            theme_spec: THEME_PRESETS[themeId].spec,
        } as any) as any;
    }

    it('shrinks the cartoon dot so it fits the gap between two readings', () => {
        const spec = sparkline('cartoon');
        let checked = 0;
        walkScoped(spec, spec._width, (node, width) => {
            const mark = node.mark;
            if (markTypeOf(mark) !== 'line' || typeof mark !== 'object') return;
            const dot = mark.point ?? spec.config?.line?.point;
            if (!dot || typeof dot !== 'object') return;
            expect(typeof width).toBe('number');
            // One reading per month along this panel.
            const spacing = (width as number) / MONTHS.length;
            expect(outerDiameter(dot.size, dot.strokeWidth ?? 0)).toBeLessThanOrEqual(spacing);
            checked++;
        });
        expect(checked).toBeGreaterThan(0);
    });

    it('leaves the dot alone where the panel is wide enough to hold it', () => {
        // The same house and the same twelve readings across a full-width plot
        // keep the authored size — the rule reacts to room, not to count.
        const spec = assembleVegaLite({
            data: { values: MONTHS.map((Month, i) => ({ Month, Value: 10 + i })) },
            semantic_types: { Month: 'Month', Value: 'Quantity' },
            chart_spec: {
                chartType: 'Line Chart',
                encodings: { x: 'Month', y: 'Value' },
                baseSize: { width: 600, height: 300 },
            },
            theme_spec: THEME_PRESETS['cartoon'].spec,
        } as any) as any;
        const authored = THEME_PRESETS['cartoon'].spec.marks?.point?.size;
        expect(spec.config.line.point.size).toBe(authored);
        let overridden = false;
        walkScoped(spec, spec._width, (node) => {
            const mark = node.mark;
            if (markTypeOf(mark) !== 'line' || typeof mark !== 'object') return;
            if (mark.point && typeof mark.point === 'object' && mark.point.size != null) overridden = true;
        });
        expect(overridden).toBe(false);
    });
});

/**
 * A KPI card is drawn entirely in pixels, so none of it reaches the theme
 * through an encoding. Its progress bar is nonetheless the one part of the
 * tile that states a measurement, and it has to carry the house's ink.
 */
describe('KPI card progress bar takes house ink', () => {
    const KPIS = [
        { metric: 'Behind', value: 20, goal: 100 },
        { metric: 'On track', value: 70, goal: 100 },
        { metric: 'Exceeded', value: 130, goal: 100 },
    ];

    function card(themeId: string): any {
        return assembleVegaLite({
            data: { values: KPIS },
            semantic_types: { metric: 'Category', value: 'Quantity', goal: 'Quantity' },
            chart_spec: {
                chartType: 'KPI Card',
                encodings: { metric: 'metric', value: 'value', goal: 'goal' },
                baseSize: { width: 600, height: 240 },
            },
            theme_spec: THEME_PRESETS[themeId].spec,
        } as any) as any;
    }

    function bars(spec: any): Record<string, string> {
        const out: Record<string, string> = {};
        const visit = (n: any): void => {
            if (!n || typeof n !== 'object') return;
            if (Array.isArray(n)) { n.forEach(visit); return; }
            if (n.__themeRole && n.mark?.type === 'rect') out[n.__themeRole] = n.mark.fill;
            for (const k of Object.keys(n)) visit(n[k]);
        };
        visit(spec);
        return out;
    }

    for (const id of Object.keys(THEME_PRESETS)) {
        it(`${id}: the in-progress bar is the house's own ink`, () => {
            const spec = card(id);
            const found = bars(spec);
            expect(found.accent).toBe(THEME_PRESETS[id].spec.ink?.series?.single);
        });

        it(`${id}: met and missed stay distinguishable from in-progress`, () => {
            const found = bars(card(id));
            expect(found.accent).toBeTruthy();
            expect(found.positive).toBeTruthy();
            expect(found.negative).toBeTruthy();
            // A verdict painted the same ink as "still going" says nothing.
            expect(found.positive).not.toBe(found.accent);
            expect(found.negative).not.toBe(found.accent);
            expect(found.positive).not.toBe(found.negative);
        });
    }
});

/**
 * A dumbbell's connector is not a third series. It joins one row's two dots,
 * so whichever dot's ink it borrows it credits that dot with the whole span —
 * and, worse, the line leaving that dot becomes indistinguishable from the dot
 * itself. The bridge has to be structural: quiet, and its own colour.
 */
describe('ranged dot connector', () => {
    const ROWS = ['USA', 'China', 'Japan', 'Germany'].flatMap((c, i) => [
        { Country: c, Value: 30 + i * 5, Metric: 'Min' },
        { Country: c, Value: 70 + i * 5, Metric: 'Max' },
    ]);

    function dumbbell(themeId: string): any {
        return assembleVegaLite({
            data: { values: ROWS },
            semantic_types: { Country: 'Country', Value: 'Quantity', Metric: 'Category' },
            chart_spec: {
                chartType: 'Ranged Dot Plot',
                encodings: { x: 'Value', y: 'Country', color: 'Metric' },
                baseSize: { width: 480, height: 320 },
            },
            theme_spec: THEME_PRESETS[themeId].spec,
        } as any) as any;
    }

    // A house may wrap the plot (datawrapper puts its key in a `vconcat`), so
    // neither the bridge nor the dots are reliably a top-level layer.
    function collect(spec: any): { bridge?: any; range: string[] } {
        let bridge: any;
        const range: string[] = [];
        const visit = (n: any): void => {
            if (!n || typeof n !== 'object') return;
            if (Array.isArray(n)) { n.forEach(visit); return; }
            if (n.mark && markTypeOf(n.mark) === 'line' && !bridge) bridge = n;
            const r = n.encoding?.color?.scale?.range;
            if (Array.isArray(r)) range.push(...r);
            for (const k of Object.keys(n)) if (k !== 'data') visit(n[k]);
        };
        visit(spec);
        return { bridge, range };
    }

    for (const id of Object.keys(THEME_PRESETS)) {
        it(`${id}: the bridge carries none of the dots' colour`, () => {
            const { bridge, range } = collect(dumbbell(id));
            expect(bridge).toBeTruthy();
            expect(range.length).toBeGreaterThan(1);

            const ink = bridge.mark?.color;
            expect(ink).toBeTruthy();
            for (const series of range) {
                expect(String(ink).toLowerCase()).not.toBe(String(series).toLowerCase());
            }
        });
    }
});

/**
 * Three rules about where a chart's walls are, and what may paint over them.
 */
describe('plot edges', () => {
    const STRIP = ['Control', 'Treatment A', 'Treatment B'].flatMap((g) =>
        [38, 55, 72, 88, 100].map((v) => ({ Group: g, Score: v + g.length })));

    function strip(themeId: string): any {
        return assembleVegaLite({
            data: { values: STRIP },
            semantic_types: { Group: 'Category', Score: 'Quantity' },
            chart_spec: {
                chartType: 'Strip Plot',
                encodings: { x: 'Group', y: 'Score' },
                baseSize: { width: 480, height: 320 },
            },
            theme_spec: THEME_PRESETS[themeId].spec,
        } as any) as any;
    }

    // A house that draws no domain at all is not making a point about zero.
    const RULES_A_DOMAIN = Object.keys(THEME_PRESETS).filter((id) => {
        const c = strip(id).config ?? {};
        return c.axisY?.domainColor && c.axisY.domainColor !== 'transparent';
    });

    it('some house draws a domain, so the rule is actually under test', () => {
        expect(RULES_A_DOMAIN.length).toBeGreaterThan(0);
    });

    for (const id of RULES_A_DOMAIN) {
        it(`${id}: a strip plot keeps the wall under its categories`, () => {
            // Nothing on a strip plot is measured from the bottom of the plot,
            // so the line there is a wall, not a false zero.
            expect(strip(id).config?.axisX?.domain).not.toBe(false);
        });
    }

    for (const id of Object.keys(THEME_PRESETS)) {
        it(`${id}: dots are given room to sit inside the axes`, () => {
            const spec = strip(id);
            const pads: number[] = [];
            const visit = (n: any): void => {
                if (!n || typeof n !== 'object') return;
                if (Array.isArray(n)) { n.forEach(visit); return; }
                const p = n.encoding?.y?.scale?.padding;
                if (typeof p === 'number') pads.push(p);
                for (const k of Object.keys(n)) if (k !== 'data') visit(n[k]);
            };
            visit(spec);
            expect(pads.length).toBeGreaterThan(0);
            // Room enough for the radius of the dot the house draws.
            expect(Math.min(...pads)).toBeGreaterThan(0);
        });

        it(`${id}: a grid never repaints the spine it lands on`, () => {
            const spec = strip(id);
            const cfg = spec.config ?? {};
            const gridded = (['x', 'y'] as const).filter((ch) => {
                const c = cfg[ch === 'x' ? 'axisX' : 'axisY'];
                return c?.grid && c.gridColor && c.gridColor !== 'transparent';
            });
            for (const ch of gridded) {
                const other = cfg[ch === 'x' ? 'axisY' : 'axisX'];
                const spine = other?.domain !== false && other?.domainColor
                    && other.domainColor !== 'transparent';
                if (!spine) continue;
                let conditional = false;
                const visit = (n: any): void => {
                    if (!n || typeof n !== 'object') return;
                    if (Array.isArray(n)) { n.forEach(visit); return; }
                    const g = n.encoding?.[ch]?.axis?.gridColor;
                    if (g && typeof g === 'object' && g.condition) conditional = true;
                    for (const k of Object.keys(n)) if (k !== 'data') visit(n[k]);
                };
                visit(spec);
                expect(conditional).toBe(true);
            }
        });
    }

    for (const id of RULES_A_DOMAIN) {
        it(`${id}: a dumbbell keeps the wall beside its rows`, () => {
            // Same narrowing, the other way round: the dumbbell's value scale
            // floats and its rows are bands, but the dots are read against the
            // ticks, not measured from the left-hand wall.
            const spec: any = assembleVegaLite({
                data: {
                    values: ['USA', 'China', 'Japan'].flatMap((c, i) => [
                        { Country: c, Value: 30 + i * 5, Metric: 'Min' },
                        { Country: c, Value: 70 + i * 5, Metric: 'Max' },
                    ]),
                },
                semantic_types: { Country: 'Country', Value: 'Quantity', Metric: 'Category' },
                chart_spec: {
                    chartType: 'Ranged Dot Plot',
                    encodings: { x: 'Value', y: 'Country', color: 'Metric' },
                    baseSize: { width: 480, height: 320 },
                },
                theme_spec: THEME_PRESETS[id].spec,
            } as any);
            expect(spec.config?.axisY?.domain).not.toBe(false);
        });
    }
});

describe('group dividers', () => {
    // A dashed rule between one group of boxes and the next is written as
    // `bandPosition: 1` — the end of the band, which is the middle of the gap
    // only while there is no gap. Every house opens one, so the divider has to
    // move with it or it reads as the left-hand group's own right edge.
    // Sparse on purpose: dividers are drawn only when the lanes are packed
    // locally, which is what a house does when not every group has every level.
    const rows = ['Eng', 'Sales', 'HR', 'Ops', 'Legal'].flatMap((dept, d) =>
        ['L1', 'L2', 'L3', 'L4', 'L5'].slice(d % 3, (d % 3) + 2).flatMap((level) =>
            [90, 100, 110, 120].map((v, i) => ({ Department: dept, Level: level, Comp: v * 1000 + i })),
        ),
    );
    let anyDrawn = false;

    for (const id of Object.keys(THEME_PRESETS)) {
        it(`${id}: centres group dividers in the gap between bands`, () => {
            const spec: any = assembleVegaLite({
                data: { values: rows },
                semantic_types: { Department: 'Category', Level: 'Category', Comp: 'Currency' },
                chart_spec: {
                    chartType: 'Boxplot',
                    encodings: { x: 'Department', y: 'Comp', color: 'Level' },
                    baseSize: { width: 480, height: 320 },
                },
                theme_spec: THEME_PRESETS[id].spec,
            } as any);

            let padding: number | undefined;
            const positions: number[] = [];
            const collect = (node: any): void => {
                if (!node || typeof node !== 'object') return;
                for (const channel of ['x', 'y'] as const) {
                    const e = node.encoding?.[channel];
                    if (e?.field !== 'Department') continue;
                    if (typeof e.scale?.paddingInner === 'number') padding = e.scale.paddingInner;
                    if (typeof e.bandPosition === 'number' && !node.encoding[`${channel}2`]) {
                        positions.push(e.bandPosition);
                    }
                }
                for (const key of ['layer', 'vconcat', 'hconcat', 'concat']) {
                    if (Array.isArray(node[key])) node[key].forEach(collect);
                }
                if (node.spec) collect(node.spec);
                if (node.facet?.spec) collect(node.facet.spec);
            };
            collect(spec);

            if (positions.length === 0) return; // this house's layout drew no dividers
            anyDrawn = true;
            const p = padding ?? 0;
            // Band start + this many band widths lands halfway across the gap.
            const expected = 1 + p / (2 * (1 - p));
            for (const got of positions) expect(got).toBeCloseTo(expected, 6);
        });
    }

    it('draws dividers at all', () => {
        expect(anyDrawn).toBe(true);
    });
});

describe('legibility on the house surface', () => {
    const luminance = (hex: string): number => {
        const h = hex.replace('#', '');
        const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
        const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
            .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string): number => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
    };
    const surfaceOf = (spec: any): string =>
        spec.config?.view?.fill ?? spec.config?.background ?? spec.background ?? '#ffffff';

    const boxRows = ['Eng', 'Sales', 'HR'].flatMap((dept) =>
        ['L1', 'L2'].flatMap((level) =>
            [90, 100, 110, 120].map((v, i) => ({ Department: dept, Level: level, Comp: v * 1000 + i })),
        ),
    );

    for (const id of Object.keys(THEME_PRESETS)) {
        it(`${id}: box plot whiskers stay legible when the box takes a colour channel`, () => {
            const spec: any = assembleVegaLite({
                data: { values: boxRows },
                semantic_types: { Department: 'Category', Level: 'Category', Comp: 'Currency' },
                chart_spec: {
                    chartType: 'Boxplot',
                    encodings: { x: 'Department', y: 'Comp', color: 'Level' },
                    baseSize: { width: 480, height: 320 },
                },
                theme_spec: THEME_PRESETS[id].spec,
            } as any);

            const inks: string[] = [];
            const collect = (node: any): void => {
                if (!node || typeof node !== 'object') return;
                const mark = typeof node.mark === 'string' ? { type: node.mark } : node.mark;
                if (mark?.type === 'boxplot' && (node.encoding?.color?.field || node.encoding?.fill?.field)) {
                    inks.push(mark.rule?.color ?? mark.color ?? '#000000');
                }
                for (const key of ['layer', 'vconcat', 'hconcat', 'concat']) {
                    if (Array.isArray(node[key])) node[key].forEach(collect);
                }
                if (node.spec) collect(node.spec);
                if (node.facet?.spec) collect(node.facet.spec);
            };
            collect(spec);

            expect(inks.length).toBeGreaterThan(0);
            const surface = surfaceOf(spec);
            for (const ink of inks) expect(contrast(ink, surface)).toBeGreaterThan(3);
        });

        it(`${id}: radar axis labels stay legible on the house surface`, () => {
            const spec: any = assembleVegaLite({
                data: {
                    values: ['A', 'B'].flatMap((team) =>
                        ['Speed', 'Attack', 'Tactics', 'Stamina'].map((axis, i) => ({
                            Team: team, Measure: axis, Score: 40 + i * 12,
                        })),
                    ),
                },
                semantic_types: { Team: 'Category', Measure: 'Category', Score: 'Quantity' },
                chart_spec: {
                    chartType: 'Radar Chart',
                    encodings: { x: 'Measure', y: 'Score', color: 'Team' },
                    baseSize: { width: 480, height: 360 },
                },
                theme_spec: THEME_PRESETS[id].spec,
            } as any);

            const inks: string[] = [];
            const collect = (node: any): void => {
                if (!node || typeof node !== 'object') return;
                const mark = typeof node.mark === 'string' ? { type: node.mark } : node.mark;
                if (mark?.type === 'text' && node.encoding?.text?.value !== undefined) {
                    const ink = mark.fill ?? mark.color;
                    if (typeof ink === 'string') inks.push(ink);
                }
                for (const key of ['layer', 'vconcat', 'hconcat', 'concat']) {
                    if (Array.isArray(node[key])) node[key].forEach(collect);
                }
                if (node.spec) collect(node.spec);
                if (node.facet?.spec) collect(node.facet.spec);
            };
            collect(spec);

            expect(inks.length).toBeGreaterThan(0);
            const surface = surfaceOf(spec);
            for (const ink of inks) expect(contrast(ink, surface)).toBeGreaterThan(3);
        });
    }
});

describe('house icons', () => {
    // A picker has to say what a house looks like before the reader has seen a
    // chart in it. The icons are how it does that, so they have to be present,
    // well-formed, and — the point of the set — distinguishable from each other.
    const icons = Object.entries(THEME_PRESETS).map(([id, preset]) => [id, preset.icon] as const);

    for (const [id, icon] of icons) {
        it(`${id}: ships a self-contained 16px SVG`, () => {
            expect(icon).toMatch(/^<svg\b/);
            expect(icon).toMatch(/<\/svg>$/);
            // Self-contained: a bare `<svg>` element without the namespace does
            // not render from an `<img src>` or a data URL.
            expect(icon).toContain('xmlns="http://www.w3.org/2000/svg"');
            expect(icon).toContain('viewBox="0 0 16 16"');
            // No external references — an icon that fetches is an icon that
            // fails offline, and these ship inside the package.
            expect(icon).not.toMatch(/\b(?:href|src|url\()/);
        });

        it(`${id}: is drawn in colours the house actually uses`, () => {
            const spec: any = THEME_PRESETS[id].spec;
            const declared = new Set<string>(
                JSON.stringify(spec)
                    .match(/#[0-9a-fA-F]{6}/g)
                    ?.map((hex) => hex.toLowerCase()) ?? [],
            );
            const series: string[] = spec.ink?.series?.categorical ?? [];
            // The three bars are the first three of the house's own set: an icon
            // that invents a palette is a promise the chart will not keep.
            for (const hex of series.slice(0, 3)) expect(icon.toLowerCase()).toContain(hex.toLowerCase());
            // The tile is the house's canvas where it states one.
            const canvas = spec.ink?.surface?.canvas;
            if (canvas) expect(icon.toLowerCase()).toContain(String(canvas).toLowerCase());
            expect(declared.size).toBeGreaterThan(0);
        });
    }

    it('gives every house a different picture', () => {
        const seen = new Map<string, string>();
        for (const [id, icon] of icons) {
            const clash = seen.get(icon);
            expect(clash, `${id} and ${clash} share an icon`).toBeUndefined();
            seen.set(icon, id);
        }
        expect(seen.size).toBe(icons.length);
    });

    it('offers "no house" its own picture too', () => {
        expect(DEFAULT_THEME_ICON).toMatch(/^<svg\b/);
        for (const [, icon] of icons) expect(icon).not.toBe(DEFAULT_THEME_ICON);
    });

    it('keeps the pictures out of the catalogue an agent reads', () => {
        // `listThemePresets` is what a model reads to choose a house. An SVG it
        // cannot see is context spent for nothing.
        for (const entry of listThemePresets()) {
            expect(entry).not.toHaveProperty('icon');
            expect(JSON.stringify(entry)).not.toContain('<svg');
        }
    });
});
