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

import type { HeaderPlan } from '../core/header-plan';

/**
 * A piece of furniture drawn on the canvas, placed against the canvas's own edges so it holds
 * whatever width the chart renders at: `left` and/or `right` (px from those edges; both stretch it
 * between them), `top` from the canvas top. `x` is the earlier name for `left`.
 */
export interface CanvasFurnitureItem {
    kind: string;
    left?: number;
    right?: number;
    x?: number;
    /** Distance from the canvas top edge. */
    y?: number;
    /** Distance of its bottom from the canvas bottom edge, for furniture at the foot (a source line). */
    bottom?: number;
    /** A dashed rule: dash and gap lengths, px. */
    dash?: number[];
    /** Unset with both `left` and `right`: it runs between them. */
    width?: number;
    height: number;
    color?: string;
    /** A text item: the words and how they are set. Drawn with its top at `y`. */
    text?: string;
    font?: string;
    fontSize?: number;
    fontWeight?: string | number;
    fontStyle?: string;
    /** An image item: a URL or data URI (inline SVG is turned into one). */
    src?: string;
    alt?: string;
    /** Where the item links to. */
    href?: string;
    /** Shown on hover. */
    title?: string;
    /** Centred between `left` and `right` rather than run between them. */
    center?: boolean;
}

/**
 * The header a plan laid out (see core/header-plan.ts) as canvas items, on a canvas whose margin is
 * `margin`: the edge band hangs from the canvas top, the line above the headline and the pieces beside
 * it start below the margin, and a `content` piece is measured from inside the margin.
 */
export function headerFurnitureItems(header: HeaderPlan, margin: { left: number; right: number; top: number }): CanvasFurnitureItem[] {
    const room = header.edge + header.line;
    const zoneTop = { canvasTop: 0, aboveTitle: header.edge + margin.top, besideTitle: room + margin.top };
    return header.pieces.map((p) => {
        const start = p.frame === 'canvas' ? 0 : margin.left;
        const end = p.frame === 'canvas' ? 0 : margin.right;
        const across = p.align === 'span' ? { left: start, right: end }
            : p.align === 'middle' ? { left: start, right: end, center: true }
                : p.align === 'start' ? { left: start + p.offset } : { right: end + p.offset };
        return {
            kind: p.kind, ...across, y: zoneTop[p.zone] + p.dy, height: p.height,
            ...(p.align !== 'span' && p.width != null && p.kind !== 'text' ? { width: p.width } : {}),
            ...(p.align === 'middle' && p.kind !== 'text' && p.width != null ? { width: p.width } : {}),
            ...(p.color ? { color: p.color } : {}),
            ...(p.text !== undefined ? { text: p.text, fontSize: p.fontSize, ...(p.font ? { font: p.font } : {}), ...(p.fontWeight != null ? { fontWeight: p.fontWeight } : {}), ...(p.fontStyle ? { fontStyle: p.fontStyle } : {}) } : {}),
            ...(p.src ? { src: p.src, ...(p.alt ? { alt: p.alt } : {}) } : {}),
            ...(p.href ? { href: p.href } : {}),
        };
    });
}

/**
 * A fill pattern a chart's marks reference as `url(#id)`: lines (or dots) of `line` over
 * `background`, `spacing` px apart. Vega-Lite cannot define one, so the chart carries it and the
 * renderer writes it into the SVG's defs. Its id is drawn from its content, so two charts on a page
 * that share a pattern share an id harmlessly.
 */
export interface CanvasPattern {
    id: string;
    kind: 'diagonal' | 'antidiagonal' | 'horizontal' | 'vertical' | 'cross' | 'dots';
    background: string;
    line: string;
    spacing: number;
}

/** The `usermeta` key a chart's fill patterns travel under. */
export const CANVAS_PATTERNS_KEY = 'flintPatterns';

export function readCanvasPatterns(spec: any): CanvasPattern[] {
    const items = spec?.usermeta?.[CANVAS_PATTERNS_KEY];
    return Array.isArray(items) ? items : [];
}

const PATTERN_ANGLE: Record<CanvasPattern['kind'], number> = { diagonal: 45, antidiagonal: -45, horizontal: 90, vertical: 0, cross: 45, dots: 0 };

/** The `<defs>` that define a chart's fill patterns. */
export function canvasPatternDefs(patterns: CanvasPattern[]): string {
    if (!patterns.length) return '';
    const body = patterns.map((p) => {
        const s = p.spacing;
        const line = `stroke="${escapeAttr(p.line)}" stroke-width="${Math.max(1, Math.round(s / 4))}"`;
        const marks = p.kind === 'dots'
            ? `<circle cx="${s / 2}" cy="${s / 2}" r="${Math.max(0.8, s * 0.18)}" fill="${escapeAttr(p.line)}"/>`
            : `<line x1="0" y1="0" x2="0" y2="${s}" ${line}/>${p.kind === 'cross' ? `<line x1="0" y1="0" x2="${s}" y2="0" ${line}/>` : ''}`;
        return `<pattern id="${escapeAttr(p.id)}" patternUnits="userSpaceOnUse" width="${s}" height="${s}"`
            + `${PATTERN_ANGLE[p.kind] ? ` patternTransform="rotate(${PATTERN_ANGLE[p.kind]})"` : ''}>`
            + `<rect width="${s}" height="${s}" fill="${escapeAttr(p.background)}"/>${marks}</pattern>`;
    }).join('');
    return `<defs>${body}</defs>`;
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

/** Inline SVG markup as an image source. */
export function svgDataUri(svg: string): string {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** An item's box on a canvas `width` px wide. */
export function placeCanvasFurniture(item: CanvasFurnitureItem, width: number, height = 0): { x: number; y: number; width: number; height: number } {
    const left = item.left ?? item.x;
    const room = Math.max(0, width - (left ?? 0) - (item.right ?? 0));
    const w = item.width ?? room;
    const x = item.center ? (left ?? 0) + (room - w) / 2 : left ?? width - (item.right ?? 0) - w;
    const y = item.bottom !== undefined ? height - item.bottom - item.height : item.y ?? 0;
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, width: Math.round(w * 100) / 100, height: item.height };
}

function itemMarkup(item: CanvasFurnitureItem, canvasWidth: number, canvasHeight: number): string {
    const box = placeCanvasFurniture(item, canvasWidth, canvasHeight);
    let body: string;
    if (item.text !== undefined) {
        const size = item.fontSize ?? 11;
        const end = item.left === undefined && item.x === undefined && item.right !== undefined;
        const x = item.center ? ((item.left ?? 0) + canvasWidth - (item.right ?? 0)) / 2 : end ? canvasWidth - (item.right ?? 0) : box.x;
        // The top of the line at `y`: the baseline sits about four fifths of the size below it.
        const attrs = [
            `x="${x}"`, `y="${Math.round((box.y + size * 0.82) * 100) / 100}"`,
            `font-size="${size}"`,
            item.font ? `font-family="${escapeAttr(item.font)}"` : '',
            item.fontWeight != null ? `font-weight="${escapeAttr(String(item.fontWeight))}"` : '',
            item.fontStyle ? `font-style="${escapeAttr(item.fontStyle)}"` : '',
            `fill="${escapeAttr(item.color ?? '#000000')}"`,
            item.center ? 'text-anchor="middle"' : end ? 'text-anchor="end"' : '',
        ].filter(Boolean).join(' ');
        body = `<text ${attrs}>${escapeAttr(item.text)}</text>`;
    } else if (item.src) {
        body = `<image x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" href="${escapeAttr(item.src)}" preserveAspectRatio="xMidYMid meet">`
            + `${item.alt ? `<title>${escapeAttr(item.alt)}</title>` : ''}</image>`;
    } else if (item.dash?.length) {
        const mid = Math.round((box.y + box.height / 2) * 100) / 100;
        body = `<line x1="${box.x}" y1="${mid}" x2="${box.x + box.width}" y2="${mid}" stroke="${escapeAttr(item.color ?? '#000000')}" stroke-width="${box.height}" stroke-dasharray="${item.dash.join(' ')}"/>`;
    } else {
        body = `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="${escapeAttr(item.color ?? '#000000')}"/>`;
    }
    const title = item.title ? `<title>${escapeAttr(item.title)}</title>` : '';
    if (item.href) return `<a href="${escapeAttr(item.href)}" target="_blank" rel="noopener" style="pointer-events:auto;cursor:pointer">${title}${body}</a>`;
    return title ? `<g style="pointer-events:auto">${title}${body}</g>` : body;
}

/** The markup for a set of canvas-furniture items on a canvas `width` px wide. */
export function canvasFurnitureMarkup(items: CanvasFurnitureItem[], width = 0, patterns: CanvasPattern[] = [], height = 0): string {
    return canvasPatternDefs(patterns) + items.map((item) => itemMarkup(item, width, height)).join('');
}

/** Draw canvas furniture into a rendered `<svg>` element, sized to it. */
export function appendCanvasFurniture(svg: SVGSVGElement, items: CanvasFurnitureItem[], patterns: CanvasPattern[] = []): void {
    if (!items.length && !patterns.length) return;
    const width = Number(svg.getAttribute('width')) || svg.getBoundingClientRect().width;
    const height = Number(svg.getAttribute('height')) || svg.getBoundingClientRect().height;
    const group = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'flint-canvas-furniture');
    group.innerHTML = canvasFurnitureMarkup(items, width, patterns, height);
    svg.appendChild(group);
}

/**
 * Inject canvas furniture and fill patterns into a rendered SVG string: the patterns' defs first, so
 * the marks that use them resolve, the furniture last, so it paints over the background.
 */
export function injectCanvasFurnitureSVG(svg: string, items: CanvasFurnitureItem[], patterns: CanvasPattern[] = []): string {
    if (!items?.length && !patterns?.length) return svg;
    let out = svg;
    const open = rootSvgTag(out);
    if (patterns.length && open) out = out.slice(0, open.end) + canvasPatternDefs(patterns) + out.slice(open.end);
    const idx = out.lastIndexOf('</svg>');
    if (idx === -1 || !items?.length) return out;
    const width = Number(open && /\swidth="([\d.]+)"/.exec(open.tag)?.[1] || 0);
    const height = Number(open && /\sheight="([\d.]+)"/.exec(open.tag)?.[1] || 0);
    return out.slice(0, idx) + canvasFurnitureMarkup(items, width, [], height) + out.slice(idx);
}

/** The root `<svg …>` tag, found by index rather than a pattern that rescans the markup from every `<svg`. */
function rootSvgTag(svg: string): { tag: string; end: number } | undefined {
    const start = svg.indexOf('<svg');
    const close = start === -1 ? -1 : svg.indexOf('>', start);
    return close === -1 ? undefined : { tag: svg.slice(start, close + 1), end: close + 1 };
}
