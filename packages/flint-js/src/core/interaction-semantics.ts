export interface RenderHit {
    datum: Record<string, unknown>;
    source: 'mark' | 'legend-item';
    markType?: string;
    markName?: string;
    layerRole?: string;
}

export interface SemanticElement {
    key: Record<string, unknown>;
    records?: readonly Record<string, unknown>[];
}

export interface SemanticTarget {
    visual: {
        kind: 'mark' | 'path' | 'region' | 'widget' | 'handle';
        role: string;
    };
    elements: readonly SemanticElement[];
}

export interface SemanticResolveEvent {
    gesture: 'click' | 'hover' | 'rectangle';
    role: string;
    hits: readonly RenderHit[];
    legendValue?: unknown;
    legendField?: string;
}

export interface SemanticResolveContext {
    allHits: readonly RenderHit[];
    keyField: string;
    categoryField?: string;
    seriesField?: string;
}

export type ChartInteractionResolver = (
    event: SemanticResolveEvent,
    context: SemanticResolveContext,
) => SemanticTarget | null;

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
        elements.push({ key: { [keyField]: key }, records: [hit.datum] });
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
