import type {
    CanvasInteractionEvent,
    ChartUpdateRequest,
    InteractionModifiers,
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

export function applySelectionMode(
    current: ReadonlySet<string>,
    keys: readonly string[],
    mode: 'replace' | 'toggle',
): Set<string> {
    if (mode === 'replace') return new Set(keys);
    const next = new Set(current);
    const allSelected = keys.every((key) => next.has(key));
    for (const key of keys) {
        if (allSelected) next.delete(key);
        else next.add(key);
    }
    return next;
}

export function emphasisUpdate(
    updateId: string,
    event: Pick<CanvasInteractionEvent, 'phase' | 'modifiers'>,
    target: SemanticTarget | null,
    dimOpacity: number,
): ChartUpdateRequest | null {
    if (!target) return { updateId, phase: event.phase, ops: [{ op: 'reset' }] };
    if (target.elements.length === 0) return null;
    return {
        updateId,
        phase: event.phase,
        ops: [{
            op: 'emphasize',
            targets: [target],
            mode: selectionMode(event.modifiers),
            dimOpacity,
        }],
    };
}