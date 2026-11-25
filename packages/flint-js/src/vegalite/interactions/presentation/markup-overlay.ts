// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
    ENCLOSURE_STROKE,
    balanceNote,
    clusterColor,
    neutralInk,
    defaultEnclosureShape,
    regionColor,
    enclosureOutline,
    noteSize,
    noteStyle,
    noteWrapWidths,
    over,
    overlapArea,
    placeEnclosureCaption,
    placeRegionCaption,
    readableShade,
    regionSpan,
    segmentCrossesBox,
    type Box,
    type CaptionLayout,
    type CaptionPlacement,
    type EnclosedMark,
    type EnclosureOutline,
    type NoteObstacle,
    type NoteSegment,
    type Point,
} from '../../../core/annotation';
import type { EnclosureAnnotationSpec, RegionAnnotationSpec, SemanticTargetRef } from '../../../core/interaction-contracts';
import { semanticElementRenderKeys } from '../../../core/interaction-semantics';
import { rendererTextMeasurer } from '../../../core/text-width';
import type { AnnotationDesign } from '../../../core/theme/types';
import type { PlotPoint } from '../../../interactive/interactions';
import { PATH_KEY_SUFFIX, clientToLayoutPoint, facetPlotFrames, plotToClientPoint, sceneItems, type RendererCoordinateSpace } from '../hit-adapter';
import { INTERACTION_KEY } from '../stores';
import { canvasFurnitureBoxes, chartTextStyle, sceneInk, tiledRects, type PlacedCaption } from './annotation-overlay';
import { lonLatBox, type OverlayProjection } from './data-overlay';
import { geoPath } from 'd3-geo';

/**
 * Regions and enclosures on a mounted Vega-Lite chart (`annotate-region`, `annotate-enclosure`), after
 * Blabber's `region` and `enclose`. A wash under the marks is drawn above the chart but cut away
 * wherever a filled mark or a line stands, so they read over it; a wash over them is drawn plainly.
 * Outlines, captions and leaders are drawn in a layer above. Everything is placed in the plot's own coordinates from the chart's scales and scene,
 * and placed again whenever the chart is resized or navigated.
 */

/** An enclosure whose targets the runtime has resolved to the chart's marks. */
export type ResolvedEnclosure = Omit<EnclosureAnnotationSpec, 'targets'> & { targets: readonly SemanticTargetRef[] };

export interface MarkupOverlayOptions {
    view: any;
    container: HTMLElement;
    coordinateSpace(): RendererCoordinateSpace;
    containerLayoutSize(): { width: number; height: number };
    /** The chart's x and y scales, by name. */
    scales: Partial<Record<'x' | 'y', string>>;
    /** A value as the axis's scale reads it (a date on a time axis). */
    axisValue(axis: 'x' | 'y', value: unknown): unknown;
    /** Where the captions drawn here are recorded, for the notes placed after them to keep clear of. */
    placedCaptions?: { fixed?: PlacedCaption[] };
    /** The house's accent, for a region's wash, and its note text. */
    design?: Readonly<AnnotationDesign>;
    /** On a map, its projection as drawn now: a region given in longitude and latitude is drawn through it. */
    geoProjection?: () => OverlayProjection | undefined;
}

export interface MarkupOverlayController {
    render(regions: ReadonlyMap<string, RegionAnnotationSpec>, enclosures: ReadonlyMap<string, ResolvedEnclosure>): void;
    /** Why each region named could not be shaded, by name. */
    problems(): ReadonlyMap<string, string>;
    /** Why a region cannot be shaded on the chart as drawn now, or undefined where it can. */
    check(region: RegionAnnotationSpec): string | undefined;
    sync(): void;
    destroy(): void;
}

const SVG = 'http://www.w3.org/2000/svg';
let maskSequence = 0;

function segmentTouches(line: NoteSegment, box: Box): boolean {
    return segmentCrossesBox(line.a, line.b, box);
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
    const element = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
    return element;
}

function layer(zIndex: string): { root: HTMLDivElement; svg: SVGSVGElement } {
    const root = document.createElement('div');
    root.dataset.flintMarkup = '';
    Object.assign(root.style, { position: 'absolute', inset: '0', zIndex, pointerEvents: 'none', overflow: 'hidden' });
    const drawing = svg('svg');
    Object.assign(drawing.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', overflow: 'visible' });
    root.append(drawing);
    return { root, svg: drawing };
}

function keyOf(datum: unknown): string | undefined {
    const key = datum && typeof datum === 'object' ? (datum as Record<string, unknown>)[INTERACTION_KEY] : undefined;
    return typeof key === 'string' ? key : undefined;
}

function boxOf(bounds: { x1: number; x2: number; y1: number; y2: number }): Box {
    return { x: Math.min(bounds.x1, bounds.x2), y: Math.min(bounds.y1, bounds.y2), width: Math.abs(bounds.x2 - bounds.x1), height: Math.abs(bounds.y2 - bounds.y1) };
}

/** The part of one box inside another; empty where they do not meet. */
function intersectBox(a: Box, b: Box): Box {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x), height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) };
}

/**
 * Where a region is shaded in each plot panel, in plot px: its spans (read in a panel's own px, as
 * the shared scales give them) laid from that panel's corner and cut at it. A span the region does
 * not name runs the panel's full length.
 */
export function regionPanelBoxes(spans: Partial<Record<'x' | 'y', [number, number]>>, panels: readonly Box[]): { shaded: Box; panel: Box }[] {
    return panels.flatMap((panel) => {
        const shaded = intersectBox({
            x: spans.x ? panel.x + spans.x[0] : panel.x, width: spans.x ? spans.x[1] - spans.x[0] : panel.width,
            y: spans.y ? panel.y + spans.y[0] : panel.y, height: spans.y ? spans.y[1] - spans.y[0] : panel.height,
        }, panel);
        return shaded.width > 0 && shaded.height > 0 ? [{ shaded, panel }] : [];
    });
}

function paint(value: unknown): string | undefined {
    return typeof value === 'string' && value !== 'transparent' && value !== 'none' ? value : undefined;
}

export function createMarkupOverlay(options: MarkupOverlayOptions): MarkupOverlayController {
    const { view, container, coordinateSpace, containerLayoutSize, scales, axisValue, placedCaptions, geoProjection } = options;
    const wash = layer('3');
    const ink = layer('4');
    wash.root.dataset.flintMarkup = 'wash';
    ink.root.dataset.flintMarkup = 'ink';
    let regions: ReadonlyMap<string, RegionAnnotationSpec> = new Map();
    let enclosures: ReadonlyMap<string, ResolvedEnclosure> = new Map();
    let problems = new Map<string, string>();

    /** A region's stretch on each axis it names, in plot px, or why it cannot be shaded. */
    const spansOf = (region: RegionAnnotationSpec): { spans?: Partial<Record<'x' | 'y', [number, number]>>; problem?: string } => {
        const spans: Partial<Record<'x' | 'y', [number, number]>> = {};
        for (const axis of ['x', 'y'] as const) {
            const bounds = region[axis];
            if (!bounds) continue;
            const axisScale = scales[axis] ? view.scale(scales[axis]) : undefined;
            if (typeof axisScale !== 'function') return { problem: `the chart has no ${axis} scale to shade.` };
            const range = (axisScale.range() as number[]).map(Number) as unknown as [number, number];
            const banded = typeof axisScale.bandwidth === 'function';
            const domain = axisScale.domain() as unknown[];
            const reading = (value: unknown) => banded ? value : axisValue(axis, value);
            const position = (value: unknown): number | undefined => {
                if (value === undefined) return undefined;
                const pixel = Number(axisScale(reading(value)));
                return Number.isFinite(pixel) ? pixel + (banded ? Number(axisScale.bandwidth()) / 2 : 0) : undefined;
            };
            const result = regionSpan(bounds, banded
                ? {
                    position, range,
                    index: (value) => domain.findIndex((entry) => String(entry) === String(value)),
                    step: typeof axisScale.step === 'function' ? Number(axisScale.step()) : Number(axisScale.bandwidth()),
                }
                : { position, range, ends: [domain[0], domain[domain.length - 1]] as [unknown, unknown] });
            if (!result.span) return { problem: `${axis}: ${result.problem}` };
            spans[axis] = result.span;
        }
        return spans.x || spans.y ? { spans } : { problem: 'the region names no x or y stretch.' };
    };

    /**
     * A map region, its box of longitude and latitude as the projection draws it now — edges along
     * meridians and parallels — as a path and its bounds in plot px; or why it cannot be shaded.
     */
    const geoRegionOf = (region: RegionAnnotationSpec): { d: string; bounds: Box } | { problem: string } | undefined => {
        if (region.longitude === undefined && region.latitude === undefined) return undefined;
        const projection = geoProjection?.();
        if (typeof projection !== 'function') return { problem: 'the chart is no map: a region in longitude and latitude needs one.' };
        const [west, east] = region.longitude ?? [];
        const [south, north] = region.latitude ?? [];
        if (![west, east, south, north].every((value) => typeof value === 'number' && Number.isFinite(value))) {
            return { problem: 'a map region needs longitude: [west, east] and latitude: [south, north], in degrees.' };
        }
        const shape = geoPath(projection as any);
        const polygon = { type: 'Polygon', coordinates: [lonLatBox(west!, south!, east!, north!)] } as any;
        const d = shape(polygon);
        const [[x1, y1], [x2, y2]] = shape.bounds(polygon);
        if (!d || ![x1, y1, x2, y2].every(Number.isFinite)) return { problem: 'the region is not on the map as drawn.' };
        return { d, bounds: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 } };
    };

    const detach = (): void => {
        wash.root.remove();
        ink.root.remove();
        if (placedCaptions) placedCaptions.fixed = [];
    };

    const draw = (): void => {
        wash.svg.replaceChildren();
        ink.svg.replaceChildren();
        problems = new Map();
        if (regions.size === 0 && enclosures.size === 0) {
            detach();
            return;
        }
        const space = coordinateSpace();
        const containerRect = container.getBoundingClientRect();
        const layoutSize = containerLayoutSize();
        if (!(containerRect.width > 0) || !(containerRect.height > 0)) return;
        const toLayout = (point: PlotPoint): Point => clientToLayoutPoint(plotToClientPoint(point, space), containerRect, layoutSize);
        const origin = toLayout({ x: 0, y: 0 });
        const unit = toLayout({ x: 1, y: 0 });
        const scale = Math.hypot(unit.x - origin.x, unit.y - origin.y) || 1;
        const toBox = (box: Box): Box => {
            const a = toLayout({ x: box.x, y: box.y });
            const b = toLayout({ x: box.x + box.width, y: box.y + box.height });
            return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
        };
        for (const target of [wash.svg, ink.svg]) target.setAttribute('viewBox', `0 0 ${layoutSize.width} ${layoutSize.height}`);

        // The chart as drawn: its plot, its ink, its text face and its page.
        const scene = sceneInk(view);
        const items = sceneItems(view);
        const design = options.design;
        const style = noteStyle(chartTextStyle(view, scene.boxes), { ...(design?.text ? { text: design.text } : {}), ...(design?.ink ? { ink: design.ink } : {}) });
        const fontSize = style.fontSize * scale;
        const measure = rendererTextMeasurer(fontSize, style.font, style.fontWeight, 'normal');
        // The page the plot is read on: the house's plot surface where it has one, else the canvas.
        const background = (design?.background ? paint(design.background) : undefined)
            ?? paint(typeof view.background === 'function' ? view.background() : undefined) ?? '#ffffff';
        const plot = toBox({ x: 0, y: 0, width: space.plotWidth, height: space.plotHeight });
        // A map keeps its captions inside the plot it is panned and zoomed in, as its notes do.
        const canvas = geoProjection ? plot : { x: 0, y: 0, width: layoutSize.width, height: layoutSize.height };
        const plotArea = Math.max(1, space.plotWidth * space.plotHeight);
        const tiled = tiledRects(scene.boxes, plotArea);
        // A legend's swatches and an axis's ticks are furniture a caption keeps off, as it does their words.
        const furniture = (item: any) => /^(legend|axis)/.test(String(item.mark?.role ?? ''));
        // A map's land is structure, not data (its shapes carry no key): a caption stands over it freely.
        const sceneObstacles = scene.boxes
            .filter(({ item }) => !(item.mark?.marktype === 'shape' && item.datum?.[INTERACTION_KEY] == null))
            .map(({ item, bounds }) => ({
                item,
                obstacle: {
                    box: toBox(boxOf(bounds)),
                    kind: item.mark?.marktype === 'text' || furniture(item) ? 'text'
                        : (typeof item.opacity === 'number' ? item.opacity : 1) < 0.5 || tiled(item.mark) ? 'faint' : 'mark',
                } as NoteObstacle,
            }));
        const obstacles: NoteObstacle[] = sceneObstacles.map(({ obstacle }) => obstacle);
        const segments: NoteSegment[] = scene.segments.map((segment) => ({ a: toLayout(segment.a), b: toLayout(segment.b) }));
        // An area's edge is data a region's or an enclosure's caption must not cut, as a line's is.
        for (const item of items) {
            if (item.mark?.marktype !== 'area') continue;
            // A slice of an area: its top edge, then its bottom edge back.
            const points = (item.interactionGeometry?.points as PlotPoint[] | undefined)?.map(toLayout) ?? [];
            if (points.length >= 2) segments.push({ a: points[0], b: points[1] });
            if (points.length >= 4) segments.push({ a: points[2], b: points[3] });
            // A slice is narrow, so its box is close to the fill a caption would cover.
            if (points.length >= 4) {
                const xs = points.map((point) => point.x);
                const ys = points.map((point) => point.y);
                obstacles.push({
                    kind: 'mark',
                    box: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) },
                });
            }
        }
        // The source line, a map's credit, a house's header: drawn beside the chart, read as its text.
        for (const box of canvasFurnitureBoxes(container, containerRect, layoutSize)) obstacles.push({ box, kind: 'text' });
        const captions: PlacedCaption[] = [];
        const outlineLines: NoteSegment[] = [];
        const layoutsFor = (text: string, widths: readonly number[]): CaptionLayout[] => {
            const seen = new Set<string>();
            const layouts: CaptionLayout[] = [];
            for (const width of widths) {
                const lines = balanceNote(text, width * scale, measure);
                const key = lines.join('\n');
                if (seen.has(key)) continue;
                seen.add(key);
                const size = noteSize(lines, { ...style, fontSize, lineHeight: style.lineHeight * scale, padding: style.padding * scale }, measure);
                layouts.push({ lines, ...size });
            }
            return layouts;
        };
        /** A caption and its leaders; `halo`, the page's colour, is left out where the caption stands on a wash. */
        const drawCaption = (placed: CaptionPlacement, layouts: readonly CaptionLayout[], colour: string, halo: string | undefined, leaderColour: string): void => {
            const { box, align, leaders } = placed;
            const group = svg('g', { 'data-flint-markup-caption': '' });
            for (const leader of leaders) {
                const d = `M ${leader.from.x} ${leader.from.y} L ${leader.to.x} ${leader.to.y}`;
                group.append(
                    svg('path', { d, fill: 'none', stroke: halo ?? background, 'stroke-width': 3 * scale, 'stroke-linecap': 'round' }),
                    svg('path', { d, fill: 'none', stroke: leaderColour, 'stroke-width': scale, 'stroke-linecap': 'round' }),
                );
            }
            const padding = style.padding * scale;
            const x = align === 'left' ? box.x + padding : align === 'right' ? box.x + box.width - padding : box.x + box.width / 2;
            const text = svg('text', {
                'font-family': style.font, 'font-size': fontSize, 'font-weight': String(style.fontWeight),
                'text-anchor': align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle',
                fill: colour, ...(halo ? { stroke: halo, 'stroke-width': style.halo.width * scale, 'stroke-linejoin': 'round', 'paint-order': 'stroke' } : {}),
            });
            const lineHeight = style.lineHeight * scale;
            layouts[placed.layout].lines.forEach((line, index) => {
                const tspan = svg('tspan', { x, y: box.y + padding + fontSize * 0.82 + index * lineHeight });
                tspan.textContent = line;
                text.append(tspan);
            });
            group.append(text);
            ink.svg.append(group);
            captions.push({ box, ...(leaders[0] ? { leader: { a: leaders[0].from, b: leaders[0].to } } : {}) });
            obstacles.push({ box, kind: 'text' });
            for (const leader of leaders) segments.push({ a: leader.from, b: leader.to });
        };

        // Regions first: an enclosure's caption keeps clear of a region's.
        const regionColours: string[] = [];
        const backdrop = [...new Set(items.filter((item) => item.mark?.marktype === 'rect' || item.mark?.marktype === 'area')
            .map((item) => paint(item.fill)).filter((fill): fill is string => fill !== undefined))].slice(0, 32);
        // Every ink the data is drawn in, which the house's accent must stand apart from to wash a region.
        const markInks = [...new Set(items.flatMap((item) => ['symbol', 'line', 'rule', 'arc', 'trail'].includes(item.mark?.marktype)
            ? [paint(item.fill), paint(item.stroke)] : []).filter((ink): ink is string => ink !== undefined))].slice(0, 32);
        const overArea = items.some((item) => item.mark?.marktype === 'area');
        const overTiles = items.some((item) => item.mark?.marktype === 'rect' && tiled(item.mark));
        // The filled marks and the lines an under-wash is cut away beneath: drawn in black in its mask.
        const markShapes: { box: Box; line?: NoteSegment; cut(): SVGElement }[] = regions.size === 0 ? [] : [
            ...scene.boxes.flatMap(({ item, bounds }) => {
                const type = item.mark?.marktype;
                if (type !== 'rect' && type !== 'symbol' && type !== 'arc' && type !== 'shape' && type !== 'path') return [];
                if ((typeof item.opacity === 'number' ? item.opacity : 1) < 0.5 || !paint(item.fill)) return [];
                // Structure (a map's water, its land) is the ground a wash lies on, not a mark it is cut from.
                if (item.datum?.[INTERACTION_KEY] === null) return [];
                const box = toBox(boxOf(bounds));
                return [{
                    box,
                    cut: () => type === 'symbol'
                        ? svg('ellipse', { cx: box.x + box.width / 2, cy: box.y + box.height / 2, rx: box.width / 2, ry: box.height / 2, fill: '#000' })
                        : svg('rect', { x: box.x, y: box.y, width: box.width, height: box.height, fill: '#000' }),
                }];
            }),
            ...segments.map((line) => ({
                box: { x: Math.min(line.a.x, line.b.x), y: Math.min(line.a.y, line.b.y), width: Math.abs(line.b.x - line.a.x), height: Math.abs(line.b.y - line.a.y) },
                line,
                cut: () => svg('line', { x1: line.a.x, y1: line.a.y, x2: line.b.x, y2: line.b.y, stroke: '#000', 'stroke-width': 2.5 * scale, 'stroke-linecap': 'round' }),
            })),
        ];
        // The series a period's caption keeps clear of: the vertices of its lines and areas.
        const vertices = items.flatMap((item) => (item.interactionGeometry?.points as PlotPoint[] | undefined)?.map(toLayout) ?? []);
        const plotBox = { x: 0, y: 0, width: space.plotWidth, height: space.plotHeight };
        const facets = facetPlotFrames(view);
        const panels: Box[] = facets.length ? facets : [plotBox];
        for (const [name, region] of regions) {
            // On a map the region is its box as the projection draws it, cut at the plot.
            const geo = geoRegionOf(region);
            if (geo && 'problem' in geo) {
                problems.set(name, geo.problem);
                continue;
            }
            const { spans, problem } = geo ? { spans: { x: [0, 0], y: [0, 0] } as Partial<Record<'x' | 'y', [number, number]>>, problem: undefined } : spansOf(region);
            if (problem || !spans) {
                problems.set(name, problem ?? 'the region names no x or y stretch.');
                continue;
            }
            // Anywhere else it is shaded in every plot panel (one, or each facet's), cut at that panel.
            const placed = geo
                ? [{ shaded: intersectBox(geo.bounds, plotBox), panel: plotBox }].filter(({ shaded }) => shaded.width > 0 && shaded.height > 0)
                : regionPanelBoxes(spans, panels);
            if (placed.length === 0) continue;
            const colour = region.color ?? regionColor(regionColours, [...backdrop, ...markInks], background, design?.accent, design?.palette);
            if (!region.color) regionColours.push(colour);
            // Over an area, or cells that tile the plot, a wash under the marks would not be seen.
            const layerOver = region.layer ? region.layer === 'over' : overArea || overTiles;
            const opacity = region.opacity ?? (overArea || overTiles ? 0.18 : 0.16);
            for (const { shaded: inPlot } of placed) {
                const shaded = toBox(inPlot);
                // A map region's path is drawn in the plot's px, scaled into the layout inside a group, so
                // the mask set on the group is read in the layout as the rect's is.
                const rect = geo
                    ? svg('g', { 'data-flint-region': name })
                    : svg('rect', { x: shaded.x, y: shaded.y, width: shaded.width, height: shaded.height, fill: colour, 'fill-opacity': opacity, 'data-flint-region': name });
                if (geo) rect.append(svg('path', { d: geo.d, transform: `translate(${origin.x},${origin.y}) scale(${scale})`, fill: colour, 'fill-opacity': opacity }));
                if (layerOver && geo) {
                    // Over the marks, a map region is still cut at the plot.
                    const id = `flint-region-mask-${maskSequence += 1}`;
                    const mask = svg('mask', { id, maskUnits: 'userSpaceOnUse', x: shaded.x, y: shaded.y, width: shaded.width, height: shaded.height });
                    mask.append(svg('rect', { x: shaded.x, y: shaded.y, width: shaded.width, height: shaded.height, fill: '#fff' }));
                    rect.setAttribute('mask', `url(#${id})`);
                    ink.svg.prepend(mask, rect);
                } else if (layerOver) ink.svg.prepend(rect);
                else {
                    // Under the marks: the wash is cut away wherever a mark or a line is drawn, so they read over it.
                    const id = `flint-region-mask-${maskSequence += 1}`;
                    const mask = svg('mask', { id, maskUnits: 'userSpaceOnUse', x: shaded.x, y: shaded.y, width: shaded.width, height: shaded.height });
                    mask.append(svg('rect', { x: shaded.x, y: shaded.y, width: shaded.width, height: shaded.height, fill: '#fff' }));
                    for (const shape of markShapes) {
                        if (overlapArea(shape.box, shaded) <= 0 && !(shape.line && segmentTouches(shape.line, shaded))) continue;
                        mask.append(shape.cut());
                    }
                    rect.setAttribute('mask', `url(#${id})`);
                    wash.svg.append(mask, rect);
                }
            }
            if (!region.text) continue;
            // One caption, on the first panel's wash.
            const shaded = toBox(placed[0].shaded);
            const widths = [...noteWrapWidths(region.text, (text) => measure(text) / scale),
                Math.max(60, shaded.width / scale * 0.65), Math.max(fontSize * 3, shaded.width / scale - 12)];
            const layouts = layoutsFor(region.text, widths);
            const caption = placeRegionCaption({
                region: shaded, axes: { x: !!spans.x, y: !!spans.y }, layouts, plot: toBox(placed[0].panel), canvas, obstacles, segments, vertices,
                ...(region.placement ? { placement: region.placement } : {}),
            });
            if (!caption) continue;
            const within = overlapArea(caption.box, shaded) >= caption.box.width * caption.box.height * 0.5;
            const tint = within ? over(colour, background, opacity) : background;
            // A caption on the wash reads on it as it is: a halo would be a coloured smudge where it leaves the wash.
            const halo = overlapArea(caption.box, shaded) > 0 ? undefined : background;
            drawCaption(caption, layouts, readableShade(colour, tint, 4.5), halo, neutralInk(background));
        }

        // Enclosures: each target a group, one outline each, their caption shared.
        const index = new Map<string, any[]>();
        for (const item of items) {
            if (item.mark?.marktype === 'text') continue;
            const key = keyOf(item.datum);
            if (!key) continue;
            const list = index.get(key);
            if (list) list.push(item);
            else index.set(key, [item]);
        }
        for (const [name, enclosure] of enclosures) {
            const groups = enclosure.targets.map((target) => {
                const found = new Set<any>();
                for (const element of target.elements) {
                    for (const key of semanticElementRenderKeys(element)) {
                        const plain = key.endsWith(PATH_KEY_SUFFIX) ? key.slice(0, -PATH_KEY_SUFFIX.length) : key;
                        for (const item of index.get(plain) ?? []) found.add(item);
                    }
                }
                // The data marks, not the furniture drawn with them: a waterfall's connectors, a value label.
                const drawn = [...found];
                const data = drawn.filter((item) => !['rule', 'text'].includes(item.mark?.marktype));
                return data.length > 0 ? data : drawn;
            }).filter((group) => group.length > 0);
            if (groups.length === 0) {
                problems.set(name, 'the enclosure\'s targets match no drawn mark.');
                continue;
            }
            const marksOf = (group: readonly any[]): EnclosedMark[] => group.map((item) => {
                const type = item.mark?.marktype;
                const box = toBox(boxOf(item.bounds));
                // A line's stretch is enclosed along its vertices; an area band by its box, as Blabber's are.
                const points = type === 'line' || type === 'trail' ? item.interactionGeometry?.points as PlotPoint[] | undefined : undefined;
                if (points && points.length >= 2) return { role: 'other', box, points: points.map(toLayout) };
                if (type === 'symbol') return { role: 'point', box, radius: Math.max(box.width, box.height) / 2 };
                if (type === 'rect') return { role: tiled(item.mark) ? 'cell' : 'bar', box };
                if (type === 'arc' && [item.x, item.y, item.outerRadius, item.startAngle, item.endAngle].every((value) => typeof value === 'number')) {
                    const centre = toLayout({ x: item.x, y: item.y });
                    return {
                        role: 'other', box,
                        sector: {
                            cx: centre.x, cy: centre.y, inner: (item.innerRadius ?? 0) * scale, outer: item.outerRadius * scale,
                            start: item.startAngle, end: item.endAngle,
                        },
                    };
                }
                return { role: 'other', box };
            });
            const groupMarks = groups.map(marksOf);
            const all = groupMarks.flat();
            const shape = enclosure.shape ?? defaultEnclosureShape(all);
            const members = new Set(groups.flat());
            const siblings = items.filter((item) => item.mark?.marktype === 'rect' && !members.has(item)
                && groups.some((group) => group.some((member) => member.mark === item.mark))).map((item) => toBox(boxOf(item.bounds)));
            const outlines = groupMarks.map((marks) => enclosureOutline(marks, shape, plot, siblings))
                .filter((outline): outline is EnclosureOutline => outline !== undefined);
            if (outlines.length === 0) continue;
            const flat = groups.flat();
            // A cluster that shares a colour is outlined in it; any other group in the neutral annotation
            // ink. A halo of the page under the outline lets it read on dark bars and cells without a loud hue.
            const house = design?.highlight;
            const strokeWidth = enclosure.width ?? house?.width ?? ENCLOSURE_STROKE;
            const colour = enclosure.color ?? house?.color ?? (all.every((mark) => mark.role === 'point')
                ? clusterColor(flat.map((item) => ({ fill: paint(item.fill), stroke: paint(item.stroke) })), background)
                : neutralInk(background));
            const drawnLines: NoteSegment[] = [];
            for (const outline of outlines) {
                ink.svg.append(
                    svg('path', {
                        d: outline.d, fill: 'none', stroke: house?.haloColor ?? background, 'stroke-width': (strokeWidth + (house?.haloWidth ?? 2)) * scale,
                        'stroke-linejoin': 'round', 'stroke-opacity': 0.85, 'data-flint-enclosure-halo': name,
                    }),
                    svg('path', {
                        d: outline.d, fill: 'none', stroke: colour, 'stroke-width': strokeWidth * scale,
                        'stroke-linejoin': 'round', 'data-flint-enclosure': name,
                    }),
                );
                for (let at = 0; at < outline.ring.length; at++) drawnLines.push({ a: outline.ring[at], b: outline.ring[(at + 1) % outline.ring.length] });
            }
            segments.push(...drawnLines);
            outlineLines.push(...drawnLines);
            if (!enclosure.text) continue;
            const layouts = layoutsFor(enclosure.text, noteWrapWidths(enclosure.text, (text) => measure(text) / scale));
            // The enclosed marks themselves are the outline's business, not obstacles to its caption.
            const enclosed = new Set(flat);
            const captionObstacles = obstacles.filter((_, at) => at >= sceneObstacles.length || !enclosed.has(sceneObstacles[at].item));
            const sectors = all.flatMap((mark) => mark.sector ? [mark.sector] : []);
            const pie = sectors.length === all.length && sectors.length > 0
                ? { cx: sectors[0].cx, cy: sectors[0].cy, outer: Math.max(...sectors.map((sector) => sector.outer)), angles: sectors.map((sector) => (sector.start + sector.end) / 2) }
                : undefined;
            const placed = placeEnclosureCaption({
                outlines, layouts, plot, canvas, obstacles: captionObstacles, segments: segments.slice(), ...(pie ? { pie } : {}),
                ...(enclosure.connect ? { connect: enclosure.connect } : {}),
            });
            if (!placed) continue;
            drawCaption(placed, layouts, readableShade(colour, background, 4.5), background, colour);
        }

        if (placedCaptions) {
            placedCaptions.fixed = outlineLines.length > 0 ? [...captions, { box: { x: 0, y: 0, width: 0, height: 0 }, segments: outlineLines }] : captions;
        }
        if (wash.svg.childElementCount > 0) {
            if (!wash.root.isConnected) container.append(wash.root);
        } else wash.root.remove();
        if (ink.svg.childElementCount > 0) {
            if (!ink.root.isConnected) container.append(ink.root);
        } else ink.root.remove();
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    };

    return {
        render(nextRegions, nextEnclosures) {
            regions = nextRegions;
            enclosures = nextEnclosures;
            draw();
        },
        problems: () => problems,
        check: (region) => {
            const geo = geoRegionOf(region);
            return geo ? ('problem' in geo ? geo.problem : undefined) : spansOf(region).problem;
        },
        sync: () => {
            if (regions.size > 0 || enclosures.size > 0) draw();
        },
        destroy: () => {
            regions = new Map();
            enclosures = new Map();
            detach();
        },
    };
}

