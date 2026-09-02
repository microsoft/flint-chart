import type { CanvasInteractionDef, ClickHighlightOptions } from '../interactions';
import type { InteractionAffordance } from '../affordances';
import { emphasisUpdate, isActivationAction, normalizedOpacity } from './utils';
import { clickTrigger } from '../triggers';
import { expandRangedDotTarget } from './ranged-dot-target';

export function createClickHighlightInteraction(options: ClickHighlightOptions = {}): CanvasInteractionDef {
    const id = options.id ?? 'click-highlight';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    const affordances: InteractionAffordance[] = [
        { target: 'mark', cursor: 'activate', hover: 'target' },
    ];
    if (options.legend !== false) {
        affordances.push({ target: 'legend-item', cursor: 'activate', hover: 'cohort' });
    }
    return {
        id,
        eventSource: clickTrigger,
        affordances,
        handle(event, context) {
            if (!isActivationAction(event.action) || event.phase === 'start' || event.phase === 'cancel') return null;
            if (event.target?.visual.role === 'legend-item' && options.legend === false) return null;
            const target = expandRangedDotTarget(event.target, context);
            return emphasisUpdate(id, event, target, dimOpacity, context);
        },
    };
}
