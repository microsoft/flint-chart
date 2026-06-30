import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startHttpServer, type RunningHttpServer } from '../src/http.js';

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
    baseSize: { width: 320, height: 220 },
  },
};

let running: RunningHttpServer;
let client: Client;

beforeAll(async () => {
  // Port 0 → OS assigns a free port; default disableFileReference for http.
  running = await startHttpServer({ port: 0, host: '127.0.0.1' });
  const transport = new StreamableHTTPClientTransport(new URL(running.url));
  client = new Client({ name: 'flint-http-test', version: '0.0.0' });
  await client.connect(transport);
});

afterAll(async () => {
  await client?.close();
  await running?.close();
});

describe('MCP server over HTTP (stateless streamable transport)', () => {
  it('lists the chart tools over HTTP', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'compile_chart',
      'create_chart_view',
      'list_chart_types',
      'render_chart',
      'validate_chart',
    ]);
  });

  it('renders a chart through the HTTP transport', async () => {
    const res: any = await client.callTool({
      name: 'render_chart',
      arguments: { ...barChart, backend: 'echarts', format: 'png' },
    });
    expect(res.isError).toBeFalsy();
    const image = res.content.find((c: any) => c.type === 'image');
    expect(image?.mimeType).toBe('image/png');
    expect(image.data.length).toBeGreaterThan(1000);
  });

  it('disables local data.url by default on the HTTP transport', async () => {
    const res: any = await client.callTool({
      name: 'render_chart',
      arguments: {
        ...barChart,
        data: { url: './some-local-file.csv' },
        backend: 'echarts',
      },
    });
    expect(res.isError).toBe(true);
    const text = res.content.map((c: any) => c.text).join(' ');
    expect(text).toMatch(/disabled/i);
  });

  it('documents data.url as disabled in the render_chart input schema', async () => {
    const { tools } = await client.listTools();
    const render = tools.find((t) => t.name === 'render_chart');
    const urlSchema: any = (render?.inputSchema as any)?.properties?.data?.properties?.url;
    expect(urlSchema?.description).toMatch(/disabled/i);
  });

  it('serves a health endpoint', async () => {
    const base = running.url.replace(/\/mcp$/, '');
    const resp = await fetch(`${base}/health`);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.status).toBe('ok');
    expect(body.transport).toBe('http');
    expect(body.name).toBe('flint-chart-mcp');
  });

  it('rejects non-POST requests to the MCP endpoint', async () => {
    const resp = await fetch(running.url, { method: 'PUT' });
    expect(resp.status).toBe(405);
    expect(resp.headers.get('allow')).toBe('POST');
  });
});
