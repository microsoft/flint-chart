import type {
    ChartUpdate,
    InteractionModifiers,
    SemanticElement,
    SemanticTarget,
} from './interactions';

export const DEFAULT_DIM_OPACITY = 0.25;

export function normalizedOpacity(value: number | undefined): number {
    if (value === undefined || !Number.isFinite(value)) return DEFAULT_DIM_OPACITY;
    return Math.min(1, Math.max(0, value));
}

function selectionMode(modifiers: InteractionModifiers | undefined): 'replace' | 'toggle' {
    return modifiers?.shift || modifiers?.ctrl || modifiers?.meta ? 'toggle' : 'replace';
}

export function emphasisUpdate(
    target: SemanticTarget | null,
    modifiers: InteractionModifiers | undefined,
    dimOpacity: number,
    elements: readonly SemanticElement[] = target?.elements ?? [],
): ChartUpdate | null {
    if (!target) return { ops: [{ op: 'reset' }] };
    if (!target || elements.length === 0) return null;
    return {
        ops: [{
            op: 'emphasize',
            elements,
            mode: selectionMode(modifiers),
            dimOpacity,
        }],
    };
}