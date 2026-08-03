import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer } from '../src/server.js';

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

describe('MCP server', () => {
  it('lists the chart tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'compile_chart',
      'create_chart_view',
      'list_chart_types',
      'list_themes',
      'render_chart',
      'validate_chart',
    ]);
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
    const payload = JSON.parse(res.content[0].text);
    expect(payload.valid).toBe(false);
    expect(payload.errors.length).toBeGreaterThan(0);
  });

  it('validate_chart accepts a valid spec', async () => {
    const res: any = await client.callTool({
      name: 'validate_chart',
      arguments: { ...barChart, backend: 'vegalite' },
    });
    const payload = JSON.parse(res.content[0].text);
    expect(payload.valid).toBe(true);
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
      const payload = JSON.parse(res.content[0].text);
      expect(payload.valid).toBe(false);
      expect(payload.errors.length).toBeGreaterThan(0);
    }
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
    expect(payload.length).toBe(3);
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

  it('registers the create_chart_view MCP App tool linked to its UI resource', async () => {
    const { tools } = await client.listTools();
    const view = tools.find((t) => t.name === 'create_chart_view');
    expect(view).toBeTruthy();
    expect((view as any)._meta?.ui?.resourceUri).toBe('ui://flint-chart/chart-view.html');

    const res: any = await client.callTool({
      name: 'create_chart_view',
      arguments: { ...barChart },
    });
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent?.input?.chart_spec?.chartType).toBe('Bar Chart');
    expect(res.content[0].text).toContain('Bar Chart');
  });

  it('serves the chart-view UI resource', async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain('ui://flint-chart/chart-view.html');
    const read = await client.readResource({ uri: 'ui://flint-chart/chart-view.html' });
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

  it('inlines local data.url rows into create_chart_view structuredContent', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'flint-mcp-view-data-'));
    const dataServer = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const dataClient = new Client({ name: 'flint-view-data-test', version: '0.0.0' });
    try {
      const csvPath = join(dataDir, 'sales.csv');
      writeFileSync(csvPath, 'region,revenue\nNorth,120\nSouth,90\n');
      await dataServer.connect(serverTransport);
      await dataClient.connect(clientTransport);
      const res: any = await dataClient.callTool({
        name: 'create_chart_view',
        arguments: { ...barChart, data: { url: csvPath } },
      });
      expect(res.isError).toBeFalsy();
      // The host UI renders client-side and cannot read local files, so the
      // server must hand it inline rows, not the original data.url.
      const viewInput = res.structuredContent?.input;
      expect(viewInput?.data?.url).toBeUndefined();
      expect(viewInput?.data?.values).toEqual([
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
