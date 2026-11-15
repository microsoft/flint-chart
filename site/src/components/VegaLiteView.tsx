import { useEffect, useRef } from 'react';
import embed from 'vega-embed';
import { loader } from 'vega';
import { appendCanvasFurniture, enableGuideLabelTooltips, readCanvasFurniture, readCanvasPatterns, withBundledBoundaries } from 'flint-chart';
import type { View } from 'vega';


interface VegaLiteViewProps {
  spec: any;
  renderer?: 'canvas' | 'svg';
  onReady?: (svg: SVGSVGElement, view: View) => void | (() => void);
}

export function VegaLiteView({ spec, renderer = 'canvas', onReady }: VegaLiteViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const host = ref.current;
    let cancelled = false;
    let cleanupReady: void | (() => void);
    let embeddedView: View | undefined;
    // Canvas-anchored furniture (the Economist red tab) is drawn onto the SVG
    // after render — Vega-Lite cannot express it. That requires SVG output, so
    // a spec carrying furniture is forced to render as SVG regardless of the
    // requested renderer.
    const furniture = readCanvasFurniture(spec);
    const patterns = readCanvasPatterns(spec);
    const useRenderer = furniture.length || patterns.length ? 'svg' : renderer;
    embed(host, spec, {
      actions: false,
      renderer: useRenderer,
      patch: enableGuideLabelTooltips,
      loader: withBundledBoundaries(loader()),
    })
      .then((result) => {
        embeddedView = result.view;
        if (cancelled) {
          result.view.finalize();
          return;
        }
        const svgEl = host.querySelector('svg');
        if (!svgEl) return;
        // Rules on the canvas edge, figure labels, wordmarks and logos, sized to the rendered canvas.
        if (furniture.length || patterns.length) appendCanvasFurniture(svgEl as SVGSVGElement, furniture, patterns);
        cleanupReady = onReady?.(svgEl, result.view);
      })
      .catch((err) => {
        if (!cancelled) console.error('vega-embed failed', err);
      });
    return () => {
      cancelled = true;
      cleanupReady?.();
      embeddedView?.finalize();
    };
  }, [spec, renderer, onReady]);
  return <div ref={ref} />;
}
