import type {
    RenderHit,
    LegendTargetValue,
    SemanticElement,
    SemanticResolveContext,
    SemanticResolveEvent,
    SemanticTarget,
} from './interaction-contracts';

export type {
    ChartInteractionResolver,
    RenderHit,
    LegendDomain,
    LegendTargetValue,
    SemanticElement,
    SemanticResolveContext,
    SemanticResolveEvent,
    SemanticTarget,
} from './interaction-contracts';

export type SemanticVisualFamily = 'legend' | 'axis' | 'facet' | 'annotation' | 'element';

export function semanticVisualFamily(role: string | undefined): SemanticVisualFamily {
    if (role?.startsWith('legend-')) return 'legend';
    if (role?.startsWith('axis-')) return 'axis';
    if (role?.startsWith('facet-')) return 'facet';
    if (role?.startsWith('annotation')) return 'annotation';
    return 'element';
}

/** Neutral hover ink that blends with the mark instead of reading as a hard outline. */
export const MUTED_HOVER_STROKE = 'rgba(71, 82, 92, 0.58)';
export const MUTED_HOVER_FILL = '#eef1f3';

const renderKeysByElement = new WeakMap<SemanticElement, readonly string[]>();

export function semanticElementRenderKeys(element: SemanticElement): readonly string[] {
    return renderKeysByElement.get(element) ?? [];
}

export function associateSemanticElementRenderKeys(
    element: SemanticElement,
    renderKeys: readonly string[],
): SemanticElement {
    renderKeysByElement.set(element, [...new Set(renderKeys)]);
    return element;
}

function withoutRenderIdentity(
    datum: Record<string, unknown>,
    keyField: string,
): Record<string, unknown> {
    return Object.fromEntries(Object.entries(datum).filter(([field]) =>
        field !== keyField && !field.startsWith('__flint_interaction_') && field !== '_vgsid_'));
}

export function sourceRecordsForRenderedRecords(
    renderedRecords: readonly Record<string, unknown>[],
    sourceRecords: readonly Record<string, unknown>[],
    provenanceFields: readonly string[],
    temporalFields: readonly string[] = [],
    rangeProvenance: readonly {
        field: string;
        startField: string;
        endField: string;
    }[] = [],
): readonly Record<string, unknown>[] {
    const temporal = new Set(temporalFields);
    const temporalValue = (value: unknown): number | undefined => {
        if (value instanceof Date) return value.getTime();
        if (typeof value === 'number') {
            return Number.isInteger(value) && value >= 1000 && value <= 9999
                ? Date.UTC(value, 0, 1)
                : value;
        }
        if (typeof value !== 'string') return undefined;
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? undefined : parsed;
    };
    const sameValue = (field: string, left: unknown, right: unknown): boolean => {
        if (Object.is(left, right)) return true;
        if (!temporal.has(field)) return false;
        const leftTime = temporalValue(left);
        const rightTime = temporalValue(right);
        return leftTime !== undefined && rightTime !== undefined && leftTime === rightTime;
    };
    return sourceRecords.filter((sourceRecord) => renderedRecords.some((renderedRecord) => {
        const sourceFields = provenanceFields.filter((field) => field in sourceRecord);
        const equalityMatches = provenanceFields.length === 0 || (sourceFields.length > 0
            && sourceFields.every((field) =>
                field in renderedRecord && sameValue(field, sourceRecord[field], renderedRecord[field])));
        if (!equalityMatches) return false;
        return rangeProvenance.every(({ field, startField, endField }) => {
            const value = sourceRecord[field];
            const start = renderedRecord[startField];
            const end = renderedRecord[endField];
            if (typeof value !== 'number' || typeof start !== 'number' || typeof end !== 'number') return false;
            return value >= start && value < end;
        });
    }));
}

export function elementsFromHits(hits: readonly RenderHit[], keyField: string): SemanticElement[] {
    const seen = new Set<string>();
    const elements: SemanticElement[] = [];
    for (const hit of hits) {
        const key = hit.datum[keyField];
        if (typeof key !== 'string' || seen.has(key)) continue;
        seen.add(key);
        const records = (hit.endDatum ? [hit.datum, hit.endDatum] : [hit.datum])
            .map((datum) => withoutRenderIdentity(datum, keyField));
        elements.push(associateSemanticElementRenderKeys({
            value: withoutRenderIdentity(hit.datum, keyField),
            records,
        }, [key]));
    }
    return elements;
}

export function fieldsFromEncodingChannels(
    resolvedEncodings: Readonly<Record<string, any>>,
    channels: readonly string[],
    additionalFields: readonly string[] = [],
): string[] {
    return [...new Set([
        ...channels.map((channel) => resolvedEncodings[channel]?.field).filter(Boolean),
        ...additionalFields,
    ])];
}

export function firstDiscreteEncodingField(
    resolvedEncodings: Readonly<Record<string, any>>,
    channels: readonly string[],
): string | undefined {
    return channels
        .map((channel) => resolvedEncodings[channel])
        .find((encoding) => encoding?.field && (encoding.type === 'nominal' || encoding.type === 'ordinal'))
        ?.field;
}

export function legendMatchedHits(
    event: SemanticResolveEvent,
    context: SemanticResolveContext,
    field: string,
): RenderHit[] {
    const domain = event.legend?.domain;
    if (!domain) return [];
    const matches = (datum: Record<string, unknown>): boolean => {
            if (domain.kind === 'value') return datum[field] === domain.value;
            const rawValue = datum[field];
            const value = rawValue instanceof Date ? rawValue.getTime() : rawValue;
            return typeof value === 'number'
                && (domain.start === undefined || value >= domain.start)
                && (domain.end === undefined || value < domain.end);
        };
    return context.allHits
        .filter((hit) => matches(hit.datum))
        .flatMap((hit) => {
            const pathData = (hit.markType === 'line' || hit.markType === 'area')
                && Array.isArray(hit.pathData)
                ? hit.pathData.filter(matches)
                : [];
            return pathData.length > 0
                ? [
                    ...(hit.markType === 'line' ? [{ ...hit, source: 'legend-item' as const }] : []),
                    ...pathData.map((datum) => ({ ...hit, datum, source: 'legend-item' as const })),
                ]
                : [{ ...hit, source: 'legend-item' as const }];
        });
}

export function targetFromHits(
    hits: readonly RenderHit[],
    keyField: string,
    visual: SemanticTarget['visual'],
): SemanticTarget | null {
    const elements = elementsFromHits(hits, keyField);
    return elements.length > 0 ? { visual, elements } : null;
}

export function resolveSeriesTarget(
    event: SemanticResolveEvent,
    context: SemanticResolveContext,
    seriesField: string | undefined,
): SemanticTarget | null {
    const legendField = event.legend?.field ?? seriesField;
    const hits = event.role === 'legend-item' && legendField
        ? legendMatchedHits(event, context, legendField)
        : event.hits;
    const markType = event.hits[0]?.markType;
    return targetFromHits(hits, context.keyField, {
        kind: markType === 'line' || markType === 'area' ? 'path' : 'mark',
        role: event.role === 'legend-item' ? 'legend-item' : markType ?? event.role,
    });
}
