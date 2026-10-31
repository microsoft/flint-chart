import { describe, expect, it } from 'vitest';
import { planFrames, type FramePart } from '../src/interactive/morph';

const part = (key: string | undefined, x: number, y: number, size = 10, morphed = false): FramePart =>
    ({ key, x, y, width: size, height: size, morphed });

describe('frame parts across a change of chart', () => {
    it('moves and resizes a shared part, drawn by the last chart until halfway and the next after', () => {
        const poses = planFrames([part('title', 0, 0, 10)], [part('title', 20, 10, 30)], false);
        expect(poses(0).from[0]).toEqual({ dx: 0, dy: 0, width: 10, height: 10, opacity: 1 });
        expect(poses(0).to[0]!.opacity).toBe(0);
        const half = poses(0.5);
        expect(half.from[0]!.opacity).toBe(0);
        expect(half.to[0]).toEqual({ dx: -10, dy: -5, width: 20, height: 20, opacity: 1 });
        expect(poses(1).to[0]).toEqual({ dx: 0, dy: 0, width: 30, height: 30, opacity: 1 });
    });

    it('lets parts without a counterpart leave and arrive in the quarters while marks morph', () => {
        const poses = planFrames([part('old', 0, 0)], [part('new', 0, 0)], true);
        expect(poses(0.25).from[0]!.opacity).toBe(0);
        expect(poses(0.5).to[0]!.opacity).toBe(0);
        expect(poses(1).to[0]!.opacity).toBe(1);
    });

    it('cross-fades parts without a counterpart over the whole change when no marks morph', () => {
        const half = planFrames([part(undefined, 0, 0)], [part(undefined, 0, 0)], false)(0.5);
        expect(half.from[0]!.opacity).toBe(0.5);
        expect(half.to[0]!.opacity).toBe(0.5);
    });

    it('leaves the marks a morph draws to the morph', () => {
        const poses = planFrames([part('mark', 0, 0, 10, true)], [part('mark', 5, 5, 10, true)], true);
        expect(poses(0).from[0]!.opacity).toBe(0);
        expect(poses(1).to[0]!.opacity).toBe(0);
    });

    it('turns and resizes a label about its anchor the shorter way, its two copies trading places', () => {
        const label = (angle: number, fontSize: number, x: number): FramePart =>
            ({ ...part('axis-label|bottom|Cat 01', x, 0), text: { x, y: 100, angle, fontSize } });
        const poses = planFrames([label(0, 10, 50)], [label(270, 8, 40)], false);
        const half = poses(0.5);
        expect(half.from[0]!.text).toEqual({ x: 45, y: 100, angle: -45, fontSize: 9 });
        expect(half.to[0]!.text).toEqual(half.from[0]!.text);
        expect(poses(0.25).from[0]!.opacity).toBe(0.75);
        expect(poses(0.25).to[0]!.opacity).toBe(0.25);
    });

    it('draws a label that only moves with one copy at a time', () => {
        const label = (x: number): FramePart => ({ ...part('axis-label|bottom|Cat 01', x, 0), text: { x, y: 100, angle: 0, fontSize: 10 } });
        const poses = planFrames([label(50)], [label(40)], false);
        expect(poses(0.25).from[0]!.opacity).toBe(1);
        expect(poses(0.25).to[0]!.opacity).toBe(0);
    });

    it('pairs repeated keys in order', () => {
        const poses = planFrames([part('tick', 0, 0), part('tick', 0, 10)], [part('tick', 0, 20), part('tick', 0, 30)], false);
        expect(poses(0.4).from.map((pose) => pose.dy)).toEqual([8, 8]);
    });
});
