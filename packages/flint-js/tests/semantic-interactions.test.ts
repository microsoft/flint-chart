import { describe, expect, it } from 'vitest';
import { changeset, parse, View } from 'vega';
import { compile } from 'vega-lite';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { axisHighlight, brushAngle, brushX, brushZoom, clickAnnotate, clickHighlight, dragReorder, externalInteraction, inspect, legendToggle, navigate, select } from '../src/interactive/interactions';
import type { ClickHighlightOptions, RenderHit, SemanticElement, SemanticTarget } from '../src/interactive/interactions';
import {
    associateSemanticElementRenderKeys,
    MUTED_HOVER_FILL,
    MUTED_HOVER_STROKE,
    legendMatchedHits,
    semanticElementRenderKeys,
    sourceRecordsForRenderedRecords,
} from '../src/core/interaction-semantics';
import { areaChartDef, streamgraphDef } from '../src/vegalite/templates/area';
import {
    barChartDef,
    groupedBarChartDef,
    heatmapDef,
    histogramDef,
    pyramidChartDef,
    stackedBarChartDef,
} from '../src/vegalite/templates/bar';
import { barTableDef } from '../src/vegalite/templates/bar-table';
import { pieChartDef } from '../src/vegalite/templates/pie';
import { roseChartDef } from '../src/vegalite/templates/rose';
import { boxplotDef, rangedDotPlotDef, scatterPlotDef } from '../src/vegalite/templates/scatter';
import {
    addVegaLiteInteractions,
    collectVegaAxisTargets,
    injectVegaInteractionStore,
    injectVegaNavigationSignals,
    injectVegaReorderSignal,
} from '../src/vegalite/interactions/compile';
import { angularSectorPath } from '../src/interactive/geometry/angular';
import {
    arcIntersectsAngularSector,
    axisTargetIdentity,
    arcIntersectsRect,
    boundsIntersectRect,
    clientRectToLayoutRect,
    clientToPlotPoint,
    clientToRendererPoint,
    clientToLayoutPoint,
    facetPlotFrameAt,
    INTERACTION_KEY,
    INTERACTION_LEGEND_CHANNEL,
    INTERACTION_LEGEND_FIELD,
    INTERACTION_ROLE,
    indexInspectAcquisition,
    indexInspectHits,
    PATH_KEY_SUFFIX,
    physicalItemAt,
    plotToClientPoint,
    legendEntryItemAtPoint,
    legendSemanticTarget,
    legendTarget,
    normalizeVegaElementEvent,
    nearestItemByBounds,
    nearestInteractiveSceneItem,
    rendererPlotOrigin,
    renderHit,
    sceneItems,
    tolerantInspectHits,
    continuousLegendSegmentCount,
} from '../src/vegalite/interactions/hit-adapter';
import {
    AXIS_HOVER_STORE,
    HIDDEN_STORE,
    HOVER_STORE,
    INTERACTION_STORE,
    LEGEND_HIDDEN_STORE,
    LEGEND_HOVER_STORE,
    LEGEND_SELECTION_STORE,
    STYLE_SIGNAL,
} from '../src/vegalite/interactions/stores';
import {
    mergeContiguousSelectionBounds,
    selectionBoundarySegments,
} from '../src/vegalite/interactions/presentation/focus-overlay';
import {
    annotationBounds,
    annotationConnectionPoint,
    annotationPrimaryAnchor,
} from '../src/vegalite/interactions/presentation/annotation-overlay';
import { createVegaNavigationController } from '../src/vegalite/interactions/navigation-scale';
import { INTERACTION_PROVENANCE } from '../src/vegalite/interaction-provenance';
import { THEME_PRESETS } from '../src/core/theme/presets';
import { lineChartDef } from '../src/vegalite/templates/line';
import { bumpChartDef } from '../src/vegalite/templates/bump';
import { slopeChartDef } from '../src/vegalite/templates/slope';
import { enrichTargetWithSourceProvenance } from '../src/vegalite/interactions/runtime';
import { regressionDef } from '../src/vegalite/templates/scatter';
import { mapDef, choroplethDef } from '../src/vegalite/templates/map';
import { densityPlotDef } from '../src/vegalite/templates/density';
import { ecdfPlotDef } from '../src/vegalite/templates/ecdf';
import { vlCalendarHeatmapDef } from '../src/vegalite/templates/calendar';
import { sparklineDef } from '../src/vegalite/templates/sparkline';
import { violinPlotDef } from '../src/vegalite/templates/violin';
import { waterfallChartDef } from '../src/vegalite/templates/waterfall';
import { bulletChartDef } from '../src/vegalite/templates/bullet';
import { kpiCardDef } from '../src/vegalite/templates/kpi-card';
import { radarChartDef } from '../src/vegalite/templates/radar';
import { createLegendToggleInteraction } from '../src/interactive/presets/legend-toggle';
import {
    resolveLegendPresentationTarget,
    resolveRetainedLegendPresentationTarget,
    resolveRetainedLegendPresentationTargets,
    resolvedLegendInteractionTarget,
} from '../src/vegalite/interactions/runtime';

const clickMark = (options: Omit<ClickHighlightOptions, 'targets'> = {}) =>
    clickHighlight({ ...options, targets: ['mark'] });

function annotationUpdate(
    element: SemanticElement,
    visual: SemanticTarget['visual'] = { kind: 'mark', role: 'test' },
) {
    return {
        id: 'test-annotation',
        ops: [{
            op: 'set-annotation' as const,
            target: { visual, elements: [element] },
            value: {},
        }],
    };
}

function instrument(spec: Record<string, any>, interactions = [clickMark()]) {
    const plan = addVegaLiteInteractions(spec, interactions);
    const compiled = compile(spec as any).spec as Record<string, any>;
    if (plan) injectVegaInteractionStore(compiled, plan);
    return { plan, compiled };
}

function allSceneItems(view: View): any[] {
    const items: any[] = [];
    const visit = (item: any): void => {
        if (!item) return;
        if (item.mark) items.push(item);
        if (Array.isArray(item.items)) item.items.forEach(visit);
    };
    visit((view.scenegraph() as any).root);
    return items;
}

function rootSceneBounds(view: View, target: any) {
    let result: { x1: number; y1: number; x2: number; y2: number } | undefined;
    const visit = (item: any, offsetX = 0, offsetY = 0): void => {
        if (!item || result) return;
        if (item === target && item.bounds) {
            result = {
                x1: item.bounds.x1 + offsetX, y1: item.bounds.y1 + offsetY,
                x2: item.bounds.x2 + offsetX, y2: item.bounds.y2 + offsetY,
            };
            return;
        }
        const isGroup = item.mark?.marktype === 'group';
        const nextX = offsetX + (isGroup && typeof item.x === 'number' ? item.x : 0);
        const nextY = offsetY + (isGroup && typeof item.y === 'number' ? item.y : 0);
        item.items?.forEach((child: any) => visit(child, nextX, nextY));
    };
    visit((view.scenegraph() as any).root);
    return result;
}

describe('Vega-Lite semantic interactions', () => {
    it('keeps transformed values separate from source-record provenance', () => {
        const sourceRecords = [
            { OS: 'Android', Share: 71 },
            { OS: 'iOS', Share: 29 },
        ];
        const rendered = [{ OS: 'Android', Share: 71, Share_start: 0, Share_end: 71 }];

        expect(sourceRecordsForRenderedRecords(rendered, sourceRecords, ['OS', 'Share']))
            .toEqual([{ OS: 'Android', Share: 71 }]);
        expect(sourceRecordsForRenderedRecords(
            [{ Region: 'West', Sales: 300 }],
            [
                { Region: 'West', Sales: 100 },
                { Region: 'West', Sales: 200 },
                { Region: 'East', Sales: 50 },
            ],
            ['Region'],
        )).toEqual([
            { Region: 'West', Sales: 100 },
            { Region: 'West', Sales: 200 },
        ]);
        expect(sourceRecordsForRenderedRecords(
            [{ Games: Date.UTC(2012, 0, 1), Country: 'China', Rank: 2 }],
            [
                { Games: 2012, Country: 'China', Rank: 2 },
                { Games: 2016, Country: 'China', Rank: 3 },
            ],
            ['Games', 'Country', 'Rank'],
            ['Games'],
        )).toEqual([{ Games: 2012, Country: 'China', Rank: 2 }]);
    });

    it('resolves a histogram bin to its range, count, and contributing records', () => {
        const semantics = histogramDef.semanticInteractions!({
            resolvedEncodings: { x: { field: 'Duration', type: 'quantitative' } },
        });
        const hit = {
            datum: {
                [INTERACTION_KEY]: '3|3.5',
                __bin_start: 3,
                __bin_end: 3.5,
            },
            source: 'mark' as const,
        };
        const target = semantics.resolve(
            { gesture: 'hover', role: 'mark', hits: [hit] },
            { allHits: [hit], keyField: INTERACTION_KEY },
        );
        const enriched = enrichTargetWithSourceProvenance(target, {
            sourceRecords: [{ Duration: 2.9 }, { Duration: 3.1 }, { Duration: 3.4 }, { Duration: 3.5 }],
            provenanceFields: [],
            temporalProvenanceFields: [],
            rangeProvenance: [{ field: 'Duration', startField: '__bin_start', endField: '__bin_end' }],
        });

        expect(enriched?.elements[0]).toEqual({
            value: { field: 'Duration', range: { start: 3, end: 3.5 }, count: 2 },
            records: [{ Duration: 3.1 }, { Duration: 3.4 }],
        });
        expect(semanticElementRenderKeys(target!.elements[0])).toEqual(['3|3.5']);
        expect(semanticElementRenderKeys(enriched!.elements[0])).toEqual(['3|3.5']);
        const update = semantics.presentUpdate!(
            annotationUpdate(enriched!.elements[0], { kind: 'mark', role: 'mark' }),
            { chartType: 'Histogram', selected: [] },
        );
        expect(update.ops[0]).toMatchObject({
            value: { text: '2' },
        });
        expect((update.ops[0] as any).value.candidates[0]).toEqual({
            connection: 'value-end', valueAxis: 'y', priority: 0,
        });
    });

    it('combines color contrast and outlines for Boxplot hover', () => {
        const semantics = boxplotDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Species', type: 'nominal' },
                y: { field: 'Body mass', type: 'quantitative' },
            },
        });

        expect(semantics.renderHoverStyles).toEqual({
            rect: { opacity: 'contrast', stroke: MUTED_HOVER_STROKE, strokeWidth: 2 },
            rule: { opacity: 'contrast', stroke: MUTED_HOVER_STROKE, strokeWidth: 2 },
            symbol: { opacity: 'contrast', stroke: MUTED_HOVER_STROKE, strokeWidth: 2 },
        });
    });

    it('presents a Boxplot annotation from its computed summary', () => {
        const semantics = boxplotDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Species', type: 'nominal' },
                y: { field: 'Body mass', type: 'quantitative' },
            },
        });
        const element = {
            value: {
                Species: 'Gentoo',
                lower_box_Body_mass: 4700,
                mid_box_Body_mass: 5000,
                upper_box_Body_mass: 5400,
            },
        };

        const update = semantics.presentUpdate!(
            annotationUpdate(element, { kind: 'mark', role: 'distribution' }),
            { chartType: 'Boxplot', selected: [] },
        );
        expect(update.ops[0]).toMatchObject({
            value: {
                text: 'Median: 5,000\nIQR: 4,700 → 5,400',
            },
        });
        expect((update.ops[0] as any).value.candidates[0]).toEqual({ connection: 'center', priority: 0 });
    });

    it('preserves source provenance through an assembled histogram plan', async () => {
        const sourceRecords = [1.7, 1.9, 2.1, 2.4, 3.1, 3.4].map((duration) => ({
            'Duration (min)': duration,
        }));
        const spec = assembleVegaLite({
            data: { values: sourceRecords },
            semantic_types: { 'Duration (min)': 'Quantity' },
            chart_spec: { chartType: 'Histogram', encodings: { x: 'Duration (min)' } },
        } as never) as any;
        const { plan, compiled } = instrument(spec, [inspect({ mode: 'x' })]);
        if (!plan?.resolve) throw new Error('Expected an instrumented histogram plan');
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const bar = sceneItems(view).find((item) => item.mark.marktype === 'rect' && item.datum[INTERACTION_KEY]);
        const hit = renderHit(bar);
        if (!hit) throw new Error('Expected an interactive histogram bar');
        expect(plan.sourceRecords).toHaveLength(sourceRecords.length);
        expect(hit.datum).toMatchObject({
            __bin_start: expect.any(Number),
            __bin_end: expect.any(Number),
        });
        const target = plan.resolve(
            { gesture: 'hover', role: 'mark', hits: [hit] },
            { allHits: [hit], keyField: INTERACTION_KEY },
        );
        expect(target?.elements[0].records?.[0]).toMatchObject({
            __bin_start: bar.datum.__bin_start,
            __bin_end: bar.datum.__bin_end,
        });
        const enriched = enrichTargetWithSourceProvenance(target, plan);
        const start = bar.datum.__bin_start as number;
        const end = bar.datum.__bin_end as number;
        const expectedRecords = sourceRecords
            .filter((record) => record['Duration (min)'] >= start && record['Duration (min)'] < end)
            .map((record) => ({ 'Duration (min)': record['Duration (min)'] }));

        expect(enriched?.elements[0].value).toEqual({
            field: 'Duration (min)', range: { start, end }, count: expectedRecords.length,
        });
        expect(enriched?.elements[0].records).toEqual(expectedRecords);
        view.finalize();
    });

    it('inspect-x chooses one stacked category and returns all of its segments', async () => {
        const spec = assembleVegaLite({
            data: { values: [
                { Region: 'West', Segment: 'Consumer', Value: 10 },
                { Region: 'West', Segment: 'Corporate', Value: 12 },
                { Region: 'East', Segment: 'Consumer', Value: 8 },
                { Region: 'East', Segment: 'Corporate', Value: 9 },
            ] },
            semantic_types: { Region: 'Category', Segment: 'Category', Value: 'Quantity' },
            chart_spec: {
                chartType: 'Stacked Bar Chart',
                encodings: { x: 'Region', y: 'Value', color: 'Segment' },
            },
        } as never) as any;
        const { compiled } = instrument(spec, [inspect({ mode: 'x' })]);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const bars = sceneItems(view).filter((item) => item.mark.marktype === 'rect' && item.datum[INTERACTION_KEY]);
        const west = bars.filter((item) => item.datum.Region === 'West');
        const east = bars.filter((item) => item.datum.Region === 'East');
        const westEdge = Math.max(...west.map((item) => item.bounds.x2));
        const eastEdge = Math.min(...east.map((item) => item.bounds.x1));
        const gapPoint = { x: westEdge + (eastEdge - westEdge) / 3, y: 0 };
        const hits = tolerantInspectHits(
            bars, gapPoint, 'x', { x: '=' }, { x: Math.abs(eastEdge - westEdge), y: 0 },
        );

        expect(new Set(hits.map((hit) => hit.datum.Region))).toEqual(new Set(['West']));
        expect(new Set(hits.map((hit) => hit.datum.Segment))).toEqual(new Set(['Consumer', 'Corporate']));
        view.finalize();
    });

    it('index inspection can keep all or one named series', () => {
        const item = (key: string, series: string, y: number) => ({
            bounds: { x1: 48, x2: 52, y1: y - 2, y2: y + 2 },
            datum: { [INTERACTION_KEY]: key, Series: series },
            mark: { marktype: 'symbol', role: 'mark' },
        });
        const items = [item('alpha', 'Alpha', 20), item('beta', 'Beta', 80)];
        const point = { x: 50, y: 76 };
        expect(indexInspectHits(items, point, 'x', { show: 'all', seriesBy: 'Series' }))
            .toHaveLength(2);
        expect(indexInspectHits(items, point, 'x', {
            show: { series: 'Alpha' }, seriesBy: 'Series',
        })[0].datum.Series).toBe('Alpha');
    });

    it('interpolates a smooth continuous value-axis rule between line observations', () => {
        const segment = {
            bounds: { x1: 10, x2: 90, y1: 20, y2: 80 },
            datum: { [INTERACTION_KEY]: 'alpha', Index: 0, Series: 'Alpha' },
            endDatum: { [INTERACTION_KEY]: 'alpha', Index: 10, Series: 'Alpha' },
            interactionGeometry: {
                kind: 'segment',
                points: [{ x: 10, y: 80 }, { x: 90, y: 20 }],
            },
            mark: { marktype: 'line', role: 'mark', items: [] },
        };
        const acquisition = indexInspectAcquisition(
            [segment], { x: 50, y: 40 }, 'x', { show: 'all', seriesBy: 'Series' }, true,
        );

        expect(acquisition.coordinate).toBe(50);
        expect(acquisition.valueCoordinates).toEqual([50]);
        expect(indexInspectAcquisition(
            [segment], { x: 90, y: 20 }, 'x', { show: 'all', seriesBy: 'Series' }, true,
        )).toMatchObject({ coordinate: 90, valueCoordinates: [20], hits: [expect.any(Object)] });
    });

    it('snaps a discrete index to supplied band-scale centers', () => {
        const segment = {
            bounds: { x1: 10, x2: 90, y1: 20, y2: 80 },
            datum: { [INTERACTION_KEY]: 'alpha', Series: 'Alpha' },
            endDatum: { [INTERACTION_KEY]: 'alpha', Series: 'Alpha' },
            interactionGeometry: {
                kind: 'segment',
                points: [{ x: 10, y: 80 }, { x: 90, y: 20 }],
            },
            mark: { marktype: 'line', role: 'mark', items: [] },
        };
        const acquisition = indexInspectAcquisition(
            [segment], { x: 38, y: 50 }, 'x', { show: 'all' }, false, [20, 60],
        );

        expect(acquisition.coordinate).toBe(20);
    });

    it('assists nearby continuous point indices without acquiring distant points', () => {
        const pointMark = {
            bounds: { x1: 48, x2: 52, y1: 28, y2: 32 },
            datum: { [INTERACTION_KEY]: 'alpha', Index: 50, Value: 30 },
            mark: { marktype: 'symbol', role: 'mark' },
        };
        const nearby = indexInspectAcquisition(
            [pointMark], { x: 57, y: 80 }, 'x', { show: 'all' }, true, undefined, 5,
        );
        const distant = indexInspectAcquisition(
            [pointMark], { x: 58, y: 80 }, 'x', { show: 'all' }, true, undefined, 5,
        );

        expect(nearby).toMatchObject({ coordinate: 50, valueCoordinates: [30], hits: [expect.any(Object)] });
        expect(distant).toEqual({ coordinate: 58, valueCoordinates: [], hits: [] });
    });
    it('keeps path fallback connections anchored to the selected segment midpoint', () => {
        const item = {
            bounds: { x1: 56, y1: 52, x2: 196, y2: 220 },
            interactionGeometry: {
                kind: 'segment',
                points: [{ x: 56, y: 220 }, { x: 196, y: 52 }],
                annotationPoints: [{ x: 56, y: 220 }, { x: 196, y: 52 }],
            },
        };
        const plotCenter = { x: 126, y: 136 };

        const midpoint = annotationConnectionPoint(item, 'segment-midpoint', [item], plotCenter);
        const rightFallback = annotationConnectionPoint(item, 'right', [item], plotCenter);

        expect(midpoint.point).toEqual({ x: 126, y: 136 });
        expect(rightFallback.point).toEqual(midpoint.point);
        expect(rightFallback.preferredAngle).toBe(0);
        expect(annotationPrimaryAnchor(
            item,
            { left: 56, top: 52, width: 140, height: 168 },
            { left: 220, top: 120, width: 30, height: 20 },
            'right',
            rightFallback.point,
        )).toEqual(midpoint.point);
    });

    it('uses a borderless spotlight for area hover', () => {
        const hoverStyle = (resolvedEncodings: Record<string, any>) =>
            areaChartDef.semanticInteractions!({ resolvedEncodings }).renderHoverStyles?.area;

        expect(hoverStyle({})).toEqual({ opacity: 'spotlight' });
        expect(hoverStyle({ opacity: { field: 'confidence', type: 'quantitative' } }))
            .toEqual({ opacity: 'spotlight' });
    });

    it('compiles navigation capabilities into resettable Vega domain signals', () => {
        const spec = assembleVegaLite({
            chart_spec: {
                chartType: 'Scatter Plot',
                encodings: { x: { field: 'x' }, y: { field: 'y' } },
            },
            semantic_types: { x: 'Number', y: 'Number' },
            data: { values: [{ x: 1, y: 2 }, { x: 3, y: 4 }] },
        }) as any;
        const plan = addVegaLiteInteractions(spec, [navigate()]);
        expect(plan?.navigationChannels).toEqual(['x', 'y']);
        const compiled = compile(spec).spec as any;
        const axes = injectVegaNavigationSignals(compiled, plan?.navigationChannels);
        expect(axes).toMatchObject({
            x: { scale: 'x', signal: '__flint_navigation_x_domain', type: 'linear' },
            y: { scale: 'y', signal: '__flint_navigation_y_domain', type: 'linear' },
        });
        expect(compiled.scales.find((scale: any) => scale.name === 'x').domainRaw)
            .toEqual({ signal: '__flint_navigation_x_domain' });
        expect(compiled.signals).toEqual(expect.arrayContaining([
            { name: '__flint_navigation_x_domain', value: null },
            { name: '__flint_navigation_y_domain', value: null },
        ]));
        expect(compiled.marks.filter((mark: any) => mark.type === 'symbol'))
            .toEqual(expect.arrayContaining([expect.objectContaining({ clip: true })]));
    });

    it('leaves reorder unwired when no reorder interaction is configured', () => {
        const spec = assembleVegaLite({
            chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'category' }, y: { field: 'value' } } },
            semantic_types: { category: 'Category', value: 'Number' },
            data: { values: [{ category: 'A', value: 1 }, { category: 'B', value: 2 }] },
        }) as any;

        const plan = addVegaLiteInteractions(spec, [clickMark()])!;

        expect(plan.reorderAxis).toBeUndefined();
        expect(plan.reorderAxes).toEqual([]);
    });

    it('resolves an axis scale renamed by a composed spec', () => {
        const composed = {
            scales: [{ name: 'concat_0_x', type: 'band' }, { name: 'concat_0_y', type: 'linear' }],
        } as any;

        expect(injectVegaReorderSignal(composed, { axis: 'x', field: 'category' })).toEqual({
            axis: 'x', field: 'category', scale: 'concat_0_x', signal: '__flint_reorder_x_domain',
        });
        expect(composed.scales[0].domainRaw).toEqual({ signal: '__flint_reorder_x_domain' });
        expect(injectVegaNavigationSignals(composed, ['y']).y)
            .toEqual({ scale: 'concat_0_y', signal: '__flint_navigation_y_domain', type: 'linear' });

        // An ambiguous multi-panel concat must not silently pick a panel.
        expect(() => injectVegaReorderSignal(
            { scales: [{ name: 'concat_0_x', type: 'band' }, { name: 'concat_1_x', type: 'band' }] } as any,
            { axis: 'x', field: 'category' },
        )).toThrow(/discrete "x" scale/);
    });

    it.each([
        ['vertical', { x: { field: 'category' }, y: { field: 'value' } }, 'x'],
        ['horizontal', { x: { field: 'value' }, y: { field: 'category' } }, 'y'],
    ] as const)('compiles %s bar category reorder into a discrete domain signal', (_name, encodings, axis) => {
        const spec = assembleVegaLite({
            chart_spec: { chartType: 'Bar Chart', encodings },
            semantic_types: { category: 'Category', value: 'Number' },
            data: { values: [{ category: 'A', value: 1 }, { category: 'B', value: 2 }] },
        }) as any;
        const plan = addVegaLiteInteractions(spec, [dragReorder()])!;
        expect(plan.reorderAxis).toMatchObject({ axis, field: 'category' });

        const compiled = compile(spec).spec as any;
        const reorderAxis = injectVegaReorderSignal(compiled, plan.reorderAxis);
        expect(reorderAxis).toEqual({
            axis, field: 'category', scale: axis, signal: `__flint_reorder_${axis}_domain`,
        });
        expect(compiled.scales.find((scale: any) => scale.name === axis).domainRaw)
            .toEqual({ signal: `__flint_reorder_${axis}_domain` });
    });

    it('rejects drag reorder for charts without one template-declared category scale', () => {
        expect(() => addVegaLiteInteractions({ mark: 'bar' }, [dragReorder()]))
            .toThrow('requires a chart with a reorderable category axis');
        const scatter = assembleVegaLite({
            chart_spec: {
                chartType: 'Scatter Plot',
                encodings: { x: { field: 'x' }, y: { field: 'y' } },
            },
            semantic_types: { x: 'Number', y: 'Number' },
            data: { values: [{ x: 1, y: 2 }] },
        }) as any;
        expect(() => addVegaLiteInteractions(scatter, [dragReorder()]))
            .toThrow('requires a chart with a reorderable category axis');

        const facetedSemantics = barChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'category', type: 'nominal' },
                y: { field: 'value', type: 'quantitative' },
                column: { field: 'region', type: 'nominal' },
            },
        });
        expect(facetedSemantics.reorderAxis).toBeUndefined();
    });

    it.each(['quantitative', 'temporal'] as const)('rejects %s Bar category reorder semantics', (type) => {
        const semantics = barChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'category', type },
                y: { field: 'value', type: 'quantitative' },
            },
        });
        expect(semantics.reorderAxis).toBeUndefined();
        expect(semantics.reorderAxes).toBeUndefined();
    });

    it('declares and injects independent categorical Heatmap row and column reorder axes', () => {
        const spec = assembleVegaLite({
            chart_spec: {
                chartType: 'Heatmap',
                encodings: { x: { field: 'column' }, y: { field: 'row' }, color: { field: 'value' } },
            },
            semantic_types: { column: 'Category', row: 'Category', value: 'Number' },
            data: { values: [{ column: 'A', row: 'R1', value: 1 }] },
        }) as any;
        const plan = addVegaLiteInteractions(spec, [dragReorder()])!;
        expect(plan.reorderAxes).toEqual([
            { axis: 'x', field: 'column', scale: '', signal: '' },
            { axis: 'y', field: 'row', scale: '', signal: '' },
        ]);

        const compiled = compile(spec).spec as any;
        const axes = plan.reorderAxes!.map((axis) => injectVegaReorderSignal(compiled, axis));
        expect(axes).toEqual([
            { axis: 'x', field: 'column', scale: 'x', signal: '__flint_reorder_x_domain' },
            { axis: 'y', field: 'row', scale: 'y', signal: '__flint_reorder_y_domain' },
        ]);
        expect(compiled.scales.find((scale: any) => scale.name === 'x').domainRaw)
            .toEqual({ signal: '__flint_reorder_x_domain' });
        expect(compiled.scales.find((scale: any) => scale.name === 'y').domainRaw)
            .toEqual({ signal: '__flint_reorder_y_domain' });
    });

    it.each(['Boxplot', 'Line Chart'])('declares authored nominal axes as reorderable for %s', (chartType) => {
        const spec = assembleVegaLite({
            chart_spec: {
                chartType,
                encodings: { x: { field: 'category' }, y: { field: 'value' } },
            },
            semantic_types: { category: 'Category', value: 'Number' },
            data: { values: [
                { category: 'A', value: 1 },
                { category: 'B', value: 2 },
            ] },
        }) as any;
        expect(spec._interactionSemantics.reorderAxes).toEqual([{ axis: 'x', field: 'category' }]);
        const plan = addVegaLiteInteractions(spec, [dragReorder()])!;
        expect(plan.reorderAxes).toEqual([{ axis: 'x', field: 'category', scale: '', signal: '' }]);
    });

    it('does not declare reorder for a path-only Range Area category axis', () => {
        const spec = assembleVegaLite({
            chart_spec: {
                chartType: 'Range Area Chart',
                encodings: {
                    x: { field: 'month' },
                    y: { field: 'low' },
                    y2: { field: 'high' },
                },
            },
            semantic_types: { month: 'Category', low: 'Number', high: 'Number' },
            data: { values: [{ month: 'Jan', low: 1, high: 3 }, { month: 'Feb', low: 2, high: 4 }] },
        }) as any;
        expect(spec._interactionSemantics.reorderAxes).toEqual([]);
        expect(() => addVegaLiteInteractions(spec, [dragReorder()]))
            .toThrow('requires a chart with a reorderable category axis');
    });

    it('distinguishes dumbbell connectors from stationary Slope stems during reorder preview', () => {
        const input = (chartType: string) => assembleVegaLite({
            chart_spec: {
                chartType,
                encodings: {
                    x: { field: 'period' },
                    y: { field: 'value' },
                    color: { field: 'series' },
                },
            },
            semantic_types: { period: 'Category', value: 'Number', series: 'Category' },
            data: { values: [
                { period: 'A', value: 1, series: 'one' },
                { period: 'B', value: 2, series: 'one' },
            ] },
        }) as any;

        expect(input('Ranged Dot Plot')._interactionSemantics.reorderAxes)
            .toEqual([{ axis: 'x', field: 'period', includeConnectiveMarks: true }]);
        expect(input('Slope Chart')._interactionSemantics.reorderAxes)
            .toEqual([{ axis: 'x', field: 'period' }]);
    });

    it('moves only Waterfall bars during reorder preview', () => {
        const spec = assembleVegaLite({
            chart_spec: {
                chartType: 'Waterfall Chart',
                encodings: { x: { field: 'step' }, y: { field: 'amount' } },
            },
            semantic_types: { step: 'Category', amount: 'Number' },
            data: { values: [
                { step: 'Revenue', amount: 100 },
                { step: 'Costs', amount: -40 },
            ] },
        }) as any;

        expect(spec._interactionSemantics.reorderAxes).toEqual([
            { axis: 'x', field: 'step', markTypes: ['rect'] },
        ]);
    });

    it('rejects built-in interactions when a chart has no semantic contract', () => {
        expect(() => addVegaLiteInteractions({ mark: 'line' }, [clickMark()]))
            .toThrow('requires chart interaction semantics');
        expect(() => addVegaLiteInteractions({
            mark: 'line',
            _interactionSemantics: { fields: [], selectableMarks: [], navigationAxes: ['x'] },
        }, [clickMark()])).toThrow('requires chart element semantics');
    });

    it('instruments semantic targets for external interactions without adding canvas gestures', () => {
        const spec = assembleVegaLite({
            chart_spec: {
                chartType: 'Bar Chart',
                encodings: { x: { field: 'category' }, y: { field: 'value' } },
            },
            semantic_types: { category: 'Category', value: 'Number' },
            data: { values: [{ category: 'A', value: 2 }] },
        }) as any;
        const plan = addVegaLiteInteractions(spec, [externalInteraction<{ category: string }>({
            id: 'category-picker',
            handle: ({ category }) => ({
                id: 'category-picker',
                ops: [{
                    op: 'set-style',
                    targets: [{ select: { key: { category } } }],
                    value: { state: 'emphasized' },
                }],
            }),
        })]);

        expect(plan).not.toBeNull();
        expect(spec.transform).toEqual(expect.arrayContaining([
            expect.objectContaining({ as: INTERACTION_KEY }),
        ]));
    });

    it('treats a Bump legend series as one target owning its line and points', async () => {
        const spec = assembleVegaLite({
            data: { values: [
                { Games: 2012, Country: 'China', Rank: 2 },
                { Games: 2016, Country: 'China', Rank: 3 },
                { Games: 2020, Country: 'China', Rank: 2 },
                { Games: 2024, Country: 'China', Rank: 2 },
                { Games: 2012, Country: 'Japan', Rank: 6 },
                { Games: 2024, Country: 'Japan', Rank: 3 },
            ] },
            semantic_types: { Games: 'Year', Country: 'Country', Rank: 'Rank' },
            chart_spec: {
                chartType: 'Bump Chart',
                encodings: { x: 'Games', y: 'Rank', color: 'Country' },
            },
            theme_spec: 'nyt',
        } as never) as any;
        const { plan, compiled } = instrument(spec, [clickMark()]);
        if (!plan?.resolve) throw new Error('Expected an instrumented Bump plan');
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const hits = sceneItems(view).map(renderHit).filter((hit): hit is RenderHit => hit !== null);
        const legend = {
            channel: 'color', field: 'Country',
            domain: { kind: 'value' as const, value: 'China' },
        };
        const resolved = enrichTargetWithSourceProvenance(plan.resolve({
            gesture: 'click', role: 'legend-item', hits: [], legend,
        }, { allHits: hits, keyField: INTERACTION_KEY, seriesField: 'Country' }), plan);
        const target = resolvedLegendInteractionTarget(legend, resolved);
        const keys = semanticElementRenderKeys(target.elements[0]);

        expect(target.elements).toHaveLength(1);
        expect(target.elements[0].records).toHaveLength(4);
        const renderedLineKeys = hits
            .filter((hit) => hit.markType === 'line' && hit.datum.Country === 'China')
            .map((hit) => hit.datum[INTERACTION_KEY]);
        expect(keys.filter((key) => key.endsWith(PATH_KEY_SUFFIX))).toEqual(renderedLineKeys);
        expect(keys.filter((key) => !key.endsWith(PATH_KEY_SUFFIX))).toHaveLength(4);
        view.finalize();
    });

    it('instruments semantic updates without passing external definitions to the renderer', () => {
        const spec = assembleVegaLite({
            chart_spec: {
                chartType: 'Bar Chart',
                encodings: { x: { field: 'category' }, y: { field: 'value' } },
            },
            semantic_types: { category: 'Category', value: 'Number' },
            data: { values: [{ category: 'A', value: 2 }] },
        }) as any;

        const plan = addVegaLiteInteractions(spec, [], true);
        expect(plan).not.toBeNull();
        expect(plan?.resolve).toBeTypeOf('function');
        expect(plan?.semanticStores).toBe(true);
        expect(spec.transform).toEqual(expect.arrayContaining([
            expect.objectContaining({ as: INTERACTION_KEY }),
        ]));
    });

    it('clips every generated layer when navigation is combined with semantic interaction', () => {
        const spec = assembleVegaLite({
            chart_spec: {
                chartType: 'Line Chart',
                encodings: { x: { field: 'x' }, y: { field: 'y' } },
                chartProperties: { showPoints: true },
            },
            semantic_types: { x: 'Date', y: 'Number' },
            data: { values: [{ x: '2025-01-01', y: 2 }, { x: '2025-02-01', y: 4 }] },
        }) as any;
        addVegaLiteInteractions(spec, [navigate({ pan: false }), clickMark()]);

        const marks = (compile(spec).spec as any).marks;
        const dataMarks = marks.filter((mark: any) => ['line', 'symbol'].includes(mark.type));
        expect(dataMarks)
            .toEqual(expect.arrayContaining([expect.objectContaining({ clip: true })]));
        expect(dataMarks.map((mark: any) => mark.type)).toEqual(expect.arrayContaining(['line', 'symbol']));
        expect(dataMarks).toSatisfy((compiledMarks: any[]) => (
            compiledMarks.every((mark) => mark.clip === true)
        ));
    });

    it('zooms and resets an actual Vega scale through its domain signal', async () => {
        const spec = assembleVegaLite({
            chart_spec: {
                chartType: 'Scatter Plot',
                encodings: { x: { field: 'x' }, y: { field: 'y' } },
            },
            semantic_types: { x: 'Number', y: 'Number' },
            data: { values: [{ x: 0, y: 0 }, { x: 100, y: 100 }] },
        }) as any;
        const plan = addVegaLiteInteractions(spec, [navigate()])!;
        const compiled = compile(spec).spec as any;
        const axes = injectVegaNavigationSignals(compiled, plan.navigationChannels);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const initial = view.scale('x').domain().map(Number);
        const controller = createVegaNavigationController(view, axes);

        const guard = { minVisibleFraction: 0.02, maxVisibleFraction: 1, overscrollFraction: 0 };
        const zoom = controller.resolve({
            type: 'navigation', phase: 'commit', operation: 'zoom', axes: 'x',
            factor: 2, anchor: { x: 0.5, y: 0.5 },
        }, guard);
        expect(zoom).not.toBeNull();
        controller.apply(zoom!);
        await view.runAsync();
        const zoomed = view.scale('x').domain().map(Number);
        expect(zoomed[1] - zoomed[0]).toBeCloseTo((initial[1] - initial[0]) / 2);

        const reset = controller.resolve({
            type: 'navigation', phase: 'commit', operation: 'reset', axes: 'x',
        }, guard);
        controller.apply(reset!);
        await view.runAsync();
        expect(view.scale('x').domain().map(Number)).toEqual(initial);
        view.finalize();
    });

    it('declares proportional line focus and continuous-color region boundaries', () => {
        expect(lineChartDef.semanticInteractions!({
            resolvedEncodings: { x: { field: 'Year', type: 'ordinal' }, y: { field: 'Value', type: 'quantitative' } },
        }).renderSelectionStyles).toEqual({ line: { strokeWidthMultiplier: 1.2 } });

        expect(heatmapDef.semanticInteractions!({
            resolvedEncodings: { x: { field: 'Year', type: 'ordinal' }, y: { field: 'Country', type: 'nominal' }, color: { field: 'Value', type: 'quantitative' } },
        }).renderSelectionStyles).toEqual({ rect: { boundary: 'contiguous-region' } });
        expect(heatmapDef.semanticInteractions!({
            resolvedEncodings: { x: { field: 'X', type: 'ordinal' }, y: { field: 'Y', type: 'nominal' }, color: { field: 'Group', type: 'nominal' } },
        }).renderSelectionStyles).toBeUndefined();
    });

    it('resolves continuous-color selection boundaries from the active theme', () => {
        const makeSpec = (theme_spec: any) => assembleVegaLite({
            data: { values: [
                { Year: '2020', Country: 'A', Value: 10 },
                { Year: '2021', Country: 'A', Value: 14 },
            ] },
            semantic_types: { Year: 'Category', Country: 'Category', Value: 'Quantity' },
            chart_spec: {
                chartType: 'Heatmap',
                encodings: { x: 'Year', y: 'Country', color: 'Value' },
            },
            theme_spec,
        } as any) as any;

        expect(makeSpec('economist')._interactionSemantics.selectionBoundary).toEqual({
            color: '#e3120b',
            width: 1.25,
            opacity: 0.68,
            haloColor: '#ffffff',
            haloWidth: 2.5,
            haloOpacity: 0.35,
        });
        expect(makeSpec({
            extends: 'economist',
            interaction: {
                selectionBoundary: {
                    color: '#b54a20',
                    width: 2,
                    opacity: 0.9,
                    haloColor: '#fffaf2',
                    haloWidth: 0,
                    haloOpacity: 0.7,
                },
            },
        })._interactionSemantics.selectionBoundary).toEqual({
            color: '#b54a20',
            width: 2,
            opacity: 0.9,
            haloColor: '#fffaf2',
            haloWidth: 0,
            haloOpacity: 0.7,
        });
    });

    it('merges selected heatmap cells by contiguous region without bridging gaps', () => {
        expect(mergeContiguousSelectionBounds([
            { x1: 0, y1: 0, x2: 10, y2: 10 },
            { x1: 11, y1: 0, x2: 21, y2: 10 },
            { x1: 0, y1: 11, x2: 10, y2: 21 },
            { x1: 0, y1: 30, x2: 10, y2: 40 },
        ])).toEqual([
            { x1: 0, y1: 0, x2: 21, y2: 21 },
            { x1: 0, y1: 30, x2: 10, y2: 40 },
        ]);
    });

    it('traces an irregular heatmap selection without boxing in unselected cells', () => {
        const segments = selectionBoundarySegments([
            { x1: 0, y1: 0, x2: 10, y2: 10 },
            { x1: 10, y1: 0, x2: 20, y2: 10 },
            { x1: 0, y1: 10, x2: 10, y2: 20 },
        ]);

        expect(segments).toHaveLength(8);
        expect(segments).not.toContainEqual({ x1: 20, y1: 10, x2: 20, y2: 20 });
        expect(segments).toContainEqual({ x1: 10, y1: 10, x2: 10, y2: 20 });
        expect(segments).toContainEqual({ x1: 10, y1: 10, x2: 20, y2: 10 });
    });

    it('keeps themed line vertices filled when expanding them for interaction', () => {
        const spec = assembleVegaLite({
            data: {
                values: [
                    { Year: '2020', Country: 'A', Value: 10 },
                    { Year: '2021', Country: 'A', Value: 14 },
                    { Year: '2020', Country: 'B', Value: 13 },
                    { Year: '2021', Country: 'B', Value: 11 },
                ],
            },
            semantic_types: { Year: 'Category', Country: 'Category', Value: 'Quantity' },
            chart_spec: {
                chartType: 'Line Chart',
                encodings: { x: 'Year', y: 'Value', color: 'Country' },
                chartProperties: { showPoints: true },
            },
            theme_spec: THEME_PRESETS.economist.spec,
        } as any) as any;

        addVegaLiteInteractions(spec, [clickMark()]);
        const findPointMark = (node: any): any => {
            if (node.mark?.type === 'point') return node.mark;
            for (const property of ['layer', 'hconcat', 'vconcat', 'concat']) {
                for (const child of node[property] ?? []) {
                    const found = findPointMark(child);
                    if (found) return found;
                }
            }
            return undefined;
        };
        expect(findPointMark(spec)).toMatchObject({
            type: 'point',
            filled: true,
            stroke: '#ffffff',
        });
    });

    it('keeps concatenated-chart hover paint geometry invariant', () => {
        const renderHoverStyles = (definition: typeof pyramidChartDef) =>
            definition.semanticInteractions?.({ resolvedEncodings: {} }).renderHoverStyles;
        expect(renderHoverStyles(pyramidChartDef)).toEqual({ rect: { opacity: 'contrast' } });
        expect(renderHoverStyles(barTableDef)).toEqual({ rect: { opacity: 'contrast' } });
    });

    it('updates arc opacity in a composed Rose chart', async () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Direction'],
                categoryField: 'Direction',
                selectableMarks: ['arc'],
            },
            data: {
                values: [
                    { Direction: 'N', Speed: 12 },
                    { Direction: 'E', Speed: 20 },
                    { Direction: 'S', Speed: 8 },
                    { Direction: 'W', Speed: 16 },
                ],
            },
            encoding: {
                theta: { field: 'Direction', type: 'nominal', stack: true },
            },
            layer: [
                {
                    mark: { type: 'arc', stroke: 'white' },
                    encoding: {
                        radius: { field: 'Speed', type: 'quantitative', scale: { type: 'sqrt' } },
                        color: { field: 'Direction', type: 'nominal' },
                    },
                },
                {
                    mark: { type: 'text', radiusOffset: 15 },
                    encoding: { text: { field: 'Direction', type: 'nominal' } },
                },
            ],
        };
        const { compiled } = instrument(spec);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const before = sceneItems(view).filter((item) => item.mark.marktype === 'arc');
        const selectedKey = before[0]?.datum[INTERACTION_KEY];
        expect(selectedKey).toBeTypeOf('string');

        view.change(INTERACTION_STORE, changeset().insert([{ key: selectedKey }]));
        await view.runAsync();
        const opacities = sceneItems(view)
            .filter((item) => item.mark.marktype === 'arc')
            .map((item) => ({ key: item.datum[INTERACTION_KEY], opacity: item.opacity }));

        expect(opacities.filter((item) => item.opacity === 1).map((item) => item.key)).toEqual([selectedKey]);
        expect(opacities.filter((item) => item.key !== selectedKey).every((item) => item.opacity === 0.25)).toBe(true);
    });

    it('maps a synthesized Rose color legend back to its category field', () => {
        const spec = assembleVegaLite({
            data: {
                values: [
                    { Direction: 'N', Speed: 12 },
                    { Direction: 'E', Speed: 20 },
                ],
            },
            semantic_types: { Direction: 'Category', Speed: 'Quantity' },
            chart_spec: {
                chartType: 'Rose Chart',
                encodings: { x: { field: 'Direction' }, y: { field: 'Speed' } },
            },
        } as any) as any;

        expect(spec._interactionSemantics).toMatchObject({
            fields: ['Direction'],
            categoryField: 'Direction',
            legendFields: { color: 'Direction' },
        });
    });

    it('resolves a Rose category label to its label and all related arc segments', () => {
        const resolve = roseChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Month', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
                color: { field: 'Segment', type: 'nominal' },
            },
        }).resolve!;
        const label = {
            datum: { [INTERACTION_KEY]: 'Jan', Month: 'Jan', [INTERACTION_ROLE]: 'text-label' },
            source: 'mark' as const,
            markType: 'text',
            layerRole: 'text-label',
        };
        const janA = { datum: { [INTERACTION_KEY]: 'Jan|A', Month: 'Jan', Segment: 'A' }, source: 'mark' as const };
        const janB = { datum: { [INTERACTION_KEY]: 'Jan|B', Month: 'Jan', Segment: 'B' }, source: 'mark' as const };
        const febA = { datum: { [INTERACTION_KEY]: 'Feb|A', Month: 'Feb', Segment: 'A' }, source: 'mark' as const };

        const target = resolve(
            { gesture: 'click', role: 'text-label', hits: [label] },
            {
                allHits: [janA, janB, febA, label],
                keyField: INTERACTION_KEY,
                categoryField: 'Month',
                seriesField: 'Segment',
            },
        );

        expect(target?.visual).toEqual({ kind: 'mark', role: 'text-label' });
        expect(target?.elements.map((element) => semanticElementRenderKeys(element)[0])).toEqual([
            'Jan|A',
            'Jan|B',
            'Jan',
        ]);
    });

    it('resolves a stacked-area series-end label to the whole band', async () => {
        const rows = [1950, 1970, 1990, 2010, 2020].flatMap((Year, yearIndex) =>
            Object.entries({ Asia: 4641, Africa: 1361, Europe: 748, Americas: 1023, Oceania: 45 })
                .map(([Region, finalValue]) => ({
                    Year,
                    Region,
                    Population: Math.round(finalValue * (0.6 + yearIndex * 0.1)),
                })));
        const spec = assembleVegaLite({
            data: { values: rows },
            semantic_types: { Year: 'Year', Region: 'Category', Population: 'Quantity' },
            chart_spec: {
                chartType: 'Area Chart',
                encodings: { x: 'Year', y: 'Population', color: 'Region' },
                chartProperties: { stackMode: 'stack' },
            },
            theme_spec: {
                id: 'series-end-test',
                label: 'Series end test',
                ink: {
                    surface: { canvas: '#fff', plot: '#fff' },
                    text: { primary: '#111' },
                    series: { single: '#111', categorical: ['#011827', '#2251ff', '#00a9f4', '#00c7b1', '#9ca8b3'] },
                },
                legend: { show: 'always', placement: ['seriesEnd', 'right'] },
            },
        } as any) as any;
        const resolve = spec._interactionSemantics.resolve;
        const { compiled } = instrument(spec);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const scene = allSceneItems(view);
        const labelItem = scene.find((item) =>
            item.mark?.marktype === 'text' && item.datum?.Region === 'Africa'
            && item.datum?.[INTERACTION_ROLE] === 'text-label');
        const labelHit = renderHit(labelItem)!;
        const allHits = sceneItems(view).map(renderHit).filter(Boolean);
        const target = resolve({
            gesture: 'click', role: 'text-label', hits: [labelHit],
        }, {
            allHits,
            keyField: INTERACTION_KEY,
            categoryField: 'Year',
            seriesField: 'Region',
        });

        expect(labelHit.datum[INTERACTION_KEY]).toBe('Africa');
        expect(target?.visual).toEqual({ kind: 'path', role: 'text-label' });
        expect(target?.elements).toHaveLength(4);
        expect(target?.elements.every((element: SemanticElement) => element.value.Region === 'Africa')).toBe(true);
    });

    it('formats a Rose sector from its encoded category and value fields', () => {
        const semantics = roseChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Month', type: 'nominal' },
                y: { field: 'Rainfall (mm)', type: 'quantitative' },
            },
        });
        const element = {
            value: { [INTERACTION_KEY]: 'Jan' },
            records: [{
                Month: 'Jan',
                'Rainfall (mm)': 140,
                'Rainfall (mm)_start': 0,
                'Rainfall (mm)_end': 140,
            }],
        };
        const update = semantics.presentUpdate!(
            annotationUpdate(element, { kind: 'mark', role: 'polar-bar' }),
            { chartType: 'Rose Chart', selected: [], categoryField: 'Month' },
        );

        expect(update.ops[0]).toMatchObject({ value: { text: '140' } });
        expect((update.ops[0] as any).value.candidates).toEqual([
            { connection: 'outer-radial', priority: 0 },
        ]);
    });

    it('formats Bar Table and Bullet annotations from their authored measures', async () => {
        const barTable = barTableDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'GDP ($T)', type: 'quantitative' },
                y: { field: 'Country', type: 'nominal' },
            },
        });
        const bullet = bulletChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Share', type: 'quantitative' },
                y: { field: 'Country', type: 'nominal' },
                goal: { field: 'Target', type: 'quantitative' },
            },
        });
        const barTableElement = {
            value: { [INTERACTION_KEY]: 'China' },
            records: [{ Country: 'China', 'GDP ($T)': 17.8, period_end: 0 }],
        };
        const bulletElement = {
            value: { [INTERACTION_KEY]: 'Germany' },
            records: [{ Country: 'Germany', Share: 51.6, Target: 80 }],
        };

        expect(barTable.presentUpdate!(
            annotationUpdate(barTableElement),
            { chartType: 'Bar Table', selected: [], categoryField: 'Country' },
        ).ops[0]).toMatchObject({ value: { text: '17.8' } });
        const bulletUpdate = bullet.presentUpdate!(
            annotationUpdate(bulletElement),
            { chartType: 'Bullet Chart', selected: [], categoryField: 'Country' },
        );
        expect(bulletUpdate.ops[0]).toMatchObject({
            value: {
                text: 'Actual: 51.6\nExpected: 80',
                candidates: expect.arrayContaining([expect.objectContaining({
                    connectorAnchors: [
                        { role: 'bullet-actual', connection: 'value-end', valueAxis: 'x' },
                        { role: 'bullet-expected', connection: 'center' },
                    ],
                })]),
            },
        });

        const bulletSpec = assembleVegaLite({
            data: { values: [{ Country: 'Germany', Share: 51.6, Target: 80 }] },
            semantic_types: { Country: 'Country', Share: 'Quantity', Target: 'Quantity' },
            chart_spec: {
                chartType: 'Bullet Chart',
                encodings: { y: 'Country', x: 'Share', goal: 'Target' },
            },
        } as never) as any;
        const { compiled } = instrument(bulletSpec, [clickAnnotate()]);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const roles = sceneItems(view)
            .filter((item) => item.datum.Country === 'Germany' && item.datum[INTERACTION_ROLE])
            .map((item) => item.datum[INTERACTION_ROLE]);

        expect(new Set(roles)).toEqual(new Set(['bullet-actual', 'bullet-expected']));
    });

    it('resolves Bullet Chart goal-attainment legend keys to their bars', () => {
        const semantics = bulletChartDef.semanticInteractions!({
            resolvedEncodings: {
                y: { field: 'Country', type: 'nominal' },
                x: { field: 'Share', type: 'quantitative' },
                goal: { field: 'Target', type: 'quantitative' },
            },
        } as any);
        const below = {
            datum: { Country: 'Norway', Share: 98, Target: 100, __status: 'Below target' },
            markType: 'bar',
            source: 'mark' as const,
        };
        const met = {
            datum: { Country: 'Brazil', Share: 90, Target: 80, __status: 'Meets target' },
            markType: 'bar',
            source: 'mark' as const,
        };

        expect(semantics.legendFields).toEqual({ color: '__status' });
        expect(semantics.resolve({
            gesture: 'click',
            role: 'legend-item',
            hits: [{ datum: { value: 'Below target' }, source: 'legend-item' }],
            legend: { field: '__status', domain: { kind: 'value', value: 'Below target' } },
        }, {
            keyField: 'Country',
            allHits: [below, met],
        } as any)?.elements).toHaveLength(1);

        const unmatched = semantics.resolve({
            gesture: 'click',
            role: 'legend-item',
            hits: [{ datum: { value: 'Meets target' }, source: 'legend-item' }],
            legend: { field: '__status', domain: { kind: 'value', value: 'Meets target' } },
        }, {
            keyField: 'Country',
            allHits: [below],
        } as any);
        expect(unmatched).toBeNull();
        expect(legendSemanticTarget({
            channel: 'color', field: '__status', value: 'Meets target',
            domain: { kind: 'value', value: 'Meets target' },
        })).toEqual({
            visual: { kind: 'legend', role: 'legend-item' },
            elements: [{
                value: {
                    channel: 'color',
                    field: '__status',
                    domain: { kind: 'value', value: 'Meets target' },
                },
            }],
        });
        expect(legendSemanticTarget({
            channel: 'color', field: '__status', value: 'Below target',
            domain: { kind: 'value', value: 'Below target' },
        })).toEqual({
            visual: { kind: 'legend', role: 'legend-item' },
            elements: [{
                value: {
                    channel: 'color', field: '__status',
                    domain: { kind: 'value', value: 'Below target' },
                },
            }],
        });
    });

    it('presents Choropleth regions and Density segments with semantic values', () => {
        const choropleth = choroplethDef.semanticInteractions!({
            resolvedEncodings: {
                id: { field: 'State', type: 'nominal' },
                color: { field: 'Value', type: 'quantitative' },
            },
        });
        const density = densityPlotDef.semanticInteractions!({
            resolvedEncodings: { x: { field: 'Score', type: 'quantitative' } },
        });

        const regionUpdate = choropleth.presentUpdate!(
            annotationUpdate(
                { value: { [INTERACTION_KEY]: '35' }, records: [{ State: 'New Mexico', Value: 35 }] },
                { kind: 'region', role: 'geographic-region' },
            ),
            { chartType: 'Choropleth', selected: [], categoryField: 'State' },
        );
        const densityUpdate = density.presentUpdate!(
            annotationUpdate({
                    value: { [INTERACTION_KEY]: 'segment' },
                    records: [{ value: 72.5, density: 0.33 }, { value: 75, density: 0.32 }],
                }, { kind: 'path', role: 'area' }),
            { chartType: 'Density Plot', selected: [] },
        );

        expect(regionUpdate.ops[0]).toMatchObject({
            value: { text: 'New Mexico: 35', candidates: [{ connection: 'center' }] },
        });
        expect(densityUpdate.ops[0]).toMatchObject({
            value: { text: '72.5: 0.33', candidates: [{ connection: 'segment-midpoint' }] },
        });
    });

    it('presents transformed ECDF, Calendar, and Violin values', () => {
        const ecdf = ecdfPlotDef.semanticInteractions!({
            resolvedEncodings: { x: { field: 'Score', type: 'quantitative' } },
        });
        const calendar = vlCalendarHeatmapDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Day', type: 'temporal' },
                color: { field: 'Commits', type: 'quantitative' },
            },
        });
        const violin = violinPlotDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Species', type: 'nominal' },
                y: { field: 'Length', type: 'quantitative' },
            },
        });

        const ecdfUpdate = ecdf.presentUpdate!(
            annotationUpdate({ value: { [INTERACTION_KEY]: 'step' }, records: [{ Score: 42 }, { Score: 44 }] }),
            { chartType: 'ECDF Plot', selected: [] },
        );
        const calendarUpdate = calendar.presentUpdate!(
            annotationUpdate({
                    value: {
                        [INTERACTION_KEY]: 'day',
                        __flintCalendarDate: Date.UTC(2026, 7, 27),
                        sum_Commits: 12,
                    },
                }),
            { chartType: 'Calendar Heatmap', selected: [] },
        );
        const violinUpdate = violin.presentUpdate!(
            annotationUpdate({
                    value: { [INTERACTION_KEY]: 'curve' },
                    records: [{ Species: 'Setosa', Length: 5.1, density: 0.4 }],
                }),
            { chartType: 'Violin Plot', selected: [] },
        );

        expect(ecdfUpdate.ops[0]).toMatchObject({ value: { text: '42' } });
        const calendarDate = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC' })
            .format(new Date(Date.UTC(2026, 7, 27)));
        expect(calendarUpdate.ops[0]).toMatchObject({ value: { text: `${calendarDate}: 12` } });
        expect(violinUpdate.ops[0]).toMatchObject({ value: { text: 'Setosa: 5.1' } });
    });

    it('uses one local hover rule across color semantics', () => {
        const makeSpec = (colorSemanticType: 'Category' | 'Quantity') => assembleVegaLite({
            data: { values: [
                { Region: 'North', Sales: 10, Color: colorSemanticType === 'Category' ? 'Retail' : 0.2 },
                { Region: 'South', Sales: 14, Color: colorSemanticType === 'Category' ? 'Enterprise' : 0.8 },
            ] },
            semantic_types: { Region: 'Category', Sales: 'Quantity', Color: colorSemanticType },
            chart_spec: {
                chartType: 'Bar Chart',
                encodings: { x: { field: 'Region' }, y: { field: 'Sales' }, color: { field: 'Color' } },
            },
        } as any) as any;

        expect(makeSpec('Category')._interactionSemantics.renderHoverStyles).toEqual({
            rect: { opacity: 'contrast' },
        });
        expect(makeSpec('Quantity')._interactionSemantics.renderHoverStyles).toEqual({
            rect: { opacity: 'contrast' },
        });
    });

    it('uses an outline when a bar opacity channel is data-encoded', () => {
        const spec = assembleVegaLite({
            data: { values: [
                { Region: 'North', Sales: 10, Confidence: 0.4 },
                { Region: 'South', Sales: 14, Confidence: 0.8 },
            ] },
            semantic_types: { Region: 'Category', Sales: 'Quantity', Confidence: 'Quantity' },
            chart_spec: {
                chartType: 'Bar Chart',
                encodings: { x: 'Region', y: 'Sales', opacity: 'Confidence' },
            },
        } as any) as any;

        expect(spec._interactionSemantics.renderHoverStyles).toEqual({
            rect: { stroke: MUTED_HOVER_STROKE, strokeWidth: 1.5 },
        });
    });

    it('makes generated legend marks physical click targets', () => {
        const spec = {
            data: { values: [{ X: 1, Y: 2, Color: 'Blue' }] },
            mark: 'point',
            encoding: {
                x: { field: 'X', type: 'quantitative' },
                y: { field: 'Y', type: 'quantitative' },
                color: { field: 'Color', type: 'nominal' },
            },
            _interactionSemantics: {
                fields: ['X', 'Y', 'Color'],
                seriesField: 'Color',
                legendFields: { color: 'Color' },
                selectableMarks: ['point'],
            },
        };
        const { compiled } = instrument(spec);
        expect(compiled.legends.length).toBeGreaterThan(0);
        for (const legend of compiled.legends) {
            expect(legend.encode.gradient.interactive).toBe(true);
            expect(legend.encode.gradient.update.cursor).toBeUndefined();
            expect(legend.encode.symbols.interactive).toBe(true);
            expect(legend.encode.symbols.update.cursor).toBeUndefined();
            expect(legend.encode.labels.interactive).toBe(true);
            expect(legend.encode.labels.update.cursor).toBeUndefined();
        }
    });

    it('leaves mark cursors to runtime affordance resolution', () => {
        const spec = {
            data: { values: [{ X: 1, Y: 2 }] },
            mark: 'point',
            encoding: {
                x: { field: 'X', type: 'quantitative' },
                y: { field: 'Y', type: 'quantitative' },
            },
            _interactionSemantics: {
                fields: ['X', 'Y'],
                selectableMarks: ['point'],
            },
        };
        const clickable = instrument(structuredClone(spec)).compiled;
        const selectable = instrument(structuredClone(spec), [select()]).compiled;
        const symbolMark = (compiled: Record<string, any>) => compiled.marks
            .flatMap((mark: Record<string, any>) => mark.marks ?? [mark])
            .find((mark: Record<string, any>) => mark.type === 'symbol');

        expect(symbolMark(clickable).encode.update.cursor).toBeUndefined();
        expect(symbolMark(selectable).encode.update.cursor).toBeUndefined();
    });

    it('compiles template hover paint into native mark encodings', async () => {
        for (const [mark, renderMark, width] of [['rect', 'rect', 1.5], ['circle', 'symbol', 2]] as const) {
            const spec: Record<string, any> = {
                data: { values: [{ X: 'A', Y: 2 }] },
                mark,
                encoding: {
                    x: { field: 'X', type: 'nominal' },
                    y: { field: 'Y', type: 'quantitative' },
                },
                _interactionSemantics: {
                    fields: ['X', 'Y'],
                    selectableMarks: [mark],
                    renderHoverStyles: { [renderMark]: { stroke: '#59636d', strokeWidth: width } },
                },
            };

            const plan = addVegaLiteInteractions(spec, [clickMark()]);
            const compiled = compile(spec as any).spec as Record<string, any>;
            injectVegaInteractionStore(compiled, plan ?? undefined);
            const view = new View(parse(compiled), { renderer: 'none' });
            await view.runAsync();
            const item = sceneItems(view).find((candidate) => candidate.datum[INTERACTION_KEY]);
            const key = item?.datum[INTERACTION_KEY];
            view.change(HOVER_STORE, changeset().insert([{ key }]));
            await view.runAsync();
            const hovered = sceneItems(view).find((candidate) => candidate.datum[INTERACTION_KEY] === key);

            expect(hovered?.stroke).toBe('#59636d');
            expect(hovered?.strokeWidth).toBe(width);
        }
    });

    it('slightly dims the owning area path behind the hovered slice', async () => {
        const spec = assembleVegaLite({
            chart_spec: {
                chartType: 'Area Chart',
                encodings: { x: { field: 'Year' }, y: { field: 'Value' } },
            },
            semantic_types: { Year: 'Date', Value: 'Number' },
            data: { values: [
                { Year: '2024-01-01', Value: 2 },
                { Year: '2024-02-01', Value: 4 },
            ] },
        }) as any;
        const { compiled } = instrument(spec);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const area = sceneItems(view).find((candidate) => candidate.mark?.marktype === 'area');
        const key = area?.datum[INTERACTION_KEY];

        view.change(HOVER_STORE, changeset().insert([{ key: `${key}${PATH_KEY_SUFFIX}` }]));
        await view.runAsync();
        const hovered = sceneItems(view).find((candidate) => candidate.mark?.marktype === 'area');

        expect(hovered?.opacity).toBe(0.9);
        expect(hovered?.stroke).toBeUndefined();

        view.change(INTERACTION_STORE, changeset().insert([{ key }]));
        await view.runAsync();
        const hoveredWhileSelected = sceneItems(view).find((candidate) => candidate.mark?.marktype === 'area');

        expect(hoveredWhileSelected?.opacity).toBe(0.25);
    });

    it('uses one area segment for its highlight, endpoint text, and annotation boundary', async () => {
        const spec = assembleVegaLite({
            chart_spec: {
                chartType: 'Area Chart',
                encodings: { x: { field: 'Year' }, y: { field: 'Users' } },
            },
            semantic_types: { Year: 'Date', Users: 'Number' },
            data: { values: [
                { Year: '2018-01-01', Users: 51 },
                { Year: '2020-01-01', Users: 60 },
                { Year: '2022-01-01', Users: 67 },
            ] },
        }) as any;
        const { compiled } = instrument(spec);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const areaSegments = sceneItems(view).filter((candidate) => candidate.mark?.marktype === 'area');
        const finalSegment = areaSegments.find((candidate) =>
            candidate.interactionGeometry.endDatum?.Users === 67);
        const hit = renderHit(finalSegment)!;
        const semantics = areaChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Year', type: 'temporal' },
                y: { field: 'Users', type: 'quantitative' },
            },
        });
        const target = semantics.resolve(
            { gesture: 'click', role: 'mark', hits: [hit] },
            { allHits: [hit], keyField: INTERACTION_KEY },
        )!;

        expect(areaSegments).toHaveLength(2);
        expect(finalSegment.interactionGeometry.annotationPoints).toEqual(
            finalSegment.interactionGeometry.points.slice(0, 2),
        );
        expect(annotationBounds(finalSegment).y2).toBeLessThan(finalSegment.bounds.y2);
        expect(target.elements[0].records?.map((record) => record.Users)).toEqual([60, 67]);
        expect(semantics.presentUpdate!(
            annotationUpdate(target.elements[0]),
            { chartType: 'Area Chart', selected: [] },
        ).ops[0]).toMatchObject({
            value: {
                text: '60 → 67',
                candidates: [{ connection: 'segment-midpoint', priority: 0 }],
            },
        });
    });

    it('adds a light hover fill only to shape-only scatter points', () => {
        const hoverStyle = (resolvedEncodings: Record<string, any>) =>
            scatterPlotDef.semanticInteractions!({ resolvedEncodings }).renderHoverStyles?.symbol;

        expect(hoverStyle({ shape: { field: 'Shape', type: 'nominal' } })).toMatchObject({
            fill: MUTED_HOVER_FILL,
        });
        expect(hoverStyle({
            shape: { field: 'Shape', type: 'nominal' },
            color: { field: 'Color', type: 'nominal' },
        })).not.toHaveProperty('fill');
    });

    it('declares scatter detail encodings as semantic selector fields', () => {
        const semantics = scatterPlotDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'GDP', type: 'quantitative' },
                y: { field: 'Life', type: 'quantitative' },
                detail: { field: 'Country', type: 'nominal' },
            },
        });

        expect(semantics.fields).toContain('Country');
    });

    it('applies one lollipop hover key to both stem and point layers', async () => {
        const spec: Record<string, any> = {
            data: { values: [{ Category: 'A', Value: 2 }] },
            layer: [
                { mark: { type: 'rule', strokeWidth: 1.5 }, encoding: {} },
                { mark: { type: 'circle', size: 80 }, encoding: {} },
            ],
            encoding: {
                x: { field: 'Category', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
            },
            _interactionSemantics: {
                fields: ['Category', 'Value'],
                selectableMarks: ['rule', 'circle'],
                renderHoverStyles: {
                    rule: { stroke: '#59636d' },
                    symbol: { stroke: '#59636d', strokeWidth: 2 },
                },
            },
        };

        const plan = addVegaLiteInteractions(spec, [clickMark()]);

        expect(spec.layer[0].encoding.detail.field).toBe(INTERACTION_KEY);
        expect(spec.layer[1].encoding.detail.field).toBe(INTERACTION_KEY);

        const compiled = compile(spec as any).spec as Record<string, any>;
        injectVegaInteractionStore(compiled, plan ?? undefined);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const key = sceneItems(view).find((item) => item.mark.marktype === 'symbol')?.datum[INTERACTION_KEY];
        view.change(HOVER_STORE, changeset().insert([{ key }]));
        await view.runAsync();
        const unit = sceneItems(view).filter((item) => item.datum[INTERACTION_KEY] === key);

        expect(unit.find((item) => item.mark.marktype === 'rule')?.stroke).toBe('#59636d');
        expect(unit.find((item) => item.mark.marktype === 'symbol')?.stroke).toBe('#59636d');
    });

    it('preserves base strokes for line and composite charts before hover', async () => {
        const cases: Record<string, any>[] = [
            {
                data: { values: [{ X: 1, Y: 2, Group: 'A' }] },
                mark: 'point',
                encoding: {
                    x: { field: 'X', type: 'quantitative' },
                    y: { field: 'Y', type: 'quantitative' },
                    color: { field: 'Group', type: 'nominal' },
                },
                _interactionSemantics: {
                    fields: ['X', 'Y', 'Group'], selectableMarks: ['point'],
                    renderHoverStyles: { symbol: { stroke: '#59636d', strokeWidth: 2 } },
                },
            },
            {
                data: { values: [{ X: 0, Y: 1 }, { X: 1, Y: 2 }] },
                mark: { type: 'line', strokeWidth: 2 },
                encoding: { x: { field: 'X', type: 'quantitative' }, y: { field: 'Y', type: 'quantitative' } },
                _interactionSemantics: {
                    fields: ['X', 'Y'], selectableMarks: ['line'],
                    renderHoverStyles: { line: { strokeWidth: 3 } },
                },
            },
            {
                data: { values: [{ X: 'A', Low: 1, High: 4, Open: 2, Close: 3 }] },
                encoding: { x: { field: 'X', type: 'nominal' } },
                layer: [
                    { mark: 'rule', encoding: { y: { field: 'Low', type: 'quantitative' }, y2: { field: 'High' } } },
                    { mark: 'bar', encoding: { y: { field: 'Open', type: 'quantitative' }, y2: { field: 'Close' } } },
                ],
                _interactionSemantics: {
                    fields: ['X'], selectableMarks: ['rule', 'bar'],
                    renderHoverStyles: { rule: { strokeWidth: 2.5 }, rect: { stroke: '#59636d', strokeWidth: 1.5 } },
                },
            },
            {
                data: { values: [
                    { Group: 'A', Value: 1 }, { Group: 'A', Value: 2 }, { Group: 'A', Value: 3 },
                ] },
                mark: 'boxplot',
                encoding: {
                    x: { field: 'Group', type: 'nominal' },
                    y: { field: 'Value', type: 'quantitative' },
                },
                _interactionSemantics: {
                    fields: ['Group'], selectableMarks: ['boxplot'],
                    renderHoverStyles: {
                        rect: { opacity: 'contrast', stroke: '#59636d', strokeWidth: 2 },
                        rule: { opacity: 'contrast', stroke: '#59636d', strokeWidth: 2 },
                        symbol: { opacity: 'contrast', stroke: '#59636d', strokeWidth: 2 },
                    },
                },
            },
        ];

        for (const spec of cases) {
            const plan = addVegaLiteInteractions(spec, [clickMark()]);
            const compiled = compile(spec as any).spec as Record<string, any>;
            injectVegaInteractionStore(compiled, plan ?? undefined);
            const view = new View(parse(compiled), { renderer: 'none' });
            await view.runAsync();
            const strokes = sceneItems(view).filter((item) =>
                item.datum[INTERACTION_KEY]
                && (item.mark.marktype === 'line' || item.mark.marktype === 'rule' || item.mark.marktype === 'symbol'));

            expect(strokes.length).toBeGreaterThan(0);
            expect(strokes.every((item) => item.stroke !== 'transparent' && item.strokeWidth > 0)).toBe(true);
        }
    });

    it('compiles Boxplot color contrast and outlines for every composite submark', () => {
        const spec: Record<string, any> = {
            data: { values: [
                { Group: 'A', Value: 1 }, { Group: 'A', Value: 2 },
                { Group: 'A', Value: 3 }, { Group: 'A', Value: 20 },
            ] },
            mark: 'boxplot',
            encoding: {
                x: { field: 'Group', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
            },
            _interactionSemantics: {
                fields: ['Group'], selectableMarks: ['boxplot'],
                renderHoverStyles: {
                    rect: { opacity: 'contrast', stroke: MUTED_HOVER_STROKE, strokeWidth: 2 },
                    rule: { opacity: 'contrast', stroke: MUTED_HOVER_STROKE, strokeWidth: 2 },
                    symbol: { opacity: 'contrast', stroke: MUTED_HOVER_STROKE, strokeWidth: 2 },
                },
            },
        };
        const plan = addVegaLiteInteractions(spec, [clickMark()]);
        const compiled = compile(spec as any).spec as Record<string, any>;
        injectVegaInteractionStore(compiled, plan ?? undefined);
        const marks: Record<string, any>[] = [];
        const collect = (items: Record<string, any>[] = []) => {
            for (const item of items) {
                marks.push(item);
                collect(item.marks);
            }
        };
        collect(compiled.marks);

        for (const markType of ['rect', 'rule', 'symbol']) {
            const styled = marks.filter((mark) => mark.type === markType
                && JSON.stringify(mark.encode).includes(INTERACTION_KEY));
            expect(styled.length).toBeGreaterThan(0);
            for (const mark of styled) {
                expect(JSON.stringify(mark.encode.update.opacity)).toContain(HOVER_STORE);
                expect(JSON.stringify(mark.encode.update.stroke)).toContain(MUTED_HOVER_STROKE);
                expect(JSON.stringify(mark.encode.update.strokeWidth)).toContain(HOVER_STORE);
            }
        }
    });

    it('leaves native line paint unchanged for segment-local hover', () => {
        const spec = assembleVegaLite({
            chart_spec: {
                chartType: 'Line Chart',
                encodings: { x: { field: 'Year' }, y: { field: 'Value' } },
            },
            semantic_types: { Year: 'Date', Value: 'Number' },
            data: { values: [
                { Year: '2024-01-01', Value: 2 },
                { Year: '2024-02-01', Value: 4 },
            ] },
        }) as any;
        const { compiled } = instrument(spec);
        const line = compiled.marks
            .flatMap((mark: Record<string, any>) => mark.marks ?? [mark])
            .find((mark: Record<string, any>) => mark.type === 'line');

        expect(JSON.stringify(line.encode.update.strokeWidth ?? {})).not.toContain(HOVER_STORE);
    });

    it('tests rectangle selection against an arc sector rather than its broad bounds', () => {
        const quarter = {
            mark: { marktype: 'arc' },
            x: 100,
            y: 100,
            innerRadius: 0,
            outerRadius: 80,
            endAngle: 0,
            startAngle: Math.PI / 2,
        };
        const donutQuarter = { ...quarter, innerRadius: 40 };
        const clockwiseQuarter = { ...quarter, startAngle: 0, endAngle: Math.PI / 2 };
        const roseWedge = { ...quarter, startAngle: 0, endAngle: Math.PI / 6 };

        expect(arcIntersectsRect(quarter, { x1: 130, y1: 40, x2: 160, y2: 70 })).toBe(true);
        expect(arcIntersectsRect(clockwiseQuarter, { x1: 130, y1: 40, x2: 160, y2: 70 })).toBe(true);
        expect(arcIntersectsRect(clockwiseQuarter, { x1: 40, y1: 130, x2: 70, y2: 160 })).toBe(false);
        expect(arcIntersectsRect(roseWedge, { x1: 110, y1: 20, x2: 140, y2: 50 })).toBe(true);
        expect(arcIntersectsRect(roseWedge, { x1: 40, y1: 130, x2: 70, y2: 160 })).toBe(false);
        expect(arcIntersectsRect(quarter, { x1: 40, y1: 130, x2: 70, y2: 160 })).toBe(false);
        expect(arcIntersectsRect(donutQuarter, { x1: 95, y1: 95, x2: 105, y2: 105 })).toBe(false);
        expect(arcIntersectsRect(quarter, { x1: 15, y1: 15, x2: 185, y2: 185 }, true)).toBe(true);
        expect(arcIntersectsRect(quarter, { x1: 90, y1: 90, x2: 180, y2: 180 }, true)).toBe(false);
    });

    it('assists to the nearest donut slice geometry, not the largest arc bounds', () => {
        const center = { x: 100, y: 100 };
        const large = {
            mark: { marktype: 'arc' }, ...center,
            innerRadius: 35, outerRadius: 80,
            startAngle: 0, endAngle: 3 * Math.PI / 2,
            bounds: { x1: 20, y1: 20, x2: 180, y2: 180 },
        };
        const small = {
            mark: { marktype: 'arc' }, ...center,
            innerRadius: 35, outerRadius: 80,
            startAngle: 3 * Math.PI / 2, endAngle: 17 * Math.PI / 10,
            bounds: { x1: 20, y1: 75, x2: 36, y2: 125 },
        };
        const angle = 8 * Math.PI / 5;
        const point = {
            x: center.x + 60 * Math.sin(angle),
            y: center.y - 60 * Math.cos(angle),
        };

        expect(nearestItemByBounds([large, small], point, 10)).toBe(small);
    });

    it('tests angular selection across the zero-angle seam and within one polar center', () => {
        const arc = {
            mark: { marktype: 'arc' }, x: 100, y: 100,
            innerRadius: 20, outerRadius: 80,
            startAngle: 11 * Math.PI / 6, endAngle: 13 * Math.PI / 6,
        };
        const sector = {
            center: { x: 100, y: 100 }, innerRadius: 0, outerRadius: 90,
            startAngle: 7 * Math.PI / 4, endAngle: 9 * Math.PI / 4,
        };

        expect(arcIntersectsAngularSector(arc, sector)).toBe(true);
        expect(arcIntersectsAngularSector(arc, sector, true)).toBe(true);
        expect(arcIntersectsAngularSector(arc, { ...sector, endAngle: 2 * Math.PI }, true)).toBe(false);
        expect(arcIntersectsAngularSector(arc, { ...sector, center: { x: 300, y: 100 } })).toBe(false);
        expect(arcIntersectsAngularSector(arc, { ...sector, innerRadius: 85 })).toBe(false);
    });

    it('draws annular angular-brush geometry and admits it only on polar ChartDefs', () => {
        expect(angularSectorPath({
            center: { x: 100, y: 100 }, innerRadius: 30, outerRadius: 80,
            startAngle: 0, endAngle: Math.PI / 2,
        })).toContain('A 80 80 0 0 1');
        const fullDisk = angularSectorPath({
            center: { x: 100, y: 100 }, innerRadius: 0, outerRadius: 80,
            startAngle: 0, endAngle: 2 * Math.PI,
        });
        const fullDonut = angularSectorPath({
            center: { x: 100, y: 100 }, innerRadius: 30, outerRadius: 80,
            startAngle: 0, endAngle: -2 * Math.PI,
        });
        expect(fullDisk.match(/ A /g)).toHaveLength(2);
        expect(fullDonut.match(/ A /g)).toHaveLength(4);
        expect(fullDisk).not.toContain('0.000001');

        const cartesian = {
            mark: 'bar',
            data: { values: [{ category: 'A', value: 1 }] },
            encoding: { x: { field: 'category', type: 'nominal' }, y: { field: 'value', type: 'quantitative' } },
            _interactionSemantics: barChartDef.semanticInteractions!({
                resolvedEncodings: { x: { field: 'category', type: 'nominal' }, y: { field: 'value', type: 'quantitative' } },
            }),
        };
        expect(() => addVegaLiteInteractions(cartesian, [brushAngle()]))
            .toThrow('requires a polar chart with angular-region support');

        const polar = {
            mark: 'arc',
            data: { values: [{ category: 'A', value: 1 }] },
            encoding: { theta: { field: 'value', type: 'quantitative' }, color: { field: 'category', type: 'nominal' } },
            _interactionSemantics: roseChartDef.semanticInteractions!({
                resolvedEncodings: { x: { field: 'category', type: 'nominal' }, y: { field: 'value', type: 'quantitative' } },
            }),
        };
        const polarPlan = addVegaLiteInteractions(polar, [brushX()]);
        expect(polarPlan?.angularXBrush).toBe(true);
    });

    it('does not select adjacent cells that only touch the selection boundary', () => {
        const selection = { x1: 10, y1: 10, x2: 30, y2: 30 };

        expect(boundsIntersectRect({ x1: 10, y1: 10, x2: 30, y2: 30 }, selection)).toBe(true);
        expect(boundsIntersectRect({ x1: 30, y1: 10, x2: 50, y2: 30 }, selection)).toBe(false);
        expect(boundsIntersectRect({ x1: 10, y1: 30, x2: 30, y2: 50 }, selection)).toBe(false);
        expect(boundsIntersectRect({ x1: 29.75, y1: 10, x2: 50, y2: 30 }, selection)).toBe(false);
        expect(boundsIntersectRect({ x1: 29, y1: 10, x2: 50, y2: 30 }, selection)).toBe(true);
    });

    it('reports the plot origin in renderer units when the SVG is CSS-scaled', () => {
        // Vega renders a 370x305 chart that CSS shrinks to 326px wide.
        const cssScale = 326 / 370;
        const matrix = { a: cssScale, e: 39 * cssScale, f: 10 * cssScale };

        expect(rendererPlotOrigin(matrix, { x: 0, y: 0 })).toEqual({ x: 39, y: 10 });
        expect(rendererPlotOrigin({ a: 1, e: 39, f: 10 }, { x: 0, y: 0 }))
            .toEqual({ x: 39, y: 10 });
        expect(rendererPlotOrigin(undefined, { x: 5, y: 6 })).toEqual({ x: 5, y: 6 });

        const space = {
            rect: { left: 0, top: 0, width: 370 * cssScale, height: 305 * cssScale } as DOMRect,
            logicalWidth: 370,
            logicalHeight: 305,
            ...(({ x, y }) => ({ originX: x, originY: y }))(rendererPlotOrigin(matrix, { x: 0, y: 0 })),
            plotWidth: 320,
            plotHeight: 260,
        };

        // A plot-space point must land where the scaled mark actually renders.
        expect(plotToClientPoint({ x: 0, y: 0 }, space).x).toBeCloseTo(39 * cssScale, 6);
        const roundTrip = clientToPlotPoint({ x: 39 * cssScale, y: 10 * cssScale }, space);
        expect(roundTrip.x).toBeCloseTo(0, 6);
        expect(roundTrip.y).toBeCloseTo(0, 6);
    });

    it('reports the correct plot origin under nonuniform SVG scaling', () => {
        const matrix = { a: 0.8, d: 0.5, e: 32, f: 15 };

        expect(rendererPlotOrigin(matrix, { x: 0, y: 0 })).toEqual({ x: 40, y: 30 });

        const space = {
            rect: { left: 10, top: 20, width: 320, height: 150 } as DOMRect,
            logicalWidth: 400,
            logicalHeight: 300,
            originX: 40,
            originY: 30,
            plotWidth: 320,
            plotHeight: 240,
        };
        const plotOrigin = plotToClientPoint({ x: 0, y: 0 }, space);
        expect(plotOrigin).toEqual({ x: 42, y: 35 });
        expect(clientToPlotPoint(plotOrigin, space)).toEqual({ x: 0, y: 0 });
    });

    it('round-trips coordinates through SVG scaling and Vega plot padding', () => {
        const space = {
            rect: { left: 100, top: 50, width: 250, height: 150 } as DOMRect,
            logicalWidth: 500,
            logicalHeight: 300,
            originX: 60,
            originY: 30,
            plotWidth: 400,
            plotHeight: 240,
        };

        const plot = clientToPlotPoint({ x: 180, y: 100 }, space);
        expect(plot).toEqual({ x: 100, y: 70 });
        expect(plotToClientPoint(plot, space)).toEqual({ x: 180, y: 100 });
        expect(clientToPlotPoint({ x: 0, y: 0 }, space)).toEqual({ x: 0, y: 0 });
        expect(clientToPlotPoint({ x: 350, y: 100 }, space)).toEqual({ x: 400, y: 70 });
        expect(clientToRendererPoint({ x: 350, y: 100 }, space)).toEqual({ x: 500, y: 100 });
        expect(clientToLayoutPoint(
            { x: 180, y: 100 },
            { left: 20, top: 20, width: 320, height: 160 },
            { width: 400, height: 200 },
        )).toEqual({ x: 200, y: 100 });
        expect(clientRectToLayoutRect(
            { left: 60, top: 40, right: 260, bottom: 140 },
            { left: 20, top: 20, width: 320, height: 160 },
            { width: 400, height: 200 },
        )).toEqual({ left: 50, top: 25, width: 250, height: 125 });
    });

    it('translates concat marks by ancestor group offsets', () => {
        const view = {
            scenegraph: () => ({
                root: {
                    items: [{
                        mark: { marktype: 'group' },
                        x: 240,
                        y: 12,
                        items: [{
                            mark: { marktype: 'bar' },
                            datum: { [INTERACTION_KEY]: '20-29|F' },
                            x: 10,
                            y: 20,
                            bounds: { x1: 10, x2: 80, y1: 20, y2: 50 },
                        }],
                    }],
                },
            }),
        };

        expect(sceneItems(view)[0]).toMatchObject({
            x: 250,
            y: 32,
            bounds: { x1: 250, x2: 320, y1: 32, y2: 62 },
        });
    });

    it('keys a basic bar by its category and emits a valid retained store', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Region'], categoryField: 'Region', selectableMarks: ['bar'],
            },
            data: { values: [{ Region: 'West', Sales: 10 }] },
            mark: 'bar',
            encoding: {
                x: { field: 'Region', type: 'nominal' },
                y: { field: 'Sales', type: 'quantitative' },
            },
        };

        const { plan, compiled } = instrument(spec);

        expect(plan).toMatchObject({ fields: ['Region'], categoryField: 'Region' });
        expect(spec.transform).toContainEqual(expect.objectContaining({ as: INTERACTION_KEY }));
        expect(spec.encoding.opacity.condition.test).toContain(INTERACTION_STORE);
        expect(compiled.data).toContainEqual({ name: INTERACTION_STORE, values: [] });
        expect(() => parse(compiled, undefined, { ast: true } as any)).not.toThrow();
    });

    it('uses category plus series for grouped-bar element identity', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Region', 'Segment'],
                categoryField: 'Region',
                seriesField: 'Segment',
                selectableMarks: ['bar'],
            },
            mark: 'bar',
            encoding: {
                x: { field: 'Region', type: 'nominal' },
                y: { field: 'Sales', type: 'quantitative' },
                color: { field: 'Segment', type: 'nominal' },
                xOffset: { field: 'Segment', type: 'nominal' },
            },
        };

        const { plan } = instrument(spec, [clickMark(), select()]);

        expect(plan).toMatchObject({
            fields: ['Region', 'Segment'],
            categoryField: 'Region',
            seriesField: 'Segment',
        });
    });

    it('uses both discrete axes for a heatmap cell', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Month', 'Product'], categoryField: 'Month', selectableMarks: ['rect'],
            },
            mark: 'rect',
            encoding: {
                x: { field: 'Month', type: 'ordinal' },
                y: { field: 'Product', type: 'nominal' },
                color: { field: 'Revenue', type: 'quantitative' },
            },
        };

        expect(instrument(spec).plan?.fields).toEqual(['Month', 'Product']);
    });

    it('instruments concatenated pyramid bars with constant opacity', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Age', 'Gender'],
                categoryField: 'Age',
                seriesField: 'Gender',
                selectableMarks: ['bar'],
            },
            data: { values: [{ Age: '20-29', Population: 10, Gender: 'F' }] },
            hconcat: [
                {
                    mark: 'bar',
                    transform: [{ filter: { field: 'Gender', equal: 'F' } }],
                    encoding: {
                        x: { field: 'Population', type: 'quantitative' },
                        y: { field: 'Age', type: 'ordinal' },
                        opacity: { value: 0.9 },
                    },
                },
                {
                    mark: 'bar',
                    transform: [{ filter: { field: 'Gender', equal: 'M' } }],
                    encoding: {
                        x: { field: 'Population', type: 'quantitative' },
                        y: { field: 'Age', type: 'ordinal' },
                        opacity: { value: 0.9 },
                    },
                },
            ],
        };

        const { plan, compiled } = instrument(spec, [select()]);

        expect(plan).toMatchObject({
            fields: ['Age', 'Gender'],
            categoryField: 'Age',
            seriesField: 'Gender',
        });
        expect(spec.hconcat[0].encoding.opacity.condition.value).toBe(0.9);
        expect(spec.hconcat[1].encoding.opacity.condition.value).toBe(0.9);
        expect(() => parse(compiled, undefined, { ast: true } as any)).not.toThrow();
    });

    it('formats bar-family annotations from the primary metric', () => {
        const element = {
            value: { [INTERACTION_KEY]: 'India' },
            records: [{ Country: 'India', Population: 1428.6, Population_end: 1428.6 }],
        };
        const makeUpdate = (definition: typeof barChartDef, resolvedEncodings: Record<string, any>) => {
            const semantics = definition.semanticInteractions!({ resolvedEncodings });
            return semantics.presentUpdate!(
                annotationUpdate(element, { kind: 'mark', role: 'bar' }),
                { chartType: definition.chart, selected: [] },
            );
        };

        const horizontalEncodings = {
            x: { field: 'Population', type: 'quantitative' },
            y: { field: 'Country', type: 'nominal' },
        };
        for (const definition of [barChartDef, groupedBarChartDef, stackedBarChartDef, pyramidChartDef]) {
            const update = makeUpdate(definition, horizontalEncodings);
            expect(update.ops[0]).toMatchObject({ value: { text: '1,428.6' } });
            expect((update.ops[0] as any).value.candidates[0]).toMatchObject({ valueAxis: 'x' });
        }

        const flipped = makeUpdate(pyramidChartDef, {
            x: { field: 'Country', type: 'nominal' },
            y: { field: 'Population', type: 'quantitative' },
        });

        expect(flipped.ops[0]).toMatchObject({ value: { text: '1,428.6' } });
        expect((flipped.ops[0] as any).value.candidates[0]).toMatchObject({ valueAxis: 'y' });
    });

    it('hovers Pyramid bars without changing their geometry or center gap', async () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Age', 'Gender'], categoryField: 'Age', seriesField: 'Gender',
                selectableMarks: ['bar'],
                renderHoverStyles: { rect: { stroke: MUTED_HOVER_STROKE, strokeWidth: 1.5 } },
            },
            data: { values: [
                { Age: '20-29', Population: 10, Gender: 'F' },
                { Age: '20-29', Population: 12, Gender: 'M' },
            ] },
            spacing: 0,
            hconcat: [
                {
                    mark: 'bar', transform: [{ filter: { field: 'Gender', equal: 'F' } }],
                    encoding: {
                        x: { field: 'Population', type: 'quantitative', scale: { reverse: true } },
                        y: { field: 'Age', type: 'ordinal' }, opacity: { value: 0.9 },
                    },
                },
                {
                    mark: 'bar', transform: [{ filter: { field: 'Gender', equal: 'M' } }],
                    encoding: {
                        x: { field: 'Population', type: 'quantitative' },
                        y: { field: 'Age', type: 'ordinal', axis: null }, opacity: { value: 0.9 },
                    },
                },
            ],
        };
        const { compiled } = instrument(spec, [clickMark()]);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const target = sceneItems(view).find((item) => item.mark.marktype === 'rect');
        const geometry = {
            x: target.x, x2: target.x2, y: target.y, y2: target.y2,
            width: target.width, height: target.height,
        };
        const opacity = target.opacity;

        view.change(HOVER_STORE, changeset().insert([{ key: target.datum[INTERACTION_KEY] }]));
        await view.runAsync();
        const hovered = sceneItems(view).find((item) => item.datum[INTERACTION_KEY] === target.datum[INTERACTION_KEY]);

        expect(hovered?.opacity).toBe(opacity);
        expect({
            x: hovered?.x, x2: hovered?.x2, y: hovered?.y, y2: hovered?.y2,
            width: hovered?.width, height: hovered?.height,
        }).toEqual(geometry);
        expect(hovered?.stroke).toBe(MUTED_HOVER_STROKE);
        expect(hovered?.strokeWidth).toBe(1.5);
    });

    it.each([
        { authoredOpacity: 1, hoveredOpacity: 0.9 },
        { authoredOpacity: 0.6, hoveredOpacity: 1 },
    ])('contrasts target opacity from $authoredOpacity without changing peers', async ({ authoredOpacity, hoveredOpacity }) => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Category'], categoryField: 'Category', selectableMarks: ['bar'],
                renderHoverStyles: { rect: { opacity: 'contrast' } },
            },
            data: { values: [
                { Category: 'Alpha', Value: 10 },
                { Category: 'Beta', Value: 12 },
            ] },
            mark: 'bar',
            encoding: {
                x: { field: 'Category', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
                opacity: { value: authoredOpacity },
            },
        };
        const { compiled } = instrument(spec, [clickMark()]);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const bars = sceneItems(view).filter((item) => item.mark.marktype === 'rect' && item.datum[INTERACTION_KEY]);
        const [target, peer] = bars;
        const targetKey = target.datum[INTERACTION_KEY];
        const peerKey = peer.datum[INTERACTION_KEY];

        view.change(HOVER_STORE, changeset().insert([{ key: targetKey }]));
        await view.runAsync();
        let renderedBars = sceneItems(view).filter((item) => item.mark.marktype === 'rect' && item.datum[INTERACTION_KEY]);
        const hoveredTarget = renderedBars.find((item) => item.datum[INTERACTION_KEY] === targetKey);
        const hoverPeer = renderedBars.find((item) => item.datum[INTERACTION_KEY] === peerKey);
        expect(hoveredTarget?.opacity).toBe(hoveredOpacity);
        expect(hoverPeer?.opacity).toBe(authoredOpacity);

        view.change(INTERACTION_STORE, changeset().insert([{ key: targetKey }]));
        await view.runAsync();
        renderedBars = sceneItems(view).filter((item) => item.mark.marktype === 'rect' && item.datum[INTERACTION_KEY]);
        expect(renderedBars.find((item) => item.datum[INTERACTION_KEY] === targetKey)?.opacity).toBe(hoveredOpacity);
        expect(renderedBars.find((item) => item.datum[INTERACTION_KEY] === peerKey)?.opacity).toBe(0.25);
    });

    it('preserves a data-encoded opacity channel and uses an outline on hover', async () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Category'], categoryField: 'Category', selectableMarks: ['bar'],
                renderHoverStyles: { rect: { stroke: MUTED_HOVER_STROKE, strokeWidth: 1.5 } },
            },
            data: { values: [
                { Category: 'Alpha', Value: 10, Confidence: 0.4 },
                { Category: 'Beta', Value: 12, Confidence: 0.8 },
            ] },
            mark: 'bar',
            encoding: {
                x: { field: 'Category', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
                opacity: { field: 'Confidence', type: 'quantitative', scale: null },
            },
        };
        const { compiled } = instrument(spec, [clickMark()]);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const bars = sceneItems(view).filter((item) => item.mark.marktype === 'rect' && item.datum[INTERACTION_KEY]);
        const [target, peer] = bars;

        view.change(HOVER_STORE, changeset().insert([{ key: target.datum[INTERACTION_KEY] }]));
        await view.runAsync();
        let renderedBars = sceneItems(view).filter((item) => item.mark.marktype === 'rect' && item.datum[INTERACTION_KEY]);
        expect(renderedBars.find((item) => item.datum[INTERACTION_KEY] === target.datum[INTERACTION_KEY])?.opacity).toBe(0.4);
        expect(renderedBars.find((item) => item.datum[INTERACTION_KEY] === target.datum[INTERACTION_KEY])?.stroke).toBe(MUTED_HOVER_STROKE);
        expect(renderedBars.find((item) => item.datum[INTERACTION_KEY] === peer.datum[INTERACTION_KEY])?.opacity).toBe(0.8);

        view.change(INTERACTION_STORE, changeset().insert([{ key: target.datum[INTERACTION_KEY] }]));
        await view.runAsync();
        renderedBars = sceneItems(view).filter((item) => item.mark.marktype === 'rect' && item.datum[INTERACTION_KEY]);
        expect(renderedBars.find((item) => item.datum[INTERACTION_KEY] === peer.datum[INTERACTION_KEY])?.opacity).toBe(0.25);
    });

    it('resolves a ranged-dot click to its connector and both endpoints', () => {
        const semantics = rangedDotPlotDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Life expectancy', type: 'quantitative' },
                y: { field: 'Country', type: 'nominal' },
                color: { field: 'Sex', type: 'nominal' },
            },
        });
        const male = {
            datum: { [INTERACTION_KEY]: 'Japan|81.5|Male', Country: 'Japan', Sex: 'Male' },
            source: 'mark' as const,
            markType: 'symbol',
        };
        const female = {
            datum: { [INTERACTION_KEY]: 'Japan|87.6|Female', Country: 'Japan', Sex: 'Female' },
            source: 'mark' as const,
            markType: 'symbol',
        };
        const connector = {
            datum: {
                [INTERACTION_KEY]: `Japan|connector${PATH_KEY_SUFFIX}`,
                Country: 'Japan', Sex: 'Male', 'Life expectancy': 81.5,
            },
            endDatum: { Country: 'Japan', Sex: 'Female', 'Life expectancy': 87.6 },
            source: 'mark' as const,
            markType: 'line',
        };
        const other = {
            datum: { [INTERACTION_KEY]: 'Brazil|76|Female', Country: 'Brazil', Sex: 'Female' },
            source: 'mark' as const,
        };

        const target = semantics.resolve(
            { gesture: 'click', role: 'mark', hits: [male] },
            {
                allHits: [male, female, connector, other],
                keyField: INTERACTION_KEY,
                categoryField: 'Country',
                seriesField: 'Sex',
            },
        );

        expect(target?.elements.map((element) => semanticElementRenderKeys(element)[0])).toEqual([
            `Japan|connector${PATH_KEY_SUFFIX}`,
            'Japan|81.5|Male',
            'Japan|87.6|Female',
        ]);
        expect(target?.visual).toEqual({ kind: 'path', role: 'line' });
        expect(target?.elements[0].records).toEqual([
            { Country: 'Japan', Sex: 'Male', 'Life expectancy': 81.5 },
            connector.endDatum,
        ]);
        expect(semantics.presentUpdate!(
            annotationUpdate(target!.elements[0], target!.visual),
            { chartType: 'Ranged Dot Plot', selected: [], categoryField: 'Country', seriesField: 'Sex' },
        ).ops[0]).toMatchObject({
            value: {
                text: 'Male: 81.5, Female: 87.6',
                candidates: [{ connection: 'segment-midpoint', priority: 0 }],
            },
        });
    });

    it('formats a pie slice from its encoded category and value fields', () => {
        const semantics = pieChartDef.semanticInteractions!({
            resolvedEncodings: {
                color: { field: 'Browser', type: 'nominal' },
                size: { field: 'Share', type: 'quantitative' },
            },
        });
        const element = {
            value: { [INTERACTION_KEY]: 'Chrome' },
            records: [{ Browser: 'Chrome', Share: 65, Share_start: 0, Share_end: 65 }],
        };

        const update = semantics.presentUpdate!(
            annotationUpdate(element, { kind: 'mark', role: 'slice' }),
            { chartType: 'Pie Chart', selected: [], seriesField: 'Browser' },
        );

        expect(update.ops[0]).toMatchObject({ value: { text: 'Chrome: 65' } });
        expect((update.ops[0] as any).value.candidates).toEqual([
            { connection: 'radial-midpoint', priority: 0 },
            { connection: 'outer-radial', priority: 1 },
        ]);
    });

    it('keeps ranged-dot hover on the physical endpoint', () => {
        const resolve = rangedDotPlotDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Life expectancy', type: 'quantitative' },
                y: { field: 'Country', type: 'nominal' },
                color: { field: 'Sex', type: 'nominal' },
            },
        }).resolve;
        const male = {
            datum: { [INTERACTION_KEY]: 'Japan|81.5|Male', Country: 'Japan', Sex: 'Male' },
            source: 'mark' as const,
            markType: 'symbol',
        };

        const target = resolve(
            { gesture: 'hover', role: 'mark', hits: [male] },
            { allHits: [male], keyField: INTERACTION_KEY, categoryField: 'Country', seriesField: 'Sex' },
        );

        expect(target?.elements.map((element) => semanticElementRenderKeys(element)[0])).toEqual(['Japan|81.5|Male']);
        expect(target?.visual).toEqual({ kind: 'mark', role: 'point' });
    });

    it('highlights only the hovered legend item until it is clicked', async () => {
        const spec = assembleVegaLite({
            data: { values: [
                { Region: 'West', Segment: 'Consumer', Value: 10 },
                { Region: 'West', Segment: 'Corporate', Value: 12 },
                { Region: 'East', Segment: 'Consumer', Value: 8 },
                { Region: 'East', Segment: 'Corporate', Value: 9 },
            ] },
            semantic_types: { Region: 'Category', Segment: 'Category', Value: 'Quantity' },
            chart_spec: {
                chartType: 'Stacked Bar Chart',
                encodings: { x: 'Region', y: 'Value', color: 'Segment' },
            },
        } as never) as any;
        const { compiled } = instrument(spec, [clickMark()]);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        view.change(LEGEND_HOVER_STORE, changeset().insert([{ channel: 'color', value: 'Consumer' }]));
        await view.runAsync();

        const bars = sceneItems(view).filter((item) => item.mark.marktype === 'rect' && item.datum[INTERACTION_KEY]);
        expect(bars.every((item) => item.opacity === 1)).toBe(true);
        let legendItems = allSceneItems(view).filter((item) =>
            item.mark.role === 'legend-label' || item.mark.role === 'legend-symbol');
        expect(legendItems.filter((item) => item.datum.value === 'Corporate').every((item) => item.opacity === 1)).toBe(true);
        const legendLabels = legendItems.filter((item) => item.mark.role === 'legend-label');
        const consumerLabel = legendLabels.find((item) => item.datum.value === 'Consumer');
        const corporateLabel = legendLabels.find((item) => item.datum.value === 'Corporate');
        expect(consumerLabel?.opacity).toBe(1);
        expect(consumerLabel?.fontWeight).toBe(600);
        expect(corporateLabel?.fontWeight).not.toBe(600);
        const consumerSymbol = legendItems.find((item) =>
            item.mark.role === 'legend-symbol' && item.datum.value === 'Consumer');
        const corporateSymbol = legendItems.find((item) =>
            item.mark.role === 'legend-symbol' && item.datum.value === 'Corporate');
        expect(consumerSymbol?.opacity).toBe(0.72);
        expect(corporateSymbol?.opacity).toBe(1);

        view.change(LEGEND_HOVER_STORE, changeset().remove(() => true));
        view.change(LEGEND_SELECTION_STORE, changeset().insert([{ channel: 'color', value: 'Consumer' }]));
        const consumerKeys = bars
            .filter((item) => item.datum.Segment === 'Consumer')
            .map((item) => ({ key: item.datum[INTERACTION_KEY] }));
        view.change(INTERACTION_STORE, changeset().insert(consumerKeys));
        await view.runAsync();

        const selectedBars = sceneItems(view).filter((item) => item.mark.marktype === 'rect' && item.datum[INTERACTION_KEY]);
        expect(selectedBars.filter((item) => item.datum.Segment === 'Consumer').every((item) => item.opacity === 1)).toBe(true);
        expect(selectedBars.filter((item) => item.datum.Segment === 'Corporate').every((item) => item.opacity === 0.25)).toBe(true);
        legendItems = allSceneItems(view).filter((item) =>
            item.mark.role === 'legend-label' || item.mark.role === 'legend-symbol');
        expect(legendItems.filter((item) => item.datum.value === 'Consumer').every((item) => item.opacity === 1)).toBe(true);
        expect(legendItems.filter((item) => item.datum.value === 'Corporate').every((item) => item.opacity === 0.25)).toBe(true);

        view.change(LEGEND_SELECTION_STORE, changeset().remove(() => true));
        view.change(LEGEND_HIDDEN_STORE, changeset().insert([{ identity: 'color:Consumer', opacity: 0.25 }]));
        await view.runAsync();

        legendItems = allSceneItems(view).filter((item) =>
            item.mark.role === 'legend-label' || item.mark.role === 'legend-symbol');
        expect(legendItems.filter((item) => item.datum.value === 'Consumer').every((item) => item.opacity === 0.25)).toBe(true);
        expect(legendItems.filter((item) => item.datum.value === 'Corporate').every((item) => item.opacity === 1)).toBe(true);
    });

    it('acquires the whitespace between a legend symbol and its label as one entry', () => {
        const owner: any = {
            datum: { scales: { fill: 'color' } },
            mark: { marktype: 'group' },
            x: 100,
            y: 20,
            items: [],
        };
        const symbol = {
            datum: { value: 'Android' },
            mark: { marktype: 'symbol', role: 'legend-symbol', group: owner },
            bounds: { x1: 0, y1: 0, x2: 10, y2: 10 },
        };
        const label = {
            datum: { value: 'Android' },
            mark: { marktype: 'text', role: 'legend-label', group: owner },
            bounds: { x1: 20, y1: 0, x2: 70, y2: 10 },
        };
        owner.items = [symbol, label];
        const chartPoint = {
            datum: { [INTERACTION_KEY]: 'chart-point' },
            mark: { marktype: 'symbol' },
            bounds: { x1: 90, y1: 30, x2: 100, y2: 40 },
        };
        const view = { scenegraph: () => ({ root: { items: [owner] } }) };
        const viewWithChartPoint = {
            scenegraph: () => ({ root: { items: [owner, chartPoint] } }),
        };

        expect(legendEntryItemAtPoint(view, { x: 115, y: 25 })).toBe(symbol);
        expect(legendEntryItemAtPoint(view, { x: 90, y: 25 })).toBeNull();
        expect(nearestInteractiveSceneItem(view, { x: 90, y: 25 }, 12)).toBe(symbol);
        expect(nearestInteractiveSceneItem(
            view, { x: 0, y: 0 }, 12, { x: 90, y: 25 },
        )).toBe(symbol);
        expect(nearestInteractiveSceneItem(
            viewWithChartPoint, { x: 95, y: 35 }, 12, { x: 115, y: 35 }, false,
        )).toBe(symbol);
        expect(nearestInteractiveSceneItem(view, { x: 80, y: 25 }, 12)).toBeUndefined();
    });

    it('calculates keys inside a Bar Table panel with its own named data', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Category'], categoryField: 'Category', selectableMarks: ['bar'],
            },
            datasets: { rows: [{ Category: 'Alpha', Value: 10 }] },
            hconcat: [
                {
                    data: { name: 'rows' },
                    mark: 'bar',
                    transform: [{ aggregate: [{ op: 'sum', field: 'Value', as: 'Value' }], groupby: ['Category'] }],
                    encoding: {
                        x: { field: 'Value', type: 'quantitative' },
                        y: { field: 'Category', type: 'nominal' },
                        color: { value: '#41a25f' },
                    },
                },
                {
                    data: { name: 'rows' },
                    mark: 'text',
                    encoding: {
                        y: { field: 'Category', type: 'nominal' },
                        text: { field: 'Value', type: 'quantitative' },
                    },
                },
            ],
        };

        const { plan, compiled } = instrument(spec, [select()]);

        expect(plan).toMatchObject({ fields: ['Category'], categoryField: 'Category' });
        expect(spec.hconcat[0].transform).toContainEqual(expect.objectContaining({ as: INTERACTION_KEY }));
        expect(spec.hconcat[1].transform).toBeUndefined();
        expect(() => parse(compiled, undefined, { ast: true } as any)).not.toThrow();
    });

    it('uses template-owned quantitative fields for point identity', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Horsepower', 'Efficiency'],
                selectableMarks: ['circle'],
                markClick: 'element',
            },
            data: { values: [{ Horsepower: 120, Efficiency: 32 }] },
            mark: { type: 'circle', opacity: 0.7 },
            encoding: {
                x: { field: 'Horsepower', type: 'quantitative' },
                y: { field: 'Efficiency', type: 'quantitative' },
            },
        };

        const { plan, compiled } = instrument(spec, [clickMark(), select()]);

        expect(plan).toMatchObject({ fields: ['Horsepower', 'Efficiency'] });
        expect(spec).not.toHaveProperty('_interactionSemantics');
        expect(spec.encoding.opacity.condition.value).toBe(0.7);
        expect(() => parse(compiled, undefined, { ast: true } as any)).not.toThrow();
    });

    it('coalesces lollipop rule and circle layers under one semantic key', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Category', 'Value'],
                categoryField: 'Category',
                selectableMarks: ['rule', 'circle'],
                markClick: 'element',
            },
            data: { values: [{ Category: 'A', Value: 12 }] },
            layer: [
                {
                    mark: 'rule',
                    encoding: {
                        x: { field: 'Category', type: 'nominal' },
                        y: { field: 'Value', type: 'quantitative' },
                        y2: { datum: 0 },
                    },
                },
                {
                    mark: 'circle',
                    encoding: {
                        x: { field: 'Category', type: 'nominal' },
                        y: { field: 'Value', type: 'quantitative' },
                    },
                },
            ],
        };

        const { plan, compiled } = instrument(spec, [select()]);

        expect(plan).toMatchObject({ fields: ['Category', 'Value'], categoryField: 'Category' });
        expect(spec.layer[0].encoding.opacity.condition.test).toContain(INTERACTION_STORE);
        expect(spec.layer[1].encoding.opacity.condition.test).toContain(INTERACTION_STORE);
        expect(() => parse(compiled, undefined, { ast: true } as any)).not.toThrow();
    });

    it('dims independent text labels without instrumenting unrelated annotations', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Category', 'Value'],
                categoryField: 'Category',
                selectableMarks: ['bar'],
            },
            data: {
                values: [
                    { Category: 'A', Value: 12 },
                    { Category: 'B', Value: 8 },
                ],
            },
            layer: [
                {
                    mark: 'bar',
                    encoding: {
                        x: { field: 'Category', type: 'nominal' },
                        y: { field: 'Value', type: 'quantitative' },
                    },
                },
                {
                    [INTERACTION_PROVENANCE]: {
                        role: 'text-label',
                        identity: 'inherit',
                        presentation: 'independent',
                    },
                    mark: { type: 'text', dy: -6 },
                    encoding: {
                        x: { field: 'Category', type: 'nominal' },
                        y: { field: 'Value', type: 'quantitative' },
                        text: { field: 'Value', type: 'quantitative' },
                    },
                },
                {
                    mark: { type: 'text', dy: 12 },
                    encoding: {
                        x: { datum: 'A', type: 'nominal' },
                        y: { datum: 0, type: 'quantitative' },
                        text: { value: 'Reference' },
                    },
                },
            ],
        };

        const { plan, compiled } = instrument(spec, [clickMark()]);

        expect(plan).not.toBeNull();
        expect(spec.layer[0].encoding.opacity.condition.test).toContain(INTERACTION_STORE);
        expect(spec.layer[1].encoding.opacity.condition.test).toContain(INTERACTION_STORE);
        expect(spec.layer[0].mark.cursor).toBeUndefined();
        expect(spec.layer[1].mark.cursor).toBeUndefined();
        expect(spec.layer[2].encoding.opacity).toBeUndefined();
        expect(() => parse(compiled, undefined, { ast: true } as any)).not.toThrow();
    });

    it('carries generated on-mark label provenance without double opacity', () => {
        const spec = assembleVegaLite({
            data: {
                values: [
                    { Category: 'A', Value: 12 },
                    { Category: 'B', Value: 8 },
                ],
            },
            semantic_types: { Category: 'Category', Value: 'Quantity' },
            chart_spec: {
                chartType: 'Bar Chart',
                encodings: { x: 'Category', y: 'Value' },
                chartProperties: { showValueLabels: true },
            },
            theme_spec: 'economist',
        } as never) as Record<string, any>;

        const generatedLabel = spec.layer.find((layer: Record<string, any>) => layer.mark?.type === 'text');
        expect(generatedLabel?.[INTERACTION_PROVENANCE]).toEqual({
            role: 'text-label',
            identity: 'inherit',
            presentation: 'on-mark',
        });

        const { compiled } = instrument(spec, [clickMark()]);

        expect(generatedLabel.encoding.opacity).toBeUndefined();
        expect(generatedLabel.transform).toContainEqual({
            calculate: "'text-label'",
            as: INTERACTION_ROLE,
        });
        expect(JSON.stringify(spec)).not.toContain(INTERACTION_PROVENANCE);
        expect(() => parse(compiled, undefined, { ast: true } as any)).not.toThrow();
    });

    it('resolves tagged label hits while leaving untagged text inert', () => {
        const datum = { [INTERACTION_KEY]: 'A|12' };
        const mark = { marktype: 'text', name: 'value-label' };

        expect(renderHit({ mark, datum })).toBeNull();
        expect(renderHit({
            mark,
            datum: { ...datum, [INTERACTION_ROLE]: 'text-label' },
        })).toMatchObject({
            datum: { [INTERACTION_KEY]: 'A|12', [INTERACTION_ROLE]: 'text-label' },
            source: 'mark',
            markType: 'text',
            layerRole: 'text-label',
        });
    });

    it('acquires a generated series-end label as an exact legend domain', () => {
        const item = {
            mark: { marktype: 'text', name: 'series-end-label' },
            datum: {
                [INTERACTION_KEY]: '2024|China|2',
                [INTERACTION_ROLE]: 'legend-label',
                [INTERACTION_LEGEND_CHANNEL]: 'color',
                [INTERACTION_LEGEND_FIELD]: 'Country',
                Country: 'China',
            },
        };
        const normalized = normalizeVegaElementEvent(
            {}, item, { x: 10, y: 10 }, 'commit',
            { shift: false, ctrl: false, meta: false }, { color: 'Country' },
        );

        expect(normalized.role).toBe('legend-item');
        expect(normalized.legend).toEqual({
            channel: 'color', field: 'Country', value: 'China',
            domain: { kind: 'value', value: 'China' },
        });
        expect(legendSemanticTarget(normalized.legend)?.elements[0]).toEqual({
            value: {
                channel: 'color', field: 'Country',
                domain: { kind: 'value', value: 'China' },
            },
        });
    });

    it('compiles Bump series-end labels as semantic legend labels', () => {
        const spec = assembleVegaLite({
            data: { values: [
                { Games: 2012, Country: 'United States', Rank: 1 },
                { Games: 2024, Country: 'United States', Rank: 1 },
                { Games: 2012, Country: 'China', Rank: 2 },
                { Games: 2024, Country: 'China', Rank: 2 },
            ] },
            semantic_types: { Games: 'Year', Country: 'Country', Rank: 'Rank' },
            chart_spec: {
                chartType: 'Bump Chart',
                encodings: { x: 'Games', y: 'Rank', color: 'Country' },
            },
            theme_spec: 'nyt',
        } as never) as Record<string, any>;
        const label = spec.layer.find((layer: Record<string, any>) =>
            layer[INTERACTION_PROVENANCE]?.role === 'legend-label');

        expect(label?.[INTERACTION_PROVENANCE]).toMatchObject({
            role: 'legend-label',
            legend: { channel: 'color', field: 'Country' },
        });
        instrument(spec, [clickMark()]);
        expect(label.transform).toEqual(expect.arrayContaining([
            { calculate: "'legend-label'", as: INTERACTION_ROLE },
            { calculate: '"color"', as: INTERACTION_LEGEND_CHANNEL },
            { calculate: '"Country"', as: INTERACTION_LEGEND_FIELD },
        ]));
        expect(label.mark.cursor).toBeUndefined();
    });

    it('preserves the second datum of a clicked line segment', () => {
        const mark = { marktype: 'line', name: 'trend' };
        const start = { [INTERACTION_KEY]: 'A', Month: 'Jan', Sales: 10 };
        const end = { [INTERACTION_KEY]: 'B', Month: 'Feb', Sales: 14 };
        const hit = renderHit({
            mark,
            datum: start,
            interactionGeometry: { endDatum: end },
        })!;
        const resolve = lineChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Month', type: 'nominal' },
                y: { field: 'Sales', type: 'quantitative' },
            },
        }).resolve;

        const target = resolve(
            { gesture: 'click', role: 'mark', hits: [hit] },
            { allHits: [hit], keyField: INTERACTION_KEY, categoryField: 'Month' },
        );

        expect(target?.visual).toEqual({ kind: 'path', role: 'line' });
        expect(target?.elements[0].records).toEqual([
            { Month: 'Jan', Sales: 10 },
            { Month: 'Feb', Sales: 14 },
        ]);
    });

    it('keeps a mark click local without a declared series', () => {
        const resolve = barChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Region', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
            },
        }).resolve;
        const westConsumer = { datum: { [INTERACTION_KEY]: 'West|Consumer', Region: 'West' }, source: 'mark' as const };
        const westCorporate = { datum: { [INTERACTION_KEY]: 'West|Corporate', Region: 'West' }, source: 'mark' as const };
        const eastConsumer = { datum: { [INTERACTION_KEY]: 'East|Consumer', Region: 'East' }, source: 'mark' as const };

        const target = resolve(
            { gesture: 'click', role: 'mark', hits: [westConsumer] },
            {
                allHits: [westConsumer, westCorporate, eastConsumer],
                keyField: INTERACTION_KEY,
                categoryField: 'Region',
            },
        );

        expect(target?.elements.map((element) => semanticElementRenderKeys(element)[0])).toEqual(['West|Consumer']);
    });

    it('keeps a mark click local when a series field is declared', () => {
        const resolve = barChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Region', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
                color: { field: 'Segment', type: 'nominal' },
            },
        }).resolve;
        const westConsumer = { datum: { [INTERACTION_KEY]: 'West|Consumer', Segment: 'Consumer' }, source: 'mark' as const };
        const westCorporate = { datum: { [INTERACTION_KEY]: 'West|Corporate', Segment: 'Corporate' }, source: 'mark' as const };
        const eastConsumer = { datum: { [INTERACTION_KEY]: 'East|Consumer', Segment: 'Consumer' }, source: 'mark' as const };

        const target = resolve(
            { gesture: 'click', role: 'mark', hits: [westConsumer] },
            {
                allHits: [westConsumer, westCorporate, eastConsumer],
                keyField: INTERACTION_KEY,
                seriesField: 'Segment',
            },
        );

        expect(target?.elements.map((element) => semanticElementRenderKeys(element)[0])).toEqual(['West|Consumer']);
    });

    it.each(['click', 'hover'] as const)('lets the template resolver expand a legend %s to its series cohort', (gesture) => {
        const resolve = barChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Region', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
                color: { field: 'Segment', type: 'nominal' },
            },
        }).resolve;
        const westConsumer = { datum: { [INTERACTION_KEY]: 'West|Consumer', Segment: 'Consumer' }, source: 'mark' as const };
        const westCorporate = { datum: { [INTERACTION_KEY]: 'West|Corporate', Segment: 'Corporate' }, source: 'mark' as const };
        const eastConsumer = { datum: { [INTERACTION_KEY]: 'East|Consumer', Segment: 'Consumer' }, source: 'mark' as const };

        const target = resolve(
            { gesture, role: 'legend-item', hits: [], legend: { domain: { kind: 'value', value: 'Consumer' } } },
            {
                allHits: [westConsumer, westCorporate, eastConsumer],
                keyField: INTERACTION_KEY,
                seriesField: 'Segment',
            },
        );

        expect(target?.elements.map((element) => semanticElementRenderKeys(element)[0])).toEqual([
            'West|Consumer',
            'East|Consumer',
        ]);
    });

    it('retains domain-only legend identity for toggle processing', () => {
        const interaction = createLegendToggleInteraction();
        const target = legendSemanticTarget({
            channel: 'color', field: 'Segment', value: 'Consumer',
            domain: { kind: 'value', value: 'Consumer' },
        });
        const update = interaction.handle!({
            action: 'click-primary', phase: 'commit', target,
        } as any, { available: [], selected: [] } as any);

        expect(update?.ops[0]).toMatchObject({
            op: 'set-style',
            targets: [{
                visual: { kind: 'legend', role: 'legend-item' },
                elements: target?.elements,
            }],
            value: { visible: false },
        });

        const restored = interaction.handle!({
            action: 'click-primary', phase: 'commit',
            target: {
                ...target!,
                elements: target!.elements.map((element) => ({
                    ...element,
                    records: [{ Segment: 'Consumer' }],
                })),
            },
        } as any, { available: [], selected: [] } as any);
        expect(restored?.ops[0]).toMatchObject({
            op: 'set-style',
            targets: [],
            value: { visible: false },
        });
    });

    it('resolves an unmatched legend domain to an explicit empty presentation', () => {
        const legend = {
            channel: 'color', field: '__status',
            domain: { kind: 'value' as const, value: 'Meets target' },
        };
        const target = resolveLegendPresentationTarget(
            legend,
            () => null,
            { allHits: [], keyField: INTERACTION_KEY },
        );

        expect(target).toMatchObject({
            visual: { kind: 'legend', role: 'legend-item' },
            elements: [{ value: legend }],
        });
        expect(target.elements[0].records).toBeUndefined();
        expect(semanticElementRenderKeys(target.elements[0])).toHaveLength(1);
    });

    it('retains concrete keys for legend domains already hidden from the scene', () => {
        const resolve = barChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Region', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
                color: { field: 'Segment', type: 'nominal' },
            },
        }).resolve;
        const consumer = {
            datum: { [INTERACTION_KEY]: 'West|Consumer', Segment: 'Consumer' },
            source: 'mark' as const,
        };
        const corporate = {
            datum: { [INTERACTION_KEY]: 'West|Corporate', Segment: 'Corporate' },
            source: 'mark' as const,
        };
        const legend = {
            channel: 'color', field: 'Segment',
            domain: { kind: 'value' as const, value: 'Consumer' },
        };
        const retained = new Map<string, SemanticTarget>();

        resolveRetainedLegendPresentationTarget(
            legend, resolve,
            { allHits: [consumer, corporate], keyField: INTERACTION_KEY, seriesField: 'Segment' },
            retained,
        );
        const afterConsumerIsHidden = resolveRetainedLegendPresentationTarget(
            legend, resolve,
            { allHits: [corporate], keyField: INTERACTION_KEY, seriesField: 'Segment' },
            retained,
        );

        expect(afterConsumerIsHidden.elements.flatMap(semanticElementRenderKeys)).toEqual(['West|Consumer']);
    });

    it('resolves every domain in a combined hidden legend target', () => {
        const resolve = barChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Region', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
                color: { field: 'Segment', type: 'nominal' },
            },
        }).resolve;
        const hits = ['Consumer', 'Corporate'].map((Segment) => ({
            datum: { [INTERACTION_KEY]: `West|${Segment}`, Segment },
            source: 'mark' as const,
        }));
        const legends = ['Consumer', 'Corporate'].map((value) => ({
            channel: 'color', field: 'Segment',
            domain: { kind: 'value' as const, value },
        }));

        const target = resolveRetainedLegendPresentationTargets(
            legends, resolve,
            { allHits: hits, keyField: INTERACTION_KEY, seriesField: 'Segment' },
            new Map(),
        );

        expect(target.elements.flatMap(semanticElementRenderKeys)).toEqual([
            'West|Consumer',
            'West|Corporate',
        ]);
    });

    it('removes a Streamgraph ribbon with the keys resolved from its legend domain', async () => {
        const spec = assembleVegaLite({
            data: { values: [
                { Year: 2000, Region: 'Asia', Population: 10 },
                { Year: 2010, Region: 'Asia', Population: 12 },
                { Year: 2020, Region: 'Asia', Population: 14 },
                { Year: 2000, Region: 'Africa', Population: 4 },
                { Year: 2010, Region: 'Africa', Population: 6 },
                { Year: 2020, Region: 'Africa', Population: 8 },
            ] },
            semantic_types: { Year: 'Year', Region: 'Category', Population: 'Quantity' },
            chart_spec: {
                chartType: 'Streamgraph',
                encodings: { x: 'Year', y: 'Population', color: 'Region' },
            },
        } as never) as any;
        const { plan, compiled } = instrument(spec, [legendToggle()]);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const hits = sceneItems(view).map(renderHit).filter((hit): hit is RenderHit => hit !== null);
        const target = plan!.resolve!({
            gesture: 'click', role: 'legend-item', hits: [],
            legend: { channel: 'color', field: 'Region', domain: { kind: 'value', value: 'Asia' } },
        }, {
            allHits: hits,
            keyField: INTERACTION_KEY,
            seriesField: 'Region',
        });
        const keys = target!.elements.flatMap(semanticElementRenderKeys);
        const renderedAreaKeys = hits
            .filter((hit) => hit.markType === 'area' && hit.datum.Region === 'Asia')
            .map((hit) => hit.datum[INTERACTION_KEY]);

        view.change(HIDDEN_STORE, changeset().insert(keys.map((key) => ({ key }))));
        await view.runAsync();

        const remainingRegions = sceneItems(view)
            .filter((item) => item.mark.marktype === 'area')
            .map((item) => item.datum.Region);
        expect(keys.filter((key) => key.endsWith(PATH_KEY_SUFFIX))).toEqual(renderedAreaKeys);
        expect(keys.filter((key) => !key.endsWith(PATH_KEY_SUFFIX))).toHaveLength(3);
        expect(remainingRegions).not.toContain('Asia');
        expect(remainingRegions).toContain('Africa');
    });

    it('resolves color and shape legends by their own fields', () => {
        const resolve = scatterPlotDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'X', type: 'quantitative' },
                y: { field: 'Y', type: 'quantitative' },
                color: { field: 'Color', type: 'nominal' },
                shape: { field: 'Shape', type: 'nominal' },
            },
        }).resolve;
        const hits = [
            { datum: { [INTERACTION_KEY]: 'a', Color: 'Blue', Shape: 'Circle' }, source: 'mark' as const },
            { datum: { [INTERACTION_KEY]: 'b', Color: 'Orange', Shape: 'Circle' }, source: 'mark' as const },
            { datum: { [INTERACTION_KEY]: 'c', Color: 'Blue', Shape: 'Square' }, source: 'mark' as const },
        ];
        const context = { allHits: hits, keyField: INTERACTION_KEY, seriesField: 'Color' };

        const color = resolve(
            { gesture: 'click', role: 'legend-item', hits: [], legend: { field: 'Color', domain: { kind: 'value', value: 'Blue' } } },
            context,
        );
        const shape = resolve(
            { gesture: 'click', role: 'legend-item', hits: [], legend: { field: 'Shape', domain: { kind: 'value', value: 'Circle' } } },
            context,
        );

        expect(color?.elements.map((element) => semanticElementRenderKeys(element)[0])).toEqual(['a', 'c']);
        expect(shape?.elements.map((element) => semanticElementRenderKeys(element)[0])).toEqual(['a', 'b']);
    });

    it('resolves a size legend independently from color', () => {
        const resolve = scatterPlotDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'X', type: 'quantitative' },
                y: { field: 'Y', type: 'quantitative' },
                color: { field: 'Color', type: 'nominal' },
                size: { field: 'Size', type: 'nominal' },
            },
        }).resolve;
        const hits = [
            { datum: { [INTERACTION_KEY]: 'a', Color: 'Blue', Size: 'Large' }, source: 'mark' as const },
            { datum: { [INTERACTION_KEY]: 'b', Color: 'Orange', Size: 'Large' }, source: 'mark' as const },
            { datum: { [INTERACTION_KEY]: 'c', Color: 'Blue', Size: 'Small' }, source: 'mark' as const },
        ];
        const target = resolve(
            { gesture: 'click', role: 'legend-item', hits: [], legend: { field: 'Size', domain: { kind: 'value', value: 'Large' } } },
            { allHits: hits, keyField: INTERACTION_KEY, seriesField: 'Color' },
        );

        expect(target?.elements.map((element) => semanticElementRenderKeys(element)[0])).toEqual(['a', 'b']);
    });

    it('keeps color exact while treating size as a range when both legends exist', () => {
        const spec = assembleVegaLite({
            data: {
                values: [
                    { gdp: 1000, life: 66, continent: 'Africa', population: 40 },
                    { gdp: 30000, life: 84, continent: 'Asia', population: 1200 },
                ],
            },
            semantic_types: {
                gdp: 'Quantity', life: 'Quantity', continent: 'Category', population: 'Quantity',
            },
            chart_spec: {
                chartType: 'Scatter Plot',
                encodings: { x: 'gdp', y: 'life', color: 'continent', size: 'population' },
            },
        } as any) as any;

        expect(spec._interactionSemantics.legendFields).toEqual({
            color: 'continent',
            size: 'population',
        });
        expect(spec._interactionSemantics.rangeLegendChannels).toEqual(['size']);
    });

    it('resolves a sampled quantitative legend anchor to its midpoint range', () => {
        const hits = [1, 3, 5, 7, 9].map((Size) => ({
            datum: { [INTERACTION_KEY]: String(Size), Size },
            source: 'mark' as const,
        }));
        const matched = legendMatchedHits(
            {
                gesture: 'click',
                role: 'legend-item',
                hits: [],
                legend: { field: 'Size', domain: { kind: 'interval', start: 2.5, end: 7.5 } },
            },
            { allHits: hits, keyField: INTERACTION_KEY },
            'Size',
        );

        expect(matched.map((hit) => hit.datum.Size)).toEqual([3, 5, 7]);
    });

    it('resolves a smooth legend ramp position to a sampled interval', () => {
        const legendEntry: any = {
            datum: { scales: { fill: 'color' }, type: 'gradient', vgrad: false },
            mark: { marktype: 'group' },
            x: 100,
            y: 20,
            items: [],
        };
        const gradient = {
            datum: legendEntry.datum,
            mark: { marktype: 'rect', role: 'legend-gradient', group: legendEntry },
            bounds: { x1: 0, y1: 0, x2: 100, y2: 12 },
        };
        legendEntry.items = [
            gradient,
            ...[0, 5, 10].map((value, index) => ({
                datum: { value, index, perc: index / 2 },
                mark: { marktype: 'text', role: 'legend-label', group: legendEntry },
            })),
        ];
        const root = { mark: { marktype: 'group' }, items: [legendEntry] };
        const scale = Object.assign((value: number) => value, {
            type: 'sequential-linear',
            domain: () => [0, 10],
        });
        const view = { scenegraph: () => ({ root }), scale: () => scale };

        const target = legendTarget(gradient, { color: 'Temperature' }, ['color'], view, { x: 190, y: 26 });
        expect(target).toMatchObject({
            channel: 'color', field: 'Temperature',
            domain: { kind: 'interval' },
            visualBounds: { x2: 200, y1: 20, y2: 32 },
        });
        expect(target?.value).toBeCloseTo(25 / 3);
        expect(target?.domain.kind === 'interval' ? target.domain.start : undefined).toBeCloseTo(20 / 3);
        expect(target?.visualBounds?.x1).toBeCloseTo(500 / 3);
    });

    it('adapts smooth legend segments to physical length and value cardinality', () => {
        expect(continuousLegendSegmentCount(80)).toBe(3);
        expect(continuousLegendSegmentCount(176)).toBe(4);
        expect(continuousLegendSegmentCount(220)).toBe(5);
        expect(continuousLegendSegmentCount(400)).toBe(7);
        expect(continuousLegendSegmentCount(220, 2)).toBe(2);
    });

    it('resolves each discrete legend band to its exact interval', () => {
        const legendEntry: any = {
            datum: { scales: { fill: 'color' }, type: 'discrete', vgrad: false },
            mark: { marktype: 'group' },
            items: [],
        };
        const bands = [-Infinity, 3, 6, 9].map((value, index) => ({
            datum: { value, index, perc: index / 4, perc2: (index + 1) / 4 },
            mark: { marktype: 'rect', role: 'legend-band', group: legendEntry },
        }));
        legendEntry.items = bands;

        expect(legendTarget(bands[2], { color: 'Temperature' }, ['color']))
            .toEqual({
                channel: 'color', field: 'Temperature', value: 6,
                domain: { kind: 'interval', start: 6, end: 9 },
            });
        expect(legendTarget(bands[0], { color: 'Temperature' }, ['color']))
            .toEqual({
                channel: 'color', field: 'Temperature', value: -Infinity,
                domain: { kind: 'interval', end: 3 },
            });
    });

    it.each([
        ['default', undefined, 'legend-gradient'],
        ['quantized theme', THEME_PRESETS.datawrapper.spec, 'legend-band'],
    ] as const)('targets the painted Heatmap legend under the %s', async (_name, theme, role) => {
        const spec = assembleVegaLite({
            data: { values: [
                { Month: 'Jan', City: 'A', Temperature: -10 },
                { Month: 'Feb', City: 'A', Temperature: 0 },
                { Month: 'Mar', City: 'A', Temperature: 10 },
            ] },
            semantic_types: { Month: 'Category', City: 'Category', Temperature: 'Quantity' },
            chart_spec: {
                chartType: 'Heatmap',
                encodings: { x: 'Month', y: 'City', color: 'Temperature' },
            },
            ...(theme ? { theme_spec: theme } : {}),
        } as any) as any;
        const { compiled, plan } = instrument(spec);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const item = allSceneItems(view).find((candidate) => candidate.mark?.role === role);
        const bounds = rootSceneBounds(view, item);
        const point = bounds ? {
            x: bounds.x1 + (bounds.x2 - bounds.x1) * 0.75,
            y: bounds.y1 + (bounds.y2 - bounds.y1) * 0.5,
        } : undefined;
        const target = legendTarget(item, { color: 'Temperature' }, ['color'], view, point);

        expect(item).toBeDefined();
        expect(item.mark.interactive).toBe(true);
        expect(target).toMatchObject({ channel: 'color', field: 'Temperature' });
        expect(target?.domain.kind).toBe('interval');
        if (role === 'legend-band') {
            view.change(LEGEND_SELECTION_STORE, changeset().insert([{
                channel: 'color',
                value: item.datum.value,
            }]));
            await view.runAsync();
            const bands = allSceneItems(view).filter((candidate) => candidate.mark?.role === role);
            const selectedBand = bands.find((candidate) => candidate.datum.value === item.datum.value);
            expect(selectedBand?.stroke).toBe(plan?.selectionBoundary?.color);
            expect(selectedBand?.strokeWidth).toBe(plan?.selectionBoundary?.width);
            expect(selectedBand?.strokeOpacity).toBe(plan?.selectionBoundary?.opacity);
            expect(bands.filter((candidate) => candidate.datum.value !== item.datum.value)
                .every((candidate) => !candidate.strokeWidth)).toBe(true);
        }
    });

    it('matches temporal values against numeric legend intervals', () => {
        const hits = ['2024-01-01', '2024-02-01', '2024-03-01'].map((date) => ({
            datum: { [INTERACTION_KEY]: date, Date: new Date(`${date}T00:00:00Z`) },
            source: 'mark' as const,
        }));
        const matched = legendMatchedHits({
            gesture: 'click', role: 'legend-item', hits: [],
            legend: {
                field: 'Date',
                domain: { kind: 'interval', start: Date.UTC(2024, 0, 15), end: Date.UTC(2024, 2, 1) },
            },
        }, { allHits: hits, keyField: INTERACTION_KEY }, 'Date');

        expect(matched.map((hit) => hit.datum.Date)).toEqual([new Date('2024-02-01T00:00:00Z')]);
    });

    it.each([
        ['Heatmap', heatmapDef, {
            x: { field: 'Month', type: 'nominal' },
            y: { field: 'City', type: 'nominal' },
            color: { field: 'Temperature', type: 'quantitative' },
        }],
        ['Calendar Heatmap', vlCalendarHeatmapDef, {
            x: { field: 'Date', type: 'temporal' },
            color: { field: 'Temperature', type: 'quantitative' },
        }],
        ['Choropleth', choroplethDef, {
            id: { field: 'State', type: 'nominal' },
            color: { field: 'Temperature', type: 'quantitative' },
        }],
    ] as const)('resolves a continuous %s legend interval to matching marks', (_name, chartDef, encodings) => {
        const semantics = chartDef.semanticInteractions!({ resolvedEncodings: encodings });
        const hits = [-17, -6, 6, 17].map((Temperature, index) => ({
            datum: {
                [INTERACTION_KEY]: String(index), Temperature,
                sum_Temperature: Temperature,
                Month: `M${index}`, City: 'A', State: `S${index}`,
            },
            source: 'mark' as const,
        }));
        const target = semantics.resolve({
            gesture: 'click', role: 'legend-item', hits: [],
            legend: { field: 'Temperature', domain: { kind: 'interval', start: 0, end: 12 } },
        }, { allHits: hits, keyField: INTERACTION_KEY });

        expect(semantics.legendFields).toEqual({ color: 'Temperature' });
        expect(target?.elements.map((element) => element.value.Temperature)).toEqual([6]);
    });

    it('applies a Calendar legend range to the matching rendered cells', async () => {
        const spec = assembleVegaLite({
            data: { values: [
                { Date: '2024-01-01', Temperature: 10 },
                { Date: '2024-01-02', Temperature: 50 },
                { Date: '2024-01-03', Temperature: 90 },
            ] },
            semantic_types: { Date: 'Date', Temperature: 'Quantity' },
            chart_spec: {
                chartType: 'Calendar Heatmap',
                encodings: { x: 'Date', color: 'Temperature' },
            },
        } as any) as any;
        expect(spec._interactionSemantics.neutralizeContinuousColor).toBe(false);
        expect(spec._interactionSemantics.continuousColorFocus.boundaryWidth).toBeLessThan(
            spec._interactionSemantics.selectionBoundary.width,
        );
        const { compiled, plan } = instrument(spec);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const hits = sceneItems(view).map(renderHit).filter((hit): hit is NonNullable<typeof hit> => !!hit);
        const semantics = vlCalendarHeatmapDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Date', type: 'temporal' },
                color: { field: 'Temperature', type: 'quantitative' },
            },
        });
        const target = semantics.resolve({
            gesture: 'hover', role: 'legend-item', hits: [],
            legend: { field: 'Temperature', domain: { kind: 'interval', start: 70, end: 100 } },
        }, { allHits: hits, keyField: INTERACTION_KEY });
        const keys = target?.elements.flatMap(semanticElementRenderKeys) ?? [];
        const legendPayload = legendSemanticTarget({
            channel: 'color', field: 'Temperature', value: 90,
            domain: { kind: 'interval', start: 70, end: 100 },
        });

        expect(keys).toHaveLength(1);
        expect(legendPayload).toEqual({
            visual: { kind: 'legend', role: 'legend-item' },
            elements: [{ value: {
                channel: 'color', field: 'Temperature',
                domain: { kind: 'interval', start: 70, end: 100 },
            } }],
        });
        expect(semanticElementRenderKeys(legendPayload!.elements[0])).toEqual([]);
        view.change(INTERACTION_STORE, changeset().insert(keys.map((key) => ({ key }))));
        await view.runAsync();
        const cells = allSceneItems(view).filter((item) => item.mark?.marktype === 'rect'
            && item.datum?.sum_Temperature !== undefined);
        expect(cells.find((item) => item.datum.sum_Temperature === 90)?.opacity).toBe(1);
        expect(cells.filter((item) => item.datum.sum_Temperature !== 90)
            .every((item) => item.opacity === plan?.dimOpacity)).toBe(true);
    });

    it('neutralizes muted continuous color only for geographic maps', () => {
        const spec = assembleVegaLite({
            data: { values: [
                { lon: -74, lat: 40.7, temperature: 20 },
                { lon: -118, lat: 34, temperature: 35 },
            ] },
            semantic_types: {
                lon: 'Longitude', lat: 'Latitude', temperature: 'Quantity',
            },
            chart_spec: {
                chartType: 'Map',
                encodings: { longitude: 'lon', latitude: 'lat', color: 'temperature' },
            },
        } as any) as any;
        const style = spec._interactionSemantics.continuousColorFocus;

        expect(spec._interactionSemantics.neutralizeContinuousColor).toBe(true);
        instrument(spec);
        const points = spec.layer.find((layer: Record<string, any>) =>
            layer.mark?.type === 'circle' || layer.mark === 'circle');
        expect(points.encoding.color).toMatchObject({
            condition: { field: 'temperature', type: 'quantitative' },
            value: style.mutedFill,
        });
        expect(points.encoding.opacity).toEqual({ value: 1 });
    });

    it('treats a Map quantitative size key as sampled ranges', () => {
        const assembled = assembleVegaLite({
            data: { values: [{ lon: -74, lat: 40.7, pop: 5 }] },
            semantic_types: { lon: 'Longitude', lat: 'Latitude', pop: 'Quantity' },
            chart_spec: {
                chartType: 'Map',
                encodings: { longitude: 'lon', latitude: 'lat', size: 'pop' },
            },
        } as any) as any;
        const semantics = mapDef.semanticInteractions!({
            resolvedEncodings: {
                longitude: { field: 'lon', type: 'quantitative' },
                latitude: { field: 'lat', type: 'quantitative' },
                size: { field: 'pop', type: 'quantitative' },
            },
        });
        const legendEntry = {
            datum: { scales: { size: 'size' } },
            items: [0, 5, 10, 15].map((value) => ({ datum: { value } })),
        };
        const item = {
            datum: { value: 5 },
            mark: {
                role: 'legend-label',
                group: { mark: { group: legendEntry } },
            },
        };
        const rangeLegendChannels = assembled._interactionSemantics.rangeLegendChannels;
        const legend = legendTarget(item, semantics.legendFields, rangeLegendChannels);

        expect(semantics.legendFields).toEqual({ size: 'pop' });
        expect(rangeLegendChannels).toEqual(['size']);
        expect(legend).toEqual({
            channel: 'size',
            field: 'pop',
            value: 5,
            domain: { kind: 'interval', start: 2.5, end: 7.5 },
        });
        const hits = [2.9, 4.9, 6.3, 7.6, 12.4].map((pop) => ({
            datum: { [INTERACTION_KEY]: String(pop), pop },
            source: 'mark' as const,
        }));
        const target = semantics.resolve({
            gesture: 'click',
            role: 'legend-item',
            hits: [],
            legend: legend ?? undefined,
        }, {
            allHits: hits,
            keyField: INTERACTION_KEY,
        });
        const semanticLegend = legendSemanticTarget(legend);

        expect(semanticLegend?.elements[0].value).toEqual({
            channel: 'size',
            field: 'pop',
            domain: { kind: 'interval', start: 2.5, end: 7.5 },
        });
        expect(target?.elements.flatMap((element) => element.records ?? []).map((record) => record.pop))
            .toEqual([2.9, 4.9, 6.3]);
    });

    it('resolves Waterfall synthesized legend entries to rendered bar cohorts', () => {
        const semantics = waterfallChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Step', type: 'ordinal' },
                y: { field: 'Population', type: 'quantitative' },
            },
        });
        const hits = [
            { datum: { [INTERACTION_KEY]: '1950', Step: '1950', __wf_color: 'total' }, source: 'mark' as const },
            { datum: { [INTERACTION_KEY]: 'Asia', Step: 'Asia', __wf_color: 'increase' }, source: 'mark' as const },
            { datum: { [INTERACTION_KEY]: 'Africa', Step: 'Africa', __wf_color: 'increase' }, source: 'mark' as const },
            { datum: { [INTERACTION_KEY]: 'Oceania', Step: 'Oceania', __wf_color: 'total' }, source: 'mark' as const },
        ];

        expect(semantics.legendFields).toEqual({ color: '__wf_color' });
        const target = semantics.resolve({
            gesture: 'click',
            role: 'legend-item',
            hits: [],
            legend: { field: '__wf_color', domain: { kind: 'value', value: 'increase' } },
        }, {
            allHits: hits,
            keyField: INTERACTION_KEY,
        });
        expect(target?.elements.flatMap(semanticElementRenderKeys)).toEqual(['Asia', 'Africa']);
    });

    it('presents derived Waterfall ranges after source provenance enrichment', () => {
        const semantics = waterfallChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Step', type: 'ordinal' },
                y: { field: 'Population', type: 'quantitative' },
            },
        });
        const element = {
            value: { Step: 'Asia', __wf_prev_sum: 2_537, __wf_sum: 5_779 },
            records: [{ Step: 'Asia', Population: 3_242 }],
        };

        expect(semantics.presentUpdate!(
            annotationUpdate(element, { kind: 'mark', role: 'waterfall-step' }),
            { chartType: 'Waterfall Chart', selected: [] },
        ).ops[0]).toMatchObject({ value: { text: '2,537 → 5,779' } });
    });

    it('presents a Sparkline segment transition', () => {
        const semantics = sparklineDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Month', type: 'temporal' },
                y: { field: 'Value', type: 'quantitative' },
                row: { field: 'Metric', type: 'nominal' },
            },
        });
        const element = {
            value: { Month: 'Mar', Metric: 'Active users', Value: 42 },
            records: [
                { Month: 'Mar', Metric: 'Active users', Value: 42 },
                { Month: 'Apr', Metric: 'Active users', Value: 54 },
            ],
        };

        const update = semantics.presentUpdate!(
            annotationUpdate(element, { kind: 'path', role: 'line' }),
            { chartType: 'Sparkline', selected: [] },
        );
        expect(update.ops[0]).toMatchObject({
            value: {
                text: '42 → 54',
            },
        });
        expect((update.ops[0] as any).value.candidates[0]).toEqual({
            connection: 'segment-midpoint', priority: 0,
        });
    });

    it('compiles grouped-bar semantic fields from its template', () => {
        const spec = assembleVegaLite({
            data: {
                values: [
                    { Class: '1st', Sex: 'Female', Survival: 97 },
                    { Class: '1st', Sex: 'Male', Survival: 34 },
                ],
            },
            semantic_types: { Class: 'Category', Sex: 'Category', Survival: 'Quantity' },
            chart_spec: {
                chartType: 'Grouped Bar Chart',
                encodings: {
                    x: { field: 'Class' },
                    y: { field: 'Survival' },
                    group: { field: 'Sex' },
                },
            },
        } as any) as any;

        expect(spec._interactionSemantics).toMatchObject({
            fields: ['Class', 'Survival', 'Sex'],
            categoryField: 'Class',
            seriesField: 'Sex',
            selectableMarks: ['bar'],
        });
    });

    it('instruments path marks without splitting them by interaction detail', () => {
        const spec: Record<string, any> = {
            mark: 'line',
            encoding: {
                x: { field: 'Date', type: 'temporal' },
                y: { field: 'Value', type: 'quantitative' },
            },
            _interactionSemantics: {
                fields: ['Date', 'Value'],
                categoryField: 'Date',
                selectableMarks: ['line'],
            },
        };

        expect(addVegaLiteInteractions(spec, [clickMark()])).toMatchObject({
            fields: ['Date', 'Value'],
        });
        expect(spec.encoding).not.toHaveProperty('detail');
        expect(spec.encoding.opacity.condition.test).toContain("!length(data('__flint_interaction_store'))");
    });

    it.each([
        ['Bump Chart', bumpChartDef, ['line', 'point'], 'X'],
        ['Slope Chart', slopeChartDef, ['line', 'point'], 'X'],
        ['Regression', regressionDef, ['circle'], 'X'],
        ['Streamgraph', streamgraphDef, ['area'], 'X'],
        ['Map', mapDef, ['circle'], 'Longitude'],
        ['Density Plot', densityPlotDef, ['area'], 'value'],
        ['ECDF Plot', ecdfPlotDef, ['line', 'point'], 'X'],
        ['Calendar Heatmap', vlCalendarHeatmapDef, ['rect'], '__flintCalendarWeek'],
        ['Sparkline', sparklineDef, ['line'], 'X'],
        ['Violin Plot', violinPlotDef, ['area'], 'X'],
        ['Bullet Chart', bulletChartDef, ['bar', 'tick'], 'Value'],
        ['KPI Card', kpiCardDef, ['rect'], 'Metric'],
        ['Radar Chart', radarChartDef, ['line', 'point'], 'X'],
        ['Choropleth', choroplethDef, ['geoshape'], 'Region'],
    ] as const)('declares semantic marks and identity for %s', (_name, definition, marks, identityField) => {
        const semantics = definition.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'X', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
                color: { field: 'Series', type: 'nominal' },
                detail: { field: 'Detail', type: 'nominal' },
                row: { field: 'Row', type: 'nominal' },
                column: { field: 'Column', type: 'nominal' },
                longitude: { field: 'Longitude', type: 'quantitative' },
                latitude: { field: 'Latitude', type: 'quantitative' },
                size: { field: 'Size', type: 'quantitative' },
                goal: { field: 'Goal', type: 'quantitative' },
                metric: { field: 'Metric', type: 'nominal' },
                value: { field: 'Value', type: 'quantitative' },
                id: { field: 'Region', type: 'nominal' },
            },
        });

        expect(semantics.selectableMarks).toEqual(marks);
        expect(semantics.fields).toContain(identityField);
        expect(semantics.resolve).toBeTypeOf('function');
    });

    it('keeps Radar legend semantics and tuples in authored field names', () => {
        const rows = [
            { Food: 'Oats', Nutrient: 'Protein', Amount: 17 },
            { Food: 'Oats', Nutrient: 'Fiber', Amount: 11 },
            { Food: 'Almonds', Nutrient: 'Protein', Amount: 21 },
            { Food: 'Almonds', Nutrient: 'Fiber', Amount: 12 },
        ];
        const spec = assembleVegaLite({
            data: { values: rows },
            semantic_types: { Food: 'Category', Nutrient: 'Category', Amount: 'Quantity' },
            chart_spec: {
                chartType: 'Radar Chart',
                encodings: { x: 'Nutrient', y: 'Amount', color: 'Food' },
            },
        } as any) as any;
        const lineValues = spec.layer.find((layer: any) => layer.mark?.type === 'line')?.data?.values;

        expect(spec._interactionSemantics).toMatchObject({
            fields: ['Nutrient', 'Amount', 'Food'],
            categoryField: 'Nutrient',
            seriesField: 'Food',
            legendFields: { color: 'Food' },
        });
        expect(lineValues[0]).toMatchObject({ Food: 'Oats', Nutrient: 'Protein', Amount: 17 });
        const oats = spec._interactionSemantics.resolve({
            gesture: 'click', role: 'legend-item', hits: [],
            legend: { field: 'Food', domain: { kind: 'value', value: 'Oats' } },
        }, {
            allHits: lineValues.map((datum: Record<string, unknown>, index: number) => ({
                datum: { ...datum, [INTERACTION_KEY]: String(index) },
                source: 'mark' as const,
            })),
            keyField: INTERACTION_KEY,
        });
        expect(oats?.elements.every((element: SemanticElement) => element.value.Food === 'Oats')).toBe(true);
        expect(sourceRecordsForRenderedRecords(
            lineValues.filter((datum: Record<string, unknown>) => datum.Food === 'Oats'),
            rows,
            ['Nutrient', 'Amount', 'Food'],
        )).toEqual(rows.slice(0, 2));
    });

    it('includes the closing edge in Radar path interaction geometry', async () => {
        const spec = assembleVegaLite({
            data: { values: [
                { Food: 'Oats', Nutrient: 'Protein', Amount: 17 },
                { Food: 'Oats', Nutrient: 'Fat', Amount: 7 },
                { Food: 'Oats', Nutrient: 'Carbs', Amount: 66 },
                { Food: 'Oats', Nutrient: 'Fiber', Amount: 11 },
                { Food: 'Oats', Nutrient: 'Sugar', Amount: 1 },
            ] },
            semantic_types: { Food: 'Category', Nutrient: 'Category', Amount: 'Quantity' },
            chart_spec: {
                chartType: 'Radar Chart',
                encodings: { x: 'Nutrient', y: 'Amount', color: 'Food' },
            },
        } as any) as any;
        const { compiled } = instrument(spec);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const segments = sceneItems(view).filter((item) =>
            item.mark?.marktype === 'line' && item.datum.Food === 'Oats');

        expect(segments).toHaveLength(5);
        expect(segments.every((segment) => segment.interactionGeometry.closed)).toBe(true);
        expect(segments.at(-1)?.datum.Nutrient).toBe('Sugar');
        expect(segments.at(-1)?.interactionGeometry.endDatum.Nutrient).toBe('Protein');
    });

    it('acquires the nearest Radar edge across overlapping filled series', async () => {
        const values = [
            ['Oats', 17, 7, 66, 11, 1],
            ['Almonds', 21, 49, 22, 12, 4],
        ].flatMap(([Food, ...amounts]) => ['Protein', 'Fat', 'Carbs', 'Fiber', 'Sugar']
            .map((Nutrient, index) => ({ Food, Nutrient, Amount: amounts[index] })));
        const spec = assembleVegaLite({
            data: { values },
            semantic_types: { Food: 'Category', Nutrient: 'Category', Amount: 'Quantity' },
            chart_spec: {
                chartType: 'Radar Chart',
                encodings: { x: 'Nutrient', y: 'Amount', color: 'Food' },
            },
        } as any) as any;
        const { compiled } = instrument(spec);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const segments = sceneItems(view).filter((item) => item.mark?.marktype === 'line');
        const oats = segments.find((item) => item.datum.Food === 'Oats');
        const almond = segments.find((item) => item.datum.Food === 'Almonds');
        const [start, end] = almond.interactionGeometry.points;
        const point = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

        const acquired = physicalItemAt(view, oats, point);

        expect(acquired.mark).toBe(almond.mark);
        expect(acquired.datum.Food).toBe('Almonds');
    });

    it('instruments marks inside a nested facet unit spec', () => {
        const spec: Record<string, any> = {
            data: { values: [{ Group: 'A', X: 1, Value: 2 }] },
            facet: { row: { field: 'Group', type: 'nominal' } },
            spec: {
                mark: 'line',
                encoding: {
                    x: { field: 'X', type: 'quantitative' },
                    y: { field: 'Value', type: 'quantitative' },
                },
            },
            _interactionSemantics: {
                fields: ['Group', 'X', 'Value'],
                categoryField: 'Group',
                selectableMarks: ['line'],
            },
        };

        const { plan, compiled } = instrument(spec);
        expect(plan?.fields).toEqual(['Group', 'X', 'Value']);
        expect(spec.spec.encoding.opacity.condition.test).toContain(INTERACTION_STORE);
        expect(() => parse(compiled)).not.toThrow();
    });

    it('resolves distinct plot frames for rendered row facets', async () => {
        const spec = assembleVegaLite({
            data: { values: [
                { Class: '1st', Survival: 90, Sex: 'Female' },
                { Class: '2nd', Survival: 80, Sex: 'Female' },
                { Class: '1st', Survival: 30, Sex: 'Male' },
                { Class: '2nd', Survival: 20, Sex: 'Male' },
            ] },
            semantic_types: { Class: 'Category', Survival: 'Number', Sex: 'Category' },
            chart_spec: {
                chartType: 'Bar Chart',
                encodings: { x: 'Class', y: 'Survival', row: 'Sex' },
                baseSize: { width: 350, height: 240 },
            },
        } as any) as any;
        const { compiled } = instrument(spec);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const bars = sceneItems(view).filter((item) => item.mark?.marktype === 'rect');
        const female = bars.find((item) => item.datum.Sex === 'Female');
        const male = bars.find((item) => item.datum.Sex === 'Male');
        const fallback = { x: -1, y: -1, width: 1, height: 1 };
        const frameFor = (item: any) => facetPlotFrameAt(view, {
            x: (item.bounds.x1 + item.bounds.x2) / 2,
            y: (item.bounds.y1 + item.bounds.y2) / 2,
        }, fallback);

        const femaleFrame = frameFor(female);
        const maleFrame = frameFor(male);
        expect(femaleFrame).not.toEqual(fallback);
        expect(maleFrame).not.toEqual(fallback);
        expect(femaleFrame.y).not.toBe(maleFrame.y);
        expect(femaleFrame.height).toBe(maleFrame.height);
    });

    it('does not instrument marks declared as decorative', () => {
        const spec: Record<string, any> = {
            layer: [
                {
                    mark: 'rect',
                    data: { values: [{ Category: 'frame' }] },
                    [INTERACTION_PROVENANCE]: {
                        role: 'decorative',
                        identity: 'inherit',
                        presentation: 'independent',
                    },
                },
                {
                    mark: 'rect',
                    data: { values: [{ Category: 'value' }] },
                },
            ],
            _interactionSemantics: {
                fields: ['Category'],
                selectableMarks: ['rect'],
            },
        };

        instrument(spec);
        expect(spec.layer[0].encoding).toBeUndefined();
        expect(spec.layer[1].encoding.opacity.condition.test).toContain(INTERACTION_STORE);
    });

    it('compiles geoshapes into renderable semantic shape hits', async () => {
        const spec: Record<string, any> = {
            data: {
                values: [{
                    type: 'Feature',
                    id: 'A',
                    Region: 'Alpha',
                    properties: {},
                    geometry: {
                        type: 'Polygon',
                        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
                    },
                }],
            },
            mark: 'geoshape',
            projection: { type: 'mercator' },
            _interactionSemantics: {
                fields: ['Region'],
                categoryField: 'Region',
                selectableMarks: ['geoshape'],
            },
        };

        const { plan, compiled } = instrument(spec);
        expect(plan?.fields).toEqual(['Region']);
        expect(compiled.marks).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'shape' }),
        ]));
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const shape = sceneItems(view).find((item) => item.mark.marktype === 'shape');
        expect(renderHit(shape)).toMatchObject({
            datum: { [INTERACTION_KEY]: expect.any(String) },
            markType: 'shape',
        });
        view.finalize();
    });
});
describe('set-style visibility', () => {
    it('injects absolute runtime style channels keyed by semantic identity', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: { fields: ['Category'], selectableMarks: ['bar'] },
            data: { values: [{ Category: 'A', Value: 1 }] },
            mark: 'bar',
            encoding: {
                x: { field: 'Category', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
                color: { value: '#4472c4' },
            },
        };
        const { compiled } = instrument(spec);
        expect(compiled.signals).toContainEqual({ name: STYLE_SIGNAL, value: {} });
        expect(JSON.stringify(compiled.marks)).toContain(`${STYLE_SIGNAL}[datum.${INTERACTION_KEY}]`);
    });

    it('maps compiled axis scales to authored discrete fields and resolves native ticks', async () => {
        const compiled = compile({
            data: { values: [{ Category: 'A', Value: 1 }] },
            mark: 'bar',
            encoding: {
                x: { field: 'Category', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
            },
        }).spec as Record<string, any>;
        const targets = collectVegaAxisTargets(compiled, {
            x: { field: 'Category', type: 'nominal' },
            y: { field: 'Value', type: 'quantitative' },
        }, [{ axis: 'x', field: 'Category' }]);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const labels = allSceneItems(view).filter((item) => item.mark?.role === 'axis-label');
        const categoryLabel = labels.find((item) => item.datum?.value === 'A');
        const quantityLabel = labels.find((item) => item.datum?.value === 1);
        expect(axisTargetIdentity(categoryLabel, targets)).toMatchObject({
            axis: 'x', field: 'Category', value: 'A', role: 'axis-label',
        });
        expect(axisTargetIdentity(quantityLabel, targets)).toBeNull();
        expect(JSON.stringify(compiled.axes)).toContain('"interactive":true');
        expect(compiled.axes.find((axis: any) => axis.orient === 'bottom')
            ?.encode?.labels?.update?.cursor).toBeUndefined();
        expect(compiled.axes.find((axis: any) => axis.orient === 'left')
            ?.encode?.labels?.update?.cursor).toBeUndefined();
        view.finalize();
    });

    it('highlights hovered discrete x and y axis labels', async () => {
        const compiled = compile({
            data: { values: [{ Column: 'A', Row: 'R', Value: 1 }] },
            mark: 'rect',
            encoding: {
                x: { field: 'Column', type: 'nominal' },
                y: { field: 'Row', type: 'nominal' },
                color: { field: 'Value', type: 'quantitative' },
            },
        }).spec as Record<string, any>;
        const targets = collectVegaAxisTargets(compiled, {
            x: { field: 'Column', type: 'nominal' },
            y: { field: 'Row', type: 'nominal' },
        }, [], '#123456');
        injectVegaInteractionStore(compiled);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const labels = () => allSceneItems(view).filter((item) => item.mark?.role === 'axis-label');
        const xLabel = () => labels().find((item) => item.datum?.value === 'A');
        const yLabel = () => labels().find((item) => item.datum?.value === 'R');
        const xIdentity = axisTargetIdentity(xLabel(), targets)!;
        const yIdentity = axisTargetIdentity(yLabel(), targets)!;

        view.change(AXIS_HOVER_STORE, changeset().remove(() => true).insert([{
            scale: xIdentity.scale, value: xIdentity.value,
        }]));
        await view.runAsync();
        expect(xLabel()).toMatchObject({ fill: '#123456', fontWeight: 600 });
        expect(yLabel()?.fontWeight).not.toBe(600);

        view.change(AXIS_HOVER_STORE, changeset().remove(() => true).insert([{
            scale: yIdentity.scale, value: yIdentity.value,
        }]));
        await view.runAsync();
        expect(yLabel()).toMatchObject({ fill: '#123456', fontWeight: 600 });
        expect(xLabel()?.fontWeight).not.toBe(600);
        view.finalize();
    });

    it('turns an axis target into a style update without accepting mark targets', () => {
        const interaction = axisHighlight({ axis: 'x', dimOpacity: 0.2 });
        const context = { chartType: 'Bar Chart', selected: [] };
        const axisTarget = {
            visual: { kind: 'axis' as const, role: 'axis-label' },
            elements: [{ value: { axis: 'x', field: 'Category', value: 'A' } }],
        };
        const update = interaction.handle!({
            action: 'click-axis', phase: 'commit', geometry: {}, target: axisTarget,
        }, context);
        expect(update?.ops[0]).toMatchObject({
            op: 'set-style', targets: [axisTarget], value: { state: 'emphasized', mutedOpacity: 0.2 },
        });
        expect(interaction.handle!({
            action: 'click-element', phase: 'commit', geometry: {},
            target: { visual: { kind: 'mark', role: 'bar' }, elements: [] },
        }, context)).toBeNull();
    });

    it('pins the legend domain so a hidden series keeps a key to click', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Category', 'Series'],
                categoryField: 'Category',
                legendFields: { color: 'Series' },
                selectableMarks: ['bar'],
            },
            data: {
                values: [
                    { Category: 'A', Series: 'Female', Value: 12 },
                    { Category: 'A', Series: 'Male', Value: 8 },
                ],
            },
            mark: 'bar',
            encoding: {
                x: { field: 'Category', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
                color: { field: 'Series', type: 'nominal', scale: { scheme: 'tableau10' } },
            },
        };

        addVegaLiteInteractions(spec, [legendToggle()]);

        expect(spec.encoding.color.scale.domain).toEqual(['Female', 'Male']);
    });

    it('pins an aggregate-sorted donut legend so hidden slices keep their keys', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['OS', 'Users'],
                legendFields: { color: 'OS' },
                selectableMarks: ['arc'],
            },
            data: {
                values: [
                    { OS: 'Android', Users: 70 },
                    { OS: 'iOS', Users: 28 },
                    { OS: 'Other', Users: 2 },
                ],
            },
            mark: { type: 'arc', innerRadius: 50 },
            encoding: {
                theta: { field: 'Users', type: 'quantitative', aggregate: 'sum' },
                color: {
                    field: 'OS', type: 'nominal',
                    sort: { field: 'Users', op: 'sum', order: 'descending' },
                },
            },
        };

        addVegaLiteInteractions(spec, [legendToggle()]);

        expect(spec.encoding.color.scale.domain).toEqual(['Android', 'iOS', 'Other']);
    });

    it('clips marks when a region interaction drives the viewport', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Year', 'Value'],
                selectableMarks: ['line'],
                navigationAxes: ['x', 'y'],
            },
            data: { values: [{ Year: 2020, Value: 1 }, { Year: 2021, Value: 2 }] },
            mark: { type: 'line', point: true },
            encoding: {
                x: { field: 'Year', type: 'quantitative' },
                y: { field: 'Value', type: 'quantitative' },
            },
        };

        const plan = addVegaLiteInteractions(spec, [brushZoom()]);

        expect(spec.mark).toMatchObject({ type: 'line', clip: true });
        expect(spec.mark.point).toBe(true);
        expect(spec.layer).toBeUndefined();
        expect(plan?.semanticStores).toBe(false);
        expect(plan?.navigationChannels).toEqual(['x', 'y']);
    });

    it('leaves the legend domain alone when nothing can hide a series', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Category', 'Series'],
                categoryField: 'Category',
                legendFields: { color: 'Series' },
                selectableMarks: ['bar'],
            },
            data: { values: [{ Category: 'A', Series: 'Female', Value: 12 }] },
            mark: 'bar',
            encoding: {
                x: { field: 'Category', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
                color: { field: 'Series', type: 'nominal' },
            },
        };

        addVegaLiteInteractions(spec, [clickMark()]);

        expect(spec.encoding.color.scale?.domain).toBeUndefined();
    });

    it('filters a hidden key out of the data and rescales the remaining rows', async () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Category'],
                categoryField: 'Category',
                selectableMarks: ['bar'],
            },
            data: { values: [{ Category: 'A', Value: 12 }, { Category: 'B', Value: 8 }] },
            mark: 'bar',
            encoding: {
                x: { field: 'Category', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
            },
        };

        const { compiled } = instrument(spec, [clickMark()]);
        expect(compiled.data).toContainEqual({ name: HIDDEN_STORE, values: [] });
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();

        // The transparent click-to-clear rect carries no key and is not a data mark.
        const bars = () => allSceneItems(view)
            .filter((item) => item.mark?.marktype === 'rect' && item.datum?.[INTERACTION_KEY])
            .map((item) => item.datum[INTERACTION_KEY]);
        const yDomain = () => view.scale('y').domain();

        expect(bars()).toHaveLength(2);
        const tallestKey = bars()[0];
        const fullMax = yDomain()[1];

        view.change(HIDDEN_STORE, changeset().insert([{ key: tallestKey }]));
        await view.runAsync();

        expect(bars()).toHaveLength(1);
        expect(bars()).not.toContain(tallestKey);
        expect(yDomain()[1]).toBeLessThan(fullMax);

        view.change(HIDDEN_STORE, changeset().remove(() => true));
        await view.runAsync();
        expect(bars()).toHaveLength(2);
        expect(yDomain()[1]).toBe(fullMax);
        view.finalize();
    });
});
