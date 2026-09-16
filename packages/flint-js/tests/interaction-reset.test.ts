import { describe, expect, it } from 'vitest';
import { INTERACTION_RESET_GESTURES, normalizeResetGestures, SELECTION_RESET } from '../src/interactive/reset';
import { INTERACTION_PRESET_TYPES } from '../src/core/interaction-spec';
import { INTERACTION_PRESETS } from '../src/interactive/spec/registry';
import { resolveInteractionSpec } from '../src/interactive/spec/resolve';
import { clickHighlight, hoverGroupFocus, legendToggle, navigate } from '../src/interactive/interactions';
import type { InteractionEntry } from '../src/core/interaction-spec';

const REQUIRED: Partial<Record<string, Record<string, unknown>>> = {
    'hover-group-focus': { groupBy: 'Country' },
    'linked-brush': { groupBy: 'Country' },
};

describe('reset gestures', () => {
    it('normalises: default when absent, explicit list otherwise, duplicates dropped, unknown names refused', () => {
        expect(normalizeResetGestures(undefined, SELECTION_RESET)).toEqual(['click-none', 'escape']);
        expect(normalizeResetGestures(['escape'], SELECTION_RESET)).toEqual(['escape']);
        expect(normalizeResetGestures([], SELECTION_RESET)).toEqual([]);
        expect(normalizeResetGestures(['escape', 'escape'], SELECTION_RESET)).toEqual(['escape']);
        expect(() => normalizeResetGestures(['click-any' as never], SELECTION_RESET))
            .toThrow('Unknown reset gesture "click-any". Gestures: click-none, double-click, escape.');
    });

    it('every factory default equals the registry default, and lies inside the supported set', () => {
        for (const type of INTERACTION_PRESET_TYPES) {
            const definition = INTERACTION_PRESETS[type];
            const created = (definition.create as (options: Record<string, unknown>) => { reset?: readonly string[] })(REQUIRED[type] ?? {});
            expect(created.reset ?? [], type).toEqual([...definition.defaultReset]);
            for (const gesture of definition.defaultReset) {
                expect(definition.supportedReset, `${type} default ${gesture}`).toContain(gesture);
            }
            for (const gesture of definition.supportedReset) expect(INTERACTION_RESET_GESTURES).toContain(gesture);
        }
    });

    it('presets that retain nothing carry no reset at all', () => {
        expect(hoverGroupFocus({ groupBy: 'Country' }).reset).toBeUndefined();
        expect(INTERACTION_PRESETS['hover-group-focus'].supportedReset).toEqual([]);
        expect(INTERACTION_PRESETS.inspect.supportedReset).toEqual([]);
        expect(INTERACTION_PRESETS['context-activate'].supportedReset).toEqual([]);
    });

    it('selection presets default to click-none and escape; settings default to nothing', () => {
        expect(clickHighlight().reset).toEqual(['click-none', 'escape']);
        expect(clickHighlight({ reset: ['escape'] }).reset).toEqual(['escape']);
        expect(legendToggle().reset).toEqual([]);
        expect(legendToggle({ reset: ['click-none'] }).reset).toEqual(['click-none']);
    });

    it('navigate mirrors its trigger list onto the definition, with click-none as the new name', () => {
        expect(navigate().reset).toEqual(['double-click']);
        expect(navigate({ reset: ['click-none'] }).reset).toEqual(['click-none']);
        expect(navigate({ reset: ['click-none'] }).eventSource.reset).toEqual(['click-none']);
    });
});

describe('reset in a spec', () => {
    it('accepts a supported list and puts it on the definition', () => {
        const { interactions } = resolveInteractionSpec({
            interactions: [{ type: 'click-highlight', options: { reset: ['escape'] } }],
        });
        expect(interactions[0].reset).toEqual(['escape']);
    });

    it('rejects a reset on a preset that retains nothing', () => {
        expect(() => resolveInteractionSpec({
            interactions: [{ type: 'hover-group-focus', options: { groupBy: 'Country', reset: ['escape'] } }],
        })).toThrow(/interaction_spec\.interactions\[0\] \(hover-group-focus\): hover-group-focus retains no state, so it has no reset/);
    });

    it('rejects an unknown gesture and a non-list, naming the entry', () => {
        expect(() => resolveInteractionSpec({ interactions: [{ type: 'brush-x', options: { reset: ['click-any'] } }] }))
            .toThrow(/\(brush-x\): reset gesture "click-any" is unknown\. Gestures: click-none, double-click, escape/);
        expect(() => resolveInteractionSpec({ interactions: [{ type: 'brush-x', options: { reset: 'escape' } }] }))
            .toThrow(/\(brush-x\): "reset" must be a list of gestures/);
    });
});

describe('the dispatcher picks interactions by their own list', () => {
    it('returns the interactions whose list holds the gesture, in order', async () => {
        const { interactionsToReset } = await import('../src/interactive/reset');
        const list = [clickHighlight(), legendToggle(), navigate({ reset: ['click-none', 'double-click'] }), hoverGroupFocus({ groupBy: 'c' })];
        expect(interactionsToReset(list, 'click-none').map((i) => i.id)).toEqual(['click-highlight', 'navigate']);
        expect(interactionsToReset(list, 'escape').map((i) => i.id)).toEqual(['click-highlight']);
        expect(interactionsToReset(list, 'double-click').map((i) => i.id)).toEqual(['navigate']);
    });

    it('legend-toggle can drop its closure state', () => {
        expect(typeof legendToggle().onReset).toBe('function');
        expect(() => legendToggle().onReset!()).not.toThrow();
    });
});

describe('admission: a double-click cannot both activate and reset', () => {
    const PLAN = { capabilities: ['elements', 'cartesian-region', 'navigation'] as const, navigationAxes: ['x'] as const };
    const fromSpec = (entries: readonly InteractionEntry[]) => resolveInteractionSpec({ interactions: entries }).interactions;

    it('drops the later spec entry with a warning', async () => {
        const { admitInteractions } = await import('../src/interactive/spec/admission');
        const later = admitInteractions(PLAN, fromSpec([{ type: 'navigate' }, { type: 'double-activate' }]));
        expect(later.admitted.map((i) => i.id)).toEqual(['navigate']);
        expect(later.warnings[0]).toMatchObject({ code: 'conflicting_interactions' });
        expect(later.warnings[0].message).toContain('"double-activate" conflicts with "navigate"');
        const reversed = admitInteractions(PLAN, fromSpec([{ type: 'double-activate' }, { type: 'navigate' }]));
        expect(reversed.admitted.map((i) => i.id)).toEqual(['double-activate']);
    });

    it('keeps both when both come from code, and admits a navigate that resets on escape only', async () => {
        const { admitInteractions } = await import('../src/interactive/spec/admission');
        const { doubleActivate } = await import('../src/interactive/interactions');
        const code = admitInteractions(PLAN, [navigate(), doubleActivate()]);
        expect(code.admitted.map((i) => i.id)).toEqual(['navigate', 'double-activate']);
        expect(code.warnings).toEqual([]);
        const noClash = admitInteractions(PLAN, fromSpec([{ type: 'navigate', options: { reset: ['escape'] } }, { type: 'double-activate' }]));
        expect(noClash.admitted.map((i) => i.id)).toEqual(['navigate', 'double-activate']);
    });
});
