import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { pathToFileURL } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer, skillSection } from '../src/server.js';

const barChart = {
  data: {
    values: [
      { region: 'North', revenue: 120 },
      { region: 'South', revenue: 90 },
      { region: 'East', revenue: 150 },
    ],
  },
  semantic_types: { region: 'Category', revenue: 'Quantity' },
  chart_spec: {
    chartType: 'Bar Chart',
    encodings: { x: { field: 'region' }, y: { field: 'revenue' } },
    // Real calls carry a headline: it is the first thing a house styles, and
    // some (the Economist's masthead tab) hang furniture off it. A titleless
    // fixture exercises a chart nobody actually asks for.
    title: 'Revenue by region',
    subtitle: 'FY2024, $m',
    baseSize: { width: 320, height: 220 },
  },
};

function resourceText(content: { uri: string; text?: string; blob?: string }): string {
  if (typeof content.text === 'string') return content.text;
  throw new Error(`expected text content for ${content.uri}`);
}

let client: Client;
let server: McpServer;

beforeAll(async () => {
  server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'flint-mcp-test', version: '0.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client?.close();
  await server?.close();
});

/** show with a chart spec: the report, and the chart as the card is handed it. */
async function drawChart(args: Record<string, unknown>, on: Client = client): Promise<{ created: any; chart?: any }> {
  const created: any = await on.callTool({ name: 'show', arguments: { chart: args } });
  if (created.isError) return { created };
  return { created, chart: created._meta.flint.board.charts[0] };
}

describe('MCP server with client roots', () => {
  it('looks up a relative data.url in the folders the client announces', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'flint-roots-'));
    writeFileSync(join(dir, 'sales.csv'), 'region,revenue\nEast,120\nWest,90\n');
    const rootsServer = createServer();
    const rootsClient = new Client({ name: 'flint-mcp-roots', version: '0.0.0' }, { capabilities: { roots: {} } });
    rootsClient.setRequestHandler(ListRootsRequestSchema, async () => ({ roots: [{ uri: pathToFileURL(dir).href }] }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await rootsServer.connect(serverTransport);
    await rootsClient.connect(clientTransport);
    try {
      const result: any = await rootsClient.callTool({
        name: 'validate_chart',
        arguments: {
          backend: 'vegalite',
          data: { url: 'sales.csv' },
          chart_spec: { chartType: 'Bar Chart', encodings: { x: 'region', y: 'revenue' } },
        },
      });
      expect(result.content[0].text).toBe('Nothing to fix: call show with this spec.');
    } finally {
      await rootsClient.close();
      await rootsServer.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('MCP server', () => {
  it('lists the chart tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'compile_chart',
      'get_flint_skill',
      'list_chart_types',
      'list_interaction_presets',
      'list_themes',
      'render_chart',
      'show',
      'validate_board',
      'validate_chart',
    ]);
  });

  it('get_flint_skill returns the same text as the skill resources', async () => {
    for (const [skill, uri] of [
      ['chart', 'flint://agent-skill'],
      ['theme', 'flint://theme-skill'],
      ['interaction', 'flint://interaction-skill'],
      ['board', 'flint://board-skill'],
    ]) {
      const res: any = await client.callTool({ name: 'get_flint_skill', arguments: { skill } });
      const resource: any = await client.readResource({ uri });
      expect(res.isError, skill).toBeFalsy();
      expect(res.content[0].text, skill).toBe(resource.contents[0].text);
    }
  });

  it('get_flint_skill returns one section, or the headings for an unknown one', async () => {
    const res: any = await client.callTool({
      name: 'get_flint_skill',
      arguments: { skill: 'interaction', section: 'Update the chart' },
    });
    const text: string = res.content[0].text;
    expect(text.startsWith('## Update the chart\n')).toBe(true);
    expect(text).toContain('### Step 2 — choose ops');
    expect(text).not.toContain('## Use Flint in an application');

    const bad: any = await client.callTool({
      name: 'get_flint_skill',
      arguments: { skill: 'interaction', section: 'Change the chart' },
    });
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toContain('"Update the chart"');
  });

  it('skillSection takes a heading by its start, or without case and punctuation, when only one heading fits', () => {
    const text = '# Skill\n\n## Step 4 — write the spec\nA\n\n## Link charts, and more\nB\n\n## Update the chart\nC\n\n## Update the board\nD\n';
    expect(skillSection(text, 'step 4 write the spec')).toBe('## Step 4 — write the spec\nA\n');
    expect(skillSection(text, '## Link charts')).toBe('## Link charts, and more\nB\n');
    expect(() => skillSection(text, 'Update')).toThrow('No section "Update"');
    expect(() => skillSection(text, 'Upd')).toThrow('No section "Upd"');
    expect(skillSection(text, 'Update the board')).toBe('## Update the board\nD\n');
  });

  it('render_chart returns inline PNG image content', async () => {
    const res: any = await client.callTool({
      name: 'render_chart',
      arguments: { ...barChart, backend: 'echarts', format: 'png' },
    });
    expect(res.isError).toBeFalsy();
    const image = res.content.find((c: any) => c.type === 'image');
    expect(image).toBeTruthy();
    expect(image.mimeType).toBe('image/png');
    expect(typeof image.data).toBe('string');
    expect(image.data.length).toBeGreaterThan(1000);
  });

  it('render_chart returns SVG text for vegalite', async () => {
    const res: any = await client.callTool({
      name: 'render_chart',
      arguments: { ...barChart, backend: 'vegalite', format: 'svg' },
    });
    expect(res.isError).toBeFalsy();
    const svg = res.content.find((c: any) => c.type === 'text' && c.text.includes('<svg'));
    expect(svg).toBeTruthy();
  });

  it('compile_chart returns a backend spec with no private keys', async () => {
    const res: any = await client.callTool({
      name: 'compile_chart',
      arguments: { ...barChart, backend: 'echarts' },
    });
    expect(res.isError).toBeFalsy();
    const payload = JSON.parse(res.content[0].text);
    expect(payload.backend).toBe('echarts');
    expect(payload.spec).toBeTruthy();
    expect(Object.keys(payload.spec).some((k) => k.startsWith('_'))).toBe(false);
    expect(Array.isArray(payload.warnings)).toBe(true);
  });

  it('validate_chart flags an unknown chart type as invalid', async () => {
    const res: any = await client.callTool({
      name: 'validate_chart',
      arguments: {
        ...barChart,
        chart_spec: { ...barChart.chart_spec, chartType: 'Not A Real Chart' },
        backend: 'vegalite',
      },
    });
    expect(res.content).toHaveLength(1);
    expect(res.content[0].text).toMatch(/^Nothing is on screen: fix what this report lists, then call show with the same spec\.\n- ✗ .*Not A Real Chart/);
  });

  it('validate_chart accepts a valid spec, and keeps the JSON result for other backends', async () => {
    const res: any = await client.callTool({
      name: 'validate_chart',
      arguments: { ...barChart, backend: 'vegalite' },
    });
    expect(res.content).toHaveLength(1);
    expect(res.content[0].text).toBe('Nothing to fix: call show with this spec.');
    const echarts: any = await client.callTool({ name: 'validate_chart', arguments: { ...barChart, backend: 'echarts' } });
    expect(JSON.parse(echarts.content[0].text).valid).toBe(true);
  });

  it('validate_chart rejects malformed specs before assembly', async () => {
    for (const chart_spec of [
      { ...barChart.chart_spec, encodings: {} },
      { ...barChart.chart_spec, encodings: { x: { field: 'missing' }, y: { field: 'revenue' } } },
      {
        ...barChart.chart_spec,
        encodings: { x: { field: 'region' }, y: { field: 'revenue' }, banana: { field: 'region' } },
      },
    ]) {
      const res: any = await client.callTool({
        name: 'validate_chart',
        arguments: { ...barChart, chart_spec, backend: 'vegalite' },
      });
      expect(res.content[0].text).toContain('- ✗ ');
    }
  });

  it('list_interaction_presets describes every preset with its options', async () => {
    const all: any = await client.callTool({ name: 'list_interaction_presets', arguments: {} });
    const { presets } = JSON.parse(all.content[0].text);
    expect(presets.length).toBeGreaterThan(20);
    const highlight = presets.find((preset: any) => preset.type === 'click-highlight');
    expect(highlight.requires).toContain('elements');
    expect(highlight.defaultReset).toEqual(['click-none', 'escape']);
    expect(highlight.options.map((option: any) => option.name)).toEqual(['dimOpacity', 'targets', 'reset']);

    const pie: any = await client.callTool({ name: 'list_interaction_presets', arguments: { chartType: 'Pie Chart' } });
    const pieTypes = JSON.parse(pie.content[0].text).presets.map((preset: any) => preset.type);
    expect(pieTypes).toContain('brush-angle');
    expect(pieTypes).not.toContain('navigate');

    const one: any = await client.callTool({ name: 'list_interaction_presets', arguments: { type: 'navigate' } });
    expect(JSON.parse(one.content[0].text).presets).toHaveLength(1);

    const bad: any = await client.callTool({ name: 'list_interaction_presets', arguments: { type: 'zoom' } });
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toContain('Unknown interaction preset');
  });

  it('list_chart_types enumerates chart types per backend', async () => {
    const res: any = await client.callTool({
      name: 'list_chart_types',
      arguments: { backend: 'vegalite' },
    });
    const payload = JSON.parse(res.content[0].text);
    expect(payload).toHaveLength(1);
    expect(payload[0].backend).toBe('vegalite');
    expect(payload[0].count).toBeGreaterThan(10);
    expect(payload[0].chartTypes[0]).toHaveProperty('chartType');
    expect(payload[0].chartTypes[0]).toHaveProperty('channels');
    expect(payload[0].chartTypes[0]).toHaveProperty('interactions');
    const bar = payload[0].chartTypes.find((entry: any) => entry.chartType === 'Bar Chart');
    expect(bar.interactions).toContain('click-highlight');
    expect(bar.interactions).toContain('drag-reorder');
    expect(bar.interactions).not.toContain('brush-angle');
    const kpi = payload[0].chartTypes.find((entry: any) => entry.chartType === 'KPI Card');
    expect(kpi.interactions).not.toContain('legend-toggle');
  });

  it('validate_chart reports the interaction_spec entries the chart would drop', async () => {
    const res: any = await client.callTool({
      name: 'validate_chart',
      arguments: {
        backend: 'vegalite',
        data: { values: [{ region: 'East', revenue: 120 }, { region: 'West', revenue: 90 }] },
        semantic_types: { revenue: 'Quantity' },
        chart_spec: { chartType: 'Bar Chart', encodings: { x: 'region', y: 'revenue' } },
        interaction_spec: { interactions: [{ type: 'click-highlight' }, { type: 'legend-toggle' }] },
      },
    });
    const report = res.content[0].text;
    expect(report).not.toContain('✗');
    expect(report.match(/requires/g)).toHaveLength(1);
    expect(report).toContain('"legend-toggle" requires a discrete legend; Bar Chart has none');
  });

  it('validate_chart and show take updates beside the input, and reject a malformed layer', async () => {
    const base = {
      data: { values: [{ region: 'East', revenue: 120 }, { region: 'West', revenue: 90 }] },
      semantic_types: { revenue: 'Quantity' },
      chart_spec: { chartType: 'Bar Chart', encodings: { x: 'region', y: 'revenue' } },
    };
    const layer = { id: 'agent', ops: [{ op: 'set-style', targets: [{ select: { key: { region: 'East' } } }], value: { state: 'emphasized' } }] };
    const ok: any = await client.callTool({ name: 'validate_chart', arguments: { ...base, backend: 'vegalite', updates: [layer] } });
    expect(ok.content[0].text).toContain('- All 1 update ops apply.');
    const shorthand = {
      id: 'goal',
      ops: [{ op: 'set-overlay', name: 'goal', value: { mark: 'rule', role: 'reference', data: { values: [{ v: 100 }] }, encodings: { y: 'v' } } }],
    };
    const off: any = await client.callTool({ name: 'validate_chart', arguments: { ...base, backend: 'vegalite', updates: [shorthand] } });
    expect(off.content[0].text).toContain('- 1 of 1 update ops do not apply; the chart draws without them.');
    expect(off.content[0].text).toContain('overlay "goal" (rule, 1 row): encodings.y must be { "field": "v" }, not "v".');
    const bad: any = await client.callTool({
      name: 'validate_chart',
      arguments: { ...base, backend: 'vegalite', updates: [layer, { id: 'agent', ops: [] }] },
    });
    expect(bad.isError).toBeFalsy();
    expect(bad.content[0].text).toContain('- ✗ updates[1]: duplicate id "agent"');
    // An unknown op name never reaches the handler: the schema enum rejects it.
    const unknownOp: any = await client.callTool({
      name: 'validate_chart',
      arguments: { ...base, backend: 'vegalite', updates: [{ id: 'agent', ops: [{ op: 'highlight' }] }] },
    });
    expect(unknownOp.isError).toBe(true);
    expect(unknownOp.content[0].text).toContain('set-style');
    const view = await drawChart({ ...base, updates: [layer] });
    expect(view.created.isError).toBeFalsy();
    expect(view.created.content[0].text).toContain('- All 1 update ops apply.');
    expect(view.chart.updates).toEqual([layer]);
    const viewBad = await drawChart({ ...base, updates: [{ id: '', ops: [] }] });
    expect(viewBad.created.isError).toBe(true);
    expect(viewBad.created.content[0].text).toContain('Nothing was drawn: chart ✗ not drawn: updates[0]: "id" must be a non-empty string.');
    expect(viewBad.created.content[0].text).toContain('Fix the spec and call show again.');
    const viewOff = await drawChart({ ...base, updates: [layer, shorthand] });
    expect(viewOff.created.isError).toBeFalsy();
    expect(viewOff.chart.updates).toEqual([layer, shorthand]);
    expect(viewOff.created.content[0].text).toContain('1 of 2 update ops do not apply; the chart draws without them.');
    expect(viewOff.created.content[0].text).toContain('Update "goal" will not apply overlay "goal"');
  });

  it('show opens a chart as its table when asked, and draws a Table chart type as a table', async () => {
    const data = { values: [{ region: 'East', revenue: 120 }, { region: 'West', revenue: 90 }] };
    const bars = { data, chart_spec: { chartType: 'Bar Chart', encodings: { x: 'region', y: 'revenue' } } };
    const asTable = await drawChart({ ...bars, view: 'table' });
    expect(asTable.chart.view).toBe('table');
    const asChart = await drawChart(bars);
    expect(asChart.chart.view).toBeUndefined();
    const table = await drawChart({ data, chart_spec: { chartType: 'Table', encodings: {} }, view: 'table' });
    expect(table.created.isError).toBeFalsy();
    expect(table.created.content[0].text).not.toContain('Opens as the table');
    expect(table.chart.view).toBeUndefined();
  });

  it('show draws nothing for an invalid spec, and the card shows why', async () => {
    const res: any = await client.callTool({
      name: 'show',
      arguments: { chart: { ...barChart, chart_spec: { ...barChart.chart_spec, chartType: 'Not A Real Chart' } } },
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Not A Real Chart');
    expect(res.content[0].text).toContain('call show again');
    expect(res._meta).toEqual({ flint: { error: res.content[0].text } });
  });

  it('validate_chart checks a chart and keeps nothing; show draws the spec it is given, each in a new card', async () => {
    const checked: any = await client.callTool({ name: 'validate_chart', arguments: { ...barChart, backend: 'vegalite' } });
    expect(checked.content[0].text).toBe('Nothing to fix: call show with this spec.');
    const first: any = await client.callTool({ name: 'show', arguments: { chart: barChart } });
    expect(first.content[0].text).toContain('The chart is on screen in a new card.');
    expect(first._meta.flint.board).toMatchObject({ kind: 'chart', charts: [{ id: 'chart' }] });
    const second: any = await client.callTool({ name: 'show', arguments: { chart: { ...barChart, chart_spec: { ...barChart.chart_spec, title: 'Revenue' } } } });
    expect(second._meta.flint.board.charts[0].input.chart_spec.title).toBe('Revenue');
    expect(first._meta.flint.board.charts[0].input.chart_spec.title).toBe(barChart.chart_spec.title);
  });

  it('a misshapen op is rejected with its shape, and the schema lists every op shape', async () => {
    const base = {
      data: { values: [{ region: 'East', revenue: 120 }, { region: 'West', revenue: 90 }] },
      chart_spec: { chartType: 'Bar Chart', encodings: { x: 'region', y: 'revenue' } },
    };
    const note = { op: 'set-annotation', target: { select: { key: { region: 'West' } } }, value: { text: 'Lowest' } };
    const ok: any = await client.callTool({
      name: 'validate_chart',
      arguments: { ...base, backend: 'vegalite', updates: [{ id: 'agent', ops: [note] }] },
    });
    expect(ok.content[0].text).toContain('- All 1 update ops apply.');
    for (const op of [
      { op: 'set-annotation', foo: 1 },
      { op: 'set-annotation', annotations: [{ kind: 'rule', x: '2022-12-01', label: 'ChatGPT launch' }] },
    ]) {
      const bad: any = await client.callTool({
        name: 'show',
        arguments: { chart: { ...base, updates: [{ id: 'agent', ops: [op] }] } },
      });
      expect(bad.isError).toBe(true);
      expect(bad.content[0].text).toContain('set-annotation has a missing or malformed "target". Shape:');
    }
    const { tools } = await client.listTools();
    const view = tools.find((tool) => tool.name === 'show')!;
    const schemaText = JSON.stringify(view.inputSchema);
    expect(schemaText).toContain("set-annotation { target: UpdateTarget, value: { text, anchor?: 'segment' | 'point' } | null }");
  });

  it('render_chart surfaces assembly errors as isError', async () => {
    const res: any = await client.callTool({
      name: 'render_chart',
      arguments: {
        ...barChart,
        chart_spec: { ...barChart.chart_spec, chartType: 'Not A Real Chart' },
        backend: 'echarts',
      },
    });
    expect(res.isError).toBe(true);
  });

  it('exposes the chart-types resource', async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain('flint://chart-types');
    const read = await client.readResource({ uri: 'flint://chart-types' });
    const payload = JSON.parse(resourceText(read.contents[0]));
    expect(Array.isArray(payload)).toBe(true);
    expect(payload.length).toBe(4);
  });

  it('exposes the bundled agent skill as a resource', async () => {
    const { resources } = await client.listResources();
    const skill = resources.find((r) => r.uri === 'flint://agent-skill');
    expect(skill?.mimeType).toBe('text/markdown');
    expect(skill?.annotations?.audience).toContain('assistant');

    const read = await client.readResource({ uri: 'flint://agent-skill' });
    expect(read.contents[0].mimeType).toBe('text/markdown');
    const skillText = resourceText(read.contents[0]);
    expect(skillText).toContain('# flint-chart: authoring and using a chart spec');
    expect(skillText).toContain('validate_chart');
  });

  it('exposes the bundled theme-author skill as a resource', async () => {
    const { resources } = await client.listResources();
    const skill = resources.find((r) => r.uri === 'flint://theme-skill');
    expect(skill?.mimeType).toBe('text/markdown');
    expect(skill?.annotations?.audience).toContain('assistant');

    const read = await client.readResource({ uri: 'flint://theme-skill' });
    const skillText = resourceText(read.contents[0]);
    expect(skillText).toContain('# Flint ThemeSpec authoring');
    expect(skillText).toContain('bare `ThemeSpec`');
  });

  it('exposes the bundled interaction-author skill as a resource', async () => {
    const { resources } = await client.listResources();
    const skill = resources.find((r) => r.uri === 'flint://interaction-skill');
    expect(skill?.mimeType).toBe('text/markdown');
    expect(skill?.annotations?.audience).toContain('assistant');

    const read = await client.readResource({ uri: 'flint://interaction-skill' });
    const skillText = resourceText(read.contents[0]);
    expect(skillText).toContain('# flint-chart: interactions and updates on a chart');
    expect(skillText).toContain('Return the bare object');
  });

  it('opens a card only from show, linked to the one UI resource', async () => {
    const { tools } = await client.listTools();
    const cards = tools.filter((t) => (t as any)._meta?.ui?.resourceUri && !(t as any)._meta.ui.visibility);
    expect(cards.map((t) => t.name)).toEqual(['show']);
    expect((cards[0] as any)._meta.ui.resourceUri).toBe('ui://flint-chart/view.html');

    const { created, chart } = await drawChart({ ...barChart });
    expect(created.isError).toBeFalsy();
    expect(chart.input.chart_spec.chartType).toBe('Bar Chart');
    expect(created.content[0].text).toContain('The chart is on screen in a new card.');
  });

  it('serves the view UI resource', async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain('ui://flint-chart/view.html');
    const read = await client.readResource({ uri: 'ui://flint-chart/view.html' });
    const html = resourceText(read.contents[0]);
    expect(html.toLowerCase()).toContain('<!doctype html>');
    expect((read.contents[0] as any)._meta?.ui?.permissions?.clipboardWrite).toEqual({});
  });

  it('exposes a prompt that embeds the agent skill', async () => {    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain('author_flint_chart');

    const prompt = await client.getPrompt({ name: 'author_flint_chart' });
    const resourceMessage = prompt.messages.find((m) => m.content.type === 'resource');
    expect(resourceMessage?.content.type).toBe('resource');
    if (resourceMessage?.content.type === 'resource') {
      expect(resourceMessage.content.resource.uri).toBe('flint://agent-skill');
      expect(resourceText(resourceMessage.content.resource)).toContain('ChartAssemblyInput');
    }
  });

  it('exposes a prompt that embeds the theme-author skill', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain('author_flint_theme');

    const prompt = await client.getPrompt({ name: 'author_flint_theme' });
    const resourceMessage = prompt.messages.find((m) => m.content.type === 'resource');
    expect(resourceMessage?.content.type).toBe('resource');
    if (resourceMessage?.content.type === 'resource') {
      expect(resourceMessage.content.resource.uri).toBe('flint://theme-skill');
      expect(resourceText(resourceMessage.content.resource)).toContain('ThemeSpec');
    }
  });

  it('exposes a prompt that embeds the interaction-author skill', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain('author_flint_interaction');

    const prompt = await client.getPrompt({ name: 'author_flint_interaction' });
    const resourceMessage = prompt.messages.find((m) => m.content.type === 'resource');
    expect(resourceMessage?.content.type).toBe('resource');
    if (resourceMessage?.content.type === 'resource') {
      expect(resourceMessage.content.resource.uri).toBe('flint://interaction-skill');
      expect(resourceText(resourceMessage.content.resource)).toContain('interaction_spec');
    }
  });

  it('keeps the bundled MCP skill asset in sync with the repo skill', () => {
    const repoSkill = readFileSync(
      new URL('../../../agent-skills/flint-chart-author/SKILL.md', import.meta.url),
      'utf8',
    );
    const bundledSkill = readFileSync(
      new URL('../assets/flint-chart-author.SKILL.md', import.meta.url),
      'utf8',
    );
    expect(bundledSkill).toBe(repoSkill);
  });

  it('keeps the bundled theme skill asset in sync with the repo skill', () => {
    const repoSkill = readFileSync(
      new URL('../../../agent-skills/flint-theme-author/SKILL.md', import.meta.url),
      'utf8',
    );
    const bundledSkill = readFileSync(
      new URL('../assets/flint-theme-author.SKILL.md', import.meta.url),
      'utf8',
    );
    expect(bundledSkill).toBe(repoSkill);
  });

  it('keeps the Copilot plugin version and MCP dependency aligned with the package', () => {
    const pluginRoot = new URL('../../../.github/extensions/flint-chart/', import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL('.plugin/plugin.json', pluginRoot), 'utf8'));
    const mcp = JSON.parse(readFileSync(new URL('.mcp.json', pluginRoot), 'utf8'));
    const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

    expect(manifest).toMatchObject({
      name: 'flint-chart',
      version,
      skills: './skills/',
      mcpServers: './.mcp.json',
    });
    expect(mcp.mcpServers.flint).toEqual({
      command: 'npx',
      args: ['--yes', `flint-chart-mcp@${version}`],
      cwd: '${PLUGIN_ROOT}',
    });
  });

  it('bundles the current authoring skill with native Canvas guidance', () => {
    const repoSkill = readFileSync(
      new URL('../../../agent-skills/flint-chart-author/SKILL.md', import.meta.url),
      'utf8',
    );
    const canvasSkill = readFileSync(
      new URL('../../../.github/extensions/flint-chart/skills/flint-chart-author/SKILL.md', import.meta.url),
      'utf8',
    );

    expect(canvasSkill.startsWith(`${repoSkill.trimEnd()}\n\n## Copilot CLI chart canvas\n`)).toBe(true);
    expect(canvasSkill).toContain('prefer it over `validate_chart` and `show`');
    expect(canvasSkill).toContain('resolved inline `data.values`');
  });

  it('reads a local data.url file and inlines its rows', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'flint-mcp-server-data-'));
    const dataServer = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const dataClient = new Client({ name: 'flint-data-file-test', version: '0.0.0' });
    try {
      const csvPath = join(dataDir, 'sales.csv');
      writeFileSync(csvPath, 'region,revenue\nNorth,120\nSouth,90\n');
      await dataServer.connect(serverTransport);
      await dataClient.connect(clientTransport);
      const res: any = await dataClient.callTool({
        name: 'compile_chart',
        arguments: { ...barChart, data: { url: csvPath }, backend: 'vegalite' },
      });
      const payload = JSON.parse(res.content[0].text);
      expect(payload.backend).toBe('vegalite');
      expect(payload.spec.data.values).toHaveLength(2);
    } finally {
      await dataClient.close();
      await dataServer.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('inlines local data.url rows into the chart the card is handed', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'flint-mcp-view-data-'));
    const dataServer = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const dataClient = new Client({ name: 'flint-view-data-test', version: '0.0.0' });
    try {
      const csvPath = join(dataDir, 'sales.csv');
      writeFileSync(csvPath, 'region,revenue\nNorth,120\nSouth,90\n');
      await dataServer.connect(serverTransport);
      await dataClient.connect(clientTransport);
      const { created, chart } = await drawChart({ ...barChart, data: { url: csvPath } }, dataClient);
      expect(created.isError).toBeFalsy();
      // The host UI renders client-side and cannot read local files, so the
      // server must hand it inline rows, not the original data.url.
      expect(chart.input.data.url).toBeUndefined();
      expect(chart.input.data.values).toEqual([
        { region: 'North', revenue: 120 },
        { region: 'South', revenue: 90 },
      ]);
    } finally {
      await dataClient.close();
      await dataServer.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

describe('backend gating', () => {
  it('only exposes enabled backends in the render tool schema', async () => {
    const gated = createServer({ enabledBackends: ['vegalite'] });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await gated.connect(st);
    const c = new Client({ name: 't', version: '0' });
    await c.connect(ct);
    try {
      const { tools } = await c.listTools();
      const render = tools.find((t) => t.name === 'render_chart');
      const backendEnum = (render!.inputSchema as any).properties.backend.enum;
      expect(backendEnum).toEqual(['vegalite']);
    } finally {
      await c.close();
      await gated.close();
    }
  });
});
