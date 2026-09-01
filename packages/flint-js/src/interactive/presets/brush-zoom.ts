import type { BrushZoomOptions, CanvasInteractionDef, UpdateDomain } from '../interactions';
import { brushZoomTrigger } from '../triggers';

const REGION_ACTIONS = new Set(['select-region', 'brush-x', 'brush-y']);

/** Reduces the viewport to the brushed region, as an exact absolute domain. */
export function createBrushZoomInteraction(options: BrushZoomOptions = {}): CanvasInteractionDef {
    const id = options.id ?? 'brush-zoom';
    const axes = options.axes ?? 'xy';
    return {
        id,
        eventSource: brushZoomTrigger(axes, options.guide),
        handle(event) {
            if (!REGION_ACTIONS.has(event.action) || event.phase !== 'commit' || event.operation === 'clear') return null;
            const domain = event.geometry.domain;
            if (!domain) return null;
            const value: { x?: UpdateDomain; y?: UpdateDomain } = {};
            for (const axis of ['x', 'y'] as const) {
                if (axes !== 'xy' && axes !== axis) continue;
                const coordinate = domain[axis];
                if (coordinate?.kind !== 'interval') continue;
                if (Object.is(coordinate.start, coordinate.end)) continue;
                value[axis] = [coordinate.start, coordinate.end];
            }
            const resolved = (['x', 'y'] as const).filter((axis) => value[axis]);
            if (resolved.length === 0) return null;
            return {
                id,
                ops: [{
                    op: 'set-viewport',
                    axes: resolved.length === 2 ? 'xy' : resolved[0],
                    value,
                }],
            };
        },
    };
}
