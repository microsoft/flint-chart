import type { NormalizedInteractionEvent } from './events';

export type {
    ElementInteractionEvent,
    ExternalInteractionEvent,
    InteractionModifiers,
    InteractionPhase,
    NormalizedInteractionEvent,
    PlotPoint,
    PlotPolygon,
    PlotRect,
    RegionAxis,
    RegionInteractionEvent,
    RegionOperation,
    SemanticInteractionEvent,
} from './events';

export interface InteractionEventSourceContext {
    readonly container: HTMLElement;
    emit(event: NormalizedInteractionEvent): void;
}

export interface InteractionEventSource {
    readonly type: 'element' | 'region' | 'external' | (string & {});
    readonly gesture?: 'click' | 'hover' | 'drag';
    readonly match?: 'intersect' | 'contain';
    readonly axis?: 'x' | 'y' | 'xy';
    readonly mode?: 'ephemeral' | 'stateful';
    readonly source?: string;
    mount?(context: InteractionEventSourceContext): void | (() => void);
}

export const clickTrigger = Object.freeze({
    type: 'element',
    gesture: 'click',
} as const satisfies InteractionEventSource);

export const hoverTrigger = Object.freeze({
    type: 'element',
    gesture: 'hover',
} as const satisfies InteractionEventSource);

export function rectangleTrigger(
    match: 'intersect' | 'contain' = 'intersect',
): InteractionEventSource {
    return { type: 'region', gesture: 'drag', match };
}

export function axisBrushTrigger(
    axis: 'x' | 'y',
    match: 'intersect' | 'contain' = 'intersect',
    mode: 'ephemeral' | 'stateful' = 'ephemeral',
): InteractionEventSource {
    return { type: 'region', gesture: 'drag', axis, match, mode };
}

export function xBrushTrigger(
    match: 'intersect' | 'contain' = 'intersect',
    mode: 'ephemeral' | 'stateful' = 'ephemeral',
): InteractionEventSource {
    return axisBrushTrigger('x', match, mode);
}

export function yBrushTrigger(
    match: 'intersect' | 'contain' = 'intersect',
    mode: 'ephemeral' | 'stateful' = 'ephemeral',
): InteractionEventSource {
    return axisBrushTrigger('y', match, mode);
}

export function externalTrigger(source?: string): InteractionEventSource {
    return { type: 'external', source };
}
