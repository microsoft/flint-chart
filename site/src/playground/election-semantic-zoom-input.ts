import type { ChartAssemblyInput } from 'flint-chart';
import election from '../data/election-2024.json';
import type { MapDataset } from './MapSemanticZoomStage';

/**
 * The 2024 presidential election on the two-level US choropleth: the state
 * rows sum the county votes, and both levels share one diverging margin scale
 * about zero, so a county reads against the same red/blue as its state.
 */

export const MARGIN = 'Margin (pts)';

const MARGIN_ANNOTATION = {
  semanticType: 'Quantity', divergingMidpoint: 0, intrinsicDomain: [-40, 40] as [number, number], unit: 'pts',
};

function chartInput(): ChartAssemblyInput {
  const states = election.states.map((row) => ({
    Region: row.state,
    Place: row.stateName,
    [MARGIN]: row.margin,
    'Trump votes': row.gop,
    'Harris votes': row.dem,
    'Total votes': row.total,
  }));
  const counties = election.counties.map((row) => ({
    Region: row.fips,
    Place: `${row.county}, ${row.state}`,
    [MARGIN]: row.margin,
    'Trump votes': row.gop,
    'Harris votes': row.dem,
    'Total votes': row.total,
  }));
  return {
    data: { values: [...states, ...counties] },
    semantic_types: {
      Region: 'State',
      Place: 'Category',
      [MARGIN]: MARGIN_ANNOTATION,
      'Trump votes': 'Quantity',
      'Harris votes': 'Quantity',
      'Total votes': 'Quantity',
    },
    theme_spec: 'nyt',
    chart_spec: {
      chartType: 'Choropleth',
      title: 'The 2024 presidential vote',
      subtitle: 'Trump share minus Harris share of the two-party vote, in percentage points',
      baseSize: { width: 920, height: 560 },
      encodings: { id: 'Region', color: MARGIN, detail: 'Place' },
      chartProperties: { region: 'us', level: 'auto' },
    },
  } as ChartAssemblyInput;
}

export const ELECTION_DATASET: MapDataset = {
  input: chartInput,
  measure: election.measure,
  source: election.source,
  ariaLabel: 'US map of the 2024 presidential vote margin by state and county',
  chartId: 'election-semantic-zoom',
  bare: true,
};
