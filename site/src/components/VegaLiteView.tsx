import { useEffect, useRef } from 'react';
import embed from 'vega-embed';
import { readCanvasFurniture } from 'flint-chart';
import type { View } from 'vega';

const SVG_NS = 'http://www.w3.org/2000/svg';

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
    const useRenderer = furniture.length ? 'svg' : renderer;
    embed(host, spec, { actions: false, renderer: useRenderer })
      .then((result) => {
        embeddedView = result.view;
        if (cancelled) {
          result.view.finalize();
          return;
        }
        const svgEl = host.querySelector('svg');
        if (!svgEl) return;
        if (furniture.length) {
          for (const it of furniture) {
            const rect = document.createElementNS(SVG_NS, 'rect');
            rect.setAttribute('x', String(it.x));
            rect.setAttribute('y', String(it.y));
            rect.setAttribute('width', String(it.width));
            rect.setAttribute('height', String(it.height));
            rect.setAttribute('fill', it.color);
            svgEl.appendChild(rect);
          }
        }
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
