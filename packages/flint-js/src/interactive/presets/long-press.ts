import type {
    CanvasInteractionDef,
    DoubleActivateOptions,
    LongPressOptions,
} from '../interactions';
import { doubleActivateTrigger, longPressTrigger } from '../triggers';
import { emphasisUpdate, normalizedOpacity } from './utils';

/** Highlights and reports a sustained press on a chart target. */
export function createLongPressInteraction(options: LongPressOptions = {}): CanvasInteractionDef {
    const id = options.id ?? 'long-press';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    return {
        id,
        eventSource: longPressTrigger(options.holdMs ?? 500),
        handle(event, context) {
            if (!event.action.startsWith('long-press-') || event.phase !== 'commit') return null;
            return emphasisUpdate(id, event, event.target, dimOpacity, context);
        },
    };
}

/** Highlights and reports a double activation for drill-down-style workflows. */
export function createDoubleActivateInteraction(
    options: DoubleActivateOptions = {},
): CanvasInteractionDef {
    const id = options.id ?? 'double-activate';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    return {
        id,
        eventSource: doubleActivateTrigger,
        handle(event, context) {
            if (!event.action.startsWith('double-activate-') || event.phase !== 'commit') return null;
            return emphasisUpdate(id, event, event.target, dimOpacity, context);
        },
    };
}
