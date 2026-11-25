/**
 * Canvas squeeze: the test bed for the layout's canvas fit. Charts are set in a small box and
 * measured from the SVG Vega drew: how much of the box the chart area got, and what the title,
 * keys, labels and chrome took. Each case is shown as planned and as the canvas fit lays it out,
 * where the fit changes it.
 */
import { Fragment, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { assembleVegaLite, THEME_PRESETS, type ChartAssemblyInput } from 'flint-chart';
import { naturalAspectRange, shapeDivergence, widenRange, FALLBACK_WIDEN, type AspectRange } from '../../../../packages/flint-js/src/core/natural-shape';
import type { View } from 'vega';
import { VegaLiteView } from '../../components/VegaLiteView';
import { siteTheme } from '../../shared/theme';
import { CASES, type SqueezeCase, type SqueezeIssue } from './cases';

interface Rect { x: number; y: number; width: number; height: number }
type PartRole = 'title' | 'legend' | 'yLabels' | 'xLabels' | 'axisTitle' | 'header' | 'chrome';
interface Part { role: PartRole; rect: Rect }

interface Measured {
  drawn: { width: number; height: number };
  panels: Rect[];
  parts: Part[];
  /** What the host scales the drawing by to show it in the box. */
  scale: number;
  /** The plot panels' area over the drawing's: what is left once the furniture has taken its room. */
  plotShare: number;
  /** The drawing's area, as shown, over the box's: under 100% where the chart does not fill its box. */
  boxUsed: number;
  /**
   * The chart area: the plot with its own axes, or for panels the whole grid with its headers and
   * axes, read as one area.
   */
  area: Rect;
  /** The share of the drawing's width beside the chart area, and of its height above and below it: title, deck, keys, chrome. */
  around: { width: number; height: number };
  /** In the worst panel, the share its own y labels take of the width beside it, and its own x labels of the height below it. */
  labelShare: { y: number; x: number };
  /** Width over height of the first panel. */
  aspect: number;
  /** The shapes, width over height, a chart of this base takes on its own: its base stretched on either side. */
  naturalRange: AspectRange;
  /** How far the chart area lies outside them, as a ratio: 1 inside, above 1 too wide, below 1 too tall. */
  natural: number;
  /**
   * How far the shapes drift, as a ratio of aspects (1 is none): the drawing's against its box's,
   * and the chart area's against the base size's.
   */
  drift: { drawing: number; area: number; around: number };
  /** The shortest side of a panel as shown, in px. */
  minSide: number;
  /** Room around the union of the panels, in drawn px. */
  margins: { top: number; bottom: number; left: number; right: number };
  /** Each criterion, passed, strayed from, or failed. */
  checks: Check[];
  /** Why the chart reads as squeezed; empty where it does not. */
  flags: string[];
  /** What is off without hurting the reading: a drawing a little larger than its box. */
  notes: string[];
}

/** A criterion as the chart meets it: green where it passes, yellow where it strays, red where it fails. */
type CheckStatus = 'pass' | 'warn' | 'fail';
interface Check { id: string; label: string; status: CheckStatus; detail: string }

/** Below these a chart reads as squeezed. */
const LIMITS = { scale: 0.7, around: 0.4, labels: 0.4, natural: 1.1, minSide: 100, overrun: 12, drift: 1.35 };

const PART_STYLE: Record<PartRole | 'plot', { color: string; label: string }> = {
  plot: { color: '#2f6fbd', label: 'Plot' },
  title: { color: '#7c4dcc', label: 'Title and deck' },
  legend: { color: '#1f8a6b', label: 'Keys' },
  yLabels: { color: '#c27b1a', label: 'Y labels' },
  xLabels: { color: '#c2452f', label: 'X labels' },
  axisTitle: { color: '#a3497f', label: 'Axis titles' },
  header: { color: '#2a8fa3', label: 'Panel headers' },
  chrome: { color: '#6b7a1f', label: 'House chrome' },
};

const ISSUE_LABEL: Record<SqueezeIssue, string> = {
  header: 'Header', legend: 'Keys', labels: 'Labels', facets: 'Panels', footer: 'Chrome', tile: 'Tile', control: 'Control',
  keysTop: 'Theme: keys on top', keysBottom: 'Theme: keys below', bigTitle: 'Theme: big title', doubleKeys: 'Theme: colour + size keys',
  discreteFew: 'Few bands', discreteMany: 'Many bands',
};

function union(rects: Rect[]): Rect | undefined {
  if (!rects.length) return undefined;
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.width));
  const y2 = Math.max(...rects.map((r) => r.y + r.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Which sides of a spec's plot its bands set: a stated step is a banded side. */
function bandedSides(spec: any): { x: boolean; y: boolean } {
  const plot = spec?.spec ?? spec;
  return { x: typeof plot?.width === 'object' && plot.width?.step != null, y: typeof plot?.height === 'object' && plot.height?.step != null };
}

function measure(svg: SVGSVGElement, view: View, box: { width: number; height: number }, base: { width: number; height: number }, banded = { x: false, y: false }): Measured {
  const drawn = { width: Number(svg.getAttribute('width')) || 0, height: Number(svg.getAttribute('height')) || 0 };
  const outer = svg.getBoundingClientRect();
  const k = outer.width / (drawn.width || 1);
  const rectOf = (el: Element): Rect | undefined => {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return undefined;
    return { x: (r.left - outer.left) / k, y: (r.top - outer.top) / k, width: r.width / k, height: r.height / k };
  };
  const all = (selector: string) => Array.from(svg.querySelectorAll(selector)).map(rectOf).filter((r): r is Rect => Boolean(r));

  // Panels: each facet cell's background, else the single view's: Vega-Lite draws the plot as the
  // root group, so its background is the plot.
  let panels = all('g.mark-group.cell > g > path.background');
  if (!panels.length) panels = all('g.mark-group.role-frame.root > g > path.background').slice(0, 1);
  if (!panels.length) {
    const [ox, oy] = view.origin();
    const signal = (name: string) => { try { return Number(view.signal(name)) || 0; } catch { return 0; } };
    const width = signal('width') || signal('child_width');
    const height = signal('height') || signal('child_height');
    if (width && height) panels = [{ x: ox, y: oy, width, height }];
  }
  const plot = union(panels) ?? { x: 0, y: 0, width: 0, height: 0 };

  const parts: Part[] = [];
  const push = (role: PartRole, rects: Rect[]) => {
    const u = union(rects);
    if (u) parts.push({ role, rect: u });
  };
  // Facets reuse `role-title` for each panel's label (inside the cell) and keep the shared axes in
  // their header groups: the chart's title is the one outside all of them, a header is its text.
  const FACET_GROUPS = 'g.cell, g.role-column-title, g.role-row-title, g.role-column-header, g.role-row-header, g.role-column-footer, g.role-row-footer';
  const outside = (selector: string) => Array.from(svg.querySelectorAll(selector)).filter((el) => !el.parentElement?.closest(FACET_GROUPS));
  push('title', outside('g.role-title').map(rectOf).filter((r): r is Rect => Boolean(r)));
  for (const legend of all('g.role-legend')) parts.push({ role: 'legend', rect: legend });
  const labels = all('g.role-axis-label > *');
  push('yLabels', labels.filter((r) => r.x + r.width <= plot.x + 1));
  push('xLabels', labels.filter((r) => r.y >= plot.y + plot.height - 1));
  for (const title of all('g.role-axis-title')) parts.push({ role: 'axisTitle', rect: title });
  const headers = all('g.cell .role-title-text, g.role-column-title .role-title-text, g.role-row-title .role-title-text, g.role-column-header .role-title-text, g.role-row-header .role-title-text');
  // Header text outside the grid takes room off it: one strip per edge.
  push('header', headers.filter((r) => r.y + r.height <= plot.y + 1));
  push('header', headers.filter((r) => r.x + r.width <= plot.x + 1));
  push('header', headers.filter((r) => r.x >= plot.x + plot.width - 1));
  for (const item of all('g.flint-canvas-furniture > *')) parts.push({ role: 'chrome', rect: item });

  const scale = Math.min(1, box.width / (drawn.width || 1), box.height / (drawn.height || 1));
  const panelArea = panels.reduce((sum, p) => sum + p.width * p.height, 0);
  const plotShare = panelArea / ((drawn.width * drawn.height) || 1);
  const boxUsed = (drawn.width * drawn.height * scale * scale) / (box.width * box.height);
  const first = panels[0];
  const facet = panels.length > 1;
  const aspect = first ? first.width / (first.height || 1) : 0;
  const minSide = first ? Math.min(...panels.map((p) => Math.min(p.width, p.height))) * scale : 0;
  const margins = {
    top: plot.y, bottom: drawn.height - (plot.y + plot.height), left: plot.x, right: drawn.width - (plot.x + plot.width),
  };
  const checks: Check[] = [];
  const check = (id: string, label: string, status: CheckStatus, detail: string) => checks.push({ id, label, status, detail });
  // A drawing a little larger than its box reads fine shrunk; text shrunk past this is too small.
  check('fit', 'Fits its box', scale < LIMITS.scale ? 'fail' : scale < 0.97 ? 'warn' : 'pass',
    scale < LIMITS.scale ? `shown at ${pct(scale)}: text too small` : scale < 0.97 ? `overflows its box: shown at ${pct(scale)}` : 'inside its box');
  // Two trade-offs, read apart. The chart area against what is set around it: the title, deck, keys
  // and chrome. Each panel against its own labels: the y labels beside it, the x labels below it.
  const axisTitles = all('g.role-axis-title');
  const area = union([plot, ...labels, ...axisTitles, ...headers]) ?? plot;
  const around = { width: 1 - area.width / (drawn.width || 1), height: 1 - area.height / (drawn.height || 1) };
  // What is around the chart area squeezes it, or bends the drawing out of shape, only where the
  // box holds it in: a drawing with room to spare in its box is shown as drawn.
  const held = scale < 0.99;
  const crowdedHigh = held && around.height > LIMITS.around;
  const crowdedWide = held && around.width > LIMITS.around;
  check('around', 'Room around', crowdedHigh || crowdedWide ? 'fail' : 'pass',
    crowdedHigh ? `title, keys and chrome take ${pct(around.height)} of the height`
      : crowdedWide ? `keys and chrome take ${pct(around.width)} of the width`
        : `title, keys, chrome: ${pct(around.height)} of the height, ${pct(around.width)} of the width`);
  const own = [...labels, ...axisTitles];
  const labelShare = { y: 0, x: 0 };
  for (const p of panels) {
    // A panel's own labels: those beside or below it, short of the next panel in its row or column.
    const leftBound = Math.max(-Infinity, ...panels.filter((q) => q !== p && q.x + q.width <= p.x && q.y < p.y + p.height && q.y + q.height > p.y).map((q) => q.x + q.width));
    const lowBound = Math.min(Infinity, ...panels.filter((q) => q !== p && q.y >= p.y + p.height && q.x < p.x + p.width && q.x + q.width > p.x).map((q) => q.y));
    const ys = own.filter((r) => r.x + r.width <= p.x + 1 && r.x >= leftBound - 1 && r.y + r.height / 2 >= p.y && r.y + r.height / 2 <= p.y + p.height);
    const xs = own.filter((r) => r.y >= p.y + p.height - 1 && r.y + r.height <= lowBound + 1 && r.x + r.width / 2 >= p.x && r.x + r.width / 2 <= p.x + p.width);
    if (ys.length) {
      const width = p.x - Math.min(...ys.map((r) => r.x));
      labelShare.y = Math.max(labelShare.y, width / (width + p.width));
    }
    if (xs.length) {
      const depth = Math.max(...xs.map((r) => r.y + r.height)) - (p.y + p.height);
      labelShare.x = Math.max(labelShare.x, depth / (depth + p.height));
    }
  }
  const whose = facet ? 'a panel’s' : 'the chart’s';
  check('labels', 'Own labels', labelShare.y > LIMITS.labels || labelShare.x > LIMITS.labels ? 'fail' : 'pass',
    labelShare.y > LIMITS.labels ? `y labels take ${pct(labelShare.y)} of ${whose} width`
      : labelShare.x > LIMITS.labels ? `x labels take ${pct(labelShare.x)} of ${whose} height`
        : `y ${pct(labelShare.y)} of ${whose} width, x ${pct(labelShare.x)} of its height`);
  // The chart area — the plot, or the panels as one grid, with their own labels — against the
  // shapes a chart of this base takes on its own, as the compiler judges it: green inside them;
  // yellow where no arrangement reaches them but the chart sits in the looser range round its
  // base; red past that too. A little past an end is the compiler's estimate of the labels
  // against the drawn ones.
  const naturalRange = naturalAspectRange(base, { x: box.width / base.width, y: box.height / base.height });
  const looser = widenRange(naturalRange, FALLBACK_WIDEN);
  const areaAspect = area.width / (area.height || 1);
  const inside = (range: AspectRange) => Math.abs(Math.log(shapeDivergence({ lo: areaAspect, hi: areaAspect }, range))) <= Math.log(LIMITS.natural);
  const natural = shapeDivergence({ lo: areaAspect, hi: areaAspect }, naturalRange);
  const span = (range: AspectRange) => `${range.lo.toFixed(2)}–${range.hi.toFixed(2)}`;
  // A shape the data sets is not the layout's to change: the long side is set by its bands, and the
  // short one is set by bands too or already stretched as far as the box allows.
  const atCap = (side: 'x' | 'y') => side === 'x' ? plot.width >= box.width - 4 : plot.height >= box.height - 4;
  const wide = areaAspect > naturalRange.hi;
  const setByBands = !inside(naturalRange) && (wide ? banded.x && (banded.y || atCap('y')) : banded.y && (banded.x || atCap('x')));
  check('shape', 'Own shape', inside(naturalRange) || setByBands ? 'pass' : inside(looser) ? 'warn' : 'fail',
    inside(naturalRange) ? `chart area ${areaAspect.toFixed(2)}:1, inside its base’s ${span(naturalRange)}`
      : setByBands ? `chart area ${areaAspect.toFixed(2)}:1, set by its bands (${banded.x && banded.y ? 'its cells' : wide ? 'its columns' : 'its rows'}): the data's shape, not the layout's`
        : `chart area ${areaAspect.toFixed(2)}:1, past its base’s ${span(naturalRange)}${inside(looser) ? ', inside the looser ' : ' and the looser '}${span(looser)}`);
  check('size', 'Plot size', !facet && minSide && minSide < LIMITS.minSide ? 'fail' : 'pass',
    facet ? `${panels.length} panels, read as one` : `shortest side ${Math.round(minSide)}px`);
  // An axis title longer than its axis runs past the plot's ends: it reads as spilling out.
  for (const part of facet ? [] : parts) {
    if (part.role !== 'axisTitle') continue;
    const r = part.rect;
    const beside = r.x + r.width <= plot.x + 1 || r.x >= plot.x + plot.width - 1;
    const middle = beside ? r.y + r.height / 2 : r.x + r.width / 2;
    const panel = panels.find((p) => beside ? middle >= p.y && middle <= p.y + p.height : middle >= p.x && middle <= p.x + p.width) ?? plot;
    const overrun = beside ? r.height - panel.height : r.width - panel.width;
    if (overrun > LIMITS.overrun) check('axisTitle', 'Axis titles', 'fail', `${beside ? 'y' : 'x'}-axis title ${Math.round(overrun)}px longer than its axis`);
  }
  if (!checks.some((c) => c.id === 'axisTitle')) check('axisTitle', 'Axis titles', 'pass', facet ? 'not judged on panels' : 'within their axes');
  // A title and a row of keys above a plot are a house's design: what is around the chart counts
  // toward the shape only past a quarter of the chart area's height above and below it, a third of
  // its width beside it — as the compiler judges it.
  const shaped = {
    width: area.width + Math.max(0, drawn.width - area.width - area.width * 0.33),
    height: area.height + Math.max(0, drawn.height - area.height - area.height * 0.25),
  };
  const drift = {
    drawing: (shaped.width / (shaped.height || 1)) / (box.width / box.height),
    area: (area.width / (area.height || 1)) / (base.width / base.height),
    around: 1,
  };
  // What the title, keys and chrome do to the shape, apart from what the chart area does itself:
  // a square plot under two rows of keys still makes a tall drawing in a square box.
  drift.around = drift.drawing / drift.area;
  const wider = held && drift.around > LIMITS.drift;
  const taller = held && drift.around < 1 / LIMITS.drift;
  check('drift', 'Drawing shape', wider || taller ? 'fail' : 'pass',
    wider ? `keys and chrome stretch the drawing ${drift.around.toFixed(1)}× wider than its box`
      : taller ? `title, keys and chrome stretch the drawing ${(1 / drift.around).toFixed(1)}× taller than its box`
        : `what is around it bends the drawing ${Math.max(drift.around, 1 / drift.around).toFixed(2)}× from its box’s shape`);
  const flags = checks.filter((c) => c.status === 'fail').map((c) => c.detail);
  const notes = checks.filter((c) => c.status === 'warn').map((c) => c.detail);
  return { checks, drawn, panels, parts, scale, plotShare, boxUsed, area, around, labelShare, aspect, naturalRange, natural, drift, minSide, margins, flags: [...new Set(flags)], notes };
}

/**
 * How the host sizes the chart: every chart gets the same base size and an allowance to grow under
 * pressure, so its box is the base times the allowance.
 */
export interface Setup { id: string; base: { width: number; height: number }; stretch: number }
export const SETUPS: Setup[] = [
  { id: '300x300x1.5', base: { width: 300, height: 300 }, stretch: 1.5 },
  { id: '200x200x1.2', base: { width: 200, height: 200 }, stretch: 1.2 },
  { id: '300x300x1', base: { width: 300, height: 300 }, stretch: 1 },
  { id: '400x300x1.5', base: { width: 400, height: 300 }, stretch: 1.5 },
  // The Theme Lab's chart wall: a wide base in a narrow card.
  { id: '300x200x1.5', base: { width: 300, height: 200 }, stretch: 1.5 },
];
export const setupLabel = (setup: Setup) => `${setup.base.width} × ${setup.base.height}, ×${setup.stretch}`;

/** The box the chart has to fit, which it is measured against. */
export const boxOf = (setup: Setup) => ({ width: Math.round(setup.base.width * setup.stretch), height: Math.round(setup.base.height * setup.stretch) });

/** The chart as planned, or as the canvas fit lays it out (`options.canvasFit`). */
type Layout = 'off' | 'auto';

interface Compiled { spec?: any; error?: string; ms: number; fit?: any }

function compile(c: SqueezeCase, setup: Setup, layout: Layout, refit = true): Compiled {
  const started = performance.now();
  try {
    const input = structuredClone(c.input) as unknown as ChartAssemblyInput;
    (input as any).options = { ...((input as any).options ?? {}), canvasFit: layout, canvasRefit: refit };
    (input.chart_spec as any).baseSize = setup.base;
    (input.chart_spec as any).canvasSize = boxOf(setup);
    if (c.theme) (input as any).theme_spec = c.theme;
    const spec: any = assembleVegaLite(input);
    return { spec, ms: performance.now() - started, fit: spec._canvasFit };
  } catch (error) {
    return { error: String(error), ms: performance.now() - started };
  }
}

/** What the reader sees: an issue where a check fails, a warning where one only strays, a fit where all pass. */
type Verdict = 'issue' | 'warning' | 'fit';
const verdictOf = (m: Measured | undefined): Verdict | undefined =>
  !m ? undefined : m.flags.length ? 'issue' : m.notes.length ? 'warning' : 'fit';
const VERDICTS: { id: Verdict; label: string; lead: string }[] = [
  { id: 'issue', label: 'Issue', lead: 'Some check red: the plot looks bad — squashed, tiny, out of shape, shrunk past legibility.' },
  { id: 'warning', label: 'Warning', lead: 'Some check yellow, none red: the chart reads, but is drawn a little larger than its box, or out of its own shape where no arrangement could keep it.' },
  { id: 'fit', label: 'Fit', lead: 'Every check green.' },
];

const pct = (v: number) => `${Math.round(v * 100)}%`;
const px = (v: number) => `${Math.round(v)}`;

/** The room each kind of part takes off the plot: its height above or below, its width beside. */
function roomTable(m: Measured) {
  const plot = union(m.panels);
  if (!plot) return [];
  const rows: { role: PartRole; side: string; px: number }[] = [];
  for (const part of m.parts) {
    const r = part.rect;
    let side = 'over';
    let room = 0;
    if (r.y + r.height <= plot.y + 1) { side = 'above'; room = r.height; }
    else if (r.y >= plot.y + plot.height - 1) { side = 'below'; room = r.height; }
    else if (r.x + r.width <= plot.x + 1) { side = 'left'; room = r.width; }
    else if (r.x >= plot.x + plot.width - 1) { side = 'right'; room = r.width; }
    if (room) rows.push({ role: part.role, side, px: room });
  }
  const merged = new Map<string, { role: PartRole; side: string; px: number }>();
  for (const row of rows) {
    const key = `${row.role}:${row.side}`;
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, px: Math.max(prev.px, row.px) } : row);
  }
  return [...merged.values()];
}

function CaseCard({ c, setup, compiled, measureKey, tag, mode, showParts, measured, onMeasured }: {
  c: SqueezeCase; setup: Setup; compiled: Compiled; measureKey: string; tag?: string;
  mode: 'fit' | 'natural'; showParts: boolean; measured?: Measured; onMeasured: (id: string, m: Measured) => void;
}) {
  const key = measureKey;
  const box = useMemo(() => boxOf(setup), [setup]);
  const onReady = useCallback((svg: SVGSVGElement, view: View) => {
    // Furniture is appended after render; measure on the next frame so it is in place.
    const frame = requestAnimationFrame(() => onMeasured(key, measure(svg, view, box, setup.base, bandedSides(compiled.spec))));
    return () => cancelAnimationFrame(frame);
  }, [key, box, setup, compiled, onMeasured]);
  const scale = mode === 'fit' ? measured?.scale ?? 1 : 1;
  const theme = c.theme ? THEME_PRESETS[c.theme]?.label ?? c.theme : 'Flint default';
  const verdict = verdictOf(measured);
  const room = measured ? roomTable(measured) : [];
  // As drawn, the stage holds whichever is larger: the box or the drawing.
  const stage = mode === 'natural' && measured
    ? { width: Math.max(box.width, measured.drawn.width), height: Math.max(box.height, measured.drawn.height) }
    : { width: box.width, height: box.height };

  return (
    <article className="squeeze-card" id={key} style={{ width: Math.max(280, stage.width) + 30 }}>
      <header>
        <div className="squeeze-card-title">
          <strong>{c.name}</strong>
          <span className="squeeze-tag">{ISSUE_LABEL[c.issue]}</span>
          {tag && <span className="squeeze-tag" data-remedy>{tag}</span>}
        </div>
        <p>{c.note}</p>
        {c.expect && <p className="squeeze-expect"><b>Should:</b> {c.expect}</p>}
        <code>{theme} · {String(c.input.chart_spec.chartType)}</code>
      </header>
      <div className="squeeze-stage" style={stage}>
        <div className="squeeze-box" style={{ width: box.width, height: box.height }} />
        {compiled.error !== undefined ? <pre className="squeeze-error">{compiled.error}</pre> : (
          <div className="squeeze-drawing" style={{ transform: `scale(${scale})` }}>
            <VegaLiteView spec={compiled.spec} renderer="svg" onReady={onReady} />
            {measured && showParts && (
              <div className="squeeze-overlay" style={{ width: measured.drawn.width, height: measured.drawn.height }}>
                {measured.parts.map((part, i) => (
                  <div key={i} className="squeeze-part" style={rectStyle(part.rect, PART_STYLE[part.role].color, false)} />
                ))}
                <div className="squeeze-part" style={{ ...rectStyle(measured.area, '#555', false), borderStyle: 'dotted' }} />
                {measured.panels.map((panel, i) => (
                  <div key={`p${i}`} className="squeeze-part" style={rectStyle(panel, PART_STYLE.plot.color, true)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {measured && (
        <footer>
          <div className="squeeze-verdict" data-verdict={verdict}>
            {verdict === 'issue' ? 'Issue' : verdict === 'warning' ? 'Warning' : 'Fit'}
          </div>
          <ul className="squeeze-checks">
            {measured.checks.map((check) => (
              <li key={check.id} data-status={check.status}><i /><b>{check.label}</b> {check.detail}</li>
            ))}
          </ul>
          <dl>
            <dt>Plot</dt><dd>{pct(measured.plotShare)} of the drawing{measured.panels.length > 1 ? `, ${measured.panels.length} panels` : ''}</dd>
            <dt>Panel</dt><dd>{px(measured.panels[0]?.width ?? 0)} × {px(measured.panels[0]?.height ?? 0)} ({measured.aspect.toFixed(2)}:1)</dd>
            <dt>Drawn</dt><dd>{px(measured.drawn.width)} × {px(measured.drawn.height)}{measured.scale < 1 ? `, shown at ${pct(measured.scale)}` : ''}, {pct(measured.boxUsed)} of the box used</dd>
            <dt>Margins</dt><dd>top {px(measured.margins.top)} · bottom {px(measured.margins.bottom)} · left {px(measured.margins.left)} · right {px(measured.margins.right)}</dd>
          </dl>
          {room.length > 0 && (
            <ul className="squeeze-room">
              {room.map((r) => (
                <li key={`${r.role}:${r.side}`}>
                  <i style={{ background: PART_STYLE[r.role].color }} />
                  {PART_STYLE[r.role].label} <span>{r.side} · {px(r.px)}px</span>
                </li>
              ))}
            </ul>
          )}
        </footer>
      )}
    </article>
  );
}

function rectStyle(r: Rect, color: string, fill: boolean): CSSProperties {
  return {
    left: r.x, top: r.y, width: r.width, height: r.height,
    border: `1.5px ${fill ? 'solid' : 'dashed'} ${color}`,
    background: fill ? `${color}14` : 'transparent',
  };
}

export function CanvasSqueeze() {
  const [mode, setMode] = useState<'fit' | 'natural'>('fit');
  const [setupId, setSetupId] = useState(SETUPS[0].id);
  const setup = SETUPS.find((s) => s.id === setupId) ?? SETUPS[0];
  const chooseSetup = (id: string) => { setMeasured({}); setSetupId(id); };
  const [showParts, setShowParts] = useState(true);
  const [refit, setRefit] = useState(true);
  const chooseRefit = (on: boolean) => { setMeasured({}); setRefit(on); };
  const [measured, setMeasured] = useState<Record<string, Measured>>({});
  const onMeasured = useCallback((id: string, m: Measured) => setMeasured((prev) => ({ ...prev, [id]: m })), []);

  // Each case as the canvas fit lays it out, once per setup.
  const compiled = useMemo(() => Object.fromEntries(CASES.map((c) => [c.id, compile(c, setup, 'auto', refit)])) as Record<string, Compiled>, [setup, refit]);
  // For inspecting the fit records from the console and the browser tools.
  useEffect(() => { (window as any).__squeeze = { compiled, measured }; }, [compiled, measured]);
  const pending = CASES.filter((c) => !measured[c.id]).length;
  const times = CASES.map((c) => compiled[c.id]?.ms ?? 0);
  // Issues first, then warnings, then fits; a case not yet measured last.
  const order: (Verdict | 'pending')[] = ['issue', 'warning', 'fit', 'pending'];
  const groupOf = (c: SqueezeCase) => verdictOf(measured[c.id]) ?? 'pending';
  const sorted = [...CASES].sort((a, b) => order.indexOf(groupOf(a)) - order.indexOf(groupOf(b)));
  const firstOf = new Map<string, string>();
  for (const c of sorted) if (!firstOf.has(groupOf(c))) firstOf.set(groupOf(c), c.id);
  const sizeOf = (group: Verdict | 'pending') => CASES.filter((c) => groupOf(c) === group).length;

  return (
    <div className="squeeze-page">
      <style>{styles}</style>
      <h1>Canvas squeeze</h1>
      <p className="squeeze-lead squeeze-goal">
        <b>The canvas fit.</b> Some charts do not read well in the box a host gives them: the title, keys and chrome take
        the chart's room, or push the drawing out of the box's shape, or the host has to shrink it past legibility. The
        layout's canvas fit catches these from the plan, before anything is drawn, and lays the chart out again; a chart
        that reads well as planned is never changed. This page shows every case as planned and as the fit lays it out.
      </p>
      <div className="squeeze-logic">
        <div>
          <h3>What it aims for</h3>
          <ol>
            <li><b>Fitting:</b> the drawing enters its box legibly — a host may shrink it a little, never past {pct(LIMITS.scale)}.</li>
            <li><b>Balance:</b> the title, keys and chrome take at most {pct(LIMITS.around)} of the drawing's height or width; a panel's own labels at most {pct(LIMITS.labels)} of it.</li>
            <li><b>Shape:</b> nothing around the chart stretches the drawing more than {LIMITS.drift}× out of its box's shape — past what a title and a row of keys take as a matter of course.</li>
            <li><b>Own shape:</b> the chart area — the plot with its labels — sits in the shapes its base takes on its own, from the base with its height stretched to the base with its width stretched (green). Where no arrangement of its bands can reach them, it sits in a range {FALLBACK_WIDEN}× looser round its base (yellow); past that it is red — unless its bands set the shape (a grid's cells, or bands beside a side already stretched to the box), which is the data's shape, not the layout's.</li>
          </ol>
        </div>
        <div>
          <h3>How it decides</h3>
          <ol>
            <li><b>Put each problem down to its parts.</b> Too wide: the keys beside the plot. Too tall: the keys stacked above or below, and the title only where it is most of what stands there. A title and a row of keys above a plot are the theme's design, allowed for: only a header much larger than that bends the shape.</li>
            <li><b>The least edit a reader would notice, one at a time:</b> keys in one row on their edge; names wrapped — a key's, or, where the chart area itself is too wide, the names down the y axis; the title a size down; one of several keys on an edge moved to another; every key to another edge; the title two sizes down; names wrapped down the y axis a size or two smaller, where their two-line rows make the chart too tall. Never an edit that makes text already too small smaller still. Only the culprit's edits, each priced on one scale; of those that clear, the cheapest is kept, and how its result reads only tells edits alike apart. Two together only where none clears alone.</li>
            <li><b>Then the plot.</b> Where the box cannot hold the chart legibly as it is, the plot comes down, keeping its shape. The fit never lays a chart out larger for the host to shrink: one that still overflows is drawn at its size, for the reader to scroll or the host to scale.</li>
            <li><b>A chart drawn a little past its box</b> (a warning) gets only the gentlest edits — keys in a row on their edge, names wrapped, or names wrapped down the y axis a size or two smaller — kept where they bring it at least 3 points nearer its box with nothing going wrong.</li>
            <li><b>Then the plot, once more.</b> With the title and keys settled, the plot is laid out again, once, in the room the box leaves it at the scale it is shown: a continuous side grows into it, never past its stretch cap, the chart area staying within the looser range of its own shapes. Kept only where the text is no smaller, nothing new goes wrong, and the drawing reads better.</li>
            <li><b>The title spans the drawing.</b> A headline and deck may run over keys beside the plot, not just over the plot and its labels.</li>
          </ol>
        </div>
      </div>

      <div className="squeeze-controls">
        <div role="group" aria-label="Size">
          {SETUPS.map((s) => (
            <button key={s.id} type="button" aria-pressed={setupId === s.id} onClick={() => chooseSetup(s.id)}
              title={`baseSize ${s.base.width} × ${s.base.height}, canvasSize ${boxOf(s).width} × ${boxOf(s).height}`}>
              {setupLabel(s)}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Drawing">
          <button type="button" aria-pressed={mode === 'fit'} onClick={() => setMode('fit')}>Shrunk into the box</button>
          <button type="button" aria-pressed={mode === 'natural'} onClick={() => setMode('natural')}>As drawn</button>
        </div>
        <label><input type="checkbox" checked={showParts} onChange={(e) => setShowParts(e.target.checked)} /> Outline the parts</label>
        <label title="Once the title and keys are settled, lay the plot out once more in the room the box leaves it (options.canvasRefit)"><input type="checkbox" checked={refit} onChange={(e) => chooseRefit(e.target.checked)} /> Refit the plot</label>
        <ul className="squeeze-key">
          {Object.entries(PART_STYLE).map(([role, s]) => <li key={role}><i style={{ background: s.color }} />{s.label}</li>)}
        </ul>
      </div>

      <p className="squeeze-tab-lead">
        Every case as the canvas fit lays it out, grouped by its checks:{' '}
        {VERDICTS.map((x, i) => <span key={x.id}>{i ? ', ' : ''}<b className="squeeze-count" data-verdict={x.id}>{sizeOf(x.id)} {x.label.toLowerCase()}</b></span>)}
        {pending > 0 ? `, ${pending} measuring` : ''}. Compile: {(times.reduce((a, b) => a + b, 0) / Math.max(1, times.length)).toFixed(1)} ms a chart on average, {Math.max(...times).toFixed(0)} ms at most.
      </p>

      <section className="squeeze-cases">
        {sorted.map((c) => {
          const group = groupOf(c);
          const heading = VERDICTS.find((x) => x.id === group);
          const fit = compiled[c.id];
          return (
            <Fragment key={`${setup.id}:${refit}:${c.id}`}>
              {firstOf.get(group) === c.id && (
                <h2 className="squeeze-group" data-verdict={group}>
                  {heading ? <>{heading.label}<span>{sizeOf(group)}</span> <small>{heading.lead}</small></> : <>Measuring<span>{sizeOf(group)}</span></>}
                </h2>
              )}
              <CaseCard c={c} setup={setup} compiled={fit} measureKey={c.id}
                tag={fit.fit?.treatment ? `Fit: ${describe(fit.fit.treatment)}` : undefined}
                mode={mode} showParts={showParts} measured={measured[c.id]} onMeasured={onMeasured} />
            </Fragment>
          );
        })}
      </section>
    </div>
  );
}

/** A treatment in words. */
function describe(treatment: any): string {
  if (!treatment) return 'as planned';
  const parts: string[] = [];
  if (treatment.keys) parts.push(treatment.keys === 'side' ? 'keys beside' : `keys ${treatment.keys === 'top' ? 'above' : 'below'}, one row`);
  if (treatment.oneKey) parts.push(`${treatment.oneKey.title ?? 'one'} key ${treatment.oneKey.to === 'side' ? 'beside' : treatment.oneKey.to === 'top' ? 'above' : 'below'}`);
  if (treatment.rowNames) parts.push(`row names ${treatment.rowNames}px`);
  if (treatment.plotSpace) parts.push(`plot refit${treatment.plotSpace.width ? ` ${treatment.plotSpace.width}w` : ''}${treatment.plotSpace.height ? ` ${treatment.plotSpace.height}h` : ''}`);
  if (treatment.titleScale) parts.push(`title ${Math.round(treatment.titleScale * 100)}%`);
  if (treatment.names) parts.push(`key names ${treatment.names.keyWidth}px`);
  if (treatment.plotScale) parts.push(`plot ${Math.round(treatment.plotScale * 100)}%`);
  return parts.join(' + ') || 'as planned';
}

const styles = `
  .squeeze-page { position: relative; max-width: 1400px; margin: 0 auto; padding: 24px 24px 80px; color: ${siteTheme.text}; }
  .squeeze-page h1 { font-size: 28px; margin: 0 0 8px; }
  .squeeze-page h2 { font-size: 18px; margin: 0 0 6px; }
  .squeeze-goal { color: ${siteTheme.text} !important; }
  .squeeze-lead { max-width: 900px; margin: 0 0 8px; color: ${siteTheme.textMuted}; line-height: 1.55; }
  .squeeze-controls { position: sticky; top: 0; z-index: 3; display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; margin: 16px 0; padding: 10px 0; background: ${siteTheme.bg}; border-bottom: 1px solid ${siteTheme.border}; font-size: 13px; }
  .squeeze-controls [role="group"] { display: inline-flex; gap: 2px; padding: 2px; border-radius: 7px; background: rgba(0,0,0,0.05); }
  .squeeze-controls button { border: 0; background: transparent; padding: 4px 10px; border-radius: 5px; font: inherit; color: ${siteTheme.textMuted}; cursor: pointer; }
  .squeeze-controls button[aria-pressed="true"] { background: ${siteTheme.surface}; color: ${siteTheme.text}; box-shadow: 0 1px 2px rgba(31,35,40,0.16); font-weight: 600; }
  .squeeze-key { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0; padding: 0; list-style: none; color: ${siteTheme.textMuted}; }
  .squeeze-key i, .squeeze-room i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
  .squeeze-grid { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
  .squeeze-card { background: ${siteTheme.surface}; border: 1px solid ${siteTheme.border}; border-radius: 10px; padding: 14px; scroll-margin-top: 70px; }
  .squeeze-card > header { max-width: 100%; margin-bottom: 10px; }
  .squeeze-card-title { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .squeeze-card-title strong { font-size: 14px; margin-right: 4px; }
  .squeeze-card p { margin: 4px 0; font-size: 12.5px; color: ${siteTheme.textMuted}; line-height: 1.45; }
  .squeeze-card code { font-size: 11.5px; color: ${siteTheme.textMuted}; }
  .squeeze-tag { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: rgba(0,0,0,0.06); color: ${siteTheme.textMuted}; }
  .squeeze-tag[data-kind="squeezed"] { background: #fdecea; color: #b3261e; }
  .squeeze-tag[data-kind="healthy"] { background: #e6f4ea; color: #1e7b34; }
  .squeeze-stage { position: relative; overflow: hidden; background: #fff; }
  .squeeze-box { position: absolute; left: 0; top: 0; z-index: 2; pointer-events: none; outline: 1.5px dashed #444; }
  .squeeze-drawing { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
  .squeeze-overlay { position: absolute; left: 0; top: 0; pointer-events: none; }
  .squeeze-part { position: absolute; box-sizing: border-box; }
  .squeeze-error { color: #b3261e; font-size: 12px; white-space: pre-wrap; }
  .squeeze-card > footer { margin-top: 10px; font-size: 12px; }
  .squeeze-verdict { display: inline-block; margin-bottom: 6px; padding: 2px 8px; border-radius: 4px; background: #e6f4ea; color: #1e7b34; font-weight: 600; }
  .squeeze-verdict[data-verdict="issue"] { background: #fdecea; color: #b3261e; }
  .squeeze-verdict[data-verdict="warning"] { background: #fff4e0; color: #8a5300; }
  .squeeze-checks { list-style: none; margin: 0 0 8px; padding: 0; display: grid; gap: 2px; }
  .squeeze-checks li { display: flex; gap: 6px; align-items: baseline; line-height: 1.35; }
  .squeeze-checks li i { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 50%; background: #1e7b34; transform: translateY(-1px); }
  .squeeze-checks li[data-status="warn"] i { background: #d08a00; }
  .squeeze-checks li[data-status="fail"] i { background: #b3261e; }
  .squeeze-checks li b { flex: 0 0 auto; font-weight: 600; }
  .squeeze-checks li[data-status="pass"] { color: ${siteTheme.textMuted}; }
  .squeeze-group { flex: 0 0 100%; margin: 18px 0 0; padding: 6px 0 6px 10px; border-left: 4px solid #1e7b34; font-size: 17px; }
  .squeeze-group[data-verdict="issue"] { border-color: #b3261e; }
  .squeeze-group[data-verdict="warning"] { border-color: #d08a00; }
  .squeeze-group[data-verdict="pending"] { border-color: #aaa; }
  .squeeze-group span { margin-left: 8px; font-weight: 500; opacity: 0.6; }
  .squeeze-group small { margin-left: 10px; font-size: 13px; font-weight: 400; opacity: 0.75; }
  .squeeze-count[data-verdict="issue"] { color: #b3261e; }
  .squeeze-count[data-verdict="warning"] { color: #8a5300; }
  .squeeze-count[data-verdict="fit"] { color: #1e7b34; }
  .squeeze-expect { margin: 4px 0 0; font-size: 12px; color: ${siteTheme.text} !important; }
  .squeeze-tab-lead { max-width: 1000px; margin: 10px 0 14px; font-size: 13px; color: ${siteTheme.textMuted}; line-height: 1.5; }
  .squeeze-tag[data-remedy] { background: #e8eefb; color: #2f4f8f; }
  .squeeze-logic { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 28px; max-width: 1180px; margin: 6px 0 14px; font-size: 13px; line-height: 1.5; color: ${siteTheme.textMuted}; }
  .squeeze-logic h3 { margin: 0 0 4px; font-size: 13px; color: ${siteTheme.text}; }
  .squeeze-logic ol { margin: 0; padding-left: 18px; }
  .squeeze-logic b { color: ${siteTheme.text}; }
  .squeeze-cases { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
  /* The line is the text's to keep readable; the row is the paragraph's, so no card sits beside it. */
  .squeeze-card dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; }
  .squeeze-card dt { color: ${siteTheme.textMuted}; }
  .squeeze-card dd { margin: 0; font-variant-numeric: tabular-nums; }
  .squeeze-room { display: flex; flex-wrap: wrap; gap: 2px 12px; margin: 6px 0 0; padding: 0; list-style: none; }
  .squeeze-room span { color: ${siteTheme.textMuted}; }
`;
