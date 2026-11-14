// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
    angularDistance,
    boxDistance,
    overflow,
    overlapArea,
    portToward,
    rimPoint,
    seatBox,
    segmentCrossesBox,
    segmentsCross,
    targetGap,
    type Box,
    type NoteTarget,
    type Point,
} from './geometry';

/**
 * Where a note that names one mark stands, and whether a leader joins them. A lightweight reading of
 * Blabber's caption placement (the `blabber` placement notes): the caption is set at a ring of
 * seats round the mark's visible outline, each a few px further out, and the one with the least cost
 * is kept — one note at a time, no joint search. The cost is tiered so a fault of meaning always
 * outranks a tidiness term: running off the canvas, then covering ink (marks and text by the area
 * hidden, a thin line by being cut), then distance from the mark and the leader it needs, then a
 * preferred side.
 */

/** What a caption must not cover: a mark, a piece of text (axis labels, a legend), or faint ink. */
export interface NoteObstacle {
    box: Box;
    kind: 'mark' | 'text' | 'faint';
}

/** Thin ink a caption should not cut: a line between two of its points, a rule, an axis domain. */
export interface NoteSegment {
    a: Point;
    b: Point;
}

export interface PlaceNoteInput {
    /** The mark the note names. */
    target: NoteTarget;
    /**
     * The rest of the mark where the note names one end of it — a bar whose value end is the target:
     * a caption keeps off it as off any mark, but standing beside it is no ambiguity.
     */
    body?: Box;
    /** The caption's box size, its halo included. */
    label: { width: number; height: number };
    /** The plot the caption should stay within, and the canvas it must. */
    plot: Box;
    canvas: Box;
    obstacles?: readonly NoteObstacle[];
    segments?: readonly NoteSegment[];
    /** The side the mark's own geometry suggests (a bar's value end), in radians, y downward. */
    preferredAngle?: number;
    /** `'none'` never draws a leader; `'auto'` draws one only where the caption is not plainly beside its mark. */
    connector?: 'auto' | 'none';
    /** The caption's font size, in px: a bar's direct seats stand off by multiples of it. */
    fontSize?: number;
    /**
     * Seats on the mark itself: the caption centred at `point`, with no leader, where `fits` says its
     * box lies inside the room (a big slice's band, a donut's hole, a long bar). Its halo keeps the
     * words readable on the fill, and standing on the mark names it outright, so such a seat beats a
     * long leader and any seat over text. `own` lists boxes the seat may cover at no cost (the mark).
     */
    inside?: readonly { point: Point; fits: (box: Box) => boolean; own?: readonly Box[]; fill?: string }[];
    /** Offer only the `inside` seats: the anchor names its mark from on it, not from around it. */
    insideOnly?: boolean;
}

/**
 * A leader from a caption (`from`) to its mark (`to`), turning at its `elbows` (in order from the
 * caption to the mark) where it has any.
 */
export interface NoteLeader {
    from: Point;
    to: Point;
    elbows?: readonly Point[];
}

/** A leader's straight runs, from the caption to the mark. */
export function leaderSegments(leader: NoteLeader): NoteSegment[] {
    const points = [leader.from, ...(leader.elbows ?? []), leader.to];
    return points.slice(1).map((point, index) => ({ a: points[index], b: point }));
}

export interface NotePlacement {
    box: Box;
    /** How the caption's lines align: toward the mark beside it, centred above or below it. */
    align: 'left' | 'center' | 'right';
    /**
     * From the caption's edge to the mark's outline, where one is drawn. It leaves the outline square
     * to it: where the caption is not straight out from the side it names, the leader runs out from
     * that side first and turns at its `elbows`, square, so it is never drawn along the mark's own edge.
     */
    leader?: NoteLeader;
    /** The seat's direction from the mark's centre, in radians, and its clear gap from the outline, in px. */
    angle: number;
    gap: number;
    cost: number;
    /** What the seat covers: px² of text under it, and whether it runs past the canvas. */
    covers?: { text: number; offCanvas: boolean };
    /** The caption stands on the mark itself. */
    inside?: boolean;
    /** The mark's fill under a caption that stands on it: the caption is set in an ink that reads on it, with no halo. */
    insideFill?: string;
    /** No seat kept the chart's text readable on the canvas: the mark is pointed at by its highlight alone. */
    unplaced?: boolean;
}

/** Directions round the mark, every 22.5°. */
const DIRECTIONS = Array.from({ length: 16 }, (_, index) => (index * Math.PI * 2) / 16);
/** Clear gaps from the mark's outline, in px: near seats first, as association is meaning. */
const GAPS = [2, 5, 9, 14, 20, 28, 40, 56];
/** A caption nearer its mark than this needs no leader, unless another mark is about as near. */
const MAX_UNLED_GAP = 10;
/** A leader shorter than this reads as a stub. */
const MIN_LEADER = 6;
/** Up to this reach the eye carries from caption to mark in one movement. */
const COMFORTABLE_REACH = 34;

const COST = {
    canvas: 10_000,
    plot: 40,
    /** Per px² of ink hidden. Text is the dearest: a covered axis label is a lost value. */
    area: { mark: 8, text: 25, faint: 1 },
    /** Per thin line the caption cuts. */
    cut: 250,
    /** Per mark, piece of text or line a leader runs across. */
    leaderCross: 150,
    leaderFixed: 30,
    leaderLength: 1.5,
    /** Per px² beyond a comfortable reach: past it, a leader is a hunt across the plot. */
    leaderReach: 0.06,
    stub: 200,
    /** Per turn a leader takes: a straight one reads quicker. */
    elbow: 12,
    /** A seat on the mark: dearer than a near empty seat, cheaper than a leader across the chart. */
    inside: 45,
    gapLinear: 1.2,
    gapSquare: 0.3,
    /** Per radian away from the side the mark suggests. */
    preferred: 25,
    /** Per radian away from above-right, the conventional reading side, where nothing else decides. */
    reading: 2,
    /**
     * A seat round a bar's value end where the face itself offers a direct seat: Blabber offers the
     * value-face centre first and the ring only as an escape.
     */
    escape: 300,
};

/** A place a caption may stand: its box, its direction and gap from the mark, how its lines align. */
interface Seat {
    box: Box;
    angle: number;
    gap: number;
    align: NotePlacement['align'];
    /** A direct seat past a bar's value face, with the leader it always draws. */
    direct?: NoteLeader;
    escape?: boolean;
    /** A seat on the mark: no leader, no gap cost, its own boxes not charged. */
    inside?: readonly Box[];
    /** The fill the caption stands on, where the seat is on the mark's paint. */
    fill?: string;
}

/**
 * The side a bar's value face looks toward, from its body: the face a note on the bar's end names, an
 * edge of no width across the bar. Undefined for any other target.
 */
function valueDirection(target: NoteTarget, body: Box | undefined): Point | undefined {
    if (!body || target.shape !== 'rect' || (target.rx > 0 && target.ry > 0)) return undefined;
    const dx = target.x - (body.x + body.width / 2);
    const dy = target.y - (body.y + body.height / 2);
    if (target.rx === 0 && Math.abs(dx) > 1e-6) return { x: Math.sign(dx), y: 0 };
    if (target.ry === 0 && Math.abs(dy) > 1e-6) return { x: 0, y: Math.sign(dy) };
    return undefined;
}

/** How far past a bar's value face a direct seat stands, in font sizes (Blabber's bar routes). */
const FACE_REACHES = [0.9, 1.5, 2.5, 4, 6, 8];
/** The clear gap between a caption and the leader that leaves it, in px. */
const PORT_GAP = 2.5;

/**
 * Blabber's direct routes for a caption on a bar's value: the caption past the value face, centred on
 * it and free to slide aside as far as its own edge, with a straight leader from the caption to the
 * face's centre. A vertical bar's caption is centred over the face, a horizontal bar's beside it.
 */
function faceSeats(
    target: NoteTarget, label: { width: number; height: number }, forward: Point, fontSize: number, canvas: Box,
): Seat[] {
    const vertical = forward.x === 0;
    const sign = vertical ? forward.y : forward.x;
    const face = { x: target.x, y: target.y };
    const extent = vertical ? label.width : label.height;
    const centre = vertical ? face.x : face.y;
    const lo = vertical ? canvas.x : canvas.y;
    const hi = lo + (vertical ? canvas.width : canvas.height);
    const fitShift = Math.max(lo + extent / 2, Math.min(hi - extent / 2, centre)) - centre;
    const edgeSlide = Math.max(0, extent / 2 - Math.min(6, extent / 4));
    const seats: Seat[] = [];
    for (const reach of FACE_REACHES.map((multiple) => multiple * fontSize)) {
        const slides = new Set([fitShift, ...[0, -0.5, 0.5, -1, 1].map((fraction) => fraction * reach),
            ...[-1, -0.5, 0.5, 1].map((fraction) => fraction * edgeSlide)]);
        for (const slide of slides) {
            const box: Box = vertical
                ? { x: face.x - label.width / 2 + slide, y: sign < 0 ? face.y - reach - label.height : face.y + reach, ...label }
                : { x: sign < 0 ? face.x - reach - label.width : face.x + reach, y: face.y - label.height / 2 + slide, ...label };
            const from = vertical
                ? { x: Math.max(box.x + 0.5, Math.min(box.x + box.width - 0.5, face.x)), y: sign < 0 ? box.y + box.height + PORT_GAP : box.y - PORT_GAP }
                : { x: sign < 0 ? box.x + box.width + PORT_GAP : box.x - PORT_GAP, y: Math.max(box.y + 0.5, Math.min(box.y + box.height - 0.5, face.y)) };
            seats.push({
                box, angle: Math.atan2(forward.y, forward.x), gap: reach, align: vertical ? 'center' : sign < 0 ? 'right' : 'left',
                direct: { from, to: face },
            });
        }
    }
    return seats;
}

/**
 * How near a mark that is not its own may stand before the caption could be read as naming it: two
 * thirds of a line, between 6 and 12 px.
 */
function associationMargin(height: number): number {
    return Math.max(6, Math.min(12, height * 0.65));
}

function textAlign(angle: number): NotePlacement['align'] {
    const cos = Math.cos(angle);
    return cos > 0.38 ? 'left' : cos < -0.38 ? 'right' : 'center';
}

/** How far a leader runs straight out from the side it names before it turns, in font sizes; at least 6 px. */
const ELBOW_REACH = 0.7;
/** A leader that meets a side at more than this from square to it (60°) runs out square first. */
const GRAZING_COS = 0.5;

/**
 * A leader that leaves `to`, on a side whose outward normal is `normal` (one axis), square to it. A
 * caption straight out from the side is joined by one straight run. Otherwise the leader runs out a
 * stub to an elbow and turns there: on toward a caption beyond the elbow; straight across into the
 * caption's near edge where the caption spans the elbow (a caption below a bar's end, under it); or
 * square again, along and then into its side, where it does not — never back along the mark's edge.
 */
function squareLeader(to: Point, normal: Point, box: Box, reach: number): NoteLeader {
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const along = (centre.x - to.x) * normal.x + (centre.y - to.y) * normal.y;
    const across = Math.abs((centre.x - to.x) * normal.y - (centre.y - to.y) * normal.x);
    if (along >= reach && across <= along * 0.27) return { from: portToward(box, to), to };
    const elbow = { x: to.x + normal.x * reach, y: to.y + normal.y * reach };
    // Where the caption's near edge lies past the elbow, the leader turns toward it from there.
    const near = normal.x !== 0
        ? (normal.x > 0 ? box.x - elbow.x : elbow.x - (box.x + box.width))
        : (normal.y > 0 ? box.y - elbow.y : elbow.y - (box.y + box.height));
    if (near >= 0) return { from: portToward(box, elbow), to, elbows: [elbow] };
    if (normal.x !== 0) {
        if (box.x <= elbow.x && elbow.x <= box.x + box.width) {
            return { from: { x: elbow.x, y: centre.y > elbow.y ? box.y - PORT_GAP : box.y + box.height + PORT_GAP }, to, elbows: [elbow] };
        }
        const side = elbow.x < box.x ? box.x - PORT_GAP : box.x + box.width + PORT_GAP;
        const from = { x: side, y: centre.y };
        return { from, to, elbows: [{ x: elbow.x, y: centre.y }, elbow] };
    }
    if (box.y <= elbow.y && elbow.y <= box.y + box.height) {
        return { from: { x: centre.x > elbow.x ? box.x - PORT_GAP : box.x + box.width + PORT_GAP, y: elbow.y }, to, elbows: [elbow] };
    }
    const side = elbow.y < box.y ? box.y - PORT_GAP : box.y + box.height + PORT_GAP;
    return { from: { x: centre.x, y: side }, to, elbows: [{ x: centre.x, y: elbow.y }, elbow] };
}

/**
 * The leader from a caption to its mark, leaving the mark square to the side it names. A bar's value
 * face (`forward`, the way it looks) is named at its centre and left along the bar. Any other
 * rectangle is met at its outline, and left square to the side it meets where a straight leader
 * would graze it. A dot or a point is met straight.
 */
function leaderTo(target: NoteTarget, box: Box, forward: Point | undefined, reach: number): NoteLeader {
    if (forward) return squareLeader({ x: target.x, y: target.y }, forward, box, reach);
    const from = portToward(box, target);
    const to = rimPoint(target, from);
    if (target.shape !== 'rect' || target.rx <= 0 || target.ry <= 0) return { from, to };
    const on = (a: number, b: number) => Math.abs(a - b) < 0.5;
    const nx = on(to.x, target.x + target.rx) ? 1 : on(to.x, target.x - target.rx) ? -1 : 0;
    const ny = on(to.y, target.y + target.ry) ? 1 : on(to.y, target.y - target.ry) ? -1 : 0;
    // A corner is left diagonally, which grazes neither side.
    if ((nx === 0) === (ny === 0)) return { from, to };
    const length = Math.hypot(from.x - to.x, from.y - to.y) || 1;
    if (((from.x - to.x) * nx + (from.y - to.y) * ny) / length >= GRAZING_COS) return { from, to };
    return squareLeader(to, { x: nx, y: ny }, box, reach);
}

const sameBox = (a: Box, b: Box): boolean =>
    Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

export function placeNote(input: PlaceNoteInput): NotePlacement {
    const { target, label, plot, canvas } = input;
    const obstacles = input.obstacles ?? [];
    const segments = input.segments ?? [];
    const leaderAllowed = input.connector !== 'none';
    const margin = associationMargin(label.height);
    const fontSize = input.fontSize ?? 11;
    // Only what stands near the ring can touch a seat: the rest is left out of every test.
    const reach = Math.max(label.width, label.height) + Math.max(GAPS[GAPS.length - 1], 8 * fontSize) + Math.max(target.rx, target.ry) + 4;
    const near = (box: Box) => Math.abs(box.x + box.width / 2 - target.x) <= reach + box.width / 2
        && Math.abs(box.y + box.height / 2 - target.y) <= reach + box.height / 2;
    const nearObstacles = obstacles.filter((obstacle) => near(obstacle.box));
    const nearSegments = segments.filter((segment) => near({
        x: Math.min(segment.a.x, segment.b.x), y: Math.min(segment.a.y, segment.b.y),
        width: Math.abs(segment.b.x - segment.a.x), height: Math.abs(segment.b.y - segment.a.y),
    }));
    // Faint marks — dimmed, or cells under a halo — can still be read as the one named.
    const marks = nearObstacles.filter((obstacle) => obstacle.kind !== 'text');

    // A note on a bar's value: the value face first, the ring round the end only as an escape.
    const forward = leaderAllowed ? valueDirection(target, input.body) : undefined;
    const seats: Seat[] = forward ? faceSeats(target, label, forward, fontSize, canvas) : [];
    for (const room of input.inside ?? []) {
        const box = { x: room.point.x - label.width / 2, y: room.point.y - label.height / 2, width: label.width, height: label.height };
        if (room.fits(box)) seats.push({ box, angle: 0, gap: 0, align: 'center', inside: room.own ?? [], ...(room.fill ? { fill: room.fill } : {}) });
    }
    for (const angle of input.insideOnly ? [] : DIRECTIONS) {
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        for (const gap of GAPS) {
            seats.push({
                box: seatBox(target, label.width, label.height, ux, uy, gap), angle, gap, align: textAlign(angle),
                ...(forward ? { escape: true } : {}),
            });
        }
    }

    let best: NotePlacement | undefined;
    for (const seat of seats) {
        const { box, angle, gap } = seat;
        // A direct seat may stand past the plot in the paper the chart keeps, as Blabber's does.
        let cost = COST.canvas * overflow(box, canvas, 1) + (seat.direct ? 0 : COST.plot * overflow(box, plot));
        if (seat.escape) cost += COST.escape;
        if (seat.inside) cost += COST.inside;
        if (best && cost >= best.cost) continue;
        let textCover = 0;
        for (const obstacle of nearObstacles) {
            if (seat.inside?.some((own) => sameBox(own, obstacle.box))) continue;
            const area = overlapArea(box, obstacle.box);
            if (obstacle.kind === 'text') textCover += area;
            cost += COST.area[obstacle.kind] * area;
        }
        if (input.body && !seat.inside) cost += COST.area.mark * overlapArea(box, input.body);
        for (const segment of nearSegments) if (segmentCrossesBox(segment.a, segment.b, box)) cost += COST.cut;
        if (best && cost >= best.cost) continue;
        let drawn: NotePlacement['leader'];
        let ambiguous = false;
        if (seat.direct) drawn = seat.direct;
        else if (seat.inside) { /* on the mark: no leader, nothing to be ambiguous with */ }
        else {
            // Another mark about as near as its own makes the caption ambiguous without a leader.
            const own = targetGap(target, box);
            ambiguous = marks.some((mark) => boxDistance(box, mark.box) < own + margin);
            if (leaderAllowed && (gap > MAX_UNLED_GAP || ambiguous)) {
                drawn = leaderTo(target, box, forward, Math.max(6, ELBOW_REACH * fontSize));
            }
            cost += COST.gapLinear * gap + COST.gapSquare * gap * gap;
        }
        if (drawn) {
            const runs = leaderSegments(drawn);
            const length = runs.reduce((sum, run) => sum + Math.hypot(run.a.x - run.b.x, run.a.y - run.b.y), 0);
            cost += COST.leaderFixed + COST.elbow * (drawn.elbows?.length ?? 0) + COST.leaderLength * length
                + COST.leaderReach * Math.max(0, length - COMFORTABLE_REACH) ** 2;
            if (length < MIN_LEADER && !seat.direct) cost += COST.stub;
            for (const run of runs) {
                for (const obstacle of nearObstacles) if (segmentCrossesBox(run.a, run.b, obstacle.box)) cost += COST.leaderCross;
                for (const segment of nearSegments) if (segmentsCross(run.a, run.b, segment.a, segment.b)) cost += COST.leaderCross;
            }
        } else if (ambiguous) {
            // Without a leader to say which, a caption between two marks names neither.
            cost += COST.stub * 2;
        }
        if (!seat.direct && !seat.inside) {
            if (input.preferredAngle !== undefined) cost += COST.preferred * angularDistance(angle, input.preferredAngle);
            cost += COST.reading * angularDistance(angle, -Math.PI / 4);
        }
        if (!best || cost < best.cost) {
            best = {
                box, align: seat.align, ...(drawn ? { leader: drawn } : {}), angle, gap, cost,
                covers: { text: textCover, offCanvas: overflow(box, canvas, 1) > 0 },
                ...(seat.inside ? { inside: true } : {}),
                ...(seat.fill ? { insideFill: seat.fill } : {}),
            };
        }
    }
    // An anchor that offers only seats on its mark, none of which fit, places nothing.
    return best ?? { box: { x: target.x, y: target.y, width: 0, height: 0 }, align: 'center', angle: 0, gap: 0, cost: Infinity };
}
