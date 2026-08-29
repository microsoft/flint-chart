import type {
    RenderHit,
    SemanticElement,
    SemanticResolveContext,
    SemanticResolveEvent,
    SemanticTarget,
} from './interaction-contracts';

export type {
    ChartInteractionResolver,
    RenderHit,
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

export function elementsFromHits(hits: readonly RenderHit[], keyField: string): SemanticElement[] {
    const seen = new Set<string>();
    const elements: SemanticElement[] = [];
    for (const hit of hits) {
        const key = hit.datum[keyField];
        if (typeof key !== 'string' || seen.has(key)) continue;
        seen.add(key);
        elements.push({
            key: { [keyField]: key },
            value: hit.datum,
            records: hit.endDatum ? [hit.datum, hit.endDatum] : [hit.datum],
        });
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
    if (event.legendValue === undefined) return [];
    return context.allHits
        .filter((hit) => hit.datum[field] === event.legendValue)
        .map((hit) => ({ ...hit, source: 'legend-item' }));
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
    const legendField = event.legendField ?? seriesField;
    const hits = event.role === 'legend-item' && legendField
        ? legendMatchedHits(event, context, legendField)
        : event.hits;
    const markType = event.hits[0]?.markType;
    return targetFromHits(hits, context.keyField, {
        kind: markType === 'line' || markType === 'area' ? 'path' : 'mark',
        role: event.role === 'legend-item' ? 'legend-item' : markType ?? event.role,
    });
}
