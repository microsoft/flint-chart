import { describe, expect, it } from 'vitest';
import { admitInteractions } from '../src/interactive/spec/admission';
import { resolveInteractionSpec } from '../src/interactive/spec/resolve';
import { brushAngle, brushX, clickHighlight, navigate, select } from '../src/interactive/interactions';
import type { CanvasInteractionDef } from '../src/interactive/interactions';
import type { InteractionEntry } from '../src/core/interaction-spec';
import { addVegaLiteInteractions } from '../src/vegalite/interactions/compile';
import { assembleVegaLite } from '../src/vegalite/assemble';

/** A Cartesian chart with elements, a region, a legend, and one navigable axis. */
const CARTESIAN = {
    capabilities: ['elements', 'cartesian-region', 'navigation', 'legend'] as const,
    navigationAxes: ['x'] as const,
};
/** The same chart with nothing to navigate. */
const NO_NAVIGATION = {
    capabilities: ['elements', 'cartesian-region', 'legend'] as const,
    navigationAxes: [] as const,
};
const NO_SEMANTICS = { capabilities: [] as const };

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
            .toThrow('Interaction "brush-angle" requires a polar chart with an angular region; this chart has none.');
        expect(() => admitInteractions(NO_SEMANTICS, [clickHighlight()]))
            .toThrow('Interaction "click-highlight" requires marks that resolve to data; this chart has none.');
        expect(() => admitInteractions(NO_NAVIGATION, [navigate()]))
            .toThrow('Interaction "navigate" requires a navigable continuous axis; this chart has none.');
        expect(() => admitInteractions(CARTESIAN, [navigate({ axes: 'y' })]))
            .toThrow('Interaction "navigate" requested unsupported navigation axis: y.');
    });

    it('drops a spec entry the chart cannot honour and says so in a warning', () => {
        const result = admitInteractions(CARTESIAN, fromSpec([{ type: 'brush-angle' }, { type: 'click-highlight' }]));
        expect(ids(result.admitted)).toEqual(['click-highlight']);
        expect(result.warnings).toEqual([{
            severity: 'warning',
            code: 'unsupported_interaction',
            message: 'Interaction "brush-angle" requires a polar chart with an angular region; this chart has none. The interaction was dropped.',
        }]);
    });

    it('drops a spec navigate the chart cannot navigate', () => {
        const none = admitInteractions(NO_NAVIGATION, fromSpec([{ type: 'navigate' }]));
        expect(none.admitted).toEqual([]);
        expect(none.warnings[0].message).toContain('requires a navigable continuous axis');
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
            .toThrow('requires a polar chart with an angular region; Bar Chart has none');
        expect(() => addVegaLiteInteractions(assembled(), [navigate(), select()]))
            .toThrow('Pan navigation cannot share');
    });
});

describe('admission against the chart type declaration', () => {
    const rows = [
        { region: 'North', category: 'A', value: 1, when: '2024-01-01' },
        { region: 'South', category: 'B', value: 2, when: '2024-02-01' },
    ];
    const semanticsOf = (chartType: string, encodings: Record<string, string>): any =>
        (assembleVegaLite({
            data: { values: rows },
            semantic_types: { value: 'Quantity', when: 'Date' },
            chart_spec: { chartType, encodings },
        }) as any)._interactionSemantics;
    const every = fromSpec([
        { type: 'click-highlight' }, { type: 'select' }, { type: 'brush-x' }, { type: 'brush-angle' },
        { type: 'legend-toggle' }, { type: 'drag-reorder' }, { type: 'axis-highlight' },
        { type: 'inspect-index' }, { type: 'navigate', options: { pan: false } },
    ]);

    it('writes the confirmed capabilities and the chart type into the compiled semantics', () => {
        const bar = semanticsOf('Bar Chart', { x: 'category', y: 'value', color: 'region' });
        expect(bar.chartType).toBe('Bar Chart');
        expect(bar.capabilities).toEqual(['elements', 'cartesian-region', 'navigation', 'reorder', 'legend', 'discrete-axis']);
        const pie = semanticsOf('Pie Chart', { theta: 'value', color: 'category' });
        expect(pie.capabilities).toEqual(['elements', 'cartesian-region', 'angular-region', 'legend']);
        const kpi = semanticsOf('KPI Card', { metric: 'category', value: 'value' });
        expect(kpi.capabilities).toEqual(['elements']);
    });

    it('a KPI card keeps the element presets and drops the rest, naming the chart type', () => {
        const result = admitInteractions(semanticsOf('KPI Card', { metric: 'category', value: 'value' }), every);
        expect(ids(result.admitted)).toEqual(['click-highlight']);
        expect(result.warnings.map((warning) => warning.message)).toEqual([
            'Interaction "select" requires a plot to drag a region on; KPI Card has none. The interaction was dropped.',
            'Interaction "brush-x" requires a plot to drag a region on; KPI Card has none. The interaction was dropped.',
            'Interaction "brush-angle" requires a polar chart with an angular region; KPI Card has none. The interaction was dropped.',
            'Interaction "legend-toggle" requires a discrete legend; KPI Card has none. The interaction was dropped.',
            'Interaction "drag-reorder" requires a discrete axis whose order can change; KPI Card has none. The interaction was dropped.',
            'Interaction "axis-highlight" requires a discrete axis with category labels; KPI Card has none. The interaction was dropped.',
            'Interaction "inspect-index" requires an index axis shared by the series; KPI Card has none. The interaction was dropped.',
            'Interaction "navigate" requires a navigable continuous axis; KPI Card has none. The interaction was dropped.',
        ]);
    });

    it('a pie keeps the brushes as angular gestures and the legend, and drops the axis presets', () => {
        const result = admitInteractions(semanticsOf('Pie Chart', { theta: 'value', color: 'category' }), every);
        expect(ids(result.admitted)).toEqual(['click-highlight', 'select', 'brush-x', 'brush-angle', 'legend-toggle']);
        expect(result.warnings.map((warning) => warning.code)).toEqual(Array(4).fill('unsupported_interaction'));
    });

    it('a legend is confirmed by the data: a bar chart without a colour field drops legend-toggle', () => {
        const plain = admitInteractions(semanticsOf('Bar Chart', { x: 'category', y: 'value' }), fromSpec([{ type: 'legend-toggle' }]));
        expect(plain.admitted).toEqual([]);
        expect(plain.warnings[0].message).toBe('Interaction "legend-toggle" requires a discrete legend; Bar Chart has none. The interaction was dropped.');
        const coloured = admitInteractions(semanticsOf('Bar Chart', { x: 'category', y: 'value', color: 'region' }), fromSpec([{ type: 'legend-toggle' }]));
        expect(ids(coloured.admitted)).toEqual(['legend-toggle']);
    });

    it('a continuous colour legend is not a discrete legend', () => {
        const heatmap = semanticsOf('Heatmap', { x: 'category', y: 'region', color: 'value' });
        expect(heatmap.capabilities).not.toContain('legend');
        const result = admitInteractions(heatmap, fromSpec([{ type: 'legend-toggle' }, { type: 'drag-reorder' }]));
        expect(ids(result.admitted)).toEqual(['drag-reorder']);
    });

    it('a code definition made by a preset throws the same way', () => {
        const kpi = semanticsOf('KPI Card', { metric: 'category', value: 'value' });
        expect(() => admitInteractions(kpi, [brushX()]))
            .toThrow('Interaction "brush-x" requires a plot to drag a region on; KPI Card has none.');
    });

    it('a definition made by hand needs nothing', () => {
        const kpi = semanticsOf('KPI Card', { metric: 'category', value: 'value' });
        const bare: CanvasInteractionDef = { ...clickHighlight({ id: 'bare' }), preset: undefined };
        expect(ids(admitInteractions(kpi, [bare]).admitted)).toEqual(['bare']);
    });
});
