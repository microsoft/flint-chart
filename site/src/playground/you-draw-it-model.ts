import type { ChartUpdate, ChartUpdateOp } from 'flint-chart/interactive';
import type { CoalShareRow } from './you-draw-it-data';

export type Segment = 'Actual' | 'Hidden';

export interface ChartRow extends CoalShareRow {
  Segment: Segment;
}

export interface DrawnSample {
  year: number;
  value: number;
}

/** One sample per drawn whole year in increasing order; the first one is the fixed anchor. */
export interface DrawnPath {
  samples: readonly DrawnSample[];
  /** The year the pointer painted last. */
  frontYear?: number;
}

export interface DrawBounds {
  startYear: number;
  endYear: number;
  startValue: number;
  minValue: number;
  maxValue: number;
}

export interface GuessScore {
  meanAbsError: number;
  meanSignedError: number;
  worstYear: number;
  worstError: number;
  comparedYears: number;
}

export type StagePhase = 'idle' | 'drawing' | 'complete' | 'revealing' | 'revealed';

export const HIDE_UPDATE_ID = 'you-draw-it-hide-future';
export const PROMPT_UPDATE_ID = 'you-draw-it-prompt';
export const DRAW_INTERACTION_ID = 'you-draw-it-draw';
export const REVEAL_INTERACTION_ID = 'you-draw-it-reveal';
export const SCORE_UPDATE_ID = 'you-draw-it-score';

const DRAWN_STROKE = '#333333';
const TRUTH_STROKE = '#18a1cd';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** The chart's x axis is temporal, so overlays and pointer values convert between fractional years and UTC dates. */
export function yearToDate(year: number): Date {
  const whole = Math.floor(year);
  const start = Date.UTC(whole, 0, 1);
  const end = Date.UTC(whole + 1, 0, 1);
  return new Date(start + ((end - start) * (year - whole)));
}

export function dateToYear(value: Date | number): number {
  const ms = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(ms)) return Number.NaN;
  const whole = new Date(ms).getUTCFullYear();
  const start = Date.UTC(whole, 0, 1);
  const end = Date.UTC(whole + 1, 0, 1);
  return whole + ((ms - start) / (end - start));
}

function overlayRow<T extends { Year: number }>(row: T): Omit<T, 'Year'> & { Year: Date } {
  return { ...row, Year: yearToDate(row.Year) };
}

function interpolateAt(samples: readonly DrawnSample[], year: number): number {
  if (year <= samples[0].year) return samples[0].value;
  const last = samples[samples.length - 1];
  if (year >= last.year) return last.value;
  let index = 1;
  while (samples[index].year < year) index += 1;
  const left = samples[index - 1];
  const right = samples[index];
  const span = right.year - left.year;
  if (span <= 0) return right.value;
  return left.value + ((right.value - left.value) * ((year - left.year) / span));
}

/** Rows before the draw start stay visible; the rest become the hidden truth. Both include the start year so the paths join. */
export function splitRows(rows: readonly CoalShareRow[], startYear: number): ChartRow[] {
  const out: ChartRow[] = [];
  for (const row of rows) {
    if (row.Year <= startYear) out.push({ ...row, Segment: 'Actual' });
    if (row.Year >= startYear) out.push({ ...row, Segment: 'Hidden' });
  }
  return out;
}

export function drawBounds(
  rows: readonly CoalShareRow[],
  startYear: number,
  valueDomain: readonly [number, number],
): DrawBounds {
  const start = rows.find((row) => row.Year === startYear);
  if (!start) throw new Error(`No row for the draw start year ${startYear}.`);
  return {
    startYear,
    endYear: Math.max(...rows.map((row) => row.Year)),
    startValue: start.Share,
    minValue: valueDomain[0],
    maxValue: valueDomain[1],
  };
}

export function anchorPath(bounds: DrawBounds): DrawnPath {
  return { samples: [{ year: bounds.startYear, value: bounds.startValue }] };
}

function nearestYear(year: number, bounds: DrawBounds): number {
  return Math.round(clamp(year, bounds.startYear, bounds.endYear));
}

/**
 * Paint pointer samples onto the path. Each whole year keeps one value: the
 * year under the pointer takes the pointer's value, years the pointer crosses
 * between two samples take the interpolated value, and every other year keeps
 * what it had. The reader can move back and redraw a part; the anchor year
 * never changes.
 */
export function extendPath(
  path: DrawnPath,
  candidates: readonly { year: number; value: number }[],
  bounds: DrawBounds,
): DrawnPath {
  const values = new Map(path.samples.map((sample) => [sample.year, sample.value]));
  const paint = (year: number, value: number) => {
    if (year <= bounds.startYear) return;
    values.set(year, clamp(value, bounds.minValue, bounds.maxValue));
  };
  let previous: { year: number; value: number } | undefined;
  let frontYear = path.frontYear;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.year) || !Number.isFinite(candidate.value)) continue;
    const current = {
      year: clamp(candidate.year, bounds.startYear, bounds.endYear),
      value: clamp(candidate.value, bounds.minValue, bounds.maxValue),
    };
    const target = nearestYear(current.year, bounds);
    if (previous) {
      const from = nearestYear(previous.year, bounds);
      const step = target >= from ? 1 : -1;
      for (let year = from; year !== target + step; year += step) {
        const span = current.year - previous.year;
        const t = Math.abs(span) < 1e-9 ? 1 : clamp((year - previous.year) / span, 0, 1);
        paint(year, previous.value + ((current.value - previous.value) * t));
      }
    } else {
      paint(target, current.value);
    }
    if (target > bounds.startYear) frontYear = target;
    previous = current;
  }
  const samples = [...values.entries()]
    .sort(([left], [right]) => left - right)
    .map(([year, value]) => ({ year, value }));
  return { samples, ...(frontYear !== undefined ? { frontYear } : {}) };
}

/** Years after the anchor that still have no value. */
export function missingYears(path: DrawnPath, bounds: DrawBounds): number[] {
  const drawn = new Set(path.samples.map((sample) => sample.year));
  const missing: number[] = [];
  for (let year = bounds.startYear + 1; year <= bounds.endYear; year += 1) {
    if (!drawn.has(year)) missing.push(year);
  }
  return missing;
}

export function isComplete(path: DrawnPath, bounds: DrawBounds): boolean {
  return missingYears(path, bounds).length === 0;
}

/** The sample the pointer painted last, or the anchor before any stroke. */
export function frontSample(path: DrawnPath): DrawnSample {
  const front = path.frontYear === undefined
    ? undefined
    : path.samples.find((sample) => sample.year === path.frontYear);
  return front ?? path.samples[path.samples.length - 1];
}

/** One row per drawn whole year, the anchor included. */
export function resampleYearly(path: DrawnPath): CoalShareRow[] {
  return path.samples.map((sample) => ({ Year: sample.year, Share: sample.value }));
}

export function scoreGuess(
  drawn: readonly CoalShareRow[],
  truth: readonly CoalShareRow[],
  startYear: number,
): GuessScore | null {
  const truthByYear = new Map(truth.map((row) => [row.Year, row.Share]));
  let absSum = 0;
  let signedSum = 0;
  let count = 0;
  let worstYear = startYear;
  let worstError = 0;
  for (const row of drawn) {
    if (row.Year <= startYear) continue;
    const actual = truthByYear.get(row.Year);
    if (actual === undefined) continue;
    const error = row.Share - actual;
    absSum += Math.abs(error);
    signedSum += error;
    count += 1;
    if (Math.abs(error) > Math.abs(worstError)) {
      worstError = error;
      worstYear = row.Year;
    }
  }
  if (count === 0) return null;
  return {
    meanAbsError: absSum / count,
    meanSignedError: signedSum / count,
    worstYear,
    worstError,
    comparedYears: count,
  };
}

export function describeScore(score: GuessScore): { headline: string; detail: string } {
  const headline = `Your line was off by ${score.meanAbsError.toFixed(1)} points on average.`;
  const direction = score.meanSignedError > 1
    ? 'You drew coal higher than it went.'
    : score.meanSignedError < -1
      ? 'You drew coal lower than it went.'
      : 'You stayed close on both sides.';
  const worst = `Largest miss in ${score.worstYear}: ${Math.abs(score.worstError).toFixed(1)} points.`;
  return { headline, detail: `${direction} ${worst}` };
}

/** The hidden truth up to a fraction of the way from the start year to the end year. */
export function revealRows(
  truth: readonly CoalShareRow[],
  bounds: DrawBounds,
  progress: number,
): CoalShareRow[] {
  const hidden = truth.filter((row) => row.Year >= bounds.startYear);
  const frontYear = bounds.startYear + ((bounds.endYear - bounds.startYear) * clamp(progress, 0, 1));
  const shown = hidden.filter((row) => row.Year <= frontYear);
  const samples = hidden.map((row) => ({ year: row.Year, value: row.Share }));
  if (shown.length === 0 || shown[shown.length - 1].Year < frontYear) {
    shown.push({ Year: frontYear, Share: interpolateAt(samples, frontYear) });
  }
  return shown;
}

// ---- Chart updates -------------------------------------------------------

/**
 * The future rows stay in the data so the temporal x axis keeps its full
 * range; they only lose their ink. An explicit per-key opacity outranks the
 * emphasis and muted states, so a stray selection cannot leak them back.
 */
export function hideFutureUpdate(): ChartUpdate {
  return {
    id: HIDE_UPDATE_ID,
    ops: [{
      op: 'set-style',
      targets: [{ select: { key: { Segment: 'Hidden' } } }],
      value: { opacity: 0 },
    }],
  };
}

export function promptUpdate(bounds: DrawBounds, visible: boolean): ChartUpdate {
  const midYear = (bounds.startYear + bounds.endYear) / 2;
  const midValue = (bounds.minValue + bounds.maxValue) / 2;
  return {
    id: PROMPT_UPDATE_ID,
    ops: [
      {
        // The last known value marks where the reader's line begins.
        op: 'set-overlay',
        name: 'draw-start-point',
        value: {
          mark: 'point',
          role: 'draw-start',
          data: { values: [{ Year: yearToDate(bounds.startYear), Share: bounds.startValue }] },
          encodings: { x: { field: 'Year' }, y: { field: 'Share' } },
          style: { fill: TRUTH_STROKE, stroke: '#ffffff', strokeWidth: 1.5, pointRadius: 5 },
        },
      },
      {
        op: 'set-overlay',
        name: 'draw-prompt',
        value: visible ? {
          mark: 'text',
          role: 'draw-prompt',
          data: { values: [{ Year: yearToDate(midYear), Share: midValue, Label: `Draw the line to ${bounds.endYear}` }] },
          encodings: { x: { field: 'Year' }, y: { field: 'Share' }, text: { field: 'Label' } },
          style: { fill: '#333333', fontSize: 14, fontWeight: 'bold', textAlign: 'middle' },
        } : null,
      },
      {
        op: 'set-overlay',
        name: 'draw-prompt-hint',
        value: visible ? {
          mark: 'text',
          role: 'draw-prompt',
          data: { values: [{ Year: yearToDate(midYear), Share: midValue, Label: 'Press to the right of the blue dot and move across the years' }] },
          encodings: { x: { field: 'Year' }, y: { field: 'Share' }, text: { field: 'Label' } },
          style: { fill: '#999999', fontSize: 11, textAlign: 'middle', dy: 18 },
        } : null,
      },
    ],
  };
}

/** The reader's line is always dashed; `finished` only removes the front marker. */
export function drawnLineUpdate(path: DrawnPath, finished: boolean, bounds?: DrawBounds): ChartUpdate {
  const rows = path.samples.map((sample) => ({ Year: sample.year, Share: sample.value }));
  const frontPoint = frontSample(path);
  const front = { Year: frontPoint.year, Share: frontPoint.value };
  const frontLabel = `${front.Year} · ${front.Share.toFixed(1)}%`;
  // Near the right edge the label would leave the plot, so it sits left of the dot.
  const nearEnd = bounds !== undefined && front.Year >= bounds.endYear - 2;
  const ops: ChartUpdateOp[] = [
    { op: 'set-overlay', name: 'draw-prompt', value: null },
    { op: 'set-overlay', name: 'draw-prompt-hint', value: null },
    {
      op: 'set-overlay',
      name: 'drawn-line',
      value: {
        mark: 'line',
        role: 'drawn-line',
        data: { values: rows.map(overlayRow) },
        encodings: { x: { field: 'Year' }, y: { field: 'Share' }, order: { field: 'Year' } },
        style: { stroke: DRAWN_STROKE, strokeWidth: 2.5, strokeDash: [6, 4] },
      },
    },
    {
      op: 'set-overlay',
      name: 'drawn-front',
      value: finished ? null : {
        mark: 'point',
        role: 'drawn-front',
        data: { values: [overlayRow(front)] },
        encodings: { x: { field: 'Year' }, y: { field: 'Share' } },
        style: { fill: DRAWN_STROKE, stroke: '#ffffff', strokeWidth: 1.5, pointRadius: 5 },
      },
    },
    {
      op: 'set-overlay',
      name: 'drawn-front-label',
      value: finished ? null : {
        mark: 'text',
        role: 'drawn-front-label',
        data: { values: [{ ...overlayRow(front), Label: frontLabel }] },
        encodings: { x: { field: 'Year' }, y: { field: 'Share' }, text: { field: 'Label' } },
        style: nearEnd
          ? { fill: '#3a434a', fontSize: 10, fontWeight: 'bold', textAlign: 'end', dx: -10, dy: -10 }
          : { fill: '#3a434a', fontSize: 10, fontWeight: 'bold', textAlign: 'start', dx: 10, dy: -10 },
      },
    },
  ];
  return { id: DRAW_INTERACTION_ID, ops };
}

export function revealUpdate(
  truth: readonly CoalShareRow[],
  bounds: DrawBounds,
  progress: number,
): ChartUpdate {
  const rows = revealRows(truth, bounds, progress).map((row) => ({ Year: yearToDate(row.Year), Share: row.Share }));
  return {
    id: REVEAL_INTERACTION_ID,
    ops: [{
      op: 'set-overlay',
      name: 'truth-reveal',
      value: rows.length < 2 ? null : {
        mark: 'line',
        role: 'truth-reveal',
        data: { values: rows },
        encodings: { x: { field: 'Year' }, y: { field: 'Share' }, order: { field: 'Year' } },
        style: { stroke: TRUTH_STROKE, strokeWidth: 2.5 },
      },
    }],
  };
}

export function clearRevealUpdate(): ChartUpdate {
  return {
    id: REVEAL_INTERACTION_ID,
    ops: [{ op: 'set-overlay', name: 'truth-reveal', value: null }],
  };
}

export function scoreUpdate(
  score: GuessScore,
  truth: readonly CoalShareRow[],
  bounds: DrawBounds,
  drawnEnd: number,
): ChartUpdate {
  const text = describeScore(score);
  const finalTruth = truth[truth.length - 1];
  // End labels: the drawn label sits inside the gap between the two ends when
  // the gap has room, otherwise on the far side; the actual label always sits
  // on the far side of the actual end.
  const drawnAbove = drawnEnd >= finalTruth.Share;
  const roomInGap = Math.abs(drawnEnd - finalTruth.Share) >= 3;
  const drawnDy = drawnAbove ? (roomInGap ? 14 : -8) : (roomInGap ? -8 : 14);
  const actualDy = drawnAbove ? 14 : -8;
  const labelYear = bounds.startYear + ((bounds.endYear - bounds.startYear) * 0.08);
  const labelValue = bounds.maxValue - ((bounds.maxValue - bounds.minValue) * 0.04);
  return {
    id: SCORE_UPDATE_ID,
    ops: [
      {
        op: 'set-overlay',
        name: 'score-headline',
        value: {
          mark: 'text',
          role: 'score',
          data: { values: [{ Year: yearToDate(labelYear), Share: labelValue, Label: text.headline }] },
          encodings: { x: { field: 'Year' }, y: { field: 'Share' }, text: { field: 'Label' } },
          style: { fill: '#333333', fontSize: 12, fontWeight: 'bold', textAlign: 'start' },
        },
      },
      {
        op: 'set-overlay',
        name: 'score-detail',
        value: {
          mark: 'text',
          role: 'score',
          data: { values: [{ Year: yearToDate(labelYear), Share: labelValue, Label: text.detail }] },
          encodings: { x: { field: 'Year' }, y: { field: 'Share' }, text: { field: 'Label' } },
          style: { fill: '#666666', fontSize: 11, textAlign: 'start', dy: 16 },
        },
      },
      {
        op: 'set-overlay',
        name: 'score-gap',
        value: {
          mark: 'rule',
          role: 'score-gap',
          data: { values: [{ Year: yearToDate(finalTruth.Year), Share: finalTruth.Share, YearEnd: yearToDate(finalTruth.Year), ShareEnd: drawnEnd }] },
          encodings: { x: { field: 'Year' }, y: { field: 'Share' }, x2: { field: 'YearEnd' }, y2: { field: 'ShareEnd' } },
          style: { stroke: '#c04a4a', strokeWidth: 1.5, strokeDash: [3, 2] },
        },
      },
      {
        op: 'set-overlay',
        name: 'score-end-actual',
        value: {
          mark: 'text',
          role: 'score',
          data: { values: [{ Year: yearToDate(finalTruth.Year), Share: finalTruth.Share, Label: `Actual ${finalTruth.Share.toFixed(1)}%` }] },
          encodings: { x: { field: 'Year' }, y: { field: 'Share' }, text: { field: 'Label' } },
          style: { fill: TRUTH_STROKE, fontSize: 11, fontWeight: 'bold', textAlign: 'end', dx: -10, dy: actualDy },
        },
      },
      {
        op: 'set-overlay',
        name: 'score-end-drawn',
        value: {
          mark: 'text',
          role: 'score',
          data: { values: [{ Year: yearToDate(finalTruth.Year), Share: drawnEnd, Label: `Your line ${drawnEnd.toFixed(1)}%` }] },
          encodings: { x: { field: 'Year' }, y: { field: 'Share' }, text: { field: 'Label' } },
          style: { fill: DRAWN_STROKE, fontSize: 11, fontWeight: 'bold', textAlign: 'end', dx: -10, dy: drawnDy },
        },
      },
    ],
  };
}
