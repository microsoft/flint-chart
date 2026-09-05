import type { CanvasInteractionDef, ClickHighlightOptions, ClickHighlightTarget } from '../interactions';
import type { InteractionAffordance } from '../affordances';
import { emphasisUpdate, isActivationAction, normalizedOpacity } from './utils';
import { assistedElementTrigger, clickTrigger } from '../triggers';
import { expandRangedDotTarget } from './ranged-dot-target';

const DEFAULT_TARGETS: readonly ClickHighlightTarget[] = ['mark', 'legend', 'discreteAxis'];

export function createClickHighlightInteraction(options: ClickHighlightOptions = {}): CanvasInteractionDef {
    const id = options.id ?? 'click-highlight';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    const targets = new Set(options.targets ?? DEFAULT_TARGETS);
    const affordances: InteractionAffordance[] = [];
    if (targets.has('mark')) affordances.push({ target: 'mark', cursor: 'activate', hover: 'target' });
    if (targets.has('legend')) affordances.push({ target: 'legend-item', cursor: 'activate', hover: 'cohort' });
    if (targets.has('discreteAxis')) affordances.push({ target: 'axis-label', cursor: 'activate', hover: 'cohort' });
    return {
        id,
        eventSource: assistedElementTrigger(clickTrigger, 8),
        retainedStateGroup: 'focus',
        claimsLegendActivation: targets.has('legend'),
        claimsAxisActivation: targets.has('discreteAxis'),
        affordances,
        handle(event, context) {
            if (!isActivationAction(event.action) || event.phase === 'start' || event.phase === 'cancel') return null;
            if (!event.target) return emphasisUpdate(id, event, null, dimOpacity, context);
            const isLegend = event.target.visual.role === 'legend-item';
            const isAxis = event.target.visual.kind === 'axis';
            if (isLegend && !targets.has('legend')) return null;
            if (isAxis && !targets.has('discreteAxis')) return null;
            if (!isLegend && !isAxis && !targets.has('mark')) return null;
            const target = isLegend || isAxis
                ? event.target
                : expandRangedDotTarget(event.target, context);
            return emphasisUpdate(id, event, target, dimOpacity, context);
        },
    };
}
