import type { CanvasInteractionDef, ClickHighlightOptions, ClickHighlightTarget } from '../interactions';
import type { InteractionAffordance, InteractionAffordanceTarget } from '../affordances';
import { emphasisUpdate, isActivationAction, normalizedOpacity } from './utils';
import { assistedElementTrigger, clickTrigger } from '../triggers';
import { expandRangedDotTarget } from './ranged-dot-target';

export const CLICK_HIGHLIGHT_DEFAULT_TARGETS: readonly ClickHighlightTarget[] = ['mark', 'legend', 'discreteAxis'];

/** The kind of hit each `targets` option names. */
export const CLICK_HIGHLIGHT_AFFORDANCE_TARGET: Record<ClickHighlightTarget, InteractionAffordanceTarget> = {
    mark: 'mark',
    legend: 'legend-item',
    discreteAxis: 'axis-label',
};

const SIGNAL_OF: Record<ClickHighlightTarget, InteractionAffordance> = {
    mark: { cursor: 'activate', hover: 'target' },
    legend: { cursor: 'activate', hover: 'cohort' },
    discreteAxis: { cursor: 'activate', hover: 'cohort' },
};

export function createClickHighlightInteraction(options: ClickHighlightOptions = {}): CanvasInteractionDef {
    const id = options.id ?? 'click-highlight';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    const targets = options.targets ?? CLICK_HIGHLIGHT_DEFAULT_TARGETS;
    return {
        id,
        eventSource: assistedElementTrigger(clickTrigger, 8),
        retainedStateGroup: 'focus',
        affordances: Object.fromEntries(targets.map((target) => [CLICK_HIGHLIGHT_AFFORDANCE_TARGET[target], SIGNAL_OF[target]])),
        handle(event, context) {
            if (!isActivationAction(event.action) || event.phase === 'start' || event.phase === 'cancel') return null;
            if (!event.target) return emphasisUpdate(id, event, null, dimOpacity, context);
            const isLegend = event.target.visual.role === 'legend-item';
            const isAxis = event.target.visual.kind === 'axis';
            const target = isLegend || isAxis
                ? event.target
                : expandRangedDotTarget(event.target, context);
            return emphasisUpdate(id, event, target, dimOpacity, context);
        },
    };
}
