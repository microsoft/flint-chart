import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, RotateCcw } from 'lucide-react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  externalInteraction,
  lassoTrigger,
  type CanvasInteractionDef,
  type ChartUpdate,
} from 'flint-chart/interactive';
import { FlintChart, type FlintChartHandle } from 'flint-chart/react';
import { ScaleToFit } from '../components/ScaleToFit';
import {
  COAL_SHARE_ROWS,
  DRAW_START_YEAR,
  SHARE_DOMAIN,
  YEAR_DOMAIN,
} from './you-draw-it-data';
import {
  DRAW_INTERACTION_ID,
  HIDE_UPDATE_ID,
  REVEAL_INTERACTION_ID,
  anchorPath,
  clearRevealUpdate,
  dateToYear,
  describeScore,
  drawBounds,
  drawnLineUpdate,
  extendPath,
  frontSample,
  hideFutureUpdate,
  isComplete,
  missingYears,
  promptUpdate,
  resampleYearly,
  revealUpdate,
  scoreGuess,
  scoreUpdate,
  splitRows,
  type DrawnPath,
  type GuessScore,
  type StagePhase,
} from './you-draw-it-model';
import './interaction-candidates.css';
import './you-draw-it-stage.css';

const VIEW_SIZE = { width: 900, height: 520 };
const REVEAL_DURATION_MS = 1400;
const BOUNDS = drawBounds(COAL_SHARE_ROWS, DRAW_START_YEAR, SHARE_DOMAIN);
const CHART_ROWS = splitRows(COAL_SHARE_ROWS, DRAW_START_YEAR);
const HIDE_FUTURE = hideFutureUpdate();
const PROMPT = promptUpdate(BOUNDS, true);

type RevealPayload = { progress: number };

function chartInput(): ChartAssemblyInput {
  return {
    data: { values: CHART_ROWS },
    semantic_types: {
      Year: 'Year',
      Share: { semanticType: 'Quantity', intrinsicDomain: [...SHARE_DOMAIN] as [number, number] },
      Segment: 'Category',
    },
    field_display_names: {
      Share: 'Share of net generation (%)',
    },
    theme_spec: {
      extends: 'datawrapper',
      legend: { show: 'never' },
      ink: { series: { categorical: ['#18a1cd', '#18a1cd'] } },
    },
    options: { addTooltips: false },
    chart_spec: {
      chartType: 'Line Chart',
      title: 'Share of U.S. electricity from coal',
      subtitle: `Percent of net generation, ${YEAR_DOMAIN[0]} to ${YEAR_DOMAIN[1]}. Draw where you think the line went after ${DRAW_START_YEAR}.`,
      encodings: { x: 'Year', y: 'Share', color: 'Segment' },
      baseSize: VIEW_SIZE,
      canvasSize: VIEW_SIZE,
      chartProperties: { includeZero_y: true, showPoints: false },
    },
  };
}

function candidatesFromDomainPoints(points: readonly { x?: unknown; y?: unknown }[] | undefined) {
  if (!points) return [];
  return points.flatMap((point) => {
    // The temporal x scale inverts to a Date; the model works in fractional years.
    const year = point.x instanceof Date || typeof point.x === 'number' ? dateToYear(point.x) : Number.NaN;
    const value = Number(point.y);
    return Number.isFinite(year) && Number.isFinite(value) ? [{ year, value }] : [];
  });
}

function phaseHint(phase: StagePhase, path: DrawnPath): string {
  switch (phase) {
    case 'idle':
      return `Press in the plot after ${DRAW_START_YEAR} and move across the years. Every year takes the value under the pointer; move back to redraw a part.`;
    case 'drawing': {
      const missing = missingYears(path, BOUNDS);
      const total = BOUNDS.endYear - BOUNDS.startYear;
      return `${total - missing.length} of ${total} years drawn. ${missing.length === 1 ? `Year ${missing[0]} is still empty.` : `Fill ${missing[0]} to ${missing[missing.length - 1]} to finish.`}`;
    }
    case 'complete':
      return `All ${BOUNDS.endYear - BOUNDS.startYear} years drawn. Click Finish drawing to reveal the real line, or keep redrawing.`;
    case 'revealing':
      return 'The real line grows in through an external interaction, one frame at a time.';
    case 'revealed':
      return 'Reset hides the future rows again and clears your line.';
  }
}

export function YouDrawItStage() {
  const spec = useMemo(() => chartInput(), []);
  const chartRef = useRef<FlintChartHandle>(null);
  const committedPathRef = useRef<DrawnPath>(anchorPath(BOUNDS));
  const phaseRef = useRef<StagePhase>('idle');
  const [phase, setPhase] = useState<StagePhase>('idle');
  const [path, setPath] = useState<DrawnPath>(committedPathRef.current);
  const [score, setScore] = useState<GuessScore | null>(null);
  const [scoreLayer, setScoreLayer] = useState<ChartUpdate | null>(null);
  const [revealRun, setRevealRun] = useState(0);
  const handledRevealRunRef = useRef(0);

  const updatePhase = useCallback((next: StagePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const interactions = useMemo(() => {
    const draw: CanvasInteractionDef = {
      id: DRAW_INTERACTION_ID,
      eventSource: lassoTrigger('contain', false),
      affordances: { plot: { cursor: 'draw' } },
      handle(event): ChartUpdate | null {
        if (event.action !== 'select-lasso') return null;
        if (event.phase === 'start') return null;
        if (phaseRef.current === 'revealing' || phaseRef.current === 'revealed') {
          // The region gesture parks its own selection preview under this
          // interaction id, so a stray stroke must restate the finished line
          // or the commit would promote that preview in its place.
          return event.phase === 'cancel' ? null : drawnLineUpdate(committedPathRef.current, true, BOUNDS);
        }
        if (event.phase === 'cancel') {
          setPath(committedPathRef.current);
          updatePhase(committedPathRef.current.samples.length > 1 ? 'drawing' : 'idle');
          return null;
        }
        const candidates = candidatesFromDomainPoints(event.geometry.domain?.points);
        if (candidates.length === 0) {
          // An empty commit (a click) still has to restate the retained line.
          return committedPathRef.current.samples.length > 1
            ? drawnLineUpdate(committedPathRef.current, false)
            : null;
        }
        // The polygon carries every point since the stroke began, so each
        // preview repaints from the last committed stroke.
        const next = extendPath(committedPathRef.current, candidates, BOUNDS);
        if (event.phase === 'commit') committedPathRef.current = next;
        setPath(next);
        // A complete line stays editable; only the Finish button reveals.
        updatePhase(isComplete(next, BOUNDS) ? 'complete' : 'drawing');
        return drawnLineUpdate(next, false, BOUNDS);
      },
    };
    const reveal = externalInteraction<RevealPayload>({
      id: REVEAL_INTERACTION_ID,
      handle({ progress }) {
        return revealUpdate(COAL_SHARE_ROWS, BOUNDS, progress);
      },
    });
    return [draw, reveal];
  }, [updatePhase]);

  // The host's layers: the future stays hidden until the reveal, then the score joins the prompt.
  const updates = useMemo(() => (
    phase === 'revealed' ? [PROMPT, ...(scoreLayer ? [scoreLayer] : [])] : [HIDE_FUTURE, PROMPT]
  ), [phase, scoreLayer]);

  useEffect(() => {
    // Only the Finish button advances revealRun, and each run reveals once.
    // The ref guard keeps a remount (for example a dev hot reload) from
    // replaying the reveal.
    if (revealRun === 0 || revealRun === handledRevealRunRef.current) return undefined;
    if (phaseRef.current !== 'complete') return undefined;
    handledRevealRunRef.current = revealRun;
    const chart = chartRef.current;
    if (!chart) return undefined;
    let cancelled = false;
    let frame = 0;
    const finishedPath = committedPathRef.current;
    const drawnYearly = resampleYearly(finishedPath);
    const nextScore = scoreGuess(drawnYearly, COAL_SHARE_ROWS, BOUNDS.startYear);
    const start = performance.now();
    updatePhase('revealing');
    // Freeze the drawn line: dashed, no front marker.
    void chart.applyUpdate(drawnLineUpdate(finishedPath, true, BOUNDS));

    const finish = async () => {
      await chart.dispatch(REVEAL_INTERACTION_ID, { progress: 1 });
      if (cancelled) return;
      // The hide layer goes before the overlay that covers the same path, so
      // the swap is invisible; the revealed layers then drop it for good.
      await chart.clearUpdate(HIDE_UPDATE_ID);
      await chart.applyUpdate(clearRevealUpdate());
      if (cancelled) return;
      const drawnEnd = finishedPath.samples[finishedPath.samples.length - 1].value;
      setScore(nextScore);
      setScoreLayer(nextScore ? scoreUpdate(nextScore, COAL_SHARE_ROWS, BOUNDS, drawnEnd) : null);
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
  }, [revealRun, updatePhase]);

  const finishDrawing = () => {
    if (phaseRef.current !== 'complete') return;
    setRevealRun((run) => run + 1);
  };

  const reset = () => {
    committedPathRef.current = anchorPath(BOUNDS);
    setPath(committedPathRef.current);
    setScore(null);
    setScoreLayer(null);
    updatePhase('idle');
    // The drawn line and the reveal belong to interactions, not to `updates`.
    void chartRef.current?.clearUpdate(DRAW_INTERACTION_ID);
    void chartRef.current?.clearUpdate(REVEAL_INTERACTION_ID);
  };

  const front = frontSample(path);
  const progress = phase === 'drawing' || phase === 'complete'
    ? `Last: ${front.year} · ${front.value.toFixed(1)}%`
    : phase === 'revealed' && score
      ? `Revealed · ${score.meanAbsError.toFixed(1)} pt mean error`
      : null;

  return (
    <div className="ic-flint-dimpvis-shell ydi-stage">
      <div className="ic-stage-meta">
        <strong>You draw it</strong>
        <span>
          The chart shows coal's share of U.S. generation up to {DRAW_START_YEAR}. Draw the rest of the line,
          then the real values appear and the chart scores your guess.
        </span>
      </div>
      <div className="ydi-stage__workspace">
        <div className="ic-flint-dimpvis-panel">
          <ScaleToFit height={540} adaptiveHeight padding={8}>
            <div className="ic-flint-dimpvis-mount">
              <FlintChart
                ref={chartRef}
                spec={spec}
                interactions={interactions}
                updates={updates}
                renderer="svg"
                ariaLabel="You draw it: share of U.S. electricity from coal"
                chartId="you-draw-it-coal"
              />
            </div>
          </ScaleToFit>
        </div>
        <aside className="ydi-stage__controls" aria-label="Prediction and comparison">
          <p className="ydi-stage__guidance">Draw your prediction of the share of U.S. electricity generated from coal after {DRAW_START_YEAR}, then compare it with the actual data.</p>
          <div className="ydi-stage__actions">
            <button
              type="button"
              className="ydi-stage__compare"
              disabled={phase !== 'complete'}
              onClick={finishDrawing}
            >
              <ArrowLeftRight size={14} aria-hidden="true" />Compare
            </button>
            <button type="button" className="ydi-stage__reset" onClick={reset}>
              <RotateCcw size={14} aria-hidden="true" />Reset
            </button>
          </div>
          <p className="ydi-stage__hint" role="status">
            {progress ? `${progress} — ` : ''}
            {phase === 'revealed' && score ? describeScore(score).detail : phaseHint(phase, path)}
          </p>
        </aside>
      </div>
    </div>
  );
}
