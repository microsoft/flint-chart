import { useEffect, useMemo, useState } from 'react';
import type { TestCase } from 'flint-chart/test-data';
import { FlintView } from './FlintView';
import { testCaseToAssemblyInput } from '../shared/test-case-utils';
import {
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
        <FlintView
          spec={input}
          backend={backend}
          renderer="svg"
          chartId={`triple-${testCase.chartType}`}
          showWarnings
        />
      </div>
    </div>
  );
}
