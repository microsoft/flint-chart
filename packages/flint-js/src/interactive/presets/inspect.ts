import type { CanvasInteractionDef, InspectOptions } from '../interactions';
import { emphasisUpdate, normalizedOpacity } from './utils';
import { inspectTrigger } from '../triggers';

const INSPECT_ACTIONS = new Set(['inspect-x', 'inspect-y', 'inspect-xy']);

/**
 * Reads the value under the pointer without committing a selection, so it is
 * the binding point for a crosshair or shared tooltip.
 */
export function createInspectInteraction(options: InspectOptions = {}): CanvasInteractionDef {
    const id = options.id ?? 'inspect';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    return {
        id,
        eventSource: inspectTrigger(
            options.mode ?? 'xy', options.selector, options.tolerance, options.guide, options.cycle,
        ),
        affordances: [{ target: 'plot', cursor: 'inspect' }],
        handle(event, context) {
            if (!INSPECT_ACTIONS.has(event.action) || event.phase === 'cancel') return null;
            if (!event.target) return {
                id,
                ops: [{
                    op: 'set-style',
                    targets: [],
                    value: { state: 'emphasized', mutedOpacity: dimOpacity },
                }],
            };
            return emphasisUpdate(id, event, event.target, dimOpacity, context);
        },
    };
}
