// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import { expressionInterpreter } from 'vega-interpreter';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { formatSpecToLabelExpr, formatSpecToVegaExpr } from '../src/vegalite/format';
import { vlApplyLayoutToSpec } from '../src/vegalite/instantiate-spec';

describe('Vega-Lite semantic formatting', () => {
    const layoutContext: any = {
        channelSemantics: {},
        layout: {
            xNominalCount: 0, yNominalCount: 0,
            xContinuousAsDiscrete: 0, yContinuousAsDiscrete: 0,
            xLabel: { fontSize: 10, labelLimit: 100 }, yLabel: { fontSize: 10 },
            titleFontSize: 11, legendFontSize: 10,
            subplotWidth: 480, subplotHeight: 240, truncations: [],
        },
    };

    async function temporalAxis(spec: any, interpreted = false): Promise<{ labels: any[]; gridlines: any[]; ticks: any[] }> {
        const view = new View(parse(compile(spec).spec, undefined, { ast: interpreted }), {
            renderer: 'none',
            ...(interpreted ? { expr: expressionInterpreter } : {}),
        });
        try {
            await view.runAsync();
            const axis = { labels: [] as any[], gridlines: [] as any[], ticks: [] as any[] };
            const roles: Record<string, any[]> = {
                'axis-label': axis.labels, 'axis-grid': axis.gridlines, 'axis-tick': axis.ticks,
            };
            const visit = (item: any): void => {
                const target = roles[item.mark?.role];
                if (target && item.opacity !== 0 && item.datum?.value instanceof Date
                    && (target !== axis.labels || (item.text != null && String(item.text).length > 0))) target.push(item);
                for (const child of item.items ?? []) visit(child);
            };
            visit((view.scenegraph() as any).root);
            return axis;
        } finally {
            view.finalize();
        }
    }

    async function temporalLabels(spec: any): Promise<any[]> {
        return (await temporalAxis(spec)).labels;
    }

    it.each(['Date', 'DateTime', 'YearMonth'])('preserves %s axis labels and tick positions under the expression interpreter', async semanticType => {
        const spending = [
            1.59, 1.64, 1.85, 1.78, 2.06, 2.27, 2.35, 2.44, 2.47, 2.55, 2.52, 2.73,
            2.71, 2.68, 2.85, 3.34, 3.10, 3.02, 3.08, 3.23, 3.32, 3.37, 3.19, 3.31,
            3.27, 3.27, 3.50, 3.80, 4.10, 4.55, 4.92, 5.37,
        ];
        for (const channel of ['x', 'y'] as const) {
            for (const utc of [false, true]) {
                for (const theme of [undefined, 'datawrapper']) {
                    const spec = assembleVegaLite({
                        data: { values: spending.map((Spending, index) => ({
                            Month: `${2024 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}-01T00:00:00Z`,
                            Spending,
                        })) },
                        semantic_types: { Month: semanticType, Spending: 'Quantity' },
                        theme_spec: theme,
                        chart_spec: {
                            chartType: 'Scatter Plot',
                            encodings: {
                                [channel]: { field: 'Month', ...(utc ? { scale: { type: 'utc' } } : {}) },
                                [channel === 'x' ? 'y' : 'x']: { field: 'Spending' },
                            },
                            baseSize: { width: 430, height: 270 },
                        },
                    });
                    const standard = await temporalAxis(spec);
                    const interpreted = await temporalAxis(spec, true);
                    expect(standard.labels.length).toBeGreaterThan(0);
                    expect(interpreted.labels.map(item => [Number(item.datum.value), item.text]))
                        .toEqual(standard.labels.map(item => [Number(item.datum.value), item.text]));
                    for (const role of ['ticks', 'gridlines'] as const) {
                        expect(interpreted[role].map(item => Number(item.datum.value)))
                            .toEqual(standard[role].map(item => Number(item.datum.value)));
                    }
                }
            }
        }
    });

    function leapDayAxis(axis: Record<string, unknown> = {}): any {
        const spec = {
            data: { values: ['2024-02-24', '2024-03-05'].map(date => ({ date })) },
            mark: 'point', width: 480, height: 240,
            encoding: { x: { field: 'date', type: 'temporal', scale: { type: 'utc' }, axis } },
        };
        vlApplyLayoutToSpec(spec, {
            ...layoutContext,
            channelSemantics: { x: { field: 'date', type: 'temporal', semanticAnnotation: { semanticType: 'Date' } } },
        }, []);
        return spec;
    }

    it('formats an arbitrary derived value with semantic affixes', () => {
        expect(formatSpecToVegaExpr(
            { pattern: ',.2f', prefix: '$' },
            'datum.flintSparkAvg',
        )).toBe("'$' + format(datum.flintSparkAvg, ',.2f')");
    });

    it('supports affixes without forcing a number pattern', () => {
        expect(formatSpecToVegaExpr(
            { suffix: ' kg' },
            'datum["weight"]',
        )).toBe("datum[\"weight\"] + ' kg'");
    });

    it('escapes affixes embedded in Vega string literals', () => {
        expect(formatSpecToVegaExpr(
            { pattern: ',.1f', prefix: "owner's ", suffix: '\\unit' },
            'datum.value',
        )).toBe("'owner\\'s ' + format(datum.value, ',.1f') + '\\\\unit'");
    });

    it('applies abbreviation to an arbitrary value expression', () => {
        const expr = formatSpecToVegaExpr(
            { abbreviate: true, prefix: '$' },
            'datum.total',
        );
        expect(expr).toContain("'$' + (abs(datum.total) >= 1e12");
        expect(expr).toContain("format(datum.total / 1e3, '~g') + 'K'");
        expect(expr).toContain("format(datum.total, ',')");
    });

    it('leaves a pure axis pattern to Vega-Lite format', () => {
        expect(formatSpecToLabelExpr({ pattern: ',.2f' })).toBeNull();
        expect(formatSpecToLabelExpr({ pattern: ',.2f', prefix: '$' }))
            .toBe("'$' + format(datum.value, ',.2f')");
    });

    it('prioritizes a year boundary over neighboring day labels', async () => {
        const spec: any = {
            data: { values: ['2024-12-20', '2025-01-10'].map(date => ({ date })) },
            mark: 'point', width: 180, height: 240,
            encoding: { x: { field: 'date', type: 'temporal', scale: { type: 'utc' } } },
        };
        vlApplyLayoutToSpec(spec, {
            ...layoutContext,
            channelSemantics: { x: { field: 'date', type: 'temporal', semanticAnnotation: { semanticType: 'Date' } } },
        }, []);
        const labels = await temporalLabels(spec);
        expect(labels.some(label => label.text === 'Jan 2025' && Number(label.datum.value) === Date.UTC(2025, 0, 1))).toBe(true);
        for (let index = 1; index < labels.length; index++) {
            expect(labels[index].bounds.x1 - labels[index - 1].bounds.x2).toBeGreaterThanOrEqual(0);
        }
    });

    it.each(['x', 'y'] as const)('uses a visible New Year divider instead of repeating start context on %s', async channel => {
        const start = Date.UTC(2023, 11, 31, 18);
        const end = Date.UTC(2024, 0, 1, 12);
        const spec: any = {
            data: { values: [start, end].map(date => ({ date })) },
            mark: 'point', width: 600, height: 400,
            encoding: { [channel]: { field: 'date', type: 'temporal', scale: { type: 'utc' } } },
        };
        vlApplyLayoutToSpec(spec, layoutContext, []);
        const { labels, ticks, gridlines } = await temporalAxis(spec);
        expect(labels[0].text).toBe('6 PM');
        expect(Number(labels[0].datum.value)).toBe(start);
        expect(labels.some(label => label.text === 'Jan 1, 2024' && Number(label.datum.value) === Date.UTC(2024, 0, 1))).toBe(true);
        expect(labels.every(label => !String(label.text).includes('2023'))).toBe(true);
        expect(ticks.map(tick => Number(tick.datum.value))).toEqual(gridlines.map(gridline => Number(gridline.datum.value)));
        for (let index = 1; index < labels.length; index++) {
            const previous = labels[index - 1].bounds;
            const current = labels[index].bounds;
            expect(channel === 'x' ? current.x1 - previous.x2 : previous.y1 - current.y2).toBeGreaterThanOrEqual(0);
        }
    });

    it.each([
        { unit: 'second', duration: 1000, expected: 'Jan 1, 2024 00:00' },
        { unit: 'minute', duration: 60_000, expected: 'Jan 1, 2024 12 AM' },
    ])('retains intermediate calendar detail at New Year on a $unit axis', async ({ duration, expected }) => {
        const boundary = Date.UTC(2024, 0, 1);
        const spec: any = {
            data: { values: [boundary - 30 * duration, boundary + 90 * duration].map(date => ({ date })) },
            mark: 'point', width: 600, height: 240,
            encoding: { x: { field: 'date', type: 'temporal', scale: { type: 'utc' } } },
        };
        vlApplyLayoutToSpec(spec, layoutContext, []);
        const { labels, gridlines, ticks } = await temporalAxis(spec);
        expect(labels.find(label => Number(label.datum.value) === boundary)?.text).toBe(expected);
        expect(labels.filter(label => String(label.text).includes('2024'))).toHaveLength(1);
        expect(labels.length).toBeGreaterThan(2);
        for (const items of [gridlines, ticks]) {
            expect(items.map(item => Number(item.datum.value))).toEqual(spec.encoding.x.axis.values.map((value: string) => +new Date(value)));
        }
        for (let index = 1; index < labels.length; index++) {
            expect(labels[index].bounds.x1 - labels[index - 1].bounds.x2).toBeGreaterThanOrEqual(0);
        }
    });

    it.each([
        { end: '2024-01-25', width: 960, monthDay: false },
        { end: '2024-04-05', width: 4800, monthDay: false },
        { end: '2024-04-05', width: 480, monthDay: true },
    ])('chooses day labels by month repetition through $end at $width px', async ({ end, width, monthDay }) => {
        const spec: any = {
            data: { values: ['2024-01-05', end].map(date => ({ date })) },
            mark: 'point', width, height: 240,
            encoding: { x: { field: 'date', type: 'temporal', scale: { type: 'utc' } } },
        };
        vlApplyLayoutToSpec(spec, {
            ...layoutContext,
            channelSemantics: { x: { field: 'date', type: 'temporal', semanticAnnotation: { semanticType: 'Date' } } },
        }, []);
        const { labels, ticks, gridlines } = await temporalAxis(spec);
        expect(labels[0].text).toBe('Jan 5, 2024');
        const ordinary = labels.slice(1).filter(label => label.datum.value.getUTCDate() !== 1);
        expect(ordinary.length).toBeGreaterThan(1);
        expect(ordinary.every(label => (monthDay ? /^[A-Z][a-z]{2} \d{1,2}$/ : /^\d{1,2}$/).test(label.text))).toBe(true);
        if (width === 4800) {
            expect(labels.map(label => label.text)).toEqual(expect.arrayContaining(['February', 'March', 'April']));
        }
        expect(ticks.map(item => Number(item.datum.value))).toEqual(gridlines.map(item => Number(item.datum.value)));
        for (let index = 1; index < labels.length; index++) {
            expect(labels[index].bounds.x1 - labels[index - 1].bounds.x2).toBeGreaterThanOrEqual(0);
        }
    });

    it('uses full month names only when they fit without losing ticks or labels', async () => {
        const axes = [];
        for (const { width, labelLimit } of [{ width: 600 }, { width: 360 }, { width: 600, labelLimit: 40 }]) {
            const spec: any = {
                data: { values: ['2020-01-01', '2022-01-01'].map(date => ({ date })) },
                mark: 'point', width, height: 240,
                encoding: { x: { field: 'date', type: 'temporal', scale: { type: 'utc' }, axis: { labelLimit } } },
            };
            vlApplyLayoutToSpec(spec, layoutContext, []);
            axes.push(await temporalAxis(spec));
        }
        const full = ['2020', 'April', 'July', 'October', '2021', 'April', 'July', 'October', '2022'];
        expect(axes[0].labels.map(label => label.text)).toEqual(full);
        for (const axis of axes.slice(1)) {
            expect(axis.labels.map(label => label.text)).toEqual(full.map(text => /^\d/.test(text) ? text : text.slice(0, 3)));
        }
        for (const axis of axes) {
            expect(axis.gridlines.map(item => Number(item.datum.value))).toEqual(axes[0].gridlines.map(item => Number(item.datum.value)));
            expect(axis.ticks.map(item => Number(item.datum.value))).toEqual(axes[0].ticks.map(item => Number(item.datum.value)));
            for (let index = 1; index < axis.labels.length; index++) {
                expect(axis.labels[index].bounds.x1 - axis.labels[index - 1].bounds.x2).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it('retains start context when no year divider supplies it', async () => {
        const start = Date.UTC(2024, 2, 10, 9);
        const spec: any = {
            data: { values: [start, Date.UTC(2024, 2, 10, 18)].map(date => ({ date })) },
            mark: 'point', width: 600, height: 240,
            encoding: { x: { field: 'date', type: 'temporal', scale: { type: 'utc' } } },
        };
        vlApplyLayoutToSpec(spec, layoutContext, []);
        const labels = await temporalLabels(spec);
        expect(Number(labels[0].datum.value)).toBe(start);
        expect(labels[0].text).toBe('Mar 10, 2024 9 AM');
        expect(labels.slice(1).every(label => !String(label.text).includes('2024'))).toBe(true);
    });

    it('keeps day ticks before a promoted month boundary and includes a fitting start', async () => {
        const labels = await temporalLabels(leapDayAxis());
        expect(Number(labels[0].datum.value)).toBe(Date.UTC(2024, 1, 24));
        expect(labels[0].text).toBe('Feb 24, 2024');
        expect(labels.some(label => label.text === '29' && Number(label.datum.value) === Date.UTC(2024, 1, 29))).toBe(true);
        expect(labels.some(label => label.text === 'March' && Number(label.datum.value) === Date.UTC(2024, 2, 1))).toBe(true);
        expect(labels.filter(label => Number(label.datum.value) < Date.UTC(2024, 2, 1)).length).toBeGreaterThan(2);
        for (let index = 1; index < labels.length; index++) {
            expect(labels[index].bounds.x1 - labels[index - 1].bounds.x2).toBeGreaterThanOrEqual(0);
        }
    });

    it.each((['x', 'y'] as const).flatMap(channel => [480, 960].map(size => ({ channel, size }))))(
        'keeps MonthDay labels intact and promotes only at New Year on $channel at $size px', async ({ channel, size }) => {
            const spec: any = {
                data: { values: ['2024-12-05', '2025-02-05'].map(date => ({ date })) },
                mark: 'point', width: size, height: size,
                encoding: { [channel]: { field: 'date', type: 'temporal', scale: { type: 'utc' } } },
            };
            vlApplyLayoutToSpec(spec, {
                ...layoutContext,
                channelSemantics: { [channel]: { field: 'date', type: 'temporal', semanticAnnotation: { semanticType: 'Date' } } },
            }, []);
            const { labels, gridlines, ticks } = await temporalAxis(spec);
            expect(labels.find(label => Number(label.datum.value) === Date.UTC(2025, 0, 1))?.text).toBe('2025');
            expect(labels.find(label => Number(label.datum.value) === Date.UTC(2025, 1, 1))?.text).toBe('Feb 1');
            expect(labels[0].text).toBe('Dec 5');
            expect(labels.filter(label => label.text !== '2025').every(label => /^[A-Z][a-z]{2} \d{1,2}$/.test(label.text))).toBe(true);
            for (const items of [gridlines, ticks]) {
                expect(items.map(item => Number(item.datum.value))).toEqual(spec.encoding[channel].axis.values.map((value: string) => +new Date(value)));
            }
            for (let index = 1; index < labels.length; index++) {
                const previous = labels[index - 1].bounds;
                const current = labels[index].bounds;
                expect(channel === 'x' ? current.x1 - previous.x2 : previous.y1 - current.y2).toBeGreaterThanOrEqual(0);
            }
        });

    it('keeps roughly weekly spacing while landing on month boundaries', async () => {
        const spec: any = {
            data: { values: ['2024-01-05', '2024-04-05'].map(date => ({ date })) },
            mark: 'point', width: 960, height: 240,
            encoding: { x: { field: 'date', type: 'temporal', scale: { type: 'utc' } } },
        };
        vlApplyLayoutToSpec(spec, {
            ...layoutContext,
            channelSemantics: { x: { field: 'date', type: 'temporal', semanticAnnotation: { semanticType: 'Date' } } },
        }, []);
        const { labels, gridlines, ticks } = await temporalAxis(spec);
        expect(labels.map(label => label.text)).toEqual(expect.arrayContaining(['Jan 5, 2024', 'Feb 1', 'Mar 1', 'Apr 1']));
        for (const month of [0, 1, 2]) {
            expect(labels.some(label => label.datum.value.getUTCMonth() === month && /^[A-Z][a-z]{2} \d{1,2}$/.test(label.text))).toBe(true);
        }
        for (const items of [gridlines, ticks]) {
            const values = items.map(item => Number(item.datum.value));
            expect(values).toEqual(expect.arrayContaining([Date.UTC(2024, 0, 5), Date.UTC(2024, 1, 1), Date.UTC(2024, 2, 1), Date.UTC(2024, 3, 1)]));
            for (let index = 1; index < values.length; index++) {
                const days = (values[index] - values[index - 1]) / 86_400_000;
                expect(days).toBeGreaterThanOrEqual(6);
                expect(days).toBeLessThanOrEqual(8);
            }
        }
        for (let index = 1; index < labels.length; index++) {
            expect(labels[index].bounds.x1 - labels[index - 1].bounds.x2).toBeGreaterThanOrEqual(0);
        }
    });

    it.each([
        { start: '2024-01-31', width: 960, cadence: 7 },
        { start: '2024-01-12', width: 480, cadence: 14 },
    ])('avoids a short opening grid interval from $start at $width px', async ({ start, width, cadence }) => {
        const spec: any = {
            data: { values: [start, '2024-04-05'].map(date => ({ date })) },
            mark: 'point', width, height: 240,
            encoding: { x: { field: 'date', type: 'temporal', scale: { type: 'utc' } } },
        };
        vlApplyLayoutToSpec(spec, {
            ...layoutContext,
            channelSemantics: { x: { field: 'date', type: 'temporal', semanticAnnotation: { semanticType: 'Date' } } },
        }, []);
        const { labels, gridlines, ticks } = await temporalAxis(spec);
        const values = gridlines.map(item => Number(item.datum.value));
        expect(values).toEqual(expect.arrayContaining([Date.UTC(2024, 1, 1), Date.UTC(2024, 2, 1), Date.UTC(2024, 3, 1)]));
        expect(ticks.map(item => Number(item.datum.value))).toEqual(values);
        for (let index = 1; index < labels.length; index++) {
            expect(labels[index].bounds.x1 - labels[index - 1].bounds.x2).toBeGreaterThanOrEqual(0);
        }
        for (let index = 1; index < values.length; index++) {
            expect(Math.abs((values[index] - values[index - 1]) / 86_400_000 - cadence)).toBeLessThanOrEqual(2);
        }
    });

    it('keeps ordinary daily gridlines and ticks when the start label hides nearby labels', async () => {
        const { labels, gridlines, ticks } = await temporalAxis(leapDayAxis());
        const hiddenDay = Date.UTC(2024, 1, 25);
        expect(labels.some(label => Number(label.datum.value) === hiddenDay)).toBe(false);
        const expected = Array.from({ length: 11 }, (_, index) => Date.UTC(2024, 1, 24 + index));
        for (const items of [gridlines, ticks]) {
            expect(items.map(item => Number(item.datum.value))).toEqual(expected);
            expect(items.every(item => (item.strokeDash ?? []).length === 0)).toBe(true);
        }
    });

    it('keeps normal boundary gridlines and ticks when axis labels are hidden', async () => {
        const { labels, gridlines, ticks } = await temporalAxis(leapDayAxis({ labels: false }));
        const march = gridlines.find(item => Number(item.datum.value) === Date.UTC(2024, 2, 1));
        expect(march).toBeDefined();
        expect(march.strokeDash ?? []).toEqual([]);
        expect(march.opacity).toBe(1);
        expect(ticks.some(item => Number(item.datum.value) === Date.UTC(2024, 2, 1))).toBe(true);
        expect(gridlines.some(item => Number(item.datum.value) < Date.UTC(2024, 2, 1))).toBe(true);
        expect(labels).toHaveLength(0);
    });

    describe('calendar tick hierarchy', () => {
        it.each([
            {
                cadence: 'monthly', width: 1200, height: 600,
                months: ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            },
            {
                cadence: 'quarterly', width: 400, height: 200,
                months: ['Apr', 'Jul', 'Oct'],
            },
            {
                cadence: 'half-yearly', width: 220, height: 100,
                months: ['Jul'],
            },
            {
                cadence: 'yearly', width: 100, height: 60,
                months: [],
            },
        ].flatMap(example => (['x', 'y'] as const).map(channel => ({ ...example, channel }))))(
            'renders the exact $cadence month/year sequence on $channel',
            async ({ width, height, months, channel }) => {
                for (const startYear of [2020, 2021]) {
                    const spec: any = {
                        data: { values: [startYear, startYear + 2].map(year => ({ date: Date.UTC(year, 0, 1) })) },
                        mark: 'point', width, height,
                        encoding: { [channel]: { field: 'date', type: 'temporal', scale: { type: 'utc' } } },
                    };
                    vlApplyLayoutToSpec(spec, layoutContext, []);
                    expect(spec.encoding[channel].axis.labelOverlap).toBe(false);

                    const labels = await temporalLabels(spec);
                    expect(labels.map(label => /^[A-Za-z]+$/.test(label.text) ? label.text.slice(0, 3) : label.text)).toEqual([
                        String(startYear), ...months, String(startYear + 1), ...months, String(startYear + 2),
                    ]);
                    const years = labels.filter(label => /^\d{4}$/.test(label.text));
                    expect(years.every(label => new Date(label.datum.value).getUTCMonth() === 0
                        && new Date(label.datum.value).getUTCDate() === 1)).toBe(true);
                    for (let index = 1; index < labels.length; index++) {
                        const previous = labels[index - 1].bounds;
                        const current = labels[index].bounds;
                        const gap = channel === 'x' ? current.x1 - previous.x2 : previous.y1 - current.y2;
                        expect(gap).toBeGreaterThanOrEqual(0);
                    }
                }
            },
        );
    });

    it.each([undefined, 'datawrapper', 'powerbi'].flatMap(theme => [0, 3, 8].map(startMonth => ({ theme, startMonth }))))('keeps January year anchors while thinning intermediate month labels ($theme / start month $startMonth)', async ({ theme, startMonth }) => {
        const start = Date.UTC(2020, startMonth, 6);
        const week = 7 * 24 * 60 * 60 * 1000;
        const count = Math.floor((Date.UTC(2024, 11, 30) - start) / week) + 1;
        for (const width of [240, 300, 480, 600, 920]) {
            const spec: any = assembleVegaLite({
                data: { values: Array.from({ length: count }, (_, index) => ({
                    date: new Date(start + index * week).toISOString().slice(0, 10),
                    price: 3 + Math.sin(index / 20),
                })) },
                semantic_types: { date: 'Date', price: 'Quantity' },
                theme_spec: theme,
                chart_spec: {
                    chartType: 'Line Chart', encodings: { x: 'date', y: 'price' },
                    baseSize: { width, height: 400 },
                },
            });
            const labels = await temporalLabels(spec);
            expect(labels.length).toBeGreaterThanOrEqual(2);
            const years = labels.filter(label => /^202[0-4]$/.test(label.text));
            expect(years.map(label => label.text)).toEqual(['2021', '2022', '2023', '2024']);
            expect(years.every(label => new Date(label.datum.value).getMonth() === 0
                && new Date(label.datum.value).getDate() === 1)).toBe(true);
            if (width >= 600) {
                expect(labels.some(label => /^(Apr(il)?|Jul(y)?|Oct(ober)?)$/.test(label.text))).toBe(true);
                expect(labels.slice(1).every(label => !/[A-Za-z].*202[0-4]/.test(label.text))).toBe(true);
            }
            for (let index = 1; index < labels.length; index++) {
                expect(labels[index].bounds.x1 - labels[index - 1].bounds.x2).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it.each([
        { range: 'leap day', start: '2024-02-24', end: '2024-03-05', stepDays: 1, year: '2024' },
        { range: 'months', start: '2022-03-01', end: '2022-11-01', stepDays: 7, year: '2022' },
    ].flatMap(example => [undefined, 'datawrapper', 'powerbi'].map(theme => ({ ...example, theme }))))(
        'shows the year once for $range ($theme)', async ({ range, start, end, stepDays, year, theme }) => {
            const first = Date.parse(start);
            const last = Date.parse(end);
            const step = stepDays * 24 * 60 * 60 * 1000;
            for (const width of [300, 960]) {
                const spec: any = assembleVegaLite({
                    data: { values: Array.from({ length: Math.ceil((last - first) / step) + 1 }, (_, index) => ({
                        date: new Date(Math.min(last, first + index * step)).toISOString().slice(0, 10),
                        value: 100 + index,
                    })) },
                    semantic_types: { date: 'Date', value: 'Quantity' },
                    theme_spec: theme,
                    chart_spec: {
                        chartType: 'Line Chart', encodings: { x: 'date', y: 'value' },
                        baseSize: { width, height: 280 },
                    },
                });
                const labels = await temporalLabels(spec);
                expect(labels.length).toBeGreaterThanOrEqual(2);
                expect(labels[0].text).toContain(year);
                expect(labels.filter(label => String(label.text).includes(year))).toHaveLength(1);
                if (range === 'leap day' && width === 960 && theme === undefined) {
                    expect(labels.some(label => label.text === '29')).toBe(true);
                }
                for (let index = 1; index < labels.length; index++) {
                    expect(labels[index].bounds.x1 - labels[index - 1].bounds.x2).toBeGreaterThanOrEqual(0);
                }
            }
        },
    );

    it('keeps intraday labels compact after initial date context', async () => {
        const spec: any = assembleVegaLite({
            data: { values: Array.from({ length: 12 }, (_, index) => ({
                date: new Date(Date.UTC(2025, 2, 10, 9, index * 15)).toISOString(),
                value: index + 1,
            })) },
            chart_spec: { chartType: 'Line Chart', encodings: { x: 'date', y: 'value' } },
        });
        const labels = await temporalLabels(spec);
        expect(labels.length).toBeGreaterThanOrEqual(2);
        expect(labels.filter(label => String(label.text).includes('2025'))).toHaveLength(1);
        expect(labels.slice(1).every(label => !String(label.text).includes('2025'))).toBe(true);
        expect(new Set(labels.map(label => label.text)).size).toBe(labels.length);
    });

    it.each((['x', 'y'] as const).flatMap(channel => ['time', 'utc'].map(timezone => ({ channel, timezone }))))(
        'promotes New Year without repeating years beside hours on $channel ($timezone)', async ({ channel, timezone }) => {
            for (const size of [300, 900]) {
                const spec: any = {
                    data: { values: ['2023-12-31T18:00:00Z', '2024-01-01T12:00:00Z'].map(date => ({ date })) },
                    mark: 'point', width: size, height: size,
                    encoding: { [channel]: { field: 'date', type: 'temporal', scale: { type: timezone } } },
                };
                vlApplyLayoutToSpec(spec, layoutContext, []);
                expect(spec.encoding[channel].axis?.format).toBeUndefined();
                const labels = await temporalLabels(spec);
                const boundary = labels.find(label => Number(label.datum.value) === +new Date(2024, 0, 1));
                const utcBoundary = labels.find(label => Number(label.datum.value) === Date.UTC(2024, 0, 1));
                expect(String((timezone === 'utc' ? utcBoundary : boundary)?.text)).toMatch(/^Jan 1, 2024(?: 12 AM)?$/);
                expect(labels.some(label => /[AP]M/.test(String(label.text)))).toBe(true);
                expect(labels.filter(label => String(label.text).includes('2024'))).toHaveLength(1);
                for (let index = 1; index < labels.length; index++) {
                    const previous = labels[index - 1].bounds;
                    const current = labels[index].bounds;
                    expect(channel === 'x' ? current.x1 - previous.x2 : previous.y1 - current.y2).toBeGreaterThanOrEqual(0);
                }
            }
        },
    );

    it.each(['Date', 'DateTime', 'Timestamp'].flatMap(semanticType => (['x', 'y'] as const).flatMap(channel => [1, 2, 10].map(days => ({ semanticType, channel, days })))))(
        'respects $semanticType precision in $channel gridlines ($days days)', async ({ semanticType, channel, days }) => {
            const spec: any = {
                data: { values: [0, days].map(offset => ({ date: new Date(Date.UTC(2024, 1, 24 + offset)).toISOString() })) },
                mark: 'point', width: 1200, height: 1200,
                encoding: { [channel]: { field: 'date', type: 'temporal', scale: { type: 'utc' } } },
            };
            vlApplyLayoutToSpec(spec, {
                ...layoutContext,
                channelSemantics: { [channel]: { field: 'date', type: 'temporal', semanticAnnotation: { semanticType } } },
            }, []);
            const { gridlines } = await temporalAxis(spec);
            expect(gridlines.length).toBeGreaterThanOrEqual(2);
            const subdayTicks = gridlines.filter(item => item.datum.value.getUTCHours() !== 0
                || item.datum.value.getUTCMinutes() !== 0);
            if (semanticType === 'Date') expect(subdayTicks).toHaveLength(0);
            else expect(subdayTicks.length).toBeGreaterThan(0);
        },
    );

    it.each(['x', 'y'])('uses the scale timezone for year context on the %s axis', async channel => {
        const values = [Date.UTC(2024, 0, 1), Date.UTC(2024, 0, 1, 3)];
        const spec: any = {
            data: { values: values.map(date => ({ date })) }, mark: 'point',
            encoding: { [channel]: { field: 'date', type: 'temporal', axis: { values } } },
        };
        vlApplyLayoutToSpec(spec, layoutContext, []);
        spec.encoding[channel].scale = { type: 'utc' };
        const labels = await temporalLabels(spec);
        expect(labels).toHaveLength(2);
        expect(labels.every(label => !String(label.text).includes('2023'))).toBe(true);
        expect(labels.filter(label => String(label.text).includes('2024'))).toHaveLength(1);
        expect(labels.some(label => label.text === '2024')).toBe(true);
    });

    it.each([
        { axis: null },
        { axis: { format: '%b' } },
        { axis: { labelExpr: 'datum.label' } },
        { axis: { formatType: 'custom' } },
        { axis: { tickCount: 4 } },
        { axis: { values: [Date.UTC(2024, 0, 1)] } },
        { axis: { tickMinStep: 86400000 } },
        { axis: { labelOverlap: 'greedy' } },
        { axis: { labelFlush: true } },
        { scale: { domain: ['2023-12-01', '2024-02-01'] } },
        { scale: { domainMin: '2023-12-01' } },
        { scale: { domainMax: '2024-02-01' } },
        { timeUnit: 'month' },
        { timeUnit: { unit: 'month', utc: true } },
    ])('preserves explicit formatting and cyclic time units: %j', override => {
        const encoding = { field: 'date', type: 'temporal', ...override };
        const spec: any = {
            data: { values: ['2023-12-20', '2024-01-10'].map(date => ({ date })) },
            mark: 'line', width: 480, height: 240, encoding: { x: structuredClone(encoding) },
        };
        vlApplyLayoutToSpec(spec, layoutContext, []);
        expect(spec.encoding.x).toEqual(encoding);
    });
});