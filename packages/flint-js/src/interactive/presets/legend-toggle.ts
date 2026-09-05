import type {
    CanvasInteractionDef,
    CanvasInteractionEvent,
    LegendToggleOptions,
    SemanticElement,
} from '../interactions';
import type { LegendTargetValue } from '../../core/interaction-contracts';
import { isActivationAction, normalizedOpacity, semanticElementIdentity } from './utils';
import { clickTrigger } from '../triggers';

function sameElement(left: SemanticElement, right: SemanticElement): boolean {
    const leftLegend = left.value as LegendTargetValue;
    const rightLegend = right.value as LegendTargetValue;
    if (leftLegend.channel && leftLegend.domain && rightLegend.channel && rightLegend.domain) {
        return JSON.stringify([leftLegend.channel, leftLegend.field, leftLegend.domain])
            === JSON.stringify([rightLegend.channel, rightLegend.field, rightLegend.domain]);
    }
    return semanticElementIdentity(left) === semanticElementIdentity(right);
}

function withoutElements(
    hidden: readonly SemanticElement[],
    elements: readonly SemanticElement[],
): SemanticElement[] {
    return hidden.filter((candidate) => !elements.some((element) => sameElement(candidate, element)));
}

function legendElementMatches(
    legendElement: SemanticElement,
    candidate: SemanticElement,
): boolean {
    const legend = legendElement.value as LegendTargetValue;
    if (!legend.field || legend.domain?.kind !== 'value') return sameElement(legendElement, candidate);
    const domainValue = legend.domain.value;
    const records = candidate.records?.length ? candidate.records : [candidate.value];
    return records.some((record) => Object.is(record[legend.field!], domainValue));
}

function hidesFullLegendDomain(
    elements: readonly SemanticElement[],
    legendDomains: Readonly<Record<string, readonly unknown[]>> | undefined,
): boolean {
    if (!legendDomains) return false;
    return Object.entries(legendDomains).some(([channel, domain]) =>
        domain.length > 0 && domain.every((value) => elements.some((element) => {
            const legend = element.value as LegendTargetValue;
            return legend.channel === channel
                && legend.domain?.kind === 'value'
                && Object.is(legend.domain.value, value);
        })));
}

/** Only legend activations toggle series, so these presets compose with mark-click presets. */
function legendActivation(event: CanvasInteractionEvent): boolean {
    return isActivationAction(event.action)
        && event.phase === 'commit'
        && event.target?.visual.role === 'legend-item';
}

/** Hides or restores the activated series, the way a legend key normally behaves. */
export function createLegendToggleInteraction(options: LegendToggleOptions = {}): CanvasInteractionDef {
    const id = options.id ?? 'legend-toggle';
    const mutedOpacity = normalizedOpacity(options.mutedOpacity);
    let hidden: SemanticElement[] = [];
    return {
        id,
        eventSource: clickTrigger,
        claimsLegendActivation: true,
        affordances: [{ target: 'legend-item', cursor: 'activate', hover: 'cohort' }],
        handle(event, context) {
            if (!legendActivation(event)) return null;
            const elements = event.target?.elements ?? [];
            if (elements.length === 0) return null;
            const remaining = withoutElements(hidden, elements);
            const hiding = remaining.length === hidden.length;
            const next = hiding ? [...hidden, ...elements] : remaining;
            const available = context.available ?? [];
            const hasStableLegendDomain = context.legendDomains
                && Object.values(context.legendDomains).some((domain) => domain.length > 0);
            const hidesEverySeries = hiding && (
                hidesFullLegendDomain(next, context.legendDomains)
                || (!hasStableLegendDomain && available.length > 0 && available.every((candidate) =>
                    elements.some((element) => legendElementMatches(element, candidate))))
            );
            hidden = hidesEverySeries ? [] : next;
            return {
                id,
                ops: [{
                    op: 'set-style',
                    targets: hidden.length > 0
                        ? [{ visual: { kind: 'legend', role: 'legend-item' }, elements: hidden }]
                        : [],
                    value: { visible: false, mutedOpacity },
                }],
            };
        },
    };
}
