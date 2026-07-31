// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';
import { markTypeOf } from '../src/vegalite/theme';
import { THEME_PRESETS, listThemePresets, resolveThemeSpec } from '../src/core/theme/presets';
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
