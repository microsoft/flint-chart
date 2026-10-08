import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import type {
  ChartChange,
  ChartUpdate,
  FlintInteractionEventDetail,
  InteractionDef,
  InteractiveChartSurface,
} from 'flint-chart/interactive';
import { FlintChart } from 'flint-chart/react';
import { expressionInterpreter } from 'vega-interpreter';
import { ScaleToFit } from '../components/ScaleToFit';
import type { InteractionDemoFixture } from './interaction-demo-data';

export interface DemoChartFit {
  /** Largest box height in px. */
  height: number;
  minHeight?: number;
  /** Largest scale applied to the chart's designed size. */
  maxScale: number;
}

/** When provided, every demo chart below shrinks to fit its panel instead of rendering at its designed size. */
export const DemoChartFitContext = createContext<DemoChartFit | null>(null);

// A page that takes the surface updates it, so the chart keeps its update runtime.
const NO_UPDATES: readonly ChartUpdate[] = [];

interface InteractionDemoChartProps {
  fixture: InteractionDemoFixture;
  interactions: readonly InteractionDef[];
  chartId: string;
  /** Host updates, applied by id: new or changed ids are applied, dropped ids are cleared. */
  updates?: readonly ChartUpdate[];
  onSurface?: (surface: InteractiveChartSurface | null) => void;
  /** The raw gesture record, before the chart reacts. */
  onSemanticEvent?: (detail: FlintInteractionEventDetail) => void;
  /** What the chart shows after each change. */
  onChange?: (change: ChartChange) => void;
}

export function InteractionDemoChart({
  fixture,
  interactions,
  chartId,
  updates,
  onSurface,
  onSemanticEvent,
  onChange,
}: InteractionDemoChartProps) {
  const fit = useContext(DemoChartFitContext);
  const current = useRef<InteractiveChartSurface | null>(null);
  const onSurfaceRef = useRef(onSurface);
  onSurfaceRef.current = onSurface;

  // FlintChart renders again after each host update; the page hears only a new surface.
  const onRender = useCallback((surface: InteractiveChartSurface) => {
    if (current.current === surface) return;
    current.current = surface;
    onSurfaceRef.current?.(surface);
  }, []);
  useEffect(() => () => {
    current.current = null;
    onSurfaceRef.current?.(null);
  }, []);

  const mount = (
    <FlintChart
      className="it-chart-mount"
      spec={fixture.input}
      interactions={interactions}
      updates={updates ?? (onSurface ? NO_UPDATES : undefined)}
      renderer="svg"
      expressionInterpreter={expressionInterpreter}
      chartId={chartId}
      ariaLabel={fixture.title}
      fit="none"
      onRender={onRender}
      onChange={onChange}
      onInteraction={onSemanticEvent}
      onError={(error) => console.error(`${chartId}:`, error)}
    />
  );
  if (!fit) return mount;
  return (
    <ScaleToFit height={fit.height} minHeight={fit.minHeight} maxScale={fit.maxScale} adaptiveHeight>
      {mount}
    </ScaleToFit>
  );
}
