import { applyCategoryViewports } from '../core/filter-overflow';
import type { CategoryViewport, ChartAssemblyInput } from '../core/types';
import type { InteractiveRendererAdapter, ViewportState } from '../interactive/types';
import { assembleChartjs } from './assemble';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

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

function renderConfig(config: any): any {
    return {
        ...config,
        options: {
            ...(config.options ?? {}),
            responsive: true,
            maintainAspectRatio: false,
        },
    };
}

export function createChartjsInteractiveRenderer(): InteractiveRendererAdapter {
    return {
        async mount(container, input) {
            const plannedConfig = assembleChartjs(input) as any;
            const viewports = (plannedConfig._viewports ?? []) as CategoryViewport[];
            const initialConfig = viewports.length > 0
                ? assembleChartjs(windowedInput(input, viewports, {})) as any
                : plannedConfig;
            const wrapper = document.createElement('div');
            const canvas = document.createElement('canvas');
            wrapper.style.position = 'relative';
            wrapper.style.width = Number.isFinite(initialConfig._width) ? `${initialConfig._width}px` : '100%';
            wrapper.style.height = `${Number.isFinite(initialConfig._height) ? initialConfig._height : 320}px`;
            wrapper.style.maxWidth = '100%';
            wrapper.append(canvas);
            container.append(wrapper);
            const chart = new Chart(canvas, renderConfig(initialConfig));

            let destroyed = false;
            let updateTimer: number | undefined;
            let latestStarts: ViewportState = {};

            const schedule = (): void => {
                if (destroyed || updateTimer !== undefined) return;
                updateTimer = window.setTimeout(() => {
                    updateTimer = undefined;
                    if (destroyed) return;
                    const config = renderConfig(assembleChartjs(windowedInput(input, viewports, latestStarts)));
                    chart.data = config.data;
                    chart.options = config.options;
                    chart.update('none');
                }, 0);
            };

            return {
                viewports,
                getViewportGeometry(channel) {
                    const area = chart.chartArea;
                    return channel === 'x'
                        ? { offset: area.left, extent: area.right - area.left }
                        : { offset: area.top, extent: area.bottom - area.top };
                },
                setViewports(starts) {
                    latestStarts = { ...starts };
                    schedule();
                },
                resize(size) {
                    wrapper.style.width = `${size.width}px`;
                    wrapper.style.height = `${size.height}px`;
                    chart.resize(size.width, size.height);
                },
                destroy() {
                    if (destroyed) return;
                    destroyed = true;
                    if (updateTimer !== undefined) window.clearTimeout(updateTimer);
                    chart.destroy();
                    container.replaceChildren();
                },
            };
        },
    };
}