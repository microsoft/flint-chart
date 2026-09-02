import type {
    ClickAnnotateOptions,
    CanvasInteractionDef,
} from '../interactions';
import { emphasisUpdate, isActivationAction, normalizedOpacity } from './utils';
import { clickTrigger } from '../triggers';

export function createClickAnnotateInteraction(options: ClickAnnotateOptions = {}): CanvasInteractionDef {
    const id = options.id ?? 'click-annotate';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    return {
        id,
        eventSource: clickTrigger,
        affordances: [{ target: 'mark', cursor: 'activate' }],
        handle(event, context) {
            if (!isActivationAction(event.action) || event.phase !== 'commit') return null;
            if (event.target?.visual.role === 'legend-item') return null;
            if (!event.target) {
                return {
                    id,
                    ops: [
                        { op: 'set-annotation', target: { select: { key: {} } }, value: null },
                        { op: 'set-style', targets: [], value: { state: 'normal' } },
                    ],
                };
            }
            const element = event.target.elements[0];
            if (!element) return null;
            const emphasis = emphasisUpdate(id, event, event.target, dimOpacity, context);
            const text = options.format?.(element, context);
            return {
                id,
                ops: [{
                    op: 'set-annotation',
                    target: { visual: event.target.visual, elements: [element] },
                    value: text === undefined ? {} : { text },
                }, ...(emphasis?.ops ?? [])],
            };
        },
    };
}
