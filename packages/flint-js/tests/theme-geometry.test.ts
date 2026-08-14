// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';
import { resolveGeometry } from '../src/core/theme/ground';
import type { ThemeSpec } from '../src/core/theme/types';

/**
 * Geometry is the one part of a theme that a chart type is allowed to answer
 * for itself. The lab measured why: inside a single language, line width and
 * dot treatment move with the chart — NYT dots every reading of a connected
 * scatter and none of the Keeling curve — so a flat profile cannot state a
 * house honestly, and one spec per language is the rule being tested.
 */

const LINE_DATA = [
    { Year: 2019, Share: 12, Country: 'Norway' },
    { Year: 2020, Share: 18, Country: 'Norway' },
    { Year: 2021, Share: 25, Country: 'Norway' },
    { Year: 2019, Share: 4, Country: 'France' },
    { Year: 2020, Share: 7, Country: 'France' },
    { Year: 2021, Share: 11, Country: 'France' },
];

const BAR_DATA = [
    { Cause: 'Heart disease', Deaths: 695 },
    { Cause: 'Cancer', Deaths: 605 },
    { Cause: 'Injury', Deaths: 224 },
];

function line(theme?: ThemeSpec, chartType = 'Line Chart'): any {
    return assembleVegaLite({
        data: { values: LINE_DATA },
        semantic_types: { Year: 'Year', Share: 'Percentage', Country: 'Country' },
        chart_spec: {
            chartType,
            encodings: { x: { field: 'Year' }, y: { field: 'Share' }, color: { field: 'Country' } },
            baseSize: { width: 400, height: 300 },
        },
        ...(theme ? { theme_spec: theme } : {}),
    } as any);
}

function bar(theme?: ThemeSpec): any {
    return assembleVegaLite({
        data: { values: BAR_DATA },
        semantic_types: { Cause: 'Category', Deaths: 'Quantity' },
        chart_spec: {
            chartType: 'Bar Chart',
            encodings: { x: { field: 'Cause' }, y: { field: 'Deaths' } },
            baseSize: { width: 400, height: 300 },
        },
        ...(theme ? { theme_spec: theme } : {}),
    } as any);
}

const reportOf = (spec: any) => JSON.stringify(spec._theme?.report ?? []);

describe('theme geometry — the common profile', () => {    it('draws lines at the width the house states', () => {
        const spec = line({ id: 'h', geometry: { line: { width: 3.5 } } });
        expect(spec.config.line.strokeWidth).toBe(3.5);
    });

    it('carries a dot at every reading when the house asks for one', () => {
        const spec = line({ id: 'h', geometry: { point: { presence: 'full', size: 40 } } });
        expect(spec.config.line.point).toBeTruthy();
        expect(spec.config.line.point.size).toBe(40);
    });

    it('leaves the line bare where the house omits its dots', () => {
        const spec = line({ id: 'h', geometry: { point: { presence: 'omit' } } });
        expect(spec.config.line?.point).toBeFalsy();
    });

    it('fills the band to the fraction the house states', () => {
        const wide = bar({ id: 'h', geometry: { band: { fraction: 0.95 } } });
        const narrow = bar({ id: 'h', geometry: { band: { fraction: 0.4 } } });
        const padding = (spec: any) => spec.encoding.x.scale.paddingInner;
        expect(padding(wide)).toBeLessThan(padding(narrow));
    });

    it('rounds the value end of a bar to the house radius', () => {
        const spec = bar({ id: 'h', geometry: { band: { cornerRadius: 6 } } });
        expect(spec.config.bar.cornerRadiusEnd).toBe(6);
    });
});

describe('theme geometry — conditional on what the compiler already knows', () => {
    /**
     * The lab refused a per-chart-type key and pointed here instead: NYT, the
     * Economist and Power BI each thin their line to exactly 2px on the
     * four-series chart and run thicker on a lone series, and Power BI drops
     * its dots only where the chart is faceted into sixteen panels.
     */
    it('thins the line where several series share the plot', () => {
        const theme: ThemeSpec = {
            id: 'h',
            geometry: { line: { width: 2.4 }, point: { presence: 'full', size: 45 } },
            variants: [{
                when: { seriesCount: { gte: 2 } },
                then: { geometry: { line: { width: 2 }, point: { size: 26 } } },
                because: 'several lines in one plot crowd; a thinner stroke keeps them apart',
            }],
        };
        const many = line(theme);
        expect(many.config.line.strokeWidth).toBe(2);
        expect(many.config.line.point.size).toBe(26);
    });

    it('keeps the standing profile where the guard does not hold', () => {
        const theme: ThemeSpec = {
            id: 'h',
            geometry: { line: { width: 2.4 } },
            variants: [{
                when: { seriesCount: { gte: 2 } },
                then: { geometry: { line: { width: 2 } } },
                because: 'crowding',
            }],
        };
        const single = assembleVegaLite({
            data: { values: LINE_DATA.filter((r) => r.Country === 'Norway') },
            semantic_types: { Year: 'Year', Share: 'Percentage' },
            chart_spec: {
                chartType: 'Line Chart',
                encodings: { x: { field: 'Year' }, y: { field: 'Share' } },
                baseSize: { width: 400, height: 300 },
            },
            theme_spec: theme,
        } as any);
        expect(single.config.line.strokeWidth).toBe(2.4);
    });
});

describe('theme geometry — what a chart cannot hear', () => {
    it('drops geometry the template does not build, and says so', () => {
        const { geometry, report } = resolveGeometry(
            { id: 'h', geometry: { arc: { gap: 4 }, line: { width: 2 } } },
            'Line Chart',
            ['line', 'point'],
        );
        expect(geometry.arc).toBeUndefined();
        expect(geometry.line?.width).toBe(2);
        expect(JSON.stringify(report)).toContain('builds no arc');
    });

    it('keeps the whole profile for a template that has not declared its shapes', () => {
        const { geometry } = resolveGeometry(
            { id: 'h', geometry: { arc: { gap: 4 } } },
            'Some Chart',
            undefined,
        );
        expect(geometry.arc?.gap).toBe(4);
    });

    it('reports the drop on the assembled chart, not only in the resolver', () => {
        const spec = bar({ id: 'h', geometry: { arc: { gap: 4 }, band: { fraction: 0.6 } } });
        expect(reportOf(spec)).toContain('builds no arc');
    });
});

describe('theme geometry — compatibility with `marks`', () => {
    it('reads a marks-only theme as its geometry profile', () => {
        const { geometry } = resolveGeometry(
            { id: 'h', marks: { strokeWeight: 2.5, bandFraction: 0.7, point: { presence: 'full', size: 30 } } },
            'Line Chart',
            ['line', 'point'],
        );
        expect(geometry.line?.width).toBe(2.5);
        expect(geometry.point?.size).toBe(30);
    });

    it('lets geometry override the marks it was derived from', () => {
        const spec = line({
            id: 'h',
            marks: { strokeWeight: 1 },
            geometry: { line: { width: 5 } },
        });
        expect(spec.config.line.strokeWidth).toBe(5);
    });

    it('leaves a chart with no theme exactly as it was', () => {
        expect(JSON.stringify(line())).toBe(JSON.stringify(line()));
        expect(line().config?.line?.strokeWidth).toBeUndefined();
    });
});
