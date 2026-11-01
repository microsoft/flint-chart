import { useCallback, useMemo, useState } from 'react';
import { piecewise, interpolateLab } from 'd3';
import { scheme as vegaScheme } from 'vega';
import { assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import { VegaLiteView } from '../../components/VegaLiteView';
import { CASES, type BinningCase } from './cases';
import { STRATEGIES, decimalsOf, score, type Binning, type Strategy } from './strategies';
import './binning-lab.css';

/**
 * How a continuous colour scale is cut into stepped classes, and what each way of cutting costs.
 * "Flint today" is the compiled chart as it ships; every other panel is the same compiled chart
 * with only its colour scale replaced by a threshold scale at the strategy's breaks, so the panels
 * differ in nothing but the binning.
 */

const THEMES = [
  { id: 'pop', label: 'Pop (quantize 5)' },
  { id: 'swiss', label: 'Swiss (quantize 5)' },
  { id: 'cartoon', label: 'Cartoon (quantize 5)' },
  { id: 'de-stijl', label: 'De Stijl (quantize 5)' },
  { id: '', label: 'Unthemed + author bins' },
];

const SIZES = [
  { key: 's', label: 'Small 420×300', width: 420, height: 300 },
  { key: 'm', label: 'Medium 560×360', width: 560, height: 360 },
];

type Spec = Record<string, any>;

/** The input as an author would write it: the theme's own bins, or `bins` on the colour encoding without one. */
function inputOf(c: BinningCase, theme: string, classes: number, size: { width: number; height: number }): ChartAssemblyInput {
  return {
    data: { values: c.values },
    semantic_types: c.semantic,
    chart_spec: {
      chartType: 'Heatmap',
      title: c.title,
      ...(c.subtitle ? { subtitle: c.subtitle } : {}),
      encodings: { x: c.x, y: c.y, color: theme ? c.color : { field: c.color, bins: classes } },
      canvasSize: size,
    },
    ...(theme ? { theme_spec: theme } : {}),
  } as unknown as ChartAssemblyInput;
}

/** Every encoding on the colour field: the drawn fill, and the label ink scale that reads the same ramp. */
function colorEncodings(spec: Spec, field: string): { fill: Spec[]; ink: Spec[] } {
  const fill: Spec[] = [];
  const ink: Spec[] = [];
  const visit = (node: Spec | undefined) => {
    if (!node || typeof node !== 'object') return;
    const enc = node.encoding?.color;
    if (enc?.field === field) (enc.legend === null ? ink : fill).push(enc);
    for (const key of ['layer', 'hconcat', 'vconcat', 'concat'] as const) (node[key] ?? []).forEach(visit);
    if (node.spec) visit(node.spec);
  };
  visit(spec);
  return { fill, ink };
}

/** The ramp the compiled scale paints with, low to high. */
function rampOf(scale: Spec): string[] {
  if (Array.isArray(scale?.range) && scale.range.length >= 2) return scale.range;
  const name = typeof scale?.scheme === 'string' ? scale.scheme : scale?.scheme?.name;
  const found = name ? vegaScheme(name) : undefined;
  const stops = typeof found === 'function' ? Array.from({ length: 9 }, (_, i) => found(i / 8)) : Array.isArray(found) ? found : ['#f7fbff', '#08306b'];
  return scale?.reverse ? [...stops].reverse() : stops;
}

/**
 * One colour per class from the ramp. A diverging binning keeps equal colour steps per class on both
 * arms: the ramp is cut for the longer arm on each side, and the shorter arm takes its light end.
 */
function classColors(ramp: string[], binning: Binning): string[] {
  const at = piecewise(interpolateLab, ramp);
  const k = binning.breaks.length + 1;
  if (binning.below !== undefined && binning.above !== undefined && !binning.neutral) {
    const side = Math.max(binning.below, binning.above);
    const all = Array.from({ length: 2 * side }, (_, i) => at((i + 0.5) / (2 * side)));
    return all.slice(side - binning.below, side + binning.above);
  }
  return Array.from({ length: k }, (_, i) => at(k === 1 ? 0.5 : i / (k - 1)));
}

const luminance = (hex: string) => {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const toHex = (color: string) => {
  const m = /rgb\((\d+), ?(\d+), ?(\d+)\)/.exec(color);
  return m ? `#${m.slice(1).map((v) => Number(v).toString(16).padStart(2, '0')).join('')}` : color;
};

/** A label format exact for the breaks, kept a percentage where the field prints as one. */
function exactFormat(legend: Spec | undefined, breaks: number[]): string {
  const decimals = Math.max(...breaks.map(decimalsOf));
  return typeof legend?.format === 'string' && legend.format.includes('%')
    ? `.${Math.max(0, decimals - 2)}~%`
    : `,.${decimals}~f`;
}

/** The compiled chart with its colour scale replaced by a threshold scale at the binning's breaks. */
function withBinning(compiled: Spec, field: string, binning: Binning): Spec {
  // The compiled spec carries interaction handlers Vega-Lite never reads; a JSON copy drops them.
  const spec = JSON.parse(JSON.stringify(compiled)) as Spec;
  const { fill, ink } = colorEncodings(spec, field);
  const ramp = rampOf(fill[0]?.scale);
  const colors = classColors(ramp, binning).map(toHex);
  for (const enc of fill) {
    enc.scale = { type: 'threshold', domain: binning.breaks, range: colors };
    const { labelExpr: _labelExpr, values: _values, ...legend } = enc.legend ?? {};
    enc.legend = { ...legend, format: exactFormat(enc.legend, binning.breaks) };
  }
  for (const enc of ink) enc.scale = { type: 'threshold', domain: binning.breaks, range: colors.map((c) => (luminance(c) > 0.35 ? '#222222' : '#ffffff')) };
  return spec;
}

/** The binning the compiled chart ships with, read from its own colour scale. */
function shippedBinning(compiled: Spec, field: string, values: number[]): Binning | undefined {
  const scale = colorEncodings(compiled, field).fill[0]?.scale;
  if (!scale) return undefined;
  if (scale.type === 'threshold' && Array.isArray(scale.domain)) {
    const breaks: number[] = scale.domain;
    const step = breaks.length > 1 ? breaks[1] - breaks[0] : undefined;
    const even = step !== undefined && breaks.every((b, i) => i === 0 || Math.abs(b - breaks[i - 1] - step) < 1e-9 * Math.abs(step));
    const [dmin, dmax] = [Math.min(...values), Math.max(...values)];
    // Even breaks whose outer classes reach no further than a step past the data close there.
    const closed = even && dmin >= breaks[0] - step! - 1e-9 && dmax <= breaks[breaks.length - 1] + step! + 1e-9;
    return {
      breaks,
      ...(closed ? { lo: Number((breaks[0] - step!).toPrecision(12)), hi: Number((breaks[breaks.length - 1] + step!).toPrecision(12)) } : {}),
      note: `threshold at ${breaks.length + 1} round classes${closed ? '' : ', ends open'}`,
    };
  }
  if (scale.type !== 'quantize') return undefined;
  const k = Array.isArray(scale.range) ? scale.range.length : scale.scheme?.count ?? 5;
  const [lo, hi] = Array.isArray(scale.domain) ? scale.domain : [Math.min(...values), Math.max(...values)];
  const step = (hi - lo) / k;
  return { breaks: Array.from({ length: k - 1 }, (_, i) => Number((lo + step * (i + 1)).toPrecision(12))), lo, hi, note: `quantize ${k} over [${lo}, ${hi}], step ${Number(step.toPrecision(6))}` };
}

const fmt = (v: number) => {
  const s = String(Number(v.toPrecision(6)));
  return v < 0 ? `−${s.slice(1)}` : s;
};

function Panel({ strategy, spec, binning, values, pivot }: { strategy: Strategy | 'today'; spec: Spec; binning: Binning; values: number[]; pivot?: number }) {
  const [drawn, setDrawn] = useState<string[]>();
  const onReady = useCallback((svg: SVGSVGElement) => {
    const legend = svg.querySelector('.role-legend');
    const labels = [...(legend?.querySelectorAll('.role-legend-label text') ?? [])].map((t) => (t.textContent ?? '').trim()).filter(Boolean);
    setDrawn(labels);
  }, []);
  const s = score(values, binning, pivot);
  const exact = binning.breaks.map(fmt);
  // A label read back as a number: "−10%" is −0.1, "1,000" is 1000.
  const readBack = (label: string) => {
    const n = Number(label.replace('−', '-').replace(/,/g, '').replace('%', ''));
    return label.endsWith('%') ? n / 100 : n;
  };
  const mismatch = drawn && drawn.length === binning.breaks.length
    && drawn.some((label, i) => Math.abs(readBack(label) - binning.breaks[i]) > 1e-9 * Math.max(1, Math.abs(binning.breaks[i])));
  const label = strategy === 'today' ? 'Flint today' : strategy.label;
  return (
    <figure className={strategy === 'today' ? 'bl-panel bl-today' : 'bl-panel'}>
      <figcaption>
        <b>{label}</b>
        <span>{binning.note}</span>
      </figcaption>
      <VegaLiteView spec={spec} renderer="svg" onReady={onReady} />
      <dl className="bl-metrics">
        <dt>breaks</dt><dd>{exact.join('  ')}</dd>
        {drawn && <><dt>legend draws</dt><dd className={mismatch ? 'bl-bad' : ''}>{drawn.join('  ')}{mismatch ? '  ← not the breaks' : ''}</dd></>}
        <dt>domain</dt><dd>{binning.lo !== undefined ? `[${fmt(binning.lo)}, ${fmt(binning.hi!)}] · ×${s.inflation} of data span` : 'open ends'}</dd>
        <dt>classes</dt><dd>{s.classes} · counts {s.counts.join('/')}{s.empty ? <span className="bl-bad"> · {s.empty} empty</span> : null}</dd>
        <dt>evenness</dt><dd>{s.evenness}</dd>
        <dt>coverage</dt><dd className={s.coverage !== undefined && s.coverage < 0 ? 'bl-warn' : ''}>{s.coverage ?? '—'}</dd>
        <dt>label digits</dt><dd className={s.digits > 2 ? 'bl-warn' : ''}>{s.digits}{s.simplicity !== undefined ? ` · step simplicity ${s.simplicity}` : ' · no round step'}</dd>
        {s.pivotRespected !== undefined && <><dt>pivot</dt><dd className={s.pivotRespected ? '' : 'bl-bad'}>{s.pivotRespected ? 'a break or a class centre' : 'falls inside a class off-centre'}</dd></>}
      </dl>
    </figure>
  );
}

function CaseRow({ c, theme, classes, size }: { c: BinningCase; theme: string; classes: number; size: { width: number; height: number } }) {
  const values = useMemo(() => c.values.map((row) => Number(row[c.color])).filter(Number.isFinite), [c]);
  const built = useMemo(() => {
    try {
      const compiled = assembleVegaLite(inputOf(c, theme, classes, size)) as Spec;
      const shipped = shippedBinning(compiled, c.color, values);
      // The house's count (5 for every binning preset) or the author's bins: what each candidate is asked for.
      const k = theme ? 5 : classes;
      const panels = STRATEGIES.map((strategy) => {
        const binning = strategy.bin(values, { pivot: c.pivot, classes: k });
        return { strategy, binning, spec: binning ? withBinning(compiled, c.color, binning) : undefined };
      });
      return { compiled, shipped, panels };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }, [c, theme, classes, size, values]);
  const [dmin, dmax] = [Math.min(...values), Math.max(...values)];
  return (
    <section className="bl-case">
      <h2>{c.label} <span>data {fmt(dmin)} … {fmt(dmax)}{c.pivot !== undefined ? ` · pivot ${c.pivot}` : ' · no pivot'}</span></h2>
      <p>{c.why}</p>
      {'error' in built ? <p className="bl-bad">{built.error}</p> : (
        <div className="bl-panels">
          {built.shipped
            ? <Panel strategy="today" spec={built.compiled} binning={built.shipped} values={values} pivot={c.pivot} />
            : <p className="bl-warn">The compiled chart is not binned (no quantize scale).</p>}
          {built.panels.map(({ strategy, binning, spec }) => binning && spec
            ? <Panel key={strategy.id} strategy={strategy} spec={spec} binning={binning} values={values} pivot={c.pivot} />
            : <figure key={strategy.id} className="bl-panel"><figcaption><b>{strategy.label}</b><span>no binning fits</span></figcaption></figure>)}
        </div>
      )}
    </section>
  );
}

export function BinningLab() {
  const [theme, setTheme] = useState('pop');
  const [classes, setClasses] = useState(5);
  const [sizeKey, setSizeKey] = useState('s');
  const [only, setOnly] = useState('');
  const size = SIZES.find((s) => s.key === sizeKey) ?? SIZES[0];
  const cases = only ? CASES.filter((c) => c.key === only) : CASES;
  return (
    <div className="bl-page">
      <header className="bl-heading">
        <h1>Binned colour scales</h1>
        <p>
          A stepped colour scale cuts a continuous field into a few classes. Flint used to make a diverging domain
          symmetric about its pivot and cut it into equal classes (the theme's <code>consumption: 'quantize'</code>, or
          an author's <code>bins</code>), and Vega labelled the raw thresholds with its default format — the climate chart
          read "−20, −7, 7, 20" for breaks at ±20.1 and ±6.7, its darkest cold classes empty. It now steps at round
          classes about the pivot (<code>roundColorClasses</code>). "Flint today" is the compiled chart as it ships; each
          other panel keeps it and replaces only its colour scale with a threshold scale at a candidate's breaks.
        </p>
        <ul className="bl-legend">
          {STRATEGIES.map((s) => <li key={s.id}><b>{s.label}</b> — {s.summary}</li>)}
        </ul>
        <p className="bl-small">
          <b>coverage</b> is Talbot, Lin &amp; Hanrahan's (2010) term: 1 when the domain fits the data, falling quadratically
          as it overreaches (below 0 is a domain much wider than the data). <b>evenness</b> is how evenly the cells fill the
          classes (1 = every class equally used). <b>label digits</b> is the most significant digits a break needs.
        </p>
        <div className="bl-controls">
          <label>Theme <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            {THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select></label>
          <label>Classes <select value={classes} onChange={(e) => setClasses(Number(e.target.value))}>
            {[3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
          </select></label>
          <span className="bl-small">themes bin at their own count (5); classes sets the unthemed bins</span>
          <label>Size <select value={sizeKey} onChange={(e) => setSizeKey(e.target.value)}>
            {SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select></label>
          <label>Case <select value={only} onChange={(e) => setOnly(e.target.value)}>
            <option value="">All</option>
            {CASES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select></label>
        </div>
      </header>
      {cases.map((c) => <CaseRow key={`${c.key}-${theme}-${classes}-${sizeKey}`} c={c} theme={theme} classes={classes} size={size} />)}
    </div>
  );
}
