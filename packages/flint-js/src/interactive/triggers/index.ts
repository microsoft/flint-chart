import type { NavigationAxes, NormalizedInteractionEvent } from './events';

export type {
    ElementInteractionEvent,
    ExternalInteractionEvent,
    InteractionModifiers,
    InteractionPhase,
    NavigationAxes,
    NavigationInteractionEvent,
    NavigationOperation,
    NormalizedInteractionEvent,
    PlotPoint,
    PlotAngularSector,
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
    readonly gesture?: 'click' | 'hover' | 'drag' | 'navigate';
    readonly match?: 'intersect' | 'contain';
    readonly axis?: 'x' | 'y' | 'xy';
    readonly mode?: 'ephemeral' | 'stateful';
    readonly regionGeometry?: 'cartesian' | 'angular';
    readonly axes?: NavigationAxes | 'available';
    readonly pan?: boolean;
    readonly zoom?: boolean;
    readonly wheelSensitivity?: number;
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

export function angularBrushTrigger(
    match: 'intersect' | 'contain' = 'intersect',
): InteractionEventSource {
    return { type: 'region', gesture: 'drag', regionGeometry: 'angular', match, mode: 'ephemeral' };
}

export function navigationTrigger(options: {
    axes?: NavigationAxes | 'available';
    pan?: boolean;
    zoom?: boolean;
    wheelSensitivity?: number;
} = {}): InteractionEventSource {
    return {
        type: 'navigation',
        gesture: 'navigate',
        axes: options.axes ?? 'available',
        pan: options.pan ?? true,
        zoom: options.zoom ?? true,
        wheelSensitivity: options.wheelSensitivity ?? 0.002,
    };
}

export function externalTrigger(source?: string): InteractionEventSource {
    return { type: 'external', source };
}
