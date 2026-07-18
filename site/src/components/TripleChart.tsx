import { useEffect, useMemo, useState } from 'react';
import type { TestCase } from 'flint-chart/test-data';
import { VegaLiteView } from './VegaLiteView';
import { EChartsView } from './EChartsView';
import { ChartjsView } from './ChartjsView';
import { PlotlyView } from './PlotlyView';
import { testCaseToAssemblyInput } from '../shared/test-case-utils';
import {
  BACKENDS,
  BACKEND_LABELS,
  getSupportedBackends,
  type PreviewBackend,
} from '../shared/supported-backends';
import { siteTheme } from '../shared/theme';

export function TripleChart({
  testCase,
  backend: forcedBackend,
}: {
  testCase: TestCase;
  backend?: PreviewBackend;
}) {
  const supportedBackends = useMemo(
    () => getSupportedBackends(testCase.chartType),
    [testCase.chartType],
  );
  const availableBackends = useMemo(
    () =>
      forcedBackend && supportedBackends.includes(forcedBackend)
        ? [forcedBackend]
        : supportedBackends,
    [forcedBackend, supportedBackends],
  );
  const [backend, setBackend] = useState<PreviewBackend>(() => availableBackends[0] ?? 'vegalite');

  useEffect(() => {
    setBackend((current) =>
      availableBackends.includes(current) ? current : (availableBackends[0] ?? 'vegalite'),
    );
  }, [availableBackends, testCase.chartType]);

  const input = useMemo(() => testCaseToAssemblyInput(testCase), [testCase]);

  const compiled = useMemo(() => {
    try {
      return { ok: true as const, value: BACKENDS[backend].assemble(input) };
    } catch (err) {
      return { ok: false as const, err };
    }
  }, [input, backend]);

  if (forcedBackend && !supportedBackends.includes(forcedBackend)) {
    return (
      <div
        style={{
          border: `1px solid ${siteTheme.border}`,
          borderRadius: siteTheme.radius,
          padding: 12,
          background: siteTheme.surface,
          minHeight: 280,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: siteTheme.textMuted,
          fontSize: 13,
        }}
      >
        {BACKEND_LABELS[forcedBackend]} does not support "{testCase.chartType}".
      </div>
    );
  }

  if (availableBackends.length === 0) {
    return (
      <div
        style={{
          border: `1px solid ${siteTheme.border}`,
          borderRadius: siteTheme.radius,
          padding: 12,
          background: siteTheme.surface,
          minHeight: 280,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: siteTheme.textMuted,
          fontSize: 13,
        }}
      >
        No rendering backend supports "{testCase.chartType}".
      </div>
    );
  }

  return (
    <div>
      {!forcedBackend && availableBackends.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {availableBackends.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => setBackend(candidate)}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                border: `1px solid ${siteTheme.borderMuted}`,
                borderRadius: 4,
                background: backend === candidate ? siteTheme.accentBg : siteTheme.surface,
                color: backend === candidate ? siteTheme.accent : siteTheme.textMuted,
                cursor: 'pointer',
                fontWeight: backend === candidate ? 600 : 400,
              }}
            >
              {BACKEND_LABELS[candidate]}
            </button>
          ))}
        </div>
      )}

      <div
        style={{
          border: `1px solid ${siteTheme.border}`,
          borderRadius: siteTheme.radius,
          padding: 12,
          background: siteTheme.surface,
          minHeight: 280,
        }}
      >
        {compiled.ok ? (
          <>
            {backend === 'vegalite' && <VegaLiteView spec={compiled.value} />}
            {backend === 'echarts' && <EChartsView option={compiled.value} height={320} />}
            {backend === 'chartjs' && <ChartjsView config={compiled.value} height={320} />}
            {backend === 'plotly' && <PlotlyView figure={compiled.value} height={320} />}
          </>
        ) : (
          <pre style={{ color: siteTheme.error, fontSize: 11, whiteSpace: 'pre-wrap', margin: 0 }}>
            {String((compiled.err as Error)?.message ?? compiled.err)}
          </pre>
        )}
      </div>
    </div>
  );
}
