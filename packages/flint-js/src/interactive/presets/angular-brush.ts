import type { AngularBrushOptions, CanvasInteractionDef } from '../interactions';
import { emphasisUpdate, normalizedOpacity } from './utils';
import { angularBrushTrigger } from '../triggers';

export function createAngularBrushInteraction(options: AngularBrushOptions = {}): CanvasInteractionDef {
    const id = options.id ?? 'brush-angle';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    return {
        id,
        eventSource: angularBrushTrigger(options.match ?? 'intersect'),
        handle(event, context) {
            if (event.action !== 'brush-angle' || event.phase === 'start' || event.phase === 'cancel') return null;
            return emphasisUpdate(id, event, event.target, dimOpacity, context);
        },
    };
}