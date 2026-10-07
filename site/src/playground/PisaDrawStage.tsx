import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  buildInteractiveChart,
  externalInteraction,
  lassoTrigger,
  type CanvasInteractionDef,
  type ChartUpdate,
  type InteractiveChartSurface,
} from 'flint-chart/interactive';
import pisa from '../data/pisa-oecd23-trends.json';
import { dateToYear, extendPath, type DrawnPath } from './you-draw-it-model';
import {
  DRAW_INTERACTION_ID,
  FOCUS_UPDATE_ID,
  PROMPT_UPDATE_ID,
  REVEAL_INTERACTION_ID,
  SUBJECTS,
  allDone,
  anchorPaths,
  boundsBySubject,
  clearRevealUpdate,
  describeSubjectScore,
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
  const input = useMemo(() => chartInput(theme, ink), [theme, ink]);
  const mountRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<InteractiveChartSurface | null>(null);
  const committedRef = useRef<PathsBySubject>(anchorPaths(BOUNDS));
  const activeRef = useRef<Subject | null>(null);
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

  const drawInteraction = useMemo<CanvasInteractionDef>(() => ({
    id: DRAW_INTERACTION_ID,
    eventSource: lassoTrigger('contain', false),
    affordances: { plot: { cursor: 'draw' } },
    handle(event): ChartUpdate | null {
      if (event.action !== 'select-lasso') return null;
      if (event.phase === 'start') return null;
      const subject = activeRef.current;
      const locked = phaseRef.current === 'revealing' || phaseRef.current === 'revealed';
      if (locked || !subject) {
        // Restate every retained line so the gesture's own preview cannot replace them.
        return event.phase === 'cancel' ? null : drawnLinesUpdate(committedRef.current, null, BOUNDS, ink, locked);
      }
      if (event.phase === 'cancel') {
        setPaths(committedRef.current);
        return null;
      }
      const candidates = candidatesFromDomainPoints(event.geometry.domain?.points);
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
  }), [ink]);

  const revealInteraction = useMemo(() => externalInteraction<RevealPayload>({
    id: REVEAL_INTERACTION_ID,
    handle({ progress }) {
      return revealUpdate(TRUTH_ROWS, BOUNDS, ink, progress);
    },
  }), [ink]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const surface = buildInteractiveChart(mount, input, {
      backend: 'vegalite',
      renderer: 'svg',
      interactions: [drawInteraction, revealInteraction],
      updates: [hideFutureUpdate(), promptUpdate(activeRef.current, BOUNDS, ink)],
      ariaLabel: 'You draw it: OECD-23 PISA scores after 2012',
      chartId: 'pisa-you-draw-it',
    });
    surfaceRef.current = surface;
    // A theme change remounts the chart; restate the retained state on it.
    void surface.ready.then(async () => {
      if (surfaceRef.current !== surface) return;
      if (activeRef.current) await surface.applyUpdate(focusUpdate(activeRef.current));
      const finished = phaseRef.current === 'revealed';
      await surface.applyUpdate(drawnLinesUpdate(committedRef.current, activeRef.current, BOUNDS, ink, finished));
      if (finished) {
        await surface.clearUpdate(hideFutureUpdate().id);
        await surface.clearUpdate(PROMPT_UPDATE_ID);
      }
    });
    return () => {
      surfaceRef.current = null;
      surface.destroy();
    };
  }, [drawInteraction, ink, input, revealInteraction]);

  const pickSubject = useCallback((subject: Subject) => {
    if (phaseRef.current === 'revealing' || phaseRef.current === 'revealed') return;
    activeRef.current = subject;
    setActive(subject);
    updatePhase('drawing');
    const surface = surfaceRef.current;
    if (!surface) return;
    void (async () => {
      await surface.applyUpdate(focusUpdate(subject));
      await surface.applyUpdate(promptUpdate(subject, BOUNDS, ink));
      await surface.applyUpdate(drawnLinesUpdate(committedRef.current, subject, BOUNDS, ink, false));
    })();
  }, [ink, updatePhase]);

  useEffect(() => {
    if (revealRun === 0 || revealRun === handledRevealRunRef.current) return undefined;
    handledRevealRunRef.current = revealRun;
    const surface = surfaceRef.current;
    if (!surface) return undefined;
    let cancelled = false;
    let frame = 0;
    const finishedPaths = committedRef.current;
    const nextScores = SUBJECTS.flatMap((subject) => {
      const score = scoreSubject(subject, finishedPaths[subject], TRUTH_ROWS, DRAW_START_YEAR);
      return score ? [score] : [];
    });
    const start = performance.now();
    activeRef.current = null;
    setActive(null);
    updatePhase('revealing');
    void (async () => {
      await surface.clearUpdate(FOCUS_UPDATE_ID);
      await surface.clearUpdate(PROMPT_UPDATE_ID);
      await surface.applyUpdate(drawnLinesUpdate(finishedPaths, null, BOUNDS, ink, true));
    })();

    const finish = async () => {
      await surface.dispatch(REVEAL_INTERACTION_ID, { progress: 1 });
      if (cancelled) return;
      // The real series take over from the overlay along the same path.
      await surface.clearUpdate(hideFutureUpdate().id);
      await surface.applyUpdate(clearRevealUpdate());
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
      await surface.dispatch(REVEAL_INTERACTION_ID, { progress });
      if (cancelled) return;
      frame = window.requestAnimationFrame((next) => void tick(next));
    };
    frame = window.requestAnimationFrame((time) => void tick(time));

    return () => {
      cancelled = true;
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [ink, revealRun, updatePhase]);

  const reset = () => {
    const surface = surfaceRef.current;
    committedRef.current = anchorPaths(BOUNDS);
    activeRef.current = null;
    setPaths(committedRef.current);
    setActive(null);
    setScores(null);
    updatePhase('pick');
    if (!surface) return;
    void (async () => {
      await surface.clearUpdate(DRAW_INTERACTION_ID);
      await surface.clearUpdate(REVEAL_INTERACTION_ID);
      await surface.clearUpdate(FOCUS_UPDATE_ID);
      await surface.applyUpdate(hideFutureUpdate());
      await surface.applyUpdate(promptUpdate(null, BOUNDS, ink));
    })();
  };

  const hint = (() => {
    switch (phase) {
      case 'pick':
        return 'Click a subject label to start. Each line is drawn on its own; the other two dim while you draw.';
      case 'drawing': {
        if (!active) return '';
        const { drawn, total } = drawnYears(paths[active], BOUNDS[active]);
        const left = SUBJECTS.filter((subject) => !subjectDone(paths[subject], BOUNDS[subject]) && subject !== active);
        const progress = drawn === total
          ? `${active} is complete.`
          : `${active}: ${drawn} of ${total} years drawn. Press right of ${DRAW_START_YEAR} and move across the years.`;
        const next = left.length > 0 ? ` Still to draw: ${left.join(', ')}.` : ' Finish this line to reveal the real scores.';
        return progress + next;
      }
      case 'revealing':
        return 'The real lines grow in through an external interaction, one frame at a time.';
      case 'revealed':
        return 'Reset hides the future rows again and clears your lines.';
    }
  })();

  return (
    <div className="pisa-draw">
      <div className="pisa-draw__chart">
        <div className="pisa-draw__mount" ref={mountRef} />
        <div className="pisa-draw__footer">
          <button type="button" className="ic-pill" onClick={reset}>Reset</button>
          <span className="pisa-draw__hint">{hint}</span>
        </div>
      </div>
      <aside className="pisa-draw__labels" aria-label="Subjects to draw">
        <h2>Draw a subject</h2>
        <ul>
          {SUBJECTS.map((subject) => {
            const done = subjectDone(paths[subject], BOUNDS[subject]);
            const { drawn, total } = drawnYears(paths[subject], BOUNDS[subject]);
            const score = scores?.find((entry) => entry.subject === subject);
            const status = score
              ? describeSubjectScore(score)
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
        {scores && (
          <p className="pisa-draw__summary">
            Mean error across the three subjects:{' '}
            {(scores.reduce((sum, score) => sum + score.meanAbsError, 0) / scores.length).toFixed(1)} points.
          </p>
        )}
      </aside>
    </div>
  );
}
