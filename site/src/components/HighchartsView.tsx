import { useEffect, useRef, useState } from 'react';
import Highcharts from 'highcharts';
import 'highcharts/highcharts-more';
import 'highcharts/modules/heatmap';
import 'highcharts/modules/sunburst';
import { siteTheme } from '../shared/theme';

const asFinite = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/**
 * Highcharts renderer.
 *
 * The flint Highcharts assembler designs a canvas (`_width`/`_height`) that
 * reserves gutters for axes and legends. Render into a wrapper sized to those
 * dimensions so the plot and legend keep their designed proportions — the
 * same way Vega-Lite, ECharts, and Chart.js render at their natural designed
 * size.
 *
 * Faceted charts (column/row encodings) are assembled into a `_facet` config
 * that holds a grid of per-panel Highcharts options instead of a single one.
 * Those are rendered by {@link HighchartsFacetView}; feeding the `_facet`
 * config straight to a single `Highcharts.chart(...)` produces an empty chart
 * because it has no top-level `chart`/`series`.
 */
export function HighchartsView({
  option,
  height = 320,
  constrain = true,
}: {
  option: any;
  height?: number;
  /** When false, render at the designed pixel size without clamping to the
   *  container width (used by the photo-wall, which scales charts to fit). */
  constrain?: boolean;
}) {
  if (option?._facet) {
    return <HighchartsFacetView option={option} constrain={constrain} />;
  }
  return <HighchartsSingleView option={option} height={height} constrain={constrain} />;
}

function HighchartsSingleView({
  option,
  height,
  constrain,
}: {
  option: any;
  height: number;
  constrain: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Highcharts.Chart | null>(null);
  const [error, setError] = useState<string | null>(null);

  const designedWidth = asFinite(option?._width);
  const designedHeight = asFinite(option?._height);
  const renderHeight = designedHeight ?? height;

  useEffect(() => {
    if (!ref.current) return;

    setError(null);
    try {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      chartRef.current = Highcharts.chart(ref.current, {
        ...option,
        chart: {
          ...(option?.chart ?? {}),
          width: designedWidth,
          height: renderHeight,
        },
      });
    } catch (err) {
      // Highcharts may leave partial markup in the container on failure;
      // clear it so the next chart starts clean.
      if (ref.current) ref.current.innerHTML = '';
      setError(String((err as Error)?.message ?? err));
    }
  }, [option, designedWidth, renderHeight]);

  useEffect(() => {
    const chart = chartRef.current;
    return () => {
      try {
        chart?.destroy();
      } catch {
        // A chart that failed to initialize can throw on destroy; unmount
        // must still complete.
      }
      chartRef.current = null;
    };
  }, []);

  if (error) {
    return (
      <pre style={{ color: siteTheme.error, fontSize: 11, whiteSpace: 'pre-wrap', margin: 0 }}>
        {error}
      </pre>
    );
  }

  return (
    <div
      ref={ref}
      style={{
        width: designedWidth != null ? designedWidth : '100%',
        height: renderHeight,
        maxWidth: constrain ? '100%' : undefined,
      }}
    />
  );
}

/** Render a `_facet` config: one Highcharts chart per panel in a CSS grid. */
function HighchartsFacetView({
  option,
  constrain,
}: {
  option: any;
  constrain: boolean;
}) {
  const panels: any[][] = option?._facetPanels ?? [];
  const rows = option?._facetRows ?? panels.length;
  const cols = option?._facetCols ?? Math.max(1, ...panels.map((r) => r.length));
  const gap = 16;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap,
        width: '100%',
      }}
    >
      {panels.flatMap((row, ri) =>
        row.map((panel, ci) => (
          <div
            key={`${ri}:${ci}`}
            style={{ minWidth: 0 }}
          >
            {panel.colVal != null && panel.colVal !== '' && (
              <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 2 }}>
                {panel.colVal}
              </div>
            )}
            {panel.rowVal != null && panel.rowVal !== '' && (
              <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 2 }}>
                {panel.rowVal}
              </div>
            )}
            <HighchartsView option={panel.option} constrain={constrain} />
          </div>
        )),
      )}
    </div>
  );
}
