import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { assembleECharts, assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import { mountChart, type ChartUpdate } from 'flint-chart/interactive';
import { genEChartsSlopeTests } from 'flint-chart/test-data';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import { expressionInterpreter } from 'vega-interpreter';
import { EChartsView } from '../components/EChartsView';
import { ScaleToFit } from '../components/ScaleToFit';
import { FlintView } from '../components/FlintView';
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
  const input = makeInput(typed);
  try {
    // Compiled here only to read the color encoding's resolved type.
    const spec = assembleVegaLite(input) as any;
    const color = findFieldEncoding(spec, '年度');
    const resolvedType = color?.type ?? 'not found';
    const legendKind = resolvedType === 'quantitative' || resolvedType === 'temporal'
      ? 'continuous gradient'
      : 'categorical swatches';
    return { input, error: null as string | null, resolvedType, legendKind };
  } catch (error) {
    return {
      input,
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
          <FlintView spec={result.input} />
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

const SPENDING = [
  1.59, 1.64, 1.85, 1.78, 2.06, 2.27, 2.35, 2.44, 2.47, 2.55, 2.52, 2.73,
  2.71, 2.68, 2.85, 3.34, 3.10, 3.02, 3.08, 3.23, 3.32, 3.37, 3.19, 3.31,
  3.27, 3.27, 3.50, 3.80, 4.10, 4.55, 4.92, 5.37,
];

function spendingInput(chartType = 'Line Chart'): ChartAssemblyInput {
  return {
    data: { values: SPENDING.map((Spending, index) => ({
      Month: `${2024 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`,
      Spending,
    })) },
    semantic_types: { Month: 'YearMonth', Spending: 'Quantity' },
    field_display_names: { Spending: 'Spending ($ billions)' },
    chart_spec: {
      chartType,
      title: 'Data center construction spending has more than tripled since 2024',
      subtitle: 'United States, monthly construction spending on data centers, 2024 to 2026, billions of dollars',
      encodings: { x: 'Month', y: 'Spending' },
      baseSize: { width: 430, height: 270 },
    },
  };
}

function TemporalAxisGym() {
  const host = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{ passed: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    let cancelled = false;
    let surface: ReturnType<typeof mountChart> | undefined;
    let reference: View | undefined;
    const run = async () => {
      const input = spendingInput();
      reference = new View(parse(compile(assembleVegaLite(input) as any).spec), { renderer: 'none' });
      await reference.runAsync();
      if (cancelled) return;
      const expected: string[] = [];
      const labelKey = (item: any): string | null => item?.datum?.value instanceof Date
        && item.text && item.opacity !== 0
        ? `${Number(item.datum.value)}:${item.text}` : null;
      const visit = (node: any): void => {
        if (node?.role === 'axis-label') {
          for (const item of node.items ?? []) {
            const key = labelKey(item);
            if (key) expected.push(key);
          }
        }
        for (const item of node?.items ?? []) visit(item);
      };
      visit((reference.scenegraph() as any).root);
      reference.finalize();
      reference = undefined;
      surface = mountChart(container, input, {
        backend: 'vegalite', renderer: 'svg', expressionInterpreter,
      });
      await surface.ready;
      if (cancelled) return;
      const actual = Array.from(container.querySelectorAll('.role-axis-label text'),
        node => labelKey((node as any).__data__)).filter((key): key is string => key !== null);
      const passed = expected.length > 0 && JSON.stringify(actual) === JSON.stringify(expected);
      setResult({ passed, text: passed
        ? `Pass: ${actual.length} time labels match static Vega`
        : `Fail: ${actual.length} interactive / ${expected.length} static time labels` });
    };
    void run().catch(error => {
      if (!cancelled) setResult({ passed: false, text: `Fail: ${String(error)}` });
    });
    return () => {
      cancelled = true;
      reference?.finalize();
      surface?.destroy();
      container.replaceChildren();
    };
  }, []);

  return (
    <section style={{ width: 'min(100%, 1080px)' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Temporal axis interpreter</h2>
      <article style={{ ...cardStyle, maxWidth: 510 }} data-case="temporal-axis-interpreter">
        <ScaleToFit height={360} minHeight={220} adaptiveHeight>
          <div ref={host} />
        </ScaleToFit>
        <div role="status" style={{ marginTop: 6, fontSize: 12, color: result ? (result.passed ? '#16794b' : '#b42318') : siteTheme.textMuted }}>
          {result?.text ?? 'Checking time labels...'}
        </div>
      </article>
    </section>
  );
}

const TARGET_MONTH = Date.UTC(2025, 5, 1);

const KEY_VALUE_CASES = [
  { id: 'source-text', label: 'Source text', code: "key: { Month: '2025-06' }", month: '2025-06' },
  { id: 'local-time', label: 'Local time', code: 'key: { Month: new Date(2025, 5, 1) }', month: new Date(2025, 5, 1) },
  { id: 'utc-ms', label: 'UTC milliseconds', code: 'key: { Month: Date.UTC(2025, 5, 1) }', month: TARGET_MONTH },
] as const;

type KeyValueCase = (typeof KEY_VALUE_CASES)[number];

function describeKey(value: unknown): string {
  if (value instanceof Date) return `${value.getTime()} (${value.toISOString().slice(0, 16).replace('T', ' ')} UTC)`;
  if (typeof value === 'number') return `${value} (${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC)`;
  return JSON.stringify(value);
}

function TemporalKeyCase({ keyCase }: { keyCase: KeyValueCase }) {
  const host = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{ passed: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    let cancelled = false;
    let surface: ReturnType<typeof mountChart> | undefined;
    const update: ChartUpdate = {
      id: 'june',
      ops: [{
        op: 'set-style',
        targets: [{ select: { key: { Month: keyCase.month } } }],
        value: { state: 'emphasized' },
      }],
    };
    const run = async () => {
      surface = mountChart(container, spendingInput('Bar Chart'), {
        backend: 'vegalite', renderer: 'svg', expressionInterpreter,
      });
      await surface.ready;
      if (cancelled) return;
      const [outcome] = await surface.setUpdates([update]);
      if (cancelled) return;
      const selected = surface.getState()?.selected ?? [];
      const hit = selected.find((element) => toMs(element.value.Month) === TARGET_MONTH);
      const passed = outcome?.status === 'applied' && hit !== undefined;
      setResult({ passed, text: passed
        ? `Pass: ${outcome.resolvedTargets} target resolved, selected Month = ${describeKey(hit.value.Month)}`
        : `Fail: ${outcome?.status ?? 'no result'}, ${outcome?.unresolvedTargets.length ?? 1} target matched nothing, `
          + `rows hold ${describeKey(TARGET_MONTH)}` });
    };
    void run().catch(error => {
      if (!cancelled) setResult({ passed: false, text: `Fail: ${String(error)}` });
    });
    return () => {
      cancelled = true;
      surface?.destroy();
      container.replaceChildren();
    };
  }, [keyCase]);

  return (
    <article style={{ ...cardStyle, padding: 10 }} data-case={`temporal-key-${keyCase.id}`}>
      <h3 style={{ margin: '0 0 2px', fontSize: 13 }}>{keyCase.label}</h3>
      <code style={{ display: 'block', fontSize: 11, color: siteTheme.textMuted, marginBottom: 4 }}>{keyCase.code}</code>
      <ScaleToFit height={300} minHeight={200} adaptiveHeight>
        <div ref={host} />
      </ScaleToFit>
      <div role="status" style={{ marginTop: 6, fontSize: 12, color: result ? (result.passed ? '#16794b' : '#b42318') : siteTheme.textMuted }}>
        {result?.text ?? 'Applying update...'}
      </div>
    </article>
  );
}

function toMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value);
  return Number.NaN;
}

function TemporalValueGym() {
  return (
    <section style={{ width: 'min(100%, 1080px)' }} data-gym="temporal-values">
      <header style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Temporal update values</h2>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: siteTheme.textMuted }}>
          The same <code>set-style</code> emphasis on June 2025, keyed on the <code>Month</code> field in three value
          forms. The parsed rows hold UTC epoch milliseconds, so only the last form resolves; the local-time form
          misses by the browser's offset from UTC.
        </p>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 10 }}>
        {KEY_VALUE_CASES.map((keyCase) => (
          <TemporalKeyCase key={keyCase.id} keyCase={keyCase} />
        ))}
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
      <TemporalAxisGym />
      <TemporalValueGym />
    </div>
  );
}