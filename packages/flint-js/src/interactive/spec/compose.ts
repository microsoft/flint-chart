import type { ChartUpdate } from '../../core/interaction-contracts';
import type { ChartAssemblyInput, ChartWarning } from '../../core/types';
import { normalizeInteractions, type InteractionDef } from '../interactions';
import type { BuildInteractiveChartOptions } from '../types';
import { resolveInteractionSpec } from './resolve';

export interface ComposedInteractiveOptions {
    /** Spec interactions first, then the code's, with no id shared between the two. */
    readonly interactions: readonly InteractionDef[];
    /** From the code only. The spec carries behaviour, not state. */
    readonly updates: readonly ChartUpdate[];
    readonly assistedTargeting: BuildInteractiveChartOptions['assistedTargeting'];
    readonly keyboardTargeting: boolean | undefined;
    /** Warnings known before the mount, such as a spec a static backend ignores. */
    readonly warnings: readonly ChartWarning[];
}

type ComposeInput = Pick<ChartAssemblyInput, 'interaction_spec'>;
type ComposeOptions = Pick<
    BuildInteractiveChartOptions,
    'backend' | 'interactions' | 'updates' | 'assistedTargeting' | 'keyboardTargeting'
>;

/**
 * Merge `input.interaction_spec` with what the code passed to `mountChart()`.
 *
 * The spec's interactions come first and the code's follow. A code definition
 * with a spec entry's id replaces that entry, with an `info` warning. The
 * targeting policies come from the code when it sets them and from the spec
 * otherwise. A backend that runs no interactions renders the chart static and
 * drops every interaction with one warning: `info` when only the spec asked,
 * `warning` when the code did.
 */
export function composeInteractiveOptions(input: ComposeInput, options: ComposeOptions): ComposedInteractiveOptions {
    const resolved = resolveInteractionSpec(input.interaction_spec);
    let code: readonly InteractionDef[] = options.interactions ?? [];
    const warnings: ChartWarning[] = [];
    const codeIds = new Set(code.map((interaction) => interaction.id));
    let specInteractions = resolved.interactions.filter((interaction) => {
        if (!codeIds.has(interaction.id)) return true;
        warnings.push({
            severity: 'info',
            code: 'interaction_overridden',
            message: `Interaction "${interaction.id}" from interaction_spec is replaced by the definition passed in code.`,
        });
        return false;
    });
    if (options.backend !== 'vegalite' && specInteractions.length + code.length > 0) {
        warnings.push({
            severity: code.length > 0 ? 'warning' : 'info',
            code: 'interactions_ignored',
            message: `Interactions are ignored: backend "${options.backend}" does not run interactions, so the chart renders static.`,
        });
        specInteractions = [];
        code = [];
    }
    return {
        interactions: normalizeInteractions([...specInteractions, ...code]),
        updates: options.updates ?? [],
        assistedTargeting: options.assistedTargeting ?? resolved.surface.assistedTargeting,
        keyboardTargeting: options.keyboardTargeting ?? resolved.surface.keyboardTargeting,
        warnings,
    };
}
