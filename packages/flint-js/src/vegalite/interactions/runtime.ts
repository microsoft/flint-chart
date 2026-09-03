import { changeset } from 'vega';
import {
    associateSemanticElementRenderKeys,
    semanticElementRenderKeys,
    sourceRecordsForRenderedRecords,
    type ChartInteractionResolver,
    type LegendTargetValue,
    type SemanticResolveContext,
} from '../../core/interaction-semantics';
import type {
    CanvasInteractionDef,
    ChartOverlaySpec,
    ChartUpdate,
    ChartUpdateOp,
    ChartUpdatePresenter,
    FlintInteractionEventDetail,
    InteractionDef,
    NavigationInteractionEvent,
    RenderHit,
    SemanticElement,
    SemanticTarget,
    SemanticInteractionEvent,
} from '../../interactive/interactions';
import { isCanvasInteraction } from '../../interactive/interactions';
import {
    affordanceCursor,
    resolveInteractionAffordance,
    type InteractionAffordanceTarget,
} from '../../interactive/affordances';
import type {
    ChartUpdateResult,
    SemanticTargetRef,
    UpdateTarget,
} from '../../interactive/language/updates';
import { matchesSemanticTargetSelector } from '../../interactive/language/updates';
import type { VegaInteractionPlan } from './contracts';
import { toCanvasInteractionEvent } from '../../interactive/canvas-interaction';
import { keyboardTrigger } from '../../interactive/triggers';
import { normalizeInspectGuideOptions } from '../../interactive/guides';
import type { CanvasInteractionEvent, DomainGeometry } from '../../interactive/language/events';
import type { ChartUpdateApplyOptions } from '../../interactive/types';
import {
    INTERACTION_KEY,
    PATH_KEY_SUFFIX,
    axisItemAt,
    axisTargetIdentity,
    clientToPlotPoint,
    clientToRendererPoint,
    interactionModifiers,
    normalizeVegaElementEvent,
    nearestInteractiveSceneItem,
    nearestSceneItem,
    nextItemInDirection,
    pathHoverPresentationKey,
    polarFrameFromItems,
    polarGuideSegment,
    polarInspectHits,
    tolerantInspectHits,
    indexInspectAcquisition,
    legendSemanticTarget,
    renderHit,
    rendererPlotOrigin,
    sceneItems,
    type RendererCoordinateSpace,
    type LegendHitIdentity,
    type SpatialDirection,
} from './hit-adapter';
import { isInteractiveControlTarget, mountVegaRegionGesture } from './gestures/region';
import { mountVegaNavigationGesture } from './gestures/navigation';
import { createVegaNavigationController } from './navigation-scale';
import { createAnnotationOverlay } from './presentation/annotation-overlay';
import {
    createDragReorderOverlay,
    eligibleReorderAxesForAxis,
    eligibleReorderAxesForHit,
} from './presentation/drag-reorder-overlay';
import { createFocusOverlay } from './presentation/focus-overlay';
import { createTargetFeedbackOverlay } from './presentation/target-feedback-overlay';
import { createLegendRangeOverlay } from './presentation/legend-range-overlay';
import { createReorderResetControls } from './presentation/reorder-reset-controls';
import { createViewportResetControl } from './presentation/viewport-reset-control';
import { createInspectGuideOverlay } from './presentation/inspect-guide-overlay';
import { createDataOverlay } from './presentation/data-overlay';
import {
    HIDDEN_STORE,
    LEGEND_HIDDEN_STORE,
    HOVER_STORE,
    INTERACTION_STORE,
    LEGEND_HOVER_STORE,
    AXIS_HOVER_STORE,
    LEGEND_SELECTION_STORE,
    STYLE_SIGNAL,
} from './stores';

const EMPTY_SEMANTIC_SELECTION_KEY = '__flint_empty_semantic_selection';

export { mergeContiguousSelectionBounds } from './presentation/focus-overlay';

export function resolveLegendPresentationTarget(
    legend: LegendTargetValue,
    resolve: ChartInteractionResolver,
    context: SemanticResolveContext,
): SemanticTarget {
    const resolved = resolve({
        gesture: 'click', role: 'legend-item', hits: [], legend,
    }, context);
    if (resolved) return resolved;
    return {
        visual: { kind: 'legend', role: 'legend-item' },
        elements: [associateSemanticElementRenderKeys(
            { value: legend },
            [EMPTY_SEMANTIC_SELECTION_KEY],
        )],
    };
}

function legendDomainIdentity(legend: LegendTargetValue): string {
    return JSON.stringify([legend.channel, legend.field, legend.domain]);
}

export function resolveRetainedLegendPresentationTarget(
    legend: LegendTargetValue,
    resolve: ChartInteractionResolver,
    context: SemanticResolveContext,
    retained: Map<string, SemanticTarget>,
): SemanticTarget {
    const identity = legendDomainIdentity(legend);
    const resolved = resolveLegendPresentationTarget(legend, resolve, context);
    const hasConcreteKeys = resolved.elements.some((element) =>
        semanticElementRenderKeys(element).some((key) => key !== EMPTY_SEMANTIC_SELECTION_KEY));
    if (hasConcreteKeys) {
        retained.set(identity, resolved);
        return resolved;
    }
    return retained.get(identity) ?? resolved;
}

export function resolveRetainedLegendPresentationTargets(
    legends: readonly LegendTargetValue[],
    resolve: ChartInteractionResolver,
    context: SemanticResolveContext,
    retained: Map<string, SemanticTarget>,
): SemanticTarget {
    return {
        visual: { kind: 'legend', role: 'legend-item' },
        elements: legends.flatMap((legend) =>
            resolveRetainedLegendPresentationTarget(legend, resolve, context, retained).elements),
    };
}

export function resolvedLegendInteractionTarget(
    legend: LegendTargetValue,
    resolved: SemanticTarget | null,
): SemanticTarget {
    const records = [...new Set(resolved?.elements.flatMap((element) => element.records ?? []) ?? [])];
    const renderKeys = resolved?.elements.flatMap(semanticElementRenderKeys) ?? [];
    return {
        visual: { kind: 'legend', role: 'legend-item' },
        elements: [associateSemanticElementRenderKeys({
            value: legend,
            ...(records.length > 0 ? { records } : {}),
        }, renderKeys.length > 0 ? renderKeys : [EMPTY_SEMANTIC_SELECTION_KEY])],
    };
}

export function resolveSupportedOperation(
    op: ChartUpdateOp,
    plan: Pick<VegaInteractionPlan, 'navigationAxes' | 'reorderAxis' | 'reorderAxes'>,
): { op: ChartUpdateOp | null; unsupported: boolean } {
    if (op.op === 'set-viewport') {
        const requestedAxes = op.axes === 'xy' ? ['x', 'y'] as const : [op.axes];
        const supportedAxes = requestedAxes.filter((axis) => plan.navigationAxes?.[axis]);
        if (supportedAxes.length === 0) return { op: null, unsupported: true };
        const axes = supportedAxes.length === 2 ? 'xy' : supportedAxes[0];
        return {
            op: {
                ...op,
                axes,
                value: Object.fromEntries(supportedAxes
                    .filter((axis) => op.value[axis] !== undefined)
                    .map((axis) => [axis, op.value[axis]])),
            },
            unsupported: supportedAxes.length < requestedAxes.length,
        };
    }
    if (op.op === 'set-order') {
        const reorderAxes = plan.reorderAxes ?? (plan.reorderAxis ? [plan.reorderAxis] : []);
        const supported = op.scope === 'category'
            && reorderAxes.some((axis) => axis.field === op.field);
        return { op: supported ? op : null, unsupported: !supported };
    }
    return { op, unsupported: false };
}

export function domainForPlotGeometry(
    plot: CanvasInteractionEvent['geometry']['plot'],
    axes: VegaInteractionPlan['navigationAxes'],
    scaleFor: (name: string) => {
        invert?(value: number): unknown;
    } | undefined,
): DomainGeometry | undefined {
    if (!plot || plot.kind !== 'rect') return undefined;
    const domain: DomainGeometry = {};
    for (const axis of ['x', 'y'] as const) {
        const config = axes?.[axis];
        if (!config) continue;
        const scale = scaleFor(config.scale);
        if (typeof scale?.invert !== 'function') continue;
        const lower = axis === 'x' ? plot.rect.x : plot.rect.y;
        const upper = lower + (axis === 'x' ? plot.rect.width : plot.rect.height);
        const lowerValue = scale.invert(lower);
        const upperValue = scale.invert(upper);
        const start = axis === 'y' ? upperValue : lowerValue;
        const end = axis === 'y' ? lowerValue : upperValue;
        if (start === undefined || end === undefined) continue;
        domain[axis] = { kind: 'interval', start, end };
    }
    return domain.x || domain.y ? domain : undefined;
}

export function nearestReorderHit(
    items: readonly any[],
    axis: 'x' | 'y',
    field: string,
    coordinate: number,
): RenderHit | null {
    const start = axis === 'x' ? 'x1' : 'y1';
    const end = axis === 'x' ? 'x2' : 'y2';
    const slots = new Map<unknown, { hit: RenderHit; center: number }>();
    for (const item of items) {
        const hit = renderHit(item);
        const value = hit?.datum[field];
        if (!hit || value === undefined || !item.bounds || slots.has(value)) continue;
        slots.set(value, { hit, center: (item.bounds[start] + item.bounds[end]) / 2 });
    }
    let nearest: { hit: RenderHit; distance: number } | undefined;
    for (const slot of slots.values()) {
        const distance = Math.abs(coordinate - slot.center);
        if (!nearest || distance < nearest.distance) nearest = { hit: slot.hit, distance };
    }
    return nearest?.hit ?? null;
}

export interface VegaInteractionController {
    getInteractionContext(): import('../../interactive/interactions').InteractionContext;
    applyUpdate(update: ChartUpdate, options?: ChartUpdateApplyOptions): Promise<ChartUpdateResult>;
    setUpdates(updates: readonly ChartUpdate[]): Promise<readonly ChartUpdateResult[]>;
    clearUpdate(id: string): Promise<void>;
    refresh(): void;
    destroy(): void;
}

export function interactionsForHoverPresentation(
    clickInteractions: readonly CanvasInteractionDef[],
    hoverInteractions: readonly CanvasInteractionDef[],
    elementDragInteractions: readonly CanvasInteractionDef[] = [],
    inspectInteractions: readonly CanvasInteractionDef[] = [],
): CanvasInteractionDef[] {
    return [
        ...hoverInteractions,
        ...clickInteractions,
        ...elementDragInteractions,
        ...inspectInteractions,
    ].filter((interaction, index, candidates) => interaction.affordances?.some((affordance) => affordance.hover)
        && candidates.findIndex((candidate) => candidate.id === interaction.id) === index);
}

export function initialInspectSeries(
    items: readonly any[],
    seriesBy: string,
    preferred?: unknown,
): unknown {
    const values = items.flatMap((item) => item?.datum?.[seriesBy] === undefined
        ? []
        : [item.datum[seriesBy]]);
    return preferred !== undefined && values.some((value) => Object.is(value, preferred))
        ? preferred
        : values[0];
}

export function inspectSeriesPresentationKeys(
    items: readonly any[],
    seriesBy: string,
    series: unknown,
): string[] {
    return [...new Set(items.flatMap((item) => {
        if (!Object.is(item?.datum?.[seriesBy], series)) return [];
        const hit = renderHit(item);
        const key = hit?.datum?.[INTERACTION_KEY];
        return typeof key === 'string' ? [key] : [];
    }))];
}

export function longPressMovedBeyond(
    start: { x: number; y: number },
    current: { x: number; y: number },
    tolerance = 6,
): boolean {
    return Math.hypot(current.x - start.x, current.y - start.y) > tolerance;
}

type AnnotationUpdate = Extract<ChartUpdateOp, { op: 'set-annotation' }>;

export interface EffectiveAnnotationEntry {
    key: string;
    element: SemanticTarget['elements'][number];
    value: NonNullable<AnnotationUpdate['value']>;
}

export function effectiveAnnotationEntries(updates: readonly ChartUpdate[]): EffectiveAnnotationEntry[] {
    const entries = new Map<string, EffectiveAnnotationEntry>();
    for (const update of updates) {
        for (const op of update.ops) {
            if (op.op !== 'set-annotation' || 'select' in op.target) continue;
            const element = op.target.elements[0];
            if (!element) continue;
            const renderKeys = semanticElementRenderKeys(element);
            const targetIdentity = renderKeys.length > 0
                ? renderKeys.join('\u001f')
                : JSON.stringify([element.value, element.records ?? []]);
            const key = `${update.id}\u001e${targetIdentity}`;
            if (op.value === null) entries.delete(key);
            else entries.set(key, { key, element, value: op.value });
        }
    }
    return [...entries.values()];
}

function keyboardRepresentativeRank(item: any): [number, number] {
    const markType = item?.mark?.marktype;
    const width = Math.max(0, (item?.bounds?.x2 ?? 0) - (item?.bounds?.x1 ?? 0));
    const height = Math.max(0, (item?.bounds?.y2 ?? 0) - (item?.bounds?.y1 ?? 0));
    const markRank = markType === 'rect' ? 3 : markType === 'arc' ? 2 : markType === 'rule' ? 0 : 1;
    return [markRank, width * height];
}

export function keyboardTargetItems(scene: readonly any[]): any[] {
    const itemsByKey = new Map<string, any>();
    for (const item of scene) {
        const key = renderHit(item)?.datum[INTERACTION_KEY];
        if (typeof key !== 'string' || !item.bounds) continue;
        const existing = itemsByKey.get(key);
        if (!existing) {
            itemsByKey.set(key, item);
            continue;
        }
        const [rank, area] = keyboardRepresentativeRank(item);
        const [existingRank, existingArea] = keyboardRepresentativeRank(existing);
        if (rank > existingRank || (rank === existingRank && area > existingArea)) {
            itemsByKey.set(key, item);
        }
    }
    return [...itemsByKey.values()].sort((left, right) =>
        (left.bounds.x1 - right.bounds.x1) || (left.bounds.y1 - right.bounds.y1));
}

export function enrichTargetWithSourceProvenance(
    target: SemanticTarget | null,
    plan: Pick<VegaInteractionPlan,
        'sourceRecords' | 'provenanceFields' | 'temporalProvenanceFields' | 'rangeProvenance'>,
): SemanticTarget | null {
    if (!target) return null;
    const elements = target.elements.map((element) => {
        const renderedRecords = element.records?.length ? element.records : [element.value];
        const records = sourceRecordsForRenderedRecords(
            renderedRecords,
            plan.sourceRecords,
            plan.provenanceFields,
            plan.temporalProvenanceFields,
            plan.rangeProvenance,
        );
        const value = plan.rangeProvenance.length > 0
            ? { ...element.value, count: records.length }
            : element.value;
        const publicElement = {
            value,
            ...(records.length > 0 ? { records } : {}),
        };
        return associateSemanticElementRenderKeys(publicElement, semanticElementRenderKeys(element));
    });
    return { ...target, elements };
}

const ASSISTED_GESTURES = new Set(['click', 'hover', 'context', 'long-press', 'double']);

export function resolveAssistDistance(
    interactions: readonly CanvasInteractionDef[],
    override?: number,
): number {
    const eligible = interactions.filter((interaction) =>
        interaction.eventSource.type === 'element'
        && ASSISTED_GESTURES.has(interaction.eventSource.gesture ?? ''));
    if (eligible.length === 0) return 0;
    return override ?? Math.max(0, ...eligible.map((interaction) =>
        interaction.eventSource.defaultAssistDistance ?? 0));
}

export function evictRetainedStateSiblings(
    interaction: CanvasInteractionDef,
    interactions: readonly CanvasInteractionDef[],
    retained: Map<string, ChartUpdate>,
    preview: Map<string, ChartUpdate>,
): CanvasInteractionDef[] {
    if (!interaction.retainedStateGroup) return [];
    const siblings = interactions.filter((candidate) => candidate.id !== interaction.id
        && candidate.retainedStateGroup === interaction.retainedStateGroup);
    for (const sibling of siblings) {
        retained.delete(sibling.id);
        preview.delete(sibling.id);
    }
    return siblings;
}

export function mountVegaInteractions(
    view: any,
    container: HTMLElement,
    chartType: string,
    plan: VegaInteractionPlan,
    interactions: readonly InteractionDef[],
    resolve: ChartInteractionResolver | undefined,
    presentUpdate: ChartUpdatePresenter,
    assistDistance: number | undefined = undefined,
    hoverTolerance = 0,
    keyboardTargeting = false,
    targetFeedback: {
        assisted: import('../../interactive/types').TargetFeedbackOptions | false;
        keyboard: import('../../interactive/types').TargetFeedbackOptions | false;
    } | undefined = undefined,
    dismiss: import('../../interactive/types').InteractionDismissPolicy | false | undefined = undefined,
): VegaInteractionController {
    const canvasInteractions = interactions.filter(isCanvasInteraction);
    const clickInteractions = resolve
        ? canvasInteractions.filter((interaction) => interaction.eventSource.gesture === 'click')
        : [];
    const hoverInteractions = resolve
        ? canvasInteractions.filter((interaction) => interaction.eventSource.gesture === 'hover')
        : [];
    const axisClickInteractions = clickInteractions.filter((interaction) => interaction.claimsAxisActivation);
    const markClickInteractions = clickInteractions.filter((interaction) =>
        resolveInteractionAffordance([interaction], 'mark')
        || resolveInteractionAffordance([interaction], 'legend-item'));
    const axisHoverInteractions = hoverInteractions.filter((interaction) => interaction.claimsAxisActivation);
    const markHoverInteractions = hoverInteractions.filter((interaction) => !interaction.claimsAxisActivation);
    const axisHoverPresentationInteractions = [...axisClickInteractions, ...axisHoverInteractions]
        .filter((interaction) => interaction.affordances?.some((affordance) =>
            affordance.target === 'axis-label' && affordance.hover));
    const contextInteractions = resolve
        ? canvasInteractions.filter((interaction) => interaction.eventSource.gesture === 'context')
        : [];
    const inspectInteractions = resolve
        ? canvasInteractions.filter((interaction) => interaction.eventSource.gesture === 'inspect')
        : [];
    const longPressInteractions = resolve
        ? canvasInteractions.filter((interaction) => interaction.eventSource.gesture === 'long-press')
        : [];
    const doubleInteractions = resolve
        ? canvasInteractions.filter((interaction) => interaction.eventSource.gesture === 'double')
        : [];
    const elementDragInteractions = resolve
        ? canvasInteractions.filter((interaction) => interaction.eventSource.gesture === 'drag-element')
        : [];
    const hoverPresentationInteractions = interactionsForHoverPresentation(
        [...markClickInteractions, ...longPressInteractions, ...doubleInteractions],
        markHoverInteractions,
        elementDragInteractions,
        inspectInteractions,
    );
    const hoverPresentationForTarget = (target: InteractionAffordanceTarget): CanvasInteractionDef[] =>
        hoverPresentationInteractions.filter((interaction) =>
            resolveInteractionAffordance([interaction], target)?.hover);
    const regionInteraction = resolve
        ? canvasInteractions.find((interaction) => interaction.eventSource.gesture === 'drag')
        : undefined;
    const navigationInteraction = canvasInteractions.find(
        (interaction) => interaction.eventSource.type === 'navigation',
    );
    const elementDragInteraction = elementDragInteractions[0];
    const reorderElementDrag = elementDragInteraction?.eventSource.type === 'reorder';
    const assistDistanceFor = (eligible: readonly CanvasInteractionDef[]): number =>
        resolveAssistDistance(eligible, assistDistance);
    const retainedUpdates = new Map<string, ChartUpdate>();
    const previewUpdates = new Map<string, ChartUpdate>();
    const selectedElements = new Map<string, import('../../core/interaction-semantics').SemanticElement>();
    const hiddenKeys = new Set<string>();
    const retainedLegendTargets = new Map<string, SemanticTarget>();
    let selectedLegend: LegendHitIdentity | null = null;
    let hoveredLegend: LegendHitIdentity | null = null;
    let hoveredPathKeys = new Set<string>();
    let suppressClick = false;
    let regionDragging = false;
    const inspectSeriesLocks = new Map<string, unknown>();
    const inspectSeriesPresentation = new Map<string, Set<string>>();

    const containerLayoutSize = (): { width: number; height: number } => {
        const rect = container.getBoundingClientRect();
        return {
            width: container.offsetWidth || rect.width,
            height: container.offsetHeight || rect.height,
        };
    };

    const coordinateSpace = (): RendererCoordinateSpace => {
        const renderer = container.querySelector('canvas, svg') as HTMLElement | null;
        const rect = (renderer ?? container).getBoundingClientRect();
        const [viewOriginX, viewOriginY] = view.origin();
        const svg = renderer instanceof SVGSVGElement ? renderer : undefined;
        // SVG autosize/padding can make View#origin differ from the renderer's
        // final plot translation. The rendered root-frame CTM is authoritative.
        const rootFrame = svg?.querySelector<SVGGraphicsElement>('.mark-group.role-frame.root');
        const rootMatrix = rootFrame?.getCTM();
        const logicalWidth = svg?.viewBox.baseVal.width || rect.width;
        const logicalHeight = svg?.viewBox.baseVal.height || rect.height;
        const origin = rendererPlotOrigin(rootMatrix, { x: viewOriginX, y: viewOriginY });
        const originX = origin.x;
        const originY = origin.y;
        const viewWidth = view.width();
        const viewHeight = view.height();
        return {
            rect,
            logicalWidth,
            logicalHeight,
            originX,
            originY,
            plotWidth: viewWidth > 0 ? viewWidth : Math.max(0, logicalWidth - originX),
            plotHeight: viewHeight > 0 ? viewHeight : Math.max(0, logicalHeight - originY),
        };
    };

    const focusOverlay = createFocusOverlay({ view, container, plan, coordinateSpace, containerLayoutSize });
    const targetFeedbackOverlay = createTargetFeedbackOverlay({
        container,
        feedback: targetFeedback?.assisted || targetFeedback?.keyboard || {},
        coordinateSpace,
        containerLayoutSize,
    });
    const legendRangeOverlay = createLegendRangeOverlay({ container, coordinateSpace, containerLayoutSize });
    const annotationOverlayOptions = {
        view,
        container,
        coordinateSpace,
        containerLayoutSize,
        annotationMarkType: plan.annotationMarkType,
    };
    const annotationOverlays = new Map<string, ReturnType<typeof createAnnotationOverlay>>();
    const clearAnnotations = (): void => {
        for (const overlay of annotationOverlays.values()) overlay.clear();
    };
    const inspectGuideOverlay = createInspectGuideOverlay({
        container,
        coordinateSpace,
        containerLayoutSize,
    });
    const dragReorderOverlay = createDragReorderOverlay({
        view, container,
        reorderAxes: plan.reorderAxes ?? (plan.reorderAxis ? [plan.reorderAxis] : []),
        coordinateSpace, containerLayoutSize,
    });
    const dataOverlay = createDataOverlay({
        view, container, scales: plan.overlayScales ?? {}, coordinateSpace, containerLayoutSize,
    });
    const initialDataRows = plan.initialDataRows ?? plan.sourceRecords;
    let renderedDataRows: readonly Record<string, unknown>[] = initialDataRows;
    const reorderResetControls = createReorderResetControls({
        container,
        axes: plan.reorderAxes ?? (plan.reorderAxis ? [plan.reorderAxis] : []),
        isActive: (axis) => Array.isArray(view.signal(axis.signal)),
        reset: (axis) => {
            dragReorderOverlay.clear();
            for (const layer of [retainedUpdates, previewUpdates]) {
                for (const [id, update] of layer) {
                    const ops = update.ops.filter((op) =>
                        op.op !== 'set-order' || op.scope !== 'category' || op.field !== axis.field);
                    if (ops.length > 0) layer.set(id, { id, ops });
                    else layer.delete(id);
                }
            }
            void renderUpdates();
        },
    });
    const resetViewportRegion = (): void => {
        if (!regionInteraction?.eventSource.viewport) return;
        retainedUpdates.delete(regionInteraction.id);
        previewUpdates.delete(regionInteraction.id);
        void renderUpdates();
    };
    const viewportResetControl = createViewportResetControl({
        container,
        coordinateSpace,
        containerLayoutSize,
        isActive: () => Boolean(regionInteraction?.eventSource.viewport
            && [retainedUpdates, previewUpdates].some((layer) =>
                layer.get(regionInteraction.id)?.ops.some((op) => op.op === 'set-viewport'))),
        reset: resetViewportRegion,
    });
    const navigationController = createVegaNavigationController(view, plan.navigationAxes ?? {});
    const selectedKeys = (): Set<string> => new Set(selectedElements.keys());
    const renderPathFocus = (): void => focusOverlay.render(selectedKeys(), hoveredPathKeys);
    const renderLegendRange = (): void => legendRangeOverlay.render(selectedLegend, hoveredLegend);
    renderPathFocus();

    const allHits = (): RenderHit[] => sceneItems(view)
        .map(renderHit)
        .filter((hit): hit is RenderHit => hit !== null);
    const resolveContext = (hits: readonly RenderHit[]) => ({
        allHits: hits,
        keyField: INTERACTION_KEY,
        categoryField: plan.categoryField,
        seriesField: plan.seriesField,
    });
    const withSourceProvenance = (target: SemanticTarget | null): SemanticTarget | null =>
        enrichTargetWithSourceProvenance(target, plan);
    const selectedForInteraction = (interaction: CanvasInteractionDef): SemanticElement[] => {
        if (!interaction.retainedStateGroup) return [...selectedElements.values()];
        const keys = new Set<string>();
        for (const update of [retainedUpdates.get(interaction.id), previewUpdates.get(interaction.id)]) {
            if (!update) continue;
            for (const op of update.ops) {
                if (op.op !== 'set-style'
                    || (op.value.state !== 'emphasized' && op.value.state !== 'focused')) continue;
                for (const target of op.targets) {
                    if ('select' in target) continue;
                    for (const element of target.elements) {
                        for (const key of semanticElementRenderKeys(element)) keys.add(key);
                    }
                }
            }
        }
        return [...selectedElements].flatMap(([key, element]) => keys.has(key) ? [element] : []);
    };
    const context = (includeAvailable = true, interaction?: CanvasInteractionDef) => {
        // Navigation resolves per gesture frame, so the scenegraph scan stays behind this flag.
        const available = includeAvailable
            ? (() => {
                const hits = allHits();
                return withSourceProvenance(resolve?.(
                    { gesture: 'rectangle', role: 'region', hits },
                    resolveContext(hits),
                ) ?? null)?.elements;
            })()
            : undefined;
        const reorderAxes = plan.reorderAxes ?? (plan.reorderAxis ? [plan.reorderAxis] : []);
        const currentReorderAxes = reorderAxes.map((axis) => {
            const signaledOrder = view.signal(axis.signal);
            return {
                axis: axis.axis,
                field: axis.field,
                order: Array.isArray(signaledOrder) ? signaledOrder : view.scale(axis.scale).domain(),
            };
        });
        const reorderAxis = currentReorderAxes[0];
        const categoryOrder = reorderAxis
            ? reorderAxis.order
            : undefined;
        const legendDomains = Object.fromEntries(Object.entries(plan.legendFields ?? {}).map(([channel, field]) => [
            channel,
            [...new Set(plan.sourceRecords
                .map((record) => record[field])
                .filter((value) => value !== undefined))],
        ]));
        return {
            chartType,
            selected: interaction ? selectedForInteraction(interaction) : [...selectedElements.values()],
            available,
            resolveGroupValue: plan.resolveGroupValue,
            resolveNavigation: navigationController.resolve,
            categoryField: plan.categoryField,
            seriesField: plan.seriesField,
            legendDomains,
            categoryAxis: reorderAxis?.axis,
            categoryOrder,
            reorderAxes: currentReorderAxes,
        };
    };
    const resolveUpdateTarget = (target: UpdateTarget): SemanticTargetRef | null => {
        if (!('select' in target)) {
            if (target.visual.kind === 'legend') {
                if (!resolve) return null;
                const hits = allHits();
                const legends = target.elements
                    .map((element) => element.value as LegendTargetValue)
                    .filter((legend) => Boolean(legend.domain));
                const resolved = withSourceProvenance(resolveRetainedLegendPresentationTargets(
                    legends, resolve, resolveContext(hits), retainedLegendTargets,
                ));
                return resolved && resolved.elements.length > 0 ? {
                    visual: target.visual,
                    elements: [...resolved.elements, ...target.elements],
                } : null;
            }
            const renderedKeys = new Set(allHits()
                .map((hit) => hit.datum[INTERACTION_KEY])
                .filter((key): key is string => typeof key === 'string'));
            const hits = allHits();
            const elements = target.elements.flatMap((element) => {
                const associated = semanticElementRenderKeys(element).filter((key) => renderedKeys.has(key));
                if (associated.length > 0) return [element];
                const semanticRecords = element.records?.length ? element.records : [element.value];
                const matched = hits.flatMap((hit) => semanticRecords.some((record) =>
                    Object.entries(record).every(([field, value]) => Object.is(hit.datum[field], value)))
                    ? [hit.datum[INTERACTION_KEY]] : []);
                const keys = matched.filter((key): key is string => typeof key === 'string');
                return keys.length > 0 ? [associateSemanticElementRenderKeys(element, keys)] : [];
            });
            return elements.length > 0 ? { ...target, elements } : null;
        }

        const entries = Object.entries(target.select.key);
        if (entries.length === 0) return null;
        const hits = allHits().filter((hit) => matchesSemanticTargetSelector(target, plan.fields, hit.datum));
        if (hits.length === 0 || !resolve) return null;
        const resolved = withSourceProvenance(resolve({
            gesture: 'rectangle',
            role: target.select.visual?.role ?? 'external-selection',
            hits,
        }, resolveContext(hits)));
        if (!resolved) return null;
        if (target.select.visual?.kind && target.select.visual.kind !== resolved.visual.kind) return null;
        if (target.select.visual?.role && target.select.visual.role !== resolved.visual.role) return null;
        return resolved;
    };

    const resolveUpdate = (
        update: ChartUpdate,
    ): { update: ChartUpdate; result: ChartUpdateResult } => {
        const unresolvedTargets: UpdateTarget[] = [];
        const unsupportedOps: ChartUpdateOp['op'][] = [];
        let resolvedTargets = 0;
        const ops: ChartUpdateOp[] = [];
        for (const op of update.ops) {
            if (op.op === 'set-style') {
                const targets = op.targets.flatMap((target) => {
                    const resolved = resolveUpdateTarget(target);
                    if (!resolved) {
                        unresolvedTargets.push(target);
                        return [];
                    }
                    resolvedTargets += resolved.elements.length;
                    return [resolved];
                });
                if (targets.length > 0 || op.targets.length === 0) ops.push({ ...op, targets });
            } else if (op.op === 'set-annotation' && op.value !== null) {
                const target = resolveUpdateTarget(op.target);
                if (!target || target.elements.length !== 1) unresolvedTargets.push(op.target);
                else {
                    resolvedTargets += 1;
                    ops.push({ ...op, target });
                }
            } else if (op.op === 'set-viewport') {
                const supported = resolveSupportedOperation(op, plan);
                if (supported.unsupported) unsupportedOps.push(op.op);
                if (supported.op) ops.push(supported.op);
            } else if (op.op === 'set-order') {
                const supported = resolveSupportedOperation(op, plan);
                if (supported.unsupported) unsupportedOps.push(op.op);
                if (supported.op) ops.push(supported.op);
            } else if (op.op === 'set-overlay') {
                if (!plan.overlayScales?.x || !plan.overlayScales?.y) unsupportedOps.push(op.op);
                else ops.push(op);
            } else if (op.op === 'set-data') {
                if (!plan.mutableDataSource || op.source !== 'main') unsupportedOps.push(op.op);
                else ops.push(op);
            } else {
                ops.push(op);
            }
        }
        const hasUnsupported = unresolvedTargets.length > 0 || unsupportedOps.length > 0;
        return {
            update: { id: update.id, ops },
            result: {
                status: !hasUnsupported
                    ? 'applied'
                    : ops.length > 0 ? 'partially-applied' : 'unsupported',
                resolvedTargets,
                unresolvedTargets,
                unsupportedOps: [...new Set(unsupportedOps)],
            },
        };
    };

    const renderUpdates = async (): Promise<void> => {
        // A live preview supersedes the same interaction's retained state; other
        // interactions keep showing theirs.
        const displayUpdates = [
            ...[...retainedUpdates]
                .filter(([id]) => !previewUpdates.has(id))
                .map(([, update]) => update),
            ...previewUpdates.values(),
        ];
        const hiddenLegendDomains = new Map<string, { legend: LegendTargetValue; opacity: number }>();
        const activeHiddenLegendDomains = new Set<string>();
        const stylesByKey: Record<string, Pick<import('../../core/interaction-contracts').StyleSpec,
            'opacity' | 'fill' | 'stroke' | 'strokeWidth'>> = {};
        const overlays = new Map<string, ChartOverlaySpec>();
        let dataRows = initialDataRows;
        let emptyEmphasisActive = false;
        selectedElements.clear();
        hiddenKeys.clear();
        const reorderAxes = plan.reorderAxes ?? (plan.reorderAxis ? [plan.reorderAxis] : []);
        for (const axis of reorderAxes) view.signal(axis.signal, null);
        for (const axis of Object.keys(plan.navigationAxes ?? {}) as ('x' | 'y')[]) {
            navigationController.apply({ op: 'set-viewport', axes: axis, value: {} });
        }
        for (const update of displayUpdates) {
            for (const op of update.ops) {
                if (op.op === 'set-overlay') {
                    if (op.value === null) overlays.delete(op.name);
                    else overlays.set(op.name, op.value);
                    continue;
                }
                if (op.op === 'set-data') {
                    dataRows = op.value.rows;
                    continue;
                }
                if (op.op === 'set-style' && op.value.visible === false) {
                    for (const target of op.targets) {
                        if ('select' in target) continue;
                        for (const element of target.elements) {
                            for (const key of semanticElementRenderKeys(element)) {
                                hiddenKeys.add(key.endsWith(PATH_KEY_SUFFIX)
                                    ? key.slice(0, -PATH_KEY_SUFFIX.length)
                                    : key);
                            }
                            const legend = element.value as LegendTargetValue;
                            if (target.visual.kind === 'legend'
                                && legend.domain?.kind === 'value'
                                && legend.channel) {
                                activeHiddenLegendDomains.add(legendDomainIdentity(legend));
                            }
                            if (target.visual.kind === 'legend'
                                && legend.domain?.kind === 'value'
                                && legend.channel
                                && op.value.mutedOpacity !== undefined) {
                                const identity = `${legend.channel}:${String(legend.domain.value)}`;
                                hiddenLegendDomains.set(identity, { legend, opacity: op.value.mutedOpacity });
                            }
                        }
                    }
                }
                if (op.op === 'set-style') {
                    if (op.targets.length === 0
                        && (op.value.state === 'emphasized' || op.value.state === 'focused')) {
                        emptyEmphasisActive = true;
                    }
                    for (const target of op.targets) {
                        if ('select' in target) continue;
                        for (const element of target.elements) {
                            for (const key of semanticElementRenderKeys(element)) {
                                if (op.value.state === 'emphasized' || op.value.state === 'focused') {
                                    selectedElements.set(key, element);
                                }
                                const style = Object.fromEntries(
                                    (['opacity', 'fill', 'stroke', 'strokeWidth'] as const)
                                        .filter((channel) => op.value[channel] !== undefined)
                                        .map((channel) => [channel, op.value[channel]]),
                                );
                                if (Object.keys(style).length > 0) {
                                    stylesByKey[key] = { ...stylesByKey[key], ...style };
                                }
                            }
                        }
                    }
                } else if (op.op === 'set-viewport') {
                    navigationController.apply(op);
                } else if (op.op === 'set-order' && op.scope === 'category') {
                    const axis = reorderAxes.find((candidate) => candidate.field === op.field);
                    if (axis) view.signal(axis.signal, op.values);
                }
            }
        }
        const keys = [...selectedKeys()];
        if (plan.mutableDataSource && dataRows !== renderedDataRows) {
            view.change(
                plan.mutableDataSource,
                changeset().remove(() => true).insert([...dataRows]),
            );
            renderedDataRows = dataRows;
            plan.sourceRecords = dataRows;
        }
        for (const identity of retainedLegendTargets.keys()) {
            if (!activeHiddenLegendDomains.has(identity)) retainedLegendTargets.delete(identity);
        }
        if (keys.length === 0) selectedLegend = null;
        // A navigation-only chart compiles without the selection stores.
        if (plan.semanticStores !== false) {
            view.signal(STYLE_SIGNAL, stylesByKey);
            view.change(
                INTERACTION_STORE,
                changeset().remove(() => true).insert(emptyEmphasisActive && keys.length === 0
                    ? [{}]
                    : keys.map((key) => ({ key }))),
            );
            view.change(
                HIDDEN_STORE,
                changeset().remove(() => true).insert([...hiddenKeys].map((key) => ({ key }))),
            );
            view.change(
                LEGEND_HIDDEN_STORE,
                changeset().remove(() => true).insert([...hiddenLegendDomains]
                    .map(([identity, { opacity }]) => ({ identity, opacity }))),
            );
            view.change(
                LEGEND_SELECTION_STORE,
                changeset().remove(() => true).insert(selectedLegend ? [selectedLegend] : []),
            );
        }
        // An overlay installed by a click must become acquireable before a
        // following pointer-down, even while unrelated Vega work is pending.
        dataOverlay.render(overlays);
        await view.runAsync();
        dataOverlay.render(overlays);
        observeRenderer();
        renderPathFocus();
        renderLegendRange();
        reorderResetControls.layout();
        viewportResetControl.layout();
        const annotations = effectiveAnnotationEntries(displayUpdates)
            .filter((entry) => entry.value.text && entry.value.candidates);
        const annotationKeys = new Set(annotations.map((entry) => entry.key));
        for (const [key, overlay] of annotationOverlays) {
            if (annotationKeys.has(key)) continue;
            overlay.destroy();
            annotationOverlays.delete(key);
        }
        for (const annotation of annotations) {
            let overlay = annotationOverlays.get(annotation.key);
            if (!overlay) {
                overlay = createAnnotationOverlay(annotationOverlayOptions);
                annotationOverlays.set(annotation.key, overlay);
            }
            overlay.render(annotation.element, {
                ...annotation.value,
                text: annotation.value.text!,
                candidates: annotation.value.candidates!,
            });
        }
    };

    const storeUpdate = async (
        update: ChartUpdate,
        destination: Map<string, ChartUpdate>,
        legendSelection: LegendHitIdentity | null = null,
    ): Promise<ChartUpdateResult> => {
        const resolved = resolveUpdate(update);
        const presented = presentUpdate(resolved.update, context());
        destination.set(update.id, presented);
        if (legendSelection) selectedLegend = legendSelection;
        await renderUpdates();
        return resolved.result;
    };

    const applyInteractionUpdate = async (
        interaction: CanvasInteractionDef,
        phase: import('../../interactive/interactions').InteractionPhase,
        update: ChartUpdate | null,
        legendSelection: LegendHitIdentity | null = null,
    ): Promise<void> => {
        if (phase === 'cancel') {
            if (previewUpdates.delete(interaction.id)) await renderUpdates();
            return;
        }
        if (update) {
            const preview = phase === 'start' || phase === 'preview';
            if (!preview) previewUpdates.delete(interaction.id);
            if (!preview && interaction.retainedStateGroup) {
                for (const sibling of evictRetainedStateSiblings(
                    interaction, canvasInteractions, retainedUpdates, previewUpdates,
                )) {
                    if (sibling.claimsLegendActivation) selectedLegend = null;
                }
            }
            await storeUpdate(update, preview ? previewUpdates : retainedUpdates, legendSelection);
            return;
        }
        if (phase === 'commit') {
            const pending = previewUpdates.get(interaction.id);
            if (pending) {
                retainedUpdates.set(interaction.id, pending);
                previewUpdates.delete(interaction.id);
                await renderUpdates();
            }
        }
    };
    const emitCanvasInteractionEvent = (
        interaction: CanvasInteractionDef,
        event: CanvasInteractionEvent,
        transactionId?: string,
    ): void => {
        const root = container.closest<HTMLElement>('[data-flint-chart-id]');
        const detail: FlintInteractionEventDetail = {
            chartId: root?.dataset.flintChartId ?? '',
            interactionId: interaction.id,
            timestamp: Date.now(),
            transactionId,
            event,
        };
        container.dispatchEvent(new CustomEvent<FlintInteractionEventDetail>('flint-interaction', {
            detail,
            bubbles: true,
            composed: true,
        }));
    };
    const emitInteractionEvent = (
        interaction: CanvasInteractionDef,
        event: SemanticInteractionEvent | NavigationInteractionEvent,
        transactionId?: string,
    ): void => emitCanvasInteractionEvent(
        interaction,
        toCanvasInteractionEvent(event, interaction.eventSource),
        transactionId,
    );
    // A region can be read as data domains, which is what viewport updates need.
    const domainForGeometry = (plot: CanvasInteractionEvent['geometry']['plot']) =>
        domainForPlotGeometry(plot, plan.navigationAxes, (name) => view.scale(name));
    const dispatch = async (
        interaction: CanvasInteractionDef,
        event: SemanticInteractionEvent,
        legendSelection: LegendHitIdentity | null = null,
        actionOverride?: CanvasInteractionEvent['action'],
    ): Promise<void> => {
        const interactionContext = context(!interaction.eventSource.viewport, interaction);
        const base = toCanvasInteractionEvent(event, interaction.eventSource);
        const domain = domainForGeometry(base.geometry.plot);
        const withDomain = domain
            ? { ...base, geometry: { ...base.geometry, domain } }
            : base;
        const canvasEvent = actionOverride ? { ...withDomain, action: actionOverride } : withDomain;
        emitCanvasInteractionEvent(interaction, canvasEvent);
        const request = interaction.handle?.(canvasEvent, interactionContext) ?? null;
        await applyInteractionUpdate(interaction, event.phase, request, legendSelection);
    };
    let navigationDispatch = Promise.resolve();
    const dispatchNavigation = (
        interaction: CanvasInteractionDef,
        event: NavigationInteractionEvent,
    ): Promise<void> => {
        const run = async (): Promise<void> => {
            const canvasEvent = toCanvasInteractionEvent(event, interaction.eventSource);
            emitCanvasInteractionEvent(interaction, canvasEvent);
            const request = interaction.handle?.(canvasEvent, context(false)) ?? null;
            await applyInteractionUpdate(interaction, event.phase, request);
        };
        navigationDispatch = navigationDispatch.then(run, run);
        return navigationDispatch;
    };
    const resolveTarget = (
        gesture: 'click' | 'hover' | 'rectangle' | 'angular',
        role: string,
        hits: readonly RenderHit[],
        legend?: LegendTargetValue,
    ): SemanticTarget | null => {
        if (!resolve) return null;
        const availableHits = allHits();
        return withSourceProvenance(resolve(
            { gesture, role, hits, legend },
            resolveContext(availableHits),
        ));
    };
    const resolveAxisTarget = (item: any): SemanticTarget | null => {
        const identity = axisTargetIdentity(item, plan.axisTargets);
        if (!identity) return null;
        const hits = allHits().filter((hit) => Object.is(hit.datum[identity.field], identity.value));
        if (hits.length === 0) return null;
        const represented = resolveTarget('click', 'axis-tick', hits);
        const records = [...new Set(represented?.elements.flatMap((element) => element.records ?? []) ?? [])];
        const keys = [...new Set(represented?.elements.flatMap(semanticElementRenderKeys) ?? [])];
        return {
            visual: { kind: 'axis', role: identity.role },
            elements: [associateSemanticElementRenderKeys({
                value: { axis: identity.axis, field: identity.field, value: identity.value },
                ...(records.length > 0 ? { records } : {}),
            }, keys)],
        };
    };
    let hoveredKeys = '\u0001\u0000';
    let hoverActive = false;
    let lastHoverTarget: SemanticTarget | null = null;
    let lastHoverPoint: import('../../interactive/interactions').PlotPoint | null = null;
    let hoverClearTimer: ReturnType<typeof setTimeout> | undefined;
    const setHover = async (
        keys: readonly string[],
        legend: LegendHitIdentity | null = null,
        axis: { scale: string; value: unknown } | null = null,
    ): Promise<void> => {
        const tracked = [...inspectSeriesPresentation.values()].flatMap((seriesKeys) => [...seriesKeys]);
        const next = [...new Set([...tracked, ...keys])].sort();
        const signature = `${next.join('\u0000')}\u0001${legend?.channel ?? ''}\u0000${String(legend?.value ?? '')}`
            + `\u0001${axis?.scale ?? ''}\u0000${String(axis?.value ?? '')}`;
        if (signature === hoveredKeys) return;
        hoveredKeys = signature;
        hoveredPathKeys = new Set(next.filter((key) => key.endsWith(PATH_KEY_SUFFIX)));
        hoveredLegend = legend;
        const renderedItems = hoveredPathKeys.size > 0 ? sceneItems(view) : [];
        const presentationKeys = [...new Set(next.map(
            (key) => pathHoverPresentationKey(renderedItems, key),
        ))];
        view.change(
            HOVER_STORE,
            changeset().remove(() => true).insert(presentationKeys.map((key) => ({ key }))),
        );
        view.change(
            LEGEND_HOVER_STORE,
            changeset().remove(() => true).insert(legend ? [legend] : []),
        );
        view.change(
            AXIS_HOVER_STORE,
            changeset().remove(() => true).insert(axis ? [axis] : []),
        );
        await view.runAsync();
        renderPathFocus();
        renderLegendRange();
    };
    const setTrackedInspectSeries = (
        interaction: CanvasInteractionDef,
        series: unknown,
        items = sceneItems(view),
    ): void => {
        const seriesBy = interaction.eventSource.inspectIndex?.seriesBy;
        if (!seriesBy) return;
        inspectSeriesLocks.set(interaction.id, series);
        inspectSeriesPresentation.set(
            interaction.id,
            new Set(inspectSeriesPresentationKeys(items, seriesBy, series)),
        );
    };
    for (const interaction of inspectInteractions) {
        const policy = interaction.eventSource.inspectIndex;
        if (!policy?.seriesBy || (policy.show !== 'single' && typeof policy.show !== 'object')) continue;
        const items = sceneItems(view);
        const preferred = typeof policy.show === 'object' ? policy.show.series : undefined;
        setTrackedInspectSeries(
            interaction,
            initialInspectSeries(items, policy.seriesBy, preferred),
            items,
        );
    }
    if (inspectSeriesPresentation.size > 0) void setHover([]);
    const clearHover = (): void => {
        if (hoverClearTimer !== undefined) {
            clearTimeout(hoverClearTimer);
            hoverClearTimer = undefined;
        }
        targetFeedbackOverlay.clear();
        lastHoverTarget = null;
        lastHoverPoint = null;
        void setHover([]);
        if (hoverInteractions.length > 0 && hoverActive) {
            hoverActive = false;
            for (const interaction of hoverInteractions) {
                void dispatch(interaction, {
                    type: 'semantic', source: 'element', phase: 'cancel', target: null,
                });
            }
        }
        if (!regionInteraction && !navigationInteraction) container.style.cursor = previousCursor;
    };
    const scheduleHoverClear = (): void => {
        if (hoverClearTimer !== undefined) clearTimeout(hoverClearTimer);
        hoverClearTimer = setTimeout(() => {
            hoverClearTimer = undefined;
            clearHover();
        }, 16);
    };
    // A pointer that misses every mark still acquires the nearest one, so small
    // marks stay reachable without changing which action the preset receives.
    const acquire = (
        item: any,
        point: import('../../interactive/interactions').PlotPoint,
        rootPoint: import('../../interactive/interactions').PlotPoint,
        phase: 'preview' | 'commit',
        modifiers: ReturnType<typeof interactionModifiers>,
        tolerance = 0,
    ) => {
        const space = coordinateSpace();
        const direct = normalizeVegaElementEvent(
            view, item, point, phase, modifiers, plan.legendFields, plan.rangeLegendChannels, rootPoint,
        );
        if (tolerance <= 0 || direct.legend || direct.event.hits.length > 0) return { ...direct, feedbackItem: null };
        const rawPlotPoint = { x: rootPoint.x - space.originX, y: rootPoint.y - space.originY };
        const overPlot = rawPlotPoint.x >= 0 && rawPlotPoint.x <= space.plotWidth
            && rawPlotPoint.y >= 0 && rawPlotPoint.y <= space.plotHeight;
        const snapped = nearestInteractiveSceneItem(
            view, rawPlotPoint, tolerance, rootPoint, overPlot,
        );
        return snapped
            ? { ...normalizeVegaElementEvent(
                view, snapped, point, phase, modifiers, plan.legendFields, plan.rangeLegendChannels, rootPoint,
            ), feedbackItem: snapped }
            : { ...direct, feedbackItem: null };
    };
    const hoverHandler = (event: MouseEvent, item: any): void => {
        if ((hoverPresentationInteractions.length === 0 && axisHoverPresentationInteractions.length === 0)
            || regionDragging) return;
        if (hoverClearTimer !== undefined) {
            clearTimeout(hoverClearTimer);
            hoverClearTimer = undefined;
        }
        const { point, rootPoint } = pointerPoints(event as unknown as PointerEvent);
        const axisTarget = resolveAxisTarget(item);
        if (axisTarget) {
            const identity = axisTargetIdentity(item, plan.axisTargets);
            if (!identity) return clearHover();
            const reorderEligible = !!elementDragInteraction && !!identity
                && eligibleReorderAxesForAxis(
                    plan.reorderAxes ?? (plan.reorderAxis ? [plan.reorderAxis] : []),
                    identity,
                ).length > 0;
            if (axisHoverPresentationInteractions.length === 0 && !reorderEligible) return clearHover();
            hoverActive = true;
            for (const interaction of axisHoverInteractions) {
                void dispatch(interaction, {
                    type: 'semantic', source: 'element', phase: 'preview', target: axisTarget, point,
                    modifiers: interactionModifiers(event),
                });
            }
            void setHover(
                axisTarget.elements.flatMap(semanticElementRenderKeys),
                null,
                { scale: identity.scale, value: identity.value },
            );
            return;
        }
        const markHoverPresentationInteractions = hoverPresentationForTarget('mark');
        const normalized = acquire(
            item, point, rootPoint, 'preview', interactionModifiers(event),
            assistDistanceFor(markHoverPresentationInteractions),
        );
        const legend = normalized.legend;
        if (legend) {
            const legendHoverInteractions = hoverPresentationForTarget('legend-item');
            if (legendHoverInteractions.length === 0) return clearHover();
            const resolved = legendSemanticTarget(legend);
            hoverActive = true;
            for (const interaction of markHoverInteractions.filter((candidate) =>
                legendHoverInteractions.includes(candidate))) {
                void dispatch(interaction, {
                    type: 'semantic', source: 'element', phase: 'preview', target: resolved, point,
                    modifiers: normalized.event.modifiers,
                });
            }
            void setHover([], legend);
            return;
        }
        const hovered = normalized.event.hits[0];
        const reorderAxes = plan.reorderAxes ?? (plan.reorderAxis ? [plan.reorderAxis] : []);
        const reorderEligible = !!hovered && !!elementDragInteraction
            && eligibleReorderAxesForHit(reorderAxes, hovered).length > 0;
        const directResolved = resolveTarget('hover', normalized.role, normalized.event.hits);
        let resolved = directResolved;
        if (!resolved && hoverTolerance > 0 && lastHoverTarget && lastHoverPoint
            && Math.hypot(rootPoint.x - lastHoverPoint.x, rootPoint.y - lastHoverPoint.y) <= hoverTolerance) {
            resolved = lastHoverTarget;
        }
        if (!resolved) {
            clearHover();
            return;
        }
        if (directResolved) {
            lastHoverTarget = directResolved;
            lastHoverPoint = rootPoint;
        }
        if (normalized.feedbackItem && targetFeedback?.assisted) {
            targetFeedbackOverlay.render(normalized.feedbackItem, resolved, 'assisted');
        } else {
            targetFeedbackOverlay.clear();
        }
        hoverActive = true;
        const interactionContext = context();
        const presentationElements = markHoverPresentationInteractions.flatMap((interaction) => {
            if (interaction.eventSource.gesture === 'drag-element') {
                return reorderEligible ? resolved?.elements ?? [] : [];
            }
            if (!interaction.handle) return resolved?.elements ?? [];
            const preview = interaction.handle(toCanvasInteractionEvent({
                type: 'semantic', source: 'element', phase: 'preview', target: resolved, point,
                modifiers: normalized.event.modifiers,
            }, interaction.eventSource), interactionContext);
            return preview?.ops.flatMap((op) => op.op === 'set-style'
                && (op.value.state === 'emphasized' || op.value.state === 'focused')
                ? op.targets.flatMap((target) => 'select' in target ? [] : target.elements)
                : []) ?? [];
        });
        for (const interaction of markHoverInteractions.filter((candidate) =>
            markHoverPresentationInteractions.includes(candidate))) {
            void dispatch(interaction, {
                type: 'semantic', source: 'element', phase: 'preview', target: resolved, point,
                modifiers: normalized.event.modifiers,
            });
        }
        void setHover(presentationElements
            .flatMap(semanticElementRenderKeys));
    };

    const singleSeriesInspectInteractions = inspectInteractions.filter((interaction) => {
        const show = interaction.eventSource.inspectIndex?.show;
        return show === 'single' || typeof show === 'object';
    });
    const clickHandler = (event: MouseEvent, item: any): void => {
        if ((clickInteractions.length === 0 && singleSeriesInspectInteractions.length === 0) || suppressClick) return;
        const { point, rootPoint } = pointerPoints(event as unknown as PointerEvent);
        const axisTarget = resolveAxisTarget(item);
        if (axisTarget) {
            for (const interaction of axisClickInteractions) {
                void dispatch(interaction, {
                    type: 'semantic', source: 'element', phase: 'commit', target: axisTarget, point,
                    modifiers: interactionModifiers(event),
                });
            }
            return;
        }
        const normalized = acquire(
            item, point, rootPoint, 'commit', interactionModifiers(event),
            assistDistanceFor(markClickInteractions),
        );
        const { legend } = normalized;
        const target = legend ? resolvedLegendInteractionTarget(
            { channel: legend.channel, field: legend.field, domain: legend.domain },
            resolveTarget('click', 'legend-item', [], legend),
        )
            : resolveTarget('click', normalized.role, normalized.event.hits);
        for (const interaction of markClickInteractions) {
            const affordanceTarget = legend ? 'legend-item' : 'mark';
            if (!resolveInteractionAffordance([interaction], affordanceTarget)) continue;
            void dispatch(interaction, {
                type: 'semantic', source: 'element', phase: 'commit', target, point,
                modifiers: normalized.event.modifiers,
            }, legend);
        }
        if (legend) {
            for (const interaction of singleSeriesInspectInteractions) {
                const policy = interaction.eventSource.inspectIndex!;
                if (!policy.seriesBy || legend.field !== policy.seriesBy) continue;
                setTrackedInspectSeries(interaction, legend.value);
                void setHover([], legend);
                void dispatch(interaction, {
                    type: 'semantic', source: 'element', phase: 'commit', target, point,
                    modifiers: normalized.event.modifiers,
                }, legend);
                inspectHandler(event);
            }
        }
    };
    const contextHandler = (event: MouseEvent): void => {
        if (contextInteractions.length === 0) return;
        event.preventDefault();
        const point = localPoint(event as unknown as PointerEvent);
        // A zero radius resolves the mark under the pointer; assist widens it.
        const item = nearestSceneItem(view, point, assistDistanceFor(contextInteractions));
        const normalized = normalizeVegaElementEvent(
            view, item, point, 'commit', interactionModifiers(event), plan.legendFields, plan.rangeLegendChannels,
            { x: point.x + coordinateSpace().originX, y: point.y + coordinateSpace().originY },
        );
        const { legend } = normalized;
        const target = legend ? legendSemanticTarget(legend)
            : resolveTarget('click', normalized.role, normalized.event.hits);
        for (const interaction of contextInteractions) {
            void dispatch(interaction, {
                type: 'semantic', source: 'element', phase: 'commit', target, point,
                modifiers: normalized.event.modifiers,
            });
        }
    };
    const inspectModeIndices = new Map(inspectInteractions.map((interaction) => [interaction.id, 0]));
    const inspectModes = (interaction: CanvasInteractionDef) => interaction.eventSource.inspectCycle ?? [{
        inspect: interaction.eventSource.inspect ?? 'xy',
        predicate: interaction.eventSource.inspectPredicate ?? {},
    }];
    const activeInspectMode = (interaction: CanvasInteractionDef) => {
        const modes = inspectModes(interaction);
        return modes[inspectModeIndices.get(interaction.id) ?? 0] ?? modes[0];
    };
    const inspectHandler = (event: MouseEvent): void => {
        if (inspectInteractions.length === 0) return;
        const point = localPoint(event as unknown as PointerEvent);
        const space = coordinateSpace();
        const items = sceneItems(view);
        const polarFrame = polarFrameFromItems(items, point);
        let guideRendered = false;
        for (const interaction of inspectInteractions) {
            const activeMode = activeInspectMode(interaction);
            const mode = activeMode.inspect;
            const eligibleItems = interaction.eventSource.selector
                ? items.filter((item) => matchesSemanticTargetSelector(
                    interaction.eventSource.selector!, plan.fields, item.datum ?? {},
                ))
                : items;
            const tolerance = interaction.eventSource.inspectTolerance ?? 0.01;
            const guide = interaction.eventSource.inspectGuide ?? normalizeInspectGuideOptions(undefined);
            const indexPolicy = interaction.eventSource.inspectIndex;
            const singleSeries = indexPolicy?.show === 'single' || typeof indexPolicy?.show === 'object';
            if (singleSeries && indexPolicy?.seriesBy && !inspectSeriesLocks.has(interaction.id)) {
                const preferred = typeof indexPolicy.show === 'object' ? indexPolicy.show.series : undefined;
                setTrackedInspectSeries(
                    interaction,
                    initialInspectSeries(eligibleItems, indexPolicy.seriesBy, preferred),
                    eligibleItems,
                );
                void setHover([]);
            }
            const effectiveShow = singleSeries
                ? { series: inspectSeriesLocks.get(interaction.id) }
                : indexPolicy?.show;
            const indexField = indexPolicy ? plan.axisFields?.[indexPolicy.axis] : undefined;
            const continuousIndex = indexField?.type === 'temporal' || indexField?.type === 'quantitative';
            const indexScaleName = indexPolicy && indexField
                ? Object.entries(plan.axisTargets ?? {}).find(([, target]) =>
                    target.axis === indexPolicy.axis && target.field === indexField.field)?.[0]
                : undefined;
            const indexScale = indexScaleName ? view.scale(indexScaleName) : undefined;
            const discreteCoordinates = !continuousIndex && indexScale?.domain
                ? indexScale.domain().map((value: unknown) =>
                    Number(indexScale(value)) + (Number(indexScale.bandwidth?.()) || 0) / 2)
                : undefined;
            const indexAcquisition = indexPolicy && !polarFrame
                ? indexInspectAcquisition(
                    eligibleItems,
                    point,
                    indexPolicy.axis,
                    { show: effectiveShow as 'all' | { series: unknown }, seriesBy: indexPolicy.seriesBy },
                    continuousIndex,
                    discreteCoordinates,
                    (indexPolicy.axis === 'x' ? space.plotWidth : space.plotHeight) * tolerance,
                )
                : undefined;
            const hits = indexAcquisition
                ? indexAcquisition.hits
                : polarFrame
                ? polarInspectHits(eligibleItems, point, polarFrame)
                : tolerantInspectHits(
                    eligibleItems,
                    point,
                    mode,
                    activeMode.predicate,
                    { x: space.plotWidth * tolerance, y: space.plotHeight * tolerance },
                );
            if (guide.visible && indexAcquisition) {
                const guidePoint = indexPolicy!.axis === 'x'
                    ? { x: indexAcquisition.coordinate, y: point.y }
                    : { x: point.x, y: indexAcquisition.coordinate };
                inspectGuideOverlay.renderAxes(guidePoint, indexPolicy!.axis, guide.style);
                inspectGuideOverlay.renderValueRules(
                    indexAcquisition.valueCoordinates,
                    indexPolicy!.axis,
                    guide.style,
                );
                guideRendered = true;
            } else if (guide.visible && polarFrame) {
                const segment = polarGuideSegment(polarFrame, point);
                inspectGuideOverlay.renderSegment(segment.start, segment.end, guide.style);
                guideRendered = true;
            } else if (guide.visible) {
                inspectGuideOverlay.renderAxes(point, mode, guide.style);
                guideRendered = true;
            }
            void dispatch(interaction, {
                type: 'semantic', source: 'element', phase: 'preview',
                target: hits.length > 0 ? resolveTarget('hover', 'mark', hits) : null,
                point,
                modifiers: interactionModifiers(event),
            });
        }
        if (!guideRendered) inspectGuideOverlay.clear();
    };
    let lastInspectWheelAt = 0;
    const cycleInspect = (event: MouseEvent, direction: 1 | -1): void => {
        const cycling = inspectInteractions.filter((interaction) => inspectModes(interaction).length > 1);
        if (cycling.length === 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        for (const interaction of cycling) {
            const modes = inspectModes(interaction);
            const current = inspectModeIndices.get(interaction.id) ?? 0;
            inspectModeIndices.set(interaction.id, (current + direction + modes.length) % modes.length);
        }
        inspectHandler(event);
    };
    const inspectWheel = (event: WheelEvent): void => {
        const now = performance.now();
        event.preventDefault();
        if (now - lastInspectWheelAt < 160 || event.deltaY === 0) return;
        lastInspectWheelAt = now;
        cycleInspect(event, event.deltaY > 0 ? 1 : -1);
    };
    const inspectContext = (event: MouseEvent): void => cycleInspect(event, 1);
    const inspectLeave = (): void => {
        inspectGuideOverlay.clear();
        for (const interaction of inspectInteractions) {
            void dispatch(interaction, {
                type: 'semantic', source: 'element', phase: 'cancel', target: null,
            });
        }
    };
    if (inspectInteractions.length > 0) {
        container.addEventListener('pointermove', inspectHandler);
        container.addEventListener('pointerleave', inspectLeave);
        if (inspectInteractions.some((interaction) => inspectModes(interaction).length > 1)) {
            container.addEventListener('wheel', inspectWheel, { passive: false });
            container.addEventListener('contextmenu', inspectContext);
        }
    }
    const pointerTarget = (event: MouseEvent, eligible: readonly CanvasInteractionDef[]) => {
        const point = localPoint(event as unknown as PointerEvent);
        const item = nearestSceneItem(view, point, assistDistanceFor(eligible));
        const normalized = normalizeVegaElementEvent(
            view, item, point, 'commit', interactionModifiers(event), plan.legendFields, plan.rangeLegendChannels,
            { x: point.x + coordinateSpace().originX, y: point.y + coordinateSpace().originY },
        );
        return {
            point,
            modifiers: normalized.event.modifiers,
            legend: normalized.legend,
            target: normalized.legend ? legendSemanticTarget(normalized.legend)
                : resolveTarget('click', normalized.role, normalized.event.hits),
        };
    };
    let longPressTimer: number | undefined;
    let longPressPointer: { id: number; x: number; y: number } | undefined;
    const dismissPolicy = dismiss === false ? { click: false as const, escape: false } : {
        click: dismiss?.click ?? 'non-element' as const,
        escape: dismiss?.escape ?? true,
    };
    let dismissTimer: number | undefined;
    let consumeDismissClick = false;
    const cancelPendingDismiss = (): void => {
        if (dismissTimer === undefined) return;
        window.clearTimeout(dismissTimer);
        dismissTimer = undefined;
    };
    const clearDismissibleState = (): void => {
        cancelPendingDismiss();
        let changed = false;
        for (const layer of [retainedUpdates, previewUpdates]) {
            for (const [id, update] of layer) {
                const ops = update.ops.filter((op) =>
                    op.op !== 'set-style' && op.op !== 'set-annotation');
                if (ops.length > 0) layer.set(id, { id, ops });
                else layer.delete(id);
                changed = changed || ops.length !== update.ops.length;
            }
        }
        if (changed) void renderUpdates();
    };
    const dismissOnClick = (event: MouseEvent, item: any): void => {
        if (!dismissPolicy.click || suppressClick || isInteractiveControlTarget(event.target)) return;
        if (consumeDismissClick) {
            consumeDismissClick = false;
            return;
        }
        const { point, rootPoint } = pointerPoints(event as unknown as PointerEvent);
        const normalized = acquire(
            item, point, rootPoint, 'commit', interactionModifiers(event),
            assistDistanceFor(clickInteractions),
        );
        const target = normalized.legend
            ? resolvedLegendInteractionTarget(
                { channel: normalized.legend.channel, field: normalized.legend.field, domain: normalized.legend.domain },
                resolveTarget('click', 'legend-item', [], normalized.legend),
            )
            : resolveTarget('click', normalized.role, normalized.event.hits);
        const space = coordinateSpace();
        const inPlot = point.x >= 0 && point.x <= space.plotWidth
            && point.y >= 0 && point.y <= space.plotHeight;
        if (dismissPolicy.click === 'non-element' && target) return;
        if (dismissPolicy.click === 'plot-background' && (!inPlot || target)) return;
        cancelPendingDismiss();
        if (doubleInteractions.length > 0) {
            dismissTimer = window.setTimeout(() => {
                dismissTimer = undefined;
                clearDismissibleState();
            }, 250);
        } else {
            clearDismissibleState();
        }
    };
    const cancelLongPress = (): void => {
        if (longPressTimer !== undefined) window.clearTimeout(longPressTimer);
        longPressTimer = undefined;
        longPressPointer = undefined;
    };
    const longPressStart = (event: PointerEvent): void => {
        if (longPressInteractions.length === 0 || event.button !== 0) return;
        event.preventDefault();
        cancelLongPress();
        longPressPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
        const holdMs = longPressInteractions[0].eventSource.holdMs ?? 500;
        longPressTimer = window.setTimeout(() => {
            longPressTimer = undefined;
            longPressPointer = undefined;
            const acquired = pointerTarget(event, longPressInteractions);
            if (!acquired.target) return;
            consumeDismissClick = true;
            suppressClick = true;
            window.setTimeout(() => { suppressClick = false; }, 0);
            for (const interaction of longPressInteractions) {
                void dispatch(interaction, {
                    type: 'semantic', source: 'element', phase: 'commit',
                    target: acquired.target, point: acquired.point, modifiers: acquired.modifiers,
                });
            }
        }, holdMs);
    };
    const longPressMove = (event: PointerEvent): void => {
        if (!longPressPointer || event.pointerId !== longPressPointer.id) return;
        if (longPressMovedBeyond(
            longPressPointer,
            { x: event.clientX, y: event.clientY },
        )) cancelLongPress();
    };
    const doubleHandler = (event: MouseEvent): void => {
        if (doubleInteractions.length === 0) return;
        event.preventDefault();
        cancelPendingDismiss();
        const acquired = pointerTarget(event, doubleInteractions);
        for (const interaction of doubleInteractions) {
            void dispatch(interaction, {
                type: 'semantic', source: 'element', phase: 'commit',
                target: acquired.target, point: acquired.point, modifiers: acquired.modifiers,
            });
        }
    };
    if (longPressInteractions.length > 0) {
        container.addEventListener('pointerdown', longPressStart, true);
        container.addEventListener('pointerup', cancelLongPress, true);
        container.addEventListener('pointermove', longPressMove, true);
        container.addEventListener('pointercancel', cancelLongPress, true);
    }
    if (doubleInteractions.length > 0) container.addEventListener('dblclick', doubleHandler);
    if (dismissPolicy.click) view.addEventListener('click', dismissOnClick);
    if (contextInteractions.length > 0) {
        container.addEventListener('contextmenu', contextHandler);
    }
    if (clickInteractions.length > 0 || singleSeriesInspectInteractions.length > 0) {
        view.addEventListener('click', clickHandler);
    }
    if (hoverPresentationInteractions.length > 0) {
        view.addEventListener('mousemove', hoverHandler);
        view.addEventListener('mouseout', scheduleHoverClear);
    }

    const previousCursor = container.style.cursor;
    const previousUserSelect = container.style.userSelect;
    const previousTouchAction = container.style.touchAction;
    if (longPressInteractions.length > 0) container.style.touchAction = 'none';
    const suppressTextSelection = doubleInteractions.length > 0
        || canvasInteractions.some((interaction) => interaction.claimsLegendActivation);
    if (suppressTextSelection) container.style.userSelect = 'none';
    const localPoint = (event: PointerEvent): { x: number; y: number } => {
        return clientToPlotPoint({ x: event.clientX, y: event.clientY }, coordinateSpace());
    };
    const pointerPoints = (event: PointerEvent) => {
        const space = coordinateSpace();
        const client = { x: event.clientX, y: event.clientY };
        return {
            point: clientToPlotPoint(client, space),
            rootPoint: clientToRendererPoint(client, space),
        };
    };
    const cursorInteractions = canvasInteractions.filter((interaction) =>
        interaction.affordances?.some((affordance) => affordance.cursor));
    const setAffordanceCursor = (
        target: InteractionAffordanceTarget,
        reorderEligible: boolean,
    ): void => {
        const eligibleIds = new Set(cursorInteractions
            .filter((interaction) => reorderEligible || interaction !== elementDragInteraction)
            .map((interaction) => interaction.id));
        container.style.cursor = affordanceCursor(
            resolveInteractionAffordance(cursorInteractions, target, eligibleIds),
        ) ?? previousCursor;
    };
    const affordanceHandler = (event: MouseEvent, item: any): void => {
        if (regionDragging) return;
        const axisTarget = resolveAxisTarget(item);
        if (axisTarget) {
            const identity = axisTargetIdentity(item, plan.axisTargets);
            const reorderEligible = !!elementDragInteraction && !!identity
                && eligibleReorderAxesForAxis(
                    plan.reorderAxes ?? (plan.reorderAxis ? [plan.reorderAxis] : []),
                    identity,
                ).length > 0;
            setAffordanceCursor('axis-label', reorderEligible);
            return;
        }
        const { point, rootPoint } = pointerPoints(event as unknown as PointerEvent);
        const normalized = acquire(
            item, point, rootPoint, 'preview', interactionModifiers(event),
            assistDistanceFor(cursorInteractions),
        );
        if (normalized.legend) {
            setAffordanceCursor('legend-item', false);
            return;
        }
        const hit = normalized.event.hits[0];
        const reorderEligible = !!hit && !!elementDragInteraction
            && eligibleReorderAxesForHit(
                plan.reorderAxes ?? (plan.reorderAxis ? [plan.reorderAxis] : []), hit,
            ).length > 0;
        setAffordanceCursor(hit ? 'mark' : 'plot', reorderEligible);
    };
    if (cursorInteractions.length > 0) view.addEventListener('mousemove', affordanceHandler);
    let elementDrag: {
        start: { x: number; y: number };
        source: SemanticTarget;
        sourceItem?: any;
        destination: SemanticTarget;
        moved: boolean;
        axis?: 'x' | 'y';
        eligibleAxes: readonly ('x' | 'y')[];
        overlayName?: string;
    } | undefined;
    const reorderItemAt = (event: PointerEvent): any => {
        const eventItem = (event.target as any)?.__data__;
        if (renderHit(eventItem)) return eventItem;
        const point = localPoint(event);
        return sceneItems(view).find((item) => {
            const bounds = item.bounds;
            return renderHit(item) && bounds
                && point.x >= bounds.x1 && point.x <= bounds.x2
                && point.y >= bounds.y1 && point.y <= bounds.y2;
        });
    };
    const resolveDraggedTarget = (
        event: PointerEvent,
    ): { target: SemanticTarget; item?: any; eligibleAxes: readonly ('x' | 'y')[]; overlayName?: string } | null => {
        if (!reorderElementDrag) {
            // A retained overlay is a visual enhancement, not a replacement
            // for an underlying semantic mark. Prefer a real mark whenever
            // pointer-down lands on or near one; fall back to the overlay for
            // the rest of its path.
            const point = localPoint(event);
            const exactItem = reorderItemAt(event);
            const item = renderHit(exactItem)
                ? exactItem
                : nearestSceneItem(
                    view,
                    point,
                    elementDragInteraction?.eventSource.targetTolerance ?? 0,
                );
            const hit = renderHit(item);
            if (hit) {
                const target = resolveTarget('click', hit.layerRole ?? hit.markType ?? 'mark', [hit]);
                if (target) return { target, item, eligibleAxes: [] };
            }
            const overlay = dataOverlay.targetForElement(event.target)
                ?? dataOverlay.targetAt(
                    point,
                    elementDragInteraction?.eventSource.targetTolerance ?? 0,
                );
            if (overlay) return { target: overlay.target, eligibleAxes: [], overlayName: overlay.name };
            return null;
        }
        const axes = plan.reorderAxes ?? (plan.reorderAxis ? [plan.reorderAxis] : []);
        const eventItem = (event.target as any)?.__data__;
        const axisItem = axisTargetIdentity(eventItem, plan.axisTargets)
            ? eventItem
            : axisItemAt(view, pointerPoints(event).rootPoint, plan.axisTargets);
        const axisIdentity = axisTargetIdentity(axisItem, plan.axisTargets);
        if (axisIdentity) {
            const eligibleAxes = eligibleReorderAxesForAxis(axes, axisIdentity).map(({ axis }) => axis);
            const target = eligibleAxes.length > 0 ? resolveAxisTarget(axisItem) : null;
            if (target) return { target, item: axisItem, eligibleAxes };
        }
        const hit = renderHit(reorderItemAt(event));
        if (!hit) return null;
        const target = resolveTarget('click', hit.layerRole ?? hit.markType ?? 'mark', [hit]);
        const eligibleAxes = eligibleReorderAxesForHit(axes, hit).map(({ axis }) => axis);
        return target && eligibleAxes.length > 0
            ? { target, item: reorderItemAt(event), eligibleAxes }
            : null;
    };
    const resolveReorderDestination = (
        current: { x: number; y: number },
        axis: 'x' | 'y',
    ): SemanticTarget | null => {
        const axes = plan.reorderAxes ?? (plan.reorderAxis ? [plan.reorderAxis] : []);
        const active = axes.find((candidate) => candidate.axis === axis) ?? axes[0];
        if (!active) return null;
        const hit = nearestReorderHit(sceneItems(view), active.axis, active.field, current[active.axis]);
        return hit ? resolveTarget('click', hit.layerRole ?? hit.markType ?? 'mark', [hit]) : null;
    };
    const dispatchElementDrag = async (
        phase: 'start' | 'preview' | 'commit' | 'cancel',
        event: PointerEvent,
        current: { x: number; y: number },
        invokeHandler = true,
    ): Promise<void> => {
        if (!elementDragInteraction || !elementDrag) return;
        if (!elementDrag.overlayName && !reorderElementDrag) {
            elementDrag.overlayName = dataOverlay.targetAt(
                current,
                elementDragInteraction.eventSource.targetTolerance ?? 0,
            )?.name;
        }
        const canvasEvent: CanvasInteractionEvent = {
            action: 'drag-element',
            phase,
            geometry: {
                plot: {
                    kind: 'drag',
                    start: elementDrag.start,
                    current,
                    delta: { x: current.x - elementDrag.start.x, y: current.y - elementDrag.start.y },
                    axis: elementDrag.axis,
                },
            },
            target: elementDrag.source,
            dropTarget: elementDrag.destination,
            modifiers: interactionModifiers(event),
        };
        if (elementDrag.overlayName) {
            canvasEvent.geometry.projection = dataOverlay.project(elementDrag.overlayName, current);
        }
        emitCanvasInteractionEvent(elementDragInteraction, canvasEvent);
        const request = invokeHandler
            ? elementDragInteraction.handle?.(canvasEvent, context()) ?? null
            : null;
        await applyInteractionUpdate(elementDragInteraction, phase, request);
    };
    const elementDragStart = (event: PointerEvent): void => {
        if (!elementDragInteraction || (event.button !== undefined && event.button !== 0)) return;
        const source = resolveDraggedTarget(event);
        if (!source) return;
        const start = localPoint(event);
        elementDrag = {
            start, source: source.target, destination: source.target,
            sourceItem: source.item, moved: false, eligibleAxes: source.eligibleAxes,
            overlayName: source.overlayName,
        };
        try {
            container.setPointerCapture?.(event.pointerId);
        } catch {
            // Synthetic pointer events have no active pointer to capture.
        }
        clearHover();
        clearAnnotations();
        container.style.cursor = 'grab';
        void dispatchElementDrag('start', event, start);
    };
    const elementDragMove = (event: PointerEvent): void => {
        if (!elementDrag) {
            const source = resolveDraggedTarget(event);
            setAffordanceCursor(
                source?.target.visual.kind === 'axis' ? 'axis-label' : source ? 'mark' : 'plot',
                Boolean(source),
            );
            return;
        }
        const current = localPoint(event);
        if (!elementDrag.moved && Math.hypot(
            current.x - elementDrag.start.x,
            current.y - elementDrag.start.y,
        ) < 4) return;
        if (!reorderElementDrag) {
            elementDrag.moved = true;
            suppressClick = true;
            regionDragging = true;
            container.style.cursor = 'grabbing';
            void dispatchElementDrag('preview', event, current);
            return;
        }
        if (!elementDrag.axis) {
            const deltaX = Math.abs(current.x - elementDrag.start.x);
            const deltaY = Math.abs(current.y - elementDrag.start.y);
            const preferred = deltaY > deltaX ? 'y' : 'x';
            const axes = (plan.reorderAxes ?? (plan.reorderAxis ? [plan.reorderAxis] : []))
                .filter(({ axis }) => elementDrag?.eligibleAxes.includes(axis));
            elementDrag.axis = axes.find((axis) => axis.axis === preferred)?.axis ?? axes[0]?.axis;
        }
        if (!elementDrag.axis) return;
        const destination = resolveReorderDestination(current, elementDrag.axis);
        if (destination) elementDrag.destination = destination;
        elementDrag.moved = true;
        suppressClick = true;
        regionDragging = true;
        container.style.cursor = 'grabbing';
        dragReorderOverlay.render({
            start: elementDrag.start, current, axis: elementDrag.axis,
            source: elementDrag.source, sourceItem: elementDrag.sourceItem,
            destination: elementDrag.destination,
        });
        void dispatchElementDrag('preview', event, current);
    };
    const elementDragEnd = (event: PointerEvent): void => {
        if (!elementDrag) return;
        const drag = elementDrag;
        const current = localPoint(event);
        const destination = reorderElementDrag && drag.axis
            ? resolveReorderDestination(current, drag.axis)
            : null;
        if (destination) drag.destination = destination;
        dragReorderOverlay.clear();
        if (drag.moved) void dispatchElementDrag('commit', event, current);
        else if (reorderElementDrag) void dispatchElementDrag('cancel', event, current);
        else void dispatchElementDrag('commit', event, current, false);
        elementDrag = undefined;
        regionDragging = false;
        container.style.cursor = previousCursor;
        if (drag.moved) window.setTimeout(() => { suppressClick = false; }, 0);
    };
    const elementDragCancel = (event: PointerEvent): void => {
        if (!elementDrag) return;
        const current = localPoint(event);
        dragReorderOverlay.clear();
        void dispatchElementDrag('cancel', event, current);
        elementDrag = undefined;
        regionDragging = false;
        container.style.cursor = previousCursor;
    };
    if (elementDragInteraction) {
        container.style.userSelect = 'none';
        container.addEventListener('pointerdown', elementDragStart, true);
        container.addEventListener('pointermove', elementDragMove, true);
        container.addEventListener('pointerup', elementDragEnd, true);
        container.addEventListener('pointercancel', elementDragCancel, true);
    }
    const mountedRegionInteraction = regionInteraction
        && plan.angularXBrush
        && regionInteraction.eventSource.type === 'region'
        && regionInteraction.eventSource.axis === 'x'
        && regionInteraction.eventSource.regionGeometry === undefined
        ? {
            ...regionInteraction,
            eventSource: { ...regionInteraction.eventSource, regionGeometry: 'angular' as const },
        }
        : regionInteraction;
    const regionGesture = mountedRegionInteraction ? mountVegaRegionGesture({
        view,
        container,
        interaction: mountedRegionInteraction,
        getSelected: selectedKeys,
        setSelected: (next) => {
            if (mountedRegionInteraction.eventSource.viewport) return;
            previewUpdates.set(mountedRegionInteraction.id, {
                id: mountedRegionInteraction.id,
                ops: [{
                    op: 'set-style',
                    targets: next.size > 0 ? [{
                        visual: { kind: 'region', role: 'selection' },
                        elements: [...next].map((key) => associateSemanticElementRenderKeys({ value: {} }, [key])),
                    }] : [],
                    value: { state: next.size > 0 ? 'emphasized' : 'normal' },
                }],
            });
        },
        coordinateSpace,
        containerLayoutSize,
        resolveTarget: (gesture, role, hits) => resolveTarget(gesture, role, hits),
        dispatch: (event) => dispatch(mountedRegionInteraction, event),
        clearHover,
        clearAnnotation: clearAnnotations,
        sync: renderUpdates,
        setSuppressClick: (suppress) => { suppressClick = suppress; },
        setDragging: (dragging) => { regionDragging = dragging; },
        resetViewport: resetViewportRegion,
    }) : undefined;
    const navigationGesture = navigationInteraction ? mountVegaNavigationGesture({
        container,
        interaction: navigationInteraction,
        availableAxes: Object.keys(plan.navigationAxes ?? {}) as ('x' | 'y')[],
        coordinateSpace,
        dispatch: (event) => dispatchNavigation(navigationInteraction, event),
        setSuppressClick: (suppress) => { suppressClick = suppress; },
        setDragging: (dragging) => { regionDragging = dragging; },
    }) : undefined;
    setAffordanceCursor('plot', false);
    const dismissKeyDown = (event: KeyboardEvent): void => {
        if (regionInteraction || event.key !== 'Escape' || !dismissPolicy.escape) return;
        selectedLegend = null;
        clearDismissibleState();
    };
    if (dismissPolicy.escape && !regionInteraction) {
        container.addEventListener('keydown', dismissKeyDown);
    }

    // One tab stop enters the chart; arrows move to the nearest target in that direction.
    let activeKeyboardKey: string | undefined;
    const keyboardTargets = (): any[] => keyboardTargetItems(sceneItems(view));
    const keyboardFocus = (item: any) => {
        const hit = renderHit(item);
        if (!hit) return undefined;
        return {
            point: {
                x: (item.bounds.x1 + item.bounds.x2) / 2,
                y: (item.bounds.y1 + item.bounds.y2) / 2,
            },
            target: resolveTarget('click', 'mark', [hit]),
            key: hit.datum[INTERACTION_KEY],
        };
    };
    const keyboardInteraction: CanvasInteractionDef = {
        id: 'keyboard-targeting',
        eventSource: keyboardTrigger,
    };
    const moveKeyboardTarget = (direction: SpatialDirection): void => {
        const items = keyboardTargets();
        if (items.length === 0) return;
        const movementAxis = direction === 'left' || direction === 'right' ? 'x' : 'y';
        const movementType = plan.axisFields?.[movementAxis]?.type;
        const discreteAxis = movementType === 'nominal' || movementType === 'ordinal'
            ? movementAxis
            : undefined;
        const current = activeKeyboardKey === undefined
            ? undefined
            : items.find((item) => renderHit(item)?.datum[INTERACTION_KEY] === activeKeyboardKey);
        const next = current
            ? nextItemInDirection(items, {
                x: (current.bounds.x1 + current.bounds.x2) / 2,
                y: (current.bounds.y1 + current.bounds.y2) / 2,
            }, direction, discreteAxis)
            : direction === 'right' || direction === 'down' ? items[0] : items[items.length - 1];
        if (!next) return;
        const active = keyboardFocus(next);
        if (!active) return;
        activeKeyboardKey = typeof active.key === 'string' ? active.key : undefined;
        if (targetFeedback?.keyboard) targetFeedbackOverlay.render(next, active.target, 'keyboard');
        emitCanvasInteractionEvent(keyboardInteraction, toCanvasInteractionEvent({
            type: 'semantic', source: 'element', phase: 'preview',
            target: active.target, point: active.point,
        }, keyboardTrigger));
        void setHover(activeKeyboardKey ? [activeKeyboardKey] : []);
    };
    const activateKeyboardTarget = (): void => {
        if (activeKeyboardKey === undefined) return;
        const item = keyboardTargets()
            .find((candidate) => renderHit(candidate)?.datum[INTERACTION_KEY] === activeKeyboardKey);
        const active = item ? keyboardFocus(item) : undefined;
        if (!active) return;
        for (const interaction of clickInteractions) {
            void dispatch(interaction, {
                type: 'semantic', source: 'element', phase: 'commit',
                target: active.target, point: active.point,
            }, null, 'activate-element');
        }
    };
    const keyboardKeyDown = (event: KeyboardEvent): void => {
        switch (event.key) {
            case 'ArrowRight':
                event.preventDefault();
                moveKeyboardTarget('right');
                return;
            case 'ArrowLeft':
                event.preventDefault();
                moveKeyboardTarget('left');
                return;
            case 'ArrowDown':
                event.preventDefault();
                moveKeyboardTarget('down');
                return;
            case 'ArrowUp':
                event.preventDefault();
                moveKeyboardTarget('up');
                return;
            case 'Enter':
            case ' ':
                event.preventDefault();
                activateKeyboardTarget();
                return;
            case 'Escape':
                activeKeyboardKey = undefined;
                targetFeedbackOverlay.clear();
                void setHover([]);
                return;
            default:
        }
    };
    const keyboardEnabled = keyboardTargeting && !!resolve;
    const keyboardFocusOut = (event: FocusEvent): void => {
        if (event.relatedTarget instanceof Node && container.contains(event.relatedTarget)) return;
        activeKeyboardKey = undefined;
        targetFeedbackOverlay.clear();
        void setHover([]);
    };
    if (keyboardEnabled) {
        container.tabIndex = container.tabIndex >= 0 ? container.tabIndex : 0;
        container.addEventListener('keydown', keyboardKeyDown);
        container.addEventListener('focusout', keyboardFocusOut);
    }

    // Overlays project scenegraph geometry into screen pixels, so every one of
    // them is re-projected whenever the rendered size changes.
    const syncOverlays = (): void => {
        renderPathFocus();
        renderLegendRange();
        for (const overlay of annotationOverlays.values()) overlay.sync();
        dataOverlay.sync();
        regionGesture?.sync();
        reorderResetControls.layout();
    };
    let observedRenderer: Element | undefined;
    // A drag-resize fires per frame, so repeated observations collapse into one pass.
    let syncFrame: number | undefined;
    const scheduleSync = (): void => {
        if (typeof requestAnimationFrame === 'undefined') {
            syncOverlays();
            return;
        }
        if (syncFrame !== undefined) return;
        syncFrame = requestAnimationFrame(() => {
            syncFrame = undefined;
            syncOverlays();
        });
    };
    const resizeObserver = typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => scheduleSync());
    // The container catches responsive layout; the renderer catches the chart
    // itself being sized independently of it.
    resizeObserver?.observe(container);
    const observeRenderer = (): void => {
        const renderer = container.querySelector('canvas, svg');
        if (!renderer || renderer === observedRenderer) return;
        if (observedRenderer) resizeObserver?.unobserve(observedRenderer);
        resizeObserver?.observe(renderer);
        observedRenderer = renderer;
    };
    observeRenderer();

    const destroy = (): void => {
        if (clickInteractions.length > 0 || singleSeriesInspectInteractions.length > 0) {
            view.removeEventListener('click', clickHandler);
        }
        if (hoverPresentationInteractions.length > 0) {
            view.removeEventListener('mousemove', hoverHandler);
            view.removeEventListener('mouseout', scheduleHoverClear);
        }
        if (cursorInteractions.length > 0) view.removeEventListener('mousemove', affordanceHandler);
        if (hoverClearTimer !== undefined) clearTimeout(hoverClearTimer);
        if (dismissPolicy.escape && !regionInteraction) {
            container.removeEventListener('keydown', dismissKeyDown);
        }
        if (keyboardEnabled) {
            container.removeEventListener('keydown', keyboardKeyDown);
            container.removeEventListener('focusout', keyboardFocusOut);
        }
        if (contextInteractions.length > 0) container.removeEventListener('contextmenu', contextHandler);
        if (longPressInteractions.length > 0) {
            cancelLongPress();
            container.removeEventListener('pointerdown', longPressStart, true);
            container.removeEventListener('pointerup', cancelLongPress, true);
            container.removeEventListener('pointermove', longPressMove, true);
            container.removeEventListener('pointercancel', cancelLongPress, true);
        }
        if (doubleInteractions.length > 0) container.removeEventListener('dblclick', doubleHandler);
        if (dismissPolicy.click) {
            cancelPendingDismiss();
            view.removeEventListener('click', dismissOnClick);
        }
        if (inspectInteractions.length > 0) {
            container.removeEventListener('pointermove', inspectHandler);
            container.removeEventListener('pointerleave', inspectLeave);
            container.removeEventListener('wheel', inspectWheel);
            container.removeEventListener('contextmenu', inspectContext);
        }
        regionGesture?.destroy();
        navigationGesture?.destroy();
        if (elementDragInteraction) {
            container.removeEventListener('pointerdown', elementDragStart, true);
            container.removeEventListener('pointermove', elementDragMove, true);
            container.removeEventListener('pointerup', elementDragEnd, true);
            container.removeEventListener('pointercancel', elementDragCancel, true);
        }
        focusOverlay.destroy();
        targetFeedbackOverlay.destroy();
        legendRangeOverlay.destroy();
        for (const overlay of annotationOverlays.values()) overlay.destroy();
        annotationOverlays.clear();
        inspectGuideOverlay.destroy();
        dragReorderOverlay.destroy();
        dataOverlay.destroy();
        reorderResetControls.destroy();
        viewportResetControl.destroy();
        resizeObserver?.disconnect();
        observedRenderer = undefined;
        if (syncFrame !== undefined && typeof cancelAnimationFrame !== 'undefined') {
            cancelAnimationFrame(syncFrame);
            syncFrame = undefined;
        }
        if (elementDragInteraction || suppressTextSelection) container.style.userSelect = previousUserSelect;
        if (longPressInteractions.length > 0) container.style.touchAction = previousTouchAction;
        if (!regionInteraction && !navigationInteraction) container.style.cursor = previousCursor;
    };
    const clearUpdate = async (id: string): Promise<void> => {
        if (retainedUpdates.delete(id)) await renderUpdates();
    };
    const replaceUpdates = async (
        nextUpdates: readonly ChartUpdate[],
    ): Promise<readonly ChartUpdateResult[]> => {
        retainedUpdates.clear();
        const results: ChartUpdateResult[] = [];
        for (const update of nextUpdates) {
            const resolved = resolveUpdate(update);
            retainedUpdates.set(update.id, presentUpdate(resolved.update, context()));
            results.push(resolved.result);
        }
        await renderUpdates();
        return results;
    };
    return {
        getInteractionContext: context,
        applyUpdate: (update, _options) => storeUpdate(update, retainedUpdates),
        setUpdates: replaceUpdates,
        clearUpdate,
        refresh: () => {
            observeRenderer();
            syncOverlays();
        },
        destroy,
    };
}
