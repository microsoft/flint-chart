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

const FACET_GAP = 16;

const finite = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function box(style: Partial<CSSStyleDeclaration>, text?: string): HTMLDivElement {
    const element = document.createElement('div');
    Object.assign(element.style, style);
    if (text !== undefined) element.textContent = text;
    return element;
}

/**
 * A faceted config holds one Chart.js config per panel: Chart.js draws one chart per canvas,
 * so the grid, its headers and the shared legend are laid out here at the designed size.
 */
function mountFacetGrid(container: HTMLElement, config: any): Chart[] {
    const panelRows: any[][] = config._facetPanels ?? [];
    const flat = panelRows.flat();
    const reference = flat[0]?.config;
    const panelHeight = finite(reference?._height) ?? 240;
    const rows = finite(config._facetRows) ?? panelRows.length;
    const cols = finite(config._facetCols) ?? Math.max(1, ...panelRows.map((row) => row.length));
    const hasColHeader = flat.some((panel) => panel?.colHeader != null);
    const hasRowHeader = flat.some((panel) => panel?.rowHeader != null);
    const colHeaderHeight = hasColHeader ? 22 : 0;
    const rowHeaderWidth = hasRowHeader ? 28 : 0;
    const axisGutter = finite(config._facetAxisGutter) ?? 0;
    // Wrapped column-only facets repeat the column-header band above each row.
    const headerPerRow = !!config._facetColHeaderPerRow;
    // The leftmost column carries the shared y-axis, so columns differ in width.
    const colWidths = Array.from({ length: cols }, (_, column) =>
        finite(panelRows[0]?.[column]?.config?._width) ?? finite(reference?._width) ?? 300);
    const colLefts: number[] = [];
    let left = rowHeaderWidth;
    for (const width of colWidths) {
        colLefts.push(left);
        left += width + FACET_GAP;
    }
    const bodyWidth = rowHeaderWidth + colWidths.reduce((sum, width) => sum + width, 0) + (cols - 1) * FACET_GAP;
    const rowBlock = headerPerRow ? colHeaderHeight + panelHeight : panelHeight;
    const panelTop = (row: number) => (headerPerRow
        ? row * (rowBlock + FACET_GAP) + colHeaderHeight
        : colHeaderHeight + row * (panelHeight + FACET_GAP));
    const headerTop = (row: number) => (headerPerRow ? row * (rowBlock + FACET_GAP) : 0);
    const bodyHeight = headerPerRow
        ? rows * rowBlock + (rows - 1) * FACET_GAP
        : colHeaderHeight + rows * panelHeight + (rows - 1) * FACET_GAP;
    const sharedY = config._facetSharedYDomain as { min: number; max: number } | undefined;
    const legend = (config._facetLegend ?? []) as { label: string; color: string }[];

    const root = box({ width: `${bodyWidth}px`, fontSize: '11px', color: '#444' });
    if (legend.length > 0) {
        const legendRow = box({
            display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 14px', marginBottom: '8px',
        });
        for (const item of legend) {
            const entry = box({ display: 'inline-flex', alignItems: 'center', gap: '5px' }, item.label);
            entry.prepend(box({ width: '10px', height: '10px', borderRadius: '2px', background: item.color }));
            legendRow.append(entry);
        }
        root.append(legendRow);
    }
    const body = box({ position: 'relative', width: `${bodyWidth}px`, height: `${bodyHeight}px` });
    const header = { display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', position: 'absolute' };
    if (hasColHeader) {
        (headerPerRow ? panelRows : [panelRows[0] ?? []]).forEach((rowPanels, row) => rowPanels.forEach((panel, column) => {
            const gutter = column === 0 ? axisGutter : 0;
            body.append(box({
                ...header, left: `${colLefts[column] + gutter}px`, top: `${headerTop(row)}px`,
                width: `${colWidths[column] - gutter}px`, height: `${colHeaderHeight}px`,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }, String(panel?.colHeader ?? '')));
        }));
    }
    if (hasRowHeader) {
        for (let row = 0; row < rows; row += 1) {
            body.append(box({
                ...header, left: '0', top: `${panelTop(row)}px`, width: `${rowHeaderWidth}px`, height: `${panelHeight}px`,
                writingMode: 'vertical-rl', transform: 'rotate(180deg)',
            }, String(panelRows[row]?.[0]?.rowHeader ?? '')));
        }
    }
    const charts: Chart[] = [];
    for (const panel of flat) {
        const y: any = { ...(panel.config?.options?.scales?.y ?? {}) };
        // Small multiples share one value scale; the assembler leaves applying it to the renderer.
        if (sharedY) Object.assign(y, { min: sharedY.min, max: sharedY.max });
        // The leftmost y-axis keeps the gutter width, so every plot area lines up.
        if (panel.colIndex === 0 && axisGutter > 0) y.afterFit = (scale: { width: number }) => { scale.width = axisGutter; };
        const frame = box({
            position: 'absolute', left: `${colLefts[panel.colIndex]}px`, top: `${panelTop(panel.rowIndex)}px`,
            width: `${colWidths[panel.colIndex]}px`, height: `${panelHeight}px`,
        });
        const canvas = document.createElement('canvas');
        frame.append(canvas);
        body.append(frame);
        charts.push(new Chart(canvas, renderConfig({
            ...panel.config,
            options: { ...(panel.config?.options ?? {}), scales: { ...(panel.config?.options?.scales ?? {}), y } },
        })));
    }
    root.append(body);
    container.append(root);
    return charts;
}

export function createChartjsInteractiveRenderer(): InteractiveRendererAdapter {
    return {
        async mount(container, input) {
            const plannedConfig = assembleChartjs(input) as any;
            if (plannedConfig._facet) {
                const charts = mountFacetGrid(container, plannedConfig);
                return {
                    viewports: [],
                    setViewports() { /* a facet grid has no category windows */ },
                    destroy() {
                        for (const chart of charts) chart.destroy();
                        container.replaceChildren();
                    },
                };
            }
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