// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { vegaLiteStages } from '../src/vegalite/assemble';

/**
 * A house whose type is large wraps long names down the y axis onto two lines, and two-line rows
 * stand taller than the canvas holds. The canvas fit sets the labels a size or two down, never past
 * the house's floor, so the chart enters its box with every name whole, rather than cut.
 */

const TITLES = [
    ['Back in Action', 164.7, 'Movies'], ['Adolescence: Limited Series', 144.8, 'Shows'],
    ['Squid Game: Season 2 // 오징어 게임: 시즌 2', 117.3, 'Shows'], ['STRAW', 102.9, 'Movies'],
    ['The Life List', 95.5, 'Movies'], ['Exterritorial', 87.5, 'Movies'], ['Havoc', 86.9, 'Movies'],
    ['Squid Game: Season 3 // 오징어 게임: 시즌 3', 71.5, 'Shows'], ['Zero Day: Limited Series', 61.3, 'Shows'],
    ['Missing You: Limited Series', 58, 'Shows'],
].map(([title, views, format]) => ({ title, views: (views as number) * 1e6, format }));

const bars = (theme: unknown, rows: any[] = TITLES) => ({
    data: { values: rows },
    semantic_types: { title: 'Name', views: 'Count', format: 'Category' },
    chart_spec: {
        chartType: 'Bar Chart',
        encodings: { x: { field: 'views', type: 'quantitative' }, y: { field: 'title', type: 'nominal', sortOrder: 'descending', sortBy: 'x' }, color: { field: 'format' } },
        title: 'Most-viewed movies and show seasons, January–June 2025',
        subtitle: 'Top five per format; views are runtime-normalized viewing equivalents',
        baseSize: { width: 400, height: 300 },
        canvasSize: { width: 800, height: 600 },
    },
    options: { maxStretch: 2 },
    theme_spec: theme,
}) as any;

describe('axis labels a size down for wrapped row names', () => {
    it('bring a chart whose two-line rows overrun its box inside it, every name whole, at no less than the floor', () => {
        const { plan } = vegaLiteStages(bars('bbc'));
        const fit = plan.canvasFit!;
        expect(fit.before.drawing.height).toBeGreaterThan(600);
        expect(fit.treatment?.labelScale).toBeDefined();
        expect(fit.after!.drawing.height).toBeLessThanOrEqual(600);
        expect(fit.after!.drawing.width).toBeLessThanOrEqual(800);

        // Both axes share the smaller size, above the house's floor of three-quarters its own.
        const { x, y } = plan.axisLabels;
        expect(y.fontSize).toBeLessThan(14.5);
        expect(y.fontSize).toBeGreaterThanOrEqual(14.5 * 0.75);
        expect(x.fontSize).toBe(y.fontSize);
        expect(plan.design.axes.y?.label.fontSize).toBe(y.fontSize);

        // The names still wrap, whole: none is cut short.
        expect(plan.layout.yLabel.labelLines?.some((lines) => lines.length > 1)).toBe(true);
        expect(plan.layout.yLabel.labelCut).toBeFalsy();
        expect(plan.report.some((note) => note.code === 'canvas-fit' && /axis labels at \d+%/.test(note.message))).toBe(true);
    });

    it('take the gentlest size that brings the chart inside, not the smallest it tried', () => {
        const { plan } = vegaLiteStages(bars('bbc'));
        const scales = plan.canvasFit!.tried.map((attempt) => attempt.treatment.labelScale).filter((scale): scale is number => scale !== undefined);
        const chosen = plan.canvasFit!.treatment!.labelScale!;
        expect(scales.length).toBeGreaterThan(1);
        expect(chosen).toBeLessThan(Math.max(...scales));
        expect(chosen).toBeGreaterThan(Math.min(...scales));
    });

    it('leave labels at the house size where the chart fits, or its names do not wrap', () => {
        for (const theme of ['datawrapper', 'nyt', 'economist', undefined]) {
            expect(vegaLiteStages(bars(theme)).plan.canvasFit?.treatment?.labelScale, String(theme)).toBeUndefined();
        }
        const short = TITLES.map((row, index) => ({ ...row, title: `Title ${index + 1}` }));
        const { plan } = vegaLiteStages(bars('bbc', short));
        expect(plan.canvasFit?.treatment?.labelScale).toBeUndefined();
        expect(plan.axisLabels.y.fontSize).toBe(plan.axisLabelFontSize);
    });
});
