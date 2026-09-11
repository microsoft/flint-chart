import { semanticVisualFamily, type SemanticTarget } from '../core/interaction-semantics';
import type { InteractionEventSource } from './triggers';
import type {
    CanvasInteractionAction,
    CanvasInteractionEvent,
    NavigationInteractionEvent,
    PlotGeometry,
    SemanticInteractionEvent,
} from './language/events';

function elementAction(
    source: InteractionEventSource,
    target: SemanticTarget | null,
): CanvasInteractionAction {
    if (source.gesture === 'keyboard') return 'focus-element';
    const family = semanticVisualFamily(target?.visual.role);
    if (source.gesture === 'context') return `context-${family}` as CanvasInteractionAction;
    if (source.gesture === 'long-press') return `long-press-${family}` as CanvasInteractionAction;
    if (source.gesture === 'double') return `double-activate-${family}` as CanvasInteractionAction;
    if (source.gesture === 'inspect') {
        return source.inspect === 'x' ? 'inspect-x'
            : source.inspect === 'y' ? 'inspect-y'
            : 'inspect-xy';
    }
    const gesture = source.gesture === 'hover' ? 'hover' : 'click';
    return `${gesture}-${family}` as CanvasInteractionAction;
}

function regionAction(event: SemanticInteractionEvent): CanvasInteractionAction {
    if (event.region && 'points' in event.region) return 'select-lasso';
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