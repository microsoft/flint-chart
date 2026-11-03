// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { changeset, parse, View } from 'vega';
import { compile } from 'vega-lite';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { clickHighlight } from '../src/interactive/interactions';
import { addVegaLiteInteractions, injectVegaInteractionStore } from '../src/vegalite/interactions/compile';
import { DIM_RELATIVE_SIGNAL, DIM_SIGNAL, INTERACTION_STORE } from '../src/vegalite/interactions/stores';
import { INTERACTION_KEY } from '../src/vegalite/interactions/hit-adapter';
import { selectorPredicate } from '../src/core/target-selector';
import { clusterColor, placeRegionCaption } from '../src/core/annotation';
import { EMPHASIS_OPACITY } from '../src/core/interaction-contracts';
import { enclosuresOfUpdates } from '../src/interactive/presentation/annotation';

/**
 * Fixes from the annotation experiment's pilot: emphasis levels that keep the rest readable, keys
 * that match a field drawn as categories, a one-row series that is drawn, region captions that
 * always find a seat, and enclosures that keep their cluster's hue under a theme that outlines dots.
 */

const BARS = ['A', 'B', 'C', 'D'].map((c, i) => ({ c, v: [5, 9, 3, 7][i] }));

function barView(theme?: string) {
    const spec = assembleVegaLite({
        data: { values: BARS }, semantic_types: { c: 'Category', v: 'Quantity' }, ...(theme ? { theme_spec: theme } : {}),
        chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'c' }, y: { field: 'v' } }, chartProperties: { showValueLabels: true } },
    } as any) as any;
    const plan = addVegaLiteInteractions(spec, [clickHighlight({ targets: ['mark'] })]);
    const compiled = compile(spec).spec as any;
    if (plan) injectVegaInteractionStore(compiled, plan);
    return new View(parse(compiled), { renderer: 'none' });
}

function items(view: View, marktype: string): any[] {
    const out: any[] = [];
    const visit = (node: any): void => {
        if (!node) return;
        if (node.marktype === marktype && node.role === 'mark' && Array.isArray(node.items)) out.push(...node.items);
        else if (Array.isArray(node.items)) node.items.forEach(visit);
    };
    visit((view.scenegraph() as any).root);
    return out;
}

describe('emphasis levels', () => {
    it('recede the other marks by the level asked for, and keep their labels readable', async () => {
        const view = barView();
        await view.runAsync();
        const key = items(view, 'rect').find((item) => item.datum.c === 'B').datum[INTERACTION_KEY];
        view.change(INTERACTION_STORE, changeset().insert([{ key }]));
        for (const level of ['light', 'strong', 'exclusive'] as const) {
            view.signal(DIM_SIGNAL, EMPHASIS_OPACITY[level]);
            await view.runAsync();
            const others = items(view, 'rect').filter((item) => item.datum?.c !== undefined && item.datum.c !== 'B');
            expect(others.every((item) => item.opacity === EMPHASIS_OPACITY[level])).toBe(true);
            const labels = items(view, 'text').filter((item) => item.datum?.c && item.datum.c !== 'B');
            // A label recedes no further than half, so its value can still be read.
            expect(labels.every((item) => (item.opacity ?? 1) >= 0.5)).toBe(true);
        }
        expect(EMPHASIS_OPACITY.light).toBeGreaterThan(EMPHASIS_OPACITY.strong);
        expect(EMPHASIS_OPACITY.strong).toBeGreaterThan(EMPHASIS_OPACITY.exclusive);
    });

    it('scales a faded dot\'s own opacity by the level, and a stated opacity replaces it', async () => {
        const values = Array.from({ length: 6 }, (_, i) => ({ x: i, y: i * 2 }));
        const spec = assembleVegaLite({
            data: { values }, semantic_types: { x: 'Quantity', y: 'Quantity' },
            chart_spec: { chartType: 'Scatter Plot', encodings: { x: { field: 'x' }, y: { field: 'y' } } },
        } as any) as any;
        const plan = addVegaLiteInteractions(spec, [clickHighlight({ targets: ['mark'] })]);
        const compiled = compile(spec).spec as any;
        if (plan) injectVegaInteractionStore(compiled, plan);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const dots = () => items(view, 'symbol').filter((item) => item.datum?.x !== undefined);
        const idle = dots()[1].opacity;
        view.change(INTERACTION_STORE, changeset().insert([{ key: dots()[0].datum[INTERACTION_KEY] }]));
        view.signal(DIM_SIGNAL, EMPHASIS_OPACITY.light);
        view.signal(DIM_RELATIVE_SIGNAL, true);
        await view.runAsync();
        expect(dots()[1].opacity).toBeCloseTo(idle * EMPHASIS_OPACITY.light, 6);
        view.signal(DIM_SIGNAL, 0.25);
        view.signal(DIM_RELATIVE_SIGNAL, false);
        await view.runAsync();
        expect(dots()[1].opacity).toBeCloseTo(Math.min(0.25, idle), 6);
    });

    it('turns a receded on-mark label to the page\'s ink', async () => {
        const view = barView('powerbi');
        await view.runAsync();
        const key = items(view, 'rect').find((item) => item.datum.c === 'B').datum[INTERACTION_KEY];
        const before = items(view, 'text').find((item) => item.datum?.c === 'A')?.fill;
        view.change(INTERACTION_STORE, changeset().insert([{ key }]));
        await view.runAsync();
        const after = items(view, 'text').find((item) => item.datum?.c === 'A')?.fill;
        const kept = items(view, 'text').find((item) => item.datum?.c === 'B')?.fill;
        expect(after).not.toBe(before);
        expect(kept).toBe(before);
        // The page is dark, so the label takes a light ink.
        expect(after).toBe('#e6e6e6');
    });
});

describe('a key on a field drawn as categories', () => {
    it('matches the field\'s text values by number', () => {
        const test = selectorPredicate({ select: { key: { Year: 2016 } } } as any, ['Year'])!;
        expect(test({ Year: '2016' })).toBe(true);
        expect(test({ Year: 2016 })).toBe(true);
        expect(test({ Year: '2017' })).toBe(false);
        expect(test({ Year: '' })).toBe(false);
        expect(selectorPredicate({ select: { key: { Year: '2016' } } } as any, ['Year'])!({ Year: 2016 })).toBe(true);
    });
});

describe('a series with one row', () => {
    it('is drawn as a point on a line chart', async () => {
        const values = [
            ...[1, 2, 3].map((x) => ({ x, y: x * 2, s: 'average' })),
            { x: 2, y: 9, s: 'record' },
        ];
        const spec = assembleVegaLite({
            data: { values }, semantic_types: { x: 'Quantity', y: 'Quantity', s: 'Category' },
            chart_spec: { chartType: 'Line Chart', encodings: { x: { field: 'x' }, y: { field: 'y' }, color: { field: 's' } } },
        } as any) as any;
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        await view.runAsync();
        const points = items(view, 'symbol');
        expect(points.map((item) => item.datum.s)).toEqual(['record']);
        // A chart whose series all have several rows draws no extra layer.
        const plain = assembleVegaLite({
            data: { values: values.slice(0, 3) }, semantic_types: { x: 'Quantity', y: 'Quantity', s: 'Category' },
            chart_spec: { chartType: 'Line Chart', encodings: { x: { field: 'x' }, y: { field: 'y' }, color: { field: 's' } } },
        } as any) as any;
        expect(plain.layer).toBeUndefined();
    });
});

describe('a region caption', () => {
    const plot = { x: 0, y: 0, width: 400, height: 300 };
    const layouts = [{ lines: ['No observations for 1982'], width: 130, height: 16 }];

    it('finds a seat when the region is too narrow for the placement asked', () => {
        const placed = placeRegionCaption({
            region: { x: 95, y: 0, width: 12, height: 300 }, axes: { x: true, y: false }, layouts,
            plot, canvas: plot, placement: 'top',
        });
        expect(placed).toBeDefined();
        expect(placed!.box.y).toBeGreaterThanOrEqual(0);
        // Asked for the top, it stands in the upper part of the plot.
        expect(placed!.box.y).toBeLessThan(150);
    });

    it('stands just past a band\'s edge when asked to stand above it, not past the plot', () => {
        const placed = placeRegionCaption({
            region: { x: 20, y: 150, width: 300, height: 40 }, axes: { x: true, y: true }, layouts,
            plot, canvas: { x: 0, y: -60, width: 400, height: 380 }, placement: 'above',
        });
        expect(placed!.box.y + placed!.box.height).toBeLessThanOrEqual(150);
        expect(placed!.box.y).toBeGreaterThan(100);
    });

    it('moves inside a full-height stretch when the header holds the seat above the plot', () => {
        const header = { kind: 'text' as const, box: { x: 0, y: -40, width: 400, height: 36 } };
        const placed = placeRegionCaption({
            region: { x: 100, y: 0, width: 200, height: 300 }, axes: { x: true, y: false }, layouts,
            plot, canvas: { x: 0, y: -60, width: 400, height: 380 }, placement: 'above', obstacles: [header],
        });
        expect(placed!.box.y).toBeGreaterThanOrEqual(0);
    });
});

describe('an enclosure\'s colour', () => {
    it('follows its cluster\'s fill, not the outline a theme draws round every dot', () => {
        const dots = Array.from({ length: 5 }, () => ({ fill: '#1f77b4', stroke: '#000000' }));
        expect(clusterColor(dots, '#fff200')).not.toBe('#000000');
        expect(clusterColor(dots, '#ffffff')).toBe('#1f77b4');
        // Without a fill, the stroke is the cluster's hue.
        expect(clusterColor([{ stroke: '#d62728' }, { stroke: '#d62728' }], '#ffffff')).toBe('#d62728');
    });
});

describe('an enclosure at the edge of the plot', () => {
    const values = [1995, 2000, 2005, 2010, 2015, 2021, 2023].map((year, i) => ({ year, minutes: [81, 95, 115, 103, 95, 151, 155][i] }));
    const chart = (enclosures?: unknown[]) => assembleVegaLite({
        data: { values }, semantic_types: { year: 'Year', minutes: 'Quantity' },
        chart_spec: { chartType: 'Scatter Plot', encodings: { x: { field: 'year' }, y: { field: 'minutes' } } },
        options: enclosures ? { enclosures } : {},
    } as any) as any;
    const xScale = (spec: any) => (spec.encoding?.x ?? spec.layer?.find((l: any) => l.encoding?.x)?.encoding.x).scale ?? {};

    it('pads the axis its outline would cross, and no other', () => {
        const enclosures = enclosuresOfUpdates([{ id: 'late', ops: [{ op: 'annotate-enclosure', name: 'late', value: { targets: [{ select: { where: { year: { range: [2021, 2023] } } } }] } }] }] as any);
        expect(enclosures).toHaveLength(1);
        expect(xScale(chart()).padding).toBeUndefined();
        expect(xScale(chart(enclosures)).padding).toBe(12);
        const middle = enclosuresOfUpdates([{ id: 'mid', ops: [{ op: 'annotate-enclosure', name: 'mid', value: { targets: [{ select: { where: { year: { range: [2005, 2010] } } } }] } }] }] as any);
        expect(xScale(chart(middle)).padding).toBeUndefined();
    });
});
