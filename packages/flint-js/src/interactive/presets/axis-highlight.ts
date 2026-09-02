import type { AxisHighlightOptions, CanvasInteractionDef } from '../interactions';
import { clickTrigger, hoverTrigger } from '../triggers';
import { emphasisUpdate, normalizedOpacity } from './utils';

export function createAxisHighlightInteraction(options: AxisHighlightOptions = {}): CanvasInteractionDef {
    const id = options.id ?? 'axis-highlight';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    return {
        id,
        eventSource: options.event === 'hover' ? hoverTrigger : clickTrigger,
        claimsAxisActivation: true,
        affordances: [{
            target: 'axis-label',
            ...(options.event === 'hover' ? {} : { cursor: 'activate' as const }),
            hover: 'cohort',
        }],
        handle(event, context) {
            if (event.action !== 'hover-axis' && event.action !== 'click-axis') return null;
            if (event.phase === 'start') return null;
            const target = event.target?.visual.kind === 'axis'
                && (!options.axis || event.target.elements.some((element) => element.value.axis === options.axis))
                ? event.target
                : null;
            return emphasisUpdate(id, event, target, dimOpacity, context);
        },
    };
}