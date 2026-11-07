// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { renderSvg } from '../src/render';
import { basemaps, worldBankTopology, worldTopology, usAlbersTopology } from '../src/geo';
import { BASEMAP_URLS, GEO_VERSION, SITE_GEO, WORLD_BANK_CREDIT } from '../src/chart-types/basemap-sources';
import { withBundledBasemaps } from '../src/vegalite/basemap-loader';
import { readCanvasFurniture } from '../src/vegalite/canvas-furniture';

/**
 * The world map draws the World Bank's official boundaries unless the chart asks for Natural Earth's,
 * and credits them. A host may give a map its boundaries — inline, so the compiled spec draws
 * offline anywhere, or from its own URL — and Flint's renderers serve the defaults from the package.
 */

const choropleth = (rows: Record<string, unknown>[], options: Record<string, unknown> = {}, properties: Record<string, unknown> = {}) => ({
    data: { values: rows },
    semantic_types: { Country: 'Country', State: 'State', Value: 'Percentage' },
    chart_spec: { chartType: 'Choropleth', encodings: { id: { field: Object.keys(rows[0])[0] }, color: { field: 'Value' } }, chartProperties: properties },
    options,
}) as any;
const pointMap = (options: Record<string, unknown> = {}) => ({
    data: { values: [{ Lon: -122.3, Lat: 47.6 }, { Lon: -74, Lat: 40.7 }] },
    semantic_types: { Lon: 'Longitude', Lat: 'Latitude' },
    chart_spec: { chartType: 'Map', encodings: { longitude: 'Lon', latitude: 'Lat' } },
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
        expect(regionsOf(world).data.url).toBe(BASEMAP_URLS.worldBank.coarse);
        const disputed = layerOf(world, 'disputed');
        expect(disputed.data.url).toBe(BASEMAP_URLS.worldBank.coarse);
        expect(disputed.mark.strokeDash).toBeDefined();
        expect(world.layer.indexOf(disputed)).toBeGreaterThan(world.layer.indexOf(regionsOf(world)));
        const europe: any = assembleVegaLite(choropleth([{ Country: 'France', Value: 0.4 }, { Country: 'Germany', Value: 0.1 }]));
        expect(regionsOf(europe).data.url).toBe(BASEMAP_URLS.worldBank.medium);
        const points: any = assembleVegaLite({ ...pointMap(), data: { values: [{ Lon: 2.35, Lat: 48.86 }, { Lon: 13.4, Lat: 52.52 }] } });
        expect(points.layer.find((layer: any) => layer.data?.format?.feature === 'countries').data.url).toBe(BASEMAP_URLS.worldBank.medium);
        expect(layerOf(points, 'disputed')).toBeDefined();
    });

    it('are Natural Earth’s where the chart asks, without disputed borders or a credit', () => {
        const spec: any = assembleVegaLite(choropleth([{ Country: 'France', Value: 0.4 }, { Country: 'Brazil', Value: 0.1 }], {}, { boundaries: 'natural-earth' }));
        expect(regionsOf(spec).data.url).toBe(BASEMAP_URLS.naturalEarth);
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
    const all = [BASEMAP_URLS.worldBank.coarse, BASEMAP_URLS.worldBank.medium, BASEMAP_URLS.naturalEarth, BASEMAP_URLS.us, BASEMAP_URLS.usAlbers];

    it('name the package’s own files under the current version on Flint’s site', () => {
        for (const url of all) {
            expect(url.startsWith(`${SITE_GEO}/${GEO_VERSION}/`)).toBe(true);
            const file = url.slice(`${SITE_GEO}/${GEO_VERSION}/`.length);
            expect(existsSync(new URL(`../src/geo/${file}`, import.meta.url))).toBe(true);
        }
    });

    it('are answered from the package, as are the identical files earlier releases named', async () => {
        const fetched: string[] = [];
        const loader = withBundledBasemaps({ load: async (uri: string) => { fetched.push(uri); throw new Error('offline'); } });
        for (const url of all) await expect(loader.load(url)).resolves.toBeTypeOf('object');
        await expect(loader.load('https://vega.github.io/vega-lite/data/world-110m.json')).resolves.toBe(worldTopology);
        await expect(loader.load('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-albers-10m.json')).resolves.toBe(usAlbersTopology);
        expect(fetched).toEqual([]);
        // Vega's us-10m.json keys its states by number, unlike the bundled us-atlas file: fetched as named.
        await expect(loader.load('https://vega.github.io/vega-lite/data/us-10m.json')).rejects.toThrow('offline');
    });
});

describe('boundaries a host gives', () => {
    it('are drawn inline, so no map fetches anything', () => {
        for (const spec of [
            assembleVegaLite(choropleth([{ Country: 'France', Value: 0.4 }], { basemaps })),
            assembleVegaLite(choropleth([{ Country: 'France', Value: 0.4 }], { basemaps }, { boundaries: 'natural-earth' })),
            assembleVegaLite(choropleth([{ State: 'Texas', Value: 0.4 }], { basemaps }, { level: 'auto' })),
            assembleVegaLite(pointMap({ basemaps })),
        ] as any[]) {
            expect(urls(spec)).toEqual([]);
        }
        const world: any = assembleVegaLite(choropleth([{ Country: 'France', Value: 0.4 }], { basemaps }));
        expect(regionsOf(world).data.values).toBe(worldBankTopology.medium);
        expect(regionsOf(world).data.format).toEqual({ type: 'topojson', feature: 'countries' });
        const natural: any = assembleVegaLite(choropleth([{ Country: 'France', Value: 0.4 }], { basemaps }, { boundaries: 'natural-earth' }));
        expect(regionsOf(natural).data.values).toBe(worldTopology);
    });

    it('load from the host’s URL where it gives one, and from the default where it gives none', () => {
        const own: any = assembleVegaLite(choropleth([{ Country: 'France', Value: 0.4 }], { basemaps: { worldBank: '/maps/world.json' } }));
        expect(regionsOf(own).data.url).toBe('/maps/world.json');
        const levels: any = assembleVegaLite(choropleth([{ Country: 'France', Value: 0.4 }], { basemaps: { worldBank: { coarse: '/maps/coarse.json' } } }));
        expect(regionsOf(levels).data.url).toBe('/maps/coarse.json');
        const us: any = assembleVegaLite(choropleth([{ State: 'Texas', Value: 0.4 }], { basemaps: { worldBank: '/maps/world.json' } }));
        expect(us.data.url).toBe(BASEMAP_URLS.usAlbers);
    });

    it('name who drew them, and credit the host’s own where it says who', () => {
        expect((assembleVegaLite(choropleth([{ State: 'Texas', Value: 0.4 }])) as any)._attribution).toMatch(/Census/);
        const host: any = assembleVegaLite(choropleth([{ Country: 'France', Value: 0.4 }], { basemaps: { worldBank: '/w.json', attribution: 'Ordnance Survey' } }));
        expect(host._attribution).toBe('Ordnance Survey');
        expect(readCanvasFurniture(host).some((item) => item.text === 'Boundaries: Ordnance Survey')).toBe(true);
    });
});
