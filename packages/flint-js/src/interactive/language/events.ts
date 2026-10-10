import type { DomainGeometry } from '../../core/interaction-contracts';
import type { RenderHit, SemanticTarget } from '../../core/interaction-semantics';
import type { PlotAngularSector, PlotPoint, PlotPolygon, PlotRect } from './geometry';
import type { VisualProjection } from './projections';

export type { PlotAngularSector, PlotPoint, PlotPolygon, PlotRect } from './geometry';
export type { AxisProjection, PathProjection, VisualProjection } from './projections';

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

/**
 * What accessible navigation says about the element it focused: the kind of
 * element and the content it stands for, as structured fields and as one
 * sentence a screen reader speaks.
 */
export interface AccessibleElementDescription {
    /** The structural kind: `chart`, `title`, `axis-label`, `legend-item`, `mark`, … */
    kind: string;
    /** The element type as spoken, such as "Bar", "X axis label", or "Legend item". */
    type: string;
    /** What the element represents, such as "Country: US, Sales: 200". */
    content: string;
    /** 1-based position among its siblings. */
    position?: { index: number; count: number };
    /** How many elements one level down. */
    childCount: number;
    /** Element types from the chart root down to this element. */
    path: readonly string[];
    /** The full announcement. */
    text: string;
}

export interface SemanticInteractionEvent {
    type: 'semantic';
    source: 'element' | 'region';
    phase: InteractionPhase;
    target: SemanticTarget | null;
    description?: AccessibleElementDescription;
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
    | 'drag'
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
    | 'activate-element'
    | 'menu-select';

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

export type { DomainCoordinate, DomainGeometry, DomainPoint } from '../../core/interaction-contracts';

export interface CanvasInteractionEvent {
    action: CanvasInteractionAction;
    phase: InteractionPhase;
    operation?: RegionOperation | 'pan' | 'zoom' | 'reset';
    geometry: {
        plot?: PlotGeometry;
        domain?: DomainGeometry;
        projection?: VisualProjection;
    };
    target: SemanticTarget | null;
    dropTarget?: SemanticTarget | null;
    modifiers?: InteractionModifiers;
    /** Set on `focus-element` from accessible navigation: what the focused element is and represents. */
    description?: AccessibleElementDescription;
    /** Set on `menu-select` from a context menu: the id of the item the reader picked. */
    item?: string;
}