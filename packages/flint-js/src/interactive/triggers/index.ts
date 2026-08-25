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
    RegionInteractionEvent,
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

export function externalTrigger(source?: string): InteractionEventSource {
    return { type: 'external', source };
}
