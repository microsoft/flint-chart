// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';

import { renderChart, resolveDataSource } from './render/index.js';
import type { RenderBackend } from './render/types.js';
import { compileChart } from './tools/compile.js';
import { validateChart } from './tools/validate.js';
import { listChartTypes } from './tools/list.js';
import {
  buildAssemblyInputShape,
  toAssemblyInput,
  SUPPORTED_BACKENDS,
  type SupportedBackend,
  type AssemblyInputArgs,
} from './tools/schemas.js';

/** Package version, kept in lockstep with the npm release. */
export const VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version as string;

export const AGENT_SKILL_RESOURCE_URI = 'flint://agent-skill';
const AGENT_SKILL_ASSET = new URL('../assets/flint-chart-author.SKILL.md', import.meta.url);

/** URI linking the chart-view tool to its bundled UI resource. */
export const CHART_VIEW_RESOURCE_URI = 'ui://flint-chart/chart-view.html';
const CHART_VIEW_ASSET = new URL('../assets/flint-app.html', import.meta.url);

/** Shown when the UI bundle has not been built yet (e.g. during `test`). */
const CHART_VIEW_PLACEHOLDER = `<!DOCTYPE html><html><head><meta charset="utf-8">\
<title>Flint Chart</title></head><body style="font-family:Arial,sans-serif;color:#6b6b6b;\
padding:24px">Flint chart view UI is not built. Run <code>npm run build:ui</code> in \
packages/flint-mcp to generate it.</body></html>`;

function readAgentSkill(): string {
  return readFileSync(AGENT_SKILL_ASSET, 'utf8');
}

/** Read the bundled chart-view HTML, tolerating a not-yet-built asset. */
function readChartViewHtml(): string {
  try {
    return readFileSync(CHART_VIEW_ASSET, 'utf8');
  } catch {
    return CHART_VIEW_PLACEHOLDER;
  }
}

export interface CreateServerOptions {
  /** Restrict which backends are exposed (default: all supported). */
  enabledBackends?: SupportedBackend[];
  /**
   * When true, reject local `data.url` file references and accept only inline
   * `data.values`. When unset the server trusts the host and reads any local
   * file the agent references.
   */
  disableFileReference?: boolean;
}

type JsonContent = { content: { type: 'text'; text: string }[]; isError?: boolean };

function jsonResult(value: unknown): JsonContent {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function errorResult(err: unknown): JsonContent {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

/**
 * Build a short instruction note telling the agent how to reference local data,
 * tailored to whether local file references are enabled.
 */
function dataAccessNote(options: CreateServerOptions): string {
  if (options.disableFileReference) {
    return (
      ' Local data: this server CANNOT read local files — do NOT set data.url. ' +
      'Provide every dataset inline via data.values (an array of row objects). ' +
      'Remote URLs are not fetched.'
    );
  }
  return (
    ' Local data: reference a local CSV/TSV/JSON file by path in data.url ' +
    '(relative paths resolve against the working directory) or pass rows inline ' +
    'via data.values. For data you download or generate, create a folder in the ' +
    'current project (e.g. ./flint-data) and reference files from it. Remote ' +
    'URLs are not fetched.'
  );
}

/** Resolve and validate the set of enabled backends. */
export function resolveBackends(options: CreateServerOptions = {}): SupportedBackend[] {
  const requested = options.enabledBackends?.length
    ? options.enabledBackends
    : [...SUPPORTED_BACKENDS];
  const enabled = requested.filter((b): b is SupportedBackend =>
    (SUPPORTED_BACKENDS as readonly string[]).includes(b),
  );
  if (enabled.length === 0) {
    throw new Error(
      `no valid backends enabled; choose from: ${SUPPORTED_BACKENDS.join(', ')}`,
    );
  }
  return enabled;
}

/**
 * Build the Flint MCP server with chart tools, the bundled authoring skill, and
 * catalog resources. Rendering is fully in-process; no data leaves the host.
 */
export function createServer(options: CreateServerOptions = {}): McpServer {
  const backends = resolveBackends(options);
  const dataSourceOptions = {
    disableFileReference: options.disableFileReference,
  };
  // Build the tool input shape once so data.url is documented as disabled when
  // local file references are off (e.g. on a remote/hosted server).
  const assemblyInputShape = buildAssemblyInputShape(options.disableFileReference);
  const backendEnum = z
    .enum(backends as [SupportedBackend, ...SupportedBackend[]])
    .describe(`Rendering backend. One of: ${backends.join(', ')}.`);

  const server = new McpServer(
    { name: 'flint-chart-mcp', version: VERSION },
    {
      instructions:
        'Flint compiles one semantic chart spec (ChartAssemblyInput) into ' +
        'Vega-Lite, ECharts, or Chart.js. By DEFAULT, prefer create_chart_view ' +
        'to return an interactive, customizable chart whenever the host ' +
        'supports MCP App UIs — it renders the chart live and lets the user ' +
        'tweak it. Fall back to render_chart for a static PNG/SVG artifact only ' +
        'when the host has no App UI support or the user explicitly wants a ' +
        'static image. Use compile_chart for the backend spec JSON, ' +
        'validate_chart to check a spec, and list_chart_types to discover chart ' +
        'types and their channels. Before authoring specs, read the ' +
        'flint://agent-skill resource or use the author_flint_chart prompt.' +
        dataAccessNote(options),
    },
  );

  // --- render_chart -------------------------------------------------------
  server.registerTool(
    'render_chart',
    {
      title: 'Render chart',
      description:
        'Compile a Flint chart spec for a backend and render it to a STATIC image ' +
        '(PNG) or vector (SVG), returned inline. Rendering is local/in-process. ' +
        'The chartjs backend supports PNG only. Prefer create_chart_view instead ' +
        'when the host supports MCP App UIs; use render_chart for a static ' +
        'artifact or when no App UI is available.',
      inputSchema: {
        ...assemblyInputShape,
        backend: backendEnum,
        format: z
          .enum(['png', 'svg'])
          .optional()
          .describe('Output format. Default: png. chartjs supports png only.'),
        scale: z
          .number()
          .min(0.5)
          .max(4)
          .optional()
          .describe('Device scale for PNG raster (1 = design size, 2 = retina). Default: 1.'),
        background: z
          .string()
          .optional()
          .describe('Background color (CSS color). Default: #ffffff.'),
      },
    },
    async (args: any) => {
      try {
        const input = toAssemblyInput(args as AssemblyInputArgs);
        const res = await renderChart(input, args.backend as RenderBackend, {
          format: args.format,
          scale: args.scale,
          background: args.background,
          disableFileReference: dataSourceOptions.disableFileReference,
        });
        const note =
          `${res.backend} · ${res.format} · ${res.width}×${res.height}px` +
          (res.warnings.length ? ` · ${res.warnings.length} warning(s)` : '');
        if (res.format === 'svg') {
          return {
            content: [
              { type: 'text' as const, text: res.svg as string },
              { type: 'text' as const, text: note },
            ],
          };
        }
        return {
          content: [
            { type: 'image' as const, data: res.base64 as string, mimeType: res.mimeType },
            { type: 'text' as const, text: note },
          ],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // --- compile_chart ------------------------------------------------------
  server.registerTool(
    'compile_chart',
    {
      title: 'Compile chart spec',
      description:
        'Compile a Flint chart spec to a backend-native spec object ' +
        '(Vega-Lite / ECharts / Chart.js) without rendering. Returns the spec ' +
        'JSON, assembly warnings, and the computed layout size.',
      inputSchema: { ...assemblyInputShape, backend: backendEnum },
    },
    async (args: any) => {
      try {
        const input = toAssemblyInput(args as AssemblyInputArgs);
        return jsonResult(compileChart(input, args.backend as RenderBackend, dataSourceOptions));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // --- validate_chart -----------------------------------------------------
  server.registerTool(
    'validate_chart',
    {
      title: 'Validate chart spec',
      description:
        'Validate a Flint chart spec for a backend without rendering. Reports ' +
        'whether it is valid, all warnings/errors, and the computed layout size.',
      inputSchema: { ...assemblyInputShape, backend: backendEnum },
    },
    async (args: any) => {
      try {
        const input = toAssemblyInput(args as AssemblyInputArgs);
        return jsonResult(validateChart(input, args.backend as RenderBackend, dataSourceOptions));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // --- list_chart_types ---------------------------------------------------
  server.registerTool(
    'list_chart_types',
    {
      title: 'List chart types',
      description:
        'List the available chart types and their encoding channels for a ' +
        'backend, or for all backends when none is given.',
      inputSchema: {
        backend: backendEnum.optional(),
      },
    },
    async (args: any) => {
      try {
        return jsonResult(listChartTypes(args?.backend as RenderBackend | undefined));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // --- create_chart_view (MCP App: interactive chart + config UI) ---------
  registerAppTool(
    server,
    'create_chart_view',
    {
      title: 'Create interactive chart view',
      description:
        'PREFERRED DEFAULT for showing a chart when the host supports MCP App ' +
        'UIs. Open an interactive Flint chart view: renders the spec live as SVG ' +
        'and ' +
        'offers a customization panel (chart type, channel bindings, chart ' +
        'properties, sort) built from Flint\'s option model. Rendering and edits ' +
        'happen entirely in the host UI (Vega-Lite); no data leaves the host. ' +
        'Use this whenever the user wants to see a chart, not just when they ask ' +
        'to tweak it; fall back to render_chart only for a static image.',
      inputSchema: { ...assemblyInputShape },
      _meta: { ui: { resourceUri: CHART_VIEW_RESOURCE_URI } },
    },
    async (args: any) => {
      try {
        // Inline any local `data.url` rows up front: the host UI renders
        // Vega-Lite client-side and cannot read local files, so it must
        // receive inline `data.values`. resolveDataSource is a no-op for specs
        // that already carry inline values.
        const input = resolveDataSource(
          toAssemblyInput(args as AssemblyInputArgs),
          dataSourceOptions,
        );
        const summary = validateChart(input, 'vegalite', dataSourceOptions);
        const size = summary.computedSize
          ? `${summary.computedSize.width}×${summary.computedSize.height}px`
          : 'auto size';
        const note = summary.valid
          ? `Interactive chart view ready: ${summary.chartType} (${size})` +
            (summary.warnings.length ? `, ${summary.warnings.length} warning(s)` : '')
          : `Chart spec has errors: ${summary.errors.map((e) => e.message).join('; ')}`;
        return {
          content: [{ type: 'text' as const, text: note }],
          // Fallback render payload for hosts that surface structuredContent to
          // the UI; the UI primarily reads the tool arguments via ontoolinput.
          // Data is pre-resolved to inline values so the client-side renderer
          // never sees an unreadable local data.url.
          structuredContent: { input: input as unknown as Record<string, unknown> },
          ...(summary.valid ? {} : { isError: true }),
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  registerAppResource(
    server,
    'chart-view',
    CHART_VIEW_RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: CHART_VIEW_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: readChartViewHtml(),
          _meta: { ui: { permissions: { clipboardWrite: {} } } },
        },
      ],
    }),
  );

  // --- chart-types resource (browsable catalog) ---------------------------
  server.registerResource(
    'chart-types',
    'flint://chart-types',
    {
      title: 'Flint chart types',
      description: 'Catalog of chart types and channels across all enabled backends.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(listChartTypes(), null, 2),
        },
      ],
    }),
  );

  // --- agent-skill resource + prompt -------------------------------------
  server.registerResource(
    'agent-skill',
    AGENT_SKILL_RESOURCE_URI,
    {
      title: 'Flint chart-author skill',
      description:
        'Bundled Flint authoring instructions for generating ChartAssemblyInput specs.',
      mimeType: 'text/markdown',
      annotations: { audience: ['assistant'], priority: 1 },
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: readAgentSkill(),
        },
      ],
    }),
  );

  server.registerPrompt(
    'author_flint_chart',
    {
      title: 'Author a Flint chart',
      description:
        'Load the Flint chart-author skill before generating, validating, compiling, or rendering Flint charts.',
    },
    async () => ({
      description: 'Use the bundled Flint chart-author skill to produce valid Flint specs.',
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'resource' as const,
            resource: {
              uri: AGENT_SKILL_RESOURCE_URI,
              mimeType: 'text/markdown',
              text: readAgentSkill(),
            },
          },
        },
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text:
              'Use these Flint instructions when creating chart specs. Generate ChartAssemblyInput ' +
              'inputs with chart_spec and semantic_types, validate before rendering when tools are available, ' +
              'and call the Flint MCP tools only after the spec follows the authoring contract.',
          },
        },
      ],
    }),
  );

  return server;
}
