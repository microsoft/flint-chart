// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';
import type { ThemeSpec } from '../src/core/theme/types';

/**
 * `seriesEnd` names each band at its own last reading. The name can be knocked
 * out *inside* the band, or hung *outside* the plot in the series' own ink —
 * and that is a preference about the whole set, not a per-series decision.
 *
 * The two positions carry different ink and sit on opposite sides of the plot
 * edge, so a set split between them reads as two kinds of label rather than one
 * label with less room. One band that cannot hold its name sends every name out.
 */

const YEARS = [1950, 1970, 1990, 2010, 2020];

/** A stacked area whose bands are `sizes`, each grown across the years. */
function stack(sizes: Record<string, number>): any[] {
    const out: any[] = [];
    YEARS.forEach((Year, i) => {
        const growth = 0.6 + (i / (YEARS.length - 1)) * 0.4;
        for (const [Region, top] of Object.entries(sizes)) {
            out.push({ Year, Region, Population: Math.round(top * growth) });
        }
    });
    return out;
}

const house: ThemeSpec = {
    id: 'house',
    label: 'House',
    ink: {
        surface: { canvas: '#ffffff', plot: '#ffffff' },
        text: { primary: '#111111' },
        series: {
            single: '#333333',
            categorical: ['#111111', '#2251ff', '#00a9f4', '#00d7b9', '#b3b8bd'],
        },
    },
    legend: { show: 'always', placement: ['seriesEnd', 'right'] },
} as ThemeSpec;

function build(sizes: Record<string, number>): any {
    return assembleVegaLite({
        data: { values: stack(sizes) },
        semantic_types: { Year: 'Year', Region: 'Category', Population: 'Quantity' },
        chart_spec: {
            chartType: 'Area Chart',
            title: 'World population by region',
            encodings: { x: 'Year', y: 'Population', color: 'Region' },
            baseSize: { width: 480, height: 320 },
            chartProperties: { stackMode: 'stack' },
        },
        theme_spec: house,
    } as any) as any;
}

/**
 * Every band-end name layer, and whether it is the inset one. The inset layer
 * paints its text in the plot surface to knock the name out of the band; the
 * outset layer leaves the text in the series ink.
 */
function bandNameLayers(node: any, acc: Array<{ inset: boolean; align?: string; calc: string }> = []): typeof acc {
    if (!node || typeof node !== 'object') return acc;
    if (Array.isArray(node)) {
        node.forEach((n) => bandNameLayers(n, acc));
        return acc;
    }
    const mark = typeof node.mark === 'string' ? { type: node.mark } : node.mark;
    if (mark?.type === 'text' && node.encoding?.text?.field === '__bandEndLabel') {
        const calc = (node.transform ?? []).find((tf: any) => tf.as === '__bandEndLabel')?.calculate ?? '';
        acc.push({ inset: typeof mark.color === 'string', align: mark.align, calc });
    }
    for (const key of ['layer', 'vconcat', 'hconcat', 'concat']) {
        if (Array.isArray(node[key])) node[key].forEach((n: any) => bandNameLayers(n, acc));
    }
    if (node.spec) bandNameLayers(node.spec, acc);
    if (node.facet?.spec) bandNameLayers(node.facet.spec, acc);
    return acc;
}

const messages = (spec: any): string[] =>
    (spec._theme?.report ?? [])
        .filter((r: any) => r.path === 'legend.placement')
        .map((r: any) => r.message);

describe('band-end names are inset or outset as a set', () => {
    it('knocks every name into its band when each band can hold one', () => {
        const layers = bandNameLayers(build({ Asia: 3000, Africa: 1400, Europe: 1200 }));
        expect(layers.length).toBe(1);
        expect(layers[0].inset).toBe(true);
    });

    it('sends every name outside when a single band is too thin to hold one', () => {
        // Oceania under four other continents: one sliver, four comfortable bands.
        const spec = build({ Asia: 4641, Africa: 1361, Europe: 748, Americas: 1023, Oceania: 45 });
        const layers = bandNameLayers(spec);

        // The whole point: one layer, and it is the outset one. Never a mix.
        expect(layers.length).toBe(1);
        expect(layers[0].inset).toBe(false);
        expect(messages(spec).join(' ')).toMatch(/all or nothing/);
    });

    it('never draws the inset and outset layers together', () => {
        const cases: Record<string, number>[] = [
            { Asia: 3000, Africa: 1400, Europe: 1200 },
            { Asia: 4641, Africa: 1361, Europe: 748, Americas: 1023, Oceania: 45 },
            { Asia: 4641, Africa: 40, Europe: 30, Americas: 1023, Oceania: 45 },
        ];
        for (const sizes of cases) {
            const layers = bandNameLayers(build(sizes));
            expect(new Set(layers.map((l) => l.inset)).size).toBe(1);
        }
    });
});

describe('the reading rides with the name only where it annotates something', () => {
    it('quotes the last reading beside a name lying on its own band', () => {
        const [label] = bandNameLayers(build({ Asia: 3000, Africa: 1400, Europe: 1200 }));
        expect(label.inset).toBe(true);
        expect(label.calc).toContain('Population');
    });

    it('drops the reading once the names are a list in the margin', () => {
        const [label] = bandNameLayers(
            build({ Asia: 4641, Africa: 1361, Europe: 748, Americas: 1023, Oceania: 45 }),
        );
        expect(label.inset).toBe(false);
        // Out here the name is a legend entry, not an annotation: no number.
        expect(label.calc).not.toContain('Population');
        expect(label.calc).toContain('Region');
    });
});
