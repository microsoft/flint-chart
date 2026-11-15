import { describe, expect, it } from 'vitest';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import { assemblePlotly, assembleVegaLite } from '../src';

const nodes = (spec: any, type: string): any[] => {
    const out: any[] = [];
    const visit = (n: any) => {
        if (!n || typeof n !== 'object') return;
        if ((typeof n.mark === 'string' ? n.mark : n.mark?.type) === type) out.push(n);
        for (const c of [...(n.layer ?? []), ...(n.vconcat ?? []), ...(n.hconcat ?? []), n.spec].filter(Boolean)) visit(c);
    };
    visit(spec);
    return out;
};

const MIX = [2019, 2020, 2021, 2022].flatMap((Year, i) => ['Coal', 'Gas', 'Wind'].map((Source, s) => ({ Year, Source, TWh: 30 + i * 4 + s * 7 })));
const stackedArea = (theme: unknown) => assembleVegaLite({
    data: { values: MIX }, semantic_types: { Year: 'Year', Source: 'Category', TWh: 'Quantity' },
    chart_spec: { chartType: 'Area Chart', encodings: { x: 'Year', y: 'TWh', color: 'Source' } },
    theme_spec: theme,
} as any) as any;
const stackedBars = (theme: unknown) => assembleVegaLite({
    data: { values: MIX }, semantic_types: { Year: 'Category', Source: 'Category', TWh: 'Quantity' },
    chart_spec: { chartType: 'Stacked Bar Chart', encodings: { x: 'Year', y: 'TWh', color: 'Source' } },
    theme_spec: theme,
} as any) as any;

describe('M1: an area’s edge is its own line', () => {
    const EDGE = { id: 'edge', geometry: { area: { opacity: 0.2, edge: 'full', edgeWidth: 2 } } };

    it('draws a line along each stacked band, in the band’s own ink', () => {
        const [area] = nodes(stackedArea(EDGE), 'area');
        expect(area.mark.line).toEqual(expect.objectContaining({ strokeWidth: 2 }));
    });

    it('no longer outlines bars with the area’s edge', () => {
        const spec = stackedBars(EDGE);
        for (const bar of nodes(spec, 'bar')) expect(bar.mark.stroke).toBeUndefined();
        expect(spec.config.arc?.stroke).toBeUndefined();
    });

    it('draws no edge where the house omits it, and leaves a house’s bar outline alone', () => {
        const [area] = nodes(stackedArea({ id: 'none', geometry: { area: { edge: 'omit' } } }), 'area');
        expect(area.mark.line).toBeUndefined();
        const outlined = stackedBars({ id: 'o', geometry: { band: { outline: 'full', outlineWidth: 1 } } });
        expect(nodes(outlined, 'bar').some((bar: any) => bar.mark.stroke)).toBe(true);
    });

    it('draws a single series’ edge in the area’s own ink, not the renderer’s default', () => {
        const spec = assembleVegaLite({
            data: { values: MIX.filter((r) => r.Source === 'Coal') }, semantic_types: { Year: 'Year', TWh: 'Quantity' },
            chart_spec: { chartType: 'Area Chart', encodings: { x: 'Year', y: 'TWh' } },
            theme_spec: { ...EDGE, ink: { series: { single: '#e2231a' } } },
        } as any) as any;
        const [area] = nodes(spec, 'area');
        expect(area.mark.line.color).toBe(area.mark.color);
    });

    it('lets the edge part stacked bands in place of a surface separator', () => {
        const [area] = nodes(stackedArea({ ...EDGE, marks: { separator: { presence: 'full', source: 'surface', width: 1.5 } } }), 'area');
        expect(area.mark.line).toBeDefined();
        expect(area.mark.stroke).toBeUndefined();
    });
});

describe('M2: a bar’s fill and its edge', () => {
    const bars = (theme: unknown) => assembleVegaLite({
        data: { values: [{ C: 'A', V: 3 }, { C: 'B', V: 5 }, { C: 'C', V: 4 }] },
        semantic_types: { C: 'Category', V: 'Quantity' },
        chart_spec: { chartType: 'Bar Chart', encodings: { x: 'C', y: 'V' }, baseSize: { width: 300, height: 200 } },
        theme_spec: theme,
    } as any) as any;

    it('draws `band.opacity` on bars, and keeps an area’s opacity for areas', () => {
        const spec = bars({ id: 'op', geometry: { band: { opacity: 0.6 }, area: { opacity: 0.2 } } });
        expect(spec.config.bar.fillOpacity).toBe(0.6);
        expect(stackedArea({ id: 'op', geometry: { area: { opacity: 0.2 } } }).config.area.fillOpacity).toBe(0.2);
        expect(stackedArea({ id: 'op', geometry: { band: { opacity: 0.6 } } }).config.area?.fillOpacity).toBeUndefined();
    });

    it('edges each bar in its own series ink with `outlineInk: "series"`', () => {
        const theme = { id: 'edge', geometry: { band: { opacity: 0.2, outline: 'full', outlineWidth: 1, outlineInk: 'series' } } };
        const [single] = nodes(bars({ ...theme, ink: { series: { single: '#617ae2' } } }), 'bar');
        expect(single.mark.stroke).toBe('#617ae2');
        const stacked = stackedBars(theme);
        const bar = nodes(stacked, 'bar').find((n: any) => n.encoding?.stroke);
        expect(bar.encoding.stroke.field).toBe('Source');
        expect(bar.encoding.stroke.legend).toBeNull();
        expect(stacked.config.arc?.stroke).toBeUndefined();
    });

    it('leaves bars opaque, as before, where the house states no band opacity', () => {
        expect(bars({ id: 'plain', geometry: { area: { opacity: 0.3 } } }).config.bar?.fillOpacity).toBeUndefined();
    });
});

describe('M5: dots on lines', () => {
    const line = (n: number, theme: unknown, width = 600) => assembleVegaLite({
        data: { values: Array.from({ length: n }, (_, i) => ({ Year: 2000 + i, V: 10 + (i % 5) })) },
        semantic_types: { Year: 'Year', V: 'Quantity' },
        chart_spec: { chartType: 'Line Chart', encodings: { x: 'Year', y: 'V' }, baseSize: { width, height: 240 } },
        theme_spec: theme,
    } as any) as any;
    const lineMark = (spec: any) => nodes(spec, 'line')[0]?.mark;

    it('keeps the countable dozen by default, and every reading where the house says `all`', () => {
        const countable = { id: 'c', geometry: { point: { presence: 'full', size: 30 } } };
        expect(lineMark(line(14, countable)).point).toBe(false);
        const every = { id: 'a', geometry: { point: { presence: 'full', size: 30, density: 'all' } } };
        expect(lineMark(line(14, every)).point).not.toBe(false);
    });

    it('draws `sparse` dots only where readings stand 20px apart', () => {
        const sparse = { id: 's', geometry: { point: { presence: 'full', size: 30, density: 'sparse' } } };
        expect(lineMark(line(6, sparse)).point).not.toBe(false);
        expect(lineMark(line(10, sparse, 160)).point).toBe(false);
    });

    it('draws hollow end markers for a house with hollow dots', () => {
        const spec = line(30, { id: 'h', geometry: { point: { presence: 'omit', fill: 'hollow' } }, annotation: { pointEmphasis: 'endpoints' } });
        const end = nodes(spec, 'point').find((n: any) => n.__themeSynthetic);
        expect(end.mark.filled).toBe(false);
        expect(end.mark.fill).toBeDefined();
    });
});

describe('M6: a bar too short to see keeps a stub', () => {
    const columns = (theme: unknown) => assembleVegaLite({
        data: { values: [{ C: 'A', V: 1000 }, { C: 'B', V: 2 }, { C: 'C', V: 0 }, { C: 'D', V: -1 }] },
        semantic_types: { C: 'Category', V: 'Quantity' },
        chart_spec: { chartType: 'Bar Chart', encodings: { x: 'C', y: 'V' }, baseSize: { width: 300, height: 200 } },
        theme_spec: theme,
    } as any) as any;

    it('draws every non-zero bar at least the least length, and leaves zero empty', async () => {
        const spec = columns({ id: 'min', geometry: { band: { minLength: 3 } } });
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        await view.runAsync();
        const heights = new Map<string, number>();
        const visit = (item: any) => {
            if (item.mark?.marktype === 'rect' && item.mark.role === 'mark' && item.datum?.C) {
                const h = Math.abs((item.y2 ?? item.y) - item.y) || item.height || 0;
                heights.set(item.datum.C, Math.max(heights.get(item.datum.C) ?? 0, h));
            }
            for (const c of item.items ?? []) visit(c);
        };
        visit((view.scenegraph() as any).root);
        view.finalize();
        expect(heights.get('B')).toBeGreaterThanOrEqual(3 - 0.01);
        expect(heights.get('D')).toBeGreaterThanOrEqual(3 - 0.01);
        expect(heights.get('C') ?? 0).toBeLessThan(0.5);
    });

    it('adds nothing for a house that states no least length', () => {
        expect(nodes(columns({ id: 'none' }), 'bar').filter((n: any) => n.__themeSynthetic)).toHaveLength(0);
    });
});

describe('M4: the house’s wedge rules', () => {
    const SHARES = [{ B: 'Safari', S: 19 }, { B: 'Chrome', S: 64 }, { B: 'Edge', S: 5 }, { B: 'Firefox', S: 3 }, { B: 'Other', S: 9 }];
    const pie = (arc: Record<string, unknown> | undefined, chartType = 'Pie Chart', labels = false) => assembleVegaLite({
        data: { values: SHARES }, semantic_types: { B: 'Category', S: 'Quantity' },
        chart_spec: { chartType, encodings: { color: 'B', size: 'S' }, baseSize: { width: 300, height: 300 }, ...(labels ? { chartProperties: { showValueLabels: true } } : {}) },
        theme_spec: { id: 'pie', ...(arc ? { geometry: { arc } } : {}), ...(labels ? { dataLabels: { show: 'always' } } : {}) },
    } as any) as any;
    /** Each wedge's start angle (radians, from 12 o'clock), by name. */
    const angles = async (spec: any) => {
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        await view.runAsync();
        const out = new Map<string, number>();
        const visit = (item: any) => {
            if (item.mark?.marktype === 'arc' && item.mark.role === 'mark' && item.datum?.B) out.set(item.datum.B, Math.min(item.startAngle, item.endAngle));
            for (const c of item.items ?? []) visit(c);
        };
        visit((view.scenegraph() as any).root);
        view.finalize();
        return out;
    };
    const order = (m: Map<string, number>) => [...m.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k);

    it('runs the wedges in the data’s order from 12 o’clock', async () => {
        expect(order(await angles(pie({ order: 'data' })))).toEqual(['Safari', 'Chrome', 'Edge', 'Firefox', 'Other']);
    });

    it('runs them largest first, the key in the same order, and keeps it with labels on', async () => {
        const spec = pie({ order: 'largestFirst' }, 'Pie Chart', true);
        expect(order(await angles(spec))).toEqual(['Chrome', 'Safari', 'Other', 'Edge', 'Firefox']);
        const colour = [spec, ...(spec.layer ?? [])].map((n: any) => n.encoding?.color).find((c: any) => c?.field);
        expect(colour.scale.domain).toEqual(['Chrome', 'Safari', 'Other', 'Edge', 'Firefox']);
    });

    it('starts the first wedge where the house says, and sizes the hole as a share of the radius', async () => {
        const start = await angles(pie({ order: 'data', startAngle: 90 }));
        expect(start.get('Safari')).toBeCloseTo(Math.PI / 2, 3);
        const donut = pie({ hole: 0.6 }, 'Donut Chart');
        const arc = [donut, ...(donut.layer ?? [])].find((n: any) => (n.mark?.type ?? n.mark) === 'arc');
        expect(arc.mark.innerRadius).toBe(Math.round(arc.mark.outerRadius * 0.6));
    });

    it('runs wedges in the data’s order by default, themed or not (M3)', async () => {
        expect(order(await angles(pie(undefined)))).toEqual(['Safari', 'Chrome', 'Edge', 'Firefox', 'Other']);
        const plain: any = assembleVegaLite({
            data: { values: SHARES }, semantic_types: { B: 'Category', S: 'Quantity' },
            chart_spec: { chartType: 'Pie Chart', encodings: { color: 'B', size: 'S' }, baseSize: { width: 300, height: 300 } },
        } as any);
        expect(order(await angles(plain))).toEqual(['Safari', 'Chrome', 'Edge', 'Firefox', 'Other']);
    });

    it('keeps a chart’s own slice sort over the house’s order', async () => {
        const spec: any = assembleVegaLite({
            data: { values: SHARES }, semantic_types: { B: 'Category', S: 'Quantity' },
            chart_spec: { chartType: 'Pie Chart', encodings: { color: 'B', size: 'S' }, baseSize: { width: 300, height: 300 }, chartProperties: { sortSlices: 'ascending' } },
            theme_spec: { id: 'pie', geometry: { arc: { order: 'largestFirst' } } },
        } as any);
        expect(order(await angles(spec))[0]).toBe('Firefox');
    });
});

describe('M3: dashes and shapes follow the colours’ order', () => {
    it('gives the first series in the data the first dash, whatever its name', () => {
        const rows = ['Norway', 'China', 'Germany'].flatMap((Country, c) => [2020, 2021, 2022].map((Year, i) => ({ Year, Country, V: 10 + c * 5 + i })));
        const spec: any = assembleVegaLite({
            data: { values: rows }, semantic_types: { Year: 'Year', Country: 'Country', V: 'Quantity' },
            chart_spec: { chartType: 'Line Chart', encodings: { x: 'Year', y: 'V', color: 'Country' } },
            theme_spec: { id: 'dash', marks: { redundantEncoding: 'always', redundantChannels: ['dash'] } },
        } as any);
        const line = nodes(spec, 'line')[0];
        const enc = { ...(spec.encoding ?? {}), ...(line.encoding ?? {}) };
        expect(enc.strokeDash.sort).toEqual(enc.color.sort);
    });
});

describe('the house curve reaches areas as well as lines', () => {
    it('steps a stacked area’s fill with its edge, so the two never part', () => {
        const spec = stackedArea({ id: 'step', geometry: { line: { interpolation: 'step' }, area: { edge: 'full', edgeWidth: 2 } } });
        expect(spec.config.area.interpolate).toBe('step');
        expect(spec.config.line.interpolate).toBe('step');
        const vg = compile(spec).spec as any;
        expect(vg.config.style.area.interpolate).toBe('step');
        expect(vg.config.style.line.interpolate).toBe('step');
        // No mark states a curve of its own over the house's.
        expect(JSON.stringify(vg.marks)).not.toMatch(/"interpolate":\{"value":"(?!step)/);
    });

    it('leaves areas on their default curve where the house states none', () => {
        expect(stackedArea({ id: 'plain' }).config.area?.interpolate).toBeUndefined();
    });
});

describe('a house’s glyph for its dots (`geometry.point.shape`)', () => {
    const PTS = [{ a: 1, b: 2, g: 'x' }, { a: 2, b: 3, g: 'y' }, { a: 3, b: 1, g: 'x' }, { a: 4, b: 4, g: 'y' }];
    const scatter = (theme: unknown, encodings: Record<string, string> = { x: 'a', y: 'b', color: 'g' }) => assembleVegaLite({
        data: { values: PTS }, semantic_types: { a: 'Quantity', b: 'Quantity', g: 'Category' },
        chart_spec: { chartType: 'Scatter Plot', encodings },
        theme_spec: theme,
    } as any) as any;
    const SQUARE = { id: 'sq', geometry: { point: { shape: 'square' } } };

    it('draws every dot of a scatter as the house’s glyph, filled as a circle was', () => {
        const spec = scatter(SQUARE);
        expect(nodes(spec, 'circle')).toHaveLength(0);
        const dots = nodes(spec, 'point').filter((n: any) => !n.__themeSynthetic);
        expect(dots.length).toBeGreaterThan(0);
        for (const dot of dots) {
            expect(dot.mark.shape).toBe('square');
            expect(dot.mark.filled).not.toBe(false);
        }
        expect(spec.config.point.shape).toBe('square');
    });

    it('keeps a chart’s own shape encoding, and gives its first shape to the house glyph', () => {
        const spec = scatter({ id: 'd', geometry: { point: { shape: 'diamond' } } }, { x: 'a', y: 'b', shape: 'g' });
        const dot = nodes(spec, 'point').find((n: any) => n.encoding?.shape);
        expect(dot).toBeDefined();
        expect(dot.mark.shape).toBeUndefined();
        expect(spec.config.range.symbol[0]).toBe('diamond');
        expect(new Set(spec.config.range.symbol).size).toBe(spec.config.range.symbol.length);
    });

    it('changes nothing for a circle, or a house that says nothing', () => {
        for (const theme of [{ id: 'c', geometry: { point: { shape: 'circle' } } }, { id: 'none' }]) {
            const spec = scatter(theme);
            expect(spec.config.point?.shape).toBeUndefined();
            expect(spec.config.range?.symbol).toBeUndefined();
        }
    });

    it('draws Plotly’s markers in the glyph too', () => {
        const fig = assemblePlotly({
            data: { values: PTS }, semantic_types: { a: 'Quantity', b: 'Quantity', g: 'Category' },
            chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'a', y: 'b', color: 'g' } },
            theme_spec: { id: 'tri', geometry: { point: { shape: 'triangle' } } },
        } as any) as any;
        const markers = fig.data.filter((t: any) => String(t.mode ?? '').includes('markers'));
        expect(markers.length).toBeGreaterThan(0);
        for (const trace of markers) expect(trace.marker.symbol).toBe('triangle-up');
    });
});

describe('a house’s key swatch (`legend.swatch`)', () => {
    const symbolTypes = (spec: any): string[] => {
        const vg = compile(spec).spec as any;
        return (vg.legends ?? []).map((l: any) => l.symbolType);
    };

    it('draws the stated symbol for every entry of a key to categories', () => {
        const spec = stackedArea({ id: 'sq', legend: { swatch: 'square' } });
        expect(symbolTypes(spec)).toEqual(['square']);
        expect(symbolTypes(stackedBars({ id: 'ln', legend: { swatch: 'line' } }))).toEqual(['stroke']);
    });

    it('leaves the mark’s own symbol under `auto`', () => {
        expect(symbolTypes(stackedArea({ id: 'auto', legend: { swatch: 'auto' } }))).toEqual(symbolTypes(stackedArea({ id: 'none' })));
    });

    it('keeps a line series’ stroke under a square swatch, which would draw it hollow', () => {
        const lines = assembleVegaLite({
            data: { values: MIX }, semantic_types: { Year: 'Year', Source: 'Category', TWh: 'Quantity' },
            chart_spec: { chartType: 'Line Chart', encodings: { x: 'Year', y: 'TWh', color: 'Source' } },
            theme_spec: { id: 'sq', legend: { swatch: 'square' } },
        } as any) as any;
        expect(symbolTypes(lines)).not.toContain('square');
    });

    it('reports that Plotly cannot draw it', () => {
        const fig = assemblePlotly({
            data: { values: MIX }, semantic_types: { Year: 'Category', Source: 'Category', TWh: 'Quantity' },
            chart_spec: { chartType: 'Stacked Bar Chart', encodings: { x: 'Year', y: 'TWh', color: 'Source' } },
            theme_spec: { id: 'sq', legend: { swatch: 'square' } },
        } as any) as any;
        expect(fig._theme.report.some((r: any) => r.path === 'legend.swatch')).toBe(true);
    });
});

describe('a frame with its own weight (`structure.frame`)', () => {
    it('draws a rule object at its stated weight, ink and dash', () => {
        const spec = stackedArea({ id: 'f', structure: { frame: { presence: 'full', weight: 4, color: '#123456', dash: [4, 2] } } });
        expect(spec.config.view.stroke).toBe('#123456');
        expect(spec.config.view.strokeWidth).toBe(4);
        expect(spec.config.view.strokeDash).toEqual([4, 2]);
    });

    it('still reads a bare presence, and draws nothing where the house omits it', () => {
        const framed = stackedArea({ id: 'p', ink: { structure: { frame: '#000000' } }, structure: { frame: 'full' } });
        expect(framed.config.view.stroke).toBe('#000000');
        expect(framed.config.view.strokeDash).toBeUndefined();
        expect(stackedArea({ id: 'o', structure: { frame: 'omit' } }).config.view.stroke).toBeNull();
    });
});

describe('how opaque a house’s dots are (`geometry.point.opacity`)', () => {
    const PTS = [{ a: 1, b: 2, g: 'x', n: 5 }, { a: 2, b: 3, g: 'y', n: 50 }, { a: 3, b: 1, g: 'x', n: 500 }];
    const bubbles = (theme: unknown, chartProperties?: Record<string, unknown>) => assembleVegaLite({
        data: { values: PTS }, semantic_types: { a: 'Quantity', b: 'Quantity', g: 'Category', n: 'Quantity' },
        chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'a', y: 'b', color: 'g', size: 'n' }, ...(chartProperties ? { chartProperties } : {}) },
        theme_spec: theme,
    } as any) as any;
    const symbolOpacity = (spec: any): number[] => {
        const vg = compile(spec).spec as any;
        const out: number[] = [];
        const visit = (marks: any[] = []) => {
            for (const m of marks) {
                if (m.type === 'symbol') {
                    const o = m.encode?.update?.opacity?.value;
                    if (typeof o === 'number') out.push(o);
                }
                visit(m.marks);
            }
        };
        visit(vg.marks);
        return out;
    };

    it('draws the dots at the stated opacity instead of Vega-Lite’s 0.7', () => {
        expect(symbolOpacity(bubbles({ id: 'none' }))).toContain(0.7);
        const spec = bubbles({ id: 'solid', geometry: { point: { opacity: 1 } } });
        expect(symbolOpacity(spec)).not.toContain(0.7);
        const style = (compile(spec).spec as any).config.style;
        expect(style.circle.opacity).toBe(1);
    });

    it('keeps the opacity on dots it redraws in the house’s glyph', () => {
        const spec = bubbles({ id: 'sq', geometry: { point: { opacity: 1, shape: 'square' } } });
        expect(symbolOpacity(spec)).not.toContain(0.7);
        expect((compile(spec).spec as any).config.style.point.opacity).toBe(1);
    });

    it('yields to a chart that states its own opacity', () => {
        const spec = bubbles({ id: 'solid', geometry: { point: { opacity: 1 } } }, { opacity: 0.4 });
        expect(symbolOpacity(spec)).toContain(0.4);
    });
});
