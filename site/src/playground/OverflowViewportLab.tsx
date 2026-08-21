import { useEffect, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import { buildInteractiveChart } from 'flint-chart/interactive';
import { expressionInterpreter } from 'vega-interpreter';
import { BACKENDS, getSupportedBackends, type PreviewBackend } from '../shared/supported-backends';
import './overflow-viewport-lab.css';

const categoryRows = Array.from({ length: 160 }, (_, index) => ({
  Category: `Studio ${String(index + 1).padStart(2, '0')}`,
  Gross: 18 + ((index * 47) % 83),
}));

const heatmapRows = Array.from({ length: 90 }, (_, row) =>
  Array.from({ length: 130 }, (_, column) => ({
    Product: `Product ${String(row + 1).padStart(2, '0')}`,
    Week: `W${String(column + 1).padStart(2, '0')}`,
    Activity: 20 + ((row * 31 + column * 17) % 80),
  })),
).flat();

const commonSizing = {
  baseSize: { width: 430, height: 300 },
  canvasSize: { width: 620, height: 420 },
};

const verticalInput: ChartAssemblyInput = {
  semantic_types: { Category: 'Category', Gross: 'Currency' },
  chart_spec: {
    chartType: 'Bar Chart',
    title: 'WW Gross by Studio',
    ...commonSizing,
    encodings: { x: 'Category', y: 'Gross' },
  },
  data: { values: categoryRows },
};

const horizontalInput: ChartAssemblyInput = {
  ...verticalInput,
  chart_spec: {
    ...verticalInput.chart_spec,
    encodings: { x: 'Gross', y: 'Category' },
  },
};

const heatmapInput: ChartAssemblyInput = {
  semantic_types: { Product: 'Category', Week: 'Category', Activity: 'Quantity' },
  chart_spec: {
    chartType: 'Heatmap',
    title: 'Product activity by week',
    ...commonSizing,
    encodings: { x: 'Week', y: 'Product', color: 'Activity' },
  },
  data: { values: heatmapRows },
};

function InteractiveBackendSurface({ input, backend, renderer = 'canvas' }: {
  input: ChartAssemblyInput;
  backend: PreviewBackend;
  renderer?: 'canvas' | 'svg';
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const surface = buildInteractiveChart(
      container,
      input,
      {
        backend,
        renderer,
        expressionInterpreter: backend === 'vegalite' ? expressionInterpreter : undefined,
        ariaLabel: input.chart_spec.title,
      },
    );
    void surface.ready.catch((error) => {
      container.textContent = error instanceof Error ? error.message : String(error);
    });
    return () => surface.destroy();
  }, [backend, input, renderer]);

  return <div className="ov-interactive-mount" ref={containerRef} />;
}

function BackendPicker({
  value,
  availableBackends,
  onChange,
}: {
  value: PreviewBackend;
  availableBackends: PreviewBackend[];
  onChange: (value: PreviewBackend) => void;
}) {
  return (
    <div className="ov-backends" role="group" aria-label="Chart backend">
      {availableBackends.map((backend) => (
        <button
          type="button"
          key={backend}
          className={backend === value ? 'active' : undefined}
          aria-pressed={backend === value}
          onClick={() => onChange(backend)}
        >
          {BACKENDS[backend].label}
        </button>
      ))}
    </div>
  );
}

function GeneralViewportDemo({
  input,
  initialBackend,
  description,
}: {
  input: ChartAssemblyInput;
  initialBackend: PreviewBackend;
  description: string;
}) {
  const [backend, setBackend] = useState<PreviewBackend>(initialBackend);
  const availableBackends = getSupportedBackends(input.chart_spec.chartType);

  useEffect(() => {
    if (!availableBackends.includes(backend)) {
      setBackend(availableBackends[0] ?? 'vegalite');
    }
  }, [availableBackends, backend]);

  return (
    <section className="ov-demo">
      <header className="ov-demo-header">
        <div>
          <h2>{input.chart_spec.title}</h2>
          <p>{description}</p>
        </div>
        <BackendPicker value={backend} availableBackends={availableBackends} onChange={setBackend} />
      </header>
      <div className="ov-stage ov-interactive-stage">
        <InteractiveBackendSurface input={input} backend={backend} />
      </div>
    </section>
  );
}

function McpViewportDemo() {
  return (
    <section className="ov-mcp">
      <header className="ov-mcp-titlebar">
        <strong>Flint chart</strong>
        <span>Flint-owned interactive surface</span>
        <span className="ov-live-status">Retained Vega renderer</span>
      </header>
      <div className="ov-mcp-chart">
        <InteractiveBackendSurface input={verticalInput} backend="vegalite" renderer="svg" />
      </div>
      <div className="ov-mcp-options" role="toolbar" aria-label="Chart options">
        <span className="ov-option-chip">Theme <strong>Default</strong></span>
        <span className="ov-option-note">View retained while dragging</span>
      </div>
    </section>
  );
}

export function OverflowViewportLab() {
  return (
    <div className="dev-page ov-page">
      <header className="dev-page-heading ov-heading">
        <h1>Overflow viewport lab</h1>
        <p>Category capacity becomes a navigable viewport only after the chart reaches its stretch ceiling and bands reach their normal minimum step. Static output still uses the first window; interactive hosts retain the complete ordered domain.</p>
      </header>

      <div className="ov-section-heading">
        <span>Retained MCP App path</span>
        <small>One Vega compile; slider movement updates the existing dataflow.</small>
      </div>
      <McpViewportDemo />

      <div className="ov-section-heading">
        <span>General host path</span>
        <small>The same core viewport plan drives every backend through ordinary assembly.</small>
      </div>
      <GeneralViewportDemo
        input={verticalInput}
        initialBackend="echarts"
        description="Categories run left to right; the viewport rail belongs below the plot."
      />
      <GeneralViewportDemo
        input={horizontalInput}
        initialBackend="chartjs"
        description="Categories run top to bottom; the viewport rail moves to the right edge."
      />
      <GeneralViewportDemo
        input={heatmapInput}
        initialBackend="vegalite"
        description="Two banded axes expose independent horizontal and vertical viewports."
      />
    </div>
  );
}