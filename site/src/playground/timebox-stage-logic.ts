import type { TimeboxRow } from './timebox-stage-data';

export type TimeboxSelection = {
  startTime: number;
  endTime: number;
  minValue: number;
  maxValue: number;
};

export type TimeboxFilterResult = {
  keptSeries: string[];
  keptRows: TimeboxRow[];
  pointsInWindow: number;
};

export function normalizeTimeboxSelection(
  startTime: number,
  endTime: number,
  minValue: number,
  maxValue: number,
): TimeboxSelection {
  return {
    startTime: Math.min(startTime, endTime),
    endTime: Math.max(startTime, endTime),
    minValue: Math.min(minValue, maxValue),
    maxValue: Math.max(minValue, maxValue),
  };
}

export function filterRowsByTimebox(
  rows: readonly TimeboxRow[],
  selection: TimeboxSelection,
): TimeboxFilterResult {
  const bySeries = new Map<string, TimeboxRow[]>();
  for (const row of rows) {
    const bucket = bySeries.get(row.Series);
    if (bucket) bucket.push(row);
    else bySeries.set(row.Series, [row]);
  }

  const keptSeries: string[] = [];
  let pointsInWindow = 0;
  for (const [series, seriesRows] of bySeries) {
    // A discrete timebox only judges observed samples, but it still needs at
    // least one sampled point inside the time window to count as a match.
    const rowsInWindow = seriesRows.filter((row) =>
      row.Time >= selection.startTime && row.Time <= selection.endTime);
    pointsInWindow += rowsInWindow.length;
    if (rowsInWindow.length === 0) continue;
    const allPointsInside = rowsInWindow.every((row) =>
      row.Value >= selection.minValue && row.Value <= selection.maxValue);
    if (allPointsInside) keptSeries.push(series);
  }

  const keptSet = new Set(keptSeries);
  return {
    keptSeries,
    keptRows: rows.filter((row) => keptSet.has(row.Series)),
    pointsInWindow,
  };
}
