/**
 * /dev/design: Flint's spec taken apart. One real spec sits on the left as a single block of code, its four
 * parts laid over it as transparent sheets, each joined to a brief note; the chart they compile to sits on the
 * right. Each part can be swapped on its own; the others stay put. Laid out in design units (DW x DH) that
 * scale with the page.
 */
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { INTERACTION_PRESET_TYPES, THEME_PRESETS, assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import { FlintChart } from 'flint-chart/react';
import type { ChartChange } from 'flint-chart/interactive';
import { OMNI_VIZ_GAME_ORDER } from 'flint-chart/test-data';
import { LONG_ROWS } from '../talk/data';
import { GITHUB_REPO, siteTheme } from '../shared/theme';
import flintLogo from '../assets/flint-logo.svg';
import { CHART_CATEGORIES } from '../shared/chart-categories';
import { condensedJson } from '../components/SpecPipelineFigure';
import { HOUSE_COUNT } from '../shared/house-themes';
import { SketchIcon } from './DevDesignIcons';

/** Counted as the home page counts them. */
const CHART_TYPE_COUNT = new Set(CHART_CATEGORIES.flatMap((c) => c.charts.map((chart) => chart.label.replace(/\s+\*$/u, '')))).size;
const BACKENDS = ['Vega-Lite', 'ECharts', 'Chart.js', 'Plotly', 'Excel'];
/** Presets plus the style-guide houses the themes page offers. */
const THEME_COUNT = Object.keys(THEME_PRESETS).length + HOUSE_COUNT;

/** 16:9, so a wide window is filled edge to edge. */
const DW = 1920;
const DH = 1080;
const u = (px: number) => `${(px / DW) * 100}cqw`;

const INK = 'rgba(0, 0, 0, 0.9)';
const BODY = 'rgba(0, 0, 0, 0.72)';
const MUTED = 'rgba(0, 0, 0, 0.6)';
const LINE = 'rgba(0, 0, 0, 0.12)';
const SHADOW = '0 1px 2px rgba(0,0,0,0.05), 0 12px 32px rgba(0,0,0,0.07)';
const ACCENT = siteTheme.accent;
const MONO = siteTheme.fontMono;

// Columns, in design units.
const TOP = 272;
const BOTTOM = 1016;
const SPEC_X = 64;
const SPEC_W = 540;
const NOTE_X = 664;
const NOTE_W = 380;
/** The compiled Vega-Lite stands as tall as the spec; the chart and the app float in front of it. */
const VL_X = 1160;
/** How far the chart and the app hang past the Vega-Lite's left edge, so they read as laid on top of it. */
const PEEK = 80;
const VL_W = DW - 64 - VL_X;
/** The chart card and the app panel below it, centred on the Vega-Lite, with its code showing above. */
const GROUP_TOP = TOP + 92;
const GROUP_BOTTOM = BOTTOM - 20;
const GROUP_GAP = 14;
const APP_H = 118;
const CARD_HEAD = 46;
const CARD_PAD = 18;
const MIN_CARD_W = 600;
/** The most room a chart may take: it is laid out at its own size, then shown smaller to fit. */
const CHART_MAX_W = VL_W + PEEK - 40 - CARD_PAD * 2;
const CHART_MAX_H = GROUP_BOTTOM - GROUP_TOP - GROUP_GAP - APP_H - CARD_HEAD - CARD_PAD * 2;

// ---------------------------------------------------------------- the example
type Part = 'data' | 'chart' | 'interaction' | 'theme';
type ChartKind = 'heatmap' | 'stacked' | 'faceted' | 'line';
interface Size { games: number; months: number }
interface State { data: Size; chart: ChartKind; interaction: 'click-group-focus' | 'hover-group-focus' | 'brush-x'; theme: string }
const START: State = { data: { games: 8, months: 24 }, chart: 'heatmap', interaction: 'click-group-focus', theme: 'economist' };

// The data's cardinality: the first n games, and the last m months up to December 2025.
const REGION_NAMES: Record<string, string> = { N: 'North', E: 'East', S: 'South', W: 'West' };
const GAMES = OMNI_VIZ_GAME_ORDER as readonly string[];
const PERIODS = [...new Set(LONG_ROWS.map((r) => r.period))].sort();
const GAME_RANGE: [number, number] = [2, GAMES.length];
const MONTH_RANGE: [number, number] = [3, PERIODS.length];
const sameSize = (a: Size, b: Size) => a.games === b.games && a.months === b.months;
function rowsFor({ games, months }: Size) {
  const keep = new Set(GAMES.slice(0, games)), from = PERIODS[PERIODS.length - months];
  return LONG_ROWS.filter((r) => keep.has(r.game) && r.period >= from)
    .map(({ period, game, region, newUsers }) => ({ period, game, region: REGION_NAMES[region] ?? region, newUsers }));
}
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (period: string) => `${MONTH_NAMES[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
const span = (months: number) => `${monthLabel(PERIODS[PERIODS.length - months])} to ${monthLabel(PERIODS[PERIODS.length - 1])}`;

const SUM = { field: 'newUsers', aggregate: 'sum' };
const SUM_LINES = ['      "y": { "field": "newUsers",', '        "aggregate": "sum" }'];
const CHARTS: Record<ChartKind, { chartType: string; subtitle: (months: number) => string; encodings: Record<string, unknown>; lines: string[] }> = {
  heatmap: {
    chartType: 'Heatmap', subtitle: (m) => `Monthly net change in active users, ${span(m)}`,
    encodings: { x: 'period', y: 'game', color: SUM },
    lines: ['      "x": "period", "y": "game",', '      "color": { "field": "newUsers",', '        "aggregate": "sum" }'],
  },
  stacked: {
    chartType: 'Stacked Bar Chart', subtitle: (m) => `Total net change in active users by region, ${span(m)}`,
    encodings: { x: 'game', y: SUM, color: 'region' },
    lines: ['      "x": "game", "color": "region",', ...SUM_LINES],
  },
  faceted: {
    chartType: 'Bar Chart', subtitle: (m) => `Total net change in active users by region, ${span(m)}`,
    encodings: { x: 'game', y: SUM, row: 'region' },
    lines: ['      "x": "game", "row": "region",', ...SUM_LINES],
  },
  line: {
    chartType: 'Line Chart', subtitle: (m) => `Monthly net change in active users by region, ${span(m)}`,
    encodings: { x: 'period', y: SUM, color: 'region' },
    lines: ['      "x": "period", "color": "region",', ...SUM_LINES],
  },
};
/** The series a click or hover focuses: the games, or the regions on the line chart, which draws no game. */
const groupOf = (chart: ChartKind) => (chart === 'line' ? 'region' : 'game');
const interaction = (type: State['interaction'], chart: ChartKind) => (type === 'brush-x' ? { type } : { type, options: { groupBy: groupOf(chart) } });

function input(s: State): ChartAssemblyInput {
  const chart = CHARTS[s.chart];
  return {
    data: { values: rowsFor(s.data) },
    semantic_types: { period: 'YearMonth', game: 'Category', region: 'Category', newUsers: 'Profit' },
    field_display_names: { period: 'Month', game: 'Game', region: 'Region', newUsers: 'Net new users' },
    chart_spec: {
      chartType: chart.chartType, title: 'Net new users by game', subtitle: chart.subtitle(s.data.months), encodings: chart.encodings,
      // Aims for a roomy plot and grows with denser data; the card then scales it down to fit.
      baseSize: { width: 480, height: 330 }, canvasSize: { width: 700, height: 500 },
    },
    theme_spec: s.theme,
    interaction_spec: { interactions: [interaction(s.interaction, s.chart)] },
  } as ChartAssemblyInput;
}

/** Top-level keys read first: what the chart draws, then how it is put together; `config` and the rest follow. */
const VL_FIRST = ['$schema', 'title', 'mark', 'encoding', 'layer', 'facet', 'spec', 'concat', 'vconcat', 'hconcat', 'params', 'transform', 'width', 'height'];
const VL_LAST = ['data', 'datasets', 'config'];
/** The width the compiled code wraps at, in characters. */
const VL_COLS = 66;

/** The Vega-Lite the compiler writes for the spec, its data rows folded away and its marks shown first. */
function compiled(spec: ChartAssemblyInput): string[] {
  const vl = assembleVegaLite(spec) as Record<string, unknown>;
  const rank = (k: string) => (VL_FIRST.includes(k) ? VL_FIRST.indexOf(k) : VL_LAST.includes(k) ? 100 + VL_LAST.indexOf(k) : 50);
  const ordered = Object.fromEntries(Object.keys(vl).filter((k) => k !== '$schema').sort((a, b) => rank(a) - rank(b)).map((k) => [k, vl[k]]));
  const rows = (v: unknown) => Array.isArray(v) && v.length > 20 && typeof v[0] === 'object';
  // Compact: short objects on one line, value lists (a sort order, axis values) packed and wrapped.
  const folded = JSON.parse(JSON.stringify(ordered, (_k, v) => (rows(v) ? '__ROWS__' : v)));
  return condensedJson(folded, VL_COLS).replace(/"__ROWS__"/g, '[...]').split('\n');
}

/** The whole spec as one block, each line tagged with the part that owns it. */
interface CodeRow { text: string; part?: Part }
function specRows(s: State): CodeRow[] {
  const own = (part: Part, texts: string[]) => texts.map((text) => ({ text, part }));
  return [
    { text: '{' },
    ...own('data', [
      `  "data": { "values": [...] },  // ${(s.data.games * s.data.months * 4).toLocaleString('en-US')} rows`, '  "semantic_types": {',
      '    "period": "YearMonth", "game": "Category",', '    "region": "Category", "newUsers": "Profit"', '  },',
    ]),
    { text: '' },
    ...own('chart', ['  "chart_spec": {', `    "chartType": "${CHARTS[s.chart].chartType}",`, '    "encodings": {', ...CHARTS[s.chart].lines, '    }', '  },']),
    { text: '' },
    ...own('interaction', ['  "interaction_spec": {', '    "interactions": [', ...(s.interaction === 'brush-x'
      ? ['      { "type": "brush-x" }']
      : [`      { "type": "${s.interaction}",`, `        "options": { "groupBy": "${groupOf(s.chart)}" } }`]), '    ]', '  },']),
    { text: '' },
    ...own('theme', [`  "theme_spec": "${s.theme}"`]),
    { text: '}' },
  ];
}

// ---------------------------------------------------------------- the four parts
const Term = ({ children }: { children: ReactNode }) => <span style={{ color: INK }}>{children}</span>;

interface PartDef { id: Part; title: string; color: string; note: ReactNode; choices?: { value: string; label: string }[] }

const PARTS: PartDef[] = [
  {
    id: 'data', title: 'Data spec', color: '#2f8f5b', note: <><Term>Semantic types</Term> drive parsing, scales, axes, formatting, and colors.</>,
  },
  {
    id: 'chart', title: 'Chart spec', color: '#2f6db5', note: <>High-level <Term>chart types and encodings</Term>; the compiler optimizes the layout.</>,
    choices: [{ value: 'heatmap', label: 'Heatmap' }, { value: 'stacked', label: 'Stacked bar' }, { value: 'faceted', label: 'Faceted' }, { value: 'line', label: 'Line' }],
  },
  {
    id: 'interaction', title: 'Interaction spec', color: '#d9534f', note: <><Term>{INTERACTION_PRESET_TYPES.length} presets</Term>; events resolve into semantic information.</>,
    choices: [{ value: 'click-group-focus', label: 'Click' }, { value: 'hover-group-focus', label: 'Hover' }, { value: 'brush-x', label: 'Brush' }],
  },
  {
    id: 'theme', title: 'Theme spec', color: '#e0892f', note: <>Geometry, typography, and color as one <Term>reusable formal spec</Term>.</>,
    choices: [{ value: 'economist', label: 'Economist' }, { value: 'nyt', label: 'NYT' }, { value: 'swiss', label: 'Swiss' }, { value: 'pop', label: 'Pop' }],
  },
];

const COLOR = Object.fromEntries(PARTS.map((p) => [p.id, p.color])) as Record<Part, string>;

// The code block, in design units.
const HEAD_H = 50;
const LINE_H = 27;
const CODE_TOP = TOP + HEAD_H + 12;
/** How far a layer reaches past the code block on each side, so it reads as a sheet laid over it. */
/** Where a part's bracket stands, just outside the spec's right edge. */
const GUTTER = 14;
const TICK = 7;
const LAYER_PAD = 5;
/** A note's height before it is measured. */
const NOTE_H = 140;
const NOTE_GAP = 18;
/** The most room between two notes, so a short column does not spread thin. */
const NOTE_GAP_MAX = 72;
/** How far above its layer a note may start. */
const NOTE_LIFT = 40;

/** Each part's layer, from the lines it owns. */
function layers(rows: CodeRow[]) {
  return PARTS.map((part) => {
    const first = rows.findIndex((r) => r.part === part.id);
    const last = rows.length - 1 - [...rows].reverse().findIndex((r) => r.part === part.id);
    return { id: part.id, color: part.color, top: CODE_TOP + first * LINE_H - LAYER_PAD, height: (last - first + 1) * LINE_H + LAYER_PAD * 2 };
  });
}

/** The notes as one evenly spaced column: equal gaps between them, from a little above the first layer down to the spec's bottom. */
function noteTops(ls: { top: number }[], heights: number[]) {
  const h = (i: number) => heights[i] ?? NOTE_H;
  const n = ls.length, total = ls.reduce((sum, _l, i) => sum + h(i), 0);
  const from = ls[0].top - NOTE_LIFT, to = BOTTOM;
  const gap = Math.min(NOTE_GAP_MAX, Math.max(NOTE_GAP, (to - from - total) / (n - 1)));
  const tops: number[] = [];
  // Centred in the room it has, so a short column does not hang from the top.
  let y = from + Math.max(0, (to - from - total - gap * (n - 1)) / 2);
  for (let i = 0; i < n; i++) { tops.push(y); y += h(i) + gap; }
  return tops;
}

// ---------------------------------------------------------------- the data pad
const PAD_W = 196;
const PAD_H = 96;
const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));
const toPad = ({ games, months }: Size) => ({
  x: (games - GAME_RANGE[0]) / (GAME_RANGE[1] - GAME_RANGE[0]),
  y: (months - MONTH_RANGE[0]) / (MONTH_RANGE[1] - MONTH_RANGE[0]),
});

/**
 * A two-dimensional slider for the data's size: right for more games, up for more months. The shaded block is
 * the table the chart reads, games by months. Drag, click, or use the arrow keys.
 */
function DataPad({ size, color, onChange }: { size: Size; color: string; onChange: (size: Size) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const at = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    // A little give at the edges, so the ends of each range are easy to hit.
    const f = (v: number) => Math.min(1, Math.max(0, v * 1.06 - 0.03));
    const fx = f((e.clientX - r.left) / r.width), fy = f((r.bottom - e.clientY) / r.height);
    onChange({
      games: Math.round(GAME_RANGE[0] + fx * (GAME_RANGE[1] - GAME_RANGE[0])),
      months: Math.round(MONTH_RANGE[0] + fy * (MONTH_RANGE[1] - MONTH_RANGE[0])),
    });
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 6 : 1;
    const next = { ...size };
    if (e.key === 'ArrowRight') next.games += 1;
    else if (e.key === 'ArrowLeft') next.games -= 1;
    else if (e.key === 'ArrowUp') next.months += step;
    else if (e.key === 'ArrowDown') next.months -= step;
    else return;
    e.preventDefault();
    onChange({ games: clamp(next.games, GAME_RANGE), months: clamp(next.months, MONTH_RANGE) });
  };
  const { x, y } = toPad(size);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: u(16) }}>
      <div
        ref={ref} className="fd-pad" role="slider" tabIndex={0} aria-label="Data size: games across, months up"
        aria-valuemin={GAME_RANGE[0]} aria-valuemax={GAME_RANGE[1]} aria-valuenow={size.games}
        aria-valuetext={`${size.games} games, ${size.months} months`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); at(e); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) at(e); }}
        onKeyDown={onKey}
        style={{ '--part': color, width: u(PAD_W), height: u(PAD_H) } as CSSProperties}
      >
        <div className="fd-pad-fill" style={{ width: `${x * 100}%`, height: `${y * 100}%`, minWidth: u(6), minHeight: u(6) }} />
        <div className="fd-pad-knob" style={{ left: `${x * 100}%`, bottom: `${y * 100}%` }} />
      </div>
      <div style={{ fontSize: u(15), lineHeight: 1.45, color: BODY, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        <div><strong style={{ color, fontWeight: 600 }}>{size.games}</strong> games <span aria-hidden style={{ color: 'rgba(0,0,0,0.3)' }}>→</span></div>
        <div><strong style={{ color, fontWeight: 600 }}>{size.months}</strong> months <span aria-hidden style={{ color: 'rgba(0,0,0,0.3)' }}>↑</span></div>
        <div style={{ fontSize: u(13), color: MUTED }}>{(size.games * size.months * 4).toLocaleString('en-US')} rows</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- code
const TOKEN = /(\/\/.*$)|("(?:[^"\\]|\\.)*")(\s*:)?|([{}[\],:])/g;
function CodeLine({ text, changed }: { text: string; changed?: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const [whole, comment, str, colon] = m;
    if (comment) out.push(<span key={at} style={{ color: 'rgba(0, 0, 0, 0.45)' }}>{comment}</span>);
    else if (str) {
      out.push(<span key={at} style={{ color: colon ? INK : ACCENT }}>{str}</span>);
      if (colon) out.push(<span key={`${at}:`} style={{ color: MUTED }}>{colon}</span>);
    } else out.push(<span key={at} style={{ color: MUTED }}>{whole}</span>);
    last = at + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <div className="fd-line" style={{ height: u(LINE_H), lineHeight: u(LINE_H), backgroundColor: changed ? `${changed}14` : 'transparent' }}>{out}</div>;
}

// ---------------------------------------------------------------- the app: what the chart's onChange reports
type Selected = ChartChange['state']['selected'];
interface Pick { elements: Selected; phase: ChartChange['phase'] }

/** A mark's month as `YYYY-MM`, read from a period string or a date, whichever the mark carries. */
function monthOf(v: unknown): string | null {
  if (typeof v === 'string' && /^\d{4}-\d{2}/.test(v)) return v.slice(0, 7);
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : NaN;
  // Half a month on, so a month's start reads the same in any time zone.
  return Number.isFinite(t) ? new Date(t + 15 * 864e5).toISOString().slice(0, 7) : null;
}

/** What the selected marks cover, summed from the rows the chart draws: the chart hands over meaning, the app owns the data. */
function summarize(elements: Selected, size: Size, byRange: boolean) {
  const games = new Set<string>(), months = new Set<string>(), regions = new Set<string>();
  for (const { value } of elements) {
    if (value.game != null) games.add(String(value.game));
    // Only a brush picks months; a click or hover focuses whole series.
    const m = byRange ? monthOf(value.period) : null;
    if (m) months.add(m);
    if (value.region != null) regions.add(String(value.region));
  }
  const shownMonths = PERIODS.slice(PERIODS.length - size.months);
  const inGames = games.size ? games : new Set(GAMES.slice(0, size.games));
  const inRegions = regions.size && regions.size < 4 ? regions : null;
  const byMonth = new Map(shownMonths.map((m) => [m, 0]));
  for (const r of rowsFor(size)) {
    if (!inGames.has(r.game) || (inRegions && !inRegions.has(r.region))) continue;
    byMonth.set(r.period, (byMonth.get(r.period) ?? 0) + r.newUsers);
  }
  const picked = months.size && months.size < shownMonths.length ? shownMonths.filter((m) => months.has(m)) : shownMonths;
  const total = picked.reduce((sum, m) => sum + (byMonth.get(m) ?? 0), 0);
  const best = picked.reduce((a, m) => ((byMonth.get(m) ?? 0) > (byMonth.get(a) ?? 0) ? m : a), picked[0]);
  const someGames = games.size > 0 && games.size < size.games;
  const someMonths = picked.length < shownMonths.length;
  const someRegions = regions.size > 0 && regions.size < 4;
  const who = someGames ? (games.size === 1 ? [...games][0] : `${games.size} games`)
    : someRegions ? `${[...regions].join(', ')}, all games` : 'All games';
  const when = someMonths ? (picked.length === 1 ? monthLabel(picked[0]) : `${monthLabel(picked[0])} to ${monthLabel(picked[picked.length - 1])}`) : null;
  return {
    title: when ? (someGames || someRegions ? `${who} · ${when}` : when) : who,
    total, best, months: picked.length,
    series: shownMonths.map((m) => byMonth.get(m) ?? 0),
    highlight: someMonths ? [shownMonths.indexOf(picked[0]), shownMonths.indexOf(picked[picked.length - 1])] as const : null,
  };
}

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

function Sparkline({ series, highlight, best, color }: { series: number[]; highlight: readonly [number, number] | null; best: number; color: string }) {
  const W = 220, H = 58, pad = 4;
  const lo = Math.min(0, ...series), hi = Math.max(0, ...series);
  const x = (i: number) => pad + (series.length < 2 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (series.length - 1));
  const y = (v: number) => pad + ((hi - v) * (H - 2 * pad)) / (hi - lo || 1);
  const step = series.length < 2 ? 8 : (W - 2 * pad) / (series.length - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: u(W), height: u(H), flex: 'none', overflow: 'visible' }} aria-hidden>
      {highlight && <rect x={x(highlight[0]) - step / 2} y={0} width={x(highlight[1]) - x(highlight[0]) + step} height={H} fill={color} opacity={0.12} rx={2} />}
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="rgba(0,0,0,0.25)" strokeDasharray="2 3" />
      <polyline points={series.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
      {best >= 0 && <circle cx={x(best)} cy={y(series[best])} r={3.2} fill={color} stroke="#fff" strokeWidth={1.2} />}
    </svg>
  );
}

const HINTS: Record<State['interaction'], (chart: ChartKind) => string> = {
  'click-group-focus': (chart) => `Click a ${groupOf(chart)}; its total and trend show here.`,
  'hover-group-focus': (chart) => `Hover a ${groupOf(chart)}; its total and trend show here.`,
  'brush-x': (chart) => (chart === 'heatmap' || chart === 'line' ? 'Brush a range of months; their total shows here.' : 'Brush a range of games; their total shows here.'),
};

/** A panel of the host app, outside the chart, that answers the chart's onChange. */
function AppPanel({ pick, state, color, swapped }: { pick: Pick | null; state: State; color: string; swapped: Part | null }) {
  const sum = pick && pick.elements.length ? summarize(pick.elements, state.data, state.interaction === 'brush-x') : null;
  const shown = PERIODS.slice(PERIODS.length - state.data.months);
  return (
    <div className="fd-app" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#fff', border: `1px solid ${LINE}`, borderRadius: u(14), boxShadow: SHADOW, overflow: 'hidden' }}>
      <div style={{ flex: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: u(36), padding: `0 ${u(16)}`, borderBottom: `1px solid ${LINE}` }}>
        <span className="fd-label" style={{ display: 'flex', alignItems: 'center', gap: u(8) }}>
          <span style={{ width: u(7), height: u(7), borderRadius: '50%', background: color, opacity: sum ? 1 : 0.4, transition: 'opacity .12s' }} />
          Your app
          {swapped && (
            <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>
              {' · '}onChange <span style={{ color: swapped === 'interaction' ? '#1a7f37' : undefined, fontWeight: swapped === 'interaction' ? 600 : 400 }}>unchanged</span>
            </span>
          )}
        </span>
        <code style={{ fontFamily: MONO, fontSize: u(12.5), color: MUTED }}>
          {'<FlintChart onChange={…} />'}{sum ? <span style={{ color }}> · {pick!.phase}</span> : null}
        </code>
      </div>
      {sum ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', gap: u(20), padding: `0 ${u(16)}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: u(18), fontWeight: 650, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sum.title}</div>
            <div style={{ marginTop: u(4), fontSize: u(14), color: BODY, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              <strong style={{ color: INK, fontWeight: 600 }}>{signed(sum.total)}</strong> net new users
              <span style={{ color: MUTED }}> · best {monthLabel(sum.best)}</span>
            </div>
          </div>
          <Sparkline series={sum.series} highlight={sum.highlight} best={shown.indexOf(sum.best)} color={color} />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: u(4), padding: `0 ${u(16)}`, fontSize: u(15), color: MUTED }}>
          <span>{HINTS[state.interaction](state.chart)}</span>
          {swapped === 'interaction' && (
            <span style={{ fontSize: u(13.5), color: BODY }}>
              New gesture, <strong style={{ color: INK, fontWeight: 600 }}>same app code</strong>: the chart reports which {groupOf(state.chart)}s and months, never pixels.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- edits
/** Lines added and removed from `a` to `b`: the longest common subsequence, in two rows of a table. */
function lineDiff(a: readonly string[], b: readonly string[]): { plus: number; minus: number } {
  let prevRow = new Uint16Array(b.length + 1), row = new Uint16Array(b.length + 1);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) row[j] = a[i] === b[j] ? prevRow[j + 1] + 1 : Math.max(prevRow[j], row[j + 1]);
    [prevRow, row] = [row, prevRow];
  }
  const same = prevRow[0];
  return { plus: b.length - same, minus: a.length - same };
}

/** `+n −m` for the last swap, in the add and remove colours; nothing before the first swap. */
function Edits({ diff }: { diff: { plus: number; minus: number } | null }) {
  if (!diff) return null;
  if (!diff.plus && !diff.minus) return <span>unchanged</span>;
  return (
    <span style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ color: '#1a7f37' }}>+{diff.plus}</span> <span style={{ color: '#cf222e' }}>−{diff.minus}</span>
    </span>
  );
}

// ---------------------------------------------------------------- page
const STYLES = `
.fd-page { height: 100vh; overflow-y: auto; background-color: #fff; color: ${INK}; font-family: ${siteTheme.fontSans}; -webkit-font-smoothing: antialiased;
  background-image: linear-gradient(90deg, rgba(0,0,0,0.02) 1px, transparent 1px), linear-gradient(0deg, rgba(0,0,0,0.02) 1px, transparent 1px);
  background-size: 24px 24px; }
.fd-chips { display: flex; align-items: center; flex: none; white-space: nowrap; }
.fd-chips button { font: inherit; font-size: ${u(16)}; line-height: ${u(18)}; padding: 0 ${u(12)}; border: 0; border-radius: 0; background: transparent; color: ${BODY}; cursor: pointer; transition: color .1s; }
.fd-chips button + button { border-left: 1px solid rgba(0, 0, 0, 0.18); }
.fd-chips button:first-child { padding-left: 0; }
.fd-chips button:hover { color: ${INK}; }
.fd-chips button[aria-pressed="true"] { color: var(--part); font-weight: 650; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 0.4em; }
.fd-chips button:focus { outline: none; }
.fd-chips button:focus-visible { outline: 1.5px solid var(--part); outline-offset: 2px; border-radius: 2px; }
.fd-pad { position: relative; flex: none; box-sizing: border-box; border: 1px solid rgba(0,0,0,0.2); background-color: #fff; border-radius: ${u(6)}; cursor: crosshair; touch-action: none;
  background-image: linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(0deg, rgba(0,0,0,0.05) 1px, transparent 1px);
  background-size: ${u(PAD_W / 11)} ${u(PAD_H / 6)}; background-position: -1px calc(100% + 1px); }
.fd-pad:focus { outline: none; }
.fd-pad:focus-visible { box-shadow: 0 0 0 2px color-mix(in srgb, var(--part) 40%, transparent); }
.fd-pad-fill { position: absolute; left: 0; bottom: 0; border-radius: ${u(4)} ${u(4)} ${u(4)} ${u(5)};
  background: color-mix(in srgb, var(--part) 20%, transparent); border-top: 1.5px solid var(--part); border-right: 1.5px solid var(--part); pointer-events: none; transition: width .08s, height .08s; }
.fd-pad-knob { position: absolute; width: ${u(14)}; height: ${u(14)}; margin: 0 0 ${u(-7)} ${u(-7)}; border-radius: 50%; background: var(--part);
  border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.3); pointer-events: none; }
.fd-line { white-space: pre; padding: 0 ${u(20)}; margin: 0 ${u(-20)}; transition: background .15s; }
.fd-move { transition: top .15s ease-out, height .15s ease-out, width .15s ease-out, left .15s ease-out, opacity .12s, background-color .12s, border-color .12s; }
.fd-leader, .fd-bracket { transition: d .15s ease-out, cy .15s ease-out, stroke-width .1s, opacity .12s; }
.fd-vl:focus-visible { box-shadow: 0 0 0 2px ${ACCENT}66 !important; }
.fd-points { margin: ${u(22)} 0 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: ${u(20)}; }
.fd-points li { display: flex; align-items: center; gap: ${u(14)}; padding: ${u(12)} ${u(18)} ${u(12)} ${u(12)}; background: #fff; border: 1px solid ${LINE}; border-radius: ${u(12)}; box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  font-size: ${u(17)}; line-height: 1.45; color: ${BODY}; }
.fd-icon { flex: none; width: ${u(100)}; height: ${u(75)}; }
.fd-points strong { font-weight: 600; color: ${INK}; }
.fd-sheet { outline: none; }
.fd-pin { cursor: pointer; border-radius: ${u(6)}; outline: none; }
.fd-pin:focus-visible { box-shadow: 0 0 0 2px ${ACCENT}55; }
.fd-label { font-size: ${u(12.5)}; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${MUTED}; }
`;

export function DevDesign() {
  const [state, setState] = useState<State>(START);
  const [prev, setPrev] = useState<State>(START);
  const [hovered, setActive] = useState<Part | null>(null);
  // A part pinned by a click: its lines are tinted, and its bracket and curve drawn heavier.
  const [pinned, setPinned] = useState<Part | null>(null);
  const active = pinned ?? hovered;
  useEffect(() => {
    if (!pinned) return undefined;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setPinned(null); };
    // A click anywhere but on a part's code or note lets the part go; the swap buttons and the pad keep it.
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (!el?.closest('.fd-sheet, .fd-pin, .fd-chips, .fd-pad')) setPinned(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [pinned]);
  const [vlFront, setVlFront] = useState(false);
  // While the code is in front, a click on the chart or the app brings the chart back without reaching the chart.
  const backToChart = useCallback((e: { stopPropagation: () => void; preventDefault: () => void }) => {
    if (!vlFront) return;
    e.stopPropagation();
    e.preventDefault();
    setVlFront(false);
  }, [vlFront]);
  useEffect(() => {
    if (!vlFront) return undefined;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setVlFront(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [vlFront]);
  // Design units to pixels, and the chart's natural size, so its card wraps the chart at the page's scale.
  const stageRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const [natural, setNatural] = useState({ width: 420, height: 360 });
  // The chart is laid out at its own size, then shown smaller to fit its room, never cropped.
  const fit = Math.min(1, CHART_MAX_W / natural.width, CHART_MAX_H / natural.height);
  // The card wraps the chart; the app panel sits under it at the same width; the two centre on the Vega-Lite.
  const chartW = natural.width * fit, chartH = natural.height * fit;
  const cardW = Math.max(MIN_CARD_W, chartW + CARD_PAD * 2), cardH = CARD_HEAD + CARD_PAD * 2 + chartH;
  const groupTop = GROUP_TOP + Math.max(0, (GROUP_BOTTOM - GROUP_TOP - (cardH + GROUP_GAP + APP_H)) / 2);
  // Always hanging past the Vega-Lite's left edge; a wider chart grows to the right, inside it.
  const cardLeft = VL_X - PEEK;
  useLayoutEffect(() => {
    const stage = stageRef.current, chart = chartRef.current;
    if (!stage || !chart) return undefined;
    const measure = () => {
      setK(stage.clientWidth / DW);
      if (chart.offsetWidth && chart.offsetHeight) setNatural({ width: chart.offsetWidth, height: chart.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    ro.observe(chart);
    return () => ro.disconnect();
  }, []);
  // While the pad is dragged the chart follows a step behind, so the drag stays smooth.
  const shown = useDeferredValue(state);
  const spec = useMemo(() => input(shown), [shown]);
  const vl = useMemo(() => compiled(spec), [spec]);
  // What the last swap changed, in each language.
  const prevVl = useRef<string[] | null>(null);
  const [vlDiff, setVlDiff] = useState<{ plus: number; minus: number } | null>(null);
  useEffect(() => {
    if (prevVl.current && prevVl.current !== vl) setVlDiff(lineDiff(prevVl.current, vl));
    prevVl.current = vl;
  }, [vl]);
  // What the chart reports through onChange; a new spec starts over.
  const [pick, setPick] = useState<Pick | null>(null);
  useEffect(() => setPick(null), [spec]);
  const onChartChange = useCallback((change: ChartChange) => {
    setPick(change.state.selected.length ? { elements: change.state.selected, phase: change.phase } : null);
  }, []);
  const choose = <P extends Part>(part: P, value: State[P]) => {
    const same = part === 'data' ? sameSize(state.data, value as Size) : state[part] === value;
    if (same) return;
    setPrev(state);
    setState({ ...state, [part]: value });
  };
  // Notes stack by their measured heights, in design units.
  const noteRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [noteHeights, setNoteHeights] = useState<number[]>([]);
  useLayoutEffect(() => {
    const els = noteRefs.current.filter((el): el is HTMLDivElement => !!el);
    const measure = () => {
      const scale = (stageRef.current?.clientWidth ?? DW) / DW;
      const next = noteRefs.current.map((el) => (el ? el.offsetHeight / scale : NOTE_H));
      setNoteHeights((h) => (h.length === next.length && h.every((v, i) => Math.abs(v - next[i]) < 0.5) ? h : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    els.forEach((el) => ro.observe(el));
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, []);
  const hover = (id: Part) => ({ onMouseEnter: () => setActive(id), onMouseLeave: () => setActive(null) });
  const pin = (id: Part) => ({ onClick: () => setPinned((p) => (p === id ? null : id)) });
  const rows = specRows(state);
  const before = specRows(prev);
  // The part the last swap changed.
  const lastSwap = state === prev ? null : PARTS.find((p) => (p.id === 'data' ? !sameSize(state.data, prev.data) : state[p.id] !== prev[p.id]))?.id ?? null;
  const specDiff = state === prev ? null : lineDiff(before.map((r) => r.text), rows.map((r) => r.text));
  const owned = (part: Part, list: CodeRow[]) => new Set(list.filter((r) => r.part === part).map((r) => r.text));
  const previous = Object.fromEntries(PARTS.map((p) => [p.id, owned(p.id, before)])) as Record<Part, Set<string>>;
  const sheets = layers(rows);
  const notes = noteTops(sheets, noteHeights);

  return (
    <div className="fd-page">
      <style>{STYLES}</style>
      <section style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box' }}>
        <div ref={stageRef} style={{ position: 'relative', width: `min(100%, calc((100vh - 32px) * ${DW / DH}))`, aspectRatio: `${DW} / ${DH}`, containerType: 'inline-size' }}>
          <header style={{ position: 'absolute', top: u(32), left: u(SPEC_X), right: u(64) }}>
            <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: u(14), fontSize: u(48), fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1.05, color: INK }}>
              <img src={flintLogo} alt="" style={{ width: u(52), height: u(52) }} />
              Flint: A simple semantic-driven language for good-looking visualizations
            </h1>
            <ul className="fd-points">
              <li>
                <span className="fd-icon"><SketchIcon kind="agent" label="An agent beside the chart it made" /></span>
                <span>Flint lets AI agents <strong>reliably create expressive, good-looking and interactive charts</strong> from simple, human-editable specs.</span>
              </li>
              <li>
                <span className="fd-icon"><SketchIcon kind="untangle" label="Tangled threads straightened into three" /></span>
                <span>Traditionally, good-looking charts rely on verbose <strong>low-level details</strong> that entangle visual, style and interaction logic. Flint pushes these challenges to the compiler so that the spec stays simple.</span>
              </li>
              <li>
                <span className="fd-icon"><SketchIcon kind="many" label="Many charts in many looks" /></span>
                <span>
                  Flint supports <strong>{CHART_TYPE_COUNT} chart types</strong> across <strong>{BACKENDS.length} rendering backends</strong>,{' '}
                  <strong>{THEME_COUNT} themes</strong> and <strong>{INTERACTION_PRESET_TYPES.length} interaction presets</strong>. It's easy to customize, too!
                </span>
              </li>
            </ul>
          </header>

          {/* The spec: one block of code. */}
          <div style={{
            position: 'absolute', top: u(TOP), left: u(SPEC_X), width: u(SPEC_W), height: u(BOTTOM - TOP), boxSizing: 'border-box',
            background: '#fff', border: `1px solid ${LINE}`, borderRadius: u(16), boxShadow: SHADOW,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: u(HEAD_H), padding: `0 ${u(20)}`, borderBottom: `1px solid ${LINE}` }}>
              <span className="fd-label">Flint spec<span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}> · {rows.length} lines{specDiff ? <> · <Edits diff={specDiff} /></> : null}</span></span>
            </div>
            <div style={{ position: 'absolute', top: u(CODE_TOP - TOP), left: u(20), right: u(20), fontFamily: MONO, fontSize: u(15), color: INK }}>
              {rows.map((r, i) => <CodeLine key={i} text={r.text} changed={r.part && !previous[r.part].has(r.text) ? COLOR[r.part] : undefined} />)}
            </div>
          </div>

          {/* Each part's lines: nothing drawn on the code; a tint of its colour while hovered, stronger while pinned. A click pins it. */}
          {sheets.map((sheet) => (
            <div key={sheet.id} className="fd-move fd-sheet" {...hover(sheet.id)} {...pin(sheet.id)} onMouseDown={(e) => e.preventDefault()} role="button" tabIndex={-1}
              aria-pressed={pinned === sheet.id} aria-label={`Highlight the ${sheet.id} spec`} style={{
              position: 'absolute', top: u(sheet.top), height: u(sheet.height), left: u(SPEC_X + 1), width: u(SPEC_W - 2), cursor: 'pointer',
              backgroundColor: pinned === sheet.id ? `${sheet.color}14` : active === sheet.id ? `${sheet.color}0b` : 'transparent',
            }} />
          ))}

          {/* Each part: a rounded bracket in the gutter, its curly middle flowing in one smooth line to the part's title. */}
          <svg viewBox={`0 0 ${DW} ${DH}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
            {sheets.map((sheet, i) => {
              const xb = SPEC_X + SPEC_W + GUTTER, x2 = NOTE_X - 12;
              const top = sheet.top + LAYER_PAD, bottom = sheet.top + sheet.height - LAYER_PAD, mid = (top + bottom) / 2;
              const r = Math.min(TICK, (bottom - top) / 4), y2 = notes[i] + 17;
              // From the bracket's middle, a curve that leaves level and lands level on the title.
              const span = x2 - xb;
              const on = active === sheet.id;
              return (
                <g key={sheet.id}>
                  <path className="fd-bracket" fill="none" stroke={sheet.color} strokeWidth={pinned === sheet.id ? 3 : on ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round"
                    d={`M ${xb - TICK} ${top} Q ${xb} ${top} ${xb} ${top + r} V ${bottom - r} Q ${xb} ${bottom} ${xb - TICK} ${bottom}`} />
                  <path className="fd-leader" fill="none" stroke={sheet.color} strokeOpacity={on ? 0.9 : 0.55} strokeWidth={pinned === sheet.id ? 2.2 : on ? 1.8 : 1.4} strokeLinecap="round"
                    d={`M ${xb} ${mid} C ${xb + span * 0.55} ${mid} ${x2 - span * 0.55} ${y2} ${x2} ${y2}`} />
                </g>
              );
            })}
          </svg>

          {PARTS.map((part, i) => (
            <div key={part.id} ref={(el) => { noteRefs.current[i] = el; }} className="fd-move fd-note" {...hover(part.id)}
              style={{ position: 'absolute', top: u(notes[i]), left: u(NOTE_X), width: u(NOTE_W) }}>
              <div {...pin(part.id)} role="button" tabIndex={0} aria-pressed={pinned === part.id}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPinned((p) => (p === part.id ? null : part.id)); } }}
                onMouseDown={(e) => e.preventDefault()} className="fd-pin">
                <div style={{ height: u(34), display: 'flex', alignItems: 'center', gap: u(10), fontSize: u(23), fontWeight: 600, letterSpacing: '-0.015em', color: INK, whiteSpace: 'nowrap' }}>{part.title}</div>
                <div style={{ marginTop: u(4), fontSize: u(17), lineHeight: 1.5, color: BODY }}>{part.note}</div>
              </div>
              <div style={{ marginTop: u(12) }}>
                {part.choices ? (
                  <div className="fd-chips" role="group" aria-label={`Swap the ${part.title.toLowerCase()}`} style={{ '--part': part.color } as CSSProperties}>
                    {part.choices.map((c) => (
                      <button key={c.value} type="button" aria-pressed={state[part.id] === c.value} onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choose(part.id as Exclude<Part, 'data'>, c.value as never)}>{c.label}</button>
                    ))}
                  </div>
                ) : (
                  <DataPad size={state.data} color={part.color} onChange={(size) => choose('data', size)} />
                )}
              </div>
            </div>
          ))}

          {/* What the compiler wrote: the Vega-Lite behind the chart, as tall as the spec. A click brings it forward; another sends it back. */}
          <div role="button" tabIndex={0} aria-pressed={vlFront} aria-label="Show the compiled Vega-Lite"
            onMouseDown={(e) => e.preventDefault()} onClick={() => setVlFront((v) => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVlFront((v) => !v); } }}
            className="fd-vl" style={{
            position: 'absolute', top: u(TOP), left: u(VL_X), width: u(VL_W), height: u(BOTTOM - TOP), boxSizing: 'border-box', zIndex: vlFront ? 3 : 1,
            display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fafafa', border: `1px solid ${LINE}`, borderRadius: u(16),
            boxShadow: vlFront ? '0 18px 44px rgba(0,0,0,0.16)' : SHADOW, transition: 'box-shadow .12s', cursor: 'pointer', outline: 'none',
          }}>
            <div style={{ flex: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: u(44), padding: `0 ${u(16)}`, borderBottom: `1px solid ${LINE}` }}>
              <span className="fd-label">Compiled Vega-Lite</span>
              <span style={{ fontSize: u(14), color: MUTED }}>
                {vl.length.toLocaleString('en-US')} lines{vlDiff ? <> · <Edits diff={vlDiff} /></> : null}
              </span>
            </div>
            <pre style={{
              flex: 1, minHeight: 0, margin: `0 ${u(26)} 0 0`, padding: `${u(10)} ${u(16)}`, overflow: 'hidden', fontFamily: MONO, fontSize: u(11.5), lineHeight: u(16.5),
              color: 'rgba(0, 0, 0, 0.62)', maskImage: 'linear-gradient(to bottom, #000 85%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, #000 85%, transparent)',
            }}>{vl.slice(0, vlFront ? 120 : 60).join('\n')}</pre>
          </div>

          {/* The chart, in a card sized to it, floating in front of the Vega-Lite. While the code is in front, a click on the part that peeks out brings the chart back. */}
          <div className="fd-move" onClickCapture={backToChart} title={vlFront ? 'Show the chart' : undefined} style={{
            cursor: vlFront ? 'pointer' : undefined,
            position: 'absolute', left: u(cardLeft), top: u(groupTop), width: u(cardW), height: u(cardH), zIndex: 2, boxSizing: 'border-box',
            background: '#fff', border: `1px solid ${LINE}`, borderRadius: u(16), boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 18px 44px rgba(0,0,0,0.12)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: u(CARD_HEAD), padding: `0 ${u(16)}`, borderBottom: `1px solid ${LINE}` }}>
              <span className="fd-label">Compiled chart</span>
              <span style={{ fontSize: u(14), color: MUTED }}>Vega-Lite</span>
            </div>
            <div style={{ width: u(chartW), height: u(chartH), margin: `${u(CARD_PAD)} auto` }}>
              <div ref={chartRef} style={{ display: 'inline-block', transform: `scale(${k * fit})`, transformOrigin: '0 0' }}>
                <FlintChart key={`${shown.chart}|${shown.interaction}`} spec={spec} renderer="svg" onChange={onChartChange} />
              </div>
            </div>
          </div>

          {/* The host app, outside the chart, reading what the reader picked. */}
          <div className="fd-move" onClickCapture={backToChart} style={{ position: 'absolute', left: u(cardLeft), top: u(groupTop + cardH + GROUP_GAP), width: u(cardW), height: u(APP_H), zIndex: 2, cursor: vlFront ? 'pointer' : undefined }}>
            <AppPanel pick={pick} state={shown} color={COLOR.interaction} swapped={lastSwap} />
          </div>

          <footer style={{ position: 'absolute', bottom: u(24), right: u(DW - VL_X - VL_W), fontSize: u(14), color: MUTED, display: 'flex', alignItems: 'center', gap: u(10) }}>
            <span>Open source · MIT License</span>
            <span style={{ width: 1, height: u(12), background: LINE }} />
            <a href={GITHUB_REPO} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>github.com/microsoft/flint-chart</a>
          </footer>
        </div>
      </section>
    </div>
  );
}
