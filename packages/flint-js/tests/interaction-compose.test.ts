import { describe, expect, it } from 'vitest';
import { composeInteractiveOptions } from '../src/interactive/spec/compose';
import { clickHighlight, navigate, select, type CanvasInteractionDef } from '../src/interactive/interactions';
import type { InteractionSpec } from '../src/core/interaction-spec';

const SPEC: InteractionSpec = {
    interactions: [{ type: 'legend-toggle' }, { type: 'navigate', options: { axes: 'x' } }],
    updates: [{ id: 'seed', ops: [{ op: 'set-style', targets: [], value: { state: 'normal' } }] }],
    dismiss: { escape: false },
    keyboardTargeting: true,
};
const ids = (composed: { interactions: readonly { id: string }[] }): string[] =>
    composed.interactions.map((interaction) => interaction.id);

describe('composeInteractiveOptions', () => {
    it('leaves a spec-less chart exactly as the code configured it', () => {
        const composed = composeInteractiveOptions({}, {
            backend: 'vegalite', interactions: [clickHighlight()], updates: [], dismiss: false,
        });
        expect(ids(composed)).toEqual(['click-highlight']);
        expect(composed.updates).toEqual([]);
        expect(composed.dismiss).toBe(false);
        expect(composed.keyboardTargeting).toBeUndefined();
        expect(composed.warnings).toEqual([]);
    });

    it('puts the spec before the code, for interactions and for updates', () => {
        const codeUpdate = { id: 'host', ops: [] };
        const composed = composeInteractiveOptions({ interaction_spec: SPEC }, {
            backend: 'vegalite', interactions: [select()], updates: [codeUpdate],
        });
        expect(ids(composed)).toEqual(['legend-toggle', 'navigate', 'select']);
        expect((composed.interactions[0] as CanvasInteractionDef).origin).toBe('spec');
        expect((composed.interactions[2] as CanvasInteractionDef).origin).toBeUndefined();
        expect(composed.updates.map((update) => update.id)).toEqual(['seed', 'host']);
    });

    it('rejects an id shared by the spec and the code, naming both sources', () => {
        expect(() => composeInteractiveOptions({ interaction_spec: SPEC }, {
            backend: 'vegalite', interactions: [navigate({ axes: 'y' })],
        })).toThrow('Interaction "navigate" is defined in interaction_spec and in options.interactions. Give one of them another id.');
    });

    it('still rejects a duplicate inside the code list', () => {
        expect(() => composeInteractiveOptions({}, {
            backend: 'vegalite', interactions: [select(), select()],
        })).toThrow(/Duplicate interaction id: "select"/);
    });

    it('lets the code win on the surface policies, false included', () => {
        const fromSpec = composeInteractiveOptions({ interaction_spec: SPEC }, { backend: 'vegalite' });
        expect(fromSpec.dismiss).toEqual({ escape: false });
        expect(fromSpec.keyboardTargeting).toBe(true);
        expect(fromSpec.assistedTargeting).toBeUndefined();
        const fromCode = composeInteractiveOptions({ interaction_spec: SPEC }, {
            backend: 'vegalite', dismiss: false, keyboardTargeting: false, assistedTargeting: { maxDistance: 4 },
        });
        expect(fromCode.dismiss).toBe(false);
        expect(fromCode.keyboardTargeting).toBe(false);
        expect(fromCode.assistedTargeting).toEqual({ maxDistance: 4 });
    });

    it('ignores the spec on a backend that runs no interactions, with one info warning', () => {
        const composed = composeInteractiveOptions({ interaction_spec: SPEC }, { backend: 'echarts' });
        expect(composed.interactions).toEqual([]);
        expect(composed.updates).toEqual([]);
        expect(composed.warnings).toEqual([{
            severity: 'info',
            code: 'interactions_ignored',
            message: 'interaction_spec is ignored: backend "echarts" does not run interactions.',
        }]);
    });

    it('keeps the code interactions on such a backend, so the mount fails as it does today', () => {
        const composed = composeInteractiveOptions({ interaction_spec: SPEC }, {
            backend: 'echarts', interactions: [clickHighlight()],
        });
        expect(ids(composed)).toEqual(['legend-toggle', 'navigate', 'click-highlight']);
        expect(composed.warnings).toEqual([]);
    });

    it('does not warn for a backend that runs no interactions when the spec asks for none', () => {
        const composed = composeInteractiveOptions({ interaction_spec: { interactions: [] } }, { backend: 'chartjs' });
        expect(composed.interactions).toEqual([]);
        expect(composed.warnings).toEqual([]);
    });
});
