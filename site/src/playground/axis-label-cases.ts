import type { ChartAssemblyInput } from 'flint-chart';
import { TEST_GENERATORS } from 'flint-chart/test-data';
import { testCaseToAssemblyInput } from '../shared/test-case-utils';

export type LabelSurface = 'x' | 'y' | 'color' | 'dual';
type MedalRow = { Team: string; Gold: number; Silver: number; Bronze: number; Total: number };
export interface LabelCase {
  id: string;
  title: string;
  labels: 'Real team names' | 'Generated display labels; real counts';
  rows: MedalRow[];
  longSizeTitle?: boolean;
}

export const MEDAL_SOURCE = 'https://en.wikipedia.org/wiki/2024_Summer_Olympics_medal_table';

const MEDALS: Array<[string, number, number, number]> = [
  ['United States', 40, 44, 42], ['China', 40, 27, 24],
  ['Japan', 20, 12, 13], ['Australia', 18, 19, 16],
  ['France', 16, 26, 22], ['Netherlands', 15, 7, 12],
  ['Great Britain', 14, 22, 29], ['South Korea', 13, 9, 10],
  ['Italy', 12, 13, 15], ['Germany', 12, 13, 8],
  ['New Zealand', 10, 7, 3], ['Canada', 9, 7, 11],
  ['Uzbekistan', 8, 2, 3], ['Hungary', 6, 7, 6],
  ['Spain', 5, 4, 9], ['Sweden', 4, 4, 3],
  ['Kenya', 4, 2, 5], ['Norway', 4, 1, 3],
  ['Ireland', 4, 0, 3], ['Brazil', 3, 7, 10],
  ['Iran', 3, 6, 3], ['Ukraine', 3, 5, 4],
  ['Romania', 3, 4, 2], ['Georgia', 3, 3, 1],
  ['Belgium', 3, 1, 6], ['Bulgaria', 3, 1, 3],
  ['Serbia', 3, 1, 1], ['Czech Republic', 3, 0, 2],
  ['Denmark', 2, 2, 5], ['Azerbaijan', 2, 2, 3],
  ['Croatia', 2, 2, 3], ['Cuba', 2, 1, 6],
  ['North Korea', 0, 2, 4], ['Refugee Olympic Team', 0, 0, 1],
];

function medalRow(team: string, label = team): MedalRow {
  const entry = MEDALS.find(([name]) => name === team);
  if (!entry) throw new Error(`Unknown medal team: ${team}`);
  const [, Gold, Silver, Bronze] = entry;
  return { Team: label, Gold, Silver, Bronze, Total: Gold + Silver + Bronze };
}

function densityCase(count: number, longCount: number): LabelCase {
  const longIndices = new Set(Array.from({ length: longCount }, (_, index) => Math.floor(index * count / longCount)));
  return {
    id: `density-${count}-${longCount}`,
    title: `${count} teams / ${longCount} long labels`,
    labels: 'Generated display labels; real counts',
    rows: MEDALS.slice(0, count).map(([team], index) => medalRow(team,
      longIndices.has(index) ? `${team} Olympic delegation at Paris 2024` : team)),
  };
}

export const LABEL_CASES: LabelCase[] = [
  {
    id: 'short-control', title: '4 teams / short labels', labels: 'Real team names',
    rows: ['China', 'Japan', 'France', 'Italy'].map((team) => medalRow(team)),
  },
  {
    id: 'one-long', title: '4 teams / 1 long name', labels: 'Real team names',
    rows: [medalRow('United States', 'United States of America'), ...['China', 'Japan', 'France'].map((team) => medalRow(team))],
  },
  {
    id: 'two-long', title: '4 teams / 2 long names', labels: 'Real team names',
    rows: [medalRow('United States', 'United States of America'), medalRow('Japan'), medalRow('China', "People's Republic of China"), medalRow('France')],
  },
  {
    id: 'five-long', title: '5 teams / all long names', labels: 'Real team names',
    rows: [
      medalRow('United States', 'United States of America'),
      medalRow('China', "People's Republic of China"),
      medalRow('Iran', 'Islamic Republic of Iran'),
      medalRow('North Korea', "Democratic People's Republic of Korea"),
      medalRow('Refugee Olympic Team'),
    ],
  },
  densityCase(8, 1), densityCase(8, 4), densityCase(8, 8),
  densityCase(16, 2), densityCase(16, 8),
  densityCase(32, 2), densityCase(32, 16),
  {
    id: 'one-extreme', title: '4 teams / 1 very long label', labels: 'Generated display labels; real counts',
    rows: [medalRow('United States', 'United States of America Olympic delegation at the Paris 2024 Summer Games'), ...['China', 'Japan', 'France'].map((team) => medalRow(team))],
  },
  {
    id: 'unbroken', title: '4 teams / 1 unbroken identifier', labels: 'Generated display labels; real counts',
    rows: [medalRow('United States', 'UnitedStatesOlympicDelegationParis2024'), ...['China', 'Japan', 'France'].map((team) => medalRow(team))],
  },
];

export const DUAL_LEGEND_CASES: LabelCase[] = [
  LABEL_CASES[2],
  { ...densityCase(8, 2), id: 'dual-long-title', longSizeTitle: true },
  densityCase(16, 8),
];

export const HORIZONTAL_LEGEND_CASES: Array<{ id: string; title: string; input: ChartAssemblyInput }> = [
  { id: 'horizontal-control', title: '4 teams / short names / 480 px', testCase: LABEL_CASES[0], width: 480, dual: false },
  { id: 'horizontal-short', title: '16 teams / short names / 480 px', testCase: densityCase(16, 0), width: 480, dual: false },
  { id: 'horizontal-mixed', title: '16 teams / 8 long labels / 480 px', testCase: densityCase(16, 8), width: 480, dual: false },
  { id: 'horizontal-narrow', title: '16 teams / 8 long labels / 280 px', testCase: densityCase(16, 8), width: 280, dual: false },
  { id: 'horizontal-dual', title: '8 teams / color + size / long heading / 480 px', testCase: DUAL_LEGEND_CASES[1], width: 480, dual: true },
].map(({ id, title, testCase, width, dual }) => {
  const input = labelCaseInput(testCase, dual ? 'dual' : 'color', width, 320);
  return {
    id, title,
    input: {
      ...input,
      chart_spec: {
        ...input.chart_spec,
        title: 'Paris 2024 medals',
        subtitle: `${testCase.rows.length} teams; gold (x), silver (y)${dual ? '; size: total medals' : ''}`,
      },
    },
  };
});

const marketInput: ChartAssemblyInput = testCaseToAssemblyInput(TEST_GENERATORS['Lollipop Chart']()[3]);
const longMarketRows = marketInput.data.values!.map(row => ({ ...row, Item: `${row.Item} retail department` }));

export const FACET_LABEL_CASES: Array<{ id: string; title: string; input: ChartAssemblyInput }> = [
  {
    id: 'facet-market', title: '2 markets / original labels',
    input: { ...marketInput, chart_spec: { ...marketInput.chart_spec, title: 'Adoption by market and tier' } },
  },
  {
    id: 'facet-long', title: '2 markets / long labels',
    input: { ...marketInput, data: { values: longMarketRows },
      chart_spec: { ...marketInput.chart_spec, title: 'Adoption by market and tier' } },
  },
  {
    id: 'facet-wide', title: '2 markets / long labels / wider canvas',
    input: { ...marketInput, data: { values: longMarketRows },
      chart_spec: { ...marketInput.chart_spec, title: 'Adoption by market and tier',
        baseSize: { width: 960, height: 320 } } },
  },
  {
    id: 'facet-wrapped', title: '4 markets / 2-column grid / long labels',
    input: { ...marketInput,
      data: { values: ['Urban', 'Suburban'].flatMap(area => longMarketRows.map(row => ({
        ...row, Region: `${row.Region} / ${area}`,
      }))) },
      chart_spec: { ...marketInput.chart_spec, title: 'Adoption by market and tier',
        chartProperties: { ...marketInput.chart_spec.chartProperties, facetColumns: 2 } },
    },
  },
];

export function labelCaseInput(testCase: LabelCase, surface: LabelSurface, width: number, height: number): ChartAssemblyInput {
  const legend = surface === 'color' || surface === 'dual';
  return {
    data: { values: testCase.rows },
    semantic_types: { Team: 'Category', Gold: 'Quantity', Silver: 'Quantity', Bronze: 'Quantity', Total: 'Quantity' },
    field_display_names: {
      Team: 'Team', Gold: 'Gold medals', Silver: 'Silver medals',
      Total: testCase.longSizeTitle ? 'Total gold, silver and bronze medals won at the Paris 2024 Summer Olympics' : 'Total medals',
    },
    chart_spec: {
      chartType: legend ? 'Scatter Plot' : 'Bar Chart',
      encodings: legend
        ? { x: 'Gold', y: 'Silver', color: 'Team', ...(surface === 'dual' ? { size: 'Total' } : {}) }
        : surface === 'x' ? { x: 'Team', y: 'Total' } : { x: 'Total', y: 'Team' },
      baseSize: { width, height },
    },
  };
}