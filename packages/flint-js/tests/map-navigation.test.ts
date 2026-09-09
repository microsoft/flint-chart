// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Pan and zoom on projected charts.
 *
 * A map has no continuous x/y scale, so navigation drives the projection's
 * fitted *extent* instead. These tests cover the template declaration, the
 * compiled signal injection, and a live Vega view whose projection is zoomed,
 * panned, guarded, fitted to a geographic box, and reset through the extent.
 */

import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import { describe, expect, it } from 'vitest';
import { assembleVegaLite } from '../src';
import { navigate } from '../src/interactive/interactions';
import {
    addVegaLiteInteractions,
    injectVegaGeoNavigationSignals,
} from '../src/vegalite/interactions/compile';
import {
    createVegaGeoNavigationController,
    GEO_AXIS_SCALES,
    GEO_EXTENT_SIGNAL,
    GEO_PROJECTION_SIGNAL,
    guardGeoExtent,
    remapExtentPoint,
    type GeoExtent,
} from '../src/vegalite/interactions/navigation-geo';
import { domainForPlotGeometry, resolveSupportedOperation } from '../src/vegalite/interactions/runtime';

const GUARD = { minVisibleFraction: 0.02, maxVisibleFraction: 1, overscrollFraction: 0 };

/** Two land blocks that stand in for the world TopoJSON, so no network fetch is needed. */
const BASE_FEATURES = [
    {
        type: 'Feature',
        id: 840,
        properties: {},
        geometry: { type: 'Polygon', coordinates: [[[-100, 30], [-60, 30], [-60, 50], [-100, 50], [-100, 30]]] },
    },
    {
        type: 'Feature',
        id: 250,
        properties: {},
        geometry: { type: 'Polygon', coordinates: [[[0, 30], [40, 30], [40, 60], [0, 60], [0, 30]]] },
    },
];

function worldBubbleMap(): any {
    const spec = assembleVegaLite({
        data: { values: [
            { City: 'New York', Lon: -74.0, Lat: 40.7, Pop: 18.9 },
            { City: 'Paris', Lon: 2.35, Lat: 48.86, Pop: 11.1 },
        ] },
        semantic_types: { City: 'City', Lon: 'Longitude', Lat: 'Latitude', Pop: 'Quantity' },
        chart_spec: {
            chartType: 'Map',
            encodings: { longitude: 'Lon', latitude: 'Lat', size: 'Pop' },
            chartProperties: { region: 'world', projection: 'mercator' },
        },
    } as any) as any;
    // Replace the remote TopoJSON base with inline features.
    spec.layer[0].data = { values: BASE_FEATURES };
    return spec;
}

async function mountedWorldMap() {
    const spec = worldBubbleMap();
    const plan = addVegaLiteInteractions(spec, [navigate()])!;
    const compiled = compile(spec).spec as any;
    const axes = injectVegaGeoNavigationSignals(compiled, plan.navigationChannels);
    const view = new View(parse(compiled), { renderer: 'none' });
    await view.runAsync();
    const controller = createVegaGeoNavigationController(view, axes);
    return { view, axes, controller, width: view.width(), height: view.height() };
}

describe('map navigation declaration', () => {
    it('declares geo navigation on both axes for projected templates only', () => {
        const map = worldBubbleMap();
        expect(map._interactionSemantics.navigationAxes).toEqual(['x', 'y']);
        expect(map._interactionSemantics.geoNavigation).toBe(true);

        const choropleth = assembleVegaLite({
            data: { values: [{ State: 'California', Pop: 39.5 }, { State: 'Texas', Pop: 29.1 }] },
            semantic_types: { State: 'State', Pop: 'Quantity' },
            chart_spec: { chartType: 'Choropleth', encodings: { id: 'State', color: 'Pop' } },
        } as any) as any;
        expect(choropleth._interactionSemantics.navigationAxes).toEqual(['x', 'y']);
        expect(choropleth._interactionSemantics.geoNavigation).toBe(true);

        const scatter = assembleVegaLite({
            data: { values: [{ x: 1, y: 2 }, { x: 3, y: 4 }] },
            semantic_types: { x: 'Number', y: 'Number' },
            chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'x', y: 'y' } },
        } as any) as any;
        expect(scatter._interactionSemantics.navigationAxes).toEqual(['x', 'y']);
        expect(scatter._interactionSemantics.geoNavigation).toBe(false);
    });

    it('accepts navigate() on a map and swaps the fitted size for an extent signal', () => {
        const spec = worldBubbleMap();
        const plan = addVegaLiteInteractions(spec, [navigate()])!;
        expect(plan.navigationChannels).toEqual(['x', 'y']);
        expect(plan.geoNavigation).toBe(true);

        const compiled = compile(spec).spec as any;
        const axes = injectVegaGeoNavigationSignals(compiled, plan.navigationChannels);
        expect(axes).toEqual({
            x: { scale: GEO_AXIS_SCALES.x, signal: GEO_EXTENT_SIGNAL, type: 'geo' },
            y: { scale: GEO_AXIS_SCALES.y, signal: GEO_EXTENT_SIGNAL, type: 'geo' },
        });
        const projection = compiled.projections[0];
        expect(projection.fit).toBeDefined();
        expect(projection.size).toBeUndefined();
        expect(projection.extent.signal).toContain(GEO_EXTENT_SIGNAL);
        const signals = compiled.signals.map((signal: any) => signal.name);
        expect(signals).toContain(GEO_EXTENT_SIGNAL);
        expect(signals).toContain(GEO_PROJECTION_SIGNAL);
        expect(compiled.signals.find((signal: any) => signal.name === GEO_PROJECTION_SIGNAL).update)
            .toBe("copy(\"projection\")");
        // Both axes count as navigable for external viewport updates.
        expect(resolveSupportedOperation(
            { op: 'set-viewport', axes: 'xy', value: { x: [0, 10], y: [0, 10] } },
            { navigationAxes: axes },
        ).unsupported).toBe(false);
    });

    it('injects into a choropleth whose projection sits at the top level', () => {
        const spec = assembleVegaLite({
            data: { values: [{ State: 'California', Pop: 39.5 }, { State: 'Texas', Pop: 29.1 }] },
            semantic_types: { State: 'State', Pop: 'Quantity' },
            chart_spec: { chartType: 'Choropleth', encodings: { id: 'State', color: 'Pop' } },
        } as any) as any;
        const plan = addVegaLiteInteractions(spec, [navigate()])!;
        const compiled = compile(spec).spec as any;
        injectVegaGeoNavigationSignals(compiled, plan.navigationChannels);
        expect(compiled.projections[0].type).toBe('identity');
        expect(compiled.projections[0].extent.signal).toContain(GEO_EXTENT_SIGNAL);
    });
});

describe('geo extent helpers', () => {
    it('remaps a pixel between extents by the fit\'s scale and offset', () => {
        const base: GeoExtent = [[0, 0], [100, 50]];
        const zoomed: GeoExtent = [[-50, -25], [150, 75]];
        expect(remapExtentPoint([50, 25], base, zoomed)).toEqual([50, 25]);
        expect(remapExtentPoint([0, 0], base, zoomed)).toEqual([-50, -25]);
        expect(remapExtentPoint([-50, -25], zoomed, base)).toEqual([0, 0]);
    });

    it('guards the visible fraction and keeps the extent uniform', () => {
        const size = { width: 100, height: 50 };
        // Zooming in four times with a 50% floor clamps to a doubled extent about the center.
        const clamped = guardGeoExtent([[-150, -75], [250, 125]], size, { ...GUARD, minVisibleFraction: 0.5 });
        expect(clamped).toEqual([[-50, -25], [150, 75]]);
        // Zooming out beyond the initial frame snaps back to it.
        expect(guardGeoExtent([[10, 5], [60, 30]], size, GUARD)).toEqual([[0, 0], [100, 50]]);
        // A pan that would leave the frame empty on one side is pinned to the edge.
        expect(guardGeoExtent([[-150, -25], [50, 75]], size, GUARD)).toEqual([[-100, -25], [100, 75]]);
    });
});

describe('geo navigation controller', () => {
    it('zooms, pans, and resets the fitted projection through the extent signal', async () => {
        const { view, controller, width, height } = await mountedWorldMap();
        const initial = view.signal(GEO_PROJECTION_SIGNAL);
        expect(typeof initial).toBe('function');
        const initialScale = initial.scale();
        expect(view.signal(GEO_EXTENT_SIGNAL)).toBeNull();

        const zoom = controller.resolve({
            type: 'navigation', phase: 'commit', operation: 'zoom', axes: 'xy',
            factor: 2, anchor: { x: 0.5, y: 0.5 },
        }, GUARD)!;
        expect(zoom.op).toBe('set-viewport');
        expect(zoom.value.x).toBeDefined();
        expect(zoom.value.y).toBeDefined();
        expect(controller.apply(zoom)).toBe(true);
        await view.runAsync();
        expect(view.signal(GEO_EXTENT_SIGNAL)).toEqual([
            [-width / 2, -height / 2], [width * 1.5, height * 1.5],
        ]);
        const zoomedScale = view.signal(GEO_PROJECTION_SIGNAL).scale();
        expect(zoomedScale).toBeCloseTo(initialScale * 2);

        // The reported longitude range is the visible middle row, narrower than the full frame.
        const fullLon = controller.scale!(GEO_AXIS_SCALES.x)!.invert!(width) as number;
        const [zoomWest, zoomEast] = zoom.value.x!.map(Number);
        expect(zoomEast - zoomWest).toBeGreaterThan(0);
        expect(zoomEast).toBeLessThan(fullLon + 1e-6);

        const pan = controller.resolve({
            type: 'navigation', phase: 'preview', operation: 'pan', axes: 'xy',
            delta: { x: 0.1, y: 0 },
        }, GUARD)!;
        controller.apply(pan);
        await view.runAsync();
        const panned = view.signal(GEO_EXTENT_SIGNAL).flat() as number[];
        const expected = [-width / 2 + width * 0.1, -height / 2, width * 1.5 + width * 0.1, height * 1.5];
        panned.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 6));
        expect(view.signal(GEO_PROJECTION_SIGNAL).scale()).toBeCloseTo(zoomedScale);

        const reset = controller.resolve({
            type: 'navigation', phase: 'commit', operation: 'reset', axes: 'xy',
        }, GUARD)!;
        expect(reset.value).toEqual({});
        controller.apply(reset);
        await view.runAsync();
        expect(view.signal(GEO_EXTENT_SIGNAL)).toBeNull();
        expect(view.signal(GEO_PROJECTION_SIGNAL).scale()).toBeCloseTo(initialScale);
        view.finalize();
    });

    it('anchors a zoom under the pointer and clamps it with the domain guard', async () => {
        const { view, controller, width, height } = await mountedWorldMap();
        const corner = controller.resolve({
            type: 'navigation', phase: 'commit', operation: 'zoom', axes: 'xy',
            factor: 2, anchor: { x: 0, y: 0 },
        }, GUARD)!;
        controller.apply(corner);
        await view.runAsync();
        // The top-left corner stays put; the extent grows away from it.
        expect(view.signal(GEO_EXTENT_SIGNAL)).toEqual([[0, 0], [width * 2, height * 2]]);

        const clamped = controller.resolve({
            type: 'navigation', phase: 'commit', operation: 'zoom', axes: 'xy',
            factor: 100, anchor: { x: 0, y: 0 },
        }, { ...GUARD, minVisibleFraction: 0.25 })!;
        controller.apply(clamped);
        await view.runAsync();
        expect(view.signal(GEO_EXTENT_SIGNAL)).toEqual([[0, 0], [width * 4, height * 4]]);

        const out = controller.resolve({
            type: 'navigation', phase: 'commit', operation: 'zoom', axes: 'xy',
            factor: 0.01, anchor: { x: 0.5, y: 0.5 },
        }, GUARD)!;
        controller.apply(out);
        await view.runAsync();
        expect(view.signal(GEO_EXTENT_SIGNAL)).toEqual([[0, 0], [width, height]]);
        view.finalize();
    });

    it('fits an external longitude and latitude box into the plot', async () => {
        const { view, controller, width, height } = await mountedWorldMap();
        const initialScale = view.signal(GEO_PROJECTION_SIGNAL).scale();
        expect(controller.apply({ op: 'set-viewport', axes: 'xy', value: { x: [-10, 40], y: [35, 70] } })).toBe(true);
        await view.runAsync();
        expect(view.signal(GEO_PROJECTION_SIGNAL).scale()).toBeGreaterThan(initialScale);

        const lon = controller.scale!(GEO_AXIS_SCALES.x)!;
        const lat = controller.scale!(GEO_AXIS_SCALES.y)!;
        const west = lon.invert!(0) as number;
        const east = lon.invert!(width) as number;
        const south = lat.invert!(height) as number;
        const north = lat.invert!(0) as number;
        expect(west).toBeLessThanOrEqual(-10 + 1e-6);
        expect(east).toBeGreaterThanOrEqual(40 - 1e-6);
        expect(south).toBeLessThanOrEqual(35 + 1e-6);
        expect(north).toBeGreaterThanOrEqual(70 - 1e-6);
        // The box is centered, and the tighter dimension fills the plot.
        expect((west + east) / 2).toBeCloseTo(15, 5);
        const lonFits = Math.abs(west + 10) < 1e-6 && Math.abs(east - 40) < 1e-6;
        const latFits = Math.abs(south - 35) < 1e-6 && Math.abs(north - 70) < 1e-6;
        expect(lonFits || latFits).toBe(true);
        view.finalize();
    });

    it('reads region geometry as longitude and latitude intervals', async () => {
        const { view, controller, axes, width, height } = await mountedWorldMap();
        const domain = domainForPlotGeometry(
            { kind: 'rect', rect: { x: width / 4, y: height / 4, width: width / 2, height: height / 2 } } as any,
            axes,
            (name) => controller.scale?.(name),
        )!;
        expect(domain.x?.kind).toBe('interval');
        expect(domain.y?.kind).toBe('interval');
        const x = domain.x as { start: number; end: number };
        const y = domain.y as { start: number; end: number };
        expect(x.end).toBeGreaterThan(x.start);
        expect(y.end).toBeGreaterThan(y.start);
        expect((x.start + x.end) / 2).toBeCloseTo(controller.scale!(GEO_AXIS_SCALES.x)!.invert!(width / 2) as number, 5);
        view.finalize();
    });
});
