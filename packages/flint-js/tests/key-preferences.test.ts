import { describe, expect, it } from 'vitest';
import { planKeyLayout, type KeyToLayout } from '../src/core/legend-layout';
import { tableTextMeasurer } from '../src/core/text-width';
import { assembleVegaLite } from '../src/vegalite/assemble';

const style = {
    labelFont: 'Helvetica', labelFontSize: 10, labelFontWeight: 'normal', labelFontStyle: 'normal',
    titleFont: 'Helvetica', titleFontSize: 10, titleFontWeight: 'bold', titleFontStyle: 'normal', padding: 0,
} as const;
const key = (title: string | null, labels: string[]): KeyToLayout => ({
    gradient: false, labels, count: labels.length, title, style: { ...style }, orient: 'top', edges: ['top'], fixed: false, fixedTitle: false,
});
const keys = () => [key(null, ['North', 'South']), key('Tier', ['Gold', 'Silver'])];
const plot = { width: 600, height: 300 };

describe('how several keys stand, as a theme prefers', () => {
    it('stands keys in a row or a stack as asked', () => {
        expect(planKeyLayout(keys(), plot, tableTextMeasurer, { arrangement: 'row' }).edges[0].direction).toBe('horizontal');
        expect(planKeyLayout(keys(), plot, tableTextMeasurer, { arrangement: 'stack' }).edges[0].direction).toBe('vertical');
    });

    it('sets a titled key\'s title as asked', () => {
        const inline = planKeyLayout(keys(), plot, tableTextMeasurer, { arrangement: 'stack', titlePosition: 'inline' });
        const above = planKeyLayout(keys(), plot, tableTextMeasurer, { arrangement: 'stack', titlePosition: 'above' });
        expect(inline.keys[1]?.inlineTitle).toBe(true);
        expect(above.keys[1]?.inlineTitle).toBe(false);
    });

    it('anchors the keys along their edge, and spreads them across the room they leave', () => {
        expect(planKeyLayout(keys(), plot, tableTextMeasurer, { arrangement: 'row', align: 'end' }).edges[0].anchor).toBe('end');
        const together = planKeyLayout(keys(), plot, tableTextMeasurer, { arrangement: 'row' }).edges[0];
        const spread = planKeyLayout(keys(), plot, tableTextMeasurer, { arrangement: 'row', align: 'spread' });
        expect(spread.edges[0].anchor).toBe('start');
        expect(spread.edges[0].gap).toBeGreaterThan(together.gap);
        expect(spread.notes).toEqual([]);
    });

    it('gives way and says why where the keys would overflow', () => {
        const pinned = (index: number) => ({ ...key(null, Array.from({ length: 3 }, (_, entry) => `Long category ${index}-${entry}`)), fixed: true });
        // Too narrow for three keys side by side even with their names wrapped.
        const narrow = planKeyLayout([pinned(0), pinned(1), pinned(2)], { width: 160, height: 600 }, tableTextMeasurer, { arrangement: 'row' });
        expect(narrow.edges.find((edge) => edge.orient === 'top')?.direction).toBe('vertical');
        expect(narrow.notes.some((note) => note.code === 'keys-arrangement-gave-way')).toBe(true);
    });
});

describe('keys sharing an edge, counted in the room they take', () => {
    it('counts a row of large bubbles as the lines it stands, and moves it beside the plot', () => {
        const plain = key('Tier', ['Gold', 'Silver', 'Bronze']);
        const bubbles = (largestSymbol?: number): KeyToLayout => ({ ...key('Size', ['10', '40', '80']), ...(largestSymbol ? { largestSymbol } : {}), edges: ['top', 'right'] });
        const square = { width: 400, height: 400 };
        const small = planKeyLayout([plain, bubbles()], square, tableTextMeasurer, { arrangement: 'stack' });
        const large = planKeyLayout([plain, bubbles(3600)], square, tableTextMeasurer, { arrangement: 'stack' });
        expect(small.keys[1]?.orient).toBe('top');
        expect(large.keys[1]?.orient).toBe('right');
    });
});

describe('a key its author pins to an edge', () => {
    it('stands on that edge in the Vega-Lite it compiles to, not on the right', () => {
        const rows = [600, 528, 46, 45, 1].map((Crew, i) => ({ Stop: i + 1, Crew, Leg: ['A', 'A', 'B', 'C', 'C'][i], longitude: 10 + i * 3, latitude: 35 + i }));
        const spec: any = assembleVegaLite({
            data: { values: rows },
            semantic_types: { Stop: 'Rank', Crew: 'Count', Leg: 'Category', longitude: 'Longitude', latitude: 'Latitude' },
            chart_spec: {
                chartType: 'Map',
                encodings: { longitude: 'longitude', latitude: 'latitude', order: 'Stop',
                    color: { field: 'Leg', legend: { orient: 'bottom' } }, size: { field: 'Crew', legend: { orient: 'bottom' } } },
                canvasSize: { width: 600, height: 540 },
            },
        } as any);
        const orients: string[] = [];
        const walk = (node: any) => {
            for (const channel of ['color', 'size', 'strokeWidth']) {
                const legend = node?.encoding?.[channel]?.legend;
                if (legend && node.encoding[channel].field) orients.push(legend.orient);
            }
            (node?.layer ?? []).forEach(walk);
        };
        walk(spec);
        expect(orients.length).toBeGreaterThan(0);
        expect(new Set(orients)).toEqual(new Set(['bottom']));
    });
});
