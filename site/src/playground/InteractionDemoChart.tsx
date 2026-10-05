import { useEffect, useRef } from 'react';
import type {
  ChartChange,
  FlintInteractionEventDetail,
  InteractionDef,
  InteractiveChartSurface,
} from 'flint-chart/interactive';
import { buildInteractiveChart } from 'flint-chart/interactive';
import { expressionInterpreter } from 'vega-interpreter';
import type { InteractionDemoFixture } from './interaction-demo-data';

interface InteractionDemoChartProps {
  fixture: InteractionDemoFixture;
  interactions: readonly InteractionDef[];
  chartId: string;
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
  onSurface,
  onSemanticEvent,
  onChange,
}: InteractionDemoChartProps) {
  const mountRef = useRef<HTMLDivElement>(null);

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
  }, [chartId, fixture, interactions, onChange, onSemanticEvent, onSurface]);

  return <div className="it-chart-mount" ref={mountRef} />;
}
