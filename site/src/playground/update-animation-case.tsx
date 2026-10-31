import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  filterControls,
  mountChart,
  type ChartChange,
  type InteractionDef,
  type InteractiveChartSurface,
} from 'flint-chart/interactive';

export type Renderer = 'svg' | 'canvas';

interface CaseChartProps {
  input: ChartAssemblyInput;
  interactions?: readonly InteractionDef[];
  duration: number;
  renderer: Renderer;
  onSurface: (surface: InteractiveChartSurface | null) => void;
  onChange: (change: ChartChange) => void;
}

export function CaseChart({ input, interactions, duration, renderer, onSurface, onChange }: CaseChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (!ref.current) return;
    const surface = mountChart(ref.current, input, {
      backend: 'vegalite',
      renderer,
      interactions,
      transition: { duration },
    });
    let live = true;
    const unsubscribe = surface.onChange((change) => onChangeRef.current(change));
    void surface.ready.then(() => { if (live) onSurface(surface); });
    return () => {
      live = false;
      unsubscribe();
      onSurface(null);
      surface.destroy();
    };
  }, [input, interactions, duration, renderer, onSurface]);
  return <div ref={ref} className="ua-mount" />;
}

export interface CaseProps {
  id: string;
  title: string;
  op: string;
  note: string;
  input: ChartAssemblyInput;
  interactions?: readonly InteractionDef[];
  duration: number;
  renderer: Renderer;
  controls?: (surface: InteractiveChartSurface) => ReactNode;
  wide?: boolean;
  onChange?: (change: ChartChange) => void;
}

export function Case({ id, title, op, note, input, interactions, duration, renderer, controls, wide, onChange }: CaseProps) {
  const [surface, setSurface] = useState<InteractiveChartSurface | null>(null);
  const onSurface = useCallback((next: InteractiveChartSurface | null) => {
    setSurface(next);
    const registry = window as unknown as { flintUpdateAnimation?: Record<string, InteractiveChartSurface | null> };
    registry.flintUpdateAnimation = { ...registry.flintUpdateAnimation, [id]: next };
  }, [id]);
  const [log, setLog] = useState<string[]>([]);
  const record = (change: ChartChange) => { onChange?.(change); setLog((lines) => [
    `${change.source} ${change.phase}${change.changed.length ? ` · ${change.changed.join(', ')}` : ''}`,
    ...lines,
  ].slice(0, 4)); };
  const latest = log[0];
  return (
    <article className={`cf-probe ua-case${wide ? ' cf-probe-wide' : ''}`} data-case={id}>
      <header className="cf-probe-header">
        <div>
          <h2>{title}</h2>
          {note && <p>{note}</p>}
          <code className="ua-op">{op}</code>
        </div>
        <span className={`cf-status${surface ? ' cf-status-ready' : ''}`} title={log.join('\n')}>
          {surface ? latest ?? 'Ready' : 'Loading'}
        </span>
      </header>
      <div className="cf-stage ua-stage">
        <CaseChart
          input={input}
          interactions={interactions}
          duration={duration}
          renderer={renderer}
          onSurface={onSurface}
          onChange={record}
        />
      </div>
      {controls && <div className="ua-controls">{surface ? controls(surface) : <span className="ua-wait">Mounting…</span>}</div>}
    </article>
  );
}

export function chart(
  chartType: string,
  title: string,
  values: Record<string, unknown>[],
  semanticTypes: Record<string, string>,
  encodings: Record<string, string>,
  width = 300,
  height = 200,
  chartProperties?: Record<string, unknown>,
): ChartAssemblyInput {
  return {
    data: { values },
    semantic_types: semanticTypes,
    chart_spec: { chartType, title, encodings, baseSize: { width, height }, ...(chartProperties ? { chartProperties } : {}) },
  } as ChartAssemblyInput;
}


export const where = (field: string, values: readonly unknown[]) => ({ select: { where: { [field]: { in: values } } } });

/** Every version's rows in one table, each tagged with its version under `field`. */
export const versions = (field: string, entries: readonly (readonly [string, readonly Record<string, unknown>[]])[]) =>
  entries.flatMap(([label, rows]) => rows.map((row) => ({ [field]: label, ...row })));

/** A dropdown under the chart that shows one version at a time. */
export const versionPicker = (field: string) => filterControls({ fields: [{ field, widget: 'select', all: false }] });
