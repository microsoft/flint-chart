import { useMemo } from 'react';
import type { ThemeSpec } from 'flint-chart';
import type { FlintChartProps } from 'flint-chart/react';
import type { TestCase } from 'flint-chart/test-data';
import { FlintView } from './FlintView';
import { testCaseToAssemblyInput, thumbnailCanvasSize, withHouse, type CanvasSize } from '../shared/test-case-utils';
import type { PreviewBackend } from '../shared/supported-backends';

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
  themeSpec,
  useThemeCanvas = false,
  headline,
  onChange,
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
  /** Inline custom house; takes precedence over `themeId`. */
  themeSpec?: ThemeSpec;
  /** Use the house/default native base size with the shared 720px ceiling. */
  useThemeCanvas?: boolean;
  /**
   * What the chart says, in words. Test cases carry a developer's name for the
   * case ("Phase 1 — Line: MAU trend…"), not a headline a reader would want, so
   * the caller supplies one where the chart is shown to readers.
   */
  headline?: { title?: string; subtitle?: string };
  onChange?: FlintChartProps['onChange'];
}) {
  const input = useMemo(() => {
    const base = testCaseToAssemblyInput(testCase, canvasSize ?? thumbnailCanvasSize(testCase));
    const themed: any = withHouse(
      base,
      backend === 'vegalite' ? (themeSpec ?? themeId) : undefined,
      useThemeCanvas && backend === 'vegalite',
    );
    const spec = {
      ...themed.chart_spec,
      ...(headline?.title ? { title: headline.title } : {}),
      ...(headline?.subtitle ? { subtitle: headline.subtitle } : {}),
      ...(chartPropertyOverrides && Object.keys(chartPropertyOverrides).length > 0
        ? { chartProperties: { ...themed.chart_spec.chartProperties, ...chartPropertyOverrides } }
        : {}),
    };
    return { ...themed, chart_spec: spec };
  }, [testCase, canvasSize, chartPropertyOverrides, themeId, themeSpec, useThemeCanvas, backend, headline?.title, headline?.subtitle]);

  return <FlintView spec={input} backend={backend} compact onChange={onChange} />;
}
