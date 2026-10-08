import { createContext, forwardRef, useContext } from 'react';
import type {
  ChartChange,
  ChartUpdate,
  FlintInteractionEventDetail,
  InteractionDef,
  InteractiveChartSurface,
} from 'flint-chart/interactive';
import { FlintChart, type FlintChartHandle } from 'flint-chart/react';
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

interface InteractionDemoChartProps {
  fixture: InteractionDemoFixture;
  interactions: readonly InteractionDef[];
  chartId: string;
  /** Host updates, applied by id: new or changed ids are applied, dropped ids are cleared. */
  updates?: readonly ChartUpdate[];
  /** After each mount and each applied host update. */
  onRender?: (surface: InteractiveChartSurface) => void;
  /** The raw gesture record, before the chart reacts. */
  onSemanticEvent?: (detail: FlintInteractionEventDetail) => void;
  /** What the chart shows after each change. */
  onChange?: (change: ChartChange) => void;
}

export const InteractionDemoChart = forwardRef<FlintChartHandle, InteractionDemoChartProps>(function InteractionDemoChart({
  fixture,
  interactions,
  chartId,
  updates,
  onRender,
  onSemanticEvent,
  onChange,
}, ref) {
  const fit = useContext(DemoChartFitContext);
  const mount = (
    <FlintChart
      ref={ref}
      className="it-chart-mount"
      spec={fixture.input}
      interactions={interactions}
      updates={updates}
      renderer="svg"
      expressionInterpreter={expressionInterpreter}
      chartId={chartId}
      ariaLabel={fixture.title}
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
});
