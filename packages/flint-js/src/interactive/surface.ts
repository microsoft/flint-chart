import type { CategoryViewport, ChartAssemblyInput } from '../core/types';
import type {
    InteractiveChartSurface,
    InteractiveChartSurfaceOptions,
    InteractiveRenderer,
    InteractiveRendererAdapter,
    ViewportChannel,
    ViewportState,
} from './types';
import { isExternalInteraction } from './interactions';
import type { ChartUpdate, ChartUpdateResult } from './language/updates';

let generatedChartId = 0;

function nextChartId(): string {
    generatedChartId += 1;
    return `flint-chart-${generatedChartId}`;
}

const RAIL_THICKNESS = 8;
const RAIL_GAP = 9;
const RAIL_TRACK_COLOR = 'rgba(31, 41, 55, 0.035)';
const RAIL_THUMB_COLOR = 'rgba(31, 41, 55, 0.14)';
const MIN_HORIZONTAL_RAIL_INSET = 8;
const MAX_HORIZONTAL_RAIL_INSET = 16;
const HORIZONTAL_RAIL_INSET_RATIO = 0.025;

export function clampViewportStart(viewport: CategoryViewport, requestedStart: number): number {
    const max = Math.max(0, viewport.totalCount - viewport.visibleCount);
    return Math.min(max, Math.max(0, Math.floor(requestedStart)));
}

function applyStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
    Object.assign(element.style, styles);
}

function createViewportRail(
    viewport: CategoryViewport,
    initialStart: number,
    onChange: (start: number) => void,
): { element: HTMLElement; update(start: number): void; setGeometry(offset: number, extent: number): void } {
    const vertical = viewport.channel === 'y';
    const rail = document.createElement('div');
    const track = document.createElement('span');
    const thumb = document.createElement('span');
    let start = clampViewportStart(viewport, initialStart);
    let dragOffset = 0;

    rail.dataset.flintViewport = viewport.channel;
    applyStyles(rail, vertical ? {
        display: 'flex', flexDirection: 'column', alignItems: 'center', alignSelf: 'start', minHeight: '0',
    } : {
        display: 'block', justifySelf: 'start', width: '100%', maxWidth: '100%', minWidth: '0',
    });
    track.tabIndex = 0;
    track.setAttribute('role', 'scrollbar');
    track.setAttribute('aria-label', `Visible ${viewport.field} range`);
    track.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
    applyStyles(track, vertical ? {
        position: 'relative', display: 'block', width: `${RAIL_THICKNESS}px`, flex: '1 1 auto', minHeight: '96px', overflow: 'hidden',
        borderRadius: '4px', background: RAIL_TRACK_COLOR, cursor: 'ns-resize', touchAction: 'none', outline: 'none',
    } : {
        position: 'relative', display: 'block', width: '100%', height: `${RAIL_THICKNESS}px`, overflow: 'hidden',
        borderRadius: '4px', background: RAIL_TRACK_COLOR, cursor: 'ew-resize', touchAction: 'none', outline: 'none',
    });
    applyStyles(thumb, vertical ? {
        position: 'absolute', left: '0', right: '0', borderRadius: '4px', background: RAIL_THUMB_COLOR, pointerEvents: 'none',
    } : {
        position: 'absolute', top: '0', bottom: '0', borderRadius: '4px', background: RAIL_THUMB_COLOR, pointerEvents: 'none',
    });
    track.append(thumb);
    rail.append(track);

    const update = (requestedStart: number): void => {
        start = clampViewportStart(viewport, requestedStart);
        const end = Math.min(viewport.totalCount, start + viewport.visibleCount);
        const max = Math.max(0, viewport.totalCount - viewport.visibleCount);
        const leading = viewport.totalCount > 0 ? start / viewport.totalCount * 100 : 0;
        const size = viewport.totalCount > 0 ? viewport.visibleCount / viewport.totalCount * 100 : 100;
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', String(max));
        track.setAttribute('aria-valuenow', String(start));
        track.setAttribute('aria-valuetext', `${start + 1} through ${end} of ${viewport.totalCount}`);
        if (vertical) {
            thumb.style.top = `${leading}%`;
            thumb.style.height = `${size}%`;
        } else {
            thumb.style.left = `${leading}%`;
            thumb.style.width = `${size}%`;
        }
    };

    const updateFromPointer = (event: PointerEvent): void => {
        const rect = track.getBoundingClientRect();
        const length = vertical ? rect.height : rect.width;
        const thumbLength = length * viewport.visibleCount / viewport.totalCount;
        const available = Math.max(1, length - thumbLength);
        const pointer = vertical ? event.clientY - rect.top : event.clientX - rect.left;
        const max = Math.max(0, viewport.totalCount - viewport.visibleCount);
        const next = Math.round(Math.min(1, Math.max(0, (pointer - dragOffset) / available)) * max);
        update(next);
        onChange(next);
    };

    track.addEventListener('pointerdown', (event) => {
        const rect = track.getBoundingClientRect();
        const length = vertical ? rect.height : rect.width;
        const pointer = vertical ? event.clientY - rect.top : event.clientX - rect.left;
        const thumbLeading = length * start / viewport.totalCount;
        const thumbLength = length * viewport.visibleCount / viewport.totalCount;
        dragOffset = event.target === thumb ? pointer - thumbLeading : thumbLength / 2;
        track.setPointerCapture(event.pointerId);
        updateFromPointer(event);
    });
    track.addEventListener('pointermove', (event) => {
        if (track.hasPointerCapture(event.pointerId)) updateFromPointer(event);
    });
    const release = (event: PointerEvent): void => {
        if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    };
    track.addEventListener('pointerup', release);
    track.addEventListener('pointercancel', release);
    track.addEventListener('keydown', (event) => {
        const previous = vertical ? 'ArrowUp' : 'ArrowLeft';
        const next = vertical ? 'ArrowDown' : 'ArrowRight';
        const max = Math.max(0, viewport.totalCount - viewport.visibleCount);
        let requested: number | undefined;
        if (event.key === previous) requested = start - 1;
        else if (event.key === next) requested = start + 1;
        else if (event.key === 'PageUp') requested = start - viewport.visibleCount;
        else if (event.key === 'PageDown') requested = start + viewport.visibleCount;
        else if (event.key === 'Home') requested = 0;
        else if (event.key === 'End') requested = max;
        if (requested === undefined) return;
        event.preventDefault();
        const clamped = Math.min(max, Math.max(0, requested));
        update(clamped);
        onChange(clamped);
    });
    update(start);
    const setGeometry = (offset: number, extent: number): void => {
        if (!Number.isFinite(offset) || !Number.isFinite(extent) || extent <= 0) return;
        if (vertical) {
            rail.style.marginTop = `${Math.max(0, Math.floor(offset))}px`;
            rail.style.height = `${Math.floor(extent)}px`;
            rail.style.maxHeight = '100%';
        } else {
            const inset = Math.min(
                MAX_HORIZONTAL_RAIL_INSET,
                Math.max(MIN_HORIZONTAL_RAIL_INSET, Math.round(extent * HORIZONTAL_RAIL_INSET_RATIO)),
            );
            rail.style.marginLeft = `${Math.max(0, Math.floor(offset + inset))}px`;
            rail.style.width = `${Math.max(1, Math.floor(extent - inset * 2))}px`;
        }
    };
    return { element: rail, update, setGeometry };
}

function renderedChartExtent(chart: HTMLElement): { width: number; height: number } {
    const bounds = Array.from(chart.children)
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
    if (bounds.length === 0) {
        const rect = chart.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    }
    return {
        width: Math.max(...bounds.map((rect) => rect.width)),
        height: Math.max(...bounds.map((rect) => rect.height)),
    };
}

export function mountInteractiveChartSurface(
    container: HTMLElement,
    input: ChartAssemblyInput,
    adapter: InteractiveRendererAdapter,
    options: InteractiveChartSurfaceOptions = {},
): InteractiveChartSurface {
    const chartId = options.chartId ?? nextChartId();
    const root = document.createElement('div');
    const chart = document.createElement('div');
    const state: ViewportState = {};
    const rails = new Map<ViewportChannel, ReturnType<typeof createViewportRail>>();
    const interactions = options.interactions ?? [];
    const externalInteractions = new Map(
        interactions.filter(isExternalInteraction).map((interaction) => [interaction.id, interaction]),
    );
    let renderer: InteractiveRenderer | undefined;
    let updateTimer: number | undefined;
    let destroyed = false;

    root.className = options.className ?? 'flint-interactive-surface';
    root.setAttribute('role', 'figure');
    root.setAttribute('aria-label', options.ariaLabel ?? input.chart_spec.title ?? 'Interactive chart');
    root.dataset.flintChartId = chartId;
    applyStyles(root, {
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateRows: 'minmax(0, auto) auto',
        alignItems: 'stretch', rowGap: '6px', minWidth: '0',
    });
    chart.dataset.flintChart = '';
    // The chart keeps its compiled width; handling any overflow is the host's decision.
    applyStyles(chart, { gridColumn: '1', gridRow: '1', minWidth: '0' });
    root.append(chart);
    container.replaceChildren(root);

    const scheduleRender = (): void => {
        if (!renderer || updateTimer !== undefined || destroyed) return;
        updateTimer = window.setTimeout(() => {
            updateTimer = undefined;
            void renderer?.setViewports({ ...state });
        }, 0);
    };
    const setViewport = (channel: ViewportChannel, requestedStart: number): void => {
        const viewport = renderer?.viewports.find((candidate) => candidate.channel === channel);
        if (!viewport) return;
        state[channel] = clampViewportStart(viewport, requestedStart);
        rails.get(channel)?.update(state[channel] ?? 0);
        scheduleRender();
    };
    const unsupportedUpdate = (update: ChartUpdate): ChartUpdateResult => ({
        status: 'unsupported',
        resolvedTargets: 0,
        unresolvedTargets: [],
        unsupportedOps: [...new Set(update.ops.map((op) => op.op))],
    });

    const ready = adapter.mount(chart, input).then(async (mounted) => {
        if (destroyed) {
            mounted.destroy();
            return;
        }
        renderer = mounted;
        if ((options.updates?.length ?? 0) > 0) {
            if (!mounted.setUpdates) throw new Error('This interactive backend does not support chart updates.');
            await mounted.setUpdates(options.updates ?? []);
        }
        for (const viewport of mounted.viewports) {
            state[viewport.channel] = 0;
            const rail = createViewportRail(viewport, 0, (start) => setViewport(viewport.channel, start));
            rails.set(viewport.channel, rail);
            if (viewport.channel === 'x') {
                rail.element.style.gridColumn = '1';
                rail.element.style.gridRow = '2';
            } else {
                rail.element.style.gridColumn = '2';
                rail.element.style.gridRow = '1';
                root.style.gridTemplateColumns = `minmax(0, 1fr) ${RAIL_THICKNESS}px`;
                root.style.columnGap = `${RAIL_GAP}px`;
            }
            root.append(rail.element);
        }
        const syncRailExtents = (): void => {
            const extent = renderedChartExtent(chart);
            const xGeometry = renderer?.getViewportGeometry?.('x');
            const yGeometry = renderer?.getViewportGeometry?.('y');
            rails.get('x')?.setGeometry(xGeometry?.offset ?? 0, xGeometry?.extent ?? extent.width);
            rails.get('y')?.setGeometry(yGeometry?.offset ?? 0, yGeometry?.extent ?? extent.height);
            // Sizing to content keeps the surface honest when the chart is wider than its host.
            root.style.width = 'max-content';
        };
        syncRailExtents();
        window.setTimeout(syncRailExtents, 0);
    });

    return {
        element: root,
        chartId,
        ready,
        getViewportState: () => ({ ...state }),
        setViewport,
        dispatch: async (interactionId, payload) => {
            await ready;
            if (destroyed) return null;
            const interaction = externalInteractions.get(interactionId);
            if (!interaction) {
                const definition = interactions.find((candidate) => candidate.id === interactionId);
                throw new Error(definition
                    ? `Interaction "${interactionId}" is a canvas interaction and cannot receive external payloads.`
                    : `External interaction "${interactionId}" is not defined.`);
            }
            if (!renderer?.getInteractionContext) {
                throw new Error('This interactive backend does not provide interaction context.');
            }
            const update = interaction.handle(payload, renderer.getInteractionContext());
            if (!update) return null;
            if (!renderer.applyUpdate) return unsupportedUpdate(update);
            return renderer.applyUpdate(update);
        },
        applyUpdate: async (update, applyOptions) => {
            await ready;
            if (destroyed || !renderer?.applyUpdate) return unsupportedUpdate(update);
            return renderer.applyUpdate(update, applyOptions);
        },
        setUpdates: async (updates) => {
            await ready;
            if (destroyed || !renderer?.setUpdates) {
                return updates.map(unsupportedUpdate);
            }
            return renderer.setUpdates(updates);
        },
        clearUpdate: async (id) => {
            await ready;
            if (!destroyed) await renderer?.clearUpdate?.(id);
        },
        refresh: () => {
            if (!destroyed) renderer?.refresh?.();
        },
        destroy: () => {
            if (destroyed) return;
            destroyed = true;
            if (updateTimer !== undefined) window.clearTimeout(updateTimer);
            renderer?.destroy();
            container.replaceChildren();
        },
    };
}