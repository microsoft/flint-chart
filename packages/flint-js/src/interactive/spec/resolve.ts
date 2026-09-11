import type { ChartUpdate } from '../../core/interaction-contracts';
import {
    INTERACTION_PRESET_TYPES,
    type InteractionEntry,
    type InteractionPresetType,
    type InteractionSpec,
} from '../../core/interaction-spec';
import type { CanvasInteractionDef } from '../interactions';
import { INTERACTION_PRESETS, type InteractionPresetDefinition } from './registry';

export interface ResolvedInteractionSpec {
    /** Canvas definitions in spec order, each tagged `origin: 'spec'`. */
    readonly interactions: readonly CanvasInteractionDef[];
    readonly updates: readonly ChartUpdate[];
    readonly surface: Pick<InteractionSpec, 'assistedTargeting' | 'keyboardTargeting' | 'dismiss'>;
}

const EMPTY: ResolvedInteractionSpec = Object.freeze({
    interactions: Object.freeze([]) as readonly CanvasInteractionDef[],
    updates: Object.freeze([]) as readonly ChartUpdate[],
    surface: Object.freeze({}),
});

function isPresetType(value: unknown): value is InteractionPresetType {
    return typeof value === 'string' && (INTERACTION_PRESET_TYPES as readonly string[]).includes(value);
}

function entryLabel(index: number, type?: unknown): string {
    return `interaction_spec.interactions[${index}]${typeof type === 'string' ? ` (${type})` : ''}`;
}

/**
 * Turn `interaction_spec` into the definitions `buildInteractiveChart()` takes.
 *
 * Every entry is looked up by `type` and created through the same factory that
 * code calls, so a spec entry and a factory call are two spellings of one
 * definition. The resolver knows nothing about the chart: a preset the chart
 * cannot honour is admitted or dropped later, at mount, where the compiled
 * capabilities are known. Malformed input throws here, naming the entry.
 */
export function resolveInteractionSpec(spec: InteractionSpec | undefined): ResolvedInteractionSpec {
    if (!spec) return EMPTY;
    if (!Array.isArray(spec.interactions)) {
        throw new Error('interaction_spec.interactions must be an array of preset entries.');
    }
    const interactions: CanvasInteractionDef[] = [];
    const idOwners = new Map<string, number>();
    spec.interactions.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error(`${entryLabel(index)}: expected an object with a "type".`);
        }
        const { type, id, options, ...unexpected } = entry as InteractionEntry;
        if (!isPresetType(type)) {
            throw new Error(
                `${entryLabel(index, type)}: unknown preset type. Known types: ${INTERACTION_PRESET_TYPES.join(', ')}.`,
            );
        }
        // A flat option written by habit must not vanish silently.
        const stray = Object.keys(unexpected);
        if (stray.length > 0) {
            throw new Error(
                `${entryLabel(index, type)}: unexpected key${stray.length > 1 ? 's' : ''} ${stray.map((key) => `"${key}"`).join(', ')}. Put preset options under "options".`,
            );
        }
        if (id !== undefined && typeof id !== 'string') {
            throw new Error(`${entryLabel(index, type)}: "id" must be a string.`);
        }
        if (options !== undefined && (options === null || typeof options !== 'object' || Array.isArray(options))) {
            throw new Error(`${entryLabel(index, type)}: "options" must be an object.`);
        }
        const presetOptions: Record<string, unknown> = options ?? {};
        if ('id' in presetOptions) {
            throw new Error(`${entryLabel(index, type)}: put "id" on the entry, not inside "options".`);
        }
        const definition = INTERACTION_PRESETS[type] as InteractionPresetDefinition;
        for (const option of definition.requiredOptions ?? []) {
            if (presetOptions[option] === undefined) {
                throw new Error(`${entryLabel(index, type)}: option "${option}" is required.`);
            }
        }
        let created: CanvasInteractionDef;
        try {
            // The type name is the default id, so two entries of one type need explicit ids.
            const create = definition.create as (options: Record<string, unknown>) => CanvasInteractionDef;
            created = create({ ...presetOptions, id: id ?? type });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`${entryLabel(index, type)}: ${message}`);
        }
        const owner = idOwners.get(created.id);
        if (owner !== undefined) {
            throw new Error(
                `${entryLabel(index, type)}: duplicate id "${created.id}" (also used by interactions[${owner}]). Give one of them an id.`,
            );
        }
        idOwners.set(created.id, index);
        interactions.push({ ...created, origin: 'spec' });
    });
    const updates = spec.updates ?? [];
    if (!Array.isArray(updates)) {
        throw new Error('interaction_spec.updates must be an array of ChartUpdate values.');
    }
    updates.forEach((update, index) => {
        if (!update || typeof update !== 'object' || typeof update.id !== 'string' || !Array.isArray(update.ops)) {
            throw new Error(`interaction_spec.updates[${index}] must be a ChartUpdate with a string id and an ops array.`);
        }
    });
    return {
        interactions,
        updates,
        surface: {
            ...(spec.assistedTargeting !== undefined ? { assistedTargeting: spec.assistedTargeting } : {}),
            ...(spec.keyboardTargeting !== undefined ? { keyboardTargeting: spec.keyboardTargeting } : {}),
            ...(spec.dismiss !== undefined ? { dismiss: spec.dismiss } : {}),
        },
    };
}
