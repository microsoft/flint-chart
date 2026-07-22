import type { ExcelNativeChartSpec } from './types';

export const EXCEL_ARTIFACT_SCHEMA = 'flint.excel.chart/v1' as const;

export const SUPPORTED_EXCEL_CHART_TYPES = [
    'Area',
    'AreaStacked',
    'BarClustered',
    'BarStacked',
    'BoxWhisker',
    'Bubble',
    'ColumnClustered',
    'ColumnStacked',
    'Doughnut',
    'Funnel',
    'Line',
    'Pie',
    'RadarMarkers',
    'StockOHLC',
    'Sunburst',
    'Treemap',
    'Waterfall',
    'XYScatter',
    'XYScatterLines',
] as const;

const supportedChartTypes = new Set<string>(SUPPORTED_EXCEL_CHART_TYPES);

export interface PreparedExcelArtifact {
    spec: ExcelNativeChartSpec;
    data: Array<Array<string | number | null>>;
    rows: number;
    columns: number;
    rangeA1: string;
    chartType: string;
    numericAxis: boolean;
    dateAxis: boolean;
    hasAxes: boolean;
    isBar: boolean;
    isLine: boolean;
    seriesCount: number;
}

export function excelColumnLetter(index: number): string {
    if (!Number.isInteger(index) || index < 0) {
        throw new Error('Column index must be a non-negative integer.');
    }
    let result = '';
    let remaining = index + 1;
    while (remaining > 0) {
        const digit = (remaining - 1) % 26;
        result = String.fromCharCode(65 + digit) + result;
        remaining = Math.floor((remaining - 1) / 26);
    }
    return result;
}

export function prepareExcelArtifact(value: unknown): PreparedExcelArtifact {
    if (!value || typeof value !== 'object') {
        throw new Error('Excel artifact must be an object.');
    }
    const spec = value as Partial<ExcelNativeChartSpec>;
    if (spec.schema !== EXCEL_ARTIFACT_SCHEMA || spec.kind !== 'chart') {
        throw new Error(`Expected a ${EXCEL_ARTIFACT_SCHEMA} chart artifact.`);
    }
    const chartType = spec.chartType;
    if (typeof chartType !== 'string' || !supportedChartTypes.has(chartType)) {
        throw new Error(`Unsupported Excel chart type: ${String(spec.chartType)}.`);
    }
    if (spec.seriesBy !== 'Columns' && spec.seriesBy !== 'Rows') {
        throw new Error('Excel artifact seriesBy must be Columns or Rows.');
    }
    if (!Array.isArray(spec.data) || spec.data.length < 2 || spec.data.some((row) => !Array.isArray(row))) {
        throw new Error('Excel artifact data must contain a header and at least one data row.');
    }
    const columns = Math.max(...spec.data.map((row) => row.length));
    if (columns < 2) {
        throw new Error('Excel artifact data must contain at least two columns.');
    }
    const rows = spec.data.length;
    const data = spec.data.map((row) => {
        const padded = row.slice();
        while (padded.length < columns) padded.push(null);
        return padded;
    });
    const seriesCount = /Treemap|Sunburst/i.test(chartType)
        ? 1
        : spec.series?.length ?? (spec.seriesBy === 'Rows' ? rows - 1 : columns - 1);

    return {
        spec: spec as ExcelNativeChartSpec,
        data,
        rows,
        columns,
        rangeA1: `A1:${excelColumnLetter(columns - 1)}${rows}`,
        chartType,
        numericAxis: /XYScatter|Bubble/i.test(chartType),
        dateAxis: /Stock/i.test(chartType),
        hasAxes: !/Pie|Doughnut|Treemap|Sunburst|Funnel/i.test(chartType),
        isBar: /Bar|Column/i.test(chartType),
        isLine: /Line/i.test(chartType),
        seriesCount,
    };
}
