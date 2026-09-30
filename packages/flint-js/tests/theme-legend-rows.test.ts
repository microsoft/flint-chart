// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import { assembleVegaLite } from '../src';
import type { ThemeSpec } from '../src/core/theme/types';
import { vlWrapLegendText } from '../src/vegalite/instantiate-spec';

/**
 * A chart can need more than one key: one that names the colours and one that
 * measures the sizes. Laid side by side above the plot they eat the block
 * between them, and past a point the second is pushed against the first.
 *
 * Where they go is therefore a measurement, not a preference.
 */

const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        Country: `Country ${i}`,
        Region: ['Europe', 'Americas', 'Asia', 'Africa'][i % 4],
        GDP: 1000 * (i + 1),
        Life: 60 + i,
        Population: 10 * (i + 1),
    }));

const theme = (extra: Partial<ThemeSpec> = {}): ThemeSpec => ({
    id: 'house',
    label: 'House',
    ink: {
        surface: { canvas: '#ffffff' },
        series: { single: '#333333', categorical: ['#1', '#2', '#3', '#4'] },
    },
    legend: { show: 'always', placement: ['top'], direction: 'horizontal' },
    ...extra,
} as ThemeSpec);

function bubble(width: number, sizeField: string | null = 'Population'): any {
    return assembleVegaLite({
        data: { values: rows(8) },
        semantic_types: {
            Country: 'Country', Region: 'Category',
            GDP: 'Amount', Life: 'Quantity', Population: 'Quantity',
        },
        chart_spec: {
            chartType: 'Scatter Plot',
            title: 'Money buys years',
            encodings: {
                x: 'GDP',
                y: 'Life',
                color: 'Region',
                ...(sizeField ? { size: sizeField } : {}),
            },
            baseSize: { width, height: 240 },
        },
        theme_spec: theme(),
    } as any) as any;
}

const layoutOf = (spec: any) => spec.config?.legend?.layout;

describe('legend title and entry wrapping', () => {
    it.each([
        { width: 300, titleOrient: undefined, inline: true },
        { width: 80, titleOrient: undefined, inline: false },
        { width: 300, titleOrient: 'top', inline: false },
    ])('uses one bottom row when the title and entries fit (%j)', async ({ width, titleOrient, inline }) => {
        const table = [{ Type: 'actual' }, { Type: 'forecast' }];
        const spec: any = {
            width, height: 240, data: { values: table }, mark: 'point',
            encoding: { color: { field: 'Type', type: 'nominal',
                legend: { orient: 'bottom', ...(titleOrient ? { titleOrient } : {}) } } },
            config: { legend: { labelFontSize: 11, titleFontSize: 11 } },
        };
        vlWrapLegendText(spec, {
            canvasSize: { width, height: 240 }, layout: { legendFontSize: 11, titleFontSize: 11 },
            channelSemantics: {}, table,
        } as any);
        expect(spec.encoding.color.legend.titleOrient === 'left').toBe(inline);
        expect(spec.width).toBe(width);
        if (titleOrient) expect(spec.encoding.color.legend.titleOrient).toBe(titleOrient);
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        try {
            await view.runAsync();
            const labels: any[] = [];
            const titles: any[] = [];
            const visit = (item: any, offset = { x: 0, y: 0 }): void => {
                const box = item.bounds ? {
                    text: item.text, x1: offset.x + item.bounds.x1, x2: offset.x + item.bounds.x2,
                    y1: offset.y + item.bounds.y1, y2: offset.y + item.bounds.y2,
                } : undefined;
                if (item.mark?.role === 'legend-label') labels.push(box);
                if (item.mark?.role === 'legend-title') titles.push(box);
                const childOffset = item.mark?.marktype === 'group'
                    ? { x: offset.x + (item.x ?? 0), y: offset.y + (item.y ?? 0) } : offset;
                for (const child of item.items ?? []) visit(child, childOffset);
            };
            visit((view.scenegraph() as any).root);
            expect(labels).toHaveLength(2);
            expect(titles).toHaveLength(1);
            if (inline) {
                expect(labels.map(label => label.text)).toEqual(['actual', 'forecast']);
                for (const label of labels) {
                    expect(label.x1).toBeGreaterThan(titles[0].x2);
                    expect(Math.min(label.y2, titles[0].y2) - Math.max(label.y1, titles[0].y1)).toBeGreaterThan(0);
                }
                expect(labels[0].y1).toBeCloseTo(labels[1].y1);
                expect(labels[0].x2).toBeLessThan(labels[1].x1);
            }
        } finally {
            view.finalize();
        }
    });

    it.each(['Pie Chart', 'Donut Chart'])('keeps the Power BI key near the %s rim', async (chartType) => {
        const spec: any = assembleVegaLite({
            data: { values: [103, 215, 342, 560].map((Value, index) => ({ Category: `Category ${index}`, Value })) },
            semantic_types: { Category: 'Category', Value: 'Quantity' },
            chart_spec: { chartType, encodings: { color: 'Category', size: 'Value' } },
            theme_spec: 'powerbi',
        });
        expect(spec.width).toBe(280);
        expect(spec.height).toBe(280);
        expect(spec._legendLayout.plotWidth).toBe(280);
        expect(spec._legendLayout.legends[0].orient).toBe('right');
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        try {
            await view.runAsync();
            const arcs: any[] = [];
            const legends: any[] = [];
            const visit = (item: any): void => {
                if (item.mark?.marktype === 'arc') arcs.push(item);
                if (item.mark?.role === 'legend') legends.push(item);
                for (const child of item.items ?? []) visit(child);
            };
            visit((view.scenegraph() as any).root);
            expect(arcs).toHaveLength(4);
            expect(legends).toHaveLength(1);
            expect(arcs[0].outerRadius).toBe(90);
            expect(arcs[0].innerRadius).toBe(chartType === 'Donut Chart' ? 50 : 0);
            const gap = legends[0].x - Math.max(...arcs.map(arc => arc.x + arc.outerRadius));
            expect(gap).toBeGreaterThanOrEqual(12);
            expect(gap).toBeLessThanOrEqual(80);
        } finally {
            view.finalize();
        }
    });

    it.each(['nyt', 'economist'])('moves a tall %s horizontal key to the side unless pinned', async (preset) => {
        const table = rows(16).map((row, index) => ({ ...row,
            Country: index % 2 ? row.Country : `${row.Country} Olympic delegation at Paris 2024`,
        }));
        for (const pinned of [false, true]) {
            const spec: any = assembleVegaLite({
                data: { values: table },
                semantic_types: { Country: 'Category', GDP: 'Quantity', Life: 'Quantity' },
                chart_spec: {
                    chartType: 'Scatter Plot', baseSize: { width: 280, height: 320 },
                    encodings: { x: 'GDP', y: 'Life', color: { field: 'Country',
                        ...(pinned ? { legend: { orient: 'top' } } : {}) } },
                },
                theme_spec: { extends: preset, ink: { series: {
                    categoricalExtended: rows(16).map((_, index) => `#${(0x100000 + index * 0x0f0f0f).toString(16)}`),
                } } },
            });
            expect(pinned ? ['top'] : ['left', 'right']).toContain(spec._legendLayout.legends[0].orient);
            const view = new View(parse(compile(spec).spec), { renderer: 'none' });
            try {
                await view.runAsync();
                const labels: string[] = [];
                const visit = (item: any): void => {
                    if (item.mark?.role === 'legend-label') labels.push(item.datum.value);
                    for (const child of item.items ?? []) visit(child);
                };
                visit((view.scenegraph() as any).root);
                expect(labels.sort()).toEqual(table.map(row => row.Country).sort());
            } finally {
                view.finalize();
            }
        }
    });

    it.each([80, 480])('shrinks label width and lowers the line cap only for height (plot width %s)', async (width) => {
        const longLabel = 'United States of America Olympic delegation competing at the Paris 2024 Summer Olympic Games';
        const data = [longLabel, 'China', 'Japan', 'France'].map(Country => ({ Country }));
        for (const height of [240, 108, 95, 60]) {
            const spec: any = { width, height, data: { values: data }, mark: 'point',
                encoding: { color: { field: 'Country', type: 'nominal',
                    legend: { orient: 'right', columns: 1, labelFontSize: 10 } } } };
            vlWrapLegendText(spec, {
                canvasSize: { width, height }, layout: { legendFontSize: 10, titleFontSize: 11 },
                channelSemantics: {}, table: data,
            } as any);
            expect(spec.width).toBe(width);
            expect(spec.height).toBe(height);
            expect(spec.encoding.color.legend.labelFontSize).toBe(10);
            const view = new View(parse(compile(spec).spec), { renderer: 'none' });
            try {
                await view.runAsync();
                const labels: any[] = [];
                const visit = (item: any): void => {
                    if (item.mark?.role === 'legend-label') labels.push(item);
                    for (const child of item.items ?? []) visit(child);
                };
                visit((view.scenegraph() as any).root);
                expect(labels).toHaveLength(4);
                const outlier = labels.find(item => item.datum.value === longLabel);
                expect(outlier.tooltip).toBe(longLabel);
                expect(outlier.description).toBe(longLabel);
                if (height === 240) {
                    expect(outlier.text).toHaveLength(3);
                    expect(outlier.text.join(' ')).toBe(longLabel);
                    expect(spec.encoding.color.legend.labelLimit).toBe(0);
                } else if (height === 108) {
                    expect(outlier.text).toHaveLength(2);
                } else {
                    expect(Array.isArray(outlier.text) ? outlier.text.length : 1).toBe(1);
                    expect(spec.encoding.color.legend.labelLimit).toBeGreaterThan(0);
                    expect(await view.toSVG()).toContain('…');
                }
                expect(spec._legendLayout.legends[0].width).toBeLessThanOrEqual(254);
                if (height >= 95) expect(spec._legendLayout.legends[0].height).toBeLessThanOrEqual(height);
                else expect(spec._legendLayout.overflow).toHaveLength(1);
                for (const label of labels.filter(item => item !== outlier)) {
                    expect(Array.isArray(label.text) ? label.text.join(' ') : label.text).toBe(label.datum.value);
                }
            } finally {
                view.finalize();
            }
        }
    });

    it.each([80, 480])('does not wrap two ordinary country names just to narrow the legend (plot width %s)', async (width) => {
        const table = ['United States of America', 'Japan', "People's Republic of China", 'France']
            .map(Country => ({ Country }));
        const spec: any = { width, height: 320, data: { values: table }, mark: 'point',
            encoding: { color: { field: 'Country', type: 'nominal', legend: { orient: 'right' } } } };
        vlWrapLegendText(spec, {
            canvasSize: { width, height: 320 }, layout: { legendFontSize: 10, titleFontSize: 11 },
            channelSemantics: {}, table,
        } as any);
        expect(spec.encoding.color.legend.labelExpr).toBeUndefined();
        expect(spec.encoding.color.legend.labelLimit).toBe(0);
        expect(spec.encoding.color.legend.labelFontSize).toBe(10);
        expect(spec.width).toBe(width);
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        try {
            await view.runAsync();
            const labels: any[] = [];
            const visit = (item: any): void => {
                if (item.mark?.role === 'legend-label') labels.push(item.text);
                for (const child of item.items ?? []) visit(child);
            };
            visit((view.scenegraph() as any).root);
            expect(labels.sort()).toEqual(table.map(row => row.Country).sort());
        } finally {
            view.finalize();
        }
    });

    it.each(['right', 'bottom'])('packs words into the width and ellipsizes the remainder after three lines (%s)', async (orient) => {
        const text = Array.from({ length: 12 }, () => 'Team at the Paris Games').join(' ');
        const data = [{ Country: text }];
        const spec: any = { width: 120, height: 120, data: { values: data }, mark: 'point',
            encoding: { color: { field: 'Country', type: 'nominal', title: null,
                legend: { orient, columns: 1, labelFontSize: 10 } } } };
        vlWrapLegendText(spec, {
            canvasSize: { width: 120, height: 120 }, layout: { legendFontSize: 10, titleFontSize: 11 },
            channelSemantics: {}, table: data,
        } as any);
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        try {
            await view.runAsync();
            const labels: any[] = [];
            const visit = (item: any): void => {
                if (item.mark?.role === 'legend-label') labels.push(item);
                for (const child of item.items ?? []) visit(child);
            };
            visit((view.scenegraph() as any).root);
            expect(labels).toHaveLength(1);
            expect(labels[0].text).toHaveLength(3);
            expect(labels[0].text.join(' ')).toBe(text);
            expect(labels[0].tooltip).toBe(text);
            const limit = spec.encoding.color.legend.labelLimit;
            expect(limit).toBeGreaterThan(0);
            for (const line of labels[0].text.slice(0, 2)) expect(line.length * 10 * 0.62).toBeLessThanOrEqual(limit);
            expect(labels[0].text[2].length * 10 * 0.62).toBeGreaterThan(limit);
            expect(await view.toSVG()).toContain('…');
            expect(spec._legendLayout.legends[0].width).toBeLessThanOrEqual(orient === 'right' ? 254 : 120);
            expect(spec.width).toBe(120);
            expect(spec.height).toBe(120);
        } finally {
            view.finalize();
        }
    });

    it.each([{ width: 480, prefix: 'Team' }, { width: 600, prefix: 'Country' }])('fits a tall side key without dropping entries or stretching the plot ($prefix)', async ({ width, prefix }) => {
        const data = rows(32).map((row, index) => ({ ...row, Country: `${prefix} ${index + 1}` }));
        const spec: any = {
            width, height: 240, data: { values: data }, mark: 'circle',
            config: { legend: { labelFontSize: 10, titleFontSize: 11 } },
            encoding: {
                x: { field: 'GDP', type: 'quantitative' }, y: { field: 'Life', type: 'quantitative' },
                color: { field: 'Country', type: 'nominal', legend: { orient: 'right' } },
            },
        };
        vlWrapLegendText(spec, { canvasSize: { width, height: 240 },
            layout: { legendFontSize: 10, titleFontSize: 11, subplotHeight: 240 },
            channelSemantics: {}, table: data } as any);
        expect(spec.width).toBe(width);
        expect(spec.height).toBe(240);
        expect(spec.encoding.color.legend.columns).toBeGreaterThan(1);
        expect(spec.encoding.color.legend.labelFontSize).toBe(10);
        expect(spec._legendLayout.overflow).toEqual([]);
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        try {
            await view.runAsync();
            const labels: string[] = [];
            const heights: number[] = [];
            const visit = (item: any): void => {
                if (item.mark?.role === 'legend-label') labels.push(item.datum.value);
                if (item.mark?.role === 'legend') heights.push(item.bounds.y2 - item.bounds.y1);
                for (const child of item.items ?? []) visit(child);
            };
            visit((view.scenegraph() as any).root);
            expect(new Set(labels)).toEqual(new Set(data.map(row => row.Country)));
            expect(heights).toHaveLength(1);
            expect(heights[0]).toBeLessThanOrEqual(240);
        } finally {
            view.finalize();
        }
    });

    it('fits a full three-line inline title without resizing a narrow plot', () => {
        const labels = ['United States Olympic delegation', 'China', 'France Olympic delegation', 'Japan'];
        const context = {
            canvasSize: { width: 800, height: 320 },
            layout: { legendFontSize: 10, titleFontSize: 11 },
            channelSemantics: {}, table: labels.map(Country => ({ Country })),
        } as any;
        const makeSpec = (width: number): any => ({
            width,
            config: { legend: { orient: 'top', direction: 'horizontal', titleOrient: 'left', labelFontSize: 14,
                titleFontSize: 14, symbolSize: 144, columnPadding: 12, labelOffset: 6 } },
            encoding: { color: { field: 'Country', type: 'nominal', title: 'Olympic delegations by country' } },
        });
        const narrow = makeSpec(240);
        const wide = makeSpec(600);
        vlWrapLegendText(narrow, context);
        vlWrapLegendText(wide, context);
        expect(narrow.width).toBe(240);
        expect(wide.width).toBe(600);
        expect(narrow.encoding.color.legend.titleLimit).toBe(0);
        expect(narrow.encoding.color.legend.title).toHaveLength(3);
        expect(narrow.encoding.color.legend.title.join(' ')).toBe('Olympic delegations by country');
        expect(narrow._legendLayout.overflow).toEqual([]);
        expect(wide._legendLayout.overflow).toEqual([]);
    });

    it.each([false, true])('ellipsizes unbroken text without dropping entries or widening the plot (short peers: %s)', async (peers) => {
        const width = peers ? 480 : 90;
        const text = 'AnUnbrokenCategoryNameThatWillNotFitWithinTheMaximumLegendWidth';
        const table = [text, ...(peers ? ['China', 'Japan', 'France'] : [])].map(Country => ({ Country }));
        const spec: any = { width, data: { values: table }, mark: 'point',
            config: { legend: { orient: peers ? 'right' : 'bottom' } },
            encoding: { color: { field: 'Country', type: 'nominal', title: null } } };
        vlWrapLegendText(spec, {
            canvasSize: { width: 480, height: 320 }, layout: { legendFontSize: 10, titleFontSize: 11 },
            channelSemantics: {}, table,
        } as any);
        expect(spec.width).toBe(width);
        expect(spec.encoding.color.legend.labelLimit).toBeGreaterThan(0);
        expect(spec.encoding.color.legend.symbolLimit).toBe(0);
        expect(spec._legendLayout.overflow).toEqual([]);
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        try {
            await view.runAsync();
            const labels: any[] = [];
            const visit = (item: any): void => {
                if (item.mark?.role === 'legend-label') labels.push(item);
                for (const child of item.items ?? []) visit(child);
            };
            visit((view.scenegraph() as any).root);
            expect(labels.map(item => item.datum.value).sort()).toEqual(table.map(row => row.Country).sort());
            expect(labels.find(item => item.datum.value === text).tooltip).toBe(text);
            expect(await view.toSVG()).toContain('…');
        } finally {
            view.finalize();
        }
    });

    it('reflows a dense key without keeping the pre-wrap entry cap', async () => {
        const spec: any = assembleVegaLite({
            data: { values: rows(16).map((row, index) => ({ ...row,
                Country: index % 2 === 0 ? `${row.Country} Olympic delegation at Paris 2024` : row.Country,
            })) },
            semantic_types: { Country: 'Category', GDP: 'Quantity', Life: 'Quantity', Population: 'Quantity' },
            chart_spec: {
                chartType: 'Scatter Plot',
                encodings: { x: 'GDP', y: 'Life', color: 'Country', size: 'Population' },
                baseSize: { width: 480, height: 320 },
            },
        });
        const legend = spec.encoding.color.legend;
        expect(spec._legendLayout.legends).toHaveLength(2);
        expect(legend.columns ?? 1).toBeGreaterThanOrEqual(1);
        expect(legend.symbolLimit).toBe(0);
        expect(legend.labelFontSize ?? spec.config.legend.labelFontSize).toBeGreaterThanOrEqual(8);
        if (legend.labelExpr) expect(legend.labelBaseline).toBe('top');
        if (legend.clipHeight !== undefined) {
            expect(legend.clipHeight).toBeGreaterThanOrEqual(legend.labelFontSize + Math.ceil(legend.labelFontSize * 1.2) + 4);
        }
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        try {
            await view.runAsync();
            const positions: number[] = [];
            const visit = (item: any, offset: number): void => {
                if (item.mark?.role === 'legend-label' && String(item.datum.value).startsWith('Country ')) {
                    positions.push(offset + item.y);
                }
                const groupY = item.mark?.marktype === 'group' ? item.y ?? 0 : 0;
                for (const child of item.items ?? []) visit(child, offset + groupY);
            };
            visit((view.scenegraph() as any).root, 0);
            expect(positions).toHaveLength(16);
            for (let index = 0; index < positions.length; index++) {
                const columns = legend.columns ?? 16;
                expect(positions[index]).toBe(positions[Math.floor(index / columns) * columns]);
            }
        } finally {
            view.finalize();
        }
    });

    it.each(['right', 'left', 'top', 'bottom'])('aligns swatches with the first line and keeps compact rows (%s)', async (orient) => {
        const data = rows(6).map((row, index) => ({ ...row,
            Country: index % 3 === 2 ? row.Country : `${row.Country} Olympic delegation at Paris 2024`,
        }));
        const spec: any = {
            width: 320, height: 360, data: { values: data }, mark: 'circle',
            config: { legend: { labelFontSize: 10, titleFontSize: 11 } },
            encoding: {
                x: { field: 'GDP', type: 'quantitative' }, y: { field: 'Life', type: 'quantitative' },
                color: { field: 'Country', type: 'nominal', legend: { orient, columns: orient === 'top' || orient === 'bottom' ? 2 : 1 } },
            },
        };
        vlWrapLegendText(spec, { canvasSize: { width: 480, height: 320 },
            layout: { legendFontSize: 10, titleFontSize: 11 }, channelSemantics: {}, table: data } as any);
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        try {
            await view.runAsync();
            const labels: any[] = [];
            const symbols = new Map<string, number>();
            const visit = (item: any, offset = 0): void => {
                if (item.mark?.role === 'legend-label') labels.push({ item, top: offset + item.bounds.y1, bottom: offset + item.bounds.y2 });
                if (item.mark?.role === 'legend-symbol') symbols.set(item.datum.value, offset + item.y);
                const childOffset = offset + (item.mark?.marktype === 'group' ? item.y ?? 0 : 0);
                for (const child of item.items ?? []) visit(child, childOffset);
            };
            visit((view.scenegraph() as any).root);
            expect(labels).toHaveLength(data.length);
            expect(labels.some(label => label.item.text.length === 2)).toBe(true);
            for (const label of labels) {
                const extraHeight = Array.isArray(label.item.text) ? (label.item.text.length - 1) * label.item.lineHeight : 0;
                expect(Math.abs((label.top + label.bottom - extraHeight) / 2 - symbols.get(label.item.datum.value)!)).toBeLessThanOrEqual(1);
            }
            if (orient === 'left' || orient === 'right') {
                const extent = Math.max(...labels.map(label => label.bottom)) - Math.min(...labels.map(label => label.top));
                const textHeight = labels.reduce((sum, label) => sum + label.bottom - label.top, 0);
                expect(extent - textHeight).toBeLessThanOrEqual((labels.length - 1) * 8);
                expect(spec.encoding.color.legend.clipHeight).toBeUndefined();
            }
            const rowCenters = [...new Set(symbols.values())].sort((first, second) => first - second);
            for (let index = 1; index < rowCenters.length; index++) {
                const previous = labels.filter(label => symbols.get(label.item.datum.value) === rowCenters[index - 1]);
                const current = labels.filter(label => symbols.get(label.item.datum.value) === rowCenters[index]);
                expect(Math.min(...current.map(label => label.top)) - Math.max(...previous.map(label => label.bottom)))
                    .toBeGreaterThanOrEqual(6 - 1e-6);
            }
        } finally {
            view.finalize();
        }
    });

    it.each([undefined, 'powerbi'])('fits both keys while preserving the full size title (%s)', async (preset) => {
        const data = rows(8).map((row, index) => ({
            ...row,
            Country: index % 4 === 0 ? `${row.Country} Olympic delegation at Paris 2024` : row.Country,
        }));
        const title = 'Total gold, silver and bronze medals at the Paris Olympic Games';
        const spec: any = assembleVegaLite({
            data: { values: data },
            semantic_types: { Country: 'Category', GDP: 'Quantity', Life: 'Quantity', Population: 'Quantity' },
            field_display_names: { Population: title },
            theme_spec: preset,
            chart_spec: {
                chartType: 'Scatter Plot',
                encodings: { x: 'GDP', y: 'Life', color: 'Country', size: 'Population' },
                baseSize: { width: 480, height: 320 },
            },
        });
        expect(spec.encoding.color.legend.labelExpr).toBeDefined();
        const fittedTitle = spec.encoding.size.legend.title ?? spec.encoding.size.title ?? spec.encoding.size.field;
        expect(Array.isArray(fittedTitle) ? fittedTitle.join(' ') : fittedTitle).toBe(title);
        expect(spec.encoding.size.legend.titleLimit).toBe(spec.encoding.color.legend.labelLimit);
        expect(spec.data.values.map((row: any) => row.Country)).toEqual(data.map(row => row.Country));
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        try {
            await view.runAsync();
            const svg = await view.toSVG();
            expect(svg).toContain('<tspan');
            const legendItems: any[] = [];
            const visit = (item: any): void => {
                if (['legend-label', 'legend-title'].includes(item.mark?.role)) legendItems.push(item);
                for (const child of item.items ?? []) visit(child);
            };
            visit((view.scenegraph() as any).root);
            expect(legendItems.filter(item => item.mark.role === 'legend-label'
                && Array.isArray(item.text) && item.text.length > 1)).toHaveLength(2);
            expect(legendItems.some(item => item.mark.role === 'legend-title'
                && (Array.isArray(item.text) ? item.text.join(' ') : item.text) === title)).toBe(true);
        } finally {
            view.finalize();
        }
    });

    it('preserves authored limits, expressions, hidden legends and explicit title lines', () => {
        const title = 'A very long legend title that would otherwise need wrapping';
        const spec: any = {
            layer: [
                { encoding: { color: { field: 'Country', type: 'nominal', legend: null } } },
                { encoding: { color: { field: 'Country', type: 'nominal', legend: {
                    title, titleLimit: 70, labelLimit: 80,
                } } } },
                { encoding: { color: { field: 'Country', type: 'nominal', legend: {
                    title: null, labelExpr: 'upper(datum.label)',
                } } } },
                { encoding: { size: { field: 'Population', type: 'quantitative', legend: {
                    title: ['Authored first line', 'Authored second line'], format: '.2f',
                } } } },
            ],
        };
        const before = structuredClone(spec);
        vlWrapLegendText(spec, {
            canvasSize: { width: 480, height: 320 },
            layout: { legendFontSize: 10, titleFontSize: 11 },
            channelSemantics: {},
            table: [{ Country: title }],
        } as any);
        expect(spec.layer).toEqual(before.layer);
    });

    it.each([0, 12])('preserves authored column count %s with finite measurements', (columns) => {
        const spec: any = { width: 180, height: 160, encoding: {
            color: { field: 'Country', type: 'nominal', legend: { columns, labelFontSize: 11, orient: 'bottom' } },
        } };
        vlWrapLegendText(spec, {
            canvasSize: { width: 180, height: 160 }, layout: { legendFontSize: 10, titleFontSize: 11 },
            channelSemantics: {}, table: rows(4),
        } as any);
        expect(spec.encoding.color.legend.columns).toBe(columns);
        expect(spec.encoding.color.legend.labelFontSize).toBe(11);
        expect(Number.isFinite(spec._legendLayout.legends[0].width)).toBe(true);
        expect(spec._legendLayout.legends[0].width).toBeGreaterThan(180);
        expect(spec._legendLayout.overflow).toHaveLength(1);
    });

    it.each([
        { title: 'Total medals awarded to national delegations', lineCount: 2 },
        { title: 'Total gold, silver and bronze medals won at the Paris 2024 Summer Olympics', lineCount: 3 },
    ])('includes a $lineCount-line numeric key title in its measured footprint', async ({ title, lineCount }) => {
        const spec: any = { width: 480, height: 320, encoding: {
            size: { field: 'Population', type: 'quantitative', legend: { orient: 'right', title, values: [10, 40, 80] } },
        }, data: { values: rows(4) }, mark: 'point' };
        vlWrapLegendText(spec, {
            canvasSize: { width: 480, height: 320 }, layout: { legendFontSize: 10, titleFontSize: 11 },
            channelSemantics: {}, table: rows(4),
        } as any);
        const lines = spec.encoding.size.legend.title;
        expect(lines).toHaveLength(lineCount);
        expect(lines.join(' ')).toBe(title);
        const titleWidth = Math.max(...lines.map((line: string) => line.length * 11 * 0.62));
        expect(spec._legendLayout.legends[0].width).toBeGreaterThanOrEqual(titleWidth);
        expect(titleWidth).toBeLessThanOrEqual(180);
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        try {
            await view.runAsync();
            const titles: any[] = [];
            const visit = (item: any): void => {
                if (item.mark?.role === 'legend-title') titles.push(item.text);
                for (const child of item.items ?? []) visit(child);
            };
            visit((view.scenegraph() as any).root);
            expect(titles).toEqual([lines]);
        } finally {
            view.finalize();
        }
    });

    it('wraps a title even when all of its entries are short', () => {
        const title = 'Team delegations competing at the Paris Olympic Games';
        const spec: any = { encoding: { color: { field: 'Country', title, type: 'nominal', legend: { orient: 'right' } } } };
        vlWrapLegendText(spec, {
            canvasSize: { width: 480, height: 320 },
            layout: { legendFontSize: 10, titleFontSize: 11 },
            channelSemantics: {}, table: [{ Country: 'USA' }, { Country: 'China' }],
        } as any);
        expect(spec.encoding.color.legend.title.join(' ')).toBe(title);
        expect(spec.encoding.color.legend.labelExpr).toBeUndefined();
    });
});

describe('two keys above one plot', () => {
    it.each([false, true])('shares edge budgets and honors pinned placements (pinned: %s)', async (pinned) => {
        const data = rows(8).map((row, index) => ({ ...row, Country: `Regional delegation ${index + 1}` }));
        const spec: any = {
            width: 480, height: 180, data: { values: data }, mark: 'circle',
            config: { legend: { orient: 'right', labelFontSize: 10, titleFontSize: 11 } },
            encoding: {
                x: { field: 'GDP', type: 'quantitative' }, y: { field: 'Life', type: 'quantitative' },
                color: { field: 'Country', type: 'nominal', legend: pinned ? { orient: 'right' } : {} },
                size: { field: 'Population', type: 'quantitative', scale: { range: [16, 144] },
                    legend: { values: [10, 40, 80], ...(pinned ? { orient: 'right' } : {}) } },
            },
        };
        vlWrapLegendText(spec, {
            canvasSize: { width: 480, height: 180 }, layout: { legendFontSize: 10, titleFontSize: 11 },
            encodings: structuredClone(spec.encoding), channelSemantics: {}, table: data,
        } as any);
        expect(spec.width).toBe(480);
        expect(spec.height).toBe(180);
        expect(spec.encoding.size.legend.values).toEqual([10, 40, 80]);
        const positions = new Set(spec._legendLayout.legends.map((legend: any) => legend.orient));
        if (pinned) {
            expect(positions).toEqual(new Set(['right']));
        } else {
            expect([...positions].every(orient => ['right', 'left', 'top', 'bottom'].includes(orient as string))).toBe(true);
        }
        expect(spec._legendLayout.overflow).toEqual([]);
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        try {
            await view.runAsync();
            const legends: any[] = [];
            const labels: any[] = [];
            const visit = (item: any): void => {
                if (item.mark?.role === 'legend') legends.push(item.bounds);
                if (item.mark?.role === 'legend-label') labels.push(item.datum.value);
                for (const child of item.items ?? []) visit(child);
            };
            visit((view.scenegraph() as any).root);
            expect(legends).toHaveLength(2);
            expect(new Set(labels)).toEqual(new Set([...data.map(row => row.Country), 10, 40, 80]));
            const [first, second] = legends;
            const overlapX = Math.min(first.x2, second.x2) - Math.max(first.x1, second.x1);
            const overlapY = Math.min(first.y2, second.y2) - Math.max(first.y1, second.y1);
            expect(overlapX > 0 && overlapY > 0).toBe(false);
        } finally {
            view.finalize();
        }
    });

    it('gives each a row when they will not fit across the block', () => {
        const spec = bubble(320);
        expect(layoutOf(spec)?.top?.direction).toBe('vertical');
        expect(spec._legendLayout.overflow).toEqual([]);
    });

    it('leaves them on one row when the block is wide enough', () => {
        const spec = bubble(1200);
        expect(layoutOf(spec)?.top?.direction).toBe('horizontal');
        expect(spec._legendLayout.overflow).toEqual([]);
    });

    it('says nothing about rows when there is only one key', () => {
        const spec = bubble(320, null);
        expect(layoutOf(spec)?.top?.direction).toBeUndefined();
        expect(spec._theme.report.some((r: any) => /row each/.test(r.message))).toBe(false);
    });

    /**
     * A size key inherits the mark's ink. Beside a colour key that is the ink
     * of the first category, which makes the row read as one more of them.
     */
    it('draws the size key in neutral ink beside a colour key', () => {
        const spec = bubble(320);
        const found: any[] = [];
        JSON.stringify(spec, (_k, v) => {
            if (v?.symbolFillColor) found.push(v.symbolFillColor);
            return v;
        });
        expect(found.length).toBeGreaterThan(0);
    });
});

/**
 * How many entries a horizontal key fits in one row.
 *
 * Vega-Lite packs a legend row — each entry takes the width of its own name.
 * Charging every entry the width of the longest one wraps keys that would
 * have fitted, which is what put "None at all" on a second row under a row
 * with a third of its block still empty.
 */
describe('a legend row is packed, not ruled into columns', () => {
    const likert = ['A great deal', 'Some', 'Not much', 'None at all'];
    const many = [
        'Strongly agree', 'Somewhat agree', 'Neither agree nor disagree',
        'Somewhat disagree', 'Strongly disagree', 'No opinion',
        'Prefer not to say', 'Not applicable',
    ];

    const survey = (responses: string[], width: number): any => assembleVegaLite({
        data: {
            values: ['Scientists', 'The military', 'The police', 'The press', 'Congress']
                .flatMap((Institution) => responses.map((Response) => ({
                    Institution, Response, Share: 100 / responses.length,
                }))),
        },
        semantic_types: { Institution: 'Category', Response: 'Category', Share: 'Quantity' },
        chart_spec: {
            chartType: 'Stacked Bar Chart',
            encodings: { x: 'Share', y: 'Institution', color: 'Response' },
            title: 'Confidence in US institutions',
            baseSize: { width, height: 300 },
        },
        theme_spec: 'swiss',
    } as any) as any;

    const legendOf = (node: any): any => {
        if (!node || typeof node !== 'object') return undefined;
        if (node.encoding?.color?.legend) return node.encoding.color.legend;
        for (const key of Object.keys(node)) {
            const found = legendOf(node[key]);
            if (found) return found;
        }
        return undefined;
    };

    it('leaves a row alone when the names it carries actually fit', () => {
        // One long name and three short ones. Ruled into equal columns this
        // asked for 4 × the width of "A great deal" and wrapped to three;
        // packed, the four sit in one row with room to spare.
        expect(legendOf(survey(likert, 400))?.columns).toBeUndefined();
    });

    it('still wraps a key that genuinely overruns its block', () => {
        const columns = legendOf(survey(many, 400))?.columns;
        expect(columns).toBeGreaterThan(0);
        expect(columns).toBeLessThan(many.length);
    });

    it('wraps harder as the block narrows', () => {
        const wide = legendOf(survey(many, 900))?.columns ?? many.length;
        const narrow = legendOf(survey(many, 400))?.columns ?? many.length;
        expect(narrow).toBeLessThanOrEqual(wide);
    });
});
