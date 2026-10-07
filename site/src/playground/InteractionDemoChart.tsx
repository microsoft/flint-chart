import { createContext, useContext, useEffect, useRef } from 'react';
import type {
  ChartChange,
  ChartUpdate,
  FlintInteractionEventDetail,
  InteractionDef,
  InteractiveChartSurface,
} from 'flint-chart/interactive';
import { buildInteractiveChart } from 'flint-chart/interactive';
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
  /** Retained updates in place when the chart opens. Keep the array stable, or the chart remounts. */
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
  const mountRef = useRef<HTMLDivElement>(null);
  const fit = useContext(DemoChartFitContext);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const handleInteraction = (event: Event) => {
      onSemanticEvent?.((event as CustomEvent<FlintInteractionEventDetail>).detail);
    };
    mount.addEventListener('flint-interaction', handleInteraction);
    const surface = buildInteractiveChart(mount, fixture.input, {
      backend: 'vegalite',
      renderer: 'svg',
      interactions,
      chartId,
      updates,
      expressionInterpreter,
      ariaLabel: fixture.title,
    });
    onSurface?.(surface);
    const unsubscribe = onChange ? surface.onChange(onChange) : undefined;
    void surface.ready.catch((error) => {
      mount.textContent = error instanceof Error ? error.message : String(error);
    });
    return () => {
      onSurface?.(null);
      unsubscribe?.();
      mount.removeEventListener('flint-interaction', handleInteraction);
      surface.destroy();
    };
  }, [chartId, fixture, interactions, onChange, onSemanticEvent, onSurface, updates]);

  const mount = <div className="it-chart-mount" ref={mountRef} />;
  if (!fit) return mount;
  return (
    <ScaleToFit height={fit.height} minHeight={fit.minHeight} maxScale={fit.maxScale} adaptiveHeight>
      {mount}
    </ScaleToFit>
  );
}
