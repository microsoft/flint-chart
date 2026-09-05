import type { SemanticElement } from '../interactions';

function fieldValue(element: SemanticElement, field: string): unknown {
    const record = element.records?.[0];
    return record && Object.prototype.hasOwnProperty.call(record, field) ? record[field] : undefined;
}

function fieldKey(element: SemanticElement, fields: readonly string[]): readonly unknown[] | undefined {
    const values = fields.map((field) => fieldValue(element, field));
    return values.some((value) => value === undefined) ? undefined : values;
}

function sameKey(left: readonly unknown[], right: readonly unknown[]): boolean {
    return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}

export function expandElementsByFields(
    source: readonly SemanticElement[],
    available: readonly SemanticElement[] | undefined,
    fields: string | readonly string[],
): readonly SemanticElement[] {
    const fieldList = typeof fields === 'string' ? [fields] : fields;
    if (fieldList.length === 0 || !available?.length) return source;
    const keys = source.map((element) => fieldKey(element, fieldList))
        .filter((key): key is readonly unknown[] => key !== undefined);
    if (keys.length === 0) return source;
    const cohort = available.filter((element) => {
        const candidate = fieldKey(element, fieldList);
        return candidate !== undefined && keys.some((key) => sameKey(candidate, key));
    });
    return cohort.length > 0 ? cohort : source;
}