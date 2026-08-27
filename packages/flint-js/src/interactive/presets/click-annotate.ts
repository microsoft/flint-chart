import type {
    ClickAnnotateOptions,
    InteractionDef,
} from '../interactions';
import { emphasisUpdate, normalizedOpacity } from '../updates/emphasis';
import { clickTrigger } from '../triggers';

export function createClickAnnotateInteraction(options: ClickAnnotateOptions = {}): InteractionDef {
    const id = options.id ?? 'click-annotate';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    return {
        id,
        eventSource: clickTrigger,
        handle(event, context) {
            if (!event.action.startsWith('click-') || event.phase !== 'commit') return null;
            if (!event.target) {
                return {
                    updateId: id,
                    phase: event.phase,
                    ops: [{ op: 'clear-annotation' }, { op: 'reset' }],
                };
            }
            const element = event.target.elements[0];
            if (!element) return null;
            const emphasis = emphasisUpdate(id, event, event.target, dimOpacity);
            const text = options.format?.(element, context);
            return {
                updateId: id,
                phase: event.phase,
                ops: [{
                    op: 'annotate',
                    target: { visual: event.target.visual, elements: [element] },
                    ...(text === undefined ? {} : { text }),
                }, ...(emphasis?.ops ?? [])],
            };
        },
    };
}
