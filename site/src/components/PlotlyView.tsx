import { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';

const asFinite = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/**
 * Plotly renderer.
 *
 * The flint Plotly assembler computes a designed figure size (`_width`/`_height`,
 * also written into `layout.width`/`layout.height`). Render into a wrapper sized
 * to those dimensions so the plot keeps its designed proportions, the same way
 * the other backend views render at their natural designed size.
 */
export function PlotlyView({
  figure,
  height = 320,
  constrain = true,
}: {
  figure: any;
  height?: number;
  /** When false, render at the designed pixel size without clamping to the
   *  container width (used by the photo-wall, which scales charts to fit). */
  constrain?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const designedWidth = asFinite(figure?._width);
  const designedHeight = asFinite(figure?._height);
  const renderHeight = designedHeight ?? height;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    Plotly.newPlot(el, figure?.data ?? [], figure?.layout ?? {}, {
      displayModeBar: false,
      responsive: false,
    });
    return () => {
      Plotly.purge(el);
    };
  }, [figure]);

  return (
    <div
      style={{
        position: 'relative',
        width: designedWidth != null ? designedWidth : '100%',
        height: renderHeight,
        maxWidth: constrain ? '100%' : undefined,
        overflow: 'hidden',
      }}
    >
      <div ref={ref} />
    </div>
  );
}
