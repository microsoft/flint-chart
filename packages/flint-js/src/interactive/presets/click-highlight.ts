import type { ClickHighlightOptions, InteractionDef } from '../interactions';
import { emphasisUpdate, normalizedOpacity } from '../updates/emphasis';
import { clickTrigger } from '../triggers';
import { expandRangedDotTarget } from './ranged-dot-target';

export function createClickHighlightInteraction(options: ClickHighlightOptions = {}): InteractionDef {
    const id = options.id ?? 'click-highlight';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    return {
        id,
        eventSource: clickTrigger,
        handle(event, context) {
            if (!event.action.startsWith('click-') || event.phase === 'start' || event.phase === 'cancel') return null;
            const target = expandRangedDotTarget(event.target, context);
            return emphasisUpdate(id, event, target, dimOpacity);
        },
    };
}
