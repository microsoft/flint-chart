// Data and chart inputs for the talk deck. Every chart in the deck is rendered live from these.
import type { ChartAssemblyInput, ThemeSpec } from 'flint-chart';
import { assembleVegaLite } from 'flint-chart';
import { OMNI_VIZ_GAME_ORDER, OMNI_VIZ_ROWS, TEST_GENERATORS } from 'flint-chart/test-data';
import foodPrices from '../data/cpi-food-prices.json';
import gapminderCsv from '../assets/gapminder-five-year.csv?raw';
import { csvParseRows } from 'd3-dsv';
import { testCaseToAssemblyInput } from '../shared/test-case-utils';
import vlGames from './specs/vl-0-games.json';
import vlGamesBar from './specs/vl-0-games-bar.json';
import vlTheme from './specs/vl-3-theme.json';
import vlFinal from './specs/vl-4-final.json';

// ---------------------------------------------------------------- the paper's running example
type GameRow = { period: string; game: string; gameType: string; newUsers: number; totalUsers: number; region: string };
export const ALL_ROWS: GameRow[] = OMNI_VIZ_ROWS.map(({ period, game, gameType, newUsers, totalUsers, region }) =>
  ({ period, game, gameType, newUsers, totalUsers, region }));
const GAMES8 = OMNI_VIZ_GAME_ORDER.slice(0, 8) as readonly string[];
export const ROWS8 = ALL_ROWS.filter((r) => GAMES8.includes(r.game));

/** A stable number in [0, 1) for a key, so the earlier years come out the same on every load. */
function hash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}
export const YEARS = [2021, 2022, 2023, 2024, 2025];
/** The heatmap story's rows: five years of months, the earlier years varied from 2025. */
export const LONG_ROWS: GameRow[] = YEARS.flatMap((year) => ALL_ROWS.map((r) => {
  if (year === 2025) return r;
  const key = `${year}|${r.period}|${r.game}|${r.region}`;
  const newUsers = Math.round(r.newUsers * (0.45 + hash01(key) * 0.9) + (hash01(`${key}|shift`) - 0.55) * 3000);
  return { ...r, period: `${year}${r.period.slice(4)}`, newUsers };
}));
export const LONG8 = LONG_ROWS.filter((r) => GAMES8.includes(r.game));

const sumBy = <K extends string>(rows: GameRow[], key: (r: GameRow) => K, value: (r: GameRow) => number) =>
  rows.reduce((m, r) => m.set(key(r), (m.get(key(r)) ?? 0) + value(r)), new Map<K, number>());

/** Four synthetic years of monthly active users, summed across regions before taking annual means. */
export const INTRO_ROWS = [2022, 2023, 2024, 2025].flatMap((year) =>
  [...sumBy(ROWS8, (r) => `${r.period}|${r.game}`, (r) => r.totalUsers)].map(([key, totalUsers]) => {
    const [, game] = key.split('|');
    const factor = year === 2025 ? 1 : 0.5 + hash01(`${year}|${game}`) * 0.8;
    return { year, game, activeUsers: Math.round(totalUsers * factor) };
  }));

export const MONTHLY_BY_TYPE = [...sumBy(ALL_ROWS, (r) => `${r.period}|${r.gameType}`, (r) => r.totalUsers)]
  .map(([k, totalUsers]) => { const [period, gameType] = k.split('|'); return { period, gameType, totalUsers }; });
export const MONTHLY_NET = [...sumBy(ALL_ROWS, (r) => r.period, (r) => r.newUsers)].map(([period, newUsers]) => ({ period, newUsers }));
export const GAME_TOTALS = [...sumBy(ALL_ROWS, (r) => r.game, (r) => r.newUsers)].map(([game, newUsers]) => ({ game, newUsers }));

const SEM = { period: 'YearMonth', game: 'Category', newUsers: 'Profit' };

/** The paper heatmap in Flint, with the parts each slide varies. */
export function heatmap(o: {
  theme?: string | ThemeSpec | null; ix?: 'click' | 'brush' | null; games?: 8 | 24; facet?: boolean; bar?: boolean; title?: boolean;
} = {}): ChartAssemblyInput {
  const { theme = 'economist', ix = 'click', games = 8, facet = false, bar = false, title = true } = o;
  return {
    data: { values: games === 24 ? LONG_ROWS : LONG8 },
    semantic_types: SEM,
    chart_spec: {
      chartType: bar ? 'Bar Chart' : 'Heatmap',
      ...(title ? { title: 'Net new users by game', subtitle: bar ? 'Total net change in active users, 2021 to 2025' : 'Monthly net change in active users, 2021 to 2025' } : {}),
      encodings: bar
        ? { x: 'game', y: { field: 'newUsers', aggregate: 'sum' } }
        : { x: 'period', y: 'game', color: { field: 'newUsers', aggregate: 'sum' }, ...(facet ? { column: 'region' } : {}) },
    },
    ...(theme ? { theme_spec: theme } : {}),
    ...(ix ? { interaction_spec: { interactions: [ix === 'brush' ? { type: 'brush-x' } : { type: 'click-group-focus', options: { groupBy: 'game' } }] } } : {}),
  } as ChartAssemblyInput;
}

/** One state of the Flint heatmap as the update slides change it, one request at a time. */
export interface FlintState { theme: string; swap: boolean; facet: boolean; brush: boolean }
export const FLINT_BASE: FlintState = { theme: 'economist', swap: false, facet: false, brush: false };

/** The spec as the slides show it: everything but the rows and the title. */
export function flintShown(st: FlintState): Record<string, unknown> {
  const [x, y] = st.swap ? ['game', 'period'] : ['period', 'game'];
  return {
    semantic_types: SEM,
    chart_spec: {
      chartType: 'Heatmap',
      encodings: { x, y, color: { field: 'newUsers', aggregate: 'sum' }, ...(st.facet ? { column: 'region' } : {}) },
    },
    theme_spec: st.theme,
    interaction_spec: { interactions: [st.brush ? { type: st.swap ? 'brush-y' : 'brush-x' } : { type: 'click-group-focus' }] },
  };
}
/** The same spec with its rows and title, ready to render. */
export function flintInput(st: FlintState): ChartAssemblyInput {
  const shown = flintShown(st) as { chart_spec: Record<string, unknown> } & Record<string, unknown>;
  return {
    ...shown,
    data: { values: LONG8 },
    chart_spec: { ...shown.chart_spec, title: 'Net new users by game', subtitle: 'Monthly net change in active users, 2021 to 2025' },
  } as ChartAssemblyInput;
}

export const lineByType = (extra: Partial<ChartAssemblyInput> = {}): ChartAssemblyInput => ({
  data: { values: MONTHLY_BY_TYPE },
  semantic_types: { period: 'YearMonth', gameType: 'Category', totalUsers: 'Quantity' },
  field_display_names: { totalUsers: 'Active users', gameType: 'Game type', period: 'Month' },
  chart_spec: { chartType: 'Line Chart', encodings: { x: 'period', y: 'totalUsers', color: 'gameType' } },
  ...extra,
} as ChartAssemblyInput);

export const monthlyNetBars: ChartAssemblyInput = {
  data: { values: MONTHLY_NET },
  semantic_types: { period: 'YearMonth', newUsers: 'Profit' },
  field_display_names: { newUsers: 'Net new users', period: 'Month' },
  chart_spec: { chartType: 'Bar Chart', encodings: { x: 'period', y: 'newUsers' } },
} as ChartAssemblyInput;

export const gameBars = (n: 8 | 24, extra: Partial<ChartAssemblyInput> = {}): ChartAssemblyInput => ({
  data: { values: n === 8 ? GAME_TOTALS.slice(0, 8) : GAME_TOTALS },
  semantic_types: { game: 'Category', newUsers: 'Quantity' },
  field_display_names: { newUsers: 'Net new users', game: 'Game' },
  chart_spec: { chartType: 'Bar Chart', encodings: { x: 'game', y: 'newUsers' } },
  ...extra,
} as ChartAssemblyInput);

export const facetLines: ChartAssemblyInput = {
  data: { values: ALL_ROWS },
  semantic_types: { period: 'YearMonth', gameType: 'Category', region: 'Category', totalUsers: 'Quantity' },
  field_display_names: { totalUsers: 'Active users', gameType: 'Game type', period: 'Month', region: 'Region' },
  chart_spec: { chartType: 'Line Chart', encodings: { x: 'period', y: { field: 'totalUsers', aggregate: 'sum' }, color: 'gameType', column: 'region' } },
} as ChartAssemblyInput;

// ---------------------------------------------------------------- other data
export const penguins = (interactions: unknown[] = []): ChartAssemblyInput => {
  const testCase = TEST_GENERATORS['Scatter Plot']().find((t) => t.title === 'Palmer Penguins — flipper length vs body mass')!;
  const { baseSize: _ignored, ...chartSpec } = testCaseToAssemblyInput(testCase).chart_spec;
  return { ...testCaseToAssemblyInput(testCase), chart_spec: chartSpec, ...(interactions.length ? { interaction_spec: { interactions } } : {}) } as ChartAssemblyInput;
};

export const foodLines = (interactions: unknown[] = []): ChartAssemblyInput => ({
  data: {
    values: foodPrices.values
      .filter(({ item }) => item === 'Eggs' || item === 'White bread')
      .map(({ month, price, item }) => ({ Month: month, Price: price, Food: item })),
  },
  semantic_types: { Month: 'Date', Price: 'Currency', Food: 'Category' },
  field_display_names: { Price: 'Average price (USD)' },
  chart_spec: { chartType: 'Line Chart', encodings: { x: 'Month', y: 'Price', color: 'Food' } },
  ...(interactions.length ? { interaction_spec: { interactions } } : {}),
} as ChartAssemblyInput);

/** A few charts for the opening wall: the gallery's own cases. */
export const WALL: ChartAssemblyInput[] = [
  'Omni: Line', 'Omni: Grouped Bar', 'Omni: Waterfall', 'Omni: Heatmap',
].map((key) => {
  const input = testCaseToAssemblyInput(TEST_GENERATORS[key]()[0]);
  const { baseSize: _ignored, ...chartSpec } = input.chart_spec;
  return { ...input, chart_spec: chartSpec } as ChartAssemblyInput;
});

// ---------------------------------------------------------------- the traditional way (Vega-Lite)
// The story's own steps, on the raw rows (period stored as 202501). Each step is the previous one
// plus what that step had to handle, so the slides can show real before → after code.
export const INT_ROWS = LONG8.map((r) => ({ ...r, period: Number(r.period.replace('-', '')) }));
const PARSE_DATE = { calculate: 'utc(floor(datum.period / 100), datum.period % 100 - 1)', as: 'month' };
const dataRef = { url: 'games.json' };
// Sixty month columns: label each year once, at its January, and leave the other ticks bare.
const YEAR_AXIS = { labelExpr: "utcFormat(datum.value, '%m') === '01' ? utcFormat(datum.value, '%Y') : ''", labelAngle: 0, labelAlign: 'left', ticks: false };

type Spec = Record<string, any>;
const parseStep = (timeUnit: string): Spec => ({
  data: dataRef,
  transform: [PARSE_DATE],
  mark: 'rect',
  encoding: {
    x: { field: 'month', type: 'ordinal', timeUnit, axis: { format: '%b' } },
    y: { field: 'game', type: 'nominal' },
    color: { aggregate: 'sum', field: 'newUsers', type: 'quantitative', scale: { scheme: 'redblue', domainMid: 0 } },
  },
});
const layoutStep = (): Spec => ({
  data: dataRef,
  transform: [PARSE_DATE],
  width: 720,
  height: 240,
  mark: 'rect',
  encoding: {
    x: { field: 'month', type: 'ordinal', timeUnit: 'utcyearmonth', title: null, axis: YEAR_AXIS },
    y: { field: 'game', type: 'nominal', title: null, axis: { labelLimit: 120 } },
    color: {
      aggregate: 'sum', field: 'newUsers', type: 'quantitative', title: 'Net new users',
      scale: { scheme: 'redblue', domainMid: 0 },
      legend: { format: '~s' },
    },
  },
});

/** The themed and interactive specs, moved onto the parsed month like the earlier steps. */
function onMonth(spec: Spec): Spec {
  const out = structuredClone(spec);
  out.data = dataRef;
  const heat = out.vconcat[1];
  heat.transform = [PARSE_DATE];
  const rename = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.field === 'period') node.field = 'month';
    for (const v of Object.values(node)) rename(v);
  };
  rename(heat);
  // The same layout fix as the layout step: wide enough for sixty months, one label a year.
  for (const view of out.vconcat) if (view.width) view.width = 720;
  heat.encoding.x.axis = YEAR_AXIS;
  // The brush and click stores key on the renamed field too.
  const json = JSON.stringify(heat).split('utcyearmonth_period').join('utcyearmonth_month');
  out.vconcat[1] = JSON.parse(json);
  return out;
}

/** Rows a compiled spec carries, kept off the spec so its code shows `games.json` like the hand-written steps. */
const COMPILED_ROWS = new WeakMap<Spec, unknown[]>();
const dropInternal = (node: any): any => Array.isArray(node) ? node.map(dropInternal)
  : node && typeof node === 'object' ? Object.fromEntries(Object.entries(node).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, dropInternal(v)]))
  : node;

/** The Economist heatmap as Flint's compiler writes it in Vega-Lite, its internal bookkeeping dropped. */
function compiledTheme(): Spec {
  const { data, ...rest } = dropInternal(assembleVegaLite(heatmap({ theme: 'economist', ix: null })));
  const out: Spec = { data: dataRef, ...rest };
  COMPILED_ROWS.set(out, data.values);
  return out;
}

/** The view holding the heatmap's marks: the spec itself, or its first layer when the compiler layers labels on. */
const markView = (spec: Spec): Spec => spec.layer ? spec.layer[0] : spec;

/** The compiled spec with a click highlight written in by hand: pick a game, fade the rest. */
function withClick(theme: Spec): Spec {
  const out = structuredClone(theme);
  const rect = markView(out);
  rect.params = [{ name: 'pick', select: { type: 'point', fields: ['game'], on: 'click', clear: 'dblclick' } }];
  rect.encoding.opacity = { condition: { param: 'pick', value: 1 }, value: 0.25 };
  const picked = "!isDefined(pick.game) || indexof(pick.game, datum.value) >= 0";
  rect.encoding.y.axis = { ...rect.encoding.y.axis, labelColor: { condition: { test: picked, value: '#121317' }, value: '#b4b8ba' } };
  COMPILED_ROWS.set(out, COMPILED_ROWS.get(theme)!);
  return out;
}

const RAW: Spec = {
  data: dataRef,
  mark: 'rect',
  encoding: {
    x: { field: 'period', type: 'ordinal' },
    y: { field: 'game', type: 'nominal' },
    color: { field: 'newUsers', type: 'quantitative' },
  },
};

export const STEPS = {
  raw: RAW,
  parse: parseStep('utcyearmonth'),
  layout: layoutStep(),
  theme: onMonth(vlTheme),
  final: onMonth(vlFinal),
};

const THEMED = compiledTheme();
/** The VIS talk's theme and click steps: Flint's own compiled Economist heatmap, then a click highlight added by hand. */
export const COMPILED = { theme: THEMED, final: withClick(THEMED) };

const values: Record<string, unknown[]> = { 'intro-games.json': INTRO_ROWS, 'games.json': INT_ROWS };
/** A shown spec with its rows filled in, ready to render. */
export const withData = (spec: Spec): Spec => ({ ...structuredClone(spec), data: { values: COMPILED_ROWS.get(spec) ?? values[spec.data.url] } });

/** The final spec with one game picked, as the app shows it after a click. */
export function picked(spec: Spec, game: string): Spec {
  const out = withData(spec);
  (out.vconcat ? out.vconcat[1] : markView(out)).params[0].value = [{ game }];
  return out;
}

export const PICKED_GAME = 'Granite & Glyphs';
export const INTRO = { heatmap: vlGames as Spec, bar: vlGamesBar as Spec };
export const VL = {
  heatmap: withData(vlGames),
  bar: withData(vlGamesBar),
};
export const PICKED_ROWS = LONG8.filter((r) => r.game === PICKED_GAME).slice(0, 7);

// ---------------------------------------------------------------- section A: types and layout
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The monthly bars with the month stored three different ways; the type reads each one. */
export const monthsStoredAs = (form: 'number' | 'dash' | 'words'): ChartAssemblyInput => ({
  ...monthlyNetBars,
  data: {
    values: MONTHLY_NET.map(({ period, newUsers }) => {
      const [y, m] = period.split('-');
      const month = MONTHS[Number(m) - 1];
      return { period: form === 'number' ? Number(y + m) : form === 'dash' ? `${y}-${month}` : `${month} ${y}`, newUsers };
    }),
  },
} as ChartAssemblyInput);

/** Bars over `n` categories (game and month), at the chart's natural size. */
const GAME_MONTHS = [...sumBy(ALL_ROWS, (r) => `${r.game}, ${MONTHS[Number(r.period.slice(5)) - 1]}`, (r) => r.totalUsers)]
  .map(([item, users]) => ({ item, users }));
export const manyBars = (n: number): ChartAssemblyInput => ({
  data: { values: n <= GAME_TOTALS.length ? GAME_TOTALS.slice(0, n).map(({ game, newUsers }) => ({ item: game, users: Math.abs(newUsers) })) : GAME_MONTHS.slice(0, n) },
  semantic_types: { item: 'Category', users: 'Quantity' },
  field_display_names: { users: 'Active users', item: 'Game' },
  chart_spec: { chartType: 'Bar Chart', encodings: { x: 'item', y: 'users' } },
} as ChartAssemblyInput);

// ---------------------------------------------------------------- the opening
/** The same countries in 1952 and 2007, side by side: a brush in one year finds them in the other. */
export const linkedYears: ChartAssemblyInput = {
  data: {
    values: csvParseRows(gapminderCsv).slice(1)
      .filter(([, year]) => year === '1952' || year === '2007')
      .map(([Country, year, , Continent, life, gdp]) => ({
        Country, Continent, Year: Number(year), 'GDP per capita': Math.round(Number(gdp)), 'Life expectancy': Number(life),
      })),
  },
  semantic_types: { Country: 'Country', Continent: 'Category', Year: 'Year', 'GDP per capita': 'Currency', 'Life expectancy': 'Quantity' },
  chart_spec: {
    chartType: 'Scatter Plot',
    encodings: { x: 'GDP per capita', y: 'Life expectancy', color: 'Continent', detail: 'Country', column: 'Year' },
    chartProperties: { facetColumns: 2, logScale_x: true },
  },
  interaction_spec: { interactions: [{ type: 'linked-brush', options: { groupBy: 'Country', mode: 'stateful' } }] },
} as ChartAssemblyInput;

// ---------------------------------------------------------------- section A: what the types decide
export const TYPES_INPUT = {
  data: { values: INT_ROWS.map(({ period, game, region, newUsers }) => ({ period, game, region, newUsers })) },
  semantic_types: SEM,
  chart_spec: { chartType: 'Heatmap', encodings: { x: 'period', y: 'game', color: { field: 'newUsers', aggregate: 'sum' } } },
} as ChartAssemblyInput;

/** The Flint side: raw rows, three types, and the chart. */
export const TYPES_FLINT = {
  data: { values: [TYPES_INPUT.data.values![0], '…'] },
  semantic_types: SEM,
  chart_spec: TYPES_INPUT.chart_spec,
};

export const TYPES_VEGA_LITE: Record<string, unknown> = assembleVegaLite(TYPES_INPUT);

type Line = { text: string; hot?: boolean; gap?: boolean };
const j = (v: unknown) => JSON.stringify(v).split('","').join('", "').split('":').join('": ').split(',"').join(', "');
/** A small object on one line, spaced inside its braces: `{ "type": "rect", "width": 7 }`. */
const spaced = (v: unknown) => {
  const text = j(v);
  return text.startsWith('{') && text !== '{}' ? `{ ${text.slice(1, -1)} }` : text;
};
/**
 * The parts of the compiled Vega-Lite that the three types decided, taken from the real output, with a
 * comment naming the type behind each.
 */
export function typesCompiled(): Line[] {
  const vl = TYPES_VEGA_LITE as Record<string, any>;
  const { x, y, color } = vl.encoding;
  const ticks: string[] = x.axis?.values ?? [];
  const row = vl.data?.values?.[0] ?? {};
  // Broken where an author would break it, so no line wraps inside a pair on the slide.
  return [
    { text: '{' },
    { text: '  // YearMonth: 202101 is read as a month', gap: true },
    { text: `  "data": { "values": [{ "period": ${j(row.period)}, … }, …] },`, hot: true },
    { text: '  "encoding": {' },
    { text: `    "x": { "field": "period", "type": ${j(x.type)},`, hot: true },
    { text: `      "scale": { "type": ${j(x.scale?.type)} },`, hot: true },
    { text: '      "axis": {', hot: true },
    { text: `        "values": [${ticks.slice(0, 2).map((t) => j(t.slice(0, 10))).join(', ')}, …],`, hot: true },
    { text: '        "labelExpr": "… %Y or %B" } },', hot: true },
    { text: '    // Category: games keep the order they come in', gap: true },
    { text: `    "y": { "field": "game", "type": ${j(y.type)},`, hot: true },
    { text: `      "sort": ${j(y.sort)} },`, hot: true },
    { text: '    // Profit: it can go negative, so colors diverge', gap: true },
    { text: `    "color": { "field": ${j(color.field)},`, hot: true },
    { text: `      "type": ${j(color.type)},`, hot: true },
    { text: `      "scale": { "scheme": ${j(color.scale?.scheme)}, "domainMid": ${j(color.scale?.domainMid)},`, hot: true },
    { text: `        "domain": ${j(color.scale?.domain).replace(',', ', ')} } }`, hot: true },
    { text: '  },' },
    { text: '  // Layout: a cell size for 60 months and 8 games', gap: true },
    { text: `  "mark": ${spaced(vl.mark)},`, hot: true },
    { text: `  "height": ${spaced(vl.height)}`, hot: true },
    { text: '}' },
  ];
}
