import { describe, expect, it } from 'vitest';
import { composeInteractiveOptions } from '../src/interactive/spec/compose';
import { clickHighlight, navigate, select, type CanvasInteractionDef } from '../src/interactive/interactions';
import type { InteractionSpec } from '../src/core/interaction-spec';

const SPEC: InteractionSpec = {
    interactions: [{ type: 'legend-toggle' }, { type: 'navigate', options: { axes: 'x' } }],
    keyboardTargeting: true,
};
const ids = (composed: { interactions: readonly { id: string }[] }): string[] =>
    composed.interactions.map((interaction) => interaction.id);

describe('composeInteractiveOptions', () => {
    it('leaves a spec-less chart exactly as the code configured it', () => {
        const composed = composeInteractiveOptions({}, {
            backend: 'vegalite', interactions: [clickHighlight()], updates: [],
        });
        expect(ids(composed)).toEqual(['click-highlight']);
        expect(composed.updates).toEqual([]);
        expect(composed.keyboardTargeting).toBeUndefined();
        expect(composed.warnings).toEqual([]);
    });

    it('puts the spec interactions before the code, and takes updates from the code only', () => {
        const codeUpdate = { id: 'host', ops: [] };
        const composed = composeInteractiveOptions({ interaction_spec: SPEC }, {
            backend: 'vegalite', interactions: [select()], updates: [codeUpdate],
        });
        expect(ids(composed)).toEqual(['legend-toggle', 'navigate', 'select']);
        expect((composed.interactions[0] as CanvasInteractionDef).origin).toBe('spec');
        expect((composed.interactions[2] as CanvasInteractionDef).origin).toBeUndefined();
        expect(composed.updates).toEqual([codeUpdate]);
    });

    it('replaces a spec entry with the code definition that shares its id, with an info warning', () => {
        const replacement = navigate({ axes: 'y' });
        const composed = composeInteractiveOptions({ interaction_spec: SPEC }, {
            backend: 'vegalite', interactions: [replacement],
        });
        expect(ids(composed)).toEqual(['legend-toggle', 'navigate']);
        expect(composed.interactions[1]).toBe(replacement);
        expect(composed.warnings).toEqual([{
            severity: 'info',
            code: 'interaction_overridden',
            message: 'Interaction "navigate" from interaction_spec is replaced by the definition passed in code.',
        }]);
    });

    it('still rejects a duplicate inside the code list', () => {
        expect(() => composeInteractiveOptions({}, {
            backend: 'vegalite', interactions: [select(), select()],
        })).toThrow(/Duplicate interaction id: "select"/);
    });

    it('lets the code win on the targeting policies', () => {
        const fromSpec = composeInteractiveOptions({ interaction_spec: SPEC }, { backend: 'vegalite' });
        expect(fromSpec.keyboardTargeting).toBe(true);
        expect(fromSpec.assistedTargeting).toBeUndefined();
        const fromCode = composeInteractiveOptions({ interaction_spec: SPEC }, {
            backend: 'vegalite', keyboardTargeting: false, assistedTargeting: { maxDistance: 4 },
        });
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
            message: 'Interactions are ignored: backend "echarts" does not run interactions, so the chart renders static.',
        }]);
    });

    it('drops the code interactions on such a backend too, with a warning, so the chart renders static', () => {
        const composed = composeInteractiveOptions({ interaction_spec: SPEC }, {
            backend: 'echarts', interactions: [clickHighlight()],
        });
        expect(composed.interactions).toEqual([]);
        expect(composed.warnings).toEqual([{
            severity: 'warning',
            code: 'interactions_ignored',
            message: 'Interactions are ignored: backend "echarts" does not run interactions, so the chart renders static.',
        }]);
    });

    it('does not warn for a backend that runs no interactions when the spec asks for none', () => {
        const composed = composeInteractiveOptions({ interaction_spec: { interactions: [] } }, { backend: 'chartjs' });
        expect(composed.interactions).toEqual([]);
        expect(composed.warnings).toEqual([]);
    });
});
