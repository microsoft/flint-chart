export type TimeboxRow = {
  Series: string;
  Time: number;
  TimeLabel: string;
  Value: number;
};

type SeriesDefinition = {
  name: string;
  values: readonly number[];
};

export const TIME_LABELS = [
  'Jan 24', 'Feb 24', 'Mar 24', 'Apr 24', 'May 24', 'Jun 24',
  'Jul 24', 'Aug 24', 'Sep 24', 'Oct 24', 'Nov 24', 'Dec 24',
  'Jan 25', 'Feb 25', 'Mar 25', 'Apr 25', 'May 25', 'Jun 25',
] as const;

const SERIES: readonly SeriesDefinition[] = [
  {
    name: 'Atlas',
    values: [42, 44, 45, 47, 49, 50, 52, 53, 54, 56, 58, 60, 61, 63, 64, 66, 67, 69],
  },
  {
    name: 'Beacon',
    values: [50, 52, 54, 55, 54, 53, 51, 49, 48, 47, 48, 50, 52, 54, 55, 54, 53, 52],
  },
  {
    name: 'Comet',
    values: [35, 36, 37, 38, 39, 40, 41, 42, 44, 46, 50, 55, 61, 68, 72, 74, 73, 71],
  },
  {
    name: 'Drift',
    values: [62, 63, 64, 65, 66, 67, 67, 68, 69, 69, 70, 71, 72, 73, 74, 75, 76, 77],
  },
  {
    name: 'Ember',
    values: [46, 47, 48, 49, 50, 50, 51, 52, 53, 53, 54, 54, 55, 56, 56, 57, 58, 59],
  },
  {
    name: 'Fjord',
    values: [44, 45, 46, 47, 48, 49, 50, 51, 52, 45, 44, 43, 42, 41, 40, 39, 38, 37],
  },
] as const;

export const TIME_DOMAIN = [1, TIME_LABELS.length] as const;
export const VALUE_DOMAIN = [34, 78] as const;
export const TOTAL_SERIES = SERIES.length;

export const TIMEBOX_ROWS: TimeboxRow[] = SERIES.flatMap((series) =>
  series.values.map((value, index) => ({
    Series: series.name,
    Time: index + 1,
    TimeLabel: TIME_LABELS[index],
    Value: value,
  })));
