import { describe, expect, it } from 'vitest';
import { INTERACTION_PRESET_TYPES, type InteractionSpec } from '../src/core/interaction-spec';
import { INTERACTION_PRESETS, listInteractionPresets } from '../src/interactive/spec/registry';
import type { InteractionPresetSpec } from '../src/interactive/spec/types';
import { resolveInteractionSpec } from '../src/interactive/spec/resolve';
import { brushX, navigate } from '../src/interactive/interactions';
import { contextMenu, isContextMenu, menuSelection } from '../src/interactive/context-menu';

/** The comparable half of a definition: everything but the handler and the origin tag. */
const dataOnly = (definition: object): Record<string, unknown> => Object.fromEntries(
    Object.entries(definition).filter(([key, value]) => typeof value !== 'function' && key !== 'origin'),
);

/** Options a factory cannot default; the registry names them as `requiredOptions`. */
const REQUIRED: Partial<Record<string, Record<string, unknown>>> = {
    'hover-group-focus': { groupBy: 'Country' },
    'linked-brush': { groupBy: 'Country' },
    'context-menu': { items: [{ id: 'chat', label: 'Send to chat' }] },
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
            expect(Array.isArray(summary.options)).toBe(true);
            for (const required of summary.requiredOptions ?? []) {
                expect(summary.options.find((option) => option.name === required)?.required).toBe(true);
            }
        }
    });
});

describe('resolveInteractionSpec', () => {
    it('returns nothing for an absent spec', () => {
        const resolved = resolveInteractionSpec(undefined);
        expect(resolved.interactions).toEqual([]);
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
            const created = interactions[0];
            if ('external' in created) expect(type).toBe('filter-controls');
            else expect(created.eventSource.type).toBeTruthy();
        }
    });

    it('passes options through, including the navigate reset list', () => {
        const entry: InteractionPresetSpec = {
            type: 'navigate',
            options: { axes: 'x', pan: false, reset: ['click-none'] },
        };
        const { interactions } = resolveInteractionSpec({ interactions: [entry] });
        expect(interactions[0].eventSource).toMatchObject({
            type: 'navigation', axes: 'x', pan: false, reset: ['click-none'],
        });
        expect(dataOnly(interactions[0])).toEqual(dataOnly(navigate({ axes: 'x', pan: false, reset: ['click-none'] })));
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

    it('passes the targeting policies through unchanged', () => {
        const spec: InteractionSpec = { interactions: [], keyboardTargeting: true, assistedTargeting: { maxDistance: 4 } };
        expect(resolveInteractionSpec(spec).surface).toEqual({ keyboardTargeting: true, assistedTargeting: { maxDistance: 4 } });
    });

    it('rejects a key that left the spec, with a hint', () => {
        expect(() => resolveInteractionSpec({ interactions: [], dismiss: false } as never))
            .toThrow('interaction_spec: unknown key "dismiss"; put a "reset" list on each interaction instead.');
        expect(() => resolveInteractionSpec({ interactions: [], updates: [] } as never))
            .toThrow(/unknown key "updates"; state arrives through the surface/);
        expect(() => resolveInteractionSpec({ interactions: [], presets: [] } as never))
            .toThrow('interaction_spec: unknown key "presets".');
    });

    it('has no place for retained state', () => {
        // Updates are a host signal (applyUpdate, setUpdates, dispatch), not behaviour.
        expect('updates' in resolveInteractionSpec({ interactions: [] })).toBe(false);
    });
});

describe('context menu', () => {
    const items = [{ id: 'chat', label: 'Send to chat' }, { id: 'tag', label: 'Tag' }];
    const detail = (action: string, interactionId: string, extra: Record<string, unknown> = {}) => ({
        chartId: 'c', interactionId, timestamp: 0,
        event: { action, phase: 'commit', geometry: {}, target: { visual: { kind: 'mark', role: 'mark' }, elements: [{ value: { A: 1 } }] }, ...extra },
    }) as never;

    it('resolves from a spec as one preset that brings its own selection gesture', () => {
        const { interactions: [menu] } = resolveInteractionSpec({ interactions: [{ type: 'context-menu', options: { items } }] });
        expect(isContextMenu(menu)).toBe(true);
        expect(menu).toMatchObject({ id: 'context-menu', preset: 'context-menu', eventSource: { type: 'region', mode: 'stateful' } });
        const gesture = (value: string) => contextMenu({ items, gesture: value as never }).eventSource;
        expect(gesture('brush-x')).toMatchObject({ type: 'region', axis: 'x', mode: 'stateful' });
        expect(gesture('lasso')).toMatchObject({ regionGeometry: 'lasso' });
        expect(gesture('click')).toMatchObject({ type: 'element', gesture: 'click' });
        expect(gesture('right-click')).toMatchObject({ gesture: 'context' });
        expect(gesture('long-press')).toMatchObject({ gesture: 'long-press' });
        // Every mark gesture shows the mark it would act on before the reader commits.
        for (const value of ['click', 'right-click', 'long-press'] as const) {
            expect(contextMenu({ items, gesture: value }).affordances.mark?.hover, value).toBeTruthy();
        }
    });

    it('refuses a menu without items, an item without a label, and a repeated id', () => {
        expect(() => contextMenu({ items: [] })).toThrow('items must list at least one');
        expect(() => contextMenu({ items: [{ id: 'a' } as never] })).toThrow('string id and label');
        expect(() => contextMenu({ items: [items[0], items[0]] })).toThrow('appears twice');
    });

    it('opens on its own committed selection, closes when it clears, and ignores the rest', () => {
        expect(menuSelection(detail('select-region', 'menu'), 'menu')?.elements).toHaveLength(1);
        expect(menuSelection(detail('brush-x', 'menu'), 'menu')).toBeTruthy();
        expect(menuSelection(detail('click-element', 'menu'), 'menu')).toBeTruthy();
        expect(menuSelection(detail('context-element', 'menu'), 'menu')).toBeTruthy();
        expect(menuSelection(detail('select-region', 'menu', { operation: 'clear' }), 'menu')).toBeNull();
        expect(menuSelection(detail('select-region', 'menu', { target: { elements: [] } }), 'menu')).toBeNull();
        expect(menuSelection(detail('select-region', 'menu', { phase: 'preview' }), 'menu')).toBeUndefined();
        expect(menuSelection(detail('menu-select', 'menu'), 'menu')).toBeUndefined();
        expect(menuSelection(detail('select-region', 'select'), 'menu')).toBeUndefined();
    });
});
