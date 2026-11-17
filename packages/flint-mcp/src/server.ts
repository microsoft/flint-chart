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
import { installFlintTextMeasurer } from './render/fonts.js';
import { validateChart } from './tools/validate.js';
import { listChartTypes, listThemes, listInteractionPresets } from './tools/list.js';
import {
  buildAssemblyInputShape,
  toAssemblyInput,
  updatesShape,
  viewShape,
  referencedShape,
  checkArgs,
  SUPPORTED_BACKENDS,
  type SupportedBackend,
  type AssemblyInputArgs,
} from './tools/schemas.js';
import type { ChartAssemblyInput, ChartUpdate } from 'flint-chart';

import { VERSION } from './version.js';
import {
  assembleBoard,
  boardChartShape,
  boardFieldsShape,
  chartFindings,
  boardSnapshot,
  fitsInResult,
  gridShape,
  linkSpecShape,
  type BoardChartArgs,
  type BoardSpec,
} from './board.js';
import { HELD, reportBody, viewReport } from './report.js';
export { VERSION };

export const AGENT_SKILL_RESOURCE_URI = 'flint://agent-skill';
export const THEME_SKILL_RESOURCE_URI = 'flint://theme-skill';
export const INTERACTION_SKILL_RESOURCE_URI = 'flint://interaction-skill';
export const BOARD_SKILL_RESOURCE_URI = 'flint://board-skill';
export const APP_SKILL_RESOURCE_URI = 'flint://app-skill';
const AGENT_SKILL_ASSET = new URL('../assets/flint-chart-author.SKILL.md', import.meta.url);
const THEME_SKILL_ASSET = new URL('../assets/flint-theme-author.SKILL.md', import.meta.url);
const INTERACTION_SKILL_ASSET = new URL('../assets/flint-interaction-author.SKILL.md', import.meta.url);
const BOARD_SKILL_ASSET = new URL('../assets/flint-board-author.SKILL.md', import.meta.url);
const APP_SKILL_ASSET = new URL('../assets/flint-app-author.SKILL.md', import.meta.url);

/** URI linking show to its bundled UI resource, the card that draws a chart or a board. */
export const VIEW_RESOURCE_URI = 'ui://flint-chart/view.html';
const VIEW_ASSET = new URL('../assets/flint-app.html', import.meta.url);

/** Shown when the UI bundle has not been built yet (e.g. during `test`). */
const VIEW_PLACEHOLDER = `<!DOCTYPE html><html><head><meta charset="utf-8">\
<title>Flint Chart</title></head><body style="font-family:Arial,sans-serif;color:#6b6b6b;\
padding:24px">Flint chart view UI is not built. Run <code>npm run build:ui</code> in \
packages/flint-mcp to generate it.</body></html>`;

const SKILL_ASSETS = {
  chart: AGENT_SKILL_ASSET,
  theme: THEME_SKILL_ASSET,
  interaction: INTERACTION_SKILL_ASSET,
  board: BOARD_SKILL_ASSET,
  app: APP_SKILL_ASSET,
} as const;
export type SkillName = keyof typeof SKILL_ASSETS;
const SKILL_NAMES = Object.keys(SKILL_ASSETS) as [SkillName, ...SkillName[]];

function readSkill(name: SkillName): string {
  return readFileSync(SKILL_ASSETS[name], 'utf8');
}

const readAgentSkill = () => readSkill('chart');
const readThemeSkill = () => readSkill('theme');
const readInteractionSkill = () => readSkill('interaction');

/** The `## ` and `### ` headings of a skill, skipping fenced code blocks. */
function skillSections(text: string): { heading: string; level: number; start: number }[] {
  const sections: { heading: string; level: number; start: number }[] = [];
  let fenced = false;
  let offset = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    else if (!fenced && /^#{2,3} /.test(line)) {
      const level = line.startsWith('### ') ? 3 : 2;
      sections.push({ heading: line.slice(level + 1).trim(), level, start: offset });
    }
    offset += line.length + 1;
  }
  return sections;
}

/** A heading as it is compared: no `#` marks, case, punctuation or extra spaces. */
function headingKey(heading: string): string {
  return heading.replace(/^#+\s*/, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * One section of a skill, from its `## ` or `### ` heading up to the next heading of the same or a
 * higher level. The heading matches exactly; else as the start of one heading only, so a shortened
 * name ("Link charts") finds it; else as the one heading that holds every word asked for.
 */
export function skillSection(text: string, heading: string): string {
  const sections = skillSections(text);
  const wanted = headingKey(heading);
  const only = (test: (key: string) => boolean) => {
    const found = sections.flatMap((section, at) => (test(headingKey(section.heading)) ? [at] : []));
    return found.length === 1 ? found[0] : -1;
  };
  let index = sections.findIndex((section) => headingKey(section.heading) === wanted);
  if (index < 0 && wanted) index = only((key) => `${key} `.startsWith(`${wanted} `));
  if (index < 0 && wanted) {
    const words = wanted.split(' ');
    index = only((key) => words.every((word) => key.split(' ').includes(word)));
  }
  if (index < 0) {
    throw new Error(
      `No section "${heading}". Sections: ${sections.map((section) => `"${section.heading}"`).join(', ')}.`,
    );
  }
  const { level, start } = sections[index];
  const end = sections.slice(index + 1).find((section) => section.level <= level)?.start ?? text.length;
  return text.slice(start, end).trimEnd() + '\n';
}

/** Read the bundled view HTML, tolerating a not-yet-built asset. */
function readViewHtml(): string {
  try {
    return readFileSync(VIEW_ASSET, 'utf8');
  } catch {
    return VIEW_PLACEHOLDER;
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

/** A result as plain JSON, for a tool's structuredContent. */
function toStructured(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value));
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
        'Vega-Lite, ECharts, Chart.js or Plotly. Before your first chart, call get_flint_skill with skill ' +
        '"chart" once and keep it for the conversation. By DEFAULT, show a chart whenever the host supports ' +
        'MCP App UIs, with the lightest view that answers: one question is one chart, passed to show as chart; ' +
        'the card draws it live with an editing panel, and its report says what to fix. An open question ("how ' +
        'did X do", "what does this data say", "tell me something interesting") gets the one chart that answers ' +
        'it best, or two side by side only when it has two halves; name in your reply what else you could show, ' +
        'and draw it when the user asks. One view split by a category (a panel per region, same measure) is ' +
        'still one chart, with column or row encodings. A board is for when the user asks for one: a dashboard, ' +
        'an overview, KPI tiles, linked views, or several charts named in one turn: load skill "board", then ' +
        'call show with it. show checks the ' +
        'spec itself: no need to validate first; when it returns fixes, nothing was drawn, so fix and call show again. The server keeps nothing between calls: to change a chart, change its spec ' +
        'and call show again. list_chart_types lists the chart types; pass chartType for one type\'s ' +
        'guidance, properties and presets. The editing panel is not interactivity: when the user asks for ' +
        'behaviour on a chart (hover, click, brush, zoom, filter) or for marks on it (notes, emphasis, a ' +
        'reference line), load skill "interaction". Load skill "theme" to create or substantially customize ' +
        'a ThemeSpec (list_themes for presets), and skill "app" only when the user asks for code. Use ' +
        'render_chart for a static PNG/SVG only when the host has no App UI or the user wants an image, and ' +
        'compile_chart for backend JSON. Pass `section` with a heading to get only part of a skill.' +
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
        'The chartjs backend supports PNG only. Prefer show instead ' +
        'when the host supports MCP App UIs; use render_chart for a static ' +
        'artifact or when no App UI is available.',
      inputSchema: {
        ...referencedShape(assemblyInputShape, 'chart'),
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
        const input = toAssemblyInput({ ...args, ...checkArgs(assemblyInputShape, args) } as AssemblyInputArgs);
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
      inputSchema: { ...referencedShape(assemblyInputShape, 'chart'), backend: backendEnum },
    },
    async (args: any) => {
      try {
        const input = toAssemblyInput({ ...args, ...checkArgs(assemblyInputShape, args) } as AssemblyInputArgs);
        await installFlintTextMeasurer();
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
        'Validate a Flint chart spec for a backend without rendering. Every backend returns the validation ' +
        'result as JSON (also in structuredContent). For vegalite, a second block follows: the report of ' +
        'what to act on (errors, warnings, interaction_spec entries the chart drops, and update ops that ' +
        'will not apply, ✗), the same report show returns; "Nothing to fix" when it is clean. For a host ' +
        'with no card UI; with a card, call show directly, which runs the same check. Nothing is kept ' +
        'between calls.',
      inputSchema: { ...referencedShape({ ...assemblyInputShape, ...updatesShape }, 'chart'), backend: backendEnum },
    },
    async (args: any) => {
      try {
        args = { ...args, ...checkArgs({ ...assemblyInputShape, ...updatesShape }, args) };
        const { result } = validateChart(toAssemblyInput(args as AssemblyInputArgs), args.backend as RenderBackend, {
          ...dataSourceOptions,
          roots: await clientRoots(),
          updates: args.updates,
        });
        if (args.backend !== 'vegalite') return { ...jsonResult(result), structuredContent: toStructured(result) };
        const findings = result.valid ? chartFindings(args.updates, result) : result.errors.map((error) => `✗ ${error.message}`);
        const chart = { id: 'chart', kind: 'chart' as const, charts: [] };
        // The JSON result comes first on every backend, for hosts that parse it; the report follows for the agent.
        return {
          content: [
            ...jsonResult(result).content,
            { type: 'text' as const, text: viewReport(chart, [{ id: 'chart', drawn: result.valid, findings }]) },
          ],
          structuredContent: toStructured(result),
        };
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
        'The chart types, each with its channels and a one-line note on what it is for, for a backend ' +
        '(or all). Pass `chartType` for one type in full: its guidance (map keys, which bar chart), its ' +
        'chartProperties with values, defaults and effects, and the interaction presets it supports in ' +
        'interaction_spec (Vega-Lite).',
      inputSchema: {
        backend: backendEnum.optional(),
        chartType: z.string().optional().describe('One chart type name, for its guidance, properties and presets.'),
      },
    },
    async (args: any) => {
      try {
        return jsonResult(listChartTypes(args?.backend as RenderBackend | undefined, args?.chartType));
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
        '"interaction", section "Add interactions".',
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
        'Return a bundled Flint skill as markdown. Read it once before you write the ' +
        'matching spec: `chart` for a ChartAssemblyInput, `theme` for a ThemeSpec, ' +
        '`interaction` for an interaction_spec or ChartUpdate layers (updates), ' +
        '`board` for a board spec, `app` for code that uses flint-chart in an ' +
        'application. Pass `section` with a heading to get only that part; an ' +
        'unknown section lists the headings. The same text is served as the ' +
        'flint://agent-skill, flint://theme-skill, flint://interaction-skill, ' +
        'flint://board-skill and flint://app-skill resources.',
      inputSchema: {
        skill: z.enum(SKILL_NAMES).describe('Which skill: chart, theme, interaction, board, or app.'),
        section: z
          .string()
          .optional()
          .describe('One heading of the skill, e.g. "Update the chart" or "Muted annotations".'),
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

  // --- charts and boards: checked by validate_*, drawn by show (MCP App) ---
  // Nothing is kept between calls: every tool builds the chart or board again from the spec it is given.
  const boardChart = boardChartShape(assemblyInputShape);
  const boardFields = boardFieldsShape(assemblyInputShape.theme_spec);
  const chartSpec = z.object({ ...assemblyInputShape, ...updatesShape, ...viewShape }).describe('One chart: a ChartAssemblyInput with its update layers.');
  const boardSpec = z
    .object({
      ...boardFields,
      charts: z.array(boardChart).describe('The charts, in reading order: KPI tiles first, then the lead chart, then the charts that explain it.'),
      link_spec: linkSpecShape.optional(),
      grid: gridShape.optional(),
    })
    .describe('A board of several charts under one headline: a dashboard, a comparison, an overview with its detail.');
  const validateBoardChart = async (input: ChartAssemblyInput, updates: ChartUpdate[] | undefined) =>
    validateChart(input, 'vegalite', { ...dataSourceOptions, roots: await clientRoots(), updates });
  /** The chart or board a spec describes, checked; a chart spec is a board of one. */
  const assemble = (args: { chart?: unknown; board?: unknown }) => {
    if ((args.chart === undefined) === (args.board === undefined)) throw new Error('Pass one of chart or board.');
    return args.chart !== undefined
      ? assembleBoard({ charts: [{ ...(args.chart as BoardChartArgs), id: 'chart' }] }, 'chart', validateBoardChart)
      : assembleBoard(args.board as BoardSpec, 'board', validateBoardChart);
  };

  server.registerTool(
    'validate_board',
    {
      title: 'Validate board',
      description:
        'Check a board of several Flint charts without drawing it, for a host with no card UI or a static ' +
        'image; with a card, call show directly, which runs the same check. The report gives the layout in one ' +
        'line, what to fix before it draws, and what it would draw with. Before the first board, call ' +
        'get_flint_skill with skill "board".',
      inputSchema: referencedShape(boardSpec.shape, 'board'),
    },
    async (args: any) => {
      try {
        args = checkArgs(boardSpec.shape, args);
        const { board, outcomes, notes } = await assemble({ board: args });
        return { content: [{ type: 'text' as const, text: viewReport(board, outcomes, notes) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  registerAppTool(
    server,
    'show',
    {
      title: 'Show chart or board',
      description:
        'Put a chart or a board on screen: pass the full spec as chart or as board; there is no need to ' +
        'validate first. show checks the spec: one with errors, or with something it must not be drawn with ' +
        '(rows drawn as slices, a link that joins nothing), draws nothing and returns what to fix, so call show ' +
        'again with the fixed spec. Otherwise the card draws it live with an editing panel, and the result notes ' +
        'what it drew with; change nothing for those unless the user asks. Nothing is kept: to change what is on ' +
        'screen, change the spec and call show again; a new card shows it and earlier cards stay as they were.',
      inputSchema: {
        chart: chartSpec.optional(),
        board: boardSpec.optional(),
      },
      _meta: { ui: { resourceUri: VIEW_RESOURCE_URI } },
    },
    async (args: any) => {
      try {
        const { board, outcomes, notes } = await assemble(args);
        const failed = outcomes.filter((outcome) => !outcome.drawn);
        if (failed.length > 0) {
          const text = `Nothing was drawn: ${failed.map((outcome) => `${outcome.id} ${outcome.findings.join('; ')}`).join('; ')}. Fix the spec and call show again.`;
          return { content: [{ type: 'text' as const, text }], _meta: { flint: { error: text } }, isError: true };
        }
        // What the board must not be drawn with comes back to the agent; the card says it is being revised.
        if (reportBody(board, outcomes, notes).fix.length > 0) {
          const text = viewReport(board, outcomes, notes, 'held');
          return { content: [{ type: 'text' as const, text }], _meta: { flint: { held: HELD } }, isError: true };
        }
        const snapshot = boardSnapshot(board);
        return {
          content: [{ type: 'text' as const, text: viewReport(board, outcomes, notes, 'shown') }],
          // A small board also rides in structuredContent, which a host keeps when it draws the card again.
          ...(fitsInResult(snapshot) ? { structuredContent: { flint: { board: snapshot } } } : {}),
          _meta: { flint: { board: snapshot } },
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  registerAppResource(
    server,
    'view',
    VIEW_RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: VIEW_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: readViewHtml(),
          // Maps fetch their named boundaries from Flint's site: the view carries none of them.
          _meta: { ui: { permissions: { clipboardWrite: {} }, csp: { connectDomains: ['https://microsoft.github.io'] } } },
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
        'Bundled instructions for behaviour and state on a chart: when to add interactions, presets as one valid interaction_spec, and the ChartUpdate layers (updates) an agent leaves on a chart.',
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

  server.registerResource(
    'board-skill',
    BOARD_SKILL_RESOURCE_URI,
    {
      title: 'Flint board-author skill',
      description:
        'Bundled instructions for a board of several charts in one card: the headline, which charts, their layout, links between them, and refining the board from its report.',
      mimeType: 'text/markdown',
      annotations: { audience: ['assistant'], priority: 1 },
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: readSkill('board') }],
    }),
  );

  server.registerResource(
    'app-skill',
    APP_SKILL_RESOURCE_URI,
    {
      title: 'Flint app-author skill',
      description:
        'Bundled instructions for code that uses flint-chart: install, compile, mount with interactions, read the chart, apply updates, link charts, and bespoke interactions.',
      mimeType: 'text/markdown',
      annotations: { audience: ['assistant'], priority: 1 },
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: readSkill('app') }],
    }),
  );

  server.registerPrompt(
    'author_flint_interaction',
    {
      title: 'Author Flint interactions',
      description:
        'Load the Flint interaction-author skill before adding behaviour to a chart, or marks and emphasis (updates) on it.',
    },
    async () => ({
      description: 'Use the bundled Flint interaction-author skill to produce a valid interaction_spec or ChartUpdate.',
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
              'For presets, use list_interaction_presets with chartType to confirm the ones the chart type supports, ' +
              'and return the bare interaction_spec without changing the chart spec. ' +
              'For a chart on screen, return one ChartUpdate.',
          },
        },
      ],
    }),
  );

  return server;
}
