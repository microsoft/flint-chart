import { describe, expect, it } from 'vitest';
import { admitInteractions } from '../src/interactive/spec/admission';
import { resolveInteractionSpec } from '../src/interactive/spec/resolve';
import { brushAngle, brushX, clickHighlight, navigate, select } from '../src/interactive/interactions';
import type { CanvasInteractionDef } from '../src/interactive/interactions';
import type { InteractionEntry } from '../src/core/interaction-spec';
import { addVegaLiteInteractions } from '../src/vegalite/interactions/compile';
import { assembleVegaLite } from '../src/vegalite/assemble';

/** A Cartesian chart with element semantics and one navigable axis. */
const CARTESIAN = {
    fields: ['category'],
    selectableMarks: ['bar'],
    resolve: () => null,
    navigationAxes: ['x'] as const,
    supportedRegionGestures: ['cartesian'] as const,
};
const NO_SEMANTICS = { fields: [], selectableMarks: [] };

const fromSpec = (entries: readonly InteractionEntry[]): readonly CanvasInteractionDef[] =>
    resolveInteractionSpec({ interactions: entries }).interactions;
const ids = (interactions: readonly CanvasInteractionDef[]): string[] => interactions.map((interaction) => interaction.id);

describe('admitInteractions', () => {
    it('admits everything the chart can honour, in order, with no warnings', () => {
        const result = admitInteractions(CARTESIAN, [clickHighlight(), brushX(), ...fromSpec([{ type: 'legend-toggle' }])]);
        expect(ids(result.admitted)).toEqual(['click-highlight', 'brush-x', 'legend-toggle']);
        expect(result.warnings).toEqual([]);
    });

    it('throws for a code definition the chart cannot honour, with the message the compile step used', () => {
        expect(() => admitInteractions(CARTESIAN, [brushAngle()]))
            .toThrow('Interaction "brush-angle" requires a polar chart with angular-region support.');
        expect(() => admitInteractions(NO_SEMANTICS, [clickHighlight()]))
            .toThrow('Interaction "click-highlight" requires chart element semantics.');
        expect(() => admitInteractions({ ...CARTESIAN, navigationAxes: [] }, [navigate()]))
            .toThrow('Interaction "navigate" requires a chart with a navigable continuous axis.');
        expect(() => admitInteractions(CARTESIAN, [navigate({ axes: 'y' })]))
            .toThrow('Interaction "navigate" requested unsupported navigation axis: y.');
    });

    it('drops a spec entry the chart cannot honour and says so in a warning', () => {
        const result = admitInteractions(CARTESIAN, fromSpec([{ type: 'brush-angle' }, { type: 'click-highlight' }]));
        expect(ids(result.admitted)).toEqual(['click-highlight']);
        expect(result.warnings).toEqual([{
            severity: 'warning',
            code: 'unsupported_interaction',
            message: 'Interaction "brush-angle" requires a polar chart with angular-region support. The interaction was dropped.',
        }]);
    });

    it('drops a spec navigate the chart cannot navigate', () => {
        const none = admitInteractions({ ...CARTESIAN, navigationAxes: [] }, fromSpec([{ type: 'navigate' }]));
        expect(none.admitted).toEqual([]);
        expect(none.warnings[0].message).toContain('requires a chart with a navigable continuous axis');
        const wrongAxis = admitInteractions(CARTESIAN, fromSpec([{ type: 'navigate', options: { axes: 'y' } }]));
        expect(wrongAxis.admitted).toEqual([]);
        expect(wrongAxis.warnings[0].message).toContain('requested unsupported navigation axis: y');
        const available = admitInteractions(CARTESIAN, fromSpec([{ type: 'navigate' }]));
        expect(ids(available.admitted)).toEqual(['navigate']);
    });

    it('drops a spec entry on a chart with no element semantics', () => {
        const result = admitInteractions(NO_SEMANTICS, fromSpec([{ type: 'click-highlight' }]));
        expect(result.admitted).toEqual([]);
        expect(result.warnings[0]).toMatchObject({ code: 'unsupported_interaction' });
    });

    it('keeps one navigation interaction: a second spec navigate yields, code keeps today\'s behaviour', () => {
        const spec = admitInteractions(CARTESIAN, fromSpec([{ type: 'navigate' }, { type: 'navigate', id: 'again' }]));
        expect(ids(spec.admitted)).toEqual(['navigate']);
        expect(spec.warnings[0]).toMatchObject({ code: 'conflicting_interactions' });
        expect(spec.warnings[0].message).toContain('"again" is a second navigation interaction; the chart keeps "navigate"');
        const code = admitInteractions(CARTESIAN, [navigate(), navigate({ id: 'again' })]);
        expect(ids(code.admitted)).toEqual(['navigate', 'again']);
        expect(code.warnings).toEqual([]);
    });

    describe('pan versus drag', () => {
        it('throws when both definitions come from code, as today', () => {
            expect(() => admitInteractions(CARTESIAN, [navigate(), select()]))
                .toThrow('Pan navigation cannot share an unmodified drag gesture with a region interaction.');
        });

        it('drops the later spec entry', () => {
            const dragLater = admitInteractions(CARTESIAN, fromSpec([{ type: 'navigate' }, { type: 'select' }]));
            expect(ids(dragLater.admitted)).toEqual(['navigate']);
            expect(dragLater.warnings[0]).toMatchObject({ code: 'conflicting_interactions' });
            expect(dragLater.warnings[0].message).toContain('"select" conflicts with "navigate"');
            const navigateLater = admitInteractions(CARTESIAN, fromSpec([{ type: 'select' }, { type: 'navigate' }]));
            expect(ids(navigateLater.admitted)).toEqual(['select']);
            expect(navigateLater.warnings[0].message).toContain('"navigate" conflicts with "select"');
        });

        it('drops the spec entry when the other side is code, whatever the order', () => {
            const codeNavigate = admitInteractions(CARTESIAN, [navigate(), ...fromSpec([{ type: 'select' }])]);
            expect(ids(codeNavigate.admitted)).toEqual(['navigate']);
            const codeSelectLater = admitInteractions(CARTESIAN, [...fromSpec([{ type: 'navigate' }]), select()]);
            expect(ids(codeSelectLater.admitted)).toEqual(['select']);
        });

        it('admits both when pan is off', () => {
            const result = admitInteractions(CARTESIAN, fromSpec([{ type: 'navigate', options: { pan: false } }, { type: 'select' }]));
            expect(ids(result.admitted)).toEqual(['navigate', 'select']);
            expect(result.warnings).toEqual([]);
        });
    });
});

describe('addVegaLiteInteractions with spec interactions', () => {
    const assembled = (): any => assembleVegaLite({
        data: { values: [{ category: 'A', value: 1 }, { category: 'B', value: 2 }] },
        semantic_types: { value: 'Quantity' },
        chart_spec: { chartType: 'Bar Chart', encodings: { x: 'category', y: 'value' } },
    });

    it('drops an unsupported spec entry, reports it, and carries the admitted list on the plan', () => {
        const plan = addVegaLiteInteractions(assembled(), fromSpec([{ type: 'brush-angle' }, { type: 'click-highlight' }]));
        expect(plan).not.toBeNull();
        expect(ids(plan!.interactions ?? [])).toEqual(['click-highlight']);
        expect(plan!.warnings).toHaveLength(1);
        expect(plan!.warnings![0]).toMatchObject({ severity: 'warning', code: 'unsupported_interaction' });
        expect(plan!.warnings![0].message).toContain('"brush-angle"');
    });

    it('drops a spec navigate on an axis a bar chart cannot navigate, and keeps one it can', () => {
        const x = addVegaLiteInteractions(assembled(), fromSpec([{ type: 'navigate', options: { axes: 'x' } }]));
        expect(x!.interactions).toEqual([]);
        expect(x!.warnings![0].message).toContain('unsupported navigation axis: x');
        expect(x!.navigationChannels).toEqual([]);
        const y = addVegaLiteInteractions(assembled(), fromSpec([{ type: 'navigate', options: { axes: 'y' } }]));
        expect(ids(y!.interactions ?? [])).toEqual(['navigate']);
        expect(y!.navigationChannels).toEqual(['y']);
        expect(y!.warnings).toEqual([]);
    });

    it('still throws for the same request made in code', () => {
        expect(() => addVegaLiteInteractions(assembled(), [brushAngle()]))
            .toThrow('requires a polar chart with angular-region support');
        expect(() => addVegaLiteInteractions(assembled(), [navigate(), select()]))
            .toThrow('Pan navigation cannot share');
    });
});
