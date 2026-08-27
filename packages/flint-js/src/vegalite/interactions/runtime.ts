import { changeset } from 'vega';
import type { ChartInteractionResolver } from '../../core/interaction-semantics';
import type {
    ChartUpdate,
    ChartUpdatePresenter,
    ExternalInteractionEvent,
    FlintInteractionEventDetail,
    InteractionDef,
    NavigationInteractionEvent,
    NormalizedInteractionEvent,
    RenderHit,
    SemanticTarget,
    SemanticInteractionEvent,
} from '../../interactive/interactions';
import type {
    ChartUpdateRequest,
    ChartUpdateResult,
    UpdateTarget,
} from '../../interactive/updates/request';
import { matchesSemanticTargetSelector } from '../../interactive/updates/request';
import { applySelectionMode } from '../../interactive/updates/emphasis';
import { ScopedSelectionState } from '../../interactive/selection-state';
import type { VegaInteractionPlan } from './contracts';
import { toCanvasInteractionEvent, type CanvasInteractionEvent } from '../../interactive/canvas-interaction';
import {
    INTERACTION_KEY,
    PATH_KEY_SUFFIX,
    clientToPlotPoint,
    interactionModifiers,
    normalizeVegaElementEvent,
    pathHoverPresentationKey,
    renderHit,
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
    dispatch(event: ExternalInteractionEvent): Promise<void>;
    applyUpdate(update: ChartUpdateRequest): Promise<ChartUpdateResult>;
    clearUpdate(updateId: string): Promise<void>;
    destroy(): void;
}

export function interactionsForHoverPresentation(
    clickInteractions: readonly InteractionDef[],
    hoverInteractions: readonly InteractionDef[],
): InteractionDef[] {
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
    const clickInteractions = resolve
        ? interactions.filter((interaction) => interaction.eventSource.gesture === 'click')
        : [];
    const hoverInteractions = resolve
        ? interactions.filter((interaction) => interaction.eventSource.gesture === 'hover')
        : [];
    const hoverPresentationInteractions = interactionsForHoverPresentation(
        clickInteractions,
        hoverInteractions,
    );
    const regionInteraction = resolve
        ? interactions.find((interaction) => interaction.eventSource.gesture === 'drag')
        : undefined;
    const navigationInteraction = interactions.find(
        (interaction) => interaction.eventSource.type === 'navigation',
    );
    const elementDragInteraction = resolve
        ? interactions.find((interaction) => interaction.eventSource.gesture === 'drag-element')
        : undefined;
    const selectionState = new ScopedSelectionState();
    let selectedLegend: { channel: string; value: unknown } | null = null;
    let hoveredPathKeys = new Set<string>();
    let suppressClick = false;
    let regionDragging = false;
    let syncRunning = false;
    let syncRequested = false;

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
        const originX = rootMatrix?.e ?? viewOriginX;
        const originY = rootMatrix?.f ?? viewOriginY;
        const logicalWidth = svg?.viewBox.baseVal.width || rect.width;
        const logicalHeight = svg?.viewBox.baseVal.height || rect.height;
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
    const annotationOverlay = createAnnotationOverlay({ view, container, coordinateSpace, containerLayoutSize });
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
            view.signal(axis.signal, null);
            void view.runAsync().then(() => reorderResetControls.layout());
        },
    });
    const navigationController = createVegaNavigationController(view, plan.navigationAxes ?? {});
    const selectedKeys = (): Set<string> => selectionState.combined();
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
        const hits = allHits();
        const available = includeAvailable ? resolve?.(
            { gesture: 'rectangle', role: 'region', hits },
            resolveContext(hits),
        )?.elements : undefined;
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
            selected: [...selectedKeys()].map((key) => ({ key: { [INTERACTION_KEY]: key } })),
            available,
            categoryField: plan.categoryField,
            seriesField: plan.seriesField,
            categoryAxis: reorderAxis?.axis,
            categoryOrder,
            reorderAxes: currentReorderAxes,
        };
    };
    const sync = async (): Promise<void> => {
        syncRequested = true;
        if (syncRunning) return;
        syncRunning = true;
        try {
            while (syncRequested) {
                syncRequested = false;
                const keys = [...selectedKeys()];
                view.change(
                    INTERACTION_STORE,
                    changeset().remove(() => true).insert(keys.map((key) => ({ key }))),
                );
                view.change(
                    LEGEND_SELECTION_STORE,
                    changeset().remove(() => true).insert(selectedLegend ? [selectedLegend] : []),
                );
                await view.runAsync();
                renderPathFocus();
            }
        } finally {
            syncRunning = false;
        }
    };
    const applyUpdate = async (
        update: ChartUpdate | null,
        legendSelection: { channel: string; value: unknown } | null = null,
        updateId?: string,
    ): Promise<void> => {
        if (!update) return;
        let requiresSemanticSync = false;
        for (const op of update.ops) {
            if (op.op === 'reset') {
                if (updateId) selectionState.clear(updateId);
                else {
                    selectionState.clear();
                    selectedLegend = null;
                    clearAnnotation();
                }
                requiresSemanticSync = true;
            } else if (op.op === 'clear-annotation') {
                clearAnnotation();
            } else if (op.op === 'render-annotation') {
                annotationOverlay.render(op.element, op.annotation);
            } else if (op.op === 'emphasize') {
                requiresSemanticSync = true;
                const keys = op.elements
                    .map((element) => element.key[INTERACTION_KEY])
                    .filter((key): key is string => typeof key === 'string');
                let targetSelection = new Set(selectionState.get(updateId));
                targetSelection = applySelectionMode(targetSelection, keys, op.mode);
                selectionState.set(targetSelection, updateId);
                const combined = selectedKeys();
                selectedLegend = legendSelection && keys.some((key) => combined.has(key))
                    ? legendSelection
                    : null;
            } else if (op.op === 'navigate-viewport') {
                await navigationController.apply(op);
            } else if (op.op === 'reorder-category') {
                const reorderAxis = (plan.reorderAxes ?? (plan.reorderAxis ? [plan.reorderAxis] : []))
                    .find((axis) => axis.axis === op.axis && axis.field === op.field);
                if (reorderAxis && reorderAxis.axis === op.axis && reorderAxis.field === op.field) {
                    view.signal(reorderAxis.signal, op.orderedValues);
                    await view.runAsync();
                    renderPathFocus();
                    reorderResetControls.layout();
                }
            }
        }
        if (requiresSemanticSync) await sync();
    };

    const resolveUpdateTarget = (target: UpdateTarget): readonly import('../../core/interaction-semantics').SemanticElement[] => {
        if (!('select' in target)) {
            const renderedKeys = new Set(allHits()
                .map((hit) => hit.datum[INTERACTION_KEY])
                .filter((key): key is string => typeof key === 'string'));
            return target.elements.filter((element) => {
                const key = element.key[INTERACTION_KEY];
                return typeof key === 'string' && renderedKeys.has(key);
            });
        }

        const entries = Object.entries(target.select.key);
        if (entries.length === 0) return [];
        const hits = allHits().filter((hit) => matchesSemanticTargetSelector(target, plan.fields, hit.datum));
        if (hits.length === 0 || !resolve) return [];
        const resolved = resolve({
            gesture: 'rectangle',
            role: target.select.visual?.role ?? 'external-selection',
            hits,
        }, resolveContext(hits));
        if (!resolved) return [];
        if (target.select.visual?.kind && target.select.visual.kind !== resolved.visual.kind) return [];
        if (target.select.visual?.role && target.select.visual.role !== resolved.visual.role) return [];
        return resolved.elements;
    };

    const applyRequestedUpdate = async (
        request: ChartUpdateRequest,
        legendSelection: { channel: string; value: unknown } | null = null,
    ): Promise<ChartUpdateResult> => {
        const unresolvedTargets: UpdateTarget[] = [];
        let resolvedTargets = 0;
        const ops: ChartUpdate['ops'][number][] = [];
        for (const op of request.ops) {
            if (op.op === 'emphasize') {
                const elements = op.targets.flatMap((target) => {
                    const resolved = resolveUpdateTarget(target);
                    if (resolved.length === 0) unresolvedTargets.push(target);
                    resolvedTargets += resolved.length;
                    return [...resolved];
                });
                if (elements.length > 0) {
                    ops.push({
                        op: 'emphasize',
                        elements,
                        mode: op.mode,
                        dimOpacity: op.dimOpacity,
                    });
                }
            } else if (op.op === 'annotate') {
                const elements = resolveUpdateTarget(op.target);
                if (elements.length !== 1) unresolvedTargets.push(op.target);
                else {
                    resolvedTargets += 1;
                    const visual = 'visual' in op.target ? op.target.visual : op.target.select.visual;
                    ops.push({
                        op: 'annotate',
                        element: elements[0],
                        ...(visual === undefined ? {} : { visual }),
                        ...(op.text === undefined ? {} : { text: op.text }),
                    });
                }
            } else if (op.op === 'navigate-viewport') {
                ops.push({ ...op, phase: request.phase ?? 'commit' });
            } else {
                ops.push(op);
            }
        }

        if (ops.length > 0) {
            const interactionContext = context();
            const update = { phase: request.phase, ops };
            await applyUpdate(presentUpdate(update, interactionContext), legendSelection, request.updateId);
        }
        return {
            status: unresolvedTargets.length === 0
                ? 'applied'
                : ops.length > 0 ? 'partially-applied' : 'unsupported',
            resolvedTargets,
            unresolvedTargets,
            unsupportedOps: [],
        };
    };
    const emitCanvasInteractionEvent = (
        interaction: InteractionDef,
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
        interaction: InteractionDef,
        event: SemanticInteractionEvent | NavigationInteractionEvent,
        transactionId?: string,
    ): void => emitCanvasInteractionEvent(
        interaction,
        toCanvasInteractionEvent(event, interaction.eventSource),
        transactionId,
    );
    const dispatch = async (
        interaction: InteractionDef,
        event: SemanticInteractionEvent,
        legendSelection: { channel: string; value: unknown } | null = null,
    ): Promise<void> => {
        const interactionContext = context();
        const canvasEvent = toCanvasInteractionEvent(event, interaction.eventSource);
        emitInteractionEvent(interaction, event);
        const request = interaction.handle?.(canvasEvent, interactionContext) ?? null;
        if (request) {
            await applyRequestedUpdate(request, legendSelection);
        }
    };
    let navigationDispatch = Promise.resolve();
    const dispatchNavigation = (
        interaction: InteractionDef,
        event: NavigationInteractionEvent,
    ): Promise<void> => {
        const run = async (): Promise<void> => {
            const interactionContext = context(false);
            const canvasEvent = toCanvasInteractionEvent(event, interaction.eventSource);
            emitInteractionEvent(interaction, event);
            const request = interaction.handle?.(canvasEvent, interactionContext) ?? null;
            if (request) {
                await applyRequestedUpdate(request);
            }
        };
        navigationDispatch = navigationDispatch.then(run, run);
        return navigationDispatch;
    };
    const dispatchExternal = async (event: ExternalInteractionEvent): Promise<void> => {
        throw new Error(
            `External interaction dispatch from "${event.source}" no longer runs update policies; use applyUpdate().`,
        );
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
            return preview?.ops.flatMap((op) => op.op === 'emphasize'
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
        if (request) await applyRequestedUpdate(request);
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
        getSelected: () => selectionState.get(regionInteraction.id),
        setSelected: (next) => { selectionState.set(next, regionInteraction.id); },
        coordinateSpace,
        containerLayoutSize,
        resolveTarget: (gesture, role, hits) => resolveTarget(gesture, role, hits),
        dispatch: (event) => dispatch(regionInteraction, event),
        clearHover,
        clearAnnotation,
        sync,
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
        selectionState.clear();
        selectedLegend = null;
        clearAnnotation();
        void sync();
    };
    if (clickInteractions.length > 0 && !regionInteraction) container.addEventListener('keydown', clickOnlyKeyDown);

    const customSourceCleanups = interactions.flatMap((interaction) => {
        if (!interaction.eventSource?.mount) return [];
        const cleanup = interaction.eventSource.mount({
            container,
            emit(event: NormalizedInteractionEvent) {
                if (event.type === 'external') {
                    void dispatchExternal(event);
                    return;
                }
                if (event.type === 'navigation') {
                    void dispatchNavigation(interaction, event);
                    return;
                }
                const gesture = event.type === 'region'
                    ? event.axis === 'angle' ? 'angular' : 'rectangle'
                    : 'click';
                const role = event.type === 'region' ? 'region' : 'mark';
                const target = resolveTarget(gesture, role, event.hits);
                void dispatch(interaction, {
                    type: 'semantic',
                    source: event.type,
                    phase: event.phase,
                    target,
                    point: event.type === 'element' ? event.point : undefined,
                    region: event.type === 'region' ? event.region : undefined,
                    axis: event.type === 'region' ? event.axis : undefined,
                    operation: event.type === 'region' ? event.operation : undefined,
                    modifiers: event.modifiers,
                });
            },
        });
        return cleanup ? [cleanup] : [];
    });

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
        if (elementDragInteraction) container.style.userSelect = previousUserSelect;
        if (!regionInteraction && !navigationInteraction) container.style.cursor = previousCursor;
        for (const cleanup of customSourceCleanups) cleanup();
    };
    const clearRequestedUpdate = async (updateId: string): Promise<void> => {
        if (selectionState.get(updateId).size === 0) return;
        selectionState.clear(updateId);
        await sync();
    };
    return {
        dispatch: dispatchExternal,
        applyUpdate: applyRequestedUpdate,
        clearUpdate: clearRequestedUpdate,
        destroy,
    };
}
