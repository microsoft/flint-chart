// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';

import { renderChart } from './render/index.js';
import type { RenderBackend } from './render/types.js';
import { compileChart } from './tools/compile.js';
import { validateChart } from './tools/validate.js';
import { listChartTypes, listThemes, listInteractionPresets } from './tools/list.js';
import {
  buildAssemblyInputShape,
  toAssemblyInput,
  updatesShape,
  SUPPORTED_BACKENDS,
  type SupportedBackend,
  type AssemblyInputArgs,
} from './tools/schemas.js';
import type { ChartAssemblyInput, ChartUpdate, ValidateResult } from 'flint-chart';

import { VERSION } from './version.js';
import { chartContext } from './chart-context.js';
export { VERSION };

export const AGENT_SKILL_RESOURCE_URI = 'flint://agent-skill';
export const THEME_SKILL_RESOURCE_URI = 'flint://theme-skill';
export const INTERACTION_SKILL_RESOURCE_URI = 'flint://interaction-skill';
const AGENT_SKILL_ASSET = new URL('../assets/flint-chart-author.SKILL.md', import.meta.url);
const THEME_SKILL_ASSET = new URL('../assets/flint-theme-author.SKILL.md', import.meta.url);
const INTERACTION_SKILL_ASSET = new URL('../assets/flint-interaction-author.SKILL.md', import.meta.url);

/** URI linking the chart-view tool to its bundled UI resource. */
export const CHART_VIEW_RESOURCE_URI = 'ui://flint-chart/chart-view.html';
const CHART_VIEW_ASSET = new URL('../assets/flint-app.html', import.meta.url);

/** Shown when the UI bundle has not been built yet (e.g. during `test`). */
const CHART_VIEW_PLACEHOLDER = `<!DOCTYPE html><html><head><meta charset="utf-8">\
<title>Flint Chart</title></head><body style="font-family:Arial,sans-serif;color:#6b6b6b;\
padding:24px">Flint chart view UI is not built. Run <code>npm run build:ui</code> in \
packages/flint-mcp to generate it.</body></html>`;

const SKILL_ASSETS = {
  chart: AGENT_SKILL_ASSET,
  theme: THEME_SKILL_ASSET,
  interaction: INTERACTION_SKILL_ASSET,
} as const;
export type SkillName = keyof typeof SKILL_ASSETS;
const SKILL_NAMES = Object.keys(SKILL_ASSETS) as [SkillName, ...SkillName[]];

function readSkill(name: SkillName): string {
  return readFileSync(SKILL_ASSETS[name], 'utf8');
}

const readAgentSkill = () => readSkill('chart');
const readThemeSkill = () => readSkill('theme');
const readInteractionSkill = () => readSkill('interaction');

/** Top-level `## ` headings of a skill, skipping fenced code blocks. */
function skillSections(text: string): { heading: string; start: number }[] {
  const sections: { heading: string; start: number }[] = [];
  let fenced = false;
  let offset = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    else if (!fenced && line.startsWith('## ')) sections.push({ heading: line.slice(3).trim(), start: offset });
    offset += line.length + 1;
  }
  return sections;
}

/** One `## ` section of a skill, from its heading up to the next `## ` heading. */
export function skillSection(text: string, heading: string): string {
  const sections = skillSections(text);
  const wanted = heading.replace(/^#+\s*/, '').trim().toLowerCase();
  const index = sections.findIndex((section) => section.heading.toLowerCase() === wanted);
  if (index < 0) {
    throw new Error(
      `No section "${heading}". Sections: ${sections.map((section) => `"${section.heading}"`).join(', ')}.`,
    );
  }
  return text.slice(sections[index].start, sections[index + 1]?.start ?? text.length).trimEnd() + '\n';
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

/** The chart as the model reads it before it is drawn: the same report the drawn view sends as its context. */
function chartReport(input: ChartAssemblyInput, updates: readonly ChartUpdate[] | undefined, result: ValidateResult): string {
  return chartContext({ agent: input, shown: input, updates, checks: result.updates, warnings: result.warnings }).text;
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
    '(a relative path is looked up in the client\'s project folders, then the ' +
    'server\'s working directory; an absolute path always works) or pass rows inline ' +
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
        'to show a chart whenever the host supports MCP App UIs — it renders ' +
        'the chart live with an editing panel. The editing panel is not ' +
        'interactivity: when the user asks for an interactive chart (hover, ' +
        'click, brush, zoom), add an interaction_spec. Fall back to render_chart for a static PNG/SVG artifact only ' +
        'when the host has no App UI support or the user explicitly wants a ' +
        'static image. Use compile_chart for the backend spec JSON, ' +
        'validate_chart to check a spec, and list_chart_types to discover chart ' +
        'types, their channels, and the interaction presets each supports for ' +
        'interaction_spec. Use list_interaction_presets for what each preset does, ' +
        'what it needs from the chart, and the options it accepts. ' +
        'Use list_themes to discover visual themes; ' +
        'prefer a preset id, and use an `extends` override only when the user ' +
        'asks to customize it. Before authoring chart specs, call ' +
        'get_flint_skill with skill "chart" (also the flint://agent-skill ' +
        'resource and the author_flint_chart prompt). ' +
        'When the user asks to create, translate, or substantially customize a ' +
        'ThemeSpec, call get_flint_skill with skill "theme". ' +
        'When the user asks for behaviour on a chart, names an intent such as ' +
        'explore or compare, adds behaviour to a chart that already exists, ' +
        'changes or reads a mounted chart from code or as an agent, passes ' +
        'updates to a tool, links charts, ' +
        'or needs an interaction no preset gives, call get_flint_skill with ' +
        'skill "interaction". Pass `section` with one "## " heading when you ' +
        'need only that part of a skill.' +
        dataAccessNote(options),
    },
  );

  let roots: Promise<string[]> | undefined;
  server.server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
    roots = undefined;
  });
  /** The client's project folders, where a relative data.url is looked up first. */
  const clientRoots = (): Promise<string[]> => {
    if (options.disableFileReference || !server.server.getClientCapabilities()?.roots) return Promise.resolve([]);
    roots ??= server.server
      .listRoots()
      .then((result) => result.roots.filter((root) => root.uri.startsWith('file:')).map((root) => fileURLToPath(root.uri)))
      .catch(() => []);
    return roots;
  };

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
          roots: await clientRoots(),
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
        return jsonResult(compileChart(input, args.backend as RenderBackend, { ...dataSourceOptions, roots: await clientRoots() }));
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
        'whether it is valid, all warnings/errors, and the computed layout size. ' +
        'With an interaction_spec it also reports the entries the chart would drop. ' +
        'With updates it rejects a malformed layer and reports, op by op, whether ' +
        'each will apply (✓) or why not (✗), in the same report create_chart_view ' +
        'returns. Run it before create_chart_view whenever you pass updates, and fix ' +
        'every ✗ first, so the user sees one chart.',
      inputSchema: { ...assemblyInputShape, ...updatesShape, backend: backendEnum },
    },
    async (args: any) => {
      try {
        const { result, input } = validateChart(toAssemblyInput(args as AssemblyInputArgs), args.backend as RenderBackend, {
          ...dataSourceOptions,
          roots: await clientRoots(),
          updates: args.updates,
        });
        if (!result.valid || args.backend !== 'vegalite') return jsonResult(result);
        const report = chartReport(input, args.updates, result);
        return { content: [...jsonResult(result).content, { type: 'text' as const, text: report }] };
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
        'List the available chart types, their encoding channels, and the ' +
        'interaction presets each supports in interaction_spec (Vega-Lite only), ' +
        'for a backend, or for all backends when none is given.',
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

  // --- list_interaction_presets ---------------------------------------------
  server.registerTool(
    'list_interaction_presets',
    {
      title: 'List interaction presets',
      description:
        'List the interaction presets for interaction_spec: what the reader does, ' +
        'what each needs from the chart, its reset gestures, and every option it ' +
        'accepts under `options`. Pass `chartType` for the presets a Vega-Lite ' +
        'chart type supports, or `type` for one preset. Which presets answer a ' +
        'request and how they combine is in get_flint_skill with skill ' +
        '"interaction", section "Add interactions to the chart".',
      inputSchema: {
        chartType: z.string().optional().describe('A Vega-Lite chart type name from list_chart_types.'),
        type: z.string().optional().describe('One preset type, for its options alone.'),
      },
    },
    async (args: any) => {
      try {
        return jsonResult(listInteractionPresets({ chartType: args?.chartType, type: args?.type }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // --- get_flint_skill ----------------------------------------------------
  server.registerTool(
    'get_flint_skill',
    {
      title: 'Get Flint skill',
      description:
        'Return a bundled Flint skill as markdown. Read it before you write the ' +
        'matching spec: `chart` for a ChartAssemblyInput, `theme` for a ThemeSpec, ' +
        '`interaction` for an interaction_spec, ChartUpdate layers, reading a ' +
        'mounted chart, linking charts, or a bespoke interaction. Pass `section` ' +
        'with one "## " heading to get only that part; an unknown section lists ' +
        'the headings. The same text is served as the flint://agent-skill, ' +
        'flint://theme-skill, and flint://interaction-skill resources.',
      inputSchema: {
        skill: z.enum(SKILL_NAMES).describe('Which skill: chart, theme, or interaction.'),
        section: z
          .string()
          .optional()
          .describe('One "## " heading of the skill, e.g. "Update the chart".'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args: any) => {
      try {
        const text = readSkill(args.skill as SkillName);
        return { content: [{ type: 'text' as const, text: args.section ? skillSection(text, args.section) : text }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // --- list_themes --------------------------------------------------------
  server.registerTool(
    'list_themes',
    {
      title: 'List themes',
      description:
        'List Flint visual theme presets for `theme_spec` (for example, ' +
        '`theme_spec: "economist"`). Pass an `id` for preset-specific authoring ' +
        'guidance. To customize a preset, use an object with `extends` and a ' +
        'small set of overrides.',
      inputSchema: {
        id: z.string().optional(),
      },
    },
    async (args: any) => {
      try {
        return jsonResult(listThemes(args?.id as string | undefined));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // --- create_chart_view (MCP App: live chart + editing panel) -----------
  registerAppTool(
    server,
    'create_chart_view',
    {
      title: 'Create live chart view',
      description:
        'PREFERRED DEFAULT for showing a chart when the host supports MCP App ' +
        'UIs. Open a live, editable Flint chart view: renders the spec live as SVG ' +
        'and ' +
        'offers an editing panel (chart type, channel bindings, chart ' +
        'properties, sort) built from Flint\'s option model. Rendering and edits ' +
        'happen entirely in the host UI (Vega-Lite); no data leaves the host. ' +
        'Use this whenever the user wants to see a chart, not just when they ask ' +
        'to tweak it; fall back to render_chart only for a static image. ' +
        'The editing panel does not make the chart respond to the reader: ' +
        'for hover, click, brush, or zoom, pass interaction_spec ' +
        '(list_interaction_presets has the presets for each chart type). ' +
        'Pass updates to open the chart in a state (emphasis, a note, a range), ' +
        'and call it again with new updates to change an open chart; check them ' +
        'with validate_chart first. The result is a report of the chart: its ' +
        'encodings, interactions, and each update op as applied (✓) or not and why (✗). ' +
        'What the user then does on the chart reaches you with their next message.',
      inputSchema: { ...assemblyInputShape, ...updatesShape },
      _meta: { ui: { resourceUri: CHART_VIEW_RESOURCE_URI } },
    },
    async (args: any) => {
      try {
        // The host UI renders Vega-Lite client-side and cannot read local files,
        // so it gets the input with `data.url` read into inline `data.values`.
        const updates = args.updates as ChartUpdate[] | undefined;
        const { result, input } = validateChart(toAssemblyInput(args as AssemblyInputArgs), 'vegalite', {
          ...dataSourceOptions,
          roots: await clientRoots(),
          updates,
        });
        const note = result.valid
          ? chartReport(input, updates, result)
          : `Chart spec has errors: ${result.errors.map((e) => e.message).join('; ')}`;
        return {
          content: [{ type: 'text' as const, text: note }],
          // The view's payload, with data inlined so it never sees an unreadable
          // local data.url. `_meta` reaches the view but not the model, which
          // reads `content` only when there is no `structuredContent`.
          _meta: { flint: { input, ...(updates ? { updates } : {}) } },
          ...(result.valid ? {} : { isError: true }),
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

  server.registerResource(
    'theme-skill',
    THEME_SKILL_RESOURCE_URI,
    {
      title: 'Flint theme-author skill',
      description: 'Bundled instructions for creating valid reusable Flint ThemeSpecs.',
      mimeType: 'text/markdown',
      annotations: { audience: ['assistant'], priority: 1 },
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: readThemeSkill(),
        },
      ],
    }),
  );

  server.registerPrompt(
    'author_flint_theme',
    {
      title: 'Author a Flint theme',
      description:
        'Load the Flint theme-author skill before creating, translating, refining, reviewing, or validating a ThemeSpec.',
    },
    async () => ({
      description: 'Use the bundled Flint theme-author skill to produce a valid ThemeSpec.',
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'resource' as const,
            resource: {
              uri: THEME_SKILL_RESOURCE_URI,
              mimeType: 'text/markdown',
              text: readThemeSkill(),
            },
          },
        },
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text:
              'Use these Flint instructions when creating or reviewing a ThemeSpec. ' +
              'Use list_themes when preset discovery or preset-specific guidance is needed. ' +
              'Return the bare reusable ThemeSpec and do not change chart semantics.',
          },
        },
      ],
    }),
  );

  server.registerResource(
    'interaction-skill',
    INTERACTION_SKILL_RESOURCE_URI,
    {
      title: 'Flint interaction-author skill',
      description:
        'Bundled instructions for behaviour on a chart: how an interaction works, presets as one valid interaction_spec, the ChartUpdate an application or an agent applies to a mounted chart, reading the chart state, linking charts, and bespoke interactions.',
      mimeType: 'text/markdown',
      annotations: { audience: ['assistant'], priority: 1 },
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: readInteractionSkill(),
        },
      ],
    }),
  );

  server.registerPrompt(
    'author_flint_interaction',
    {
      title: 'Author Flint interactions',
      description:
        'Load the Flint interaction-author skill before adding behaviour to a chart, changing or reading a mounted chart from outside, linking charts, or building a bespoke interaction.',
    },
    async () => ({
      description: 'Use the bundled Flint interaction-author skill to produce a valid interaction_spec, a ChartUpdate, or code against flint-chart/interactive.',
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'resource' as const,
            resource: {
              uri: INTERACTION_SKILL_RESOURCE_URI,
              mimeType: 'text/markdown',
              text: readInteractionSkill(),
            },
          },
        },
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text:
              'Use these Flint instructions for behaviour on a chart. ' +
              'For presets, use list_chart_types to confirm the ones the chart type supports, ' +
              'and return the bare interaction_spec without changing the chart spec. ' +
              'For a mounted chart, return one ChartUpdate; for code, write against flint-chart/interactive.',
          },
        },
      ],
    }),
  );

  return server;
}
