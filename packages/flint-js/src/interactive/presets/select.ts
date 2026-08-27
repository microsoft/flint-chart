import type { InteractionDef, SelectOptions } from '../interactions';
import { emphasisUpdate, normalizedOpacity } from '../updates/emphasis';
import { rectangleTrigger } from '../triggers';

export function createSelectInteraction(options: SelectOptions = {}): InteractionDef {
    const id = options.id ?? 'select';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    return {
        id,
        eventSource: rectangleTrigger(options.match ?? 'intersect'),
        handle(event) {
            if (event.action !== 'select-region' || event.phase === 'start' || event.phase === 'cancel') return null;
            return emphasisUpdate(id, event, event.target, dimOpacity);
        },
    };
}
