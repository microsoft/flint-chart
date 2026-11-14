import type { CanvasInteractionDef, CanvasInteractionEvent, SemanticElement } from '../interactions';
import type { LegendTargetValue } from '../../core/interaction-contracts';
import { isActivationAction, semanticElementIdentity } from './utils';
import { clickTrigger } from '../triggers';

/** How far a dimmed group recedes, and how far its legend entry fades. */
export const LEGEND_DIM_OPACITY = 0.2;
export const LEGEND_DIM_ENTRY_OPACITY = 0.35;

function legendKey(element: SemanticElement): string {
    const legend = element.value as LegendTargetValue;
    return legend.channel && legend.domain
        ? JSON.stringify([legend.channel, legend.field, legend.domain])
        : semanticElementIdentity(element);
}

/** Every value of one legend dimmed: nothing then stands out, so the legend starts over. */
function dimsWholeLegend(
    dimmed: readonly SemanticElement[],
    legendDomains: Readonly<Record<string, readonly unknown[]>> | undefined,
): boolean {
    if (!legendDomains) return false;
    return Object.entries(legendDomains).some(([channel, domain]) =>
        domain.length > 1 && domain.every((value) => dimmed.some((element) => {
            const legend = element.value as LegendTargetValue;
            return legend.channel === channel && legend.domain?.kind === 'value' && Object.is(legend.domain.value, value);
        })));
}

function activation(event: CanvasInteractionEvent): boolean {
    return isActivationAction(event.action) && event.phase === 'commit';
}

/**
 * The legend click every chart has: a click on a legend item dims its group and fades the item;
 * a second click brings it back. Nothing is hidden, so the axes and scales stay put. Items of
 * several legends compose: a mark is dimmed when any of its legend values is.
 */
export function createLegendDimInteraction(options: { id?: string } = {}): CanvasInteractionDef {
    const id = options.id ?? 'legend-dim';
    let dimmed: SemanticElement[] = [];
    return {
        id,
        eventSource: clickTrigger,
        affordances: { 'legend-item': { cursor: 'activate', hover: 'cohort' } },
        reset: ['escape'],
        onReset() { dimmed = []; },
        handle(event, context) {
            if (!activation(event)) return null;
            const elements = event.target?.elements ?? [];
            if (elements.length === 0) return null;
            const keys = new Set(elements.map(legendKey));
            const remaining = dimmed.filter((element) => !keys.has(legendKey(element)));
            const next = remaining.length === dimmed.length ? [...dimmed, ...elements] : remaining;
            dimmed = dimsWholeLegend(next, context.legendDomains) ? [] : next;
            return {
                id,
                ops: [{
                    op: 'set-style',
                    targets: dimmed.length > 0 ? [{ visual: { kind: 'legend', role: 'legend-item' }, elements: dimmed }] : [],
                    value: { state: 'muted', opacity: LEGEND_DIM_OPACITY, mutedOpacity: LEGEND_DIM_ENTRY_OPACITY },
                }],
            };
        },
    };
}
