// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { BoxIndex, overflow, overlapArea, segmentBox, segmentCrossesBox, type Box, type Point } from './geometry';
import type { CaptionLayout, CaptionPlacement } from './enclose';
import type { NoteObstacle, NoteSegment } from './place';

/**
 * A shaded stretch of the plot and its caption, after Blabber's `region`. The stretch is cut to the
 * plot; its caption is seated by Blabber's rules, priced against the chart's ink as boxes and lines
 * rather than rendered pixels, and the cheapest kept:
 * - a period (an x stretch): centred on the stretch and slid back inside the plot; above or below the
 *   series it crosses, on the side with more room, then anywhere up the column; with no series under
 *   it, in the middle of the stretch, then at its top or foot; past the plot's top as a last resort.
 * - a band of values (a y stretch): across it and just above or below it.
 * - a box (both axes, or a `placement` within it): anywhere inside, nearest the asked-for spot, and
 *   only where nothing inside is clear, outside it with a straight leader.
 */

export type RegionPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center' | 'above' | 'below';

export interface RegionCaptionInput {
    region: Box;
    /** Which axes the stretch is bounded on. */
    axes: { x: boolean; y: boolean };
    /** Each layout the caption may take, the first preferred. */
    layouts: readonly CaptionLayout[];
    plot: Box;
    canvas: Box;
    obstacles?: readonly NoteObstacle[];
    segments?: readonly NoteSegment[];
    /** The series' vertices, for the envelope a period's caption keeps clear of. */
    vertices?: readonly Point[];
    placement?: RegionPlacement;
}

/** Per px² hidden; tiled cells are data too, so a caption over them costs as over any mark. */
const AREA_COST = { mark: 8, text: 25, faint: 8 };
const CUT_COST = 250;
const CANVAS_COST = 10_000;
/** A caption inside its own region, clear of the data, is preferred to one standing outside on a leader. */
const OUTSIDE_COST = 400;
const INSET = 4;
const LEADER_GAP = 18;

interface Seat {
    box: Box;
    layout: number;
    rank: number;
    leader?: { from: Point; to: Point };
}

function nearestOnBox(box: Box, point: Point): Point {
    return {
        x: Math.max(box.x, Math.min(box.x + box.width, point.x)),
        y: Math.max(box.y, Math.min(box.y + box.height, point.y)),
    };
}

/** Seats for a period's caption: centred on the stretch, free to move up and down the plot. */
function periodSeats(input: RegionCaptionInput, layout: CaptionLayout, index: number): Seat[] {
    const { region, plot, vertices = [] } = input;
    const { width: w, height: h } = layout;
    const x = Math.max(plot.x + 2, Math.min(plot.x + plot.width - w - 2, region.x + (region.width - w) / 2));
    const seats: Seat[] = [];
    let envTop = Infinity;
    let envBottom = -Infinity;
    for (const point of vertices) {
        if (point.x < region.x - 0.5 || point.x > region.x + region.width + 0.5) continue;
        envTop = Math.min(envTop, point.y);
        envBottom = Math.max(envBottom, point.y);
    }
    const top = plot.y;
    const bottom = plot.y + plot.height;
    const at = (y: number, rank: number) => seats.push({ box: { x, y, width: w, height: h }, layout: index, rank });
    if (Number.isFinite(envTop)) {
        const above = envTop - top;
        const below = bottom - envBottom;
        const margin = 10;
        const room = h + 6;
        const reach = 0.62;
        const belowFirst = below >= above;
        const underCentre = Math.min(bottom - room / 2 - 4, Math.max(envBottom + margin + room / 2, envBottom + below * reach));
        const overCentre = Math.max(top + room / 2 + 4, Math.min(envTop - margin - room / 2, envTop - above * reach));
        at((belowFirst ? underCentre : overCentre) - h / 2, 0);
        at((belowFirst ? overCentre : underCentre) - h / 2, 1);
    } else {
        at(region.y + (region.height - h) / 2, 0);
        at(region.y + INSET, 1);
        at(region.y + region.height - h - INSET, 1.25);
    }
    // The whole column, at every height a caption could sit: ranked behind the seats above, nearer the
    // top first, where a period caption reads as a heading for the stretch.
    const sweep = 14;
    const column = { top: Math.max(top, region.y), bottom: Math.min(bottom, region.y + region.height) };
    for (let step = 0; step <= sweep; step++) {
        const t = step / sweep;
        at(column.top + 4 + t * Math.max(0, column.bottom - column.top - 8 - h), 2 + t * 0.5);
    }
    // Past the plot, over its stretch: only where the plot has no clear place.
    seats.push({ box: { x, y: plot.y - h - 8, width: w, height: h }, layout: index, rank: 20 });
    return seats;
}

/** Seats for a band of values: across it, inside it, or just above or below it. */
function bandSeats(input: RegionCaptionInput, layout: CaptionLayout, index: number): Seat[] {
    const { region } = input;
    const { width: w, height: h } = layout;
    const seats: Seat[] = [];
    const xs = [0.5, 0.25, 0.75, 0, 1].map((t) => region.x + INSET + t * Math.max(0, region.width - w - 2 * INSET));
    const ys = [
        region.y + (region.height - h) / 2, region.y + INSET, region.y + region.height - h - INSET,
        region.y - h - INSET, region.y + region.height + INSET,
    ];
    for (const x of xs) {
        for (const y of ys) {
            const outside = Math.max(region.y - y - h, 0, y - region.y - region.height);
            const off = Math.abs(x + w / 2 - region.x - region.width / 2);
            seats.push({ box: { x, y, width: w, height: h }, layout: index, rank: outside * 4 + off * 0.05 });
        }
    }
    return seats;
}

/**
 * Seats for a caption asked to stand `above` or `below` a region: just past its edge where the region
 * has a top or a foot of its own, past the plot for a stretch that spans the plot's height. Where that
 * seat is taken (the plot's header over a full-height stretch), the region's edge inside the plot.
 */
function besideSeats(input: RegionCaptionInput, layout: CaptionLayout, index: number, side: 'above' | 'below'): Seat[] {
    const { region, plot, canvas } = input;
    const { width: w, height: h } = layout;
    const x = Math.max(canvas.x, Math.min(canvas.x + canvas.width - w, region.x + (region.width - w) / 2));
    const spansPlot = region.y <= plot.y + 0.5 && region.y + region.height >= plot.y + plot.height - 0.5;
    const outside = spansPlot
        ? (side === 'above' ? plot.y - h - 8 : plot.y + plot.height + 8)
        : (side === 'above' ? region.y - h - INSET : region.y + region.height + INSET);
    const inside = side === 'above' ? region.y + INSET : region.y + region.height - h - INSET;
    return [
        { box: { x, y: outside, width: w, height: h }, layout: index, rank: 0 },
        { box: { x, y: inside, width: w, height: h }, layout: index, rank: 60 },
    ];
}

/**
 * Seats for a box: a 9 × 9 grid inside it, drawn toward the centre (or the asked-for spot); and, for a
 * box with no clear place inside, the four sides outside it, each on a straight leader to the box.
 */
function boxSeats(input: RegionCaptionInput, layout: CaptionLayout, index: number, outside = !input.placement): Seat[] {
    const { region, placement } = input;
    const { width: w, height: h } = layout;
    const seats: Seat[] = [];
    const tx = placement === 'left' ? 0 : placement === 'right' ? 1 : 0.5;
    const ty = placement === 'top' ? 0 : placement === 'bottom' ? 1 : 0.5;
    const pull = placement ? 1_000 : 20;
    if (w <= region.width - 6 && h <= region.height - 6) {
        for (let i = 0; i <= 8; i++) {
            for (let j = 0; j <= 8; j++) {
                const box = {
                    x: region.x + 6 + (region.width - w - 12) * i / 8,
                    y: region.y + 3 + (region.height - h - 6) * j / 8,
                    width: w, height: h,
                };
                if (box.x < region.x + 3 || box.x + w > region.x + region.width - 3) continue;
                seats.push({ box, layout: index, rank: Math.hypot(i / 8 - tx, j / 8 - ty) * pull });
            }
        }
    }
    if (outside) {
        const centre = { x: region.x + region.width / 2, y: region.y + region.height / 2 };
        for (const side of ['above', 'below', 'left', 'right'] as const) {
            const box = {
                x: side === 'left' ? region.x - w - LEADER_GAP : side === 'right' ? region.x + region.width + LEADER_GAP : region.x + (region.width - w) / 2,
                y: side === 'above' ? region.y - h - LEADER_GAP : side === 'below' ? region.y + region.height + LEADER_GAP : region.y + (region.height - h) / 2,
                width: w, height: h,
            };
            const middle = { x: box.x + w / 2, y: box.y + h / 2 };
            const to = nearestOnBox(region, middle);
            const from = nearestOnBox(box, to);
            seats.push({
                box, layout: index, leader: { from, to },
                rank: OUTSIDE_COST + Math.hypot(middle.x - centre.x, middle.y - centre.y) * 0.5,
            });
        }
    }
    return seats;
}

/** Where a region's caption stands, and the leader that joins it to the region where it stands outside. */
export function placeRegionCaption(input: RegionCaptionInput): CaptionPlacement | undefined {
    const { region, layouts, plot, canvas, placement } = input;
    if (layouts.length === 0) return undefined;
    const seats: Seat[] = [];
    layouts.forEach((layout, index) => {
        const lineCost = index * 30;
        let own: Seat[];
        if (placement === 'above' || placement === 'below') own = besideSeats(input, layout, index, placement);
        else if (placement || (input.axes.x && input.axes.y)) own = boxSeats(input, layout, index);
        else if (input.axes.x) own = periodSeats(input, layout, index);
        else own = bandSeats(input, layout, index);
        // A placement the region is too small to hold falls back to the region's own seats, rather
        // than leave the region uncaptioned.
        if (own.length === 0) {
            const fallback = input.axes.x && !input.axes.y ? periodSeats(input, layout, index)
                : input.axes.y && !input.axes.x ? bandSeats(input, layout, index)
                    : boxSeats(input, layout, index, true);
            // The side asked for still leads: a caption asked for the top stands as high as it fits.
            const lean = (box: Box): number => placement === 'top' ? box.y - region.y
                : placement === 'bottom' ? region.y + region.height - box.y - box.height
                    : placement === 'left' ? box.x - region.x
                        : placement === 'right' ? region.x + region.width - box.x - box.width : 0;
            own = fallback.map((seat) => ({ ...seat, rank: seat.rank + 40 + Math.max(0, lean(seat.box)) * 0.5 }));
        }
        for (const seat of own) seats.push({ ...seat, rank: seat.rank + lineCost });
    });
    const obstacles = new BoxIndex(input.obstacles ?? []);
    const segments = new BoxIndex((input.segments ?? []).map((segment) => ({ ...segment, box: segmentBox(segment.a, segment.b) })));
    let best: CaptionPlacement | undefined;
    for (const seat of seats) {
        const { box } = seat;
        let cost = CANVAS_COST * overflow(box, canvas, 1) + seat.rank;
        if (best && cost >= best.cost) continue;
        for (const obstacle of obstacles.near(box)) cost += AREA_COST[obstacle.kind] * overlapArea(box, obstacle.box);
        for (const segment of segments.near(box)) if (segmentCrossesBox(segment.a, segment.b, box)) cost += CUT_COST;
        if (seat.leader) {
            const { from, to } = seat.leader;
            cost += Math.hypot(to.x - from.x, to.y - from.y);
            for (const obstacle of obstacles.near(segmentBox(from, to))) if (obstacle.kind !== 'faint' && segmentCrossesBox(from, to, obstacle.box)) cost += 150;
        }
        if (!best || cost < best.cost) {
            best = { box, layout: seat.layout, align: 'center', leaders: seat.leader ? [seat.leader] : [], cost };
        }
    }
    return best;
}

/**
 * The pixel span of one axis's stretch, from the axis's own reading of its values:
 * - banded (`step` given): the categories' positions, their whole bands covered; they must stand
 *   next to each other in the axis's order, or the span is refused (shading the ones between would
 *   say what the author did not).
 * - continuous: two bounds, either `null` for the axis's end on that side.
 * The span is then cut to the axis's range. Undefined where a value is not on the axis.
 */
export function regionSpan(
    bounds: readonly unknown[],
    axis: {
        /** The pixel a value stands at: a band's centre on a banded axis. Undefined off the axis. */
        position: (value: unknown) => number | undefined;
        /** The axis's range, in px, in either order. */
        range: readonly [number, number];
        /** The domain's two ends, low then high, on a continuous axis. */
        ends?: readonly [unknown, unknown];
        /** On a banded axis: each category's index in the axis's order, and the band's step in px. */
        index?: (value: unknown) => number;
        step?: number;
    },
): { span?: [number, number]; problem?: string } {
    const lo = Math.min(axis.range[0], axis.range[1]);
    const hi = Math.max(axis.range[0], axis.range[1]);
    const clip = (a: number, b: number): [number, number] => [Math.max(lo, Math.min(a, b)), Math.min(hi, Math.max(a, b))];
    if (axis.step !== undefined && axis.index) {
        const indices = bounds.map(axis.index);
        if (indices.some((index) => index < 0)) return { problem: `${String(bounds[indices.findIndex((index) => index < 0)])} is not a category on this axis.` };
        const sorted = [...new Set(indices)].sort((a, b) => a - b);
        if (sorted.some((index, at) => at > 0 && index !== sorted[at - 1] + 1)) {
            return { problem: 'the categories are not next to each other: list every category the region covers, or shade each run with its own region, so the ones between are not shaded.' };
        }
        const centres = bounds.map(axis.position).filter((value): value is number => value !== undefined && Number.isFinite(value));
        if (centres.length === 0) return { problem: 'none of the categories is on this axis.' };
        return { span: clip(Math.min(...centres) - axis.step / 2, Math.max(...centres) + axis.step / 2) };
    }
    if (bounds.length !== 2) return { problem: 'a continuous axis takes exactly two bounds, [low, high].' };
    const [low, high] = bounds;
    const lowPixel = low === null || low === undefined ? axis.position(axis.ends?.[0]) : axis.position(low);
    const highPixel = high === null || high === undefined ? axis.position(axis.ends?.[1]) : axis.position(high);
    if (lowPixel === undefined || highPixel === undefined || !Number.isFinite(lowPixel) || !Number.isFinite(highPixel)) {
        return { problem: `${String(low)} to ${String(high)} is not on this axis.` };
    }
    const span = clip(lowPixel, highPixel);
    if (span[1] - span[0] <= 0) return { problem: `${String(low)} to ${String(high)} lies outside the plot.` };
    return { span };
}
