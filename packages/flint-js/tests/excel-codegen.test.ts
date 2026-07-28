import { describe, expect, it } from 'vitest';
import { generateOfficeJs, prepareExcelArtifact } from '../src/excel';
import type { ExcelNativeChartSpec } from '../src/excel';

const funnelArtifact: ExcelNativeChartSpec = {
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

describe('Excel Office.js artifacts', () => {
    it('prepares a versioned artifact without legacy coercion', () => {
        expect(prepareExcelArtifact(funnelArtifact)).toMatchObject({
            chartType: 'Funnel',
            rangeA1: 'A1:B3',
            rows: 3,
            columns: 2,
            hasAxes: false,
        });
        expect(() => prepareExcelArtifact({ ...funnelArtifact, chartType: 'funnel' })).toThrow(
            'Unsupported Excel chart type: funnel.',
        );
        expect(() => prepareExcelArtifact({ ...funnelArtifact, schema: undefined })).toThrow(
            'Expected a flint.excel.chart/v1 chart artifact.',
        );
    });

    it('generates standalone Office.js with artifact formatting', () => {
        const generated = generateOfficeJs(funnelArtifact, { scale: 2 });
        expect(generated.meta).toEqual({
            schema: 'flint.excel.chart/v1',
            rangeA1: 'A1:B3',
            chartType: 'Funnel',
            rows: 3,
            columns: 2,
        });
        expect(generated.code).toContain('sheet.charts.add("Funnel", dataRange, "Columns")');
        expect(generated.code).toContain('chart.dataLabels.format.font.color = "#FFFFFF"');
        expect(generated.code).toContain('chart.title.format.font.size = 18');
        expect(generated.code).toContain('chart.series.getItemAt(index)');
        expect(generated.code).toContain('chart.getImage(1280, 853, Excel.ImageFittingMode.fit)');
        expect(() => new Function('Excel', `${generated.code}\nreturn main;`)).not.toThrow();
    });

    it('keeps host options out of the serialized artifact', () => {
        generateOfficeJs(funnelArtifact, { scale: 4, cleanWorksheet: true });
        expect(funnelArtifact).not.toHaveProperty('scale');
        expect(funnelArtifact).not.toHaveProperty('cleanWorksheet');
    });

    it('generates deterministic explicit series bindings', () => {
        const generated = generateOfficeJs({
            ...funnelArtifact,
            chartType: 'ColumnStacked',
            data: [['Bin', 'Male', 'Female'], ['150-160', 7, 40]],
            series: [
                { name: 'Male', xColumn: 0, yColumn: 1, rowCount: 1 },
                { name: 'Female', xColumn: 0, yColumn: 2, rowCount: 1 },
            ],
        });

        expect(generated.code).toContain('for (let index = chart.series.items.length - 1; index >= 0; index -= 1)');
        expect(generated.code).toContain('chart.series.getItemAt(index).delete()');
        expect(generated.code).toContain('chart.series.add("Male", 0)');
        expect(generated.code).toContain('chart.series.add("Female", 1)');
        expect(generated.code).toContain('boundSeries1.setXAxisValues(sheet.getRangeByIndexes(1, 0, 1, 1))');
        expect(generated.code).toContain('boundSeries1.setValues(sheet.getRangeByIndexes(1, 2, 1, 1))');
        expect(() => new Function('Excel', `${generated.code}\nreturn main;`)).not.toThrow();
    });
});
