import { describe, expect, it } from 'vitest';
import { INTERACTION_PRESET_TYPES, type InteractionSpec } from '../src/core/interaction-spec';
import { INTERACTION_PRESETS, listInteractionPresets } from '../src/interactive/spec/registry';
import type { InteractionPresetSpec } from '../src/interactive/spec/types';
import { resolveInteractionSpec } from '../src/interactive/spec/resolve';
import { brushX, navigate } from '../src/interactive/interactions';

/** The comparable half of a definition: everything but the handler and the origin tag. */
const dataOnly = (definition: object): Record<string, unknown> => Object.fromEntries(
    Object.entries(definition).filter(([key, value]) => typeof value !== 'function' && key !== 'origin'),
);

/** Options a factory cannot default; the registry names them as `requiredOptions`. */
const REQUIRED: Partial<Record<string, Record<string, unknown>>> = {
    'hover-group-focus': { groupBy: 'Country' },
    'linked-brush': { groupBy: 'Country' },
};

describe('interaction preset registry', () => {
    it('has one entry per preset type, keyed by that type', () => {
        expect(Object.keys(INTERACTION_PRESETS).sort()).toEqual([...INTERACTION_PRESET_TYPES].sort());
        for (const type of INTERACTION_PRESET_TYPES) expect(INTERACTION_PRESETS[type].type).toBe(type);
    });

    it('names the options a factory cannot default', () => {
        expect(INTERACTION_PRESETS['hover-group-focus'].requiredOptions).toEqual(['groupBy']);
        expect(INTERACTION_PRESETS['linked-brush'].requiredOptions).toEqual(['groupBy']);
        expect(INTERACTION_PRESETS.navigate.requiredOptions).toBeUndefined();
    });

    it('lists every preset without its factory', () => {
        const summaries = listInteractionPresets();
        expect(summaries.map((summary) => summary.type)).toEqual([...INTERACTION_PRESET_TYPES]);
        for (const summary of summaries) {
            expect(summary).not.toHaveProperty('create');
            expect(summary.label.length).toBeGreaterThan(0);
            expect(summary.description.length).toBeGreaterThan(0);
        }
    });
});

describe('resolveInteractionSpec', () => {
    it('returns nothing for an absent spec', () => {
        const resolved = resolveInteractionSpec(undefined);
        expect(resolved.interactions).toEqual([]);
        expect(resolved.updates).toEqual([]);
        expect(resolved.surface).toEqual({});
    });

    it('creates the same definition the factory returns, tagged with its origin', () => {
        const { interactions } = resolveInteractionSpec({
            interactions: [{ type: 'brush-x', options: { mode: 'stateful', dimOpacity: 0.3 } }],
        });
        expect(interactions).toHaveLength(1);
        expect(interactions[0].origin).toBe('spec');
        expect(typeof interactions[0].handle).toBe('function');
        expect(dataOnly(interactions[0])).toEqual(dataOnly(brushX({ mode: 'stateful', dimOpacity: 0.3 })));
    });

    it('resolves every preset type with default options and the type as its id', () => {
        for (const type of INTERACTION_PRESET_TYPES) {
            const required = REQUIRED[type];
            const { interactions } = resolveInteractionSpec({
                interactions: [required ? { type, options: required } : { type }],
            });
            expect(interactions).toHaveLength(1);
            expect(interactions[0].id).toBe(type);
            expect(interactions[0].eventSource.type).toBeTruthy();
        }
    });

    it('passes options through, including the navigate reset list', () => {
        const entry: InteractionPresetSpec = {
            type: 'navigate',
            options: { axes: 'x', pan: false, reset: ['click-background'] },
        };
        const { interactions } = resolveInteractionSpec({ interactions: [entry] });
        expect(interactions[0].eventSource).toMatchObject({
            type: 'navigation', axes: 'x', pan: false, reset: ['click-background'],
        });
        expect(dataOnly(interactions[0])).toEqual(dataOnly(navigate({ axes: 'x', pan: false, reset: ['click-background'] })));
    });

    it('takes the id from the entry, so one type can appear twice', () => {
        const { interactions } = resolveInteractionSpec({
            interactions: [
                { type: 'brush-x', id: 'years' },
                { type: 'brush-x', id: 'months', options: { mode: 'stateful' } },
            ],
        });
        expect(interactions.map((interaction) => interaction.id)).toEqual(['years', 'months']);
    });

    it('rejects an unknown type and names the entry and the known types', () => {
        expect(() => resolveInteractionSpec({ interactions: [{ type: 'zoom' as never }] }))
            .toThrow(/interaction_spec\.interactions\[0\] \(zoom\): unknown preset type\. Known types: click-highlight, .*navigate/);
    });

    it('rejects an entry that is not an object', () => {
        expect(() => resolveInteractionSpec({ interactions: ['navigate' as never] }))
            .toThrow(/interaction_spec\.interactions\[0\]: expected an object with a "type"/);
    });

    it('rejects a flat option and points at "options"', () => {
        expect(() => resolveInteractionSpec({ interactions: [{ type: 'navigate', axes: 'x' } as never] }))
            .toThrow(/interaction_spec\.interactions\[0\] \(navigate\): unexpected key "axes"\. Put preset options under "options"/);
        expect(() => resolveInteractionSpec({ interactions: [{ type: 'navigate', axes: 'x', pan: false } as never] }))
            .toThrow(/unexpected keys "axes", "pan"/);
    });

    it('rejects an id inside options', () => {
        expect(() => resolveInteractionSpec({ interactions: [{ type: 'brush-x', options: { id: 'years' } as never }] }))
            .toThrow(/interaction_spec\.interactions\[0\] \(brush-x\): put "id" on the entry, not inside "options"/);
    });

    it('rejects options that are not an object', () => {
        expect(() => resolveInteractionSpec({ interactions: [{ type: 'brush-x', options: ['stateful'] as never }] }))
            .toThrow(/interaction_spec\.interactions\[0\] \(brush-x\): "options" must be an object/);
    });

    it('rejects a missing required option by name', () => {
        expect(() => resolveInteractionSpec({ interactions: [{ type: 'hover-group-focus' }] }))
            .toThrow(/interaction_spec\.interactions\[0\] \(hover-group-focus\): option "groupBy" is required/);
    });

    it('prefixes a factory error with the entry', () => {
        expect(() => resolveInteractionSpec({ interactions: [{ type: 'inspect-index', options: { show: 'single' } }] }))
            .toThrow(/interaction_spec\.interactions\[0\] \(inspect-index\): inspectIndex/);
        expect(() => resolveInteractionSpec({
            interactions: [{ type: 'navigate', options: { domainGuard: { minVisibleFraction: 0.5, maxVisibleFraction: 0.1 } } }],
        })).toThrow(/interaction_spec\.interactions\[0\] \(navigate\): navigate\(\)/);
    });

    it('rejects two entries that resolve to one id', () => {
        expect(() => resolveInteractionSpec({ interactions: [{ type: 'brush-x' }, { type: 'brush-x' }] }))
            .toThrow(/interaction_spec\.interactions\[1\] \(brush-x\): duplicate id "brush-x" \(also used by interactions\[0\]\)/);
        expect(() => resolveInteractionSpec({ interactions: [{ type: 'brush-x', id: 'same' }, { type: 'brush-y', id: 'same' }] }))
            .toThrow(/interactions\[1\] \(brush-y\): duplicate id "same"/);
    });

    it('passes updates and surface policies through unchanged', () => {
        const spec: InteractionSpec = {
            interactions: [],
            updates: [{ id: 'seed', ops: [{ op: 'set-style', targets: [], value: { state: 'normal' } }] }],
            dismiss: { escape: true },
            keyboardTargeting: true,
        };
        const resolved = resolveInteractionSpec(spec);
        expect(resolved.updates).toEqual(spec.updates);
        expect(resolved.surface).toEqual({ dismiss: { escape: true }, keyboardTargeting: true });
    });

    it('rejects a malformed update', () => {
        expect(() => resolveInteractionSpec({ interactions: [], updates: [{ id: 'seed' } as never] }))
            .toThrow(/interaction_spec\.updates\[0\] must be a ChartUpdate/);
    });
});
