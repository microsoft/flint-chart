import type { CanvasInteractionDef } from './interactions';

export type InteractionAffordanceTarget = 'mark' | 'legend-item' | 'axis-label' | 'plot';
export type InteractionCursor = 'activate' | 'drag' | 'region' | 'navigate' | 'inspect';
export type InteractionHoverEffect = 'target' | 'cohort';

export interface InteractionAffordance {
    readonly target: InteractionAffordanceTarget;
    readonly cursor?: InteractionCursor;
    readonly hover?: InteractionHoverEffect;
    readonly priority?: number;
}

const CURSOR_PRIORITY: Record<InteractionCursor, number> = {
    activate: 10,
    inspect: 20,
    navigate: 30,
    region: 40,
    drag: 50,
};

export function resolveInteractionAffordance(
    interactions: readonly CanvasInteractionDef[],
    target: InteractionAffordanceTarget,
    eligibleInteractionIds?: ReadonlySet<string>,
): InteractionAffordance | undefined {
    const claims = interactions
        .filter((interaction) => !eligibleInteractionIds || eligibleInteractionIds.has(interaction.id))
        .flatMap((interaction) => interaction.affordances ?? [])
        .filter((affordance) => affordance.target === target
            || (target !== 'plot' && affordance.target === 'plot'));
    const exactClaims = claims.filter((claim) => claim.target === target);
    const eligibleClaims = exactClaims.length > 0 ? exactClaims : claims;
    const priority = (claim: InteractionAffordance): number =>
        claim.priority ?? (claim.cursor ? CURSOR_PRIORITY[claim.cursor] : 0);
    const cursor = eligibleClaims.filter((claim) => claim.cursor)
        .sort((left, right) => priority(right) - priority(left))[0]?.cursor;
    const hover = eligibleClaims.filter((claim) => claim.hover)
        .sort((left, right) => priority(right) - priority(left))[0]?.hover;
    return cursor || hover ? { target, ...(cursor ? { cursor } : {}), ...(hover ? { hover } : {}) } : undefined;
}

export function affordanceCursor(affordance: InteractionAffordance | undefined): string | undefined {
    switch (affordance?.cursor) {
        case 'activate': return 'pointer';
        case 'drag': return 'grab';
        case 'region': return 'crosshair';
        case 'navigate': return 'grab';
        case 'inspect': return 'crosshair';
        default: return undefined;
    }
}