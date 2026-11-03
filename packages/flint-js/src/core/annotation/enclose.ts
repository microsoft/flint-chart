// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { BoxIndex, boxDistance, overflow, overlapArea, segmentBox, segmentCrossesBox, segmentsCross, type Box, type Point } from './geometry';
import type { NoteObstacle, NoteSegment } from './place';

/**
 * Outlines round sets of marks, after Blabber's `enclose`: one outline per group, a caption they share,
 * and leaders from it to two or three outlines. Simplified for speed: each outline is built from the
 * marks' boxes (a line's vertices for a stretch of a line), and the caption takes the cheapest of a
 * fixed ring of seats round the outlines, one note at a time.
 */

export type EnclosureShape = 'hull' | 'rect' | 'ellipse' | 'circle';

/** One mark in a group, as its box on the plot. */
export interface EnclosedMark {
    box: Box;
    /** A bar, histogram bin or stacked segment; a heatmap cell or tile; a point; else another mark. */
    role: 'bar' | 'cell' | 'point' | 'other';
    /** A stretch of a line or area, by its vertices: the outline follows them. */
    points?: readonly Point[];
    /** A round point's radius. */
    radius?: number;
    /** A pie or donut slice: its centre, radii and angles (radians clockwise from 12 o'clock). */
    sector?: { cx: number; cy: number; inner: number; outer: number; start: number; end: number };
}

export interface EnclosureOutline {
    shape: EnclosureShape;
    /** The SVG path the outline is drawn as. */
    d: string;
    bounds: Box;
    /** The outline as a closed polyline, for contacts and clearances. */
    ring: Point[];
}

/** The outline's stroke width, in px: lighter than Blabber's 2 px emphasis, with a page halo under it. */
export const ENCLOSURE_STROKE = 1.5;

/** Bars, bins, stacks, cells and tiles are enclosed by a rectangle; other marks by a hull. */
export function defaultEnclosureShape(marks: readonly EnclosedMark[]): EnclosureShape {
    return marks.length > 0 && marks.every((mark) => mark.role === 'bar' || mark.role === 'cell') ? 'rect' : 'hull';
}

function union(boxes: readonly Box[]): Box | undefined {
    if (boxes.length === 0) return undefined;
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const box of boxes) {
        x1 = Math.min(x1, box.x);
        y1 = Math.min(y1, box.y);
        x2 = Math.max(x2, box.x + box.width);
        y2 = Math.max(y2, box.y + box.height);
    }
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function expand(box: Box, by: number): Box {
    return { x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by };
}

function clipBox(box: Box, frame: Box): Box {
    const x = Math.max(box.x, frame.x);
    const y = Math.max(box.y, frame.y);
    return {
        x, y,
        width: Math.max(0, Math.min(box.x + box.width, frame.x + frame.width) - x),
        height: Math.max(0, Math.min(box.y + box.height, frame.y + frame.height) - y),
    };
}

function rectRing(box: Box): Point[] {
    const { x, y, width, height } = box;
    return [
        { x, y }, { x: x + width / 2, y }, { x: x + width, y }, { x: x + width, y: y + height / 2 },
        { x: x + width, y: y + height }, { x: x + width / 2, y: y + height }, { x, y: y + height }, { x, y: y + height / 2 },
    ];
}

function rectOutline(box: Box): EnclosureOutline {
    const { x, y, width, height } = box;
    return { shape: 'rect', d: `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`, bounds: box, ring: rectRing(box) };
}

const cross = (a: Point, b: Point, c: Point): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** The convex hull of points, counter-clockwise in screen terms (Andrew's monotone chain). */
export function convexHull(points: readonly Point[]): Point[] {
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    if (sorted.length < 3) return sorted;
    const half = (ordered: readonly Point[]): Point[] => {
        const chain: Point[] = [];
        for (const point of ordered) {
            while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], point) <= 0) chain.pop();
            chain.push(point);
        }
        chain.pop();
        return chain;
    };
    return [...half(sorted), ...half([...sorted].reverse())];
}

/** A polygon cut to a rectangle (Sutherland–Hodgman). */
function clipPolygon(polygon: readonly Point[], frame: Box): Point[] {
    const edges: [(p: Point) => boolean, (a: Point, b: Point) => Point][] = [
        [(p) => p.x >= frame.x, (a, b) => ({ x: frame.x, y: a.y + (b.y - a.y) * (frame.x - a.x) / (b.x - a.x) })],
        [(p) => p.x <= frame.x + frame.width, (a, b) => ({ x: frame.x + frame.width, y: a.y + (b.y - a.y) * (frame.x + frame.width - a.x) / (b.x - a.x) })],
        [(p) => p.y >= frame.y, (a, b) => ({ x: a.x + (b.x - a.x) * (frame.y - a.y) / (b.y - a.y), y: frame.y })],
        [(p) => p.y <= frame.y + frame.height, (a, b) => ({ x: a.x + (b.x - a.x) * (frame.y + frame.height - a.y) / (b.y - a.y), y: frame.y + frame.height })],
    ];
    let output = [...polygon];
    for (const [inside, cut] of edges) {
        const input = output;
        output = [];
        for (let index = 0; index < input.length; index++) {
            const current = input[index];
            const previous = input[(index + input.length - 1) % input.length];
            if (inside(current)) {
                if (!inside(previous)) output.push(cut(previous, current));
                output.push(current);
            } else if (inside(previous)) output.push(cut(previous, current));
        }
        if (output.length === 0) break;
    }
    return output;
}

function polygonOutline(polygon: readonly Point[]): EnclosureOutline | undefined {
    if (polygon.length < 3) return undefined;
    const bounds = union(polygon.map((point) => ({ ...point, width: 0, height: 0 })))!;
    const d = `${polygon.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')} Z`;
    return { shape: 'hull', d, bounds, ring: [...polygon] };
}

/**
 * A padded hull round the marks: 6 px out from each box, or from each vertex of a stretch of line; a
 * row or column of points only as far out as keeps it off its neighbours. Cut to the plot, the whole
 * stroke inside.
 */
function hullOutline(marks: readonly EnclosedMark[], plot: Box): EnclosureOutline | undefined {
    const span = union(marks.map((mark) => mark.box))!;
    const pointsOnly = marks.length > 1 && marks.every((mark) => mark.role === 'point');
    const collinear = pointsOnly && (span.height <= Math.max(...marks.map((mark) => mark.box.height)) + 0.5
        || span.width <= Math.max(...marks.map((mark) => mark.box.width)) + 0.5);
    const pad = collinear ? Math.min(6, Math.max(ENCLOSURE_STROKE / 2 + 1, Math.min(span.width, span.height) * 0.15)) : 6;
    const candidates: Point[] = [];
    for (const mark of marks) {
        if (mark.points && mark.points.length >= 2) {
            for (const point of mark.points) {
                for (let index = 0; index < 8; index++) {
                    candidates.push({ x: point.x + Math.cos(index * Math.PI / 4) * pad, y: point.y + Math.sin(index * Math.PI / 4) * pad });
                }
            }
            continue;
        }
        const box = expand(mark.box, pad);
        candidates.push({ x: box.x, y: box.y }, { x: box.x + box.width, y: box.y },
            { x: box.x + box.width, y: box.y + box.height }, { x: box.x, y: box.y + box.height });
    }
    return polygonOutline(clipPolygon(convexHull(candidates), expand(plot, -ENCLOSURE_STROKE / 2 - 0.01)));
}

interface Ellipse {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    /** Radians, clockwise on screen. */
    angle: number;
}

/**
 * The smallest of a few enclosing ellipses round the boxes' corners: axis-aligned, along the cloud's
 * principal axis, and at 17 angles between, each scaled until every corner is inside. Where a frame is
 * given, an ellipse running past it is passed over.
 */
function enclosingEllipse(boxes: readonly Box[], padding: number, frame?: Box): Ellipse | undefined {
    const corners = boxes.flatMap((box) => {
        const padded = expand(box, padding);
        return [padded.x, padded.x + padded.width].flatMap((x) => [padded.y, padded.y + padded.height].map((y) => ({ x, y })));
    });
    if (corners.length === 0) return undefined;
    const origin = corners.reduce((sum, point) => ({ x: sum.x + point.x / corners.length, y: sum.y + point.y / corners.length }), { x: 0, y: 0 });
    const centred = corners.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y }));
    let xx = 0;
    let xy = 0;
    let yy = 0;
    for (const point of centred) {
        xx += point.x * point.x;
        xy += point.x * point.y;
        yy += point.y * point.y;
    }
    // An ellipse is convex: enclosing the hull encloses every corner.
    const boundary = convexHull(centred);
    const ring = boundary.length > 0 ? boundary : centred;
    const principal = Math.atan2(2 * xy, xx - yy) / 2;
    const angles = [0, principal, ...Array.from({ length: 17 }, (_, index) => (index + 1) * Math.PI / 36)];
    let best: Ellipse | undefined;
    for (const angle of angles) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const projected = ring.map((point) => ({ x: point.x * cos + point.y * sin, y: -point.x * sin + point.y * cos }));
        let left = Infinity;
        let right = -Infinity;
        let top = Infinity;
        let bottom = -Infinity;
        for (const point of projected) {
            left = Math.min(left, point.x);
            right = Math.max(right, point.x);
            top = Math.min(top, point.y);
            bottom = Math.max(bottom, point.y);
        }
        const cx = (left + right) / 2;
        const cy = (top + bottom) / 2;
        const a = (right - left) / 2;
        const b = (bottom - top) / 2;
        if (a <= 1e-9 || b <= 1e-9) continue;
        let scale = 1;
        for (const point of projected) scale = Math.max(scale, Math.hypot((point.x - cx) / a, (point.y - cy) / b));
        const rx = a * scale;
        const ry = b * scale;
        if (best && rx * ry >= best.rx * best.ry - 1e-9) continue;
        const centre = { x: origin.x + cx * cos - cy * sin, y: origin.y + cx * sin + cy * cos };
        const halfWidth = Math.hypot(rx * cos, ry * sin);
        const halfHeight = Math.hypot(rx * sin, ry * cos);
        if (frame && (centre.x - halfWidth < frame.x || centre.y - halfHeight < frame.y
            || centre.x + halfWidth > frame.x + frame.width || centre.y + halfHeight > frame.y + frame.height)) continue;
        best = { cx: centre.x, cy: centre.y, rx, ry, angle };
    }
    return best;
}

function ellipseOutline({ cx, cy, rx, ry, angle }: Ellipse, shape: EnclosureShape): EnclosureOutline {
    const dx = rx * Math.cos(angle);
    const dy = rx * Math.sin(angle);
    const rotation = angle * 180 / Math.PI;
    const d = `M ${cx - dx} ${cy - dy} A ${rx} ${ry} ${rotation} 1 0 ${cx + dx} ${cy + dy} A ${rx} ${ry} ${rotation} 1 0 ${cx - dx} ${cy - dy} Z`;
    const halfWidth = Math.hypot(rx * Math.cos(angle), ry * Math.sin(angle));
    const halfHeight = Math.hypot(rx * Math.sin(angle), ry * Math.cos(angle));
    const ring = Array.from({ length: 48 }, (_, index) => {
        const t = index * Math.PI / 24;
        const x = rx * Math.cos(t);
        const y = ry * Math.sin(t);
        return { x: cx + x * Math.cos(angle) - y * Math.sin(angle), y: cy + x * Math.sin(angle) + y * Math.cos(angle) };
    });
    return { shape, d, bounds: { x: cx - halfWidth, y: cy - halfHeight, width: 2 * halfWidth, height: 2 * halfHeight }, ring };
}

/**
 * One group's outline, by shape (Blabber's rules):
 * - `rect`: one bar's own border; several bars their tight union, taking in any bar standing between
 *   them; cells their union, the stroke kept inside; other marks their box 5 px out. Kept in the plot.
 * - `hull`: a padded convex hull ({@link hullOutline}).
 * - `ellipse`: round points, the smallest enclosing ellipse 2 px out; other marks the ellipse through
 *   the corners of their box 5 px out.
 * - `circle`: round one point, 2 px clear of it; round several, the circle through their box's corners.
 */
/** A slice's own boundary: its outer arc, its sides and its inner arc (or the centre). */
function sectorPath(sector: NonNullable<EnclosedMark['sector']>): { d: string; ring: Point[] } {
    const { cx, cy, inner, outer } = sector;
    // A reversed theta scale gives start > end; the path sweeps clockwise from the smaller angle.
    const start = Math.min(sector.start, sector.end);
    const end = Math.max(sector.start, sector.end);
    const at = (radius: number, angle: number): Point => ({ x: cx + radius * Math.sin(angle), y: cy - radius * Math.cos(angle) });
    const large = end - start > Math.PI ? 1 : 0;
    const a = at(outer, start);
    const b = at(outer, end);
    const c = at(inner, end);
    const d0 = at(inner, start);
    const d = inner > 0
        ? `M ${a.x} ${a.y} A ${outer} ${outer} 0 ${large} 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${inner} ${inner} 0 ${large} 0 ${d0.x} ${d0.y} Z`
        : `M ${cx} ${cy} L ${a.x} ${a.y} A ${outer} ${outer} 0 ${large} 1 ${b.x} ${b.y} Z`;
    const steps = Math.max(2, Math.ceil((end - start) / (Math.PI / 24)));
    const ring: Point[] = [];
    for (let step = 0; step <= steps; step++) ring.push(at(outer, start + (end - start) * step / steps));
    if (inner > 0) for (let step = steps; step >= 0; step--) ring.push(at(inner, start + (end - start) * step / steps));
    else ring.push({ x: cx, y: cy });
    return { d, ring };
}

export function enclosureOutline(
    marks: readonly EnclosedMark[],
    shape: EnclosureShape,
    plot: Box,
    siblings: readonly Box[] = [],
): EnclosureOutline | undefined {
    if (marks.length === 0) return undefined;
    // Slices are enclosed along their own wedge boundaries, never a box or a circle round them.
    if (shape === 'hull' && marks.every((mark) => mark.sector)) {
        const paths = marks.map((mark) => sectorPath(mark.sector!));
        const ring = paths.flatMap((path) => path.ring);
        return { shape: 'hull', d: paths.map((path) => path.d).join(' '), bounds: union(ring.map((point) => ({ ...point, width: 0, height: 0 })))!, ring };
    }
    const half = ENCLOSURE_STROKE / 2;
    const span = union(marks.map((mark) => mark.box))!;
    if (shape === 'hull') return hullOutline(marks, plot);
    if (shape === 'rect') {
        if (marks.length === 1 && marks[0].role === 'bar') return rectOutline(marks[0].box);
        if (marks.every((mark) => mark.role === 'cell')) {
            const inset = Math.min(half, span.width / 2, span.height / 2);
            return rectOutline({ x: span.x + inset, y: span.y + inset, width: span.width - 2 * inset, height: span.height - 2 * inset });
        }
        if (marks.every((mark) => mark.role === 'bar')) {
            // A bar standing between the members reads as enclosed: the outline takes it in rather than cut it.
            const vertical = span.width <= span.height || marks.every((mark) => mark.box.width <= mark.box.height);
            let tight = span;
            for (const other of siblings) {
                const at = vertical ? other.x + other.width / 2 : other.y + other.height / 2;
                const lo = vertical ? tight.x : tight.y;
                const hi = lo + (vertical ? tight.width : tight.height);
                if (at > lo && at < hi && overlapArea(other, tight) > 0) tight = union([tight, other])!;
            }
            return rectOutline(clipBox(tight, expand(plot, -half)));
        }
        return rectOutline(clipBox(expand(span, 5), expand(plot, -half)));
    }
    if (shape === 'circle') {
        if (marks.length === 1 && marks[0].role === 'point') {
            const box = marks[0].box;
            const radius = (marks[0].radius ?? Math.hypot(box.width, box.height) / 2) + 2 + half;
            return ellipseOutline({ cx: box.x + box.width / 2, cy: box.y + box.height / 2, rx: radius, ry: radius, angle: 0 }, 'circle');
        }
        const box = expand(span, 5);
        const radius = Math.hypot(box.width, box.height) / 2;
        return ellipseOutline({ cx: box.x + box.width / 2, cy: box.y + box.height / 2, rx: radius, ry: radius, angle: 0 }, 'circle');
    }
    if (marks.length > 1 && marks.every((mark) => mark.role === 'point' && !mark.points)) {
        const boxes = marks.map((mark) => mark.box);
        const fitted = enclosingEllipse(boxes, 2, expand(plot, -half - 1)) ?? enclosingEllipse(boxes, 2);
        if (fitted) return ellipseOutline(fitted, 'ellipse');
    }
    const box = expand(span, 5);
    return ellipseOutline({
        cx: box.x + box.width / 2, cy: box.y + box.height / 2, rx: box.width / Math.SQRT2, ry: box.height / Math.SQRT2, angle: 0,
    }, 'ellipse');
}

/** The point of a closed ring nearest `from`. */
export function nearestOnRing(ring: readonly Point[], from: Point): Point {
    let best = ring[0];
    let bestDistance = Infinity;
    for (let index = 0; index < ring.length; index++) {
        const a = ring[index];
        const b = ring[(index + 1) % ring.length];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = dx * dx + dy * dy;
        const t = length > 0 ? Math.max(0, Math.min(1, ((from.x - a.x) * dx + (from.y - a.y) * dy) / length)) : 0;
        const point = { x: a.x + t * dx, y: a.y + t * dy };
        const distance = Math.hypot(point.x - from.x, point.y - from.y);
        if (distance < bestDistance) {
            best = point;
            bestDistance = distance;
        }
    }
    return best;
}

/** The clear distance from a box to a closed ring's line; 0 where the line crosses or touches the box. */
export function ringDistance(ring: readonly Point[], box: Box): number {
    let best = Infinity;
    for (let index = 0; index < ring.length; index++) {
        const a = ring[index];
        const b = ring[(index + 1) % ring.length];
        if (segmentCrossesBox(a, b, box)) return 0;
        best = Math.min(best, boxDistance({ ...a, width: 0, height: 0 }, box), boxDistance({ ...b, width: 0, height: 0 }, box));
    }
    return best;
}

/** A caption's lines and size, at one wrap. */
export interface CaptionLayout {
    lines: string[];
    width: number;
    height: number;
}

export interface EnclosureCaptionInput {
    outlines: readonly EnclosureOutline[];
    /** Where the outlines enclose slices: the pie's centre and outer radius, and each slice's mid-angle. */
    pie?: { cx: number; cy: number; outer: number; angles: readonly number[] };
    layouts: readonly CaptionLayout[];
    plot: Box;
    canvas: Box;
    obstacles?: readonly NoteObstacle[];
    segments?: readonly NoteSegment[];
    connect?: 'auto' | 'all' | 'none';
}

export interface CaptionPlacement {
    box: Box;
    layout: number;
    align: 'left' | 'center' | 'right';
    leaders: { from: Point; to: Point }[];
    cost: number;
}

/** Per px² hidden; tiled cells are data too, so a caption over them costs as over any mark. */
const AREA_COST = { mark: 8, text: 25, faint: 8 };
const LINE_COST = 50;
const CUT_COST = 250;
const CROSS_COST = 150;
/** A seat off the plot stays in the paper it can: past the canvas it is not drawn. */
const CANVAS_COST = 10_000;
const PLOT_COST = 20;
const PORT_GAP = 3;
/** A caption this near its outline reads as beside it, with no leader. */
const NEAR_GAP = 16;

/**
 * Where the caption of one or more outlines stands, and the leaders to them. Seats are Blabber's: one
 * outline's caption centred above or below it, beside it, or at a corner, 8 to 28 px out; a shared
 * caption centred above, below or beside the outlines' union, or a quarter along it, 12 to 64 px out.
 * A seat is passed over where its box comes within 4 px of an outline. Leaders run from the caption's
 * edge to each outline's nearest point when there are two or three outlines (`connect: 'auto'`), to
 * all of them (`'all'`), or to none.
 */
export function placeEnclosureCaption(input: EnclosureCaptionInput): CaptionPlacement | undefined {
    const { outlines, layouts, plot, canvas } = input;
    const box = union(outlines.map((outline) => outline.bounds));
    if (!box || layouts.length === 0) return undefined;
    const connect = input.connect ?? 'auto';
    // One slice's caption outside the pie needs its leader to say which slice; Blabber's pie labels draw one.
    const linked = connect === 'all' || (connect === 'auto' && ((outlines.length >= 2 && outlines.length <= 3) || !!input.pie));
    const shared = outlines.length > 1;
    const obstacles = new BoxIndex(input.obstacles ?? []);
    const segments = new BoxIndex((input.segments ?? []).map((segment) => ({ ...segment, box: segmentBox(segment.a, segment.b) })));
    let best: CaptionPlacement | undefined;
    layouts.forEach((layout, index) => {
        const { width: w, height: h } = layout;
        const cx = box.x + (box.width - w) / 2;
        const cy = box.y + (box.height - h) / 2;
        const seats: { x: number; y: number; rank: number; align: CaptionPlacement['align'] }[] = [];
        // Past the plot, over or beside the outlines: the paper a caption takes when the plot is full.
        const outside = [
            { x: cx, y: plot.y - h - 8, rank: 300, align: 'center' as const },
            { x: cx, y: plot.y + plot.height + 8, rank: 320, align: 'center' as const },
            { x: plot.x + plot.width + 8, y: cy, rank: 310, align: 'left' as const },
            { x: plot.x - w - 8, y: cy, rank: 330, align: 'right' as const },
        ];
        seats.push(...outside);
        // A slice's caption stands outside the pie on its own radius, as a pie label does.
        if (input.pie) {
            for (const angle of input.pie.angles) {
                for (const reach of [12, 24, 40]) {
                    const rim = { x: input.pie.cx + (input.pie.outer + reach) * Math.sin(angle), y: input.pie.cy - (input.pie.outer + reach) * Math.cos(angle) };
                    const right = Math.sin(angle) >= 0;
                    seats.push({ x: right ? rim.x : rim.x - w, y: rim.y - h / 2, rank: reach * 0.5, align: right ? 'left' : 'right' });
                }
            }
        }
        if (shared) {
            for (const gap of [12, 24, 40, 64]) {
                seats.push(
                    { x: cx, y: box.y - gap - h, rank: gap, align: 'center' },
                    { x: cx, y: box.y + box.height + gap, rank: gap + 1, align: 'center' },
                    { x: box.x - gap - w, y: cy, rank: gap + 2, align: 'right' },
                    { x: box.x + box.width + gap, y: cy, rank: gap + 2, align: 'left' },
                    ...[-0.25, 0.25].flatMap((shift) => [
                        { x: cx + box.width * shift, y: box.y - gap - h, rank: gap + 3, align: 'center' as const },
                        { x: cx + box.width * shift, y: box.y + box.height + gap, rank: gap + 4, align: 'center' as const },
                    ]),
                );
            }
        } else {
            for (const gap of [8, 16, 28]) {
                const step = (gap - 8) * 2;
                seats.push(
                    { x: cx, y: box.y - gap - h, rank: step, align: 'center' },
                    { x: cx, y: box.y + box.height + gap, rank: step + 1, align: 'center' },
                    { x: box.x - gap - w, y: cy, rank: step + 2, align: 'right' },
                    { x: box.x + box.width + gap, y: cy, rank: step + 2, align: 'left' },
                    { x: box.x - gap - w, y: box.y - gap - h, rank: step + 3.5, align: 'right' },
                    { x: box.x + box.width + gap, y: box.y - gap - h, rank: step + 3.5, align: 'left' },
                    { x: box.x - gap - w, y: box.y + box.height + gap, rank: step + 4.5, align: 'right' },
                    { x: box.x + box.width + gap, y: box.y + box.height + gap, rank: step + 4.5, align: 'left' },
                );
            }
        }
        for (const seat of seats) {
            const rect: Box = { x: seat.x, y: seat.y, width: w, height: h };
            if (outlines.some((outline) => ringDistance(outline.ring, expand(rect, 4)) === 0)) continue;
            let cost = CANVAS_COST * overflow(rect, canvas, 1) + PLOT_COST * overflow(rect, plot) + seat.rank + (layout.lines.length - 1) * LINE_COST;
            if (best && cost >= best.cost) continue;
            for (const obstacle of obstacles.near(rect)) cost += AREA_COST[obstacle.kind] * overlapArea(rect, obstacle.box);
            for (const segment of segments.near(rect)) if (segmentCrossesBox(segment.a, segment.b, rect)) cost += CUT_COST;
            if (best && cost >= best.cost) continue;
            const centre = { x: rect.x + w / 2, y: rect.y + h / 2 };
            const leaders: CaptionPlacement['leaders'] = [];
            if (linked) {
                let length = 0;
                for (const outline of outlines) {
                    const to = nearestOnRing(outline.ring, centre);
                    const from = portFrom(rect, to);
                    leaders.push({ from, to });
                    length += Math.hypot(to.x - from.x, to.y - from.y);
                    for (const obstacle of obstacles.near(segmentBox(from, to))) if (segmentCrossesBox(from, to, obstacle.box)) cost += CROSS_COST;
                    for (const other of outlines) if (other !== outline && ringCrosses(other.ring, from, to)) cost += CROSS_COST;
                }
                cost += length / outlines.length;
                for (let a = 0; a < leaders.length; a++) {
                    for (let b = a + 1; b < leaders.length; b++) {
                        if (segmentsCross(leaders[a].from, leaders[a].to, leaders[b].from, leaders[b].to)) cost += CROSS_COST;
                    }
                }
            } else {
                const gap = Math.min(...outlines.map((outline) => ringDistance(outline.ring, rect)));
                cost += gap;
                // A caption standing off from its one outline, past where it reads as beside it, is
                // joined to the outline by a leader, as a displaced caption is in Blabber.
                if (outlines.length === 1 && connect !== 'none' && gap > NEAR_GAP) {
                    const to = nearestOnRing(outlines[0].ring, centre);
                    const from = portFrom(rect, to);
                    leaders.push({ from, to });
                    cost += Math.hypot(to.x - from.x, to.y - from.y) + 30;
                    for (const obstacle of obstacles.near(segmentBox(from, to))) if (segmentCrossesBox(from, to, obstacle.box)) cost += CROSS_COST;
                }
            }
            if (!best || cost < best.cost) best = { box: rect, layout: index, align: seat.align, leaders, cost };
        }
    });
    return best;
}

function ringCrosses(ring: readonly Point[], a: Point, b: Point): boolean {
    for (let index = 0; index < ring.length; index++) {
        if (segmentsCross(a, b, ring[index], ring[(index + 1) % ring.length])) return true;
    }
    return false;
}

/** Where a leader to `to` leaves a caption: the middle of the facing edge, a few px out. */
function portFrom(rect: Box, to: Point): Point {
    if (to.y < rect.y) return { x: Math.max(rect.x, Math.min(rect.x + rect.width, to.x)), y: rect.y - PORT_GAP };
    if (to.y > rect.y + rect.height) return { x: Math.max(rect.x, Math.min(rect.x + rect.width, to.x)), y: rect.y + rect.height + PORT_GAP };
    return to.x < rect.x
        ? { x: rect.x - PORT_GAP, y: rect.y + rect.height / 2 }
        : { x: rect.x + rect.width + PORT_GAP, y: rect.y + rect.height / 2 };
}
