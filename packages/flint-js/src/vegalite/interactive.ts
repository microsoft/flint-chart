import { applyCategoryViewports } from '../core/filter-overflow';
import type { CategoryViewport, ChartAssemblyInput } from '../core/types';
import type { InteractionDef } from '../interactive/interactions';
import type { InteractiveRendererAdapter, ViewportState } from '../interactive/types';
import { assembleVegaLite } from './assemble';
import {
    addVegaLiteInteractions,
    injectVegaInteractionStore,
    injectVegaNavigationSignals,
    injectVegaReorderSignal,
    withoutSemanticInteractionField,
} from './interactions/compile';
import { mountVegaInteractions } from './interactions/runtime';
import { compile } from 'vega-lite';
import { Error as VegaError, parse, View } from 'vega';
import { Handler } from 'vega-tooltip';

export interface VegaInteractiveRendererOptions {
    renderer?: 'canvas' | 'svg';
    interactions?: readonly InteractionDef[];
    expressionInterpreter?: unknown;
    background?: string;
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
            const interactiveInput: ChartAssemblyInput = {
                ...input,
                options: {
                    ...input.options,
                    addTooltips: input.options?.addTooltips ?? true,
                },
            };
            const assembled = assembleVegaLite(interactiveInput) as any;
            const viewports = (assembled._viewports ?? []) as CategoryViewport[];
            const firstInput = windowedInput(interactiveInput, viewports, {});
            const vlSpec = assembleVegaLite(firstInput) as any;
            applyViewportSorts(vlSpec, viewports);
            const interactions = options.interactions ?? [];
            const interactionPlan = addVegaLiteInteractions(vlSpec, interactions);
            const vegaSpec = compile(vlSpec).spec as any;
            if (interactionPlan) {
                if (interactions.some((interaction) => interaction.eventSource.type !== 'navigation')) {
                    injectVegaInteractionStore(vegaSpec, interactionPlan);
                }
                interactionPlan.navigationAxes = injectVegaNavigationSignals(
                    vegaSpec,
                    interactionPlan.navigationChannels,
                );
                interactionPlan.reorderAxes = (interactionPlan.reorderAxes ?? [])
                    .map((axis) => injectVegaReorderSignal(vegaSpec, axis))
                    .filter((axis): axis is NonNullable<typeof axis> => !!axis);
                interactionPlan.reorderAxis = interactionPlan.reorderAxes[0];
            }
            const source = vegaSpec.data?.find((entry: any) => Array.isArray(entry.values))?.name as string | undefined;
            if (viewports.length > 0 && !source) {
                throw new Error('Compiled chart has no mutable inline data source.');
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
            const tooltip = new Handler();
            view.tooltip((handler, event, item, value) => {
                tooltip.call(handler, event, item, withoutSemanticInteractionField(value));
            });
            await view.runAsync();
            const interactionController = interactionPlan
                ? mountVegaInteractions(
                    view,
                    container,
                    input.chart_spec.chartType,
                    interactionPlan,
                    interactions,
                    interactionPlan.resolve,
                    interactionPlan.presentUpdate ?? ((update) => update),
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
                        });
                }, 0);
            };

            return {
                viewports,
                dispatchInteraction(event) {
                    return interactionController?.dispatch(event);
                },
                async applyUpdate(update) {
                    if (interactionController) return interactionController.applyUpdate(update);
                    return {
                        status: 'unsupported',
                        resolvedTargets: 0,
                        unresolvedTargets: [],
                        unsupportedOps: [...new Set(update.ops.map((op) => op.op))],
                    };
                },
                async clearUpdate(updateId) {
                    await interactionController?.clearUpdate(updateId);
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
                    container.replaceChildren();
                },
            };
        },
    };
}