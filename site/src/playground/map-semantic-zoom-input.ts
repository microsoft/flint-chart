import type { ChartAssemblyInput } from 'flint-chart';
import mobility from '../data/county-mobility.json';

/**
 * The two-level US choropleth input shared by the semantic zoom stages: one
 * chart, `level: 'auto'`, and one table that holds state and county rows.
 */

export type Level = 'state' | 'county';

/** Degrees of visible longitude below which the template swaps states for counties. */
export const COUNTY_ENTER_SPAN = 20;
export const MEASURE = 'Income gain (p25)';
const MEASURE_P75 = 'Income gain (p75)';

type MeasureAnnotation = {
  semanticType: string;
  divergingMidpoint: number;
  intrinsicDomain: [number, number];
  unit: string;
};

/** Both levels share one diverging scale about zero, so colours stay comparable across the swap. */
const MEASURE_ANNOTATION: MeasureAnnotation = {
  semanticType: 'Quantity', divergingMidpoint: 0, intrinsicDomain: [-2, 2], unit: '%',
};
const MEASURE_TYPES: Record<string, string | MeasureAnnotation> = {
  [MEASURE]: MEASURE_ANNOTATION,
  [MEASURE_P75]: MEASURE_ANNOTATION,
  Population: 'Quantity',
};

/**
 * One table for both levels: state rows carry the USPS code, county rows the
 * FIPS id. Both resolve into the TopoJSON's numeric id space, where state ids
 * (1–56) and county ids (1001 and up) never collide.
 */
export function chartInput(): ChartAssemblyInput {
  const states = mobility.states.map((row) => ({
    Region: row.state,
    Place: row.stateName,
    [MEASURE]: row.p25,
    [MEASURE_P75]: row.p75,
    Population: row.pop,
  }));
  const counties = mobility.counties.map((row) => ({
    Region: row.fips,
    Place: `${row.county}, ${row.state}`,
    [MEASURE]: row.p25,
    [MEASURE_P75]: row.p75,
    Population: row.pop,
  }));
  return {
    data: { values: [...states, ...counties] },
    semantic_types: { Region: 'State', Place: 'Category', ...MEASURE_TYPES },
    chart_spec: {
      chartType: 'Choropleth',
      title: 'Where a year of childhood pays off',
      subtitle: 'Change in income at age 26 per year of childhood in the place, children of low-income parents (25th percentile), % vs national mean',
      baseSize: { width: 920, height: 560 },
      encodings: { id: 'Region', color: MEASURE, detail: 'Place' },
      chartProperties: { region: 'us', level: 'auto' },
    },
  } as ChartAssemblyInput;
}

export const isLevel = (value: unknown): value is Level => value === 'state' || value === 'county';

/** Degrees of longitude across the plot's middle row, from a navigation event's domain. */
export function longitudeSpan(domain: { x?: unknown } | undefined): number | undefined {
  const x = domain?.x as { kind?: string; start?: unknown; end?: unknown } | undefined;
  if (x?.kind !== 'interval') return undefined;
  const span = Number(x.end) - Number(x.start);
  return Number.isFinite(span) ? span : undefined;
}
