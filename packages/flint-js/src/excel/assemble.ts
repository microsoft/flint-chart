// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Excel chart assembly — Stage-3 code generator for Office.js Excel charts.
 *
 * Reuses the SAME core analysis pipeline as the other backends:
 *   Phase 0:  convertTemporalData + resolveChannelSemantics → ChannelSemantics
 *             (this decides each channel's role: quantitative = MEASURE,
 *              nominal/ordinal/temporal = CATEGORY — no heuristics)
 *   Stage 3:  pivot the long/tidy rows into Excel's WIDE matrix and emit an
 *             ExcelChartSpec (native Office.js chart description).
 *
 * Excel charts consume a rectangular range (`charts.add(type, range, seriesBy)`),
 * so the long/tidy data is pivoted: category field → first column, series field
 * → series columns, measure → cells. Visual STYLE stays native to Excel (its
 * own palette/gridlines); only Flint's LAYOUT decisions (which field is the
 * category, number format, legend, orientation) are carried over.
 */

import type {
    ChartAssemblyInput,
    ChartEncoding,
    ChartWarning,
    LayoutDeclaration,
    SemanticResult,
} from '../core/types';
import { resolveChannelSemantics, convertTemporalData } from '../core/resolve-semantics';
import { detectBandedAxisFromSemantics } from '../core/axis-detection';
import { computeChannelBudgets, deriveStretchCaps, resolveBaseSize } from '../core/compute-layout';
import { filterOverflow } from '../core/filter-overflow';
import { formatSpecToExcel } from './chart-types';
import { excelGetTemplateDef } from './templates';
import type {
    ExcelAxisSpec,
    ExcelChartSpec,
    ExcelNativeChartSpec,
    ExcelNativeSeriesSpec,
    ExcelSeriesBy,
} from './types';
import { excelDateAxis, excelDateSerial } from './date-axis';

type Cell = string | number | null;

const EXCEL_SERIES_COLORS = ['#4472C4', '#ED7D31', '#70AD47', '#FFC000', '#5B9BD5', '#A5A5A5'];

function niceStep(span: number, targetTicks = 5): number {
    if (!(span > 0)) return 1;
    const rough = span / targetTicks;
    const power = 10 ** Math.floor(Math.log10(rough));
    const fraction = rough / power;
    const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
    return niceFraction * power;
}

function focusedNumericAxis(values: number[]): Partial<Pick<ExcelAxisSpec, 'minimumScale' | 'maximumScale' | 'majorUnit'>> {
    const finite = values.filter(Number.isFinite);
    if (finite.length === 0) return {};
    const dataMinimum = Math.min(...finite);
    const dataMaximum = Math.max(...finite);
    const dataSpan = dataMaximum - dataMinimum;
    const referenceSpan = dataSpan > 0 ? dataSpan : Math.max(1, Math.abs(dataMaximum) * 0.1);
    const majorUnit = niceStep(referenceSpan);
    const precision = 10 ** Math.max(0, -Math.floor(Math.log10(majorUnit)) + 1);
    const round = (value: number) => Math.round(value * precision) / precision;
    if (dataSpan === 0) {
        return {
            minimumScale: round(dataMinimum - majorUnit),
            maximumScale: round(dataMaximum + majorUnit),
            majorUnit,
        };
    }
    const onMajorTick = (value: number) => Math.abs(value / majorUnit - Math.round(value / majorUnit)) < 1e-9;
    const minimumScale = dataMinimum >= 0 && dataMinimum <= referenceSpan * 0.1
        ? 0
        : round(Math.floor(dataMinimum / majorUnit) * majorUnit);
    const nextMajorTick = Math.ceil(dataMaximum / majorUnit) * majorUnit;
    const maximumScale = onMajorTick(dataMaximum)
        ? dataMaximum + majorUnit * 0.25
        : nextMajorTick;
    return {
        minimumScale,
        maximumScale: round(maximumScale),
        majorUnit,
    };
}

/** Normalize shorthand (`"x": "field"`) to `{ field }`. */
function normalizeEncodings(
    raw: Record<string, unknown>,
): Record<string, ChartEncoding> {
    const out: Record<string, ChartEncoding> = {};
    for (const [ch, v] of Object.entries(raw ?? {})) {
        if (v == null) continue;
        out[ch] = typeof v === 'string' ? { field: v } : (v as ChartEncoding);
    }
    return out;
}

function applyFieldDisplayNames(
    spec: ExcelChartSpec,
    fieldDisplayNames: Record<string, string> | undefined,
): ExcelChartSpec {
    if (!fieldDisplayNames) return spec;
    const displayName = (value: string | number | null) =>
        typeof value === 'string' ? fieldDisplayNames[value] ?? value : value;
    if (spec.categoryAxis?.title) spec.categoryAxis.title = String(displayName(spec.categoryAxis.title));
    if (spec.valueAxis?.title) spec.valueAxis.title = String(displayName(spec.valueAxis.title));
    if (spec.data.length > 0) spec.data[0] = spec.data[0].map(displayName);
    if (spec.series) {
        for (const series of spec.series) series.name = String(displayName(series.name));
    }
    return spec;
}

/** Distinct values of a field, first-seen order. */
function distinct(rows: any[], field: string): Cell[] {
    const seen = new Set<unknown>();
    const out: Cell[] = [];
    for (const r of rows) {
        const v = r[field];
        if (!seen.has(v)) { seen.add(v); out.push(v as Cell); }
    }
    return out;
}

function interpolateMissing(values: Cell[]): Cell[] {
    const output = [...values];
    for (let index = 0; index < output.length; index += 1) {
        if (output[index] != null) continue;
        let previous = index - 1;
        let next = index + 1;
        while (previous >= 0 && output[previous] == null) previous -= 1;
        while (next < output.length && output[next] == null) next += 1;
        if (previous < 0 || next >= output.length) continue;
        const start = Number(output[previous]);
        const end = Number(output[next]);
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
        output[index] = start + ((end - start) * (index - previous)) / (next - previous);
    }
    return output;
}

function normalizedBubbleSizes(
    rows: any[],
    field: string,
    type: string | undefined,
    width: number,
    height: number,
): Map<any, number> {
    const values = rows.map((row) => row[field]).filter((value) => value != null);
    const unique = [...new Set(values)];
    const maximumArea = Math.round(Math.max(16, Math.min(361, (width * height / Math.max(1, rows.length)) * 0.6)));
    const minimumArea = type === 'quantitative' || type === 'temporal'
        ? 9
        : Math.round(maximumArea / 4);
    const output = new Map<any, number>();
    if (type !== 'quantitative' && type !== 'temporal') {
        unique.forEach((value, index) => {
            const t = unique.length > 1 ? index / (unique.length - 1) : 0.5;
            output.set(value, minimumArea + t * (maximumArea - minimumArea));
        });
        return output;
    }

    const numeric = values.map(Number).filter(Number.isFinite);
    const maximum = numeric.length > 0 ? Math.max(...numeric) : 1;
    const sqrtMaximum = Math.sqrt(Math.max(0, maximum));
    unique.forEach((value) => {
        const numericValue = Number(value);
        const t = sqrtMaximum > 0 && Number.isFinite(numericValue)
            ? Math.sqrt(Math.max(0, numericValue)) / sqrtMaximum
            : 0;
        output.set(value, minimumArea + t * (maximumArea - minimumArea));
    });
    return output;
}

function interpolateColor(start: string, end: string, t: number): string {
    const channel = (color: string, offset: number) => Number.parseInt(color.slice(offset, offset + 2), 16);
    const hex = (value: number) => Math.round(value).toString(16).padStart(2, '0');
    return `#${hex(channel(start, 1) + (channel(end, 1) - channel(start, 1)) * t)}${hex(channel(start, 3) + (channel(end, 3) - channel(start, 3)) * t)}${hex(channel(start, 5) + (channel(end, 5) - channel(start, 5)) * t)}`;
}

/**
 * Assemble an {@link ExcelChartSpec} from a {@link ChartAssemblyInput}.
 *
 * @throws if the chart type has no native Excel equivalent (e.g. Heatmap).
 */
export function assembleExcel(input: ChartAssemblyInput): ExcelChartSpec {
    const flintType = input.chart_spec.chartType;
    const semanticTypes = input.semantic_types ?? {};
    const rawData: any[] = input.data.values ?? [];
    const encodings = normalizeEncodings(input.chart_spec.encodings);

    // ── Phase 0 (reused core): resolve per-channel semantics ────────────────
    let convertedData = convertTemporalData(rawData, semanticTypes);
    const sem: SemanticResult = resolveChannelSemantics(
        encodings, rawData, semanticTypes, convertedData,
    );
    const typeOf = (ch: string) => sem[ch]?.type;
    const isMeasure = (ch: string) => typeOf(ch) === 'quantitative';
    const fieldOf = (ch: string) => encodings[ch]?.field;
    const overflowOrder = new Map<string, Cell[]>();
    const chartTemplate = excelGetTemplateDef(flintType);
    if (!chartTemplate) {
        throw new Error(`Excel backend does not support chart type "${flintType}" as a native Office.js chart.`);
    }
    if (fieldOf('column') || fieldOf('row')) {
        throw new Error(`Excel backend does not support faceting in one native Excel chart: "${flintType}".`);
    }
    const templateContext = { input, table: convertedData, semantics: sem, fieldOf, typeOf };
    const unsupportedReason = chartTemplate.validate?.(templateContext);
    if (unsupportedReason) {
        throw new Error(`Excel backend ${unsupportedReason}: "${flintType}".`);
    }

    if (chartTemplate.instantiate) {
        return applyFieldDisplayNames(
            chartTemplate.instantiate(templateContext),
            input.field_display_names,
        );
    }

    if (flintType === 'Bar Chart' || flintType === 'Grouped Bar Chart' || flintType === 'Stacked Bar Chart') {
        const detected = detectBandedAxisFromSemantics(sem, convertedData, { preferAxis: 'x' });
        const declaration: LayoutDeclaration = {
            axisFlags: detected ? { [detected.axis]: { banded: true } } : { x: { banded: true } },
            resolvedTypes: detected?.resolvedTypes,
        };
        const baseSize = resolveBaseSize(input.chart_spec.baseSize, input.chart_spec.canvasSize);
        const options = {
            facetFixedPadding: { width: 50, height: 40 },
            facetGap: 10,
            targetBandAR: 10,
            ...deriveStretchCaps(baseSize, input.chart_spec.canvasSize, {}),
        };
        const budgets = computeChannelBudgets(sem, declaration, convertedData, baseSize, options);
        const overflowResult = filterOverflow(
            sem,
            declaration,
            encodings,
            convertedData,
            budgets,
            new Set(['bar']),
        );
        convertedData = overflowResult.filteredData;
        overflowResult.truncations.forEach((truncation) => {
            overflowOrder.set(truncation.field, truncation.keptValues as Cell[]);
        });
    }

    const mapping = chartTemplate.typeMapping;

    // ── Resolve roles (category / measure / series) from semantics ──────────
    let catCh: string | undefined;
    let measCh: string | undefined;
    let seriesCh: string | undefined;
    let orientation: 'vertical' | 'horizontal' = 'vertical';
    let isXY = false;

    // categorical series candidate (group preferred, else categorical color)
    const seriesCand = encodings.group
        ? 'group'
        : encodings.color && !isMeasure('color')
            ? 'color'
            : undefined;
    const seriesField0 = seriesCand;

    if (mapping.noAxes) {
        // pie/doughnut: color = slices (category), size/theta/y = value
        catCh = encodings.color ? 'color' : encodings.x ? 'x' : undefined;
        measCh = encodings.size ? 'size' : encodings.theta ? 'theta' : encodings.y ? 'y' : undefined;
        seriesCh = undefined;
    } else if (mapping.xy) {
        catCh = 'x'; measCh = 'y'; isXY = true; seriesCh = seriesField0;
    } else if (isMeasure('x') && !isMeasure('y')) {
        catCh = 'y'; measCh = 'x'; orientation = 'horizontal'; seriesCh = seriesField0;
    } else {
        catCh = 'x'; measCh = 'y'; seriesCh = seriesField0;
    }

    const catField = catCh ? fieldOf(catCh) : undefined;
    const measField = measCh ? fieldOf(measCh) : undefined;
    const seriesField = seriesCh ? fieldOf(seriesCh) : undefined;
    const dashField = fieldOf('strokeDash');
    const orderField = fieldOf('order');
    const sizeField = fieldOf('size');
    const base = input.chart_spec.baseSize ?? { width: 480, height: 320 };
    const bubbleSizes = sizeField
        ? normalizedBubbleSizes(convertedData, sizeField, typeOf('size'), base.width, base.height)
        : undefined;
    const warnings: ChartWarning[] = [];

    if (!catField || !measField) {
        throw new Error(
            `Excel backend could not resolve category/measure for "${flintType}" ` +
            `(category=${catField}, measure=${measField}).`,
        );
    }

    const numericXLine = flintType === 'Line Chart' && isMeasure('x') && isMeasure('y');
    if (numericXLine) {
        isXY = true;
        catCh = 'x';
        measCh = 'y';
    }

    // ── Stage 3: pivot long → wide matrix ───────────────────────────────────
    const data: Array<Array<Cell>> = [];
    let explicitSeries: ExcelNativeSeriesSpec[] | undefined;
    let seriesFormats: ExcelNativeChartSpec['seriesFormats'];
    if (isXY) {
        const seriesKeys = seriesField ? distinct(convertedData, seriesField) : [measField];
        const needsExplicitSeries = Boolean(seriesField || sizeField);
        if (needsExplicitSeries) {
            const columnsPerSeries = sizeField ? 3 : 2;
            const groupedRows = seriesKeys.map((seriesKey) => {
                const rows = convertedData.filter((row) => !seriesField || row[seriesField] === seriesKey);
                if (!orderField) return rows;
                return [...rows].sort((left, right) => {
                    const leftValue = left[orderField];
                    const rightValue = right[orderField];
                    const leftNumber = Number(leftValue);
                    const rightNumber = Number(rightValue);
                    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
                    const leftTime = new Date(String(leftValue)).getTime();
                    const rightTime = new Date(String(rightValue)).getTime();
                    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime - rightTime;
                    return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true });
                });
            });
            const rowCount = Math.max(0, ...groupedRows.map((rows) => rows.length));
            explicitSeries = seriesKeys.map((seriesKey, index) => ({
                name: String(seriesKey),
                xColumn: index * columnsPerSeries,
                yColumn: index * columnsPerSeries + 1,
                rowCount: groupedRows[index].length,
                bubbleSizeColumn: sizeField ? index * columnsPerSeries + 2 : undefined,
            }));
            data.push(seriesKeys.flatMap((seriesKey) => [
                `${String(seriesKey)} ${catField}`,
                `${String(seriesKey)} ${measField}`,
                ...(sizeField ? [`${String(seriesKey)} ${sizeField}`] : []),
            ]));
            for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
                data.push(groupedRows.flatMap((rows) => {
                    const row = rows[rowIndex];
                    if (!row) return new Array(columnsPerSeries).fill(null);
                    return [
                        row[catField] as Cell,
                        Number(row[measField]),
                        ...(sizeField ? [bubbleSizes?.get(row[sizeField]) ?? 9] : []),
                    ];
                }));
            }
        } else {
            data.push([catField, measField]);
            const rows = orderField
                ? [...convertedData].sort((left, right) => {
                    const leftValue = left[orderField];
                    const rightValue = right[orderField];
                    const leftNumber = Number(leftValue);
                    const rightNumber = Number(rightValue);
                    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
                    const leftTime = new Date(String(leftValue)).getTime();
                    const rightTime = new Date(String(rightValue)).getTime();
                    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime - rightTime;
                    return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true });
                })
                : convertedData;
            for (const r of rows) {
                const x = r[catField];
                const y = r[measField];
                if (x == null || y == null) continue;
                data.push([x as Cell, Number(y)]);
            }
        }
    } else {
        let categories = distinct(convertedData, catField);
        const rankedCategories = overflowOrder.get(catField);
        if (rankedCategories) categories = rankedCategories;
        if (flintType === 'Line Chart' || flintType === 'Area Chart') {
            if (typeOf(catCh!) === 'temporal') {
                categories = [...categories].sort((a, b) => new Date(String(a)).getTime() - new Date(String(b)).getTime());
            } else if (typeOf(catCh!) === 'quantitative') {
                categories = [...categories].sort((a, b) => Number(a) - Number(b));
            }
        }
        let seriesKeys = seriesField ? distinct(convertedData, seriesField) : [measField];
        if (seriesField && (flintType === 'Stacked Bar Chart' || flintType === 'Bar Chart')) {
            seriesKeys = [...seriesKeys].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
            if (orientation === 'vertical') seriesKeys.reverse();
        }
        const dashValues = dashField ? distinct(convertedData, dashField) : [];
        const seriesDescriptors = dashField
            ? convertedData.reduce<Array<{ key: string; label: string; seriesValue: Cell; dashValue: Cell }>>((output, row) => {
                const seriesValue = (seriesField ? row[seriesField] : measField) as Cell;
                const dashValue = row[dashField] as Cell;
                const key = `${String(seriesValue)}\u0001${String(dashValue)}`;
                if (!output.some((descriptor) => descriptor.key === key)) {
                    output.push({
                        key,
                        label: seriesField ? `${String(seriesValue)} — ${String(dashValue)}` : String(dashValue),
                        seriesValue,
                        dashValue,
                    });
                }
                return output;
            }, [])
            : seriesKeys.map((seriesValue) => ({
                key: String(seriesValue),
                label: String(seriesValue),
                seriesValue,
                dashValue: null,
            }));
        const orderedSeries = Boolean(seriesField)
            && typeOf(seriesCh!) === 'ordinal';
        const numericSeriesValues = orderedSeries
            ? seriesKeys.map(Number).filter(Number.isFinite)
            : [];
        const seriesMinimum = numericSeriesValues.length > 0 ? Math.min(...numericSeriesValues) : 0;
        const seriesMaximum = numericSeriesValues.length > 0 ? Math.max(...numericSeriesValues) : 1;
        const orderedSeriesColor = (value: Cell) => {
            const numericValue = Number(value);
            const t = Number.isFinite(numericValue) && seriesMaximum !== seriesMinimum
                ? (numericValue - seriesMinimum) / (seriesMaximum - seriesMinimum)
                : 0.5;
            return interpolateColor('#D9E2F3', '#2F5597', t);
        };
        if (orderedSeries) {
            seriesFormats = seriesDescriptors.map((descriptor) => ({
                color: orderedSeriesColor(descriptor.seriesValue),
            }));
        }
        if (dashField) {
            seriesFormats = seriesDescriptors.map((descriptor) => ({
                color: EXCEL_SERIES_COLORS[Math.max(0, seriesKeys.indexOf(descriptor.seriesValue)) % EXCEL_SERIES_COLORS.length],
                lineStyle: dashValues.indexOf(descriptor.dashValue) === 0 ? 'Continuous' : 'Dash',
            }));
        }

        // aggregate duplicates per (category × series) using the measure's default
        const agg = sem[measCh!]?.aggregationDefault ?? 'sum';
        const acc = new Map<string, { sum: number; count: number }>();
        for (const r of convertedData) {
            const cv = r[catField];
            if (cv == null) continue;
            const seriesValue = seriesField ? r[seriesField] : measField;
            const sv = dashField
                ? `${String(seriesValue)}\u0001${String(r[dashField])}`
                : seriesValue;
            const num = Number(r[measField]);
            if (!Number.isFinite(num)) continue;
            const key = `${String(cv)}\u0000${String(sv)}`;
            const e = acc.get(key) ?? { sum: 0, count: 0 };
            e.sum += num; e.count += 1; acc.set(key, e);
        }
        const valueAt = (cv: Cell, sv: Cell): Cell => {
            const e = acc.get(`${String(cv)}\u0000${String(sv)}`);
            if (!e) return null;
            return agg === 'average' ? e.sum / e.count : e.sum;
        };

        let seriesValues = seriesDescriptors.map((descriptor) => categories.map((category) => valueAt(category, descriptor.key)));
        if (flintType === 'Line Chart' || flintType === 'Area Chart') {
            seriesValues = seriesValues.map(interpolateMissing);
        }
        if (flintType === 'Area Chart' && typeOf(catCh!) === 'quantitative' && categories.length > 1) {
            const sourceX = categories.map(Number);
            const sampleCount = Math.min(97, Math.max(49, categories.length));
            const minimum = sourceX[0];
            const maximum = sourceX[sourceX.length - 1];
            const targetX = Array.from(
                { length: sampleCount },
                (_value, index) => minimum + (index / (sampleCount - 1)) * (maximum - minimum),
            );
            seriesValues = seriesValues.map((values) => {
                let right = 1;
                return targetX.map((x) => {
                    while (right < sourceX.length - 1 && sourceX[right] < x) right += 1;
                    const left = Math.max(0, right - 1);
                    const span = sourceX[right] - sourceX[left];
                    const t = span === 0 ? 0 : (x - sourceX[left]) / span;
                    const leftValue = Number(values[left]);
                    const rightValue = Number(values[right]);
                    if (!Number.isFinite(leftValue)) return Number.isFinite(rightValue) ? rightValue : null;
                    if (!Number.isFinite(rightValue)) return leftValue;
                    return leftValue + (rightValue - leftValue) * t;
                });
            });
            const tickLabels = new Map(Array.from(
                { length: 5 },
                (_value, index) => [
                    Math.round((index / 4) * (sampleCount - 1)),
                    Number((minimum + (index / 4) * (maximum - minimum)).toPrecision(4)),
                ] as const,
            ));
            categories = targetX.map((_value, index) => tickLabels.get(index) ?? '');
        }
        data.push([catField, ...seriesDescriptors.map((descriptor) => descriptor.label)]);
        for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex += 1) {
            data.push([
                typeOf(catCh!) === 'temporal'
                    ? excelDateSerial(categories[categoryIndex])
                    : String(categories[categoryIndex]),
                ...seriesValues.map((values) => values[categoryIndex]),
            ]);
        }
    }

    // ── Chart type + styling (native Excel) ─────────────────────────────────
    let excelChartType = orientation === 'horizontal' && mapping.horizontal
        ? mapping.horizontal
        : mapping.vertical;
    if (numericXLine) excelChartType = 'XYScatterLines';
    if (flintType === 'Connected Scatter Plot') excelChartType = 'XYScatterLines';
    if (flintType === 'Scatter Plot' && sizeField) excelChartType = 'Bubble';
    if (flintType === 'Area Chart' && seriesField) excelChartType = 'AreaStacked';
    if (flintType === 'Bar Chart' && seriesField) {
        excelChartType = orientation === 'horizontal' ? 'BarStacked' : 'ColumnStacked';
    }
    const isBarFamily = /Column|Bar/.test(excelChartType);
    const hasNumericAxes = /XYScatter|Bubble/.test(excelChartType);
    const numberFormat = formatSpecToExcel(measCh ? sem[measCh]?.format : undefined);
    const seriesBy: ExcelSeriesBy = 'Columns';

    const spec: ExcelNativeChartSpec = {
        schema: 'flint.excel.chart/v1',
        kind: 'chart',
        chartType: excelChartType,
        title: `${measField} by ${catField}`,
        seriesBy,
        series: explicitSeries,
        seriesFormats,
        bubbleScale: flintType === 'Scatter Plot' && sizeField ? 20 : undefined,
        doughnutHoleSize: flintType === 'Donut Chart'
            ? Math.max(10, Math.min(90, Number(input.chart_spec.chartProperties?.innerRadius ?? 50)))
            : undefined,
        data,
        width: base.width,
        height: base.height,
        warnings,
        _flint: { flintType, catField, measField, seriesField, orientation, isXY },
    };

    if (!mapping.noAxes) {
        const measureValues = convertedData
            .map((row) => Number(row[measField]))
            .filter(Number.isFinite);
        const measureMinimum = measureValues.length > 0 ? Math.min(...measureValues) : undefined;
        const measureMaximum = measureValues.length > 0 ? Math.max(...measureValues) : undefined;
        const focusedLineMinimum = flintType === 'Line Chart' && measureMinimum !== undefined && measureMaximum !== undefined
            ? Math.max(0, measureMinimum - (measureMaximum - measureMinimum) * 0.05)
            : undefined;
        const numericXScale = hasNumericAxes
            ? focusedNumericAxis(convertedData.map((row) => Number(row[catField])))
            : {};
        const numericYScale = hasNumericAxes
            ? focusedNumericAxis(measureValues)
            : {};
        spec.categoryAxis = {
            title: catField,
            ...(orientation === 'vertical' && typeOf(catCh!) === 'temporal'
                ? excelDateAxis(convertedData.map((row) => row[catField]), base.width)
                : {}),
            labelFontSize: orientation === 'horizontal' && data.length > 25
                ? Math.max(8, Math.min(13, ((base.height - 80) / (data.length - 1)) * 0.9))
                : undefined,
            reversePlotOrder: orientation === 'horizontal' && typeOf(catCh!) !== 'temporal',
            ...numericXScale,
        };
        spec.valueAxis = {
            title: measField,
            numberFormat,
            minimumScale: flintType === 'Area Chart' ? 0 : focusedLineMinimum,
            ...numericYScale,
        };
    }
    spec.legend = mapping.noAxes
        ? { visible: true, position: 'Right' }
        : seriesField || dashField
            ? { visible: true, position: 'Bottom' }
            : { visible: false };
    if (isBarFamily) spec.gapWidth = 60;
    if (flintType === 'Grouped Bar Chart') {
        const seriesCount = Math.max(1, data[0].length - 1);
        spec.gapWidth = Math.min(500, (excelChartType.startsWith('Column') ? 60 : 40) * seriesCount);
        spec.overlap = 0;
    }

    return applyFieldDisplayNames(spec, input.field_display_names);
}
