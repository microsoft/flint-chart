import { useEffect, useRef } from 'react';
import embed from 'vega-embed';
import { readCanvasFurniture } from 'flint-chart';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function VegaLiteView({ spec, renderer = 'canvas' }: { spec: any; renderer?: 'canvas' | 'svg' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const host = ref.current;
    let cancelled = false;
    // Canvas-anchored furniture (the Economist red tab) is drawn onto the SVG
    // after render — Vega-Lite cannot express it. That requires SVG output, so
    // a spec carrying furniture is forced to render as SVG regardless of the
    // requested renderer.
    const furniture = readCanvasFurniture(spec);
    const useRenderer = furniture.length ? 'svg' : renderer;
    embed(host, spec, { actions: false, renderer: useRenderer })
      .then(() => {
        if (cancelled || !furniture.length) return;
        const svgEl = host.querySelector('svg');
        if (!svgEl) return;
        for (const it of furniture) {
          const rect = document.createElementNS(SVG_NS, 'rect');
          rect.setAttribute('x', String(it.x));
          rect.setAttribute('y', String(it.y));
          rect.setAttribute('width', String(it.width));
          rect.setAttribute('height', String(it.height));
          rect.setAttribute('fill', it.color);
          svgEl.appendChild(rect);
        }
      })
      .catch((err) => {
        if (!cancelled) console.error('vega-embed failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [spec, renderer]);
  return <div ref={ref} />;
}
