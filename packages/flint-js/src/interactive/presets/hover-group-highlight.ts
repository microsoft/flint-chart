import type { CanvasInteractionDef, HoverGroupFocusOptions } from '../interactions';
import type { InteractionAffordance } from '../affordances';
import { assistedElementTrigger, hoverTrigger } from '../triggers';
import { expandElementsByFields } from './semantic-cohort';
import { emphasisUpdate, normalizedOpacity } from './utils';

type HoverGroupFocusEngineOptions = HoverGroupFocusOptions;

export function createHoverGroupFocusInteraction(options: HoverGroupFocusEngineOptions): CanvasInteractionDef {
    const id = options.id ?? 'hover-group-focus';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    const tolerance = options.tolerance === undefined || !Number.isFinite(options.tolerance)
        ? 8
        : Math.max(0, options.tolerance);
    const affordances: InteractionAffordance[] = [{ target: 'mark', hover: 'cohort' }];
    return {
        id,
        eventSource: {
            ...assistedElementTrigger(hoverTrigger, 6),
            targetTolerance: tolerance,
        },
        affordances,
        handle(event, context) {
            if (!event.action.startsWith('hover-') || event.phase !== 'preview' || !event.target) return null;
            if (event.target.visual.role === 'legend-item') return null;
            const target = {
                ...event.target,
                elements: expandElementsByFields(event.target.elements, context.available, options.groupBy),
            };
            return emphasisUpdate(id, event, target, dimOpacity, context);
        },
    };
}