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

export type CanvasInteractionAction =
    | 'hover-element'
    | 'click-element'
    | 'hover-legend'
    | 'click-legend'
    | 'hover-axis'
    | 'click-axis'
    | 'hover-facet'
    | 'click-facet'
    | 'hover-annotation'
    | 'click-annotation'
    | 'context-element'
    | 'long-press-element'
    | 'double-activate-element'
    | 'context-legend'
    | 'long-press-legend'
    | 'double-activate-legend'
    | 'context-axis'
    | 'long-press-axis'
    | 'double-activate-axis'
    | 'context-facet'
    | 'long-press-facet'
    | 'double-activate-facet'
    | 'context-annotation'
    | 'long-press-annotation'
    | 'double-activate-annotation'
    | 'drag-element'
    | 'select-region'
    | 'brush-x'
    | 'brush-y'
    | 'brush-angle'
    | 'pan-viewport'
    | 'zoom-viewport'
    | 'reset-viewport'
    | 'inspect-x'
    | 'inspect-y'
    | 'inspect-xy'
    | 'select-lasso'
    | 'focus-element'
    | 'activate-element';

export type PlotGeometry =
    | { kind: 'point'; point: PlotPoint }
    | { kind: 'drag'; start: PlotPoint; current: PlotPoint; delta: PlotPoint; axis?: 'x' | 'y' }
    | { kind: 'rect'; rect: PlotRect; axis: Exclude<RegionAxis, 'angle'> }
    | { kind: 'polygon'; polygon: PlotPolygon }
    | { kind: 'angular-sector'; sector: PlotAngularSector }
    | {
        kind: 'viewport';
        axes: 'x' | 'y' | 'xy';
        delta?: PlotPoint;
        factor?: number;
        anchor?: PlotPoint;
    };

export interface DomainGeometry {
    x?: DomainCoordinate;
    y?: DomainCoordinate;
}

export type DomainCoordinate =
    | { kind: 'value'; value: unknown }
    | { kind: 'interval'; start: unknown; end: unknown };

export interface CanvasInteractionEvent {
    action: CanvasInteractionAction;
    phase: InteractionPhase;
    operation?: RegionOperation | 'pan' | 'zoom' | 'reset';
    geometry: {
        plot?: PlotGeometry;
        domain?: DomainGeometry;
    };
    target: SemanticTarget | null;
    dropTarget?: SemanticTarget | null;
    modifiers?: InteractionModifiers;
}