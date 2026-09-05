import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { siteTheme } from '../shared/theme';

const asFinite = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

export function EChartsView({
  option,
  height,
  constrain = true,
}: {
  option: any;
  height?: number;
  /** When false, render at the designed pixel size without clamping to the
   *  container width (used by the photo-wall, which scales charts to fit). */
  constrain?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The assembler still designs a canvas (`_width`/`_height`). Categorical legends
  // are now `right`-anchored (issue #98) and survive container resize(); other
  // chrome (visualMap, rose, some radii) is still design-px. Render at the
  // designed size so those leftovers land where they were laid out.
  const designedWidth = asFinite(option?._width);
  const designedHeight = asFinite(option?._height);
  const renderHeight = designedHeight ?? height ?? 320;

  useEffect(() => {
    if (!ref.current) return;

    if (!chartRef.current) {
      chartRef.current = echarts.init(ref.current, undefined, {
        renderer: 'canvas',
        width: designedWidth,
        height: renderHeight,
      });
    } else {
      chartRef.current.resize({
        width: designedWidth ?? 'auto',
        height: renderHeight,
      });
    }

    setError(null);
    try {
      chartRef.current.setOption(option, { notMerge: true });
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    }
  }, [option, designedWidth, renderHeight]);

  useEffect(() => {
    const chart = chartRef.current;
    return () => {
      chart?.dispose();
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
};
