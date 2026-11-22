// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
    timeMillisecond, timeSecond, timeMinute, timeHour, timeDay, timeWeek, timeMonth, timeYear,
    utcMillisecond, utcSecond, utcMinute, utcHour, utcDay, utcWeek, utcMonth, utcYear,
} from 'd3-time';
import { timeFormat, utcFormat } from 'd3-time-format';
import { AXIS_LABEL_LIMIT } from './compute-layout';
import { hostTextMeasurer } from './text-width';
import type { TimeContext } from './theme/types';

/**
 * The calendar tick plan of a continuous time axis: which ticks it draws, which it labels and in
 * what form, laid out across the pixels the axis spans. Shared by the layout plan, which decides
 * from it whether the axis takes a second row, and by the Vega-Lite realization, which draws it.
 */
const TEMPORAL_LEVELS = [
    { unit: 'millisecond', local: timeMillisecond, utc: utcMillisecond, steps: [1, 2, 5, 10, 20, 50, 100, 200, 500], format: '.%L', context: '%b %-d, %Y %H:%M:%S.%L' },
    { unit: 'second', local: timeSecond, utc: utcSecond, steps: [1, 5, 15, 30], format: ':%S', context: '%b %-d, %Y %H:%M:%S' },
    { unit: 'minute', local: timeMinute, utc: utcMinute, steps: [1, 5, 15, 30], format: '%-I:%M', context: '%b %-d, %Y %H:%M' },
    { unit: 'hour', local: timeHour, utc: utcHour, steps: [1, 3, 6, 12], format: '%-I %p', context: '%b %-d, %Y %-I %p' },
    { unit: 'day', local: timeDay, utc: utcDay, steps: [1, 2, 7, 14], format: '%-d', context: '%b %-d, %Y' },
    { unit: 'month', local: timeMonth, utc: utcMonth, steps: [1, 3, 6], format: '%b', context: '%b %Y' },
    { unit: 'year', local: timeYear, utc: utcYear, steps: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000], format: '%Y', context: '%Y' },
] as const;

export interface TemporalTickPlan {
    values: string[];
    labels: Record<string, string | string[]>;
    labelExpr: string;
    labelOverlap: false;
    labelFlush: false;
    /** The period names stand on a second row, under the tick labels. */
    stacked: boolean;
    /** Labels set from their left edge rather than centred: the px from the tick to that edge, by tick. */
    offsets: Record<string, number>;
}

export interface TemporalTickLayout {
    start: number;
    end: number;
    semanticType: string | undefined;
    utc: boolean;
    span: number;
    vertical: boolean;
    settings: any;
    fontSize: number;
    seam?: number;
    timeContext?: TimeContext;
}

export function planTemporalTicks({
    start, end, semanticType, utc, span, vertical, settings, fontSize, seam, timeContext,
}: TemporalTickLayout): TemporalTickPlan | undefined {
    if (!(end > start && span > 0)) return;
    if (['Month', 'Quarter', 'Week', 'Day', 'Hour', 'Time', 'YearWeek'].includes(semanticType ?? '')) return;
    const levels = TEMPORAL_LEVELS.map(level => ({ ...level, interval: utc ? level.utc : level.local }));
    const format = utc ? utcFormat : timeFormat;
    const minimumUnit = semanticType === 'Date' ? 'day'
        : semanticType === 'YearMonth' || semanticType === 'YearQuarter' ? 'month'
        : semanticType === 'Year' || semanticType === 'Decade' ? 'year' : 'millisecond';
    const minimumLevel = levels.findIndex(level => level.unit === minimumUnit);
    const dayLevel = levels.findIndex(level => level.unit === 'day');
    const month = levels[dayLevel + 1].interval;
    const monthsCrossed = month.count(new Date(start), new Date(end));
    let monthDayLabels = false;
    const ordinaryFormat = (level: number): string =>
        level === dayLevel && monthDayLabels ? '%b %-d' : levels[level].format;
    const minimumStep = semanticType === 'YearQuarter' ? 3 : semanticType === 'Decade' ? 10 : 1;
    const canvas = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    if (canvas) canvas.font = `${settings.labelFontStyle ?? 'normal'} ${settings.labelFontWeight ?? 'normal'} ${fontSize}px ${settings.labelFont ?? 'sans-serif'}`;
    const angle = (typeof settings.labelAngle === 'number' ? settings.labelAngle : 0) * Math.PI / 180;
    const host = canvas ? undefined : hostTextMeasurer()?.(fontSize, settings.labelFont ?? 'sans-serif', settings.labelFontWeight ?? 'normal', settings.labelFontStyle ?? 'normal');
    const textWidth = (text: string): number => canvas ? canvas.measureText(text).width : host ? host(text) : text.length * fontSize * 0.8;
    const extent = (text: string): number => {
        const width = textWidth(text);
        return vertical ? Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * fontSize
            : Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * fontSize;
    };
    const gap = typeof settings.labelSeparation === 'number' ? settings.labelSeparation : Math.round(fontSize * 0.6);
    const position = (value: number): number => (value - start) / (end - start) * span;
    const rank = (value: number, base: number): number => {
        for (let level = levels.length - 1; level > base; level--) {
            if (+levels[level].interval.floor(new Date(value)) === value) return level;
        }
        return base;
    };
    const boundaryFormat = (level: number, base: number): string => {
        if (base === dayLevel && monthDayLabels) {
            return levels[level].unit === 'year' ? '%Y' : ordinaryFormat(base);
        }
        if (level === base) return ordinaryFormat(base);
        const detail = base + 1;
        if (levels[level].unit === 'year') return levels[detail].context;
        if (level >= dayLevel && base < dayLevel) return levels[detail].context.replace(', %Y', '');
        if (levels[detail].unit === 'second' && level > detail) return '%H:%M:%S';
        return levels[detail].format;
    };
    let candidates: number[] = [];
    let base = minimumLevel;
    let cadence = 1;
    for (let level = minimumLevel; level < levels.length && candidates.length === 0; level++) {
        for (const step of levels[level].steps) {
            if (level === minimumLevel && step % minimumStep !== 0) continue;
            if (levels[level].interval.count(new Date(start), new Date(end)) / step > Math.max(2, span / fontSize)) continue;
            const interval = levels[level].unit === 'day' && step >= 7
                ? (utc ? utcWeek : timeWeek).every(step / 7)
                : levels[level].interval.every(step);
            if (!interval) continue;
            const ticks = interval.range(new Date(start), new Date(end + 1)).map(Number);
            if (!ticks.length) continue;
            monthDayLabels = false;
            if (level === dayLevel && monthsCrossed >= 2) {
                const repetitions = new Map<number, number>();
                for (const value of ticks) {
                    const period = +month.floor(new Date(value));
                    repetitions.set(period, (repetitions.get(period) ?? 0) + 1);
                }
                monthDayLabels = Math.max(...repetitions.values()) <= 5;
            }
            const ordinarySize = (value: number): number => extent(format(ordinaryFormat(level))(new Date(value)));
            const fits = ticks.every((value, index) => index === 0 || position(value) - position(ticks[index - 1])
                >= (ordinarySize(value) + ordinarySize(ticks[index - 1])) / 2 + gap);
            if (fits) {
                candidates = ticks;
                base = level;
                cadence = step;
                break;
            }
        }
    }
    if (!candidates.length) return;
    let startAnchor = +levels[minimumLevel].interval.ceil(new Date(start));
    if (levels[base].unit === 'day' && cadence > 1) {
        const day = levels[base].interval;
        const month = levels[base + 1].interval;
        let periodStart = day.ceil(new Date(start));
        const openingDays = day.count(periodStart, month.ceil(new Date(+periodStart + 1)));
        const openingStep = openingDays / Math.max(1, Math.round(openingDays / cadence));
        if (Math.abs(openingStep - cadence) > 2) periodStart = month.floor(periodStart);
        candidates = [];
        while (+periodStart <= end) {
            const periodEnd = month.ceil(new Date(+periodStart + 1));
            const days = day.count(periodStart, periodEnd);
            const divisions = Math.max(1, Math.round(days / cadence));
            for (let index = 0; index < divisions; index++) {
                const value = +day.offset(periodStart, Math.round(days * index / divisions));
                if (value >= start && value <= end) candidates.push(value);
            }
            periodStart = periodEnd;
        }
        startAnchor = candidates[0];
    }
    // The ticks of the base unit alone, before the larger periods' boundaries join them: a stacked axis's first row.
    const rowTicks = [...new Set(candidates)].sort((left, right) => left - right);
    for (let level = base + 1; level < levels.length; level++) {
        candidates.push(...levels[level].interval.range(new Date(start), new Date(end + 1)).map(Number));
    }
    if (startAnchor <= end) candidates.push(startAnchor);
    // Where a label must stay so that neighbouring panels' labels keep their gap: within half the
    // seam, less half that gap, past either end; anywhere without a neighbour.
    const room = seam === undefined ? Infinity : Math.max(0, (seam - gap) / 2);
    const lo = -room;
    const hi = span + room;
    const outside = (value: number, size: number): boolean => position(value) - size / 2 < lo || position(value) + size / 2 > hi;
    const choose = (anchor: number, from: number, walled: boolean) => {
        const ticks = [...new Set(candidates)].sort((left, right) => left - right).map(value => {
            const level = rank(value, base);
            const calendarLevel = rank(value, minimumLevel);
            const initial = value === anchor && calendarLevel < levels.length - 1;
            const pattern = initial ? levels[calendarLevel].context : boundaryFormat(level, base);
            const text = format(pattern)(new Date(value));
            const priority = initial ? Math.min(base, calendarLevel) + 0.5
                : base === dayLevel && monthDayLabels && levels[level].unit === 'month' ? base : level;
            return { value, pattern, text, priority, size: extent(text), initial, level: calendarLevel };
        });
        const selected: typeof ticks = [];
        for (const tick of [...ticks].sort((left, right) => right.priority - left.priority || left.value - right.value)) {
            if (tick.value < from) continue;
            if (tick.initial) {
                const parent = levels[Math.min(base + 1, levels.length - 1)].interval;
                const periodEnd = +parent.offset(parent.floor(new Date(tick.value)), 1);
                const hasYearContext = selected.some(other => other.level > base && levels[other.level].unit === 'year'
                    && other.value > tick.value && other.value <= periodEnd);
                if (hasYearContext) {
                    const floor = Math.max(base, tick.level);
                    tick.pattern = boundaryFormat(rank(tick.value, floor), floor);
                    tick.text = format(tick.pattern)(new Date(tick.value));
                    tick.size = extent(tick.text);
                }
            }
            if (walled && outside(tick.value, tick.size)) continue;
            if (selected.every(other => Math.abs(position(tick.value) - position(other.value)) >= (tick.size + other.size) / 2 + gap)) {
                selected.push(tick);
            }
        }
        return { ticks, selected };
    };
    const pick = (walled: boolean) => {
        let chosen = choose(startAnchor, -Infinity, walled);
        // An opening label crowded out (say a half-hour start beside the next full hour) would leave
        // the axis without its date; the earliest label that fits carries it instead — the next,
        // where that one would run past the axis's bounds.
        if (chosen.selected.length > 0 && chosen.ticks.some(tick => tick.initial) && !chosen.selected.some(tick => tick.initial)) {
            const fitting = chosen.selected.map(tick => tick.value).sort((left, right) => left - right);
            for (const first of fitting.slice(0, walled ? 4 : 1)) {
                const carried = choose(first, first, walled);
                chosen = carried;
                if (carried.selected.some(tick => tick.initial)) break;
            }
        }
        return chosen;
    };
    let { ticks, selected } = pick(false);
    // Every panel draws the same labels, so one's last label meets its neighbour's first across the
    // seam: how far each runs past its end of the axis, or (negative) falls short of it.
    const overhang = (side: 'start' | 'end'): number => Math.max(...selected.map(tick => side === 'start'
        ? tick.size / 2 - position(tick.value) : position(tick.value) + tick.size / 2 - span));
    const crossing = seam !== undefined && selected.length > 0 && overhang('start') + overhang('end') + gap > seam;
    const context = vertical || angle !== 0 ? 'inline' : timeContext ?? 'auto';
    if (context === 'stacked' || (context === 'auto' && crossing)) {
        const stacked = planStackedTicks();
        if (stacked) return stacked;
    }
    // Inline labels that would run into a neighbour's give way; the earliest that fits carries the context.
    if (crossing) ({ ticks, selected } = pick(true));
    selected.sort((left, right) => left.value - right.value);
    const expandMonth = (pattern: string): string =>
        pattern === '%b' || pattern === '%b %Y' ? pattern.replace('%b', '%B') : pattern;
    const expanded = selected.map(tick => {
        const pattern = expandMonth(tick.pattern);
        const text = format(pattern)(new Date(tick.value));
        return { value: tick.value, size: extent(text), width: textWidth(text), changed: pattern !== tick.pattern };
    });
    const labelLimit = typeof settings.labelLimit === 'number' ? settings.labelLimit : AXIS_LABEL_LIMIT;
    const fullMonthNames = expanded.every((tick, index) =>
        (!tick.changed || labelLimit <= 0 || tick.width <= labelLimit)
        && (!tick.changed || !outside(tick.value, tick.size))
        && (index === 0 || position(tick.value) - position(expanded[index - 1].value)
            >= (tick.size + expanded[index - 1].size) / 2 + gap));
    const labelPattern = (pattern: string): string => JSON.stringify(fullMonthNames ? expandMonth(pattern) : pattern);
    const formatter = utc ? 'utcFormat' : 'timeFormat';
    const boundaries = [
        ['', ''], ['%L', '000'], ['%S.%L', '00.000'], ['%M:%S.%L', '00:00.000'],
        ['%H:%M:%S.%L', '00:00:00.000'], ['%d %H:%M:%S.%L', '01 00:00:00.000'],
        ['%m-%d %H:%M:%S.%L', '01-01 00:00:00.000'],
    ];
    const boundaryExpr = (level: number, value: string): string =>
        `${formatter}(${value}, ${JSON.stringify(boundaries[level][0])}) === ${JSON.stringify(boundaries[level][1])}`;
    const patternExpr = (floor: number, context: boolean): string => {
        let pattern = labelPattern(context ? levels[floor].context : ordinaryFormat(floor));
        for (let level = floor + 1; level < levels.length; level++) {
            const promoted = context ? levels[level].context : boundaryFormat(level, floor);
            pattern = `(${boundaryExpr(level, 'datum.value')} ? ${labelPattern(promoted)} : ${pattern})`;
        }
        return pattern;
    };
    let pattern = patternExpr(base, false);
    const initial = selected.find(tick => tick.initial);
    if (initial) {
        const parent = levels[Math.min(base + 1, levels.length - 1)].interval;
        const periodEnd = +parent.offset(parent.floor(new Date(initial.value)), 1);
        const yearContext = selected.filter(tick => tick.level > base && levels[tick.level].unit === 'year'
            && tick.value > initial.value && tick.value <= periodEnd)
            .map(tick => `(${boundaryExpr(levels.length - 1, String(tick.value))})`).join(' || ') || 'false';
        pattern = `(toNumber(datum.value) === ${initial.value} && !(${yearContext}) ? ${patternExpr(minimumLevel, true)} : ${pattern})`;
    }
    const labels = Object.fromEntries(selected.map(tick => [tick.value, true]));
    return {
        values: ticks.map(tick => new Date(tick.value).toISOString()),
        labels: Object.fromEntries(selected.map(tick =>
            [tick.value, format(fullMonthNames ? expandMonth(tick.pattern) : tick.pattern)(new Date(tick.value))])),
        labelExpr: `(${JSON.stringify(labels)})[toString(toNumber(datum.value))] ? ${formatter}(datum.value, ${pattern}) : ''`,
        labelOverlap: false,
        labelFlush: false,
        stacked: false,
        offsets: {},
    };

    /**
     * Two rows: the ticks in the base unit, all in one short form, and under them the period each
     * run of ticks falls in — the month over days, the year over months, the date over hours —
     * named where the axis starts, with its year, and again where the period changes. A label
     * centred on its tick moves inward to stay within the axis's bounds; a period name runs from
     * its tick label's left edge into the plot, in the longest form that fits before the next one.
     * Undefined for a year axis, or where the opening period finds no room.
     */
    function planStackedTicks(): TemporalTickPlan | undefined {
        const yearLevel = levels.length - 1;
        if (base >= yearLevel) return;
        const parentLevel = base < dayLevel ? dayLevel : base + 1;
        const parent = levels[parentLevel].interval;
        const year = levels[yearLevel].interval;
        const rowPattern = (value: number): string => {
            if (base >= dayLevel) return levels[base].format;
            const level = Math.min(rank(value, base), dayLevel - 1);
            return level === base ? levels[base].format : boundaryFormat(level, base);
        };
        const periodPatterns = (withYear: boolean): string[] => parentLevel === yearLevel ? ['%Y']
            : levels[parentLevel].unit === 'month' ? (withYear ? ['%B %Y', '%b %Y', '%b'] : ['%B', '%b'])
            : withYear ? ['%b %-d, %Y', '%b %-d'] : ['%b %-d'];
        type RowTick = { value: number; pattern: string; width: number; left: number; period?: string };
        // The row thins evenly — every tick, every other one, … — rather than losing single labels where they crowd.
        const rowAt = (stride: number): RowTick[] | undefined => {
            const out: RowTick[] = [];
            for (let index = 0; index < rowTicks.length; index += stride) {
                const value = rowTicks[index];
                const pattern = rowPattern(value);
                const width = textWidth(format(pattern)(new Date(value)));
                const left = Math.min(Math.max(position(value) - width / 2, lo), hi - width);
                const previous = out[out.length - 1];
                if (previous && left < previous.left + previous.width + gap) return undefined;
                out.push({ value, pattern, width, left });
            }
            return out;
        };
        let row: RowTick[] | undefined;
        for (let stride = 1; stride <= rowTicks.length && !row; stride++) row = rowAt(stride);
        if (!row?.length) return;
        let periodEnd = -Infinity;
        let lastPeriod = NaN;
        let shownYear = NaN;
        for (const [index, tick] of row.entries()) {
            const date = new Date(tick.value);
            const period = +parent.floor(date);
            if (index > 0 && period === lastPeriod) continue;
            lastPeriod = period;
            const tickYear = +year.floor(date);
            for (const candidate of periodPatterns(index === 0 || tickYear !== shownYear)) {
                const width = textWidth(format(candidate)(date));
                if (tick.left >= periodEnd + gap && tick.left + Math.max(width, tick.width) <= hi) {
                    tick.period = candidate;
                    periodEnd = tick.left + width;
                    shownYear = tickYear;
                    break;
                }
            }
            if (index === 0 && !tick.period) return;
        }
        const key = 'toString(toNumber(datum.value))';
        const lookup = `(${JSON.stringify(Object.fromEntries(row.map(tick =>
            [tick.value, tick.period ? [tick.pattern, tick.period] : [tick.pattern]])))})[${key}]`;
        const formatter = utc ? 'utcFormat' : 'timeFormat';
        const line = (index: number): string => `${formatter}(datum.value, ${lookup}[${index}])`;
        const centred = (tick: typeof row[number]): boolean =>
            !tick.period && Math.abs(tick.left - (position(tick.value) - tick.width / 2)) < 0.01;
        return {
            values: rowTicks.map(value => new Date(value).toISOString()),
            labels: Object.fromEntries(row.map(tick => {
                const date = new Date(tick.value);
                const text = format(tick.pattern)(date);
                return [tick.value, tick.period ? [text, format(tick.period)(date)] : text];
            })),
            labelExpr: `${lookup} ? (${lookup}[1] ? [${line(0)}, ${line(1)}] : ${line(0)}) : ''`,
            labelOverlap: false,
            labelFlush: false,
            stacked: true,
            offsets: Object.fromEntries(row.filter(tick => !centred(tick))
                .map(tick => [tick.value, Math.round((tick.left - position(tick.value)) * 10) / 10])),
        };
    }
}

/** The height a time axis's second row takes: one line of its labels, which Vega sets a font size and 2px apart. */
export function timeRowRoom(fontSize: number): number {
    return Math.ceil(fontSize + 2);
}

/**
 * Whether a horizontal time axis over `field` sets its periods on a second row: where the theme
 * asks for it (`stacked`), or, under `auto`, where its inline labels would run into those of a panel
 * set beside it across `seam`. False where the axis plans no calendar ticks.
 */
export function timeAxisStacks(inputs: {
    rows: readonly Record<string, unknown>[];
    field: string;
    semanticType: string | undefined;
    span: number;
    seam: number | undefined;
    fontSize: number;
    settings: Record<string, unknown>;
    timeContext: TimeContext | undefined;
}): boolean {
    if (inputs.timeContext === 'inline' || (inputs.timeContext !== 'stacked' && inputs.seam === undefined)) return false;
    let start = Infinity;
    let end = -Infinity;
    let utc = true;
    for (const row of inputs.rows) {
        const value = row[inputs.field];
        if (value == null) continue;
        const date = new Date(value as string | number);
        const time = +date;
        if (!Number.isFinite(time)) continue;
        start = Math.min(start, time);
        end = Math.max(end, time);
        if (date.getUTCHours() || date.getUTCMinutes() || date.getUTCSeconds() || date.getUTCMilliseconds()) utc = false;
    }
    return planTemporalTicks({
        start, end, utc, semanticType: inputs.semanticType, span: inputs.span, vertical: false,
        settings: inputs.settings, fontSize: inputs.fontSize, seam: inputs.seam, timeContext: inputs.timeContext,
    })?.stacked === true;
}
