import type { BrushOptions, CanvasInteractionDef } from '../interactions';
import { emphasisUpdate, normalizedOpacity } from './utils';
import { axisBrushTrigger } from '../triggers';
import { expandRangedDotTarget } from './ranged-dot-target';

export function createBrushInteraction(axis: 'x' | 'y', options: BrushOptions = {}): CanvasInteractionDef {
    const id = options.id ?? `brush-${axis}`;
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    return {
        id,
        axis,
        eventSource: axisBrushTrigger(axis, options.match ?? 'intersect', options.mode ?? 'ephemeral', options.guide),
        affordances: [{ target: 'plot', cursor: 'region' }],
        handle(event, context) {
            const acceptsAngular = axis === 'x' && event.action === 'brush-angle';
            if ((event.action !== `brush-${axis}` && !acceptsAngular)
                || event.phase === 'start'
                || event.phase === 'cancel') return null;
            const target = expandRangedDotTarget(event.target, context);
            return emphasisUpdate(id, event, target, dimOpacity, context);
        },
    } as CanvasInteractionDef & { axis: 'x' | 'y' };
}
