import type { CanvasInteractionDef, SelectOptions } from '../interactions';
import { emphasisUpdate, normalizedOpacity } from './utils';
import { rectangleTrigger } from '../triggers';

export function createSelectInteraction(options: SelectOptions = {}): CanvasInteractionDef {
    const id = options.id ?? 'select';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    return {
        id,
        eventSource: rectangleTrigger(options.match ?? 'intersect', options.guide),
        handle(event, context) {
            if (event.action !== 'select-region' || event.phase === 'start' || event.phase === 'cancel') return null;
            return emphasisUpdate(id, event, event.target, dimOpacity, context);
        },
    };
}
