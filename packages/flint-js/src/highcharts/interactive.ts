import Highcharts from 'highcharts';
import { applyCategoryViewports } from '../core/filter-overflow';
import type { CategoryViewport, ChartAssemblyInput } from '../core/types';
import type { InteractiveRendererAdapter, ViewportState } from '../interactive/types';
import type { ChartUpdate, ChartUpdateResult } from '../interactive/language/updates';
import type { SemanticElement } from '../core/interaction-contracts';
import { assembleHighcharts } from './assemble';

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

interface ActiveSelection {
    series: number;
    point: number;
}

const DIM_OPACITY = 0.15;

export function createHighchartsInteractiveRenderer(): InteractiveRendererAdapter {
    return {
        async mount(container, input) {
            const plannedOption = assembleHighcharts(input) as any;
            const viewports = (plannedOption._viewports ?? []) as CategoryViewport[];
            const initialOption = viewports.length > 0
                ? assembleHighcharts(windowedInput(input, viewports, {})) as any
                : plannedOption;

            const wrapper = document.createElement('div');
            wrapper.style.position = 'relative';
            wrapper.style.width = Number.isFinite(initialOption._width) ? `${initialOption._width}px` : '100%';
            wrapper.style.height = `${Number.isFinite(initialOption._height) ? initialOption._height : 320}px`;
            wrapper.style.maxWidth = '100%';
            container.append(wrapper);

            let activeSelection: ActiveSelection | null = null;
            let currentChart: Highcharts.Chart | null = null;
            let destroyed = false;
            let updateTimer: number | undefined;
            let latestStarts: ViewportState = {};
            let lastOptionJson = '';

            const applyVisualStates = (): void => {
                if (!currentChart) return;
                currentChart.series.forEach((series, seriesIndex) => {
                    const points = (series.points ?? []) as Array<Highcharts.Point & {
                        graphic?: { attr: (attributes: Record<string, unknown>) => void };
                    }>;
                    const seriesOpacity = activeSelection
                        ? (seriesIndex === activeSelection.series ? 1 : DIM_OPACITY)
                        : 1;
                    points.forEach((point) => {
                        if (point.graphic && typeof point.graphic.attr === 'function') {
                            point.graphic.attr({ opacity: seriesOpacity });
                        }
                    });
                    const parts = [
                        (series as { graph?: { attr: (a: Record<string, unknown>) => void } }).graph,
                        (series as { area?: { attr: (a: Record<string, unknown>) => void } }).area,
                    ];
                    parts.forEach((part) => {
                        if (part && typeof part.attr === 'function') {
                            part.attr({ opacity: seriesOpacity });
                        }
                    });
                });
            };

            const draw = (option: any): void => {
                const optionJson = JSON.stringify(option);
                if (optionJson === lastOptionJson && currentChart && !destroyed) return;
                const isFirstDraw = !currentChart || lastOptionJson === '';
                lastOptionJson = optionJson;
                if (isFirstDraw) {
                    wrapper.innerHTML = '';
                }
                if (currentChart && !destroyed) {
                    try {
                        currentChart.destroy();
                    } catch {
                        // ignore teardown errors
                    }
                    currentChart = null;
                }
                const el = document.createElement('div');
                el.style.width = '100%';
                el.style.height = '100%';
                if (!isFirstDraw) {
                    const oldContainers = wrapper.querySelectorAll('[data-highcharts-chart]');
                    oldContainers.forEach(c => c.remove());
                }
                wrapper.append(el);

                const plotOptions = option?.plotOptions ?? {};
                option = {
                    ...option,
                    plotOptions: {
                        ...plotOptions,
                        series: {
                            ...(plotOptions.series ?? {}),
                            cursor: 'pointer',
                            states: {
                                ...(plotOptions.series?.states ?? {}),
                                inactive: { enabled: false },
                            },
                            point: {
                                ...(plotOptions.series?.point ?? {}),
                                events: {
                                    ...(plotOptions.series?.point?.events ?? {}),
                                    click: function (this: Highcharts.Point) {
                                        const point = this as Highcharts.Point;
                                        const seriesIndex = point.series?.index ?? 0;
                                        const pointIndex = point.index ?? -1;

                                        if (activeSelection && activeSelection.series === seriesIndex) {
                                            activeSelection = null;
                                        } else {
                                            activeSelection = { series: seriesIndex, point: pointIndex };
                                        }
                                        applyVisualStates();
                                    },
                                    mouseOver: function () {
                                        applyVisualStates();
                                    },
                                    mouseOut: function () {
                                        window.setTimeout(applyVisualStates, 0);
                                    },
                                },
                            },
                        },
                    },
                };

                currentChart = Highcharts.chart(el, {
                    ...option,
                    chart: {
                        ...(option?.chart ?? {}),
                        animation: false,
                    },
                });

                applyVisualStates();
            };

            draw(initialOption);

            const schedule = (): void => {
                if (destroyed || updateTimer !== undefined) return;
                updateTimer = window.setTimeout(() => {
                    updateTimer = undefined;
                    if (destroyed) return;
                    const option = assembleHighcharts(windowedInput(input, viewports, latestStarts)) as any;
                    draw(option);
                }, 0);
            };

            return {
                viewports,
                getViewportGeometry(channel) {
                    const plot = wrapper.firstElementChild as HTMLElement | null;
                    if (!plot) return undefined;
                    const rect = plot.getBoundingClientRect();
                    return channel === 'x'
                        ? { offset: rect.left, extent: rect.width }
                        : { offset: rect.top, extent: rect.height };
                },
                getInteractionContext() {
                    const selected: SemanticElement[] = [];
                    if (activeSelection && currentChart) {
                        const series = currentChart.series?.[activeSelection.series];
                        const point = series?.points?.[activeSelection.point];
                        if (point?.options && typeof point.options === 'object') {
                            const row = { ...(point.options as Record<string, unknown>) };
                            delete row._seriesIndex;
                            selected.push({ value: row, records: [row] });
                        }
                    }
                    return {
                        chartType: input.chart_spec.chartType,
                        selected,
                    };
                },
                async applyUpdate(update: ChartUpdate): Promise<ChartUpdateResult> {
                    const vpChange = extractViewportChange(update);
                    if (vpChange) {
                        const starts: ViewportState = {};
                        if (vpChange.value.x) {
                            starts.x = vpChange.value.x.min;
                        }
                        if (vpChange.value.y) {
                            starts.y = vpChange.value.y.min;
                        }
                        latestStarts = starts;
                        schedule();
                        return { status: 'applied', resolvedTargets: 1, unresolvedTargets: [], unsupportedOps: [] };
                    }
                    return {
                        status: 'unsupported' as const,
                        resolvedTargets: 0,
                        unresolvedTargets: [],
                        unsupportedOps: [...new Set(update.ops.map((op) => op.op))],
                    };
                },
                async setUpdates(updates): Promise<ChartUpdateResult[]> {
                    return updates.map(() => ({
                        status: 'unsupported' as const,
                        resolvedTargets: 0,
                        unresolvedTargets: [],
                        unsupportedOps: [],
                    }));
                },
                async clearUpdate() {},
                setViewports(starts) {
                    latestStarts = { ...starts };
                    schedule();
                },
                resize(size) {
                    wrapper.style.width = `${size.width}px`;
                    wrapper.style.height = `${size.height}px`;
                },
                destroy() {
                    if (destroyed) return;
                    destroyed = true;
                    if (updateTimer !== undefined) window.clearTimeout(updateTimer);
                    if (currentChart) {
                        try {
                            currentChart.destroy();
                        } catch {
                            // ignore teardown errors
                        }
                        currentChart = null;
                    }
                    wrapper.remove();
                },
            };
        },
    };
}

interface ViewportChange {
    axes: 'x' | 'y' | 'xy';
    value: { x?: { min: number; max: number }; y?: { min: number; max: number } };
}

function extractViewportChange(update: { ops: readonly unknown[] }): ViewportChange | null {
    for (const op of update.ops as Array<{ op: string; axes?: 'x' | 'y' | 'xy'; value?: unknown }>) {
        if (op.op === 'set-viewport' && op.value) {
            return {
                axes: op.axes ?? 'xy',
                value: op.value as ViewportChange['value'],
            };
        }
    }
    return null;
}
