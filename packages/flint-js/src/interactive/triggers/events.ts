import type { RenderHit, SemanticTarget } from '../../core/interaction-semantics';

export interface PlotPoint {
    x: number;
    y: number;
}

export interface PlotRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface PlotPolygon {
    points: readonly PlotPoint[];
}

export interface PlotAngularSector {
    center: PlotPoint;
    innerRadius: number;
    outerRadius: number;
    startAngle: number;
    endAngle: number;
}

export interface InteractionModifiers {
    shift: boolean;
    ctrl: boolean;
    meta: boolean;
}

export type InteractionPhase = 'start' | 'preview' | 'commit' | 'cancel';
export type RegionAxis = 'x' | 'y' | 'xy' | 'angle';
export type RegionOperation = 'create' | 'move' | 'resize-leading' | 'resize-trailing' | 'clear';
export type NavigationAxes = 'x' | 'y' | 'xy';
export type NavigationOperation = 'pan' | 'zoom' | 'reset';

export interface ElementInteractionEvent {
    type: 'element';
    phase: 'preview' | 'commit' | 'cancel';
    hits: readonly RenderHit[];
    point?: PlotPoint;
    modifiers?: InteractionModifiers;
}

export interface RegionInteractionEvent {
    type: 'region';
    phase: InteractionPhase;
    axis: RegionAxis;
    operation?: RegionOperation;
    region: PlotRect | PlotPolygon | PlotAngularSector;
    hits: readonly RenderHit[];
    match: 'intersect' | 'contain';
    modifiers?: InteractionModifiers;
}

export interface NavigationInteractionEvent {
    type: 'navigation';
    phase: InteractionPhase;
    operation: NavigationOperation;
    axes: NavigationAxes;
    /** Incremental translation as a fraction of the plot width and height. */
    delta?: PlotPoint;
    /** Multiplicative zoom where values greater than one zoom in. */
    factor?: number;
    /** Zoom anchor as a fraction of the plot width and height. */
    anchor?: PlotPoint;
    modifiers?: InteractionModifiers;
}

export interface ExternalInteractionEvent<TPayload = unknown> {
    type: 'external';
    source: string;
    phase: InteractionPhase;
    payload: TPayload;
    transactionId?: string;
}

export type NormalizedInteractionEvent<TPayload = unknown> =
    | ElementInteractionEvent
    | RegionInteractionEvent
    | NavigationInteractionEvent
    | ExternalInteractionEvent<TPayload>;

export interface SemanticInteractionEvent {
    type: 'semantic';
    source: 'element' | 'region';
    phase: InteractionPhase;
    target: SemanticTarget | null;
    point?: PlotPoint;
    region?: PlotRect | PlotPolygon | PlotAngularSector;
    axis?: RegionAxis;
    operation?: RegionOperation;
    modifiers?: InteractionModifiers;
}
