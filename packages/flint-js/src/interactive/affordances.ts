import type { CanvasInteractionDef } from './interactions';

export type InteractionAffordanceTarget = 'mark' | 'legend-item' | 'axis-label' | 'plot';
export type InteractionCursor = 'activate' | 'drag' | 'region' | 'navigate' | 'inspect' | 'draw';
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
    draw: 45,
    drag: 50,
};

/**
 * A pen for freehand input over the plot. Like an arrow cursor, its tip is the
 * top-left hotspot and the body trails to the bottom right.
 */
const DRAW_CURSOR_SVG = [
    "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>",
    "<path d='M3 3l4.6 1.2L20 16.6a1.8 1.8 0 0 1 0 2.6l-.8.8a1.8 1.8 0 0 1-2.6 0L4.2 7.6z' ",
    "fill='%23333333' stroke='%23ffffff' stroke-width='1.4' stroke-linejoin='round'/>",
    "<path d='M18 14.6l-3.4 3.4' stroke='%23ffffff' stroke-width='1.2'/>",
    '</svg>',
].join('');
export const DRAW_CURSOR = `url("data:image/svg+xml;utf8,${DRAW_CURSOR_SVG}") 3 3, crosshair`;

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
        case 'draw': return DRAW_CURSOR;
        default: return undefined;
    }
}