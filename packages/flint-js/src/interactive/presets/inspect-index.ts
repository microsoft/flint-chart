import type { CanvasInteractionDef, InspectIndexOptions } from '../interactions';
import type { InteractionAffordance } from '../affordances';
import { inspectIndexTrigger } from '../triggers';

/** Reads values at one independent-axis position across one or more series. */
export function createInspectIndexInteraction(options: InspectIndexOptions = {}): CanvasInteractionDef {
    const id = options.id ?? 'inspect-index';
    const axis = options.axis ?? 'x';
    const show = options.show ?? 'all';
    if (show !== 'all' && !options.seriesBy) {
        throw new Error('inspectIndex({ show: "single" | { series } }) requires seriesBy.');
    }
    const affordances: InteractionAffordance[] = show !== 'all'
        ? [{ target: 'legend-item', cursor: 'activate', hover: 'cohort' }]
        : [{ target: 'plot', cursor: 'inspect' }];
    return {
        id,
        eventSource: inspectIndexTrigger(
            axis, show, options.seriesBy, options.selector, options.guide, options.tolerance,
        ),
        affordances,
    };
}