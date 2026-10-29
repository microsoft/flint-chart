import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import { FlintChart } from 'flint-chart/react';
import { ScaleToFit } from '../components/ScaleToFit';
import { VegaLiteView } from '../components/VegaLiteView';
import { SKETCHES } from './sketches';
import { C, ellipse } from './sketch';
import minimaps from './specs/minimaps.json';

/** A live Flint chart laid out for its box: the compiler sizes it to the room, nothing spills. */
export function Chart({ spec, backend }: { spec: ChartAssemblyInput; backend?: 'vegalite' | 'echarts' | 'chartjs' | 'plotly' }) {
  return (
    <div className="talk-chart">
      <FlintChart spec={spec} backend={backend} renderer="svg" width="100%" height="100%" fit="relayout" />
    </div>
  );
}

/** A Vega-Lite spec, drawn at its own size and scaled down to fit its box. */
export function VegaLite({ spec }: { spec: unknown }) {
  return (
    <div className="talk-fit">
      <ScaleToFit height={0} fill maxScale={1.8}>
        <VegaLiteView spec={spec} renderer="svg" />
      </ScaleToFit>
    </div>
  );
}

export type Flaw = { role: 'x-axis' | 'y-axis' | 'legend' | 'marks'; label: string };

/**
 * A Vega-Lite chart with its problems circled in red, hand-drawn over the parts Vega names (an axis,
 * the legend, the marks), each with a short label. The rings follow the chart as it scales.
 */
export function FlawedVegaLite({ spec, flaws }: { spec: unknown; flaws: Flaw[] }) {
  // Each ring carries its number; the labels are listed as text beside the chart (see FlawList).
  const host = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = host.current, canvas = canvasRef.current;
    if (!el || !canvas) return;
    let ready = false;
    const draw = () => {
      const svg = el.querySelector('svg.marks, svg');
      const w = el.clientWidth, h = el.clientHeight;
      if (!ready || !svg || !w || !h) return;
      const hb = el.getBoundingClientRect(), k = hb.width / w || 1;
      const dpr = Math.max(2, window.devicePixelRatio * 1.5);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const axes = [...svg.querySelectorAll('.role-axis')].map((g) => g.getBoundingClientRect());
      const pick = (role: Flaw['role']): DOMRect | undefined => {
        if (role === 'legend') return svg.querySelector('.role-legend')?.getBoundingClientRect();
        if (role === 'marks') return svg.querySelector('.role-mark')?.getBoundingClientRect();
        // The x axis is the wide one, the y axis the tall one.
        const sorted = [...axes].sort((a, b) => (role === 'x-axis' ? b.width / b.height - a.width / a.height : b.height / b.width - a.height / a.width));
        return sorted[0];
      };
      flaws.forEach((flaw, i) => {
        const r = pick(flaw.role);
        if (!r) return;
        const x = (r.left - hb.left) / k, y = (r.top - hb.top) / k, bw = r.width / k, bh = r.height / k;
        const cx = x + bw / 2, cy = y + bh / 2;
        ellipse(ctx, cx, cy, bw / 2 + 12, bh / 2 + 10, { w: 3, color: C.red, seed: 3000 + i * 7 });
        // A numbered badge on the ring's upper left; the slide lists what each number means.
        const rx = bw / 2 + 12, ry = bh / 2 + 10;
        const bx = Math.min(Math.max(cx - rx * 0.72, 16), w - 16), by = Math.min(Math.max(cy - ry * 0.72, 16), h - 16);
        ctx.save();
        ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(bx, by, 15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = "700 18px Inter, system-ui, sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), bx, by + 1);
        ctx.restore();
      });
      canvas.dataset.drawn = 'true';
    };
    void document.fonts.load("700 20px 'Kalam'").then(() => { ready = true; draw(); });
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    const mo = new MutationObserver(() => requestAnimationFrame(draw));
    mo.observe(el, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [flaws]);
  return (
    <div ref={host} className="talk-fit" style={{ position: 'relative' }}>
      <ScaleToFit height={0} fill maxScale={1.8}>
        <VegaLiteView spec={spec} renderer="svg" />
      </ScaleToFit>
      <canvas ref={canvasRef} className="talk-sketch" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
    </div>
  );
}

/** The numbered problems a FlawedVegaLite circles, as readable text. */
export function FlawList({ flaws }: { flaws: Flaw[] }) {
  return (
    <ol className="talk-flaws">
      {flaws.map((flaw, i) => <li key={flaw.label}><span>{i + 1}</span>{flaw.label}</li>)}
    </ol>
  );
}

/** A site demo laid out at `width`, scaled to fit its box. Flint's pointer handling follows the scale. */
export function Demo({ width, children }: { width: number; children: ReactNode }) {
  return (
    <div className="talk-fit">
      <ScaleToFit height={0} fill>
        <div style={{ width }}>{children}</div>
      </ScaleToFit>
    </div>
  );
}

/**
 * A live component at one fixed scale: the scale comes from the slide area and a design box, never
 * from the content, so a demo that grows while you use it does not rescale (and flicker).
 */
export function Stable({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const next = Math.min(el.clientWidth / width, el.clientHeight / height);
      if (next > 0) setK((v) => (Math.abs(v - next) < 0.001 ? v : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);
  return (
    <div ref={ref} className="talk-fit" style={{ overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: '50%', width, transform: `translateX(-50%) scale(${k})`, transformOrigin: 'top center' }}>{children}</div>
    </div>
  );
}

/** A hand-drawn illustration, redrawn at its box size once the hand font is ready. */
export function Sketch({ name }: { name: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    let ready = false;
    const draw = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!ready || !w || !h) return;
      const dpr = Math.max(2, window.devicePixelRatio * 1.5);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      SKETCHES[name]?.(ctx, w, h);
      canvas.dataset.drawn = 'true';
    };
    void Promise.all([document.fonts.load("400 20px 'Kalam'"), document.fonts.load("700 20px 'Kalam'")]).then(() => {
      if (cancelled) return;
      ready = true;
      draw();
    });
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => { cancelled = true; ro.disconnect(); };
  }, [name]);
  return <canvas ref={ref} className="talk-sketch" data-sketch={name} />;
}

// ---------------------------------------------------------------- minimaps
type Line = [number, number, string, boolean?];
const INK: Record<string, string> = {
  meaning: '#2f6db5', look: '#e8954a', behavior: '#d9534f', glue: '#9aa3ad',
  spec: '#c3c8cf', chart: '#8fb3e0', theme: '#f2b179', interaction: '#e58b8b',
};

/** A whole file as one bar per line; added lines green, removed runs marked red in the gutter. */
export function Minimap({ lines, dels = [], diff = false, maxLines, links }: { lines: Line[]; dels?: [number, number][]; diff?: boolean; maxLines?: number; links?: [number, number, string][] }) {
  const n = Math.max(lines.length, maxLines ?? 0, 1);
  const W = 300, LH = 6, H = n * LH;
  const start = (i: number) => Math.min(lines[i][0] * 3, W - 20);
  const end = (i: number) => start(i) + Math.max(6, Math.min(W - start(i), lines[i][1] * 3));
  const bulge = (a: number, b: number) => 30 + Math.abs(b - a) * LH * 0.22;
  // Arcs alternate sides, so the bundle crosses the code the way the dependencies do.
  const arcs = (links ?? []).map(([a, b, kind], k) => {
    const left = k % 2 === 1;
    const xa = left ? start(a) - 3 : end(a) + 3, xb = left ? start(b) - 3 : end(b) + 3;
    const out = left ? Math.min(xa, xb) - bulge(a, b) * 0.8 : Math.max(xa, xb) + bulge(a, b);
    return { xa, xb, ya: a * LH + 2.5, yb: b * LH + 2.5, out, kind, lean: ((k * 37) % 13) - 6 };
  });
  const x0 = Math.min(-14, ...arcs.map((r) => r.out - 8)), x1 = Math.max(W + 4, ...arcs.map((r) => r.out + 8));
  return (
    <svg className="talk-minimap" viewBox={`${x0} -4 ${x1 - x0} ${H + 8}`} preserveAspectRatio="xMidYMin meet" role="img" aria-label="file minimap">
      {lines.map(([indent, len, kind, added], i) => {
        const x = Math.min(indent * 3, W - 20);
        const w = Math.max(6, Math.min(W - x, len * 3));
        return (
          <g key={i}>
            {diff && added && <rect x={-4} y={i * LH} width={W + 8} height={LH - 1} fill="#d1f4d9" />}
            <rect x={x} y={i * LH + 1} width={w} height={LH - 3} rx={1} fill={diff && added ? '#2da44e' : INK[kind] ?? '#c3c8cf'} />
          </g>
        );
      })}
      {arcs.map(({ xa, xb, ya, yb, out, kind, lean }, k) => (
        <g key={`l${k}`} stroke={INK[kind]} fill="none" strokeLinecap="round" opacity={0.75}>
          <path d={`M${xa},${ya} C${out + lean},${ya - 4} ${out - lean},${yb + 4} ${xb},${yb}`} strokeWidth={2.2} />
          <circle cx={xa} cy={ya} r={2.6} fill={INK[kind]} stroke="none" />
          <circle cx={xb} cy={yb} r={2.6} fill={INK[kind]} stroke="none" />
        </g>
      ))}
      {diff && dels.map(([pos, count], i) => (
        <rect key={`d${i}`} x={-12} y={pos * LH - 1} width={5} height={Math.max(3, Math.min(count, 8) * 2)} fill="#cf222e" />
      ))}
    </svg>
  );
}

export const MINIMAPS = minimaps as {
  entangle: [number, number, string][];
  links: [number, number, string][];
  changes: { id: string; title: string; vl: { lines: Line[]; dels: [number, number][]; plus: number; minus: number }; flint: { lines: Line[]; dels: [number, number][]; plus: number; minus: number } }[];
};

// ---------------------------------------------------------------- code, before and after
export interface CodeRow { text: string; hot?: boolean; gap?: boolean }

/** One-line JSON with spaces: `{ "a": [1, 2] }`. */
function inline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length ? `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(value);
}

/** JSON as an author writes it: what fits on a line stays on one line. */
export function specText(value: unknown, width = 60, indent = 0, lead = 0): string {
  const one = inline(value);
  if (one.length + indent + lead <= width || typeof value !== 'object' || value === null) return one;
  const pad = ' '.repeat(indent), inner = ' '.repeat(indent + 2);
  if (Array.isArray(value)) return `[\n${value.map((v) => inner + specText(v, width, indent + 2)).join(',\n')}\n${pad}]`;
  const entries = Object.entries(value as Record<string, unknown>);
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${specText(v, width, indent + 2, k.length + 4)}`).join(',\n')}\n${pad}}`;
}

/** A line without its trailing comma, so adding a sibling after it does not count as changing it. */
const sansComma = (line: string) => line.replace(/,$/, '');

/** For each line of `b`, whether it is new or changed relative to `a` (longest common subsequence). */
function addedLines(a: string[], b: string[]): boolean[] {
  a = a.map(sansComma); b = b.map(sansComma);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const added = new Array<boolean>(m).fill(true);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { added[j] = false; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return added;
}

/**
 * The rows a step shows: the new spec with its changed lines marked, unchanged runs folded to "…"
 * beyond a line of context. Without a previous spec, every line shows plain.
 */
export function stepRows(next: unknown, prev?: unknown, width = 60): CodeRow[] {
  const b = specText(next, width).split('\n');
  if (prev === undefined) return b.map((text) => ({ text }));
  const hot = addedLines(specText(prev, width).split('\n'), b);
  const keep = hot.map((h, k) => h || hot[k - 1] || hot[k + 1]);
  const rows: CodeRow[] = [];
  b.forEach((text, k) => {
    if (keep[k]) rows.push({ text, hot: hot[k] });
    else if (rows.length === 0 || !rows[rows.length - 1].gap) rows.push({ text: '…', gap: true });
  });
  return rows;
}
/** The whole new spec, its changed lines marked, nothing folded. */
export function fullRows(next: unknown, prev: unknown, width = 60): CodeRow[] {
  const b = specText(next, width).split('\n');
  const hot = addedLines(specText(prev, width).split('\n'), b);
  return b.map((text, k) => ({ text, hot: hot[k] }));
}

/** Lines added and removed going from `prev` to `next`, as the code panels show them. */
export function lineDiff(prev: unknown, next: unknown, width = 60): { plus: number; minus: number } {
  const a = specText(prev, width).split('\n'), b = specText(next, width).split('\n');
  const plus = addedLines(a, b).filter(Boolean).length;
  return { plus, minus: addedLines(b, a).filter(Boolean).length };
}
export const plainRows = (rows: CodeRow[]): CodeRow[] => rows.map(({ text, gap }) => ({ text, gap }));

// Layouts for a code panel: the same rows, laid out for whatever width the panel gives them.
type Layout = (cols: number) => CodeRow[];
/** A step's spec, its changes marked and unchanged runs folded, at the panel's width. */
export const stepLayout = (next: unknown, prev?: unknown): Layout => (cols) => stepRows(next, prev, cols);
/** The whole new spec, its changes marked, at the panel's width. */
export const fullLayout = (next: unknown, prev: unknown): Layout => (cols) => fullRows(next, prev, cols);
/** A spec at the panel's width, the lines matching `hot` marked. */
export const specLayout = (value: unknown, hot?: RegExp): Layout => (cols) =>
  specText(value, cols).split('\n').map((text) => (hot?.test(text) ? { text, hot: true } : { text }));
/** A layout with its marks taken off: the previous step, shown plain. */
export const plainLayout = (layout: Layout): Layout => (cols) => plainRows(layout(cols));
export const textRows = (text: string, hot = false): CodeRow[] => text.trimEnd().split('\n').map((t) => ({ text: t, hot }));

const CHAR_W = 0.62, LINE_H = 1.45;
const indentOf = (text: string) => text.length - text.trimStart().length;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const hiddenRow = (hidden: CodeRow[]): CodeRow => {
  const hot = hidden.filter((r) => r.hot).length;
  const pad = ' '.repeat(hidden.length ? indentOf(hidden[0].text) : 0);
  return hot ? { text: `${pad}… ${hot} more changed line${hot > 1 ? 's' : ''}`, hot: true } : { text: `${pad}…`, gap: true };
};

/** Each run between folds cut to its first `k` rows, the rest summed up in one row. */
function sampled(rows: CodeRow[], k: number): CodeRow[] {
  if (!Number.isFinite(k)) return rows;
  const out: CodeRow[] = [];
  let run: CodeRow[] = [];
  const flush = (next?: CodeRow) => {
    if (run.length > k + 1) { out.push(...run.slice(0, k), hiddenRow(run.slice(k))); if (next) { run = []; return; } }
    else out.push(...run);
    if (next) out.push(next);
    run = [];
  };
  for (const r of rows) r.gap ? flush(r) : run.push(r);
  flush();
  return out;
}

/**
 * Rows for a code panel: fixed, or laid out for a width in characters. A spec laid out for the
 * panel's own width breaks between its keys, where a fixed layout would be wrapped mid-pair.
 */
export type CodeSource = CodeRow[] | ((cols: number) => CodeRow[]);

/** The narrowest layout a spec is reflowed to; below it, lines wrap under their indent instead. */
const MIN_COLS = 28;
const colsAt = (w: number, size: number) => Math.max(8, Math.floor(w / (CHAR_W * size)));

/**
 * Code set at the largest size that fits its box. A spec given as a layout function is reflowed to
 * the columns each size allows; fixed rows wrap long lines under their own indent. When the rows
 * still do not fit, each changed run shows its first lines and says how many more it has.
 */
export function Code({ rows: source, max = 22, min = 14, tone = 'flint' }: {
  rows: CodeSource; max?: number; min?: number;
  /** Flint code marks its changes in blue; Vega-Lite code marks them in red, to show what it costs. */
  tone?: 'flint' | 'vl';
}) {
  const ref = useRef<HTMLPreElement>(null);
  const [fit, setFit] = useState<{ size: number; k: number; shown: number; cols: number }>({ size: max, k: Infinity, shown: Infinity, cols: 60 });
  const layout = (cols: number) => (typeof source === 'function' ? source(Math.max(MIN_COLS, cols - 1)) : source);
  const key = layout(60).map((r) => (r.hot ? '+' : r.gap ? '~' : ' ') + r.text).join('\n');
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (w <= 0 || h <= 0) return;
      // Screen lines a list of rows takes at a size, wrapping under each row's indent.
      const lines = (list: CodeRow[], size: number) => {
        const cols = colsAt(w, size);
        return list.map(({ text }) => {
          const hang = Math.min(cols - 4, indentOf(text) + 2);
          return text.length <= cols ? 1 : 1 + Math.ceil((text.length - cols) / (cols - hang));
        });
      };
      const fits = (list: CodeRow[], size: number) => sum(lines(list, size)) <= Math.floor(h / (LINE_H * size));
      const narrow = colsAt(w, min);
      const rows = layout(narrow);
      let next = { size: min, k: Infinity, shown: Infinity, cols: narrow };
      let found = false;
      for (let size = max; size >= min && !found; size -= 0.5) {
        const cols = colsAt(w, size);
        if (fits(layout(cols), size)) { next = { size, k: Infinity, shown: Infinity, cols }; found = true; }
      }
      for (let k = rows.length; k >= 1 && !found; k--) if (fits(sampled(rows, k), min)) { next = { size: min, k, shown: Infinity, cols: narrow }; found = true; }
      if (!found) {
        const list = sampled(rows, 1), per = lines(list, min), budget = Math.floor(h / (LINE_H * min));
        let used = 1, shown = 0;
        while (shown < list.length && used + per[shown] <= budget) used += per[shown++];
        next = { size: min, k: 1, shown, cols: narrow };
      }
      setFit((f) => (f.size === next.size && f.k === next.k && f.shown === next.shown && f.cols === next.cols ? f : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, max, min]);
  const list = sampled(layout(fit.cols), fit.k);
  const shown = fit.shown < list.length ? [...list.slice(0, fit.shown), hiddenRow(list.slice(fit.shown))] : list;
  return (
    <pre ref={ref} className={`talk-code ${tone}`} style={{ fontSize: fit.size }}>
      {shown.map((r, i) => {
        const hang = indentOf(r.text) + 2;
        return (
          <span key={i} className={r.hot ? 'hl' : r.gap ? 'gap' : undefined} style={{ paddingLeft: `${hang}ch`, textIndent: `-${hang}ch` }}>{r.gap ? r.text : tokens(r.text)}</span>
        );
      })}
    </pre>
  );
}

const TOKEN = /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')(\s*:)?|(<\/?[A-Z][\w.]*|\/>)|\b([A-Za-z_$][\w$]*)(\s*:)|(?<![\w.])(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null|const|let|return|if|function|new|import|export|from|async|await)\b|(=>)|([{}[\],])/g;

/** One line of JSON or JavaScript: keys and JSX tags, strings, numbers, literals and keywords, comments, and punctuation each in their own color. */
function tokens(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const [whole, comment, str, colon, tag, name, nameColon, num, lit, arrow] = m;
    if (str) {
      out.push(<span key={at} className={colon ? 'tk-key' : 'tk-str'}>{str}</span>);
      if (colon) out.push(<span key={`${at}:`} className="tk-p">{colon}</span>);
    } else if (name) {
      out.push(<span key={at} className="tk-key">{name}</span>);
      out.push(<span key={`${at}:`} className="tk-p">{nameColon}</span>);
    } else {
      const cls = comment ? 'gap' : tag ? 'tk-key' : num ? 'tk-num' : lit || arrow ? 'tk-lit' : 'tk-p';
      out.push(<span key={at} className={cls}>{whole}</span>);
    }
    last = at + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A table that fills its box: as many rows as fit, then a "…" row for the rest. */
export function FitTable({ head, rows, num = [] }: { head: string[]; rows: (string | number)[][]; num?: number[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(Math.min(rows.length, 12));
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const measure = () => {
      const headRow = box.querySelector('thead tr'), row = box.querySelector('tbody tr');
      if (!headRow || !row) return;
      const rowH = row.getBoundingClientRect().height, headH = headRow.getBoundingClientRect().height;
      const fit = Math.floor((box.getBoundingClientRect().height - headH) / rowH) - 1;
      const next = Math.max(1, Math.min(rows.length, fit));
      if (Number.isFinite(next)) setShown((n) => (n === next ? n : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [rows.length]);
  return (
    <div ref={ref} className="talk-fit-table">
      <table className="talk-table">
        <thead><tr>{head.map((h, j) => <th key={h} className={num.includes(j) ? 'num' : undefined}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, shown).map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={num.includes(j) ? 'num' : undefined}>{v}</td>)}</tr>)}
          {shown < rows.length && <tr className="more">{head.map((h, j) => <td key={h} className={num.includes(j) ? 'num' : undefined}>…</td>)}</tr>}
        </tbody>
      </table>
    </div>
  );
}

/** Charts at their natural size, side by side under one shared scale, so their sizes compare. */
export function NaturalRow({ items }: { items: { spec: ChartAssemblyInput; caption: string }[] }) {
  return (
    <div className="talk-fit">
      <ScaleToFit height={0} fill maxScale={1.4}>
        <div className="talk-natural">
          {items.map(({ spec, caption }, i) => (
            <div key={i} className="talk-natural-item">
              <FlintChart spec={spec} renderer="svg" />
              <p>{caption}</p>
            </div>
          ))}
        </div>
      </ScaleToFit>
    </div>
  );
}
