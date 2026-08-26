import { changeset } from 'vega';
import type { ChartInteractionResolver } from '../../core/interaction-semantics';
import type {
    ChartUpdate,
    ChartUpdateProcessor,
    ExternalInteractionEvent,
    FlintInteractionEventDetail,
    InteractionDef,
    NavigationInteractionEvent,
    NormalizedInteractionEvent,
    RenderHit,
    SemanticTarget,
    SemanticInteractionEvent,
} from '../../interactive/interactions';
import type { VegaInteractionPlan } from './contracts';
import {
    INTERACTION_KEY,
    PATH_KEY_SUFFIX,
    clientToPlotPoint,
    interactionModifiers,
    normalizeVegaElementEvent,
    renderHit,
    sceneItems,
    type RendererCoordinateSpace,
} from './hit-adapter';
import { mountVegaRegionGesture } from './gestures/region';
import { mountVegaNavigationGesture } from './gestures/navigation';
import { createVegaNavigationController } from './navigation-scale';
import { createAnnotationOverlay } from './presentation/annotation-overlay';
import { createFocusOverlay } from './presentation/focus-overlay';
import {
    HOVER_STORE,
    INTERACTION_STORE,
    LEGEND_HOVER_STORE,
    LEGEND_SELECTION_STORE,
} from './stores';

export { mergeContiguousSelectionBounds } from './presentation/focus-overlay';

export interface VegaInteractionController {
    dispatch(event: ExternalInteractionEvent): Promise<void>;
    destroy(): void;
}

export function mountVegaInteractions(
    view: any,
    container: HTMLElement,
    chartType: string,
    plan: VegaInteractionPlan,
    interactions: readonly InteractionDef[],
    resolve: ChartInteractionResolver | undefined,
    presentUpdate: ChartUpdateProcessor,
): VegaInteractionController {
    const clickInteraction = resolve
        ? interactions.find((interaction) => interaction.eventSource.gesture === 'click')
        : undefined;
    const regionInteraction = resolve
        ? interactions.find((interaction) => interaction.eventSource.gesture === 'drag')
        : undefined;
    const navigationInteraction = interactions.find(
        (interaction) => interaction.eventSource.type === 'navigation',
    );
    let selected = new Set<string>();
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
    const navigationController = createVegaNavigationController(view, plan.navigationAxes ?? {});
    const renderPathFocus = (): void => focusOverlay.render(selected, hoveredPathKeys);
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
        return {
            chartType,
            selected: [...selected].map((key) => ({ key: { [INTERACTION_KEY]: key } })),
            available,
            categoryField: plan.categoryField,
            seriesField: plan.seriesField,
        };
    };
    const sync = async (): Promise<void> => {
        syncRequested = true;
        if (syncRunning) return;
        syncRunning = true;
        try {
            while (syncRequested) {
                syncRequested = false;
                const keys = [...selected];
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
    ): Promise<void> => {
        if (!update) return;
        let requiresSemanticSync = false;
        for (const op of update.ops) {
            if (op.op === 'reset') {
                selected.clear();
                selectedLegend = null;
                clearAnnotation();
                requiresSemanticSync = true;
            } else if (op.op === 'clear-annotation') {
                clearAnnotation();
            } else if (op.op === 'render-annotation') {
                annotationOverlay.render(op.element, op.annotation, op.point);
            } else if (op.op === 'emphasize') {
                requiresSemanticSync = true;
                const keys = op.elements
                    .map((element) => element.key[INTERACTION_KEY])
                    .filter((key): key is string => typeof key === 'string');
                if (op.mode === 'replace') selected = new Set(keys);
                else {
                    const allSelected = keys.every((key) => selected.has(key));
                    for (const key of keys) allSelected ? selected.delete(key) : selected.add(key);
                }
                selectedLegend = legendSelection && keys.some((key) => selected.has(key))
                    ? legendSelection
                    : null;
            } else if (op.op === 'navigate-viewport') {
                await navigationController.apply(op);
            }
        }
        if (requiresSemanticSync) await sync();
    };
    const emitInteractionEvent = (
        interaction: InteractionDef,
        event: SemanticInteractionEvent | NavigationInteractionEvent,
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
    const dispatch = async (
        interaction: InteractionDef,
        event: SemanticInteractionEvent,
        legendSelection: { channel: string; value: unknown } | null = null,
    ): Promise<void> => {
        const interactionContext = context();
        emitInteractionEvent(interaction, event);
        const update = interaction.update(event, interactionContext);
        await applyUpdate(update ? presentUpdate(update, interactionContext) : null, legendSelection);
    };
    let navigationDispatch = Promise.resolve();
    const dispatchNavigation = (
        interaction: InteractionDef,
        event: NavigationInteractionEvent,
    ): Promise<void> => {
        const run = async (): Promise<void> => {
            const interactionContext = context(false);
            emitInteractionEvent(interaction, event);
            const update = interaction.update(event, interactionContext);
            await applyUpdate(update ? presentUpdate(update, interactionContext) : null);
        };
        navigationDispatch = navigationDispatch.then(run, run);
        return navigationDispatch;
    };
    const dispatchExternal = async (event: ExternalInteractionEvent): Promise<void> => {
        for (const interaction of interactions) {
            const configuredSource = interaction.eventSource.source;
            const acceptsSource = interaction.eventSource.type === 'external';
            if (configuredSource && configuredSource !== event.source) continue;
            if (!acceptsSource) continue;
            const interactionContext = context();
            const update = interaction.update(event, interactionContext);
            await applyUpdate(update ? presentUpdate(update, interactionContext) : null);
        }
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
    const setHover = async (
        keys: readonly string[],
        legend: { channel: string; value: unknown } | null = null,
    ): Promise<void> => {
        const next = [...new Set(keys)].sort();
        const signature = `${next.join('\u0000')}\u0001${legend?.channel ?? ''}\u0000${String(legend?.value ?? '')}`;
        if (signature === hoveredKeys) return;
        hoveredKeys = signature;
        hoveredPathKeys = new Set(next.filter((key) => key.endsWith(PATH_KEY_SUFFIX)));
        view.change(
            HOVER_STORE,
            changeset().remove(() => true).insert(next.map((key) => ({ key }))),
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
        if (!regionInteraction && !navigationInteraction) container.style.cursor = previousCursor;
    };
    const hoverHandler = (event: MouseEvent, item: any): void => {
        if (!clickInteraction || regionDragging) return;
        const point = localPoint(event as unknown as PointerEvent);
        const normalized = normalizeVegaElementEvent(
            view, item, point, 'preview', interactionModifiers(event), plan.legendFields,
        );
        const legend = normalized.legend;
        if (legend) {
            if (!regionInteraction && !navigationInteraction) container.style.cursor = 'pointer';
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
        const target = clickInteraction.actOn?.(resolved, context()) ?? resolved;
        emitInteractionEvent(clickInteraction, {
            type: 'semantic', source: 'element', phase: 'preview', target, point,
            modifiers: normalized.event.modifiers,
        });
        void setHover(target?.elements
            .map((element) => element.key[INTERACTION_KEY])
            .filter((key): key is string => typeof key === 'string') ?? []);
    };

    const clickHandler = (event: MouseEvent, item: any): void => {
        if (!clickInteraction || suppressClick) return;
        const point = localPoint(event as unknown as PointerEvent);
        const normalized = normalizeVegaElementEvent(
            view, item, point, 'commit', interactionModifiers(event), plan.legendFields,
        );
        const { legend } = normalized;
        const target = resolveTarget(
            'click', normalized.role, normalized.event.hits, legend?.value, legend?.field,
        );
        void dispatch(clickInteraction, {
            type: 'semantic', source: 'element', phase: 'commit', target, point,
            modifiers: normalized.event.modifiers,
        }, legend?.channel ? { channel: legend.channel, value: legend.value } : null);
    };
    if (clickInteraction) {
        view.addEventListener('click', clickHandler);
        view.addEventListener('mousemove', hoverHandler);
        view.addEventListener('mouseout', clearHover);
    }

    const previousCursor = container.style.cursor;
    const localPoint = (event: PointerEvent): { x: number; y: number } => {
        return clientToPlotPoint({ x: event.clientX, y: event.clientY }, coordinateSpace());
    };
    const regionGesture = regionInteraction ? mountVegaRegionGesture({
        view,
        container,
        interaction: regionInteraction,
        getSelected: () => selected,
        setSelected: (next) => { selected = next; },
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
        selected.clear();
        clearAnnotation();
        void sync();
    };
    if (clickInteraction && !regionInteraction) container.addEventListener('keydown', clickOnlyKeyDown);

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
        if (clickInteraction) {
            view.removeEventListener('click', clickHandler);
            view.removeEventListener('mousemove', hoverHandler);
            view.removeEventListener('mouseout', clearHover);
        }
        if (clickInteraction && !regionInteraction) {
            container.removeEventListener('keydown', clickOnlyKeyDown);
        }
        regionGesture?.destroy();
        navigationGesture?.destroy();
        focusOverlay.destroy();
        annotationOverlay.destroy();
        if (!regionInteraction && !navigationInteraction) container.style.cursor = previousCursor;
        for (const cleanup of customSourceCleanups) cleanup();
    };
    return { dispatch: dispatchExternal, destroy };
}
