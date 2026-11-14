import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import { mountChart, type ChartUpdate } from 'flint-chart/interactive';
import { expressionInterpreter } from 'vega-interpreter';
import { siteTheme } from '../shared/theme';

// ---------------------------------------------------------------- data

function seeded(seed: number): () => number {
  let state = seed;
  return () => (state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

/** Lead samples in two collections, numbered by rank as in the Flint water chart. */
const SAMPLES = (() => {
  const rand = seeded(7);
  return ([['Virginia Tech', 140], ['MDEQ', 60]] as const).flatMap(([collection, count]) => {
    const leads = Array.from({ length: count }, () => Math.round(rand() ** 4 * 160 * 10) / 10).sort((a, b) => a - b);
    return leads.map((lead, index) => ({
      collection, sample: index + 1, lead, range: lead > 15 ? 'Above 15 ppb' : '15 ppb or below',
    }));
  });
})();

const MONTHS = Array.from({ length: 24 }, (_, index) => `${2024 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`);

/** Monthly output by source, in three regions. */
const OUTPUT = ['North', 'South', 'East'].flatMap((region, r) => ['Solar', 'Wind', 'Hydro'].flatMap((source, s) =>
  MONTHS.map((month, m) => ({
    month, region, source,
    output: Math.round(40 + 12 * s + 8 * r + 18 * Math.sin((m + 3 * s) / 3.5) + m * 0.8),
  }))));

function scatterInput(facet: boolean, chartType = 'Scatter Plot'): ChartAssemblyInput {
  return {
    data: { values: SAMPLES },
    semantic_types: { lead: 'Quantity', sample: 'Rank', range: 'Category', collection: 'Category' },
    field_display_names: { lead: 'Lead (ppb)', sample: 'Sample number' },
    chart_spec: {
      chartType,
      title: `${SAMPLES.filter((row) => row.lead > 15).length} of ${SAMPLES.length} water samples exceed 15 ppb`,
      subtitle: 'Each dot is one sample, ranked by lead',
      encodings: {
        x: { field: 'lead' }, y: { field: 'sample' }, color: { field: 'range' },
        ...(facet ? { row: { field: 'collection' } } : {}),
      },
      baseSize: { width: 340, height: facet ? 300 : 230 },
    },
  } as ChartAssemblyInput;
}

function lineInput(facet: 'none' | 'column' | 'row'): ChartAssemblyInput {
  const regions = facet === 'row' ? ['North', 'South'] : facet === 'column' ? ['North', 'South', 'East'] : ['North'];
  return {
    data: { values: OUTPUT.filter((row) => regions.includes(row.region)) },
    semantic_types: { month: 'YearMonth', output: 'Quantity', source: 'Category', region: 'Category' },
    field_display_names: { output: 'Output (GWh)' },
    chart_spec: {
      chartType: 'Line Chart',
      title: 'Monthly output by source',
      subtitle: facet === 'none' ? 'North region, 2024 to 2025' : 'By region, 2024 to 2025',
      encodings: {
        x: { field: 'month' }, y: { field: 'output' }, color: { field: 'source' },
        ...(facet === 'column' ? { column: { field: 'region' } } : facet === 'row' ? { row: { field: 'region' } } : {}),
      },
      baseSize: { width: facet === 'column' ? 480 : 360, height: facet === 'row' ? 300 : 220 },
    },
  } as ChartAssemblyInput;
}

function barsInput(): ChartAssemblyInput {
  const rand = seeded(11);
  const rows = Array.from({ length: 30 }, (_, index) => ({
    station: `Station ${String.fromCharCode(65 + (index % 26))}${index >= 26 ? 2 : ''}`,
    samples: Math.round(20 + rand() * 180),
  }));
  return {
    data: { values: rows },
    semantic_types: { station: 'Name', samples: 'Count' },
    chart_spec: {
      chartType: 'Bar Chart',
      title: 'Samples taken at each station',
      encodings: { x: { field: 'samples' }, y: { field: 'station', sortBy: 'x', sortOrder: 'descending' } },
      baseSize: { width: 340, height: 300 },
    },
  } as ChartAssemblyInput;
}

function withInteractions(input: ChartAssemblyInput, interactions: unknown[]): ChartAssemblyInput {
  return { ...input, interaction_spec: { interactions } } as unknown as ChartAssemblyInput;
}

function region(name: string, value: Record<string, unknown>): ChartUpdate {
  return { id: name, ops: [{ op: 'annotate-region', name, value }] } as unknown as ChartUpdate;
}

// ---------------------------------------------------------------- geometry

type Rect = { left: number; top: number; right: number; bottom: number };
type Point = { x: number; y: number };
/** Where the chart drew its plots and itself, in client px. */
type Geometry = { views: Rect[]; chart: Rect };
type Locate = (geometry: Geometry) => Point;

const inView = (index: number, fx: number, fy: number): Locate => ({ views }) => {
  const view = views[Math.min(index, views.length - 1)];
  return { x: view.left + (view.right - view.left) * fx, y: view.top + (view.bottom - view.top) * fy };
};
/** A point `dx`, `dy` px past the drawn chart's right or bottom edge (negative: past its left or top). */
const pastChart = (dx: number, dy: number): Locate => ({ chart }) => ({
  x: dx > 0 ? chart.right + dx : dx < 0 ? chart.left + dx : (chart.left + chart.right) / 2,
  y: dy > 0 ? chart.bottom + dy : dy < 0 ? chart.top + dy : (chart.top + chart.bottom) / 2,
});

const TOLERANCE = 1.5;

function intersect(a: Rect, b: Rect): Rect | undefined {
  const rect = { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) };
  return rect.right - rect.left > 0.5 && rect.bottom - rect.top > 0.5 ? rect : undefined;
}

function rectOf(element: Element): Rect {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  return { left, top, right, bottom };
}

/** What of an element is on screen: its box cut by every clipping ancestor inside the host. */
function visibleRect(element: Element, host: HTMLElement): Rect | undefined {
  let rect: Rect | undefined = rectOf(element);
  for (let node = element.parentElement; rect && node && node !== host.parentElement; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (/hidden|clip/.test(style.overflow) || /hidden|clip/.test(style.overflowX)) rect = intersect(rect, rectOf(node));
  }
  return rect;
}

function readGeometry(host: HTMLElement, surface: ReturnType<typeof mountChart>): Geometry | undefined {
  const renderer = host.querySelector<SVGSVGElement>('svg.marks');
  const views = surface.layout?.views?.filter((view) => view.role === 'plot');
  if (!renderer || !views?.length) return undefined;
  const chart = rectOf(renderer);
  const viewBox = renderer.viewBox.baseVal;
  const sx = viewBox?.width ? (chart.right - chart.left) / viewBox.width : 1;
  const sy = viewBox?.height ? (chart.bottom - chart.top) / viewBox.height : 1;
  return {
    chart,
    views: views.map(({ box }) => ({
      left: chart.left + box.x * sx, top: chart.top + box.y * sy,
      right: chart.left + (box.x + box.width) * sx, bottom: chart.top + (box.y + box.height) * sy,
    })),
  };
}

type Verdict = 'inside' | 'overflow' | 'spans' | 'outside';
type Measured = { kind: string; rect: Rect; verdict: Verdict; detail: string };

/** Every overlay Flint draws above the renderer: washes, guides, labels, brushes, lassos. */
function overlayElements(host: HTMLElement): { kind: string; element: Element }[] {
  const renderer = host.querySelector('svg.marks');
  const found: { kind: string; element: Element }[] = [];
  host.querySelectorAll('[data-flint-region]').forEach((element) => found.push({ kind: 'region wash', element }));
  host.querySelectorAll('*').forEach((element) => {
    if (renderer?.contains(element) || element.closest('[data-flint-markup]')) return;
    const style = getComputedStyle(element);
    if (style.position !== 'absolute' || style.display === 'none' || style.visibility === 'hidden') return;
    if (style.pointerEvents !== 'none' || style.clipPath !== 'none') return;
    const box = element.getBoundingClientRect();
    if (box.width * box.height <= 1) return;
    if (element instanceof SVGSVGElement) {
      // The lasso and sector guides are drawn at z-index 5; other SVG layers (focus, data overlays) redraw marks.
      if (style.zIndex !== '5') return;
      element.querySelectorAll('path').forEach((path) => found.push({ kind: 'drawn region', element: path }));
      return;
    }
    if (!(element instanceof HTMLElement) || element.children.length > 0) return;
    const kind = element.hasAttribute('data-flint-inspect-index') ? 'index label'
      : element.hasAttribute('data-flint-inspect-value') ? 'value label'
        : box.width <= 4 || box.height <= 4 ? 'guide rule' : 'drag box';
    found.push({ kind, element });
  });
  return found;
}

function judge(rect: Rect, views: Rect[]): Pick<Measured, 'verdict' | 'detail'> {
  const touched = views.filter((view) => intersect(rect, view));
  if (touched.length === 0) return { verdict: 'outside', detail: 'outside every plot' };
  if (touched.length > 1) return { verdict: 'spans', detail: `spans ${touched.length} panels and the gaps between` };
  const [view] = touched;
  const past = {
    left: view.left - rect.left, right: rect.right - view.right,
    top: view.top - rect.top, bottom: rect.bottom - view.bottom,
  };
  const sides = Object.entries(past).filter(([, by]) => by > TOLERANCE).map(([side, by]) => `${side} ${Math.round(by)}px`);
  return sides.length ? { verdict: 'overflow', detail: `past the plot: ${sides.join(', ')}` } : { verdict: 'inside', detail: 'inside its plot' };
}

function measure(host: HTMLElement, geometry: Geometry): Measured[] {
  return overlayElements(host).flatMap(({ kind, element }) => {
    const rect = visibleRect(element, host);
    return rect ? [{ kind, rect, ...judge(rect, geometry.views) }] : [];
  });
}

// ---------------------------------------------------------------- gestures

function pointer(type: string, at: Point, buttons: number): PointerEvent {
  return new PointerEvent(type, {
    clientX: at.x, clientY: at.y, bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, buttons,
  });
}

/** Two rendering frames, or half a second where frames don't come (a hidden tab). */
function settle(ms = 120): Promise<void> {
  return Promise.race([
    new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    new Promise<void>((resolve) => setTimeout(resolve, 500)),
  ]).then(() => new Promise((resolve) => setTimeout(resolve, ms)));
}

// ---------------------------------------------------------------- cases

type Step =
  | { kind: 'updates'; updates: ChartUpdate[] }
  | { kind: 'hover'; at: Locate }
  | { kind: 'drag'; path: Locate[] };

/** `steps` run in order; the overlays are judged after the last, and mid-drag when the last is a drag. */
type OverlayCase = { id: string; title: string; note: string; input: ChartAssemblyInput; steps: Step[]; scale?: number };

const zoomX = (domain: [unknown, unknown]): ChartUpdate =>
  ({ id: 'zoom', ops: [{ op: 'set-viewport', axes: 'x', value: { x: domain } }] }) as unknown as ChartUpdate;

const REGION_CASES: OverlayCase[] = [
  {
    id: 'region-unit', title: 'Scatter · x [15, 160]',
    note: 'Baseline: a band inside the x domain on a single plot.',
    input: scatterInput(false), steps: [{ kind: 'updates', updates: [region('above', { x: [15, 160] })] }],
  },
  {
    id: 'region-past-domain', title: 'Scatter · x [15, 1000]',
    note: 'The band runs past the domain\'s end; it should stop at the plot.',
    input: scatterInput(false), steps: [{ kind: 'updates', updates: [region('above', { x: [15, 1000] })] }],
  },
  {
    id: 'region-row-facet', title: 'Row facets · x [15, 200]',
    note: 'The reported chart: the band is shaded in each panel and stops at its edges.',
    input: scatterInput(true), steps: [{ kind: 'updates', updates: [region('above', { x: [15, 200] })] }],
  },
  {
    id: 'region-column-facet-x', title: 'Column facets · Jun to Dec 2024',
    note: 'A period on three panels side by side.',
    input: lineInput('column'), steps: [{ kind: 'updates', updates: [region('period', { x: ['2024-06', '2024-12'] })] }],
  },
  {
    id: 'region-column-facet-y', title: 'Column facets · y [50, 70]',
    note: 'A band of values: full width of each panel, and no wider.',
    input: lineInput('column'), steps: [{ kind: 'updates', updates: [region('band', { y: [50, 70] })] }],
  },
  {
    id: 'region-zoomed', title: 'Line · Mar to Sep 2024, then zoomed to May to Jul',
    note: 'Navigate then frames a narrower window: the band should stop at its edges.',
    input: withInteractions(lineInput('none'), [{ type: 'navigate', options: { axes: 'x' } }]),
    steps: [
      { kind: 'updates', updates: [region('period', { x: ['2024-03', '2024-09'] })] },
      { kind: 'updates', updates: [zoomX(['2024-05', '2024-07'])] },
    ],
  },
  {
    id: 'region-scaled', title: 'Scatter · x [15, 160], host scaled to 75%',
    note: 'The chart drawn inside a CSS transform, as a scaled card or slide draws it.',
    input: scatterInput(false), scale: 0.75, steps: [{ kind: 'updates', updates: [region('above', { x: [15, 160] })] }],
  },
];

const INDEX_CASES: OverlayCase[] = [
  {
    id: 'index-unit', title: 'Line · single plot',
    note: 'Baseline: the guide, value rules and labels on one plot.',
    input: withInteractions(lineInput('none'), [{ type: 'inspect-index' }]),
    steps: [{ kind: 'hover', at: inView(0, 0.62, 0.5) }],
  },
  {
    id: 'index-column-facet', title: 'Column facets · pointer in the middle panel',
    note: 'Three panels side by side: the guide and each value rule stay in the panel the pointer reads.',
    input: withInteractions(lineInput('column'), [{ type: 'inspect-index' }]),
    steps: [{ kind: 'hover', at: inView(1, 0.5, 0.5) }],
  },
  {
    id: 'index-row-facet', title: 'Row facets · pointer in the top panel',
    note: 'Two panels stacked: the guide reads the same month in each, without running through the gap.',
    input: withInteractions(lineInput('row'), [{ type: 'inspect-index' }]),
    steps: [{ kind: 'hover', at: inView(0, 0.4, 0.5) }],
  },
  {
    id: 'index-scaled', title: 'Line · host scaled to 75%',
    note: 'The chart drawn inside a CSS transform.',
    input: withInteractions(lineInput('none'), [{ type: 'inspect-index' }]), scale: 0.75,
    steps: [{ kind: 'hover', at: inView(0, 0.62, 0.5) }],
  },
];

const DRAG_CASES: OverlayCase[] = [
  {
    id: 'drag-select-unit', title: 'select · drag past the bottom right',
    note: 'A rectangle from inside the plot to 60 px past the chart.',
    input: withInteractions(scatterInput(false), [{ type: 'select', options: { mode: 'stateful' } }]),
    steps: [{ kind: 'drag', path: [inView(0, 0.45, 0.35), inView(0, 0.9, 0.9), pastChart(60, 60)] }],
  },
  {
    id: 'drag-brush-x-unit', title: 'brush-x · drag past the right edge',
    note: 'A period dragged out past the legend.',
    input: withInteractions(lineInput('none'), [{ type: 'brush-x', options: { mode: 'stateful' } }]),
    steps: [{ kind: 'drag', path: [inView(0, 0.3, 0.5), inView(0, 0.95, 0.5), pastChart(80, 0)] }],
  },
  {
    id: 'drag-select-row-facet', title: 'select · row facets, top panel into the bottom one',
    note: 'The drag starts in one panel and ends in the next.',
    input: withInteractions(scatterInput(true), [{ type: 'select', options: { mode: 'stateful' } }]),
    steps: [{ kind: 'drag', path: [inView(0, 0.3, 0.3), inView(1, 0.6, 0.5), inView(1, 0.8, 0.8)] }],
  },
  {
    id: 'drag-brush-x-column-facet', title: 'brush-x · column facets, across panels',
    note: 'A period dragged from the first panel into the third.',
    input: withInteractions(lineInput('column'), [{ type: 'brush-x', options: { mode: 'stateful' } }]),
    steps: [{ kind: 'drag', path: [inView(0, 0.5, 0.5), inView(1, 0.5, 0.5), inView(2, 0.5, 0.5)] }],
  },
  {
    id: 'drag-lasso-unit', title: 'lasso-select · stroke leaves the chart',
    note: 'A freehand stroke that runs out past the top left and comes back.',
    input: withInteractions(scatterInput(false), [{ type: 'lasso-select' }]),
    steps: [{
      kind: 'drag',
      path: [inView(0, 0.5, 0.5), inView(0, 0.2, 0.3), pastChart(-40, -40), inView(0, 0.05, 0.9), inView(0, 0.6, 0.8)],
    }],
  },
  {
    id: 'drag-brush-y-bars', title: 'brush-y · horizontal bars, drag past the bottom',
    note: 'Thirty rows on a band axis, brushed down past the last one.',
    input: withInteractions(barsInput(), [{ type: 'brush-y', options: { mode: 'stateful' } }]),
    steps: [{ kind: 'drag', path: [inView(0, 0.5, 0.4), inView(0, 0.5, 0.95), pastChart(0, 60)] }],
  },
  {
    id: 'drag-brush-x-zoomed', title: 'brush-x stateful, then zoomed in with navigate',
    note: 'The brush keeps its period; the chart then frames a window inside it.',
    input: withInteractions(lineInput('none'), [
      { type: 'brush-x', options: { mode: 'stateful' } }, { type: 'navigate', options: { axes: 'x', pan: false } },
    ]),
    steps: [
      { kind: 'drag', path: [inView(0, 0.2, 0.5), inView(0, 0.8, 0.5)] },
      { kind: 'updates', updates: [zoomX(['2024-09', '2025-03'])] },
    ],
  },
  {
    id: 'drag-select-economist', title: 'select · Economist theme, drag past the top right',
    note: 'A house that moves the plot: its axes, title and keys sit elsewhere.',
    input: withInteractions({ ...scatterInput(false), theme_spec: 'economist' } as ChartAssemblyInput, [{ type: 'select', options: { mode: 'stateful' } }]),
    steps: [{ kind: 'drag', path: [inView(0, 0.3, 0.6), inView(0, 0.9, 0.1), pastChart(60, -60)] }],
  },
  {
    id: 'drag-select-scaled', title: 'select · host scaled to 75%, drag past the bottom right',
    note: 'The chart drawn inside a CSS transform.',
    input: withInteractions(scatterInput(false), [{ type: 'select', options: { mode: 'stateful' } }]), scale: 0.75,
    steps: [{ kind: 'drag', path: [inView(0, 0.45, 0.35), inView(0, 0.9, 0.9), pastChart(60, 60)] }],
  },
];

// ---------------------------------------------------------------- card

type Report = { geometry: Geometry; items: Measured[]; when: string } | { error: string };
type Status = 'pass' | 'fail' | 'pending';

const INK: Record<Verdict, string> = { inside: '#16794b', overflow: '#d92d20', spans: '#d92d20', outside: '#d92d20' };

function statusOf(report: Report | null): Status {
  if (!report) return 'pending';
  if ('error' in report || report.items.length === 0) return 'fail';
  return report.items.some((item) => item.verdict !== 'inside') ? 'fail' : 'pass';
}

const cardStyle: CSSProperties = {
  border: `1px solid ${siteTheme.border}`, borderRadius: siteTheme.radius, background: siteTheme.surface,
  padding: 10, minWidth: 0, overflow: 'visible',
};

function ContainmentCase({ item, showBoxes, onStatus }: {
  item: OverlayCase; showBoxes: boolean; onStatus: (id: string, status: Status) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [origin, setOrigin] = useState<Point>({ x: 0, y: 0 });

  useEffect(() => {
    if (!host.current || !stage.current) return;
    const container = host.current;
    const frame = stage.current;
    let cancelled = false;
    const surface = mountChart(container, item.input, { backend: 'vegalite', renderer: 'svg', expressionInterpreter });
    const snapshot = (when: string): Geometry | undefined => {
      const geometry = readGeometry(container, surface);
      if (cancelled) return geometry;
      const items = geometry ? measure(container, geometry) : [];
      // A guide ends when the pointer leaves or a drag is released; the last thing drawn keeps its verdict.
      if (when === 'live' && items.length === 0) return geometry;
      const stageRect = frame.getBoundingClientRect();
      setOrigin({ x: stageRect.left, y: stageRect.top });
      setReport(geometry ? { geometry, items, when } : { error: 'No plot views reported by surface.layout' });
      return geometry;
    };
    let pending = 0;
    const live = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => snapshot('live'));
    };
    const run = async () => {
      await surface.ready;
      await settle();
      if (cancelled) return;
      const warnings = await surface.warnings;
      if (cancelled) return;
      setNotes(warnings.map((warning) => `${warning.code}: ${warning.message}`));
      const geometry = readGeometry(container, surface);
      if (!geometry) {
        snapshot('mount');
        return;
      }
      const target = container.querySelector('svg.marks')!;
      for (const [index, step] of item.steps.entries()) {
        const last = index === item.steps.length - 1;
        if (step.kind === 'updates') {
          // applyUpdate layers each step on the last; setUpdates would replace them.
          const outcomes = await Promise.all(step.updates.map((update) => surface.applyUpdate(update)));
          if (cancelled) return;
          const missed = outcomes.flatMap((outcome, at) => outcome.status === 'applied' ? []
            : [`update "${step.updates[at].id}" ${outcome.status}${outcome.unsupportedOps.length ? ` (${outcome.unsupportedOps.join(', ')})` : ''}`]);
          if (missed.length) setNotes((now) => [...now, ...missed]);
          await settle(200);
        } else if (step.kind === 'hover') {
          target.dispatchEvent(pointer('pointermove', step.at(geometry), 0));
          await settle();
        } else {
          const points = step.path.map((locate) => locate(geometry));
          target.dispatchEvent(pointer('pointerdown', points[0], 1));
          for (let leg = 1; leg < points.length; leg += 1) {
            for (let move = 1; move <= 4; move += 1) {
              const t = move / 4;
              const from = points[leg - 1];
              const to = points[leg];
              target.dispatchEvent(pointer('pointermove', { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, 1));
            }
          }
          await settle();
          if (cancelled) return;
          // A drag that ends the script is judged mid-drag, where every guide is still drawn.
          if (last) snapshot('scripted drag, before release');
          target.dispatchEvent(pointer('pointerup', points[points.length - 1], 0));
          await settle();
        }
        if (cancelled) return;
      }
      const lastStep = item.steps[item.steps.length - 1];
      if (lastStep.kind !== 'drag') snapshot(lastStep.kind === 'hover' ? 'scripted hover' : 'after the updates');
      container.addEventListener('pointermove', live);
      container.addEventListener('pointerup', live);
      container.addEventListener('pointerleave', live);
    };
    void run().catch((error) => {
      if (!cancelled) setReport({ error: String((error as Error)?.message ?? error) });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(pending);
      container.removeEventListener('pointermove', live);
      container.removeEventListener('pointerup', live);
      container.removeEventListener('pointerleave', live);
      surface.destroy();
      container.replaceChildren();
    };
  }, [item]);

  const status = statusOf(report);
  useEffect(() => onStatus(item.id, status), [item.id, status, onStatus]);

  const scale = item.scale ?? 1;
  const local = (rect: Rect) => ({
    x: (rect.left - origin.x) / scale, y: (rect.top - origin.y) / scale,
    width: (rect.right - rect.left) / scale, height: (rect.bottom - rect.top) / scale,
  });
  const failures = report && 'items' in report ? report.items.filter((entry) => entry.verdict !== 'inside') : [];

  return (
    <article style={{ ...cardStyle, borderColor: status === 'fail' ? '#f0c8c8' : status === 'pass' ? '#cfe3d4' : siteTheme.border }} data-case={item.id} data-status={status}>
      <h3 style={{ margin: '0 0 2px', fontSize: 13 }}>{item.title}</h3>
      <p style={{ margin: '0 0 8px', fontSize: 11, color: siteTheme.textMuted }}>{item.note}</p>
      {/* Drawn at its own size unless the case scales its host, so an overlay past the chart shows as a reader sees it. */}
      <div style={{ overflowX: 'auto', padding: '4px 4px 72px' }}>
        <div ref={stage} style={{ position: 'relative', display: 'inline-block', ...(scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: '0 0' } : {}) }}>
          <div ref={host} />
          {showBoxes && report && 'geometry' in report ? (
            <svg
              aria-hidden="true"
              style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none', zIndex: 20 }}
            >
              <rect {...local(report.geometry.chart)} fill="none" stroke="#98a2b3" strokeDasharray="2 3" />
              {report.geometry.views.map((view, index) => (
                <rect key={index} {...local(view)} fill="none" stroke="#16794b" strokeWidth={1.25} strokeDasharray="5 3" />
              ))}
              {failures.map((entry, index) => (
                <rect key={index} {...local(entry.rect)} fill="rgba(217,45,32,0.08)" stroke={INK[entry.verdict]} strokeWidth={1.5} />
              ))}
            </svg>
          ) : null}
        </div>
      </div>
      <div role="status" style={{ fontSize: 11, lineHeight: 1.45 }}>
        {!report ? <span style={{ color: siteTheme.textMuted }}>Running…</span>
          : 'error' in report ? <span style={{ color: '#b42318' }}>Fail: {report.error}</span>
            : report.items.length === 0 ? <span style={{ color: '#b42318' }}>Fail: no overlay drawn ({report.when})</span>
              : (
                <>
                  <div style={{ color: status === 'pass' ? '#16794b' : '#b42318', fontWeight: 600 }}>
                    {status === 'pass' ? 'Pass' : 'Fail'}: {report.items.length - failures.length} of {report.items.length} overlay
                    {report.items.length === 1 ? '' : 's'} inside a plot <span style={{ fontWeight: 400, color: siteTheme.textMuted }}>({report.when})</span>
                  </div>
                  {failures.map((entry, index) => (
                    <div key={index} style={{ color: INK[entry.verdict] }}>✗ {entry.kind}: {entry.detail}</div>
                  ))}
                </>
              )}
        {notes.map((note, index) => (
          <div key={`note-${index}`} style={{ color: '#9a6700' }}>⚠ {note}</div>
        ))}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- page section

const GROUPS = [
  { id: 'region', title: 'Background fill · annotate-region', cases: REGION_CASES },
  { id: 'index', title: 'Index guide · inspect-index', cases: INDEX_CASES },
  { id: 'drag', title: 'Selection drags · select, brush-x, brush-y, lasso-select', cases: DRAG_CASES },
] as const;

export function OverlayContainmentLab() {
  const [showBoxes, setShowBoxes] = useState(true);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const onStatus = useCallback((id: string, status: Status) => {
    setStatuses((now) => (now[id] === status ? now : { ...now, [id]: status }));
  }, []);
  const tally = (cases: readonly OverlayCase[]) => {
    const failed = cases.filter((item) => statuses[item.id] === 'fail').length;
    const done = cases.filter((item) => statuses[item.id] && statuses[item.id] !== 'pending').length;
    return done < cases.length ? `${done}/${cases.length} run` : failed ? `${failed} of ${cases.length} overflow` : 'all inside';
  };

  return (
    <div className="dev-page" style={{ gap: 12 }} data-lab="overlay-containment">
      <header className="dev-page-heading" style={{ width: 'min(100%, 1280px)', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ maxWidth: 860 }}>
          <h1>Overlay containment</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: siteTheme.textMuted }}>
            Background washes, index guides and selection drags, checked against the plot they belong to. Each chart
            is mounted at its own size, the overlay is applied (an update, a scripted hover or a scripted drag), and
            every element Flint draws over the renderer is checked against the plot panels the chart reports in{' '}
            <code>surface.layout.views</code>. Green dashes: the plot panels; grey dots: the drawn chart; red: an
            overlay past its panel, or one spanning several. Hover or drag on any chart to re-measure live.
          </p>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={showBoxes} onChange={(event) => setShowBoxes(event.target.checked)} />
          Show plot boxes
        </label>
      </header>
      {GROUPS.map((group) => (
        <section key={group.id} style={{ width: 'min(100%, 1280px)' }} data-group={group.id}>
          <h2 style={{ margin: '0 0 6px', fontSize: 15 }}>
            {group.title} <span style={{ fontWeight: 400, fontSize: 12, color: siteTheme.textMuted }}>· {tally(group.cases)}</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 520px), 1fr))', gap: 10 }}>
            {group.cases.map((item) => (
              <ContainmentCase key={item.id} item={item} showBoxes={showBoxes} onStatus={onStatus} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
