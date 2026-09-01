import type { CanvasInteractionDef, ClickHighlightOptions } from '../interactions';
import { emphasisUpdate, isActivationAction, normalizedOpacity } from './utils';
import { clickTrigger } from '../triggers';
import { expandRangedDotTarget } from './ranged-dot-target';

export function createClickHighlightInteraction(options: ClickHighlightOptions = {}): CanvasInteractionDef {
    const id = options.id ?? 'click-highlight';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    return {
        id,
        eventSource: clickTrigger,
        handle(event, context) {
            if (!isActivationAction(event.action) || event.phase === 'start' || event.phase === 'cancel') return null;
            if (event.target?.visual.role === 'legend-item' && options.legend === false) return null;
            const target = expandRangedDotTarget(event.target, context);
            return emphasisUpdate(id, event, target, dimOpacity, context);
        },
    };
}
