import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import type { ChartChange } from 'flint-chart/interactive';
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
  drawBounds,
  drawnLineUpdate,
  extendPath,
  hideFutureUpdate,
  isComplete,
  promptUpdate,
  resampleYearly,
  revealUpdate,
  scoreGuess,
  scoreUpdate,
  splitRows,
  type DrawnPath,
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
      subtitle: `Percent of net generation, ${YEAR_DOMAIN[0]} to ${YEAR_DOMAIN[1]}. Draw where you think the line went after ${DRAW_START_YEAR}; double-click to start over`,
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

export function YouDrawItStage() {
  const spec = useMemo(() => chartInput(), []);
  const chartRef = useRef<FlintChartHandle>(null);
  const committedPathRef = useRef<DrawnPath>(anchorPath(BOUNDS));
  const phaseRef = useRef<StagePhase>('idle');
  const [phase, setPhase] = useState<StagePhase>('idle');
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
      reset: ['double-click'],
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
        const complete = isComplete(next, BOUNDS);
        updatePhase(complete ? 'complete' : 'drawing');
        // The stroke that fills the last year reveals the truth as it commits.
        if (complete && event.phase === 'commit') setRevealRun((run) => run + 1);
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
    // The completing stroke advances revealRun, and each run reveals once.
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

  const reset = useCallback(() => {
    committedPathRef.current = anchorPath(BOUNDS);
    setScoreLayer(null);
    updatePhase('idle');
    // The drawn line and the reveal belong to interactions, not to `updates`.
    void chartRef.current?.clearUpdate(DRAW_INTERACTION_ID);
    void chartRef.current?.clearUpdate(REVEAL_INTERACTION_ID);
  }, [updatePhase]);

  // A double-click is the draw definition's reset gesture; it reports as a reader commit with no interaction.
  const onChange = useCallback((change: ChartChange) => {
    if (change.source === 'reader' && change.phase === 'commit' && change.interactionId === undefined) reset();
  }, [reset]);

  return (
    <div className="ic-flint-dimpvis-shell ydi-stage">
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
              onChange={onChange}
            />
          </div>
        </ScaleToFit>
      </div>
    </div>
  );
}
