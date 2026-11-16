// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import { openVegaLiteSession, vegaLiteStages } from '../src/vegalite/assemble';

/**
 * A chart given a canvas is drawn within it. The canvas-fit pass left a chart that still read well
 * drawn larger than its box — keys, labels and title stood past it — for the host to scale down;
 * a host that draws the SVG at its own size cut them off. The chart is now laid out again for a
 * smaller room, so the plot gives up the room and the drawing stands within the canvas.
 */

const MONTHS = Array.from({ length: 12 }, (_, index) => `2024-${String(index + 1).padStart(2, '0')}`);
const CATEGORIES = ['Furniture', 'Office', 'Technology'];
const MONTHLY = MONTHS.flatMap((month, index) => CATEGORIES.map((category, at) => ({ month, category, revenue: 300000 + index * 10000 + at * 100000 })));
const SOURCES = Array.from({ length: 20 }, (_, index) => ['Fossil fuels', 'Nuclear', 'Renewables'].map((source, at) => ({
    year: 2000 + index, source, share: 20 + at * 10 + Math.sin(index) * 3,
}))).flat();

/** The charts the issue showed, each with keys beside or above the plot. */
const CHARTS: Record<string, { values: any[]; chart_spec: any; semantic_types: Record<string, string> }> = {
    stacked: {
        values: MONTHLY,
        chart_spec: { chartType: 'Stacked Bar Chart', encodings: { x: { field: 'month' }, y: { field: 'revenue' }, color: { field: 'category' } } },
        semantic_types: { month: 'YearMonth', revenue: 'Amount' },
    },
    line: {
        values: SOURCES,
        chart_spec: { chartType: 'Line Chart', encodings: { x: { field: 'year' }, y: { field: 'share' }, color: { field: 'source' } } },
        semantic_types: { year: 'Year', share: 'Number' },
    },
    donut: {
        values: CATEGORIES.map((category, index) => ({ category, revenue: 1 + index })),
        chart_spec: { chartType: 'Donut Chart', encodings: { size: { field: 'revenue' }, color: { field: 'category' } } },
        semantic_types: { revenue: 'Amount' },
    },
    bars: {
        values: ['East', 'North', 'South', 'West'].map((region, index) => ({ region, revenue: 3000000 + index * 300000 })),
        chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'revenue' }, y: { field: 'region' } } },
        semantic_types: { revenue: 'Amount' },
    },
};

const THEMES: Record<string, any> = { none: undefined, 'keys on top': { legend: { placement: ['top'] } }, nyt: 'nyt', datawrapper: 'datawrapper' };
const BOXES = [{ width: 600, height: 300 }, { width: 290, height: 300 }, { width: 290, height: 240 }];

function input(chart: string, theme: any, box: { width: number; height: number }, options: Record<string, unknown> = {}, canvas = true): any {
    const { values, chart_spec, semantic_types } = CHARTS[chart]!;
    return {
        data: { values },
        semantic_types,
        chart_spec: { ...chart_spec, baseSize: box, ...(canvas ? { canvasSize: box } : {}) },
        options: { bandStepFit: 1, ...options },
        ...(theme ? { theme_spec: theme } : {}),
    };
}

const quiet: any = {
    level() { return this; }, warn() { return this; }, info() { return this; }, debug() { return this; }, error() { return this; },
};

/** The size of the SVG Vega draws for a spec. */
async function drawnSize(spec: any): Promise<{ width: number; height: number }> {
    const clean = JSON.parse(JSON.stringify(spec, (key, value) => (key.startsWith('_') ? undefined : value)));
    const view = new View(parse(compile(clean, { logger: quiet }).spec), { renderer: 'none', logLevel: 0 });
    const svg = await view.toSVG();
    view.finalize();
    const size = svg.match(/<svg[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/)!;
    return { width: Number(size[1]), height: Number(size[2]) };
}

describe('a chart given a canvas is drawn within it', () => {
    it('with its keys, under the default, keys-on-top and house themes', async () => {
        const over: string[] = [];
        for (const [themeName, theme] of Object.entries(THEMES)) {
            for (const chart of Object.keys(CHARTS)) {
                for (const box of BOXES) {
                    const drawn = await drawnSize(vegaLiteStages(input(chart, theme, box)).spec);
                    if (drawn.width > box.width + 0.5 || drawn.height > box.height + 0.5) {
                        over.push(`${chart} ${themeName} ${box.width}×${box.height}: drawn ${drawn.width}×${drawn.height}`);
                    }
                }
            }
        }
        expect(over).toEqual([]);
    }, 120_000);

    it('says how, where it lays the chart out for less room', () => {
        const { plan } = vegaLiteStages(input('stacked', undefined, { width: 600, height: 300 }));
        const contain = plan.canvasFit?.treatment?.contain;
        expect(contain).toBeDefined();
        expect(contain!.width).toBeLessThanOrEqual(600);
        expect(contain!.height).toBeLessThanOrEqual(300);
        expect(plan.report.some((note) => note.code === 'canvas-contain' && /600 × 300 canvas/.test(note.message))).toBe(true);
    });

    it('leaves a chart with no canvas, or with the canvas fit off, as it was', () => {
        const box = { width: 600, height: 300 };
        const loose = vegaLiteStages(input('stacked', undefined, box, {}, false)).plan;
        expect(loose.canvasFit?.treatment?.contain).toBeUndefined();
        expect(loose.report.some((note) => note.code === 'canvas-contain')).toBe(false);
        const off = vegaLiteStages(input('stacked', undefined, box, { canvasFit: 'off' })).plan;
        expect(off.canvasFit?.treatment?.contain).toBeUndefined();
        expect(off.report.some((note) => note.code === 'canvas-contain')).toBe(false);
    });

    it('a session replanned at its size draws what it drew', () => {
        const box = { width: 600, height: 300 };
        const session = openVegaLiteSession(input('stacked', undefined, box));
        expect(session.plan.canvasFit?.treatment?.contain).toBeDefined();
        expect(JSON.stringify(session.replan({ size: box }).spec)).toBe(JSON.stringify(session.spec));
    });
});
