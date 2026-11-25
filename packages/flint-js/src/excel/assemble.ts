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
    AssembleOptions,
    ChannelSemantics,
    ChartAssemblyInput,
    ChartEncoding,
    ChartWarning,
    SemanticResult,
} from '../core/types';
import { resolveChannelSemantics, convertTemporalData } from '../core/resolve-semantics';
import { resolvePivotAggregate } from '../core/field-semantics';
import { categoryOrder, type CategoryOrder } from '../core/channel-decisions';
import { computeChannelBudgets, computeLayout, deriveStretchCaps, resolveBaseSize } from '../core/compute-layout';
import { computeZeroDecision } from '../core/semantic-types';
import { filterOverflow } from '../core/filter-overflow';
import { normalizeChartEncodingAliases } from '../core/static-series';
import { excelGetTemplateDef } from './templates';
import type {
    ExcelAxisSpec,
    ExcelChartSpec,
    ExcelNativeChartSpec,
    ExcelNativeSeriesSpec,
    ExcelSeriesBy,
} from './types';
import { excelDateAxis, excelDateSerial, excelTextWidth, excelTimeScale, excelWallClock, formatWallClock, temporalGrain } from './date-axis';
import { excelChartSize, excelFontSizes, excelLayoutDeclaration } from './layout';
import { axisNumberFormat, logScale, niceScale, sampleNumber } from './scale';

type Cell = string | number | null;

const EXCEL_SERIES_COLORS = ['#4472C4', '#ED7D31', '#70AD47', '#FFC000', '#5B9BD5', '#A5A5A5'];

/** The mark each family's overflow is filtered as (the shared overflow pass). */
const OVERFLOW_MARK: Record<string, string> = {
    'Bar Chart': 'bar',
    'Grouped Bar Chart': 'bar',
    'Stacked Bar Chart': 'bar',
    'Line Chart': 'line',
    'Area Chart': 'area',
};

function compareOrder(left: unknown, right: unknown): number {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
    const leftTime = excelWallClock(left);
    const rightTime = excelWallClock(right);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime - rightTime;
    return String(left).localeCompare(String(right), undefined, { numeric: true });
}

/** Categories in the order Flint's shared category-order decision gives them. */
function orderCategories(
    values: Cell[],
    order: CategoryOrder | undefined,
    rows: any[],
    field: string,
    fieldOf: (channel: string) => string | undefined,
): Cell[] {
    if (!order || order.by === 'data') return values;
    const sorted = [...values];
    if (order.by === 'values') {
        const rank = new Map(order.values.map((value, index) => [String(value), index]));
        const last = order.values.length;
        return sorted.sort((a, b) => (rank.get(String(a)) ?? last) - (rank.get(String(b)) ?? last));
    }
    const direction = order.descending ? -1 : 1;
    if (order.by === 'value') return sorted.sort((a, b) => direction * compareOrder(a, b));
    const keyField = order.by === 'channel' ? fieldOf(order.channel) : order.field;
    if (!keyField) return values;
    const keys = new Map<string, number>();
    for (const row of rows) {
        const value = Number(row[keyField]);
        if (!Number.isFinite(value)) continue;
        const key = String(row[field]);
        const previous = keys.get(key);
        keys.set(key, order.by === 'channel' ? (previous ?? 0) + value : Math.min(previous ?? Infinity, value));
    }
    return sorted.sort((a, b) => direction * ((keys.get(String(a)) ?? 0) - (keys.get(String(b)) ?? 0)));
}

/** Whether a measure axis keeps zero in view, as Flint decides it for this mark. */
function includesZero(cs: ChannelSemantics | undefined, channel: string, mark: string, values: number[]): boolean {
    if (mark === 'bar' || mark === 'area') return true;
    const semanticType = cs?.semanticAnnotation?.semanticType;
    if (!semanticType) return mark !== 'point';
    return computeZeroDecision(semanticType, channel === 'x' ? 'x' : 'y', mark, values).zero;
}

/** A representative date label for a date number format. */
function sampleLabelFor(format: string | undefined): string {
    return (format ?? 'yyyy-mm-dd').replace('yyyy', '2024').replace('mmm', 'Sep').replace(/d+/, '28').replace('hh', '12').replace(/mm$/, '00');
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
    const encodings = normalizeChartEncodingAliases(
        flintType,
        normalizeEncodings(input.chart_spec.encodings),
    );

    // ── Phase 0 (reused core): resolve per-channel semantics ────────────────
    let convertedData = convertTemporalData(rawData, semanticTypes);
    const sem: SemanticResult = resolveChannelSemantics(
        encodings, rawData, semanticTypes, convertedData, { chartType: flintType },
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

    const baseSize = resolveBaseSize(input.chart_spec.baseSize, input.chart_spec.canvasSize);

    if (chartTemplate.instantiate) {
        const instantiated = chartTemplate.instantiate(templateContext);
        return applyFieldDisplayNames(
            {
                fontSizes: excelFontSizes({ width: instantiated.width ?? baseSize.width, height: instantiated.height ?? baseSize.height }),
                ...instantiated,
                ...(input.chart_spec.title !== undefined ? { title: input.chart_spec.title } : {}),
            },
            input.field_display_names,
        );
    }

    const fonts = excelFontSizes(baseSize);
    const chartProperties = input.chart_spec.chartProperties as Record<string, any> | undefined;
    // The author's log-scale toggle (as core/analyze applies it on position axes) wins over the recommendation.
    for (const axis of ['x', 'y'] as const) {
        const choice = chartProperties?.[`logScale_${axis}`];
        if (choice !== undefined && sem[axis]?.type === 'quantitative') sem[axis].scaleType = choice === false ? undefined : 'log';
    }

    // ── Phase 1 (reused core): layout declaration, budgets, overflow, layout ─
    const declaration = excelLayoutDeclaration(flintType, sem, convertedData, chartProperties);
    const layoutOptions: AssembleOptions = {
        facetFixedPadding: { width: 50, height: 40 },
        facetGap: 10,
        targetBandAR: 10,
        ...(input.options ?? {}),
        ...(declaration.paramOverrides ?? {}),
    };
    Object.assign(layoutOptions, deriveStretchCaps(baseSize, input.chart_spec.canvasSize, layoutOptions));
    const budgets = computeChannelBudgets(sem, declaration, convertedData, baseSize, layoutOptions);
    const markType = OVERFLOW_MARK[flintType];
    if (markType) {
        const overflowResult = filterOverflow(sem, declaration, encodings, convertedData, budgets, new Set([markType]));
        convertedData = overflowResult.filteredData;
        overflowResult.truncations.forEach((truncation) => {
            overflowOrder.set(truncation.field, truncation.keptValues as Cell[]);
        });
    }
    const layout = computeLayout(sem, declaration, convertedData, baseSize, layoutOptions, budgets.facetGrid);
    // A banded axis spans its step times its bands (per group where the bars dodge), as Flint draws it.
    const bandedLength = (axis: 'x' | 'y', fallback: number) => {
        const step = axis === 'x' ? layout.xStep : layout.yStep;
        const continuous = axis === 'x' ? layout.xContinuousAsDiscrete : layout.yContinuousAsDiscrete;
        const nominal = axis === 'x' ? layout.xNominalCount : layout.yNominalCount;
        const unit = axis === 'x' ? layout.xStepUnit : layout.yStepUnit;
        const field = sem[axis]?.field;
        const bands = continuous > 0
            ? continuous
            : nominal > 0
                ? (unit === 'group' && field ? distinct(convertedData, field).length : nominal)
                : 0;
        return bands > 0 && step > 0 ? Math.round(step * bands) : fallback;
    };
    const plot = { width: bandedLength('x', layout.subplotWidth), height: bandedLength('y', layout.subplotHeight) };

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

    if (mapping.noAxes) {
        // pie/doughnut: color = slices (category), size/theta/y = value
        catCh = encodings.color ? 'color' : encodings.x ? 'x' : undefined;
        measCh = encodings.size ? 'size' : encodings.theta ? 'theta' : encodings.y ? 'y' : undefined;
        seriesCh = undefined;
    } else if (mapping.xy) {
        catCh = 'x'; measCh = 'y'; isXY = true; seriesCh = seriesCand;
    } else if (isMeasure('x') && !isMeasure('y')) {
        catCh = 'y'; measCh = 'x'; orientation = 'horizontal'; seriesCh = seriesCand;
    } else {
        catCh = 'x'; measCh = 'y'; seriesCh = seriesCand;
    }

    const catField = catCh ? fieldOf(catCh) : undefined;
    const measField = measCh ? fieldOf(measCh) : undefined;
    const seriesField = seriesCh ? fieldOf(seriesCh) : undefined;
    const dashField = fieldOf('strokeDash');
    const orderField = fieldOf('order');
    const sizeField = fieldOf('size');
    const bubbleSizes = sizeField
        ? normalizedBubbleSizes(convertedData, sizeField, typeOf('size'), plot.width, plot.height)
        : undefined;
    const warnings: ChartWarning[] = [];

    if (!catField || !measField) {
        throw new Error(
            `Excel backend could not resolve category/measure for "${flintType}" ` +
            `(category=${catField}, measure=${measField}).`,
        );
    }

    // Times of day cannot sit on a native date axis (its finest unit is a day): a line through them
    // is drawn on a numeric axis of serial dates; bars and areas name each time as a category.
    const catTemporal = typeOf(catCh!) === 'temporal';
    const catGrain = catTemporal
        ? temporalGrain(convertedData.map((row) => excelWallClock(row[catField])))
        : undefined;
    const numericXLine = flintType === 'Line Chart' && (isMeasure('x') || (catTemporal && catGrain === 'time')) && isMeasure('y');
    if (numericXLine) {
        isXY = true;
        catCh = 'x';
        measCh = 'y';
    }
    const xValue = (value: unknown): Cell => (typeOf('x') === 'temporal' ? excelDateSerial(value) : Number(value));
    const timeFormat = sem[catCh!]?.temporalFormat ?? '%b %d %H:%M';
    const timeLabel = catTemporal && catGrain === 'time' && !isXY
        ? (time: number) => formatWallClock(time, timeFormat)
        : undefined;

    // ── Stage 3: pivot long → wide matrix ───────────────────────────────────
    const data: Array<Array<Cell>> = [];
    let explicitSeries: ExcelNativeSeriesSpec[] | undefined;
    let seriesFormats: ExcelNativeChartSpec['seriesFormats'];
    let categories: Cell[] = [];
    let legendLabels: string[] = [];
    let stackExtents: number[] = [];
    const sortRows = (rows: any[]) => (orderField ? [...rows].sort((left, right) => compareOrder(left[orderField], right[orderField])) : rows);
    if (isXY) {
        const seriesKeys = seriesField ? distinct(convertedData, seriesField) : [measField];
        const sortByX = numericXLine && !orderField;
        const groupRows = (rows: any[]) => (sortByX
            ? [...rows].sort((left, right) => Number(xValue(left[catField])) - Number(xValue(right[catField])))
            : sortRows(rows));
        const needsExplicitSeries = Boolean(seriesField || sizeField);
        if (needsExplicitSeries) {
            const columnsPerSeries = sizeField ? 3 : 2;
            const groupedRows = seriesKeys.map((seriesKey) =>
                groupRows(convertedData.filter((row) => !seriesField || row[seriesField] === seriesKey)));
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
                        xValue(row[catField]),
                        Number(row[measField]),
                        ...(sizeField ? [bubbleSizes?.get(row[sizeField]) ?? 9] : []),
                    ];
                }));
            }
            legendLabels = seriesField ? seriesKeys.map(String) : [];
        } else {
            data.push([catField, measField]);
            for (const r of groupRows(convertedData)) {
                const x = r[catField];
                const y = r[measField];
                if (x == null || y == null) continue;
                data.push([xValue(x), Number(y)]);
            }
        }
    } else {
        categories = distinct(convertedData, catField);
        const rankedCategories = overflowOrder.get(catField);
        if (rankedCategories) {
            categories = rankedCategories;
        } else if (catTemporal) {
            categories = [...categories].sort((a, b) => excelWallClock(a) - excelWallClock(b));
        } else if (typeOf(catCh!) === 'quantitative') {
            categories = [...categories].sort((a, b) => Number(a) - Number(b));
        } else {
            const order = categoryOrder({
                channel: catCh!, encoding: encodings[catCh!], encodings, cs: sem[catCh!], data: rawData, semanticTypes,
            });
            categories = orderCategories(categories, order, convertedData, catField, fieldOf);
        }
        let seriesKeys = seriesField ? distinct(convertedData, seriesField) : [measField];
        if (seriesField && sem[seriesCh!]?.ordinalSortOrder?.length) {
            seriesKeys = orderCategories(seriesKeys, { by: 'values', values: sem[seriesCh!]!.ordinalSortOrder! }, convertedData, seriesField, fieldOf);
        }
        if (seriesField && (flintType === 'Stacked Bar Chart' || flintType === 'Bar Chart') && !sem[seriesCh!]?.ordinalSortOrder) {
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
        if (orderedSeries && numericSeriesValues.length === seriesKeys.length) {
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

        // aggregate duplicates per (category × series): the encoding's own aggregate, else the measure's default
        const agg = resolvePivotAggregate(encodings[measCh!]?.aggregate, sem[measCh!]?.aggregationDefault);
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
            return agg === 'average' ? e.sum / e.count : agg === 'count' ? e.count : e.sum;
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
        const stacked = /Stacked/.test(flintType) || (flintType === 'Bar Chart' && Boolean(seriesField)) || (flintType === 'Area Chart' && Boolean(seriesField));
        stackExtents = stacked
            ? categories.flatMap((_category, index) => {
                const column = seriesValues.map((values) => Number(values[index])).filter(Number.isFinite);
                return [column.filter((v) => v > 0).reduce((s, v) => s + v, 0), column.filter((v) => v < 0).reduce((s, v) => s + v, 0)];
            })
            : seriesValues.flat().map(Number).filter(Number.isFinite);
        legendLabels = seriesField || dashField ? seriesDescriptors.map((descriptor) => descriptor.label) : [];
        data.push([catField, ...seriesDescriptors.map((descriptor) => descriptor.label)]);
        for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex += 1) {
            const category = categories[categoryIndex];
            data.push([
                timeLabel
                    ? timeLabel(excelWallClock(category))
                    : catTemporal
                        ? excelDateSerial(category)
                        : String(category),
                ...seriesValues.map((values) => values[categoryIndex]),
            ]);
        }
    }

    // ── Chart type + styling (native Excel) ─────────────────────────────────
    let excelChartType = orientation === 'horizontal' && mapping.horizontal
        ? mapping.horizontal
        : mapping.vertical;
    if (numericXLine) excelChartType = 'XYScatterLinesNoMarkers';
    if (flintType === 'Connected Scatter Plot') excelChartType = 'XYScatterLines';
    if (flintType === 'Scatter Plot' && sizeField) excelChartType = 'Bubble';
    if (flintType === 'Area Chart' && seriesField) excelChartType = 'AreaStacked';
    if (flintType === 'Bar Chart' && seriesField) {
        excelChartType = orientation === 'horizontal' ? 'BarStacked' : 'ColumnStacked';
    }
    const isBarFamily = /Column|Bar/.test(excelChartType);
    const hasNumericAxes = /XYScatter|Bubble/.test(excelChartType);
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
            ? Math.max(10, Math.min(90, Number(chartProperties?.innerRadius ?? 50)))
            : undefined,
        data,
        width: baseSize.width,
        height: baseSize.height,
        fontSizes: fonts,
        warnings,
        _flint: { flintType, catField, measField, seriesField, orientation, isXY, plot, xStep: layout.xStep, yStep: layout.yStep },
    };

    // Few bands make a narrow plot as tall as the canvas. Native Excel spreads its bands over the plot
    // area, so a column chart is widened toward a landscape plot, never past bars of 56 pt.
    const bandedCategories = isBarFamily && !(catTemporal && !timeLabel) && categories.length > 0;
    if (bandedCategories && orientation === 'vertical') {
        const lanes = flintType === 'Grouped Bar Chart' ? Math.max(1, data[0].length - 1) : 1;
        const widest = (categories.length * lanes * 56) / 0.7;
        plot.width = Math.round(Math.max(plot.width, Math.min(plot.height * 1.3, widest)));
    }

    let categoryLabels: string[] = [];
    let valueLabels: string[] = [];
    if (!mapping.noAxes) {
        const categoryLength = orientation === 'horizontal' ? plot.height : plot.width;
        const valueLength = orientation === 'horizontal' ? plot.width : plot.height;
        const measureValues = isXY
            ? convertedData.map((row) => Number(row[measField])).filter(Number.isFinite)
            : stackExtents;
        const valueMark = isBarFamily ? 'bar' : /Area/.test(excelChartType) ? 'area' : hasNumericAxes && !numericXLine ? 'point' : 'line';
        const valueLog = hasNumericAxes && sem[measCh!]?.scaleType === 'log' ? logScale(measureValues) : undefined;
        const valueScale: Pick<ExcelAxisSpec, 'minimumScale' | 'maximumScale' | 'majorUnit' | 'logBase'> = valueLog ?? niceScale(
            measureValues,
            includesZero(sem[measCh!], measCh!, valueMark, measureValues),
            valueLength,
        );
        const valueFormat = axisNumberFormat(sem[measCh!]?.format, valueScale.majorUnit);
        valueLabels = valueScale.minimumScale !== undefined && valueScale.maximumScale !== undefined
            ? [valueScale.minimumScale, valueScale.maximumScale].map((value) => sampleNumber(value, valueFormat))
            : [];

        let categoryAxis: ExcelAxisSpec = { title: catField };
        if (hasNumericAxes) {
            const xValues = convertedData.map((row) => row[catField]);
            categoryAxis = typeOf('x') === 'temporal'
                ? { ...categoryAxis, ...excelTimeScale(xValues, { plotWidth: categoryLength, fontSize: fonts.label }) }
                : (() => {
                    const numbers = xValues.map(Number).filter(Number.isFinite);
                    const xMark = numericXLine ? 'line' : 'point';
                    const xLog = sem.x?.scaleType === 'log' ? logScale(numbers) : undefined;
                    if (xLog) return { ...categoryAxis, ...xLog, numberFormat: axisNumberFormat(sem.x?.format, 1) };
                    const xScale = niceScale(numbers, includesZero(sem.x, 'x', xMark, numbers), categoryLength);
                    return { ...categoryAxis, ...xScale, numberFormat: axisNumberFormat(sem.x?.format, xScale.majorUnit) };
                })();
            categoryLabels = [categoryAxis.minimumScale, categoryAxis.maximumScale]
                .filter((value): value is number => value !== undefined)
                .map((value) => (typeOf('x') === 'temporal' ? sampleLabelFor(categoryAxis.numberFormat) : sampleNumber(value, categoryAxis.numberFormat)));
        } else if (catTemporal && !timeLabel) {
            categoryAxis = {
                ...categoryAxis,
                ...excelDateAxis(categories, {
                    plotWidth: categoryLength,
                    fontSize: fonts.label,
                    alignStart: !isBarFamily,
                    labelExtent: orientation === 'horizontal' ? fonts.label * 1.6 : undefined,
                }),
            };
            categoryLabels = [sampleLabelFor(categoryAxis.numberFormat)];
        } else {
            categoryLabels = categories.map(String);
            if (timeLabel) {
                const labelWidth = Math.max(...categoryLabels.map((label) => excelTextWidth(label, fonts.label))) + fonts.label;
                const spacing = Math.ceil((labelWidth * categories.length) / Math.max(1, categoryLength));
                if (spacing > 1) categoryAxis.tickLabelSpacing = spacing;
            }
        }
        if (orientation === 'horizontal') {
            const step = categoryLength / Math.max(1, categories.length);
            // Names shrink only as far as their bands require, never below 8 pt; thinner bands name every other one.
            if (step < fonts.label * 1.3) {
                categoryAxis.labelFontSize = Math.max(8, Math.floor((step / 1.25) * 2) / 2);
                if (step < 8 * 1.2) categoryAxis.tickLabelSpacing = Math.ceil((8 * 1.2) / step);
            }
            if (typeOf(catCh!) !== 'temporal') {
                // Excel lists a bar chart's categories bottom-up; reversed, the first one is at the top
                // and the value axis crosses at the (now bottom) last category.
                categoryAxis.reversePlotOrder = true;
                categoryAxis.position = 'Maximum';
            }
        }
        if (!hasNumericAxes && measureValues.some((value) => value < 0)) categoryAxis.tickLabelPosition = 'Low';

        spec.categoryAxis = categoryAxis;
        spec.valueAxis = {
            title: measField,
            numberFormat: valueFormat,
            ...valueScale,
        };
    }
    const legendVisible = mapping.noAxes || Boolean(seriesField || dashField);
    const legendPosition = mapping.noAxes || legendLabels.length > 6 ? 'Right' : 'Bottom';
    spec.legend = legendVisible ? { visible: true, position: legendPosition } : { visible: false };
    if (isBarFamily) {
        // Excel's gap width is a percentage of one bar; aim for a gap that is a share of the whole band
        // (a little less where bands are narrow), so single, dense and dodged bars keep one rhythm.
        const lanes = flintType === 'Grouped Bar Chart' ? Math.max(1, data[0].length - 1) : 1;
        const bandLength = (orientation === 'horizontal' ? plot.height : plot.width) / Math.max(1, categories.length);
        const gapShare = bandLength < 12 ? 0.2 : flintType === 'Grouped Bar Chart' ? 0.25 : 0.3;
        spec.gapWidth = Math.round((100 * lanes * gapShare) / (1 - gapShare));
        if (flintType === 'Grouped Bar Chart') spec.overlap = 0;
    }

    if (input.chart_spec.title !== undefined) spec.title = input.chart_spec.title;
    const displayed = applyFieldDisplayNames(spec, input.field_display_names);
    if (!mapping.noAxes) {
        const size = excelChartSize({
            plot,
            fonts,
            title: displayed.title,
            orientation,
            categoryTitle: displayed.categoryAxis?.title,
            valueTitle: displayed.valueAxis?.title,
            categoryLabels,
            valueLabels,
            banded: isBarFamily && !(catTemporal && !timeLabel),
            legend: legendVisible ? { position: legendPosition, labels: legendLabels } : undefined,
        });
        displayed.width = size.width;
        displayed.height = size.height;
    }
    return displayed;
}
