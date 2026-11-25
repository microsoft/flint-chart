import { describe, expect, it } from 'vitest';
import { assembleExcel } from '../src/excel';
import { excelDateSerial, excelTimeScale } from '../src/excel/date-axis';

const utcDay = (year: number, month: number, day: number, hour = 0) => new Date(Date.UTC(year, month, day, hour));
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

describe('Excel dates', () => {
    it('writes zoneless times as the wall clock they name', () => {
        expect(excelDateSerial('2024-03-01')).toBe(45352);
        expect(excelDateSerial('2024-03-01T12:00:00')).toBe(45352.5);
        expect(excelDateSerial(2024)).toBe(45292);
    });

    it('sets the date axis base unit and labels from the data grain', () => {
        const monthly = assembleExcel({
            data: { values: Array.from({ length: 60 }, (_v, i) => ({ Month: isoDate(utcDay(2019, i, 1)), Sales: i })) },
            semantic_types: { Month: 'YearMonth', Sales: 'Quantity' },
            chart_spec: { chartType: 'Line Chart', encodings: { x: 'Month', y: 'Sales' } },
        });
        expect(monthly.categoryAxis).toMatchObject({ categoryType: 'DateAxis', baseTimeUnit: 'Months', numberFormat: 'yyyy' });

        const yearly = assembleExcel({
            data: { values: Array.from({ length: 12 }, (_v, i) => ({ Year: 2012 + i, Sales: i })) },
            semantic_types: { Year: 'Year', Sales: 'Quantity' },
            chart_spec: { chartType: 'Line Chart', encodings: { x: 'Year', y: 'Sales' } },
        });
        expect(yearly.categoryAxis).toMatchObject({ baseTimeUnit: 'Years', majorTimeUnitScale: 'Years', numberFormat: 'yyyy' });
    });

    it('draws times of day on a numeric axis whose ticks Excel accepts', () => {
        const spec = assembleExcel({
            data: { values: Array.from({ length: 48 }, (_v, i) => ({ Time: utcDay(2024, 4, 1, i).toISOString().slice(0, 19), Temp: i % 7 })) },
            semantic_types: { Time: 'DateTime', Temp: 'Temperature' },
            chart_spec: { chartType: 'Line Chart', encodings: { x: 'Time', y: 'Temp' } },
        });
        expect(spec.chartType).toBe('XYScatterLinesNoMarkers');
        expect(spec.categoryAxis?.categoryType).toBeUndefined();
        expect(spec.categoryAxis?.numberFormat).toContain('hh:mm');
        expect(spec.data[2][0]).toBeCloseTo(45413 + 1 / 24, 9);
    });

    it('labels hourly bars by name instead of a day-based date axis', () => {
        const spec = assembleExcel({
            data: { values: Array.from({ length: 24 }, (_v, i) => ({ Time: utcDay(2024, 4, 1, i).toISOString().slice(0, 19), Calls: i })) },
            semantic_types: { Time: 'DateTime', Calls: 'Count' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Time', y: 'Calls' } },
        });
        expect(spec.categoryAxis?.categoryType).toBeUndefined();
        expect(typeof spec.data[1][0]).toBe('string');
    });

    it('steps month and year ticks forward so none lands before the boundary it names', () => {
        const scale = excelTimeScale(
            Array.from({ length: 40 }, (_v, i) => isoDate(utcDay(2024, 0, 1 + i * 9))),
            { plotWidth: 360, fontSize: 13 },
        );
        expect(scale.minimumScale).toBe(excelDateSerial('2024-01-01'));
        expect(scale.majorUnit! % 31 === 0 || scale.majorUnit! <= 14).toBe(true);
    });

    it('accepts a temporal x on a scatter plot', () => {
        const spec = assembleExcel({
            data: { values: Array.from({ length: 20 }, (_v, i) => ({ Date: isoDate(utcDay(2024, 0, 1 + i * 9)), Price: 50 + i })) },
            semantic_types: { Date: 'Date', Price: 'Price' },
            chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'Date', y: 'Price' } },
        });
        expect(spec.chartType).toBe('XYScatter');
        expect(spec.data[1][0]).toBe(45292);
    });
});

describe('Excel layout', () => {
    it('orders month names canonically whatever order the rows come in', () => {
        const spec = assembleExcel({
            data: { values: ['Mar', 'Jan', 'Feb'].map((Month, i) => ({ Month, Rain: i })) },
            semantic_types: { Month: 'Month', Rain: 'Quantity' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Month', y: 'Rain' } },
        });
        expect(spec.data.slice(1).map((row) => row[0])).toEqual(['Jan', 'Feb', 'Mar']);
    });

    it('keeps horizontal bar values at the bottom and names clear of negative bars', () => {
        const horizontal = assembleExcel({
            data: { values: ['A', 'B', 'C'].map((Team, i) => ({ Team, Score: i + 1 })) },
            semantic_types: { Team: 'Category', Score: 'Quantity' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Score', y: 'Team' } },
        });
        expect(horizontal.categoryAxis).toMatchObject({ reversePlotOrder: true, position: 'Maximum' });

        const negative = assembleExcel({
            data: { values: ['A', 'B'].map((Team, i) => ({ Team, Change: i ? -5 : 5 })) },
            semantic_types: { Team: 'Category', Change: 'Percentage' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Team', y: 'Change' } },
        });
        expect(negative.categoryAxis?.tickLabelPosition).toBe('Low');
    });

    it('sizes the chart from Flint layout: more bands make a wider chart, few bands keep bars at most 56 pt', () => {
        const bars = (count: number) => assembleExcel({
            data: { values: Array.from({ length: count }, (_v, i) => ({ Item: `Item ${i}`, Units: 10 + i })) },
            semantic_types: { Item: 'Category', Units: 'Count' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Item', y: 'Units' } },
        });
        const few = bars(3);
        const many = bars(40);
        expect(many.width!).toBeGreaterThan(few.width!);
        const fewPlot = few._flint!.plot as { width: number; height: number };
        expect((fewPlot.width / 3) * 0.7).toBeLessThanOrEqual(56.5);
    });

    it('eases fonts down on a small canvas', () => {
        const spec = assembleExcel({
            data: { values: ['A', 'B'].map((Group, i) => ({ Group, Value: i })) },
            semantic_types: { Group: 'Category', Value: 'Quantity' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Group', y: 'Value' }, baseSize: { width: 200, height: 150 } },
        });
        expect(spec.fontSizes!.label!).toBeLessThan(13);
    });

    it('honours an authored log scale on a scatter axis', () => {
        const spec = assembleExcel({
            data: { values: [800, 5000, 40000, 110000].map((Income, i) => ({ Income, Life: 55 + i * 8 })) },
            semantic_types: { Income: 'Quantity', Life: 'Quantity' },
            chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'Income', y: 'Life' }, chartProperties: { logScale_x: true } },
        });
        expect(spec.categoryAxis).toMatchObject({ logBase: 10, minimumScale: 100, maximumScale: 1000000 });
    });
});
