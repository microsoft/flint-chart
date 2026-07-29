import { useEffect, useRef } from 'react';
import embed from 'vega-embed';

export function VegaLiteView({ spec, renderer = 'canvas' }: { spec: any; renderer?: 'canvas' | 'svg' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    embed(ref.current, spec, { actions: false, renderer }).catch((err) => {
      if (!cancelled) console.error('vega-embed failed', err);
    });
    return () => {
      cancelled = true;
    };
  }, [spec, renderer]);
  return <div ref={ref} />;
}
