// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import {
    clusterColor,
    convexHull,
    defaultEnclosureShape,
    distinctRegionColor,
    enclosureOutline,
    neutralInk,
    overlapArea,
    placeEnclosureCaption,
    placeRegionCaption,
    readableShade,
    regionSpan,
    ringDistance,
    type EnclosedMark,
    type NoteObstacle,
} from '../src/core/annotation';
import { contrastRatio } from '../src/core/theme/presence';

/** Regions and enclosures after Blabber's `region` and `enclose`, simplified for speed. */

const PLOT = { x: 0, y: 0, width: 400, height: 300 };
const CANVAS = { x: -60, y: -40, width: 520, height: 380 };
const LAYOUT = { lines: ['Recession'], width: 60, height: 18 };
const dot = (x: number, y: number, r = 4): EnclosedMark => ({ role: 'point', box: { x: x - r, y: y - r, width: 2 * r, height: 2 * r }, radius: r });
const inside = (ring: readonly { x: number; y: number }[], p: { x: number; y: number }) => {
    let within = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) within = !within;
    }
    return within;
};

describe('a region\'s stretch', () => {
    const banded = {
        position: (value: unknown) => ({ A: 20, B: 60, C: 100, D: 140 } as Record<string, number>)[String(value)],
        range: [0, 160] as const,
        index: (value: unknown) => ['A', 'B', 'C', 'D'].indexOf(String(value)),
        step: 40,
    };
    it('covers whole bands of adjacent categories, and refuses ones with a gap', () => {
        expect(regionSpan(['B', 'C'], banded).span).toEqual([40, 120]);
        expect(regionSpan(['A', 'C'], banded).problem).toContain('not next to each other');
        expect(regionSpan(['E'], banded).problem).toContain('not a category');
    });
    it('reads a continuous stretch with open ends at the axis\'s ends, cut to the plot', () => {
        const axis = { position: (value: unknown) => 300 - Number(value) * 3, range: [300, 0] as const, ends: [0, 100] as const };
        expect(regionSpan([20, 50], axis).span).toEqual([150, 240]);
        expect(regionSpan([null, 50], axis).span).toEqual([150, 300]);
        expect(regionSpan([80, 200], axis).span).toEqual([0, 60]);
        expect(regionSpan([20], axis).problem).toContain('two bounds');
    });
});

describe('a region\'s caption', () => {
    it('centres a period\'s caption in the stretch where no series crosses it', () => {
        const region = { x: 100, y: 0, width: 100, height: 300 };
        const placed = placeRegionCaption({ region, axes: { x: true, y: false }, layouts: [LAYOUT], plot: PLOT, canvas: CANVAS })!;
        expect(placed.box.x + placed.box.width / 2).toBeCloseTo(150, 6);
        expect(placed.box.y + placed.box.height / 2).toBeCloseTo(150, 6);
        expect(placed.leaders).toEqual([]);
    });
    it('sets a period\'s caption on the roomier side of the series it crosses, clear of the line', () => {
        const region = { x: 100, y: 0, width: 100, height: 300 };
        const vertices = [{ x: 90, y: 60 }, { x: 150, y: 80 }, { x: 210, y: 70 }];
        const segments = [{ a: vertices[0], b: vertices[1] }, { a: vertices[1], b: vertices[2] }];
        const placed = placeRegionCaption({ region, axes: { x: true, y: false }, layouts: [LAYOUT], plot: PLOT, canvas: CANVAS, vertices, segments })!;
        expect(placed.box.y).toBeGreaterThan(80);
    });
    it('keeps a box\'s caption inside it where it is clear, and stands outside on a leader where it is not', () => {
        const region = { x: 100, y: 100, width: 120, height: 80 };
        const clear = placeRegionCaption({ region, axes: { x: true, y: true }, layouts: [LAYOUT], plot: PLOT, canvas: CANVAS })!;
        expect(overlapArea(clear.box, region)).toBe(clear.box.width * clear.box.height);
        const crowd: NoteObstacle[] = [];
        for (let x = 100; x < 220; x += 8) for (let y = 100; y < 180; y += 8) crowd.push({ kind: 'mark', box: { x, y, width: 6, height: 6 } });
        const crowded = placeRegionCaption({ region, axes: { x: true, y: true }, layouts: [LAYOUT], plot: PLOT, canvas: CANVAS, obstacles: crowd })!;
        expect(overlapArea(crowded.box, region)).toBe(0);
        expect(crowded.leaders).toHaveLength(1);
    });
});

describe('an enclosure\'s outline', () => {
    it('defaults to a rectangle round bars and cells, a hull round other marks', () => {
        expect(defaultEnclosureShape([{ role: 'bar', box: { x: 0, y: 0, width: 10, height: 50 } }])).toBe('rect');
        expect(defaultEnclosureShape([dot(10, 10), { role: 'bar', box: { x: 0, y: 0, width: 10, height: 50 } }])).toBe('hull');
    });
    it('hulls points 6 px out, every point inside, the stroke kept in the plot', () => {
        const marks = [dot(50, 50), dot(80, 40), dot(70, 90), dot(60, 70)];
        const outline = enclosureOutline(marks, 'hull', PLOT)!;
        for (const mark of marks) expect(inside(outline.ring, { x: mark.box.x + 4, y: mark.box.y + 4 })).toBe(true);
        const edge = enclosureOutline([dot(2, 2), dot(30, 30)], 'hull', PLOT)!;
        // Half the stroke in from the plot's edge, so the whole stroke is drawn.
        expect(edge.bounds.x).toBeGreaterThanOrEqual(0.75);
        expect(edge.bounds.y).toBeGreaterThanOrEqual(0.75);
    });
    it('follows a stretch of line along its own vertices', () => {
        const stretch: EnclosedMark = { role: 'other', box: { x: 50, y: 50, width: 100, height: 100 }, points: [{ x: 50, y: 150 }, { x: 150, y: 50 }] };
        const outline = enclosureOutline([stretch], 'hull', PLOT)!;
        expect(inside(outline.ring, { x: 60, y: 60 })).toBe(false);
        expect(inside(outline.ring, { x: 100, y: 100 })).toBe(true);
    });
    it('outlines one bar by its border, several by their union, taking in a bar between them', () => {
        const a: EnclosedMark = { role: 'bar', box: { x: 10, y: 100, width: 20, height: 200 } };
        const c: EnclosedMark = { role: 'bar', box: { x: 70, y: 150, width: 20, height: 150 } };
        const between = { x: 40, y: 50, width: 20, height: 250 };
        expect(enclosureOutline([a], 'rect', PLOT)!.bounds).toEqual(a.box);
        const group = enclosureOutline([a, c], 'rect', PLOT, [between])!;
        expect(group.bounds.y).toBeLessThanOrEqual(51);
    });
    it('keeps a cell outline\'s stroke inside the cells', () => {
        const cells: EnclosedMark[] = [{ role: 'cell', box: { x: 0, y: 0, width: 40, height: 40 } }, { role: 'cell', box: { x: 40, y: 0, width: 40, height: 40 } }];
        expect(enclosureOutline(cells, 'rect', PLOT)!.bounds).toEqual({ x: 0.75, y: 0.75, width: 78.5, height: 38.5 });
    });
    it('rings one point 2 px clear, and fits an ellipse round a cloud', () => {
        const one = enclosureOutline([dot(100, 100, 5)], 'circle', PLOT)!;
        expect(one.bounds.width / 2).toBeCloseTo(5 + 2 + 0.75, 6);
        const cloud = [dot(100, 100), dot(140, 120), dot(180, 140), dot(120, 115)];
        const ellipse = enclosureOutline(cloud, 'ellipse', PLOT)!;
        for (const mark of cloud) expect(inside(ellipse.ring, { x: mark.box.x + 4, y: mark.box.y + 4 })).toBe(true);
    });
    it('follows a slice\'s own wedge, whichever way its angles run', () => {
        const slice = (start: number, end: number) => ({
            role: 'other' as const, box: { x: 160, y: 0, width: 80, height: 160 },
            sector: { cx: 160, cy: 160, inner: 50, outer: 156, start, end },
        });
        const forward = enclosureOutline([slice(0, Math.PI / 6)], 'hull', PLOT)!;
        const reversed = enclosureOutline([slice(Math.PI / 6, 0)], 'hull', PLOT)!;
        expect(reversed.d).toBe(forward.d);
        // The outer arc bows outward: its middle sits on the outer radius, past the chord.
        expect(forward.d).toMatch(/A 156 156 0 0 1/);
        expect(inside(forward.ring, { x: 160 + 100 * Math.sin(Math.PI / 12), y: 160 - 100 * Math.cos(Math.PI / 12) })).toBe(true);
    });
});

describe('an enclosure\'s caption', () => {
    it('stands beside one outline with no leader, clear of its line', () => {
        const outline = enclosureOutline([dot(150, 150), dot(180, 170)], 'hull', PLOT)!;
        const placed = placeEnclosureCaption({ outlines: [outline], layouts: [LAYOUT], plot: PLOT, canvas: CANVAS })!;
        expect(placed.leaders).toEqual([]);
        expect(ringDistance(outline.ring, placed.box)).toBeGreaterThan(4);
    });
    it('leads to each of two or three outlines, to all with connect "all", and to none with "none"', () => {
        const groups = [[dot(60, 200), dot(80, 210)], [dot(300, 220), dot(320, 200)]].map((marks) => enclosureOutline(marks, 'hull', PLOT)!);
        expect(placeEnclosureCaption({ outlines: groups, layouts: [LAYOUT], plot: PLOT, canvas: CANVAS })!.leaders).toHaveLength(2);
        expect(placeEnclosureCaption({ outlines: groups, layouts: [LAYOUT], plot: PLOT, canvas: CANVAS, connect: 'none' })!.leaders).toHaveLength(0);
        const four = [50, 130, 210, 290].map((x) => enclosureOutline([dot(x, 200)], 'hull', PLOT)!);
        expect(placeEnclosureCaption({ outlines: four, layouts: [LAYOUT], plot: PLOT, canvas: CANVAS })!.leaders).toHaveLength(0);
        expect(placeEnclosureCaption({ outlines: four, layouts: [LAYOUT], plot: PLOT, canvas: CANVAS, connect: 'all' })!.leaders).toHaveLength(4);
    });
});

describe('annotation colours', () => {
    it('picks a region wash far from the marks\' colours, and a caption shade that reads', () => {
        expect(distinctRegionColor(['#4c78a8'])).not.toBe('#4c78a8');
        const second = distinctRegionColor(['#4c78a8', distinctRegionColor(['#4c78a8'])]);
        expect(second).not.toBe(distinctRegionColor(['#4c78a8']));
        expect(contrastRatio(readableShade('#f58518'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(readableShade('#f58518', '#1a1a1a'), '#1a1a1a')).toBeGreaterThanOrEqual(4.5);
    });
    it('outlines a cluster in its shared colour, any other group in a neutral grey that reads on the page', () => {
        expect(clusterColor([{ fill: '#e45756' }, { fill: '#e45756' }, { fill: '#4c78a8' }])).toBe(readableShade('#e45756'));
        expect(clusterColor([{ fill: '#e45756' }, { fill: '#4c78a8' }])).toBe(neutralInk());
        expect(neutralInk()).toBe('#5a5a5a');
        expect(contrastRatio(neutralInk('#1a1a1a'), '#1a1a1a')).toBeGreaterThanOrEqual(4.5);
    });
});

describe('cost', () => {
    const time = (run: () => void, repeat = 10) => {
        run();
        const started = performance.now();
        for (let index = 0; index < repeat; index++) run();
        return (performance.now() - started) / repeat;
    };
    const cloud = (count: number) => Array.from({ length: count }, (_, index) => dot((index * 37) % 400, (index * 91) % 300, 3));
    const obstacles = (count: number): NoteObstacle[] => cloud(count).map((mark) => ({ kind: 'mark', box: mark.box }));
    it('hulls and captions 5,000 points among 20,000 marks in a few milliseconds', () => {
        const marks = cloud(5_000);
        const ink = obstacles(20_000);
        const ms = time(() => {
            const outline = enclosureOutline(marks, 'hull', PLOT)!;
            placeEnclosureCaption({ outlines: [outline], layouts: [LAYOUT, { lines: ['Recession', 'era'], width: 40, height: 32 }], plot: PLOT, canvas: CANVAS, obstacles: ink });
        });
        expect(ms).toBeLessThan(40);
    });
    it('fits an ellipse round 5,000 points and outlines 20 groups quickly', () => {
        const marks = cloud(5_000);
        expect(time(() => enclosureOutline(marks, 'ellipse', PLOT))).toBeLessThan(40);
        const groups = Array.from({ length: 20 }, (_, index) => cloud(250).map((mark) => ({ ...mark, box: { ...mark.box, x: mark.box.x / 20 + index * 20 } })));
        expect(time(() => {
            const outlines = groups.map((group) => enclosureOutline(group, 'hull', PLOT)!);
            placeEnclosureCaption({ outlines, layouts: [LAYOUT], plot: PLOT, canvas: CANVAS, connect: 'all', obstacles: obstacles(5_000) });
        })).toBeLessThan(60);
    });
    it('seats a region caption among 20,000 marks and lines quickly', () => {
        const ink = obstacles(20_000);
        const segments = Array.from({ length: 5_000 }, (_, index) => ({ a: { x: index * 0.08, y: 150 + Math.sin(index) * 40 }, b: { x: (index + 1) * 0.08, y: 150 + Math.sin(index + 1) * 40 } }));
        const vertices = segments.map((segment) => segment.a);
        const region = { x: 100, y: 100, width: 120, height: 80 };
        expect(time(() => {
            placeRegionCaption({ region, axes: { x: true, y: true }, layouts: [LAYOUT], plot: PLOT, canvas: CANVAS, obstacles: ink, segments });
            placeRegionCaption({ region: { x: 100, y: 0, width: 80, height: 300 }, axes: { x: true, y: false }, layouts: [LAYOUT], plot: PLOT, canvas: CANVAS, obstacles: ink, segments, vertices });
        })).toBeLessThan(60);
    });
    it('keeps a convex hull of a million points under a second', () => {
        const points = Array.from({ length: 1_000_000 }, (_, index) => ({ x: (index * 7919) % 1000, y: (index * 104729) % 777 }));
        expect(time(() => convexHull(points), 1)).toBeLessThan(1_000);
    });
});
