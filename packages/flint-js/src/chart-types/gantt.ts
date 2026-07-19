import { SemanticAnnotation, toTypeString } from '../core/field-semantics';
import { isTimeSeriesType } from '../core/semantic-types';
import { ChartPropertyDef } from '../core/types';

export interface GanttRow {
    task: string;
    start: number;
    end: number;
    inputIndex: number;
}

export const GANTT_PROPERTIES: ChartPropertyDef[] = [
    { key: 'taskHeight', label: 'Task height', type: 'continuous', min: 40, max: 90, step: 5, defaultValue: 70 },
    { key: 'cornerRadius', label: 'Corners', type: 'continuous', min: 0, max: 8, step: 1, defaultValue: 2 },
    { key: 'intervalLabels', label: 'Labels', type: 'binary', defaultValue: false },
];

export function sortGanttRows<T extends GanttRow>(rows: T[]): T[] {
    return [...rows].sort((a, b) => (a.start - b.start) || (a.inputIndex - b.inputIndex));
}

export function coerceGanttEndpoint(value: unknown, temporal: boolean): number {
    if (value == null) return NaN;
    if (!temporal) return Number(value);
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
    return Date.parse(String(value));
}

export function isGanttTemporal(
    resolvedType: unknown,
    semanticType: string | SemanticAnnotation | undefined,
): boolean {
    if (resolvedType === 'temporal') return true;
    const typeName = toTypeString(semanticType);
    return typeName ? isTimeSeriesType(typeName) : false;
}

function compactNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

const GANTT_DURATION_UNITS = [
    { minimumMs: 86_400_000, divisorMs: 86_400_000, suffix: 'd' },
    { minimumMs: 3_600_000, divisorMs: 3_600_000, suffix: 'h' },
    { minimumMs: 60_000, divisorMs: 60_000, suffix: 'min' },
    { minimumMs: 1_000, divisorMs: 1_000, suffix: 's' },
    { minimumMs: 0, divisorMs: 1, suffix: 'ms' },
] as const;

export function formatGanttDuration(durationMs: number): string {
    const unit = GANTT_DURATION_UNITS.find(({ minimumMs }) => Math.abs(durationMs) >= minimumMs)!;
    return `${compactNumber(durationMs / unit.divisorMs)}${unit.suffix}`;
}

export function ganttDurationLabelExpression(start: string, end: string, temporal: boolean): string {
    const startValue = `datum[${JSON.stringify(start)}]`;
    const endValue = `datum[${JSON.stringify(end)}]`;
    if (!temporal) return `format(${endValue} - ${startValue}, ',.2~f')`;

    const duration = `(toDate(${endValue}) - toDate(${startValue}))`;
    return GANTT_DURATION_UNITS.reduceRight((fallback, unit, index) => {
        const label = `format(${duration} / ${unit.divisorMs}, '.2~f') + '${unit.suffix}'`;
        return index === GANTT_DURATION_UNITS.length - 1
            ? label
            : `(abs(${duration}) >= ${unit.minimumMs} ? ${label} : ${fallback})`;
    }, '');
}

export function formatGanttLabel(
    start: number,
    end: number,
    temporal: boolean,
): string {
    const duration = end - start;
    if (!temporal) return compactNumber(duration);
    return formatGanttDuration(duration);
}

export function ganttLabelReservePx(rows: Pick<GanttRow, 'start' | 'end'>[], temporal: boolean): number {
    const maxCharacters = rows.reduce((max, row) => (
        Math.max(max, formatGanttLabel(row.start, row.end, temporal).length)
    ), 0);
    return Math.max(40, maxCharacters * 7 + 10);
}