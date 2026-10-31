import type { ViewNode } from '../core/views';
import { applyCategoryViewports, resolveCategoryViewport } from '../core/filter-overflow';
import type { CategoryViewport, ChartAssemblyInput } from '../core/types';
import { temporalFieldValue } from '../core/resolve-semantics';
import { createChangeFilter } from '../interactive/chart-state';
import { currentFilters, isFilterControls } from '../interactive/filter-controls';
import { createFloatingPanel } from '../interactive/floating-panel';
import { isCanvasInteraction, type ChartState, type InteractionContext, type InteractionDef } from '../interactive/interactions';
import type { ChartUpdateTransition, InteractiveRendererAdapter, TargetFeedbackOptions, ViewportState } from '../interactive/types';
import { openVegaLiteSession, type Replanned } from './assemble';
import { canvasFurnitureMarkup, readCanvasFurniture, readCanvasPatterns, type CanvasPattern } from './canvas-furniture';
import { enableGuideLabelTooltips, planTemporalTickValues } from './instantiate-spec';
import {
    addVegaLiteInteractions,
    collectVegaAxisTargets,
    injectVegaInteractionStore,
    injectVegaGeoLevelFit,
    injectVegaGeoNavigationSignals,
    vegaGeoFocusSource,
    injectVegaNavigationSignals,
    injectVegaReorderSignal,
    findVegaAxisScale,
    withoutSemanticInteractionField,
} from './interactions/compile';
import {
    bindLiveLayout,
    LIVE_LAYOUT_SIGNAL,
    liveLayoutOf,
    liveLayoutPlanner,
    navigationDomainSignal,
    TEMPORAL_TICKS_FUNCTION,
    vegaLiteTemporalAxisPlans,
    type LiveLayoutPlanner,
} from './interactions/live-layout';
import { mountVegaInteractions } from './interactions/runtime';
import { bindLegendDomains, captureMorphScene, hasSceneTween, injectAxisTween, injectScaleTween } from './interactions/scene-tween';
import { captureFrameScene } from './interactions/frame-scene';
import { advanceLiveValues, bindLiveValues, LIVE_VALUES_SIGNAL, liveValuesChange } from './live-values';
import { readDrawnLayout } from './drawn-layout';
import { vegaRendererOrigin } from './interactions/hit-adapter';

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
import { Error as VegaError, expressionFunction, parse, View } from 'vega';
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

/** Whether two lists hold the same records, row by row and field by field. */
function sameRecords(a: readonly Record<string, unknown>[], b: readonly Record<string, unknown>[]): boolean {
    return a.length === b.length && a.every((row, index) => {
        const other = b[index]!;
        const keys = Object.keys(row);
        return keys.length === Object.keys(other).length && keys.every((key) => Object.is(row[key], other[key]));
    });
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
    /** How long committed changes animate unless an interaction or a call names its own. */
    transition?: ChartUpdateTransition;
    /** Bind the chart's layout values to a signal, so `relayout` can lay it out again in place. */
    liveValues?: boolean;
}

/**
 * Filtering swaps the rows, and a data-driven color domain would then recolor every
 * series after a removed one. Pin each discrete color domain to the full data, in the
 * order the chart would draw it, so a series keeps its color while others come and go.
 */
function pinColorDomains(spec: any): void {
    const rows: readonly Record<string, unknown>[] = Array.isArray(spec.data?.values) ? spec.data.values : [];
    if (rows.length === 0) return;
    const visit = (node: any): void => {
        if (!node || typeof node !== 'object') return;
        const color = node.encoding?.color;
        if (color && typeof color.field === 'string' && (color.type === 'nominal' || color.type === 'ordinal')
            && color.scale?.domain === undefined && !color.aggregate) {
            const seen = [...new Set(rows.map((row) => row[color.field]).filter((value) => value != null))];
            let domain: unknown[] | undefined;
            if (color.sort === null) domain = seen;
            else if (Array.isArray(color.sort)) domain = [...color.sort, ...seen.filter((value) => !color.sort.includes(value))];
            else if (color.sort === undefined || color.sort === 'ascending') {
                domain = [...seen].sort((left, right) => String(left).localeCompare(String(right), undefined, { numeric: true }));
            } else if (color.sort === 'descending') {
                domain = [...seen].sort((left, right) => String(right).localeCompare(String(left), undefined, { numeric: true }));
            }
            if (domain) color.scale = { ...(color.scale ?? {}), domain };
        }
        for (const child of [...(node.layer ?? []), ...(node.concat ?? []), ...(node.hconcat ?? []), ...(node.vconcat ?? [])]) visit(child);
        if (node.spec) visit(node.spec);
    };
    visit(spec);
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
function mountCanvasFurniture(container: HTMLElement, items: ReturnType<typeof readCanvasFurniture>, patterns: CanvasPattern[] = []): void {
    container.querySelector(':scope > .flint-canvas-furniture')?.remove();
    const rendered = container.querySelector(':scope > canvas, :scope > svg');
    if ((items.length === 0 && patterns.length === 0) || !rendered) return;
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('class', 'flint-canvas-furniture');
    layer.style.cssText = 'position:absolute;width:1px;height:1px;overflow:visible;pointer-events:none;';
    // Laid out on the chart's own width: a rule along the top edge runs the canvas whatever it renders at.
    const width = (rendered as HTMLElement).offsetWidth || Number(rendered.getAttribute('width')) || rendered.getBoundingClientRect().width;
    // Fill patterns are defined here too: ids are the document's, so the chart's marks resolve them.
    const height = (rendered as HTMLElement).offsetHeight || Number(rendered.getAttribute('height')) || rendered.getBoundingClientRect().height;
    layer.innerHTML = canvasFurnitureMarkup(items, width, patterns, height);
    rendered.after(layer);
    // SVG elements have no offsetLeft, so measure rects and undo any CSS scale on an ancestor.
    const place = (): void => {
        if (!layer.isConnected) {
            observer?.disconnect();
            return;
        }
        const box = container.getBoundingClientRect();
        const at = rendered.getBoundingClientRect();
        const scale = container.offsetWidth > 0 ? box.width / container.offsetWidth : 1;
        layer.style.left = `${(at.left - box.left) / (scale || 1) - container.clientLeft}px`;
        layer.style.top = `${(at.top - box.top) / (scale || 1) - container.clientTop}px`;
    };
    // The chart can move inside its host after mount, as when the host is resized and centres it.
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place);
    observer?.observe(container);
    place();
}

/**
 * Vega's canvas handler picks from raw client pixels, so under an ancestor CSS scale the picked
 * item drifts from the pointer. Undo the scale before picking; the SVG handler picks from the
 * event target and needs no change.
 */
export function scaleAwareCanvasPicking(handler: any): void {
    if (typeof handler?.canvas !== 'function' || typeof handler.context !== 'function') return;
    handler.pickEvent = (event: { clientX: number; clientY: number }) => {
        const canvas: HTMLCanvasElement | null = handler.canvas();
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.offsetWidth > 0 ? rect.width / canvas.offsetWidth : 1;
        const scaleY = canvas.offsetHeight > 0 ? rect.height / canvas.offsetHeight : 1;
        const x = (event.clientX - rect.left) / (scaleX || 1) - (canvas.clientLeft || 0);
        const y = (event.clientY - rect.top) / (scaleY || 1) - (canvas.clientTop || 0);
        const [originX, originY] = handler._origin ?? [0, 0];
        return handler.pick(handler._scene, x, y, x - originX, y - originY);
    };
}

/**
 * The size signals a filter re-lays out: a banded axis's step (its size follows the band count)
 * and a plain width or height. Flint's layout for the remaining rows sets them on each filter.
 */
type LayoutSignal = { dimension: 'width' | 'height'; signal: string; kind: 'step' | 'size' };

/** The panel count of the first facet in a tree of views. */
function facetPanels(node: ViewNode | undefined): number | undefined {
    if (!node || node.kind === 'view') return undefined;
    if (node.kind === 'facet') return node.panels;
    for (const child of node.children) {
        const panels = facetPanels(child);
        if (panels !== undefined) return panels;
    }
    return undefined;
}

/** The wrap count of the first facet in a tree of views. */
function facetColumns(node: ViewNode | undefined): number | undefined {
    if (!node || node.kind === 'view') return undefined;
    if (node.kind === 'facet') return node.columns;
    for (const child of node.children) {
        const columns = facetColumns(child);
        if (columns !== undefined) return columns;
    }
    return undefined;
}

/** The signals of a compiled Vega spec that hold a plain number: the sizes and steps of its views. */
function plainSignals(vegaSpec: any): Map<string, number> {
    return new Map((vegaSpec.signals ?? [])
        .filter((signal: any) => typeof signal.value === 'number' && signal.update === undefined && signal.on === undefined)
        .map((signal: any) => [signal.name, signal.value]));
}

export function layoutSignals(vegaSpec: any): LayoutSignal[] {
    const signals: any[] = vegaSpec.signals ?? [];
    return (['width', 'height'] as const).flatMap((dimension): LayoutSignal[] => {
        const stepSignal = dimension === 'width' ? 'x_step' : 'y_step';
        const size = signals.find((signal) => signal.name === dimension);
        if (!size) return [];
        if (typeof size.update === 'string') {
            return size.update.includes(stepSignal) && signals.some((signal) => signal.name === stepSignal)
                ? [{ dimension, signal: stepSignal, kind: 'step' }]
                : [];
        }
        return typeof size.value === 'number' ? [{ dimension, signal: dimension, kind: 'size' }] : [];
    });
}

/** The windows over a subset of the rows: their categories in the same order, the window no larger than they are. */
function viewportsOver(viewports: CategoryViewport[], rows: readonly Record<string, unknown>[]): CategoryViewport[] {
    return viewports.map((viewport) => {
        const present = new Set(rows.map((row) => row[viewport.field]));
        const orderedValues = viewport.orderedValues.filter((value) => present.has(value));
        return {
            ...viewport,
            orderedValues,
            totalCount: orderedValues.length,
            visibleCount: Math.min(viewport.visibleCount, orderedValues.length),
        };
    });
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

expressionFunction(TEMPORAL_TICKS_FUNCTION, planTemporalTickValues);

export function createVegaInteractiveRenderer(
    options: VegaInteractiveRendererOptions = {},
): InteractiveRendererAdapter {
    return {
        async mount(container, input) {
            // Tooltips are presentation, so the spec decides: off unless `options.addTooltips` is set.
            const interactiveInput: ChartAssemblyInput = input;
            // A viewport on x changes the rows in view, so the compile leaves room for a live layout.
            const navigatesX = (options.interactions ?? []).some((interaction) => isCanvasInteraction(interaction)
                && interaction.eventSource.type === 'navigation' && interaction.eventSource.axes !== 'y');
            const mountedInput: ChartAssemblyInput = navigatesX
                ? { ...interactiveInput, options: { ...interactiveInput.options, liveLayoutSignal: LIVE_LAYOUT_SIGNAL } }
                : interactiveInput;
            const session = openVegaLiteSession(mountedInput);
            const assembled = session.spec;
            const viewports = (assembled._viewports ?? []) as CategoryViewport[];
            // Only a windowed chart needs its first window assembled again.
            const firstInput = viewports.length > 0 ? windowedInput(mountedInput, viewports, {}) : mountedInput;
            const drawn = viewports.length > 0 ? openVegaLiteSession(firstInput) : session;
            const vlSpec = drawn.spec;
            // The plot the chart draws now; a filter that re-lays the chart out replaces it. A
            // category rail draws a window of the rows, which the plan does not own, so it reports none.
            let currentPlot = viewports.length > 0 ? undefined : drawn.plot;
            // The plot for all rows at the chart's size, and what a filter's re-planned rows set, by those rows.
            let framePlot = drawn.plot;
            let stepsFor = new WeakMap<readonly Record<string, unknown>[], Record<string, number>>();
            let plotFor = new WeakMap<readonly Record<string, unknown>[], { width: number; height: number } | undefined>();
            let filteredRows: readonly Record<string, unknown>[] | undefined;
            // The plain signals a re-plan or a new size has set apart from the mounted chart, such as a
            // view's width or a rule's; a filter sets each of them on every later change of rows.
            const relaidNames = new Set<string>();
            const inputRows: readonly Record<string, unknown>[] = interactiveInput.data.values ?? [];
            // The windows over the rows now current: a filter leaves fewer categories to scroll through.
            let currentViewports = viewports;
            let latestStarts: ViewportState = {};
            let windowed = { rows: inputRows, starts: '{}', shown: (firstInput.data.values ?? []) as readonly Record<string, unknown>[] };
            const windowRows = (rows: readonly Record<string, unknown>[]): readonly Record<string, unknown>[] => {
                if (rows !== windowed.rows) {
                    currentViewports = viewportsOver(viewports, rows);
                    latestStarts = Object.fromEntries(currentViewports.map((viewport) => [
                        viewport.channel,
                        resolveCategoryViewport(viewport, latestStarts[viewport.channel]).start,
                    ]));
                }
                const starts = JSON.stringify(latestStarts);
                if (rows === windowed.rows && starts === windowed.starts) return windowed.shown;
                windowed = { rows, starts, shown: applyCategoryViewports([...rows], currentViewports, latestStarts) };
                return windowed.shown;
            };
            applyViewportSorts(vlSpec, viewports);
            const interactions = options.interactions ?? [];
            const canvasInteractions = interactions.filter(isCanvasInteraction);
            const filtersRows = interactions.some((interaction) =>
                isFilterControls(interaction) && (interaction.filterControls.options.mode ?? 'filter') === 'filter');
            // The Vega spec a plan of this chart mounts as, with the interactions compiled in.
            const shape = (planned: Pick<Replanned, 'spec' | 'axisLabels' | 'dataLabels'>) => {
                const shapedSpec = planned.spec;
                const interactionPlan = addVegaLiteInteractions(
                    shapedSpec,
                    interactions,
                    options.enableSemanticUpdates,
                );
                if (viewports.length === 0 && filtersRows) pinColorDomains(shapedSpec);
                const vegaSpec = enableGuideLabelTooltips(compile(shapedSpec).spec as any);
                const relaidSignals = filtersRows ? layoutSignals(vegaSpec) : [];
                let livePlanner: LiveLayoutPlanner | undefined;
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
                    // A bar on a navigated x axis follows the rows in view: Flint plans its layout again for them.
                    const liveField = interactionPlan.axisFields?.x?.field;
                    const xScale = findVegaAxisScale(vegaSpec, 'x')?.name;
                    if (!interactionPlan.geoNavigation && interactionPlan.navigationChannels?.includes('x')
                        && viewports.length === 0 && liveField && xScale) {
                        const planner = liveLayoutPlanner(
                            interactiveInput, liveField,
                            liveLayoutOf(shapedSpec, liveField, planned.axisLabels, planned.dataLabels), session.replan,
                        );
                        if (bindLiveLayout(vegaSpec, xScale, findVegaAxisScale(vegaSpec, 'y')?.name, planner)) {
                            livePlanner = planner;
                        }
                    }
                    interactionPlan.navigationAxes = interactionPlan.geoNavigation
                        ? injectVegaGeoNavigationSignals(vegaSpec, interactionPlan.navigationChannels)
                        : injectVegaNavigationSignals(
                            vegaSpec, interactionPlan.navigationChannels, vegaLiteTemporalAxisPlans(shapedSpec),
                        );
                    if (interactionPlan.geoNavigation && interactionPlan.geoLevels) {
                        injectVegaGeoLevelFit(vegaSpec, interactionPlan.geoLevels);
                    } else if (interactionPlan.geoNavigation) {
                        interactionPlan.geoFocusSource = vegaGeoFocusSource(vegaSpec);
                    }
                    interactionPlan.reorderAxes = (interactionPlan.reorderAxes ?? [])
                        .map((axis) => injectVegaReorderSignal(vegaSpec, axis))
                        .filter((axis): axis is NonNullable<typeof axis> => !!axis);
                    interactionPlan.reorderAxis = interactionPlan.reorderAxes[0];
                    injectAxisTween(vegaSpec);
                    interactionPlan.legendDomains = bindLegendDomains(vegaSpec, interactionPlan.legendDomains);
                    interactionPlan.tweenScales = injectScaleTween(vegaSpec);
                }
                return { interactionPlan, vegaSpec, relaidSignals, livePlanner };
            };
            const shaped = shape(drawn);
            const { interactionPlan, vegaSpec, relaidSignals } = shaped;
            let livePlanner = shaped.livePlanner;
            // A chart laid out for its room binds its layout values, so a new room is pushed in place.
            let liveValues = options.liveValues && viewports.length === 0 && !interactionPlan?.geoNavigation
                ? bindLiveValues(vegaSpec)
                : undefined;
            const inlineData = ((vegaSpec.data ?? []) as any[])
                .filter((entry) => Array.isArray(entry.values) && !INTERACTION_STORES.includes(entry.name));
            // The dataset the input's own rows land in; a template that shapes its rows at assembly has none.
            const rowsSource = interactionPlan?.rowIndexed
                ? inlineData.find((entry) => sameRecords(entry.values, interactionPlan.sourceRecords))?.name as string | undefined
                : undefined;
            const source = rowsSource ?? (viewports.length > 0 ? inlineData[0]?.name as string | undefined : undefined);
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
                if (!source) {
                    const reshaped = new WeakMap<readonly Record<string, unknown>[], Record<string, readonly Record<string, unknown>[]>>();
                    interactionPlan.reshapeRows = (rows) => {
                        const current = rows ?? inputRows;
                        const cached = reshaped.get(current);
                        if (cached) return cached;
                        const next = shape(session.replan({ rows: current })).vegaSpec;
                        const datasets: Record<string, readonly Record<string, unknown>[]> = Object.fromEntries(((next.data ?? []) as any[])
                            .filter((entry) => Array.isArray(entry.values) && !INTERACTION_STORES.includes(entry.name))
                            .map((entry) => [entry.name, entry.values]));
                        reshaped.set(current, datasets);
                        return datasets;
                    };
                }
                interactionPlan.prepareDataRows = (rows) => drawn.shapeRows(rows);
                interactionPlan.initialDataRows = interactionPlan.prepareDataRows(firstInput.data.values ?? []);
                interactionPlan.temporalValue = (field, value) => temporalFieldValue(field, value, firstInput.semantic_types ?? {});
                if (viewports.length > 0) interactionPlan.windowDataRows = (rows) => windowRows(rows ?? inputRows);
                if (filtersRows) {
                    const mountedSignals = plainSignals(vegaSpec);
                    // Flint lays the chart out again for the rows a filter leaves: fewer bars get thicker steps and a shorter chart.
                    interactionPlan.dataSignals = (rows) => {
                        const current = rows ?? inputRows;
                        filteredRows = current;
                        let signals = stepsFor.get(current);
                        if (!signals) {
                            const replanned = session.replan({ rows: current });
                            const relaid = replanned.spec;
                            // A step comes from the spec; a plain size is the planned plot's, which the
                            // spec states in its view config rather than as a top-level size.
                            signals = Object.fromEntries(relaidSignals.flatMap((entry) => {
                                const size = relaid[entry.dimension];
                                const value = entry.kind === 'step' ? size?.step : replanned.plot?.[entry.dimension] ?? size;
                                return typeof value === 'number' ? [[entry.signal, value]] : [];
                            }));
                            // A mounted facet keeps its wrap count: panels sized for another count would overrun the chart.
                            const panels = facetPanels(replanned.plan.views);
                            const mountedColumns = facetColumns(drawn.plan.views);
                            const sameGrid = panels === undefined || mountedColumns === undefined
                                || Math.min(panels, mountedColumns) === Math.min(panels, facetColumns(replanned.plan.views) ?? mountedColumns);
                            if (sameGrid) for (const [name, value] of plainSignals(shape(replanned).vegaSpec)) {
                                if (!mountedSignals.has(name) || relaidSignals.some((entry) => entry.signal === name)) continue;
                                if (mountedSignals.get(name) !== value) relaidNames.add(name);
                                signals[name] = value;
                            }
                            stepsFor.set(current, signals);
                            // The chart now draws the re-planned size on each dimension a signal sets, and
                            // keeps the mounted size on the others.
                            const applied = new Set(relaidSignals.filter((entry) => entry.signal in signals!).map((entry) => entry.dimension));
                            plotFor.set(current, replanned.plot && framePlot ? {
                                width: applied.has('width') ? replanned.plot.width : framePlot.width,
                                height: applied.has('height') ? replanned.plot.height : framePlot.height,
                            } : undefined);
                        }
                        if (viewports.length === 0) currentPlot = plotFor.get(current);
                        const relaidEntries = new Set(relaidSignals.map((entry) => entry.signal));
                        return Object.fromEntries(Object.entries(signals).filter(([name]) => relaidEntries.has(name) || relaidNames.has(name)));
                    };
                }
            }
            const view = new View(
                parse(vegaSpec, { background: options.background } as any, { ast: true } as any),
                {
                    // A pattern fill is an SVG reference a canvas cannot draw.
                    renderer: readCanvasPatterns(vlSpec).length ? 'svg' : options.renderer ?? 'canvas',
                    container,
                    ...(options.expressionInterpreter ? { expr: options.expressionInterpreter } : {}),
                } as any,
            );
            view.logLevel(VegaError);
            const tooltip = createTooltip(container);
            view.tooltip((handler, event, item, value) => {
                tooltip.call(handler, event, item, withoutSemanticInteractionField(value));
            });
            // After the tooltip: setting it re-initializes the view's event handler.
            scaleAwareCanvasPicking((view as any)._handler);
            await view.runAsync();
            mountCanvasFurniture(container, readCanvasFurniture(vlSpec), readCanvasPatterns(vlSpec));
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
                    options.transition,
                )
                : undefined;

            let destroyed = false;
            let shownLayout = livePlanner?.initial;
            if (livePlanner) {
                view.addSignalListener(navigationDomainSignal('x'), (_name, domain) => {
                    const next = livePlanner?.layoutFor(domain);
                    if (!next || next === shownLayout) return;
                    shownLayout = next;
                    queueMicrotask(() => {
                        if (destroyed) return;
                        view.signal(LIVE_LAYOUT_SIGNAL, next);
                        void view.runAsync();
                    });
                });
            }
            let running = false;
            let updateTimer: number | undefined;
            let requestedVersion = 0;
            let appliedVersion = 0;

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

            const currentWindows = (): ChartState['windows'] => currentViewports.length === 0
                ? undefined
                : Object.fromEntries(currentViewports.map((viewport) => [viewport.channel, {
                    start: latestStarts[viewport.channel] ?? 0,
                    count: viewport.visibleCount,
                    total: viewport.totalCount,
                }]));
            // The state is the controller's own object; the rail windows and filters join it as more fields.
            const withWindows = <T extends ChartState>(state: T): T => {
                const windows = currentWindows();
                if (windows) Object.defineProperty(state, 'windows', { value: windows, enumerable: true, configurable: true });
                const filters = currentFilters(interactions);
                if (filters) Object.defineProperty(state, 'filters', { value: filters, enumerable: true, configurable: true });
                return state;
            };
            const fallbackContext = (): InteractionContext => ({
                chartType: input.chart_spec.chartType,
                selected: [],
            });

            // Where the drawn canvas or svg sits in the container, and how far it reaches.
            const drawnBox = (): { left: number; top: number; right: number; bottom: number } => {
                const drawnElement = container.querySelector<Element>('canvas, svg');
                if (!drawnElement) return { left: 0, top: 0, right: 0, bottom: 0 };
                const box = drawnElement.getBoundingClientRect();
                const frame = container.getBoundingClientRect();
                const scale = container.offsetWidth > 0 ? frame.width / container.offsetWidth : 1;
                return {
                    left: (box.left - frame.left) / scale,
                    top: (box.top - frame.top) / scale,
                    right: (box.right - frame.left) / scale,
                    bottom: (box.bottom - frame.top) / scale,
                };
            };
            const drawnOrigin = (): { x: number; y: number } => {
                const { left, top } = drawnBox();
                const [originX, originY] = view.origin();
                const padding = view.padding() as { left?: number; top?: number };
                return { x: left + originX + (padding.left ?? 0), y: top + originY + (padding.top ?? 0) };
            };
            return {
                viewports,
                warnings: interactionPlan?.warnings ?? [],
                get layout() {
                    if (destroyed || viewports.length > 0) return undefined;
                    const drawnLayout = readDrawnLayout(view, drawn.plan.views);
                    if (!currentPlot && !drawnLayout) return undefined;
                    return { ...(currentPlot ? { plot: currentPlot } : {}), ...drawnLayout };
                },
                getInteractionContext() {
                    return interactionController?.getInteractionContext() ?? fallbackContext();
                },
                morphScene() {
                    const fields = interactionPlan?.identityFields ?? [];
                    if (destroyed || fields.length === 0 || !hasSceneTween(view)) return undefined;
                    return captureMorphScene(view, fields, drawnOrigin());
                },
                frameScene() {
                    if (destroyed) return undefined;
                    const { right, bottom } = drawnBox();
                    return captureFrameScene(view, drawnOrigin(), { width: right, height: bottom });
                },
                setDrawnHidden(hidden) {
                    const drawnElement = container.querySelector<HTMLElement | SVGElement>('canvas, svg');
                    if (drawnElement) drawnElement.style.visibility = hidden ? 'hidden' : '';
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
                async setUpdates(updates, options) {
                    if (interactionController) return interactionController.setUpdates(updates, options);
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
                    const { x: left, y: top } = vegaRendererOrigin(view);
                    return channel === 'x'
                        ? { offset: left, extent: view.width() }
                        : { offset: top, extent: view.height() };
                },
                getViewports: () => currentViewports,
                setViewports(starts) {
                    latestStarts = { ...starts };
                    if (interactionPlan?.windowDataRows && interactionController) {
                        // The controller owns the rows, so a scroll keeps any filter and selection it holds.
                        return interactionController.rerender()
                            .then(() => interactionController.reportChange({ phase: 'commit', source: 'reader' }));
                    }
                    requestedVersion += 1;
                    schedule();
                },
                resize(size) {
                    view.width(size.width).height(size.height);
                    void view.runAsync();
                },
                async relayout(size) {
                    if (destroyed || !liveValues) return false;
                    const replanned = session.replan({ size });
                    const next = shape(replanned);
                    const change = liveValuesChange(liveValues, next.vegaSpec);
                    if (!change || !next.livePlanner !== !livePlanner) return false;
                    liveValues = advanceLiveValues(liveValues, next.vegaSpec, change);
                    view.signal(LIVE_VALUES_SIGNAL, liveValues.values);
                    for (const [name, value] of Object.entries(change.signals)) {
                        view.signal(name, value);
                        relaidNames.add(name);
                    }
                    if (change.width !== undefined) view.width(change.width);
                    if (change.height !== undefined) view.height(change.height);
                    framePlot = replanned.plot;
                    currentPlot = framePlot;
                    stepsFor = new WeakMap();
                    plotFor = new WeakMap();
                    if (filteredRows && interactionPlan?.dataSignals) {
                        for (const [name, value] of Object.entries(interactionPlan.dataSignals(filteredRows))) view.signal(name, value);
                    }
                    if (next.livePlanner) {
                        livePlanner = next.livePlanner;
                        shownLayout = livePlanner.layoutFor(view.signal(navigationDomainSignal('x'))) ?? livePlanner.initial;
                        view.signal(LIVE_LAYOUT_SIGNAL, shownLayout);
                    }
                    view.resize();
                    // Vega encodes some guide parts on enter only; running the enter set lets them read the pushed values.
                    await (view as unknown as { runAsync(encode: string): Promise<unknown> }).runAsync('enter');
                    if (change.furniture) mountCanvasFurniture(container, readCanvasFurniture(replanned.spec), readCanvasPatterns(replanned.spec));
                    interactionController?.refresh();
                    return true;
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