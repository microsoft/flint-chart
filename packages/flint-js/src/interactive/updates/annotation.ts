import type {
    AnnotationCandidate,
    AnnotationConnection,
    ChartUpdatePresenter,
    InteractionContext,
    SemanticElement,
} from '../interactions';

export function annotationCandidates(
    ...connections: readonly AnnotationConnection[]
): readonly AnnotationCandidate[] {
    return connections.map((connection, priority) => ({
        connection,
        priority,
    }));
}

export function valueEndAnnotationCandidates(
    valueAxis: 'x' | 'y',
    ...fallbacks: readonly AnnotationConnection[]
): readonly AnnotationCandidate[] {
    return [
        { connection: 'value-end', valueAxis, priority: 0 },
        ...fallbacks.map((connection, index) => ({ connection, priority: index + 1 })),
    ];
}

export function lollipopAnnotationCandidates(
    valueAxis: 'x' | 'y',
): readonly AnnotationCandidate[] {
    const sideConnections: readonly AnnotationConnection[] = valueAxis === 'y'
        ? ['right', 'left']
        : ['top', 'bottom'];
    return [
        { connection: 'value-end', valueAxis, anglePreference: 'oblique', priority: 0 },
        ...sideConnections.map((connection, index) => ({
            connection,
            anglePreference: 'oblique' as const,
            priority: index + 1,
        })),
    ];
}

export function barAnnotationCandidates(
    valueAxis: 'x' | 'y',
): readonly AnnotationCandidate[] {
    return [
        { connection: 'value-end', valueAxis, priority: 0 },
        { connection: 'value-side', valueAxis, crossSide: 'start', valueInset: 1 / 8, priority: 1 },
        { connection: 'value-side', valueAxis, crossSide: 'end', valueInset: 1 / 8, priority: 1 },
    ];
}

export function presentAnnotationUpdate(
    presentAnnotation: (
        element: SemanticElement,
        context: InteractionContext,
        visual?: Partial<import('../../core/interaction-semantics').SemanticTarget['visual']>,
    ) => AnnotationCandidate | readonly AnnotationCandidate[],
    formatAnnotation: (
        element: SemanticElement,
        context: InteractionContext,
        visual?: Partial<import('../../core/interaction-semantics').SemanticTarget['visual']>,
    ) => string | undefined = defaultAnnotationText,
    markType?: string,
): ChartUpdatePresenter {
    return (update, context) => ({
        ops: update.ops.flatMap((op) => {
            if (op.op !== 'annotate') return op;
            const presentation = presentAnnotation(op.element, context, op.visual);
            const text = op.text ?? formatAnnotation(op.element, context, op.visual);
            if (!text) return [];
            return {
                op: 'render-annotation',
                element: op.element,
                annotation: {
                    text,
                    candidates: Array.isArray(presentation) ? presentation : [presentation],
                    subject: op.visual,
                    ...(markType ? { markType } : {}),
                },
            };
        }),
    });
}

export const suppressAnnotationUpdate: ChartUpdatePresenter = (update) => ({
    ops: update.ops.filter((op) => op.op !== 'annotate'),
});

function displayValue(field: string | undefined, value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    if (value instanceof Date) return value.toLocaleString();
    if (typeof value === 'number' && Number.isFinite(value)) {
        if (field && /date|time|start|end/i.test(field)) {
            const date = new Date(value);
            if (date.getFullYear() >= 1900 && date.getFullYear() <= 2200) {
                return date.toLocaleDateString();
            }
        }
        return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);
    }
    return String(value);
}

export function rangeAnnotationText(
    startField: string | undefined,
    endField: string | undefined,
): (element: SemanticElement) => string | undefined {
    return (element) => {
        if (!startField || !endField) return undefined;
        const record = element.records?.[0] ?? element.value ?? {};
        const start = displayValue(startField, record[startField]);
        const end = displayValue(endField, record[endField]);
        return start && end ? `${start} → ${end}` : start ?? end;
    };
}

export function transitionAnnotationText(
    field: string | undefined,
): (element: SemanticElement) => string | undefined {
    return (element) => {
        if (!field) return undefined;
        const records = element.records ?? (element.value ? [element.value] : []);
        const start = displayValue(field, records[0]?.[field]);
        const end = displayValue(field, records[1]?.[field]);
        return start && end ? `${start} → ${end}` : start ?? end;
    };
}

export function seriesValuesAnnotationText(
    seriesField: string | undefined,
    valueField: string | undefined,
): (element: SemanticElement) => string | undefined {
    return (element) => {
        if (!seriesField || !valueField) return undefined;
        const records = element.records ?? (element.value ? [element.value] : []);
        const values = records.flatMap((record) => {
            const series = displayValue(seriesField, record[seriesField]);
            const value = displayValue(valueField, record[valueField]);
            return series && value ? [`${series}: ${value}`] : [];
        });
        return values.length > 0 ? [...new Set(values)].join(', ') : undefined;
    };
}

export function categoryValueAnnotationText(
    categoryField: string | undefined,
    valueField: string | undefined,
): (element: SemanticElement) => string | undefined {
    return (element) => {
        const record = element.records?.[0] ?? element.value ?? {};
        const category = displayValue(categoryField, categoryField ? record[categoryField] : undefined);
        const value = displayValue(valueField, valueField ? record[valueField] : undefined);
        return category && value ? `${category}: ${value}` : category ?? value;
    };
}

export function valueAnnotationText(
    valueField: string | undefined,
): (element: SemanticElement) => string | undefined {
    return (element) => {
        if (!valueField) return undefined;
        const record = element.records?.[0] ?? element.value ?? {};
        return displayValue(valueField, record[valueField]);
    };
}

function defaultAnnotationText(element: SemanticElement, context: InteractionContext): string | undefined {
    const record = element.records?.[0] ?? element.value ?? {};
    const candidates = Object.entries(record).filter(([field, value]) => !field.startsWith('__')
        && field !== context.categoryField && field !== context.seriesField
        && value !== null && value !== undefined);
    const selected = [...candidates].reverse().find(([, value]) => typeof value === 'number' && Number.isFinite(value))
        ?? candidates[candidates.length - 1];
    return displayValue(selected?.[0], selected?.[1]);
}

export function countAnnotationText(element: SemanticElement): string | undefined {
    const record = element.records?.[0] ?? element.value ?? {};
    const count = Object.entries(record).find(([field, value]) => /count/i.test(field)
        && typeof value === 'number' && Number.isFinite(value));
    return displayValue(count?.[0], count?.[1]);
}
