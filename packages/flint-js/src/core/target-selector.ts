/**
 * The condition an update target selects marks by. A `key` names one combination of values; a
 * `where` describes a set, field by field, in the vocabulary filters use: `{ in: [...] }` or
 * `{ range: [low, high] }`. A key is the `where` whose every field is `in` one value, so both
 * compile to one predicate and match by one rule.
 */
import type { SemanticAnnotation } from './field-semantics';
import type { FilterValue, SemanticTargetSelector } from './interaction-contracts';
import { temporalFieldValue } from './resolve-semantics';

/** Each field's condition, a key's values read as one-value sets. */
export function selectorConditions(selector: SemanticTargetSelector): [string, FilterValue][] {
    const select = selector.select;
    if ('where' in select) return Object.entries(select.where);
    return Object.entries(select.key).map(([field, value]) => [field, { in: [value] }]);
}

/** Whether the selector describes a set of marks rather than naming one. */
export function isWhereSelector(selector: SemanticTargetSelector): boolean {
    return 'where' in selector.select;
}

/** A comparable number: numbers as they are, dates as time, booleans as 0 and 1, numeric and date strings parsed. */
export function conditionNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
        const time = Date.parse(trimmed);
        return Number.isNaN(time) ? Number.NaN : time;
    }
    return Number.NaN;
}

/**
 * The selector as a test on a mark's values, or null when it selects nothing: no condition, or a
 * field the marks do not carry. `normalize` reads a written value the way the marks hold it, as
 * temporal fields hold time; a set member must then equal the mark's value exactly, as a key's
 * value does, and a range holds its ends.
 */
/**
 * A number and the same number written as text are one member: a field drawn as categories (a year
 * on a banded axis) carries its values as text, while the author's key names them as numbers.
 */
function sameMember(value: unknown, member: unknown): boolean {
    if (Object.is(value, member)) return true;
    if (typeof value === 'number' && typeof member === 'string') return member.trim() !== '' && Number(member) === value;
    if (typeof value === 'string' && typeof member === 'number') return value.trim() !== '' && Number(value) === member;
    return false;
}

export function selectorPredicate(
    selector: SemanticTargetSelector,
    declaredFields: readonly string[],
    normalize: (field: string, value: unknown) => unknown = (_field, value) => value,
): ((value: Readonly<Record<string, unknown>>) => boolean) | null {
    const conditions = selectorConditions(selector);
    if (conditions.length === 0 || conditions.some(([field]) => !declaredFields.includes(field))) return null;
    const tests = conditions.map(([field, condition]): ((value: Readonly<Record<string, unknown>>) => boolean) => {
        if ('in' in condition) {
            const members = condition.in.map((member) => normalize(field, member));
            return (value) => members.some((member) => sameMember(value[field], member));
        }
        const low = conditionNumber(normalize(field, condition.range[0]));
        const high = conditionNumber(normalize(field, condition.range[1]));
        return (value) => {
            const number = conditionNumber(value[field]);
            return !Number.isNaN(number)
                && (Number.isNaN(low) || number >= low)
                && (Number.isNaN(high) || number <= high);
        };
    });
    return (value) => tests.every((test) => test(value));
}

/** How a chart reads its rows' values: the fields it reads as time, and the semantic types that parse them. */
export interface RowComparison {
    temporalFields: readonly string[];
    semanticTypes: Record<string, string | SemanticAnnotation>;
}

/** A value as the chart compares it: a field it reads as time by its time in epoch ms, the rest as written. */
export function comparableValue(comparison: RowComparison, field: string, value: unknown): unknown {
    return comparison.temporalFields.includes(field) ? temporalFieldValue(field, value, comparison.semanticTypes) : value;
}

/**
 * The selector as a test on data rows as the author wrote them, each value compared as the chart
 * compares it; null where {@link selectorPredicate} is.
 */
export function selectorRowTest(
    selector: SemanticTargetSelector,
    declaredFields: readonly string[],
    comparison: RowComparison,
): ((row: Readonly<Record<string, unknown>>) => boolean) | null {
    const compare = (field: string, value: unknown) => comparableValue(comparison, field, value);
    const test = selectorPredicate(selector, declaredFields, compare);
    if (!test) return null;
    const named = selectorConditions(selector).map(([field]) => field);
    return (row) => test(Object.fromEntries(named.map((field) => [field, compare(field, row[field])])));
}

function cell(value: unknown): string {
    if (value === null || value === undefined) return String(value);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

/** The selector in words: `origin = Japan, cylinders = 4` for a key, `region in [Asia, Europe] and month from 2025-03 to 2025-06` for a set. */
export function selectorText(selector: SemanticTargetSelector): string {
    const select = selector.select;
    if (!('where' in select)) return Object.entries(select.key).map(([field, value]) => `${field} = ${cell(value)}`).join(', ');
    return Object.entries(select.where).map(([field, condition]) => ('in' in condition
        ? `${field} in [${condition.in.map(cell).join(', ')}]`
        : `${field} from ${cell(condition.range[0])} to ${cell(condition.range[1])}`)).join(' and ');
}
