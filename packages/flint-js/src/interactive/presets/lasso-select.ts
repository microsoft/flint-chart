import type { CanvasInteractionDef, LassoSelectOptions } from '../interactions';
import { emphasisUpdate, normalizedOpacity } from './utils';
import { lassoTrigger } from '../triggers';

export function createLassoSelectInteraction(options: LassoSelectOptions = {}): CanvasInteractionDef {
    const id = options.id ?? 'lasso-select';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    return {
        id,
        eventSource: lassoTrigger(options.match ?? 'intersect', options.guide),
        affordances: [{ target: 'plot', cursor: 'region' }],
        handle(event, context) {
            if (event.action !== 'select-lasso' || event.phase === 'start' || event.phase === 'cancel') return null;
            return emphasisUpdate(id, event, event.target, dimOpacity, context);
        },
    };
}
