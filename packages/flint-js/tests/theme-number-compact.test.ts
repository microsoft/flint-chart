import { describe, expect, it } from 'vitest';
import { format } from 'd3-format';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import { assembleVegaLite } from '../src';
import { COMPACT_SUFFIXES, DEFAULT_COMPACT_TYPES, compactApplies, compactPrint, formatCompact, type CompactRule } from '../src/core/number-compact';

/** The text Vega draws, by mark role. */
async function drawn(spec: any): Promise<{ ticks: string[]; labels: string[] }> {
    const view = new View(parse(compile(spec).spec), { renderer: 'none' });
    await view.runAsync();
    const ticks: string[] = [];
    const labels: string[] = [];
    const visit = (item: any) => {
        if (item.mark?.marktype === 'text' && item.text != null) {
            const text = [item.text].flat().join(' ');
            if (item.mark.role === 'axis-label') ticks.push(text);
            else if (!String(item.mark.role ?? '').includes('title')) labels.push(text);
        }
        for (const child of item.items ?? []) visit(child);
    };
    visit((view.scenegraph() as any).root);
    view.finalize();
    return { ticks, labels };
}

const ROWS = ['A', 'B', 'C', 'D'].map((K, i) => ({ K, Sales: 120000 * (i + 1) ** 2, People: 1.2e9 / (i + 1), Share: 20 + i, 'Population (m)': 1429 / (i + 1) }));
const house = (compact?: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    ({ id: 'h', label: 'H', annotation: { numberFormat: { ...(compact ? { compact } : {}), ...extra } } }) as any;
const bars = (field: string, semantic: unknown, theme?: unknown) => assembleVegaLite({
    data: { values: ROWS },
    semantic_types: { K: 'Category', [field]: semantic },
    chart_spec: { chartType: 'Bar Chart', encodings: { x: 'K', y: field }, chartProperties: { showValueLabels: true } },
    ...(theme ? { theme_spec: theme } : {}),
} as any) as any;
const numeric = (ticks: string[]) => ticks.filter((t) => /\d/.test(t));

describe('number compaction: the rule', () => {
    const rule: CompactRule = { suffixes: COMPACT_SUFFIXES.short, per: 'scale', threshold: 10000, on: ['axis', 'labels'], types: DEFAULT_COMPACT_TYPES };

    it('prints a ruler in one unit, with as many decimals as its ticks need', () => {
        const print = compactPrint([0, 500000, 1000000, 1500000], rule, 'exact')!;
        expect([0, 500000, 1000000, 1500000].map((v) => formatCompact(v, print, format))).toEqual(['0', '0.5M', '1.0M', '1.5M']);
    });

    it('leaves a set under the threshold as it is', () => {
        expect(compactPrint([1200, 9800], rule, 'exact')).toBeUndefined();
    });

    it('writes each style’s suffixes', () => {
        const at = (style: keyof typeof COMPACT_SUFFIXES, v: number) => formatCompact(v, compactPrint([v], { ...rule, suffixes: COMPACT_SUFFIXES[style] }, 'significant')!, format);
        expect(at('short', 2.5e9)).toBe('2.5B');
        expect(at('upper', 2.5e3 * 10)).toBe('25K');
        expect(at('editorial', 2.5e9)).toBe('2.5bn');
        expect(at('si', 2.5e9)).toBe('2.5G');
    });

    it('applies by semantic type and unit', () => {
        expect(compactApplies({ semanticType: 'Amount', unit: 'USD' }, DEFAULT_COMPACT_TYPES)).toBe(true);
        expect(compactApplies({ semanticType: 'Count' }, DEFAULT_COMPACT_TYPES)).toBe(true);
        expect(compactApplies({ semanticType: 'Percentage' }, DEFAULT_COMPACT_TYPES)).toBe(false);
        expect(compactApplies({ semanticType: 'Year' }, DEFAULT_COMPACT_TYPES)).toBe(false);
        expect(compactApplies({ semanticType: 'Rank' }, DEFAULT_COMPACT_TYPES)).toBe(false);
        // Already counted in millions.
        expect(compactApplies({ semanticType: 'Count', unit: 'm' }, DEFAULT_COMPACT_TYPES)).toBe(false);
        expect(compactApplies({ name: 'Population (m)', semanticType: 'Count' }, DEFAULT_COMPACT_TYPES)).toBe(false);
        expect(compactApplies({ name: 'Debt ($bn)', semanticType: 'Amount' }, DEFAULT_COMPACT_TYPES)).toBe(false);
        // A theme may name its own types, or a family.
        expect(compactApplies({ semanticType: 'Price' }, ['Amount'])).toBe(true);
        expect(compactApplies({ semanticType: 'Count' }, ['Amount'])).toBe(false);
    });
});

describe('number compaction: drawn', () => {
    it('compacts a currency ruler and keeps its sign', async () => {
        const { ticks } = await drawn(bars('Sales', { semanticType: 'Amount', unit: 'USD' }, house({})));
        expect(numeric(ticks)).toContain('$1.0M');
        expect(numeric(ticks)[0]).toBe('$0');
    });

    it('compacts the labels in one unit', async () => {
        const { labels } = await drawn(bars('Sales', 'Amount', house({ on: ['labels'] })));
        expect(labels).toEqual(expect.arrayContaining(['0.12M', '1.92M']));
    });

    it('writes the house’s style, each value its own unit when asked', async () => {
        const { ticks, labels } = await drawn(bars('Sales', 'Amount', house({ style: 'upper', per: 'value' })));
        expect(labels).toEqual(expect.arrayContaining(['120K', '1.92M']));
        expect(numeric(ticks)).toContain('200K');
    });

    it('never compacts a share, or a value already in millions', async () => {
        const share = await drawn(bars('Share', 'Percentage', house({ threshold: 1000 })));
        expect([...share.ticks, ...share.labels].join(' ')).not.toMatch(/\d[kKMB]\b/);
        const millions = await drawn(bars('Population (m)', 'Count', house({ threshold: 1000 })));
        expect([...millions.ticks, ...millions.labels].join(' ')).not.toMatch(/\d[kKMB]\b/);
    });

    it('compacts only where the theme says', async () => {
        const axisOnly = await drawn(bars('People', 'Count', house({ on: ['axis'], style: 'editorial' })));
        expect(numeric(axisOnly.ticks)).toContain('1.0bn');
        expect(axisOnly.labels.join(' ')).not.toContain('bn');
        const never = await drawn(bars('People', 'Count', house({ show: 'never' }, { thousands: 'suffix' })));
        expect(never.labels.join(' ')).not.toMatch(/\d[kMB]\b/);
    });

    it('keeps `thousands: "suffix"` as it was — labels only, each value its own — with B for billions', async () => {
        const { ticks, labels } = await drawn(bars('People', 'Count', house(undefined, { thousands: 'suffix' })));
        expect(labels).toEqual(expect.arrayContaining(['1.2B', '600M']));
        expect(numeric(ticks).join(' ')).not.toMatch(/[MB]\b/);
    });

    it('never writes G for billions, theme or not', async () => {
        const { labels } = await drawn(bars('People', 'Count'));
        expect(labels.join(' ')).not.toContain('G');
        expect(labels).toContain('1.2B');
    });

    it('leaves a chart without a theme otherwise as it was', async () => {
        const { ticks } = await drawn(bars('Sales', 'Amount'));
        expect(numeric(ticks)).toContain('1,000,000');
    });
});

describe('number compaction: precision and collisions', () => {
    const ROWS2 = ['India', 'China', 'US', 'Indonesia'].map((K, i) => ({ K, People: [1428.6e6, 1425.7e6, 339.9e6, 277.5e6][i] }));
    const draw = (theme: unknown) => drawn(assembleVegaLite({
        data: { values: ROWS2 },
        semantic_types: { K: 'Country', People: 'Quantity' },
        chart_spec: { chartType: 'Bar Chart', encodings: { y: 'K', x: 'People' }, chartProperties: { showValueLabels: true } },
        theme_spec: theme,
    } as any) as any);

    it('prints labels at the house’s stated precision, and leaves the ruler its own', async () => {
        const { ticks, labels } = await draw(house({ per: 'value' }, { precision: 'two' }));
        expect(labels).toEqual(expect.arrayContaining(['1.43B', '339.90M']));
        expect(numeric(ticks).some((t) => /\.00B/.test(t))).toBe(false);
    });

    it('compacts a stated rule even where two values print the same; the old suffix leaves them whole', async () => {
        expect((await draw(house({ style: 'lower', per: 'value' }))).labels).toEqual(expect.arrayContaining(['1.43b', '340m']));
        const legacy = await draw(house(undefined, { thousands: 'suffix' }));
        expect(legacy.labels).toEqual(expect.arrayContaining(['1,428,600,000']));
    });
});

describe('number compaction: a value that rounds up to the next unit (#172)', () => {
    const each: CompactRule = { suffixes: COMPACT_SUFFIXES.short, per: 'value', threshold: 1000, on: ['labels'], types: DEFAULT_COMPACT_TYPES };
    const one: CompactRule = { ...each, per: 'scale' };
    const printed = (values: number[], rule: CompactRule) => values.map((v) => formatCompact(v, compactPrint(values, rule, 'significant')!, format));

    it('rolls over to the next unit where rounding reaches a thousand', () => {
        expect(printed([999600, -999600, 999600000, 999499], each)).toEqual(['1M', '−1M', '1B', '999k']);
        expect(printed([999600, 420000, 150000], one)).toEqual(['1M', '0.42M', '0.15M']);
    });

    it('rolls over only where the stated precision rounds there', () => {
        expect(printed([999960], { ...each, decimals: 2 })).toEqual(['999.96k']);
        expect(printed([999960], { ...each, decimals: 0 })).toEqual(['1M']);
    });

    it('draws the same as it measures', async () => {
        const chart = (values: number[], extra: Record<string, unknown>) => drawn(assembleVegaLite({
            data: { values: values.map((revenue, i) => ({ region: 'NSEW'[i], revenue })) },
            semantic_types: { region: 'Category', revenue: 'Amount' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'region' }, y: { field: 'revenue' } }, chartProperties: { showValueLabels: true } },
            ...extra,
        } as any) as any);
        expect((await chart([999600, 420000, 150000], { theme_spec: 'nyt' })).labels).toEqual(expect.arrayContaining(['1M', '420k']));
        expect((await chart([1200000000, 999600000, 999600], {})).labels).toEqual(expect.arrayContaining(['1.2B', '1B', '1M']));
        expect((await chart([999600, 420000, 150000], { theme_spec: house({}) })).labels).toEqual(expect.arrayContaining(['1M', '0.42M']));
    });
});

describe('number compaction: a scale the chart already states', () => {
    it('leaves values the headline says are in millions whole', () => {
        expect(compactApplies({ semanticType: 'Quantity', said: 'Most populous countries, 2023 (millions)' }, DEFAULT_COMPACT_TYPES)).toBe(false);
        expect(compactApplies({ semanticType: 'Amount', said: 'Public debt, $bn' }, DEFAULT_COMPACT_TYPES)).toBe(false);
        expect(compactApplies({ semanticType: 'Count', said: 'Visitors to the park, 2024' }, DEFAULT_COMPACT_TYPES)).toBe(true);
    });
});
