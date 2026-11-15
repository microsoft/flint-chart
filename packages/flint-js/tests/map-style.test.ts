// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { parseColor, luminance } from '../src/core/theme/presence';
import { jenksColorClasses, quantileColorClasses } from '../src/core/color-controls';
import { MAP_ROLE } from '../src/vegalite/templates/map-style';
import { readCanvasFurniture } from '../src/vegalite/canvas-furniture';

/**
 * A map's ground follows the theme's page, or one of the named map styles; a choropleth's colour
 * is classed — quantiles unless asked otherwise — and both are chart properties a host can offer.
 */

const GDP = [
    ['United States', 25000], ['China', 18000], ['Japan', 4200], ['Germany', 4100], ['India', 3400], ['France', 2800],
    ['Brazil', 1900], ['Canada', 2100], ['Mexico', 1400], ['Nigeria', 480], ['Kenya', 110], ['Peru', 240], ['Chile', 300],
    ['Egypt', 470], ['Vietnam', 410], ['Poland', 690], ['Norway', 580], ['Argentina', 630], ['Australia', 1700], ['Spain', 1400],
].map(([Country, Rate]) => ({ Country, Rate }));

const choropleth = (properties: Record<string, unknown> = {}, extra: Record<string, unknown> = {}, color: Record<string, unknown> = {}) => assembleVegaLite({
    data: { values: GDP },
    semantic_types: { Country: 'Country', Rate: 'Rate' },
    chart_spec: { chartType: 'Choropleth', encodings: { id: 'Country', color: { field: 'Rate', ...color } }, chartProperties: properties },
    ...extra,
} as any) as any;

const units = (spec: any): any[] => {
    const out: any[] = [];
    const visit = (node: any) => {
        if (!node || typeof node !== 'object') return;
        out.push(node);
        for (const key of ['layer', 'vconcat', 'hconcat', 'concat']) if (Array.isArray(node[key])) node[key].forEach(visit);
    };
    visit(spec);
    return out;
};
const noDataOf = (spec: any): string => {
    const color = units(spec).map((unit) => unit.encoding?.color).find((enc) => enc?.condition);
    return (Array.isArray(color.condition) ? color.condition[0] : color.condition).value;
};
const dark = (color: string) => luminance(parseColor(color)!) < 0.35;
/** The unit drawing the regions: the one whose colour comes from a field. */
const regionsOf = (spec: any): any => units(spec).find((unit) => unit.encoding?.color?.field && unit.data);
const roleOf = (layer: any) => (layer.data?.graticule ? 'graticule' : layer.data?.format?.feature === 'disputed' ? 'disputed'
    : layer.data?.format?.mesh ? 'borders' : (layer.mark?.type ?? layer.mark) === 'rect' ? 'water' : 'regions');

describe('the ground of a map', () => {
    it('follows a dark theme’s page: land without data, borders and sea are dark, not light grey and white', () => {
        const spec = choropleth({}, { theme_spec: 'powerbi' });
        expect(dark(spec.background ?? spec.config.background)).toBe(true);
        expect(dark(noDataOf(spec))).toBe(true);
        const regions = units(spec).find((unit) => unit.mark?.type === 'geoshape' && unit.encoding?.color?.field);
        expect(regions.mark.stroke).not.toBe('white');
        expect(dark(regions.mark.stroke)).toBe(true);
        const globe = choropleth({ projection: 'orthographic' }, { theme_spec: 'powerbi' });
        const sea = units(globe).find((unit) => unit.data?.sphere);
        expect(dark(sea.mark.fill)).toBe(true);
    });

    it('takes a named style’s colours, the sea filling a flat map’s plot only where the style paints water', () => {
        const frameOf = (spec: any) => units(spec).find((unit) => unit.mark?.type === 'rect' && unit.encoding?.x2?.value === 'width');
        const atlas = choropleth({ mapStyle: 'atlas' });
        // The water fills the plot as a rectangle beneath the map: Vega-Lite paints no plot background under geoshapes.
        expect(frameOf(atlas).mark.fill).toBe('#dbe9f2');
        expect(atlas.layer[0]).toBe(frameOf(atlas));
        expect(noDataOf(atlas)).toBe('#ebe6db');
        const light = choropleth({ mapStyle: 'light' });
        expect(frameOf(light)).toBeUndefined();
        expect(noDataOf(light)).toBe('#dededb');
        const darkGlobe: any = assembleVegaLite({
            data: { values: [{ Lon: 2, Lat: 48 }] }, semantic_types: { Lon: 'Longitude', Lat: 'Latitude' },
            chart_spec: { chartType: 'Map', encodings: { longitude: 'Lon', latitude: 'Lat' }, chartProperties: { projection: 'orthographic', mapStyle: 'dark' } },
        } as any);
        expect(units(darkGlobe).find((unit) => unit.data?.sphere).mark.fill).toBe('#1d2227');
        const land = units(darkGlobe).find((unit) => unit.mark?.type === 'geoshape' && !unit.data?.sphere);
        expect(land.mark.fill).toBe('#3c434a');
        // Points on the dark ground carry a light ring.
        const point = units(darkGlobe).find((unit) => (typeof unit.mark === 'string' ? unit.mark : unit.mark?.type) === 'circle');
        expect(point.mark.stroke).toBe('#ffffff');
        // A globe floats on the page: no frame round it.
        expect(units(darkGlobe).some((unit) => unit.mark?.type === 'rect')).toBe(false);
    });

    it('takes a style of the caller’s own: a base style with any colour restated, the sea filling the plot', () => {
        const frameOf = (spec: any) => units(spec).find((unit) => unit.mark?.type === 'rect' && unit.encoding?.x2?.value === 'width');
        const custom = choropleth({ mapStyle: { base: 'light', sea: '#1f3b4d', noData: '#e8dcc0', border: '#7a6a4f' }, graticule: true });
        expect(frameOf(custom).mark.fill).toBe('#1f3b4d');
        expect(noDataOf(custom)).toBe('#e8dcc0');
        expect(custom.layer.find((layer: any) => roleOf(layer) === 'borders').mark.stroke).toBe('#7a6a4f');
        // Unstated colours are the base style's.
        expect(custom.layer.find((layer: any) => roleOf(layer) === 'graticule').mark.stroke).toBe('#e8ecef');
        const point: any = assembleVegaLite({
            data: { values: [{ Lon: 23, Lat: 38 }, { Lon: 20, Lat: 39 }] }, semantic_types: { Lon: 'Longitude', Lat: 'Latitude' },
            chart_spec: { chartType: 'Map', encodings: { longitude: 'Lon', latitude: 'Lat' }, chartProperties: { mapStyle: { land: '#efe2c4', coast: '#5b4a33', sea: '#24485a' } } },
        } as any);
        const land = units(point).find((unit) => unit.mark?.type === 'geoshape' && unit.mark.fill === '#efe2c4');
        expect(land?.mark.stroke).toBe('#5b4a33');
        expect(frameOf(point).mark.fill).toBe('#24485a');
        // On a dark sea, a route's halo and the points' ring are drawn for a dark ground.
        expect(units(point).find((unit) => (unit.mark?.type ?? unit.mark) === 'circle').mark.stroke).toBe('#ffffff');
    });

    it('drops a custom style it cannot read, with a warning, for the theme’s ground', () => {
        const spec = choropleth({ mapStyle: { sea: '#123456', glow: 'gold' } }, { theme_spec: 'nyt' });
        expect(units(spec).some((unit) => unit.mark?.fill === '#123456')).toBe(false);
        const warning = spec._warnings.find((w: any) => w.code === 'invalid-option-value');
        expect(warning.message).toMatch(/mapStyle.*a style of your own \{ base\?/);
    });

    it('draws a graticule under the land, and borders as wide as asked', () => {
        const spec = choropleth({ graticule: true, borderWidth: 0 });
        // The water, the graticule on it, the regions, the borders between them, the disputed borders.
        expect(spec.layer.map(roleOf)).toEqual(['water', 'graticule', 'regions', 'borders', 'disputed']);
        expect(spec.layer[2].mark.strokeWidth).toBe(0);
        // The borders a hair wider than asked, to cover the regions' outline; the disputed keep their own width.
        expect(spec.layer[3].mark.strokeWidth).toBeCloseTo(0.15, 6);
        expect(spec.layer[4].mark.strokeWidth).toBeGreaterThan(0);
        expect(choropleth({ mapStyle: 'dark' }).layer.find((layer: any) => roleOf(layer) === 'disputed').mark.stroke).toBe('#8a939b');
        const globe = choropleth({ graticule: true, projection: 'orthographic' });
        expect(globe.layer.findIndex((layer: any) => layer.data?.graticule)).toBe(1);
    });

    it('leaves no role tag in the spec', () => {
        for (const spec of [choropleth(), choropleth({ projection: 'orthographic', graticule: true }), choropleth({}, { theme_spec: 'nyt' })]) {
            expect(units(spec).some((unit) => MAP_ROLE in unit)).toBe(false);
        }
    });
});

describe('a map without house chrome', () => {
    // The boundaries' credit is the map's own, not the house's.
    const furniture = (spec: any) => [
        ...readCanvasFurniture(spec).filter((item) => !item.text?.includes('World Bank Official Boundaries')),
        ...units(spec).filter((unit) => unit.__themeSynthetic),
    ];
    it('draws no header bar, tab, rule or footer credit, unless it asks for them', () => {
        const map = choropleth({}, { theme_spec: 'economist' });
        expect(furniture(map)).toEqual([]);
        const bars: any = assembleVegaLite({
            data: { values: GDP.slice(0, 5) }, semantic_types: { Country: 'Country', Rate: 'Rate' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Country', y: 'Rate' } }, theme_spec: 'economist',
        } as any);
        expect(furniture(bars).length).toBeGreaterThan(0);
        const asked: any = assembleVegaLite({
            data: { values: GDP }, semantic_types: { Country: 'Country', Rate: 'Rate' },
            chart_spec: { chartType: 'Choropleth', encodings: { id: 'Country', color: 'Rate' }, chrome: { header: true, footer: true } }, theme_spec: 'economist',
        } as any);
        expect(furniture(asked).length).toBeGreaterThan(0);
    });

    it('keeps the source line the chart gives, without the house’s credit beside it', () => {
        const spec: any = assembleVegaLite({
            data: { values: GDP }, semantic_types: { Country: 'Country', Rate: 'Rate' },
            chart_spec: { chartType: 'Choropleth', encodings: { id: 'Country', color: 'Rate' }, source: 'World Bank' }, theme_spec: 'bbc',
        } as any);
        const text = JSON.stringify(spec);
        expect(text).toContain('World Bank');
        expect(text).not.toMatch(/"text":\s*"BBC"/);
    });
});

describe('classing a choropleth', () => {
    const breaks = (spec: any) => regionsOf(spec).encoding.color.scale.domain;

    it('puts five classes at the quantiles by default, so each holds about as many countries', () => {
        const spec = choropleth();
        expect(regionsOf(spec).encoding.color.scale.type).toBe('threshold');
        const cuts: number[] = breaks(spec);
        expect(cuts).toHaveLength(4);
        const counts = [0, 0, 0, 0, 0];
        for (const { Rate } of GDP) counts[cuts.filter((cut) => (Rate as number) >= cut).length]++;
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
    });

    it('steps at round values, at natural breaks, or runs continuously, as asked, in as many classes as asked', () => {
        expect(breaks(choropleth({ classes: 'equal', classCount: 4 }))).toEqual([10000, 15000, 20000]);
        expect(breaks(choropleth({ classes: 'jenks', classCount: 3 }))).toHaveLength(2);
        expect(breaks(choropleth({ classCount: 3 }))).toHaveLength(2);
        const smooth = choropleth({ classes: 'continuous' });
        expect(regionsOf(smooth).encoding.color.scale.type).toBeUndefined();
    });

    it('starts a one-way ramp a little in from its end, so the first class does not read as no data', () => {
        const scheme = regionsOf(choropleth()).encoding.color.scale.scheme;
        expect(scheme.extent[0]).toBeGreaterThan(0.1);
    });

    it('classes a themed ramp too, keeping the theme’s colours', () => {
        const spec = choropleth({}, { theme_spec: 'economist' });
        expect(regionsOf(spec).encoding.color.scale.type).toBe('threshold');
        expect(regionsOf(spec).encoding.color.scale.range).toHaveLength(5);
    });

    it('yields to the author’s own bins', () => {
        const spec = choropleth({}, {}, { bins: 0 });
        expect(regionsOf(spec).encoding.color.scale.type).toBeUndefined();
    });

    it('prints breaks short, and drops a break rounding merges', () => {
        expect(quantileColorClasses([1, 2, 3, 4, 1000], 2)!.breaks).toEqual([3]);
        // Values that do not spread give no classes: the ramp stays continuous.
        expect(quantileColorClasses([5, 5, 5, 5, 6], 4)).toBeUndefined();
        expect(jenksColorClasses([1, 2, 3, 100, 101, 102, 1000], 3)!.breaks).toEqual([100, 1000]);
    });
});
