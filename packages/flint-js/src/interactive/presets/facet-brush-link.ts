import type { CanvasInteractionDef, FacetBrushLinkOptions } from '../interactions';
import { lassoTrigger, rectangleTrigger } from '../triggers';
import { expandElementsByFields } from './semantic-cohort';
import { emphasisUpdate, normalizedOpacity } from './utils';

export function createFacetBrushLinkInteraction(options: FacetBrushLinkOptions): CanvasInteractionDef {
    const id = options.id ?? 'facet-brush-link';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    const lasso = options.brush === 'lasso';
    return {
        id,
        eventSource: lasso
            ? lassoTrigger(options.match ?? 'intersect', options.guide)
            : rectangleTrigger(options.match ?? 'intersect', options.guide),
        affordances: [{ target: 'plot', cursor: 'region' }],
        handle(event, context) {
            const expectedAction = lasso ? 'select-lasso' : 'select-region';
            if (event.action !== expectedAction || event.phase === 'start' || event.phase === 'cancel') return null;
            if (!event.target) return emphasisUpdate(id, event, null, dimOpacity, context);
            const target = {
                ...event.target,
                elements: expandElementsByFields(event.target.elements, context.available, options.by),
            };
            return emphasisUpdate(id, event, target, dimOpacity, context);
        },
    };
}