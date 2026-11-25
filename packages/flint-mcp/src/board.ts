// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { ChartAssemblyInput, ChartLink, ChartUpdate, LinkSpec, ValidateResult } from 'flint-chart';
import { drawsAsTable, isMeasureType, validateLinks } from 'flint-chart';

import { ROW_UNITS, boardColumns, boardRows, gridItemFor, gridProblem, isKpi, type ChartLayout, type GridItem } from './board-layout.js';

/** The characters of a chart title that fit on one line per row unit, at the card's heading size. */
const TITLE_CHARS_PER_UNIT = 7.5;
import { toAssemblyInput, updatesShape, viewShape, type AssemblyInputArgs, type ChartView } from './tools/schemas.js';

/** One chart on a board: the spec with its data inline, and the agent's update layers. */
export interface BoardChart {
  id: string;
  input: ChartAssemblyInput;
  updates?: ChartUpdate[];
  layout?: ChartLayout;
  /** The view the cell opens in; the reader's switch holds until the agent sets it again. */
  view?: ChartView;
  /** The rows were read from a local data.url file, so they never passed through the conversation. */
  fromFile?: true;
}

export interface Board {
  id: string;
  /** A chart: one chart, drawn as the chart card. A board: several under one headline. */
  kind: 'chart' | 'board';
  /** The headline: what the board shows or is for. */
  title?: string;
  /** The deck: the data, its scope and period. */
  subtitle?: string;
  /** The footer: where the data comes from and when. */
  source?: string;
  /** The theme of every chart that does not set its own. */
  theme_spec?: ChartAssemblyInput['theme_spec'];
  /** Colours bound to values, per field, on every chart that colours by the field; a chart's own win. */
  colors?: Record<string, Record<string, string>>;
  /** Board columns; two once the board holds two charts that are not KPI tiles. */
  columns?: number;
  /** Where each chart sits, as the reader arranged it on a card; the rows of `columns` and `layout` without it. */
  grid?: GridItem[];
  charts: BoardChart[];
  /** The fields the charts connect on; none when the charts stand alone. */
  link_spec?: LinkSpec;
  /** What each chart sends and receives under `link_spec`, checked on each write. */
  linked?: Record<string, ChartLink>;
}

/** A chart spec as a tool argument: its id, the chart input, and its update layers. */
export type BoardChartArgs = AssemblyInputArgs & { id: string; updates?: ChartUpdate[]; layout?: ChartLayout; view?: ChartView };

/** The board fields a board spec sets around its charts. */
export type BoardFields = Pick<Board, 'title' | 'subtitle' | 'source' | 'theme_spec' | 'colors' | 'columns'>;

export const layoutShape = z
  .object({
    span: z.number().int().min(1).max(4).optional().describe('Board columns the chart spans. Default: the full row for time series, maps and Gantt charts, else one column.'),
    height: z.enum(['compact', 'standard', 'tall']).optional().describe('compact (~130px) for KPI tiles and sparklines, standard (~280px, the default), tall (~420px) for a lead chart, a map, or many categories. A row takes its tallest chart\'s height.'),
  })
  .describe('Where the chart sits on the board. KPI Cards that follow each other share a row of up to four.');

export function boardFieldsShape(themeShape: z.ZodTypeAny) {
  return {
    title: z.string().optional().describe('The headline: what the board shows or is for, in words, e.g. "Sales recovered in Q3, led by Europe". The card draws it largest; every board needs one.'),
    subtitle: z.string().optional().describe('The deck: the data, its scope and period, e.g. "Monthly revenue by region and product, Jan–Sep 2025, $m".'),
    source: z.string().optional().describe('The footer: where the data comes from and when, e.g. "Source: company ledger, as of 30 Sep 2025".'),
    theme_spec: themeShape.describe('The theme of every chart that does not set its own; the card takes its fonts and colours. Prefer setting it here, once, over per chart.'),
    colors: z
      .record(z.string(), z.record(z.string(), z.string()))
      .optional()
      .describe('Colours bound to values, per field: { "Category": { "Jewelry": "#c0392b" } }. Every chart that colours by the field takes them (its own colors win); values left out take the palette. For one colour per value across the board, and across later turns: pass the same map again.'),
    columns: z.number().int().min(1).max(4).optional().describe('Board columns. Default: 2 once the board holds two charts that are not KPI tiles, else 1.'),
  };
}

type Validate = (input: ChartAssemblyInput, updates: ChartUpdate[] | undefined) => Promise<{ result: ValidateResult; input: ChartAssemblyInput }>;

export function boardChartShape(assemblyInputShape: Record<string, z.ZodTypeAny>) {
  return z.object({
    id: z.string().describe('Names the chart on the board; link_spec, grid and the report use it.'),
    ...assemblyInputShape,
    // The chart's own schema, not a re-described copy: zod would write a copy out in full again.
    ...updatesShape,
    layout: layoutShape.optional(),
    ...viewShape,
  });
}

export const linkSpecShape = z
  .object({
    fields: z.array(z.string()).describe(
      'The fields the charts connect on (e.g. ["country", "region"]). A selection is about the fields its interaction selects by: a clicked mark all of them it carries, a group focus its group field, a brush its axis field. Every other chart emphasizes its marks that match on each of those fields it carries. A chart joins a field only if its marks carry it: encode it, on detail if nothing else shows it.',
    ),
    charts: z
      .record(z.string(), z.object({ send: z.boolean().optional(), receive: z.boolean().optional() }))
      .optional()
      .describe('Per chart id: send: false keeps its selections to itself; receive: false keeps it as drawn, as an overview does.'),
  })
  .describe('How the charts on the board connect: by the fields they share. One selection holds at a time; a new one replaces the last.');

/** What one checked chart has to say: its warnings and the update ops that do not apply. */
export function chartFindings(updates: readonly ChartUpdate[] | undefined, result: ValidateResult): string[] {
  const ops = (result.updates ?? []).flatMap((check) => check.ops);
  const failed = ops.filter((op) => !op.ok).length;
  const lines: string[] = [];
  if (failed > 0) {
    lines.push(`${failed} of ${ops.length} update ops do not apply; the chart draws without them. Fix each one, or tell the user what is missing.`);
  } else if ((updates?.length ?? 0) > 0) {
    lines.push(`All ${ops.length} update ops apply.`);
  }
  lines.push(...result.warnings.map((warning) => warning.message));
  return lines;
}

/** The outcome of one chart write: the chart drawn, or why it was not. */
export interface ChartOutcome {
  id: string;
  drawn: boolean;
  /** What the model should act on or tell the user; empty when there is nothing to say. */
  findings: string[];
}

/** The chart input as the card draws it: the board's theme where the chart sets none. */
export function withBoardTheme(input: ChartAssemblyInput, board: Pick<Board, 'theme_spec'>): ChartAssemblyInput {
  return input.theme_spec !== undefined || board.theme_spec === undefined ? input : { ...input, theme_spec: board.theme_spec };
}

/**
 * The chart input with the board's colours bound to its fields' values, under any the chart binds
 * itself: the board's map goes into each field's semantic annotation, which every colour channel reads.
 */
export function withBoardColors(input: ChartAssemblyInput, board: Pick<Board, 'colors'>): ChartAssemblyInput {
  if (!board.colors) return input;
  const types = { ...(input.semantic_types ?? {}) } as Record<string, unknown>;
  let changed = false;
  const encoded = new Set(Object.values(input.chart_spec.encodings ?? {}).flatMap((value) => [value].flat())
    .map((value) => (typeof value === 'string' ? value : (value as { field?: string } | undefined)?.field)));
  for (const [field, colors] of Object.entries(board.colors)) {
    if (!encoded.has(field)) continue;
    const current = types[field];
    const annotation: Record<string, unknown> = typeof current === 'string' ? { semanticType: current } : { ...((current as Record<string, unknown>) ?? {}) };
    annotation.colors = { ...colors, ...((annotation.colors as Record<string, string> | undefined) ?? {}) };
    types[field] = annotation;
    changed = true;
  }
  return changed ? { ...input, semantic_types: types as ChartAssemblyInput['semantic_types'] } : input;
}

export async function prepareChart(
  args: BoardChartArgs,
  validate: Validate,
  board: Pick<Board, 'theme_spec' | 'colors'>,
): Promise<{ chart?: BoardChart; outcome: ChartOutcome; errors?: string }> {
  const { id, updates, layout, view, fromFile: keptFromFile, ...rest } = args as BoardChartArgs & { fromFile?: true };
  const own = withBoardColors(toAssemblyInput(rest as AssemblyInputArgs), board);
  // An update that leaves the data alone rebuilds from rows already read, so the file origin carries over.
  const fromFile = typeof own.data?.url === 'string' || keptFromFile === true;
  const { result, input } = await validate(withBoardTheme(own, board), updates);
  if (!result.valid) {
    const errors = result.errors.map((e) => e.message).join('; ');
    return { errors, outcome: { id, drawn: false, findings: [`✗ not drawn: ${errors}`] } };
  }
  const opensAsTable = view === 'table' && !drawsAsTable(input.chart_spec.chartType);
  // The board's theme stays the board's, so the card's theme switch reaches every chart that set none.
  const stored = { ...input, theme_spec: own.theme_spec };
  return {
    chart: {
      id, input: stored, ...(updates ? { updates } : {}), ...(layout ? { layout } : {}), ...(opensAsTable ? { view } : {}),
      ...(fromFile ? { fromFile: true as const } : {}),
    },
    outcome: { id, drawn: true, findings: chartFindings(updates, result) },
  };
}

/** Checks what each chart sends and receives under the board's link spec; called after each write. */
export function relink(board: Board): void {
  board.linked = board.link_spec
    ? validateLinks(Object.fromEntries(board.charts.map((chart) => [chart.id, chart.input])), board.link_spec)
    : undefined;
}

function layoutCharts(board: Board) {
  return board.charts.map((chart) => ({ id: chart.id, chartType: chart.input.chart_spec.chartType, layout: chart.layout }));
}

/**
 * The arrangement a board spec passes, fitted to its charts: places of charts no longer on the board
 * are dropped and new charts take a place below the rest. An arrangement that still does not fit is
 * dropped for the rows, and the note says why.
 */
export function fitGrid(board: Board): string | undefined {
  if (!board.grid) return undefined;
  const ids = new Set(board.charts.map((chart) => chart.id));
  let grid = board.grid.filter((item) => ids.has(item.id));
  for (const chart of board.charts) {
    if (!grid.some((item) => item.id === chart.id)) {
      grid = [...grid, gridItemFor(grid, { id: chart.id, chartType: chart.input.chart_spec.chartType, layout: chart.layout })];
    }
  }
  const problem = gridProblem(grid, board.charts.map((chart) => chart.id));
  if (problem) {
    board.grid = undefined;
    return `The grid was dropped for the rows: ${problem}.`;
  }
  board.grid = grid;
  return undefined;
}

/** Chart types that draw one mark per row, so rows that repeat a category stack as slices. */
const ROW_MARKS = new Set(['Bar Chart', 'Stacked Bar Chart', 'Grouped Bar Chart', 'Bar Table', 'Lollipop Chart', 'Pie Chart', 'Heatmap']);

/**
 * Why a chart draws one mark per row where the reader expects one per category: several rows share
 * every category it encodes and no channel sums them. Undefined when each category has one row.
 */
function stackedRepeats(input: ChartAssemblyInput): string | undefined {
  const { chartType, encodings = {} } = input.chart_spec as { chartType: string; encodings?: Record<string, unknown> };
  if (!ROW_MARKS.has(chartType)) return undefined;
  const fieldOf = (value: unknown) => (typeof value === 'string' ? value : (value as { field?: string } | undefined)?.field);
  const aggregated = Object.values(encodings).some((value) => typeof value === 'object' && value !== null && 'aggregate' in (value as object));
  if (aggregated) return undefined;
  const rows = (input.data.values ?? []) as Record<string, unknown>[];
  const fields = [...new Set(Object.values(encodings).map(fieldOf).filter((field): field is string => !!field))];
  // The measure is the one field typed as one; every other encoded field splits the marks, numbers
  // included (a year, an edition). Untyped, text fields are the categories and a number the measure.
  const typeOf = (field: string) => {
    const annotation = input.semantic_types?.[field];
    return typeof annotation === 'string' ? annotation : annotation?.semanticType;
  };
  // A heatmap's measure is its colour, whatever the colour field is typed as (match points, a score).
  const heatColor = chartType === 'Heatmap' ? fieldOf(encodings.color) : undefined;
  const typed = heatColor ? [heatColor] : fields.filter((field) => isMeasureType(typeOf(field) ?? ''));
  const categories = typed.length === 1
    ? fields.filter((field) => field !== typed[0])
    : fields.filter((field) => rows.some((row) => typeof row?.[field] === 'string'));
  const measure = typed.length === 1
    ? typed[0]
    : fields.find((field) => !categories.includes(field) && rows.some((row) => typeof row?.[field] === 'number'));
  if (categories.length === 0 || !measure) return undefined;
  const keys = new Set(rows.map((row) => JSON.stringify(categories.map((field) => row?.[field]))));
  if (keys.size === rows.length) return undefined;
  const channel = Object.entries(encodings).find(([, value]) => fieldOf(value) === measure)?.[0] ?? 'x';
  return `draws ${rows.length} rows as ${keys.size} ${categories.join(' × ')} groups, so each mark is a stack of slices, one per row: sum the rows first, or set encodings.${channel}.aggregate to "sum".`;
}

/**
 * What the board should still change to read well, each note with its fix. `fix` holds what a board
 * must not be drawn with (repeated rows drawn as slices); `noted` what the agent may change next time or
 * tell the user, which the card draws with.
 */
export function boardReview(board: Board): { fix: string[]; noted: string[] } {
  const fix: string[] = [];
  const notes: string[] = [];
  if (!board.title) notes.push('No board title: set title to what the board shows or is for, in words.');
  if (board.title && board.title.length > 90) notes.push('The board title is long; keep it to one line and move the detail to subtitle.');
  const kpis = board.charts.filter((chart) => isKpi(chart.input.chart_spec.chartType)).length;
  // Two charts side by side read from the board's title alone; a dashboard needs its deck and chart headings.
  const dashboard = kpis > 0 || board.charts.length >= 3;
  if (dashboard && !board.subtitle) notes.push('No subtitle: say the data, its scope, period and units.');
  const untitled = board.charts.filter((chart) => !isKpi(chart.input.chart_spec.chartType) && !chart.input.chart_spec.title).map((chart) => chart.id);
  if (dashboard && untitled.length > 0) notes.push(`No title on ${untitled.join(', ')}: each chart draws its title as its heading; name what the chart shows.`);
  const charts = layoutCharts(board);
  const units = new Map(boardRows(charts, boardColumns(charts, board.columns)).flatMap((row) => row.charts.map((cell) => [cell.id, cell.units] as const)));
  const long = board.charts.flatMap((chart) => {
    const title = chart.input.chart_spec.title;
    const limit = Math.round((units.get(chart.id) ?? ROW_UNITS) * TITLE_CHARS_PER_UNIT);
    return title && title.length > limit ? [`${chart.id} (${title.length} characters, about ${limit} fit)`] : [];
  });
  if (long.length > 0) notes.push(`Chart titles that wrap at their width: ${long.join(', ')}; shorten each to one line and move detail to its subtitle.`);
  for (const chart of board.charts) {
    const stacked = stackedRepeats(chart.input);
    if (stacked) fix.push(`${chart.id} ${stacked}`);
  }
  const sized = board.charts.filter((chart) => chart.input.chart_spec.baseSize || chart.input.chart_spec.canvasSize).map((chart) => chart.id);
  if (sized.length > 0) notes.push(`${sized.join(', ')} set baseSize or canvasSize: on a board each chart takes its cell's size, set by layout.span and layout.height, so these are not used.`);
  if (kpis > 5) notes.push(`${kpis} KPI tiles: unless the user asked for them, keep the three to five numbers the reader acts on.`);
  if (board.charts.length - kpis > 6) notes.push(`${board.charts.length - kpis} charts: unless the user asked for them, a board reads best with up to six.`);
  const themes = new Set(board.charts.map((chart) => JSON.stringify(chart.input.theme_spec ?? null)).filter((theme) => theme !== 'null'));
  if (themes.size > 1 || (themes.size === 1 && board.theme_spec !== undefined)) {
    notes.push('Charts set their own themes; set theme_spec once on the board and drop it from the charts so the board reads as one piece.');
  }
  return { fix, noted: notes };
}

/** A theme as the model reads it: its preset id, a custom theme's label, or Flint's default. */
export function themeName(theme: ChartAssemblyInput['theme_spec'] | null): string {
  if (theme === undefined || theme === null) return 'Flint default';
  if (typeof theme === 'string') return theme;
  const custom = theme as { label?: string; id?: string; extends?: string };
  return custom.label ?? custom.id ?? (custom.extends ? `custom (${custom.extends})` : 'custom');
}

/** The board as the card reads it. */
/**
 * The largest board `show` also returns in structuredContent, in bytes of JSON. VS Code's agent
 * sessions rebuild a card's result from content and structuredContent alone, dropping _meta, so a
 * card drawn again finds its chart only there; but that copy also reaches the model, so only small
 * boards ride along (about 1k tokens at most).
 */
export const RESULT_COPY_LIMIT = 4096;

/**
 * Whether `show` may also put the board in structuredContent: every chart's rows came inline, so they
 * are in the conversation already, and the board is small. Rows read from a local file never are.
 */
export function fitsInResult(board: Board): boolean {
  if (board.charts.some((chart) => chart.fromFile)) return false;
  return Buffer.byteLength(JSON.stringify(board), 'utf8') <= RESULT_COPY_LIMIT;
}

export function boardSnapshot(board: Board): Board {
  return {
    ...board,
    charts: board.charts.map((chart) => ({ ...chart })),
    ...(board.link_spec ? { link_spec: { ...board.link_spec } } : {}),
    ...(board.linked ? { linked: { ...board.linked } } : {}),
    ...(board.grid ? { grid: board.grid.map((item) => ({ ...item })) } : {}),
  };
}

/**
 * A chart or board from its spec, every chart checked, nothing kept: validate_chart, validate_board
 * and show each build it again from the spec the agent passes. A chart with errors is left off the
 * board, and its outcome says why.
 */
export async function assembleBoard(
  spec: BoardSpec,
  kind: Board['kind'],
  validate: Validate,
): Promise<{ board: Board; outcomes: ChartOutcome[]; notes: string[] }> {
  const board: Board = {
    id: `${kind}-${randomBytes(8).toString('hex')}`,
    kind,
    ...(spec.title !== undefined ? { title: spec.title } : {}),
    ...(spec.subtitle !== undefined ? { subtitle: spec.subtitle } : {}),
    ...(spec.source !== undefined ? { source: spec.source } : {}),
    ...(spec.theme_spec !== undefined ? { theme_spec: spec.theme_spec } : {}),
    ...(spec.colors !== undefined ? { colors: spec.colors } : {}),
    ...(spec.columns !== undefined ? { columns: spec.columns } : {}),
    ...(spec.grid ? { grid: spec.grid } : {}),
    charts: [],
  };
  const outcomes: ChartOutcome[] = [];
  for (const chartArgs of spec.charts) {
    const { chart, outcome } = await prepareChart(chartArgs, validate, board);
    outcomes.push(outcome);
    if (chart) board.charts.push(chart);
  }
  if (spec.link_spec) board.link_spec = spec.link_spec;
  relink(board);
  const notes = [fitGrid(board)].filter((note): note is string => note !== undefined);
  return { board, outcomes, notes };
}

/** A board as a tool argument: its fields, its charts, how they connect, and the reader's arrangement. */
export type BoardSpec = BoardFields & { charts: BoardChartArgs[]; link_spec?: LinkSpec; grid?: GridItem[] };

export const gridShape = z
  .array(z.object({ id: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number() }))
  .describe('Where each chart sits on a 12-column grid, as the reader arranged it on a card; the card\'s context gives it. Leave it out for rows.');
