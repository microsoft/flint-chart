import type { ChartAssemblyInput, ChartUpdate } from 'flint-chart';
import type { Board, BoardChart } from '../../../packages/flint-mcp/ui/src/BoardView';
import { monthRows, yearRows } from './mcp-experience-range';
import { gapminderRows } from '../playground/gapminder-dashboard-data';
import coffee from '../data/usda-coffee-consumption.json';

/* ------------------------------------------------------------------ */
/* Part 1: one chart, NASA GISTEMP global temperature                 */
/* ------------------------------------------------------------------ */

const recentMonths = monthRows.slice(-24);
const warmestMonth = recentMonths.reduce((top, row) => (row.Anomaly > top.Anomaly ? row : top));
const monthName = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });

const anomalyNames = { Anomaly: '°C vs 1951–1980' };

const line: ChartAssemblyInput = {
  data: { values: yearRows },
  semantic_types: { Year: 'Year', Anomaly: 'Quantity' },
  field_display_names: anomalyNames,
  options: { addTooltips: true },
  chart_spec: {
    chartType: 'Line Chart',
    encodings: { x: { field: 'Year' }, y: { field: 'Anomaly' } },
    title: 'The world has warmed about 1.4 °C since 1880',
    subtitle: 'Global land and ocean temperature',
    chartProperties: { showPoints: true },
  },
} as ChartAssemblyInput;

const brushable: ChartAssemblyInput = {
  ...line,
  interaction_spec: { interactions: [{ type: 'brush-x' }] } as ChartAssemblyInput['interaction_spec'],
};
const themedLine: ChartAssemblyInput = { ...line, theme_spec: 'nyt' };
const themed: ChartAssemblyInput = { ...brushable, theme_spec: 'nyt' };

const columns: ChartAssemblyInput = {
  data: { values: recentMonths },
  semantic_types: { Month: 'YearMonth', Anomaly: 'Quantity' },
  field_display_names: anomalyNames,
  theme_spec: 'nyt',
  chart_spec: {
    chartType: 'Bar Chart',
    encodings: { x: { field: 'Month' }, y: { field: 'Anomaly' } },
    title: 'Every month of the last two years ran more than 1 °C warm',
    subtitle: 'Global land and ocean temperature by month',
  },
} as ChartAssemblyInput;

const warmestTarget = { select: { key: { Month: warmestMonth.Month } } };

const editUpdates: ChartUpdate[] = [
  {
    id: 'agent',
    ops: [
      { op: 'set-style', targets: [warmestTarget], value: { state: 'emphasized' } },
      { op: 'annotate-text', target: warmestTarget, value: { text: `${monthName(warmestMonth.Month)}: +${warmestMonth.Anomaly.toFixed(2)} °C` } },
    ],
  },
] as ChartUpdate[];

function chartCard(input: ChartAssemblyInput, updates?: ChartUpdate[]): Board {
  return { id: 'temperature', kind: 'chart', charts: [{ id: 'chart', input, ...(updates ? { updates } : {}) }] };
}

/* ------------------------------------------------------------------ */
/* The intro: coffee drinking by country, USDA PSD                     */
/* ------------------------------------------------------------------ */

const coffeeRows = coffee.values;
const bagsIn = (country: string, year: number) => coffeeRows.find((row) => row.Country === country && row.Year === year)!.Bags;
const chinaGrowth = bagsIn('China', 2025) / bagsIn('China', 2010);

const coffeeByCountry: ChartAssemblyInput = {
  data: { values: coffeeRows },
  semantic_types: { Year: 'Year', Bags: 'Quantity', Country: 'Country' },
  field_display_names: { Bags: 'Million 60-kg bags' },
  theme_spec: 'nyt',
  chart_spec: {
    chartType: 'Line Chart',
    encodings: { x: { field: 'Year' }, y: { field: 'Bags' }, color: { field: 'Country' } },
    title: "Asia's love for coffee has grown",
    // Wider than tall: the card holds 480px of chart, and the legend takes two rows above the plot.
    baseSize: { width: 520, height: 280 },
    subtitle: 'Coffee consumed in each country, million 60-kg bags, 2005–2025',
    source: 'USDA Foreign Agricultural Service, PSD database',
  },
  interaction_spec: {
    interactions: [
      { type: 'inspect-index', options: { axis: 'x', show: 'all', seriesBy: 'Country', displayValue: true } },
      { type: 'legend-toggle' },
    ],
  } as ChartAssemblyInput['interaction_spec'],
} as ChartAssemblyInput;

const coffeeNotes: ChartUpdate[] = [
  {
    id: 'agent',
    ops: [
      {
        op: 'annotate-text',
        target: { select: { key: { Year: 2025, Country: 'China' } } },
        value: { text: `China: ${chinaGrowth >= 5.5 ? 'nearly 6×' : `${chinaGrowth.toFixed(1)}×`} since 2010` },
      },
    ],
  },
] as ChartUpdate[];

/** The MCP page's one chart: themed and interactive from the first ask. */
export const SIMPLE_CHART: Board = {
  id: 'coffee', kind: 'chart', charts: [{ id: 'chart', input: coffeeByCountry, updates: coffeeNotes }],
};

export type ChartSlideKey = 'create' | 'theme' | 'interact' | 'select' | 'edit';

export const CHART_SLIDES: { key: ChartSlideKey; card: Board; follow?: boolean }[] = [
  { key: 'create', card: chartCard(line) },
  { key: 'theme', card: chartCard(themedLine) },
  { key: 'interact', card: chartCard(themed) },
  { key: 'select', card: chartCard(themed), follow: true },
  { key: 'edit', card: chartCard(columns, editUpdates) },
];

/* ------------------------------------------------------------------ */
/* Part 2: a board, Gapminder health and wealth                       */
/* ------------------------------------------------------------------ */

const continents = [...new Set(gapminderRows.map((row) => row.Continent))].sort();
const countries = new Set(gapminderRows.map((row) => row.Country)).size;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const lifeIn = (year: number, rows = gapminderRows) => mean(rows.filter((row) => row.Year === year).map((row) => row['Life expectancy']));

const latest2007 = gapminderRows.filter((row) => row.Year === 2007);

const continentYears = continents.flatMap((Continent) => {
  const rows = gapminderRows.filter((row) => row.Continent === Continent);
  return [...new Set(rows.map((row) => row.Year))].map((Year) => ({ Year, Continent, 'Life expectancy': Math.round(lifeIn(Year, rows) * 10) / 10 }));
});

const continentTable = continents.map((Continent) => {
  const rows = gapminderRows.filter((row) => row.Continent === Continent);
  return {
    Continent,
    Countries: new Set(rows.map((row) => row.Country)).size,
    'Life expectancy, 1952': Math.round(lifeIn(1952, rows) * 10) / 10,
    'Life expectancy, 2007': Math.round(lifeIn(2007, rows) * 10) / 10,
    'GDP per capita, 2007': Math.round(mean(rows.filter((row) => row.Year === 2007).map((row) => row['GDP per capita']))),
  };
});

const gainRows = continents.map((Continent) => {
  const rows = gapminderRows.filter((row) => row.Continent === Continent);
  return { Continent, 'Years gained': Math.round((lifeIn(2007, rows) - lifeIn(1952, rows)) * 10) / 10 };
});

const populationRows = continents.map((Continent) => ({
  Continent,
  'Population, millions': Math.round(latest2007.filter((row) => row.Continent === Continent).reduce((sum, row) => sum + row.Population, 0) / 1e6),
}));

const scatter: BoardChart = {
  id: 'wealth-health',
  input: {
    data: { values: latest2007.map(({ Country, Continent, Population, 'Life expectancy': life, 'GDP per capita': gdp }) => ({ Country, Continent, 'GDP per capita': gdp, 'Life expectancy': life, Population })) },
    semantic_types: { Country: 'Country', Continent: 'Category', 'GDP per capita': 'Amount', 'Life expectancy': 'Quantity', Population: 'Count' },
    chart_spec: {
      chartType: 'Scatter Plot',
      encodings: { x: { field: 'GDP per capita' }, y: { field: 'Life expectancy' }, color: { field: 'Continent' }, size: { field: 'Population' }, detail: { field: 'Country' } },
      title: 'Richer countries live longer',
      subtitle: 'GDP per capita and life expectancy, 2007',
      chartProperties: { logScale_x: true },
    },
    interaction_spec: { interactions: [{ type: 'click-highlight' }] },
  } as ChartAssemblyInput,
  layout: { span: 1, height: 'standard' },
};

const trend = (span: number): BoardChart => ({
  id: 'life-trend',
  input: {
    data: { values: continentYears },
    semantic_types: { Year: 'Year', Continent: 'Category', 'Life expectancy': 'Quantity' },
    chart_spec: {
      chartType: 'Line Chart',
      encodings: { x: { field: 'Year' }, y: { field: 'Life expectancy' }, color: { field: 'Continent' } },
      title: 'Life expectancy rose on every continent',
      subtitle: 'Average life expectancy by continent, 1952–2007',
    },
    interaction_spec: { interactions: [{ type: 'click-group-focus', options: { groupBy: 'Continent' } }] },
  } as ChartAssemblyInput,
  layout: { span, height: 'standard' },
});

const bars = (id: string, values: Record<string, unknown>[], measure: string, title: string, subtitle: string): BoardChart => ({
  id,
  input: {
    data: { values },
    semantic_types: { Continent: 'Category', [measure]: 'Quantity' },
    chart_spec: {
      chartType: 'Bar Chart',
      encodings: { x: { field: 'Continent' }, y: { field: measure }, color: { field: 'Continent' } },
      title,
      subtitle,
    },
    interaction_spec: { interactions: [{ type: 'click-highlight' }] },
  } as ChartAssemblyInput,
  layout: { span: 1, height: 'standard' },
});

const gains = bars('gains', gainRows, 'Years gained', 'Asia gained the most years', 'Life expectancy gained, 1952–2007');
const population = bars('population', populationRows, 'Population, millions', 'Most of the people live in Asia', 'Population, 2007, millions');

const table: BoardChart = {
  id: 'continents',
  input: {
    data: { values: continentTable },
    semantic_types: { Continent: 'Category', Countries: 'Count', 'Life expectancy, 1952': 'Quantity', 'Life expectancy, 2007': 'Quantity', 'GDP per capita, 2007': 'Amount' },
    chart_spec: { chartType: 'Table', encodings: {}, title: 'The continents side by side' },
  } as ChartAssemblyInput,
  layout: { span: 2, height: 'compact' },
};

const boardBase = {
  kind: 'board' as const,
  title: 'Health and wealth rose together, 1952–2007',
  subtitle: `${countries} countries on five continents, Gapminder`,
  source: 'Source: Gapminder',
  columns: 2,
  version: 1,
  id: 'gapminder',
};

export const LINK_FIELDS = ['Continent'];

export type BoardSlideKey = 'board' | 'add' | 'theme' | 'table' | 'arrange';

const three = [trend(2), gains, scatter];
const four = [trend(1), gains, scatter, population];
/** The four charts with the years gained shown as its table, beside the continents table. */
const tabled = [trend(1), { ...gains, view: 'table' as const }, scatter, population, table];

/** The boards of the dashboard story, every one linked by continent; `editing` opens the board in layout mode. */
export const BOARD_SLIDES: { key: BoardSlideKey; board: Board; editing?: boolean }[] = [
  { key: 'board', board: { ...boardBase, charts: three } },
  { key: 'add', board: { ...boardBase, charts: four } },
  { key: 'theme', board: { ...boardBase, theme_spec: 'cartoon', charts: four } },
  { key: 'table', board: { ...boardBase, theme_spec: 'cartoon', charts: tabled } },
  { key: 'arrange', board: { ...boardBase, theme_spec: 'cartoon', charts: tabled }, editing: true },
];

/** The MCP page's one board: four linked charts in the Economist theme. */
export const SIMPLE_BOARD: Board = { ...boardBase, theme_spec: 'economist', charts: four };
