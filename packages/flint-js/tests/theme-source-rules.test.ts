import { describe, expect, it } from 'vitest';
import { assembleVegaLite } from '../src';
import { readCanvasFurniture } from '../src/vegalite/canvas-furniture';

const POP = [['India', 1429], ['China', 1426], ['United States', 340]].map(([Country, P]) => ({ Country, 'Population (m)': P }));
const chart = (source: unknown, theme?: unknown) => assembleVegaLite({
    data: { values: POP },
    semantic_types: { Country: 'Country', 'Population (m)': 'Quantity' },
    chart_spec: { chartType: 'Bar Chart', encodings: { y: 'Country', x: 'Population (m)' }, baseSize: { width: 420, height: 240 }, title: 'Most populous', ...(source !== undefined ? { source } : {}) },
    ...(theme ? { theme_spec: theme } : {}),
} as any) as any;
const texts = (spec: any) => readCanvasFurniture(spec).filter((i: any) => i.text !== undefined);

describe('S1: the source line', () => {
    it('draws nothing when the chart gives no source', () => {
        expect(texts(chart(undefined, { id: 's' }))).toHaveLength(0);
        expect(texts(chart('   '))).toHaveLength(0);
    });

    it('draws the chart’s source with the default lead-in, themed or not, at the foot of the canvas', () => {
        for (const spec of [chart('UN WPP 2024'), chart('UN WPP 2024', { id: 's' })]) {
            const items = texts(spec);
            expect(items.map((i: any) => i.text).join(' ')).toBe('Source: UN WPP 2024');
            expect(items.every((i: any) => typeof i.bottom === 'number' && i.y === undefined)).toBe(true);
            expect((typeof spec.padding === 'object' ? spec.padding.bottom : 0)).toBeGreaterThan(8);
        }
    });

    it('keeps the canvas the size asked for: the line’s room comes out of a plot whose height is stated', () => {
        const columns = (source?: string) => assembleVegaLite({
            data: { values: [2019, 2020, 2021, 2022].map((Year, i) => ({ Year, V: 10 + i })) },
            semantic_types: { Year: 'Year', V: 'Quantity' },
            chart_spec: { chartType: 'Line Chart', encodings: { x: 'Year', y: 'V' }, baseSize: { width: 420, height: 240 }, title: 'A line', ...(source ? { source } : {}) },
            theme_spec: { id: 's' },
        } as any) as any;
        const without = columns();
        const withSource = columns('UN WPP 2024');
        const height = (spec: any) => (typeof spec.height === 'number' ? spec.height : spec.config.view.continuousHeight);
        const pad = (spec: any) => (typeof spec.padding === 'object' ? spec.padding.top + spec.padding.bottom : 2 * (spec.padding ?? 0));
        expect(height(withSource)).toBeLessThan(height(without));
        expect(height(withSource) + pad(withSource)).toBeCloseTo(height(without) + pad(without), 0);
    });

    it('sets the line as the house says: lead-in, weight, side, rule and credit', () => {
        const spec = chart('Gapminder', {
            id: 'bbc', type: { footnote: { size: 12, color: '#555555' } },
            source: { leadIn: 'SOURCE:', leadInWeight: 'bold', rule: { width: 1, color: '#cccccc', dash: [4, 4] }, credit: { text: 'BBC', placement: 'end' } },
        });
        const items = readCanvasFurniture(spec) as any[];
        const lead = items.find((i) => i.text === 'SOURCE:');
        expect(lead.fontWeight).toBe(700);
        expect(lead.fontSize).toBeGreaterThanOrEqual(12);
        expect(lead.color).toBe('#555555');
        expect(items.find((i) => i.text === 'BBC').right).toBeDefined();
        const rule = items.find((i) => i.kind === 'rule');
        expect(rule.dash).toEqual([4, 4]);
        expect(rule.bottom).toBeGreaterThan(lead.bottom);
    });

    it('puts an inline credit after the source, right-aligned when the house says so, and links a source with an href', () => {
        const spec = chart({ text: 'Gapminder.org', href: 'https://gapminder.org' }, { id: 't', source: { align: 'end', credit: { text: '@traffordDataLab' } } });
        const items = texts(spec);
        expect(items.map((i: any) => i.text).join(' ')).toBe('Source: Gapminder.org | @traffordDataLab');
        expect(items.every((i: any) => i.right !== undefined && i.left === undefined)).toBe(true);
        expect(items.every((i: any) => i.href === 'https://gapminder.org')).toBe(true);
    });

    it('wraps a long source onto lines no wider than the block', () => {
        const spec = chart('United Nations, Department of Economic and Social Affairs, Population Division (2024). World Population Prospects 2024, Online Edition.', { id: 'w' });
        const rows = new Set(texts(spec).map((i: any) => i.bottom));
        expect(rows.size).toBeGreaterThan(1);
    });

    it('draws none for a house that leaves the source to its page', () => {
        expect(texts(chart('UN WPP 2024', { id: 'n', source: { show: 'never' } }))).toHaveLength(0);
    });
});

describe('S1: a logo credit at the line’s other end', () => {
    it('draws the credit’s image level with the source, at the other end, in place of its words', () => {
        const spec = assembleVegaLite({
            data: { values: [{ K: 'a', V: 1 }, { K: 'b', V: 2 }] },
            semantic_types: { K: 'Category', V: 'Quantity' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: 'K', y: 'V' }, source: 'Gapminder' },
            theme_spec: { id: 'l', label: 'L', source: { credit: { text: 'BBC', placement: 'end', image: { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="3"/>', width: 60, height: 17 } } } },
        } as any) as any;
        const items = spec.usermeta.flintCanvasFurniture;
        const image = items.find((i: any) => i.kind === 'image');
        expect(image).toBeTruthy();
        expect(image.src.startsWith('data:image/svg+xml')).toBe(true);
        expect(image.right).toBeDefined();
        expect(image.alt).toBe('BBC');
        expect(items.some((i: any) => i.text === 'BBC')).toBe(false);
    });

    it('keeps the words where the credit is not at the other end', () => {
        const spec = assembleVegaLite({
            data: { values: [{ K: 'a', V: 1 }] },
            semantic_types: { K: 'Category', V: 'Quantity' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: 'K', y: 'V' }, source: 'Gapminder' },
            theme_spec: { id: 'l', label: 'L', source: { credit: { text: 'BBC', placement: 'inline', image: { src: 'data:image/png;base64,AA==', width: 60, height: 17 } } } },
        } as any) as any;
        expect(spec.usermeta.flintCanvasFurniture.some((i: any) => i.kind === 'image')).toBe(false);
        expect(spec._theme.report.map((r: any) => r.code)).toContain('credit-image-not-drawn');
    });
});

describe('S1: a lead-in the author already wrote', () => {
    it('is said once', async () => {
        const { withoutLeadIn } = await import('../src/core/source-plan');
        expect(withoutLeadIn('Source: Gapminder', 'Source:')).toBe('Gapminder');
        expect(withoutLeadIn('sources: UN, World Bank', 'Source:')).toBe('UN, World Bank');
        expect(withoutLeadIn('Gapminder', 'Source:')).toBe('Gapminder');
        expect(withoutLeadIn('Source of truth: the ledger', 'Source:')).toBe('Source of truth: the ledger');
        expect(withoutLeadIn('Source: Gapminder', undefined)).toBe('Source: Gapminder');
        expect(withoutLeadIn('Source:', 'Source:')).toBe('Source:');
    });
});
