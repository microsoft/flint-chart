// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * @module flint-chart/vegalite/canvas-furniture
 *
 * Canvas-anchored furniture: branding marks that belong to the *graphic frame*,
 * not the plot. The Economist red masthead tab is the archetype — it sits at
 * the graphic's top-left, flush with the title, and has nothing to do with the
 * data rectangle.
 *
 * Vega-Lite has no way to express this. Every mark it draws lives in the plot's
 * coordinate space, and a concat child pins to the plot's *data* rectangle — so
 * on a horizontal bar (a wide left-axis gutter) the tab drifts right, away from
 * the title, instead of holding graphic-left. There is no `align`/`bounds`
 * combination that lifts a child into the axis gutter; the wall is structural.
 *
 * The remedy is to draw the tab *after* Vega-Lite is done, straight onto the
 * rendered SVG at absolute canvas coordinates. The grounding stage records
 * where each piece goes (in `usermeta`, which Vega-Lite passes through to the
 * compiled Vega spec untouched) and reserves a top band so nothing overlaps the
 * title. The renderer then injects a plain `<rect>` at those coordinates. The
 * result is a real element inside the exported `<svg>` — it travels with the
 * file and rasterises identically in any standalone SVG renderer.
 */

/** A branding rectangle anchored to the graphic frame, in canvas pixels. */
export interface CanvasFurnitureItem {
    kind: string;
    /** Distance from the canvas left edge — the same margin the title anchors to. */
    x: number;
    /** Distance from the canvas top edge, inside the reserved top band. */
    y: number;
    width: number;
    height: number;
    color: string;
}

/** The `usermeta` key the grounding stage stamps canvas furniture under. */
export const CANVAS_FURNITURE_KEY = 'flintCanvasFurniture';

/**
 * Read canvas furniture off a spec's `usermeta`. Works on either a Vega-Lite
 * spec (before compile) or the compiled Vega spec (`usermeta` survives compile).
 */
export function readCanvasFurniture(spec: any): CanvasFurnitureItem[] {
    const items = spec?.usermeta?.[CANVAS_FURNITURE_KEY];
    return Array.isArray(items) ? items : [];
}

function escapeAttr(value: string): string {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Build the `<rect>` markup for a set of canvas-furniture items. */
export function canvasFurnitureMarkup(items: CanvasFurnitureItem[]): string {
    return items
        .map(
            (it) =>
                `<rect x="${it.x}" y="${it.y}" width="${it.width}" height="${it.height}" fill="${escapeAttr(it.color)}"/>`,
        )
        .join('');
}

/**
 * Inject canvas furniture into a rendered SVG string, drawn last so it paints
 * over the background rect. A no-op when there is nothing to draw.
 */
export function injectCanvasFurnitureSVG(svg: string, items: CanvasFurnitureItem[]): string {
    if (!items?.length) return svg;
    const idx = svg.lastIndexOf('</svg>');
    if (idx === -1) return svg;
    return svg.slice(0, idx) + canvasFurnitureMarkup(items) + svg.slice(idx);
}
