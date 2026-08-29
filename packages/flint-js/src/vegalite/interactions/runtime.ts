import { changeset } from 'vega';
import type { ChartInteractionResolver } from '../../core/interaction-semantics';
import type {
    CanvasInteractionDef,
    ChartUpdate,
    ChartUpdateOp,
    ChartUpdatePresenter,
    FlintInteractionEventDetail,
    InteractionDef,
    NavigationInteractionEvent,
    RenderHit,
    SemanticTarget,
    SemanticInteractionEvent,
} from '../../interactive/interactions';
import { isCanvasInteraction } from '../../interactive/interactions';
import type {
    ChartUpdateResult,
    SemanticTargetRef,
    UpdateTarget,
} from '../../interactive/language/updates';
import { matchesSemanticTargetSelector } from '../../interactive/language/updates';
import type { VegaInteractionPlan } from './contracts';
import { toCanvasInteractionEvent } from '../../interactive/canvas-interaction';
import type { CanvasInteractionEvent } from '../../interactive/language/events';
import type { ChartUpdateApplyOptions } from '../../interactive/types';
import {
    INTERACTION_KEY,
    PATH_KEY_SUFFIX,
    clientToPlotPoint,
    interactionModifiers,
    normalizeVegaElementEvent,
    pathHoverPresentationKey,
    renderHit,
    rendererPlotOrigin,
    sceneItems,
    type RendererCoordinateSpace,
} from './hit-adapter';
import { mountVegaRegionGesture } from './gestures/region';
import { mountVegaNavigationGesture } from './gestures/navigation';
import { createVegaNavigationController } from './navigation-scale';
import { createAnnotationOverlay } from './presentation/annotation-overlay';
import { createDragReorderOverlay } from './presentation/drag-reorder-overlay';
import { createFocusOverlay } from './presentation/focus-overlay';
import { createReorderResetControls } from './presentation/reorder-reset-controls';
import {
    HOVER_STORE,
    INTERACTION_STORE,
    LEGEND_HOVER_STORE,
    LEGEND_SELECTION_STORE,
} from './stores';

export { mergeContiguousSelectionBounds } from './presentation/focus-overlay';

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
): CanvasInteractionDef[] {
    return [
        ...hoverInteractions,
        ...clickInteractions.filter((interaction) => interaction.handle),
    ].filter((interaction, index, candidates) =>
        candidates.findIndex((candidate) => candidate.id === interaction.id) === index,
    );
}

export function mountVegaInteractions(
    view: any,
    container: HTMLElement,
    chartType: string,
    plan: VegaInteractionPlan,
    interactions: readonly InteractionDef[],
    resolve: ChartInteractionResolver | undefined,
    presentUpdate: ChartUpdatePresenter,
): VegaInteractionController {
    const canvasInteractions = interactions.filter(isCanvasInteraction);
    const clickInteractions = resolve
        ? canvasInteractions.filter((interaction) => interaction.eventSource.gesture === 'click')
        : [];
    const hoverInteractions = resolve
        ? canvasInteractions.filter((interaction) => interaction.eventSource.gesture === 'hover')
        : [];
    const hoverPresentationInteractions = interactionsForHoverPresentation(
        clickInteractions,
        hoverInteractions,
    );
    const regionInteraction = resolve
        ? canvasInteractions.find((interaction) => interaction.eventSource.gesture === 'drag')
        : undefined;
    const navigationInteraction = canvasInteractions.find(
        (interaction) => interaction.eventSource.type === 'navigation',
    );
    const elementDragInteraction = resolve
        ? canvasInteractions.find((interaction) => interaction.eventSource.gesture === 'drag-element')
        : undefined;
    const retainedUpdates = new Map<string, ChartUpdate>();
    const previewUpdates = new Map<string, ChartUpdate>();
    const selectedElements = new Map<string, import('../../core/interaction-semantics').SemanticElement>();
    let selectedLegend: { channel: string; value: unknown } | null = null;
    let hoveredPathKeys = new Set<string>();
    let suppressClick = false;
    let regionDragging = false;

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
    const annotationOverlay = createAnnotationOverlay({
        view,
        container,
        coordinateSpace,
        containerLayoutSize,
        annotationMarkType: plan.annotationMarkType,
    });
    const dragReorderOverlay = createDragReorderOverlay({
        view, container,
        reorderAxes: plan.reorderAxes ?? (plan.reorderAxis ? [plan.reorderAxis] : []),
        coordinateSpace, containerLayoutSize,
    });
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
    const navigationController = createVegaNavigationController(view, plan.navigationAxes ?? {});
    const selectedKeys = (): Set<string> => new Set(selectedElements.keys());
    const renderPathFocus = (): void => focusOverlay.render(selectedKeys(), hoveredPathKeys);
    const clearAnnotation = (): void => annotationOverlay.clear();
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
    const context = (includeAvailable = true) => {
        // Navigation resolves per gesture frame, so the scenegraph scan stays behind this flag.
        const available = includeAvailable
            ? (() => {
                const hits = allHits();
                return resolve?.(
                    { gesture: 'rectangle', role: 'region', hits },
                    resolveContext(hits),
                )?.elements;
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
        return {
            chartType,
            selected: [...selectedElements.values()],
            available,
            resolveGroupValue: plan.resolveGroupValue,
            resolveNavigation: navigationController.resolve,
            categoryField: plan.categoryField,
            seriesField: plan.seriesField,
            categoryAxis: reorderAxis?.axis,
            categoryOrder,
            reorderAxes: currentReorderAxes,
        };
    };
    const resolveUpdateTarget = (target: UpdateTarget): SemanticTargetRef | null => {
        if (!('select' in target)) {
            const renderedKeys = new Set(allHits()
                .map((hit) => hit.datum[INTERACTION_KEY])
                .filter((key): key is string => typeof key === 'string'));
            const elements = target.elements.filter((element) => {
                const key = element.key[INTERACTION_KEY];
                return typeof key === 'string' && renderedKeys.has(key);
            });
            return elements.length > 0 ? { ...target, elements } : null;
        }

        const entries = Object.entries(target.select.key);
        if (entries.length === 0) return null;
        const hits = allHits().filter((hit) => matchesSemanticTargetSelector(target, plan.fields, hit.datum));
        if (hits.length === 0 || !resolve) return null;
        const resolved = resolve({
            gesture: 'rectangle',
            role: target.select.visual?.role ?? 'external-selection',
            hits,
        }, resolveContext(hits));
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
            if (op.op === 'set-presentation') {
                const targets = op.targets.flatMap((target) => {
                    const resolved = resolveUpdateTarget(target);
                    if (!resolved) {
                        unresolvedTargets.push(target);
                        return [];
                    }
                    resolvedTargets += resolved.elements.length;
                    return [resolved];
                });
                if (targets.length > 0) ops.push({ ...op, targets });
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
        const displayUpdates = [...retainedUpdates.values(), ...previewUpdates.values()];
        selectedElements.clear();
        let annotation: Extract<ChartUpdateOp, { op: 'set-annotation' }> | undefined;
        const reorderAxes = plan.reorderAxes ?? (plan.reorderAxis ? [plan.reorderAxis] : []);
        for (const axis of reorderAxes) view.signal(axis.signal, null);
        for (const axis of Object.keys(plan.navigationAxes ?? {}) as ('x' | 'y')[]) {
            navigationController.apply({ op: 'set-viewport', axes: axis, value: {} });
        }
        for (const update of displayUpdates) {
            for (const op of update.ops) {
                if (op.op === 'set-presentation'
                    && (op.value.state === 'emphasized' || op.value.state === 'focused')) {
                    for (const target of op.targets) {
                        if ('select' in target) continue;
                        for (const element of target.elements) {
                            const key = element.key[INTERACTION_KEY];
                            if (typeof key === 'string') selectedElements.set(key, element);
                        }
                    }
                } else if (op.op === 'set-annotation') {
                    annotation = op;
                } else if (op.op === 'set-viewport') {
                    navigationController.apply(op);
                } else if (op.op === 'set-order' && op.scope === 'category') {
                    const axis = reorderAxes.find((candidate) => candidate.field === op.field);
                    if (axis) view.signal(axis.signal, op.values);
                }
            }
        }
        const keys = [...selectedKeys()];
        if (keys.length === 0) selectedLegend = null;
        // A navigation-only chart compiles without the selection stores.
        if (plan.semanticStores !== false) {
            view.change(
                INTERACTION_STORE,
                changeset().remove(() => true).insert(keys.map((key) => ({ key }))),
            );
            view.change(
                LEGEND_SELECTION_STORE,
                changeset().remove(() => true).insert(selectedLegend ? [selectedLegend] : []),
            );
        }
        await view.runAsync();
        observeRenderer();
        renderPathFocus();
        reorderResetControls.layout();
        clearAnnotation();
        if (annotation?.value && !('select' in annotation.target)) {
            const element = annotation.target.elements[0];
            if (element && annotation.value.text && annotation.value.candidates) {
                annotationOverlay.render(element, {
                    ...annotation.value,
                    text: annotation.value.text,
                    candidates: annotation.value.candidates,
                });
            }
        }
    };

    const storeUpdate = async (
        update: ChartUpdate,
        destination: Map<string, ChartUpdate>,
        legendSelection: { channel: string; value: unknown } | null = null,
    ): Promise<ChartUpdateResult> => {
        const resolved = resolveUpdate(update);
        const presented = presentUpdate(resolved.update, context());
        destination.set(update.id, presented);
        if (legendSelection) selectedLegend = legendSelection;
        await renderUpdates();
        return resolved.result;
    };

    const applyInteractionUpdate = async (
        interaction: InteractionDef,
        phase: import('../../interactive/interactions').InteractionPhase,
        update: ChartUpdate | null,
        legendSelection: { channel: string; value: unknown } | null = null,
    ): Promise<void> => {
        if (phase === 'cancel') {
            if (previewUpdates.delete(interaction.id)) await renderUpdates();
            return;
        }
        if (update) {
            const preview = phase === 'start' || phase === 'preview';
            if (!preview) previewUpdates.delete(interaction.id);
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
    const dispatch = async (
        interaction: CanvasInteractionDef,
        event: SemanticInteractionEvent,
        legendSelection: { channel: string; value: unknown } | null = null,
    ): Promise<void> => {
        const interactionContext = context();
        const canvasEvent = toCanvasInteractionEvent(event, interaction.eventSource);
        emitInteractionEvent(interaction, event);
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
        legendValue?: unknown,
        legendField?: string,
    ): SemanticTarget | null => {
        if (!resolve) return null;
        const availableHits = allHits();
        return resolve(
            { gesture, role, hits, legendValue, legendField },
            resolveContext(availableHits),
        );
    };

    let hoveredKeys = '';
    let hoverActive = false;
    const setHover = async (
        keys: readonly string[],
        legend: { channel: string; value: unknown } | null = null,
    ): Promise<void> => {
        const next = [...new Set(keys)].sort();
        const signature = `${next.join('\u0000')}\u0001${legend?.channel ?? ''}\u0000${String(legend?.value ?? '')}`;
        if (signature === hoveredKeys) return;
        hoveredKeys = signature;
        hoveredPathKeys = new Set(next.filter((key) => key.endsWith(PATH_KEY_SUFFIX)));
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
        await view.runAsync();
        renderPathFocus();
    };
    const clearHover = (): void => {
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
    const hoverHandler = (event: MouseEvent, item: any): void => {
        if (hoverPresentationInteractions.length === 0 || regionDragging) return;
        const point = localPoint(event as unknown as PointerEvent);
        const normalized = normalizeVegaElementEvent(
            view, item, point, 'preview', interactionModifiers(event), plan.legendFields,
        );
        const legend = normalized.legend;
        if (legend) {
            if (!regionInteraction && !navigationInteraction) container.style.cursor = 'pointer';
            const resolved = resolveTarget(
                'hover', normalized.role, normalized.event.hits, legend.value, legend.field,
            );
            hoverActive = true;
            for (const interaction of hoverInteractions) {
                void dispatch(interaction, {
                    type: 'semantic', source: 'element', phase: 'preview', target: resolved, point,
                    modifiers: normalized.event.modifiers,
                });
            }
            void setHover([],
                legend.channel ? { channel: legend.channel, value: legend.value } : null);
            return;
        }
        const hovered = normalized.event.hits[0];
        if (!hovered) {
            clearHover();
            return;
        }
        if (!regionInteraction && !navigationInteraction) container.style.cursor = 'pointer';
        const resolved = resolveTarget('hover', normalized.role, normalized.event.hits);
        hoverActive = true;
        const interactionContext = context();
        const presentationElements = hoverPresentationInteractions.flatMap((interaction) => {
            if (!interaction.handle) return resolved?.elements ?? [];
            const preview = interaction.handle(toCanvasInteractionEvent({
                type: 'semantic', source: 'element', phase: 'preview', target: resolved, point,
                modifiers: normalized.event.modifiers,
            }, interaction.eventSource), interactionContext);
            return preview?.ops.flatMap((op) => op.op === 'set-presentation'
                && (op.value.state === 'emphasized' || op.value.state === 'focused')
                ? op.targets.flatMap((target) => 'select' in target ? [] : target.elements)
                : []) ?? [];
        });
        for (const interaction of hoverInteractions) {
            void dispatch(interaction, {
                type: 'semantic', source: 'element', phase: 'preview', target: resolved, point,
                modifiers: normalized.event.modifiers,
            });
        }
        void setHover(presentationElements
            .map((element) => element.key[INTERACTION_KEY])
            .filter((key): key is string => typeof key === 'string') ?? []);
    };

    const clickHandler = (event: MouseEvent, item: any): void => {
        if (clickInteractions.length === 0 || suppressClick) return;
        const point = localPoint(event as unknown as PointerEvent);
        const normalized = normalizeVegaElementEvent(
            view, item, point, 'commit', interactionModifiers(event), plan.legendFields,
        );
        const { legend } = normalized;
        const target = resolveTarget(
            'click', normalized.role, normalized.event.hits, legend?.value, legend?.field,
        );
        for (const interaction of clickInteractions) {
            void dispatch(interaction, {
                type: 'semantic', source: 'element', phase: 'commit', target, point,
                modifiers: normalized.event.modifiers,
            }, legend?.channel ? { channel: legend.channel, value: legend.value } : null);
        }
    };
    if (clickInteractions.length > 0) {
        view.addEventListener('click', clickHandler);
    }
    if (hoverPresentationInteractions.length > 0) {
        view.addEventListener('mousemove', hoverHandler);
        view.addEventListener('mouseout', clearHover);
    }

    const previousCursor = container.style.cursor;
    const previousUserSelect = container.style.userSelect;
    const localPoint = (event: PointerEvent): { x: number; y: number } => {
        return clientToPlotPoint({ x: event.clientX, y: event.clientY }, coordinateSpace());
    };
    let elementDrag: {
        start: { x: number; y: number };
        source: SemanticTarget;
        destination: SemanticTarget;
        moved: boolean;
        axis?: 'x' | 'y';
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
    const resolveDraggedTarget = (event: PointerEvent): SemanticTarget | null => {
        const hit = renderHit(reorderItemAt(event));
        return hit ? resolveTarget('click', hit.layerRole ?? hit.markType ?? 'mark', [hit]) : null;
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
    ): Promise<void> => {
        if (!elementDragInteraction || !elementDrag) return;
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
        emitCanvasInteractionEvent(elementDragInteraction, canvasEvent);
        const request = elementDragInteraction.handle?.(canvasEvent, context()) ?? null;
        await applyInteractionUpdate(elementDragInteraction, phase, request);
    };
    const elementDragStart = (event: PointerEvent): void => {
        if (!elementDragInteraction || (event.button !== undefined && event.button !== 0)) return;
        const source = resolveDraggedTarget(event);
        if (!source) return;
        const start = localPoint(event);
        elementDrag = { start, source, destination: source, moved: false };
        try {
            container.setPointerCapture?.(event.pointerId);
        } catch {
            // Synthetic pointer events have no active pointer to capture.
        }
        clearHover();
        clearAnnotation();
        container.style.cursor = 'grab';
        void dispatchElementDrag('start', event, start);
    };
    const elementDragMove = (event: PointerEvent): void => {
        if (!elementDrag) return;
        const current = localPoint(event);
        if (!elementDrag.moved && Math.hypot(
            current.x - elementDrag.start.x,
            current.y - elementDrag.start.y,
        ) < 4) return;
        if (!elementDrag.axis) {
            const deltaX = Math.abs(current.x - elementDrag.start.x);
            const deltaY = Math.abs(current.y - elementDrag.start.y);
            const preferred = deltaY > deltaX ? 'y' : 'x';
            const axes = plan.reorderAxes ?? (plan.reorderAxis ? [plan.reorderAxis] : []);
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
            source: elementDrag.source, destination: elementDrag.destination,
        });
        void dispatchElementDrag('preview', event, current);
    };
    const elementDragEnd = (event: PointerEvent): void => {
        if (!elementDrag) return;
        const drag = elementDrag;
        const current = localPoint(event);
        const destination = drag.axis ? resolveReorderDestination(current, drag.axis) : null;
        if (destination) drag.destination = destination;
        dragReorderOverlay.clear();
        if (drag.moved) void dispatchElementDrag('commit', event, current);
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
        container.style.cursor = 'grab';
        container.style.userSelect = 'none';
        container.addEventListener('pointerdown', elementDragStart, true);
        container.addEventListener('pointermove', elementDragMove, true);
        container.addEventListener('pointerup', elementDragEnd, true);
        container.addEventListener('pointercancel', elementDragCancel, true);
    }
    const regionGesture = regionInteraction ? mountVegaRegionGesture({
        view,
        container,
        interaction: regionInteraction,
        getSelected: selectedKeys,
        setSelected: (next) => {
            previewUpdates.set(regionInteraction.id, {
                id: regionInteraction.id,
                ops: [{
                    op: 'set-presentation',
                    targets: next.size > 0 ? [{
                        visual: { kind: 'region', role: 'selection' },
                        elements: [...next].map((key) => ({ key: { [INTERACTION_KEY]: key } })),
                    }] : [],
                    value: { state: next.size > 0 ? 'emphasized' : 'normal' },
                }],
            });
        },
        coordinateSpace,
        containerLayoutSize,
        resolveTarget: (gesture, role, hits) => resolveTarget(gesture, role, hits),
        dispatch: (event) => dispatch(regionInteraction, event),
        clearHover,
        clearAnnotation,
        sync: renderUpdates,
        setSuppressClick: (suppress) => { suppressClick = suppress; },
        setDragging: (dragging) => { regionDragging = dragging; },
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
    const clickOnlyKeyDown = (event: KeyboardEvent): void => {
        if (regionInteraction || event.key !== 'Escape') return;
        for (const layer of [retainedUpdates, previewUpdates]) {
            for (const [id, update] of layer) {
                const ops = update.ops.filter((op) =>
                    op.op !== 'set-presentation' && op.op !== 'set-annotation');
                if (ops.length > 0) layer.set(id, { id, ops });
                else layer.delete(id);
            }
        }
        selectedLegend = null;
        void renderUpdates();
    };
    if (clickInteractions.length > 0 && !regionInteraction) container.addEventListener('keydown', clickOnlyKeyDown);

    // Overlays project scenegraph geometry into screen pixels, so every one of
    // them is re-projected whenever the rendered size changes.
    const syncOverlays = (): void => {
        renderPathFocus();
        annotationOverlay.sync();
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
        if (clickInteractions.length > 0) {
            view.removeEventListener('click', clickHandler);
        }
        if (hoverPresentationInteractions.length > 0) {
            view.removeEventListener('mousemove', hoverHandler);
            view.removeEventListener('mouseout', clearHover);
        }
        if (clickInteractions.length > 0 && !regionInteraction) {
            container.removeEventListener('keydown', clickOnlyKeyDown);
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
        annotationOverlay.destroy();
        dragReorderOverlay.destroy();
        reorderResetControls.destroy();
        resizeObserver?.disconnect();
        observedRenderer = undefined;
        if (syncFrame !== undefined && typeof cancelAnimationFrame !== 'undefined') {
            cancelAnimationFrame(syncFrame);
            syncFrame = undefined;
        }
        if (elementDragInteraction) container.style.userSelect = previousUserSelect;
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
