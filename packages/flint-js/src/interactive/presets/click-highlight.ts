import type { CanvasInteractionDef, ClickMarkOptions } from '../interactions';
import type { InteractionAffordance } from '../affordances';
import { emphasisUpdate, isActivationAction, normalizedOpacity } from './utils';
import { clickTrigger } from '../triggers';
import { expandRangedDotTarget } from './ranged-dot-target';

type MarkFocusEngineOptions = Omit<ClickMarkOptions, 'groupBy'>;

export function createClickMarkInteraction(options: MarkFocusEngineOptions = {}): CanvasInteractionDef {
    const id = options.id ?? 'click-mark';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    const affordances: InteractionAffordance[] = [
        { target: 'mark', cursor: 'activate', hover: 'target' },
    ];
    return {
        id,
        eventSource: clickTrigger,
        affordances,
        handle(event, context) {
            if (!isActivationAction(event.action) || event.phase === 'start' || event.phase === 'cancel') return null;
            if (event.target?.visual.role === 'legend-item') return null;
            const target = expandRangedDotTarget(event.target, context);
            return emphasisUpdate(id, event, target, dimOpacity, context);
        },
    };
}
