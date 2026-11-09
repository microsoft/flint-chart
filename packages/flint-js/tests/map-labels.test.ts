// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * A map's names and symbols: `text` labels a point map's points beside them, where each has room, and
 * a choropleth's regions at their middles, where each region holds its label; `shape` tells a point
 * map's points apart.
 */

import { compile } from 'vega-lite';
import { loader, parse, View } from 'vega';
import { expressionInterpreter } from 'vega-interpreter';
import { describe, expect, it } from 'vitest';
import { assembleVegaLite } from '../src';
import { assemblePlotly } from '../src/plotly';
import { planProjection } from '../src/chart-types/geo-frame';
import { withBundledBoundaries } from '../src/vegalite/boundary-loader';
import { LABEL_AT, LABEL_DX, LABEL_DY } from '../src/vegalite/templates/map-labels';

// The assembled spec's own notes (`_warnings`, …) are not Vega-Lite's; a join's key (`__geo_id`) is.
const strip = (spec: any) => JSON.parse(JSON.stringify(spec, (key, value) => (/^_[^_]/.test(key) ? undefined : value)));
const markType = (layer: any) => (typeof layer?.mark === 'string' ? layer.mark : layer?.mark?.type);

const CITIES = ([
    ['Paris', 2.35, 48.86, 2.1], ['London', -0.13, 51.51, 8.9], ['Berlin', 13.4, 52.52, 3.6], ['Madrid', -3.7, 40.42, 3.2],
    ['Rome', 12.5, 41.9, 2.8], ['Brussels', 4.35, 50.85, 1.2], ['Amsterdam', 4.9, 52.37, 0.9], ['Vienna', 16.37, 48.21, 1.9],
    ['Prague', 14.42, 50.08, 1.3], ['Warsaw', 21.0, 52.23, 1.8], ['Lisbon', -9.14, 38.72, 0.5], ['Dublin', -6.26, 53.35, 0.6],
] as const).map(([City, longitude, latitude, Pop]) => ({ City, Kind: Pop > 2 ? 'large' : 'small', longitude, latitude, Pop }));
const US_CITIES = ([
    ['Seattle', -122.33, 47.61], ['San Francisco', -122.42, 37.77], ['Chicago', -87.63, 41.88], ['New York', -74.0, 40.71],
    ['Miami', -80.19, 25.76], ['Anchorage', -149.9, 61.22], ['Honolulu', -157.86, 21.31], ['Dallas', -96.8, 32.78],
] as const).map(([City, longitude, latitude]) => ({ City, longitude, latitude }));

function pointMap(rows: any[], encodings: Record<string, string>, chartProperties: Record<string, unknown> = {}): any {
    return assembleVegaLite({
        data: { values: rows },
        semantic_types: { City: 'Name', Kind: 'Category', Pop: 'Quantity', longitude: 'Longitude', latitude: 'Latitude' },
        chart_spec: { chartType: 'Map', encodings: { longitude: 'longitude', latitude: 'latitude', ...encodings }, chartProperties, canvasSize: { width: 520, height: 420 } },
    } as any);
}

async function scene(spec: any, interpreter = false): Promise<{ root: any; errors: unknown[] }> {
    const errors: unknown[] = [];
    const vega = compile(strip(spec)).spec as any;
    const view = new View(interpreter ? parse(vega, undefined, { ast: true }) : parse(vega), {
        renderer: 'none', loader: withBundledBoundaries(loader()), ...(interpreter ? { expr: expressionInterpreter } : {}),
    } as any);
    view.logger({ level: () => 0, error: (...args: unknown[]) => errors.push(args), warn: () => {}, info: () => {}, debug: () => {} } as any);
    await view.runAsync();
    return { root: (view.scenegraph() as any).root, errors };
}

function items(root: any, keep: (mark: any) => boolean): any[] {
    const found: any[] = [];
    const visit = (node: any) => {
        if (node?.marktype && keep(node)) found.push(...node.items);
        for (const item of node?.items ?? []) visit(item);
    };
    visit(root);
    return found;
}

describe('shape on a point map', () => {
    it('draws its points as filled symbols told apart by shape, in Vega-Lite and Plotly', () => {
        const spec = pointMap(CITIES, { shape: 'Kind', size: 'Pop' });
        const dots = spec.layer.find((layer: any) => layer.encoding?.shape);
        expect(dots.mark).toMatchObject({ type: 'point', filled: true });
        expect(dots.encoding.shape.field).toBe('Kind');
        const markers = assemblePlotly({
            data: { values: CITIES }, semantic_types: { City: 'Name', Kind: 'Category', longitude: 'Longitude', latitude: 'Latitude' },
            chart_spec: { chartType: 'Map', encodings: { longitude: 'longitude', latitude: 'latitude', shape: 'Kind' } },
        } as any).data.find((trace: any) => trace.mode === 'markers');
        expect(new Set(markers.marker.symbol)).toEqual(new Set(['circle', 'square']));
    });
});

describe('labels on a point map', () => {
    it('places each label beside its point, clear of every dot and label, and keeps it there through the live projection', async () => {
        const spec = pointMap(CITIES, { text: 'City', size: 'Pop' });
        const labelLayers = spec.layer.filter((layer: any) => layer.data?.values?.[0]?.[LABEL_AT]);
        expect(labelLayers).toHaveLength(2);
        expect(labelLayers[1].mark).toMatchObject({ type: 'text', align: 'left', baseline: 'middle' });
        // The dots draw no text of their own.
        expect(spec.layer.find((layer: any) => markType(layer) === 'circle').encoding.text).toBeUndefined();
        const { root } = await scene(spec);
        const texts = items(root, (mark) => mark.marktype === 'text' && mark.items?.[0]?.datum?.[LABEL_AT] && mark.items[0].fill !== '#ffffff');
        const dots = items(root, (mark) => mark.marktype === 'symbol' && mark.items?.[0]?.datum?.City !== undefined && !mark.items[0].datum[LABEL_AT]);
        expect(texts).toHaveLength(CITIES.length);
        for (const text of texts) {
            const dot = dots.find((each) => each.datum.City === text.datum.City);
            expect(text.x).toBeCloseTo(dot.x + text.datum[LABEL_DX], 3);
            expect(text.y).toBeCloseTo(dot.y + text.datum[LABEL_DY], 3);
        }
        // No two labels' boxes overlap (their widths as placed: from each text's start).
        const boxes = texts.map((text) => ({ x0: text.x, x1: text.x + String(text.text).length * 5, y0: text.y - 6, y1: text.y + 6 }));
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const [a, b] = [boxes[i], boxes[j]];
            expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1).toBe(false);
        }
    });

    it('works out where points land as Vega will, on a US map as on the world’s', async () => {
        for (const [rows, chartProperties] of [[US_CITIES, {}], [CITIES, {}], [CITIES, { projection: 'orthographic' }]] as const) {
            const spec = pointMap(rows as any, { text: 'City' }, chartProperties);
            const plan = planProjection(spec.projection, [spec.width, spec.height], rows.map((row: any) => [row.longitude, row.latitude]))!;
            const { root } = await scene(spec);
            const dots = items(root, (mark) => mark.marktype === 'symbol' && mark.items?.[0]?.datum?.City !== undefined && !mark.items[0].datum[LABEL_AT]);
            for (const dot of dots) {
                const at = plan([dot.datum.longitude, dot.datum.latitude]);
                if (!at) continue;
                expect(Math.hypot(at[0] - dot.x, at[1] - dot.y)).toBeLessThan(0.5);
            }
        }
    });

    it('leaves a crowded point unlabelled and says how many, and hides a label past a globe’s horizon', () => {
        const crowd = Array.from({ length: 40 }, (_, i) => ({ City: `Place ${i}`, longitude: 2 + (i % 8) * 0.05, latitude: 48 + Math.floor(i / 8) * 0.05 }));
        const spec = pointMap([...crowd, ...CITIES], { text: 'City' });
        const warning = spec._warnings.find((each: any) => each.code === 'map-labels-dropped');
        expect(warning).toMatchObject({ severity: 'info', channel: 'text', field: 'City' });
        const globe = pointMap(CITIES, { text: 'City' }, { projection: 'orthographic' });
        const label = globe.layer.find((layer: any) => layer.data?.values?.[0]?.[LABEL_AT]);
        expect(label.encoding.opacity.condition[0].value).toBe(0);
    });

    it('writes a Plotly label beside each point', () => {
        const trace = assemblePlotly({
            data: { values: CITIES }, semantic_types: { City: 'Name', longitude: 'Longitude', latitude: 'Latitude' },
            chart_spec: { chartType: 'Map', encodings: { longitude: 'longitude', latitude: 'latitude', text: 'City' } },
        } as any).data.find((each: any) => each.type === 'scattergeo' && each.text);
        expect(trace).toMatchObject({ mode: 'markers+text', textposition: 'middle right' });
        expect(trace.text).toContain('Paris');
    });
});

describe('labels on a choropleth', () => {
    const states = [['CA', 39], ['TX', 30], ['MT', 1.1], ['RI', 1.1], ['DE', 1]].map(([State, Pop]) => ({ State, Pop }));
    const choropleth = (rows: any[], encodings: Record<string, string>) => assembleVegaLite({
        data: { values: rows }, semantic_types: { State: 'State', Pop: 'Quantity' },
        chart_spec: { chartType: 'Choropleth', encodings, canvasSize: { width: 560, height: 380 } },
    } as any);

    it('names each region at its middle, where it holds the label, and only regions with a row', async () => {
        const spec: any = choropleth(states, { id: 'State', color: 'Pop', text: 'State' });
        const labels = spec.layer.filter((layer: any) => markType(layer) === 'text');
        // A halo in the regions' own colours (unseen inside a region), then the label.
        expect(labels).toHaveLength(2);
        expect(labels[0].mark).toMatchObject({ filled: false });
        expect(labels[0].encoding.color).toMatchObject({ field: 'Pop', legend: null });
        expect(spec.resolve.legend.color).toBe('independent');
        // The label's text and width travel with the join.
        const lookup = labels[1].transform.find((step: any) => step.lookup);
        expect(lookup.from.fields).toEqual(expect.arrayContaining(['State', 'flintLabelW']));
        const { root, errors } = await scene(spec, true);
        expect(errors).toEqual([]);
        const drawn = items(root, (mark) => mark.marktype === 'text' && mark.items?.[0]?.datum?.flintLabelW !== undefined && !mark.items[0].stroke);
        const shown = (state: string) => drawn.find((item) => item.datum.State === state)?.opacity !== 0;
        expect(drawn.map((item) => item.datum.State).sort()).toEqual(['CA', 'DE', 'MT', 'RI', 'TX']);
        // White on the darkest fills, the dark ink on the lightest: whichever reads better on each.
        const ink = (state: string) => drawn.find((item) => item.datum.State === state)?.fill;
        expect(ink('CA')).toBe('#ffffff');
        expect(ink('MT')).toBe('#2b2f33');
        // A big state holds its label; Rhode Island and Delaware are too small at this size.
        expect(['CA', 'TX', 'MT'].every(shown)).toBe(true);
        expect(shown('RI') || shown('DE')).toBe(false);
    });

    it('writes a Plotly label at each region’s middle', () => {
        const traces = assemblePlotly({
            data: { values: states }, semantic_types: { State: 'State', Pop: 'Quantity' },
            chart_spec: { chartType: 'Choropleth', encodings: { id: 'State', color: 'Pop', text: 'State' } },
        } as any).data;
        const text = traces.find((trace: any) => trace.type === 'scattergeo');
        expect(text).toMatchObject({ mode: 'text', locationmode: 'USA-states' });
        expect(text.text).toEqual(['CA', 'TX', 'MT', 'RI', 'DE']);
    });
});
