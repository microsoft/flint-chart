import { useCallback, useEffect, useState } from 'react';
import type { ChartAssemblyInput, ChartWarning } from 'flint-chart';
import { FlintChart, type FlintChartProps } from 'flint-chart/react';
import { siteTheme } from '../shared/theme';

interface FlintViewProps {
  spec: ChartAssemblyInput;
  backend?: FlintChartProps['backend'];
  renderer?: 'svg' | 'canvas';
  chartId?: string;
  ariaLabel?: string;
  /** List compile warnings under the chart. */
  showWarnings?: boolean;
  /** Smaller error text for thumbnails and walls. */
  compact?: boolean;
  /** Text shown before the error message. */
  errorPrefix?: string;
  onChange?: FlintChartProps['onChange'];
}

/** A `FlintChart` that shows its compile error (and optionally warnings) in place. */
export function FlintView({ spec, backend, renderer = 'canvas', chartId, ariaLabel, showWarnings = false, compact = false, errorPrefix, onChange }: FlintViewProps) {
  const [warnings, setWarnings] = useState<readonly ChartWarning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const onError = useCallback((err: Error) => setError(err.message), []);

  useEffect(() => {
    setWarnings([]);
    setError(null);
  }, [spec, backend]);

  return (
    <div>
      {!error && (
        <FlintChart
          spec={spec}
          backend={backend}
          renderer={renderer}
          chartId={chartId}
          ariaLabel={ariaLabel}
          onWarnings={showWarnings ? setWarnings : undefined}
          onError={onError}
          onChange={onChange}
        />
      )}
      {error && (
        <pre
          style={{
            color: siteTheme.error,
            fontSize: compact ? 11 : 12,
            whiteSpace: 'pre-wrap',
            margin: compact ? 0 : '8px 0 0',
            maxWidth: compact ? 360 : undefined,
          }}
        >
          {errorPrefix ? `${errorPrefix} ${error}` : error}
        </pre>
      )}
      {showWarnings && warnings.length > 0 && (
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
