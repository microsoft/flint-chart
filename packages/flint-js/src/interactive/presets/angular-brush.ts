import type { AngularBrushOptions, InteractionDef } from '../interactions';
import { emphasisUpdate, normalizedOpacity } from '../updates/emphasis';
import { angularBrushTrigger } from '../triggers';

export function createAngularBrushInteraction(options: AngularBrushOptions = {}): InteractionDef {
    const id = options.id ?? 'brush-angle';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    return {
        id,
        eventSource: angularBrushTrigger(options.match ?? 'intersect'),
        handle(event) {
            if (event.action !== 'brush-angle' || event.phase === 'start' || event.phase === 'cancel') return null;
            return emphasisUpdate(id, event, event.target, dimOpacity);
        },
    };
}