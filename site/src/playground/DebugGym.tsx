import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { assembleECharts, assemblePlotly, assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import { mountChart, type ChartUpdate } from 'flint-chart/interactive';
import { genEChartsSlopeTests, TEST_GENERATORS } from 'flint-chart/test-data';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import { expressionInterpreter } from 'vega-interpreter';
import { EChartsView } from '../components/EChartsView';
import { ScaleToFit } from '../components/ScaleToFit';
import { FlintView } from '../components/FlintView';
import { testCaseToAssemblyInput, withHouse } from '../shared/test-case-utils';
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

const PICKING_CASES = [
  { id: 'scatter', generator: 'Scatter Plot', title: 'Palmer Penguins — flipper length vs body mass', mark: 'symbol',
    interactions: [{ type: 'click-highlight' }, { type: 'legend-toggle' }] },
  { id: 'faceted-line', generator: 'Omni: Line', title: undefined, mark: 'line',
    interactions: [{ type: 'hover-group-focus', options: { groupBy: 'gameType' } }] },
] as const;
const PICKING_THEMES = [undefined, 'economist'] as const;

/** Two rendering frames (layout observers have run), or half a second where frames don't come (a hidden tab). */
function settledFrames(): Promise<void> {
  return Promise.race([
    new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    new Promise<void>((resolve) => setTimeout(resolve, 500)),
  ]);
}

function pickingInput(caseId: string, themeId: string | undefined): ChartAssemblyInput {
  const pick = PICKING_CASES.find((item) => item.id === caseId)!;
  const cases = TEST_GENERATORS[pick.generator]();
  const testCase = (pick.title ? cases.find((item) => item.title === pick.title) : cases[0])!;
  const base = withHouse(testCaseToAssemblyInput(testCase, { width: 460, height: 320 }), themeId);
  return { ...base, interaction_spec: { interactions: pick.interactions } } as unknown as ChartAssemblyInput;
}

/** What the reader's pointer lands on over a data mark: the mark itself, or something drawn above it. */
function PickingCase({ caseId, themeId }: { caseId: string; themeId: string | undefined }) {
  const host = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{ passed: boolean; text: string } | null>(null);
  const mark = PICKING_CASES.find((item) => item.id === caseId)!.mark;

  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    let cancelled = false;
    let surface: ReturnType<typeof mountChart> | undefined;
    const run = async () => {
      surface = mountChart(container, pickingInput(caseId, themeId), {
        backend: 'vegalite', renderer: 'svg', expressionInterpreter,
      });
      await surface.ready;
      if (cancelled) return;
      const target = container.querySelector<SVGPathElement>(`.mark-${mark}.role-mark path`);
      if (!target) {
        setResult({ passed: false, text: `Fail: no .mark-${mark} element rendered` });
        return;
      }
      const card = container.closest('article');
      const probePoint = () => {
        // elementFromPoint only sees the viewport.
        target.scrollIntoView({ block: 'center' });
        const at = target.getPointAtLength(mark === 'line' ? target.getTotalLength() / 2 : 0);
        const box = target.getBoundingClientRect();
        const matrix = target.getScreenCTM()!;
        const point = mark === 'line'
          ? { x: matrix.a * at.x + matrix.c * at.y + matrix.e, y: matrix.b * at.x + matrix.d * at.y + matrix.f }
          : { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        const clip = container.closest('[style*="overflow: hidden"]')?.getBoundingClientRect();
        const inside = !clip || (point.x >= clip.left && point.x <= clip.right && point.y >= clip.top && point.y <= clip.bottom);
        return { point, inside };
      };
      // ScaleToFit shrinks the chart a few frames after it renders; until then it spills over the
      // neighbouring cards and the probe would land on their marks. Wait for it to fit.
      let probe = probePoint();
      for (let attempt = 0; !probe.inside && attempt < 30; attempt += 1) {
        await settledFrames();
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (cancelled) return;
        probe = probePoint();
      }
      if (!probe.inside) {
        setResult({ passed: false, text: `Info: the ${mark} probed stays outside the card's visible box (the chart was not scaled to fit; is the tab hidden?)` });
        return;
      }
      const { point } = probe;
      const top = document.elementFromPoint(point.x, point.y);
      const owner = top?.closest('g[class*="mark-"]');
      const elsewhere = top && card && !card.contains(top) ? ' (another card)' : '';
      const label = (owner?.getAttribute('class') ?? top?.tagName ?? 'nothing') + elsewhere;
      const passed = top === target || !!owner?.contains(target);
      setResult({ passed, text: passed
        ? `Pass: the pointer reaches the ${mark} mark`
        : `Fail: the pointer lands on "${label}" above the ${mark}` });
    };
    void run().catch(error => {
      if (!cancelled) setResult({ passed: false, text: `Fail: ${String(error)}` });
    });
    return () => {
      cancelled = true;
      surface?.destroy();
      container.replaceChildren();
    };
  }, [caseId, themeId, mark]);

  return (
    <article style={{ ...cardStyle, padding: 10 }} data-case={`picking-${caseId}-${themeId ?? 'plain'}`}>
      <h3 style={{ margin: '0 0 4px', fontSize: 13 }}>{caseId} · {themeId ?? 'no theme'}</h3>
      <ScaleToFit height={300} minHeight={200} adaptiveHeight>
        <div ref={host} />
      </ScaleToFit>
      <div role="status" style={{ marginTop: 6, fontSize: 12, color: result ? (result.passed ? '#16794b' : '#b42318') : siteTheme.textMuted }}>
        {result?.text ?? 'Probing pointer target...'}
      </div>
    </article>
  );
}

// The same drag, as fractions of the chart box, on every renderer.
const SELECT_DRAG = { from: { x: 0.3, y: 0.35 }, to: { x: 0.55, y: 0.65 } };

function selectInput(themeId: string | undefined): ChartAssemblyInput {
  const testCase = TEST_GENERATORS['Scatter Plot']()
    .find((item) => item.title === 'Palmer Penguins — flipper length vs body mass')!;
  const base = withHouse(testCaseToAssemblyInput(testCase, { width: 360, height: 280 }), themeId);
  return { ...base, interaction_spec: { interactions: [{ type: 'select' }] } } as ChartAssemblyInput;
}

async function dragSelect(container: HTMLElement, themeId: string | undefined, renderer: 'svg' | 'canvas') {
  const surface = mountChart(container, selectInput(themeId), { backend: 'vegalite', renderer, expressionInterpreter });
  await surface.ready;
  // The renderer's own element; overlays add other SVGs to the mount.
  const target = container.querySelector(renderer === 'svg' ? 'svg.marks' : 'canvas.marks') as Element;
  const box = target.getBoundingClientRect();
  const at = (point: { x: number; y: number }) => ({
    clientX: box.left + box.width * point.x, clientY: box.top + box.height * point.y,
    bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1,
  });
  target.dispatchEvent(new PointerEvent('pointerdown', at(SELECT_DRAG.from)));
  for (let step = 1; step <= 4; step += 1) {
    const t = step / 4;
    target.dispatchEvent(new PointerEvent('pointermove', at({
      x: SELECT_DRAG.from.x + (SELECT_DRAG.to.x - SELECT_DRAG.from.x) * t,
      y: SELECT_DRAG.from.y + (SELECT_DRAG.to.y - SELECT_DRAG.from.y) * t,
    })));
  }
  target.dispatchEvent(new PointerEvent('pointerup', { ...at(SELECT_DRAG.to), buttons: 0 }));
  await new Promise((resolve) => setTimeout(resolve, 300));
  const keys = (surface.getState()?.selected ?? [])
    .map((element) => `${element.value['Flipper length (mm)']}|${element.value['Body mass (g)']}`);
  return { surface, keys: new Set(keys) };
}

/** A drag selects by where the reader drew it; canvas must select what SVG (measured from its CTM) selects. */
function SelectAlignmentCase({ themeId }: { themeId: string | undefined }) {
  const svgHost = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{ passed: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!svgHost.current || !canvasHost.current) return;
    const hosts = [svgHost.current, canvasHost.current];
    let cancelled = false;
    const surfaces: { destroy(): void }[] = [];
    const run = async () => {
      const svg = await dragSelect(hosts[0], themeId, 'svg');
      surfaces.push(svg.surface);
      const canvas = await dragSelect(hosts[1], themeId, 'canvas');
      surfaces.push(canvas.surface);
      if (cancelled) return;
      const shared = [...svg.keys].filter((key) => canvas.keys.has(key)).length;
      const passed = svg.keys.size > 0 && shared === svg.keys.size && shared === canvas.keys.size;
      setResult({ passed, text: passed
        ? `Pass: both renderers select the same ${shared} points`
        : `Fail: SVG selects ${svg.keys.size}, canvas ${canvas.keys.size}, ${shared} in common` });
    };
    void run().catch(error => {
      if (!cancelled) setResult({ passed: false, text: `Fail: ${String(error)}` });
    });
    return () => {
      cancelled = true;
      for (const surface of surfaces) surface.destroy();
      for (const host of hosts) host.replaceChildren();
    };
  }, [themeId]);

  return (
    <article style={{ ...cardStyle, padding: 10 }} data-case={`select-alignment-${themeId ?? 'plain'}`}>
      <h3 style={{ margin: '0 0 4px', fontSize: 13 }}>select · {themeId ?? 'no theme'} · SVG | canvas</h3>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
        <div ref={svgHost} />
        <div ref={canvasHost} />
      </div>
      <div role="status" style={{ marginTop: 6, fontSize: 12, color: result ? (result.passed ? '#16794b' : '#b42318') : siteTheme.textMuted }}>
        {result?.text ?? 'Dragging...'}
      </div>
    </article>
  );
}

function SelectAlignmentGym() {
  return (
    <section style={{ width: 'min(100%, 1080px)' }} data-gym="select-alignment">
      <header style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Region select alignment</h2>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: siteTheme.textMuted }}>
          Under the Economist theme the landing showcase selects points offset from the drawn rectangle on the
          canvas renderer. Each card drags the same box across an SVG and a canvas mount at full size and compares
          the points each selects.
        </p>
      </header>
      <div style={{ display: 'grid', gap: 10 }}>
        {PICKING_THEMES.map((themeId) => <SelectAlignmentCase key={themeId ?? 'plain'} themeId={themeId} />)}
      </div>
    </section>
  );
}

function ThemePickingGym() {
  return (
    <section style={{ width: 'min(100%, 1080px)' }} data-gym="theme-picking">
      <header style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Theme pointer picking</h2>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: siteTheme.textMuted }}>
          Hover and click presets on the landing showcase stop responding under the Economist theme. Each card mounts
          the same interactive chart with and without the theme and reports which element sits under a data mark.
        </p>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 10 }}>
        {PICKING_CASES.flatMap((item) => PICKING_THEMES.map((themeId) => (
          <PickingCase key={`${item.id}-${themeId ?? 'plain'}`} caseId={item.id} themeId={themeId} />
        )))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 1.0.1 fixes
const LAB_ROWS = [
  { date: '2025-01-01', value: 4 }, { date: '2025-03-01', value: 7 }, { date: '2025-05-01', value: 3 },
  { date: '2025-07-01', value: 8 }, { date: '2025-09-01', value: 5 }, { date: '2025-11-01', value: 6 },
];
const CURVE_THEMES = [undefined, 'cartoon', 'de-stijl'] as const;
const CURVES = [undefined, 'linear', 'monotone', 'step-after'] as const;
/** What Plotly should draw: the chart's curve when it asks for one, else the theme's. */
const EXPECTED_SHAPE: Record<string, string> = { linear: 'linear', monotone: 'spline', 'step-after': 'hv' };
const THEME_SHAPE: Record<string, string> = { cartoon: 'spline', 'de-stijl': 'hv|vh|hvh', plain: 'linear' };

function curveInput(curve: string | undefined, theme: string | undefined): ChartAssemblyInput {
  return {
    data: { values: LAB_ROWS },
    semantic_types: { date: 'DateTime', value: 'Quantity' },
    chart_spec: {
      chartType: 'Line Chart',
      encodings: { x: 'date', y: 'value' },
      baseSize: { width: 240, height: 140 },
      ...(curve ? { chartProperties: { interpolate: curve } } : {}),
    },
    ...(theme ? { theme_spec: theme } : {}),
  } as ChartAssemblyInput;
}

function CurveCase({ curve, theme }: { curve: string | undefined; theme: string | undefined }) {
  const input = useMemo(() => curveInput(curve, theme), [curve, theme]);
  const shape = useMemo(() => String((assemblePlotly(input) as any).data?.[0]?.line?.shape ?? 'linear'), [input]);
  const expected = curve ? EXPECTED_SHAPE[curve] : THEME_SHAPE[theme ?? 'plain'];
  const passed = new RegExp(`^(${expected})$`).test(shape);
  return (
    <div style={{ border: `1px solid ${passed ? '#cfe3d4' : '#f0c8c8'}`, borderRadius: 6, padding: 8, background: '#fff' }}>
      <div style={{ fontSize: 11, marginBottom: 4 }}>
        <strong>{theme ?? 'no theme'}</strong> · interpolate: <code>{curve ?? '(unset)'}</code>
      </div>
      <ScaleToFit height={150} minHeight={110} adaptiveHeight padding={0}>
        <FlintView spec={input} backend="plotly" renderer="svg" compact />
      </ScaleToFit>
      <div style={{ fontSize: 11, marginTop: 4, color: passed ? '#1a7f37' : '#b42318' }}>
        line.shape <code>{shape}</code> {passed ? '✓' : `✗ expected ${expected}`}
      </div>
    </div>
  );
}

function PlotlyCurveGym() {
  return (
    <section style={{ width: 'min(100%, 1080px)' }} data-gym="plotly-curve">
      <header style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>#149 · Plotly keeps the chart&apos;s own curve under a theme</h2>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: siteTheme.textMuted }}>
          Before the fix, Cartoon (<code>monotone</code>) and De Stijl (<code>step</code>) bent an explicit{' '}
          <code>interpolate: &quot;linear&quot;</code> on Plotly. Now the chart&apos;s choice wins, and the theme&apos;s
          curve applies only in the first column, where the chart asks for none. Rows: theme; columns: the chart&apos;s
          interpolate. Each cell is drawn with Plotly and checks the compiled <code>line.shape</code>.
        </p>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        {CURVE_THEMES.flatMap((theme) => CURVES.map((curve) => (
          <CurveCase key={`${theme ?? 'plain'}-${curve ?? 'unset'}`} curve={curve} theme={theme} />
        )))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- canvas box
const NETFLIX_TITLES = [
  ['Back in Action', 164.7, 'Movies'], ['Adolescence: Limited Series', 144.8, 'Shows'],
  ['Squid Game: Season 2 // 오징어 게임: 시즌 2', 117.3, 'Shows'], ['STRAW', 102.9, 'Movies'],
  ['The Life List', 95.5, 'Movies'], ['Exterritorial', 87.5, 'Movies'], ['Havoc', 86.9, 'Movies'],
  ['Squid Game: Season 3 // 오징어 게임: 시즌 3', 71.5, 'Shows'], ['Zero Day: Limited Series', 61.3, 'Shows'],
  ['Missing You: Limited Series', 58, 'Shows'],
].map(([title, views, format]) => ({ title, views: (views as number) * 1e6, format }));
const BOX_THEMES = [undefined, 'datawrapper', 'nyt', 'economist', 'bbc'] as const;
const BOX_STRETCHES = [1.5, 2] as const;

function boxInput(theme: string | undefined, stretch: number): ChartAssemblyInput {
  return {
    data: { values: NETFLIX_TITLES },
    semantic_types: { title: 'Name', views: 'Count', format: 'Category' },
    chart_spec: {
      chartType: 'Bar Chart',
      encodings: {
        x: { field: 'views', type: 'quantitative' },
        y: { field: 'title', type: 'nominal', sortOrder: 'descending', sortBy: 'x' },
        color: { field: 'format' },
      },
      title: 'Most-viewed movies and show seasons, January–June 2025',
      subtitle: 'Top five per format; views are runtime-normalized viewing equivalents',
      baseSize: { width: 400, height: 300 },
      canvasSize: { width: 400 * stretch, height: 300 * stretch },
    },
    options: { maxStretch: stretch },
    ...(theme ? { theme_spec: theme } : {}),
  } as ChartAssemblyInput;
}

function BoxCase({ theme, stretch }: { theme: string | undefined; stretch: number }) {
  const input = useMemo(() => boxInput(theme, stretch), [theme, stretch]);
  const fit = useMemo(() => ((assembleVegaLite(input) as any)._theme?.report ?? []).find((note: any) => note.code === 'canvas-fit') ?? null, [input]);
  const box = { width: 400 * stretch, height: 300 * stretch };
  const host = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    // The chart mounts its SVG a few frames after this card renders.
    const timer = setInterval(() => {
      const svg = host.current?.querySelector('svg');
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      setDrawn((now) => (now && now.width === Math.round(rect.width) && now.height === Math.round(rect.height) ? now : { width: Math.round(rect.width), height: Math.round(rect.height) }));
    }, 250);
    return () => clearInterval(timer);
  }, [input]);
  // Judged as the canvas fit does: the host scales a drawing into its box, legibly down to 70%.
  const scale = drawn ? Math.min(1, box.width / drawn.width, box.height / drawn.height) : undefined;
  const verdict = scale === undefined ? undefined : scale >= 0.97 ? 'inside' : scale >= 0.7 ? 'scaled' : 'illegible';
  const ink = { inside: '#1a7f37', scaled: '#9a6700', illegible: '#b42318' } as const;
  return (
    <div style={{ border: `1px solid ${verdict === 'illegible' ? '#f0c8c8' : verdict === 'scaled' ? '#ead9a8' : '#cfe3d4'}`, borderRadius: 6, padding: 8, background: '#fff' }}>
      <div style={{ fontSize: 11, marginBottom: 6 }}>
        <strong>{theme ?? 'no theme'}</strong> · box {box.width} × {box.height} · drawn{' '}
        <code>{drawn ? `${drawn.width} × ${drawn.height}` : '…'}</code>{' '}
        {verdict ? <span style={{ color: ink[verdict] }}>{verdict === 'inside' ? '✓ inside' : verdict === 'scaled' ? `host scales to ${Math.round(scale! * 100)}%` : `✗ ${Math.round(scale! * 100)}%, past legibility`}</span> : null}
        {fit ? <div style={{ color: siteTheme.textMuted, marginTop: 2 }}>fit: {fit.message.replace(/^.*— laid out with /, '')}</div> : null}
      </div>
      {/* Drawn at its own size: the dashed frame is the canvas the host asked for. */}
      <div style={{ position: 'relative', width: box.width, minHeight: box.height }}>
        <div ref={host} style={{ position: 'relative', zIndex: 1 }}>
          <FlintView spec={input} renderer="svg" compact />
        </div>
        <div style={{ position: 'absolute', left: 0, top: 0, width: box.width, height: box.height, outline: '2px dashed #d93f0b', pointerEvents: 'none', zIndex: 2 }} />
      </div>
    </div>
  );
}

function CanvasBoxGym() {
  return (
    <section style={{ width: 'min(100%, 1720px)' }} data-gym="canvas-box">
      <header style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Canvas box · long row names under each house</h2>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: siteTheme.textMuted }}>
          Ten long titles, sorted by views and coloured by format, at base 400 × 300. Rows: the stretch the host
          allows (the canvas is base × stretch, the dashed frame); columns: the house. Each chart is drawn at its own
          size, never scaled to fit, so a chart past its frame shows as a host that does not scale would show it. The
          verdict is the canvas fit&apos;s: inside its box, or within what a host scales it to legibly (70%).
        </p>
      </header>
      {BOX_STRETCHES.map((stretch) => (
        <div key={stretch} style={{ display: 'flex', gap: 10, overflowX: 'auto', marginBottom: 10, alignItems: 'flex-start' }}>
          {BOX_THEMES.map((theme) => <BoxCase key={`${stretch}-${theme ?? 'plain'}`} theme={theme} stretch={stretch} />)}
        </div>
      ))}
    </section>
  );
}

/** Mirrors RESULT_COPY_LIMIT and fitsInResult in packages/flint-mcp/src/board.ts (which needs Node). */
const RESULT_COPY_LIMIT = 4096;
type CardCase = { id: string; label: string; rows: Record<string, unknown>[]; fromFile?: boolean };
const CARD_CASES: CardCase[] = [
  { id: 'small', label: 'Small chart, rows passed inline', rows: SPENDING_SAMPLE() },
  { id: 'large', label: '200 rows passed inline', rows: Array.from({ length: 200 }, (_, i) => ({ month: `M${i}`, value: (i * 37) % 101 })) },
  { id: 'file', label: 'Small chart, rows read from a local data.url file', rows: SPENDING_SAMPLE(), fromFile: true },
];
function SPENDING_SAMPLE() {
  return [{ month: 'Jan', value: 12 }, { month: 'Feb', value: 18 }, { month: 'Mar', value: 9 }, { month: 'Apr', value: 15 }];
}

function CardCaseView({ item }: { item: CardCase }) {
  const board = useMemo(() => ({
    id: `chart-${item.id}`, kind: 'chart',
    charts: [{
      id: 'chart',
      input: {
        data: { values: item.rows },
        semantic_types: { month: 'Category', value: 'Quantity' },
        chart_spec: { chartType: 'Bar Chart', encodings: { x: 'month', y: 'value' }, baseSize: { width: 260, height: 150 } },
      },
      ...(item.fromFile ? { fromFile: true } : {}),
    }],
  }), [item]);
  const bytes = new TextEncoder().encode(JSON.stringify(board)).length;
  const copied = !item.fromFile && bytes <= RESULT_COPY_LIMIT;
  // What the Agent Host hands a card it draws again: content and structuredContent, never _meta.
  const rebuilt: { structuredContent?: { flint?: { board?: typeof board } } } = copied ? { structuredContent: { flint: { board } } } : {};
  const drawn = rebuilt.structuredContent?.flint?.board;
  return (
    <div style={{ border: `1px solid ${drawn ? '#cfe3d4' : '#e6dcc4'}`, borderRadius: 6, padding: 8, background: '#fff' }}>
      <div style={{ fontSize: 11, marginBottom: 4 }}><strong>{item.label}</strong></div>
      <div style={{ fontSize: 11, color: siteTheme.textMuted, marginBottom: 6 }}>
        {bytes.toLocaleString()} bytes · structuredContent: <code>{copied ? 'yes' : 'no'}</code>
        {item.fromFile ? ' (file rows never enter the conversation)' : !copied ? ` (over ${RESULT_COPY_LIMIT} bytes)` : ''}
      </div>
      {drawn ? (
        <ScaleToFit height={160} minHeight={110} adaptiveHeight padding={0}>
          <FlintView spec={drawn.charts[0].input as ChartAssemblyInput} renderer="svg" compact />
        </ScaleToFit>
      ) : (
        <div style={{ height: 120, display: 'grid', placeItems: 'center', background: '#faf7f0', borderRadius: 4, fontSize: 12, color: '#7a5d1a', textAlign: 'center', padding: 8 }}>
          <div><strong>Not drawn</strong><br />Waits for the VS Code fix (microsoft/vscode#343243).</div>
        </div>
      )}
    </div>
  );
}

function McpRedrawGym() {
  return (
    <section style={{ width: 'min(100%, 1080px)' }} data-gym="mcp-redraw">
      <header style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>MCP · cards the Agent Host draws again</h2>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: siteTheme.textMuted }}>
          VS Code&apos;s Agent Host rebuilds a card&apos;s result from <code>content</code> and{' '}
          <code>structuredContent</code> and drops <code>_meta</code>, where <code>show</code> puts the chart. Now{' '}
          <code>show</code> also puts a small inline chart in <code>structuredContent</code>. Each card simulates that
          rebuilt result and the card&apos;s read path; the size and file rules mirror <code>fitsInResult</code> in{' '}
          <code>packages/flint-mcp/src/board.ts</code>.
        </p>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 10 }}>
        {CARD_CASES.map((item) => <CardCaseView key={item.id} item={item} />)}
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
      <CanvasBoxGym />
      <PlotlyCurveGym />
      <McpRedrawGym />
      <SlopeGym />
      <TemporalAxisGym />
      <TemporalValueGym />
      <ThemePickingGym />
      <SelectAlignmentGym />
    </div>
  );
}