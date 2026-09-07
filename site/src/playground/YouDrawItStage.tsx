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
  SCORE_UPDATE_ID,
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
  const input = useMemo(() => chartInput(), []);
  const mountRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<InteractiveChartSurface | null>(null);
  const committedPathRef = useRef<DrawnPath>(anchorPath(BOUNDS));
  const phaseRef = useRef<StagePhase>('idle');
  const [phase, setPhase] = useState<StagePhase>('idle');
  const [path, setPath] = useState<DrawnPath>(committedPathRef.current);
  const [score, setScore] = useState<GuessScore | null>(null);
  const [revealRun, setRevealRun] = useState(0);
  const handledRevealRunRef = useRef(0);

  const updatePhase = useCallback((next: StagePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const drawInteraction = useMemo<CanvasInteractionDef>(() => ({
    id: DRAW_INTERACTION_ID,
    eventSource: lassoTrigger('contain', false),
    affordances: [{ target: 'plot', cursor: 'draw' }],
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
  }), [updatePhase]);

  const revealInteraction = useMemo(() => externalInteraction<RevealPayload>({
    id: REVEAL_INTERACTION_ID,
    handle({ progress }) {
      return revealUpdate(COAL_SHARE_ROWS, BOUNDS, progress);
    },
  }), []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const surface = buildInteractiveChart(mount, input, {
      backend: 'vegalite',
      renderer: 'svg',
      interactions: [drawInteraction, revealInteraction],
      updates: [hideFutureUpdate(), promptUpdate(BOUNDS, true)],
      // The default dismiss policy drops every retained set-style op on a
      // click that hits no element, which would unhide the future rows.
      dismiss: false,
      ariaLabel: 'You draw it: share of U.S. electricity from coal',
      chartId: 'you-draw-it-coal',
    });
    surfaceRef.current = surface;
    return () => {
      surfaceRef.current = null;
      surface.destroy();
    };
  }, [drawInteraction, input, revealInteraction]);

  useEffect(() => {
    // Only the Finish button advances revealRun, and each run reveals once.
    // The ref guard keeps a remount (for example a dev hot reload) from
    // replaying the reveal.
    if (revealRun === 0 || revealRun === handledRevealRunRef.current) return undefined;
    if (phaseRef.current !== 'complete') return undefined;
    handledRevealRunRef.current = revealRun;
    const surface = surfaceRef.current;
    if (!surface) return undefined;
    let cancelled = false;
    let frame = 0;
    const finishedPath = committedPathRef.current;
    const drawnYearly = resampleYearly(finishedPath);
    const nextScore = scoreGuess(drawnYearly, COAL_SHARE_ROWS, BOUNDS.startYear);
    const start = performance.now();
    updatePhase('revealing');
    // Freeze the drawn line: dashed, no front marker.
    void surface.applyUpdate(drawnLineUpdate(finishedPath, true, BOUNDS));

    const finish = async () => {
      await surface.dispatch(REVEAL_INTERACTION_ID, { progress: 1 });
      if (cancelled) return;
      // The retained hide update goes away after the overlay covers the same
      // path, so the swap is invisible.
      await surface.clearUpdate(HIDE_UPDATE_ID);
      await surface.applyUpdate(clearRevealUpdate());
      if (nextScore) {
        const drawnEnd = finishedPath.samples[finishedPath.samples.length - 1].value;
        await surface.applyUpdate(scoreUpdate(nextScore, COAL_SHARE_ROWS, BOUNDS, drawnEnd));
      }
      if (cancelled) return;
      setScore(nextScore);
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
  }, [revealRun, updatePhase]);

  const finishDrawing = () => {
    if (phaseRef.current !== 'complete') return;
    setRevealRun((run) => run + 1);
  };

  const reset = () => {
    const surface = surfaceRef.current;
    committedPathRef.current = anchorPath(BOUNDS);
    setPath(committedPathRef.current);
    setScore(null);
    updatePhase('idle');
    if (!surface) return;
    void (async () => {
      await surface.clearUpdate(DRAW_INTERACTION_ID);
      await surface.clearUpdate(REVEAL_INTERACTION_ID);
      await surface.clearUpdate(SCORE_UPDATE_ID);
      await surface.applyUpdate(hideFutureUpdate());
      await surface.applyUpdate(promptUpdate(BOUNDS, true));
    })();
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
      <div className="ic-flint-dimpvis-panel">
        <ScaleToFit height={540} minHeight={400} adaptiveHeight padding={8}>
          <div className="ic-flint-dimpvis-mount" ref={mountRef} />
        </ScaleToFit>
      </div>
      <div className="ydi-stage__footer">
        <div className="ic-toolbar">
          <button
            type="button"
            className="ic-pill"
            data-active={phase === 'complete'}
            disabled={phase !== 'complete'}
            onClick={finishDrawing}
          >
            Finish drawing
          </button>
          <button type="button" className="ic-pill" onClick={reset}>Reset</button>
        </div>
        <span className="ydi-stage__hint">
          {progress ? `${progress} — ` : ''}
          {phase === 'revealed' && score ? describeScore(score).detail : phaseHint(phase, path)}
        </span>
      </div>
    </div>
  );
}
