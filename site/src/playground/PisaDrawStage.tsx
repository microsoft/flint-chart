import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  externalInteraction,
  lassoTrigger,
  type CanvasInteractionDef,
  type ChartUpdate,
} from 'flint-chart/interactive';
import { FlintChart, type FlintChartHandle } from 'flint-chart/react';
import { ScaleToFit } from '../components/ScaleToFit';
import pisa from '../data/pisa-oecd23-trends.json';
import { dateToYear, extendPath, frontSample, type DrawnPath } from './you-draw-it-model';
import {
  DRAW_INTERACTION_ID,
  HIDE_UPDATE_ID,
  REVEAL_INTERACTION_ID,
  SUBJECTS,
  allDone,
  anchorPaths,
  boundsBySubject,
  clearRevealUpdate,
  drawnLinesUpdate,
  drawnYears,
  focusUpdate,
  hideFutureUpdate,
  promptUpdate,
  revealUpdate,
  scoreSubject,
  splitRows,
  subjectDone,
  type DrawPhase,
  type PathsBySubject,
  type Subject,
  type SubjectScore,
  type TrendRow,
} from './pisa-draw-model';
import './interaction-candidates.css';
import './pisa-draw-stage.css';

const DRAW_START_YEAR = 2012;
const SCORE_DOMAIN: readonly [number, number] = [450, 515];
const VIEW_SIZE = { width: 640, height: 420 };
const REVEAL_DURATION_MS = 1600;

const TRUTH_ROWS: TrendRow[] = pisa.average.map((row) => ({
  Year: row.Year,
  Subject: row.Subject as Subject,
  Score: row.Score,
}));
const CHART_ROWS = splitRows(TRUTH_ROWS, DRAW_START_YEAR);
const BOUNDS = boundsBySubject(TRUTH_ROWS, DRAW_START_YEAR, SCORE_DOMAIN);
const HIDE_FUTURE = hideFutureUpdate();
const FIRST_YEAR = Math.min(...TRUTH_ROWS.map((row) => row.Year));
/** How close, as a share of the plot, a stroke must start to a line's end to draw that line. */
const GRAB_DISTANCE = 0.05;

/** The subject whose line ends nearest the stroke's first point: its last drawn point or its anchor. */
function subjectAtStrokeStart(paths: PathsBySubject, start: { year: number; value: number }): Subject | null {
  let best: { subject: Subject; distance: number } | null = null;
  for (const subject of SUBJECTS) {
    const bounds = BOUNDS[subject];
    for (const end of [frontSample(paths[subject]), paths[subject].samples[0]]) {
      const dx = (start.year - end.year) / (bounds.endYear - FIRST_YEAR);
      const dy = (start.value - end.value) / (bounds.maxValue - bounds.minValue);
      const distance = Math.hypot(dx, dy);
      if (distance <= GRAB_DISTANCE && (!best || distance < best.distance)) best = { subject, distance };
    }
  }
  return best?.subject ?? null;
}

type ThemeChoice = 'economist' | 'default';
type RevealPayload = { progress: number };

interface PisaDrawStageProps {
  theme: ThemeChoice;
  ink: Readonly<Record<Subject, string>>;
}

function chartInput(theme: ThemeChoice, ink: Readonly<Record<Subject, string>>): ChartAssemblyInput {
  return {
    data: { values: CHART_ROWS },
    semantic_types: {
      Year: 'Year',
      Score: { semanticType: 'Quantity', intrinsicDomain: [...SCORE_DOMAIN] as [number, number] },
      Subject: 'Category',
      Segment: 'Category',
    },
    field_display_names: { Score: 'Average PISA score' },
    theme_spec: {
      ...(theme === 'economist' ? { extends: 'economist' } : {}),
      ink: { series: { categorical: [ink.Science, ink.Reading, ink.Mathematics] } },
      // The real lines carry the weight of the reader's dashed ones beside them.
      marks: { strokeWeight: 2.5 },
    },
    options: { addTooltips: false },
    chart_spec: {
      chartType: 'Line Chart',
      title: 'You draw it: PISA scores after 2012',
      subtitle: `OECD-23 countries, average PISA test scores. Draw each subject from ${DRAW_START_YEAR} to 2025.`,
      encodings: { x: 'Year', y: 'Score', color: 'Subject', detail: 'Segment' },
      baseSize: VIEW_SIZE,
      canvasSize: VIEW_SIZE,
      chartProperties: { includeZero_y: false, showPoints: true },
    },
  };
}

function candidatesFromDomainPoints(points: readonly { x?: unknown; y?: unknown }[] | undefined) {
  if (!points) return [];
  return points.flatMap((point) => {
    const year = point.x instanceof Date || typeof point.x === 'number' ? dateToYear(point.x) : Number.NaN;
    const value = Number(point.y);
    return Number.isFinite(year) && Number.isFinite(value) ? [{ year, value }] : [];
  });
}

export function PisaDrawStage({ theme, ink }: PisaDrawStageProps) {
  const spec = useMemo(() => chartInput(theme, ink), [theme, ink]);
  const chartRef = useRef<FlintChartHandle>(null);
  const committedRef = useRef<PathsBySubject>(anchorPaths(BOUNDS));
  const activeRef = useRef<Subject | null>(null);
  const strokeSubjectRef = useRef<Subject | null | undefined>(undefined);
  const phaseRef = useRef<DrawPhase>('pick');
  const [phase, setPhase] = useState<DrawPhase>('pick');
  const [active, setActive] = useState<Subject | null>(null);
  const [paths, setPaths] = useState<PathsBySubject>(committedRef.current);
  const [scores, setScores] = useState<SubjectScore[] | null>(null);
  const [revealRun, setRevealRun] = useState(0);
  const handledRevealRunRef = useRef(0);

  const updatePhase = useCallback((next: DrawPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const updateActive = useCallback((next: Subject | null) => {
    activeRef.current = next;
    setActive(next);
  }, []);

  const interactions = useMemo(() => {
    const draw: CanvasInteractionDef = {
      id: DRAW_INTERACTION_ID,
      eventSource: lassoTrigger('contain', false),
      affordances: { plot: { cursor: 'draw' } },
      handle(event): ChartUpdate | null {
        if (event.action !== 'select-lasso') return null;
        if (event.phase === 'start') return null;
        const locked = phaseRef.current === 'revealing' || phaseRef.current === 'revealed';
        const candidates = candidatesFromDomainPoints(event.geometry.domain?.points);
        // The stroke's first point decides its line: a line's end grabs it, anywhere else draws the picked subject.
        if (strokeSubjectRef.current === undefined && candidates.length > 0 && !locked) {
          const grabbed = subjectAtStrokeStart(committedRef.current, candidates[0]);
          if (grabbed && grabbed !== activeRef.current) {
            updateActive(grabbed);
            updatePhase('drawing');
          }
          strokeSubjectRef.current = grabbed ?? activeRef.current;
        }
        const subject = strokeSubjectRef.current ?? activeRef.current;
        // A lasso sends no start event, so the stroke's line is forgotten as it ends.
        if (event.phase === 'commit' || event.phase === 'cancel') strokeSubjectRef.current = undefined;
        if (locked || !subject) {
          // Restate every retained line so the gesture's own preview cannot replace them.
          return event.phase === 'cancel' ? null : drawnLinesUpdate(committedRef.current, null, BOUNDS, ink, locked);
        }
        if (event.phase === 'cancel') {
          setPaths(committedRef.current);
          return null;
        }
        if (candidates.length === 0) {
          return drawnLinesUpdate(committedRef.current, subject, BOUNDS, ink, false);
        }
        const nextPath: DrawnPath = extendPath(committedRef.current[subject], candidates, BOUNDS[subject]);
        const next: PathsBySubject = { ...committedRef.current, [subject]: nextPath };
        if (event.phase === 'commit') {
          committedRef.current = next;
          if (allDone(next, BOUNDS)) {
            // The third finished line starts the reveal from React.
            setRevealRun((run) => run + 1);
          }
        }
        setPaths(next);
        return drawnLinesUpdate(next, subject, BOUNDS, ink, false);
      },
    };
    const reveal = externalInteraction<RevealPayload>({
      id: REVEAL_INTERACTION_ID,
      handle({ progress }) {
        return revealUpdate(TRUTH_ROWS, BOUNDS, ink, progress);
      },
    });
    return [draw, reveal];
  }, [ink, updateActive, updatePhase]);

  // The host's layers: hidden future rows, then focus and prompt while drawing.
  const updates = useMemo(() => {
    if (phase === 'revealed') return [];
    if (phase === 'revealing') return [HIDE_FUTURE];
    return [HIDE_FUTURE, ...(active ? [focusUpdate(active)] : []), promptUpdate(active, BOUNDS, ink)];
  }, [phase, active, ink]);

  // The drawn lines belong to the draw interaction, and their style follows the
  // active subject, so restate them on each new chart (a theme change remounts)
  // and after each change of layers.
  const restateDrawnLines = useCallback(() => {
    const locked = phaseRef.current === 'revealing' || phaseRef.current === 'revealed';
    void chartRef.current?.applyUpdate(drawnLinesUpdate(committedRef.current, activeRef.current, BOUNDS, ink, locked));
  }, [ink]);

  const pickSubject = (subject: Subject) => {
    if (phaseRef.current === 'revealing' || phaseRef.current === 'revealed') return;
    updateActive(subject);
    updatePhase('drawing');
  };

  useEffect(() => {
    if (revealRun === 0 || revealRun === handledRevealRunRef.current) return undefined;
    handledRevealRunRef.current = revealRun;
    const chart = chartRef.current;
    if (!chart) return undefined;
    let cancelled = false;
    let frame = 0;
    const finishedPaths = committedRef.current;
    const nextScores = SUBJECTS.flatMap((subject) => {
      const score = scoreSubject(subject, finishedPaths[subject], TRUTH_ROWS, DRAW_START_YEAR);
      return score ? [score] : [];
    });
    const start = performance.now();
    updateActive(null);
    updatePhase('revealing');

    const finish = async () => {
      await chart.dispatch(REVEAL_INTERACTION_ID, { progress: 1 });
      if (cancelled) return;
      // The real series take over from the overlay along the same path: the
      // hide layer goes first, then the revealed layers drop it for good.
      await chart.clearUpdate(HIDE_UPDATE_ID);
      await chart.applyUpdate(clearRevealUpdate());
      if (cancelled) return;
      setScores(nextScores);
      updatePhase('revealed');
    };

    const tick = async (time: number) => {
      if (cancelled) return;
      const progress = Math.min(1, (time - start) / REVEAL_DURATION_MS);
      if (progress >= 1) {
        await finish();
        return;
      }
      await chart.dispatch(REVEAL_INTERACTION_ID, { progress });
      if (cancelled) return;
      frame = window.requestAnimationFrame((next) => void tick(next));
    };
    frame = window.requestAnimationFrame((time) => void tick(time));

    return () => {
      cancelled = true;
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [revealRun, updateActive, updatePhase]);

  const reset = () => {
    committedRef.current = anchorPaths(BOUNDS);
    setPaths(committedRef.current);
    updateActive(null);
    setScores(null);
    updatePhase('pick');
    void chartRef.current?.clearUpdate(DRAW_INTERACTION_ID);
    void chartRef.current?.clearUpdate(REVEAL_INTERACTION_ID);
  };


  return (
    <div className="pisa-draw">
      <div className="pisa-draw__chart">
        <ScaleToFit height={420} minHeight={300} maxScale={0.85} adaptiveHeight>
          <div className="pisa-draw__mount">
            <FlintChart
              ref={chartRef}
              spec={spec}
              interactions={interactions}
              updates={updates}
              renderer="svg"
              ariaLabel="You draw it: OECD-23 PISA scores after 2012"
              chartId="pisa-you-draw-it"
              onRender={restateDrawnLines}
            />
          </div>
        </ScaleToFit>
      </div>
      <aside className="pisa-draw__labels" aria-label="Subjects to draw">
        <h2>Draw a subject</h2>
        <ul>
          {SUBJECTS.map((subject) => {
            const done = subjectDone(paths[subject], BOUNDS[subject]);
            const { drawn, total } = drawnYears(paths[subject], BOUNDS[subject]);
            const score = scores?.find((entry) => entry.subject === subject);
            const status = score
              ? `${score.meanAbsError.toFixed(1)} points off`
              : done
                ? 'Complete'
                : drawn > 0
                  ? `${drawn} of ${total} years`
                  : 'Not drawn yet';
            return (
              <li key={subject}>
                <button
                  type="button"
                  className="pisa-draw__label"
                  data-active={active === subject}
                  data-done={done}
                  disabled={phase === 'revealing' || phase === 'revealed'}
                  onClick={() => pickSubject(subject)}
                  style={{ '--subject-ink': ink[subject] } as React.CSSProperties}
                >
                  <span className="pisa-draw__swatch" />
                  <strong>{subject}</strong>
                  <span className="pisa-draw__status">{status}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="pisa-draw__reset" onClick={reset} disabled={phase === 'pick'}>Reset</button>
      </aside>
    </div>
  );
}
