import { useMemo } from 'react';
import type { TestCase } from 'flint-chart/test-data';
import { VegaLiteView } from './VegaLiteView';
import { EChartsView } from './EChartsView';
import { ChartjsView } from './ChartjsView';
import { PlotlyView } from './PlotlyView';
import { testCaseToAssemblyInput, thumbnailCanvasSize, withHouse, type CanvasSize } from '../shared/test-case-utils';
import { BACKENDS, type PreviewBackend } from '../shared/supported-backends';
import { siteTheme } from '../shared/theme';

/**
 * Renders a single chart for one backend at its *designed* size (no width
 * clamp), so the photo-wall's {@link ScaleToFit} wrapper can scale it down to
 * fit a uniform bounding box. Unlike {@link TripleChart} there is no backend
 * toggle or card chrome — just the chart (or a compact error message).
 */
export function WallChart({
  testCase,
  backend,
  canvasSize,
  chartPropertyOverrides,
  themeId,
}: {
  testCase: TestCase;
  backend: PreviewBackend;
  canvasSize?: CanvasSize;
  /**
   * Temporary chart-property overrides merged on top of the test case (e.g. the
   * gallery's dynamic options bar). Display only — not persisted.
   */
  chartPropertyOverrides?: Record<string, unknown>;
  /**
   * House to draw in, named by preset id. Only the Vega-Lite assembler reads
   * `theme_spec`, so it is left off elsewhere rather than passed and ignored.
   */
  themeId?: string;
}) {
  const input = useMemo(() => {
    const base = testCaseToAssemblyInput(testCase, canvasSize ?? thumbnailCanvasSize(testCase));
    const themed: any = withHouse(base, themeId && backend === 'vegalite' ? themeId : undefined);
    if (!chartPropertyOverrides || Object.keys(chartPropertyOverrides).length === 0) {
      return themed;
    }
    return {
      ...themed,
      chart_spec: {
        ...themed.chart_spec,
        chartProperties: { ...themed.chart_spec.chartProperties, ...chartPropertyOverrides },
      },
    };
  }, [testCase, canvasSize, chartPropertyOverrides, themeId, backend]);

  const compiled = useMemo(() => {
    try {
      return { ok: true as const, value: BACKENDS[backend].assemble(input) };
    } catch (err) {
      return { ok: false as const, err };
    }
  }, [input, backend]);

  if (!compiled.ok) {
    return (
      <pre
        style={{
          color: siteTheme.error,
          fontSize: 11,
          whiteSpace: 'pre-wrap',
          margin: 0,
          maxWidth: 360,
        }}
      >
        {String((compiled.err as Error)?.message ?? compiled.err)}
      </pre>
    );
  }

  if (backend === 'vegalite') return <VegaLiteView spec={compiled.value} />;
  if (backend === 'echarts') return <EChartsView option={compiled.value} constrain={false} />;
  if (backend === 'plotly') return <PlotlyView figure={compiled.value} constrain={false} />;
  return <ChartjsView config={compiled.value} constrain={false} />;
}
