import { describe, expect, it, vi } from 'vitest';
import { axisHighlight, brushAngle, brushX, brushY, brushZoom, clickAnnotate, clickGroupHighlight, clickHighlight, doubleActivate, dragReorder, externalInteraction, inspect, lassoSelect, legendToggle, longPress, navigate, normalizeInteractions, select } from '../src/interactive/interactions';
import { reorderValues } from '../src/interactive/presets/drag-reorder';
import { annotationCandidates, countAnnotationText, presentAnnotationUpdate } from '../src/interactive/presentation/annotation';
import { toCanvasInteractionEvent } from '../src/interactive/canvas-interaction';
import { semanticVisualFamily } from '../src/core/interaction-semantics';
import { normalizeInspectGuideOptions, normalizeRegionGuideOptions } from '../src/interactive/guides';
import {
    matchesSemanticTargetSelector,
} from '../src/interactive/language/updates';
import {
    axisBrushTrigger,
    angularBrushTrigger,
    clickTrigger,
    contextTrigger,
    doubleActivateTrigger,
    hoverTrigger,
    inspectTrigger,
    parseInspectMode,
    keyboardTrigger,
    lassoTrigger,
    longPressTrigger,
    navigationTrigger,
    rectangleTrigger,
    xBrushTrigger,
    yBrushTrigger,
} from '../src/interactive/triggers';
import { AngularRegionSession } from '../src/interactive/gestures/angular-region';
import { angularEditAction, isInteractiveControlTarget, pointInAngularSector } from '../src/vegalite/interactions/gestures/region';
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
    axisIntersectingHits,
    INTERACTION_KEY,
    nearestItemByBounds,
    nearestItemOnInspectAxis,
    nextItemInDirection,
    PATH_KEY_SUFFIX,
    pathHoverPresentationKey,
    polarGuideSegment,
    polarInspectHits,
    tolerantInspectHits,
    normalizeVegaRegionEvent,
    polygonHits,
    renderHit,
    sceneItems,
} from '../src/vegalite/interactions/hit-adapter';
import {
    interactionsForHoverPresentation,
    domainForPlotGeometry,
    keyboardTargetItems,
    nearestReorderHit,
    resolveSupportedOperation,
} from '../src/vegalite/interactions/runtime';
import {
    activeReorderAxis,
    eligibleReorderAxes,
    eligibleReorderAxesForHit,
    reorderOwnedItems,
} from '../src/vegalite/interactions/presentation/drag-reorder-overlay';
import { hoverContrastOpacity } from '../src/vegalite/interactions/presentation/focus-overlay';
import {
    targetFeedbackDetailsPosition,
    targetFeedbackEntries,
    targetFeedbackPoint,
} from '../src/vegalite/interactions/presentation/target-feedback-overlay';
import { inspectGuideLine } from '../src/vegalite/interactions/presentation/inspect-guide-overlay';
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
import { withoutSemanticInteractionField } from '../src/vegalite/interactions/compile';
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
    it('does not start a region gesture from an interactive control', () => {
        const icon = { closest: () => ({ tagName: 'BUTTON' }) } as unknown as EventTarget;
        const plot = { closest: () => null } as unknown as EventTarget;

        expect(isInteractiveControlTarget(icon)).toBe(true);
        expect(isInteractiveControlTarget(plot)).toBe(false);
    });

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

    it('classifies both handles and the interior of a wrapped angular edit', () => {
        const sector = {
            center: { x: 0, y: 0 }, innerRadius: 20, outerRadius: 100,
            startAngle: Math.PI * 1.75, endAngle: Math.PI * 2.25,
        };

        expect(angularEditAction(sector.startAngle + 0.02, sector)).toBe('resize-leading');
        expect(angularEditAction(sector.endAngle - 0.02, sector)).toBe('resize-trailing');
        expect(angularEditAction(0, sector)).toBe('move');
        expect(angularEditAction(Math.PI, sector)).toBeUndefined();
    });

    it('requires a stateful angular edit pointer to remain inside the annulus', () => {
        const sector = {
            center: { x: 100, y: 100 }, innerRadius: 30, outerRadius: 80,
            startAngle: 0, endAngle: Math.PI / 2,
        };
        const pointAt = (radius: number, angle: number) => ({
            x: sector.center.x + radius * Math.sin(angle),
            y: sector.center.y - radius * Math.cos(angle),
        });

        expect(pointInAngularSector(pointAt(60, Math.PI / 4), sector)).toBe(true);
        expect(pointInAngularSector(pointAt(60, sector.startAngle), sector)).toBe(true);
        expect(pointInAngularSector(pointAt(60, sector.endAngle), sector)).toBe(true);
        expect(pointInAngularSector(pointAt(10, Math.PI / 4), sector)).toBe(false);
        expect(pointInAngularSector(pointAt(90, Math.PI / 4), sector)).toBe(false);
        expect(pointInAngularSector(pointAt(60, Math.PI), sector)).toBe(false);
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
                elements: [{ value: { Country: 'Japan' } }],
            },
        }, clickTrigger);
        const legend = toCanvasInteractionEvent({
            type: 'semantic',
            source: 'element',
            phase: 'preview',
            point: { x: 200, y: 30 },
            target: {
                visual: { kind: 'widget', role: 'legend-symbol' },
                elements: [{ value: { Country: 'Japan' } }],
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
            elements: [{ value: { key: 'west-a' }, records: [{ Region: 'West', Segment: 'A' }] }],
        };
        const context = {
            chartType: 'Grouped Bar Chart',
            selected: [],
            seriesField: 'Segment',
            available: [
                ...target.elements,
                { value: { key: 'east-a' }, records: [{ Region: 'East', Segment: 'A' }] },
                { value: { key: 'west-b' }, records: [{ Region: 'West', Segment: 'B' }] },
            ],
        };

        expect(semanticUpdate(interaction, target, context, { phase: 'preview' })?.ops[0]).toMatchObject({
            targets: [{ elements: [
                    { value: { key: 'west-a' } },
                    { value: { key: 'east-a' } },
                ] }],
        });
    });
});

describe('public chart updates', () => {
    const target = {
        visual: { kind: 'mark' as const, role: 'bar' },
        elements: [{ value: { __flint_interaction_key: 'japan' } }],
    };

    it('uses direct declarative operation JSON', () => {
        const ops: ChartUpdateOp[] = [{
            op: 'set-style',
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
            op: 'set-style',
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
    it('resolves a reorder guide from an aggregate target without source records', () => {
        const axis = { axis: 'x' as const, field: 'Species' };
        const preview = {
            start: { x: 10, y: 20 }, current: { x: 40, y: 20 }, axis: 'x' as const,
            source: {
                visual: { kind: 'mark' as const, role: 'distribution' },
                elements: [{ value: { Species: 'Adelie' }, records: [] }],
            },
            destination: {
                visual: { kind: 'mark' as const, role: 'distribution' },
                elements: [{ value: { Species: 'Chinstrap' }, records: [{ Species: 'Chinstrap' }] }],
            },
        };

        expect(activeReorderAxis([axis], preview)).toEqual(axis);
    });

    it('does not start category reorder from a line spanning multiple axis values', () => {
        const axes = [{ axis: 'x' as const, field: 'Period' }];
        const line = {
            visual: { kind: 'path' as const, role: 'line' },
            elements: [{
                value: { Product: 'Laptop' },
                records: [
                    { Period: 2019, Product: 'Laptop', Revenue: 20 },
                    { Period: 2024, Product: 'Laptop', Revenue: 62 },
                ],
            }],
        };
        const point = {
            visual: { kind: 'mark' as const, role: 'symbol' },
            elements: [{
                value: { Period: 2019, Product: 'Laptop', Revenue: 20 },
                records: [{ Period: 2019, Product: 'Laptop', Revenue: 20 }],
            }],
        };

        expect(eligibleReorderAxes(axes, line)).toEqual([]);
        expect(eligibleReorderAxes(axes, point)).toEqual(axes);
        expect(eligibleReorderAxesForHit(axes, {
            datum: { Period: 2019 }, source: 'mark', markType: 'symbol',
        })).toEqual(axes);
        expect(eligibleReorderAxesForHit(axes, {
            datum: { Period: 2019 }, source: 'mark', markType: 'line',
            pathData: line.elements[0].records,
        })).toEqual([]);
    });

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
            value: { key: Category }, records: [{ Category }],
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
            value: { key: Category }, records: [{ Category }],
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
        const source = { value: { key: 'A/R1' }, records: [{ column: 'A', row: 'R1' }] };
        const destination = { value: { key: 'B/R2' }, records: [{ column: 'B', row: 'R2' }] };
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
        const source = { value: { key: 'A/R1' }, records: [{ column: 'A', row: 'R1' }] };
        const destination = { value: { key: 'B/R2' }, records: [{ column: 'B', row: 'R2' }] };
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
        const source = { value: { key: 'A/R1' }, records: [{ column: 'A', row: 'R1' }] };
        const destination = { value: { key: 'A/R2' }, records: [{ column: 'A', row: 'R2' }] };
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
        expect(rectangleTrigger('contain')).toEqual({
            type: 'region',
            gesture: 'drag',
            match: 'contain',
            regionGuide: normalizeRegionGuideOptions(undefined),
        });
        expect(axisBrushTrigger('x', 'contain')).toEqual({
            type: 'region', gesture: 'drag', axis: 'x', match: 'contain', mode: 'ephemeral',
            regionGuide: normalizeRegionGuideOptions(undefined),
        });
        expect(xBrushTrigger()).toEqual({
            type: 'region', gesture: 'drag', axis: 'x', match: 'intersect', mode: 'ephemeral',
            regionGuide: normalizeRegionGuideOptions(undefined),
        });
        expect(yBrushTrigger('intersect', 'stateful')).toEqual({
            type: 'region', gesture: 'drag', axis: 'y', match: 'intersect', mode: 'stateful',
            regionGuide: normalizeRegionGuideOptions(undefined),
        });
        expect(angularBrushTrigger('contain')).toEqual({
            type: 'region', gesture: 'drag', regionGeometry: 'angular', match: 'contain', mode: 'ephemeral',
            regionGuide: normalizeRegionGuideOptions(undefined),
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
            elements: [{ value: { category: 'A' }, records: [{ category: 'A', value: 4 }] }],
        };

        expect(handleSemanticEvent(clickHighlight(), {
            type: 'semantic', source: 'element', phase: 'commit', target,
        }, context)).toEqual({
            id: 'click-highlight',
            ops: [{
                op: 'set-style', targets: [target],
                value: { state: 'emphasized', mutedOpacity: 0.25 },
            }],
        });
        expect(handleSemanticEvent(select(), {
            type: 'semantic', source: 'region', phase: 'preview', target,
        }, context)).toEqual({
            id: 'select',
            ops: [{
                op: 'set-style', targets: [target],
                value: { state: 'emphasized', mutedOpacity: 0.25 },
            }],
        });
    });

    it('creates preset definitions with stable defaults', () => {
        expect(clickHighlight()).toMatchObject({ id: 'click-highlight', eventSource: clickTrigger });
        expect(axisHighlight()).toMatchObject({
            id: 'axis-highlight', eventSource: clickTrigger, claimsAxisActivation: true,
        });
        expect(axisHighlight({ event: 'hover' }).eventSource).toBe(hoverTrigger);
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
            elements: [{ value: { category: 'A' } }],
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
                op: 'set-style', targets: [target],
                value: { state: 'emphasized', mutedOpacity: 0.25 },
            }],
        });
        expect(handleSemanticEvent(brushX(), { ...event, axis: 'y' }, context)).toBeNull();
        expect(handleSemanticEvent(brushX(), { ...event, axis: 'angle' }, context)).toEqual({
            id: 'brush-x',
            ops: [{
                op: 'set-style', targets: [target],
                value: { state: 'emphasized', mutedOpacity: 0.25 },
            }],
        });
        expect(handleSemanticEvent(brushX({ mode: 'stateful' }), {
            ...event, axis: 'angle', phase: 'commit', operation: 'clear', target: null,
        }, context)).toEqual({
            id: 'brush-x',
            ops: [{ op: 'set-style', targets: [], value: { state: 'normal' } }],
        });
        expect(handleSemanticEvent(brushAngle(), { ...event, axis: 'angle' }, context)).toEqual({
            id: 'brush-angle',
            ops: [{
                op: 'set-style', targets: [target],
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
        const context = { chartType: 'Waterfall Chart', selected: [{ value: { Step: 'Revenue' } }] };
        expect(semanticUpdate(interaction, null, context, { source: 'region' }))
            .toEqual({
                id: 'select',
                ops: [{ op: 'set-style', targets: [], value: { state: 'normal' } }],
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
            elements: [{ value: { Region: 'West' } }],
        };
        const context = { chartType: 'Bar Chart', selected: [] };
        const replace = semanticUpdate(interaction, target, context, {
            modifiers: { shift: false, ctrl: false, meta: false },
        });
        const toggle = semanticUpdate(interaction, target, context, {
            modifiers: { shift: true, ctrl: false, meta: false },
        });

        expect(replace?.ops[0]).toMatchObject({
            op: 'set-style', value: { state: 'emphasized', mutedOpacity: 0.2 },
        });
        expect(toggle?.ops[0]).toMatchObject({
            op: 'set-style', value: { state: 'emphasized' },
        });
    });

    it('keeps basic clicks local and lets group clicks propagate to the series', () => {
        const target = {
            visual: { kind: 'mark' as const, role: 'bar' },
            elements: [{ value: { key: 'west-consumer' }, records: [{ Segment: 'Consumer' }] }],
        };
        const context = {
            chartType: 'Grouped Bar Chart',
            selected: [],
            seriesField: 'Segment',
            available: [
                { value: { key: 'west-consumer' }, records: [{ Segment: 'Consumer' }] },
                { value: { key: 'east-consumer' }, records: [{ Segment: 'Consumer' }] },
                { value: { key: 'west-corporate' }, records: [{ Segment: 'Corporate' }] },
            ],
        };

        expect(semanticUpdate(clickHighlight(), target, context)?.ops[0]).toMatchObject({
            targets: [{ elements: [{ value: { key: 'west-consumer' } }] }],
        });
        expect(semanticUpdate(clickGroupHighlight(), target, context)?.ops[0]).toMatchObject({
            targets: [{ elements: [
                    { value: { key: 'west-consumer' } },
                    { value: { key: 'east-consumer' } },
                ] }],
        });
    });

    it('expands a Ranged Dot Plot unit to its complete interval in element mode', () => {
        const interaction = clickHighlight();
        const target = {
            visual: { kind: 'mark' as const, role: 'mark' },
            elements: [{ value: { key: 'us-male' }, records: [{ Country: 'United States', Sex: 'Male' }] }],
        };
        const context = {
            chartType: 'Ranged Dot Plot',
            selected: [],
            categoryField: 'Country',
            seriesField: 'Sex',
            available: [
                ...target.elements,
                { value: { key: 'us-female' }, records: [{ Country: 'United States', Sex: 'Female' }] },
                { value: { key: 'us-connector' }, records: [{ Country: 'United States' }] },
                { value: { key: 'japan-male' }, records: [{ Country: 'Japan', Sex: 'Male' }] },
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
                { value: { key: 'us-male' }, records: [{ Country: 'United States', Sex: 'Male' }] },
                { value: { key: 'japan-connector' }, records: [{ Country: 'Japan' }] },
            ],
        };
        const selected = [
            target.elements[0],
            { value: { key: 'us-female' }, records: [{ Country: 'United States', Sex: 'Female' }] },
            { value: { key: 'us-connector' }, records: [{ Country: 'United States' }] },
            { value: { key: 'japan-male' }, records: [{ Country: 'Japan', Sex: 'Male' }] },
            { value: { key: 'japan-female' }, records: [{ Country: 'Japan', Sex: 'Female' }] },
            target.elements[1],
        ];
        const context = {
            chartType: 'Ranged Dot Plot',
            selected: [],
            categoryField: 'Country',
            seriesField: 'Sex',
            available: [
                ...selected,
                { value: { key: 'brazil-male' }, records: [{ Country: 'Brazil', Sex: 'Male' }] },
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
            elements: [{ value: { key: 'asia' }, records: [{ Type: 'delta', __wf_color: 'increase' }] }],
        };
        const context = {
            chartType: 'Waterfall Chart',
            selected: [],
            seriesField: 'Type',
            resolveGroupValue: semantics.resolveGroupValue,
            available: [
                ...target.elements,
                { value: { key: 'africa' }, records: [{ Type: 'delta', __wf_color: 'increase' }] },
                { value: { key: 'oceania' }, records: [{ Type: 'delta', __wf_color: 'decrease' }] },
            ],
        };

        expect(semanticUpdate(interaction, target, context)?.ops[0]).toMatchObject({
            targets: [{ elements: [
                    { value: { key: 'asia' } },
                    { value: { key: 'africa' } },
                ] }],
        });
    });

    it('does not infer Waterfall grouping from a field name on another chart', () => {
        const interaction = clickGroupHighlight();
        const target = {
            visual: { kind: 'mark' as const, role: 'bar' },
            elements: [{
                value: { key: 'west-consumer' },
                records: [{ Segment: 'Consumer', __wf_color: 'increase' }],
            }],
        };
        const context = {
            chartType: 'Grouped Bar Chart',
            selected: [],
            seriesField: 'Segment',
            available: [
                ...target.elements,
                { value: { key: 'east-consumer' }, records: [{ Segment: 'Consumer', __wf_color: 'decrease' }] },
                { value: { key: 'west-corporate' }, records: [{ Segment: 'Corporate', __wf_color: 'increase' }] },
            ],
        };

        expect(semanticUpdate(interaction, target, context)?.ops[0]).toMatchObject({
            targets: [{ elements: [
                    { value: { key: 'west-consumer' } },
                    { value: { key: 'east-consumer' } },
                ] }],
        });
    });

    it('keeps an already-resolved legend cohort in group mode', () => {
        const interaction = clickGroupHighlight();
        const target = {
            visual: { kind: 'mark' as const, role: 'legend-item' },
            elements: [
                { value: { key: 'blue-circle' }, records: [{ Color: 'Blue', Shape: 'Circle' }] },
                { value: { key: 'orange-circle' }, records: [{ Color: 'Orange', Shape: 'Circle' }] },
            ],
        };
        const context = {
            chartType: 'Scatter Plot',
            selected: [],
            seriesField: 'Color',
            available: [
                ...target.elements,
                { value: { key: 'blue-square' }, records: [{ Color: 'Blue', Shape: 'Square' }] },
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
            elements: [{ value: { key: 'control-4.1' }, records: [{ Group: 'Control', Value: 4.1, Color: 'Low' }] }],
        };
        const context = {
            chartType: 'Strip Plot',
            selected: [],
            categoryField: 'Group',
            seriesField: 'Color',
            available: [
                ...target.elements,
                { value: { key: 'control-5.2' }, records: [{ Group: 'Control', Value: 5.2, Color: 'High' }] },
                { value: { key: 'treatment-4.1' }, records: [{ Group: 'Treatment', Value: 4.1, Color: 'Low' }] },
            ],
        };

        expect(semanticUpdate(interaction, target, context)?.ops[0]).toMatchObject({
            targets: [{ elements: [
                    { value: { key: 'control-4.1' } },
                    { value: { key: 'control-5.2' } },
                ] }],
        });
    });

    it('allows callers to override how a group is interpreted', () => {
        const interaction = clickGroupHighlight({
            groupBy: (element) => element.records?.[0]?.Region,
        });
        const target = {
            visual: { kind: 'mark' as const, role: 'bar' },
            elements: [{ value: { key: 'west-a' }, records: [{ Region: 'West', Segment: 'A' }] }],
        };
        const context = {
            chartType: 'Grouped Bar Chart',
            selected: [],
            seriesField: 'Segment',
            available: [
                ...target.elements,
                { value: { key: 'west-b' }, records: [{ Region: 'West', Segment: 'B' }] },
                { value: { key: 'east-a' }, records: [{ Region: 'East', Segment: 'A' }] },
            ],
        };

        expect(semanticUpdate(interaction, target, context)?.ops[0]).toMatchObject({
            targets: [{ elements: [
                    { value: { key: 'west-a' } },
                    { value: { key: 'west-b' } },
                ] }],
        });
    });

    it('creates element-level annotation intent without selecting the mark', () => {
        const interaction = clickAnnotate();
        const target = {
            visual: { kind: 'mark' as const, role: 'circle' },
            elements: [{
                value: { key: 'setosa-1.4' },
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
                    op: 'set-style', targets: [target],
                    value: { state: 'emphasized', mutedOpacity: 0.25 },
                },
            ],
        });
        expect(semanticUpdate(interaction, null, context)).toEqual({
            id: 'click-annotate',
            ops: [
                { op: 'set-annotation', target: { select: { key: {} } }, value: null },
                { op: 'set-style', targets: [], value: { state: 'normal' } },
            ],
        });
    });

    it('leaves default annotation formatting to the ChartDef', () => {
        const interaction = clickAnnotate();
        const end = Date.UTC(2024, 3, 15);
        const target = {
            visual: { kind: 'mark' as const, role: 'task' },
            elements: [{
                value: { key: 'launch' },
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
            value: { key: 'setosa-1.4' },
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
            value: { key: 'setosa-1.4' },
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
            value: { key: '4|4.5' },
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
            value: { key: '1.5|2' },
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
            value: { key: '37' },
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
            value: { key: 'Asia' },
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
            value: { key: 'Jan' },
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
            value: { [INTERACTION_KEY]: `A${PATH_KEY_SUFFIX}` },
            records: [{ Miles: 7200, Price: 2.36 }, { Miles: 7600, Price: 1.78 }],
        };
        const pointElement = {
            value: { [INTERACTION_KEY]: 'A' },
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
            value: { [INTERACTION_KEY]: `A${PATH_KEY_SUFFIX}` },
            records: [{ Miles: 9800, Price: 2.14 }, { Miles: 10000, Price: 2.53 }],
        };
        const vertex = {
            value: { [INTERACTION_KEY]: 'A' },
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
        const element = { value: { key: chartType }, records: [record] };

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
            value: { key: 'Gentoo' },
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
        const element = { value: { key: 'datum' } };
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
describe('assisted, keyboard, and lasso acquisition', () => {
    const boundedItem = (key: string, x1: number, y1: number, x2: number, y2: number) => ({
        mark: { marktype: 'rect' },
        datum: { [INTERACTION_KEY]: key },
        bounds: { x1, y1, x2, y2 },
    });
    const fakeView = (items: readonly any[]) => ({
        scenegraph: () => ({ root: { mark: { marktype: 'group' }, items } }),
    });

    it('acquires the nearest mark within the assist radius', () => {
        const near = boundedItem('near', 100, 100, 104, 104);
        const far = boundedItem('far', 200, 200, 204, 204);

        expect(nearestItemByBounds([near, far], { x: 110, y: 102 }, 12)).toBe(near);
        expect(nearestItemByBounds([near, far], { x: 150, y: 150 }, 12)).toBeUndefined();
    });

    it('prefers a mark the pointer is already inside over a nearer edge', () => {
        const inside = boundedItem('inside', 0, 0, 50, 50);
        const edge = boundedItem('edge', 52, 20, 56, 24);

        expect(nearestItemByBounds([inside, edge], { x: 49, y: 22 }, 12)).toBe(inside);
    });

    it('keeps axis inspection on the nearest axis coordinate', () => {
        const sameX = boundedItem('same-x', 18, 0, 22, 4);
        const nearbyIn2d = boundedItem('nearby-2d', 38, 88, 42, 92);

        expect(nearestItemOnInspectAxis(
            [sameX, nearbyIn2d],
            { x: 21, y: 90 },
            'x',
        )).toBe(sameX);
    });

    it('inspects every bar crossed by the axis guide', () => {
        const short = boundedItem('short', 0, 0, 20, 10);
        const long = boundedItem('long', 0, 20, 80, 30);
        const later = boundedItem('later', 60, 40, 100, 50);

        expect(axisIntersectingHits([short, long, later], 40, 'x')
            .map((hit) => hit.datum[INTERACTION_KEY])).toEqual(['long']);
        expect(axisIntersectingHits([short, long, later], 70, 'x')
            .map((hit) => hit.datum[INTERACTION_KEY])).toEqual(['long', 'later']);
    });

    it('uses tolerance to choose one nearest axis value when exact acquisition is empty', () => {
        const left = boundedItem('left', 0, 0, 20, 20);
        const right = boundedItem('right', 22, 0, 42, 20);

        expect(tolerantInspectHits([left, right], { x: 21, y: 10 }, 'x', { x: '=' }, { x: 3, y: 0 })
            .map((hit) => hit.datum[INTERACTION_KEY])).toEqual(['right']);
        expect(tolerantInspectHits([left, right], { x: 21, y: 10 }, 'x', { x: '=' }, { x: 0, y: 0 }))
            .toEqual([]);
        expect(tolerantInspectHits([left, right], { x: 50, y: 10 }, 'x', { x: '=' }, { x: 3, y: 0 }))
            .toEqual([]);
    });

    it('returns every series mark sharing the chosen axis value', () => {
        const left = boundedItem('left', 0, 0, 20, 10);
        const rightA = boundedItem('right-a', 22, 0, 42, 10);
        const rightB = boundedItem('right-b', 22, 20, 42, 30);

        expect(tolerantInspectHits(
            [left, rightA, rightB], { x: 21, y: 5 }, 'x', { x: '=' }, { x: 3, y: 0 },
        ).map((hit) => hit.datum[INTERACTION_KEY])).toEqual(['right-a', 'right-b']);
    });

    it('returns every mark intersected by the chosen axis slice', () => {
        const long = boundedItem('long', 0, 0, 80, 10);
        const short = boundedItem('short', 0, 20, 60, 30);
        const missed = boundedItem('missed', 0, 40, 40, 50);

        expect(tolerantInspectHits(
            [long, short, missed], { x: 50, y: 45 }, 'x', { x: '=' }, { x: 3, y: 0 },
        ).map((hit) => hit.datum[INTERACTION_KEY])).toEqual(['long', 'short']);
    });

    it('intersects every continuous path at the selected axis slice', () => {
        const segment = (key: string, y: number) => ({
            bounds: { x1: 20, y1: y, x2: 40, y2: y + 10 },
            interactionGeometry: {
                kind: 'segment',
                points: [{ x: 20, y }, { x: 40, y: y + 10 }],
            },
            datum: { [INTERACTION_KEY]: key },
            mark: { marktype: 'line', name: key },
        });

        expect(tolerantInspectHits(
            [segment('a', 10), segment('b', 30)], { x: 30, y: 0 }, 'x', { x: '=' }, { x: 3, y: 0 },
        ).map((hit) => hit.datum[INTERACTION_KEY])).toEqual([
            `a${PATH_KEY_SUFFIX}`,
            `b${PATH_KEY_SUFFIX}`,
        ]);
    });

    it('chooses one axis value when adjacent bins share an exact boundary', () => {
        const left = boundedItem('left', 0, 0, 20, 20);
        const right = boundedItem('right', 20, 0, 40, 20);

        expect(tolerantInspectHits([left, right], { x: 20, y: 10 }, 'x', { x: '=' }, { x: 3, y: 0 })
            .map((hit) => hit.datum[INTERACTION_KEY])).toEqual(['right']);
    });

    it('chooses one nearest xy mark but preserves exact overlaps', () => {
        const left = boundedItem('left', 0, 0, 20, 20);
        const right = boundedItem('right', 22, 0, 42, 20);
        const overlap = boundedItem('overlap', 22, 0, 42, 20);

        expect(tolerantInspectHits([left, right], { x: 21, y: 10 }, 'xy', { x: '=', y: '=' }, { x: 3, y: 3 })
            .map((hit) => hit.datum[INTERACTION_KEY])).toEqual(['right']);
        expect(tolerantInspectHits([right, overlap], { x: 30, y: 10 }, 'xy', { x: '=', y: '=' }, { x: 3, y: 3 })
            .map((hit) => hit.datum[INTERACTION_KEY])).toEqual(['right', 'overlap']);
    });

    it('acquires one quarter of the plot with mixed xy inspect predicates', () => {
        const items = [
            boundedItem('upper-left', 10, 10, 20, 20),
            boundedItem('upper-right', 70, 10, 80, 20),
            boundedItem('crosses-right-edge', 45, 10, 55, 20),
            boundedItem('lower-left', 10, 70, 20, 80),
            boundedItem('lower-right', 70, 70, 80, 80),
            boundedItem('nearest-outside', 48, 48, 49, 49),
        ];

        expect(tolerantInspectHits(
            items, { x: 50, y: 50 }, 'xy', { x: '>=', y: '<=' }, { x: 0, y: 0 },
        ).map((hit) => hit.datum[INTERACTION_KEY])).toEqual(['upper-right', 'crosses-right-edge']);

        expect(tolerantInspectHits(
            [boundedItem('nearest', 51, 51, 52, 52)],
            { x: 50, y: 50 }, 'xy', { x: '>=', y: '<=' }, { x: 10, y: 10 },
        )).toEqual([]);
    });

    it('bounds an x inspection guide to the plot height', () => {
        expect(inspectGuideLine('x', 40, { width: 300, height: 180 })).toEqual({
            x1: 40, y1: 0, x2: 40, y2: 180,
        });
    });

    it('draws a polar inspection guide from center to outer radius', () => {
        const frame = { center: { x: 100, y: 80 }, outerRadius: 60 };

        expect(polarGuideSegment(frame, { x: 130, y: 120 })).toEqual({
            start: { x: 100, y: 80 },
            end: { x: 136, y: 128 },
        });
        expect(polarGuideSegment(frame, frame.center)).toEqual({
            start: frame.center,
            end: { x: 100, y: 20 },
        });
    });

    it('normalizes compositional inspect modes', () => {
        expect(parseInspectMode('x')).toEqual({ inspect: 'x', predicate: { x: '=' } });
        expect(parseInspectMode('xy<=')).toEqual({ inspect: 'xy', predicate: { x: '<=', y: '<=' } });
        expect(parseInspectMode('x<=;y>=')).toEqual({ inspect: 'xy', predicate: { x: '<=', y: '>=' } });
        expect(() => parseInspectMode('y>=;x<=' as any)).toThrow('Invalid inspect mode');
    });

    it('acquires the arc crossed by a polar inspection guide', () => {
        const arc = (key: string, startAngle: number, endAngle: number) => ({
            x: 100, y: 80, innerRadius: 20, outerRadius: 60, startAngle, endAngle,
            datum: { [INTERACTION_KEY]: key },
            mark: { marktype: 'arc', name: key },
        });
        const frame = { center: { x: 100, y: 80 } };
        const items = [arc('right', 0, Math.PI), arc('left', Math.PI, 2 * Math.PI)];

        expect(polarInspectHits(items, { x: 140, y: 80 }, frame)
            .map((hit) => hit.datum[INTERACTION_KEY])).toEqual(['right']);
        expect(polarInspectHits(items, { x: 60, y: 80 }, frame)
            .map((hit) => hit.datum[INTERACTION_KEY])).toEqual(['left']);
    });

    it('captures marks inside a freeform lasso path', () => {
        const view = fakeView([
            boundedItem('in', 20, 20, 30, 30),
            boundedItem('out', 200, 200, 210, 210),
        ]);
        const square = [
            { x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }, { x: 0, y: 60 },
        ];

        const hits = polygonHits(view, square);
        expect(hits.map((hit) => hit.datum[INTERACTION_KEY])).toEqual(['in']);
        expect(polygonHits(view, square.slice(0, 2))).toEqual([]);
    });

    it('reports a polygon region as a lasso selection', () => {
        const event = toCanvasInteractionEvent({
            type: 'semantic',
            source: 'region',
            phase: 'commit',
            target: null,
            region: { points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }] },
        }, lassoTrigger());

        expect(event.action).toBe('select-lasso');
        expect(event.geometry.plot).toMatchObject({ kind: 'polygon' });
    });

    it('reports keyboard target movement as focus without activating', () => {
        const event = toCanvasInteractionEvent({
            type: 'semantic',
            source: 'element',
            phase: 'preview',
            target: { visual: { kind: 'mark', role: 'bar' }, elements: [{ value: { key: 'a' } }] },
        }, keyboardTrigger);

        expect(event.action).toBe('focus-element');
    });

    it('turns a lasso selection into an emphasis update', () => {
        const interaction = lassoSelect();
        const target = {
            visual: { kind: 'mark' as const, role: 'symbol' },
            elements: [{ value: { key: 'a' } }, { value: { key: 'b' } }],
        };
        const context = { chartType: 'Scatter Plot', selected: [] };

        const update = interaction.handle!(toCanvasInteractionEvent({
            type: 'semantic', source: 'region', phase: 'commit', target,
            region: { points: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 9 }] },
        }, interaction.eventSource), context);

        expect(update?.ops[0]).toMatchObject({
            op: 'set-style',
            targets: [{ elements: target.elements }],
        });
        expect(interaction.handle!(toCanvasInteractionEvent({
            type: 'semantic', source: 'region', phase: 'commit', target, axis: 'x',
        }, interaction.eventSource), context)).toBeNull();
    });

    it('lets keyboard activation reach the same click presets', () => {
        const target = {
            visual: { kind: 'mark' as const, role: 'bar' },
            elements: [{ value: { key: 'a' } }],
        };
        const context = { chartType: 'Bar Chart', selected: [] };
        const activation = {
            ...toCanvasInteractionEvent({
                type: 'semantic', source: 'element', phase: 'commit', target,
            }, clickTrigger),
            action: 'activate-element' as const,
        };

        expect(clickHighlight().handle!(activation, context)?.ops[0]).toMatchObject({
            op: 'set-style',
        });
        expect(clickAnnotate().handle!(activation, context)?.ops[0]).toMatchObject({
            op: 'set-annotation',
        });
    });
});

describe('keyboard spatial navigation', () => {
    const at = (key: string, x: number, y: number) => ({
        mark: { marktype: 'symbol' },
        datum: { [INTERACTION_KEY]: key },
        bounds: { x1: x - 3, y1: y - 3, x2: x + 3, y2: y + 3 },
    });
    const grid = [
        at('left', 10, 50),
        at('centre', 50, 50),
        at('right', 90, 50),
        at('above', 50, 10),
        at('below', 50, 90),
    ];
    const from = { x: 50, y: 50 };
    const keyOf = (item: any) => item?.datum[INTERACTION_KEY];

    it('moves to the neighbour on the axis the arrow names', () => {
        expect(keyOf(nextItemInDirection(grid, from, 'right'))).toBe('right');
        expect(keyOf(nextItemInDirection(grid, from, 'left'))).toBe('left');
        expect(keyOf(nextItemInDirection(grid, from, 'up'))).toBe('above');
        expect(keyOf(nextItemInDirection(grid, from, 'down'))).toBe('below');
    });

    it('prefers an aligned neighbour over a closer diagonal one', () => {
        const items = [at('diagonal', 62, 26), at('aligned', 90, 50)];

        expect(keyOf(nextItemInDirection(items, from, 'right'))).toBe('aligned');
    });

    it('follows the next discrete row even when bar lengths differ', () => {
        const bars = [
            { ...at('long', 100, 10), bounds: { x1: 0, y1: 7, x2: 200, y2: 13 } },
            { ...at('short', 25, 30), bounds: { x1: 0, y1: 27, x2: 50, y2: 33 } },
            { ...at('aligned-later', 100, 50), bounds: { x1: 0, y1: 47, x2: 200, y2: 53 } },
        ];

        expect(keyOf(nextItemInDirection(bars, { x: 100, y: 10 }, 'down', 'y'))).toBe('short');
    });

    it('uses the box body as the single target for a composite boxplot', () => {
        const datum = { [INTERACTION_KEY]: 'Adele' };
        const component = (marktype: string, bounds: Record<string, number>) => ({
            mark: { marktype }, datum, bounds,
        });
        const box = component('rect', { x1: 3, y1: 80, x2: 17, y2: 115 });
        const targets = keyboardTargetItems([
            component('rule', { x1: 9, y1: 64, x2: 11, y2: 121 }),
            box,
            component('rect', { x1: 3, y1: 109.5, x2: 17, y2: 110.5 }),
            component('symbol', { x1: 7, y1: 52, x2: 13, y2: 58 }),
        ]);

        expect(targets).toEqual([box]);
        expect(targetFeedbackPoint(targets[0])).toEqual({ x: 10, y: 97.5 });
    });

    it('stops at the edge instead of wrapping around', () => {
        expect(nextItemInDirection(grid, { x: 90, y: 50 }, 'right')).toBeUndefined();
        expect(nextItemInDirection(grid, { x: 10, y: 50 }, 'left')).toBeUndefined();
    });
});

describe('lasso capture semantics', () => {
    const mark = (key: string, x1: number, y1: number, x2: number, y2: number) => ({
        mark: { marktype: 'rect' },
        datum: { [INTERACTION_KEY]: key },
        bounds: { x1, y1, x2, y2 },
    });
    const view = (items: readonly any[]) => ({
        scenegraph: () => ({ root: { mark: { marktype: 'group' }, items } }),
    });
    const square = [
        { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 200 },
    ];
    const keys = (hits: readonly any[]) => hits.map((hit) => hit.datum[INTERACTION_KEY]).sort();

    it('captures a mark whose area overlaps the lasso', () => {
        const scene = view([
            mark('inside', 120, 120, 140, 140),
            mark('straddling', 190, 140, 260, 160),
            mark('outside', 300, 300, 320, 320),
        ]);

        expect(keys(polygonHits(scene, square))).toEqual(['inside', 'straddling']);
    });

    it('captures a mark the lasso is drawn entirely inside', () => {
        // A small loop within one long bar: no corner or centre of the bar is inside.
        const scene = view([mark('long-bar', 0, 130, 600, 170)]);

        expect(keys(polygonHits(scene, square))).toEqual(['long-bar']);
    });

    it('requires the whole mark for contain', () => {
        const scene = view([
            mark('inside', 120, 120, 140, 140),
            mark('straddling', 190, 140, 260, 160),
        ]);

        expect(keys(polygonHits(scene, square, true))).toEqual(['inside']);
    });
});

describe('legend, inspect, zoom, and touch presets', () => {
    it('removes renderer and template-derived fields from tooltip values', () => {
        expect(withoutSemanticInteractionField({
            Country: 'United States',
            'GDP ($T)': 27.4,
            __flint_interaction_key: 'mark:0',
            __bt_sort: 0,
            __bt_others: false,
            _vgsid_: 3,
        })).toEqual({ Country: 'United States', 'GDP ($T)': 27.4 });
    });

    it('uses the compiled hover tooltip fields for keyboard details', () => {
        expect(targetFeedbackEntries({
            tooltip: { Country: 'Norway', Share: 98.6 },
        }, {
            Country: 'Norway', Share: 98.6, start: 0, end: 98.6,
        })).toEqual([['Country', 'Norway'], ['Share', 98.6]]);
    });

    it('centers target feedback within an arc wedge', () => {
        expect(targetFeedbackPoint({
            mark: { marktype: 'arc' },
            x: 100,
            y: 100,
            innerRadius: 20,
            outerRadius: 80,
            startAngle: 0,
            endAngle: Math.PI / 2,
            bounds: { x1: 100, y1: 20, x2: 180, y2: 100 },
        })).toEqual({
            x: 100 + 50 * Math.sin(Math.PI / 4),
            y: 100 - 50 * Math.cos(Math.PI / 4),
        });
    });

    it('places target details away from the target and flips at viewport edges', () => {
        expect(targetFeedbackDetailsPosition(
            { x: 100, y: 80 },
            { width: 120, height: 50 },
            { width: 400, height: 300 },
        )).toEqual({ left: 114, top: 94 });
        expect(targetFeedbackDetailsPosition(
            { x: 390, y: 290 },
            { width: 120, height: 50 },
            { width: 400, height: 300 },
        )).toEqual({ left: 256, top: 226 });
    });

    const context = { chartType: 'Line Chart', selected: [] };
    const seriesTarget = (name: string) => ({
        visual: { kind: 'legend' as const, role: 'legend-item' },
        elements: [{
            value: { channel: 'color', field: 'Series', value: name },
            records: [{ Series: name }],
        }],
    });
    const activate = (interaction: CanvasInteractionDef, target: SemanticTarget | null, ctx: InteractionContext = context) =>
        interaction.handle!(toCanvasInteractionEvent({
            type: 'semantic', source: 'element', phase: 'commit', target,
        }, interaction.eventSource), ctx);

    it('hides an activated series and restores it when activated again', () => {
        const interaction = legendToggle();

        expect(activate(interaction, seriesTarget('A'))?.ops[0]).toMatchObject({
            op: 'set-style',
            targets: [{ elements: [{ value: { channel: 'color', field: 'Series', value: 'A' } }] }],
            value: { visible: false, mutedOpacity: 0.25 },
        });
        expect(activate(interaction, seriesTarget('A'))?.ops[0]).toMatchObject({
            targets: [],
            value: { visible: false, mutedOpacity: 0.25 },
        });
    });

    it('owns the hidden legend affordance opacity', () => {
        const interaction = legendToggle({ mutedOpacity: 0.4 });

        expect(activate(interaction, seriesTarget('A'))?.ops[0]).toMatchObject({
            value: { visible: false, mutedOpacity: 0.4 },
        });
    });

    it('accumulates several hidden series', () => {
        const interaction = legendToggle();
        activate(interaction, seriesTarget('A'));

        expect(activate(interaction, seriesTarget('B'))?.ops[0]).toMatchObject({
            targets: [{ elements: [
                { value: { channel: 'color', field: 'Series', value: 'A' } },
                { value: { channel: 'color', field: 'Series', value: 'B' } },
            ] }],
        });
    });

    it('restores all series when the last visible series is disabled', () => {
        const interaction = legendToggle();
        const initialContext = {
            chartType: 'Line Chart', selected: [],
            legendDomains: { color: ['A', 'B'] },
            available: [
                { value: { Series: 'A' }, records: [{ Series: 'A' }] },
                { value: { Series: 'B' }, records: [{ Series: 'B' }] },
            ],
        };
        const domainTarget = (name: string) => ({
            visual: { kind: 'legend' as const, role: 'legend-item' },
            elements: [{
                value: {
                    channel: 'color', field: 'Series',
                    domain: { kind: 'value' as const, value: name },
                },
            }],
        });
        activate(interaction, domainTarget('A'), initialContext);

        expect(activate(interaction, domainTarget('B'), {
            chartType: 'Line Chart', selected: [],
            legendDomains: { color: ['A', 'B'] },
            available: [{ value: { Series: 'B' }, records: [{ Series: 'B' }] }],
        })?.ops[0]).toMatchObject({
            targets: [],
            value: { visible: false, mutedOpacity: 0.25 },
        });

        expect(activate(interaction, domainTarget('A'), initialContext)?.ops[0]).toMatchObject({
            targets: [{ elements: domainTarget('A').elements }],
        });
    });

    it('does not reset early when a Streamgraph exposes collapsed availability', () => {
        const interaction = legendToggle();
        const domainTarget = (name: string) => ({
            visual: { kind: 'legend' as const, role: 'legend-item' },
            elements: [{
                value: {
                    channel: 'color', field: 'Region',
                    domain: { kind: 'value' as const, value: name },
                },
            }],
        });
        const collapsedContext: InteractionContext = {
            chartType: 'Streamgraph', selected: [],
            legendDomains: { color: ['Asia', 'Africa'] },
            available: [{ value: { Region: 'Asia' }, records: [{ Region: 'Asia' }] }],
        };

        expect(activate(interaction, domainTarget('Asia'), collapsedContext)?.ops[0]).toMatchObject({
            targets: [{ elements: domainTarget('Asia').elements }],
        });
        expect(activate(interaction, domainTarget('Africa'), collapsedContext)?.ops[0]).toMatchObject({
            targets: [],
        });
    });

    it('ignores mark activations so it composes with element click presets', () => {
        const interaction = legendToggle();
        const markTarget = { visual: { kind: 'mark' as const, role: 'mark' }, elements: [{ value: { key: 'A' } }] };

        expect(activate(interaction, markTarget)).toBeNull();
    });

    it('lets highlight presets opt out of handling observable legend events', () => {
        expect(activate(clickHighlight(), seriesTarget('A'))).not.toBeNull();
        expect(activate(clickHighlight({ legend: false }), seriesTarget('A'))).toBeNull();
        expect(activate(clickGroupHighlight(), seriesTarget('A'))).not.toBeNull();
        expect(activate(clickGroupHighlight({ legend: false }), seriesTarget('A'))).toBeNull();
        expect(activate(clickAnnotate(), seriesTarget('A'))).toBeNull();
    });

    it('reports the resolved role for context, long-press, and double activation', () => {
        const target = seriesTarget('A');
        const semantic = { type: 'semantic' as const, source: 'element' as const, phase: 'commit' as const, target };

        expect(toCanvasInteractionEvent(semantic, contextTrigger).action).toBe('context-legend');
        expect(toCanvasInteractionEvent(semantic, longPressTrigger()).action).toBe('long-press-legend');
        expect(toCanvasInteractionEvent(semantic, doubleActivateTrigger).action).toBe('double-activate-legend');
    });

    it('preserves an unresolved legend domain for processor expansion', () => {
        const target = {
            visual: { kind: 'legend' as const, role: 'legend-item' },
            elements: [{
                value: {
                    channel: 'color', field: '__status',
                    domain: { kind: 'value' as const, value: 'Meets target' },
                },
            }],
        };
        const event = toCanvasInteractionEvent({
            type: 'semantic', source: 'element', phase: 'commit', target,
        }, clickTrigger);

        expect(event).toMatchObject({ action: 'click-legend', target });
        expect(activate(clickHighlight(), target)?.ops[0]).toMatchObject({
            op: 'set-style',
            targets: [{ visual: target.visual, elements: target.elements }],
            value: { state: 'emphasized' },
        });
        expect(activate(clickGroupHighlight(), target)?.ops[0]).toMatchObject({
            op: 'set-style',
            targets: [{ visual: target.visual, elements: target.elements }],
            value: { state: 'emphasized' },
        });
        expect(activate(legendToggle(), target)?.ops[0]).toMatchObject({
            op: 'set-style',
            targets: [{ visual: target.visual, elements: target.elements }],
            value: { visible: false },
        });
    });

    it('reports inspection modes as their own actions', () => {
        expect(inspect().eventSource).toEqual(inspectTrigger('xy'));
        expect(inspectTrigger('xy').inspectTolerance).toBe(0.02);
        expect(inspectTrigger('x').inspectTolerance).toBe(0.01);
        expect(inspectTrigger('xy<=').inspectTolerance).toBe(0.01);
        expect(inspectTrigger('xy', undefined, 0.03).inspectTolerance).toBe(0.03);
        expect(inspect({
            mode: 'x>=;y<=', cycle: ['x>=;y<=', 'x>=;y>=', 'x<=;y>=', 'x<=;y<='],
        }).eventSource.inspectCycle).toEqual([
            { inspect: 'xy', predicate: { x: '>=', y: '<=' } },
            { inspect: 'xy', predicate: { x: '>=', y: '>=' } },
            { inspect: 'xy', predicate: { x: '<=', y: '>=' } },
            { inspect: 'xy', predicate: { x: '<=', y: '<=' } },
        ]);
        expect(toCanvasInteractionEvent({
            type: 'semantic', source: 'element', phase: 'preview', target: null,
        }, inspectTrigger('x')).action).toBe('inspect-x');
        expect(toCanvasInteractionEvent({
            type: 'semantic', source: 'element', phase: 'preview', target: null,
        }, inspectTrigger('y')).action).toBe('inspect-y');
    });

    it('normalizes gesture guide visibility and renderer-neutral styles', () => {
        expect(normalizeInspectGuideOptions(false)).toMatchObject({ visible: false });
        expect(normalizeInspectGuideOptions({
            style: { color: '#123456', opacity: 2, width: 2, fillOpacity: -1 },
        })).toEqual({
            visible: true,
            style: { color: '#123456', opacity: 1, width: 2, fillOpacity: 0 },
        });
        expect(normalizeRegionGuideOptions({
            style: { fillOpacity: -1, strokeOpacity: 2, strokeWidth: 3 },
        })).toMatchObject({
            visible: true,
            style: { fillOpacity: 0, strokeOpacity: 1, strokeWidth: 3 },
        });
    });

    it('configures guides without changing gesture semantics', () => {
        const hiddenInspect = inspect({ mode: 'x', guide: false }).eventSource;
        expect(hiddenInspect).toMatchObject({
            gesture: 'inspect', inspect: 'x', inspectGuide: { visible: false },
        });
        const hiddenRegion = select({ match: 'contain', guide: false }).eventSource;
        expect(hiddenRegion).toMatchObject({
            gesture: 'drag', match: 'contain', regionGuide: { visible: false },
        });
        expect(brushAngle({ guide: false }).eventSource.regionGuide?.visible).toBe(false);
        expect(lassoSelect({ guide: false }).eventSource.regionGuide?.visible).toBe(false);
        expect(brushZoom({ guide: false }).eventSource.regionGuide?.visible).toBe(false);
    });

    it('turns a brushed region into an absolute viewport', () => {
        const interaction = brushZoom();
        const event = {
            ...toCanvasInteractionEvent({
                type: 'semantic', source: 'region', phase: 'commit', target: null,
                region: { x: 0, y: 0, width: 10, height: 10 }, axis: 'xy' as const,
            }, interaction.eventSource),
            geometry: {
                domain: {
                    x: { kind: 'interval' as const, start: 2, end: 8 },
                    y: { kind: 'interval' as const, start: 1, end: 5 },
                },
            },
        };

        expect(interaction.handle!(event, context)).toEqual({
            id: 'brush-zoom',
            ops: [{ op: 'set-viewport', axes: 'xy', value: { x: [2, 8], y: [1, 5] } }],
        });
        expect(interaction.handle!({
            ...event,
            operation: 'clear',
            geometry: {
                domain: {
                    x: { kind: 'interval', start: 5, end: 5 },
                    y: { kind: 'interval', start: 3, end: 3 },
                },
            },
        }, context)).toBeNull();
    });

    it('inverts a log-scale brush in plot-local coordinates', () => {
        const inverted: number[] = [];
        const domain = domainForPlotGeometry({
            kind: 'rect', axis: 'xy', rect: { x: 100, y: 0, width: 200, height: 80 },
        }, {
            x: { scale: 'x', signal: 'xDomain', type: 'log' },
        }, () => ({
            invert: (pixel: number) => {
                inverted.push(pixel);
                return 10 ** (pixel / 100);
            },
        }));

        expect(inverted).toEqual([100, 300]);
        expect(domain).toEqual({ x: { kind: 'interval', start: 10, end: 1000 } });
    });

    it('preserves the scale domain direction for a vertically inverted brush range', () => {
        const domain = domainForPlotGeometry({
            kind: 'rect', axis: 'y', rect: { x: 0, y: 20, width: 100, height: 40 },
        }, {
            y: { scale: 'y', signal: 'yDomain', type: 'linear' },
        }, () => ({
            domain: () => [20, 40],
            invert: (pixel: number) => 40 - pixel / 4,
        }));

        expect(domain).toEqual({ y: { kind: 'interval', start: 25, end: 35 } });
    });

    it('preserves a reversed y axis when the scale increases down the screen', () => {
        const domain = domainForPlotGeometry({
            kind: 'rect', axis: 'y', rect: { x: 0, y: 20, width: 100, height: 40 },
        }, {
            y: { scale: 'y', signal: 'yDomain', type: 'linear' },
        }, () => ({
            invert: (pixel: number) => 20 + pixel / 4,
        }));

        expect(domain).toEqual({ y: { kind: 'interval', start: 35, end: 25 } });
    });

    it('normalizes viewport brush geometry without scanning marks', () => {
        const view = {
            width: () => 100,
            height: () => 80,
            scenegraph: () => { throw new Error('scenegraph should not be read'); },
        };

        const event = normalizeVegaRegionEvent(
            view, { x: 10, y: 20 }, { x: 60, y: 70 }, 'preview', 'intersect',
            { shift: false, ctrl: false, meta: false },
            'xy', { width: 100, height: 80 }, 'create', false,
        );

        expect(event.region).toEqual({ x: 10, y: 20, width: 50, height: 50 });
        expect(event.hits).toEqual([]);
    });

    it('ignores a brush that collapsed to a single value', () => {
        const interaction = brushZoom({ axes: 'x' });
        const event = {
            ...toCanvasInteractionEvent({
                type: 'semantic', source: 'region', phase: 'commit', target: null,
                region: { x: 0, y: 0, width: 0, height: 10 }, axis: 'x' as const,
            }, interaction.eventSource),
            geometry: { domain: { x: { kind: 'interval' as const, start: 4, end: 4 } } },
        };

        expect(interaction.handle!(event, context)).toBeNull();
    });

    it('reports long press and highlights on double activation', () => {
        const target = {
            visual: { kind: 'mark' as const, role: 'point' },
            elements: [{ value: { category: 'A' } }],
        };
        expect(longPress({ holdMs: 250 }).eventSource).toMatchObject({ gesture: 'long-press', holdMs: 250 });
        expect(longPress().handle!(toCanvasInteractionEvent({
            type: 'semantic', source: 'element', phase: 'commit', target,
        }, longPressTrigger()), context)?.ops[0]).toMatchObject({
            op: 'set-style',
            targets: [{ visual: target.visual, elements: target.elements }],
            value: { state: 'emphasized' },
        });
        expect(doubleActivate().handle!(toCanvasInteractionEvent({
            type: 'semantic', source: 'element', phase: 'commit', target,
        }, doubleActivateTrigger), context)?.ops[0]).toMatchObject({
            op: 'set-style',
            targets: [{ visual: target.visual, elements: target.elements }],
            value: { state: 'emphasized' },
        });
        expect(toCanvasInteractionEvent({
            type: 'semantic', source: 'element', phase: 'commit', target: null,
        }, longPressTrigger()).action).toBe('long-press-element');
        expect(toCanvasInteractionEvent({
            type: 'semantic', source: 'element', phase: 'commit', target: null,
        }, doubleActivateTrigger).action).toBe('double-activate-element');
    });

    it('lets the angular brush be edited once committed', () => {
        expect(brushAngle({ mode: 'stateful' }).eventSource).toMatchObject({
            regionGeometry: 'angular', mode: 'stateful',
        });
        expect(brushAngle().eventSource).toMatchObject({ mode: 'ephemeral' });
    });
});
