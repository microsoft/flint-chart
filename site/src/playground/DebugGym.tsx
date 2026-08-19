import { useMemo, useState, type CSSProperties } from 'react';
import { assembleECharts, assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import { genEChartsSlopeTests } from 'flint-chart/test-data';
import { EChartsView } from '../components/EChartsView';
import { ScaleToFit } from '../components/ScaleToFit';
import { VegaLiteView } from '../components/VegaLiteView';
import { testCaseToAssemblyInput } from '../shared/test-case-utils';
import { siteTheme } from '../shared/theme';

const rows = [
  ['惠普', 2025, 49933.56], ['惠普', 2026, 30973.54],
  ['华为', 2025, 25407.73], ['华为', 2026, 14659.13],
  ['佳能', 2025, 14717.72], ['佳能', 2026, 5770.24],
  ['奔图', 2025, 6094.31], ['奔图', 2026, 2518.72],
  ['盈佳', 2025, 68500.12], ['盈佳', 2026, 63500.45],
  ['爱普生', 2025, 13120.44], ['爱普生', 2026, 8920.16],
].map(([品牌, 年度, 毛利]) => ({ 品牌, 年度, 毛利 }));

function makeInput(typed: boolean): ChartAssemblyInput {
  return {
    data: { values: rows },
    semantic_types: typed
      ? { 品牌: 'Category', 年度: 'Year', 毛利: 'Currency' }
      : { 品牌: 'Category', 毛利: 'Currency' },
    chart_spec: {
      chartType: 'Grouped Bar Chart',
      encodings: {
        x: { field: '品牌' },
        y: { field: '毛利' },
        group: { field: '年度' },
      },
      baseSize: { width: 400, height: 260 },
    },
  };
}

function findFieldEncoding(node: unknown, field: string): Record<string, any> | null {
  if (!node || typeof node !== 'object') return null;
  const record = node as Record<string, any>;
  for (const channel of ['color', 'fill', 'stroke']) {
    if (record.encoding?.[channel]?.field === field) return record.encoding[channel];
  }
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findFieldEncoding(item, field);
        if (found) return found;
      }
    } else {
      const found = findFieldEncoding(value, field);
      if (found) return found;
    }
  }
  return null;
}

function compileCase(typed: boolean) {
  try {
    const spec = assembleVegaLite(makeInput(typed)) as any;
    const color = findFieldEncoding(spec, '年度');
    const resolvedType = color?.type ?? 'not found';
    const legendKind = resolvedType === 'quantitative' || resolvedType === 'temporal'
      ? 'continuous gradient'
      : 'categorical swatches';
    return { spec, error: null as string | null, resolvedType, legendKind };
  } catch (error) {
    return {
      spec: null,
      error: String((error as Error)?.message ?? error),
      resolvedType: 'error',
      legendKind: 'error',
    };
  }
}

const cardStyle: CSSProperties = {
  minWidth: 0,
  border: `1px solid ${siteTheme.border}`,
  borderRadius: siteTheme.radius,
  background: siteTheme.surface,
  padding: 12,
};

function CasePanel({ typed }: { typed: boolean }) {
  const result = useMemo(() => compileCase(typed), [typed]);
  return (
    <article style={cardStyle}>
      <header style={{ marginBottom: 6 }}>
        <h2 style={{ margin: '0 0 2px', fontSize: 15 }}>
          {typed ? 'Year semantic type supplied' : 'Year semantic type missing'}
        </h2>
        <code style={{ fontSize: 11, color: siteTheme.textMuted }}>
          {typed ? 'semantic_types: { 年度: "Year" }' : 'semantic_types: { /* 年度 omitted */ }'}
        </code>
      </header>
      {result.error ? (
        <pre style={{ color: '#b42318', whiteSpace: 'pre-wrap' }}>{result.error}</pre>
      ) : (
        <ScaleToFit height={320} minHeight={220} adaptiveHeight>
          <VegaLiteView spec={result.spec} />
        </ScaleToFit>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 16px', marginTop: 6, fontSize: 12 }}>
        <span><span style={{ color: siteTheme.textMuted }}>Color type </span><code>{result.resolvedType}</code></span>
        <span><span style={{ color: siteTheme.textMuted }}>Legend </span>{result.legendKind}</span>
      </div>
    </article>
  );
}

const SLOPE_WIDTHS = [534, 800] as const;

function legendTitle(option: any): any {
  return (option.graphic ?? []).find(
    (item: any) => item?.type === 'text' && item?.style?.fontWeight === 'bold',
  );
}

function SlopeGym() {
  const [hostWidth, setHostWidth] = useState<(typeof SLOPE_WIDTHS)[number]>(800);
  const cases = useMemo(() => genEChartsSlopeTests().map((testCase) => {
    const input = testCaseToAssemblyInput(testCase, { width: 420, height: 280 });
    const option = assembleECharts(input) as any;
    return { testCase, option };
  }), []);

  return (
    <section style={{ width: 'min(100%, 1080px)' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>ECharts slope resize</h2>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: siteTheme.textMuted }}>
            Issue #98: the legend and its title stay pinned to the right gutter when the host resizes.
          </p>
        </div>
        <div role="group" aria-label="Slope chart host width" style={{ display: 'inline-flex', padding: 2, borderRadius: 7, background: siteTheme.hover }}>
          {SLOPE_WIDTHS.map((width) => (
            <button
              key={width}
              type="button"
              onClick={() => setHostWidth(width)}
              aria-pressed={hostWidth === width}
              style={{
                border: 0,
                borderRadius: 5,
                padding: '4px 9px',
                background: hostWidth === width ? siteTheme.surface : 'transparent',
                boxShadow: hostWidth === width ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
                color: siteTheme.text,
                font: 'inherit',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {width}px
            </button>
          ))}
        </div>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 10 }}>
        {cases.map(({ testCase, option }) => {
          const resized = { ...option, _width: hostWidth };
          const title = legendTitle(option);
          const anchored = option.legend?.right === 16
            && option.legend?.left == null
            && title?.right === 16
            && title?.left == null;
          return (
            <article key={testCase.title} style={{ ...cardStyle, padding: 10 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 13 }}>{testCase.title}</h3>
              <ScaleToFit height={250} minHeight={165} adaptiveHeight>
                <EChartsView option={resized} constrain={false} />
              </ScaleToFit>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4, fontSize: 11 }}>
                <span style={{ color: siteTheme.textMuted }}>Host <code>{hostWidth}px</code></span>
                <span style={{ color: anchored ? '#16794b' : '#b42318' }}>
                  {anchored ? 'right: 16 ✓' : 'anchor failed'}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function DebugGym() {
  return (
    <div className="dev-page" style={{ gap: 12 }}>
      <header className="dev-page-heading" style={{ width: 'min(100%, 1080px)' }}>
        <h1>Debug gym</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: siteTheme.textMuted }}>
          Same two-year data, one variable: <code>年度: Year</code> resolves to ordinal; an untyped numeric
          <code> 年度</code> remains quantitative.
        </p>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 12, width: 'min(100%, 1080px)' }}>
        <CasePanel typed />
        <CasePanel typed={false} />
      </div>
      <SlopeGym />
    </div>
  );
}