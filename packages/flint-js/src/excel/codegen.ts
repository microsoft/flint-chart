import { prepareExcelArtifact } from './artifact';
import type { ExcelAxisSpec, ExcelNativeChartSpec } from './types';
import {
    EXCEL_AXIS_TITLE_FONT_SIZE,
    EXCEL_CHART_TITLE_FONT_SIZE,
    EXCEL_DATA_LABEL_FONT_SIZE,
    EXCEL_LABEL_FONT_SIZE,
    EXCEL_LEGEND_FONT_SIZE,
} from './typography';

export interface OfficeJsCodegenOptions {
    scale?: number;
    cleanWorksheet?: boolean;
    functionName?: string;
}

export interface GeneratedOfficeJs {
    code: string;
    meta: {
        schema: ExcelNativeChartSpec['schema'];
        rangeA1: string;
        chartType: string;
        rows: number;
        columns: number;
    };
}

function axisCode(axisName: 'categoryAxis' | 'valueAxis', axis: ExcelAxisSpec): string[] {
    const target = `chart.axes.${axisName}`;
    const lines: string[] = [];
    if (axis.categoryType) lines.push(`  ${target}.categoryType = ${JSON.stringify(axis.categoryType)};`);
    if (axis.baseTimeUnit) lines.push(`  ${target}.baseTimeUnit = ${JSON.stringify(axis.baseTimeUnit)};`);
    if (axis.majorTimeUnitScale) lines.push(`  ${target}.majorTimeUnitScale = ${JSON.stringify(axis.majorTimeUnitScale)};`);
    if (axis.title) {
        lines.push(`  ${target}.title.text = ${JSON.stringify(axis.title)};`);
        lines.push(`  ${target}.title.visible = true;`);
        lines.push(`  ${target}.title.format.font.size = ${EXCEL_AXIS_TITLE_FONT_SIZE};`);
    }
    if (axis.numberFormat) lines.push(`  ${target}.numberFormat = ${JSON.stringify(axis.numberFormat)};`);
    lines.push(`  ${target}.format.font.size = ${axis.labelFontSize ?? EXCEL_LABEL_FONT_SIZE};`);
    if (axis.tickLabelSpacing !== undefined) lines.push(`  ${target}.tickLabelSpacing = ${axis.tickLabelSpacing};`);
    if (axis.reversePlotOrder !== undefined) lines.push(`  ${target}.reversePlotOrder = ${axis.reversePlotOrder};`);
    if (axis.minimumScale !== undefined) lines.push(`  ${target}.minimum = ${axis.minimumScale};`);
    if (axis.maximumScale !== undefined) lines.push(`  ${target}.maximum = ${axis.maximumScale};`);
    if (axis.majorUnit !== undefined) lines.push(`  ${target}.majorUnit = ${axis.majorUnit};`);
    return lines;
}

function positiveScale(value: number | undefined): number {
    const scale = value ?? 3;
    if (!Number.isFinite(scale) || scale <= 0) throw new Error('Office.js image scale must be positive.');
    return scale;
}

export function generateOfficeJs(value: unknown, options: OfficeJsCodegenOptions = {}): GeneratedOfficeJs {
    const prepared = prepareExcelArtifact(value);
    const { spec } = prepared;
    const functionName = options.functionName ?? 'renderFlintChart';
    if (!/^[$A-Z_a-z][$\w]*$/.test(functionName)) {
        throw new Error('Office.js functionName must be a valid JavaScript identifier.');
    }
    const width = spec.width ?? 400;
    const height = spec.height ?? 300;
    const scale = positiveScale(options.scale);
    const imageWidth = Math.round(width * (96 / 72) * scale);
    const imageHeight = Math.round(height * (96 / 72) * scale);
    const lines = [
        `async function ${functionName}(context) {`,
        '  const sheet = context.workbook.worksheets.getActiveWorksheet();',
    ];

    if (options.cleanWorksheet) {
        lines.push(
            "  sheet.charts.load('items/name');",
            '  const previousRange = sheet.getUsedRangeOrNullObject();',
            '  await context.sync();',
            '  sheet.charts.items.forEach((existingChart) => existingChart.delete());',
            '  if (!previousRange.isNullObject) previousRange.clear();',
        );
    }

    lines.push(
        `  const values = ${JSON.stringify(prepared.data)};`,
        `  const dataRange = sheet.getRange(${JSON.stringify(prepared.rangeA1)});`,
        '  dataRange.numberFormat = values.map((row, rowIndex) =>',
        `    row.map((_cell, columnIndex) => rowIndex === 0 ? '@' : columnIndex === 0 && ${prepared.dateAxis} ? 'yyyy-mm-dd' : columnIndex === 0 && ${!prepared.numericAxis} ? '@' : 'General'),`,
        '  );',
        '  dataRange.values = values;',
        `  const chart = sheet.charts.add(${JSON.stringify(prepared.chartType)}, dataRange, ${JSON.stringify(spec.seriesBy)});`,
    );

    if (spec.series?.length) {
        lines.push(
            "  chart.series.load('items');",
            '  await context.sync();',
            '  chart.series.items.forEach((series) => series.delete());',
            '  await context.sync();',
        );
        spec.series.forEach((binding, index) => {
            const columnCount = binding.columnCount ?? 1;
            lines.push(
                `  const boundSeries${index} = chart.series.add(${JSON.stringify(binding.name)}, ${index});`,
                `  boundSeries${index}.setXAxisValues(sheet.getRangeByIndexes(${binding.xRow ?? 1}, ${binding.xColumn}, ${binding.rowCount}, ${columnCount}));`,
                `  boundSeries${index}.setValues(sheet.getRangeByIndexes(${binding.yRow ?? 1}, ${binding.yColumn}, ${binding.rowCount}, ${columnCount}));`,
            );
            if (binding.bubbleSizeColumn !== undefined) {
                lines.push(`  boundSeries${index}.setBubbleSizes(sheet.getRangeByIndexes(1, ${binding.bubbleSizeColumn}, ${binding.rowCount}, 1));`);
            }
        });
    }

    lines.push(`  chart.width = ${width};`, `  chart.height = ${height};`);
    if (spec.title) {
        lines.push(
            `  chart.title.text = ${JSON.stringify(spec.title)};`,
            '  chart.title.visible = true;',
            `  chart.title.format.font.size = ${EXCEL_CHART_TITLE_FONT_SIZE};`,
        );
    }
    if (spec.legend) {
        lines.push(`  chart.legend.visible = ${spec.legend.visible};`);
        if (spec.legend.visible && spec.legend.position) {
            lines.push(`  chart.legend.position = ${JSON.stringify(spec.legend.position)};`);
        }
        if (spec.legend.visible) lines.push(`  chart.legend.format.font.size = ${EXCEL_LEGEND_FONT_SIZE};`);
    }
    if (spec.dataLabels) {
        lines.push(`  chart.dataLabels.visible = ${spec.dataLabels.visible};`);
        if (spec.dataLabels.position) lines.push(`  chart.dataLabels.position = ${JSON.stringify(spec.dataLabels.position)};`);
        if (spec.dataLabels.numberFormat) lines.push(`  chart.dataLabels.numberFormat = ${JSON.stringify(spec.dataLabels.numberFormat)};`);
        if (spec.dataLabels.fontColor) lines.push(`  chart.dataLabels.format.font.color = ${JSON.stringify(spec.dataLabels.fontColor)};`);
        lines.push(`  chart.dataLabels.format.font.size = ${spec.dataLabels.fontSize ?? EXCEL_DATA_LABEL_FONT_SIZE};`);
    }
    if (prepared.hasAxes) {
        if (spec.categoryAxis) lines.push(...axisCode('categoryAxis', spec.categoryAxis));
        if (spec.valueAxis) lines.push(...axisCode('valueAxis', spec.valueAxis));
    }

    lines.push(`  const seriesFormats = ${JSON.stringify(spec.seriesFormats ?? [])};`);
    lines.push(`  for (let index = 0; index < ${prepared.seriesCount}; index += 1) {`, '    const series = chart.series.getItemAt(index);', '    const format = seriesFormats[index];');
    if (prepared.isBar && spec.gapWidth !== undefined) lines.push(`    series.gapWidth = ${spec.gapWidth};`);
    if (prepared.isBar && spec.overlap !== undefined) lines.push(`    series.overlap = ${spec.overlap};`);
    if (/Bubble/i.test(prepared.chartType) && spec.bubbleScale !== undefined) lines.push(`    series.bubbleScale = ${spec.bubbleScale};`);
    if (/Doughnut/i.test(prepared.chartType) && spec.doughnutHoleSize !== undefined) lines.push(`    series.doughnutHoleSize = ${spec.doughnutHoleSize};`);
    if (/BoxWhisker/i.test(prepared.chartType) && spec.boxWhiskerOptions) lines.push(`    series.boxwhiskerOptions.set(${JSON.stringify(spec.boxWhiskerOptions)});`);
    if (/Waterfall/i.test(prepared.chartType) && spec.showConnectorLines !== undefined) lines.push(`    series.showConnectorLines = ${spec.showConnectorLines};`);
    lines.push('    if (format?.color) {');
    if (!prepared.isLine) lines.push('      series.format.fill.setSolidColor(format.color);');
    lines.push('      series.format.line.color = format.color;', '    }', '    if (format?.lineStyle) series.format.line.lineStyle = format.lineStyle;', '  }');
    lines.push(
        `  const image = chart.getImage(${imageWidth}, ${imageHeight}, Excel.ImageFittingMode.fit);`,
        '  await context.sync();',
        '  return image.value;',
        '}',
        '',
        'async function main() {',
        `  return Excel.run(${functionName});`,
        '}',
        '',
    );

    return {
        code: lines.join('\n'),
        meta: {
            schema: spec.schema,
            rangeA1: prepared.rangeA1,
            chartType: prepared.chartType,
            rows: prepared.rows,
            columns: prepared.columns,
        },
    };
}
