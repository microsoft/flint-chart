import type { IndexChartStockRow } from '../data/index-chart-stocks';

export interface PreparedIndexPoint {
  date: Date;
  dateMs: number;
  close: number;
}

export interface PreparedIndexSeries {
  symbol: IndexChartStockRow['Symbol'];
  points: PreparedIndexPoint[];
}

export interface PreparedIndexChartData {
  series: PreparedIndexSeries[];
  availableDates: Date[];
  minDate: Date;
  maxDate: Date;
  returnDomain: [number, number];
}

export interface IndexedReturnRow {
  Symbol: IndexChartStockRow['Symbol'];
  Date: string;
  IndexedReturn: number;
  Close: number;
  ReferenceDate: string;
  ReferenceClose: number;
}

export interface BaselineResolution {
  Symbol: IndexChartStockRow['Symbol'];
  requestedDate: string;
  resolvedDate: string;
  referenceClose: number;
}

export interface SeriesEndLabel {
  Symbol: IndexChartStockRow['Symbol'];
  Date: string;
  IndexedReturn: number;
}

export interface IndexChartState {
  activeDate: Date;
  indexedRows: IndexedReturnRow[];
  baselines: BaselineResolution[];
  endLabels: SeriesEndLabel[];
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

function clampDate(value: Date, min: Date, max: Date): Date {
  const time = Math.min(Math.max(value.getTime(), min.getTime()), max.getTime());
  return new Date(time);
}

function nearestPoint(points: readonly PreparedIndexPoint[], targetMs: number): PreparedIndexPoint {
  if (points.length === 1) return points[0];
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].dateMs < targetMs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  const right = points[low];
  const left = points[Math.max(0, low - 1)];
  return Math.abs(right.dateMs - targetMs) < Math.abs(left.dateMs - targetMs) ? right : left;
}

function interpolatedClose(points: readonly PreparedIndexPoint[], targetMs: number): number {
  if (points.length === 1) return points[0].close;
  if (targetMs <= points[0].dateMs) return points[0].close;
  if (targetMs >= points[points.length - 1].dateMs) return points[points.length - 1].close;

  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].dateMs < targetMs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const right = points[low];
  if (right.dateMs === targetMs) return right.close;
  const left = points[Math.max(0, low - 1)];
  const span = right.dateMs - left.dateMs;
  if (span <= 0) return right.close;
  const t = (targetMs - left.dateMs) / span;
  return left.close + ((right.close - left.close) * t);
}

export function snapDateToAvailableDate(availableDates: readonly Date[], candidate: string | Date): Date {
  const target = toUtcDate(candidate);
  const available = availableDates.map((date) => ({ date, dateMs: date.getTime() }));
  return nearestPoint(available.map(({ date, dateMs }) => ({ date, dateMs, close: 0 })), target.getTime()).date;
}

export function clampDateToPreparedDomain(
  prepared: Pick<PreparedIndexChartData, 'minDate' | 'maxDate'>,
  candidate: string | Date,
): Date {
  return clampDate(toUtcDate(candidate), prepared.minDate, prepared.maxDate);
}

export function prepareIndexChartData(rows: readonly IndexChartStockRow[]): PreparedIndexChartData {
  const grouped = new Map<IndexChartStockRow['Symbol'], PreparedIndexPoint[]>();
  const allDates = new Map<number, Date>();
  let maxReturn = 0;
  let minReturn = 0;

  for (const row of rows) {
    const date = toUtcDate(row.Date);
    const dateMs = date.getTime();
    allDates.set(dateMs, date);
    const points = grouped.get(row.Symbol) ?? [];
    points.push({ date, dateMs, close: row.Close });
    grouped.set(row.Symbol, points);
  }

  const series = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([symbol, points]) => {
      const sorted = [...points].sort((left, right) => left.dateMs - right.dateMs);
      const closes = sorted.map((point) => point.close);
      const minClose = Math.min(...closes);
      const maxClose = Math.max(...closes);
      maxReturn = Math.max(maxReturn, (maxClose / minClose) - 1);
      minReturn = Math.min(minReturn, (minClose / maxClose) - 1);
      return { symbol, points: sorted };
    });

  const availableDates = [...allDates.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, date]) => date);
  const padding = Math.max(0.06, (maxReturn - minReturn) * 0.08);

  return {
    series,
    availableDates,
    minDate: availableDates[0],
    maxDate: availableDates[availableDates.length - 1],
    returnDomain: [minReturn - padding, maxReturn + padding],
  };
}

export function deriveIndexChartState(
  prepared: PreparedIndexChartData,
  requestedDate: string | Date,
): IndexChartState {
  const activeDate = clampDateToPreparedDomain(prepared, requestedDate);
  const activeMs = activeDate.getTime();
  const requestedDateIso = toIsoDate(activeDate);
  const indexedRows: IndexedReturnRow[] = [];
  const baselines: BaselineResolution[] = [];
  const endLabels: SeriesEndLabel[] = [];

  for (const series of prepared.series) {
    const referenceClose = interpolatedClose(series.points, activeMs);
    baselines.push({
      Symbol: series.symbol,
      requestedDate: requestedDateIso,
      resolvedDate: requestedDateIso,
      referenceClose,
    });

    const rows = series.points.map((point) => ({
      Symbol: series.symbol,
      Date: toIsoDate(point.date),
      IndexedReturn: (point.close / referenceClose) - 1,
      Close: point.close,
      ReferenceDate: requestedDateIso,
      ReferenceClose: referenceClose,
    }));
    indexedRows.push(...rows);
    const last = rows[rows.length - 1];
    endLabels.push({ Symbol: last.Symbol, Date: last.Date, IndexedReturn: last.IndexedReturn });
  }

  return { activeDate, indexedRows, baselines, endLabels };
}
