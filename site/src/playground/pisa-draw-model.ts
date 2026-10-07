import type { ChartUpdate, ChartUpdateOp } from 'flint-chart/interactive';
import {
  frontSample,
  isComplete,
  missingYears,
  yearToDate,
  type DrawBounds,
  type DrawnPath,
} from './you-draw-it-model';

export type Subject = 'Science' | 'Reading' | 'Mathematics';
export const SUBJECTS: readonly Subject[] = ['Science', 'Reading', 'Mathematics'];

export interface TrendRow {
  Year: number;
  Subject: Subject;
  Score: number;
}

export type Segment = 'Actual' | 'Hidden';

export interface ChartRow extends TrendRow {
  Segment: Segment;
}

export type DrawPhase = 'pick' | 'drawing' | 'revealing' | 'revealed';

export interface SubjectScore {
  subject: Subject;
  meanAbsError: number;
  meanSignedError: number;
  worstYear: number;
  worstError: number;
}

export const HIDE_UPDATE_ID = 'pisa-draw-hide-future';
export const FOCUS_UPDATE_ID = 'pisa-draw-focus';
export const PROMPT_UPDATE_ID = 'pisa-draw-prompt';
export const DRAW_INTERACTION_ID = 'pisa-draw-draw';
export const REVEAL_INTERACTION_ID = 'pisa-draw-reveal';

export type PathsBySubject = Readonly<Record<Subject, DrawnPath>>;
export type BoundsBySubject = Readonly<Record<Subject, DrawBounds>>;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function overlayRow(row: { Year: number; Score: number }): { Year: Date; Score: number } {
  return { Year: yearToDate(row.Year), Score: row.Score };
}

/** Rows up to the start year keep their ink; later rows are the hidden truth. The start year sits in both so the paths join. */
export function splitRows(rows: readonly TrendRow[], startYear: number): ChartRow[] {
  const out: ChartRow[] = [];
  for (const row of rows) {
    if (row.Year <= startYear) out.push({ ...row, Segment: 'Actual' });
    if (row.Year >= startYear) out.push({ ...row, Segment: 'Hidden' });
  }
  return out;
}

export function boundsBySubject(
  rows: readonly TrendRow[],
  startYear: number,
  valueDomain: readonly [number, number],
): BoundsBySubject {
  const endYear = Math.max(...rows.map((row) => row.Year));
  const entries = SUBJECTS.map((subject) => {
    const start = rows.find((row) => row.Subject === subject && row.Year === startYear);
    if (!start) throw new Error(`No ${subject} row for the draw start year ${startYear}.`);
    const bounds: DrawBounds = {
      startYear,
      endYear,
      startValue: start.Score,
      minValue: valueDomain[0],
      maxValue: valueDomain[1],
    };
    return [subject, bounds] as const;
  });
  return Object.fromEntries(entries) as Record<Subject, DrawBounds>;
}

export function anchorPaths(bounds: BoundsBySubject): PathsBySubject {
  const anchor = (subject: Subject): DrawnPath => ({
    samples: [{ year: bounds[subject].startYear, value: bounds[subject].startValue }],
  });
  return { Science: anchor('Science'), Reading: anchor('Reading'), Mathematics: anchor('Mathematics') };
}

export function subjectDone(path: DrawnPath, bounds: DrawBounds): boolean {
  return isComplete(path, bounds);
}

export function allDone(paths: PathsBySubject, bounds: BoundsBySubject): boolean {
  return SUBJECTS.every((subject) => subjectDone(paths[subject], bounds[subject]));
}

export function drawnYears(path: DrawnPath, bounds: DrawBounds): { drawn: number; total: number } {
  const total = bounds.endYear - bounds.startYear;
  return { drawn: total - missingYears(path, bounds).length, total };
}

function interpolateAt(samples: readonly { year: number; value: number }[], year: number): number {
  if (year <= samples[0].year) return samples[0].value;
  const last = samples[samples.length - 1];
  if (year >= last.year) return last.value;
  let index = 1;
  while (samples[index].year < year) index += 1;
  const left = samples[index - 1];
  const right = samples[index];
  const span = right.year - left.year;
  return span <= 0 ? right.value : left.value + ((right.value - left.value) * ((year - left.year) / span));
}

/** Compare the drawn line with the truth at each assessment year after the start. */
export function scoreSubject(
  subject: Subject,
  path: DrawnPath,
  truth: readonly TrendRow[],
  startYear: number,
): SubjectScore | null {
  const rows = truth.filter((row) => row.Subject === subject && row.Year > startYear);
  if (rows.length === 0) return null;
  let absSum = 0;
  let signedSum = 0;
  let worstYear = startYear;
  let worstError = 0;
  for (const row of rows) {
    const error = interpolateAt(path.samples, row.Year) - row.Score;
    absSum += Math.abs(error);
    signedSum += error;
    if (Math.abs(error) > Math.abs(worstError)) {
      worstError = error;
      worstYear = row.Year;
    }
  }
  return {
    subject,
    meanAbsError: absSum / rows.length,
    meanSignedError: signedSum / rows.length,
    worstYear,
    worstError,
  };
}

export function describeSubjectScore(score: SubjectScore): string {
  const direction = score.meanSignedError > 1
    ? 'too high'
    : score.meanSignedError < -1
      ? 'too low'
      : 'close on both sides';
  return `${score.meanAbsError.toFixed(1)} points off on average, ${direction}. Largest miss in ${score.worstYear}: ${Math.abs(score.worstError).toFixed(1)} points.`;
}

// ---- Chart updates -------------------------------------------------------

/** Future rows keep the temporal axis wide but lose their ink. A per-key opacity outranks emphasis, so focus cannot leak them back. */
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

/**
 * Mute the two subjects that are not being drawn. Only their visible segment
 * is targeted: an emphasis state on the active subject would outrank the
 * hidden segment's zero opacity and leak the real line before the reveal.
 * Clear the update by id to restore every series.
 */
export function focusUpdate(subject: Subject, dimOpacity = 0.22): ChartUpdate {
  return {
    id: FOCUS_UPDATE_ID,
    ops: SUBJECTS.filter((other) => other !== subject).map((other) => ({
      op: 'set-style',
      targets: [{ select: { key: { Subject: other, Segment: 'Actual' } } }],
      value: { opacity: dimOpacity },
    })),
  };
}

export function promptUpdate(
  subject: Subject | null,
  bounds: BoundsBySubject,
  ink: Readonly<Record<Subject, string>>,
): ChartUpdate {
  const any = bounds.Science;
  const midYear = (any.startYear + any.endYear) / 2;
  const topValue = any.maxValue - ((any.maxValue - any.minValue) * 0.06);
  const label = subject
    ? `Draw the ${subject.toLowerCase()} line to ${any.endYear}`
    : 'Pick a subject on the right, then draw its line';
  return {
    id: PROMPT_UPDATE_ID,
    ops: [
      {
        op: 'set-overlay',
        name: 'draw-start-points',
        value: {
          mark: 'point',
          role: 'draw-start',
          data: {
            values: SUBJECTS.map((name) => ({
              Year: yearToDate(bounds[name].startYear),
              Score: bounds[name].startValue,
              Ink: ink[name],
            })),
          },
          encodings: { x: { field: 'Year' }, y: { field: 'Score' } },
          style: { fill: subject ? ink[subject] : '#54585a', stroke: '#ffffff', strokeWidth: 1.5, pointRadius: 4 },
        },
      },
      {
        op: 'set-overlay',
        name: 'draw-prompt',
        value: {
          mark: 'text',
          role: 'draw-prompt',
          data: { values: [{ Year: yearToDate(midYear), Score: topValue, Label: label }] },
          encodings: { x: { field: 'Year' }, y: { field: 'Score' }, text: { field: 'Label' } },
          style: { fill: subject ? ink[subject] : '#333333', fontSize: 13, fontWeight: 'bold', textAlign: 'middle' },
        },
      },
    ],
  };
}

/**
 * Every drawn line lives under the draw interaction id, so each update must
 * restate all three: the region gesture parks its own preview under the same
 * id and a partial update would drop the finished lines.
 */
export function drawnLinesUpdate(
  paths: PathsBySubject,
  active: Subject | null,
  bounds: BoundsBySubject,
  ink: Readonly<Record<Subject, string>>,
  finished: boolean,
): ChartUpdate {
  const ops: ChartUpdateOp[] = [];
  for (const subject of SUBJECTS) {
    const path = paths[subject];
    const rows = path.samples.map((sample) => ({ Year: sample.year, Score: sample.value }));
    const isActive = subject === active && !finished;
    ops.push({
      op: 'set-overlay',
      name: `drawn-line-${subject}`,
      value: rows.length < 2 ? null : {
        mark: 'line',
        role: 'drawn-line',
        data: { values: rows.map(overlayRow) },
        encodings: { x: { field: 'Year' }, y: { field: 'Score' }, order: { field: 'Year' } },
        style: {
          stroke: ink[subject],
          strokeWidth: isActive ? 2.5 : 2,
          strokeDash: [6, 4],
          opacity: active && !isActive && !finished ? 0.5 : 1,
        },
      },
    });
    const front = frontSample(path);
    const nearEnd = front.year >= bounds[subject].endYear - 2;
    ops.push({
      op: 'set-overlay',
      name: `drawn-front-${subject}`,
      value: !isActive ? null : {
        mark: 'point',
        role: 'drawn-front',
        data: { values: [overlayRow({ Year: front.year, Score: front.value })] },
        encodings: { x: { field: 'Year' }, y: { field: 'Score' } },
        style: { fill: ink[subject], stroke: '#ffffff', strokeWidth: 1.5, pointRadius: 5 },
      },
    });
    ops.push({
      op: 'set-overlay',
      name: `drawn-front-label-${subject}`,
      value: !isActive ? null : {
        mark: 'text',
        role: 'drawn-front-label',
        data: { values: [{ ...overlayRow({ Year: front.year, Score: front.value }), Label: `${front.year} · ${front.value.toFixed(0)}` }] },
        encodings: { x: { field: 'Year' }, y: { field: 'Score' }, text: { field: 'Label' } },
        style: nearEnd
          ? { fill: '#3a434a', fontSize: 10, fontWeight: 'bold', textAlign: 'end', dx: -10, dy: -10 }
          : { fill: '#3a434a', fontSize: 10, fontWeight: 'bold', textAlign: 'start', dx: 10, dy: -10 },
      },
    });
  }
  return { id: DRAW_INTERACTION_ID, ops };
}

/** The truth for every subject up to a fraction of the way from the start year to the end year. */
export function revealUpdate(
  truth: readonly TrendRow[],
  bounds: BoundsBySubject,
  ink: Readonly<Record<Subject, string>>,
  progress: number,
): ChartUpdate {
  const ops: ChartUpdateOp[] = SUBJECTS.map((subject) => {
    const { startYear, endYear } = bounds[subject];
    const hidden = truth.filter((row) => row.Subject === subject && row.Year >= startYear);
    const frontYear = startYear + ((endYear - startYear) * clamp(progress, 0, 1));
    const shown = hidden.filter((row) => row.Year <= frontYear).map((row) => ({ Year: row.Year, Score: row.Score }));
    const samples = hidden.map((row) => ({ year: row.Year, value: row.Score }));
    if (shown.length === 0 || shown[shown.length - 1].Year < frontYear) {
      shown.push({ Year: frontYear, Score: interpolateAt(samples, frontYear) });
    }
    return {
      op: 'set-overlay',
      name: `truth-reveal-${subject}`,
      value: shown.length < 2 ? null : {
        mark: 'line',
        role: 'truth-reveal',
        data: { values: shown.map(overlayRow) },
        encodings: { x: { field: 'Year' }, y: { field: 'Score' }, order: { field: 'Year' } },
        style: { stroke: ink[subject], strokeWidth: 2.5 },
      },
    };
  });
  return { id: REVEAL_INTERACTION_ID, ops };
}

export function clearRevealUpdate(): ChartUpdate {
  return {
    id: REVEAL_INTERACTION_ID,
    ops: SUBJECTS.map((subject) => ({ op: 'set-overlay', name: `truth-reveal-${subject}`, value: null })),
  };
}
