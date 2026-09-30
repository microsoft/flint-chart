import type { AccessibleNavigationOptions, CanvasInteractionDef } from '../interactions';
import { accessibleNavigationTrigger } from '../triggers';
import { emphasisUpdate, normalizedOpacity } from './utils';

/**
 * A keyboard walk of the chart's semantic structure. The renderer owns the walk;
 * the preset owns what a focused element does to the chart: it emphasises the
 * data the element stands for, and returns the chart to normal when focus leaves.
 */
export function createAccessibleNavigationInteraction(options: AccessibleNavigationOptions = {}): CanvasInteractionDef {
    const id = options.id ?? 'accessible-navigation';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    const eventSource = accessibleNavigationTrigger(options);
    return {
        id,
        eventSource,
        // Hover presentation for labels and legend entries the walk reaches; no pointer gesture is claimed.
        affordances: { 'legend-item': {}, 'axis-label': { hover: 'cohort' } },
        handle(event, context) {
            if (event.action !== 'focus-element' || event.phase === 'cancel') return null;
            if (!eventSource.accessibleNavigation?.emphasis) return null;
            const target = event.target && event.target.elements.length > 0 ? event.target : null;
            return emphasisUpdate(id, { phase: event.phase }, target, dimOpacity, context);
        },
    };
}
