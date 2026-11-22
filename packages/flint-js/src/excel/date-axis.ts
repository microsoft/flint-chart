// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Dates on native Excel charts.
 *
 * Excel stores a date as a serial day count with no time zone, so a value is
 * written as the wall-clock time it names: `2024-03-01T09:30` is 09:30 on
 * March 1 wherever the chart is compiled. A value with an explicit zone is
 * read as that instant in UTC, as Flint's other backends label it.
 *
 * A native date axis (`categoryType: DateAxis`) spaces points by calendar
 * time, but its base unit is at least a day. Its base unit follows the data's
 * grain (yearly, monthly or daily rows), so a monthly column takes a month's
 * slot rather than a day's. Ticks step through calendar units sized to the
 * room the labels have. Rows finer than a day cannot sit on a date axis; the
 * assembler draws those on a numeric (XY) axis with {@link excelTimeScale}.
 */

import type { ExcelAxisSpec } from './types';

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY = 24 * 60 * 60 * 1000;
const ISO = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(\.\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?)?)?)?$/i;

/** How finely a temporal field's values are spaced. */
export type TemporalGrain = 'year' | 'month' | 'day' | 'time';

/** Wall-clock milliseconds (as if UTC) for a temporal value, or NaN. */
export function excelWallClock(value: unknown): number {
    if (value == null || value === '') return Number.NaN;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') {
        if (Number.isInteger(value) && value >= 1000 && value <= 9999) return Date.UTC(value, 0, 1);
        return Number.isFinite(value) ? value : Number.NaN;
    }
    const text = String(value).trim();
    const match = text.match(ISO);
    if (match) {
        const [, year, month = '1', day = '1', hours = '0', minutes = '0', seconds = '0', fraction = '', zone] = match;
        if (zone) return Date.parse(text.replace(' ', 'T'));
        return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds), Math.round(Number(fraction || 0) * 1000));
    }
    // Other spellings are read by the engine in local time; keep the wall clock they name.
    const parsed = new Date(text);
    return Number.isFinite(parsed.getTime())
        ? Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), parsed.getHours(), parsed.getMinutes(), parsed.getSeconds(), parsed.getMilliseconds())
        : Number.NaN;
}

/** Excel serial date (days since 1899-12-30) for a temporal value, or NaN. */
export function excelDateSerial(value: unknown): number {
    const time = excelWallClock(value);
    if (!Number.isFinite(time)) return Number.NaN;
    return Math.round(((time - EXCEL_EPOCH) / DAY) * 86_400_000) / 86_400_000;
}

/** The coarsest calendar unit every value sits on. */
export function temporalGrain(times: number[]): TemporalGrain {
    const finite = times.filter(Number.isFinite);
    if (finite.some((time) => time % DAY !== 0)) return 'time';
    const dates = finite.map((time) => new Date(time));
    if (dates.some((date) => date.getUTCDate() !== 1)) return 'day';
    if (dates.some((date) => date.getUTCMonth() !== 0)) return 'month';
    return 'year';
}

type CalendarUnit = 'Days' | 'Months' | 'Years';
interface CalendarStep { unit: CalendarUnit; count: number; days: number }

const CALENDAR_STEPS: CalendarStep[] = [
    ...[1, 2, 7, 14].map((count) => ({ unit: 'Days' as const, count, days: count })),
    ...[1, 2, 3, 6].map((count) => ({ unit: 'Months' as const, count, days: count * 30.44 })),
    ...[1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500].map((count) => ({ unit: 'Years' as const, count, days: count * 365.25 })),
];

const GRAIN_UNIT: Record<Exclude<TemporalGrain, 'time'>, CalendarUnit> = { year: 'Years', month: 'Months', day: 'Days' };
const UNIT_RANK: Record<CalendarUnit, number> = { Days: 0, Months: 1, Years: 2 };

/** Approximate rendered width (points) of a label in Excel's default chart font. */
export function excelTextWidth(text: string, fontSize: number): number {
    let em = 0;
    for (const char of text) {
        em += /[\s.,:;'|!il1]/.test(char) ? 0.3 : /[A-Z MWmw%@]/.test(char) ? 0.68 : 0.53;
    }
    return em * fontSize;
}

function calendarFormat(step: CalendarStep, spanDays: number, sameYear: boolean): string {
    if (step.unit === 'Years') return 'yyyy';
    if (step.unit === 'Months') return sameYear ? 'mmm' : 'mmm yyyy';
    return sameYear || spanDays <= 120 ? 'mmm d' : 'mmm d, yyyy';
}

function sampleLabel(format: string): string {
    return format.replace('yyyy', '2024').replace('mmm', 'Sep').replace('dd', '28').replace('d', '28').replace('hh', '12').replace('mm', '00');
}

function startOf(time: number, unit: CalendarUnit): number {
    const date = new Date(time);
    if (unit === 'Years') return Date.UTC(date.getUTCFullYear(), 0, 1);
    if (unit === 'Months') return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export interface ExcelDateAxisOptions {
    /** Room for tick labels along the axis, in points. */
    plotWidth: number;
    /** Tick-label font size in points. */
    fontSize: number;
    /** Start the axis on a calendar boundary (lines and areas; bars keep their first slot). */
    alignStart?: boolean;
    /** Room one label takes along the axis, when not its text width (labels stacked down a vertical axis). */
    labelExtent?: number;
}

/**
 * Native date-axis settings for temporal categories at day grain or coarser.
 */
export function excelDateAxis(values: unknown[], options: ExcelDateAxisOptions): Pick<
    ExcelAxisSpec,
    'categoryType' | 'baseTimeUnit' | 'majorUnit' | 'majorTimeUnitScale' | 'numberFormat' | 'minimumScale'
> {
    const times = values.map(excelWallClock).filter(Number.isFinite);
    const grain = temporalGrain(times);
    const baseUnit = grain === 'time' ? 'Days' : GRAIN_UNIT[grain];
    if (times.length === 0) return { categoryType: 'DateAxis', baseTimeUnit: baseUnit, numberFormat: 'yyyy-mm-dd' };
    const minimum = Math.min(...times);
    const maximum = Math.max(...times);
    const spanDays = (maximum - minimum) / DAY;
    const sameYear = new Date(minimum).getUTCFullYear() === new Date(maximum).getUTCFullYear();
    const candidates = CALENDAR_STEPS.filter((step) => UNIT_RANK[step.unit] >= UNIT_RANK[baseUnit]);
    const fits = (step: CalendarStep) => {
        const format = calendarFormat(step, spanDays, sameYear);
        const labelWidth = options.labelExtent ?? excelTextWidth(sampleLabel(format), options.fontSize) + options.fontSize * 0.9;
        return (Math.floor(spanDays / step.days) + 1) * labelWidth <= options.plotWidth;
    };
    const step = candidates.find(fits) ?? candidates[candidates.length - 1];
    const axis: ReturnType<typeof excelDateAxis> = {
        categoryType: 'DateAxis',
        baseTimeUnit: baseUnit,
        majorUnit: step.count,
        majorTimeUnitScale: step.unit,
        numberFormat: calendarFormat(step, spanDays, sameYear),
    };
    if (options.alignStart && UNIT_RANK[step.unit] > UNIT_RANK[baseUnit]) {
        const start = startOf(minimum, step.unit);
        if (start < minimum) axis.minimumScale = excelDateSerial(new Date(start).toISOString().slice(0, 10));
    }
    return axis;
}

const TIME_STEPS_MS = [
    60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000,
    3_600_000, 2 * 3_600_000, 3 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000,
    DAY, 2 * DAY, 7 * DAY, 14 * DAY,
];
const MONTH_STEPS = [1, 2, 3, 6];
const YEAR_STEPS = [1, 2, 5, 10, 20, 25, 50, 100];

/**
 * Settings for a numeric (XY) axis carrying Excel serial dates: the axis
 * Excel uses for times of day, and for dates on a scatter plot. A numeric
 * axis steps by a fixed number of days, so steps longer than two weeks
 * approximate months or years (see below).
 */
export function excelTimeScale(values: unknown[], options: { plotWidth: number; fontSize: number }): Pick<
    ExcelAxisSpec,
    'minimumScale' | 'maximumScale' | 'majorUnit' | 'numberFormat'
> {
    const times = values.map(excelWallClock).filter(Number.isFinite);
    if (times.length === 0) return { numberFormat: 'yyyy-mm-dd' };
    const minimum = Math.min(...times);
    const maximum = Math.max(...times);
    const span = Math.max(maximum - minimum, 60_000);
    const sameDay = startOf(minimum, 'Days') === startOf(maximum, 'Days');
    const sameYear = new Date(minimum).getUTCFullYear() === new Date(maximum).getUTCFullYear();
    const timeFormat = (stepMs: number) => stepMs < DAY
        ? (sameDay ? 'hh:mm' : 'mmm d hh:mm')
        : (sameYear || span <= 120 * DAY ? 'mmm d' : 'mmm d, yyyy');
    const fits = (stepMs: number, format: string) => {
        const labelWidth = excelTextWidth(sampleLabel(format), options.fontSize) + options.fontSize * 0.9;
        return (Math.floor(span / stepMs) + 1) * labelWidth <= options.plotWidth;
    };
    const serial = (time: number) => (time - EXCEL_EPOCH) / DAY;
    for (const stepMs of TIME_STEPS_MS) {
        const format = timeFormat(stepMs);
        if (!fits(stepMs, format)) continue;
        const anchor = stepMs >= DAY ? startOf(minimum, 'Days') : minimum;
        const lower = stepMs >= DAY ? anchor : Math.floor(minimum / stepMs) * stepMs;
        const steps = Math.ceil((maximum - lower) / stepMs) || 1;
        return {
            minimumScale: serial(lower),
            maximumScale: serial(lower + steps * stepMs),
            majorUnit: stepMs / DAY,
            numberFormat: format,
        };
    }
    // A fixed step a little longer than its calendar unit drifts forward, so every tick lands on or
    // just after the month (or year) boundary its label names.
    const calendar: Array<{ unit: 'Months' | 'Years'; count: number; days: number }> = [
        ...MONTH_STEPS.map((count) => ({ unit: 'Months' as const, count, days: count * 31 })),
        ...YEAR_STEPS.map((count) => ({ unit: 'Years' as const, count, days: count * 366 })),
    ];
    const chosen = calendar.find((step) => fits(step.days * DAY, step.unit === 'Years' ? 'yyyy' : 'mmm yyyy'))
        ?? calendar[calendar.length - 1];
    const start = startOf(minimum, chosen.unit);
    const aligned = chosen.unit === 'Years'
        ? Date.UTC(Math.floor(new Date(start).getUTCFullYear() / chosen.count) * chosen.count, 0, 1)
        : start;
    const lower = serial(aligned);
    const steps = Math.ceil((serial(maximum) - lower) / chosen.days) || 1;
    return {
        minimumScale: lower,
        maximumScale: lower + steps * chosen.days,
        majorUnit: chosen.days,
        numberFormat: chosen.unit === 'Years' ? 'yyyy' : 'mmm yyyy',
    };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Print a wall-clock time with a d3-style format (`%Y %b %d %e %H %M %S %m`), the
 * subset Flint's temporal formats use. Kept here so the Excel bundle stays
 * free of runtime dependencies (it loads directly in an Office task pane).
 */
export function formatWallClock(time: number, format: string): string {
    const date = new Date(time);
    const pad = (value: number) => String(value).padStart(2, '0');
    return format.replace(/%([YbdeHMSmy])/g, (_match, code: string) => {
        switch (code) {
            case 'Y': return String(date.getUTCFullYear());
            case 'y': return pad(date.getUTCFullYear() % 100);
            case 'b': return MONTHS[date.getUTCMonth()];
            case 'm': return pad(date.getUTCMonth() + 1);
            case 'd': return pad(date.getUTCDate());
            case 'e': return String(date.getUTCDate());
            case 'H': return pad(date.getUTCHours());
            case 'M': return pad(date.getUTCMinutes());
            default: return pad(date.getUTCSeconds());
        }
    });
}
