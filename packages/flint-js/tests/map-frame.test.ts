// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { WORLD_LAND, countryBox, frameOf, longitudeSpan, mapPlotSize, projectedAspect, shapedFrame } from '../src/chart-types/geo-frame';
import { continentAt, continentOf } from '../src/chart-types/geo-continents';

/**
 * A map is planned like any other plot: it frames its data, takes the shape that frame projects
 * to, and stands inside the box the host gives it.
 */

const choropleth = (rows: Record<string, unknown>[], extra: Record<string, unknown> = {}) => assembleVegaLite({
    data: { values: rows },
    semantic_types: { Country: 'Country', State: 'State', Value: 'Percentage' },
    chart_spec: { chartType: 'Choropleth', encodings: { id: { field: Object.keys(rows[0])[0] }, color: { field: 'Value' } }, ...extra },
} as any) as any;

const world = ['United States', 'China', 'Brazil', 'Nigeria', 'India', 'Australia'].map((Country, i) => ({ Country, Value: i / 10 }));
const europe = ['France', 'Germany', 'Italy', 'Spain', 'Poland'].map((Country, i) => ({ Country, Value: i / 10 }));

const fitPoints = (spec: any): [number, number][] => spec.projection.fit.geometry.coordinates;
const geoLayers = (spec: any) => spec.layer.filter((layer: any) => (layer.mark?.type ?? layer.mark) !== 'rect');
/** The unit drawing the countries: the map itself, or its first layer once it is layered round the regions. */
const regionsOf = (spec: any): any => (Array.isArray(spec.layer) ? spec.layer.find((layer: any) => layer.encoding?.color?.field) : spec);

describe('a map in its box', () => {
    it('takes the shape of the world’s land, as large as the canvas holds once its key has its room', () => {
        const small = choropleth(world, { baseSize: { width: 400, height: 300 }, canvasSize: { width: 600, height: 450 } });
        const large = choropleth(world, { baseSize: { width: 1000, height: 700 }, canvasSize: { width: 1000, height: 700 } });
        const land = projectedAspect(WORLD_LAND, 'equalEarth');
        for (const [spec, canvas] of [[small, 600], [large, 1000]] as const) {
            expect(spec.width / spec.height).toBeCloseTo(land, 1);
            // The key beside the map takes its room; the map takes the rest of the width.
            expect(spec.width).toBeLessThan(canvas);
            expect(spec.width).toBeGreaterThan(canvas * 0.8);
        }
    });

    it('fills a canvas given alone, with no base size', () => {
        const spec = choropleth(world, { canvasSize: { width: 800, height: 500 } });
        expect(spec.width).toBeGreaterThan(640);
        expect(spec.width).toBeLessThanOrEqual(800);
    });

    it('stays inside a box smaller than its natural size', () => {
        const spec = choropleth(world, { canvasSize: { width: 320, height: 240 } });
        expect(spec.width).toBeLessThanOrEqual(320);
        expect(spec.height).toBeLessThanOrEqual(240);
    });

    it('draws the US at its atlas’s shape', () => {
        const spec = choropleth([{ State: 'California', Value: 1 }, { State: 'Texas', Value: 2 }]);
        expect(spec.width / spec.height).toBeCloseTo(975 / 610, 1);
    });

    it('draws a globe square', () => {
        const spec = choropleth(world, { chartProperties: { projection: 'orthographic' } });
        expect(spec.width).toBe(spec.height);
        expect(spec.projection.fit).toEqual({ type: 'Sphere' });
    });
});

describe('what a world map frames', () => {
    it('frames the region its countries share, and clips the rest of the world to the plot', () => {
        const spec = choropleth(europe);
        const lons = fitPoints(spec).map(([lon]) => lon);
        const lats = fitPoints(spec).map(([, lat]) => lat);
        expect(Math.min(...lons)).toBeGreaterThan(-30);
        expect(Math.max(...lons)).toBeLessThan(45);
        expect(Math.min(...lats)).toBeGreaterThan(20);
        expect(regionsOf(spec).mark.clip).toBe(true);
        // The dotted borders are clipped with the countries; a frame of water and a neatline close the cut.
        expect(geoLayers(spec).every((layer: any) => layer.mark.clip === true)).toBe(true);
        const rects = spec.layer.filter((layer: any) => layer.mark?.type === 'rect');
        expect(rects).toHaveLength(2);
        expect(spec.layer[0]).toBe(rects[0]);
        expect(spec.layer[spec.layer.length - 1].mark.stroke).toBeDefined();
        // Drawn in a projection of its own, centred on Europe.
        expect(spec.projection.type).toBe('conicEqualArea');
        expect(spec.projection.rotate[0]).toBeLessThan(0);
        expect(spec.projection.parallels).toHaveLength(2);
    });

    it('frames the world’s land, without Antarctica, where the countries span the world', () => {
        const spec = choropleth(world);
        const lats = fitPoints(spec).map(([, lat]) => lat);
        expect(Math.min(...lats)).toBe(WORLD_LAND[1]);
        expect(regionsOf(spec).transform[0]).toEqual({ filter: 'datum.id !== 10' });
        expect(regionsOf(spec).mark.clip).toBeUndefined();
    });

    it('keeps Antarctica where the data names it, or the caller asks for the whole base map', () => {
        const named = choropleth([...world, { Country: 'Antarctica', Value: 0 }]);
        const whole = choropleth(world, { chartProperties: { fit: 'basemap' } });
        for (const spec of [named, whole]) {
            expect(regionsOf(spec).transform.some((step: any) => step.filter === 'datum.id !== 10')).toBe(false);
            expect(Math.min(...fitPoints(spec).map(([, lat]) => lat))).toBe(-90);
        }
    });

    it('gives a point map one projection both layers share, framed on its points', () => {
        const spec: any = assembleVegaLite({
            data: { values: [{ City: 'Paris', Lon: 2.35, Lat: 48.86 }, { City: 'Berlin', Lon: 13.4, Lat: 52.5 }, { City: 'Rome', Lon: 12.5, Lat: 41.9 }] },
            semantic_types: { City: 'City', Lon: 'Longitude', Lat: 'Latitude' },
            chart_spec: { chartType: 'Map', encodings: { longitude: 'Lon', latitude: 'Lat' } },
        } as any);
        expect(spec.projection.type).toBe('conicEqualArea');
        expect(spec.layer.every((layer: any) => layer.projection === undefined)).toBe(true);
        expect(geoLayers(spec).every((layer: any) => layer.mark.clip === true)).toBe(true);
        expect(geoLayers(spec)[0].transform).toEqual([{ filter: 'datum.id !== 10' }]);
    });
});

describe('how much of the world a map frames', () => {
    const framed = (countries: string[], properties: Record<string, unknown> = {}) =>
        choropleth(countries.map((Country, i) => ({ Country, Value: i / 10 })), { chartProperties: properties });
    const level = (spec: any) => spec._mapFrame?.level;

    it('frames one country whole, its large islands with it, centred, with its neighbours round it', () => {
        expect(countryBox(392)![3]).toBeGreaterThan(45); // Hokkaido is Japan's
        expect(countryBox(250)![0]).toBeGreaterThan(-10); // French Guiana is not part of France's frame
        const japan = framed(['Japan']);
        expect(level(japan)).toBe('country');
        const lons = fitPoints(japan).map(([lon]) => lon);
        const lats = fitPoints(japan).map(([, lat]) => lat);
        expect(Math.min(...lons)).toBeLessThan(129.4);
        expect(Math.max(...lons)).toBeGreaterThan(145.5);
        expect(Math.max(...lats)).toBeGreaterThan(45.6);
        expect(-japan.projection.rotate[0]).toBeCloseTo(137.5, 0);
    });

    it('frames several countries by the region they share, and their continent once they cover much of it', () => {
        expect(level(framed(['France', 'Germany', 'Belgium', 'Netherlands']))).toBe('region');
        expect(level(framed(['Norway', 'Sweden', 'Finland', 'Denmark']))).toBe('region');
        expect(level(framed(['France', 'Germany', 'Italy', 'Spain', 'Poland', 'Sweden']))).toBe('continent');
        expect(level(framed(['Nigeria', 'Kenya', 'South Africa', 'Egypt', 'Morocco', 'Ethiopia']))).toBe('continent');
        expect(level(framed(['United States', 'China', 'Brazil']))).toBe('world');
    });

    it('keeps to the data, or takes in the continent, where the chart asks', () => {
        expect(level(framed(['France', 'Germany', 'Italy', 'Spain', 'Poland', 'Sweden'], { fit: 'data' }))).toBe('region');
        const asia = framed(['Japan'], { fit: 'continent' });
        expect(level(asia)).toBe('continent');
        expect(Math.min(...fitPoints(asia).map(([lon]) => lon))).toBeLessThan(30);
    });

    it('frames countries and places across the antimeridian as one region, centred on it', () => {
        const pacific = framed(['Fiji', 'New Zealand', 'Samoa']);
        expect(level(pacific)).toBe('region');
        const lons = fitPoints(pacific).map(([lon]) => lon);
        expect(Math.min(...lons)).toBeGreaterThan(150);
        expect(Math.max(...lons)).toBeGreaterThan(180);
        expect(-pacific.projection.rotate[0]).toBeGreaterThan(170);
        expect(longitudeSpan([[166, -47, 179, -34], [-172.8, -14, -171.4, -13.4]])).toEqual([166, 188.6]);
        expect(longitudeSpan([[-10, 40, 20, 50], [100, 20, 120, 40]])).toEqual([-10, 120]);
        expect(continentAt(-171.8, -13.8)).toBe('oceania'); // Apia
    });

    it('places points in their continent, the nearer one where two frames meet', () => {
        expect(continentAt(28.98, 41.01)).toBe('europe'); // Istanbul
        expect(continentAt(31.24, 30.04)).toBe('africa'); // Cairo
        expect(continentAt(55.27, 25.2)).toBe('asia'); // Dubai
        expect(continentAt(-150, -30)).toBeUndefined();
        expect(continentOf(643)).toBe('europe');
        expect(continentOf(792)).toBe('asia');
    });
});

describe('regions without data', () => {
    const blocks = [
        { type: 'Feature', id: 250, properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 40], [8, 40], [8, 50], [0, 50], [0, 40]]] } },
        { type: 'Feature', id: 276, properties: {}, geometry: { type: 'Polygon', coordinates: [[[8, 46], [15, 46], [15, 55], [8, 55], [8, 46]]] } },
    ];
    const fills = async (spec: any) => {
        const { compile } = await import('vega-lite');
        const { parse, View } = await import('vega');
        // The regions alone, on two blocks of land.
        const regions = regionsOf(spec);
        regions.data = { values: blocks };
        if (spec.layer) spec.layer = [regions];
        const view = new View(parse(compile(spec).spec as any), { renderer: 'none' });
        await view.runAsync();
        const out: Record<string, string> = {};
        const visit = (item: any) => {
            if (item.mark?.marktype === 'shape' && item.datum?.id != null) out[item.datum.id] = item.fill;
            for (const child of item.items ?? []) visit(child);
        };
        visit((view.scenegraph() as any).root);
        view.finalize();
        return out;
    };

    it('draws a region the rows do not name, in the no-data fill, on a flat world map', async () => {
        const spec = choropleth([{ Country: 'France', Value: 0.4 }]);
        expect(regionsOf(spec).mark.invalid).toBeNull();
        const noData = regionsOf(spec).encoding.color.condition.value;
        const drawn = await fills(spec);
        expect(Object.keys(drawn).sort()).toEqual(['250', '276']);
        expect(drawn['276']).toBe(noData);
        expect(drawn['250']).not.toBe(noData);
    });

    it('keeps states and counties without a value on the US map', () => {
        for (const level of ['state', 'county', 'auto']) {
            const spec = choropleth([{ State: 'California', Value: 1 }], { chartProperties: { level } });
            const marks = spec.layer ? spec.layer.map((layer: any) => layer.mark) : [spec.mark];
            expect(marks.every((mark: any) => mark.invalid === null), level).toBe(true);
            expect(spec.encoding.color.condition.test).toMatch(/isValid/);
        }
    });
});

describe('frame shapes', () => {
    it('frames a region its countries or points share, padded, and the world where they span it', () => {
        expect(frameOf([[-5, 42, 8, 51]]).world).toBe(false);
        expect(frameOf([[-120, 30, -70, 45], [100, 20, 140, 40]]).world).toBe(true);
        // A body that crosses the antimeridian frames its region, running east past 180°, not a strip the wrong way round.
        const crossing = frameOf([[170, -45, -175, -35]]);
        expect(crossing.world).toBe(false);
        expect(crossing.box[0]).toBeGreaterThan(160);
        expect(crossing.box[2]).toBeGreaterThan(185);
    });

    it('widens a frame two points far apart would make a strip', () => {
        const strip = frameOf([[-74, 40.7, -74, 40.7], [2.35, 48.86, 2.35, 48.86]]).box;
        expect(projectedAspect(strip, 'mercator')).toBeGreaterThan(3);
        expect(projectedAspect(shapedFrame(strip, 'mercator'), 'mercator')).toBeLessThanOrEqual(2.05);
    });

    it('sizes the plot as the largest of its frame’s shape the room holds', () => {
        expect(mapPlotSize({ width: 600, height: 450 }, 2)).toEqual({ width: 600, height: 300 });
        expect(mapPlotSize({ width: 600, height: 450 }, 1)).toEqual({ width: 450, height: 450 });
    });
});
