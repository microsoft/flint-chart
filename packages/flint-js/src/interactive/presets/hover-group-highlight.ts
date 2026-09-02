import type { CanvasInteractionDef, HoverGroupHighlightOptions } from '../interactions';
import type { InteractionAffordance } from '../affordances';
import { hoverTrigger } from '../triggers';
import { expandElementsByFields } from './semantic-cohort';
import { emphasisUpdate, normalizedOpacity } from './utils';

export function createHoverGroupHighlightInteraction(options: HoverGroupHighlightOptions): CanvasInteractionDef {
    const id = options.id ?? 'hover-group-highlight';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    const tolerance = options.tolerance === undefined || !Number.isFinite(options.tolerance)
        ? 8
        : Math.max(0, options.tolerance);
    const affordances: InteractionAffordance[] = [{ target: 'mark', hover: 'cohort' }];
    if (options.legend !== false) affordances.push({ target: 'legend-item', hover: 'cohort' });
    return {
        id,
        eventSource: { ...hoverTrigger, targetTolerance: tolerance },
        affordances,
        handle(event, context) {
            if (!event.action.startsWith('hover-') || event.phase !== 'preview' || !event.target) return null;
            if (event.target.visual.role === 'legend-item' && options.legend === false) return null;
            const target = event.target.visual.role === 'legend-item'
                ? event.target
                : {
                    ...event.target,
                    elements: expandElementsByFields(event.target.elements, context.available, options.groupBy),
                };
            return emphasisUpdate(id, event, target, dimOpacity, context);
        },
    };
}