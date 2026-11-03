// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import {
    balanceNote,
    noteSize,
    noteStyle,
    overlapArea,
    placeNote,
    segmentCrossesBox,
    segmentsCross,
    targetGap,
    wrapNote,
    type NoteObstacle,
    type NoteTarget,
} from '../src/core/annotation';

/**
 * A note that names one mark stands beside it — no card — clear of the marks and text around it,
 * and joined to it by a short leader to its visible outline only where it is not plainly beside it.
 */

const PLOT = { x: 0, y: 0, width: 400, height: 300 };
const CANVAS = { x: -60, y: -30, width: 500, height: 380 };
const LABEL = { width: 70, height: 16 };
const dot = (x: number, y: number, r = 5): NoteTarget => ({ shape: 'circle', x, y, rx: r, ry: r });
const asObstacle = (target: NoteTarget): NoteObstacle => ({
    kind: 'mark', box: { x: target.x - target.rx, y: target.y - target.ry, width: target.rx * 2, height: target.ry * 2 },
});

describe('a note on one mark', () => {
    it('stands just beside a lone mark, with no leader', () => {
        const target = dot(200, 150);
        const placed = placeNote({ target, label: LABEL, plot: PLOT, canvas: CANVAS });
        expect(placed.leader).toBeUndefined();
        expect(targetGap(target, placed.box)).toBeLessThanOrEqual(10);
        expect(overlapArea(placed.box, { x: 195, y: 145, width: 10, height: 10 })).toBe(0);
    });

    it('stays clear of its neighbours, and draws a leader to the outline where it must stand off', () => {
        const target = dot(200, 150);
        const neighbours = [dot(200, 128), dot(222, 150), dot(178, 150), dot(200, 172), dot(220, 130), dot(180, 130), dot(220, 170), dot(180, 170)];
        const placed = placeNote({ target, label: LABEL, plot: PLOT, canvas: CANVAS, obstacles: neighbours.map(asObstacle) });
        for (const neighbour of neighbours) expect(overlapArea(placed.box, asObstacle(neighbour).box)).toBe(0);
        expect(placed.leader).toBeDefined();
        const tip = placed.leader!.to;
        expect(Math.hypot(tip.x - target.x, tip.y - target.y)).toBeCloseTo(target.rx, 5);
    });

    it('turns inward at the plot\'s edge rather than running off it', () => {
        const placed = placeNote({ target: dot(395, 10), label: LABEL, plot: PLOT, canvas: CANVAS });
        expect(placed.box.x + placed.box.width).toBeLessThanOrEqual(PLOT.x + PLOT.width);
        expect(placed.box.y).toBeGreaterThanOrEqual(PLOT.y);
        expect(placed.align).toBe('right');
    });

    it('stands at a bar\'s value end, the side the bar suggests', () => {
        const bar: NoteTarget = { shape: 'rect', x: 100, y: 200, rx: 15, ry: 100 };
        const placed = placeNote({ target: bar, label: LABEL, plot: PLOT, canvas: CANVAS, preferredAngle: -Math.PI / 2 });
        expect(placed.box.y + placed.box.height).toBeLessThanOrEqual(100);
        expect(placed.align).toBe('center');
    });

    it('centres a caption on a bar\'s value past its face, joined to the face\'s centre (Blabber\'s bar routes)', () => {
        const body = { x: 180, y: 120, width: 40, height: 180 };
        const top: NoteTarget = { shape: 'rect', x: 200, y: 120, rx: 20, ry: 0 };
        const up = placeNote({ target: top, body, label: LABEL, plot: PLOT, canvas: CANVAS, preferredAngle: -Math.PI / 2, fontSize: 11 });
        expect(up.box.x + up.box.width / 2).toBeCloseTo(200, 6);
        expect(up.box.y + up.box.height).toBeLessThan(120);
        expect(up.align).toBe('center');
        expect(up.leader?.to).toEqual({ x: 200, y: 120 });
        // Across: past the end, level with the bar.
        const row = { x: 0, y: 140, width: 220, height: 20 };
        const end: NoteTarget = { shape: 'rect', x: 220, y: 150, rx: 0, ry: 10 };
        const across = placeNote({ target: end, body: row, label: LABEL, plot: PLOT, canvas: CANVAS, preferredAngle: 0, fontSize: 11 });
        expect(across.box.x).toBeGreaterThan(220);
        expect(across.box.y + across.box.height / 2).toBeCloseTo(150, 6);
        expect(across.align).toBe('left');
        expect(across.leader?.to).toEqual({ x: 220, y: 150 });
    });

    it('stands in the paper above the plot rather than over the bar where the plot has no room left', () => {
        const body = { x: 340, y: 2, width: 50, height: 298 };
        const end: NoteTarget = { shape: 'rect', x: 365, y: 2, rx: 25, ry: 0 };
        const placed = placeNote({ target: end, body, label: LABEL, plot: PLOT, canvas: CANVAS, preferredAngle: -Math.PI / 2, fontSize: 11 });
        expect(overlapArea(placed.box, body)).toBe(0);
        expect(placed.box.y + placed.box.height).toBeLessThan(2);
        expect(placed.box.y).toBeGreaterThanOrEqual(CANVAS.y);
    });

    it('does not cut a line where a clear seat stands as near', () => {
        const target = dot(200, 150);
        const segments = [{ a: { x: 0, y: 140 }, b: { x: 400, y: 140 } }, { a: { x: 0, y: 160 }, b: { x: 400, y: 160 } }];
        const placed = placeNote({ target, label: LABEL, plot: PLOT, canvas: CANVAS, segments });
        for (const segment of segments) expect(segmentCrossesBox(segment.a, segment.b, placed.box)).toBe(false);
    });

    it('never draws a leader when the note asks for none', () => {
        const target = dot(200, 150);
        const crowd = [dot(200, 128), dot(222, 150), dot(178, 150), dot(200, 172)].map(asObstacle);
        expect(placeNote({ target, label: LABEL, plot: PLOT, canvas: CANVAS, obstacles: crowd, connector: 'none' }).leader).toBeUndefined();
    });

    it('keeps its leader from crossing a leader drawn before it', () => {
        const target = dot(200, 150);
        const crowd = [dot(200, 128), dot(222, 150), dot(178, 150), dot(200, 172)].map(asObstacle);
        // An earlier note's leader fences off every seat to the right and below.
        const earlier = [{ a: { x: 206, y: 156 }, b: { x: 300, y: 156 } }, { a: { x: 206, y: 156 }, b: { x: 206, y: 260 } }];
        const placed = placeNote({ target, label: LABEL, plot: PLOT, canvas: CANVAS, obstacles: crowd, segments: earlier });
        expect(placed.leader).toBeDefined();
        for (const segment of earlier) expect(segmentsCross(placed.leader!.from, placed.leader!.to, segment.a, segment.b)).toBe(false);
    });

    it('stands haloed over tiled cells, with a leader, since the cell beside it could be read as the one named', () => {
        const cell: NoteTarget = { shape: 'rect', x: 100, y: 100, rx: 20, ry: 20 };
        const tiles: NoteObstacle[] = [];
        for (let x = 0; x < 400; x += 40) {
            for (let y = 0; y < 300; y += 40) if (x !== 80 || y !== 80) tiles.push({ kind: 'faint', box: { x, y, width: 40, height: 40 } });
        }
        const placed = placeNote({ target: cell, label: LABEL, plot: PLOT, canvas: CANVAS, obstacles: tiles });
        expect(placed.box.x).toBeGreaterThanOrEqual(PLOT.x);
        expect(placed.box.y).toBeGreaterThanOrEqual(PLOT.y);
        expect(placed.leader).toBeDefined();
    });

    it('places among thousands of marks in a few milliseconds', () => {
        const obstacles = Array.from({ length: 4000 }, (_, i) => asObstacle(dot((i * 37) % 400, (i * 91) % 300, 3)));
        const started = performance.now();
        for (let i = 0; i < 20; i++) placeNote({ target: dot(200, 150), label: LABEL, plot: PLOT, canvas: CANVAS, obstacles });
        expect((performance.now() - started) / 20).toBeLessThan(15);
    });
});

describe('a note\'s type', () => {
    it('takes the chart\'s label face a size up, in neutral ink, haloed in the background', () => {
        const style = noteStyle({ font: 'Inter', fontSize: 10, color: '#000', background: '#fafafa' });
        expect(style).toMatchObject({ font: 'Inter', fontSize: 11, color: '#333333', halo: { color: '#fafafa' } });
    });

    it('breaks between words at its width, keeping hard breaks', () => {
        const measure = (text: string) => text.length * 6;
        expect(wrapNote('fastest growth since the merger', 100, measure)).toEqual(['fastest growth', 'since the merger']);
        expect(wrapNote('first\nsecond line', 200, measure)).toEqual(['first', 'second line']);
        const size = noteSize(['fastest growth', 'since the merger'], noteStyle(), measure);
        expect(size.width).toBe(16 * 6 + 4);
    });

    it('breaks evenly, at a phrase\'s end where there is one, and into no more lines than greedy wrapping', () => {
        const measure = (text: string) => text.length * 6;
        expect(wrapNote('ford galaxie 500: most power', 140, measure)).toEqual(['ford galaxie 500: most', 'power']);
        expect(balanceNote('ford galaxie 500: most power', 140, measure)).toEqual(['ford galaxie 500:', 'most power']);
        expect(balanceNote('the fastest growth of any region since the merger', 180, measure))
            .toEqual(['the fastest growth of any', 'region since the merger']);
        expect(balanceNote('short', 140, measure)).toEqual(['short']);
        expect(balanceNote('first line here\nand a second one that runs on and on', 120, measure))
            .toEqual(['first line here', 'and a second one', 'that runs on and on']);
    });
});
