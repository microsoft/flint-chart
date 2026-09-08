import type { ChartAssemblyInput } from 'flint-chart';
import { genChoroplethTests, genMapTests } from 'flint-chart/test-data';
import { testCaseToAssemblyInput } from '../shared/test-case-utils';
import { gapminderRows } from './gapminder-dashboard-data';

export interface NavigationDemoCase {
  id: string;
  input: ChartAssemblyInput;
  /** Omit to let the compiled spec decide which axes navigate (none for a map today). */
  navigationAxes?: 'x' | 'y' | 'xy';
  expectation: string;
}

const NAVIGATION_SIZE = { width: 520, height: 300 };

function isoDate(offset: number, hour = 0): string {
  const date = new Date(Date.UTC(2025, 0, 1 + offset, hour));
  return date.toISOString();
}

const electricityDemand = Array.from({ length: 365 }, (_, day) => {
  const weekday = (day + 3) % 7;
  const annual = 4.8 * Math.cos((day - 18) * Math.PI * 2 / 365);
  const weekly = weekday >= 5 ? -3.2 : 1.1;
  const variation = 1.4 * Math.sin(day * 0.43) + 0.7 * Math.sin(day * 1.71);
  return {
    Date: isoDate(day),
    'Peak demand (GW)': Number((31 + annual + weekly + variation).toFixed(2)),
  };
});

const airQuality = Array.from({ length: 45 * 24 }, (_, hour) => {
  const day = Math.floor(hour / 24);
  const hourOfDay = hour % 24;
  const commute = 13 * Math.exp(-Math.pow((hourOfDay - 8) / 2.2, 2))
    + 10 * Math.exp(-Math.pow((hourOfDay - 18) / 2.8, 2));
  const weather = 7 * Math.sin(day * 0.31) + 3 * Math.sin(hour * 0.17);
  return {
    Timestamp: isoDate(day, hourOfDay),
    'PM2.5 (ug/m3)': Number(Math.max(3, 16 + commute + weather).toFixed(1)),
  };
});

/**
 * Gallery maps as navigation cases. A map has no continuous x/y scale, so the
 * navigate preset moves the projection's fitted extent instead: both axes pan
 * together and zoom is uniform about the pointer.
 */
function mapInput(cases: readonly { chartProperties?: any }[], region: 'us' | 'world', title: string): ChartAssemblyInput {
  const testCase = cases.find((candidate) => candidate.chartProperties?.region === region) ?? cases[0];
  const input = testCaseToAssemblyInput(testCase as any, NAVIGATION_SIZE);
  return {
    ...input,
    chart_spec: { ...input.chart_spec, title },
  } as ChartAssemblyInput;
}

export const navigationDemoCases: readonly NavigationDemoCase[] = [
  {
    id: 'navigate-electricity-demand',
    navigationAxes: 'x',
    input: {
      data: { values: electricityDemand },
      semantic_types: { Date: 'Date', 'Peak demand (GW)': 'Quantity' },
      chart_spec: {
        chartType: 'Line Chart',
        title: 'Daily electricity demand, 2025',
        encodings: { x: { field: 'Date' }, y: { field: 'Peak demand (GW)' } },
        baseSize: NAVIGATION_SIZE,
      },
    } as ChartAssemblyInput,
    expectation: 'Zoom into seasonal and weekly demand structure, then pan across the year.',
  },
  {
    id: 'navigate-air-quality',
    navigationAxes: 'x',
    input: {
      data: { values: airQuality },
      semantic_types: { Timestamp: 'Date', 'PM2.5 (ug/m3)': 'Quantity' },
      chart_spec: {
        chartType: 'Line Chart',
        title: 'Hourly urban air quality, 45 days',
        encodings: { x: { field: 'Timestamp' }, y: { field: 'PM2.5 (ug/m3)' } },
        baseSize: NAVIGATION_SIZE,
      },
    } as ChartAssemblyInput,
    expectation: 'Zoom from the full period into individual commute-hour peaks.',
  },
  {
    id: 'navigate-gapminder',
    navigationAxes: 'xy',
    input: {
      data: { values: gapminderRows },
      semantic_types: {
        Observation: 'Category',
        Country: 'Country',
        Continent: 'Category',
        Year: 'Quantity',
        Population: 'Quantity',
        'Life expectancy': 'Quantity',
        'GDP per capita': 'Quantity',
      },
      chart_spec: {
        chartType: 'Scatter Plot',
        title: 'Income and life expectancy, 1952-2007',
        encodings: {
          x: { field: 'GDP per capita' },
          y: { field: 'Life expectancy' },
          color: { field: 'Continent' },
          detail: { field: 'Observation' },
        },
        chartProperties: { logScale_x: true },
        baseSize: NAVIGATION_SIZE,
      },
    } as ChartAssemblyInput,
    expectation: 'Zoom into dense regional clusters and pan across the income range.',
  },
  {
    id: 'navigate-world-metro-map',
    input: mapInput(genMapTests(), 'world', 'World metro areas'),
    expectation: 'Zoom into a continent under the pointer, then pan across the world map. '
      + 'The circles keep their size while the base map refits.',
  },
  {
    id: 'navigate-us-population-choropleth',
    input: mapInput(genChoroplethTests(), 'us', 'US state population'),
    expectation: 'Zoom into a region of the albersUsa frame and pan between states. '
      + 'Alaska and Hawaii stay in their insets.',
  },
];
