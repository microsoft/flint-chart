import { describe, expect, it } from 'vitest';
import { brushAngle, brushX, brushY, clickAnnotate, clickGroupHighlight, clickHighlight, dragReorder, externalInteraction, navigate, normalizeInteractions, select } from '../src/interactive/interactions';
import { reorderValues } from '../src/interactive/presets/drag-reorder';
import { annotationCandidates, countAnnotationText, presentAnnotationUpdate } from '../src/interactive/presentation/annotation';
import { toCanvasInteractionEvent } from '../src/interactive/canvas-interaction';
import { semanticVisualFamily } from '../src/core/interaction-semantics';
import {
    matchesSemanticTargetSelector,
} from '../src/interactive/language/updates';
import {
    axisBrushTrigger,
    angularBrushTrigger,
    clickTrigger,
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
    PATH_KEY_SUFFIX,
    pathHoverPresentationKey,
    normalizeVegaRegionEvent,
    renderHit,
    sceneItems,
} from '../src/vegalite/interactions/hit-adapter';
import {
    interactionsForHoverPresentation,
    nearestReorderHit,
    resolveSupportedOperation,
} from '../src/vegalite/interactions/runtime';
import { reorderOwnedItems } from '../src/vegalite/interactions/presentation/drag-reorder-overlay';
import { hoverContrastOpacity } from '../src/vegalite/interactions/presentation/focus-overlay';
import {
    annotationFacingEdges,
    annotationLeaderPorts,
    routeAnnotationLeaders,
} from '../src/vegalite/interactions/presentation/annotation-leader-routing';
import {
    annotationCandidateAngles,
    annotationItem,
    annotationObstacleOverlapCost,
    annotationObstacleTier,
    annotationSourceBounds,
    sourceEdgeAttachment,
    isAnnotationSourceItem,
    isAnnotationObstacle,
    segmentMidpointConnectionPoint,
    valueEndConnectionPoint,
    valueSideConnectionPoint,
} from '../src/vegalite/interactions/presentation/annotation-overlay';
import { histogramDef } from '../src/vegalite/templates/bar';
import { areaChartDef } from '../src/vegalite/templates/area';
import { candlestickChartDef } from '../src/vegalite/templates/candlestick';
import { connectedScatterDef } from '../src/vegalite/templates/connected-scatter';
import { ganttChartDef } from '../src/vegalite/templates/gantt';
import { lineChartDef } from '../src/vegalite/templates/line';
import { lollipopChartDef } from '../src/vegalite/templates/lollipop';
import { rangeAreaChartDef } from '../src/vegalite/templates/range-area';
import { boxplotDef } from '../src/vegalite/templates/scatter';
import { waterfallChartDef } from '../src/vegalite/templates/waterfall';
import type {
    CanvasInteractionDef,
    InteractionContext,
    InteractionDef,
    InteractionModifiers,
    InteractionPhase,
    ChartUpdateOp,
    SemanticInteractionEvent,
    SemanticElement,
    SemanticTarget,
} from '../src/interactive/interactions';

function annotationUpdate(
    element: SemanticElement,
    visual: SemanticTarget['visual'] = { kind: 'mark', role: 'test' },
    text?: string,
) {
    return {
        id: 'test-annotation',
        ops: [{
            op: 'set-annotation' as const,
            target: { visual, elements: [element] },
            value: text === undefined ? {} : { text },
        }],
    };
}

function handleSemanticEvent(
    interaction: CanvasInteractionDef,
    event: SemanticInteractionEvent,
    context: InteractionContext,
) {
    return interaction.handle!(toCanvasInteractionEvent(event, interaction.eventSource), context);
}

function semanticUpdate(
    interaction: CanvasInteractionDef,
    target: SemanticTarget | null,
    context: InteractionContext,
    options: {
        source?: 'element' | 'region';
        phase?: InteractionPhase;
        modifiers?: InteractionModifiers;
    } = {},
) {
    return handleSemanticEvent(interaction, {
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

describe('public canvas interaction events', () => {
    it('classifies semantic visual roles consistently', () => {
        expect(semanticVisualFamily('legend-symbol')).toBe('legend');
        expect(semanticVisualFamily('axis-label')).toBe('axis');
        expect(semanticVisualFamily('facet-header')).toBe('facet');
        expect(semanticVisualFamily('annotation-label')).toBe('annotation');
        expect(semanticVisualFamily('bar')).toBe('element');
    });

    it('projects element and legend actions with point geometry', () => {
        const element = toCanvasInteractionEvent({
            type: 'semantic',
            source: 'element',
            phase: 'commit',
            point: { x: 20, y: 30 },
            target: {
                visual: { kind: 'mark', role: 'bar' },
                elements: [{ key: { Country: 'Japan' } }],
            },
        }, clickTrigger);
        const legend = toCanvasInteractionEvent({
            type: 'semantic',
            source: 'element',
            phase: 'preview',
            point: { x: 200, y: 30 },
            target: {
                visual: { kind: 'widget', role: 'legend-symbol' },
                elements: [{ key: { Country: 'Japan' } }],
            },
        }, hoverTrigger);

        expect(element.action).toBe('click-element');
        expect(element.geometry.plot).toEqual({ kind: 'point', point: { x: 20, y: 30 } });
        expect(legend.action).toBe('hover-legend');
    });

    it('projects region and navigation events', () => {
        const brush = toCanvasInteractionEvent({
            type: 'semantic',
            source: 'region',
            phase: 'preview',
            axis: 'x',
            operation: 'resize-trailing',
            region: { x: 10, y: 0, width: 40, height: 100 },
            target: null,
        }, xBrushTrigger());
        const zoom = toCanvasInteractionEvent({
            type: 'navigation',
            phase: 'commit',
            operation: 'zoom',
            axes: 'xy',
            factor: 1.2,
            anchor: { x: 0.5, y: 0.4 },
        }, navigationTrigger({ axes: 'xy' }));

        expect(brush).toMatchObject({
            action: 'brush-x',
            operation: 'resize-trailing',
            geometry: { plot: { kind: 'rect', axis: 'x' } },
        });
        expect(zoom).toMatchObject({
            action: 'zoom-viewport',
            operation: 'zoom',
            geometry: {
                plot: {
                    kind: 'viewport',
                    axes: 'xy',
                    factor: 1.2,
                    anchor: { x: 0.5, y: 0.4 },
                },
            },
            target: null,
        });
    });
});

describe('hover presentation policy', () => {
    it('maps area segments to their path but keeps line segments local', () => {
        const areaMark = {
            marktype: 'area',
            items: [
                { datum: { [INTERACTION_KEY]: 'first' } },
                { datum: { [INTERACTION_KEY]: 'second' } },
            ],
        };
        const areaItems = areaMark.items.map((item) => ({ ...item, mark: areaMark }));
        const lineMark = { ...areaMark, marktype: 'line' };
        const lineItems = lineMark.items.map((item) => ({ ...item, mark: lineMark }));

        expect(pathHoverPresentationKey(areaItems, `second${PATH_KEY_SUFFIX}`))
            .toBe(`first${PATH_KEY_SUFFIX}`);
        expect(pathHoverPresentationKey(lineItems, `second${PATH_KEY_SUFFIX}`))
            .toBe(`second${PATH_KEY_SUFFIX}`);
        expect(pathHoverPresentationKey(areaItems, 'ordinary-mark')).toBe('ordinary-mark');
    });

    it('computes generic overlay opacity contrast', () => {
        expect(hoverContrastOpacity(0.6)).toBe(1);
        expect(hoverContrastOpacity(1)).toBe(0.9);
    });

    it('includes click presets but not output-only click observers', () => {
        const preset = clickHighlight();
        const observer: InteractionDef = { id: 'click-observer', eventSource: clickTrigger };
        const hover: InteractionDef = { id: 'hover-observer', eventSource: hoverTrigger };

        expect(interactionsForHoverPresentation([preset, observer], [hover]).map(({ id }) => id))
            .toEqual(['hover-observer', 'click-highlight']);
    });

    it('expands group hover presentation to the committed cohort', () => {
        const interaction = clickGroupHighlight();
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
                { key: { key: 'east-a' }, records: [{ Region: 'East', Segment: 'A' }] },
                { key: { key: 'west-b' }, records: [{ Region: 'West', Segment: 'B' }] },
            ],
        };

        expect(semanticUpdate(interaction, target, context, { phase: 'preview' })?.ops[0]).toMatchObject({
            targets: [{ elements: [
                    { key: { key: 'west-a' } },
                    { key: { key: 'east-a' } },
                ] }],
        });
    });
});

describe('public chart updates', () => {
    const target = {
        visual: { kind: 'mark' as const, role: 'bar' },
        elements: [{ key: { __flint_interaction_key: 'japan' } }],
    };

    it('uses direct declarative operation JSON', () => {
        const ops: ChartUpdateOp[] = [{
            op: 'set-presentation',
            targets: [target, { select: { key: { Country: 'Japan' } } }],
            value: { state: 'emphasized', mutedOpacity: 0.25 },
        }, {
            op: 'set-annotation', target, value: { text: 'Selected' },
        }, {
            op: 'set-viewport', axes: 'x', value: { x: [0, 10] },
        }, {
            op: 'set-order', scope: 'category', field: 'Country', values: ['Japan'],
        }];
        expect(ops).toEqual([{
            op: 'set-presentation',
            targets: [target, { select: { key: { Country: 'Japan' } } }],
            value: { state: 'emphasized', mutedOpacity: 0.25 },
        }, {
            op: 'set-annotation', target, value: { text: 'Selected' },
        }, {
            op: 'set-viewport', axes: 'x', value: { x: [0, 10] },
        }, {
            op: 'set-order', scope: 'category', field: 'Country', values: ['Japan'],
        }]);
    });

    it('matches selectors only against declared semantic fields', () => {
        const selector = { select: { key: { Country: 'Japan', Year: 2024 } } };
        const row = { Country: 'Japan', Year: 2024, Revenue: 42 };

        expect(matchesSemanticTargetSelector(selector, ['Country', 'Year'], row)).toBe(true);
        expect(matchesSemanticTargetSelector(selector, ['Country'], row)).toBe(false);
        expect(matchesSemanticTargetSelector(
            { select: { key: {} } },
            ['Country'],
            row,
        )).toBe(false);
    });
});

describe('viewport navigation', () => {
    it('allows an interaction observer without a handler', () => {
        const interaction: InteractionDef = {
            id: 'click-observer',
            eventSource: clickTrigger,
        };

        expect(interaction.handle).toBeUndefined();
    });

    it('normalizes pan movement and wheel deltas without renderer state', () => {
        const pan = new PanSession({ x: 20, y: 30 }, { width: 200, height: 100 });
        expect(pan.move({ x: 40, y: 20 })).toEqual({ x: 0.1, y: -0.1 });
        expect(pan.move({ x: 50, y: 40 })).toEqual({ x: 0.05, y: 0.2 });
        expect(pan.dragDistance()).toBeCloseTo(Math.hypot(20, -10) + Math.hypot(10, 20));
        expect(wheelZoomFactor(-100, 0, 400, 0.002)).toBeCloseTo(Math.exp(0.2));
        expect(wheelZoomFactor(1, 1, 400, 0.002)).toBeCloseTo(Math.exp(-0.032));
    });

    it('resolves normalized navigation input through its viewport handler', () => {
        const interaction = navigate({ axes: 'xy' });
        expect(interaction.eventSource).toEqual(navigationTrigger({ axes: 'xy' }));
        expect(interaction.handle).toBeTypeOf('function');
        expect(interaction.navigationDomainGuard).toEqual({
            minVisibleFraction: 0.02,
            maxVisibleFraction: 1,
            overscrollFraction: 0,
        });
        const resolveNavigation = vi.fn(() => ({
            op: 'set-viewport' as const,
            axes: 'x' as const,
            value: { x: [10, 20] as const },
        }));
        const update = interaction.handle!(toCanvasInteractionEvent({
            type: 'navigation', phase: 'commit', operation: 'zoom', axes: 'x',
            factor: 2, anchor: { x: 0.5, y: 0.5 },
        }, interaction.eventSource), {
            chartType: 'Line Chart', selected: [], resolveNavigation,
        });
        expect(update).toEqual({ id: 'navigate', ops: [{
            op: 'set-viewport', axes: 'x', value: { x: [10, 20] },
        }] });
        expect(resolveNavigation).toHaveBeenCalledWith(expect.objectContaining({
            operation: 'zoom', axes: 'x', factor: 2,
        }), interaction.navigationDomainGuard);
        expect(() => navigate({
            domainGuard: { minVisibleFraction: 0.5, maxVisibleFraction: 0.25 },
        })).toThrow(/maxVisibleFraction/);
    });

    it('filters update operations against compiled chart capabilities', () => {
        const plan = {
            navigationAxes: { x: { scale: 'x', signal: 'xDomain', type: 'linear' as const } },
            reorderAxes: [{ axis: 'x' as const, field: 'Month', scale: 'x', signal: 'xOrder' }],
        };
        expect(resolveSupportedOperation({
            op: 'set-viewport', axes: 'xy', value: { x: [0, 5], y: [0, 10] },
        }, plan)).toEqual({
            op: { op: 'set-viewport', axes: 'x', value: { x: [0, 5] } },
            unsupported: true,
        });
        expect(resolveSupportedOperation({
            op: 'set-order', scope: 'series', field: 'Month', values: ['Jan'],
        }, plan)).toEqual({ op: null, unsupported: true });
        expect(resolveSupportedOperation({
            op: 'set-order', scope: 'category', field: 'Month', values: ['Jan'],
        }, plan).unsupported).toBe(false);
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
    it('resolves reorder destinations by nearest axis slot, including gaps and plot edges', () => {
        const items = ['A', 'B', 'C'].map((Category, index) => ({
            datum: { [INTERACTION_KEY]: Category, Category },
            mark: { marktype: 'rect', name: 'bars' },
            bounds: { x1: index * 100, x2: index * 100 + 40, y1: 0, y2: 80 },
        }));

        expect(nearestReorderHit(items, 'x', 'Category', 78)?.datum.Category).toBe('B');
        expect(nearestReorderHit(items, 'x', 'Category', -200)?.datum.Category).toBe('A');
        expect(nearestReorderHit(items, 'x', 'Category', 500)?.datum.Category).toBe('C');
    });

    it('moves category values to the destination slot in either direction', () => {
        expect(reorderValues(['A', 'B', 'C', 'D'], 'A', 'C')).toEqual(['B', 'C', 'A', 'D']);
        expect(reorderValues(['A', 'B', 'C', 'D'], 'D', 'B')).toEqual(['A', 'D', 'B', 'C']);
        expect(reorderValues(['A', 'B'], 'A', 'A')).toEqual(['A', 'B']);
    });

    it('lowers a committed bar drag to a category-order update', () => {
        const interaction = dragReorder();
        const elements = ['A', 'B', 'C'].map((Category) => ({
            key: { key: Category }, records: [{ Category }],
        }));
        const update = interaction.handle!({
            action: 'drag-element',
            phase: 'commit',
            geometry: { plot: { kind: 'drag', start: { x: 10, y: 20 }, current: { x: 80, y: 20 }, delta: { x: 70, y: 0 } } },
            target: { visual: { kind: 'mark', role: 'bar' }, elements: [elements[0]] },
            dropTarget: { visual: { kind: 'mark', role: 'bar' }, elements: [elements[2]] },
        }, {
            chartType: 'Bar Chart', selected: [], available: elements,
            categoryField: 'Category', categoryAxis: 'x',
        });

        expect(update).toEqual({
            id: 'drag-reorder',
            ops: [{ op: 'set-order', scope: 'category', field: 'Category', values: ['B', 'C', 'A'] }],
        });
    });

    it('composes sequential category reorders against the current order', () => {
        const interaction = dragReorder();
        const elements = ['1', '2', '3', '4', '5'].map((Category) => ({
            key: { key: Category }, records: [{ Category }],
        }));
        const drag = (source: number, destination: number, categoryOrder: readonly string[]) =>
            interaction.handle!({
                action: 'drag-element', phase: 'commit',
                geometry: { plot: { kind: 'drag', start: { x: 0, y: 0 }, current: { x: 1, y: 0 }, delta: { x: 1, y: 0 } } },
                target: { visual: { kind: 'mark', role: 'bar' }, elements: [elements[source]] },
                dropTarget: { visual: { kind: 'mark', role: 'bar' }, elements: [elements[destination]] },
            }, {
                chartType: 'Bar Chart', selected: [], available: elements,
                categoryField: 'Category', categoryAxis: 'x', categoryOrder,
            })?.ops[0];

        const first = drag(4, 2, ['1', '2', '3', '4', '5']);
        expect(first).toMatchObject({ values: ['1', '2', '5', '3', '4'] });
        const second = drag(3, 4, first?.op === 'set-order' ? first.values as string[] : []);
        expect(second).toMatchObject({ values: ['1', '2', '4', '5', '3'] });
    });

    it.each([
        [{ x: 70, y: 10 }, 'x', 'column', ['B', 'A']],
        [{ x: 10, y: 70 }, 'y', 'row', ['R2', 'R1']],
    ] as const)('selects a Heatmap reorder axis from drag direction', (delta, axis, field, orderedValues) => {
        const interaction = dragReorder();
        const source = { key: { key: 'A/R1' }, records: [{ column: 'A', row: 'R1' }] };
        const destination = { key: { key: 'B/R2' }, records: [{ column: 'B', row: 'R2' }] };
        const update = interaction.handle!({
            action: 'drag-element', phase: 'commit',
            geometry: { plot: { kind: 'drag', start: { x: 0, y: 0 }, current: delta, delta } },
            target: { visual: { kind: 'mark', role: 'cell' }, elements: [source] },
            dropTarget: { visual: { kind: 'mark', role: 'cell' }, elements: [destination] },
        }, {
            chartType: 'Heatmap', selected: [],
            reorderAxes: [
                { axis: 'x', field: 'column', order: ['A', 'B'] },
                { axis: 'y', field: 'row', order: ['R1', 'R2'] },
            ],
        });

        expect(update?.ops[0]).toEqual({ op: 'set-order', scope: 'category', field, values: orderedValues });
    });

    it('keeps a Heatmap drag on its locked axis after the pointer changes direction', () => {
        const interaction = dragReorder();
        const source = { key: { key: 'A/R1' }, records: [{ column: 'A', row: 'R1' }] };
        const destination = { key: { key: 'B/R2' }, records: [{ column: 'B', row: 'R2' }] };
        const update = interaction.handle!({
            action: 'drag-element', phase: 'commit',
            geometry: {
                plot: {
                    kind: 'drag', start: { x: 0, y: 0 }, current: { x: 10, y: 100 },
                    delta: { x: 10, y: 100 }, axis: 'x',
                },
            },
            target: { visual: { kind: 'mark', role: 'cell' }, elements: [source] },
            dropTarget: { visual: { kind: 'mark', role: 'cell' }, elements: [destination] },
        }, {
            chartType: 'Heatmap', selected: [],
            reorderAxes: [
                { axis: 'x', field: 'column', order: ['A', 'B'] },
                { axis: 'y', field: 'row', order: ['R1', 'R2'] },
            ],
        });

        expect(update?.ops[0]).toEqual({
            op: 'set-order', scope: 'category', field: 'column', values: ['B', 'A'],
        });
    });

    it('keeps a locked Heatmap drag active but commits no reorder over its source slot', () => {
        const interaction = dragReorder();
        const source = { key: { key: 'A/R1' }, records: [{ column: 'A', row: 'R1' }] };
        const destination = { key: { key: 'A/R2' }, records: [{ column: 'A', row: 'R2' }] };
        const update = interaction.handle!({
            action: 'drag-element', phase: 'commit',
            geometry: {
                plot: {
                    kind: 'drag', start: { x: 0, y: 0 }, current: { x: 0, y: 100 },
                    delta: { x: 0, y: 100 }, axis: 'x',
                },
            },
            target: { visual: { kind: 'mark', role: 'cell' }, elements: [source] },
            dropTarget: { visual: { kind: 'mark', role: 'cell' }, elements: [destination] },
        }, {
            chartType: 'Heatmap', selected: [],
            reorderAxes: [
                { axis: 'x', field: 'column', order: ['A', 'B'] },
                { axis: 'y', field: 'row', order: ['R1', 'R2'] },
            ],
        });

        expect(update).toBeNull();
    });
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
        const external = externalInteraction<{ selected: boolean }>({
            id: 'story-scroll',
            handle: (payload) => payload.selected ? { id: 'story-scroll', ops: [] } : null,
        });
        expect(external.external).toBe(true);
        expect(external.handle({ selected: true }, { chartType: 'Bar Chart', selected: [] }))
            .toEqual({ id: 'story-scroll', ops: [] });
    });

    it('processes resolved semantic events through normalized update policies', () => {
        const context = { chartType: 'Bar Chart', selected: [] };
        const target = {
            visual: { kind: 'mark' as const, role: 'bar' },
            elements: [{ key: { category: 'A' }, records: [{ category: 'A', value: 4 }] }],
        };

        expect(handleSemanticEvent(clickHighlight(), {
            type: 'semantic', source: 'element', phase: 'commit', target,
        }, context)).toEqual({
            id: 'click-highlight',
            ops: [{
                op: 'set-presentation', targets: [target],
                value: { state: 'emphasized', mutedOpacity: 0.25 },
            }],
        });
        expect(handleSemanticEvent(select(), {
            type: 'semantic', source: 'region', phase: 'preview', target,
        }, context)).toEqual({
            id: 'select',
            ops: [{
                op: 'set-presentation', targets: [target],
                value: { state: 'emphasized', mutedOpacity: 0.25 },
            }],
        });
    });

    it('creates preset definitions with stable defaults', () => {
        expect(clickHighlight()).toMatchObject({ id: 'click-highlight', eventSource: clickTrigger });
        expect(clickGroupHighlight()).toMatchObject({ id: 'click-group-highlight', eventSource: clickTrigger });
        expect(clickAnnotate()).toMatchObject({ id: 'click-annotate', eventSource: clickTrigger });
        expect(select()).toMatchObject({
            id: 'select',
            eventSource: rectangleTrigger('intersect'),
        });
        expect(brushX()).toMatchObject({ id: 'brush-x', axis: 'x', eventSource: xBrushTrigger() });
        expect(brushY()).toMatchObject({ id: 'brush-y', axis: 'y', eventSource: yBrushTrigger() });
        expect(brushX({ mode: 'stateful' }).eventSource).toEqual(xBrushTrigger('intersect', 'stateful'));
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
        expect(handleSemanticEvent(brushX(), { ...event, axis: 'x' }, context)).toEqual({
            id: 'brush-x',
            ops: [{
                op: 'set-presentation', targets: [target],
                value: { state: 'emphasized', mutedOpacity: 0.25 },
            }],
        });
        expect(handleSemanticEvent(brushX(), { ...event, axis: 'y' }, context)).toBeNull();
        expect(handleSemanticEvent(brushX({ mode: 'stateful' }), {
            ...event, axis: 'x', phase: 'commit', operation: 'clear', target: null,
        }, context)).toEqual({
            id: 'brush-x',
            ops: [{ op: 'set-presentation', targets: [], value: { state: 'normal' } }],
        });
        expect(handleSemanticEvent(brushAngle(), { ...event, axis: 'angle' }, context)).toEqual({
            id: 'brush-angle',
            ops: [{
                op: 'set-presentation', targets: [target],
                value: { state: 'emphasized', mutedOpacity: 0.25 },
            }],
        });
        expect(handleSemanticEvent(brushAngle(), { ...event, axis: 'x' }, context)).toBeNull();
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
            .toEqual({
                id: 'select',
                ops: [{ op: 'set-presentation', targets: [], value: { state: 'normal' } }],
            });
    });

    it('normalizes omitted interactions to an empty collection', () => {
        expect(normalizeInteractions(undefined)).toEqual([]);
    });

    it('rejects duplicate interaction ids', () => {
        expect(() => normalizeInteractions([
            clickHighlight({ id: 'selection' }),
            select({ id: 'selection' }),
        ])).toThrow('Duplicate interaction id: "selection".');
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

        expect(replace?.ops[0]).toMatchObject({
            op: 'set-presentation', value: { state: 'emphasized', mutedOpacity: 0.2 },
        });
        expect(toggle?.ops[0]).toMatchObject({
            op: 'set-presentation', value: { state: 'emphasized' },
        });
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
            targets: [{ elements: [{ key: { key: 'west-consumer' } }] }],
        });
        expect(semanticUpdate(clickGroupHighlight(), target, context)?.ops[0]).toMatchObject({
            targets: [{ elements: [
                    { key: { key: 'west-consumer' } },
                    { key: { key: 'east-consumer' } },
                ] }],
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

        expect(semanticUpdate(interaction, target, context)?.ops[0]).toMatchObject({
            targets: [{ elements: context.available.slice(0, 3) }],
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

        expect(handleSemanticEvent(brushX(), {
            type: 'semantic', source: 'region', phase: 'commit', axis: 'x', target,
        }, context)?.ops[0]).toMatchObject({ targets: [{ elements: selected }] });
    });

    it('uses implicit rendered color for Waterfall grouping', () => {
        const interaction = clickGroupHighlight();
        const semantics = waterfallChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Region', type: 'ordinal' },
                y: { field: 'Value', type: 'quantitative' },
                color: { field: 'Type', type: 'nominal' },
            },
        });
        const target = {
            visual: { kind: 'mark' as const, role: 'bar' },
            elements: [{ key: { key: 'asia' }, records: [{ Type: 'delta', __wf_color: 'increase' }] }],
        };
        const context = {
            chartType: 'Waterfall Chart',
            selected: [],
            seriesField: 'Type',
            resolveGroupValue: semantics.resolveGroupValue,
            available: [
                ...target.elements,
                { key: { key: 'africa' }, records: [{ Type: 'delta', __wf_color: 'increase' }] },
                { key: { key: 'oceania' }, records: [{ Type: 'delta', __wf_color: 'decrease' }] },
            ],
        };

        expect(semanticUpdate(interaction, target, context)?.ops[0]).toMatchObject({
            targets: [{ elements: [
                    { key: { key: 'asia' } },
                    { key: { key: 'africa' } },
                ] }],
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
            targets: [{ elements: [
                    { key: { key: 'west-consumer' } },
                    { key: { key: 'east-consumer' } },
                ] }],
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
            targets: [{ elements: target.elements }],
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
            targets: [{ elements: [
                    { key: { key: 'control-4.1' } },
                    { key: { key: 'control-5.2' } },
                ] }],
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
            targets: [{ elements: [
                    { key: { key: 'west-a' } },
                    { key: { key: 'west-b' } },
                ] }],
        });
    });

    it('creates element-level annotation intent without selecting the mark', () => {
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
            id: 'click-annotate',
            ops: [
                {
                    op: 'set-annotation',
                    target: { visual: target.visual, elements: target.elements },
                    value: {},
                },
                {
                    op: 'set-presentation', targets: [target],
                    value: { state: 'emphasized', mutedOpacity: 0.25 },
                },
            ],
        });
        expect(semanticUpdate(interaction, null, context)).toEqual({
            id: 'click-annotate',
            ops: [
                { op: 'set-annotation', target: { select: { key: {} } }, value: null },
                { op: 'set-presentation', targets: [], value: { state: 'normal' } },
            ],
        });
    });

    it('leaves default annotation formatting to the ChartDef', () => {
        const interaction = clickAnnotate();
        const end = Date.UTC(2024, 3, 15);
        const target = {
            visual: { kind: 'mark' as const, role: 'task' },
            elements: [{
                key: { key: 'launch' },
                records: [{ task: 'Launch', start: Date.UTC(2024, 3, 1), end, phase: 'Release' }],
            }],
        };

        expect(semanticUpdate(interaction, target, {
            chartType: 'Gantt Chart',
            selected: [],
            categoryField: 'task',
            seriesField: 'phase',
        })?.ops[0]).toMatchObject({
            op: 'set-annotation',
        });
        expect(semanticUpdate(interaction, target, {
            chartType: 'Gantt Chart', selected: [], categoryField: 'task', seriesField: 'phase',
        })?.ops[0]).toMatchObject({ value: {} });
    });

    it('lets the chart turn annotation intent into a render plan', () => {
        const element = {
            key: { key: 'setosa-1.4' },
            records: [{ Species: 'Setosa', Length: 1.4, __jitter: -2.1 }],
        };
        const presentUpdate = presentAnnotationUpdate(() => ({
            connection: 'center',
        }));

        expect(presentUpdate(
            annotationUpdate(element, undefined, '1.4'),
            { chartType: 'Strip Plot', selected: [] },
        )).toEqual({
            id: 'test-annotation',
            ops: [{
                op: 'set-annotation',
                target: { visual: { kind: 'mark', role: 'test' }, elements: [element] },
                value: {
                    text: '1.4',
                    candidates: [{
                        connection: 'center',
                    }],
                    subject: { kind: 'mark', role: 'test' },
                },
            }],
        });
    });

    it('lets the chart supply default annotation text', () => {
        const element = {
            key: { key: 'setosa-1.4' },
            records: [{ Species: 'Setosa', Length: 1.4, __jitter: -2.1 }],
        };
        const presentUpdate = presentAnnotationUpdate(() => ({ connection: 'center' }));

        expect(presentUpdate(
            annotationUpdate(element),
            { chartType: 'Strip Plot', selected: [], categoryField: 'Species' },
        ).ops[0]).toMatchObject({
            op: 'set-annotation',
            value: { text: '1.4' },
        });
    });

    it('uses a rendered histogram count instead of an empty raw-field fallback', () => {
        const element = {
            key: { key: '4|4.5' },
            records: [{ __bin_start: 4, __bin_end: 4.5, __count: 8 }],
        };
        const presentUpdate = presentAnnotationUpdate(
            () => ({ connection: 'value-end' }),
            countAnnotationText,
        );

        expect(presentUpdate(
            annotationUpdate(element),
            { chartType: 'Histogram', selected: [] },
        ).ops[0]).toMatchObject({
            op: 'set-annotation',
            value: { text: '8', candidates: [{ connection: 'value-end' }] },
        });
    });

    it('gives histogram counts focal side ports when the value end cannot fit', () => {
        const semantics = histogramDef.semanticInteractions!({
            resolvedEncodings: { x: { field: 'Duration', type: 'quantitative' } },
        } as any);
        const element = {
            key: { key: '1.5|2' },
            records: [{ __bin_start: 1.5, __bin_end: 2, __count: 9 }],
        };

        expect(semantics.presentUpdate!(
            annotationUpdate(element),
            { chartType: 'Histogram', selected: [] },
        ).ops[0]).toEqual({
            op: 'set-annotation',
            target: { visual: { kind: 'mark', role: 'test' }, elements: [element] },
            value: {
                text: '9',
                subject: { kind: 'mark', role: 'test' },
                candidates: [
                    { connection: 'value-end', valueAxis: 'y', priority: 0 },
                    {
                        connection: 'value-side',
                        valueAxis: 'y',
                        crossSide: 'start',
                        valueInset: 1 / 8,
                        priority: 1,
                    },
                    {
                        connection: 'value-side',
                        valueAxis: 'y',
                        crossSide: 'end',
                        valueInset: 1 / 8,
                        priority: 1,
                    },
                    { connection: 'top', priority: 2 },
                    { connection: 'bottom', priority: 2 },
                ],
            },
        });
    });

    it('keeps a short vertical histogram bin anchored at its top value end', () => {
        const shortBin = { bounds: { x1: 0, x2: 40, y1: 80, y2: 100 } };
        const tallerBin = { bounds: { x1: 41, x2: 81, y1: 20, y2: 100 } };

        expect(valueEndConnectionPoint(shortBin, [shortBin, tallerBin], 'y')).toEqual({
            point: { x: 20, y: 80 },
            preferredAngle: Math.PI * 1.5,
        });
    });

    it('places vertical bar side ports one-eighth below the top value end', () => {
        const bar = { bounds: { x1: 10, x2: 30, y1: 20, y2: 100 } };
        const peer = { bounds: { x1: 40, x2: 60, y1: 50, y2: 100 } };

        expect(valueSideConnectionPoint(bar, [bar, peer], 'y', 'end')).toEqual({
            point: { x: 30, y: 30 },
            preferredAngle: 0,
        });
    });

    it('places horizontal bar side ports one-eighth before the right value end', () => {
        const bar = { bounds: { x1: 10, x2: 90, y1: 20, y2: 40 } };
        const peer = { bounds: { x1: 10, x2: 60, y1: 50, y2: 70 } };

        expect(valueSideConnectionPoint(bar, [bar, peer], 'x', 'start')).toEqual({
            point: { x: 80, y: 20 },
            preferredAngle: Math.PI * 1.5,
        });
    });

    it('allows a vertical lollipop annotation to route sideways near the canvas edge', () => {
        const semantics = lollipopChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Country', type: 'nominal' },
                y: { field: 'Tonnes', type: 'quantitative' },
            },
        } as any);
        const element = {
            key: { key: '37' },
            records: [{ Country: 'A', Tonnes: 37 }],
        };

        expect(semantics.presentUpdate!(
            annotationUpdate(element),
            { chartType: 'Lollipop Chart', selected: [], categoryField: 'Country' },
        ).ops[0]).toMatchObject({
            value: {
                text: '37',
                candidates: [
                    { connection: 'value-end', valueAxis: 'y', anglePreference: 'oblique', priority: 0 },
                    { connection: 'right', anglePreference: 'oblique', priority: 1 },
                    { connection: 'left', anglePreference: 'oblique', priority: 2 },
                ],
            },
        });
    });

    it('anchors Waterfall annotations around the bar body', () => {
        const semantics = waterfallChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Step', type: 'nominal' },
                y: { field: 'Population', type: 'quantitative' },
            },
        } as any);
        const element = {
            key: { key: 'Asia' },
            records: [{ Step: 'Asia', __wf_prev_sum: 2536, __wf_sum: 5773 }],
        };

        expect(semantics.presentUpdate!(
            annotationUpdate(element),
            { chartType: 'Waterfall Chart', selected: [] },
        ).ops[0]).toMatchObject({
            value: {
                text: '2,536 → 5,773',
                candidates: [
                    { connection: 'value-end', valueAxis: 'y', priority: 0 },
                    { connection: 'value-side', valueAxis: 'y', crossSide: 'start', valueInset: 1 / 2, priority: 1 },
                    { connection: 'value-side', valueAxis: 'y', crossSide: 'end', valueInset: 1 / 2, priority: 1 },
                ],
            },
        });
    });

    it('does not count decorative grid lines as annotation obstacles', () => {
        expect(isAnnotationObstacle({ mark: { role: 'axis-grid', marktype: 'rule' } })).toBe(false);
        expect(isAnnotationObstacle({ bounds: { x1: 0, x2: 100, y1: 0, y2: 100 } })).toBe(false);
        expect(isAnnotationObstacle({ mark: { role: 'axis-label', marktype: 'text' } })).toBe(true);
        expect(isAnnotationObstacle({ mark: { role: 'mark', marktype: 'rule' } })).toBe(true);
    });

    it('excludes the stem direction from lollipop leader angles', () => {
        const stemDirection = Math.PI * 1.5;
        const angles = annotationCandidateAngles(stemDirection, 'oblique');

        expect(angles).toHaveLength(4);
        expect(angles.every((angle) => Math.abs(angle - stemDirection) > 0.001)).toBe(true);
    });

    it('searches the full circle for normal edge-target annotations', () => {
        const preferred = Math.PI / 3;
        const angles = annotationCandidateAngles(preferred);

        expect(angles).toHaveLength(12);
        expect(angles.some((angle) => Math.abs(angle - (preferred + Math.PI)) < 1e-10)).toBe(true);
    });

    it('ranks legend, solid, and dimmed annotation obstacles', () => {
        expect(annotationObstacleTier({ mark: { role: 'legend-label' }, opacity: 0.25 })).toBe(3);
        expect(annotationObstacleTier({ mark: { role: 'axis-label' }, opacity: 1 })).toBe(3);
        expect(annotationObstacleTier({ mark: { role: 'mark' }, opacity: 1 })).toBe(2);
        expect(annotationObstacleTier({ mark: { role: 'mark' }, opacity: 0.25 })).toBe(1);
        expect(annotationObstacleOverlapCost(1, 10)).toBeLessThan(annotationObstacleOverlapCost(2, 10));
        expect(annotationObstacleOverlapCost(2, 10)).toBeLessThan(annotationObstacleOverlapCost(3, 10));
    });

    describe('annotation leader routing', () => {
        const card = { left: 100, top: 100, width: 120, height: 80 };

        it.each([
            [{ x: 80, y: 140 }, ['left']],
            [{ x: 240, y: 140 }, ['right']],
            [{ x: 160, y: 80 }, ['top']],
            [{ x: 160, y: 200 }, ['bottom']],
            [{ x: 80, y: 80 }, ['left', 'top']],
            [{ x: 240, y: 80 }, ['right', 'top']],
            [{ x: 80, y: 200 }, ['left', 'bottom']],
            [{ x: 240, y: 200 }, ['right', 'bottom']],
            [{ x: 225, y: 230 }, ['bottom']],
            [{ x: 260, y: 185 }, ['right']],
        ] as const)('uses only card edges facing source %j', (source, edges) => {
            expect(annotationFacingEdges(source, card)).toEqual(edges);
            expect(edges).toContain(routeAnnotationLeaders({ card, sources: [source] })[0].port.edge);
        });

        it('avoids top-center and bottom-center ports on the text box', () => {
            const ports = annotationLeaderPorts(card);
            expect(ports).toHaveLength(10);
            expect(ports.filter((port) => port.edge === 'top').map((port) => port.fraction))
                .toEqual([0.25, 0.75]);
            expect(ports.filter((port) => port.edge === 'bottom').map((port) => port.fraction))
                .toEqual([0.25, 0.75]);
            expect(ports.filter((port) => port.edge === 'left').map((port) => port.fraction))
                .toEqual([0.25, 0.5, 0.75]);
            expect(ports.filter((port) => port.edge === 'right').map((port) => port.fraction))
                .toEqual([0.25, 0.5, 0.75]);
        });

        it('preserves source order and assigns distinct ports on a shared edge', () => {
            const sources = [{ x: 60, y: 112 }, { x: 55, y: 165 }];
            const routes = routeAnnotationLeaders({ card, sources });

            expect(routes.map((route) => route.port.edge)).toEqual(['left', 'left']);
            expect(routes[0].port.fraction).toBeLessThan(routes[1].port.fraction);
            expect(routes[0].port).not.toEqual(routes[1].port);
        });

        it('is stable for a diagonal multi-source assignment', () => {
            const sources = [{ x: 70, y: 70 }, { x: 250, y: 72 }, { x: 255, y: 205 }];
            const first = routeAnnotationLeaders({ card, sources });
            const second = routeAnnotationLeaders({ card, sources });

            expect(first).toEqual(second);
            expect(first).toHaveLength(sources.length);
            expect(new Set(first.map((route) => `${route.port.x},${route.port.y}`)).size).toBe(sources.length);
        });

        it('avoids the top-middle of a rectangular source mark', () => {
            const source = { left: 240, top: 144, width: 32, height: 52 };
            const upperLeftCard = { left: 20, top: 40, width: 270, height: 66 };

            expect(sourceEdgeAttachment(source, upperLeftCard, 'top', { x: 256, y: 144 }))
                .toEqual({ x: 248, y: 144 });
        });
    });

    it('routes an area segment annotation normal to and away from the fill', () => {
        const item = {
            interactionGeometry: {
                kind: 'slice',
                annotationPoints: [{ x: 0, y: 60 }, { x: 40, y: 20 }],
                points: [
                    { x: 0, y: 60 },
                    { x: 40, y: 20 },
                    { x: 40, y: 100 },
                    { x: 0, y: 100 },
                ],
            },
        };

        const connection = segmentMidpointConnectionPoint(item, { x: 20, y: 50 });
        expect(connection.point).toEqual({ x: 20, y: 40 });
        expect(connection.preferredAngle).toBeCloseTo(Math.PI * 1.25);
    });

    it.each([
        ['Line Chart', lineChartDef, { x: { field: 'Month', type: 'nominal' }, y: { field: 'Sales', type: 'quantitative' } }],
        ['Area Chart', areaChartDef, { x: { field: 'Month', type: 'nominal' }, y: { field: 'Sales', type: 'quantitative' } }],
    ] as const)('formats a clicked %s segment as an endpoint transition', (chartType, chartDef, resolvedEncodings) => {
        const semantics = chartDef.semanticInteractions!({ resolvedEncodings } as any);
        const element = {
            key: { key: 'Jan' },
            records: [{ Month: 'Jan', Sales: 10 }, { Month: 'Feb', Sales: 14 }],
        };

        expect(semantics.presentUpdate!(
            annotationUpdate(element),
            { chartType, selected: [], categoryField: 'Month' },
        ).ops[0]).toMatchObject({ value: { text: '10 → 14' } });
    });

    it('gives line paths segment presentation and line points glyph presentation', () => {
        const semantics = lineChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Miles', type: 'quantitative' },
                y: { field: 'Price', type: 'quantitative' },
            },
        } as any);
        const pathElement = {
            key: { [INTERACTION_KEY]: `A${PATH_KEY_SUFFIX}` },
            records: [{ Miles: 7200, Price: 2.36 }, { Miles: 7600, Price: 1.78 }],
        };
        const pointElement = {
            key: { [INTERACTION_KEY]: 'A' },
            records: [{ Miles: 7200, Price: 2.36 }],
        };

        expect(semantics.presentUpdate!(
            annotationUpdate(pathElement, { kind: 'path', role: 'line' }),
            { chartType: 'Line Chart', selected: [] },
        ).ops[0]).toMatchObject({ value: { text: '2.36 → 1.78' } });
        expect((semantics.presentUpdate!(
            annotationUpdate(pathElement, { kind: 'path', role: 'line' }),
            { chartType: 'Line Chart', selected: [] },
        ).ops[0] as any).value.candidates[0]).toEqual({ connection: 'segment-midpoint', priority: 0 });
        expect(semantics.presentUpdate!(
            annotationUpdate(pointElement, { kind: 'mark', role: 'symbol' }),
            { chartType: 'Line Chart', selected: [] },
        ).ops[0]).toMatchObject({ value: { text: '2.36' } });
        expect((semantics.presentUpdate!(
            annotationUpdate(pointElement, { kind: 'mark', role: 'symbol' }),
            { chartType: 'Line Chart', selected: [] },
        ).ops[0] as any).value.candidates[0]).toEqual({ connection: 'center', priority: 0 });
    });

    it('gives connected-scatter paths transitions and vertices single-value glyph presentation', () => {
        const semantics = connectedScatterDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Miles', type: 'quantitative' },
                y: { field: 'Price', type: 'quantitative' },
                order: { field: 'Year', type: 'temporal' },
            },
        } as any);
        const segment = {
            key: { [INTERACTION_KEY]: `A${PATH_KEY_SUFFIX}` },
            records: [{ Miles: 9800, Price: 2.14 }, { Miles: 10000, Price: 2.53 }],
        };
        const vertex = {
            key: { [INTERACTION_KEY]: 'A' },
            records: [{ Miles: 9800, Price: 2.14 }],
        };
        const pathUpdate = semantics.presentUpdate!(
            annotationUpdate(segment, { kind: 'path', role: 'line' }),
            { chartType: 'Connected Scatter Plot', selected: [] },
        );
        const pointUpdate = semantics.presentUpdate!(
            annotationUpdate(vertex, { kind: 'mark', role: 'symbol' }),
            { chartType: 'Connected Scatter Plot', selected: [] },
        );

        expect(pathUpdate.ops[0]).toMatchObject({ value: { text: '2.14 → 2.53' } });
        expect((pathUpdate.ops[0] as any).value.candidates[0]).toEqual({ connection: 'segment-midpoint', priority: 0 });
        expect(pointUpdate.ops[0]).toMatchObject({ value: { text: '2.14' } });
        expect((pointUpdate.ops[0] as any).value.candidates[0]).toEqual({ connection: 'center', priority: 0 });
    });

    it('resolves a path-suffixed annotation key to segment geometry instead of its point glyph', () => {
        const point = { datum: { [INTERACTION_KEY]: 'A' }, bounds: { x1: 9, x2: 11, y1: 9, y2: 11 } };
        const segment = {
            datum: { [INTERACTION_KEY]: 'A' },
            bounds: { x1: 10, x2: 40, y1: 10, y2: 30 },
            interactionGeometry: { kind: 'segment', points: [{ x: 10, y: 10 }, { x: 40, y: 30 }] },
        };

        expect(annotationItem([point, segment], `A${PATH_KEY_SUFFIX}`)).toBe(segment);
        expect(annotationItem([point, segment], 'A')).toBe(point);
    });

    it('resolves the clicked generated segment when path points share a series key', () => {
        const first = {
            datum: { [INTERACTION_KEY]: 'Setosa', Species: 'Setosa', value: 4.8, density: 0.3 },
            bounds: { x1: 10, x2: 20, y1: 30, y2: 50 },
            interactionGeometry: { kind: 'segment', points: [{ x: 10, y: 50 }, { x: 20, y: 30 }] },
        };
        const selected = {
            datum: { [INTERACTION_KEY]: 'Setosa', Species: 'Setosa', value: 5.1, density: 0.4 },
            bounds: { x1: 20, x2: 30, y1: 20, y2: 30 },
            interactionGeometry: { kind: 'segment', points: [{ x: 20, y: 30 }, { x: 30, y: 20 }] },
        };

        expect(annotationItem(
            [first, selected],
            `Setosa${PATH_KEY_SUFFIX}`,
            { kind: 'path' },
            undefined,
            undefined,
            { Species: 'Setosa', value: 5.1, density: 0.4 },
        )).toBe(selected);
    });

    it('uses the widest generated slice for a record-free series annotation', () => {
        const tail = {
            datum: { [INTERACTION_KEY]: 'Class A' },
            bounds: { x1: 19, x2: 21, y1: 20, y2: 30 },
            interactionGeometry: { kind: 'slice', points: [] },
        };
        const mode = {
            datum: { [INTERACTION_KEY]: 'Class A' },
            bounds: { x1: 8, x2: 32, y1: 30, y2: 40 },
            interactionGeometry: { kind: 'slice', points: [] },
        };

        expect(annotationItem([tail, mode], `Class A${PATH_KEY_SUFFIX}`, { kind: 'path' }))
            .toBe(mode);
    });

    it('treats sibling area slices as one annotation source shape', () => {
        const mark = { marktype: 'area' };
        const sourceDatum = { [INTERACTION_KEY]: 'Class A', value: 72 };
        const source = {
            mark, orient: 'horizontal', datum: sourceDatum, bounds: { x1: 20, x2: 30, y1: 30, y2: 40 },
            interactionGeometry: { annotationPoints: [{ x: 25, y: 30 }, { x: 26, y: 40 }] },
        };
        const sibling = {
            mark, orient: 'horizontal', datum: { [INTERACTION_KEY]: 'Class A', value: 73 },
            bounds: { x1: 8, x2: 42, y1: 40, y2: 50 },
        };

        expect(isAnnotationSourceItem({ mark, datum: sourceDatum }, source)).toBe(true);
        expect(isAnnotationSourceItem(sibling, source)).toBe(true);
        expect(annotationSourceBounds([source, sibling], source)).toEqual({
            x1: 8, x2: 42, y1: 30, y2: 50,
        });
    });

    it('indexes horizontal area segments used by Violin plots', () => {
        const mark: any = { marktype: 'area', items: [] };
        const first = {
            mark, datum: { [INTERACTION_KEY]: 'Class A', value: 4.8, density: 0.3 },
            x: 20, x2: 10, y: 50, bounds: { x1: 10, x2: 20, y1: 50, y2: 50 },
        };
        const second = {
            mark, datum: { [INTERACTION_KEY]: 'Class A', value: 5.1, density: 0.4 },
            x: 25, x2: 5, y: 30, bounds: { x1: 5, x2: 25, y1: 30, y2: 30 },
        };
        mark.items = [first, second];
        const view = { scenegraph: () => ({ root: { items: [first, second] } }) };

        const segments = sceneItems(view);

        expect(segments).toHaveLength(1);
        expect(segments[0].interactionGeometry).toMatchObject({
            kind: 'slice',
            points: [
                { x: 20, y: 50 }, { x: 25, y: 30 },
                { x: 5, y: 30 }, { x: 10, y: 50 },
            ],
        });
        expect(renderHit(segments[0])?.datum[INTERACTION_KEY])
            .toBe(`Class A${PATH_KEY_SUFFIX}`);
    });

    it('excludes connective rules from reorder-owned destination geometry', () => {
        const items = [
            { mark: { marktype: 'rect' }, datum: { [INTERACTION_KEY]: 'B', step: 'B' } },
            { mark: { marktype: 'rule' }, datum: { [INTERACTION_KEY]: 'B', step: 'B' } },
        ];

        expect(reorderOwnedItems(items, { field: 'step', markTypes: ['rect'] }, 'B'))
            .toEqual([items[0]]);
    });

    it('resolves radial annotations to the slice instead of a same-key text label', () => {
        const arc = {
            mark: { marktype: 'arc' },
            datum: { [INTERACTION_KEY]: 'Jan' },
            bounds: { x1: 20, x2: 80, y1: 20, y2: 80 },
        };
        const label = {
            mark: { marktype: 'text' },
            datum: { [INTERACTION_KEY]: 'Jan' },
            bounds: { x1: 45, x2: 55, y1: 10, y2: 20 },
        };

        expect(annotationItem([arc, label], 'Jan', undefined, 'arc')).toBe(arc);
    });

    it('resolves bar annotations to the rect instead of a same-key connector rule', () => {
        const bar = {
            mark: { marktype: 'rect' },
            datum: { [INTERACTION_KEY]: 'Asia' },
            bounds: { x1: 20, x2: 60, y1: 80, y2: 220 },
        };
        const connector = {
            mark: { marktype: 'rule' },
            datum: { [INTERACTION_KEY]: 'Asia' },
            bounds: { x1: 20, x2: 100, y1: 80, y2: 80 },
        };

        expect(annotationItem([bar, connector], 'Asia', undefined, 'rect')).toBe(bar);
    });

    it.each([
        [
            'Range Area Chart',
            rangeAreaChartDef,
            { x: { field: 'Month', type: 'nominal' }, y: { field: 'Low', type: 'quantitative' }, y2: { field: 'High', type: 'quantitative' } },
            { Month: 'Jan', Low: 8, High: 13 },
            '8 → 13',
        ],
        [
            'Candlestick Chart',
            candlestickChartDef,
            { x: { field: 'Day', type: 'temporal' }, open: { field: 'Open', type: 'quantitative' }, close: { field: 'Close', type: 'quantitative' } },
            { Day: '2026-08-25', Open: 101, Close: 106 },
            '101 → 106',
        ],
        [
            'Gantt Chart',
            ganttChartDef,
            { y: { field: 'Task', type: 'nominal' }, x: { field: 'Start', type: 'temporal' }, x2: { field: 'End', type: 'temporal' } },
            { Task: 'Build', Start: '2026-08-25', End: '2026-08-27' },
            '2026-08-25 → 2026-08-27',
        ],
        [
            'Waterfall Chart',
            waterfallChartDef,
            { x: { field: 'Step', type: 'nominal' }, y: { field: 'Delta', type: 'quantitative' } },
            { Step: 'Revenue', Delta: 15, __wf_prev_sum: 100, __wf_sum: 115, __wf_color: 'increase' },
            '100 → 115',
        ],
    ] as const)('formats a clicked %s interval from its semantic endpoints', (chartType, chartDef, resolvedEncodings, record, text) => {
        const semantics = chartDef.semanticInteractions!({ resolvedEncodings } as any);
        const element = { key: { key: chartType }, records: [record] };

        expect(semantics.presentUpdate!(
            annotationUpdate(element),
            { chartType, selected: [] },
        ).ops[0]).toMatchObject({ value: { text } });
    });

    it('suppresses boxplot annotation until composite roles and statistics are semantic', () => {
        const semantics = boxplotDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Species', type: 'nominal' },
                y: { field: 'Body mass (g)', type: 'quantitative' },
            },
        } as any);
        const element = {
            key: { key: 'Gentoo' },
            records: [{ Species: 'Gentoo', 'Body mass (g)': 5950 }],
        };

        expect(semantics.presentUpdate!(
            annotationUpdate(element),
            { chartType: 'Boxplot', selected: [], categoryField: 'Species' },
        ).ops).toEqual([]);
    });

    it.each([
        'value-end',
        'outer-radial',
        'center',
    ] as const)('preserves the ChartDef %s annotation candidate', (connection) => {
        const element = { key: { key: 'datum' } };
        const presentUpdate = presentAnnotationUpdate(() => ({ connection }));
        const update = presentUpdate(
            annotationUpdate(element, undefined, 'Value'),
            { chartType: 'Test', selected: [] },
        );

        expect(update.ops[0]).toMatchObject({
            op: 'set-annotation',
            value: { candidates: [{ connection }] },
        });
    });

    it('lets a ChartDef offer an ordered space of annotation connections', () => {
        expect(annotationCandidates('value-end', 'center', 'top')).toEqual([
            { connection: 'value-end', priority: 0 },
            { connection: 'center', priority: 1 },
            { connection: 'top', priority: 2 },
        ]);
    });
});