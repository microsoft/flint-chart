import { describe, expect, it } from 'vitest';
import { brushAngle, brushX, brushY, clickAnnotate, clickGroupHighlight, clickHighlight, navigate, normalizeInteractions, select } from '../src/interactive/interactions';
import {
    AngularBrushInteraction,
    BrushInteraction,
    ClickAnnotateInteraction,
    ClickGroupHighlightInteraction,
    ClickHighlightInteraction,
    NavigateInteraction,
    SelectInteraction,
} from '../src/interactive/presets';
import { presentInteractionUpdate } from '../src/interactive/chart-update';
import {
    axisBrushTrigger,
    angularBrushTrigger,
    clickTrigger,
    externalTrigger,
    hoverTrigger,
    navigationTrigger,
    rectangleTrigger,
    xBrushTrigger,
    yBrushTrigger,
} from '../src/interactive/triggers';
import { AngularRegionSession } from '../src/interactive/gestures/angular-region';
import {
    cartesianDragDistance,
    constrainCartesianRegion,
    intervalPoints,
    updateInterval,
} from '../src/interactive/gestures/cartesian-region';
import { PanSession, wheelZoomFactor } from '../src/interactive/gestures/navigation';
import { guardNavigationDomain } from '../src/vegalite/interactions/navigation-scale';
import {
    geometryIntersectsRect,
    INTERACTION_KEY,
    normalizeVegaRegionEvent,
} from '../src/vegalite/interactions/hit-adapter';
import type {
    InteractionContext,
    InteractionDef,
    InteractionModifiers,
    InteractionPhase,
    SemanticTarget,
} from '../src/interactive/interactions';

function semanticUpdate(
    interaction: InteractionDef,
    target: SemanticTarget | null,
    context: InteractionContext,
    options: {
        source?: 'element' | 'region';
        phase?: InteractionPhase;
        modifiers?: InteractionModifiers;
    } = {},
) {
    return interaction.update({
        type: 'semantic',
        source: options.source ?? 'element',
        phase: options.phase ?? 'commit',
        target,
        modifiers: options.modifiers,
    }, context);
}

describe('physical region gestures', () => {
    it('projects Cartesian regions and measures only the configured axis', () => {
        const start = { x: 20, y: 30 };
        const end = { x: 80, y: 90 };
        const plotSize = { width: 300, height: 180 };

        expect(constrainCartesianRegion(start, end, 'x', plotSize)).toEqual({
            start: { x: 20, y: 0 }, end: { x: 80, y: 180 },
        });
        expect(constrainCartesianRegion(start, end, 'y', plotSize)).toEqual({
            start: { x: 0, y: 30 }, end: { x: 300, y: 90 },
        });
        expect(cartesianDragDistance(start, end, 'x')).toBe(60);
        expect(cartesianDragDistance(start, end, 'y')).toBe(60);
        expect(cartesianDragDistance(start, end, 'xy')).toBeCloseTo(Math.hypot(60, 60));
    });

    it('creates, moves, and resizes stateful Cartesian intervals', () => {
        expect(updateInterval({ x: 30, y: 0 }, { x: 70, y: 0 }, 'x', 100, 'create')).toEqual({
            leading: 30, trailing: 70,
        });
        expect(updateInterval(
            { x: 95, y: 0 }, { x: 50, y: 0 }, 'x', 100, 'move', { leading: 30, trailing: 70 },
        )).toEqual({ leading: 60, trailing: 100 });
        expect(updateInterval(
            { x: 90, y: 0 }, { x: 0, y: 0 }, 'x', 100, 'resize-leading', { leading: 30, trailing: 70 },
        )).toEqual({ leading: 70, trailing: 90 });
        expect(intervalPoints({ leading: 20, trailing: 60 }, 'y')).toEqual({
            start: { x: 0, y: 20 }, end: { x: 0, y: 60 },
        });
    });

    it('accumulates angular movement continuously across the zero-angle seam', () => {
        const frame = { center: { x: 0, y: 0 }, innerRadius: 10, outerRadius: 100 };
        const pointAt = (angle: number) => ({ x: 100 * Math.sin(angle), y: -100 * Math.cos(angle) });
        const session = new AngularRegionSession(pointAt(Math.PI * 1.9), frame);

        session.move(pointAt(Math.PI * 0.1));

        expect(session.sector().endAngle - session.sector().startAngle).toBeCloseTo(Math.PI * 0.2);
        expect(session.dragDistance()).toBeCloseTo(Math.PI * 20);
    });
});

describe('viewport navigation', () => {
    it('normalizes pan movement and wheel deltas without renderer state', () => {
        const pan = new PanSession({ x: 20, y: 30 }, { width: 200, height: 100 });
        expect(pan.move({ x: 40, y: 20 })).toEqual({ x: 0.1, y: -0.1 });
        expect(pan.move({ x: 50, y: 40 })).toEqual({ x: 0.05, y: 0.2 });
        expect(pan.dragDistance()).toBeCloseTo(Math.hypot(20, -10) + Math.hypot(10, 20));
        expect(wheelZoomFactor(-100, 0, 400, 0.002)).toBeCloseTo(Math.exp(0.2));
        expect(wheelZoomFactor(1, 1, 400, 0.002)).toBeCloseTo(Math.exp(-0.032));
    });

    it('declares navigation input separately from its viewport update policy', () => {
        const interaction = navigate({ axes: 'xy' });
        expect(interaction).toBeInstanceOf(NavigateInteraction);
        expect(interaction.eventSource).toEqual(navigationTrigger({ axes: 'xy' }));
        expect(interaction.update({
            type: 'navigation', phase: 'commit', operation: 'zoom', axes: 'xy',
            factor: 1.5, anchor: { x: 0.25, y: 0.75 },
        }, { chartType: 'Scatter Plot', selected: [] })).toEqual({
            phase: 'commit',
            ops: [{
                op: 'navigate-viewport', phase: 'commit', operation: 'zoom', axes: 'xy',
                factor: 1.5, anchor: { x: 0.25, y: 0.75 },
                domainGuard: {
                    minVisibleFraction: 0.02,
                    maxVisibleFraction: 1,
                    overscrollFraction: 0,
                },
            }],
        });
        expect(() => navigate({
            domainGuard: { minVisibleFraction: 0.5, maxVisibleFraction: 0.25 },
        })).toThrow(/maxVisibleFraction/);
    });

    it('guards linear, temporal, and logarithmic domains against the initial extent', () => {
        const guard = { minVisibleFraction: 0.1, maxVisibleFraction: 1, overscrollFraction: 0 };
        expect(guardNavigationDomain([45, 46], [0, 100], 'linear', guard)).toEqual([40.5, 50.5]);
        expect(guardNavigationDomain([-20, 80], [0, 100], 'linear', guard)).toEqual([0, 100]);
        const temporal = guardNavigationDomain(
            [new Date('2020-05-01'), new Date('2020-05-02')],
            [new Date('2020-01-01'), new Date('2021-01-01')],
            'time',
            guard,
        );
        expect(temporal[0]).toBeInstanceOf(Date);
        expect((temporal[1] as Date).getTime() - (temporal[0] as Date).getTime())
            .toBeCloseTo((Date.UTC(2021, 0, 1) - Date.UTC(2020, 0, 1)) * 0.1, -2);
        const logarithmic = guardNavigationDomain([10, 11], [1, 1000], 'log', guard).map(Number);
        expect(logarithmic[1] / logarithmic[0]).toBeCloseTo(Math.pow(1000, 0.1));
        expect(guardNavigationDomain([-100, 200], [0, 100], 'linear', {
            minVisibleFraction: 0.1, maxVisibleFraction: 1.5, overscrollFraction: 0,
        })).toEqual([-25, 125]);
        expect(guardNavigationDomain([-50, 50], [0, 100], 'linear', {
            minVisibleFraction: 0.1, maxVisibleFraction: 1, overscrollFraction: 0.2,
        })).toEqual([-20, 80]);
    });
});

describe('interaction definitions', () => {
    it('declares normalized event sources for built-in presets', () => {
        expect(clickHighlight().eventSource).toBe(clickTrigger);
        expect(clickGroupHighlight().eventSource).toBe(clickTrigger);
        expect(clickAnnotate().eventSource).toBe(clickTrigger);
        expect(select().eventSource).toEqual(rectangleTrigger('intersect'));
        expect(brushX().eventSource).toEqual(xBrushTrigger('intersect', 'ephemeral'));
        expect(brushY().eventSource).toEqual(yBrushTrigger('intersect', 'ephemeral'));
        expect(brushAngle().eventSource).toEqual(angularBrushTrigger('intersect'));
        expect(navigate().eventSource).toEqual(navigationTrigger());
    });

    it('provides reusable trigger descriptors', () => {
        expect(clickTrigger).toEqual({ type: 'element', gesture: 'click' });
        expect(hoverTrigger).toEqual({ type: 'element', gesture: 'hover' });
        expect(rectangleTrigger('contain')).toEqual({ type: 'region', gesture: 'drag', match: 'contain' });
        expect(axisBrushTrigger('x', 'contain')).toEqual({
            type: 'region', gesture: 'drag', axis: 'x', match: 'contain', mode: 'ephemeral',
        });
        expect(xBrushTrigger()).toEqual({
            type: 'region', gesture: 'drag', axis: 'x', match: 'intersect', mode: 'ephemeral',
        });
        expect(yBrushTrigger('intersect', 'stateful')).toEqual({
            type: 'region', gesture: 'drag', axis: 'y', match: 'intersect', mode: 'stateful',
        });
        expect(angularBrushTrigger('contain')).toEqual({
            type: 'region', gesture: 'drag', regionGeometry: 'angular', match: 'contain', mode: 'ephemeral',
        });
        expect(externalTrigger('story-scroll')).toEqual({ type: 'external', source: 'story-scroll' });
    });

    it('processes resolved semantic events through normalized update policies', () => {
        const context = { chartType: 'Bar Chart', selected: [] };
        const target = {
            visual: { kind: 'mark' as const, role: 'bar' },
            elements: [{ key: { category: 'A' }, records: [{ category: 'A', value: 4 }] }],
        };

        expect(clickHighlight().update?.({
            type: 'semantic', source: 'element', phase: 'commit', target,
        }, context)).toEqual({
            ops: [{ op: 'emphasize', elements: target.elements, mode: 'replace', dimOpacity: 0.25 }],
        });
        expect(select().update?.({
            type: 'semantic', source: 'region', phase: 'preview', target,
        }, context)).toEqual({
            ops: [{ op: 'emphasize', elements: target.elements, mode: 'replace', dimOpacity: 0.25 }],
        });
    });

    it('creates preset definitions with stable defaults', () => {
        expect(clickHighlight()).toBeInstanceOf(ClickHighlightInteraction);
        expect(clickHighlight()).toMatchObject({ id: 'click-highlight', eventSource: clickTrigger });
        expect(clickGroupHighlight()).toBeInstanceOf(ClickGroupHighlightInteraction);
        expect(clickGroupHighlight()).toMatchObject({ id: 'click-group-highlight', eventSource: clickTrigger });
        expect(clickAnnotate()).toBeInstanceOf(ClickAnnotateInteraction);
        expect(clickAnnotate()).toMatchObject({ id: 'click-annotate', eventSource: clickTrigger });
        expect(select()).toBeInstanceOf(SelectInteraction);
        expect(select()).toMatchObject({
            id: 'select',
            eventSource: rectangleTrigger('intersect'),
        });
        expect(brushX()).toBeInstanceOf(BrushInteraction);
        expect(brushX()).toMatchObject({ id: 'brush-x', axis: 'x', eventSource: xBrushTrigger() });
        expect(brushY()).toMatchObject({ id: 'brush-y', axis: 'y', eventSource: yBrushTrigger() });
        expect(brushX({ mode: 'stateful' }).eventSource).toEqual(xBrushTrigger('intersect', 'stateful'));
        expect(brushAngle()).toBeInstanceOf(AngularBrushInteraction);
        expect(brushAngle()).toMatchObject({ id: 'brush-angle', eventSource: angularBrushTrigger() });
    });

    it('applies brush updates only for its configured axis', () => {
        const target = {
            visual: { kind: 'region' as const, role: 'region' },
            elements: [{ key: { category: 'A' } }],
        };
        const context = { chartType: 'Scatter Plot', selected: [] };
        const event = {
            type: 'semantic' as const,
            source: 'region' as const,
            phase: 'preview' as const,
            target,
        };
        expect(brushX().update({ ...event, axis: 'x' }, context)).toEqual({
            ops: [{ op: 'emphasize', elements: target.elements, mode: 'replace', dimOpacity: 0.25 }],
        });
        expect(brushX().update({ ...event, axis: 'y' }, context)).toBeNull();
        expect(brushX({ mode: 'stateful' }).update({
            ...event, axis: 'x', phase: 'commit', operation: 'clear', target: null,
        }, context)).toEqual({ ops: [{ op: 'reset' }] });
        expect(brushAngle().update({ ...event, axis: 'angle' }, context)).toEqual({
            ops: [{ op: 'emphasize', elements: target.elements, mode: 'replace', dimOpacity: 0.25 }],
        });
        expect(brushAngle().update({ ...event, axis: 'x' }, context)).toBeNull();
    });

    it('normalizes axis brushes across the orthogonal plot extent', () => {
        const mark = { marktype: 'symbol', name: 'points' };
        const item = (key: string, x: number, y: number) => ({
            mark,
            datum: { [INTERACTION_KEY]: key },
            bounds: { x1: x - 5, x2: x + 5, y1: y - 5, y2: y + 5 },
        });
        const view = {
            width: () => 300,
            height: () => 180,
            scenegraph: () => ({ root: { items: [
                item('same-x-top', 60, 20),
                item('same-x-bottom', 60, 150),
                item('same-y-right', 220, 60),
            ] } }),
        };
        const modifiers = { shift: false, ctrl: false, meta: false };
        const x = normalizeVegaRegionEvent(
            view, { x: 40, y: 80 }, { x: 120, y: 90 }, 'commit', 'intersect', modifiers, 'x',
        );
        const y = normalizeVegaRegionEvent(
            view, { x: 40, y: 30 }, { x: 50, y: 100 }, 'commit', 'intersect', modifiers, 'y',
        );
        expect(x).toMatchObject({ axis: 'x', operation: 'create', region: { x: 40, y: 0, width: 80, height: 180 } });
        expect(y).toMatchObject({ axis: 'y', operation: 'create', region: { x: 0, y: 30, width: 300, height: 70 } });
        expect(x.hits.map((hit) => hit.datum[INTERACTION_KEY])).toEqual(['same-x-top', 'same-x-bottom']);
        expect(y.hits.map((hit) => hit.datum[INTERACTION_KEY])).toEqual(['same-y-right']);
    });

    it('does not intersect disjoint collinear area and brush edges', () => {
        const slice = {
            kind: 'slice' as const,
            points: [
                { x: 0, y: 240 }, { x: 30, y: 225 },
                { x: 30, y: 260 }, { x: 0, y: 260 },
            ],
            offset: { x: 0, y: 0 },
        };
        expect(geometryIntersectsRect(slice, { x1: 0, x2: 300, y1: 80, y2: 160 }, false)).toBe(false);
        expect(geometryIntersectsRect(slice, { x1: 0, x2: 300, y1: 220, y2: 250 }, false)).toBe(true);
    });

    it('clears selection for an empty rectangle commit', () => {
        const interaction = select();
        const context = { chartType: 'Waterfall Chart', selected: [{ key: { Step: 'Revenue' } }] };
        expect(semanticUpdate(interaction, null, context, { source: 'region' }))
            .toEqual({ ops: [{ op: 'reset' }] });
    });

    it('maps the deprecated focusOnClick alias without duplicating an explicit definition', () => {
        expect(normalizeInteractions(undefined, undefined)).toEqual([]);
        expect(normalizeInteractions(undefined, true).map((interaction) => interaction.id)).toEqual(['click-highlight']);
        expect(normalizeInteractions([clickHighlight()], true).map((interaction) => interaction.id)).toEqual(['click-highlight']);
    });

    it('rejects duplicate interaction ids', () => {
        expect(() => normalizeInteractions([
            clickHighlight({ id: 'selection' }),
            select({ id: 'selection' }),
        ], false)).toThrow('Duplicate interaction id: "selection".');
    });

    it('produces replace and toggle emphasis updates', () => {
        const interaction = clickHighlight({ dimOpacity: 0.2 });
        const target = {
            visual: { kind: 'mark' as const, role: 'bar' },
            elements: [{ key: { Region: 'West' } }],
        };
        const context = { chartType: 'Bar Chart', selected: [] };
        const replace = semanticUpdate(interaction, target, context, {
            modifiers: { shift: false, ctrl: false, meta: false },
        });
        const toggle = semanticUpdate(interaction, target, context, {
            modifiers: { shift: true, ctrl: false, meta: false },
        });

        expect(replace?.ops[0]).toMatchObject({ op: 'emphasize', mode: 'replace', dimOpacity: 0.2 });
        expect(toggle?.ops[0]).toMatchObject({ op: 'emphasize', mode: 'toggle' });
    });

    it('keeps basic clicks local and lets group clicks propagate to the series', () => {
        const target = {
            visual: { kind: 'mark' as const, role: 'bar' },
            elements: [{ key: { key: 'west-consumer' }, records: [{ Segment: 'Consumer' }] }],
        };
        const context = {
            chartType: 'Grouped Bar Chart',
            selected: [],
            seriesField: 'Segment',
            available: [
                { key: { key: 'west-consumer' }, records: [{ Segment: 'Consumer' }] },
                { key: { key: 'east-consumer' }, records: [{ Segment: 'Consumer' }] },
                { key: { key: 'west-corporate' }, records: [{ Segment: 'Corporate' }] },
            ],
        };

        expect(semanticUpdate(clickHighlight(), target, context)?.ops[0]).toMatchObject({
            elements: [{ key: { key: 'west-consumer' } }],
        });
        expect(semanticUpdate(clickGroupHighlight(), target, context)?.ops[0]).toMatchObject({
            elements: [
                { key: { key: 'west-consumer' } },
                { key: { key: 'east-consumer' } },
            ],
        });
    });

    it('expands a Ranged Dot Plot unit to its complete interval in element mode', () => {
        const interaction = clickHighlight();
        const target = {
            visual: { kind: 'mark' as const, role: 'mark' },
            elements: [{ key: { key: 'us-male' }, records: [{ Country: 'United States', Sex: 'Male' }] }],
        };
        const context = {
            chartType: 'Ranged Dot Plot',
            selected: [],
            categoryField: 'Country',
            seriesField: 'Sex',
            available: [
                ...target.elements,
                { key: { key: 'us-female' }, records: [{ Country: 'United States', Sex: 'Female' }] },
                { key: { key: 'us-connector' }, records: [{ Country: 'United States' }] },
                { key: { key: 'japan-male' }, records: [{ Country: 'Japan', Sex: 'Male' }] },
            ],
        };

        expect(interaction.actOn?.(target, context)?.elements).toEqual(context.available.slice(0, 3));
        expect(semanticUpdate(interaction, target, context)?.ops[0]).toMatchObject({
            elements: context.available.slice(0, 3),
        });
    });

    it('expands every brushed Ranged Dot Plot category to its complete interval', () => {
        const target = {
            visual: { kind: 'mark' as const, role: 'region' },
            elements: [
                { key: { key: 'us-male' }, records: [{ Country: 'United States', Sex: 'Male' }] },
                { key: { key: 'japan-connector' }, records: [{ Country: 'Japan' }] },
            ],
        };
        const selected = [
            target.elements[0],
            { key: { key: 'us-female' }, records: [{ Country: 'United States', Sex: 'Female' }] },
            { key: { key: 'us-connector' }, records: [{ Country: 'United States' }] },
            { key: { key: 'japan-male' }, records: [{ Country: 'Japan', Sex: 'Male' }] },
            { key: { key: 'japan-female' }, records: [{ Country: 'Japan', Sex: 'Female' }] },
            target.elements[1],
        ];
        const context = {
            chartType: 'Ranged Dot Plot',
            selected: [],
            categoryField: 'Country',
            seriesField: 'Sex',
            available: [
                ...selected,
                { key: { key: 'brazil-male' }, records: [{ Country: 'Brazil', Sex: 'Male' }] },
            ],
        };

        expect(brushX().update({
            type: 'semantic', source: 'region', phase: 'commit', axis: 'x', target,
        }, context)?.ops[0]).toMatchObject({ elements: selected });
    });

    it('uses implicit rendered color for Waterfall grouping', () => {
        const interaction = clickGroupHighlight();
        const target = {
            visual: { kind: 'mark' as const, role: 'bar' },
            elements: [{ key: { key: 'asia' }, records: [{ Type: 'delta', __wf_color: 'increase' }] }],
        };
        const context = {
            chartType: 'Waterfall Chart',
            selected: [],
            seriesField: 'Type',
            available: [
                ...target.elements,
                { key: { key: 'africa' }, records: [{ Type: 'delta', __wf_color: 'increase' }] },
                { key: { key: 'oceania' }, records: [{ Type: 'delta', __wf_color: 'decrease' }] },
            ],
        };

        expect(semanticUpdate(interaction, target, context)?.ops[0]).toMatchObject({
            elements: [
                { key: { key: 'asia' } },
                { key: { key: 'africa' } },
            ],
        });
    });

    it('does not infer Waterfall grouping from a field name on another chart', () => {
        const interaction = clickGroupHighlight();
        const target = {
            visual: { kind: 'mark' as const, role: 'bar' },
            elements: [{
                key: { key: 'west-consumer' },
                records: [{ Segment: 'Consumer', __wf_color: 'increase' }],
            }],
        };
        const context = {
            chartType: 'Grouped Bar Chart',
            selected: [],
            seriesField: 'Segment',
            available: [
                ...target.elements,
                { key: { key: 'east-consumer' }, records: [{ Segment: 'Consumer', __wf_color: 'decrease' }] },
                { key: { key: 'west-corporate' }, records: [{ Segment: 'Corporate', __wf_color: 'increase' }] },
            ],
        };

        expect(semanticUpdate(interaction, target, context)?.ops[0]).toMatchObject({
            elements: [
                { key: { key: 'west-consumer' } },
                { key: { key: 'east-consumer' } },
            ],
        });
    });

    it('keeps an already-resolved legend cohort in group mode', () => {
        const interaction = clickGroupHighlight();
        const target = {
            visual: { kind: 'mark' as const, role: 'legend-item' },
            elements: [
                { key: { key: 'blue-circle' }, records: [{ Color: 'Blue', Shape: 'Circle' }] },
                { key: { key: 'orange-circle' }, records: [{ Color: 'Orange', Shape: 'Circle' }] },
            ],
        };
        const context = {
            chartType: 'Scatter Plot',
            selected: [],
            seriesField: 'Color',
            available: [
                ...target.elements,
                { key: { key: 'blue-square' }, records: [{ Color: 'Blue', Shape: 'Square' }] },
            ],
        };

        expect(semanticUpdate(interaction, target, context)?.ops[0]).toMatchObject({
            elements: target.elements,
        });
    });

    it('groups Strip Plot points by their categorical jitter lane', () => {
        const interaction = clickGroupHighlight();
        const target = {
            visual: { kind: 'mark' as const, role: 'circle' },
            elements: [{ key: { key: 'control-4.1' }, records: [{ Group: 'Control', Value: 4.1, Color: 'Low' }] }],
        };
        const context = {
            chartType: 'Strip Plot',
            selected: [],
            categoryField: 'Group',
            seriesField: 'Color',
            available: [
                ...target.elements,
                { key: { key: 'control-5.2' }, records: [{ Group: 'Control', Value: 5.2, Color: 'High' }] },
                { key: { key: 'treatment-4.1' }, records: [{ Group: 'Treatment', Value: 4.1, Color: 'Low' }] },
            ],
        };

        expect(semanticUpdate(interaction, target, context)?.ops[0]).toMatchObject({
            elements: [
                { key: { key: 'control-4.1' } },
                { key: { key: 'control-5.2' } },
            ],
        });
    });

    it('allows callers to override how a group is interpreted', () => {
        const interaction = clickGroupHighlight({
            groupBy: (element) => element.records?.[0]?.Region,
        });
        const target = {
            visual: { kind: 'mark' as const, role: 'bar' },
            elements: [{ key: { key: 'west-a' }, records: [{ Region: 'West', Segment: 'A' }] }],
        };
        const context = {
            chartType: 'Grouped Bar Chart',
            selected: [],
            seriesField: 'Segment',
            available: [
                ...target.elements,
                { key: { key: 'west-b' }, records: [{ Region: 'West', Segment: 'B' }] },
                { key: { key: 'east-a' }, records: [{ Region: 'East', Segment: 'A' }] },
            ],
        };

        expect(semanticUpdate(interaction, target, context)?.ops[0]).toMatchObject({
            elements: [
                { key: { key: 'west-a' } },
                { key: { key: 'west-b' } },
            ],
        });
    });

    it('creates element-level annotation content without selecting the mark', () => {
        const interaction = clickAnnotate();
        const target = {
            visual: { kind: 'mark' as const, role: 'circle' },
            elements: [{
                key: { key: 'setosa-1.4' },
                records: [{ Species: 'Setosa', Length: 1.4, __jitter: -2.1 }],
            }],
        };
        const context = { chartType: 'Strip Plot', selected: [] };

        expect(semanticUpdate(interaction, target, context)).toEqual({
            ops: [
                { op: 'annotate', element: target.elements[0], text: '1.4', point: undefined },
                { op: 'emphasize', elements: target.elements, mode: 'replace', dimOpacity: 0.25 },
            ],
        });
        expect(semanticUpdate(interaction, null, context)).toEqual({
            ops: [{ op: 'clear-annotation' }, { op: 'reset' }],
        });
    });

    it('lets the chart turn annotation intent into a render plan', () => {
        const element = {
            key: { key: 'setosa-1.4' },
            records: [{ Species: 'Setosa', Length: 1.4, __jitter: -2.1 }],
        };
        const presentUpdate = presentInteractionUpdate(() => ({
            anchor: 'center',
            placement: 'above',
        }));

        expect(presentUpdate(
            { ops: [{ op: 'annotate', element, text: '1.4' }] },
            { chartType: 'Strip Plot', selected: [] },
        )).toEqual({
            ops: [{
                op: 'render-annotation',
                element,
                point: undefined,
                annotation: {
                    text: '1.4',
                    placement: 'above',
                    anchor: 'center',
                },
            }],
        });
    });
});