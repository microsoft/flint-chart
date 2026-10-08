import type { ChartAssemblyInput } from 'flint-chart';
import { FlintView } from './FlintView';

interface InteractiveVegaLiteViewProps {
  input: ChartAssemblyInput;
  chartId?: string;
  ariaLabel?: string;
}

/** True when the input asks for behaviour, so the chart must mount through the interactive surface. */
export function hasInteractionEntries(input: unknown): boolean {
  const spec = (input as { interaction_spec?: { interactions?: unknown[] } } | null)?.interaction_spec;
  return Array.isArray(spec?.interactions) && spec.interactions.length > 0;
}

/** A Vega-Lite `FlintChart`, so `interaction_spec` takes effect, with its warnings and errors listed below. */
export function InteractiveVegaLiteView({ input, chartId, ariaLabel }: InteractiveVegaLiteViewProps) {
  return <FlintView spec={input} renderer="svg" chartId={chartId} ariaLabel={ariaLabel} showWarnings />;
}
