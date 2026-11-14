/**
 * Sequence axes: category names that step regularly — times, dates, months, years, ranks — so a
 * reader can tell a name left out from its neighbours (16:40 … 16:50 holds 16:45). Only these may
 * be thinned, and they are thinned to round values (16:45, 17:00; 1990, 1995; Jan, Apr, Jul, Oct),
 * as a time or linear scale places its ticks, not to every nth band.
 */

/** How a sequence's values step, which decides the round intervals its names may be thinned to. */
export type SequenceKind = 'minute' | 'hour' | 'day' | 'month' | 'monthOfYear' | 'quarter' | 'year' | 'number' | 'cycle';

const KIND_OF: Record<string, SequenceKind> = {
    Time: 'minute', DateTime: 'minute', Hour: 'hour', Date: 'day',
    YearMonth: 'month', Month: 'monthOfYear', YearQuarter: 'quarter', Quarter: 'cycle',
    Year: 'year', Decade: 'year', Rank: 'number', Week: 'cycle', YearWeek: 'cycle', Day: 'cycle',
};

/** The round intervals of each kind, in its own units, from finest to coarsest. */
const ROUND: Record<SequenceKind, readonly number[]> = {
    minute: [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440],
    hour: [1, 2, 3, 6, 12, 24],
    day: [1, 2, 7, 14, 28],
    month: [1, 2, 3, 6, 12, 24, 60, 120],
    monthOfYear: [1, 2, 3, 6],
    quarter: [1, 2, 4, 8, 20, 40],
    year: [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000],
    number: [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000],
    cycle: [1, 2, 3, 4, 5, 7, 10],
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Whether a semantic type names a sequence: values a reader can interpolate between. */
export function sequenceKindOf(semanticType: string | undefined): SequenceKind | undefined {
    return semanticType ? KIND_OF[semanticType] : undefined;
}

function valueOf(kind: SequenceKind, name: string): number {
    const text = name.trim();
    const digits = (): number => Number(text.match(/-?\d+(\.\d+)?/)?.[0] ?? NaN);
    switch (kind) {
        case 'minute': {
            const time = text.match(/(\d{1,2}):(\d{2})/);
            if (time) return Number(time[1]) * 60 + Number(time[2]);
            const parsed = Date.parse(text);
            return Number.isFinite(parsed) ? Math.round(parsed / 60000) : NaN;
        }
        case 'hour': {
            const time = text.match(/^(\d{1,2})(:00)?/);
            return time ? Number(time[1]) : NaN;
        }
        case 'day': {
            const parsed = Date.parse(text);
            return Number.isFinite(parsed) ? Math.round(parsed / 86_400_000) : NaN;
        }
        case 'month': {
            const iso = text.match(/^(\d{4})-(\d{1,2})/);
            if (iso) return Number(iso[1]) * 12 + Number(iso[2]) - 1;
            const parsed = new Date(Date.parse(text));
            return Number.isFinite(parsed.getTime()) ? parsed.getFullYear() * 12 + parsed.getMonth() : NaN;
        }
        case 'monthOfYear': {
            const index = MONTHS.indexOf(text.slice(0, 3).toLowerCase());
            return index >= 0 ? index : digits() - 1;
        }
        case 'quarter': {
            const match = text.match(/(\d{4})\D*Q?([1-4])$/i) ?? text.match(/Q([1-4])\D*(\d{4})/i);
            if (!match) return NaN;
            const [year, quarter] = match[1].length === 4 ? [match[1], match[2]] : [match[2], match[1]];
            return Number(year) * 4 + Number(quarter) - 1;
        }
        case 'cycle': {
            const day = WEEKDAYS.indexOf(text.slice(0, 3).toLowerCase());
            return day >= 0 ? day : digits();
        }
        default:
            return digits();
    }
}

/**
 * Of `names`, those on the round interval `shown` was thinned to. A thinning chosen over a window
 * of the names (a category rail's first window) carries to all of them; undefined where `shown`
 * holds fewer than two values to read the interval from.
 */
export function onRoundInterval(kind: SequenceKind, shown: readonly string[], names: readonly string[]): string[] | undefined {
    const marks = [...new Set(shown.map((name) => valueOf(kind, name)))].sort((a, b) => a - b);
    if (marks.length < 2 || marks.some((value) => !Number.isFinite(value))) return undefined;
    let interval = Infinity;
    for (let i = 1; i < marks.length; i++) interval = Math.min(interval, marks[i] - marks[i - 1]);
    if (!(interval > 0)) return undefined;
    return names.filter((name) => {
        const value = valueOf(kind, name);
        return Number.isFinite(value) && (((value - marks[0]) % interval) + interval) % interval === 0;
    });
}

/**
 * The names a sequence axis prints when every name cannot: those on the finest round interval
 * whose labels stand `needed` px apart across bands `band` px wide, where at least two land, and
 * how many bands apart they stand. The names are read as values in the axis's own units (minutes,
 * months, years …); undefined where any name does not read as one, or no round interval prints two.
 */
export function roundSkip(kind: SequenceKind, names: readonly string[], band: number, needed: number): { shown: string[]; spacing: number } | undefined {
    const values = names.map((name) => valueOf(kind, name));
    if (values.some((value) => !Number.isFinite(value))) return undefined;
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    let unit = Infinity;
    for (let i = 1; i < sorted.length; i++) unit = Math.min(unit, sorted[i] - sorted[i - 1]);
    if (!Number.isFinite(unit) || unit <= 0) return undefined;
    for (const interval of ROUND[kind]) {
        if (interval < unit || interval % unit !== 0) continue;
        if ((interval / unit) * band < needed) continue;
        const shown = names.filter((_, i) => ((values[i] % interval) + interval) % interval === 0);
        if (shown.length >= 2) return { shown, spacing: interval / unit };
        break;
    }
    return undefined;
}
