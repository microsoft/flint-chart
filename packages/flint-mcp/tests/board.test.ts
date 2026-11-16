import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { VIEW_RESOURCE_URI, createServer } from '../src/server.js';
import { RESULT_COPY_LIMIT } from '../src/board.js';

const rows = [
  { country: 'Japan', region: 'Asia', gdp: 4.2, life: 84 },
  { country: 'India', region: 'Asia', gdp: 3.7, life: 70 },
  { country: 'France', region: 'Europe', gdp: 3.0, life: 82 },
  { country: 'Brazil', region: 'Americas', gdp: 2.1, life: 76 },
];

const scatter = {
  id: 'countries',
  data: { values: rows },
  semantic_types: { country: 'Country', region: 'Category', gdp: 'Quantity', life: 'Quantity' },
  chart_spec: { chartType: 'Scatter Plot', title: 'Wealth and health', encodings: { x: 'gdp', y: 'life', color: 'region' } },
  interaction_spec: { interactions: [{ type: 'select' }] },
};

const bars = {
  id: 'by-country',
  data: { values: rows },
  semantic_types: { country: 'Country', gdp: 'Quantity' },
  chart_spec: { chartType: 'Bar Chart', title: 'GDP by country', encodings: { x: 'country', y: 'gdp' } },
};

let client: Client;
let server: McpServer;

beforeAll(async () => {
  server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'flint-board-test', version: '0.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client?.close();
  await server?.close();
});

const text = (result: any): string => result.content[0].text;
const check = (board: Record<string, unknown>): Promise<any> => client.callTool({ name: 'validate_board', arguments: board });
const showBoard = (board: Record<string, unknown>): Promise<any> => client.callTool({ name: 'show', arguments: { board } });

describe('board tools', () => {
  it('validate_board reports every chart and what each links, and opens no card; show draws the same board', async () => {
    const spec = { title: 'Countries', charts: [{ ...scatter, chart_spec: { ...scatter.chart_spec, encodings: { ...scatter.chart_spec.encodings, detail: 'country' } } }, bars], link_spec: { fields: ['country'] } };
    const result: any = await check(spec);
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain('2 charts (countries, by-country)');
    // Two charts under a title ask for no deck or chart headings; link notes are not to fix.
    expect(text(result)).toContain('Nothing to fix: call show with this spec.');
    expect(text(result)).toContain('Layout: row 1 (standard): countries (half), by-country (half).');
    expect(text(result)).toContain('Link notes (country); change nothing unless the user asked for that connection:');
    expect(text(result)).toContain('- by-country: sends nothing: no interaction that selects');
    expect(text(result)).not.toContain('Encodings:');
    expect(text(result)).not.toContain('User interactions');
    expect(result._meta).toBeUndefined();

    const shown: any = await showBoard(spec);
    expect(text(shown)).toContain('The board is on screen in a new card.');
    expect(text(shown)).toContain('- by-country: sends nothing');
    const board = shown._meta.flint.board;
    expect(board.charts.map((chart: any) => chart.id)).toEqual(['countries', 'by-country']);
    expect(board.linked['by-country']).toMatchObject({ sends: [], receives: ['country'] });

    const { tools } = await client.listTools();
    expect((tools.find((entry) => entry.name === 'validate_board') as any)._meta?.ui).toBeUndefined();
    const show = tools.find((tool) => tool.name === 'show') as any;
    expect(show._meta.ui.resourceUri).toBe(VIEW_RESOURCE_URI);
    expect(show._meta.ui.visibility).toBeUndefined();
  });

  it('marks a chart that joins no field, honours receive: false, and names an unknown chart', async () => {
    const result: any = await check({ charts: [scatter, bars], link_spec: { fields: ['continent', 'region'], charts: { countries: { receive: false }, ghost: {} } } });
    expect(text(result)).toContain('- countries: leaves out continent: no field continent in its data');
    expect(text(result)).toContain('✗ by-country: not linked; leaves out continent');
    expect(text(result)).toContain('✗ ghost: not linked; no chart "ghost" among the linked charts');
    expect(text(result)).toContain('✗ continent joins nothing: no chart carries it');
  });

  it('links a chart once its marks carry the field', async () => {
    const clickable = { ...bars, interaction_spec: { interactions: [{ type: 'click-highlight' }] } };
    const result: any = await check({ charts: [scatter, clickable], link_spec: { fields: ['country'] } });
    expect(text(result)).toContain('✗ countries: not linked; leaves out country: its marks do not carry country; encode it, on detail');
    const detailed = { ...scatter, chart_spec: { ...scatter.chart_spec, encodings: { ...scatter.chart_spec.encodings, detail: 'country' } } };
    const fixed: any = await check({ charts: [detailed, clickable], link_spec: { fields: ['country'] } });
    expect(text(fixed)).not.toContain('Links');

    // A bar chart of another category carries the linked field on detail, one segment per value.
    const byRegion = { ...bars, id: 'by-region', semantic_types: { ...bars.semantic_types, region: 'Category' }, chart_spec: { ...bars.chart_spec, encodings: { x: 'region', y: 'gdp', detail: 'country' } } };
    const hovering = { ...detailed, interaction_spec: { interactions: [{ type: 'select' }, { type: 'hover-group-focus', options: { groupBy: 'region' } }] } };
    const both: any = await showBoard({ charts: [hovering, clickable, byRegion], link_spec: { fields: ['country', 'region'] } });
    expect(both._meta.flint.board.linked.countries.gestures['hover-group-focus']).toEqual({ preset: 'hover-group-focus', fields: ['region'], hover: true });

    const viaDetail: any = await showBoard({ charts: [detailed, byRegion], link_spec: { fields: ['country'] } });
    expect(text(viaDetail)).not.toContain('by-region: not linked');
    expect(viaDetail._meta.flint.board.linked['by-region']).toMatchObject({ receives: ['country'] });
  });

  it('validate_board leaves a chart with errors off and says why; show draws nothing for it', async () => {
    const spec = { charts: [scatter, { ...bars, chart_spec: { ...bars.chart_spec, chartType: 'Not A Chart' } }] };
    const result: any = await check(spec);
    expect(text(result)).toContain('1 chart (countries)');
    expect(text(result)).toMatch(/by-country:\n- ✗ not drawn: /);
    const shown: any = await showBoard(spec);
    expect(shown.isError).toBe(true);
    expect(text(shown)).toMatch(/^Nothing was drawn: by-country ✗ not drawn: .*Fix the spec and call show again\.$/);
    expect(shown._meta.flint.error).toBe(text(shown));
  });

  it('keeps nothing between calls: each call builds the board from its spec alone', async () => {
    const first: any = await showBoard({ title: 'T', charts: [scatter] });
    const second: any = await showBoard({ title: 'T', charts: [scatter, bars] });
    expect(first._meta.flint.board.charts).toHaveLength(1);
    expect(second._meta.flint.board.charts).toHaveLength(2);
    expect(second._meta.flint.board.id).not.toBe(first._meta.flint.board.id);
    const elsewhere = createServer();
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await elsewhere.connect(serverSide);
    const other = new Client({ name: 'another-process', version: '0.0.0' });
    await other.connect(clientSide);
    try {
      const again: any = await other.callTool({ name: 'show', arguments: { board: { title: 'T', charts: [scatter, bars] } } });
      expect(again._meta.flint.board.charts.map((chart: any) => chart.id)).toEqual(['countries', 'by-country']);
    } finally {
      await other.close();
      await elsewhere.close();
    }
  });

  it('show takes one of chart or board', async () => {
    const neither: any = await client.callTool({ name: 'show', arguments: {} });
    expect(neither.isError).toBe(true);
    expect(text(neither)).toContain('Pass one of chart or board.');
    const both: any = await client.callTool({ name: 'show', arguments: { chart: { data: bars.data, chart_spec: bars.chart_spec }, board: { charts: [bars] } } });
    expect(both.isError).toBe(true);
  });

  it('reports the layout and what the board should still fix', async () => {
    const kpi = (id: string, metric: string) => ({ id, data: { values: [{ metric, value: 3, goal: 2 }] }, chart_spec: { chartType: 'KPI Card', encodings: { metric: 'metric', value: 'value', goal: 'goal' } } });
    const trend = {
      id: 'trend',
      data: { values: rows.map((row, at) => ({ ...row, year: 2020 + at })) },
      chart_spec: { chartType: 'Line Chart', encodings: { x: 'year', y: 'gdp', color: 'region' } },
    };
    const charts = [kpi('k1', 'Sales'), kpi('k2', 'Margin'), kpi('k3', 'Churn'), trend, scatter, { ...bars, theme_spec: 'nyt' }];
    const report = text(await check({ charts }));
    expect(report).toContain('Layout: row 1, KPI tiles (compact): k1 (a third), k2 (a third), k3 (a third); row 2 (tall): trend (full width); row 3 (standard): countries (half), by-country (half).');
    expect(report).toContain('- No board title');
    expect(report).toContain('- No title on trend:');
    expect(report).not.toContain('colour by region');

    const themed = text(await check({ title: 'Countries', subtitle: 'GDP and life expectancy', theme_spec: 'economist', charts }));
    expect(themed).toContain('Charts set their own themes');
    const narrowed = text(await check({ charts: [kpi('k1', 'Sales'), { ...trend, layout: { span: 1, height: 'compact' } }, scatter] }));
    expect(narrowed).toContain('row 2 (standard): trend (half), countries (half)');
  });

  it('splits five KPI tiles three and two, and leaves a measure on colour alone', async () => {
    const kpi = (id: string) => ({ id, data: { values: [{ metric: id, value: 1 }] }, chart_spec: { chartType: 'KPI Card', encodings: { metric: 'metric', value: 'value' } } });
    const heat = (id: string) => ({
      id,
      data: { values: rows.map((row) => ({ ...row, year: '2025' })) },
      chart_spec: { chartType: 'Heatmap', title: id, encodings: { x: 'year', y: 'country', color: 'gdp' } },
    });
    const report = text(await check({ title: 'T', subtitle: 'S', charts: [kpi('a'), kpi('b'), kpi('c'), kpi('d'), kpi('e'), heat('h1'), heat('h2')] }));
    expect(report).toContain('row 1, KPI tiles (compact): a (a third), b (a third), c (a third); row 2, KPI tiles (compact): d (half), e (half)');
    expect(report).not.toContain('colour by gdp');
  });

  it('keeps the reader\'s arrangement passed as grid, fitted to the charts the board has now', async () => {
    const grid = [{ id: 'by-country', x: 0, y: 0, w: 12, h: 17 }, { id: 'countries', x: 0, y: 17, w: 6, h: 17 }];
    const kept: any = await showBoard({ title: 'T', subtitle: 'S', charts: [scatter, bars], grid });
    expect(kept._meta.flint.board.grid).toEqual(grid);
    expect(text(kept)).toContain("Layout: the reader's grid; keep passing it, or leave it out for rows. by-country: columns 1–12, rows 1–17 (full width, 340px tall)");

    const added: any = await check({ title: 'T', subtitle: 'S', charts: [scatter, bars, { ...bars, id: 'more' }], grid });
    expect(text(added)).toContain('more: columns 1–6, rows 35–51');
    const fewer: any = await check({ title: 'T', subtitle: 'S', charts: [scatter], grid });
    expect(text(fewer)).not.toContain('by-country');
    expect(text(fewer)).toContain('countries: columns 1–6, rows 18–34');

    const clash: any = await check({ title: 'T', subtitle: 'S', charts: [scatter, bars], grid: [grid[0], { ...grid[1], y: 5 }] });
    expect(text(clash)).toContain('The grid was dropped for the rows: by-country overlaps another chart.');
    expect(text(clash)).toContain('Layout: row 1 (standard): countries (half), by-country (half).');
  });

  it('holds a Table of rows and a chart opened as its table', async () => {
    const table = { id: 'list', data: { values: rows }, chart_spec: { chartType: 'Table', title: 'Countries', encodings: {} } };
    const shown: any = await showBoard({ title: 'T', subtitle: 'S', charts: [table, { ...bars, view: 'table' }], link_spec: { fields: ['country'] } });
    expect(text(shown)).toContain('- list: sends nothing: a Table does not send selections');
    expect(shown._meta.flint.board.charts.map((chart: any) => chart.view)).toEqual([undefined, 'table']);

    const encoded: any = await check({ charts: [{ ...table, id: 'bad', chart_spec: { chartType: 'Table', encodings: { x: 'country' } } }] });
    expect(text(encoded)).toContain('Table takes no encodings');
  });

  it('says a finding several charts share once, and that a clean board has nothing to fix', async () => {
    const odd = { gdp: 'Wealth', life: 'Quantity', country: 'Country', region: 'Category' };
    const report = text(await check({ title: 'T', subtitle: 'S', charts: [{ ...scatter, semantic_types: odd }, { ...bars, semantic_types: odd }] }));
    expect(report).toContain('countries, by-country:\n- semantic_types.gdp "Wealth" is not a registered semantic type');
    expect(report.match(/"Wealth"/g)).toHaveLength(1);

    const carried = { ...scatter, chart_spec: { ...scatter.chart_spec, encodings: { ...scatter.chart_spec.encodings, detail: 'country' } } };
    const byRegion = { ...bars, id: 'by-region', semantic_types: { ...bars.semantic_types, region: 'Category' }, chart_spec: { ...bars.chart_spec, encodings: { x: 'region', y: 'gdp', detail: 'country' } } };
    const noted = text(await check({ title: 'T', subtitle: 'S', charts: [carried, { ...bars, interaction_spec: { interactions: [{ type: 'click-highlight' }] } }, byRegion], link_spec: { fields: ['country', 'region'] } }));
    expect(noted).toContain('Nothing to fix: call show with this spec.');
    expect(noted).toContain('- by-country: leaves out region');

    const clean = text(await check({ title: 'T', subtitle: 'S', charts: [scatter, bars] }));
    expect(clean).toBe('Board "T": 2 charts (countries, by-country).\nNothing to fix: call show with this spec.\nLayout: row 1 (standard): countries (half), by-country (half).');
  });

  it('flags a chart that stacks repeated rows as slices, and not once it sums them', async () => {
    const monthly = [1, 2, 3].flatMap((month) => rows.map((row) => ({ ...row, month })));
    const sliced = { id: 'sliced', data: { values: monthly }, chart_spec: { chartType: 'Bar Chart', title: 'GDP', encodings: { y: 'country', x: 'gdp', color: 'region' } } };
    expect(text(await check({ title: 'T', subtitle: 'S', charts: [sliced] }))).toContain('sliced draws 12 rows as 4 country × region groups, so each mark is a stack of slices, one per row: sum the rows first, or set encodings.x.aggregate to "sum"');
    const summed = { ...sliced, chart_spec: { ...sliced.chart_spec, encodings: { y: 'country', x: { field: 'gdp', aggregate: 'sum' }, color: 'region' } } };
    expect(text(await check({ title: 'T', subtitle: 'S', charts: [summed] }))).not.toContain('stack of slices');
    // A number that splits the marks (a year on a heatmap's axis) is a category, not the measure.
    const cells = { id: 'cells', data: { values: monthly }, semantic_types: { month: 'Month', country: 'Country', gdp: 'Amount' }, chart_spec: { chartType: 'Heatmap', title: 'GDP', encodings: { x: 'month', y: 'country', color: 'gdp' } } };
    expect(text(await check({ title: 'T', subtitle: 'S', charts: [cells] }))).not.toContain('stack of slices');
    // A heatmap coloured by a field not typed as a measure (match points) still reads its colour as the measure.
    const games = [1, 2, 3, 4, 5, 6].flatMap((game) => rows.map((row) => ({ country: row.country, game, points: game % 2 ? 3 : 0 })));
    const results = { id: 'results', data: { values: games }, semantic_types: { game: 'Number', country: 'Country', points: 'Category' }, chart_spec: { chartType: 'Heatmap', title: 'Results', encodings: { x: 'game', y: 'country', color: 'points' } } };
    expect(text(await check({ title: 'T', subtitle: 'S', charts: [results] }))).not.toContain('stack of slices');
  });

  it('show holds a board it must not draw and returns the fixes; the fixed board draws', async () => {
    const monthly = [1, 2, 3].flatMap((month) => rows.map((row) => ({ ...row, month })));
    const sliced = { id: 'sliced', data: { values: monthly }, chart_spec: { chartType: 'Bar Chart', title: 'GDP', encodings: { y: 'country', x: 'gdp' } } };
    const held: any = await showBoard({ title: 'T', charts: [sliced, scatter] });
    expect(held.isError).toBe(true);
    expect(held._meta.flint.held).toBeTruthy();
    expect(held._meta.flint.board).toBeUndefined();
    expect(text(held)).toContain('Not drawn yet: fix what this report lists');
    expect(text(held)).toContain('Fix before it draws:\nReview:\n- sliced draws 12 rows as 4 country groups');
    const summed = { ...sliced, chart_spec: { ...sliced.chart_spec, encodings: { y: 'country', x: { field: 'gdp', aggregate: 'sum' } } } };
    const drawn: any = await showBoard({ title: 'T', charts: [summed, scatter] });
    expect(drawn.isError).toBeFalsy();
    expect(text(drawn)).toContain('The board is on screen in a new card.');
  });

  it('says nothing of a KPI tile or a chart taken out of the link', async () => {
    const tile = { id: 'tile', data: { values: [{ metric: 'GDP', value: 13 }] }, chart_spec: { chartType: 'KPI Card', encodings: { metric: 'metric', value: 'value' } } };
    const carried = { ...scatter, chart_spec: { ...scatter.chart_spec, encodings: { ...scatter.chart_spec.encodings, detail: 'country' } } };
    const clickable = { ...bars, interaction_spec: { interactions: [{ type: 'click-highlight' }] } };
    const out = { ...bars, id: 'aside', chart_spec: { ...bars.chart_spec, encodings: { x: 'region', y: 'gdp', detail: 'country' } } };
    const report = text(await check({ title: 'T', subtitle: 'S', charts: [tile, carried, clickable, out], link_spec: { fields: ['country'], charts: { aside: { send: false, receive: false } } } }));
    expect(report).toContain('Nothing to fix');
    expect(report).not.toMatch(/^- (✗ )?(tile|aside)\b/m);
  });

  it('binds the board\'s colours to every chart that colours by the field, under a chart\'s own', async () => {
    const byRegion = { ...bars, id: 'by-region', semantic_types: { region: 'Category', gdp: 'Quantity' }, chart_spec: { chartType: 'Bar Chart', title: 'G', encodings: { x: 'region', y: 'gdp', color: 'region', detail: 'country' } } };
    const own = { ...scatter, semantic_types: { ...scatter.semantic_types, region: { semanticType: 'Category', colors: { Asia: '#000000' } } } };
    const shown: any = await showBoard({ title: 'T', colors: { region: { Asia: '#c0392b', Europe: '#2e75b6' } }, charts: [own, byRegion, bars] });
    const [countries, regions, plain] = shown._meta.flint.board.charts;
    expect(regions.input.semantic_types.region.colors).toEqual({ Asia: '#c0392b', Europe: '#2e75b6' });
    expect(countries.input.semantic_types.region.colors).toEqual({ Asia: '#000000', Europe: '#2e75b6' });
    expect(plain.input.semantic_types.region).toBeUndefined();
    expect(shown._meta.flint.board.colors).toEqual({ region: { Asia: '#c0392b', Europe: '#2e75b6' } });
  });

  it('notes a chart that sizes itself on a board: the layout sizes it', async () => {
    const sized = { ...bars, chart_spec: { ...bars.chart_spec, baseSize: { width: 1000, height: 400 } } };
    expect(text(await check({ title: 'T', charts: [scatter, sized] }))).toContain('by-country set baseSize or canvasSize: on a board each chart takes its cell\'s size');
  });

  it('show also puts a small inline chart in structuredContent, for a host that drops _meta', async () => {
    const result: any = await client.callTool({ name: 'show', arguments: { chart: { data: bars.data, semantic_types: bars.semantic_types, chart_spec: bars.chart_spec } } });
    expect(text(result)).toContain('The chart is on screen in a new card.');
    expect(result.structuredContent.flint.board).toEqual(result._meta.flint.board);
    expect(result.structuredContent.flint.board.charts[0].input.data.values).toHaveLength(4);
  });

  it('show keeps a large chart, or one read from a local file, out of structuredContent', async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ country: `Country ${i}`, gdp: i * 1000 }));
    const big: any = await client.callTool({ name: 'show', arguments: { chart: { data: { values: many }, semantic_types: bars.semantic_types, chart_spec: bars.chart_spec } } });
    expect(JSON.stringify(big._meta.flint.board).length).toBeGreaterThan(RESULT_COPY_LIMIT);
    expect(big.structuredContent).toBeUndefined();
    expect(big._meta.flint.board.charts[0].input.data.values).toHaveLength(200);

    const dir = mkdtempSync(join(tmpdir(), 'flint-show-'));
    try {
      const file = join(dir, 'gdp.json');
      writeFileSync(file, JSON.stringify(rows));
      const local: any = await client.callTool({ name: 'show', arguments: { chart: { data: { url: file }, semantic_types: bars.semantic_types, chart_spec: bars.chart_spec } } });
      expect(local.structuredContent).toBeUndefined();
      expect(local._meta.flint.board.charts[0].input.data.values).toHaveLength(rows.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('serves the board view as the chart bundle marked for the board', async () => {
    const { contents } = await client.readResource({ uri: VIEW_RESOURCE_URI });
    expect(contents[0].mimeType).toContain('mcp-app');
  });
});
