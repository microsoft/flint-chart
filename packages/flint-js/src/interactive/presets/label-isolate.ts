import type { CanvasInteractionDef } from '../interactions';
import { clickTrigger } from '../triggers';
import { emphasisUpdate, isActivationAction, normalizedOpacity } from './utils';

const DEFAULT_TARGETS = ['legend', 'x', 'y'] as const;

interface LabelIsolatePresetOptions {
    id?: string;
    dimOpacity?: number;
    targets?: readonly ('legend' | 'x' | 'y')[];
}

export function createLabelIsolateInteraction(options: LabelIsolatePresetOptions = {}): CanvasInteractionDef {
    const id = options.id ?? 'label-isolate';
    const dimOpacity = normalizedOpacity(options.dimOpacity);
    const targets = new Set(options.targets ?? DEFAULT_TARGETS);
    const claimsLegend = targets.has('legend');
    const claimsAxis = targets.has('x') || targets.has('y');

    return {
        id,
        eventSource: clickTrigger,
        claimsLegendActivation: claimsLegend,
        claimsAxisActivation: claimsAxis,
        affordances: [
            ...(claimsLegend ? [{ target: 'legend-item' as const, cursor: 'activate' as const, hover: 'cohort' as const }] : []),
            ...(claimsAxis ? [{ target: 'axis-label' as const, cursor: 'activate' as const, hover: 'cohort' as const }] : []),
        ],
        handle(event, context) {
            if (!isActivationAction(event.action) || event.phase !== 'commit') return null;
            const target = event.target;
            if (!target) return emphasisUpdate(id, event, null, dimOpacity, context);
            if (target.visual.role === 'legend-item') {
                return claimsLegend ? emphasisUpdate(id, event, target, dimOpacity, context) : null;
            }
            if (target.visual.kind !== 'axis') return null;
            const eligible = target.elements.some((element) => {
                const axis = element.value.axis;
                return (axis === 'x' || axis === 'y') && targets.has(axis);
            });
            return eligible ? emphasisUpdate(id, event, target, dimOpacity, context) : null;
        },
    };
}