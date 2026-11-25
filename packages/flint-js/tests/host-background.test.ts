// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { renderSvg } from '../src/render';

/**
 * A chart with no theme draws on the host's background: Vega-Lite states white in every spec it
 * compiles, which outranked the background a host handed the renderer. A house keeps its canvas.
 */

const input = (extra: Record<string, unknown> = {}): any => ({
    data: { values: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }] },
    semantic_types: { x: 'Category', y: 'Quantity' },
    chart_spec: { chartType: 'Bar Chart', encodings: { x: 'x', y: 'y' } },
    ...extra,
});

/** The fill of the rectangle Vega paints the canvas with, or undefined where it paints none. */
const canvasFill = (svg: string) => /^<svg[^>]*>\s*<rect[^>]*fill="([^"]+)"/.exec(svg)?.[1];

describe('the background a chart draws on', () => {
    it('is the host’s where no theme sets one', async () => {
        expect((assembleVegaLite(input({ options: { background: '#1e1e1e' } })) as any).background).toBe('#1e1e1e');
        expect((assembleVegaLite(input()) as any).background).toBeUndefined();
        expect(canvasFill(await renderSvg(input(), { background: '#1e1e1e' }))).toBe('#1e1e1e');
        // The input's own option outranks the renderer's.
        expect(canvasFill(await renderSvg(input({ options: { background: '#abcdef' } }), { background: '#1e1e1e' }))).toBe('#abcdef');
    });

    it('stays a house’s own canvas, and follows the host where the house defers to it', async () => {
        const themed = assembleVegaLite(input({ theme_spec: 'bbc' })) as any;
        const withHost = assembleVegaLite(input({ theme_spec: 'bbc', options: { background: '#1e1e1e' } })) as any;
        expect(withHost.background).toBe(themed.background);
        expect(canvasFill(await renderSvg(input({ theme_spec: 'bbc' }), { background: '#1e1e1e' }))).toBe(themed.background);
        // nyt's surface is the host's (`ink.surface.source: 'host'`).
        expect(canvasFill(await renderSvg(input({ theme_spec: 'nyt' }), { background: '#1e1e1e' }))).toBe('#1e1e1e');
    });
});
