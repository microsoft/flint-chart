import type { CanvasInteractionDef, ContextActivateOptions } from '../interactions';
import { assistedElementTrigger, contextTrigger } from '../triggers';

/**
 * Reports a context request on the chart target and leaves the chart unchanged;
 * opening a menu is the application's decision.
 */
export function createContextActivateInteraction(
    options: ContextActivateOptions = {},
): CanvasInteractionDef {
    return {
        id: options.id ?? 'context-activate',
        eventSource: assistedElementTrigger(contextTrigger, 8),
        affordances: [{ target: 'mark', cursor: 'activate' }],
    };
}
