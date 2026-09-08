// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Runtime detail levels on a projected chart.
 *
 * A Choropleth with `level: 'auto'` draws one layer per US level behind a
 * level signal. These tests cover the assembled layers and join table, the
 * compiled fit that ignores the level gate, and a live view whose level flips
 * with the zoom without a rebuild.
 */

import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import { describe, expect, it } from 'vitest';
import { assembleVegaLite } from '../src';
import { navigate } from '../src/interactive/interactions';
import {
    addVegaLiteInteractions,
    injectVegaGeoLevelFit,
    injectVegaGeoNavigationSignals,
} from '../src/vegalite/interactions/compile';
import {
    createVegaGeoNavigationController,
    GEO_EXTENT_SIGNAL,
    GEO_LEVEL_SIGNAL,
    GEO_PROJECTION_SIGNAL,
    geometryContainsPoint,
    resolveGeoLevel,
} from '../src/vegalite/interactions/navigation-geo';

const GUARD = { minVisibleFraction: 0.02, maxVisibleFraction: 1, overscrollFraction: 0 };
const JOIN = '__flint_geo_join';

const feature = (id: number, ring: number[][]) => ({
    type: 'Feature', id, properties: {}, geometry: { type: 'Polygon', coordinates: [ring] },
});
/** One state block; two county blocks that cover only its middle, so a county-only fit would differ. */
const STATE_FEATURES = [feature(6, [[-120, 32], [-100, 32], [-100, 44], [-120, 44], [-120, 32]])];
const COUNTY_FEATURES = [
    feature(6037, [[-118, 34], [-112, 34], [-112, 42], [-118, 42], [-118, 34]]),
    feature(6059, [[-112, 34], [-106, 34], [-106, 42], [-112, 42], [-112, 34]]),
];
const ROWS = [
    { Region: 'CA', Place: 'California', Value: 0.1 },
    { Region: 6037, Place: 'Los Angeles, CA', Value: -0.5 },
    { Region: 6059, Place: 'Orange, CA', Value: 0.4 },
];

function autoChoropleth(): any {
    return assembleVegaLite({
        data: { values: ROWS },
        semantic_types: { Region: 'State', Place: 'Category', Value: 'Quantity' },
        chart_spec: {
            chartType: 'Choropleth',
            encodings: { id: 'Region', color: 'Value', detail: 'Place' },
            chartProperties: { region: 'us', level: 'auto' },
        },
    } as any);
}

async function mountedAutoChoropleth() {
    const spec = autoChoropleth();
    spec.layer[0].data = { values: STATE_FEATURES };
    spec.layer[1].data = { values: COUNTY_FEATURES };
    const plan = addVegaLiteInteractions(spec, [navigate()])!;
    const compiled = compile(spec).spec as any;
    const axes = injectVegaGeoNavigationSignals(compiled, plan.navigationChannels);
    injectVegaGeoLevelFit(compiled, plan.geoLevels!);
    const view = new View(parse(compiled), { renderer: 'none' });
    await view.runAsync();
    const controller = createVegaGeoNavigationController(view, axes, plan.geoLevels);
    return { view, controller, compiled };
}

/** Items per shape mark, in layer order. */
const shapeCounts = (view: any): number[] => view.scenegraph().root.items[0].items
    .filter((mark: any) => mark.marktype === 'shape')
    .map((mark: any) => mark.items.length);

describe('choropleth auto level assembly', () => {
    it('draws one gated layer per level over a shared join table', () => {
        const spec = autoChoropleth();
        expect(spec.mark).toBeUndefined();
        expect(spec.layer.map((layer: any) => layer.data.format.feature)).toEqual(['states', 'counties']);
        expect(spec.layer.map((layer: any) => layer.transform[0].filter)).toEqual([
            `${GEO_LEVEL_SIGNAL} === "state"`,
            `${GEO_LEVEL_SIGNAL} === "county"`,
        ]);
        expect(spec.params).toEqual([{ name: GEO_LEVEL_SIGNAL, value: 'state' }]);
        // State codes and county FIPS ids resolve into one numeric id space.
        expect(spec.datasets[JOIN].map((row: any) => row.__geo_id)).toEqual([6, 6037, 6059]);
        for (const layer of spec.layer) {
            expect(layer.transform[1].lookup).toBe('id');
            expect(layer.transform[1].from.data.name).toBe(JOIN);
        }
        expect(spec.projection.type).toBe('albersUsa');
        expect(spec.encoding.color.field).toBe('Value');
    });

    it('hands the levels to the interaction plan rather than the spec', () => {
        const spec = autoChoropleth();
        expect(spec._geoLevels).toBeUndefined();
        expect(spec._interactionSemantics.geoLevels).toEqual({
            signal: GEO_LEVEL_SIGNAL,
            levels: [{ name: 'state' }, { name: 'county', enter: 20, exit: 28 }],
        });
        const plan = addVegaLiteInteractions(spec, [navigate()])!;
        expect(plan.geoLevels?.signal).toBe(GEO_LEVEL_SIGNAL);
        const compiled = compile(spec).spec as any;
        expect(compiled.signals.map((signal: any) => signal.name)).toContain(GEO_LEVEL_SIGNAL);
        expect(compiled.projections).toHaveLength(1);
    });

    it('keeps the single-level choropleth unchanged', () => {
        const spec = assembleVegaLite({
            data: { values: ROWS.slice(0, 1) },
            semantic_types: { Region: 'State', Place: 'Category', Value: 'Quantity' },
            chart_spec: { chartType: 'Choropleth', encodings: { id: 'Region', color: 'Value' } },
        } as any) as any;
        expect(spec.layer).toBeUndefined();
        expect(spec.params).toBeUndefined();
        expect(spec._interactionSemantics.geoLevels).toBeUndefined();
        expect(spec.data.format.feature).toBe('states');
    });
});

describe('level resolution', () => {
    const levels = [{ name: 'state' }, { name: 'county', enter: 20, exit: 28 }];

    it('enters a finer level at its threshold and leaves it only above the exit span', () => {
        expect(resolveGeoLevel(40, 'state', levels)).toBe('state');
        expect(resolveGeoLevel(19, 'state', levels)).toBe('county');
        expect(resolveGeoLevel(25, 'state', levels)).toBe('state');
        expect(resolveGeoLevel(25, 'county', levels)).toBe('county');
        expect(resolveGeoLevel(29, 'county', levels)).toBe('state');
    });

    it('keeps the current level when the span is unknown', () => {
        expect(resolveGeoLevel(Number.NaN, 'county', levels)).toBe('county');
        expect(resolveGeoLevel(Number.NaN, undefined, levels)).toBe('state');
        expect(resolveGeoLevel(5, undefined, [])).toBeUndefined();
    });
});

describe('level fit and swap', () => {
    it('fits the coarsest level alone and gates it downstream of the fit', async () => {
        const { view, compiled } = await mountedAutoChoropleth();
        const gateOf = (level: string) => (transform: any) =>
            transform.type === 'filter' && transform.expr === `${GEO_LEVEL_SIGNAL} === "${level}"`;
        const datasets: any[] = compiled.data;
        // The state gate now sits in a dataset derived from the fitted source.
        const derived = datasets.find((dataset) => dataset.transform?.some(gateOf('state')));
        expect(derived.source).toBeDefined();
        expect(derived.name).toBe(`${derived.source}_state`);
        expect(derived.transform).toEqual([{ type: 'filter', expr: `${GEO_LEVEL_SIGNAL} === "state"` }]);
        const source = datasets.find((dataset) => dataset.name === derived.source);
        expect(source.transform?.some(gateOf('state')) ?? false).toBe(false);
        expect(compiled.marks[0].from.data).toBe(derived.name);
        expect(compiled.projections[0].fit).toEqual({ signal: `data("${source.name}")` });
        // The county gate stays where Vega-Lite put it, ahead of the county mark.
        const counties = datasets.find((dataset) => dataset.transform?.some(gateOf('county')));
        expect(compiled.marks[1].from.data).toBe(counties.name);
        view.finalize();
    });

    it('flips the level with the zoom and keeps the projection fit across the swap', async () => {
        const { view, controller } = await mountedAutoChoropleth();
        expect(view.signal(GEO_LEVEL_SIGNAL)).toBe('state');
        expect(controller.level!()).toBe('state');
        expect(shapeCounts(view)).toEqual([1, 0]);
        const initialScale = view.signal(GEO_PROJECTION_SIGNAL).scale();

        const zoom = controller.resolve({
            type: 'navigation', phase: 'commit', operation: 'zoom', axes: 'xy',
            factor: 4, anchor: { x: 0.5, y: 0.5 },
        }, GUARD)!;
        const [west, east] = zoom.value.x!.map(Number);
        expect(east - west).toBeLessThan(20);
        expect(controller.apply(zoom)).toBe(true);
        await view.runAsync();
        expect(view.signal(GEO_LEVEL_SIGNAL)).toBe('county');
        expect(controller.level!()).toBe('county');
        expect(shapeCounts(view)).toEqual([0, 2]);
        // The fit still follows the state outline, so the zoom is exactly fourfold.
        expect(view.signal(GEO_PROJECTION_SIGNAL).scale()).toBeCloseTo(initialScale * 4);

        // The runtime re-applies a retained viewport after a reset on every
        // render; the remembered level comes back with it.
        controller.apply({ op: 'set-viewport', axes: 'xy', value: {} });
        expect(controller.level!()).toBe('state');
        controller.apply(zoom);
        expect(controller.level!()).toBe('county');

        const reset = controller.resolve({
            type: 'navigation', phase: 'commit', operation: 'reset', axes: 'xy',
        }, GUARD)!;
        controller.apply(reset);
        await view.runAsync();
        expect(view.signal(GEO_EXTENT_SIGNAL)).toBeNull();
        expect(view.signal(GEO_LEVEL_SIGNAL)).toBe('state');
        expect(shapeCounts(view)).toEqual([1, 0]);
        view.finalize();
    });

    it('picks the level for an external longitude box', async () => {
        const { view, controller } = await mountedAutoChoropleth();
        expect(controller.apply({ op: 'set-viewport', axes: 'xy', value: { x: [-116, -108], y: [35, 41] } })).toBe(true);
        await view.runAsync();
        expect(view.signal(GEO_LEVEL_SIGNAL)).toBe('county');
        expect(shapeCounts(view)).toEqual([0, 2]);
        expect(controller.apply({ op: 'set-viewport', axes: 'xy', value: { x: [-125, -95], y: [30, 46] } })).toBe(true);
        await view.runAsync();
        expect(view.signal(GEO_LEVEL_SIGNAL)).toBe('state');
        view.finalize();
    });
});

describe('point in region', () => {
    it('tests polygons with holes and multipolygons', () => {
        const withHole = {
            type: 'Polygon',
            coordinates: [
                [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
                [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
            ],
        };
        expect(geometryContainsPoint(withHole, [2, 2])).toBe(true);
        expect(geometryContainsPoint(withHole, [5, 5])).toBe(false);
        expect(geometryContainsPoint(withHole, [12, 5])).toBe(false);
        const two = { type: 'MultiPolygon', coordinates: [withHole.coordinates, [[[20, 0], [30, 0], [30, 10], [20, 10], [20, 0]]]] };
        expect(geometryContainsPoint(two, [25, 5])).toBe(true);
        expect(geometryContainsPoint(two, [15, 5])).toBe(true === false);
        expect(geometryContainsPoint({ type: 'Point', coordinates: [1, 1] }, [1, 1])).toBe(false);
    });

    it('unrolls a ring that straddles the antimeridian', () => {
        const aleutian = { type: 'Polygon', coordinates: [[[170, 50], [-170, 50], [-170, 55], [170, 55], [170, 50]]] };
        expect(geometryContainsPoint(aleutian, [178, 52])).toBe(true);
        expect(geometryContainsPoint(aleutian, [-178, 52])).toBe(true);
        expect(geometryContainsPoint(aleutian, [0, 52])).toBe(false);
    });
});

describe('focus region', () => {
    it('names the coarsest-level region under the plot centre from its joined row', async () => {
        const { view, controller } = await mountedAutoChoropleth();
        // Frame the state's middle: a narrow box, so the county level shows
        // while the state layer holds no shapes at all.
        expect(controller.apply({ op: 'set-viewport', axes: 'xy', value: { x: [-116, -108], y: [35, 41] } })).toBe(true);
        await view.runAsync();
        expect(view.signal(GEO_LEVEL_SIGNAL)).toBe('county');
        expect(shapeCounts(view)).toEqual([0, 2]);
        const focus = controller.focus!()!;
        expect(focus).toMatchObject({ id: 6, Region: 'CA', Place: 'California', Value: 0.1 });
        expect(focus.geometry).toBeUndefined();
        expect(focus._vgsid_).toBeUndefined();
        // Pan far off the state: nothing lies under the centre.
        expect(controller.apply({ op: 'set-viewport', axes: 'xy', value: { x: [-90, -80], y: [30, 40] } })).toBe(true);
        await view.runAsync();
        expect(controller.focus!()).toBeUndefined();
        view.finalize();
    });
});

describe('bubble map levels', () => {
    const PROVINCE = {
        type: 'Feature',
        properties: { adcode: 330000, name: '浙江省' },
        geometry: { type: 'Polygon', coordinates: [[[118, 27.5], [123, 27.5], [123, 31.5], [118, 31.5], [118, 27.5]]] },
    };
    const ROWS = [
        { Place: 'Zhejiang', Level: 'province', Lon: 120.2, Lat: 30.3, Pop: 65.7 },
        { Place: 'Hangzhou', Level: 'city', Lon: 120.2, Lat: 30.3, Pop: 12.5 },
        { Place: 'Ningbo', Level: 'city', Lon: 121.6, Lat: 29.9, Pop: 9.6 },
    ];
    const LEVELS = [{ value: 'province' }, { value: 'city', enter: 24, exit: 30 }];

    function bubble(chartProperties: Record<string, unknown>): any {
        return assembleVegaLite({
            data: { values: ROWS },
            semantic_types: { Place: 'Category', Level: 'Category', Lon: 'Longitude', Lat: 'Latitude', Pop: 'Quantity' },
            chart_spec: {
                chartType: 'Map',
                encodings: { longitude: 'Lon', latitude: 'Lat', size: 'Pop', color: 'Place' },
                chartProperties: { region: 'world', projection: 'mercator', ...chartProperties },
            },
        } as any);
    }

    async function mountedBubble() {
        const spec = bubble({ baseMapUrl: '/map-data/provinces.geojson', levelField: 'Level', levels: LEVELS });
        spec.layer[0].data = { values: [PROVINCE] };
        const plan = addVegaLiteInteractions(spec, [navigate()])!;
        const compiled = compile(spec).spec as any;
        const axes = injectVegaGeoNavigationSignals(compiled, plan.navigationChannels);
        injectVegaGeoLevelFit(compiled, plan.geoLevels!);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const controller = createVegaGeoNavigationController(view, axes, plan.geoLevels);
        return { view, controller, compiled, plan };
    }

    const symbolCount = (view: any): number => view.scenegraph().root.items[0].items
        .filter((mark: any) => mark.marktype === 'symbol')
        .reduce((total: number, mark: any) => total + mark.items.length, 0);

    it('swaps the base map for a GeoJSON URL and gates the points by a level column', () => {
        const spec = bubble({ baseMapUrl: '/map-data/provinces.geojson', levelField: 'Level', levels: LEVELS });
        expect(spec.layer[0].data).toEqual({ url: '/map-data/provinces.geojson', format: { type: 'json', property: 'features' } });
        expect(spec.params).toEqual([{ name: GEO_LEVEL_SIGNAL, value: 'province' }]);
        expect(spec.layer[1].transform).toEqual([{ filter: `datum["Level"] === ${GEO_LEVEL_SIGNAL}` }]);
        expect(spec._geoLevels).toBeUndefined();
        expect(spec._interactionSemantics.geoLevels).toEqual({
            signal: GEO_LEVEL_SIGNAL,
            levels: [{ name: 'province' }, { name: 'city', enter: 24, exit: 30 }],
        });
        // The colour domain covers both levels, so a swap never re-keys it.
        expect([...spec.layer[1].encoding.color.scale.domain].sort()).toEqual(['Hangzhou', 'Ningbo', 'Zhejiang']);
    });

    it('leaves a plain bubble map alone', () => {
        const spec = bubble({});
        expect(spec.layer[0].data.url).toContain('world-110m');
        expect(spec.params).toBeUndefined();
        expect(spec.layer[1].transform).toBeUndefined();
        expect(spec.layer[1].encoding.color.scale?.domain).toBeUndefined();
        expect(spec._interactionSemantics.geoLevels).toBeUndefined();
        // Levels need a level column and at least two levels.
        expect(bubble({ levelField: 'Level', levels: [{ value: 'province' }] }).params).toBeUndefined();
        expect(bubble({ levels: LEVELS }).params).toBeUndefined();
    });

    it('fits the projection to the base shapes and flips the points with the zoom', async () => {
        const { view, controller, compiled, plan } = await mountedBubble();
        const shape = compiled.marks.find((mark: any) => mark.type === 'shape');
        expect(compiled.projections[0].fit).toEqual({ signal: `data("${shape.from.data}")` });
        expect(plan.geoLevels!.source).toBe(shape.from.data);
        expect(view.signal(GEO_LEVEL_SIGNAL)).toBe('province');
        expect(symbolCount(view)).toBe(1);
        const initialScale = view.signal(GEO_PROJECTION_SIGNAL).scale();

        // Frame the province's middle: a 4° box, so the city level shows.
        expect(controller.apply({ op: 'set-viewport', axes: 'xy', value: { x: [118.5, 122.5], y: [28, 31] } })).toBe(true);
        await view.runAsync();
        expect(view.signal(GEO_LEVEL_SIGNAL)).toBe('city');
        expect(symbolCount(view)).toBe(2);
        expect(view.signal(GEO_PROJECTION_SIGNAL).scale()).toBeGreaterThan(initialScale);
        // The province under the centre comes from the base map's own feature.
        expect(controller.focus!()).toMatchObject({ adcode: 330000, name: '浙江省' });

        controller.apply({ op: 'set-viewport', axes: 'xy', value: {} });
        await view.runAsync();
        expect(view.signal(GEO_LEVEL_SIGNAL)).toBe('province');
        expect(symbolCount(view)).toBe(1);
        expect(view.signal(GEO_PROJECTION_SIGNAL).scale()).toBeCloseTo(initialScale);
        view.finalize();
    });
});
