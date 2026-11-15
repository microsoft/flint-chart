import { describe, expect, it } from 'vitest';
import { assembleECharts } from '../src/echarts/assemble';
import { assembleChartjs } from '../src/chartjs/assemble';
import { assemblePlotly } from '../src/plotly/assemble';
import { planTitleBlock, onNiceTick, cutToWidth, judgeBackendCanvas, withTreatment, HOST_SCALE_TARGET, hostFitScale, treatedKeySide, treatedKeyFontSize, scaledTypeSize, LABEL_SCALE, TITLE_SCALE } from '../src/core/backend-frame';
import { denseLineWidth } from '../src/core/line-density';
import { tableTextMeasurer } from '../src/core/text-width';
import { roundBinEdges } from '../src/core/color-controls';
import { keyBlock } from '../src/core/backend-profile';
import { PLOTLY_PROFILE } from '../src/plotly/profile';
import { plXEndOverhang } from '../src/plotly/frame';
import { ecKeyGeometry } from '../src/echarts/profile';
import { cjsKeyGeometry } from '../src/chartjs/profile';

/** Paris 2024 medal counts, with official delegation names that run long. */
const TEAMS: Array<[string, number]> = [
    ['United States of America', 126], ["People's Republic of China", 91], ['Islamic Republic of Iran', 12],
    ["Democratic People's Republic of Korea", 6], ['Refugee Olympic Team', 1],
];
const medals = (encodings: Record<string, string>, extra: Record<string, unknown> = {}): any => ({
    data: { values: TEAMS.map(([Team, Total], i) => ({ Team, Total, Gold: 40 - i * 7, Silver: 44 - i * 8 })) },
    semantic_types: { Team: 'Category', Total: 'Quantity', Gold: 'Quantity', Silver: 'Quantity' },
    field_display_names: { Total: 'Total medals', Gold: 'Gold medals', Silver: 'Silver medals' },
    chart_spec: { chartType: 'Bar Chart', encodings, baseSize: { width: 400, height: 300 }, ...extra },
});

const HEADLINE = 'Paris 2024 medals by team, with the longest official delegation names';
const DECK = 'GDP per capita (log scale) vs life expectancy, 2007; bubble size = population; X: GDP per capita ($, log scale); Y: Life expectancy (years)';

/** No line of a broken title is a widow: the last is at least a third of the widest. */
function noWidow(lines: string[], widthOf: (text: string) => number): boolean {
    if (lines.length < 2) return true;
    const widest = Math.max(...lines.map(widthOf));
    return widthOf(lines[lines.length - 1]) >= widest / 3;
}

/** Many series over years, for line-density checks. */
const manyLines = (count: number): any => ({
    data: { values: Array.from({ length: count }, (_, s) => [2000, 2005, 2010, 2015, 2020].map((Year, i) => ({ Series: `S${s}`, Year, Value: s + i }))).flat() },
    semantic_types: { Series: 'Category', Year: 'Year', Value: 'Quantity' },
    chart_spec: { chartType: 'Line Chart', encodings: { x: 'Year', y: 'Value', color: 'Series' }, baseSize: { width: 400, height: 300 } },
});

describe('the shared title block', () => {
    const measure = tableTextMeasurer;
    const style = {
        headline: { fontSize: 18, fontWeight: 'bold', font: 'sans-serif' },
        deck: { fontSize: 12, font: 'sans-serif' },
        gap: 10,
    };

    it('leaves a title that fits on one line', () => {
        const block = planTitleBlock({ title: 'Medals' }, 400, style)!;
        expect(block.headline!.lines).toEqual(['Medals']);
        expect(block.broken).toBe(0);
    });

    it('sets a headline a size down where that brings it onto one line', () => {
        const text = 'Paris 2024 medals by team and country';
        const full = measure(18, 'sans-serif', 'bold', 'normal')(text);
        const block = planTitleBlock({ title: text }, full - 4, style)!;
        expect(block.headline!.lines).toHaveLength(1);
        expect(block.headline!.fontSize).toBeLessThan(18);
    });

    it('breaks a long deck to full lines with no widow, and counts the lines it adds', () => {
        const block = planTitleBlock({ title: 'Life expectancy', subtitle: DECK }, 440, style)!;
        const widthOf = measure(12, 'sans-serif', 'normal', 'normal');
        expect(block.deck!.lines.length).toBeGreaterThan(1);
        expect(block.deck!.lines.every((line) => widthOf(line) <= 440)).toBe(true);
        expect(noWidow(block.deck!.lines, widthOf)).toBe(true);
        expect(block.broken).toBe((block.deck!.lines.length - 1) * block.deck!.lineHeight);
    });

    it('cuts to a measured width with an ellipsis', () => {
        const widthOf = measure(12, 'sans-serif', 'normal', 'normal');
        const cut = cutToWidth("Democratic People's Republic of Korea", 80, widthOf);
        expect(cut.endsWith('…')).toBe(true);
        expect(widthOf(cut)).toBeLessThanOrEqual(80);
    });

    it('knows a round tick from a padded end', () => {
        expect(onNiceTick(20, [0, 40])).toBe(true);
        expect(onNiceTick(11.25, [11.25, 41.4])).toBe(false);
    });
});

describe('line density, shared by every backend', () => {
    it('keeps a few lines at the backend weight and thins many, never below 0.75 px', () => {
        expect(denseLineWidth(2, 7, 270)).toBeUndefined();
        expect(denseLineWidth(2, 30, 270)).toBeCloseTo(1.35, 2);
        expect(denseLineWidth(3, 400, 270)).toBe(0.75);
    });
});

describe('ECharts frame', () => {
    it('breaks a headline and deck in ECharts\u2019 own title, and makes room for it above the plot', () => {
        // A box no wider than the chart, so the headline has only the drawing's width.
        const option = assembleECharts(medals({ x: 'Team', y: 'Total' }, { title: HEADLINE, subtitle: 'Total medals won; five teams with long names', canvasSize: { width: 400, height: 300 } }));
        expect(option.title.left).toBe('center');
        const lines = String(option.title.text).split('\n');
        expect(lines.length).toBe(2);
        expect(noWidow(lines, tableTextMeasurer(option.title.textStyle.fontSize, 'sans-serif', 'bold', 'normal'))).toBe(true);
        expect(option.title.subtext).toContain('Total medals won');
        // The plot starts under the title block.
        const block = 15 + 10 + 2 * option.title.textStyle.lineHeight + 10 + option.title.subtextStyle.lineHeight;
        expect(option.grid.top).toBeGreaterThanOrEqual(block);
    });

    it('wraps long row names and widens the gutter to them, the axis name clear of the labels', () => {
        const option = assembleECharts(medals({ y: 'Team', x: 'Total' }));
        const label = option.yAxis.axisLabel;
        const texts = option.yAxis.data.map((v: string) => label.formatter(v));
        expect(texts.some((t: string) => t.includes('\n'))).toBe(true);
        const widthOf = tableTextMeasurer(label.fontSize, 'sans-serif', 'normal', 'normal');
        const widest = Math.max(...texts.flatMap((t: string) => t.split('\n')).map(widthOf));
        expect(option.grid.left).toBeGreaterThanOrEqual(widest + 8);
        expect(option.yAxis.nameGap).toBeGreaterThan(widest);
        expect(label.interval).toBe(0);
    });

    it('wraps long key names beside the plot and keeps the plot clear of the key', () => {
        // The frame's own layout, before any canvas-fit treatment.
        const option = assembleECharts({ ...medals({ x: 'Gold', y: 'Silver', color: 'Team' }, { chartType: 'Scatter Plot', baseSize: { width: 280, height: 320 } }), options: { canvasFit: 'off' } });
        const names = option.legend.data.map((d: any) => (typeof d === 'string' ? d : d.name));
        const shown = names.map((n: string) => option.legend.formatter(n));
        expect(shown.some((t: string) => t.includes('\n'))).toBe(true);
        const widthOf = tableTextMeasurer(option.legend.textStyle.fontSize, 'sans-serif', 'normal', 'normal');
        const widest = Math.max(...shown.flatMap((t: string) => t.split('\n')).map(widthOf));
        expect(option.grid.right).toBeGreaterThan(widest);
    });

    it('leaves a padded scatter domain\u2019s odd ends unlabelled', () => {
        const option = assembleECharts(medals({ x: 'Gold', y: 'Silver' }, { chartType: 'Scatter Plot' }));
        for (const axis of [option.xAxis, option.yAxis]) {
            if (typeof axis.min === 'number' && !onNiceTick(axis.min, [axis.min, axis.max])) expect(axis.axisLabel.showMinLabel).toBe(false);
        }
    });

    it('thins many lines from ECharts\u2019 2 px', () => {
        const option = assembleECharts(manyLines(40));
        const widths = option.series.filter((s: any) => s.type === 'line').map((s: any) => s.lineStyle?.width);
        expect(widths.every((w: number) => w < 2 && w >= 0.75)).toBe(true);
    });

    it('reports the canvas fit against the chart\u2019s box', () => {
        const option = assembleECharts(medals({ x: 'Team', y: 'Total' }));
        expect(option._canvasFit.box).toEqual({ width: 600, height: 450 });
        expect(option._canvasFit.drawing).toEqual({ width: option._width, height: option._height });
    });
});

describe('Chart.js frame', () => {
    it('sets a broken headline and deck in Chart.js\u2019 title and subtitle plugins, and grows the canvas for them', () => {
        const plain = assembleChartjs(medals({ x: 'Team', y: 'Total' }));
        const titled = assembleChartjs(medals({ x: 'Team', y: 'Total' }, { title: HEADLINE, subtitle: DECK }));
        const title = titled.options.plugins.title;
        expect(title.display).toBe(true);
        expect(title.font.weight).toBe('bold');
        expect(Array.isArray(titled.options.plugins.subtitle.text)).toBe(true);
        expect(titled._height).toBeGreaterThan(plain._height);
    });

    it('wraps long row names through the tick callback, every name shown', () => {
        const config = assembleChartjs(medals({ y: 'Team', x: 'Total' }));
        const ticks = config.options.scales.y.ticks;
        const lines = config.data.labels.map((label: string) => ticks.callback.call({ getLabelForValue: () => label }, 0));
        expect(lines.some((l: unknown) => Array.isArray(l))).toBe(true);
        expect(ticks.autoSkip).toBe(false);
    });

    it('fits a scale title longer than its axis onto two lines', () => {
        const input = medals({ x: 'Team', y: 'Total' });
        input.field_display_names.Total = 'Total gold, silver and bronze medals won at the Paris 2024 Summer Olympics';
        const config = assembleChartjs(input);
        expect(Array.isArray(config.options.scales.y.title.text)).toBe(true);
        expect(config.options.scales.y.title.text).toHaveLength(2);
    });

    it('stays JSON where nothing is rewritten', () => {
        const config = assembleChartjs({
            data: { values: [{ k: 'A', v: 1 }, { k: 'B', v: 2 }, { k: 'C', v: 3 }] },
            semantic_types: { k: 'Category', v: 'Quantity' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: 'k', y: 'v' } },
        } as any);
        expect(JSON.parse(JSON.stringify(config))).toEqual(config);
    });

    it('thins many lines from Chart.js\u2019 3 px', () => {
        const config = assembleChartjs(manyLines(40));
        const widths = config.data.datasets.map((d: any) => d.borderWidth);
        expect(widths.every((w: number) => w < 3 && w >= 0.75)).toBe(true);
    });
});

describe('Plotly frame', () => {
    it('breaks a deck with no widow, measured in the face Plotly draws', () => {
        const figure = assemblePlotly(medals({ x: 'Team', y: 'Total' }, { title: 'Medals', subtitle: DECK }));
        const text = String(figure.layout.title.text);
        const deck = text.slice(text.indexOf('<span')).replace(/<[^>]+>/g, '\n').split('\n').filter(Boolean);
        expect(deck.length).toBeGreaterThan(1);
        const widthOf = tableTextMeasurer(13, 'Verdana, sans-serif', 'normal', 'normal');
        expect(deck.every((line) => widthOf(line) <= figure.layout.width - 16)).toBe(true);
        expect(noWidow(deck, widthOf)).toBe(true);
    });

    it('puts long key names on lines when the canvas fit holds them short, and keeps the full name in the hover', () => {
        const input = medals({ x: 'Gold', y: 'Silver', color: 'Team' }, { chartType: 'Scatter Plot', baseSize: { width: 280, height: 320 } });
        const figure = assemblePlotly(withTreatment(input, { names: { keyWidth: 120 } }, { width: 420, height: 480 }));
        const wrapped = figure.data.filter((t: any) => String(t.name).includes('<br>'));
        expect(wrapped.length).toBeGreaterThan(0);
        expect(wrapped.every((t: any) => t.hoverlabel?.namelength === -1)).toBe(true);
    });

    it('fits an axis title longer than its axis onto two lines', () => {
        const input = medals({ x: 'Team', y: 'Total' });
        input.field_display_names.Total = 'Total gold, silver and bronze medals won at the Paris 2024 Summer Olympics';
        const figure = assemblePlotly(input);
        expect(String(figure.layout.yaxis.title.text)).toContain('<br>');
    });

    it('thins many lines from Plotly\u2019s 2 px', () => {
        const figure = assemblePlotly(manyLines(40));
        const widths = figure.data.map((t: any) => t.line?.width);
        expect(widths.every((w: number) => w < 2 && w >= 0.75)).toBe(true);
    });
});

describe('the backend canvas fit', () => {
    it('takes a treatment only where it reads better than the chart as planned: fewer flags, less host shrink', () => {
        const score = (fit: any) => fit.excess + Math.max(0, HOST_SCALE_TARGET - fit.scale);
        const regions = ['Central and Southern Asia', 'Europe and Northern America', 'Northern Africa and Western Asia', 'Sub-Saharan Africa', 'Latin America and the Caribbean', 'Oceania', 'Eastern and South-Eastern Asia'];
        const input: any = {
            data: { values: regions.flatMap((region, r) => [2000, 2010, 2020].map((year, i) => ({ region, year, value: r * 10 + i }))) },
            semantic_types: { region: 'Category', year: 'Year', value: 'Quantity' },
            chart_spec: { chartType: 'Line Chart', encodings: { x: 'year', y: 'value', color: 'region' }, canvasSize: { width: 360, height: 270 } },
        };
        for (const assemble of [assembleECharts, assembleChartjs, assemblePlotly] as Array<(i: any) => any>) {
            const fitted = assemble(input);
            const planned = assemble({ ...input, options: { canvasFit: 'off' } });
            expect(score(fitted._canvasFit)).toBeLessThanOrEqual(score(planned._canvasFit) + 0.01);
            if (fitted._canvasFit.treatment) expect(score(fitted._canvasFit)).toBeLessThan(score(planned._canvasFit));
        }
    });

    it('lays a backend\u2019s plot out smaller where its host would shrink the drawing past 90%', () => {
        const box = { width: 450, height: 450 };
        const judge = (sideKeys: number) => judgeBackendCanvas({ plot: { width: 300, height: 300 }, parts: { yLabels: 60, xLabels: 60, title: 60, sideKeys }, padding: 0, box, base: { width: 300, height: 300 } });
        const wide = judge(150);
        expect(wide.estimate.scale).toBeLessThan(HOST_SCALE_TARGET);
        // Not past legibility, so the plan's own fit would leave it to the host.
        expect(wide.plotScale).toBeUndefined();
        const share = hostFitScale(wide.estimate, box)!;
        const furniture = wide.estimate.drawing.width - wide.estimate.area.width;
        expect(wide.estimate.area.width * share + furniture).toBeLessThanOrEqual(450);
        // A key too wide for any legible plot keeps the floor; a drawing that fits is left alone.
        expect(hostFitScale(judge(260).estimate, box)).toBe(0.6);
        expect(hostFitScale(judge(20).estimate, box)).toBeUndefined();
    });

    it('steps the library\u2019s type down a size, to a floor, and takes it only where text reads larger on screen', () => {
        expect(scaledTypeSize(12, LABEL_SCALE, 10)).toBe(10);
        expect(scaledTypeSize(10, LABEL_SCALE, 10)).toBe(10);
        expect(scaledTypeSize(17, TITLE_SCALE, 13)).toBe(14.5);
        expect(scaledTypeSize(12, undefined, 10)).toBe(12);
        // A plot and key whose labels a smaller size would leave smaller on screen keep their size.
        const companies = assemblePlotly({
            data: { values: Array.from({ length: 12 }, (_, i) => ({ Sector: ['Information technology', 'Health care and life sciences', 'Industrials and manufacturing', 'Communication services'][i % 4], Revenue: 10 + i * 13, Margin: (i * 7) % 30, Staff: 1000 * (i + 1) })) },
            semantic_types: { Sector: 'Category', Revenue: 'Quantity', Margin: 'Percentage', Staff: 'Quantity' },
            chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'Revenue', y: 'Margin', color: 'Sector', size: 'Staff' }, baseSize: { width: 300, height: 300 }, canvasSize: { width: 450, height: 450 } },
        } as any);
        const t = companies._canvasFit.treatment;
        if (t?.labelScale) expect(companies._canvasFit.scale * t.labelScale).toBeGreaterThanOrEqual(0.83);
        // A Plotly key is set at its ticks' size, not over them.
        expect(companies.layout.legend.font.size).toBeLessThanOrEqual(companies.layout.xaxis.tickfont?.size ?? 12);
    });

    it('asks for a smaller plot only where the host would shrink the drawing past legibility', () => {
        const box = { width: 400, height: 300 };
        const roomy = judgeBackendCanvas({ plot: { width: 300, height: 200 }, parts: { yLabels: 50, xLabels: 40, title: 40 }, padding: 0, box, base: box });
        expect(roomy.plotScale).toBeUndefined();
        const squeezed = judgeBackendCanvas({ plot: { width: 400, height: 300 }, parts: { yLabels: 60, xLabels: 50, title: 160, sideKeys: 200 }, padding: 0, box, base: box });
        expect(squeezed.estimate.scale).toBeLessThan(0.7);
        expect(squeezed.plotScale).toBeGreaterThanOrEqual(0.6);
    });
});

describe('ECharts fixes', () => {
    it('places dates down y on a time axis, as epoch ms', () => {
        const rows = ['2020-01-01', '2021-06-01', '2022-03-15'].map((date, i) => ({ date, value: 10 + i }));
        const option = assembleECharts({ data: { values: rows }, semantic_types: { date: 'Date', value: 'Quantity' }, chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'value', y: 'date' } } } as any);
        expect(option.yAxis.type).toBe('time');
        expect(typeof option.series[0].data[0][1]).toBe('number');
    });

    it('keeps the x name clear of a heatmap\u2019s colour ramp at the foot', () => {
        const rows = ['North', 'East', 'South'].flatMap((Region, r) => ['A', 'B'].map((Segment, s) => ({ Region, Segment, Load: 40 + r * 10 + s * 5 })));
        const option = assembleECharts({ data: { values: rows }, semantic_types: { Region: 'Category', Segment: 'Category', Load: 'Quantity' }, chart_spec: { chartType: 'Heatmap', encodings: { x: 'Region', y: 'Segment', color: 'Load' } } } as any);
        const ramp = option.visualMap;
        const rampTop = ramp.bottom + (ramp.itemWidth ?? 20) + 22;
        // The x name's baseline sits above the ramp and its handle values.
        expect(option.grid.bottom - option.xAxis.nameGap - 14).toBeGreaterThanOrEqual(rampTop - 4);
    });

    it('stands a size ramp\u2019s title over its bar, from the plot\u2019s top', () => {
        // Twenty distinct sizes: a quantity, keyed by ECharts' continuous ramp.
        const rows = Array.from({ length: 20 }, (_, i) => ({ x: i, y: (i * 7) % 13, pop: 0.2 + i * 66 }));
        const option = assembleECharts({ data: { values: rows }, semantic_types: { x: 'Quantity', y: 'Quantity', pop: 'Quantity' },
            chart_spec: { chartType: 'Scatter Plot', title: HEADLINE, encodings: { x: 'x', y: 'y', size: 'pop' } } } as any);
        const ramp = (Array.isArray(option.visualMap) ? option.visualMap : [option.visualMap]).find((m: any) => m.id === 'flint-ramp:size');
        const title = option.graphic.find((g: any) => g.id === 'flint-ramp-title:size');
        expect(ramp.show).not.toBe(false);
        expect(title.top).toBe(option.grid.top);
        expect(ramp.top).toBeGreaterThan(title.top);
    });

    it('edges colour bins at round values', () => {
        const rows = ['a', 'b', 'c', 'd'].flatMap((k, i) => ['x', 'y'].map((j, n) => ({ k, j, v: -53901 + i * 30000 + n * 4000 })));
        const option = assembleECharts({ data: { values: rows }, semantic_types: { k: 'Category', j: 'Category', v: 'Quantity' }, chart_spec: { chartType: 'Heatmap', encodings: { x: 'k', y: 'j', color: { field: 'v', bins: 4 } } } } as any);
        const vm = Array.isArray(option.visualMap) ? option.visualMap[0] : option.visualMap;
        expect(vm.pieces).toHaveLength(4);
        for (const piece of vm.pieces) for (const edge of [piece.lt, piece.gte]) if (edge !== undefined) expect(Math.abs(edge % 5000)).toBe(0);
    });
});

describe('roundBinEdges', () => {
    it('puts count − 1 round edges inside the data', () => {
        const edges = roundBinEdges(-53901, 43635, 4)!;
        expect(edges).toEqual([-25000, 0, 25000]);
        expect(roundBinEdges(1, 1, 4)).toBeUndefined();
    });
});

describe('Plotly themed alignment', () => {
    const MIX: Array<[string, string, number]> = [
        ['France', 'Nuclear', 65], ['France', 'Renewables', 27], ['France', 'Fossil', 8],
        ['Germany', 'Nuclear', 3], ['Germany', 'Renewables', 52], ['Germany', 'Fossil', 45],
        ['United States', 'Nuclear', 18], ['United States', 'Renewables', 22], ['United States', 'Fossil', 60],
        ['China', 'Nuclear', 5], ['China', 'Renewables', 33], ['China', 'Fossil', 62],
        ['Brazil', 'Nuclear', 2], ['Brazil', 'Renewables', 89], ['Brazil', 'Fossil', 9],
    ];
    const stacked = (extra: Record<string, unknown> = {}): any => ({
        data: { values: MIX.map(([Country, Source, Share]) => ({ Country, Source, Share })) },
        semantic_types: { Country: 'Country', Source: 'Category', Share: 'Percentage' },
        theme_spec: 'economist',
        chart_spec: {
            chartType: 'Stacked Bar Chart', encodings: { x: 'Country', y: 'Share', color: 'Source' },
            title: 'Electricity generation mix by country, 2023 (%)', subtitle: 'Share of electricity generation by source, %',
            canvasSize: { width: 450, height: 450 }, ...extra,
        },
    });

    it('starts the header, headline, key and source at the chart\u2019s left, with the value axis on the right', () => {
        const fig: any = assemblePlotly(stacked({ source: 'Ember' }));
        const { layout } = fig;
        const plotWidth = layout.width - layout.margin.l - layout.margin.r;
        const chartLeft = layout.margin.l;
        expect(layout.yaxis.side).toBe('right');
        expect(Math.abs(layout.title.x * layout.width - chartLeft)).toBeLessThan(2);
        expect(Math.abs(layout.margin.l + layout.legend.x * plotWidth - chartLeft)).toBeLessThan(2);
        const tab = layout.shapes.find((s: any) => s.type === 'rect');
        expect(Math.abs(tab.x0 * plotWidth + layout.margin.l - chartLeft)).toBeLessThan(2);
        const source = layout.annotations.find((a: any) => /Ember/.test(a.text));
        expect(Math.abs(source.x * plotWidth + layout.margin.l - chartLeft)).toBeLessThan(2);
    });

    it('gives back the foot kept for names the house lays flat and a title it moves to the deck', () => {
        const fig: any = assemblePlotly(stacked());
        expect(fig.layout.xaxis.tickangle).toBe(0);
        expect(fig.layout.xaxis.ticktext).toContain('United<br>States');
        expect(fig.layout.xaxis.title?.text ?? '').toBe('');
        // Two rows of 11 px names and their standoff, not the room turned names and a title took.
        expect(fig.layout.margin.b).toBeLessThan(64);
    });

    it('titles the key where the house does, and cuts names in the face they were planned in', () => {
        const CPI: Array<[string, number]> = [
            ['Bananas, per lb.', 8.8], ['Bread, white, pan, per lb.', -5.6], ['Electricity per KWH', 7.3],
            ['Gasoline, unleaded regular, per gallon', -6.4], ['Ground chuck, 100% beef, per lb.', 17.5],
        ];
        const fig: any = assemblePlotly({
            data: { values: CPI.map(([Item, change]) => ({ Item, Change: change, Direction: change >= 0 ? 'Increase' : 'Decrease' })) },
            semantic_types: { Item: 'Category', Change: 'Percentage', Direction: 'Category' },
            theme_spec: 'nyt',
            chart_spec: { chartType: 'Bar Chart', encodings: { y: 'Item', x: 'Change', color: 'Direction' }, title: 'Beef led a year of rising prices', canvasSize: { width: 450, height: 450 } },
        } as any);
        expect(fig.layout.legend.title.text).toMatch(/Direction/);
        const names: string[] = fig.layout.yaxis.ticktext;
        expect(names).toContain('Electricity per KWH');
        expect(names.some((name) => name.includes('\u2026'))).toBe(false);
        // An untheme'd chart keeps Plotly's untitled key.
        const plain: any = assemblePlotly({ ...stacked(), theme_spec: undefined });
        expect(plain.layout.legend?.title?.text ?? '').toBe('');
    });
});

describe('backend profiles', () => {
    const widthOf = (text: string) => text.length * 6;
    it('sets a Plotly key as the frame has Plotly draw it: rows that flow, each entry its own width', () => {
        const entries = [['aaaaaaaaaa'], ['bb'], ['cc'], ['dd']];
        // 40 + 60 = 100 widest; one row needs 100 + 3·52 + 3·5 = 271 px.
        const oneRow = keyBlock(PLOTLY_PROFILE.key, { entries, fontSize: 10, widthOf, orientation: 'horizontal', room: 300 });
        expect(oneRow.rows).toBe(1);
        expect(oneRow.height).toBe(Math.ceil(Math.max(13, 16) + 3 + 10));
        const flow = keyBlock(PLOTLY_PROFILE.key, { entries, fontSize: 10, widthOf, orientation: 'horizontal', room: 250 });
        // 100 + 52 + 52 + 3·5 = 219 fits the first row; the last entry starts the second.
        expect(flow.rows).toBe(2);
        // As a grid at the widest entry (Plotly's own), the same row would hold two.
        const grid = keyBlock({ ...PLOTLY_PROFILE.key, wrap: 'grid', breakAt: 'reach' }, { entries, fontSize: 10, widthOf, orientation: 'horizontal', room: 250 });
        expect(grid.rows).toBe(2);
        // A two-line entry stands its lines tall; the box keeps 5 px at its top and bottom.
        const column = keyBlock(PLOTLY_PROFILE.key, { entries: [['a', 'b'], ['c']], fontSize: 10, widthOf, orientation: 'vertical' });
        expect(column.height).toBe(Math.ceil((26 + 3) + (16 + 3) + 10));
    });

    it('holds key names to the same width in every library, past each one\u2019s own symbol room', () => {
        const options = { canvasTreatment: { names: { keyWidth: 120 } } };
        expect(treatedKeySide(options, PLOTLY_PROFILE.key)).toBe(120 + PLOTLY_PROFILE.key.lead);
        expect(treatedKeySide(options, ecKeyGeometry({}))).toBe(120 + 30 + 10);
        expect(treatedKeySide({}, PLOTLY_PROFILE.key)).toBeUndefined();
        // Key text steps down a size, never below the 10 px floor.
        expect(treatedKeyFontSize(12, { canvasTreatment: { keyScale: 0.84 } })).toBe(10);
        expect(treatedKeyFontSize(11, { canvasTreatment: { keyScale: 0.84 } })).toBe(10);
        expect(treatedKeyFontSize(12, {})).toBe(12);
    });

    it('sets ECharts and Chart.js keys as their frames always measured them', () => {
        const entries = [['alpha'], ['beta'], ['gamma']];
        const ec = keyBlock(ecKeyGeometry({}), { entries, fontSize: 12, widthOf, orientation: 'horizontal', room: 120 });
        // ECharts flows each entry at its own width: 30 + 30, 30 + 24, 30 + 30, 10 apart, in 110 px.
        expect(ec.rows).toBe(3);
        expect(ec.height).toBe(3 * 15 + 2 * 10 + 10);
        const cjs = keyBlock(cjsKeyGeometry({}, 12), { entries, fontSize: 12, widthOf, orientation: 'horizontal', room: 400 });
        expect(cjs.rows).toBe(1);
        expect(cjs.height).toBe(12 + 20);
    });
});

describe('a narrow chart\u2019s title', () => {
    const twoBars = (extra: Record<string, unknown> = {}): any => ({
        data: { values: [{ Group: 'Before', Score: 41 }, { Group: 'After', Score: 67 }] },
        semantic_types: { Group: 'Category', Score: 'Score' },
        chart_spec: {
            chartType: 'Bar Chart', encodings: { x: 'Group', y: 'Score' },
            title: 'After the redesign, the share of first-time visitors who completed the sign-up flow rose from forty-one to sixty-seven per cent',
            baseSize: { width: 300, height: 300 }, canvasSize: { width: 450, height: 450 }, ...extra,
        },
    });

    it('runs as wide as the box allows, the drawing growing wider rather than taller', () => {
        for (const [name, assemble] of [['plotly', assemblePlotly], ['echarts', assembleECharts], ['chartjs', assembleChartjs]] as const) {
            const fitted: any = (assemble as any)({ ...twoBars(), ...(name === 'plotly' ? { theme_spec: 'pop' } : {}) });
            const d = fitted._canvasFit.drawing;
            expect(d.width, name).toBeGreaterThan(380);
            expect(d.width, name).toBeLessThanOrEqual(450);
            expect(d.height / d.width, name).toBeLessThan(1.2);
        }
    });

    it('is measured in the case a house draws it, so no line runs past the figure', () => {
        const fig: any = assemblePlotly({ ...twoBars(), theme_spec: 'pop' });
        const widthOf = tableTextMeasurer(fig.layout.title.font.size, fig.layout.title.font.family, 'bold', 'normal');
        const lines = String(fig.layout.title.text).split('<span')[0].replace(/<\/?b>/g, '').split('<br>').filter(Boolean);
        const left = fig.layout.title.x * fig.layout.width;
        for (const line of lines) expect(left + widthOf(line)).toBeLessThanOrEqual(fig.layout.width);
    });
});

describe('Plotly pie with long names', () => {
    const names = ['Democratic Republic of the Congo', 'Bosnia and Herzegovina', 'Central African Republic', 'Trinidad and Tobago', 'Papua New Guinea'];
    const pie = (labels: string[]): any => ({
        data: { values: labels.map((Country, i) => ({ Country, Share: 10 + i * 3 })) },
        semantic_types: { Country: 'Country', Share: 'Percentage' },
        chart_spec: { chartType: 'Pie Chart', encodings: { color: 'Country', size: 'Share' }, title: 'Shares', baseSize: { width: 300, height: 300 }, canvasSize: { width: 450, height: 450 } },
        theme_spec: 'economist',
    });

    it('names its slices in a key beside it, shares inside, rather than crowding a small disc with callouts', () => {
        const fig: any = assemblePlotly(pie(names));
        const trace = fig.data[0];
        expect(fig.layout.showlegend).toBe(true);
        expect(fig.layout.legend.x).toBeGreaterThanOrEqual(1);
        expect(trace.textinfo).not.toContain('label');
        expect(trace.automargin).toBe(false);
        expect(fig.layout.width).toBeLessThanOrEqual(450);
        // The pie keeps a legible disc.
        const m = fig.layout.margin;
        expect(Math.min(fig.layout.width - m.l - m.r, fig.layout.height - m.t - m.b)).toBeGreaterThanOrEqual(200);
    });

    it('keys a themed pie whose callouts would stand outside it, so the house\u2019s tab stays over the headline', () => {
        const fig: any = assemblePlotly({
            data: { values: [{ Fuel: 'Natural gas', Share: 58 }, { Fuel: 'Coal', Share: 34 }, { Fuel: 'Nuclear and hydroelectric', Share: 5 }, { Fuel: 'Oil and other liquid fuels', Share: 3 }] },
            semantic_types: { Fuel: 'Category', Share: 'Percentage' },
            chart_spec: { chartType: 'Pie Chart', encodings: { color: 'Fuel', size: 'Share' }, title: 'Power generation by fuel', baseSize: { width: 300, height: 300 }, canvasSize: { width: 450, height: 450 } },
            theme_spec: 'economist',
        } as any);
        const trace = fig.data[0];
        // No callout may grow the margins after the header is placed.
        expect(trace.automargin).toBe(false);
        expect(trace.textinfo).not.toContain('label');
        // The house keeps its key in a row, the names as written.
        expect(fig.layout.legend.orientation).toBe('h');
        expect(trace.labels).toContain('Oil and other liquid fuels');
        const tab = fig.layout.shapes.find((s: any) => s.type === 'rect');
        const plotWidth = fig.layout.width - fig.layout.margin.l - fig.layout.margin.r;
        expect(Math.abs(fig.layout.margin.l + tab.x0 * plotWidth - fig.layout.title.x * fig.layout.width)).toBeLessThan(2);
    });

    it('lets the chart, or the house, choose where the names stand (`sliceNames`)', () => {
        const fuels = (props: Record<string, unknown> | undefined, theme: unknown = 'economist'): any => assemblePlotly({
            data: { values: [{ Fuel: 'Natural gas', Share: 58 }, { Fuel: 'Coal', Share: 34 }, { Fuel: 'Nuclear and hydroelectric', Share: 5 }, { Fuel: 'Oil and other liquid fuels', Share: 3 }] },
            semantic_types: { Fuel: 'Category', Share: 'Percentage' },
            chart_spec: { chartType: 'Pie Chart', encodings: { color: 'Fuel', size: 'Share' }, ...(props ? { chartProperties: props } : {}), baseSize: { width: 300, height: 300 } },
            ...(theme ? { theme_spec: theme } : {}),
        } as any);
        const keyed = (fig: any) => fig.layout.showlegend === true && !String(fig.data[0].textinfo).includes('label');
        expect(keyed(fuels(undefined))).toBe(true);
        expect(keyed(fuels({ sliceNames: 'onSlices' }))).toBe(false);
        expect(keyed(fuels({ sliceNames: 'key' }, null))).toBe(true);
        expect(keyed(fuels(undefined, null))).toBe(false);
        // A house may prefer names on the slices; the chart's own setting stands over it.
        const onSlices = { extends: 'economist', chartDefaults: { 'Pie Chart': { sliceNames: 'onSlices' } } };
        expect(keyed(fuels(undefined, onSlices))).toBe(false);
        expect(keyed(fuels({ sliceNames: 'key' }, onSlices))).toBe(true);
    });

    it('leaves a pie of short names to name its own slices', () => {
        const fig: any = assemblePlotly(pie(['A', 'B', 'C']));
        expect(String(fig.data[0].textinfo ?? fig.data[0].texttemplate ?? 'label')).toMatch(/label|%\{label\}/);
    });
});

describe('Plotly nice axes', () => {
    it('starts and ends a scatter\u2019s axes on labelled ticks, and labels a short log axis within its decades', () => {
        const rows = [[1865, 54.3], [4200, 66.2], [12400, 71.5], [39300, 84.2], [116900, 80.1]];
        const fig: any = assemblePlotly({
            data: { values: rows.map(([gdp, life]) => ({ gdp, life })) },
            semantic_types: { gdp: 'Quantity', life: 'Quantity' },
            chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'gdp', y: 'life' }, chartProperties: { logScale_x: true }, baseSize: { width: 300, height: 300 } },
        } as any);
        const y = fig.layout.yaxis;
        expect(y.range[0] % y.dtick).toBe(0);
        expect(y.range[1] % y.dtick).toBe(0);
        expect(y.range[0]).toBeLessThanOrEqual(54.3);
        expect(y.range[1]).toBeGreaterThanOrEqual(84.2);
        const x = fig.layout.xaxis;
        expect(x.type).toBe('log');
        expect(x.tickvals.length).toBeGreaterThanOrEqual(4);
        expect(x.tickvals[0]).toBeLessThanOrEqual(2000);
    });
});

describe('Plotly key in a row', () => {
    it('sets its names for the row: whole where they stand one to a row, not broken for a column beside the plot', () => {
        const segments = ['Residential customers on fixed tariffs', 'Small and medium-sized businesses', 'Large industrial and commercial accounts'];
        const fig: any = assemblePlotly({
            data: { values: ['North', 'South', 'East'].flatMap((Region, r) => segments.map((Segment, k) => ({ Region, Segment, Revenue: 30 + r * 12 + k * 9 }))) },
            semantic_types: { Region: 'Category', Segment: 'Category', Revenue: 'Amount' },
            chart_spec: { chartType: 'Grouped Bar Chart', encodings: { x: 'Region', y: 'Revenue', group: 'Segment' }, title: 'Revenue by region and segment', baseSize: { width: 300, height: 300 }, canvasSize: { width: 450, height: 450 } },
            theme_spec: 'swiss',
        } as any);
        expect(fig.layout.legend.orientation).toBe('h');
        const names = [...new Set(fig.data.map((t: any) => t.name))];
        expect(names).toEqual(segments);
    });
});

describe('Plotly key in rows flows', () => {
    it('sets each entry its own width, not a grid at the widest, so one long name does not leave one entry a row', () => {
        const teams = ['UnitedStatesOlympicDelegationParis2024', 'China', 'Japan', 'France'];
        const fig: any = assemblePlotly({
            data: { values: teams.map((Team, i) => ({ Team, Gold: 40 - i * 8, Silver: 44 - i * 9 })) },
            semantic_types: { Team: 'Category', Gold: 'Quantity', Silver: 'Quantity' },
            chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'Gold', y: 'Silver', color: 'Team' }, baseSize: { width: 300, height: 300 }, canvasSize: { width: 450, height: 450 }, chartProperties: {} },
            options: { canvasTreatment: { keys: 'bottom' } },
        } as any);
        expect(fig.layout.legend.orientation).toBe('h');
        expect(fig.layout.legend.traceorder).toBe('grouped');
        expect(fig.layout.legend.tracegroupgap).toBe(0);
        const groups = fig.data.filter((t: any) => t.showlegend !== false).map((t: any) => t.legendgroup);
        expect(new Set(groups).size).toBe(teams.length);
        // The flow the frame measures: the short names share a row.
        const block = keyBlock(PLOTLY_PROFILE.key, { entries: teams.map((t) => [t]), fontSize: 12, widthOf: tableTextMeasurer(12, 'Verdana', 'normal', 'normal'), orientation: 'horizontal', room: 400 });
        expect(block.rows).toBe(2);
    });
});

describe('Plotly size key', () => {
    const bubbles = (theme?: string): any => assemblePlotly({
        data: { values: [['Europe', 64800, 82.3, 5.3], ['Americas', 62600, 78.6, 327], ['Asia', 16800, 76.7, 1393], ['Asia', 6900, 69.4, 1353], ['Africa', 5300, 54.3, 196], ['Europe', 50900, 81, 83]].map(([Continent, gdp, life, pop]) => ({ Continent, gdp, life, pop })) },
        semantic_types: { Continent: 'Category', gdp: 'Quantity', life: 'Quantity', pop: 'Quantity' },
        field_display_names: { pop: 'Population (M)' },
        chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'gdp', y: 'life', color: 'Continent', size: 'pop' }, baseSize: { width: 300, height: 300 }, canvasSize: { width: 450, height: 450 } },
        ...(theme ? { theme_spec: theme } : {}),
    } as any);

    it('draws a key to a size channel: round values as circles at the size the chart draws them, with its name', () => {
        for (const theme of [undefined, 'swiss', 'cartoon']) {
            const fig = bubbles(theme);
            const circles = (fig.layout.shapes ?? []).filter((s: any) => s.type === 'circle');
            expect(circles.length, String(theme)).toBeGreaterThanOrEqual(2);
            // Larger values, larger circles, in pixels so they stay round.
            const d = circles.map((c: any) => c.x1 - c.x0);
            expect([...d].sort((a, b) => a - b), String(theme)).toEqual(d);
            expect(circles.every((c: any) => c.xsizemode === 'pixel' && c.ysizemode === 'pixel')).toBe(true);
            expect(fig.layout.annotations.some((a: any) => /Population \(M\)/.test(a.text)), String(theme)).toBe(true);
            // The figure carries no private size bookkeeping.
            expect(fig.data.every((t: any) => t._sizeValues === undefined)).toBe(true);
        }
    });

    it('stacks a size key under a colour key beside the plot, in the room kept for the keys, the plot keeping its size', () => {
        const fig = bubbles();
        expect(fig.layout.legend.orientation ?? 'v').toBe('v');
        const plotWidth = fig.layout.width - fig.layout.margin.l - fig.layout.margin.r;
        // The planned 300 px plot, not a plot narrowed by the room the keys took twice.
        expect(plotWidth).toBeGreaterThanOrEqual(280);
        const circles = fig.layout.shapes.filter((c: any) => c.type === 'circle');
        expect(new Set(circles.map((c: any) => c.xanchor.toFixed(4))).size).toBe(1);
        expect(circles[0].xanchor).toBeGreaterThan(1);
    });

    it('keeps a size key beside the plot within the plot\u2019s height, or clear of the x axis\u2019s last label', () => {
        const sectors = ['Information technology', 'Health care and life sciences', 'Financial services', 'Consumer discretionary', 'Industrials and manufacturing', 'Energy and utilities', 'Communication services'];
        const fig: any = assemblePlotly({
            data: { values: Array.from({ length: 28 }, (_, i) => ({ Sector: sectors[i % 7], Revenue: 8 + i * 6, Margin: (i * 7) % 30 - 4, Staff: 2000 + (i * 3700) % 100000 })) },
            semantic_types: { Sector: 'Category', Revenue: 'Quantity', Margin: 'Percentage', Staff: 'Quantity' },
            field_display_names: { Staff: 'Employees' },
            chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'Revenue', y: 'Margin', color: 'Sector', size: 'Staff' }, baseSize: { width: 300, height: 300 }, canvasSize: { width: 450, height: 450 } },
        } as any);
        const circles = fig.layout.shapes.filter((c: any) => c.type === 'circle');
        expect(circles.length).toBeGreaterThanOrEqual(3);
        const m = fig.layout.margin;
        const plotWidth = fig.layout.width - m.l - m.r;
        const lowest = Math.min(...circles.map((c: any) => c.yanchor * (fig.layout.height - m.t - m.b) + c.y0));
        const left = Math.min(...circles.map((c: any) => c.xanchor * plotWidth + c.x0));
        // Within the plot's height, or right of the last x label's overhang.
        expect(lowest >= -2 || left >= plotWidth + plXEndOverhang(fig)).toBe(true);
    });

    it('sizes every series\u2019 bubbles on one scale from zero, as Vega-Lite does, and draws the largest first', () => {
        for (const theme of [undefined, 'cartoon', 'swiss']) {
            const fig = bubbles(theme);
            const all = fig.data.filter((t: any) => Array.isArray(t.marker?.size));
            // The same value draws the same size in any series: Europe's 83 M stands well under Asia's 1,393 M.
            const sizeOf = (name: string, i: number) => all.find((t: any) => t.name === name).marker.size[i];
            const europeLargest = Math.max(...all.find((t: any) => t.name === 'Europe').marker.size);
            const asiaLargest = Math.max(...all.find((t: any) => t.name === 'Asia').marker.size);
            expect(asiaLargest / europeLargest, String(theme)).toBeGreaterThan(2.5);
            void sizeOf;
            // Largest series drawn first; the key keeps the series' order.
            expect(all[0].name, String(theme)).toBe('Asia');
            const ranks = Object.fromEntries(all.map((t: any) => [t.name, t.legendrank]));
            expect(ranks.Europe, String(theme)).toBeLessThan(ranks.Asia);
            // Each series' bubbles are drawn largest first.
            for (const t of all) expect([...t.marker.size].sort((a: number, b: number) => b - a)).toEqual(t.marker.size);
        }
    });

    it('sets a house\u2019s outlined dots solid with their outline, the same in Plotly and Vega-Lite (Cartoon)', () => {
        const fig = bubbles('cartoon');
        const marker = fig.data[0].marker;
        expect(marker.opacity ?? 1).toBe(1);
        expect(marker.line.width).toBeGreaterThanOrEqual(2);
    });
});

describe('Plotly floors and calendar bands', () => {
    it('leaves off the line along a floor that is not zero where the house grids its values (Economist)', () => {
        const rows = Array.from({ length: 12 }, (_, i) => ({ income: 5 + i * 6, growth: 3.2 - i * 0.35 }));
        const fig: any = assemblePlotly({
            data: { values: rows }, semantic_types: { income: 'Quantity', growth: 'Percentage' },
            chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'income', y: 'growth' }, baseSize: { width: 300, height: 300 } },
            theme_spec: 'economist',
        } as any);
        // The y range reaches below zero, so the floor is not a base: zero carries it.
        expect(Math.min(...fig.layout.yaxis.range)).toBeLessThan(0);
        expect(fig.layout.xaxis.showline).toBe(false);
        expect(fig.layout.yaxis.zeroline).toBe(true);
    });

    it('names a band of months as a calendar does, flat, rather than one turned date a band', () => {
        const months = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`);
        const fig: any = assemblePlotly({
            data: { values: months.flatMap((period) => ['A', 'B', 'C'].map((game, g) => ({ period, game, users: g * 10 + months.indexOf(period) }))) },
            semantic_types: { period: 'YearMonth', game: 'Category', users: 'Quantity' },
            chart_spec: { chartType: 'Heatmap', encodings: { x: 'period', y: 'game', color: 'users' }, baseSize: { width: 300, height: 200 } },
        } as any);
        const x = fig.layout.xaxis;
        expect(x.tickangle).toBe(0);
        expect(x.ticktext[0]).toBe('Jan<br>2025');
        expect(x.ticktext.every((t: string) => !/^\d{4}-\d{2}$/.test(t))).toBe(true);
    });
});

describe('Plotly keys keep clear of the plot', () => {
    const products = ['Productivity suite (enterprise)', 'Productivity suite (consumer)', 'Cloud storage', 'Video meetings', 'Team chat', 'Developer tools', 'Analytics workspace', 'Security center'];
    const lines = (theme: string): any => assemblePlotly({
        data: { values: products.flatMap((Product, p) => [2021, 2022, 2023, 2024, 2025].map((Year, i) => ({ Year: String(Year), Product, Users: 40 + p * 15 + i * 6 }))) },
        semantic_types: { Year: 'Year', Product: 'Category', Users: 'Quantity' },
        chart_spec: { chartType: 'Line Chart', encodings: { x: 'Year', y: 'Users', color: 'Product' }, title: 'Monthly active users by product line', baseSize: { width: 300, height: 300 }, canvasSize: { width: 450, height: 450 } },
        theme_spec: theme,
    } as any);

    it('reserves the rows Plotly wraps a key on top into, so its last row does not run into the plot', () => {
        const fig = lines('swiss');
        const legend = fig.layout.legend;
        expect(legend.y).toBeGreaterThan(1);
        const key = keyBlock(PLOTLY_PROFILE.key, {
            entries: products.map((p) => [p]), fontSize: legend.font.size,
            widthOf: tableTextMeasurer(legend.font.size, legend.font.family, 'normal', 'normal'), orientation: 'horizontal',
            room: fig.layout.width - fig.layout.margin.r - fig.layout.margin.l * 0,
        });
        const plotH = fig.layout.height - fig.layout.margin.t - fig.layout.margin.b;
        // The key's foot stands at or above the plot's top.
        expect((legend.y - 1) * plotH - key.height).toBeGreaterThanOrEqual(-2);
    });

    it('stands a key at the foot under the x labels, in room of its own', () => {
        const fig = lines('apple');
        const legend = fig.layout.legend;
        expect(legend.y).toBeLessThan(0);
        expect(legend.yanchor).toBe('top');
        const plotH = fig.layout.height - fig.layout.margin.t - fig.layout.margin.b;
        // Hung below the labels, and the margin holds it.
        expect(-legend.y * plotH).toBeGreaterThanOrEqual(20);
        expect(fig.layout.margin.b).toBeGreaterThan(-legend.y * plotH + 30);
    });
});

describe('Plotly margins and facets', () => {
    it('stands bars over a run of months on Plotly\u2019s date axis, not one turned name a month', () => {
        const values = Array.from({ length: 24 }, (_, i) => ({ month: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, revenue: 100 + i }));
        const fig: any = assemblePlotly({
            data: { values }, semantic_types: { month: 'YearMonth', revenue: 'Amount' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: 'month', y: 'revenue' } },
        } as any);
        expect(fig.layout.xaxis.type).toBe('date');
        expect(fig.layout.xaxis.ticktext).toBeUndefined();
    });

    const months = ['North', 'South'].flatMap((Region, r) => Array.from({ length: 6 }, (_, i) => ({ Month: `2024-0${i + 1}-01`, Region, Orders: 20 + r * 6 + i })));

    it('keeps the y gutter to its labels, with no fixed floor', () => {
        const fig: any = assemblePlotly({
            data: { values: months }, semantic_types: { Month: 'Date', Region: 'Category', Orders: 'Quantity' },
            chart_spec: { chartType: 'Line Chart', encodings: { x: 'Month', y: 'Orders', color: 'Region' }, canvasSize: { width: 450, height: 450 } },
            theme_spec: 'nyt',
        } as any);
        // Two-figure labels, their 7 px standoff and Plotly's own 11 px: far under the old 64 px floor.
        expect(fig.layout.margin.l).toBeLessThan(40);
        expect(fig.layout.margin.l).toBeGreaterThan(20);
    });

    it('removes an axis title the house moved into the deck, so Plotly keeps no room for it', () => {
        const fig: any = assemblePlotly({
            data: { values: months }, semantic_types: { Month: 'Date', Region: 'Category', Orders: 'Quantity' },
            chart_spec: { chartType: 'Line Chart', encodings: { x: 'Month', y: 'Orders', color: 'Region' }, title: 'Orders' },
            theme_spec: 'economist',
        } as any);
        for (const key of ['xaxis', 'yaxis']) {
            const title = fig.layout[key]?.title;
            expect(title === undefined || String(title.text ?? '').trim() !== '').toBe(true);
        }
    });

    it('stands a tall key of long names beside the plot when that fits the box', () => {
        const names = ['Democratic Republic of the Congo', 'Bosnia and Herzegovina', 'Central African Republic', 'Trinidad and Tobago', 'Papua New Guinea',
            'Saint Vincent and the Grenadines', 'United Arab Emirates', 'Dominican Republic', 'Equatorial Guinea', 'Sao Tome and Principe'];
        const fig: any = assemblePlotly({
            data: { values: names.flatMap((Country, i) => [0, 1, 2].map((k) => ({ Country, Spending: 2 + ((i * 3 + k * 5) % 14), Growth: ((i * 5 + k * 7) % 11) - 3 }))) },
            semantic_types: { Country: 'Country', Spending: 'Percentage', Growth: 'Percentage' },
            chart_spec: {
                chartType: 'Scatter Plot', encodings: { x: 'Spending', y: 'Growth', color: 'Country' }, title: 'Spending and growth', subtitle: 'Three years per country',
                baseSize: { width: 300, height: 300 }, canvasSize: { width: 450, height: 450 },
            },
            theme_spec: 'datawrapper',
        } as any);
        expect(fig._canvasFit?.treatment?.keys).toBe('side');
        expect(fig.layout.legend.orientation).toBe('v');
        expect(fig.layout.legend.x).toBeGreaterThanOrEqual(1);
    });

    it('ticks a facet panel\u2019s values from the panel\u2019s own height, not the house\u2019s count shared out over the grid', () => {
        const countries = ['United States', 'Germany', 'Japan', 'Spain'];
        const fig: any = assemblePlotly({
            data: { values: countries.flatMap((Country, c) => [2000, 2005, 2010, 2015, 2020].map((year, i) => ({ Year: `${year}-01-01`, Country, Rate: 3 + ((c * 5 + i * 3) % 20) }))) },
            semantic_types: { Year: 'Date', Country: 'Country', Rate: 'Percentage' },
            chart_spec: { chartType: 'Line Chart', encodings: { x: 'Year', y: 'Rate', column: 'Country' }, baseSize: { width: 300, height: 300 }, canvasSize: { width: 450, height: 450 } },
            theme_spec: 'swiss',
        } as any);
        const y = fig.layout.yaxis;
        // At least four labelled ticks, the range on round steps.
        expect((y.range[1] - y.range[0]) / y.dtick).toBeGreaterThanOrEqual(4);
        expect(y.range[0] % y.dtick).toBe(0);
        expect(y.range[1] % y.dtick).toBe(0);
        expect(y._framedTicks).toBeUndefined();
    });

    it('ticks a panel\u2019s years by the width it is drawn at: the finest round step whose labels stand apart', () => {
        const countries = ['United States', 'Germany', 'Japan', 'Spain'];
        const rows = countries.flatMap((Country, c) => [2000, 2005, 2010, 2015, 2020, 2022].map((year, i) => ({ Year: `${year}-01-01`, Country, Rate: 3 + ((c + i) % 9) })));
        const years = (encodings: Record<string, string>) => {
            const fig: any = assemblePlotly({
                data: { values: rows }, semantic_types: { Year: 'Date', Country: 'Country', Rate: 'Percentage' },
                chart_spec: { chartType: 'Line Chart', encodings, baseSize: { width: 300, height: 300 }, canvasSize: { width: 450, height: 450 } },
            } as any);
            const keys = Object.keys(fig.layout).filter((k) => /^xaxis\d*$/.test(k)).sort();
            return fig.layout[keys[keys.length - 1]].ticktext as string[];
        };
        // Stacked rows: one wide panel, a label every five years.
        expect(years({ x: 'Year', y: 'Rate', row: 'Country' })).toEqual(['2000', '2005', '2010', '2015', '2020']);
        // Side by side: narrow panels, every ten.
        expect(years({ x: 'Year', y: 'Rate', column: 'Country' })).toEqual(['2000', '2010', '2020']);
    });

    it('lays a facet grid out around its labels: one y title, x labels under each column only', () => {
        const countries = Array.from({ length: 12 }, (_, i) => `Country ${i + 1}`);
        const fig: any = assemblePlotly({
            data: { values: countries.flatMap((Country, c) => [2000, 2005, 2010, 2015, 2020].map((year) => ({ Year: `${year}-01-01`, Country, Rate: 3 + ((c + year) % 9) }))) },
            semantic_types: { Year: 'Date', Country: 'Country', Rate: 'Percentage' },
            chart_spec: { chartType: 'Line Chart', encodings: { x: 'Year', y: 'Rate', column: 'Country' }, baseSize: { width: 300, height: 300 }, canvasSize: { width: 450, height: 450 } },
        } as any);
        expect(fig._facet).toBe(true);
        const yAxes = Object.keys(fig.layout).filter((k) => /^yaxis\d*$/.test(k));
        expect(yAxes.every((k) => !fig.layout[k].title)).toBe(true);
        const yTitle = fig.layout.annotations.filter((a: any) => a.textangle === -90);
        expect(yTitle).toHaveLength(1);
        // A panel with another below it leaves its x labels to that one.
        const cols = fig._facetCols;
        expect(fig.layout.xaxis.showticklabels).toBe(fig._facetRows > 1 ? false : undefined);
        const last = `xaxis${fig._facetRows * cols > 1 ? countries.length : ''}`;
        expect(fig.layout[last].showticklabels).not.toBe(false);
        // Times along x stand flat, thinned to what the panel holds.
        expect(fig.layout.xaxis.tickangle).toBe(0);
        expect(fig.layout[last].ticktext.length).toBeGreaterThanOrEqual(2);
    });
});
