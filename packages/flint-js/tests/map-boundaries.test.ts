// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { renderSvg } from '../src/render';
import { inlineBoundaries, naturalEarthTopology, usAlbersTopology, worldBankTopology } from '../src/geo';
import { BOUNDARY_URLS, GEO_VERSION, SITE_GEO, WORLD_BANK_CREDIT } from '../src/chart-types/boundaries';
import { withBundledBoundaries } from '../src/vegalite/boundary-loader';
import { readCanvasFurniture } from '../src/vegalite/canvas-furniture';

/**
 * A map draws the boundaries `chartProperties.boundaries` names: the World Bank's (the default) or
 * Natural Earth's, which Flint's renderers serve from the package and `inlineBoundaries` writes into
 * a compiled spec; or a file of the chart's own, by URL or inline, read by the ids it says it has
 * and credited as it says.
 */

const choropleth = (rows: Record<string, unknown>[], options: Record<string, unknown> = {}, properties: Record<string, unknown> = {}) => ({
    data: { values: rows },
    semantic_types: { Country: 'Country', State: 'State', Value: 'Percentage' },
    chart_spec: { chartType: 'Choropleth', encodings: { id: { field: Object.keys(rows[0])[0] }, color: { field: 'Value' } }, chartProperties: properties },
    options,
}) as any;
const pointMap = (options: Record<string, unknown> = {}, properties: Record<string, unknown> = {}) => ({
    data: { values: [{ Lon: -122.3, Lat: 47.6 }, { Lon: -74, Lat: 40.7 }] },
    semantic_types: { Lon: 'Longitude', Lat: 'Latitude' },
    chart_spec: { chartType: 'Map', encodings: { longitude: 'Lon', latitude: 'Lat' }, chartProperties: properties },
    options,
}) as any;

const urls = (spec: any): string[] => {
    const found: string[] = [];
    const visit = (node: any) => {
        if (!node || typeof node !== 'object') return;
        if (typeof node.url === 'string') found.push(node.url);
        for (const [key, value] of Object.entries(node)) if (key !== 'values') visit(value);
    };
    visit(spec);
    return found;
};

/** The unit that draws the regions: the one whose colour comes from a field. */
const regionsOf = (spec: any): any => {
    let found: any;
    const visit = (node: any) => {
        if (!node || typeof node !== 'object' || found) return;
        if (node.encoding?.color?.field && node.data) found = node;
        for (const key of ['layer', 'vconcat', 'hconcat', 'concat']) if (Array.isArray(node[key])) node[key].forEach(visit);
    };
    visit(spec);
    return found;
};
const layerOf = (spec: any, feature: string): any => (spec.layer ?? []).find((layer: any) => layer.data?.format?.feature === feature);
const credit = (spec: any) => readCanvasFurniture(spec).find((item) => item.text?.includes('World Bank'));

describe('the world’s boundaries', () => {
    it('are the World Bank’s by default, coarse for the world and medium for a region, its disputed borders dotted over the regions', () => {
        const world: any = assembleVegaLite(choropleth([{ Country: 'France', Value: 0.4 }, { Country: 'Brazil', Value: 0.1 }, { Country: 'Japan', Value: 0.2 }]));
        expect(regionsOf(world).data.url).toBe(BOUNDARY_URLS.worldBank.coarse);
        const disputed = layerOf(world, 'disputed');
        expect(disputed.data.url).toBe(BOUNDARY_URLS.worldBank.coarse);
        expect(disputed.mark.strokeDash).toBeDefined();
        expect(world.layer.indexOf(disputed)).toBeGreaterThan(world.layer.indexOf(regionsOf(world)));
        const europe: any = assembleVegaLite(choropleth([{ Country: 'France', Value: 0.4 }, { Country: 'Germany', Value: 0.1 }]));
        expect(regionsOf(europe).data.url).toBe(BOUNDARY_URLS.worldBank.medium);
        const points: any = assembleVegaLite({ ...pointMap(), data: { values: [{ Lon: 2.35, Lat: 48.86 }, { Lon: 13.4, Lat: 52.52 }] } });
        expect(points.layer.find((layer: any) => layer.data?.format?.feature === 'countries').data.url).toBe(BOUNDARY_URLS.worldBank.medium);
        expect(layerOf(points, 'disputed')).toBeDefined();
    });

    it('are Natural Earth’s where the chart asks, without disputed borders or a credit', () => {
        const spec: any = assembleVegaLite(choropleth([{ Country: 'France', Value: 0.4 }, { Country: 'Brazil', Value: 0.1 }], {}, { boundaries: 'natural-earth' }));
        expect(regionsOf(spec).data.url).toBe(BOUNDARY_URLS.naturalEarth);
        expect(layerOf(spec, 'disputed')).toBeUndefined();
        expect(credit(spec)).toBeUndefined();
        expect(spec._attribution).toBe('Natural Earth');
    });

    it('credit the World Bank at the map’s foot, linked, with its disclaimer on hover', () => {
        const spec: any = assembleVegaLite(choropleth([{ Country: 'France', Value: 0.4 }, { Country: 'Brazil', Value: 0.1 }]));
        expect(credit(spec)).toEqual(expect.objectContaining({ text: WORLD_BANK_CREDIT.text, href: WORLD_BANK_CREDIT.href, title: WORLD_BANK_CREDIT.title }));
        // At the foot's start, the bottom left.
        expect(credit(spec)!.left).toBeDefined();
        expect(credit(spec)!.right).toBeUndefined();
        expect(spec._attribution).toMatch(/World Bank/);
        // Under the chart's own source line, which keeps its words.
        const sourced: any = assembleVegaLite({ ...choropleth([{ Country: 'France', Value: 0.4 }]), chart_spec: { ...choropleth([{ Country: 'France', Value: 0.4 }]).chart_spec, source: 'Eurostat' } });
        const texts = readCanvasFurniture(sourced).map((item) => item.text ?? '');
        expect(texts.some((text) => text.includes('Eurostat'))).toBe(true);
        expect(credit(sourced)).toBeDefined();
        // The US maps draw public-domain boundaries: nothing to credit.
        expect(credit(assembleVegaLite(choropleth([{ State: 'Texas', Value: 0.4 }])))).toBeUndefined();
    });

    it('key France’s overseas departments as France', () => {
        const countries = (worldBankTopology.coarse as any).objects.countries.geometries;
        expect(countries.filter((g: any) => g.id === 250).length).toBeGreaterThan(1);
    });

    it('render to SVG from the package, without the network', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
        try {
            const svg = await renderSvg(choropleth([{ Country: 'France', Value: 0.4 }, { Country: 'Brazil', Value: 0.1 }]));
            expect(fetchSpy).not.toHaveBeenCalled();
            expect((svg.match(/<path/g) ?? []).length).toBeGreaterThan(150);
            expect(svg).toContain('stroke-dasharray');
            expect(svg).toContain(WORLD_BANK_CREDIT.text);
        } finally {
            fetchSpy.mockRestore();
        }
    });
});

describe('the default boundaries’ URLs', () => {
    const all = [BOUNDARY_URLS.worldBank.coarse, BOUNDARY_URLS.worldBank.medium, BOUNDARY_URLS.naturalEarth, BOUNDARY_URLS.usStates, BOUNDARY_URLS.usAlbers];

    it('name the package’s own files under the current version on Flint’s site', () => {
        for (const url of all) {
            expect(url.startsWith(`${SITE_GEO}/${GEO_VERSION}/`)).toBe(true);
            const file = url.slice(`${SITE_GEO}/${GEO_VERSION}/`.length);
            expect(existsSync(new URL(`../src/geo/${file}`, import.meta.url))).toBe(true);
        }
    });

    it('are answered from the package, as are the identical files earlier releases named', async () => {
        const fetched: string[] = [];
        const loader = withBundledBoundaries({ load: async (uri: string) => { fetched.push(uri); throw new Error('offline'); } });
        for (const url of all) await expect(loader.load(url)).resolves.toBeTypeOf('object');
        await expect(loader.load('https://vega.github.io/vega-lite/data/world-110m.json')).resolves.toBe(naturalEarthTopology);
        await expect(loader.load('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-albers-10m.json')).resolves.toBe(usAlbersTopology);
        expect(fetched).toEqual([]);
        // Vega's us-10m.json keys its states by number, unlike the bundled us-atlas file: fetched as named.
        await expect(loader.load('https://vega.github.io/vega-lite/data/us-10m.json')).rejects.toThrow('offline');
    });
});

describe('the named boundaries, offline', () => {
    it('are written into a compiled spec by inlineBoundaries, which leaves the spec given as it was', () => {
        const world: any = assembleVegaLite(choropleth([{ Country: 'France', Value: 0.4 }, { Country: 'Brazil', Value: 0.1 }, { Country: 'Japan', Value: 0.2 }]));
        const inlined: any = inlineBoundaries(world);
        expect(urls(inlined)).toEqual([]);
        expect(regionsOf(inlined).data.values === worldBankTopology.coarse).toBe(true);
        expect(regionsOf(inlined).data.format).toEqual({ type: 'topojson', feature: 'countries' });
        expect(urls(world)).toContain(BOUNDARY_URLS.worldBank.coarse);
        for (const spec of [
            assembleVegaLite(choropleth([{ Country: 'France', Value: 0.4 }], {}, { boundaries: 'natural-earth' })),
            assembleVegaLite(choropleth([{ State: 'Texas', Value: 0.4 }], {}, { level: 'auto' })),
            assembleVegaLite(pointMap()),
        ] as any[]) {
            expect(urls(inlineBoundaries(spec))).toEqual([]);
        }
        // A file of the chart's own keeps its URL.
        const own: any = inlineBoundaries(assembleVegaLite(choropleth([{ Country: 'France', Value: 0.4 }], {}, { boundaries: { url: '/maps/world.json', feature: 'countries' } })));
        expect(new Set(urls(own))).toEqual(new Set(['/maps/world.json']));
    });
});

describe('a file of the chart’s own', () => {
    const joined = (spec: any): any[] => {
        const find = (node: any): any => {
            for (const transform of node?.transform ?? []) if (transform.lookup) return transform;
            for (const layer of node?.layer ?? []) { const found = find(layer); if (found) return found; }
            return undefined;
        };
        return find(spec)?.from.data.values ?? [];
    };
    const rows = [{ Country: 'France', Value: 0.4 }, { Country: 'Brazil', Value: 0.1 }, { Country: 'Japan', Value: 0.2 }];

    it('is drawn from its URL, or inline, with no named set’s credit or dotted borders', () => {
        const byUrl: any = assembleVegaLite(choropleth(rows, {}, { boundaries: { url: '/maps/world.json', feature: 'countries' } }));
        expect(regionsOf(byUrl).data).toMatchObject({ url: '/maps/world.json', format: { type: 'topojson', feature: 'countries' } });
        expect(layerOf(byUrl, 'disputed')).toBeUndefined();
        expect(credit(byUrl)).toBeUndefined();
        expect(byUrl._attribution).toBeUndefined();
        const inline: any = assembleVegaLite(choropleth(rows, {}, { boundaries: { values: naturalEarthTopology, feature: 'countries' } }));
        expect(urls(inline)).toEqual([]);
        expect(regionsOf(inline).data.values === naturalEarthTopology).toBe(true);
        const detailed: any = assembleVegaLite(choropleth([{ Country: 'France', Value: 0.4 }, { Country: 'Germany', Value: 0.1 }], {}, { boundaries: { url: { coarse: '/c.json', medium: '/m.json' }, feature: 'countries' } }));
        expect(regionsOf(detailed).data.url).toBe('/m.json');
    });

    it('is credited as its attribution says, and dots the borders it names', () => {
        const spec: any = assembleVegaLite(choropleth(rows, {}, { boundaries: { url: '/maps/world.json', feature: 'countries', disputed: 'lines', attribution: 'Survey of India' } }));
        expect(spec._attribution).toBe('Survey of India');
        expect(readCanvasFurniture(spec).some((item) => item.text === 'Boundaries: Survey of India')).toBe(true);
        expect(layerOf(spec, 'lines').data.url).toBe('/maps/world.json');
        const linked: any = assembleVegaLite(choropleth(rows, {}, { boundaries: { url: '/w.json', feature: 'countries', attribution: { text: 'Map: Ordnance Survey', href: 'https://example.org' } } }));
        expect(readCanvasFurniture(linked).find((item) => item.text === 'Map: Ordnance Survey')?.href).toBe('https://example.org');
    });

    it('joins the rows by the ids it says it has, read from its key', () => {
        const numeric: any = assembleVegaLite(choropleth(rows, {}, { boundaries: { url: '/w.json', feature: 'countries' } }));
        expect(regionsOf(numeric).transform).toContainEqual({ calculate: 'toNumber(datum["id"])', as: '__geo_key' });
        expect(joined(numeric).map((row) => row.__geo_id).sort((a, b) => a - b)).toEqual([76, 250, 392]);
        const alpha3: any = assembleVegaLite(choropleth(rows, {}, { boundaries: { url: '/w.json', feature: 'countries', ids: 'iso3', key: 'properties.iso' } }));
        expect(regionsOf(alpha3).transform).toContainEqual({ calculate: 'upper(toString(datum["properties"]["iso"]))', as: '__geo_key' });
        expect(joined(alpha3).map((row) => row.__geo_id).sort()).toEqual(['BRA', 'FRA', 'JPN']);
        const alpha2: any = assembleVegaLite(choropleth(rows, {}, { boundaries: { url: '/w.json', feature: 'countries', ids: 'iso2' } }));
        expect(joined(alpha2).map((row) => row.__geo_id).sort()).toEqual(['BR', 'FR', 'JP']);
    });

    it('keyed by FIPS draws the US in longitude and latitude, fitted to its shapes', () => {
        const spec: any = assembleVegaLite(choropleth([{ State: 'California', Value: 0.4 }, { State: 'Texas', Value: 0.1 }], {}, { boundaries: { url: '/us.json', feature: 'states' } }));
        expect(spec.projection).toEqual({ type: 'albersUsa' });
        expect(spec._geoPreProjection).toBeUndefined();
        expect(joined(spec).map((row) => row.__geo_id).sort((a, b) => a - b)).toEqual([6, 48]);
    });

    it('keyed by its own keys joins the rows as given, fitted to its shapes', () => {
        const spec: any = assembleVegaLite({
            data: { values: [{ Province: 'GD', Growth: 0.4 }, { Province: 'ZJ', Growth: 0.1 }] },
            semantic_types: { Province: 'Category', Growth: 'Percentage' },
            chart_spec: {
                chartType: 'Choropleth', encodings: { id: 'Province', color: 'Growth' },
                chartProperties: { boundaries: { url: '/cn.json', feature: 'provinces', ids: 'as-is', key: 'properties.code' } },
            },
        } as any);
        expect(spec.projection).toEqual({ type: 'mercator' });
        expect(spec.data.url).toBe('/cn.json');
        expect(spec.transform).toContainEqual({ calculate: 'toString(datum["properties"]["code"])', as: '__geo_key' });
        expect(joined(spec).map((row) => row.__geo_id).sort()).toEqual(['GD', 'ZJ']);
    });

    it('draws a point map’s land', () => {
        const spec: any = assembleVegaLite(pointMap({}, { boundaries: { url: '/w.json', feature: 'countries', attribution: 'Survey of India' } }));
        expect(spec.layer.find((layer: any) => layer.data?.url === '/w.json')).toBeDefined();
        expect(spec._attribution).toBe('Survey of India');
    });

    it('that is malformed, or a name Flint does not ship, falls back to the World Bank’s with a warning', () => {
        for (const boundaries of ['ordnance-survey', { feature: 'countries' }, { url: '/w.json', ids: 'iso9' }]) {
            const spec: any = assembleVegaLite(choropleth(rows, {}, { boundaries }));
            expect(regionsOf(spec).data.url).toBe(BOUNDARY_URLS.worldBank.coarse);
            expect((spec._warnings ?? []).some((w: any) => w.code === 'invalid-option-value' && /boundaries/.test(w.message))).toBe(true);
        }
    });
});
