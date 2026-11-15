import { describe, expect, it } from 'vitest';
import { assembleVegaLite, assembleECharts, assembleChartjs } from '../src';
import { readsAsSnapshots, readsAsCalendarRun, chronologicalOrder } from '../src/core/decisions';
import { calendarLabels, crowdedCalendarLabels } from '../src/core/calendar-labels';
import { inferVisCategory } from '../src/core/semantic-types';
import { contrastRatio, sampleRampBins } from '../src/core/theme/presence';

const months = (start: string, count: number, step = 1) => {
    const [y, m] = start.split('-').map(Number);
    return Array.from({ length: count }, (_, i) => {
        const total = m - 1 + i * step;
        return `${y + Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
    });
};

const bars = (values: unknown[], semanticType: string | undefined, chartType = 'Bar Chart', x: any = 'when') => ({
    data: { values: values.map((when, i) => ({ when, v: 10 + i })) },
    semantic_types: { ...(semanticType ? { when: semanticType } : {}), v: 'Quantity' },
    chart_spec: { chartType, encodings: { x, y: 'v' }, baseSize: { width: 360, height: 220 } },
}) as any;

describe('dates read as snapshots', () => {
    it('reads few dates, or sparse calendar dates, as snapshots', () => {
        expect(readsAsSnapshots(['2025-07', '2025-12'])).toBe(true);
        expect(readsAsSnapshots([2022, 2023, 2024])).toBe(true);
        // Ten months over five years fill a sixth of them.
        expect(readsAsSnapshots(months('2020-01', 10, 6).filter((_, i) => i !== 3).concat(['2020-02', '2020-03']))).toBe(true);
    });

    it('reads a regular run of time as time, at its own cadence', () => {
        expect(readsAsSnapshots(months('2024-01', 24))).toBe(false);
        const weeks = Array.from({ length: 20 }, (_, i) => new Date(Date.UTC(2024, 0, 1) + i * 7 * 864e5).toISOString().slice(0, 10));
        expect(readsAsSnapshots(weeks)).toBe(false);
        expect(readsAsSnapshots(months('2000-01', 60, 3).filter((_, i) => i % 2 === 0))).toBe(false);
        expect(readsAsSnapshots(['2025-07'])).toBe(false);
    });

    it('draws few dates on a banded chart as discrete bands, and keeps a line on a time scale', () => {
        const bar = assembleVegaLite(bars(['2025-07', '2025-12'], 'YearMonth'));
        expect(bar.encoding.x.type).toBe('ordinal');
        const heatmap = assembleVegaLite({
            data: { values: months('2025-01', 6).flatMap((when) => ['A', 'B'].map((k, i) => ({ when, k, v: i }))) },
            semantic_types: { when: 'YearMonth', k: 'Category', v: 'Quantity' },
            chart_spec: { chartType: 'Heatmap', encodings: { x: 'when', y: 'k', color: 'v' } },
        } as any);
        expect(heatmap.encoding.x.type).toBe('ordinal');
        const line = assembleVegaLite(bars([2019, 2020, 2021, 2022, 2023], 'Year', 'Line Chart'));
        expect(line.encoding.x.type).toBe('temporal');
        const long = assembleVegaLite(bars(months('2024-01', 24), 'YearMonth'));
        expect(long.encoding.x.type).toBe('temporal');
    });

    it('reads a whole run of months or quarters as a calendar run; days, years and gapped runs stay time', () => {
        expect(readsAsCalendarRun(months('2025-01', 12))).toBe(true);
        expect(readsAsCalendarRun(months('2024-01', 8, 3))).toBe(true);
        expect(readsAsCalendarRun(months('2025-01', 12).filter((_, i) => i !== 5))).toBe(false);
        expect(readsAsCalendarRun([2020, 2021, 2022, 2023, 2024])).toBe(false);
        const days = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10));
        expect(readsAsCalendarRun(days)).toBe(false);
        expect(readsAsCalendarRun(months('2020-01', 60))).toBe(false);
    });

    it('tiles a heatmap over a whole run of months as equal cells on every backend', () => {
        const input = {
            data: { values: months('2025-01', 12).flatMap((when) => ['A', 'B', 'C'].map((k, i) => ({ when, k, v: i }))) },
            semantic_types: { when: 'YearMonth', k: 'Category', v: 'Quantity' },
            chart_spec: { chartType: 'Heatmap', encodings: { x: 'when', y: 'k', color: 'v' }, baseSize: { width: 400, height: 200 } },
        } as any;
        const vl = assembleVegaLite(input);
        expect(vl.encoding.x.type).toBe('ordinal');
        expect(vl.config.axisX.labelExpr).toContain('[["Jan","2025"],["Feb"]');
        expect(assembleECharts(input).xAxis.type).toBe('category');
        // A gap in the run keeps the time scale, and with it the hole.
        const gapped = { ...input, data: { values: input.data.values.filter((r: any) => r.when !== '2025-06') } };
        expect(assembleVegaLite(gapped).encoding.x.type).toBe('temporal');
        // A bar chart over the same run stays a run of time.
        expect(assembleVegaLite(bars(months('2025-01', 12), 'YearMonth')).encoding.x.type).toBe('temporal');
    });

    it('lets an explicit type win', () => {
        const pinned = assembleVegaLite(bars(['2025-07', '2025-12'], 'YearMonth', 'Bar Chart', { field: 'when', type: 'temporal' }));
        expect(pinned.encoding.x.type).toBe('temporal');
    });

    it('offers the time scale one choice away, recommending the bands', () => {
        const spec = assembleVegaLite(bars(['2025-07', '2025-12'], 'YearMonth'));
        const option = spec._options.find((o: any) => o.key === 'xAxisType');
        expect(option).toMatchObject({ applicable: true, value: 'nominal' });
        const forced = assembleVegaLite({ ...bars(['2025-07', '2025-12'], 'YearMonth'), chart_spec: {
            ...bars(['2025-07', '2025-12'], 'YearMonth').chart_spec, chartProperties: { xAxisType: 'temporal' },
        } });
        expect(forced.encoding.x.type).toBe('temporal');
    });

    it('agrees across backends', () => {
        const input = bars(['2025-12', '2025-07', '2025-09'], 'YearMonth');
        expect(assembleVegaLite(input).encoding.x.sort).toEqual(['2025-07', '2025-09', '2025-12']);
        expect(assembleECharts(input).xAxis.data).toEqual(['2025-07', '2025-09', '2025-12']);
        expect(assembleChartjs(input).data.labels).toEqual(['2025-07', '2025-09', '2025-12']);
    });
});

describe('untyped date strings', () => {
    it('reads only spellings every engine reads alike as dates', () => {
        expect(inferVisCategory(['2025-07-01', '2025-12-01'])).toBe('temporal');
        expect(inferVisCategory(['2025-07', '2025-12'])).toBe('temporal');
        expect(inferVisCategory(['Jan 15, 2025', 'Mar 3, 2025'])).toBe('temporal');
        expect(inferVisCategory(['2025-July', '2025-Dec'])).toBe('nominal');
        expect(inferVisCategory(['Jul 2025', 'Dec 2025'])).toBe('nominal');
    });

    it('keeps "2025-July" labels as categories in the order given', () => {
        const spec = assembleVegaLite(bars(['2025-July', '2025-Dec'], undefined));
        expect(spec.encoding.x.type).toBe('nominal');
        expect(spec.data.values.map((r: any) => r.when)).toEqual(['2025-July', '2025-Dec']);
    });

    it('reads a full date in a non-ISO spelling once, into ISO', () => {
        const spec = assembleVegaLite(bars(['Jan 15, 2025', 'Mar 3, 2025'], undefined));
        expect(spec.data.values.map((r: any) => r.when)).toEqual(['2025-01-15', '2025-03-03']);
    });
});

describe('dates in time order', () => {
    it('orders dates whatever order the rows come in', () => {
        expect(chronologicalOrder(['2025-12', '2025-07', '2025-07', '2025-09'])).toEqual(['2025-07', '2025-09', '2025-12']);
        expect(chronologicalOrder([2024, 2022])).toEqual(['2022', '2024']);
        expect(chronologicalOrder(['2025-07', 'later'])).toBeUndefined();
    });

    it('orders years on every backend', () => {
        const input = bars([2024, 2022, 2023], 'Year');
        expect(assembleECharts(input).xAxis.data).toEqual(['2022', '2023', '2024']);
        expect(assembleChartjs(input).data.labels).toEqual(['2022', '2023', '2024']);
        expect(assembleVegaLite(input).encoding.x.sort).toBe('ascending');
    });
});

describe('calendar names', () => {
    it('states the year where the row opens and where a new year begins', () => {
        expect(calendarLabels(['2025-11', '2025-12', '2026-01', '2026-02'])).toEqual([['Nov', '2025'], ['Dec'], ['Jan', '2026'], ['Feb']]);
        expect(calendarLabels(['2024-12-31', '2025-06-30'])).toEqual([['Dec 31', '2024'], ['Jun 30', '2025']]);
    });

    it('states every year where the axis does not run in time order, and leaves years and times alone', () => {
        expect(calendarLabels(['2025-12', '2025-07'])).toEqual([['Dec', '2025'], ['Jul', '2025']]);
        expect(calendarLabels(['2022', '2023'])).toBeUndefined();
        expect(calendarLabels(['2025-01-01T10:00:00Z', '2025-01-01T11:00:00Z'])).toBeUndefined();
        expect(calendarLabels(['North', 'South'])).toBeUndefined();
    });

    it('is taken only where the names as written do not stand flat', () => {
        const values = ['2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31'];
        expect(crowdedCalendarLabels(values, 200, 11)).toBeUndefined();
        expect(crowdedCalendarLabels(values, 48, 11)).toEqual([['Mar 31', '2024'], ['Jun 30'], ['Sep 30'], ['Dec 31']]);
        expect(crowdedCalendarLabels(values, 10, 11)).toBeUndefined();
    });

    it('names crowded snapshots by the calendar in Vega-Lite and ECharts, and spells roomy ones as written', () => {
        const ends = ['2023-03-31', '2023-06-30', '2023-09-30', '2023-12-31', '2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31'];
        const narrow = { ...bars(ends, 'Date'), chart_spec: { ...bars(ends, 'Date').chart_spec, baseSize: { width: 360, height: 200 } } };
        const vl = assembleVegaLite(narrow);
        expect(vl.encoding.x.type).toBe('ordinal');
        expect(JSON.stringify(vl.config.axisX.labelExpr)).toContain('Mar 31');
        const ec = assembleECharts(narrow);
        expect(ec.xAxis.axisLabel.formatter('2024-03-31')).toBe('Mar 31\n2024');
        expect(ec.xAxis.axisLabel.formatter('2024-06-30')).toBe('Jun 30');

        const roomy = assembleVegaLite(bars(['2025-07', '2025-12'], 'YearMonth'));
        expect(roomy.config.axisX.labelExpr).toBeUndefined();
    });

    it('prints discrete dates in ECharts as written, not shifted by the local timezone', () => {
        const ec = assembleECharts(bars(['2025-01', '2025-02'], 'YearMonth'));
        const format = ec.xAxis.axisLabel?.formatter;
        expect(typeof format === 'function' ? format('2025-01') : '2025-01').toBe('2025-01');
    });
});

describe('colours from a ramp, one per bin', () => {
    const economist = ['#dcebf2', '#a7ccdd', '#6ba7c6', '#2f88ae', '#006ba2', '#003f5c'];

    it('takes the middle of each bin, the faint end trimmed to the surface contrast', () => {
        const two = sampleRampBins(economist, 2, '#ffffff', 1.5);
        expect(two).toHaveLength(2);
        expect(contrastRatio(two[0], '#ffffff')).toBeGreaterThanOrEqual(1.5);
        expect(contrastRatio(two[1], '#ffffff')).toBeGreaterThan(contrastRatio(two[0], '#ffffff'));
        for (const colour of sampleRampBins(economist, 8, '#ffffff', 1.5)) {
            expect(contrastRatio(colour, '#ffffff')).toBeGreaterThanOrEqual(1.5);
        }
    });

    it('gives two compared years readable colours, the later year the stronger', () => {
        const rows = ['Asia', 'Europe'].flatMap((region) => [2011, 2025].map((year, i) => ({ region, year, score: 5 + i })));
        const spec = assembleVegaLite({
            data: { values: rows },
            semantic_types: { region: 'Category', year: 'Year', score: 'Score' },
            chart_spec: { chartType: 'Grouped Bar Chart', encodings: { x: 'region', y: 'score', color: 'year' } },
            theme_spec: 'economist',
        } as any);
        const range = (spec.encoding?.color ?? spec.layer?.[0]?.encoding?.color)?.scale?.range as string[];
        expect(range).toHaveLength(2);
        expect(contrastRatio(range[0], '#ffffff')).toBeGreaterThanOrEqual(1.5);
        expect(contrastRatio(range[1], '#ffffff')).toBeGreaterThan(contrastRatio(range[0], '#ffffff'));
    });
});
