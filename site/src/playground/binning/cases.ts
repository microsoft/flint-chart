/**
 * Fields a stepped colour scale is asked to cut, of every shape the rules must hold for: lopsided
 * either way about a pivot, balanced about one, fractional, skewed and one-signed.
 */

type Row = Record<string, string | number>;

export interface BinningCase {
  key: string;
  label: string;
  why: string;
  /** The field's diverging midpoint, where it has one. */
  pivot?: number;
  /** How the pivot sits among the classes, as the semantics decide it. */
  pivotRole?: 'break' | 'neutral';
  values: Row[];
  x: string;
  y: string;
  color: string;
  semantic: Record<string, unknown>;
  title: string;
  subtitle?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const grid = (table: Record<string, number[]>, columns: string[], row: string, column: string, value: string): Row[] =>
  Object.entries(table).flatMap(([name, series]) => series.map((v, i) => ({ [row]: name, [column]: columns[i], [value]: v })));

/** A seeded generator, so every visit draws the same data. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const WARM: Record<string, number[]> = {
  Singapore: [26.5, 27.1, 27.6, 28, 28.3, 28.3, 27.9, 27.9, 27.6, 27.6, 27, 26.4],
  Delhi: [14.2, 17.4, 22.9, 29, 32.8, 33.5, 31.1, 30, 29.5, 26.3, 20.7, 15.9],
  Cairo: [14, 15.1, 17.6, 21.3, 24.8, 27.2, 27.7, 27.7, 26, 23.4, 19.3, 15.6],
  Sydney: [23.5, 23.4, 22.1, 19.5, 16.6, 14.2, 13.4, 14.5, 17.2, 19.2, 20.8, 22.4],
  Seattle: [5.3, 6.2, 7.9, 10.2, 13.5, 16.2, 19.2, 19.4, 16.6, 11.7, 7.7, 5.1],
  Moscow: [-6.5, -6.7, -1, 6.7, 13.2, 17, 19.2, 17, 11.3, 5.6, -1.2, -5.2],
};

const COLD: Record<string, number[]> = {
  Yakutsk: [-38.6, -33.8, -20.1, -4.8, 7.5, 16.4, 19.5, 15.2, 6.1, -7.8, -27, -37.6],
  Ulaanbaatar: [-21.6, -16.6, -7.4, 1.3, 8.7, 14.6, 16.9, 15.1, 8.2, -0.4, -11.2, -19.6],
  Montreal: [-9.7, -7.7, -2, 6.4, 13.4, 18.6, 21.2, 20.1, 15.5, 8.5, 2.1, -5.4],
  Anchorage: [-8.3, -6.5, -3.6, 2.6, 8.5, 12.7, 14.9, 14.1, 9.6, 1.8, -5.1, -7.6],
  Oslo: [-4.3, -4, -0.2, 4.5, 10.8, 15.2, 16.4, 15.2, 10.8, 6.3, 0.7, -3.1],
  Reykjavik: [-0.5, 0.4, 0.5, 2.9, 6.3, 9, 10.6, 10.3, 7.4, 4.4, 1.1, -0.2],
};

const QUARTERS = ['Q1 23', 'Q2 23', 'Q3 23', 'Q4 23', 'Q1 24', 'Q2 24', 'Q3 24', 'Q4 24'];
const REGIONS = ['North', 'South', 'East', 'West', 'Central', 'Online'];
const growth = (() => {
  const r = seeded(11);
  return Object.fromEntries(REGIONS.map((region, j) => [region, QUARTERS.map((_, i) => Number((-0.12 + 0.43 * r() ** 1.4 + (j === 5 ? 0.08 : 0) - (i < 2 ? 0.04 : 0)).toFixed(3)))]));
})();

const VARIABLES = ['Income', 'Education', 'Age', 'Commute', 'Rent', 'Savings', 'Debt', 'Hours'];
const correlations = (() => {
  const r = seeded(5);
  const m = VARIABLES.map(() => VARIABLES.map(() => 0));
  for (let i = 0; i < VARIABLES.length; i++) {
    m[i][i] = 1;
    for (let j = 0; j < i; j++) m[i][j] = m[j][i] = Number((-0.85 + 1.75 * r()).toFixed(2));
  }
  return Object.fromEntries(VARIABLES.map((name, i) => [name, m[i]]));
})();

const STATES = ['California', 'Texas', 'Florida', 'New York', 'Ohio', 'Oregon'];
const sales = (() => {
  const r = seeded(23);
  return Object.fromEntries(STATES.map((state, j) => [state, MONTHS.map(() => Math.round(40 + (1310 - j * 150) * r() ** 2.2))]));
})();

const COUNTRIES = ['Spain', 'Greece', 'Italy', 'France', 'Germany', 'Poland', 'Czechia'];
const YEARS = ['2017', '2018', '2019', '2020', '2021', '2022', '2023'];
const unemployment = (() => {
  const r = seeded(3);
  const base = [9.2, 8.9, 7.1, 6.8, 3.4, 3.1, 2.4];
  return Object.fromEntries(COUNTRIES.map((country, j) => [country, YEARS.map((_, i) => Number((base[j] + (i === 3 ? 0.6 : 0) + (r() - 0.5) * 0.9 - i * 0.05).toFixed(1)))]));
})();

export const CASES: BinningCase[] = [
  {
    key: 'warm', label: 'Warm cities', pivot: 0, pivotRole: 'break',
    why: 'Lopsided about 0 °C (−6.7 … 33.5): one pale cold class, four warm. The chart that prompted this work, which read "−20, −7, 7, 20" with two cold classes empty.',
    values: grid(WARM, MONTHS, 'City', 'Month', 'Temp (°C)'), x: 'Month', y: 'City', color: 'Temp (°C)',
    semantic: { City: 'Category', Month: 'Month', 'Temp (°C)': { semanticType: 'Temperature', unit: '°C' } },
    title: 'Average monthly temperature', subtitle: '°C, climate normals, four cities',
  },
  {
    key: 'cold', label: 'Cold cities', pivot: 0, pivotRole: 'break',
    why: 'Lopsided the other way (−38.6 … 21.2): the cold side takes more classes, the warm side its pale end.',
    values: grid(COLD, MONTHS, 'City', 'Month', 'Temp (°C)'), x: 'Month', y: 'City', color: 'Temp (°C)',
    semantic: { City: 'Category', Month: 'Month', 'Temp (°C)': { semanticType: 'Temperature', unit: '°C' } },
    title: 'Average monthly temperature', subtitle: '°C, climate normals, cold cities',
  },
  {
    key: 'growth', label: 'Growth, fractions', pivot: 0, pivotRole: 'break',
    why: 'A percentage change stored as fractions: a round step in percent, a break at 0 so a small gain never reads as a small loss.',
    values: grid(growth, QUARTERS, 'Region', 'Quarter', 'Growth'), x: 'Quarter', y: 'Region', color: 'Growth',
    semantic: { Region: 'Category', Quarter: 'Category', Growth: { semanticType: 'PercentageChange', percentScale: 'fraction' } },
    title: 'Sales growth by region', subtitle: 'Year over year',
  },
  {
    key: 'correlation', label: 'Correlation matrix', pivot: 0, pivotRole: 'neutral',
    why: 'Balanced about 0, a pivot the type always has: a neutral class centred on 0 reads "no relationship".',
    values: grid(correlations, VARIABLES, 'Variable', 'With', 'r'), x: 'With', y: 'Variable', color: 'r',
    semantic: { Variable: 'Category', With: 'Category', r: 'Correlation' },
    title: 'Correlation between household measures',
  },
  {
    key: 'sales', label: 'Sales, skewed', why: 'One-signed and skewed (40 … ~1,200): no pivot, steps counted from zero.',
    values: grid(sales, MONTHS, 'State', 'Month', 'Sales ($K)'), x: 'Month', y: 'State', color: 'Sales ($K)',
    semantic: { State: 'Category', Month: 'Month', 'Sales ($K)': 'Amount' },
    title: 'Monthly sales by state',
  },
  {
    key: 'unemployment', label: 'Unemployment, narrow', why: 'One-signed and narrow (~2 … 10 points): a step of 2.',
    values: grid(unemployment, YEARS, 'Country', 'Year', 'Unemployment (%)'), x: 'Year', y: 'Country', color: 'Unemployment (%)',
    semantic: { Country: 'Country', Year: 'Category', 'Unemployment (%)': { semanticType: 'Percentage', percentScale: 'percent' } },
    title: 'Unemployment rate',
  },
];
