// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/** A point in the drawing, in px, y downward. */
export interface Point {
    x: number;
    y: number;
}

/** An axis-aligned box in the drawing, in px. */
export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * The mark a note points at, as its visible outline: a circle (a scatter dot, a line's point) or a
 * rectangle (a bar, a cell), by its centre and half extents. An ellipse is a circle with unequal
 * half extents.
 */
export interface NoteTarget {
    shape: 'circle' | 'rect';
    x: number;
    y: number;
    rx: number;
    ry: number;
}

export function boxCenter(box: Box): Point {
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function overlapArea(a: Box, b: Box): number {
    const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return width > 0 && height > 0 ? width * height : 0;
}

/** The clear distance between two boxes; 0 where they touch or overlap. */
export function boxDistance(a: Box, b: Box): number {
    const dx = Math.max(b.x - a.x - a.width, a.x - b.x - b.width, 0);
    const dy = Math.max(b.y - a.y - a.height, a.y - b.y - b.height, 0);
    return Math.hypot(dx, dy);
}

/** How far a box runs past another it should stay inside, summed over its four sides. */
export function overflow(inner: Box, outer: Box, margin = 0): number {
    return Math.max(0, outer.x + margin - inner.x)
        + Math.max(0, inner.x + inner.width - (outer.x + outer.width - margin))
        + Math.max(0, outer.y + margin - inner.y)
        + Math.max(0, inner.y + inner.height - (outer.y + outer.height - margin));
}

/** How far a target's outline stands from its centre along the unit vector (ux, uy). */
export function rimExtent(target: NoteTarget, ux: number, uy: number): number {
    const rx = Math.max(target.rx, 1e-6);
    const ry = Math.max(target.ry, 1e-6);
    if (target.shape === 'circle') return 1 / Math.sqrt((ux * ux) / (rx * rx) + (uy * uy) / (ry * ry));
    const tx = Math.abs(ux) > 1e-9 ? rx / Math.abs(ux) : Infinity;
    const ty = Math.abs(uy) > 1e-9 ? ry / Math.abs(uy) : Infinity;
    return Math.min(tx, ty);
}

/** Where the ray from a target's centre toward `toward` leaves its outline: a leader's tip. */
export function rimPoint(target: NoteTarget, toward: Point): Point {
    const dx = toward.x - target.x;
    const dy = toward.y - target.y;
    const length = Math.hypot(dx, dy) || 1;
    const extent = rimExtent(target, dx / length, dy / length);
    return { x: target.x + (dx / length) * extent, y: target.y + (dy / length) * extent };
}

/** The target's bounding box. */
export function targetBox(target: NoteTarget): Box {
    return { x: target.x - target.rx, y: target.y - target.ry, width: target.rx * 2, height: target.ry * 2 };
}

/** The clear distance from a target's visible outline to a box; 0 where the box touches or covers it. */
export function targetGap(target: NoteTarget, box: Box): number {
    if (target.shape === 'rect') return boxDistance(box, targetBox(target));
    const nearest = {
        x: Math.min(Math.max(target.x, box.x), box.x + box.width),
        y: Math.min(Math.max(target.y, box.y), box.y + box.height),
    };
    const dx = nearest.x - target.x;
    const dy = nearest.y - target.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1e-9) return 0;
    return Math.max(0, distance - rimExtent(target, dx / distance, dy / distance));
}

/**
 * A box of the given size set along the direction (ux, uy) from the target's centre, as near as it
 * can stand while keeping `gap` clear of the outline — a seat. Found by bisection on the distance
 * of the box's centre, which the clear gap grows with along any one direction.
 */
export function seatBox(target: NoteTarget, width: number, height: number, ux: number, uy: number, gap: number): Box {
    const at = (distance: number): Box => ({
        x: target.x + ux * distance - width / 2,
        y: target.y + uy * distance - height / 2,
        width,
        height,
    });
    let low = 0;
    let high = Math.hypot(target.rx + width, target.ry + height) + gap + 1;
    for (let step = 0; step < 24; step++) {
        const middle = (low + high) / 2;
        if (targetGap(target, at(middle)) >= gap) high = middle;
        else low = middle;
    }
    return at(high);
}

/**
 * Where a leader leaves its caption: the ray from the caption's centre toward the target crosses the
 * caption's edge there, so a caption beside its mark is met at mid-height and one above or below at
 * the middle of its top or bottom — the point the reader's eye would draw from.
 */
export function portToward(box: Box, target: Point): Point {
    const center = boxCenter(box);
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return center;
    const sx = Math.abs(dx) > 1e-9 ? (box.width / 2) / Math.abs(dx) : Infinity;
    const sy = Math.abs(dy) > 1e-9 ? (box.height / 2) / Math.abs(dy) : Infinity;
    const scale = Math.min(sx, sy, 1);
    return { x: center.x + dx * scale, y: center.y + dy * scale };
}

/** Whether the segment from `a` to `b` passes through the box (Liang–Barsky clip). */
export function segmentCrossesBox(a: Point, b: Point, box: Box): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let enter = 0;
    let leave = 1;
    const clip = (direction: number, offset: number): boolean => {
        if (Math.abs(direction) < 1e-12) return offset >= 0;
        const ratio = offset / direction;
        if (direction < 0) enter = Math.max(enter, ratio);
        else leave = Math.min(leave, ratio);
        return enter <= leave;
    };
    return clip(-dx, a.x - box.x) && clip(dx, box.x + box.width - a.x)
        && clip(-dy, a.y - box.y) && clip(dy, box.y + box.height - a.y);
}

/** Whether two segments cross at a point inside both (touching ends do not count). */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
    const side = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const d1 = side(c, d, a);
    const d2 = side(c, d, b);
    const d3 = side(a, b, c);
    const d4 = side(a, b, d);
    return d1 * d2 < 0 && d3 * d4 < 0;
}

/** The smallest absolute difference between two angles, in radians. */
export function angularDistance(a: number, b: number): number {
    const difference = Math.abs(a - b) % (Math.PI * 2);
    return Math.min(difference, Math.PI * 2 - difference);
}

/**
 * Boxes bucketed on a uniform grid, so a seat tests only the ink near it: a caption search over a
 * dense chart touches a few cells' worth of marks per seat rather than all of them.
 */
export class BoxIndex<T extends { box: Box }> {
    private readonly cells = new Map<number, T[]>();
    private readonly stamp = new Map<T, number>();
    private query = 0;

    constructor(readonly items: readonly T[], private readonly size = 32) {
        for (const item of items) {
            const { box } = item;
            if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) continue;
            for (let cx = Math.floor(box.x / size); cx <= Math.floor((box.x + box.width) / size); cx++) {
                for (let cy = Math.floor(box.y / size); cy <= Math.floor((box.y + box.height) / size); cy++) {
                    const key = cx * 100_003 + cy;
                    const cell = this.cells.get(key);
                    if (cell) cell.push(item);
                    else this.cells.set(key, [item]);
                }
            }
        }
    }

    /** Every item whose box shares a grid cell with `box`, each once. */
    near(box: Box): T[] {
        const found: T[] = [];
        const query = ++this.query;
        const { size } = this;
        for (let cx = Math.floor(box.x / size); cx <= Math.floor((box.x + box.width) / size); cx++) {
            for (let cy = Math.floor(box.y / size); cy <= Math.floor((box.y + box.height) / size); cy++) {
                const cell = this.cells.get(cx * 100_003 + cy);
                if (!cell) continue;
                for (const item of cell) {
                    if (this.stamp.get(item) === query) continue;
                    this.stamp.set(item, query);
                    found.push(item);
                }
            }
        }
        return found;
    }
}

/** A segment's box, for indexing. */
export function segmentBox(a: Point, b: Point): Box {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}
