export interface TimeboxInputRow {
  series: string;
  date: string | Date;
  value: number;
}

export interface TimeboxPoint {
  date: Date;
  dateMs: number;
  value: number;
  indexedValue: number;
}

export interface TimeboxSeries {
  key: string;
  points: TimeboxPoint[];
}

export interface PreparedTimeboxData {
  rows: TimeboxRow[];
  series: TimeboxSeries[];
  minDate: Date;
  maxDate: Date;
  valueDomain: [number, number];
}

export interface TimeboxRow {
  Series: string;
  Date: string;
  Value: number;
  IndexedValue: number;
}

export interface TimeboxSelection {
  startDate: Date;
  endDate: Date;
  minValue: number;
  maxValue: number;
}

export interface TimeboxFilterResult {
  rows: TimeboxRow[];
  retainedSymbols: string[];
  windowSampleCount: number;
}

export function isValidTimeboxDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function toUtcDate(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  return new Date(`${value}T00:00:00Z`);
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function normalizeTimeboxSelection(selection: TimeboxSelection): TimeboxSelection {
  if (!isValidTimeboxDate(selection.startDate) || !isValidTimeboxDate(selection.endDate)) {
    throw new Error('Timebox selection must contain valid start and end dates.');
  }
  const startDate = selection.startDate.getTime() <= selection.endDate.getTime()
    ? selection.startDate
    : selection.endDate;
  const endDate = selection.startDate.getTime() <= selection.endDate.getTime()
    ? selection.endDate
    : selection.startDate;
  const minValue = Math.min(selection.minValue, selection.maxValue);
  const maxValue = Math.max(selection.minValue, selection.maxValue);
  return { startDate, endDate, minValue, maxValue };
}

export function prepareTimeboxData(rows: readonly TimeboxInputRow[]): PreparedTimeboxData {
  const grouped = new Map<string, TimeboxPoint[]>();
  let minIndexedValue = Number.POSITIVE_INFINITY;
  let maxIndexedValue = Number.NEGATIVE_INFINITY;
  let minDateMs = Number.POSITIVE_INFINITY;
  let maxDateMs = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    const date = toUtcDate(row.date);
    const dateMs = date.getTime();
    minDateMs = Math.min(minDateMs, dateMs);
    maxDateMs = Math.max(maxDateMs, dateMs);
    const points = grouped.get(row.series) ?? [];
    points.push({ date, dateMs, value: row.value, indexedValue: 0 });
    grouped.set(row.series, points);
  }

  const series: TimeboxSeries[] = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, points]) => {
      const sorted = [...points].sort((left, right) => left.dateMs - right.dateMs);
      const baseline = sorted[0]?.value ?? 1;
      const normalized = sorted.map((point) => {
        const indexedValue = (point.value / baseline) * 100;
        minIndexedValue = Math.min(minIndexedValue, indexedValue);
        maxIndexedValue = Math.max(maxIndexedValue, indexedValue);
        return { ...point, indexedValue };
      });
      return { key, points: normalized };
    });

  const rowsWithIndex = series.flatMap((series) => series.points.map((point) => ({
    Series: series.key,
    Date: toIsoDate(point.date),
    Value: point.value,
    IndexedValue: point.indexedValue,
  })));
  const valuePadding = Math.max(6, (maxIndexedValue - minIndexedValue) * 0.08);
  return {
    rows: rowsWithIndex,
    series,
    minDate: new Date(minDateMs),
    maxDate: new Date(maxDateMs),
    valueDomain: [Math.max(0, minIndexedValue - valuePadding), maxIndexedValue + valuePadding],
  };
}

export function filterRowsByTimebox(
  prepared: PreparedTimeboxData,
  selection: TimeboxSelection | null,
): TimeboxFilterResult {
  if (!selection) {
    return {
      rows: prepared.rows,
      retainedSymbols: prepared.series.map((series) => series.key),
      windowSampleCount: 0,
    };
  }

  if (!isValidTimeboxDate(selection.startDate) || !isValidTimeboxDate(selection.endDate)) {
    return {
      rows: prepared.rows,
      retainedSymbols: prepared.series.map((series) => series.key),
      windowSampleCount: 0,
    };
  }

  const normalized = normalizeTimeboxSelection(selection);
  const startMs = normalized.startDate.getTime();
  const endMs = normalized.endDate.getTime();
  const retainedSymbols: string[] = [];
  let windowSampleCount = 0;

  for (const series of prepared.series) {
    const windowPoints = series.points.filter((point) => point.dateMs >= startMs && point.dateMs <= endMs);
    windowSampleCount += windowPoints.length;
    if (windowPoints.length === 0) continue;
    const inside = windowPoints.every((point) =>
      point.indexedValue >= normalized.minValue && point.indexedValue <= normalized.maxValue);
    if (inside) retainedSymbols.push(series.key);
  }

  const retainedSet = new Set(retainedSymbols);
  return {
    rows: prepared.rows.filter((row) => retainedSet.has(row.Series)),
    retainedSymbols,
    windowSampleCount,
  };
}

export function timeboxOverlayRow(selection: TimeboxSelection) {
  if (!isValidTimeboxDate(selection.startDate) || !isValidTimeboxDate(selection.endDate)) {
    throw new Error('Timebox overlay requires valid start and end dates.');
  }
  const normalized = normalizeTimeboxSelection(selection);
  return {
    StartDate: normalized.startDate,
    EndDate: normalized.endDate,
    MinValue: normalized.minValue,
    MaxValue: normalized.maxValue,
    Label: `${toIsoDate(normalized.startDate)} to ${toIsoDate(normalized.endDate)}`,
  };
}
