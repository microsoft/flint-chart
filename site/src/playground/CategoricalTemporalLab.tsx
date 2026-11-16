import type { ChartAssemblyInput } from 'flint-chart';
import { FlintView } from '../components/FlintView';
import './categorical-temporal-lab.css';

type Row = Record<string, string | number>;

export interface TemporalCase {
  id: string;
  group: string;
  note: string;
  theme?: string;
  input: ChartAssemblyInput;
}

const SIZE = { baseSize: { width: 360, height: 220 }, canvasSize: { width: 440, height: 320 } };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

const CONTINENTS = ['Asia', 'North America', 'Africa', 'Europe', 'South America', 'Oceania'];
const CONTINENT_BASE: Record<string, number> = {
  Asia: 5.2, 'North America': 6.4, Africa: 4.3, Europe: 6.2, 'South America': 6.0, Oceania: 7.2,
};
const CONTINENT_COUNTRIES: Record<string, number> = {
  Asia: 30, 'North America': 8, Africa: 34, Europe: 36, 'South America': 10, Oceania: 2,
};

function happinessRows(): Row[] {
  const random = rng(7);
  const rows: Row[] = [];
  for (const continent of CONTINENTS) {
    for (let i = 0; i < CONTINENT_COUNTRIES[continent]; i++) {
      const base = CONTINENT_BASE[continent] + (random() - 0.5) * 1.8;
      rows.push({ continent, year: 2011, score: round(base, 2) });
      rows.push({ continent, year: 2025, score: round(base + 0.15 + (random() - 0.45) * 0.8, 2) });
    }
  }
  return rows;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthlySeries(start: string, count: number, seed: number) {
  const random = rng(seed);
  const [y, m] = start.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const total = (m - 1) + i;
    const month = `${y + Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
    return { month, revenue: round(120 + 30 * Math.sin(i / 2) + random() * 25, 0) };
  });
}

const QUARTER_ENDS = ['2023-03-31', '2023-06-30', '2023-09-30', '2023-12-31', '2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31'];

const twoMonths = (): ChartAssemblyInput => ({
  data: { values: [{ month: '2025-07', revenue: 184 }, { month: '2025-12', revenue: 231 }] },
  semantic_types: { month: 'YearMonth', revenue: 'Amount' },
  field_display_names: { month: 'Month', revenue: 'Revenue' },
  chart_spec: { chartType: 'Bar Chart', title: 'Revenue, Jul vs Dec 2025', encodings: { x: 'month', y: 'revenue' }, ...SIZE },
});

const quarterEnds = (): ChartAssemblyInput => ({
  data: { values: QUARTER_ENDS.map((date, i) => ({ date, margin: round(12 + 3 * Math.sin(i), 1) })) },
  semantic_types: { date: 'Date', margin: 'Percentage' },
  field_display_names: { date: 'Quarter end', margin: 'Margin (%)' },
  chart_spec: { chartType: 'Bar Chart', title: 'Operating margin', encodings: { x: 'date', y: 'margin' }, ...SIZE },
});

const boxplot = (rows: Row[]): ChartAssemblyInput => ({
  data: { values: rows },
  semantic_types: { continent: 'Category', year: 'Year', score: 'Score' },
  field_display_names: { continent: 'Continent', year: 'Year', score: 'Happiness' },
  chart_spec: { chartType: 'Boxplot', title: 'Happiness by continent, 2011 vs 2025', encodings: { x: 'continent', y: 'score', color: 'year' }, ...SIZE },
});

const yoyLines = (): ChartAssemblyInput => ({
  data: { values: [2023, 2024, 2025].flatMap((year, y) => MONTHS.map((month, m) => ({
    month, year, visitors: round(40 + 25 * Math.sin((m - 3) / 12 * 2 * Math.PI) + y * 6, 0),
  }))) },
  semantic_types: { month: 'Month', year: 'Year', visitors: 'Count' },
  field_display_names: { month: 'Month', year: 'Year', visitors: 'Visitors (k)' },
  chart_spec: { chartType: 'Line Chart', title: 'Monthly visitors by year', encodings: { x: 'month', y: 'visitors', color: 'year' }, ...SIZE },
});

const monthlyBars = (): ChartAssemblyInput => ({
  data: { values: monthlySeries('2024-01', 24, 3) },
  semantic_types: { month: 'YearMonth', revenue: 'Amount' },
  field_display_names: { month: 'Month', revenue: 'Revenue' },
  chart_spec: { chartType: 'Bar Chart', title: 'Monthly revenue', encodings: { x: 'month', y: 'revenue' }, ...SIZE },
});

export const CASES: TemporalCase[] = [
  // ── Few dates on a banded axis ────────────────────────────────────────
  { id: 'ym-two', group: 'Few dates on a banded axis', note: 'YearMonth, 2 values (Jul vs Dec 2025)', input: twoMonths() },
  { id: 'ym-two-economist', group: 'Few dates on a banded axis', theme: 'economist', note: 'Same, Economist', input: twoMonths() },
  {
    id: 'raw-month-strings', group: 'Few dates on a banded axis',
    note: 'Untyped "2025-July" strings: categories, in the order given',
    input: {
      data: { values: [{ period: '2025-July', revenue: 184 }, { period: '2025-Dec', revenue: 231 }] },
      field_display_names: { period: 'Period', revenue: 'Revenue' },
      chart_spec: { chartType: 'Bar Chart', title: 'Revenue by period', encodings: { x: 'period', y: 'revenue' }, ...SIZE },
    },
  },
  {
    id: 'year-three', group: 'Few dates on a banded axis', theme: 'datawrapper',
    note: 'Year, 3 values, rows out of order (Datawrapper)',
    input: {
      data: { values: [{ year: 2024, sales: 503 }, { year: 2022, sales: 412 }, { year: 2023, sales: 468 }] },
      semantic_types: { year: 'Year', sales: 'Amount' },
      field_display_names: { year: 'Year', sales: 'Sales' },
      chart_spec: { chartType: 'Bar Chart', title: 'Annual sales', encodings: { x: 'year', y: 'sales' }, ...SIZE },
    },
  },
  {
    id: 'survey-waves', group: 'Few dates on a banded axis',
    note: 'YearMonth, 4 irregular survey waves',
    input: {
      data: { values: [
        { wave: '2019-03', trust: 41 }, { wave: '2020-03', trust: 47 },
        { wave: '2023-09', trust: 38 }, { wave: '2025-01', trust: 44 },
      ] },
      semantic_types: { wave: 'YearMonth', trust: 'Percentage' },
      field_display_names: { wave: 'Survey wave', trust: 'Trust (%)' },
      chart_spec: { chartType: 'Bar Chart', title: 'Trust by survey wave', encodings: { x: 'wave', y: 'trust' }, ...SIZE },
    },
  },
  {
    id: 'two-report-dates', group: 'Few dates on a banded axis', theme: 'nyt',
    note: 'Date, 2 period ends (NYT)',
    input: {
      data: { values: [{ date: '2024-12-31', cash: 82 }, { date: '2025-06-30', cash: 67 }] },
      semantic_types: { date: 'Date', cash: 'Amount' },
      field_display_names: { date: 'Reporting date', cash: 'Cash ($M)' },
      chart_spec: { chartType: 'Bar Chart', title: 'Cash at period end', encodings: { x: 'date', y: 'cash' }, ...SIZE },
    },
  },
  { id: 'quarter-ends', group: 'Few dates on a banded axis', note: 'Date, 8 quarter ends: calendar names where crowded', input: quarterEnds() },
  { id: 'quarter-ends-powerbi', group: 'Few dates on a banded axis', theme: 'powerbi', note: 'Same, Power BI', input: quarterEnds() },
  {
    id: 'heatmap-six-months', group: 'Few dates on a banded axis',
    note: 'Heatmap, YearMonth with 6 values',
    input: {
      data: { values: ['Alpha', 'Beta', 'Gamma'].flatMap((product, p) =>
        monthlySeries('2025-01', 6, 11 + p).map(r => ({ month: r.month, product, units: r.revenue }))) },
      semantic_types: { month: 'YearMonth', product: 'Category', units: 'Quantity' },
      field_display_names: { month: 'Month', product: 'Product', units: 'Units' },
      chart_spec: { chartType: 'Heatmap', title: 'Units by product and month', encodings: { x: 'month', y: 'product', color: 'units' }, ...SIZE },
    },
  },

  // ── Years compared ────────────────────────────────────────────────────
  { id: 'boxplot-year', group: 'Years compared', note: 'Boxplot, color = Year (2011 vs 2025)', input: boxplot(happinessRows()) },
  {
    id: 'boxplot-year-economist', group: 'Years compared', theme: 'economist',
    note: 'Same, Economist, rows newest year first',
    input: boxplot([...happinessRows()].sort((a, b) => Number(b.year) - Number(a.year))),
  },
  {
    id: 'grouped-year-color', group: 'Years compared', theme: 'mckinsey',
    note: 'Grouped bar, color = Year (McKinsey)',
    input: {
      data: { values: CONTINENTS.flatMap(continent => [
        { continent, year: 2025, score: round(CONTINENT_BASE[continent] + 0.1, 2) },
        { continent, year: 2011, score: round(CONTINENT_BASE[continent] - 0.2, 2) },
      ]) },
      semantic_types: { continent: 'Category', year: 'Year', score: 'Score' },
      field_display_names: { continent: 'Continent', year: 'Year', score: 'Happiness (mean)' },
      chart_spec: { chartType: 'Grouped Bar Chart', title: 'Mean happiness, 2011 vs 2025', encodings: { x: 'continent', y: 'score', color: 'year' }, ...SIZE },
    },
  },
  {
    id: 'grouped-year-x', group: 'Years compared',
    note: 'Grouped bar, x = Year (2 values)',
    input: {
      data: { values: ['North', 'South', 'East'].flatMap((region, r) => [
        { year: 2025, region, share: 26 + r * 4 }, { year: 2011, region, share: 20 + r * 6 },
      ]) },
      semantic_types: { year: 'Year', region: 'Category', share: 'Percentage' },
      field_display_names: { year: 'Year', region: 'Region', share: 'Share (%)' },
      chart_spec: { chartType: 'Grouped Bar Chart', title: 'Share by region', encodings: { x: 'year', y: 'share', color: 'region' }, ...SIZE },
    },
  },
  {
    id: 'stacked-year-x', group: 'Years compared', theme: 'swiss',
    note: 'Stacked bar, x = Year (4 values, Swiss)',
    input: {
      data: { values: [2010, 2015, 2020, 2025].flatMap((year, i) => [
        { year, source: 'Coal', twh: 60 - i * 12 }, { year, source: 'Gas', twh: 30 + i * 3 }, { year, source: 'Renewables', twh: 10 + i * 14 },
      ]) },
      semantic_types: { year: 'Year', source: 'Category', twh: 'Quantity' },
      field_display_names: { year: 'Year', source: 'Source', twh: 'Generation (TWh)' },
      chart_spec: { chartType: 'Stacked Bar Chart', title: 'Generation mix', encodings: { x: 'year', y: 'twh', color: 'source' }, ...SIZE },
    },
  },
  { id: 'yoy-lines', group: 'Years compared', note: 'Line, x = Month, color = Year', input: yoyLines() },
  { id: 'yoy-lines-nature', group: 'Years compared', theme: 'nature', note: 'Same, Nature', input: yoyLines() },
  {
    id: 'facet-year', group: 'Years compared',
    note: 'Bar, facet column = Year',
    input: {
      data: { values: [2025, 2020].flatMap(year => ['A', 'B', 'C'].map((cat, c) => ({ year, cat, v: 10 + c * 5 + (year - 2020) }))) },
      semantic_types: { year: 'Year', cat: 'Category', v: 'Quantity' },
      field_display_names: { year: 'Year', cat: 'Category', v: 'Value' },
      chart_spec: { chartType: 'Bar Chart', title: 'Value by category and year', encodings: { x: 'cat', y: 'v', column: 'year' }, ...SIZE },
    },
  },

  // ── Runs of time (stay continuous) ────────────────────────────────────
  {
    id: 'line-five-years', group: 'Runs of time (stay continuous)',
    note: 'Line over 5 years',
    input: {
      data: { values: [2019, 2020, 2021, 2022, 2023].map((year, i) => ({ year, gdp: [2.3, -3.4, 5.9, 2.1, 2.5][i] })) },
      semantic_types: { year: 'Year', gdp: 'Percentage' },
      field_display_names: { year: 'Year', gdp: 'GDP growth (%)' },
      chart_spec: { chartType: 'Line Chart', title: 'GDP growth', encodings: { x: 'year', y: 'gdp' }, ...SIZE },
    },
  },
  {
    id: 'line-irregular-dates', group: 'Runs of time (stay continuous)', theme: 'economist',
    note: 'Line over irregular dates (Economist)',
    input: {
      data: { values: ['2024-01-03', '2024-01-10', '2024-02-21', '2024-05-02', '2024-05-09', '2024-11-30'].map((date, i) => ({ date, level: [3.1, 3.4, 4.0, 5.2, 5.0, 6.8][i] })) },
      semantic_types: { date: 'Date', level: 'Quantity' },
      field_display_names: { date: 'Date', level: 'Level' },
      chart_spec: { chartType: 'Line Chart', title: 'Reservoir level', encodings: { x: 'date', y: 'level' }, ...SIZE },
    },
  },
  { id: 'bar-24-months', group: 'Runs of time (stay continuous)', note: 'Bars over 24 regular months', input: monthlyBars() },
  { id: 'bar-24-months-datawrapper', group: 'Runs of time (stay continuous)', theme: 'datawrapper', note: 'Same, Datawrapper', input: monthlyBars() },
];

const GROUPS = [...new Set(CASES.map(c => c.group))];

export function CategoricalTemporalLab() {
  return (
    <section className="ct-lab">
      <header className="ct-heading">
        <h1>Categorical temporal fields</h1>
        <p>Dates that read as a few snapshots, and years compared side by side, as Flint draws them by default.</p>
      </header>
      {GROUPS.map(group => (
        <section key={group} className="ct-group">
          <h2>{group}</h2>
          <div className="ct-grid">
            {CASES.filter(c => c.group === group).map(c => (
              <figure key={c.id} data-case={c.id}>
                <FlintView spec={c.theme ? { ...c.input, theme_spec: c.theme } : c.input} renderer="svg" chartId={c.id} />
                <figcaption>{c.note}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
