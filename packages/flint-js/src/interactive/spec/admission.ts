import type { ChartWarning } from '../../core/types';
import {
    INTERACTION_CAPABILITY_DESCRIPTIONS,
    INTERACTION_PRESET_REQUIREMENTS,
    type InteractionCapability,
} from '../../core/interaction-spec';
import type { CanvasInteractionDef } from '../interactions';
import type { InteractionAffordanceTarget } from '../affordances';
import type { NavigationAxes } from '../language/events';

/** What admission reads from the compiled chart: the fields the assembler writes to `_interactionSemantics`. */
export interface InteractionAdmissionPlan {
    readonly chartType?: string;
    /** The capabilities the assembler confirmed for this chart and its data. */
    readonly capabilities: readonly InteractionCapability[];
    readonly navigationAxes?: readonly ('x' | 'y')[];
}

export interface InteractionAdmission {
    /** The interactions the chart can honour, in their original order. */
    readonly admitted: readonly CanvasInteractionDef[];
    /** One warning per dropped spec interaction. */
    readonly warnings: readonly ChartWarning[];
}

type Axis = 'x' | 'y';

/** The axes a navigation source asks for, given what the chart offers. */
export function navigationAxesFor(
    axes: NavigationAxes | 'available' | undefined,
    available: readonly Axis[],
): readonly Axis[] {
    if (axes === undefined || axes === 'available') return available;
    return axes === 'xy' ? ['x', 'y'] : [axes];
}

const DROPPED = 'The interaction was dropped.';

/** One gesture on one kind of hit: the unit two interactions can share. */
export interface InteractionTrigger {
    readonly id: string;
    /** How a warning names it. */
    readonly description: string;
    /** The affordance key behind a hit trigger; an interaction can give it up and keep the rest. */
    readonly key?: InteractionAffordanceTarget;
}

const NAVIGATION: InteractionTrigger = { id: 'navigation', description: 'the navigation slot' };
const REGION_DRAG: InteractionTrigger = { id: 'region-drag', description: 'the region drag slot' };
const ELEMENT_DRAG: InteractionTrigger = { id: 'element-drag', description: 'the element drag slot' };
const PLOT_DRAG: InteractionTrigger = { id: 'drag:plot', description: 'the plot drag' };
const DOUBLE_CLICK: InteractionTrigger = { id: 'double-click', description: 'the double-click' };
const LEGEND_CLICK: InteractionTrigger = { id: 'click:legend-item', description: 'legend clicks', key: 'legend-item' };
const AXIS_CLICK: InteractionTrigger = { id: 'click:axis-label', description: 'axis label clicks', key: 'axis-label' };

/** The triggers an interaction takes for itself, read from its event source, affordances, state group, and reset list. */
export function triggersOf(interaction: CanvasInteractionDef): readonly InteractionTrigger[] {
    const { eventSource, affordances, reset, retainedStateGroup } = interaction;
    const triggers: InteractionTrigger[] = [];
    const drags = eventSource.gesture === 'drag';
    if (eventSource.type === 'navigation') {
        triggers.push(NAVIGATION);
        if (eventSource.pan) triggers.push(PLOT_DRAG);
    }
    if (eventSource.type === 'region' && drags) triggers.push(REGION_DRAG, PLOT_DRAG);
    if (eventSource.type === 'element' && drags) triggers.push(ELEMENT_DRAG, PLOT_DRAG);
    if (eventSource.gesture === 'double' || reset?.includes('double-click')) triggers.push(DOUBLE_CLICK);
    if (eventSource.gesture === 'click') {
        if ('legend-item' in affordances) triggers.push(LEGEND_CLICK);
        if ('axis-label' in affordances) triggers.push(AXIS_CLICK);
        if (retainedStateGroup && 'mark' in affordances) {
            triggers.push({
                id: `${retainedStateGroup}:click:mark`,
                description: `mark clicks with retained ${retainedStateGroup}`,
                key: 'mark',
            });
        }
    }
    return triggers;
}

/** The first trigger two admitted interactions share, in list order. */
function firstSharedTrigger(
    interactions: readonly CanvasInteractionDef[],
): { trigger: InteractionTrigger; earlier: CanvasInteractionDef; later: CanvasInteractionDef } | undefined {
    for (const [index, earlier] of interactions.entries()) {
        for (const trigger of triggersOf(earlier)) {
            const later = interactions.slice(index + 1)
                .find((candidate) => triggersOf(candidate).some((other) => other.id === trigger.id));
            if (later) return { trigger, earlier, later };
        }
    }
    return undefined;
}

/** A copy of `interaction` that no longer takes `trigger`, or undefined when it cannot give it up and keep the rest. */
function without(interaction: CanvasInteractionDef, trigger: InteractionTrigger): CanvasInteractionDef | undefined {
    if (!trigger.key || !interaction.withoutAffordances) return undefined;
    const copy = interaction.withoutAffordances([trigger.key]);
    if (!copy) return undefined;
    return interaction.origin ? { ...copy, origin: interaction.origin } : copy;
}

/** A preset needs what the core table says; a definition made by hand needs nothing. */
export function interactionRequirements(interaction: CanvasInteractionDef): readonly InteractionCapability[] {
    return interaction.preset ? INTERACTION_PRESET_REQUIREMENTS[interaction.preset] : [];
}

/**
 * Decide which interactions a compiled chart can honour.
 *
 * The answer depends on origin. A definition made in code throws, because a
 * developer sees the exception. An entry from `interaction_spec` is dropped and
 * reported as a `ChartWarning`, because an agent reads warnings and the chart
 * should still render. When two entries share a trigger, the one that can give it up
 * and keep the rest does so; otherwise the later entry yields whole.
 */
export function admitInteractions(
    plan: InteractionAdmissionPlan,
    interactions: readonly CanvasInteractionDef[],
): InteractionAdmission {
    const warnings: ChartWarning[] = [];
    const reject = (
        interaction: CanvasInteractionDef,
        code: 'unsupported_interaction' | 'conflicting_interactions',
        message: string,
    ): false => {
        if (interaction.origin !== 'spec') throw new Error(message);
        warnings.push({ severity: 'warning', code, message: `${message} ${DROPPED}` });
        return false;
    };
    const capabilities = new Set(plan.capabilities);
    const chart = plan.chartType ?? 'this chart';
    const available = plan.navigationAxes ?? [];

    // Every capability the interaction needs must be present on this chart.
    let admitted = interactions.filter((interaction) => {
        const missing = interactionRequirements(interaction).find((capability) => !capabilities.has(capability));
        if (missing) {
            return reject(interaction, 'unsupported_interaction',
                `Interaction "${interaction.id}" requires ${INTERACTION_CAPABILITY_DESCRIPTIONS[missing]}; ${chart} has none.`);
        }
        const source = interaction.eventSource;
        if (source.type === 'navigation') {
            const requested = navigationAxesFor(source.axes, available);
            const unsupported = requested.filter((axis) => !available.includes(axis));
            if (unsupported.length > 0) {
                return reject(interaction, 'unsupported_interaction',
                    `Interaction "${interaction.id}" requested unsupported navigation axis: ${unsupported.join(', ')}.`);
            }
        }
        return true;
    });

    // One trigger, one owner. When exactly one of the two can give the trigger up and keep
    // the rest, it does; otherwise the later entry yields whole, and a spec entry always
    // yields to a code definition.
    for (;;) {
        const shared = firstSharedTrigger(admitted);
        if (!shared) break;
        const { trigger, earlier, later } = shared;
        const narrowed = [earlier, later]
            .map((interaction) => ({ interaction, copy: without(interaction, trigger) }))
            .filter(({ copy }) => copy);
        if (narrowed.length === 1) {
            const { interaction, copy } = narrowed[0];
            const owner = interaction === earlier ? later : earlier;
            warnings.push({
                severity: 'info',
                code: 'conflicting_interactions',
                message: `Interaction "${interaction.id}" yields ${trigger.description} to "${owner.id}".`,
            });
            admitted = admitted.map((candidate) => (candidate === interaction ? copy! : candidate));
            continue;
        }
        const victim = later.origin === 'spec' || earlier.origin !== 'spec' ? later : earlier;
        const kept = victim === later ? earlier : later;
        reject(victim, 'conflicting_interactions',
            `Interaction "${victim.id}" shares ${trigger.description} with "${kept.id}".`);
        admitted = admitted.filter((candidate) => candidate !== victim);
    }

    return { admitted, warnings };
}
