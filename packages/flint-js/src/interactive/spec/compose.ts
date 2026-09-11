import type { ChartUpdate } from '../../core/interaction-contracts';
import type { ChartAssemblyInput, ChartWarning } from '../../core/types';
import { normalizeInteractions, type InteractionDef } from '../interactions';
import type { BuildInteractiveChartOptions } from '../types';
import { resolveInteractionSpec } from './resolve';

export interface ComposedInteractiveOptions {
    /** Spec interactions first, then the code's, with no id shared between the two. */
    readonly interactions: readonly InteractionDef[];
    /** Spec updates first, then the code's. */
    readonly updates: readonly ChartUpdate[];
    readonly assistedTargeting: BuildInteractiveChartOptions['assistedTargeting'];
    readonly keyboardTargeting: boolean | undefined;
    readonly dismiss: BuildInteractiveChartOptions['dismiss'];
    /** Warnings known before the mount, such as a spec a static backend ignores. */
    readonly warnings: readonly ChartWarning[];
}

type ComposeInput = Pick<ChartAssemblyInput, 'interaction_spec'>;
type ComposeOptions = Pick<
    BuildInteractiveChartOptions,
    'backend' | 'interactions' | 'updates' | 'assistedTargeting' | 'keyboardTargeting' | 'dismiss'
>;

/**
 * Merge `input.interaction_spec` with what the code passed to `buildInteractiveChart()`.
 *
 * The spec comes first in every list. A code definition cannot replace a spec
 * entry by reusing its id; the collision is an error that names both sources.
 * The three surface policies come from the code when it sets them, `false`
 * included, and from the spec otherwise. A backend that runs no interactions
 * ignores the spec with one `info` warning, unless the code also asked for
 * interactions, in which case the mount still fails as it does today.
 */
export function composeInteractiveOptions(input: ComposeInput, options: ComposeOptions): ComposedInteractiveOptions {
    const resolved = resolveInteractionSpec(input.interaction_spec);
    const code = options.interactions ?? [];
    const warnings: ChartWarning[] = [];
    let specInteractions = resolved.interactions;
    let specUpdates = resolved.updates;
    if (options.backend !== 'vegalite'
        && code.length === 0
        && (specInteractions.length > 0 || specUpdates.length > 0)) {
        warnings.push({
            severity: 'info',
            code: 'interactions_ignored',
            message: `interaction_spec is ignored: backend "${options.backend}" does not run interactions.`,
        });
        specInteractions = [];
        specUpdates = [];
    }
    const codeIds = new Set(code.map((interaction) => interaction.id));
    const shared = specInteractions.find((interaction) => codeIds.has(interaction.id));
    if (shared) {
        throw new Error(
            `Interaction "${shared.id}" is defined in interaction_spec and in options.interactions. Give one of them another id.`,
        );
    }
    return {
        interactions: normalizeInteractions([...specInteractions, ...code]),
        updates: [...specUpdates, ...(options.updates ?? [])],
        assistedTargeting: options.assistedTargeting ?? resolved.surface.assistedTargeting,
        keyboardTargeting: options.keyboardTargeting ?? resolved.surface.keyboardTargeting,
        dismiss: options.dismiss ?? resolved.surface.dismiss,
        warnings,
    };
}
