/**
 * The gestures that return one interaction to its neutral state. Every preset
 * that retains state accepts `reset`, a list of these, and the registry says
 * which of them each preset supports. The meaning of a gesture depends only on
 * what the reader did, never on which other interactions a chart mounts.
 */
import type { CanvasInteractionDef } from './interactions';

export const INTERACTION_RESET_GESTURES = ['click-none', 'double-click', 'escape'] as const;

/**
 * - `click-none`: one click whose hit resolves to no element (no mark, path
 *   segment, legend item, or axis label). Empty plot and margin both count.
 * - `double-click`: two quick clicks anywhere on the chart; no hit rule, so dense
 *   charts with no empty pixel can still reset.
 * - `escape`: the Escape key while the chart has focus.
 */
export type InteractionResetGesture = (typeof INTERACTION_RESET_GESTURES)[number];

/** Presets whose committed emphasis or annotation is retained until the reader clears it. */
export const SELECTION_RESET: readonly InteractionResetGesture[] = ['click-none', 'escape'];
/** Presets that move a viewport. */
export const NAVIGATION_RESET: readonly InteractionResetGesture[] = ['double-click'];
/** Presets whose retained state is a setting, not a selection; they reset only when asked. */
export const NO_RESET: readonly InteractionResetGesture[] = [];

export function isResetGesture(value: unknown): value is InteractionResetGesture {
    return typeof value === 'string' && (INTERACTION_RESET_GESTURES as readonly string[]).includes(value);
}

/** An explicit list wins; an absent one takes the preset's default. Unknown names throw. */
export function normalizeResetGestures(
    reset: readonly InteractionResetGesture[] | undefined,
    fallback: readonly InteractionResetGesture[],
): readonly InteractionResetGesture[] {
    if (reset === undefined) return fallback;
    if (!Array.isArray(reset)) throw new Error('reset must be a list of gestures.');
    for (const gesture of reset) {
        if (!isResetGesture(gesture)) {
            throw new Error(`Unknown reset gesture "${String(gesture)}". Gestures: ${INTERACTION_RESET_GESTURES.join(', ')}.`);
        }
    }
    return [...new Set(reset)];
}

/** The interactions one gesture resets: those whose list holds it, in their mounted order. */
export function interactionsToReset(
    interactions: readonly CanvasInteractionDef[],
    gesture: InteractionResetGesture,
): CanvasInteractionDef[] {
    return interactions.filter((interaction) => interaction.reset?.includes(gesture));
}
