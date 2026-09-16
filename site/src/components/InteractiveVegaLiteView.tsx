import { useEffect, useRef, useState } from 'react';
import type { ChartAssemblyInput, ChartWarning } from 'flint-chart';
import { buildInteractiveChart } from 'flint-chart/interactive';
import { siteTheme } from '../shared/theme';

interface InteractiveVegaLiteViewProps {
  input: ChartAssemblyInput;
  chartId?: string;
  ariaLabel?: string;
}

/** True when the input asks for behaviour, so the chart must mount through the interactive surface. */
export function hasInteractionEntries(input: unknown): boolean {
  const spec = (input as { interaction_spec?: { interactions?: unknown[] } } | null)?.interaction_spec;
  return Array.isArray(spec?.interactions) && spec.interactions.length > 0;
}

/** Mounts a Vega-Lite chart from its input through `buildInteractiveChart`, so `interaction_spec` takes effect. */
export function InteractiveVegaLiteView({ input, chartId, ariaLabel }: InteractiveVegaLiteViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [warnings, setWarnings] = useState<readonly ChartWarning[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let live = true;
    setWarnings([]);
    setError(null);
    let surface: ReturnType<typeof buildInteractiveChart>;
    try {
      surface = buildInteractiveChart(host, input, { backend: 'vegalite', renderer: 'svg', chartId, ariaLabel });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    void surface.warnings.then((list) => {
      if (live) setWarnings(list);
    });
    void surface.ready.catch((err) => {
      if (live) setError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      live = false;
      surface.destroy();
    };
  }, [input, chartId, ariaLabel]);

  return (
    <div>
      <div ref={ref} />
      {error && (
        <pre style={{ color: siteTheme.error, fontSize: 12, whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{error}</pre>
      )}
      {warnings.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: siteTheme.textMuted, fontSize: 12, lineHeight: 1.5 }}>
          {warnings.map((warning, index) => (
            <li key={index}>
              <strong style={{ color: warning.severity === 'error' ? siteTheme.error : siteTheme.text }}>{warning.severity}</strong>{' '}
              {warning.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
