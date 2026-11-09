// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Routes on a map: a `Map` whose points an `order` field joins into lines, with arrowheads that
 * read their heading off the live projection.
 */

import { compile } from 'vega-lite';
import { loader, parse, View } from 'vega';
import { expressionInterpreter } from 'vega-interpreter';
import { describe, expect, it } from 'vitest';
import { assembleVegaLite, type ChartAssemblyInput } from '../src';
import { assemblePlotly } from '../src/plotly';
import { validateChart } from '../src/validate';
import { geoOverlayChannels, overlayChannels } from '../src/vegalite/interactions/presentation/overlay-channels';
import { lonLatBox } from '../src/vegalite/interactions/presentation/data-overlay';
import { geoArea } from 'd3-geo';
import { bearing, buildRoutes, headSize, legPoint, legWidths, routeArrows, routeCurve, ROUTE_WIDTH, STOP_LEGS_MAX } from '../src/chart-types/map-routes';
import { addVegaLiteInteractions, injectVegaInteractionStore, vegaGeoFocusSource } from '../src/vegalite/interactions/compile';
import { oneMarkHits, sceneItems } from '../src/vegalite/interactions/hit-adapter';
import { INTERACTION_KEY } from '../src/vegalite/interactions/stores';
import { pointAlongPath, segmentRowPoint, segmentMidpointConnectionPoint } from '../src/vegalite/interactions/presentation/annotation-overlay';
import { mapDef } from '../src/vegalite/templates/map';
import { ROUTE_DATUM, ROUTE_PART } from '../src/vegalite/templates/map-routes';
import { withBundledBoundaries } from '../src/vegalite/boundary-loader';

const STOPS = [
    { Stop: 3, Place: 'C', longitude: 20, latitude: 10 },
    { Stop: 1, Place: 'A', longitude: 0, latitude: 10 },
    { Stop: 2, Place: 'B', longitude: 10, latitude: 10 },
];

function routeMap(rows: any[], encodings: Record<string, string>, chartProperties: Record<string, unknown> = {}): any {
    return assembleVegaLite({
        data: { values: rows },
        semantic_types: { Stop: 'Rank', Place: 'Name', longitude: 'Longitude', latitude: 'Latitude', Ship: 'Category', Speed: 'Quantity' },
        chart_spec: { chartType: 'Map', encodings: { longitude: 'longitude', latitude: 'latitude', ...encodings }, chartProperties, canvasSize: { width: 480, height: 320 } },
    } as any);
}

const markType = (layer: any) => (typeof layer?.mark === 'string' ? layer.mark : layer?.mark?.type);
/** A route's layers by what they draw: its casing, its line, its heads, then the heads' halo (absent ones left out). */
const routeLayers = (spec: any) => {
    const layers = spec.layer.filter((layer: any) => layer?.data?.values?.[0]?.[ROUTE_DATUM]);
    const part = (layer: any) => layer.data.values[0][ROUTE_PART];
    const line = layers.find((layer: any) => part(layer) === 'leg');
    const lineAt = spec.layer.indexOf(line);
    const heads = layers.filter((layer: any) => part(layer) === 'head');
    return [
        layers.find((layer: any) => part(layer) === 'casing'),
        line,
        heads.find((layer: any) => spec.layer.indexOf(layer) > lineAt),
        heads.find((layer: any) => spec.layer.indexOf(layer) < lineAt),
    ].filter(Boolean);
};
const strip = (spec: any) => JSON.parse(JSON.stringify(spec, (key, value) => (key.startsWith('_') ? undefined : value)));

describe('route geometry', () => {
    it('joins each series in its order: numbers by value, dates by time, text with its numbers read', () => {
        const rows = [
            { s: 'x', o: 10, lon: 2, lat: 0 }, { s: 'x', o: 9, lon: 1, lat: 0 }, { s: 'y', o: 'stop 10', lon: 9, lat: 0 },
            { s: 'y', o: 'stop 2', lon: 8, lat: 0 }, { s: 'z', o: '2024-03-01', lon: 5, lat: 5 }, { s: 'z', o: '2024-01-15', lon: 4, lat: 4 },
        ];
        const routes = buildRoutes(rows, { longitude: 'lon', latitude: 'lat', order: 'o', series: 's', curve: 'great-circle' });
        expect(routes.map((route) => [route.series, route.stops.map(([lon]) => lon)])).toEqual([['x', [1, 2]], ['y', [8, 9]], ['z', [4, 5]]]);
    });

    it('leaves out rows without a place or an order, and a series of one stop', () => {
        const rows = [
            { o: 1, lon: 0, lat: 0 }, { o: null, lon: 5, lat: 5 }, { o: 2, lon: 'x', lat: 0 }, { o: 3, lon: 3, lat: 0 }, { o: 4, lon: 0, lat: 95 },
        ];
        expect(buildRoutes(rows, { longitude: 'lon', latitude: 'lat', order: 'o' })[0].stops).toEqual([[0, 0], [3, 0]]);
        expect(buildRoutes([{ o: 1, lon: 0, lat: 0 }], { longitude: 'lon', latitude: 'lat', order: 'o' })).toEqual([]);
    });

    it('bows stops into arcs on a flat map, follows great circles on a globe or along a track', () => {
        expect(routeCurve('auto', false, 3)).toBe('arc');
        expect(routeCurve(undefined, true, 3)).toBe('great-circle');
        expect(routeCurve('auto', false, STOP_LEGS_MAX + 1)).toBe('great-circle');
        expect(routeCurve('straight', true, 3)).toBe('straight');
    });

    it('bows a leg to the left of travel, so a leg out and the leg back part ways', () => {
        const east = legPoint([0, 0], [20, 0], 'arc')(0.5);
        const west = legPoint([20, 0], [0, 0], 'arc')(0.5);
        expect(east[1]).toBeGreaterThan(1);
        expect(west[1]).toBeLessThan(-1);
        expect(legPoint([0, 0], [20, 0], 'arc')(0)).toEqual([0, 0]);
    });

    it('runs a straight leg the short way across the antimeridian', () => {
        const [lon] = legPoint([170, 0], [-170, 0], 'straight')(0.5);
        expect(Math.abs(lon)).toBeCloseTo(180, 6);
    });

    it('puts a head on every leg of a route of stops, and only on the end of a track', () => {
        const stops = buildRoutes(STOPS, { longitude: 'longitude', latitude: 'latitude', order: 'Stop' });
        expect(routeArrows(stops, 'auto', false).map((arrow) => arrow.tip)).toEqual([[10, 10], [20, 10]]);
        const track = Array.from({ length: STOP_LEGS_MAX + 2 }, (_, i) => ({ o: i, lon: i, lat: 0 }));
        const arrows = routeArrows(buildRoutes(track, { longitude: 'lon', latitude: 'lat', order: 'o' }), 'auto', false);
        expect(arrows.map((arrow) => arrow.tip)).toEqual([[STOP_LEGS_MAX + 1, 0]]);
    });

    it('gives a leg that comes back to its start no head', () => {
        const rows = [{ o: 1, lon: 0, lat: 0 }, { o: 2, lon: 0, lat: 0 }, { o: 3, lon: 4, lat: 0 }];
        expect(routeArrows(buildRoutes(rows, { longitude: 'lon', latitude: 'lat', order: 'o' }), 'auto', false)).toHaveLength(1);
    });
});

describe('Map routes in Vega-Lite', () => {
    it('draws nothing more without an order field', () => {
        expect(routeLayers(routeMap(STOPS, {}))).toHaveLength(0);
    });

    it('draws a casing and a line beneath the points and the heads over them', () => {
        const spec = routeMap(STOPS, { order: 'Stop' });
        const types = spec.layer.map((layer: any) => (layer?.data?.values?.[0]?.[ROUTE_DATUM] ? `route:${markType(layer)}` : markType(layer)));
        const circle = types.indexOf('circle');
        // The casing, the heads' halo, the line, then the stops, and the heads over them.
        expect(types.slice(circle - 3, circle)).toEqual(['route:geoshape', 'route:point', 'route:geoshape']);
        expect(types.lastIndexOf('route:point')).toBeGreaterThan(circle);
        const [casing, line, , halo] = routeLayers(spec);
        // The halo is white on a light map, round the line and its head alike, a hairline each side.
        expect(casing.mark.stroke).toBe('#ffffff');
        expect(halo.mark).toMatchObject({ fill: '#ffffff', stroke: '#ffffff', strokeJoin: 'miter' });
        expect(casing.data.values.every((leg: any) => leg.flintCasingWidth === line.mark.strokeWidth + 1.5)).toBe(true);
        // Drawn sharp: square ends, mitred corners.
        expect(line.mark).toMatchObject({ strokeCap: 'butt', strokeJoin: 'miter' });
        expect(casing.mark).toMatchObject({ strokeCap: 'butt', strokeJoin: 'miter' });
        expect(line.mark.stroke).toMatch(/^#/);
        expect(line.data.values[0].geometry.type).toBe('LineString');
        expect(line.encoding.tooltip).toBeNull();
        // A long leg can run past even a world frame: every route layer stays inside the plot.
        expect(routeLayers(spec).every((layer: any) => layer.mark.clip === true)).toBe(true);
    });

    it('leaves the heads off when arrows is false', () => {
        const spec = routeMap(STOPS, { order: 'Stop' }, { arrows: false });
        expect(routeLayers(spec).map(markType)).toEqual(['geoshape', 'geoshape']);
        expect(spec.layer.some((layer: any) => layer?.data?.values?.[0]?.[ROUTE_PART] === 'head')).toBe(false);
    });

    it('colours each route as its series and keeps the points’ own key', () => {
        const rows = [...STOPS.map((row) => ({ ...row, Ship: 'a' })), ...STOPS.map((row) => ({ ...row, Ship: 'b', latitude: 20 }))];
        const spec = routeMap(rows, { order: 'Stop', color: 'Ship' });
        const [, line, heads] = routeLayers(spec);
        // One shape per leg, carrying the row it leaves from.
        expect(line.data.values.map((feature: any) => [feature.Ship, feature.Stop])).toEqual([['a', 1], ['a', 2], ['b', 1], ['b', 2]]);
        expect(line.encoding.color.field).toBe('Ship');
        expect(heads.encoding.color.field).toBe('Ship');
        const vega: any = compile(strip(spec)).spec;
        expect(vega.legends ?? []).toHaveLength(1);
        expect(vega.scales.filter((scale: any) => scale.name === 'color')).toHaveLength(1);
    });

    it('draws a route in a neutral ink where the colour is a quantity, not its series', () => {
        const spec = routeMap(STOPS.map((row) => ({ ...row, Speed: row.Stop * 3 })), { order: 'Stop', color: 'Speed' });
        const [, line] = routeLayers(spec);
        expect(line.encoding.color).toBeUndefined();
        expect(line.data.values).toHaveLength(2);
    });

    it('rims its casing in the ground on a dark map, and gives its heads no rim', () => {
        const spec = routeMap(STOPS, { order: 'Stop' }, { mapStyle: 'dark' });
        const [casing, , heads] = routeLayers(spec);
        expect(casing.mark.stroke).toBe('#1d2227');
        // A head has no rim: it is joined to its line, and the dark map's ring for dots passes it by.
        expect(heads.mark.stroke).toBeNull();
    });

    it('hides the heads past a globe’s horizon', () => {
        const spec = routeMap(STOPS, { order: 'Stop' }, { projection: 'orthographic' });
        const heads = routeLayers(spec).find((layer: any) => markType(layer) === 'point');
        expect(heads.encoding.opacity.condition[0]).toMatchObject({ value: 0 });
        expect(heads.encoding.opacity.condition[0].test).toContain('__flint_geo_rotate');
    });

    it('points each head along its leg on screen', async () => {
        const rows = [
            { Stop: 1, longitude: 0, latitude: 0 }, { Stop: 2, longitude: 10, latitude: 0 }, { Stop: 3, longitude: 0, latitude: 0.001 },
        ];
        const view = new View(parse(compile(strip(routeMap(rows, { order: 'Stop' }, { curve: 'great-circle' }))).spec as any), {
            renderer: 'none', loader: withBundledBoundaries(loader()),
        } as any);
        await view.runAsync();
        const angles: number[] = [];
        const visit = (node: any) => {
            // The heads, not their halo beneath the line, which turns with them.
            if (node?.marktype === 'symbol' && node.items?.[0]?.datum?.[ROUTE_DATUM] && node.items[0].strokeWidth === 0) angles.push(...node.items.map((item: any) => item.angle));
            for (const item of node?.items ?? []) visit(item);
        };
        visit((view.scenegraph() as any).root);
        expect(angles).toHaveLength(2);
        expect(angles[0]).toBeCloseTo(0, 0);
        expect(Math.abs(angles[1])).toBeCloseTo(180, 0);
    });

    it('takes the map’s focus regions from its land, never its routes', () => {
        const vega: any = compile(strip(routeMap(STOPS, { order: 'Stop' }))).spec;
        const source = vegaGeoFocusSource(vega);
        const dataset = vega.data.find((entry: any) => entry.name === source);
        expect(dataset?.values?.[0]?.[ROUTE_DATUM]).toBeUndefined();
    });
});

describe('Map routes in Plotly', () => {
    const plotlyMap = (chartProperties: Record<string, unknown> = {}) => assemblePlotly({
        data: { values: STOPS },
        semantic_types: { Stop: 'Rank', Place: 'Name', longitude: 'Longitude', latitude: 'Latitude' },
        chart_spec: { chartType: 'Map', encodings: { longitude: 'longitude', latitude: 'latitude', order: 'Stop' }, chartProperties },
    } as any);

    it('draws the casing and line beneath the points and the heads over them, turned to each leg', () => {
        const traces = plotlyMap().data;
        expect(traces.map((trace: any) => trace.mode)).toEqual(['lines', 'lines', 'markers', 'markers']);
        const heads = traces[3];
        expect(heads.marker.angleref).toBe('up');
        // Both legs run east; mid-arc the bow turns them a little south of it.
        for (const angle of heads.marker.angle) expect(Math.abs(angle - 90)).toBeLessThan(6);
        expect(heads.hoverinfo).toBe('skip');
    });

    it('paints each leg in the colour of the row it leaves where a category names stretches of one route', () => {
        const rows = STOPS.map((row) => ({ ...row, Leg: row.Stop === 1 ? 'Out' : 'Back', Voyage: 'One' }));
        const traces = assemblePlotly({
            data: { values: rows },
            semantic_types: { Stop: 'Rank', Place: 'Name', Leg: 'Category', Voyage: 'Category', longitude: 'Longitude', latitude: 'Latitude' },
            chart_spec: { chartType: 'Map', encodings: { longitude: 'longitude', latitude: 'latitude', order: 'Stop', color: 'Leg', detail: 'Voyage' } },
        } as any).data;
        const lines = traces.filter((trace: any) => trace.mode === 'lines' && trace.line.color !== '#ffffff');
        // Two legs, Out then Back, each in its own colour, neither the neutral ink.
        expect(lines).toHaveLength(2);
        expect(new Set(lines.map((trace: any) => trace.line.color)).size).toBe(2);
        expect(lines.map((trace: any) => trace.line.color)).not.toContain('#4a5058');
    });

    it('leaves the heads off when arrows is false', () => {
        expect(plotlyMap({ arrows: false }).data.map((trace: any) => trace.mode)).toEqual(['lines', 'lines', 'markers']);
    });

    it('reads a compass bearing clockwise from north', () => {
        expect(bearing([0, 0], [0, 10])).toBeCloseTo(0, 6);
        expect(bearing([0, 0], [10, 0])).toBeCloseTo(90, 6);
        expect(bearing([0, 0], [-10, 0])).toBeCloseTo(270, 6);
    });
});

describe('Map routes as annotation targets', () => {
    const odyssey = [
        { Stop: 1, Place: 'Troy', longitude: 26.24, latitude: 39.96 },
        { Stop: 2, Place: 'Ismarus', longitude: 25.52, latitude: 40.89 },
        { Stop: 3, Place: 'Djerba', longitude: 10.86, latitude: 33.81 },
    ];

    it('draws a shape per leg carrying the row it leaves from, its casing and head too', () => {
        const spec = routeMap(odyssey, { order: 'Stop' });
        const [casing, line, heads] = routeLayers(spec);
        expect(line.data.values.map((leg: any) => [leg.Place, leg[ROUTE_PART]])).toEqual([['Troy', 'leg'], ['Ismarus', 'leg']]);
        expect(casing.data.values.map((leg: any) => leg[ROUTE_PART])).toEqual(['casing', 'casing']);
        expect(heads.data.values.map((head: any) => [head.Place, head[ROUTE_PART]])).toEqual([['Troy', 'head'], ['Ismarus', 'head']]);
    });

    async function instrumentedView() {
        const spec = routeMap(odyssey, { order: 'Stop' }, { curve: 'arc' });
        const plan = addVegaLiteInteractions(spec, [], true)!;
        const compiled = compile(strip(spec)).spec as any;
        injectVegaInteractionStore(compiled, plan);
        const view = new View(parse(compiled), { renderer: 'none', loader: withBundledBoundaries(loader()) } as any);
        await view.runAsync();
        return view;
    }

    it('keys each leg as its row, gives it its drawn curve, and leaves its casing and head out of the targets', async () => {
        const view = await instrumentedView();
        const items = sceneItems(view);
        const legs = items.filter((item) => item.datum?.[ROUTE_PART] === 'leg');
        const dots = items.filter((item) => item.mark?.marktype === 'symbol' && item.datum?.[ROUTE_PART] === undefined);
        expect(legs).toHaveLength(2);
        expect(items.some((item) => item.datum?.[ROUTE_PART] === 'casing' || item.datum?.[ROUTE_PART] === 'head')).toBe(false);
        // The land is structure: none of its shapes is a target.
        expect(items.filter((item) => item.mark?.marktype === 'shape' && item.datum?.[ROUTE_PART] === undefined)).toHaveLength(0);
        const troy = dots.find((dot) => dot.datum.Place === 'Troy');
        expect(legs[0].datum[INTERACTION_KEY]).toBe(troy.datum[INTERACTION_KEY]);
        // The bowed leg is drawn through many points, from Troy's dot.
        const points = legs[0].interactionGeometry.points;
        expect(legs[0].interactionGeometry.kind).toBe('segment');
        expect(points.length).toBeGreaterThan(10);
        expect(Math.hypot(points[0].x - troy.x, points[0].y - troy.y)).toBeLessThan(1);
    });

    it('names the dot for a row, the leg only when the update asks for a path', () => {
        const dot = { datum: { [INTERACTION_KEY]: 'k' }, markType: 'symbol', source: 'mark' } as any;
        const leg = { datum: { [INTERACTION_KEY]: 'k', [ROUTE_PART]: 'leg' }, markType: 'shape', source: 'mark' } as any;
        expect(oneMarkHits([leg, dot])).toEqual([dot]);
        expect(oneMarkHits([leg, dot], true)).toEqual([leg]);
        const semantics = mapDef.semanticInteractions!({
            resolvedEncodings: { longitude: { field: 'longitude', type: 'quantitative' }, latitude: { field: 'latitude', type: 'quantitative' }, order: { field: 'Stop', type: 'quantitative' } },
        } as any);
        const context = { keyField: INTERACTION_KEY } as any;
        const kind = (role: string, hits: any[]) => semantics.resolve!({ gesture: 'rectangle', role, hits } as any, context)?.visual.kind;
        expect(kind('external-selection', [leg, dot])).toBe('mark');
        expect(kind('leg', [leg, dot])).toBe('path');
        expect(kind('mark', [leg])).toBe('path');
    });

    it('reads a curved leg along its length: halfway on the curve, its ends at its stops', () => {
        const curve = [{ x: 0, y: 0 }, { x: 10, y: -10 }, { x: 20, y: -10 }, { x: 30, y: 0 }];
        const middle = pointAlongPath(curve, 0.5);
        expect(middle.y).toBeCloseTo(-10, 6);
        expect(middle.x).toBeCloseTo(15, 6);
        const item = { datum: { Stop: 1 }, interactionGeometry: { kind: 'segment', points: curve, annotationPoints: curve, endDatum: { Stop: 2 } } };
        expect(segmentMidpointConnectionPoint(item, { x: 15, y: 50 }).point.y).toBeCloseTo(-10, 6);
        expect(segmentRowPoint(item, { Stop: 2 }, 'point')).toEqual({ x: 30, y: 0 });
        expect(segmentRowPoint(item, { Stop: 1 }, 'point')).toEqual({ x: 0, y: 0 });
    });
});

describe('overlays and regions placed by longitude and latitude', () => {
    const overlay = (mark: string, encodings: Record<string, string>, values: Record<string, unknown>[] = [{ lon: 20, lat: 38, lon2: 26, lat2: 40 }]) => ({
        mark, role: 'test', data: { values },
        encodings: Object.fromEntries(Object.entries(encodings).map(([channel, field]) => [channel, { field }])),
    }) as any;

    it('reads a place for a point, text or line, and two for a rule or rect, never x or y beside them', () => {
        expect(geoOverlayChannels(overlay('point', { longitude: 'lon', latitude: 'lat' }))).toEqual(['longitude', 'latitude']);
        expect(geoOverlayChannels(overlay('rule', { longitude: 'lon', latitude: 'lat', longitude2: 'lon2', latitude2: 'lat2' }))).toHaveLength(4);
        expect(geoOverlayChannels(overlay('rect', { longitude: 'lon', latitude: 'lat' }))).toBeUndefined();
        expect(geoOverlayChannels(overlay('point', { longitude: 'lon', latitude: 'lat', x: 'lon' }))).toBeUndefined();
        // A map overlay is no x/y overlay.
        expect(overlayChannels(overlay('point', { longitude: 'lon', latitude: 'lat' }))).toBeUndefined();
    });

    it('rings a box clockwise along its parallels, across the antimeridian where its west edge lies east', () => {
        const small = (ring: [number, number][]) => geoArea({ type: 'Polygon', coordinates: [ring] } as any) < Math.PI;
        const box = lonLatBox(9.5, 38, 16, 41.5);
        expect(box[0]).toEqual([9.5, 38]);
        expect(small(box)).toBe(true);
        const pacific = lonLatBox(170, -20, -170, -10);
        expect(small(pacific)).toBe(true);
        expect(Math.max(...pacific.map(([lon]) => lon))).toBeCloseTo(190, 6);
    });

    const map: ChartAssemblyInput = {
        data: { values: STOPS }, semantic_types: { Stop: 'Rank', Place: 'Name', longitude: 'Longitude', latitude: 'Latitude' },
        chart_spec: { chartType: 'Map', encodings: { longitude: 'longitude', latitude: 'latitude', order: 'Stop' } },
    } as any;
    const bars: ChartAssemblyInput = {
        data: { values: [{ c: 'a', v: 1 }] }, semantic_types: { c: 'Category', v: 'Quantity' },
        chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'c' }, y: { field: 'v' } } },
    } as any;
    const check = (input: ChartAssemblyInput, op: unknown) => validateChart(input, 'vegalite', { updates: [{ id: 'u', ops: [op as any] }] }).updates![0].ops[0];

    it('takes a map overlay on a map, with places in degrees, and on no other chart', () => {
        const line = { op: 'set-overlay', name: 'n', value: overlay('line', { longitude: 'lon', latitude: 'lat' }) };
        expect(check(map, line).ok).toBe(true);
        expect(check(bars, line).reason).toContain('is no map');
        const off = { op: 'set-overlay', name: 'n', value: overlay('point', { longitude: 'lon', latitude: 'lat' }, [{ lon: 20, lat: 95 }]) };
        expect(check(map, off).reason).toContain('latitude in degrees');
        const rule = { op: 'set-overlay', name: 'n', value: overlay('rule', { longitude: 'lon', latitude: 'lat' }) };
        expect(check(map, rule).reason).toContain('longitude2 and latitude2');
    });

    it('takes a map region as a box of longitude and latitude', () => {
        const region = (value: unknown) => check(map, { op: 'annotate-region', name: 'r', value });
        expect(region({ longitude: [9.5, 16], latitude: [38, 41.5], text: 'Tyrrhenian Sea' })).toMatchObject({
            ok: true, text: 'region "r" over longitude 9.5 to 16, latitude 38 to 41.5, captioned "Tyrrhenian Sea"',
        });
        expect(region({ longitude: [9.5, 16] }).reason).toContain('latitude: [south, north]');
        expect(region({ longitude: [9.5, 16], latitude: [38, 41.5], x: [0, 1] }).reason).toContain('no x or y');
        expect(check(bars, { op: 'annotate-region', name: 'r', value: { longitude: [0, 1], latitude: [0, 1] } }).reason).toContain('is no map');
    });
});

describe('route widths and joined heads', () => {
    const crew = [
        { Stop: 1, Crew: 600, longitude: 0, latitude: 10 },
        { Stop: 2, Crew: 300, longitude: 10, latitude: 10 },
        { Stop: 3, Crew: 0, longitude: 20, latitude: 10 },
    ];

    it('widens a leg by the value of the row it leaves, from zero, and sizes its head to it', () => {
        expect(legWidths([600, 300, 0, null])).toEqual([ROUTE_WIDTH.max, (ROUTE_WIDTH.min + ROUTE_WIDTH.max) / 2 + 0, ROUTE_WIDTH.min, ROUTE_WIDTH.min]
            .map((width, index) => (index === 1 ? ROUTE_WIDTH.min + (ROUTE_WIDTH.max - ROUTE_WIDTH.min) / 2 : width)));
        expect(headSize(1)).toEqual({ length: 9, halfWidth: 9 * 0.45 });
        expect(headSize(8).length).toBe(20);
    });

    it('reads strokeWidth as the route’s width, with a key of its own, and leaves the stops undrawn', () => {
        const spec = routeMap(crew, { order: 'Stop', strokeWidth: 'Crew' } as any);
        const [casing, line, heads] = routeLayers(spec);
        expect(line.encoding.strokeWidth).toMatchObject({ field: 'Crew', scale: { domain: [0, 600], range: [ROUTE_WIDTH.min, ROUTE_WIDTH.max] }, legend: { symbolType: 'stroke' } });
        expect(casing.data.values.map((leg: any) => leg.flintCasingWidth)).toEqual([ROUTE_WIDTH.max + 1.5, ROUTE_WIDTH.min + 3.5 + 1.5]);
        expect(spec.resolve.scale.strokeWidth).toBe('independent');
        const dots = spec.layer.find((layer: any) => markType(layer) === 'circle');
        expect(dots.encoding.size).toBeUndefined();
        // Not drawn: the arrows are the route; the stops stay where the pointer finds their rows.
        expect(dots.mark.opacity).toBe(0);
        // The wider leg's head is the longer.
        const reach = (shape: string) => Math.abs(Number(shape.match(/L(-[\d.]+),/)![1]));
        expect(reach(heads.data.values[0].flintHeadShape)).toBeGreaterThan(reach(heads.data.values[1].flintHeadShape));
    });

    it('ends a headed leg’s line at its head’s base, drops the head where the leg is too short on screen, and draws a leg without a head whole', () => {
        const spec = routeMap(crew, { order: 'Stop' });
        const [casing, line, heads] = routeLayers(spec);
        const [leg] = line.data.values;
        // A headed leg is cut at its head's base, and its halo with it: the head's own halo carries it on.
        expect(leg).toMatchObject({ flintJoin: 1, flintFit: 1 });
        expect(casing.encoding.strokeDash).toEqual(line.encoding.strokeDash);
        expect(line.encoding.strokeDash.value.expr).toContain('datum.flintJoin');
        // A head below 60% of its size is dropped; the scale is computed on the head's own data.
        expect(heads.encoding.opacity.condition[0].test).toBe('datum.flintScale < 0.6');
        expect(heads.transform.map((step: any) => step.as)).toEqual(['flintPts', 'flintDist', 'flintScale', 'flintX', 'flintY', 'flintBaseX', 'flintBaseY', 'flintAngle', 'flintSize']);
        expect(heads.mark).toMatchObject({ fillOpacity: line.mark.strokeOpacity });
        const plain = routeLayers(routeMap(crew, { order: 'Stop' }, { arrows: false }))[1];
        expect(plain.data.values.every((each: any) => each.flintJoin === 0)).toBe(true);
    });

    it('draws stops as dots of one size when asked, sized apart from the arrows, and leaves them undrawn otherwise', () => {
        const spec = routeMap(crew, { order: 'Stop', strokeWidth: 'Crew' } as any, { stops: true });
        const dots = spec.layer.find((layer: any) => markType(layer) === 'circle');
        expect(dots.mark).toMatchObject({ opacity: 1, fillOpacity: 1, stroke: '#ffffff', strokeWidth: 1 });
        // Uniform: half the median leg width (8 and 4.5 px legs: 4.5) and a pixel, kept within 2.5–4 px.
        expect(dots.mark.size).toBeCloseTo((2 * 3.25) ** 2, 6);
        expect(dots.encoding.size).toBeUndefined();
        // The arrows read only each end's clearance: the dot's radius and half its halo.
        const [, line, heads] = routeLayers(spec);
        expect(line.data.values.map((leg: any) => [leg.flintStartClear, leg.flintEndClear])).toEqual([[3.75, 3.75], [3.75, 3.75]]);
        expect(heads.data.values.map((head: any) => head.flintEndClear)).toEqual([3.75, 3.75]);
        // A stated radius is every dot's.
        const fixed = routeMap(crew, { order: 'Stop' }, { stops: true, stopRadius: 3 });
        expect(fixed.layer.find((layer: any) => markType(layer) === 'circle').mark.size).toBe(36);
        expect(routeLayers(fixed)[1].data.values[0].flintEndClear).toBe(3.5);
        // Undrawn without stops, and the arrows keep nothing for them.
        const plain = routeMap(crew, { order: 'Stop' });
        expect(plain.layer.find((layer: any) => markType(layer) === 'circle').mark.opacity).toBe(0);
        expect(routeLayers(plain)[1].data.values[0].flintEndClear).toBe(0);
    });

    it('sizes stops by size, zero-based by area, drawn without asking, beside legs widened by strokeWidth', () => {
        const rows = crew.map((row, index) => ({ ...row, Days: [10, 0, 40][index] }));
        const spec = routeMap(rows, { order: 'Stop', size: 'Days', strokeWidth: 'Crew' } as any);
        const dots = spec.layer.find((layer: any) => markType(layer) === 'circle');
        // `size` sets the stops to all where `stops` is unset.
        expect(dots.mark.opacity).toBe(1);
        expect(dots.encoding.size).toMatchObject({ field: 'Days', scale: { domain: [0, 40], range: [25, 196] } });
        expect(dots.encoding.strokeWidth).toBeUndefined();
        expect(routeLayers(spec)[1].encoding.strokeWidth).toMatchObject({ field: 'Crew', legend: { symbolType: 'stroke' } });
        // Its key is the dots' own, not merged away with the heads' sizes.
        const vega: any = compile(strip(spec)).spec;
        expect((vega.legends ?? []).some((legend: any) => legend.size && legend.title === 'Days')).toBe(true);
        const [, line] = routeLayers(spec);
        const radius = (days: number) => Math.sqrt(25 + (196 - 25) * (days / 40)) / 2;
        expect(line.data.values[0].flintStartClear).toBeCloseTo(radius(10) + 0.5, 6);
        expect(line.data.values[1].flintEndClear).toBeCloseTo(radius(40) + 0.5, 6);
        // Its keys are two: the dots' sizes and the legs' widths.
        expect((vega.legends ?? []).some((legend: any) => legend.strokeWidth && legend.title === 'Crew')).toBe(true);
        // An explicit 'none' keeps them undrawn, and says the size went unused.
        const none = routeMap(rows, { order: 'Stop', size: 'Days' } as any, { stops: 'none' });
        expect(none.layer.find((layer: any) => markType(layer) === 'circle').mark.opacity).toBe(0);
        expect(none._warnings.map((warning: any) => warning.code)).toContain('map-size-without-stops');
        // On a map without routes, size is the bubbles' own, and strokeWidth, with no legs to widen, is left out.
        const points = routeMap(rows, { size: 'Days', strokeWidth: 'Crew' } as any);
        const bubbles = points.layer.find((layer: any) => markType(layer) === 'circle');
        expect(bubbles.encoding.size.field).toBe('Days');
        expect(bubbles.encoding.strokeWidth).toBeUndefined();
        expect(points._warnings.map((warning: any) => warning.code)).toContain('map-width-without-routes');
    });

    it('draws a dot only where each run of one colour starts and ends under stops: ends', async () => {
        const rows = [1, 2, 3, 4, 5].map((Stop) => ({ Stop, Trip: 'x', Ship: Stop <= 2 ? 'A' : 'B', longitude: Stop * 8, latitude: Stop % 2 ? 0 : 6 }));
        const spec = routeMap(rows, { order: 'Stop', detail: 'Trip', color: 'Ship' } as any, { stops: 'ends', stopRadius: 3 });
        // Legs 1→2 and 2→3 are A's, 3→4 and 4→5 B's: stops 2 and 4 lie within a run.
        const [, line, heads] = routeLayers(spec);
        expect(line.data.values.map((leg: any) => [leg.Stop, leg.flintStartClear, leg.flintEndClear])).toEqual([[1, 3.5, 0], [2, 0, 3.5], [3, 3.5, 0], [4, 0, 3.5]]);
        // Every leg keeps its head.
        expect(heads.data.values).toHaveLength(4);
        const view = new View(parse(compile(strip(spec)).spec as any), { renderer: 'none', loader: withBundledBoundaries(loader()) } as any);
        await view.runAsync();
        const dots: any[] = [];
        const visit = (node: any) => {
            if (node?.marktype === 'symbol' && !node.items?.[0]?.datum?.[ROUTE_PART] && node.items?.[0]?.datum?.Stop !== undefined) dots.push(...node.items);
            for (const item of node?.items ?? []) visit(item);
        };
        visit((view.scenegraph() as any).root);
        expect(dots.filter((dot) => dot.opacity !== 0).map((dot) => dot.datum.Stop).sort()).toEqual([1, 3, 5]);
        // Without a colour, the route's ends only; `true` is every stop.
        const plain = routeLayers(routeMap(rows, { order: 'Stop', detail: 'Trip' } as any, { stops: 'ends', stopRadius: 3 }))[1];
        expect(plain.data.values.map((leg: any) => leg.flintEndClear)).toEqual([0, 0, 0, 3.5]);
        const all = routeLayers(routeMap(rows, { order: 'Stop', detail: 'Trip', color: 'Ship' } as any, { stops: true, stopRadius: 3 }))[1];
        expect(all.data.values.map((leg: any) => leg.flintEndClear)).toEqual([3.5, 3.5, 3.5, 3.5]);
    });

    it('points each head at the next drawn stop’s edge on screen', async () => {
        const radius = 5;
        const spec = routeMap(crew, { order: 'Stop' }, { stops: true, stopRadius: radius, curve: 'straight' });
        const view = new View(parse(compile(strip(spec)).spec as any), { renderer: 'none', loader: withBundledBoundaries(loader()) } as any);
        await view.runAsync();
        const legs: any[] = [];
        const heads: any[] = [];
        const stops: any[] = [];
        const visit = (node: any) => {
            const part = node?.items?.[0]?.datum?.[ROUTE_PART];
            if (node?.marktype === 'shape' && part === 'leg') legs.push(...node.items);
            if (node?.marktype === 'symbol' && part === 'head' && node.items[0].fill !== '#ffffff') heads.push(...node.items);
            if (node?.marktype === 'symbol' && !part && node.items?.[0]?.datum?.Stop !== undefined) stops.push(...node.items);
            for (const item of node?.items ?? []) visit(item);
        };
        visit((view.scenegraph() as any).root);
        expect(legs).toHaveLength(2);
        // Drawn from its first stop's dot's edge (a gap first, the dot's clearance) to its head.
        for (const leg of legs) {
            expect(leg.strokeDash).toHaveLength(4);
            expect(leg.strokeDash.slice(0, 2)).toEqual([0, radius + 0.5]);
        }
        const at = (stop: number) => stops.find((item) => item.datum.Stop === stop);
        // The head's tip stands at the outer edge of the dot's halo: its radius and half the halo from the stop's middle.
        expect(heads).toHaveLength(2);
        for (const head of heads) {
            const next = at(head.datum.Stop + 1);
            expect(Math.hypot(head.x - next.x, head.y - next.y)).toBeCloseTo(radius + 0.5, 1);
        }
    });

    it('cuts no line on a globe, where a leg’s length on screen is not measured', () => {
        const [, line, heads] = routeLayers(routeMap(crew, { order: 'Stop' }, { projection: 'orthographic' }));
        expect(line.data.values.every((each: any) => each.flintJoin === 0)).toBe(true);
        // Its heads keep their size.
        expect(heads.data.values.every((each: any) => each.flintFit === 0)).toBe(true);
    });

    it('stops each leg’s line at the head on screen, through the live projection', async () => {
        const spec = routeMap(crew, { order: 'Stop' }, { curve: 'great-circle' });
        const view = new View(parse(compile(strip(spec)).spec as any), { renderer: 'none', loader: withBundledBoundaries(loader()) } as any);
        await view.runAsync();
        const items: any[] = [];
        const visit = (node: any) => {
            if (node?.marktype === 'shape' && node.items?.[0]?.datum?.[ROUTE_PART] === 'leg') items.push(...node.items);
            for (const item of node?.items ?? []) visit(item);
        };
        visit((view.scenegraph() as any).root);
        expect(items).toHaveLength(2);
        for (const item of items) {
            const [drawn, gap] = item.strokeDash;
            expect(gap).toBe(1000000);
            expect(drawn).toBeGreaterThan(20);
        }
    });

    it('draws a widened route in Plotly a leg at a time, each as wide as its row says, its stops as the Vega-Lite map does', () => {
        const plotly = (encodings: Record<string, string>, chartProperties: Record<string, unknown> = {}) => assemblePlotly({
            data: { values: crew.map((row, index) => ({ ...row, Days: [10, 0, 40][index] })) },
            semantic_types: { Stop: 'Rank', Crew: 'Count', Days: 'Count', longitude: 'Longitude', latitude: 'Latitude' },
            chart_spec: { chartType: 'Map', encodings: { longitude: 'longitude', latitude: 'latitude', order: 'Stop', ...encodings }, chartProperties },
        } as any).data;
        const traces = plotly({ strokeWidth: 'Crew' });
        const lines = traces.filter((trace: any) => trace.mode === 'lines' && trace.line.color !== '#ffffff');
        expect(lines.map((trace: any) => trace.line.width)).toEqual([ROUTE_WIDTH.max, ROUTE_WIDTH.min + (ROUTE_WIDTH.max - ROUTE_WIDTH.min) / 2]);
        const dots = (encodings: Record<string, string>, chartProperties?: Record<string, unknown>) =>
            plotly(encodings, chartProperties).find((trace: any) => trace.mode === 'markers' && !trace.hoverinfo).marker;
        // Undrawn by default, but still hovered.
        expect(dots({ strokeWidth: 'Crew' }).opacity).toBe(0);
        // Every stop one size (8 and 4.5 px legs: radius 3.25), or by size, zero-based by area (2.5 to 7 px).
        expect(dots({ strokeWidth: 'Crew' }, { stops: true }).size).toEqual([6.5, 6.5, 6.5]);
        const sized = dots({ size: 'Days' });
        expect(sized.opacity).toEqual([1, 1, 1]);
        expect(sized.size.map((d: number) => Number(d.toFixed(3)))).toEqual([Math.sqrt(25 + 171 / 4), 5, 14].map((d) => Number(d.toFixed(3))));
        // `ends` leaves the stop within a run undrawn.
        expect(dots({ size: 'Days' }, { stops: 'ends' }).opacity).toEqual([1, 0, 1]);
    });
});

describe('the ground a point or route map stands on', () => {
    const points = (chartProperties: Record<string, unknown> = {}, values = STOPS) => routeMap(values, {}, chartProperties);

    it('fills a world map’s frame with water, outlines its land at the coast, and draws its borders as a mesh over it', () => {
        const spec = points();
        const land = spec.layer.find((layer: any) => layer.data?.format?.feature === 'countries');
        const borders = spec.layer.find((layer: any) => layer.data?.format?.mesh);
        expect(borders.data.format).toEqual({ type: 'topojson', mesh: 'countries', filter: 'interior' });
        expect(land.mark.stroke).not.toBe(borders.mark.stroke);
        expect(borders.mark.strokeWidth).toBeGreaterThan(land.mark.strokeWidth);
        const frame = spec.layer.find((layer: any) => markType(layer) === 'rect');
        expect(frame?.mark.fill).toBeDefined();
        expect(frame.mark.fill).not.toBe('#ffffff');
        // The land lies light on the water.
        expect(land.mark.fill.toLowerCase() > frame.mark.fill.toLowerCase()).toBe(true);
    });

    it('lays the land’s own colour under a disputed border, so the dots are not drawn over a solid line', () => {
        const spec = points({}, [{ Stop: 1, Place: 'Srinagar', longitude: 74.8, latitude: 34.1 }, { Stop: 2, Place: 'Delhi', longitude: 77.2, latitude: 28.6 }]);
        const roles = spec.layer.map((layer: any) => (layer.data?.format?.feature === 'disputed' ? (layer.mark.strokeDash ? 'dots' : 'base') : null)).filter(Boolean);
        expect(roles).toEqual(['base', 'dots']);
        const land = spec.layer.find((layer: any) => layer.data?.format?.feature === 'countries');
        const base = spec.layer.find((layer: any) => layer.data?.format?.feature === 'disputed' && !layer.mark.strokeDash);
        expect(base.mark.stroke).toBe(land.mark.fill);
    });

    it('leaves a US map on the page, its land toned, with no water round it', () => {
        const spec = points({ region: 'us' }, [{ Stop: 1, Place: 'St Louis', longitude: -90.2, latitude: 38.6 }, { Stop: 2, Place: 'Astoria', longitude: -123.8, latitude: 46.2 }]);
        expect(spec.layer.some((layer: any) => markType(layer) === 'rect')).toBe(false);
        const land = spec.layer.find((layer: any) => layer.data?.format?.feature === 'states');
        expect(land.mark.fill).not.toBe('#ffffff');
        expect(land.mark.fill).not.toBe('#fcfcfc');
    });

    it('draws a choropleth’s borders as lines too, outlines its regions at the coast, and fills a world map’s frame with water', () => {
        const spec = assembleVegaLite({
            data: { values: [{ Country: 'France', Share: 0.5 }] }, semantic_types: { Country: 'Country', Share: 'Percentage' },
            chart_spec: { chartType: 'Choropleth', encodings: { id: 'Country', color: 'Share' } },
        } as any) as any;
        const regions = spec.layer.find((layer: any) => layer.encoding?.color?.field);
        const borders = spec.layer.find((layer: any) => layer.data?.format?.mesh);
        expect(borders.data.format).toMatchObject({ mesh: 'countries', filter: 'interior' });
        expect(regions.mark.stroke).not.toBe(borders.mark.stroke);
        expect(spec.layer.some((layer: any) => markType(layer) === 'rect')).toBe(true);
        // On a choropleth the dots of a disputed border stand on its line: no land-coloured cover across coloured regions.
        expect(spec.layer.filter((layer: any) => layer.data?.format?.feature === 'disputed')).toHaveLength(1);
    });
});

describe('route ink, stops and track heads', () => {
    const line = (spec: any) => routeLayers(spec)[1];

    it('draws a route in the theme’s mark colour, and in a neutral ink beside dots coloured by another field', () => {
        expect(line(routeMap(STOPS, { order: 'Stop' })).mark.stroke).toBe('#4c78a8');
        const quantity = routeMap(STOPS.map((row) => ({ ...row, Speed: row.Stop })), { order: 'Stop', color: 'Speed' });
        expect(line(quantity).mark.stroke).not.toBe('#4c78a8');
        expect(line(quantity).encoding.color).toBeUndefined();
    });

    it('keeps a track’s head at its end however short its last leg, reading its fixes before', () => {
        const track = Array.from({ length: STOP_LEGS_MAX + 6 }, (_, i) => ({ Stop: i, longitude: i * 0.3, latitude: Math.sin(i / 4) }));
        const spec = routeMap(track, { order: 'Stop' });
        const dots = spec.layer.find((layer: any) => markType(layer) === 'circle');
        expect(dots.mark.opacity).toBe(0);
        const [, , heads] = routeLayers(spec);
        expect(heads.data.values).toHaveLength(1);
        expect(heads.data.values[0].flintFit).toBe(0);
        // Its tail runs back through the fixes before its end.
        const tail = heads.data.values[0].flintTail.map((point: any) => point.coordinates);
        expect(tail.slice(0, 2)).toEqual([[track.at(-1)!.longitude, track.at(-1)!.latitude], [track.at(-2)!.longitude, track.at(-2)!.latitude]]);
    });

    it('sets each head on its line: its tip at the stop, the middle of its base on the line a head’s length back', async () => {
        const rows = [{ Stop: 1, longitude: 0, latitude: 0 }, { Stop: 2, longitude: 3, latitude: 0 }, { Stop: 3, longitude: 40, latitude: 30 }, { Stop: 4, longitude: 38, latitude: 34 }];
        const view = new View(parse(compile(strip(routeMap(rows, { order: 'Stop' }, { curve: 'arc' }))).spec as any), {
            renderer: 'none', loader: withBundledBoundaries(loader()),
        } as any);
        await view.runAsync();
        const heads: any[] = [];
        const legs = new Map<number, number[][]>();
        const visit = (node: any) => {
            const part = node?.items?.[0]?.datum?.[ROUTE_PART];
            if (node?.marktype === 'symbol' && part === 'head' && node.items[0].strokeWidth === 0) heads.push(...node.items);
            if (node?.marktype === 'shape' && part === 'leg') {
                for (const item of node.items) {
                    const points: number[][] = [];
                    item.shape.context({ moveTo: (x: number, y: number) => points.push([x, y]), lineTo: (x: number, y: number) => points.push([x, y]), closePath() {}, beginPath() {} })(item);
                    item.shape.context(null);
                    legs.set(item.datum.Stop, points);
                }
            }
            for (const item of node?.items ?? []) visit(item);
        };
        visit((view.scenegraph() as any).root);
        const shown = heads.filter((head) => head.opacity !== 0);
        expect(shown.length).toBeGreaterThan(0);
        for (const head of shown) {
            const line = legs.get(head.datum.Stop)!;
            const end = line.at(-1)!;
            expect(Math.hypot(head.x - end[0], head.y - end[1])).toBeLessThan(0.01);
            const length = head.datum.flintBack * Math.sqrt(head.size / 4);
            const angle = (head.angle * Math.PI) / 180;
            const base = [end[0] - Math.cos(angle) * length, end[1] - Math.sin(angle) * length];
            const off = Math.min(...line.slice(1).map((b, index) => {
                const a = line[index];
                const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
                const t = Math.max(0, Math.min(1, ((base[0] - a[0]) * dx + (base[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
                return Math.hypot(base[0] - a[0] - t * dx, base[1] - a[1] - t * dy);
            }));
            expect(off).toBeLessThan(0.5);
        }
    });
});

describe('route expressions under a CSP-safe Vega', () => {
    it('draws its heads and cuts its lines with the functions vega-interpreter provides', async () => {
        const rows = [{ Stop: 1, longitude: 0, latitude: 0 }, { Stop: 2, longitude: 10, latitude: 0 }, { Stop: 3, longitude: 12, latitude: 8 }];
        const errors: unknown[] = [];
        const view = new View(parse(compile(strip(routeMap(rows, { order: 'Stop' }))).spec as any, undefined, { ast: true }), {
            renderer: 'none', loader: withBundledBoundaries(loader()), expr: expressionInterpreter,
        } as any);
        view.logger({ level: () => 0, error: (...args: unknown[]) => errors.push(args), warn: () => {}, info: () => {}, debug: () => {} } as any);
        await view.runAsync();
        expect(errors).toEqual([]);
        const heads: any[] = [];
        const visit = (node: any) => {
            if (node?.marktype === 'symbol' && node.items?.[0]?.datum?.[ROUTE_PART] === 'head' && node.items[0].strokeWidth === 0) heads.push(...node.items);
            for (const item of node?.items ?? []) visit(item);
        };
        visit((view.scenegraph() as any).root);
        expect(heads.length).toBeGreaterThan(0);
        expect(heads.every((head) => Number.isFinite(head.angle))).toBe(true);
    });
});

describe('route colour by stretch', () => {
    it('paints each leg and its head in the colour of the row it leaves where a category names stretches of one route', () => {
        const rows = STOPS.map((row, index) => ({ ...row, Leg: index < 2 ? 'Out' : 'Back', Voyage: 'One' }));
        const spec = routeMap(rows, { order: 'Stop', color: 'Leg', detail: 'Voyage' });
        const [, line, heads] = routeLayers(spec);
        expect(line.encoding.color).toMatchObject({ field: 'Leg', legend: null });
        expect(heads.encoding.color).toMatchObject({ field: 'Leg' });
        // Each leg takes the row it leaves, in stop order.
        const byStop = [...rows].sort((a, b) => a.Stop - b.Stop);
        expect(line.data.values.map((value: any) => value.Leg)).toEqual(byStop.slice(0, -1).map((row) => row.Leg));
        const vega: any = compile(strip(spec)).spec;
        expect(vega.legends.filter((legend: any) => legend.fill === 'color' || legend.stroke === 'color')).toHaveLength(1);
    });
});
