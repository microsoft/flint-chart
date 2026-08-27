import { semanticVisualFamily, type SemanticTarget } from '../core/interaction-semantics';
import type { InteractionEventSource } from './triggers';
import type {
    InteractionModifiers,
    InteractionPhase,
    NavigationInteractionEvent,
    PlotAngularSector,
    PlotPoint,
    PlotPolygon,
    PlotRect,
    RegionAxis,
    RegionOperation,
    SemanticInteractionEvent,
} from './triggers/events';

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
    | 'inspect-nearest'
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

function elementAction(
    source: InteractionEventSource,
    target: SemanticTarget | null,
): CanvasInteractionAction {
    const gesture = source.gesture === 'hover' ? 'hover' : 'click';
    return `${gesture}-${semanticVisualFamily(target?.visual.role)}` as CanvasInteractionAction;
}

function regionAction(event: SemanticInteractionEvent): CanvasInteractionAction {
    if (event.axis === 'x') return 'brush-x';
    if (event.axis === 'y') return 'brush-y';
    if (event.axis === 'angle') return 'brush-angle';
    return 'select-region';
}

function regionGeometry(event: SemanticInteractionEvent): PlotGeometry | undefined {
    if (!event.region) return undefined;
    if ('innerRadius' in event.region) {
        return { kind: 'angular-sector', sector: event.region };
    }
    if ('points' in event.region) {
        return { kind: 'polygon', polygon: event.region };
    }
    return {
        kind: 'rect',
        rect: event.region,
        axis: event.axis === 'x' || event.axis === 'y' ? event.axis : 'xy',
    };
}

export function toCanvasInteractionEvent(
    event: SemanticInteractionEvent | NavigationInteractionEvent,
    source: InteractionEventSource,
): CanvasInteractionEvent {
    if (event.type === 'navigation') {
        return {
            action: `${event.operation}-viewport`,
            phase: event.phase,
            operation: event.operation,
            geometry: {
                plot: {
                    kind: 'viewport',
                    axes: event.axes,
                    delta: event.delta,
                    factor: event.factor,
                    anchor: event.anchor,
                },
            },
            target: null,
            modifiers: event.modifiers,
        };
    }

    return {
        action: event.source === 'region' ? regionAction(event) : elementAction(source, event.target),
        phase: event.phase,
        operation: event.operation,
        geometry: {
            plot: event.point
                ? { kind: 'point', point: event.point }
                : regionGeometry(event),
        },
        target: event.target,
        modifiers: event.modifiers,
    };
}