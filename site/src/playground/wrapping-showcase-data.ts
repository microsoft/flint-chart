import type { ChartAssemblyInput } from 'flint-chart';

export interface WrappingExample {
  id: string;
  label: string;
  caption: string;
  source: string;
  sourceUrl: string;
  dataNote: string;
  input: ChartAssemblyInput;
}

const health = [
  ['Unintentional injuries', 64.7, 64.0],
  ['Cerebrovascular diseases', 41.1, 39.5],
  ['Chronic lower respiratory diseases', 34.7, 34.3],
  ['Alzheimer disease', 31.0, 28.9],
  ['Diabetes mellitus', 25.4, 24.1],
  ['Nephritis, nephrotic syndrome and nephrosis', 13.6, 13.8],
  ['Chronic liver disease and cirrhosis', 14.5, 13.8],
] as const;
const healthRows = health.flatMap(([Cause, previous, current]) => [
  { Cause, Year: '2021', Rate: previous }, { Cause, Year: '2022', Rate: current },
]);
const healthSource = {
  source: 'CDC / NCHS, Data Brief 492, Figure 4',
  sourceUrl: 'https://www.cdc.gov/nchs/products/databriefs/db492.htm',
  dataNote: 'Selected US age-adjusted death rates per 100,000.',
};
const medals = [
  ['United States of America', 40, 44, 42],
  ["People's Republic of China", 40, 27, 24],
  ['Islamic Republic of Iran', 3, 6, 3],
  ["Democratic People's Republic of Korea", 0, 2, 4],
  ['Refugee Olympic Team', 0, 0, 1],
] as const;
const medalRows = medals.map(([Team, Gold, Silver, Bronze]) => ({ Team, Gold, Silver, Bronze, Total: Gold + Silver + Bronze }));
const medalSource = {
  source: 'Paris 2024 Olympic medal table',
  sourceUrl: 'https://en.wikipedia.org/wiki/2024_Summer_Olympics_medal_table',
  dataNote: 'Five delegations, with formal country names.',
};

export const WRAPPING_EXAMPLES: WrappingExample[] = [
  {
    id: 'health-axis', label: 'Long category names',
    caption: 'Two-line labels stay centered on their bars.',
    ...healthSource,
    input: {
      data: { values: healthRows.filter(row => row.Year === '2022') },
      semantic_types: { Cause: 'Category', Rate: 'Quantity' },
      field_display_names: { Rate: 'Deaths per 100,000', Cause: 'Cause' },
      chart_spec: {
        chartType: 'Bar Chart', title: 'Selected causes of death', subtitle: 'United States, 2022; age-adjusted rates',
        encodings: { y: 'Cause', x: 'Rate' }, baseSize: { width: 340, height: 280 },
      },
    },
  },
  {
    id: 'education-axis', label: 'Tight columns',
    caption: 'Wrapping keeps category labels horizontal.',
    source: 'US Bureau of Labor Statistics, Education pays, 2023',
    sourceUrl: 'https://www.bls.gov/careeroutlook/2024/data-on-display/education-pays.htm',
    dataNote: 'US median weekly earnings, full-time wage and salary workers age 25+.',
    input: {
      data: { values: [
        { Education: 'High school diploma', Earnings: 899 },
        { Education: "Bachelor's degree", Earnings: 1493 },
        { Education: "Master's degree", Earnings: 1737 },
        { Education: 'Professional degree', Earnings: 2206 },
        { Education: 'Doctoral degree', Earnings: 2109 },
      ] },
      semantic_types: { Education: 'Category', Earnings: 'Quantity' },
      field_display_names: { Earnings: 'Weekly earnings ($)' },
      chart_spec: {
        chartType: 'Bar Chart', title: 'Education and weekly earnings', subtitle: 'United States, 2023; selected education levels',
        encodings: { x: 'Education', y: 'Earnings' }, baseSize: { width: 400, height: 260 },
      },
    },
  },
  {
    id: 'medal-legend', label: 'Country legend',
    caption: 'Legend entries wrap at the same font size, with swatches on the first line.',
    ...medalSource,
    input: {
      data: { values: medalRows },
      semantic_types: { Team: 'Category', Gold: 'Quantity', Silver: 'Quantity' },
      field_display_names: { Gold: 'Gold medals', Silver: 'Silver medals' },
      chart_spec: {
        chartType: 'Scatter Plot', title: 'Paris 2024 medals', subtitle: 'Gold and silver medals; selected delegations',
        encodings: { x: 'Gold', y: 'Silver', color: 'Team' }, baseSize: { width: 320, height: 270 },
      },
    },
  },
  {
    id: 'heritage-table', label: 'Bar table',
    caption: 'Full property names wrap within aligned table rows.',
    source: 'UNESCO World Heritage Centre (properties 1363, 1424, 1613 and 1273)',
    sourceUrl: 'https://whc.unesco.org/en/list/',
    dataNote: 'Four serial properties, counted by component sites.',
    input: {
      data: { values: [
        { Property: 'Prehistoric Pile Dwellings around the Alps', Components: 111, Source: 'https://whc.unesco.org/en/list/1363/' },
        { Property: 'Wooden Tserkvas of the Carpathian Region in Poland and Ukraine', Components: 16, Source: 'https://whc.unesco.org/en/list/1424/' },
        { Property: 'The Great Spa Towns of Europe', Components: 11, Source: 'https://whc.unesco.org/en/list/1613/' },
        { Property: 'Wooden Churches of the Slovak part of the Carpathian Mountain Area', Components: 8, Source: 'https://whc.unesco.org/en/list/1273/' },
      ] },
      semantic_types: { Property: 'Category', Components: 'Quantity' },
      chart_spec: {
        chartType: 'Bar Table', title: 'World Heritage, across multiple sites',
        encodings: { y: 'Property', x: 'Components' }, baseSize: { width: 420, height: 280 },
      },
    },
  },
  {
    id: 'health-facets', label: 'Small multiples',
    caption: 'Wrapped row labels align across panels with a shared scale.',
    ...healthSource,
    input: {
      data: { values: healthRows },
      semantic_types: { Cause: 'Category', Rate: 'Quantity', Year: 'Category' },
      field_display_names: { Rate: 'Deaths per 100,000', Cause: 'Cause' },
      chart_spec: {
        chartType: 'Bar Chart', title: 'Two years of health outcomes', subtitle: 'United States, 2021 and 2022; selected age-adjusted death rates',
        encodings: { y: 'Cause', x: 'Rate', column: 'Year' }, baseSize: { width: 420, height: 280 },
      },
    },
  },
];