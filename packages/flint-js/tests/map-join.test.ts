// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { validateChart } from '../src/validate';
import { isAggregateRegion, keyTypeResolver } from '../src/chart-types/geo';

/**
 * A choropleth gives each region one value, joined from the rows by a key the gazetteer reads.
 * Rows that share a region combine as the measure does; keys that name no region are reported.
 */

const input = (rows: Record<string, unknown>[], semantic: Record<string, string>, properties: Record<string, unknown> = {}, color: Record<string, unknown> = {}) => ({
    data: { values: rows },
    semantic_types: semantic,
    chart_spec: { chartType: 'Choropleth', encodings: { id: { field: Object.keys(rows[0])[0] }, color: { field: 'Value', ...color } }, chartProperties: properties },
}) as any;

/** The unit drawing the regions: the map itself, or the layer whose colour comes from a field. */
const regionsOf = (spec: any): any => (Array.isArray(spec.layer) ? spec.layer.find((layer: any) => layer.encoding?.color?.field) : spec);
const joined = (spec: any): any[] => {
    const lookup = (regionsOf(spec).transform ?? []).find((step: any) => step.lookup);
    return lookup.from.data.values;
};
const codes = (spec: any): string[] => (spec._warnings ?? []).map((warning: any) => warning.code);

describe('rows that share a region', () => {
    const rows = [{ Country: 'France', Value: 10 }, { Country: 'FRA', Value: 30 }, { Country: 'Germany', Value: 5 }];

    it('sum where the measure is a total', () => {
        const spec: any = assembleVegaLite(input(rows, { Country: 'Country', Value: 'Count' }));
        expect(joined(spec).find((row) => row.__geo_id === 250).Value).toBe(40);
        expect(joined(spec)).toHaveLength(2);
        expect(codes(spec)).toContain('map-rows-combined');
    });

    it('average where it is a rate or a share', () => {
        const spec: any = assembleVegaLite(input(rows, { Country: 'Country', Value: 'Percentage' }));
        expect(joined(spec).find((row) => row.__geo_id === 250).Value).toBe(20);
    });

    it('combine by the encoding’s own aggregate where it states one', () => {
        const spec: any = assembleVegaLite(input(rows, { Country: 'Country', Value: 'Count' }, {}, { aggregate: 'max' }));
        const field = regionsOf(spec).encoding.color.field;
        expect(joined(spec).find((row) => row.__geo_id === 250)[field]).toBe(30);
        expect(regionsOf(spec).encoding.color.aggregate).toBeUndefined();
    });
});

describe('the join report', () => {
    const rows = [
        { Country: 'France', Value: 0.4 }, { Country: 'Narnia', Value: 0.1 }, { Country: 'World', Value: 0.3 },
        { Country: 'OECD', Value: 0.2 },
    ];

    it('names keys that match no region, and groups of countries', () => {
        const spec: any = assembleVegaLite(input(rows, { Country: 'Country', Value: 'Percentage' }));
        const byCode = Object.fromEntries((spec._warnings ?? []).map((warning: any) => [warning.code, warning.message]));
        expect(byCode['map-unmatched-keys']).toMatch(/"Narnia"/);
        expect(byCode['map-unmatched-keys']).not.toMatch(/"World"|"OECD"/);
        expect(byCode['map-unmatched-keys']).toMatch(/keyType/);
        expect(byCode['map-aggregate-rows']).toMatch(/"World", "OECD"/);
        expect(joined(spec).map((row) => row.Country)).toEqual(['France']);
    });

    it('warns that a total coloured by area lets large regions dominate', () => {
        const spec: any = assembleVegaLite(input([{ Country: 'France', Value: 68e6 }], { Country: 'Country', Value: 'Count' }));
        expect(codes(spec)).toContain('map-total-on-choropleth');
        const rate: any = assembleVegaLite(input([{ Country: 'France', Value: 0.4 }], { Country: 'Country', Value: 'Percentage' }));
        expect(codes(rate)).not.toContain('map-total-on-choropleth');
    });

    it('reaches validate_chart', () => {
        const result = validateChart(input(rows, { Country: 'Country', Value: 'Percentage' }), 'vegalite');
        expect(result.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(['map-unmatched-keys', 'map-aggregate-rows']));
    });

    it('stays quiet when every key names a region', () => {
        const spec: any = assembleVegaLite(input([{ Country: 'France', Value: 0.4 }, { Country: 'Germany', Value: 0.2 }], { Country: 'Country', Value: 'Percentage' }));
        expect(spec._warnings ?? []).toEqual([]);
    });
});

describe('declared key types', () => {
    it('read the key in one namespace: CA is Canada as ISO 2, California as a US state', () => {
        expect(keyTypeResolver('iso2')!('CA')).toBe(124);
        expect(keyTypeResolver('us-state')!('CA')).toBe(6);
        expect(keyTypeResolver('iso3')!('ca')).toBeUndefined();
        expect(keyTypeResolver('iso-numeric')!('076')).toBe(76);
        expect(keyTypeResolver('iso-numeric')!('999')).toBeUndefined();
        expect(keyTypeResolver('country-name')!('840')).toBeUndefined();
        expect(keyTypeResolver('auto')).toBeUndefined();
    });

    it('pick the map without guessing', () => {
        const rows = [{ Code: 'CA', Value: 1 }, { Code: 'IN', Value: 2 }];
        const world: any = assembleVegaLite(input(rows, { Code: 'Category', Value: 'Percentage' }, { keyType: 'iso2' }));
        const us: any = assembleVegaLite(input(rows, { Code: 'Category', Value: 'Percentage' }, { keyType: 'us-state' }));
        expect(regionsOf(world).data.url).toMatch(/world-bank/);
        expect(joined(world).map((row) => row.__geo_id).sort((a, b) => a - b)).toEqual([124, 356]);
        expect(regionsOf(us).data.url).toMatch(/counties-albers/);
        expect(joined(us).map((row) => row.__geo_id).sort((a, b) => a - b)).toEqual([6, 18]);
    });

    it('know a group of countries by name or code', () => {
        for (const value of ['World', 'OECD members', 'Sub-Saharan Africa', 'WLD', 'High income', 'European Union']) {
            expect(isAggregateRegion(value), value).toBe(true);
        }
        for (const value of ['France', 'South Africa', 'United States']) expect(isAggregateRegion(value), value).toBe(false);
    });
});
