import { applyCategoryViewports } from '../core/filter-overflow';
import type { CategoryViewport, ChartAssemblyInput } from '../core/types';
import type { InteractiveRendererAdapter, ViewportState } from '../interactive/types';
import { assembleECharts } from './assemble';
import * as echarts from 'echarts';

export interface EChartsInteractiveRendererOptions {
    renderer?: 'canvas' | 'svg';
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

export function createEChartsInteractiveRenderer(
    options: EChartsInteractiveRendererOptions = {},
): InteractiveRendererAdapter {
    return {
        async mount(container, input) {
            const plannedOption = assembleECharts(input) as any;
            const viewports = (plannedOption._viewports ?? []) as CategoryViewport[];
            const initialOption = viewports.length > 0
                ? assembleECharts(windowedInput(input, viewports, {})) as any
                : plannedOption;
            const chart = echarts.init(container, undefined, {
                renderer: options.renderer ?? 'canvas',
                width: initialOption._width,
                height: initialOption._height,
            });
            chart.setOption(initialOption, { notMerge: true });

            let destroyed = false;
            let updateTimer: number | undefined;
            let latestStarts: ViewportState = {};

            const schedule = (): void => {
                if (destroyed || updateTimer !== undefined) return;
                updateTimer = window.setTimeout(() => {
                    updateTimer = undefined;
                    if (destroyed) return;
                    const option = assembleECharts(windowedInput(input, viewports, latestStarts));
                    chart.setOption(option, { notMerge: true });
                }, 0);
            };

            return {
                viewports,
                getViewportGeometry(channel) {
                    const grid = (chart as any).getModel().getComponent('grid');
                    const rect = grid?.coordinateSystem?.getRect?.();
                    if (!rect) return undefined;
                    return channel === 'x'
                        ? { offset: rect.x, extent: rect.width }
                        : { offset: rect.y, extent: rect.height };
                },
                setViewports(starts) {
                    latestStarts = { ...starts };
                    schedule();
                },
                resize(size) {
                    chart.resize(size);
                },
                destroy() {
                    if (destroyed) return;
                    destroyed = true;
                    if (updateTimer !== undefined) window.clearTimeout(updateTimer);
                    chart.dispose();
                    container.replaceChildren();
                },
            };
        },
    };
}