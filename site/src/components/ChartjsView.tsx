import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const asFinite = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/**
 * Renders a hand-built Chart.js config; Flint specs render through `FlintView`.
 *
 * The wrapper keeps the config's designed `_width`/`_height`: with `responsive: true`
 * Chart.js sizes the canvas from its parent, so an unbounded parent would grow it forever.
 */
export function ChartjsView({
  config,
  height = 320,
  constrain = true,
}: {
  config: any;
  height?: number;
  /** When false, render at the designed pixel size without clamping to the container width. */
  constrain?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  const designedWidth = asFinite(config?._width);
  const designedHeight = asFinite(config?._height);
  const renderHeight = designedHeight ?? height;

  useEffect(() => {
    if (!ref.current) return;
    const merged = {
      ...config,
      options: {
        ...(config?.options ?? {}),
        responsive: true,
        maintainAspectRatio: false,
      },
    };
    const chart = new Chart(ref.current, merged);
    return () => chart.destroy();
  }, [config]);

  return (
    <div
      style={{
        position: 'relative',
        width: designedWidth != null ? designedWidth : '100%',
        height: renderHeight,
        maxWidth: constrain ? '100%' : undefined,
      }}
    >
      <canvas ref={ref} />
    </div>
  );
}
