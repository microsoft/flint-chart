import type { BrushOptions, InteractionDef } from '../interactions';
import { emphasisUpdate, normalizedOpacity } from '../updates/emphasis';
import { axisBrushTrigger } from '../triggers';
import { expandRangedDotTarget } from './ranged-dot-target';

export function createBrushInteraction(axis: 'x' | 'y', options: BrushOptions = {}): InteractionDef {
    const id = options.id ?? `brush-${axis}`;
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    return {
        id,
        axis,
        eventSource: axisBrushTrigger(axis, options.match ?? 'intersect', options.mode ?? 'ephemeral'),
        handle(event, context) {
            if (event.action !== `brush-${axis}` || event.phase === 'start' || event.phase === 'cancel') return null;
            const target = expandRangedDotTarget(event.target, context);
            return emphasisUpdate(id, event, target, dimOpacity);
        },
    } as InteractionDef & { axis: 'x' | 'y' };
}
