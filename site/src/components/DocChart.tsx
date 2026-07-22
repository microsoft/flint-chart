import { useMemo, type CSSProperties } from 'react';
import { TEST_GENERATORS } from 'flint-chart/test-data';
import { VegaLiteView } from './VegaLiteView';
import { EChartsView } from './EChartsView';
import { ChartjsView } from './ChartjsView';
import { PlotlyView } from './PlotlyView';
import { ScaleToFit } from './ScaleToFit';
import { testCaseToAssemblyInput, type CanvasSize } from '../shared/test-case-utils';
import { BACKENDS, type PreviewBackend } from '../shared/supported-backends';
import { siteTheme } from '../shared/theme';

type Row = Record<string, unknown>;

/** Fence body that pulls a ready-made example from the gallery test-data set
 *  instead of inlining a large `data.values` array. */
interface GeneratorSource {
  generator: string;
  index?: number;
  canvasSize?: CanvasSize;
  /** Merged onto the assembled input's `options` (e.g. `{ maxStretch: 1 }`). */
  options?: Record<string, unknown>;
}

function isGeneratorSource(v: unknown): v is GeneratorSource {
  return !!v && typeof v === 'object' && typeof (v as GeneratorSource).generator === 'string';
}


/**
 * Pre-aggregate `data.values` for any encoding that carries an `aggregate`.
 *
 * Flint's assemblers expect data to be *already aggregated* — an encoding's
 * `aggregate: "average"` only renames the channel's field to `value_average`
 * and assumes that column exists. The host (here, the doc renderer) is
 * responsible for collapsing raw rows into that pre-aggregated shape. We group
 * by every non-aggregated encoding field and emit one row per group with the
 * derived `field_op` columns (`_count` for `count`), matching the naming the
 * assemblers reference.
 */
function preAggregate(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const inp = input as { data?: { values?: Row[] }; chart_spec?: { encodings?: Record<string, { field?: string; aggregate?: string }> } };
  const encodings = inp.chart_spec?.encodings;
  const values = inp.data?.values;
  if (!encodings || !Array.isArray(values) || values.length === 0) return input;

  const encList = Object.values(encodings).filter((e): e is { field?: string; aggregate?: string } => !!e && typeof e === 'object');
  const aggEncodings = encList.filter(e => e.aggregate);
  if (aggEncodings.length === 0) return input;

  const groupFields = encList.filter(e => e.field && !e.aggregate).map(e => e.field as string);

  const reduce = (rows: Row[], field: string | undefined, op: string): number => {
    if (op === 'count') return rows.length;
    const nums = rows
      .map(r => (field ? r[field] : undefined))
      .filter((v): v is number => typeof v === 'number' && isFinite(v));
    if (nums.length === 0) return 0;
    const sum = nums.reduce((a, b) => a + b, 0);
    switch (op) {
      case 'sum': return sum;
      case 'min': return Math.min(...nums);
      case 'max': return Math.max(...nums);
      case 'median': {
        const s = [...nums].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
      }
      case 'average':
      case 'mean':
      default:
        return sum / nums.length;
    }
  };

  const groups = new Map<string, Row[]>();
  for (const r of values) {
    const key = groupFields.map(f => JSON.stringify(r[f])).join('\x00');
    let g = groups.get(key);
    if (!g) { g = []; groups.set(key, g); }
    g.push(r);
  }

  const newValues: Row[] = [];
  for (const rows of groups.values()) {
    const out: Row = {};
    for (const f of groupFields) out[f] = rows[0][f];
    for (const e of aggEncodings) {
      const op = e.aggregate as string;
      if (op === 'count' || !e.field) out['_count'] = rows.length;
      else out[`${e.field}_${op}`] = reduce(rows, e.field, op);
    }
    newValues.push(out);
  }

  return { ...inp, data: { ...inp.data, values: newValues } };
}

/**
 * Renders a chart inline inside a doc from a raw `ChartAssemblyInput` JSON
 * string (the body of a ```flint-chart fence). Lets tutorial example specs show
 * their actual output next to the JSON, instead of asking the reader to imagine
 * it. Errors (bad JSON or an unsupported chart type) render as a compact note
 * rather than crashing the page.
 */
export function DocChart({ source, backend = 'vegalite' }: { source: string; backend?: PreviewBackend }) {
  const result = useMemo(() => {
    let input: unknown;
    try {
      input = JSON.parse(source);
    } catch (err) {
      return { ok: false as const, err: `Invalid JSON: ${(err as Error).message}` };
    }
    try {
      // A `generator` reference pulls a colorful, multi-series example straight
      // from the gallery test-data set (e.g. the paper "Omni: Line" faceted
      // chart) without inlining hundreds of rows. These come pre-aggregated.
      if (isGeneratorSource(input)) {
        const gen = TEST_GENERATORS[input.generator];
        if (!gen) return { ok: false as const, err: `Unknown generator: ${input.generator}` };
        const cases = gen();
        const tc = cases[input.index ?? 0];
        if (!tc) return { ok: false as const, err: `No example at index ${input.index ?? 0} for ${input.generator}` };
        const base = testCaseToAssemblyInput(tc, input.canvasSize) as { options?: Record<string, unknown> };
        const prepared = input.options
          ? { ...base, options: { ...base.options, ...input.options } }
          : base;
        return { ok: true as const, kind: backend, value: BACKENDS[backend].assemble(prepared as never) };
      }
      const prepared = preAggregate(input);
      return { ok: true as const, kind: backend, value: BACKENDS[backend].assemble(prepared as never) };
    } catch (err) {
      return { ok: false as const, err: (err as Error)?.message ?? String(err) };
    }
  }, [source, backend]);

  if (!result.ok) {
    return (
      <div style={errorStyle}>
        <strong>Chart preview unavailable.</strong> {result.err}
      </div>
    );
  }

  return (
    <figure style={figureStyle}>
      <ScaleToFit height={560} adaptiveHeight>
        {result.kind === 'vegalite' && <VegaLiteView spec={result.value} />}
        {result.kind === 'echarts' && <EChartsView option={result.value} constrain={false} />}
        {result.kind === 'chartjs' && <ChartjsView config={result.value} constrain={false} />}
        {result.kind === 'plotly' && <PlotlyView figure={result.value} constrain={false} />}
      </ScaleToFit>
    </figure>
  );
}

const figureStyle: CSSProperties = {
  margin: '16px 0',
  padding: 16,
  border: `1px solid ${siteTheme.border}`,
  borderRadius: 10,
  background: '#fff',
  overflowX: 'auto',
};

const errorStyle: CSSProperties = {
  margin: '16px 0',
  padding: '10px 14px',
  border: `1px solid ${siteTheme.error}`,
  borderRadius: 8,
  color: siteTheme.error,
  fontSize: 13,
  background: 'rgba(197, 36, 54, 0.05)',
};
