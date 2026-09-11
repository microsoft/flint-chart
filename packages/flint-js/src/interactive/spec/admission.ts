import type { ChartWarning } from '../../core/types';
import type { CanvasInteractionDef } from '../interactions';
import type { NavigationAxes } from '../language/events';

/** What admission reads from the compiled chart: the fields the assembler writes to `_interactionSemantics`. */
export interface InteractionAdmissionPlan {
    readonly fields: readonly string[];
    readonly selectableMarks: readonly string[];
    readonly resolve?: unknown;
    readonly navigationAxes?: readonly ('x' | 'y')[];
    readonly supportedRegionGestures?: readonly ('cartesian' | 'angular')[];
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

const PAN_DRAG_CONFLICT = 'Pan navigation cannot share an unmodified drag gesture with a region interaction.';
const DROPPED = 'The interaction was dropped.';

/**
 * Decide which interactions a compiled chart can honour.
 *
 * The checks are the ones the Vega-Lite compile step used to make inline. They
 * now answer differently by origin: a definition made in code throws, as it
 * always did, because a developer sees the exception; an entry that came from
 * `interaction_spec` is dropped and reported as a `ChartWarning`, because an
 * agent reads warnings and the chart should still render. When two entries
 * conflict, the one later in the list yields.
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
    const hasElementSemantics = !!plan.resolve || plan.fields.length > 0 || plan.selectableMarks.length > 0;
    const available = plan.navigationAxes ?? [];
    const angular = plan.supportedRegionGestures?.includes('angular') ?? false;

    // Capability checks, one interaction at a time.
    let admitted = interactions.filter((interaction) => {
        const source = interaction.eventSource;
        if ((source.type === 'element' || source.type === 'region') && !hasElementSemantics) {
            return reject(interaction, 'unsupported_interaction',
                `Interaction "${interaction.id}" requires chart element semantics.`);
        }
        if (source.type === 'navigation') {
            const requested = navigationAxesFor(source.axes, available);
            if (requested.length === 0) {
                return reject(interaction, 'unsupported_interaction',
                    `Interaction "${interaction.id}" requires a chart with a navigable continuous axis.`);
            }
            const unsupported = requested.filter((axis) => !available.includes(axis));
            if (unsupported.length > 0) {
                return reject(interaction, 'unsupported_interaction',
                    `Interaction "${interaction.id}" requested unsupported navigation axis: ${unsupported.join(', ')}.`);
            }
        }
        if (source.regionGeometry === 'angular' && !angular) {
            return reject(interaction, 'unsupported_interaction',
                `Interaction "${interaction.id}" requires a polar chart with angular-region support.`);
        }
        return true;
    });

    // A chart navigates through one interaction. A later spec entry yields; code keeps today's
    // behaviour, where the first definition wins.
    let navigation: CanvasInteractionDef | undefined;
    admitted = admitted.filter((interaction) => {
        if (interaction.eventSource.type !== 'navigation') return true;
        if (!navigation) {
            navigation = interaction;
            return true;
        }
        if (interaction.origin !== 'spec') return true;
        warnings.push({
            severity: 'warning',
            code: 'conflicting_interactions',
            message: `Interaction "${interaction.id}" is a second navigation interaction; the chart keeps "${navigation.id}". ${DROPPED}`,
        });
        return false;
    });

    // Pan and an unmodified drag gesture cannot share the plot.
    for (;;) {
        const pan = admitted.find((interaction) =>
            interaction.eventSource.type === 'navigation' && interaction.eventSource.pan);
        const drag = admitted.find((interaction) =>
            interaction.eventSource.type !== 'navigation' && interaction.eventSource.gesture === 'drag');
        if (!pan || !drag) break;
        if (pan.origin !== 'spec' && drag.origin !== 'spec') throw new Error(PAN_DRAG_CONFLICT);
        const later = admitted.indexOf(pan) > admitted.indexOf(drag) ? pan : drag;
        const earlier = later === pan ? drag : pan;
        const victim = later.origin === 'spec' ? later : earlier;
        const kept = victim === pan ? drag : pan;
        warnings.push({
            severity: 'warning',
            code: 'conflicting_interactions',
            message: `Interaction "${victim.id}" conflicts with "${kept.id}": ${PAN_DRAG_CONFLICT.charAt(0).toLowerCase()}${PAN_DRAG_CONFLICT.slice(1)} ${DROPPED}`,
        });
        admitted = admitted.filter((interaction) => interaction !== victim);
    }

    return { admitted, warnings };
}
