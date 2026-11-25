import { useCallback, useMemo, useState } from 'react';
import { assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import { VegaLiteView } from '../../components/VegaLiteView';
import { CASES, type BinningCase } from './cases';
import './binning-lab.css';

/**
 * How Flint cuts a continuous colour into stepped classes, shown as it ships: every case under every
 * setup that bins — the four houses that quantize their ramp, and an author's `bins` without a
 * house — with what each chart's key prints and how its cells fill the classes. Known limits follow,
 * each with the alternatives considered.
 */

type Spec = Record<string, any>;

const SETUPS: { id: string; label: string; theme?: string; bins?: number }[] = [
  { id: 'pop', label: 'Pop', theme: 'pop' },
  { id: 'swiss', label: 'Swiss', theme: 'swiss' },
  { id: 'cartoon', label: 'Cartoon', theme: 'cartoon' },
  { id: 'de-stijl', label: 'De Stijl', theme: 'de-stijl' },
  { id: 'bins', label: 'No theme, bins: 5', bins: 5 },
];

const SIZE = { width: 340, height: 240 };

function inputOf(c: BinningCase, setup: { theme?: string; bins?: number }, extra: { semantic?: Record<string, unknown>; showTextLabels?: boolean } = {}): ChartAssemblyInput {
  return {
    data: { values: c.values },
    semantic_types: { ...c.semantic, ...extra.semantic },
    chart_spec: {
      chartType: 'Heatmap',
      title: c.title,
      encodings: { x: c.x, y: c.y, color: setup.bins ? { field: c.color, bins: setup.bins } : c.color },
      canvasSize: SIZE,
      ...(extra.showTextLabels ? { chartProperties: { showTextLabels: true } } : {}),
    },
    ...(setup.theme ? { theme_spec: setup.theme } : {}),
  } as unknown as ChartAssemblyInput;
}

/** The drawn cells' colour encoding: the first on the field that draws a key. */
function cellColor(spec: Spec, field: string): Spec | undefined {
  let found: Spec | undefined;
  const visit = (node: Spec | undefined) => {
    if (!node || typeof node !== 'object' || found) return;
    const enc = node.encoding?.color;
    if (enc?.field?.startsWith(field) && enc.legend !== null) found = enc;
    for (const key of ['layer', 'hconcat', 'vconcat', 'concat'] as const) (node[key] ?? []).forEach(visit);
    if (node.spec) visit(node.spec);
  };
  visit(spec);
  return found;
}

const fmt = (v: number) => {
  const s = String(Number(v.toPrecision(6)));
  return v < 0 ? `−${s.slice(1)}` : s;
};

/** A drawn key label read back as a number: "−10%" is −0.1, "1,000" is 1000, "−40k" is −40000. */
function readBack(label: string): number {
  const text = label.replace('−', '-').replace(/,/g, '');
  const scale = text.endsWith('%') ? 0.01 : text.endsWith('k') ? 1e3 : text.endsWith('M') ? 1e6 : 1;
  return Number(text.replace(/[%kM]$/, '')) * scale;
}

interface Stepped {
  breaks: number[];
  /** Where the outer classes close, where the breaks are even and the data lies within a step of them. */
  closed?: [number, number];
  counts: number[];
}

/** The classes a compiled chart steps its colour into, and how its cells fill them. */
function steppedOf(spec: Spec, field: string, values: number[]): Stepped | undefined {
  const scale = cellColor(spec, field)?.scale;
  if (scale?.type !== 'threshold' || !Array.isArray(scale.domain)) return undefined;
  const breaks: number[] = scale.domain;
  const counts = new Array(breaks.length + 1).fill(0);
  for (const v of values) {
    let i = 0;
    while (i < breaks.length && v >= breaks[i]) i++;
    counts[i]++;
  }
  const step = breaks.length > 1 ? breaks[1] - breaks[0] : undefined;
  const even = step !== undefined && breaks.every((b, i) => i === 0 || Math.abs(b - breaks[i - 1] - step) < 1e-9 * Math.abs(step));
  const [dmin, dmax] = [Math.min(...values), Math.max(...values)];
  const closed = even && dmin >= breaks[0] - step! - 1e-9 && dmax <= breaks[breaks.length - 1] + step! + 1e-9
    ? [Number((breaks[0] - step!).toPrecision(12)), Number((breaks[breaks.length - 1] + step!).toPrecision(12))] as [number, number]
    : undefined;
  return { breaks, ...(closed ? { closed } : {}), counts };
}

/** One compiled chart, with what its key prints and how its cells fill the classes. */
function Panel({ title, input, field, values, pivot, note }: {
  title: string; input: ChartAssemblyInput; field: string; values: number[]; pivot?: number; note?: string;
}) {
  const [drawn, setDrawn] = useState<string[]>();
  const built = useMemo(() => {
    try {
      const compiled = assembleVegaLite(input) as Spec;
      return { compiled, stepped: steppedOf(compiled, field, values) };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }, [input, field, values]);
  const onReady = useCallback((svg: SVGSVGElement) => {
    const legend = svg.querySelector('.role-legend');
    setDrawn([...(legend?.querySelectorAll('.role-legend-label text') ?? [])].map((t) => (t.textContent ?? '').trim()).filter(Boolean));
  }, []);
  if ('error' in built) return <figure className="bl-panel"><figcaption><b>{title}</b></figcaption><p className="bl-bad">{built.error}</p></figure>;
  const { compiled, stepped } = built;
  const mismatch = stepped && drawn && drawn.length === stepped.breaks.length
    && drawn.some((label, i) => Math.abs(readBack(label) - stepped.breaks[i]) > 1e-9 * Math.max(1, Math.abs(stepped.breaks[i])));
  const empty = stepped?.counts.filter((count) => count === 0).length ?? 0;
  const neutral = stepped && pivot !== undefined && !stepped.breaks.includes(pivot)
    && stepped.breaks.some((b, i) => i > 0 && Math.abs((stepped.breaks[i - 1] + b) / 2 - pivot) < 1e-9);
  return (
    <figure className="bl-panel">
      <figcaption><b>{title}</b>{note ? <span>{note}</span> : null}</figcaption>
      <VegaLiteView spec={compiled} renderer="svg" onReady={onReady} />
      {stepped ? (
        <dl className="bl-metrics">
          <dt>breaks</dt><dd>{stepped.breaks.map(fmt).join('  ')}</dd>
          {drawn && <><dt>key prints</dt><dd className={mismatch ? 'bl-bad' : ''}>{drawn.join('  ')}{mismatch ? '  ← not the breaks' : ''}</dd></>}
          <dt>classes</dt><dd>{stepped.counts.length}{stepped.closed ? ` · closed ${fmt(stepped.closed[0])} … ${fmt(stepped.closed[1])}` : ' · ends open'}</dd>
          <dt>cells</dt><dd>{stepped.counts.join(' / ')}{empty ? <span className="bl-bad"> · {empty} empty</span> : null}</dd>
          {pivot !== undefined && <><dt>pivot</dt><dd>{stepped.breaks.includes(pivot) ? 'a break' : neutral ? 'centres a neutral class' : 'inside a class'}</dd></>}
        </dl>
      ) : <p className="bl-warn">Not stepped: the colour runs as {cellColor(compiled, field)?.scale?.type ?? 'a continuous'} scale.</p>}
    </figure>
  );
}

function CaseRow({ c }: { c: BinningCase }) {
  const values = useMemo(() => c.values.map((row) => Number(row[c.color])).filter(Number.isFinite), [c]);
  const inputs = useMemo(() => SETUPS.map((setup) => ({ setup, input: inputOf(c, setup) })), [c]);
  return (
    <section className="bl-case">
      <h3>
        {c.label}
        <span>
          data {fmt(Math.min(...values))} … {fmt(Math.max(...values))}
          {c.pivot !== undefined ? ` · pivot ${c.pivot}, ${c.pivotRole === 'neutral' ? 'a neutral class' : 'a break'}` : ' · no pivot'}
        </span>
      </h3>
      <p>{c.why}</p>
      <div className="bl-panels">
        {inputs.map(({ setup, input }) => (
          <Panel key={setup.id} title={setup.label} input={input} field={c.color} values={values} pivot={c.pivot} />
        ))}
      </div>
    </section>
  );
}

/** The ramp-balance finding grounding reports for each house that bins, read from a compiled chart. */
function RampReports() {
  const warm = CASES.find((c) => c.key === 'warm')!;
  const rows = useMemo(() => SETUPS.filter((setup) => setup.theme).map((setup) => {
    const report = ((assembleVegaLite(inputOf(warm, setup)) as Spec)._theme?.report ?? []) as { code: string; message: string }[];
    return { label: setup.label, message: report.find((entry) => entry.code === 'diverging-ramp-unbalanced')?.message };
  }), [warm]);
  return (
    <ul className="bl-list">
      {rows.map((row) => <li key={row.label}><b>{row.label}</b> — {row.message ?? 'balanced within 3 L*'}</li>)}
    </ul>
  );
}

/** The count each case steps into under each house, where it is not the house's five. */
function CountDrift() {
  const rows = useMemo(() => CASES.flatMap((c) => {
    const values = c.values.map((row) => Number(row[c.color])).filter(Number.isFinite);
    return SETUPS.filter((setup) => setup.theme).map((setup) => {
      const stepped = steppedOf(assembleVegaLite(inputOf(c, setup)) as Spec, c.color, values);
      return { key: `${c.key}-${setup.id}`, label: `${c.label}, ${setup.label}`, classes: stepped?.counts.length };
    }).filter((row) => row.classes !== undefined && row.classes !== 5);
  }), []);
  return <p className="bl-small">{rows.length ? rows.map((row) => `${row.label}: ${row.classes}`).join(' · ') : 'Every case steps into five.'}</p>;
}

/** A grid of signed net values no round step closes into seven classes. */
const NET: BinningCase = {
  key: 'net', label: 'Net new users', values: ['A', 'B', 'C'].flatMap((game, g) => ['Jan', 'Feb', 'Mar'].map((month, p) => ({ game, month, net: (g - 1) * 1000 + p * 300 - 400 }))),
  x: 'month', y: 'game', color: 'net', pivot: 0, pivotRole: 'break',
  semantic: { game: 'Category', month: 'Category', net: 'Profit' }, title: 'Net new users', why: '',
};

export function BinningLab() {
  const correlation = CASES.find((c) => c.key === 'correlation')!;
  const corrValues = useMemo(() => correlation.values.map((row) => Number(row[correlation.color])), [correlation]);
  const warm = CASES.find((c) => c.key === 'warm')!;
  const warmValues = useMemo(() => warm.values.map((row) => Number(row[warm.color])), [warm]);
  const netValues = useMemo(() => NET.values.map((row) => Number(row.net)), []);
  const demos = useMemo(() => ({
    corrAuto: inputOf(correlation, { theme: 'swiss' }),
    corrStated: inputOf(correlation, { theme: 'swiss' }, { semantic: { r: { semanticType: 'Correlation', divergingNeutral: 0.1 } } }),
    netSeven: inputOf(NET, { bins: 7 }),
    netFour: inputOf(NET, { bins: 4 }),
    labelled: inputOf(warm, { theme: 'pop' }, { showTextLabels: true }),
  }), [correlation, warm]);
  return (
    <div className="bl-page">
      <header className="bl-heading">
        <h1>Binned colour scales</h1>
        <p>
          A stepped colour scale cuts a continuous field into a few classes: a house that bins its ramp
          (<code>consumption: 'quantize'</code> — pop, swiss, cartoon, de-stijl) or an author's <code>bins</code>.
          Flint cuts it at round values (<code>roundColorClasses</code>), the same in Vega-Lite and ECharts.
        </p>
      </header>

      <section className="bl-decision">
        <h2>How the classes are chosen</h2>
        <ol>
          <li><b>A round step.</b> 1, 2, 2.5 or 5 of a power of ten, the one Talbot, Lin &amp; Hanrahan's (2010) extended labeling scores best: how round the step is, how closely the classes cover the data, how near their count comes to the target.</li>
          <li><b>The pivot.</b> A diverging field's pivot is a <i>break</i> where its values merely cross a sign (Profit, PercentageChange, Temperature), so a small gain never reads as a small loss; it centres a <i>neutral class</i> a step wide where the type always has it (Correlation, Sentiment, a stated <code>divergingMidpoint</code>). The <code>divergingNeutral</code> annotation sets the band's half-width, or <code>false</code> for a break.</li>
          <li><b>Each side its own classes.</b> Every break is a multiple of the step from the pivot, and each side takes only the classes its data reaches — no symmetric domain, no empty dark classes. Neither side takes more than four where a coarser step holds it.</li>
          <li><b>Colour per unit, the same both sides.</b> The ramp steps out from its centre at one rate set by the longer side, so equal distances from the pivot read as equal colours and the shorter side keeps to its pale end. Each class takes the colour at its far edge, so the classes beside a break show their sign; a neutral class takes the centre.</li>
          <li><b>The count.</b> A house's five is a target. An author's <code>bins</code> is held exactly where a round step closes that many classes, else that many with the outer two open.</li>
          <li><b>The key prints each break as it is</b>, in the field's own format (a percentage, a currency), compacted (<code>−40k</code>) only where full labels would not fit.</li>
          <li><b>Grounding reports a diverging ramp</b> whose two arms differ by more than 3 L* at mirrored points (<code>diverging-ramp-unbalanced</code>).</li>
        </ol>
        <p className="bl-small">
          Under each chart: the <b>breaks</b> in the compiled scale, what the <b>key prints</b> (flagged where it is not the breaks),
          the <b>classes</b> and where they close, how many <b>cells</b> fall in each class, and how the <b>pivot</b> sits.
        </p>
      </section>

      <section>
        <h2>Every case, every setup</h2>
        {CASES.map((c) => <CaseRow key={c.key} c={c} />)}
      </section>

      <section className="bl-issues">
        <h2>Known limits and alternatives</h2>

        <article>
          <h3>1. A neutral class a step wide can print two-digit breaks</h3>
          <p>
            A neutral class centred on the pivot puts its breaks half a step from it. With the step correlations take
            (0.5), that is ±0.25 and ±0.75 — round, but two digits. A step of 1 would give ±0.5 and only three classes;
            a step of 0.2 would give ±0.1, ±0.3 … and more classes a side than the cap allows. An author who knows the
            band states it: <code>divergingNeutral: 0.1</code>.
          </p>
          <p className="bl-small"><b>Alternatives:</b> a default band per type (±0.1 for Correlation); let the neutral class be narrower than the other classes.</p>
          <div className="bl-panels">
            <Panel title="Correlation, swiss" note="neutral class a step wide (default)" input={demos.corrAuto} field="r" values={corrValues} pivot={0} />
            <Panel title="Correlation, swiss" note="divergingNeutral: 0.1" input={demos.corrStated} field="r" values={corrValues} pivot={0} />
          </div>
        </article>

        <article>
          <h3>2. The houses' diverging ramps are not balanced</h3>
          <p>
            Equal distances from the pivot read as equal only where the ramp's two arms are equally light at mirrored
            points. The classes are placed for that, but every house that bins today has arms that differ — pop by
            more than 20 L* — so one side's classes read heavier. Warm hues also read stronger than cool ones at the
            same lightness. Grounding reports it; it does not correct it.
          </p>
          <RampReports />
          <p className="bl-small"><b>Alternatives:</b> rebalance the ramps in a perceptual space (OKLCH / CIELAB, matched L* per mirrored stop); let grounding correct a ramp past the tolerance rather than report it.</p>
        </article>

        <article>
          <h3>3. An author's count no round step closes is held with the outer classes open</h3>
          <p>
            <code>bins: 7</code> over −1,400 … 1,200 has no round step that closes seven classes about 0, so the seven
            come with the outer two open ("&lt; −750", "≥ 500"), wider than the rest. <code>bins: 4</code> closes at ±2,000.
            The open edges are centred on the data's middle, not fitted to where the values fall, so a gappy field can
            leave a class empty — here, and the unemployment case under <code>bins: 5</code> above.
          </p>
          <p className="bl-small"><b>Alternatives:</b> treat an author's count as a target, as a house's is (round and closed, but not the count asked for); widen the round steps to 3 and 4 of a power of ten; place the open edges where they leave no class empty.</p>
          <div className="bl-panels">
            <Panel title="bins: 4" note="closed" input={demos.netFour} field="net" values={netValues} pivot={0} />
            <Panel title="bins: 7" note="outer two open" input={demos.netSeven} field="net" values={netValues} pivot={0} />
          </div>
        </article>

        <article>
          <h3>4. A house's count drifts from five</h3>
          <p>
            Five is a target: the step that reads best can give fewer or more classes (up to seven, within the
            four-a-side cap). The cases that step into other than five:
          </p>
          <CountDrift />
          <p className="bl-small"><b>Alternatives:</b> hold a house to its count ±1; cap the total at the house's count rather than per side.</p>
        </article>

        <article>
          <h3>5. A heatmap's printed values keep their own ink rule</h3>
          <p>
            Values printed in the cells pick white or black by their distance from the pivot (past half the widest),
            not by the class colour behind them, so a label can sit dark on a dark class or light on a pale one.
          </p>
          <p className="bl-small"><b>Alternative:</b> derive the label ink from the class colours (as the themes' ink scale on a ramp does).</p>
          <div className="bl-panels">
            <Panel title="Warm cities, pop" note="values printed in the cells" input={demos.labelled} field={warm.color} values={warmValues} pivot={0} />
          </div>
        </article>

        <article>
          <h3>6. A colour Vega-Lite aggregates is not stepped</h3>
          <p>
            The classes are found from the rows. Where the colour encoding still carries an <code>aggregate</code> for
            Vega-Lite to compute (rather than Flint aggregating before it draws, as a heatmap does), the rows do not hold
            the values drawn, and the scale stays an even quantize of the domain, with unround breaks.
          </p>
          <p className="bl-small"><b>Alternative:</b> aggregate the rows as Vega-Lite will before finding the classes.</p>
        </article>
      </section>
    </div>
  );
}
