import { describe, expect, it, vi } from 'vitest';
import { renderExcelChart, type OfficeJsExcelApi } from '../src/excel';
import type { ExcelNativeChartSpec } from '../src/excel';

function createMockExcel() {
    const calls = {
        chartType: '',
        seriesBy: '',
        rangeAddress: '',
        values: null as unknown,
        numberFormat: null as unknown,
        image: null as unknown,
        labels: {} as Record<string, unknown>,
        fillColor: '',
        clears: 0,
        syncs: 0,
    };
    const series = {
        format: {
            fill: { setSolidColor: (color: string) => { calls.fillColor = color; } },
            line: {},
        },
    };
    const chart = {
        series: { getItemAt: () => series },
        title: {},
        legend: {},
        dataLabels: {
            format: { font: {} },
            set visible(value: boolean) { calls.labels.visible = value; },
            set position(value: string) { calls.labels.position = value; },
            set numberFormat(value: string) { calls.labels.numberFormat = value; },
        },
        axes: {},
        getImage: (width: number, height: number, mode: unknown) => {
            calls.image = { width, height, mode };
            return { value: 'iVBORw0KGgoMOCK' };
        },
    };
    Object.defineProperties(chart.dataLabels.format.font, {
        color: { set: (value: string) => { calls.labels.fontColor = value; } },
        size: { set: (value: number) => { calls.labels.fontSize = value; } },
    });
    const range = {
        set values(value: unknown) { calls.values = value; },
        set numberFormat(value: unknown) { calls.numberFormat = value; },
    };
    const sheet = {
        charts: {
            items: [],
            load: vi.fn(),
            add: (chartType: string, _range: unknown, seriesBy: string) => {
                calls.chartType = chartType;
                calls.seriesBy = seriesBy;
                return chart;
            },
        },
        getUsedRangeOrNullObject: () => ({
            isNullObject: false,
            clear: () => { calls.clears += 1; },
        }),
        getRange: (address: string) => {
            calls.rangeAddress = address;
            return range;
        },
    };
    const run = vi.fn(async (callback: (context: unknown) => Promise<unknown>) => callback({
        workbook: { worksheets: { getActiveWorksheet: () => sheet } },
        sync: async () => { calls.syncs += 1; },
    }));
    const excel = {
        run,
        ImageFittingMode: { fit: 'fit' },
    } as OfficeJsExcelApi;
    return { excel, calls, run };
}

const artifact: ExcelNativeChartSpec = {
    schema: 'flint.excel.chart/v1',
    kind: 'chart',
    chartType: 'Funnel',
    seriesBy: 'Columns',
    title: 'Amount by Stage',
    data: [['Stage', 'Amount'], ['Prospects', 500], ['Qualified', 425]],
    dataLabels: {
        visible: true,
        numberFormat: '#,##0',
        fontColor: '#FFFFFF',
        fontSize: 11,
    },
    seriesFormats: [{ color: '#4472C4' }],
    width: 480,
    height: 320,
};

describe('renderExcelChart', () => {
    it('executes a Flint artifact against the Office.js object model', async () => {
        const { excel, calls } = createMockExcel();
        const result = await renderExcelChart(excel, artifact, { scale: 2 });

        expect(calls.rangeAddress).toBe('A1:B3');
        expect(calls.values).toEqual(artifact.data);
        expect(calls.chartType).toBe('Funnel');
        expect(calls.seriesBy).toBe('Columns');
        expect(calls.labels).toEqual({
            visible: true,
            numberFormat: '#,##0',
            fontColor: '#FFFFFF',
            fontSize: 11,
        });
        expect(calls.fillColor).toBe('#4472C4');
        expect(calls.image).toEqual({ width: 1280, height: 853, mode: 'fit' });
        expect(calls.clears).toBe(1);
        expect(result).toEqual({ pngBase64: 'iVBORw0KGgoMOCK', inspection: null });
    });

    it('rejects invalid artifacts before entering Excel.run', async () => {
        const { excel, run } = createMockExcel();
        await expect(renderExcelChart(excel, { ...artifact, chartType: 'funnel' })).rejects.toThrow(
            'Unsupported Excel chart type: funnel.',
        );
        expect(run).not.toHaveBeenCalled();
    });
});
