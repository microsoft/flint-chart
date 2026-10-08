import { applyCategoryViewports } from '../core/filter-overflow';
import type { CategoryViewport, ChartAssemblyInput } from '../core/types';
import { createChangeFilter } from '../interactive/chart-state';
import { createFloatingPanel } from '../interactive/floating-panel';
import { isCanvasInteraction, type ChartState, type InteractionContext, type InteractionDef } from '../interactive/interactions';
import type { InteractiveRendererAdapter, TargetFeedbackOptions, ViewportState } from '../interactive/types';
import { assembleVegaLite } from './assemble';
import { canvasFurnitureMarkup, readCanvasFurniture } from './canvas-furniture';
import { enableGuideLabelTooltips } from './instantiate-spec';
import {
    addVegaLiteInteractions,
    collectVegaAxisTargets,
    injectVegaInteractionStore,
    injectVegaGeoLevelFit,
    injectVegaGeoNavigationSignals,
    injectVegaNavigationSignals,
    injectVegaReorderSignal,
    findVegaAxisScale,
    withoutSemanticInteractionField,
} from './interactions/compile';
import { mountVegaInteractions } from './interactions/runtime';

/**
 * The runtime mounts what admission kept, in the author's order. Admission may replace a
 * definition with a copy that affords less, so a canvas definition is matched by id, not
 * by identity; external definitions pass through untouched.
 */
export function mountedInteractionList(
    interactions: readonly InteractionDef[],
    admitted: readonly InteractionDef[],
): InteractionDef[] {
    const byId = new Map(admitted.map((interaction) => [interaction.id, interaction]));
    return interactions.flatMap((interaction) => {
        if (!isCanvasInteraction(interaction)) return [interaction];
        const kept = byId.get(interaction.id);
        return kept ? [kept] : [];
    });
}
import { INTERACTION_STORES } from './interactions/stores';
import { compile } from 'vega-lite';
import { Error as VegaError, parse, View } from 'vega';
import { createDefaultStyle, DEFAULT_OPTIONS, Handler } from 'vega-tooltip';

let tooltipSerial = 0;

function createTooltip(container: HTMLElement) {
    if (container.ownerDocument === document) {
        const handler = new Handler();
        return { call: handler.call, destroy: () => undefined };
    }
    const owner = container.ownerDocument;
    const element = owner.createElement('div');
    element.id = `flint-vega-tooltip-${++tooltipSerial}`;
    element.classList.add('vg-tooltip', 'light-theme');
    const style = owner.createElement('style');
    style.textContent = createDefaultStyle(element.id);
    owner.head.append(style);
    let cursor = { x: 0, y: 0 };
    const panel = createFloatingPanel({
        element, container, gap: DEFAULT_OPTIONS.offsetY,
        anchor: () => new DOMRect(cursor.x + DEFAULT_OPTIONS.offsetX, cursor.y, 0, 0),
    });
    const call: Handler['call'] = (_handler, event, _item, value) => {
        if (value == null || value === '') {
            element.classList.remove('visible');
            panel.hide();
            return;
        }
        element.innerHTML = DEFAULT_OPTIONS.formatTooltip(
            value, DEFAULT_OPTIONS.sanitize, DEFAULT_OPTIONS.maxDepth, DEFAULT_OPTIONS.baseURL,
        );
        cursor = { x: event.clientX, y: event.clientY };
        element.classList.add('visible');
        panel.show();
    };
    return { call, destroy() { panel.destroy(); style.remove(); } };
}

export interface VegaInteractiveRendererOptions {
    renderer?: 'canvas' | 'svg';
    interactions?: readonly InteractionDef[];
    enableSemanticUpdates?: boolean;
    expressionInterpreter?: unknown;
    background?: string;
    assistDistance?: number;
    hoverTolerance?: number;
    keyboardTargeting?: boolean;
    targetFeedback?: { assisted: TargetFeedbackOptions | false; keyboard: TargetFeedbackOptions | false };
}

function windowedInput(
    input: ChartAssemblyInput,
    viewports: CategoryViewport[],
    starts: ViewportState,
): ChartAssemblyInput {
    return {
        ...input,
        data: {
            values: applyCategoryViewports(input.data.values ?? [], viewports, starts),
        },
    };
}

/**
 * Canvas furniture (such as a masthead tab) sits at absolute canvas pixels that Vega cannot
 * express. A layer over the rendered chart draws it for either renderer and survives re-renders.
 */
function mountCanvasFurniture(container: HTMLElement, items: ReturnType<typeof readCanvasFurniture>): void {
    const rendered = container.querySelector(':scope > canvas, :scope > svg');
    if (items.length === 0 || !rendered) return;
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    // SVG elements have no offsetLeft, so measure rects and undo any CSS scale on an ancestor.
    const box = container.getBoundingClientRect();
    const at = rendered.getBoundingClientRect();
    const scale = container.offsetWidth > 0 ? box.width / container.offsetWidth : 1;
    const left = (at.left - box.left) / (scale || 1) - container.clientLeft;
    const top = (at.top - box.top) / (scale || 1) - container.clientTop;
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('class', 'flint-canvas-furniture');
    layer.style.cssText = `position:absolute;left:${left}px;top:${top}px;`
        + 'width:1px;height:1px;overflow:visible;pointer-events:none;';
    layer.innerHTML = canvasFurnitureMarkup(items);
    rendered.after(layer);
}

function applyViewportSorts(node: unknown, viewports: CategoryViewport[]): void {
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, any>;
    for (const viewport of viewports) {
        const encoding = record.encoding?.[viewport.channel];
        if (encoding?.field === viewport.field) encoding.sort = viewport.orderedValues;
    }
    for (const value of Object.values(record)) applyViewportSorts(value, viewports);
}

export function createVegaInteractiveRenderer(
    options: VegaInteractiveRendererOptions = {},
): InteractiveRendererAdapter {
    return {
        async mount(container, input) {
            // Tooltips are presentation, so the spec decides: off unless `options.addTooltips` is set.
            const interactiveInput: ChartAssemblyInput = input;
            const assembled = assembleVegaLite(interactiveInput) as any;
            const viewports = (assembled._viewports ?? []) as CategoryViewport[];
            // Only a windowed chart needs its first window assembled again.
            const firstInput = viewports.length > 0 ? windowedInput(interactiveInput, viewports, {}) : interactiveInput;
            const vlSpec = viewports.length > 0 ? assembleVegaLite(firstInput) as any : assembled;
            applyViewportSorts(vlSpec, viewports);
            const interactions = options.interactions ?? [];
            const canvasInteractions = interactions.filter(isCanvasInteraction);
            const interactionPlan = addVegaLiteInteractions(
                vlSpec,
                interactions,
                options.enableSemanticUpdates,
            );
            const vegaSpec = enableGuideLabelTooltips(compile(vlSpec).spec as any);
            if (interactionPlan) {
                interactionPlan.axisTargets = collectVegaAxisTargets(
                    vegaSpec,
                    interactionPlan.axisFields,
                    interactionPlan.reorderAxes,
                    (interactionPlan.interactions ?? canvasInteractions).some((interaction) =>
                        interaction.affordances['axis-label']?.hover)
                        ? interactionPlan.selectionBoundary?.color ?? '#20262c'
                        : undefined,
                );
                if (interactionPlan.semanticStores) {
                    injectVegaInteractionStore(vegaSpec, interactionPlan);
                }
                interactionPlan.navigationAxes = interactionPlan.geoNavigation
                    ? injectVegaGeoNavigationSignals(vegaSpec, interactionPlan.navigationChannels)
                    : injectVegaNavigationSignals(vegaSpec, interactionPlan.navigationChannels);
                if (interactionPlan.geoNavigation && interactionPlan.geoLevels) {
                    injectVegaGeoLevelFit(vegaSpec, interactionPlan.geoLevels);
                }
                interactionPlan.reorderAxes = (interactionPlan.reorderAxes ?? [])
                    .map((axis) => injectVegaReorderSignal(vegaSpec, axis))
                    .filter((axis): axis is NonNullable<typeof axis> => !!axis);
                interactionPlan.reorderAxis = interactionPlan.reorderAxes[0];
            }
            const source = vegaSpec.data
                ?.find((entry: any) => Array.isArray(entry.values) && !INTERACTION_STORES.includes(entry.name))
                ?.name as string | undefined;
            if (viewports.length > 0 && !source) {
                throw new Error('Compiled chart has no mutable inline data source.');
            }
            if (interactionPlan) {
                interactionPlan.overlayScales = {
                    x: findVegaAxisScale(vegaSpec, 'x')?.name,
                    y: findVegaAxisScale(vegaSpec, 'y')?.name,
                    color: vegaSpec.scales?.find((scale: any) => scale.name === 'color')?.name
                        ?? (() => {
                            const matches = (vegaSpec.scales ?? []).filter((scale: any) =>
                                typeof scale.name === 'string' && scale.name.endsWith('_color'));
                            return matches.length === 1 ? matches[0].name : undefined;
                        })(),
                };
                interactionPlan.mutableDataSource = source;
                interactionPlan.initialDataRows = firstInput.data.values ?? [];
            }
            const view = new View(
                parse(vegaSpec, { background: options.background } as any, { ast: true } as any),
                {
                    renderer: options.renderer ?? 'canvas',
                    container,
                    ...(options.expressionInterpreter ? { expr: options.expressionInterpreter } : {}),
                } as any,
            );
            view.logLevel(VegaError);
            const tooltip = createTooltip(container);
            view.tooltip((handler, event, item, value) => {
                tooltip.call(handler, event, item, withoutSemanticInteractionField(value));
            });
            await view.runAsync();
            mountCanvasFurniture(container, readCanvasFurniture(vlSpec));
            const mountedInteractions = mountedInteractionList(interactions, interactionPlan?.interactions ?? canvasInteractions);
            const interactionController = interactionPlan
                ? mountVegaInteractions(
                    view,
                    container,
                    input.chart_spec.chartType,
                    interactionPlan,
                    mountedInteractions,
                    interactionPlan.resolve,
                    interactionPlan.presentUpdate ?? ((update) => update),
                    options.assistDistance,
                    options.hoverTolerance ?? 0,
                    options.keyboardTargeting ?? false,
                    options.targetFeedback,
                )
                : undefined;

            let destroyed = false;
            let running = false;
            let updateTimer: number | undefined;
            let requestedVersion = 0;
            let appliedVersion = 0;
            let latestStarts: ViewportState = {};

            const schedule = (): void => {
                if (destroyed || running || updateTimer !== undefined || !source) return;
                updateTimer = window.setTimeout(() => {
                    updateTimer = undefined;
                    if (destroyed) return;
                    const version = requestedVersion;
                    const rows = applyCategoryViewports(interactiveInput.data.values ?? [], viewports, latestStarts);
                    running = true;
                    view.data(source, []);
                    void view
                        .runAsync()
                        .then(() => view.data(source, rows).runAsync())
                        .finally(() => {
                            running = false;
                            appliedVersion = version;
                            if (requestedVersion !== appliedVersion) schedule();
                            else interactionController?.reportChange({ phase: 'commit', source: 'reader' });
                        });
                }, 0);
            };

            const currentWindows = (): ChartState['windows'] => viewports.length === 0
                ? undefined
                : Object.fromEntries(viewports.map((viewport) => [viewport.channel, {
                    start: latestStarts[viewport.channel] ?? 0,
                    count: viewport.visibleCount,
                    total: viewport.totalCount,
                }]));
            // The state is the controller's own object; the rail windows join it as one more field.
            const withWindows = <T extends ChartState>(state: T): T => {
                const windows = currentWindows();
                if (windows) Object.defineProperty(state, 'windows', { value: windows, enumerable: true });
                return state;
            };
            const fallbackContext = (): InteractionContext => ({
                chartType: input.chart_spec.chartType,
                selected: [],
            });

            return {
                viewports,
                warnings: interactionPlan?.warnings ?? [],
                getInteractionContext() {
                    return interactionController?.getInteractionContext() ?? fallbackContext();
                },
                getState() {
                    return withWindows(interactionController?.getInteractionContext() ?? fallbackContext());
                },
                onChange(listener) {
                    if (!interactionController) return () => {};
                    const filter = createChangeFilter(withWindows(interactionController.getInteractionContext()));
                    return interactionController.onChange((report) => {
                        const change = filter({ ...report, state: withWindows(report.state) });
                        if (change) listener(change);
                    });
                },
                async applyUpdate(update, options) {
                    if (interactionController) return interactionController.applyUpdate(update, options);
                    return {
                        status: 'unsupported',
                        resolvedTargets: 0,
                        unresolvedTargets: [],
                        unsupportedOps: [...new Set(update.ops.map((op) => op.op))],
                    };
                },
                async setUpdates(updates) {
                    if (interactionController) return interactionController.setUpdates(updates);
                    return updates.map((update) => ({
                        status: 'unsupported' as const,
                        resolvedTargets: 0,
                        unresolvedTargets: [],
                        unsupportedOps: [...new Set(update.ops.map((op) => op.op))],
                    }));
                },
                async clearUpdate(id) {
                    await interactionController?.clearUpdate(id);
                },
                refresh() {
                    interactionController?.refresh();
                },
                getViewportGeometry(channel) {
                    const [left, top] = view.origin();
                    return channel === 'x'
                        ? { offset: left, extent: view.width() }
                        : { offset: top, extent: view.height() };
                },
                setViewports(starts) {
                    latestStarts = { ...starts };
                    requestedVersion += 1;
                    schedule();
                },
                resize(size) {
                    view.width(size.width).height(size.height);
                    void view.runAsync();
                },
                destroy() {
                    if (destroyed) return;
                    destroyed = true;
                    if (updateTimer !== undefined) window.clearTimeout(updateTimer);
                    interactionController?.destroy();
                    view.finalize();
                    tooltip.destroy();
                    container.replaceChildren();
                },
            };
        },
    };
}