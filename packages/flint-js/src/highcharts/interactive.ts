import Highcharts from 'highcharts';
import highchartsMore from 'highcharts/highcharts-more';
import heatmapModule from 'highcharts/modules/heatmap';
import sunburstModule from 'highcharts/modules/sunburst';
import { applyCategoryViewports } from '../core/filter-overflow';
import type { CategoryViewport, ChartAssemblyInput } from '../core/types';
import type { InteractiveRendererAdapter, ViewportState } from '../interactive/types';
import type { ChartUpdate, ChartUpdateResult } from '../interactive/language/updates';
import type { SemanticElement } from '../core/interaction-contracts';
import { assembleHighcharts } from './assemble';

function initModule(mod: any) {
    if (typeof mod === 'function') {
        mod(Highcharts);
    } else if (mod && typeof mod.default === 'function') {
        mod.default(Highcharts);
    }
}
initModule(highchartsMore);
initModule(heatmapModule);
initModule(sunburstModule);

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

export interface HighchartsRendererOptions {
    interactions?: any[];
}

export function createHighchartsInteractiveRenderer(rendererOptions?: HighchartsRendererOptions): InteractiveRendererAdapter {
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
            let currentCharts: Highcharts.Chart[] = [];
            let destroyed = false;
            let updateTimer: number | undefined;
            let latestStarts: ViewportState = {};
            let lastOptionJson = '';

            const highlightDef = rendererOptions?.interactions?.find(
                (it: any) => it.id === 'click-highlight' || it.eventSource?.type === 'click' || it.affordances?.selection,
            );
            const dimOpacity = typeof highlightDef?.options?.dimOpacity === 'number'
                ? highlightDef.options.dimOpacity
                : DIM_OPACITY;

            const applyVisualStates = (): void => {
                for (const chart of currentCharts) {
                    chart.series.forEach((series, seriesIndex) => {
                        const points = (series.points ?? []) as Array<Highcharts.Point & {
                            graphic?: { attr: (attributes: Record<string, unknown>) => void };
                        }>;
                        const seriesOpacity = activeSelection
                            ? (seriesIndex === activeSelection.series ? 1 : dimOpacity)
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
                }
            };

            const draw = (option: any): void => {
                const optionJson = JSON.stringify(option);
                if (optionJson === lastOptionJson && currentCharts.length > 0 && !destroyed) return;
                lastOptionJson = optionJson;

                if (currentCharts.length > 0) {
                    for (const c of currentCharts) {
                        try {
                            c.destroy();
                        } catch {
                            // ignore teardown errors
                        }
                    }
                    currentCharts = [];
                }
                wrapper.replaceChildren();

                const isFaceted = option?._facet && Array.isArray(option?._facetPanels);

                const decorateOption = (panelOpt: any) => {
                    const plotOptions = panelOpt?.plotOptions ?? {};
                    const navInteraction = rendererOptions?.interactions?.find(
                        (it: any) => it.eventSource?.type === 'navigation' || it.id === 'navigate',
                    );
                    const navAxes = navInteraction?.options?.axes ?? 'x';
                    const allowZoom = navInteraction?.options?.zoom !== false;
                    const zoomType = (navInteraction && allowZoom)
                        ? (navAxes === 'xy' ? 'xy' : navAxes === 'y' ? 'y' : 'x')
                        : undefined;
                    return {
                        ...panelOpt,
                        chart: {
                            ...(panelOpt?.chart ?? {}),
                            animation: false,
                            ...(zoomType ? { zoomType, zooming: { type: zoomType } } : {}),
                        },
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
                };

                if (isFaceted) {
                    const grid = document.createElement('div');
                    const cols = option._facetCols ?? Math.max(1, ...option._facetPanels.map((r: any) => r.length));
                    grid.style.display = 'grid';
                    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
                    grid.style.gap = '16px';
                    grid.style.width = '100%';
                    wrapper.append(grid);

                    for (let ri = 0; ri < option._facetPanels.length; ri++) {
                        const row = option._facetPanels[ri];
                        for (let ci = 0; ci < row.length; ci++) {
                            const panel = row[ci];
                            const panelDiv = document.createElement('div');
                            panelDiv.style.minWidth = '0';
                            if (panel.colVal != null && panel.colVal !== '') {
                                const h = document.createElement('div');
                                h.style.fontSize = '11px';
                                h.style.fontWeight = '600';
                                h.style.color = '#555';
                                h.style.marginBottom = '2px';
                                h.textContent = panel.colVal;
                                panelDiv.append(h);
                            }
                            if (panel.rowVal != null && panel.rowVal !== '') {
                                const h = document.createElement('div');
                                h.style.fontSize = '11px';
                                h.style.fontWeight = '600';
                                h.style.color = '#555';
                                h.style.marginBottom = '2px';
                                h.textContent = panel.rowVal;
                                panelDiv.append(h);
                            }
                            const chartEl = document.createElement('div');
                            chartEl.style.width = '100%';
                            chartEl.style.height = `${Number.isFinite(panel.option?._height) ? panel.option._height : 300}px`;
                            panelDiv.append(chartEl);
                            grid.append(panelDiv);

                            const chart = Highcharts.chart(chartEl, decorateOption(panel.option));
                            currentCharts.push(chart);
                        }
                    }
                } else {
                    const el = document.createElement('div');
                    el.style.width = '100%';
                    el.style.height = '100%';
                    wrapper.append(el);
                    const chart = Highcharts.chart(el, decorateOption(option));
                    currentCharts.push(chart);
                }

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
                    const chart = currentCharts[0];
                    if (!chart || chart.plotLeft == null || chart.plotWidth == null) return undefined;
                    return channel === 'x'
                        ? { offset: chart.plotLeft, extent: chart.plotWidth }
                        : { offset: chart.plotTop, extent: chart.plotHeight };
                },
                getInteractionContext() {
                    const selected: SemanticElement[] = [];
                    if (activeSelection) {
                        for (const chart of currentCharts) {
                            const series = chart.series?.[activeSelection.series];
                            const point = series?.points?.[activeSelection.point];
                            if (point?.options && typeof point.options === 'object') {
                                const row = { ...(point.options as Record<string, unknown>) };
                                delete row._seriesIndex;
                                selected.push({ value: row, records: [row] });
                            }
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
                    for (const chart of currentCharts) {
                        try {
                            chart.destroy();
                        } catch {
                            // ignore teardown errors
                        }
                    }
                    currentCharts = [];
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

function parseAxisInterval(val: unknown): { min: number; max: number } | undefined {
    if (!val) return undefined;
    if (Array.isArray(val) && val.length >= 2) {
        return { min: Number(val[0]), max: Number(val[1]) };
    }
    if (typeof val === 'object' && 'min' in val && 'max' in val) {
        return { min: Number((val as any).min), max: Number((val as any).max) };
    }
    return undefined;
}

function extractViewportChange(update: { ops: readonly unknown[] }): ViewportChange | null {
    for (const op of update.ops as Array<{ op: string; axes?: 'x' | 'y' | 'xy'; value?: unknown }>) {
        if (op.op === 'set-viewport' && op.value && typeof op.value === 'object') {
            const rawVal = op.value as any;
            const x = parseAxisInterval(rawVal.x);
            const y = parseAxisInterval(rawVal.y);
            return {
                axes: op.axes ?? 'xy',
                value: { x, y },
            };
        }
    }
    return null;
}
