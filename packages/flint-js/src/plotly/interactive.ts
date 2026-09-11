import { applyCategoryViewports } from '../core/filter-overflow';
import type { CategoryViewport, ChartAssemblyInput } from '../core/types';
import type { InteractiveRendererAdapter, ViewportState } from '../interactive/types';
import { assemblePlotly } from './assemble';
import Plotly from 'plotly.js-dist-min';

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

export function createPlotlyInteractiveRenderer(): InteractiveRendererAdapter {
    return {
        async mount(container, input) {
            const plannedFigure = assemblePlotly(input) as any;
            const viewports = (plannedFigure._viewports ?? []) as CategoryViewport[];
            const initialFigure = viewports.length > 0
                ? assemblePlotly(windowedInput(input, viewports, {})) as any
                : plannedFigure;
            await Plotly.newPlot(container, initialFigure.data ?? [], initialFigure.layout ?? {}, {
                displayModeBar: false,
                responsive: false,
            });

            let destroyed = false;
            let running = false;
            let updateTimer: number | undefined;
            let requestedVersion = 0;
            let appliedVersion = 0;
            let latestStarts: ViewportState = {};

            const schedule = (): void => {
                if (destroyed || running || updateTimer !== undefined) return;
                updateTimer = window.setTimeout(() => {
                    updateTimer = undefined;
                    if (destroyed) return;
                    const version = requestedVersion;
                    const figure = assemblePlotly(windowedInput(input, viewports, latestStarts));
                    running = true;
                    void Plotly.react(container, figure.data ?? [], figure.layout ?? {}, {
                        displayModeBar: false,
                        responsive: false,
                    }).finally(() => {
                        running = false;
                        appliedVersion = version;
                        if (requestedVersion !== appliedVersion) schedule();
                    });
                }, 0);
            };

            return {
                viewports,
                getViewportGeometry(channel) {
                    const axis = (container as any)._fullLayout?.[`${channel}axis`];
                    if (!axis || !Number.isFinite(axis._offset) || !Number.isFinite(axis._length)) return undefined;
                    return { offset: axis._offset, extent: axis._length };
                },
                setViewports(starts) {
                    latestStarts = { ...starts };
                    requestedVersion += 1;
                    schedule();
                },
                resize() {
                    void Plotly.Plots.resize(container);
                },
                destroy() {
                    if (destroyed) return;
                    destroyed = true;
                    if (updateTimer !== undefined) window.clearTimeout(updateTimer);
                    Plotly.purge(container);
                    container.replaceChildren();
                },
            };
        },
    };
}