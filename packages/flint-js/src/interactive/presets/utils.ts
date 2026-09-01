import type {
    CanvasInteractionEvent,
    ChartUpdate,
    InteractionModifiers,
    InteractionContext,
    SemanticTarget,
} from '../interactions';

export const DEFAULT_DIM_OPACITY = 0.25;

export function normalizedOpacity(value: number | undefined): number {
    if (value === undefined || !Number.isFinite(value)) return DEFAULT_DIM_OPACITY;
    return Math.min(1, Math.max(0, value));
}

/** Keyboard activation reaches the same presets as a click on the target. */
export function isActivationAction(action: string): boolean {
    return action.startsWith('click-') || action === 'activate-element';
}

export function semanticElementIdentity(element: SemanticTarget['elements'][number]): string {
    return JSON.stringify([element.value, element.records ?? []]);
}

function selectionMode(modifiers: InteractionModifiers | undefined): 'replace' | 'toggle' {
    return modifiers?.shift || modifiers?.ctrl || modifiers?.meta ? 'toggle' : 'replace';
}

export function emphasisUpdate(
    id: string,
    event: Pick<CanvasInteractionEvent, 'phase' | 'modifiers'>,
    target: SemanticTarget | null,
    dimOpacity: number,
    context: InteractionContext,
): ChartUpdate | null {
    if (!target) return { id, ops: [{ op: 'set-style', targets: [], value: { state: 'normal' } }] };
    if (target.elements.length === 0) return null;
    const toggle = selectionMode(event.modifiers) === 'toggle';
    const targetKeys = new Set(target.elements.map(semanticElementIdentity));
    const allSelected = target.elements.every((element) =>
        context.selected.some((selected) => semanticElementIdentity(selected) === semanticElementIdentity(element)));
    const elements = !toggle
        ? target.elements
        : allSelected
            ? context.selected.filter((element) => !targetKeys.has(semanticElementIdentity(element)))
            : [...context.selected, ...target.elements.filter((element) =>
                !context.selected.some((selected) => semanticElementIdentity(selected) === semanticElementIdentity(element)))];
    return {
        id,
        ops: [{
            op: 'set-style',
            targets: elements.length > 0 ? [{ visual: target.visual, elements }] : [],
            value: { state: elements.length > 0 ? 'emphasized' : 'normal', mutedOpacity: dimOpacity },
        }],
    };
}