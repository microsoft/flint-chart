/**
 * Type-guided temporal parsers: when a field's semantic type says what grain its
 * values carry, read the common spellings of that grain into one canonical string
 * (`YYYY-MM` for a YearMonth, `YYYY-MM-DD` for a Date). Untyped fields are never
 * touched, so a number like 202501 stays a number unless the author called it a
 * YearMonth.
 */

const MONTH_NUMBER: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Full names, three-letter abbreviations, "Sept", with an optional trailing period.
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const SEP = '[\\s\\-/._,]*';
const YEAR = '(\\d{4})';
const SHORT_YEAR = "'?(\\d{2})";
const ORDINAL = '(?:st|nd|rd|th)?';

const re = (source: string) => new RegExp(`^${source}$`, 'i');

const monthOf = (name: string) => MONTH_NUMBER[name.slice(0, 3).toLowerCase()];
const fullYear = (twoDigits: string) => {
    const n = Number(twoDigits);
    return n <= 49 ? 2000 + n : 1900 + n;
};
const pad = (n: number) => String(n).padStart(2, '0');

function yearMonth(year: number, month: number): string | null {
    if (!Number.isInteger(year) || year < 1000 || year > 2999) return null;
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    return `${year}-${pad(month)}`;
}

function date(year: number, month: number, day: number): string | null {
    const ym = yearMonth(year, month);
    if (!ym || !Number.isInteger(day) || day < 1) return null;
    // Rejects 2025-02-30 and the like.
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day) return null;
    return `${ym}-${pad(day)}`;
}

type Parser = [RegExp, (m: RegExpMatchArray) => string | null];

const YEAR_MONTH_PARSERS: Parser[] = [
    // 202501
    [re('(\\d{4})(\\d{2})'), (m) => yearMonth(+m[1], +m[2])],
    // 2025-1, 2025/01, 2025.01, 2025 01
    [re(`${YEAR}[\\-/. ](\\d{1,2})`), (m) => yearMonth(+m[1], +m[2])],
    // 2025M01 (statistical-office style)
    [re(`${YEAR}\\s*M(\\d{1,2})`), (m) => yearMonth(+m[1], +m[2])],
    // 01/2025, 1-2025, 01.2025
    [re(`(\\d{1,2})[\\-/. ]${YEAR}`), (m) => yearMonth(+m[2], +m[1])],
    // 2025-Jul, 2025 July, 2025Jul
    [re(`${YEAR}${SEP}${MONTH}`), (m) => yearMonth(+m[1], monthOf(m[2]))],
    // Jul-2025, July 2025, Jul2025, July, 2025
    [re(`${MONTH}${SEP}${YEAR}`), (m) => yearMonth(+m[2], monthOf(m[1]))],
    // Jul-25, Jul '25
    [re(`${MONTH}[\\s\\-/.]*${SHORT_YEAR}`), (m) => yearMonth(fullYear(m[2]), monthOf(m[1]))],
];

const DATE_PARSERS: Parser[] = [
    // 20250115
    [re('(\\d{4})(\\d{2})(\\d{2})'), (m) => date(+m[1], +m[2], +m[3])],
    // 2025/01/15, 2025.1.15 (dashes already parse as ISO)
    [re(`${YEAR}[/.](\\d{1,2})[/.](\\d{1,2})`), (m) => date(+m[1], +m[2], +m[3])],
    // 2025-Jan-15, 2025 January 15
    [re(`${YEAR}${SEP}${MONTH}${SEP}(\\d{1,2})${ORDINAL}`), (m) => date(+m[1], monthOf(m[2]), +m[3])],
    // Jan 15, 2025; January 15th 2025; Jan-15-2025
    [re(`${MONTH}${SEP}(\\d{1,2})${ORDINAL}${SEP}${YEAR}`), (m) => date(+m[3], monthOf(m[1]), +m[2])],
    // 15 Jan 2025, 15-Jan-2025, 15th January, 2025
    [re(`(\\d{1,2})${ORDINAL}${SEP}${MONTH}${SEP}${YEAR}`), (m) => date(+m[3], monthOf(m[2]), +m[1])],
];

const PARSERS_BY_TYPE: Record<string, Parser[]> = {
    YearMonth: YEAR_MONTH_PARSERS,
    Date: DATE_PARSERS,
    DateTime: DATE_PARSERS,
};

/** Whether the semantic type has spellings {@link parseTemporalByType} reads. */
export function hasTemporalParsers(semanticType: string): boolean {
    return semanticType in PARSERS_BY_TYPE;
}

const ISO_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/**
 * An ISO timestamp as Flint reads it, or null for any other value. Under a calendar grain (a year,
 * quarter, month or date), a timestamp at midnight is that date, as a database `DATE` column
 * serialised to JSON writes it (`2005-05-01T00:00:00.000`), whatever its zone. A timestamp with no
 * zone is read in UTC, as a date-only value is, so it lands on the same instant on every machine;
 * one with a zone is kept as written.
 */
export function readIsoTimestamp(value: unknown, calendarGrain: boolean): string | null {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(ISO_TIMESTAMP);
    if (!match) return null;
    const [, day, hours, minutes, seconds = '00', fraction = '', zone] = match;
    const midnight = Number(hours) === 0 && Number(minutes) === 0 && Number(seconds) === 0 && !/[1-9]/.test(fraction);
    if (calendarGrain && midnight) return day;
    if (zone) return null;
    return `${day}T${hours}:${minutes}:${seconds}${fraction}Z`;
}

/**
 * The canonical string for a value of the given temporal semantic type, or null when
 * the type has no parsers or the value is not one of its spellings (the caller keeps
 * its usual handling then).
 */
export function parseTemporalByType(value: unknown, semanticType: string): string | null {
    const parsers = PARSERS_BY_TYPE[semanticType];
    if (!parsers) return null;
    if (typeof value === 'number') {
        if (!Number.isInteger(value)) return null;
        value = String(value);
    }
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!text) return null;
    for (const [pattern, read] of parsers) {
        const match = text.match(pattern);
        if (match) {
            const out = read(match);
            if (out) return out;
        }
    }
    return null;
}
