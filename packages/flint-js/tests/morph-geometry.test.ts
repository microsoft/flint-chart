import { describe, expect, it } from 'vitest';
import { planMorph, type MorphItem, type MorphScene, type Point } from '../src/interactive/morph';
import { morphValueChannels } from '../src/vegalite/interactions/scene-motion';

const GOALS = [['England', 20], ['France', 20], ['Argentina', 18], ['Belgium', 13], ['Spain', 13]] as const;
const TOTAL = GOALS.reduce((sum, [, goals]) => sum + goals, 0);
const CENTRE = { x: 200, y: 150 };

const bars = (valueChannel: 'x' | 'y' = 'y'): MorphScene => ({
    fields: ['Team'],
    items: GOALS.map(([team, goals], index): MorphItem => ({
        type: 'rect',
        datum: { Team: team },
        valueChannel,
        source: { bar: team },
        values: valueChannel === 'y'
            ? { x: 40 + index * 40, y: 270 - goals * 10, width: 30, height: goals * 10, fill: '#4c78a8' }
            : { x: 40, y: 40 + index * 40, width: goals * 10, height: 30, fill: '#4c78a8' },
    })),
});

const pie = (): MorphScene => {
    let at = 0;
    return {
        fields: ['Team'],
        items: GOALS.map(([team, goals]): MorphItem => {
            const startAngle = at;
            at += (goals / TOTAL) * 2 * Math.PI;
            return {
                type: 'arc',
                datum: { Team: team },
                valueChannel: 'theta',
                source: { wedge: team },
                values: { ...CENTRE, startAngle, endAngle: at, innerRadius: 0, outerRadius: 110, fill: '#f58518' },
            };
        }),
    };
};

const rose = (): MorphScene => ({
    fields: ['Team'],
    items: GOALS.map(([team, goals], index): MorphItem => ({
        type: 'arc',
        datum: { Team: team },
        valueChannel: 'radius',
        values: {
            ...CENTRE,
            startAngle: (index / GOALS.length) * 2 * Math.PI,
            endAngle: ((index + 1) / GOALS.length) * 2 * Math.PI,
            innerRadius: 0,
            outerRadius: goals * 5,
            fill: '#f58518',
        },
    })),
});

const area = (points: readonly Point[]): number =>
    points.reduce((sum, [x, y], index) => {
        const [nx, ny] = points[(index + 1) % points.length]!;
        return sum + (x * ny - nx * y);
    }, 0) / 2;

const steps = Array.from({ length: 41 }, (_, index) => index / 40);

describe('a mark morph across a change of chart', () => {
    it('pairs a bar with its wedge by the identity both charts share, and names what it draws', () => {
        const plan = planMorph(bars(), pie())!;
        expect(plan.shapes).toHaveLength(GOALS.length);
        expect(plan.drawn.size).toBe(GOALS.length * 2);
    });

    it('starts on the bar and ends on the wedge', () => {
        const shape = planMorph(bars(), pie())!.shapes[0]!;
        const start = shape.points(0);
        expect(Math.min(...start.map(([x]) => x))).toBeCloseTo(40);
        expect(Math.max(...start.map(([x]) => x))).toBeCloseTo(70);
        expect(Math.min(...start.map(([, y]) => y))).toBeCloseTo(70);
        expect(Math.max(...start.map(([, y]) => y))).toBeCloseTo(270);
        const end = shape.points(1);
        const reach = end.map(([x, y]) => Math.hypot(x - CENTRE.x, y - CENTRE.y));
        expect(Math.max(...reach)).toBeCloseTo(110);
        expect(Math.min(...reach)).toBeCloseTo(0);
        const sweep = (20 / TOTAL) * 2 * Math.PI;
        for (const [x, y] of end.filter((_, index) => reach[index]! > 1)) {
            const angle = (Math.atan2(x - CENTRE.x, CENTRE.y - y) + 2 * Math.PI) % (2 * Math.PI);
            expect(angle).toBeLessThanOrEqual(sweep + 1e-6);
        }
    });

    it('gathers the bars into one straight column at the halfway point, then bends it without a jump', () => {
        const shapes = planMorph(bars(), pie())!.shapes;
        const half = shapes.flatMap((shape) => shape.points(0.5));
        const xs = half.map(([x]) => x);
        expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(60);
        for (const shape of shapes) {
            const before = shape.points(0.5);
            const after = shape.points(0.5 + 1e-6);
            before.forEach(([x, y], index) => {
                expect(after[index]![0]).toBeCloseTo(x, 2);
                expect(after[index]![1]).toBeCloseTo(y, 2);
            });
        }
    });

    it('runs the same path backwards from a pie to bars', () => {
        const forward = planMorph(bars(), pie())!.shapes[2]!;
        const backward = planMorph(pie(), bars())!.shapes[2]!;
        for (const t of [0.1, 0.4, 0.75]) {
            backward.points(t).forEach(([x, y], index) => {
                expect(x).toBeCloseTo(forward.points(1 - t)[index]![0], 6);
                expect(y).toBeCloseTo(forward.points(1 - t)[index]![1], 6);
            });
        }
    });

    it.each([
        ['vertical bars to a pie', () => bars('y'), pie],
        ['horizontal bars to a pie', () => bars('x'), pie],
        ['vertical bars to a rose', () => bars('y'), rose],
        ['horizontal bars to a rose', () => bars('x'), rose],
        ['a pie to a rose', pie, rose],
    ])('never turns an outline inside out: %s', (_, from, to) => {
        for (const shape of planMorph(from(), to())!.shapes) {
            const sign = Math.sign(area(shape.points(0)));
            for (const t of steps) expect(Math.sign(area(shape.points(t))) * sign).toBeGreaterThanOrEqual(0);
        }
    });

    it('moves wedges about their shared centre between two polar charts', () => {
        const shape = planMorph(pie(), rose())!.shapes[0]!;
        const reach = shape.points(0.5).map(([x, y]) => Math.hypot(x - CENTRE.x, y - CENTRE.y));
        expect(Math.min(...reach)).toBeCloseTo(0);
    });

    it('leaves items whose key several items hold on both sides unpaired', () => {
        const strip = (fill: string): MorphScene => ({
            fields: ['Confederation'],
            items: ['UEFA', 'UEFA', 'CONMEBOL'].map((confederation, index) => ({
                type: 'symbol', datum: { Confederation: confederation }, values: { x: index * 10, y: 0, size: 64, fill },
            })),
        });
        const shapes = planMorph(strip('#000000'), strip('#ffffff'))!.shapes;
        expect(shapes).toHaveLength(5);
        expect(shapes.filter((shape) => shape.opacity(0.5) === 1)).toHaveLength(1);
    });

    it('does not morph charts that share no identity', () => {
        expect(planMorph(bars(), { fields: ['Year'], items: [] })).toBeUndefined();
    });
});

const SALES = [['Q1', 'North', 40], ['Q1', 'South', 30], ['Q1', 'East', 20], ['Q2', 'North', 50], ['Q2', 'South', 25], ['Q2', 'East', 35]] as const;
const bar = (quarter: string, region: string, x: number, y: number, width: number, height: number): MorphItem =>
    ({ type: 'rect', valueChannel: 'y', datum: { Quarter: quarter, Region: region }, values: { x, y, width, height, fill: '#4c78a8' } });
const grouped = (): MorphScene => ({
    fields: ['Quarter', 'Region'],
    items: SALES.map(([quarter, region, sales], index) => bar(quarter, region, (quarter === 'Q1' ? 20 : 120) + (index % 3) * 25, 200 - sales * 2, 22, sales * 2)),
});
const stacked = (): MorphScene => {
    const base: Record<string, number> = { Q1: 200, Q2: 200 };
    return {
        fields: ['Quarter', 'Region'],
        items: SALES.map(([quarter, region, sales]) => {
            base[quarter] -= sales * 2;
            return bar(quarter, region, quarter === 'Q1' ? 30 : 130, base[quarter]!, 50, sales * 2);
        }),
    };
};
const box = (points: readonly Point[]) => ({
    x: [Math.min(...points.map(([x]) => x)), Math.max(...points.map(([x]) => x))] as const,
    y: [Math.min(...points.map(([, y]) => y)), Math.max(...points.map(([, y]) => y))] as const,
});
const apart = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
    Math.min(a.x[1], b.x[1]) - Math.max(a.x[0], b.x[0]) <= 0.5 || Math.min(a.y[1], b.y[1]) - Math.max(a.y[0], b.y[0]) <= 0.5;

describe('bars between side by side and stacked', () => {
    it('rise to their stacked places before they slide together', () => {
        const shapes = planMorph(grouped(), stacked())!.shapes;
        const halfway = box(shapes[1]!.points(0.5));
        expect(halfway.x[0]).toBeCloseTo(45);
        expect(halfway.y[0]).toBeCloseTo(stacked().items[1]!.values.y as number);
    });

    it('slide apart before they drop to the baseline', () => {
        const shapes = planMorph(stacked(), grouped())!.shapes;
        const halfway = box(shapes[1]!.points(0.5));
        expect(halfway.x[0]).toBeCloseTo(45);
        expect(halfway.y[0]).toBeCloseTo(stacked().items[1]!.values.y as number);
    });

    it.each([['grouped to stacked', grouped, stacked], ['stacked to grouped', stacked, grouped]])('never sweep through each other: %s', (_, from, to) => {
        const shapes = planMorph(from(), to())!.shapes;
        for (const t of steps) {
            const boxes = shapes.map((shape) => box(shape.points(t)));
            boxes.forEach((a, index) => boxes.slice(index + 1).forEach((b) => expect(apart(a, b)).toBe(true)));
        }
    });

    it('move in one stage between two charts that keep their bars apart the same way', () => {
        const reordered: MorphScene = { ...grouped(), items: [...grouped().items].reverse().map((item, index) => ({ ...item, values: { ...item.values, x: 20 + index * 25 } })) };
        const shape = planMorph(grouped(), reordered)!.shapes[0]!;
        const half = box(shape.points(0.5));
        const start = box(shape.points(0));
        const end = box(shape.points(1));
        expect(half.x[0]).toBeCloseTo((start.x[0] + end.x[0]) / 2);
    });
});

describe('bars into a pie per panel', () => {
    const centres = { Q1: 100, Q2: 300 } as const;
    const pies = (): MorphScene => {
        const at: Record<string, number> = { Q1: 0, Q2: 0 };
        const totals = { Q1: 90, Q2: 110 };
        return {
            fields: ['Quarter', 'Region'],
            items: SALES.map(([quarter, region, sales]): MorphItem => {
                const startAngle = at[quarter]!;
                at[quarter] += (sales / totals[quarter]) * 2 * Math.PI;
                return {
                    type: 'arc', valueChannel: 'theta', datum: { Quarter: quarter, Region: region },
                    values: { x: centres[quarter], y: 150, startAngle, endAngle: at[quarter], innerRadius: 0, outerRadius: 60, fill: '#f58518' },
                };
            }),
        };
    };

    it('curls each panel\'s bars into that panel\'s pie', () => {
        const shapes = planMorph(grouped(), pies())!.shapes;
        SALES.forEach(([quarter], index) => {
            const end = shapes[index]!.points(1);
            const centre = centres[quarter];
            for (const [x, y] of end) expect(Math.hypot(x - centre, y - 150)).toBeLessThanOrEqual(60.01);
        });
        for (const quarter of ['Q1', 'Q2']) {
            const xs = SALES.flatMap(([q], index) => (q === quarter ? shapes[index]!.points(0.5).map(([x]) => x) : []));
            expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(30);
        }
    });
});

describe('many items and one', () => {
    const totals = (): MorphScene => ({
        fields: ['Quarter'],
        items: (['Q1', 'Q2'] as const).map((quarter) => {
            const height = SALES.filter(([q]) => q === quarter).reduce((sum, [, , sales]) => sum + sales * 2, 0);
            return { type: 'rect', valueChannel: 'y', datum: { Quarter: quarter }, values: { x: quarter === 'Q1' ? 30 : 130, y: 200 - height, width: 50, height, fill: '#4c78a8' } };
        }),
    });

    it('merges each quarter\'s segments into its total, leaving one copy drawn at the end', () => {
        const plan = planMorph(stacked(), totals())!;
        expect(plan.shapes).toHaveLength(SALES.length);
        const end = plan.shapes.map((shape) => box(shape.points(1)));
        expect(end[0]).toEqual(end[1]);
        expect(plan.shapes.map((shape) => shape.opacity(1))).toEqual([1, 0, 0, 1, 0, 0]);
        expect(plan.shapes.every((shape) => shape.opacity(0.5) === 1)).toBe(true);
    });

    it('splits a total into its segments, the copies arriving first', () => {
        const plan = planMorph(totals(), stacked())!;
        expect(plan.shapes.map((shape) => shape.opacity(0))).toEqual([1, 0, 0, 1, 0, 0]);
        expect(plan.shapes.every((shape) => shape.opacity(1) === 1)).toBe(true);
    });
});

describe('columns and rows', () => {
    it('squash onto their baseline, travel, and grow along the new axis, as boxes while they shrink and grow', () => {
        const shapes = planMorph(bars('y'), bars('x'))!.shapes;
        for (const shape of shapes) {
            const low = box(shape.points(1 / 3));
            expect(low.y[1] - low.y[0]).toBeLessThanOrEqual(2.001);
            expect(low.y[1]).toBeCloseTo(270);
            const high = box(shape.points(2 / 3));
            expect(high.x[1] - high.x[0]).toBeLessThanOrEqual(2.001);
            expect(high.x[0]).toBeCloseTo(40);
            for (const t of steps.filter((step) => step <= 1 / 3 || step >= 2 / 3)) {
                const points = shape.points(t);
                const b = box(points);
                expect(Math.abs(area(points))).toBeCloseTo((b.x[1] - b.x[0]) * (b.y[1] - b.y[0]), 3);
            }
        }
    });
});

describe('bars into a radar', () => {
    const radar = (): MorphScene => ({
        fields: ['Team'],
        items: GOALS.map(([team, goals], index): MorphItem => {
            const angle = (index / GOALS.length) * 2 * Math.PI;
            const reach = goals * 4;
            return {
                type: 'symbol', valueChannel: 'radius', centre: [CENTRE.x, CENTRE.y], datum: { Team: team },
                values: { x: CENTRE.x + reach * Math.sin(angle), y: CENTRE.y - reach * Math.cos(angle), size: 30, fill: '#4c78a8' },
            };
        }),
    });

    it('lays the bars along one curling row at their own heights and ends each on its point', () => {
        const shapes = planMorph(bars(), radar())!.shapes;
        GOALS.forEach(([, goals], index) => {
            const angle = (index / GOALS.length) * 2 * Math.PI;
            const end = box(shapes[index]!.points(1));
            const centre = [(end.x[0] + end.x[1]) / 2, (end.y[0] + end.y[1]) / 2];
            expect(Math.hypot(centre[0]! - (CENTRE.x + goals * 4 * Math.sin(angle)), centre[1]! - (CENTRE.y - goals * 4 * Math.cos(angle)))).toBeLessThan(1);
        });
        // Halfway the row stands straight, each point as high as its bar was long.
        const heights = shapes.map((shape) => Math.min(...shape.points(0.5).map(([, y]) => y)));
        heights.slice(1).forEach((height, index) => expect(height).toBeGreaterThanOrEqual(heights[index]! - 0.5));
        expect(heights[GOALS.length - 1]! - heights[0]!).toBeGreaterThan(50);
    });
});

describe('the channel a mark draws its value along', () => {
    const q = (field: string) => ({ field, type: 'quantitative' });
    const n = (field: string) => ({ field, type: 'nominal' });
    it.each([
        ['a column', { mark: 'bar', encoding: { x: n('Team'), y: q('Goals') } }, { rect: 'y' }],
        ['a horizontal bar', { mark: 'bar', encoding: { y: n('Team'), x: q('Goals') } }, { rect: 'x' }],
        ['a histogram', { mark: 'bar', encoding: { x: { ...q('Goals'), bin: true }, y: { aggregate: 'count', type: 'quantitative' } } }, { rect: 'y' }],
        ['a Gantt bar', { mark: 'bar', encoding: { y: n('Task'), x: { field: 'Start', type: 'temporal' }, x2: { field: 'End' } } }, { rect: 'x' }],
        ['a pie', { mark: { type: 'arc' }, encoding: { theta: q('Goals'), color: n('Team') } }, { arc: 'theta' }],
        ['a rose', { mark: 'arc', encoding: { theta: n('Team'), radius: q('Goals') } }, { arc: 'radius' }],
        ['a layered bar', { encoding: { y: q('Goals') }, layer: [{ mark: 'bar', encoding: { x: n('Team') } }, { mark: 'text' }] }, { rect: 'y' }],
    ])('%s', (_, spec, expected) => {
        expect(morphValueChannels(spec)).toEqual(expected);
    });
});
