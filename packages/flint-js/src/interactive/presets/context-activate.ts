import type { CanvasInteractionDef, ContextActivateOptions } from '../interactions';
import { contextTrigger } from '../triggers';

/**
 * Reports a context request on the chart target and leaves the chart unchanged;
 * opening a menu is the application's decision.
 */
export function createContextActivateInteraction(
    options: ContextActivateOptions = {},
): CanvasInteractionDef {
    return {
        id: options.id ?? 'context-activate',
        eventSource: contextTrigger,
        affordances: [{ target: 'mark', cursor: 'activate' }],
    };
}
