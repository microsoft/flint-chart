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
    if (!target) return { id, ops: [{ op: 'set-presentation', targets: [], value: { state: 'normal' } }] };
    if (target.elements.length === 0) return null;
    const toggle = selectionMode(event.modifiers) === 'toggle';
    const targetKeys = new Set(target.elements.map((element) => JSON.stringify(element.key)));
    const allSelected = target.elements.every((element) =>
        context.selected.some((selected) => JSON.stringify(selected.key) === JSON.stringify(element.key)));
    const elements = !toggle
        ? target.elements
        : allSelected
            ? context.selected.filter((element) => !targetKeys.has(JSON.stringify(element.key)))
            : [...context.selected, ...target.elements.filter((element) =>
                !context.selected.some((selected) => JSON.stringify(selected.key) === JSON.stringify(element.key)))];
    return {
        id,
        ops: [{
            op: 'set-presentation',
            targets: elements.length > 0 ? [{ visual: target.visual, elements }] : [],
            value: { state: elements.length > 0 ? 'emphasized' : 'normal', mutedOpacity: dimOpacity },
        }],
    };
}