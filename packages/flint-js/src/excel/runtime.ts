import { prepareExcelArtifact, type PreparedExcelArtifact } from './artifact';

export interface OfficeJsExcelApi {
    run<T>(callback: (context: any) => Promise<T>): Promise<T>;
    ImageFittingMode: { fit: any };
}

export interface ExcelRenderOptions {
    scale?: number;
    cleanWorksheet?: boolean;
    inspectNativeChart?: boolean;
}

export interface ExcelRenderResult {
    pngBase64: string;
    inspection: unknown | null;
}

function applyChartFormat(chart: any, prepared: PreparedExcelArtifact): void {
    const { spec } = prepared;
    if (spec.legend) {
        chart.legend.visible = spec.legend.visible;
        if (spec.legend.visible && spec.legend.position) chart.legend.position = spec.legend.position;
    }
    if (prepared.hasAxes) {
        const axes = [
            [chart.axes.categoryAxis, spec.categoryAxis],
            [chart.axes.valueAxis, spec.valueAxis],
        ] as const;
        for (const [axis, format] of axes) {
            if (!format) continue;
            if (format.title) {
                axis.title.text = format.title;
                axis.title.visible = true;
            }
            if (format.numberFormat) axis.numberFormat = format.numberFormat;
            if (format.labelFontSize !== undefined) axis.format.font.size = format.labelFontSize;
            if (format.tickLabelSpacing !== undefined) axis.tickLabelSpacing = format.tickLabelSpacing;
            if (format.reversePlotOrder !== undefined) axis.reversePlotOrder = format.reversePlotOrder;
            if (format.minimumScale !== undefined) axis.minimum = format.minimumScale;
            if (format.maximumScale !== undefined) axis.maximum = format.maximumScale;
            if (format.majorUnit !== undefined) axis.majorUnit = format.majorUnit;
        }
    }
    if (spec.dataLabels) {
        chart.dataLabels.visible = spec.dataLabels.visible;
        if (spec.dataLabels.position) chart.dataLabels.position = spec.dataLabels.position;
        if (spec.dataLabels.numberFormat) chart.dataLabels.numberFormat = spec.dataLabels.numberFormat;
        if (spec.dataLabels.fontColor) chart.dataLabels.format.font.color = spec.dataLabels.fontColor;
        if (spec.dataLabels.fontSize !== undefined) chart.dataLabels.format.font.size = spec.dataLabels.fontSize;
    }
    for (let index = 0; index < prepared.seriesCount; index += 1) {
        const series = chart.series.getItemAt(index);
        const format = spec.seriesFormats?.[index];
        if (format?.color) {
            if (!prepared.isLine) series.format.fill.setSolidColor(format.color);
            series.format.line.color = format.color;
        }
        if (format?.lineStyle) series.format.line.lineStyle = format.lineStyle;
        if (prepared.isBar && spec.gapWidth !== undefined) series.gapWidth = spec.gapWidth;
        if (prepared.isBar && spec.overlap !== undefined) series.overlap = spec.overlap;
        if (/Bubble/i.test(prepared.chartType) && spec.bubbleScale !== undefined) series.bubbleScale = spec.bubbleScale;
        if (/Doughnut/i.test(prepared.chartType) && spec.doughnutHoleSize !== undefined) series.doughnutHoleSize = spec.doughnutHoleSize;
        if (/BoxWhisker/i.test(prepared.chartType) && spec.boxWhiskerOptions) series.boxwhiskerOptions.set(spec.boxWhiskerOptions);
        if (/Waterfall/i.test(prepared.chartType) && spec.showConnectorLines !== undefined) series.showConnectorLines = spec.showConnectorLines;
    }
}

async function inspectChart(context: any, sheet: any, dataRange: any, chart: any): Promise<unknown> {
    try {
        dataRange.load('address,values,numberFormat');
        const usedRange = sheet.getUsedRangeOrNullObject();
        usedRange.load('isNullObject,address,values');
        chart.load('name,chartType');
        chart.series.load('items/name,items/chartType,items/axisGroup,items/formula');
        await context.sync();
        for (const series of chart.series.items) {
            series.binOptions.load('type,count,width,allowOverflow,overflowValue,allowUnderflow,underflowValue');
        }
        const primaryCategoryAxis = chart.axes.getItemOrNullObject('Category', 'Primary');
        const primaryValueAxis = chart.axes.getItemOrNullObject('Value', 'Primary');
        const secondaryValueAxis = chart.axes.getItemOrNullObject('Value', 'Secondary');
        for (const axis of [primaryCategoryAxis, primaryValueAxis, secondaryValueAxis]) {
            axis.load('isNullObject,axisType,axisGroup,visible,minimum,maximum,numberFormat');
            axis.title.load('text,visible');
        }
        await context.sync();
        const describeAxis = (axis: any) => axis.isNullObject ? null : { ...axis.toJSON(), title: axis.title.toJSON() };
        return {
            sourceRange: {
                address: dataRange.address,
                values: dataRange.values,
                numberFormat: dataRange.numberFormat,
            },
            usedRange: usedRange.isNullObject ? null : {
                address: usedRange.address,
                values: usedRange.values,
            },
            chart: {
                name: chart.name,
                chartType: chart.chartType,
                series: chart.series.items.map((series: any) => ({
                    ...series.toJSON(),
                    binOptions: series.binOptions.toJSON(),
                })),
                axes: {
                    primaryCategory: describeAxis(primaryCategoryAxis),
                    primaryValue: describeAxis(primaryValueAxis),
                    secondaryValue: describeAxis(secondaryValueAxis),
                },
            },
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

function imageScale(value: number | undefined): number {
    const scale = value ?? 3;
    if (!Number.isFinite(scale) || scale <= 0) throw new Error('Office.js image scale must be positive.');
    return scale;
}

export async function renderExcelChart(
    excelApi: OfficeJsExcelApi,
    value: unknown,
    options: ExcelRenderOptions = {},
): Promise<ExcelRenderResult> {
    const prepared = prepareExcelArtifact(value);
    const { spec } = prepared;
    const scale = imageScale(options.scale);
    return excelApi.run(async (context) => {
        const sheet = context.workbook.worksheets.getActiveWorksheet();
        if (options.cleanWorksheet !== false) {
            sheet.charts.load('items/name');
            const previousRange = sheet.getUsedRangeOrNullObject();
            await context.sync();
            sheet.charts.items.forEach((existingChart: any) => existingChart.delete());
            if (!previousRange.isNullObject) previousRange.clear();
        }

        const dataRange = sheet.getRange(prepared.rangeA1);
        dataRange.numberFormat = prepared.data.map((row, rowIndex) => row.map((_cell, columnIndex) =>
            rowIndex === 0
                ? '@'
                : columnIndex === 0 && prepared.dateAxis
                    ? 'yyyy-mm-dd'
                    : columnIndex === 0 && !prepared.numericAxis ? '@' : 'General',
        ));
        dataRange.values = prepared.data;
        const chart = sheet.charts.add(prepared.chartType, dataRange, spec.seriesBy);

        if (spec.series?.length) {
            chart.series.load('items');
            await context.sync();
            if (chart.series.items.length < spec.series.length) {
                throw new Error(`Excel inferred ${chart.series.items.length} series; ${spec.series.length} required.`);
            }
            for (const [index, binding] of spec.series.entries()) {
                const series = chart.series.items[index];
                series.name = binding.name;
                series.setXAxisValues(sheet.getRangeByIndexes(1, binding.xColumn, binding.rowCount, 1));
                series.setValues(sheet.getRangeByIndexes(1, binding.yColumn, binding.rowCount, 1));
                if (binding.bubbleSizeColumn !== undefined) {
                    series.setBubbleSizes(sheet.getRangeByIndexes(1, binding.bubbleSizeColumn, binding.rowCount, 1));
                }
            }
            for (let index = chart.series.items.length - 1; index >= spec.series.length; index -= 1) {
                chart.series.getItemAt(index).delete();
                await context.sync();
            }
        }

        const width = spec.width ?? 400;
        const height = spec.height ?? 300;
        chart.width = width;
        chart.height = height;
        if (spec.title) {
            chart.title.text = spec.title;
            chart.title.visible = true;
        }
        applyChartFormat(chart, prepared);
        await context.sync();
        const image = chart.getImage(
            Math.round(width * (96 / 72) * scale),
            Math.round(height * (96 / 72) * scale),
            excelApi.ImageFittingMode.fit,
        );
        await context.sync();
        const inspection = options.inspectNativeChart
            ? await inspectChart(context, sheet, dataRange, chart)
            : null;
        return { pngBase64: image.value, inspection };
    });
}
