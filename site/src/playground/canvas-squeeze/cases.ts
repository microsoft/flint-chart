/**
 * Canvas squeeze: charts set in a small box where the title, legends, labels and footer may take
 * the room the plot needs. Squeezed cases are what
 * the layout gets wrong today; healthy cases are what any fix must leave alone.
 */
import { PREVIEW_CASES } from '../../shared/preview-cases';

export type SqueezeIssue = 'header' | 'legend' | 'labels' | 'facets' | 'footer' | 'tile' | 'control' | 'keysTop' | 'keysBottom' | 'bigTitle' | 'doubleKeys' | 'discreteFew' | 'discreteMany';

export interface SqueezeCase {
  id: string;
  /** What the case is here for: a chart the layout squeezes, or one it must leave as it is. */
  kind: 'squeezed' | 'healthy';
  issue: SqueezeIssue;
  name: string;
  note: string;
  /** A preset house; unset is Flint's own defaults. */
  theme?: string;
  input: { data: { values: Record<string, unknown>[] }; semantic_types: Record<string, string>; chart_spec: Record<string, any> };
  /**
   * Cases written to stress the canvas-fit strategies (`challenge`), or to show how a chart's
   * shape drifts from its base when its size is counted in bands (`discrete`).
   */
  group?: 'challenge' | 'discrete';
  /** What a good layout should do with a challenge case. */
  expect?: string;
}

type Spec = Partial<{ title: string; subtitle: string; source: string; encodings: Record<string, unknown>; chartProperties: Record<string, unknown>; chartType: string }>;

const fromPreview = (id: string, spec: Spec = {}) => {
  const c = PREVIEW_CASES.find((x) => x.id === id);
  if (!c) throw new Error(`no preview case ${id}`);
  const { title = c.title, chartType = c.chartType, encodings = c.encodings, chartProperties = c.chartProperties, ...rest } = spec;
  return {
    data: { values: c.data },
    semantic_types: c.semantic_types,
    chart_spec: { chartType, encodings, title, ...(chartProperties ? { chartProperties } : {}), ...rest },
  };
};

const own = (values: Record<string, unknown>[], semantic_types: Record<string, string>, chart_spec: Record<string, any>) => ({ data: { values }, semantic_types, chart_spec });

// BLS average retail prices, August 2025 (approximate): 12-month change, 20-year growth, monthly volatility.
const CPI: [string, number, number, number][] = [
  ['Bananas, per lb.', 8.8, 37, 1.5],
  ['Bread, white, pan, per lb.', -5.6, 74, 1.7],
  ['Chicken, fresh, whole, per lb.', 4.4, 100, 2.3],
  ['Eggs, grade A, large, per doz.', 11.9, 208, 8.2],
  ['Electricity per KWH', 7.3, 81, 1.8],
  ['Gasoline, unleaded regular, per gallon', -6.4, 31, 6.4],
  ['Ground chuck, 100% beef, per lb.', 17.5, 165, 2.4],
  ['Milk, fresh, whole, fortified, per gal.', 3.1, 33, 1.9],
  ['Oranges, Navel, per lb.', 3.9, 58, 3.4],
  ['Tomatoes, field grown, per lb.', -3.6, 36, 6.9],
  ['Utility (piped) gas per therm', 16.6, 38, 3.1],
];
const cpiChanges = CPI.map(([Item, change]) => ({ Item, 'Annual change (%)': change, Direction: change >= 0 ? 'Increase' : 'Decrease' }));
const cpiGrowth = CPI.map(([Item, , growth, vol]) => ({ Item, 'Twenty-year increase (%)': growth, 'Monthly volatility (%)': vol }));

// Monthly active users by product line: long series names, a key with many entries.
const PRODUCTS = ['Productivity suite (enterprise)', 'Productivity suite (consumer)', 'Cloud storage', 'Video meetings', 'Team chat', 'Developer tools', 'Analytics workspace', 'Security center'];
const productLines = PRODUCTS.flatMap((Product, p) => [2021, 2022, 2023, 2024, 2025].map((Year, i) => ({
  Year, Product, 'Monthly active users (M)': Math.round(40 + p * 18 + i * (6 + p * 2) + ((p * 7 + i * 3) % 9)),
})));

// Survey answers with long axis titles on both axes.
const SLEEP = 'Hours of sleep on a typical weeknight (self-reported)';
const ALERT = 'Afternoon alertness score on the standardized scale (0–100)';
const SURVEY = Array.from({ length: 24 }, (_, i) => ({
  [SLEEP]: Math.round((5 + ((i * 7) % 18) / 6) * 10) / 10,
  [ALERT]: Math.round(42 + ((i * 13) % 40) + (i % 3) * 4),
}));

// Spend against plan by department and quarter: long names down a heatmap.
const DEPARTMENTS = ['Research and development', 'Sales and business development', 'Customer success and support', 'General and administrative', 'Marketing and communications', 'Information technology'];
const budget = DEPARTMENTS.flatMap((Department, d) => ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025'].map((Quarter, q) => ({
  Department, Quarter, 'Spend vs plan (%)': ((d * 11 + q * 7) % 25) - 12,
})));

// Companies by sector: revenue against margin, sized by headcount, coloured by a long sector name.
const SECTORS = ['Information technology', 'Health care and life sciences', 'Financial services', 'Consumer discretionary', 'Industrials and manufacturing', 'Energy and utilities', 'Communication services'];
const companies = Array.from({ length: 28 }, (_, i) => ({
  Company: `Company ${i + 1}`,
  Sector: SECTORS[i % SECTORS.length],
  'Revenue ($bn)': Math.round((8 + ((i * 37) % 180)) * 10) / 10,
  'Operating margin (%)': Math.round(((i * 13) % 32) - 4 + (i % 3)),
  Employees: 2000 + ((i * 7919) % 180000),
}));

// Metro areas: income against growth, sized by population, coloured by world region.
const REGIONS = ['East Asia', 'South Asia', 'Europe', 'North America', 'Latin America', 'Africa'];
const metros = Array.from({ length: 24 }, (_, i) => ({
  Metro: `Metro ${i + 1}`,
  Region: REGIONS[i % REGIONS.length],
  'Income per person ($k)': Math.round(4 + ((i * 29) % 70)),
  'Population growth (%)': Math.round((((i * 17) % 40) / 10 - 0.5) * 10) / 10,
  'Population (M)': Math.round((1.5 + ((i * 53) % 37)) * 10) / 10,
}));

// Ten countries with long names, a share each, for keys that cannot fit across a narrow plot.
const LONG_COUNTRIES = ['Democratic Republic of the Congo', 'Bosnia and Herzegovina', 'Central African Republic', 'Trinidad and Tobago', 'Papua New Guinea', 'Saint Vincent and the Grenadines', 'United Arab Emirates', 'Dominican Republic', 'Equatorial Guinea', 'Sao Tome and Principe'];
const longCountryShares = LONG_COUNTRIES.map((Country, i) => ({ Country, Share: 4 + ((i * 7) % 17) }));
const longCountryPoints = LONG_COUNTRIES.flatMap((Country, i) => [0, 1, 2].map((k) => ({ Country, 'Spending (% of GDP)': 2 + ((i * 3 + k * 5) % 14), 'Growth (%)': ((i * 5 + k * 7) % 11) - 3 })));
// Three regions over twelve months: a line chart whose series the theme names at their ends.
const regionMonths = ['North', 'Central', 'South'].flatMap((Region, r) => Array.from({ length: 12 }, (_, i) => ({ Month: `2024-${String(i + 1).padStart(2, '0')}-01`, Region, 'Orders (k)': 20 + r * 6 + ((i * (r + 2)) % 9) })));

export const CASES: SqueezeCase[] = [
  // ── Squeezed: the header takes the plot ─────────────────────────────────────
  {
    id: 'gapminder-card', kind: 'squeezed', issue: 'header', name: 'Gapminder in a narrow card',
    note: 'A headline that wraps, a deck and a size key above the plot, the colour key beside it: the plot is left a strip.',
    input: fromPreview('gapminder-bubble', { subtitle: 'X: GDP per capita; Y: Life expectancy' }),
  },
  {
    id: 'keeling-long-header', kind: 'squeezed', issue: 'header', name: 'Long headline and deck',
    note: 'A headline that wraps, a two-sentence deck and a source line in a short card.',
    input: fromPreview('keeling', {
      title: 'Atmospheric carbon dioxide at Mauna Loa has risen every year since measurements began in 1958',
      subtitle: 'Monthly mean CO₂ mole fraction, parts per million. The seasonal cycle follows the northern hemisphere’s growing season.',
      source: 'NOAA Global Monitoring Laboratory',
    }),
  },
  {
    id: 'unemployment-strip', kind: 'squeezed', issue: 'header', name: 'Wide, short strip',
    note: 'A slide strip: plenty of width, little height. The header and source take most of the height.',
    theme: 'nyt',
    input: fromPreview('us-unemployment', {
      title: 'Unemployment has returned to its pre-pandemic low',
      subtitle: 'Civilian unemployment rate, annual average, percent',
      source: 'U.S. Bureau of Labor Statistics',
    }),
  },
  {
    id: 'economist-tile', kind: 'squeezed', issue: 'footer', name: 'House chrome in a small tile',
    note: 'The Economist’s red tab and rule above, the source line below, in a dashboard tile.',
    theme: 'economist',
    input: fromPreview('causes-death', { subtitle: 'Deaths, thousands', source: 'CDC WONDER, final 2022 mortality data' }),
  },
  // ── Squeezed: keys ──────────────────────────────────────────────────────────
  {
    id: 'cpi-scatter', kind: 'squeezed', issue: 'legend', name: 'Long names in the side key',
    note: 'Eleven item names in a key at the right take nearly half the width.',
    input: own(cpiGrowth, { Item: 'Category', 'Twenty-year increase (%)': 'Percentage', 'Monthly volatility (%)': 'Percentage' }, {
      chartType: 'Scatter Plot', encodings: { x: 'Monthly volatility (%)', y: 'Twenty-year increase (%)', color: 'Item' },
      title: 'Twenty-year growth versus monthly volatility', subtitle: 'August 2005–August 2025; percentages',
    }),
  },
  {
    id: 'gapminder-two-keys', kind: 'squeezed', issue: 'legend', name: 'Two keys, two edges',
    note: 'The size key goes above the plot and the colour key to its right: the plot pays on both sides.',
    input: fromPreview('gapminder-bubble'),
  },
  {
    id: 'medals-small', kind: 'squeezed', issue: 'legend', name: 'Grouped bars, key and names',
    note: 'Grouped bars in a small card: the key, the country names and the headline.',
    input: fromPreview('medals-grouped'),
  },
  // ── Squeezed: labels and axis titles ────────────────────────────────────────
  {
    id: 'cpi-bars', kind: 'squeezed', issue: 'labels', name: 'Long item names down the side',
    note: 'Item names take a third of the width and the direction key another fifth: the bars get what is left.',
    input: own(cpiChanges, { Item: 'Category', 'Annual change (%)': 'Percentage', Direction: 'Category' }, {
      chartType: 'Bar Chart', encodings: { y: 'Item', x: 'Annual change (%)', color: 'Direction' },
      title: 'Latest annual changes across all items', subtitle: 'August 2025 versus August 2024 (%)',
    }),
  },
  {
    id: 'causes-narrow', kind: 'squeezed', issue: 'labels', name: 'Causes of death, narrow',
    note: 'Long cause names in a narrow card: the label column keeps its px, the bars shrink.',
    input: fromPreview('causes-death'),
  },
  {
    id: 'states-short', kind: 'squeezed', issue: 'labels', name: 'Fifty states in a short card',
    note: 'State names turned upright take the height the bars need.',
    input: fromPreview('state-jobless'),
  },
  {
    id: 'survey-titles', kind: 'squeezed', issue: 'labels', name: 'Long axis titles',
    note: 'Axis titles longer than the plot, in a small card.',
    input: own(SURVEY, { [SLEEP]: 'Quantity', [ALERT]: 'Score' }, {
      chartType: 'Scatter Plot', encodings: { x: SLEEP, y: ALERT }, title: 'Sleep and alertness',
    }),
  },
  {
    id: 'likert-tile', kind: 'squeezed', issue: 'labels', name: 'Likert bars in a tile',
    note: 'Institution names on the left, five answer keys, a headline: little is left for the bars.',
    input: fromPreview('trust-likert'),
  },
  // ── Squeezed: panels ────────────────────────────────────────────────────────
  {
    id: 'oecd-4-card', kind: 'squeezed', issue: 'facets', name: 'Four panels in a card',
    note: 'Four countries side by side in a card: each panel narrows to a sliver.',
    input: fromPreview('oecd-unemployment-facet'),
  },
  {
    id: 'oecd-16-slide', kind: 'squeezed', issue: 'facets', name: 'Sixteen panels on a slide',
    note: 'Sixteen economies in a slide panel with a headline.',
    input: fromPreview('oecd-facet-16'),
  },
  {
    id: 'penguins-panels-key', kind: 'squeezed', issue: 'facets', name: 'Panels with a key and a deck',
    note: 'Three species panels, a colour key at the side, a headline and a deck.',
    input: fromPreview('penguins', {
      encodings: { x: 'Flipper length (mm)', y: 'Body mass (g)', color: 'Species', column: 'Species' },
      subtitle: 'Palmer Station, Antarctica; one dot per bird',
    }),
  },
  {
    id: 'oecd-4-rows', kind: 'squeezed', issue: 'facets', name: 'Stacked rows in a short box',
    note: 'Four countries stacked as rows in a box wider than it is tall.',
    input: fromPreview('oecd-unemployment-facet', { encodings: { x: 'Year', y: 'Unemployment (%)', row: 'Country' } }),
  },
  // ── Squeezed: dashboard tiles ───────────────────────────────────────────────
  {
    id: 'unemployment-tile', kind: 'squeezed', issue: 'tile', name: 'A line in a tiny tile',
    note: 'A KPI-sized tile with a headline, deck and source: the furniture keeps its px, the tile does not have them.',
    input: fromPreview('us-unemployment', { subtitle: 'Annual average, percent', source: 'BLS' }),
  },
  {
    id: 'bump-tile', kind: 'squeezed', issue: 'tile', name: 'Bump chart in a small tile',
    note: 'Country names at the line ends and a headline in a small square.',
    input: fromPreview('olympic-bump'),
  },
  {
    id: 'earnings-tile', kind: 'squeezed', issue: 'tile', name: 'Grouped bars, Swiss house',
    note: 'Education levels down the side, a key, a headline, in a tile.',
    theme: 'swiss',
    input: fromPreview('earnings-education'),
  },
  // ── Healthy: must not change ────────────────────────────────────────────────
  {
    id: 'donut-key', kind: 'healthy', issue: 'control', name: 'Donut with its key',
    note: 'A donut and a three-entry key in a short tile.',
    input: fromPreview('mobile-donut', { subtitle: 'Share of mobile operating systems worldwide' }),
  },
  {
    id: 'electricity-stacked-tile', kind: 'healthy', issue: 'control', name: 'Stacked bars with a source key',
    note: 'Stacked bars and a short source key in a small tile: legible, the key takes its natural width.',
    input: fromPreview('electricity-stacked'),
  },
  {
    id: 'products-lines', kind: 'healthy', issue: 'control', name: 'Eight long series names',
    note: 'Eight long series names in a key beside the lines: the names wrap, the lines keep their room.',
    input: own(productLines, { Year: 'Year', Product: 'Category', 'Monthly active users (M)': 'Quantity' }, {
      chartType: 'Line Chart', encodings: { x: 'Year', y: 'Monthly active users (M)', color: 'Product' },
      title: 'Monthly active users by product line',
    }),
  },
  {
    id: 'budget-heatmap', kind: 'healthy', issue: 'control', name: 'Heatmap with long row names',
    note: 'Department names wrap onto two lines beside a four-column heatmap: long, but natural, and the cells keep their room.',
    input: own(budget, { Department: 'Category', Quarter: 'YearQuarter', 'Spend vs plan (%)': 'Percentage' }, {
      chartType: 'Heatmap', encodings: { x: 'Quarter', y: 'Department', color: 'Spend vs plan (%)' },
      title: 'Spend against plan by department',
    }),
  },
  {
    id: 'population-ok', kind: 'healthy', issue: 'control', name: 'Population bars',
    note: 'Short names, a headline, room to spare.',
    input: fromPreview('population'),
  },
  {
    id: 'keeling-ok', kind: 'healthy', issue: 'control', name: 'Keeling curve',
    note: 'One line, a headline, a wide box.',
    input: fromPreview('keeling'),
  },
  {
    id: 'penguins-ok', kind: 'healthy', issue: 'control', name: 'Penguins scatter',
    note: 'Three species and a short key.',
    input: fromPreview('penguins'),
  },
  {
    id: 'unemployment-economist-ok', kind: 'healthy', issue: 'control', name: 'Economist line',
    note: 'House chrome, headline, deck and source in a box made for them.',
    theme: 'economist',
    input: fromPreview('us-unemployment', {
      title: 'Back to the low', subtitle: 'United States, unemployment rate, %', source: 'Bureau of Labor Statistics',
    }),
  },
  {
    id: 'faithful-ok', kind: 'healthy', issue: 'control', name: 'Old Faithful histogram',
    note: 'No key, a headline.',
    input: fromPreview('faithful-hist'),
  },
  {
    id: 'heatmap-ok', kind: 'healthy', issue: 'control', name: 'Temperature heatmap',
    note: 'Short names on both axes, a ramp key.',
    input: fromPreview('temp-heatmap'),
  },
  {
    id: 'big-mac-ok', kind: 'healthy', issue: 'control', name: 'Big Mac index',
    note: 'Country names down the side, in a tall box.',
    theme: 'datawrapper',
    input: fromPreview('big-mac'),
  },
  {
    id: 'pie-ok', kind: 'healthy', issue: 'control', name: 'Browser pie',
    note: 'A pie and its key.',
    input: fromPreview('browser-pie'),
  },
  // ── Themes: keys set on top, under the title ───────────────────────────────
  {
    id: 'penguins-datawrapper', kind: 'healthy', issue: 'keysTop', name: 'Scatter, key on top',
    note: 'Datawrapper sets the key in a row under the deck: three short names.',
    theme: 'datawrapper',
    input: fromPreview('penguins', { subtitle: 'Palmer Station, Antarctica; one dot per bird' }),
  },
  {
    id: 'gapminder-datawrapper', kind: 'squeezed', issue: 'keysTop', name: 'Two keys on top',
    note: 'Datawrapper stacks the size key and the colour key under the headline and deck.',
    theme: 'datawrapper',
    input: fromPreview('gapminder-bubble', { subtitle: 'Life expectancy at birth against GDP per person; bubbles sized by population' }),
  },
  {
    id: 'products-swiss', kind: 'squeezed', issue: 'keysTop', name: 'Eight long names on top',
    note: 'Swiss sets the key on top: eight long product names wrap onto several rows above the plot.',
    theme: 'swiss',
    input: own(productLines, { Year: 'Year', Product: 'Category', 'Monthly active users (M)': 'Quantity' }, {
      chartType: 'Line Chart', encodings: { x: 'Year', y: 'Monthly active users (M)', color: 'Product' },
      title: 'Monthly active users by product line',
    }),
  },
  {
    id: 'stacked-economist', kind: 'squeezed', issue: 'keysTop', name: 'Stacked bars, Economist key',
    note: 'The Economist’s red tab, headline, deck and a key row, all above the bars.',
    theme: 'economist',
    input: fromPreview('electricity-stacked', { subtitle: 'Share of electricity generation by source, %', source: 'Ember' }),
  },
  {
    id: 'likert-datawrapper', kind: 'squeezed', issue: 'keysTop', name: 'Likert, five keys on top',
    note: 'Five answers in a key row on top, institution names down the side.',
    theme: 'datawrapper',
    input: fromPreview('trust-likert', { subtitle: 'Share of adults, by how much they trust each institution' }),
  },
  {
    id: 'medals-cartoon', kind: 'squeezed', issue: 'keysTop', name: 'Grouped bars, Cartoon',
    note: 'Cartoon’s big headline and a key on top over grouped bars.',
    theme: 'cartoon',
    input: fromPreview('medals-grouped'),
  },
  // ── Themes: keys set below the plot ─────────────────────────────────────────
  {
    id: 'products-apple', kind: 'squeezed', issue: 'keysBottom', name: 'Eight long names below',
    note: 'Apple sets the key under the plot: eight long names in rows below the x axis.',
    theme: 'apple',
    input: own(productLines, { Year: 'Year', Product: 'Category', 'Monthly active users (M)': 'Quantity' }, {
      chartType: 'Line Chart', encodings: { x: 'Year', y: 'Monthly active users (M)', color: 'Product' },
      title: 'Monthly active users by product line',
    }),
  },
  {
    id: 'mix-apple', kind: 'healthy', issue: 'keysBottom', name: 'Stacked area, key below',
    note: 'Apple’s key under a stacked area of energy sources.',
    theme: 'apple',
    input: fromPreview('electricity-mix-area'),
  },
  {
    id: 'ev-powerbi', kind: 'healthy', issue: 'keysBottom', name: 'Lines, Power BI key',
    note: 'Power BI sets the key at the right, falling back to the bottom.',
    theme: 'powerbi',
    input: fromPreview('ev-share', { subtitle: 'Electric cars as a share of new car sales' }),
  },
  // ── Themes: big titles ──────────────────────────────────────────────────────
  {
    id: 'keeling-pop', kind: 'squeezed', issue: 'bigTitle', name: 'Pop’s big headline',
    note: 'Pop sets the headline at its largest size: a long headline wraps onto several big lines.',
    theme: 'pop',
    input: fromPreview('keeling', {
      title: 'Carbon dioxide at Mauna Loa has risen every year since 1958',
      subtitle: 'Monthly mean CO₂, parts per million',
    }),
  },
  {
    id: 'cpi-nyt', kind: 'squeezed', issue: 'bigTitle', name: 'NYT headline and long names',
    note: 'A newsroom headline that states the finding, over bars with long item names.',
    theme: 'nyt',
    input: own(cpiChanges, { Item: 'Category', 'Annual change (%)': 'Percentage', Direction: 'Category' }, {
      chartType: 'Bar Chart', encodings: { y: 'Item', x: 'Annual change (%)', color: 'Direction' },
      title: 'Beef and piped gas led a year of rising grocery and utility prices',
      subtitle: 'Change in average price, August 2025 versus August 2024, %',
    }),
  },
  {
    id: 'oecd-swiss', kind: 'squeezed', issue: 'bigTitle', name: 'Panels under a Swiss headline',
    note: 'Swiss’s bold headline over a rule, above four panels.',
    theme: 'swiss',
    input: fromPreview('oecd-unemployment-facet', { subtitle: 'Harmonised unemployment rate, %' }),
  },
  {
    id: 'donut-pop', kind: 'squeezed', issue: 'bigTitle', name: 'Donut, Pop',
    note: 'Pop’s big headline and bold deck over a donut and its key.',
    theme: 'pop',
    input: fromPreview('mobile-donut', { subtitle: 'Share of mobile operating systems worldwide' }),
  },
  // ── Colour and size keys together, under the title ─────────────────────────
  {
    id: 'gapminder-wall', kind: 'squeezed', issue: 'doubleKeys', name: 'Bubbles on the chart wall',
    note: 'The common case: the house moves the axis titles into the deck and stacks the colour and size keys under it, so a wide plot is squashed under a tall header.',
    theme: 'datawrapper',
    input: fromPreview('gapminder-bubble', { title: 'Wealth against health' }),
  },
  {
    id: 'gapminder-economist', kind: 'squeezed', issue: 'doubleKeys', name: 'Colour and size keys, Economist',
    note: 'The red tab, headline and deck, then a size key and a colour key, all above a bubble chart.',
    theme: 'economist',
    input: fromPreview('gapminder-bubble', { subtitle: 'Life expectancy at birth, years, against GDP per person, $', source: 'Gapminder; World Bank' }),
  },
  {
    id: 'gapminder-nyt', kind: 'squeezed', issue: 'doubleKeys', name: 'Colour and size keys, NYT',
    note: 'A headline that states the finding, then both keys on top: no series ends to name.',
    theme: 'nyt',
    input: fromPreview('gapminder-bubble', { title: 'Richer countries live longer, but the curve flattens', subtitle: 'Life expectancy against income per person, 2018' }),
  },
  {
    id: 'gapminder-cartoon', kind: 'squeezed', issue: 'doubleKeys', name: 'Colour and size keys, Cartoon',
    note: 'Cartoon’s big headline over both keys.',
    theme: 'cartoon',
    input: fromPreview('gapminder-bubble'),
  },
  {
    id: 'gapminder-swiss', kind: 'squeezed', issue: 'doubleKeys', name: 'Colour and size keys, Swiss',
    note: 'Swiss’s bold headline over a rule, then both keys on top.',
    theme: 'swiss',
    input: fromPreview('gapminder-bubble', { subtitle: 'Life expectancy against GDP per person' }),
  },
  {
    id: 'companies-datawrapper', kind: 'squeezed', issue: 'doubleKeys', name: 'Seven sectors and a size key',
    note: 'Seven long sector names and a headcount key in rows under the deck.',
    theme: 'datawrapper',
    input: own(companies, { Company: 'Name', Sector: 'Category', 'Revenue ($bn)': 'Quantity', 'Operating margin (%)': 'Percentage', Employees: 'Count' }, {
      chartType: 'Scatter Plot',
      encodings: { x: 'Revenue ($bn)', y: 'Operating margin (%)', color: 'Sector', size: 'Employees' },
      title: 'Bigger is not more profitable', subtitle: 'Revenue against operating margin, 28 listed companies; bubbles sized by headcount',
    }),
  },
  {
    id: 'companies-mckinsey', kind: 'squeezed', issue: 'doubleKeys', name: 'Sectors and size, McKinsey',
    note: 'A takeaway headline, then both keys on top of the bubbles.',
    theme: 'mckinsey',
    input: own(companies, { Company: 'Name', Sector: 'Category', 'Revenue ($bn)': 'Quantity', 'Operating margin (%)': 'Percentage', Employees: 'Count' }, {
      chartType: 'Scatter Plot',
      encodings: { x: 'Revenue ($bn)', y: 'Operating margin (%)', color: 'Sector', size: 'Employees' },
      title: 'Scale does not buy margin in any sector',
    }),
  },
  {
    id: 'metros-economist', kind: 'squeezed', issue: 'doubleKeys', name: 'Regions and population, Economist',
    note: 'Six regions and a population key on top of a bubble chart, with the house chrome.',
    theme: 'economist',
    input: own(metros, { Metro: 'Name', Region: 'Category', 'Income per person ($k)': 'Quantity', 'Population growth (%)': 'Percentage', 'Population (M)': 'Quantity' }, {
      chartType: 'Scatter Plot',
      encodings: { x: 'Income per person ($k)', y: 'Population growth (%)', color: 'Region', size: 'Population (M)' },
      title: 'Poorer cities grow faster', subtitle: 'Metro areas, annual population growth against income per person', source: 'UN World Urbanization Prospects',
    }),
  },
  {
    id: 'companies-default', kind: 'squeezed', issue: 'doubleKeys', name: 'Sectors and size, default',
    note: 'Flint’s default sets both keys at the right: the contrast to the keys on top.',
    input: own(companies, { Company: 'Name', Sector: 'Category', 'Revenue ($bn)': 'Quantity', 'Operating margin (%)': 'Percentage', Employees: 'Count' }, {
      chartType: 'Scatter Plot',
      encodings: { x: 'Revenue ($bn)', y: 'Operating margin (%)', color: 'Sector', size: 'Employees' },
      title: 'Bigger is not more profitable', subtitle: 'Revenue against operating margin, 28 listed companies',
    }),
  },
  // ── Challenge: written to stress the strategies ─────────────────────────────
  {
    id: 'ch-two-bars-long-title', kind: 'squeezed', issue: 'bigTitle', group: 'challenge', name: 'A long headline over two bars',
    note: 'A three-line headline and a deck over a chart of two bars, in Pop’s big type.',
    expect: 'No layout makes this good: the words outweigh the chart. A smaller title helps a little; nothing should be cut, and the chart should not be distorted trying.',
    theme: 'pop',
    input: own([{ Group: 'Before', 'Score': 41 }, { Group: 'After', 'Score': 67 }], { Group: 'Category', Score: 'Score' }, {
      chartType: 'Bar Chart', encodings: { x: 'Group', y: 'Score' },
      title: 'After the redesign, the share of first-time visitors who completed the sign-up flow rose from forty-one to sixty-seven per cent',
      subtitle: 'Completion rate of the sign-up flow, %, before and after the September redesign',
    }),
  },
  {
    id: 'ch-ten-long-keys-top', kind: 'squeezed', issue: 'keysTop', group: 'challenge', name: 'Ten long names in a top key',
    note: 'Datawrapper keys on top; ten country names that each run 120–220px.',
    expect: 'On top, the key wraps into many rows and takes the height; beside the plot it takes the width. The right answer depends on the box: a tall box keeps it on top, a square one moves it beside with narrower names.',
    theme: 'datawrapper',
    input: own(longCountryPoints, { Country: 'Country', 'Spending (% of GDP)': 'Percentage', 'Growth (%)': 'Percentage' }, {
      chartType: 'Scatter Plot', encodings: { x: 'Spending (% of GDP)', y: 'Growth (%)', color: 'Country' },
      title: 'Spending and growth', subtitle: 'Three years per country',
    }),
  },
  {
    id: 'ch-pie-long-key-economist', kind: 'squeezed', issue: 'keysTop', group: 'challenge', name: 'A pie with a long key, Economist',
    note: 'A square pie under the red tab, a headline and a key of ten long names on top.',
    expect: 'A pie is square, so a top key makes the drawing tall: the key should move beside the pie, with narrower names.',
    theme: 'economist',
    input: own(longCountryShares, { Country: 'Country', Share: 'Percentage' }, {
      chartType: 'Pie Chart', encodings: { color: 'Country', size: 'Share' }, title: 'Shares of the aid budget', subtitle: 'Ten recipients, %',
    }),
  },
  {
    id: 'ch-pie-callouts-economist', kind: 'squeezed', issue: 'keysTop', group: 'challenge', name: 'A pie with outside callouts, Economist',
    note: 'Four slices, two of them thin, under the red tab: the names stay as callouts round the pie and the thin slices\u2019 stand outside it.',
    expect: 'The red tab stays on the canvas\u2019s top edge over the headline, wherever the callouts push the pie\u2019s margins.',
    theme: 'economist',
    input: own([
      { Fuel: 'Natural gas', Share: 58 }, { Fuel: 'Coal', Share: 34 }, { Fuel: 'Nuclear and hydroelectric', Share: 5 }, { Fuel: 'Oil and other liquid fuels', Share: 3 },
    ], { Fuel: 'Category', Share: 'Percentage' }, {
      chartType: 'Pie Chart', encodings: { color: 'Fuel', size: 'Share' }, title: 'Power generation by fuel', subtitle: 'Share of output, %',
    }),
  },
  {
    id: 'ch-series-end', kind: 'healthy', issue: 'control', group: 'challenge', name: 'Lines named at their ends, NYT',
    note: 'Three regions, which NYT names at the ends of their lines instead of in a key.',
    expect: 'Nothing to move: the names sit beside the lines. The layout should leave it as planned.',
    theme: 'nyt',
    input: own(regionMonths, { Month: 'Date', Region: 'Category', 'Orders (k)': 'Quantity' }, {
      chartType: 'Line Chart', encodings: { x: 'Month', y: 'Orders (k)', color: 'Region' }, title: 'Orders held up in every region',
    }),
  },
  {
    id: 'ch-roomy-scatter', kind: 'healthy', issue: 'control', group: 'challenge', name: 'A key with room to spare',
    note: 'Penguins with Datawrapper’s key on top, in a box that holds them.',
    expect: 'Reads well as planned: must not change.',
    theme: 'datawrapper',
    input: fromPreview('penguins'),
  },
  {
    id: 'ch-ramp-key-deck', kind: 'squeezed', issue: 'keysTop', group: 'challenge', name: 'A colour ramp and a long deck',
    note: 'A heatmap whose ramp key Datawrapper sets on top, under a two-line deck.',
    expect: 'A ramp is short on top and long beside: moving it costs height either way; a smaller deck may be the cheaper win.',
    theme: 'datawrapper',
    input: fromPreview('temp-heatmap', { subtitle: 'Monthly mean temperature in eight cities, degrees Celsius, averaged over the thirty years from 1991 to 2020' }),
  },
  {
    id: 'ch-facets-key-top', kind: 'squeezed', issue: 'keysTop', group: 'challenge', name: 'Panels with a key on top',
    note: 'Three species panels with Datawrapper’s key and a deck on top.',
    expect: 'The grid is one chart area: the key should move where the grid has room, the panels should not be judged one by one.',
    theme: 'datawrapper',
    input: fromPreview('penguins', { encodings: { x: 'Flipper length (mm)', y: 'Body mass (g)', color: 'Species', column: 'Species' }, subtitle: 'Palmer Station, Antarctica; one dot per bird' }),
  },
  {
    id: 'ch-grouped-long-groups', kind: 'squeezed', issue: 'keysTop', group: 'challenge', name: 'Grouped bars, long group names, Swiss',
    note: 'Swiss’s bold headline and a key of long group names on top of grouped bars.',
    expect: 'Key beside the bars, names wrapped; the headline can stay full size.',
    theme: 'swiss',
    input: own(['North', 'South', 'East'].flatMap((Region, r) => ['Residential customers on fixed tariffs', 'Small and medium-sized businesses', 'Large industrial and commercial accounts'].map((Segment, k) => ({ Region, Segment, 'Revenue ($m)': 30 + r * 12 + k * 9 }))),
      { Region: 'Category', Segment: 'Category', 'Revenue ($m)': 'Amount' }, {
        chartType: 'Grouped Bar Chart', encodings: { x: 'Region', y: 'Revenue ($m)', group: 'Segment' }, title: 'Revenue by region and segment',
      }),
  },
  {
    id: 'ch-wide-bubbles', kind: 'squeezed', issue: 'doubleKeys', group: 'challenge', name: 'Colour and size keys, NYT, short title',
    note: 'The Gapminder bubbles in NYT with a one-line headline: only the two key rows on top.',
    expect: 'The two keys side by side on one row, or beside the plot — whichever leaves the drawing nearer its box’s shape.',
    theme: 'nyt',
    input: fromPreview('gapminder-bubble', { title: 'Wealth and health' }),
  },
  {
    id: 'ch-value-bars-pop', kind: 'squeezed', issue: 'bigTitle', group: 'challenge', name: 'Value-labelled bars under Pop’s headline',
    note: 'Pop’s largest headline over a bar chart that prints its values.',
    expect: 'The title should come down a size before anything else moves; no key to move.',
    theme: 'pop',
    input: fromPreview('big-mac', { title: 'A burger costs twice as much in Switzerland as in India', subtitle: 'Big Mac price, US dollars' }),
  },
  {
    id: 'ch-long-title-roomy', kind: 'healthy', issue: 'control', group: 'challenge', name: 'A long headline with room to spare',
    note: 'A two-line headline over a line chart whose box holds it: the furniture is large, but nothing is squeezed.',
    expect: 'Must not change at the larger setups: a drawing with room in its box is shown as drawn. In a tight box, a smaller title is fair.',
    theme: 'nyt',
    input: fromPreview('keeling', { title: 'Carbon dioxide at Mauna Loa has risen in every one of the sixty-five years since measurements began' }),
  },
  {
    id: 'ch-short-keys-top', kind: 'healthy', issue: 'control', group: 'challenge', name: 'Short keys on top that fit',
    note: 'Datawrapper’s key on top with three short names, over grouped bars.',
    expect: 'One short row of keys costs little height: the theme’s top key should stay where the box holds it.',
    theme: 'datawrapper',
    input: fromPreview('medals-grouped', { subtitle: 'Medals won at Paris 2024' }),
  },
  {
    id: 'ch-side-key-tile', kind: 'squeezed', issue: 'tile', group: 'challenge', name: 'A side key the box cannot hold',
    note: 'Eight long product names beside a line chart in a box that holds neither them nor the plot at its size.',
    expect: 'Narrower names first; where the drawing would still be shrunk past legibility, a smaller plot that keeps its shape, so the text stays full size.',
    input: own(productLines, { Year: 'Year', Product: 'Category', 'Monthly active users (M)': 'Quantity' }, {
      chartType: 'Line Chart', encodings: { x: 'Year', y: 'Monthly active users (M)', color: 'Product' },
      title: 'Monthly active users by product line', subtitle: 'Millions, annual average',
    }),
  },

  ...discreteCases(),
];

/**
 * A chart sized by bands is as long as its categories make it, not as its base size says: a few
 * leave it short of its base, many stretch it well past. Each pairing of a discrete and a
 * continuous axis, and two discrete axes, in a few categories and in many — with a headline, and
 * a key where the chart has one, so what is set around the chart weighs in too.
 */
function discreteCases(): SqueezeCase[] {
  const wave = (i: number, k = 0) => Math.round(40 + 35 * Math.abs(Math.sin(i * 1.3 + k * 0.7)) + (i * 7 + k * 11) % 23);
  const regions = ['North', 'South', 'East', 'West'];
  const countries = ['Argentina', 'Australia', 'Austria', 'Belgium', 'Brazil', 'Canada', 'Chile', 'China', 'Colombia', 'Denmark',
    'Egypt', 'Finland', 'France', 'Germany', 'Greece', 'India', 'Indonesia', 'Ireland', 'Israel', 'Italy',
    'Japan', 'Kenya', 'Mexico', 'Morocco', 'Netherlands', 'Norway', 'Peru', 'Poland', 'Portugal', 'Spain'];
  const segments = ['Goods', 'Services', 'Energy'];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
  const teams = ['Platform', 'Mobile', 'Web', 'Data', 'Design'];
  const grid = (xs: string[], ys: string[], xName: string, yName: string) =>
    xs.flatMap((x, i) => ys.map((y, k) => ({ [xName]: x, [yName]: y, Load: wave(i, k) })));
  const types = (fields: Record<string, string>) => fields;
  const base = { kind: 'healthy' as const, group: 'discrete' as const };
  return [
    {
      ...base, id: 'dd-bars-few', issue: 'discreteFew', name: 'Few columns',
      note: 'Four regions as vertical bars: the plot is narrower than its base.',
      expect: 'Four bands at a comfortable step leave the plot narrower than its base; within tolerance it keeps its shape.',
      input: own(regions.map((Region, i) => ({ Region, 'Sales ($k)': wave(i) })), types({ Region: 'Category', 'Sales ($k)': 'Amount' }),
        { chartType: 'Bar Chart', encodings: { x: 'Region', y: 'Sales ($k)' }, title: 'Sales by region' }),
    },
    {
      ...base, id: 'dd-bars-many', issue: 'discreteMany', name: 'Many columns',
      note: 'Thirty countries as vertical bars: the bands stretch the plot well past its base width.',
      expect: 'Thirty bands make a wide, flat plot; where it drifts far from the base shape, the layout should lean back toward it.',
      input: own(countries.map((Country, i) => ({ Country, 'Exports ($bn)': wave(i) })), types({ Country: 'Country', 'Exports ($bn)': 'Amount' }),
        { chartType: 'Bar Chart', encodings: { x: 'Country', y: 'Exports ($bn)' }, title: 'Exports by country' }),
    },
    {
      ...base, id: 'dd-stack-many', issue: 'discreteMany', name: 'Many columns and a key',
      note: 'Thirty countries stacked by three segments: the bands stretch the plot, and the key takes its edge too.',
      expect: 'The key adds to the stretch the bands make; the two together decide how far the drawing drifts from its base.',
      input: own(countries.flatMap((Country, i) => segments.map((Segment, k) => ({ Country, Segment, 'Exports ($bn)': Math.round(wave(i, k) / 3) }))),
        types({ Country: 'Country', Segment: 'Category', 'Exports ($bn)': 'Amount' }),
        { chartType: 'Stacked Bar Chart', encodings: { x: 'Country', y: 'Exports ($bn)', color: 'Segment' }, title: 'Exports by country and segment' }),
    },
    {
      ...base, id: 'dd-rows-few', issue: 'discreteFew', name: 'Few rows',
      note: 'Four regions as horizontal bars: the plot is shorter than its base.',
      expect: 'Four rows leave the plot short of its base height; within tolerance it keeps its shape.',
      input: own(regions.map((Region, i) => ({ Region, 'Sales ($k)': wave(i) })), types({ Region: 'Category', 'Sales ($k)': 'Amount' }),
        { chartType: 'Bar Chart', encodings: { x: 'Sales ($k)', y: 'Region' }, title: 'Sales by region' }),
    },
    {
      ...base, id: 'dd-rows-many', issue: 'discreteMany', name: 'Many rows',
      note: 'Thirty countries as horizontal bars: the rows stretch the plot well past its base height.',
      expect: 'Thirty rows make a tall, narrow plot; where it drifts far from the base shape, the layout should lean back toward it.',
      input: own(countries.map((Country, i) => ({ Country, 'Exports ($bn)': wave(i) })), types({ Country: 'Country', 'Exports ($bn)': 'Amount' }),
        { chartType: 'Bar Chart', encodings: { x: 'Exports ($bn)', y: 'Country' }, title: 'Exports by country' }),
    },
    {
      ...base, id: 'dd-rows-many-key', issue: 'discreteMany', name: 'Many rows and a key',
      note: 'Thirty countries stacked by three segments as horizontal bars, with their key.',
      expect: 'The rows make the plot tall; a key above it makes it taller still, a key beside it widens it back toward the base.',
      input: own(countries.flatMap((Country, i) => segments.map((Segment, k) => ({ Country, Segment, 'Exports ($bn)': Math.round(wave(i, k) / 3) }))),
        types({ Country: 'Country', Segment: 'Category', 'Exports ($bn)': 'Amount' }),
        { chartType: 'Stacked Bar Chart', encodings: { x: 'Exports ($bn)', y: 'Country', color: 'Segment' }, title: 'Exports by country and segment' }),
    },
    {
      ...base, id: 'dd-heat-few', issue: 'discreteFew', name: 'A small grid',
      note: 'Four regions by three segments: a small heatmap with its ramp.',
      expect: 'Twelve cells at a comfortable step make a small plot; it keeps its shape and its key.',
      input: own(grid(regions, segments, 'Region', 'Segment'), types({ Region: 'Category', Segment: 'Category', Load: 'Quantity' }),
        { chartType: 'Heatmap', encodings: { x: 'Region', y: 'Segment', color: 'Load' }, title: 'Load by region and segment' }),
    },
    {
      ...base, id: 'dd-heat-wide', issue: 'discreteMany', name: 'A wide grid',
      note: 'Twenty-four hours across by seven days down: four times as wide as tall.',
      expect: 'The columns make the plot wide and flat; a little wider than the base is fine, far wider should lean back toward it.',
      input: own(grid(hours, days, 'Hour', 'Day'), types({ Hour: 'Category', Day: 'Category', Load: 'Quantity' }),
        { chartType: 'Heatmap', encodings: { x: 'Hour', y: 'Day', color: 'Load' }, title: 'Load by hour and day' }),
    },
    {
      ...base, id: 'dd-heat-tall', issue: 'discreteMany', name: 'A tall grid',
      note: 'Five teams across by twenty-four hours down: five times as tall as wide.',
      expect: 'The rows make the plot tall and narrow; the key beside it or below it changes how far the drawing drifts.',
      input: own(grid(teams, hours, 'Team', 'Hour'), types({ Team: 'Category', Hour: 'Category', Load: 'Quantity' }),
        { chartType: 'Heatmap', encodings: { x: 'Team', y: 'Hour', color: 'Load' }, title: 'Load by team and hour' }),
    },
    {
      ...base, id: 'dd-heat-many', issue: 'discreteMany', name: 'A large grid',
      note: 'Thirty countries across by twenty-four hours down: both axes long.',
      expect: 'Both axes grow past the base; the shape stays near square, but the size far exceeds the box.',
      input: own(grid(countries, hours, 'Country', 'Hour'), types({ Country: 'Country', Hour: 'Category', Load: 'Quantity' }),
        { chartType: 'Heatmap', encodings: { x: 'Country', y: 'Hour', color: 'Load' }, title: 'Load by country and hour' }),
    },
  ];
}

