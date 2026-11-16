import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  assembleVegaLite,
  type ChartUpdateOp,
  type RegionAnnotationSpec,
} from 'flint-chart';
import {
  externalInteraction,
  type ChartUpdate,
  type ChartUpdateResult,
  type InteractiveChartSurface,
} from 'flint-chart/interactive';
import { FlintChart, type FlintChartHandle } from 'flint-chart/react';
import { expressionInterpreter } from 'vega-interpreter';
import { annotationCases, type InteractionCase } from './InteractionGallery';
import { ThemePicker } from './ThemePicker';
import './click-focus-lab.css';
import './annotation-lab.css';

type StaticStatus = 'loading' | 'applied' | 'unsupported' | 'error';
type ChartOverlaySpec = NonNullable<Extract<ChartUpdateOp, { op: 'set-overlay' }>['value']>;
type Visual = { kind: 'mark' | 'path' | 'region'; role?: string };
/**
 * One annotation a case shows: a caption on one mark, a stretch, a slice or a region (`annotate-text`),
 * a shaded stretch of the plot (`annotate-region`), or an outline round a group of marks
 * (`annotate-enclosure`, its group the marks the keys name).
 */
type AnnotationFixture =
  | { label: string; key: string; visual?: Visual; text: string; anchor?: 'point' }
  | { label: string; region: RegionAnnotationSpec }
  | { label: string; enclose: readonly string[]; visual: Visual; text: string }
  | { label: string; overlays: Readonly<Record<string, ChartOverlaySpec>> };

function keySelector(
  input: InteractionCase['input'],
  key: string,
): Record<string, unknown> {
  const spec = assembleVegaLite(input) as any;
  const fields = spec._interactionSemantics?.fields as string[] | undefined;
  const parts = key.replace(/\|__flint_path$/, '').split('|');
  const sourceRows = input.data.values as readonly Record<string, unknown>[];
  return Object.fromEntries((fields ?? []).slice(0, parts.length).map((field, index) => {
    const part = parts[index];
    const sourceValue = sourceRows.map((record) => record[field]).find((value) =>
      String(value) === part
      || value instanceof Date && String(value.getTime()) === part
      || typeof value === 'string' && String(Date.parse(value)) === part);
    const numeric = Number(part);
    return [field, sourceValue ?? (Number.isFinite(numeric) ? numeric : part)];
  }));
}

/** The marks several keys name, as one set: each field `in` the values the keys give it. */
function groupSelector(input: InteractionCase['input'], keys: readonly string[]): Record<string, { in: unknown[] }> {
  const where: Record<string, { in: unknown[] }> = {};
  for (const key of keys) {
    for (const [field, value] of Object.entries(keySelector(input, key))) {
      const values = (where[field] ??= { in: [] }).in;
      if (!values.includes(value)) values.push(value);
    }
  }
  return where;
}

/** The ops one fixture applies: an annotation op alone, the note marking what it names itself. */
function fixtureOps(input: InteractionCase['input'], fixture: AnnotationFixture, name: string): ChartUpdate['ops'] {
  if ('region' in fixture) return [{ op: 'annotate-region', name, value: fixture.region }];
  if ('overlays' in fixture) {
    return Object.entries(fixture.overlays).map(([overlay, value]) => ({ op: 'set-overlay' as const, name: `${name}-${overlay}`, value }));
  }
  if ('enclose' in fixture) {
    return [{
      op: 'annotate-enclosure',
      name,
      value: { targets: [{ select: { where: groupSelector(input, fixture.enclose), visual: fixture.visual } }], text: fixture.text },
    }];
  }
  return [{
    op: 'annotate-text',
    target: { select: { key: keySelector(input, fixture.key), ...(fixture.visual ? { visual: fixture.visual } : {}) } },
    value: { text: fixture.text, ...(fixture.anchor ? { anchor: fixture.anchor } : {}) },
  }];
}

/** A map whose points an `order` joins into a route: its stops are marks, its legs paths. */
const ROUTE_CASE: InteractionCase = {
  id: 'map-route',
  chartType: 'Map',
  title: 'The wanderings of Odysseus',
  expectation: 'Notes on a stop and on a leg; an outline round the Sicilian stops.',
  input: {
    data: {
      values: ([
        [1, 'Troy', 26.24, 39.96], [2, 'Ismarus', 25.52, 40.89], [3, 'Lotus-Eaters', 10.86, 33.81], [4, 'Cyclops', 15.16, 37.56],
        [5, 'Aeolia', 14.95, 38.47], [6, 'Laestrygonians', 9.16, 41.39], [7, 'Aeaea', 13.05, 41.23], [8, 'Underworld', 14.07, 40.84],
        [9, 'Sirens', 14.43, 40.58], [10, 'Scylla and Charybdis', 15.63, 38.25], [11, 'Thrinacia', 15.0, 37.08], [12, 'Ogygia', 14.25, 36.05],
        [13, 'Scheria', 19.92, 39.62], [14, 'Ithaca', 20.71, 38.37],
      ] as const).map(([Stop, Place, longitude, latitude]) => ({ Stop, Place, longitude, latitude })),
    },
    semantic_types: { Stop: 'Rank', Place: 'Name', longitude: 'Longitude', latitude: 'Latitude' },
    chart_spec: {
      chartType: 'Map', title: 'The wanderings of Odysseus',
      encodings: { longitude: 'longitude', latitude: 'latitude', order: 'Stop' }, chartProperties: { mapStyle: 'atlas' },
    },
  },
};

const ANNOTATION_FIXTURES: Record<string, readonly AnnotationFixture[]> = {
  Map: [
    { label: 'Ithaca (stop)', key: '20.71|38.37|14', visual: { kind: 'mark', role: 'point' }, text: 'Ithaca, home at last' },
    { label: 'Troy → Ismarus (leg)', key: '26.24|39.96|1', visual: { kind: 'path', role: 'leg' }, text: 'Sets sail from Troy' },
    { label: 'Ismarus → Lotus-Eaters (leg)', key: '25.52|40.89|2', visual: { kind: 'path', role: 'leg' }, text: 'Nine days blown off course' },
    { label: 'Sicily', enclose: ['15.16|37.56|4', '15.63|38.25|10', '15|37.08|11'], visual: { kind: 'mark', role: 'point' }, text: 'Sicily’s monsters' },
    { label: 'Tyrrhenian Sea (lon/lat)', region: { longitude: [9.5, 16.2], latitude: [38.2, 41.6], text: 'The Tyrrhenian Sea' } },
    {
      label: 'The direct way home (lon/lat)',
      overlays: {
        line: {
          mark: 'line', role: 'direct-route',
          data: { values: [{ order: 1, longitude: 26.24, latitude: 39.96 }, { order: 2, longitude: 20.71, latitude: 38.37 }] },
          encodings: { longitude: { field: 'longitude' }, latitude: { field: 'latitude' }, order: { field: 'order' } },
          style: { stroke: '#b5562a', strokeWidth: 2, strokeDash: 'dash' },
        },
        label: {
          mark: 'text', role: 'direct-route-label',
          data: { values: [{ longitude: 23.6, latitude: 39.75, text: 'Troy to Ithaca: about 500 km' }] },
          encodings: { longitude: { field: 'longitude' }, latitude: { field: 'latitude' }, text: { field: 'text' } },
          style: { fill: '#b5562a', fontSize: 11, fontWeight: 'bold' },
        },
      },
    },
  ],
  'Area Chart': [
    { label: '1995–2000', key: '788918400000|1|__flint_path', visual: { kind: 'path', role: 'area' }, text: 'Dial-up years: 1% → 7%' },
    { label: '2010–2015', key: '1262304000000|29|__flint_path', visual: { kind: 'path', role: 'area' }, text: 'Smartphones: 29% → 43%' },
    { label: '2020–2023', region: { x: ['2020-01-01', null], text: 'Pandemic and after' } },
  ],
  'Bar Chart': [
    { label: 'India', key: '1428.6|India', visual: { kind: 'mark', role: 'mark' }, text: 'Overtook China in 2023' },
    { label: 'United States', key: '339.9|United States', visual: { kind: 'mark', role: 'mark' }, text: 'A quarter of either leader' },
    { label: 'Mexico', key: '128.5|Mexico', visual: { kind: 'mark', role: 'mark' }, text: 'Last of the ten' },
  ],
  'Bar Table': [
    { label: 'Brazil', key: 'Brazil', visual: { kind: 'mark', role: 'bar-table-row' }, text: 'Brazil: $2.2T GDP' },
    { label: 'India', key: 'India', visual: { kind: 'mark', role: 'bar-table-row' }, text: 'India: $3.9T GDP' },
    { label: 'United States', key: 'United States', visual: { kind: 'mark', role: 'bar-table-row' }, text: 'United States: $27.4T GDP' },
  ],
  'Bullet Chart': [
    { label: 'Norway', key: 'Norway', text: 'Almost at target' },
    { label: 'Germany', key: 'Germany', text: 'Past half-way' },
    { label: 'United States', key: 'United States', text: 'Under half its target' },
  ],
  'Calendar Heatmap': [
    { label: 'Jan 1', key: '1704067200000|Mon|1704067200000', visual: { kind: 'mark', role: 'calendar-day' }, text: 'Jan 1: 60 activities' },
    { label: 'Mar 1', key: '1708905600000|Fri|1709251200000', visual: { kind: 'mark', role: 'calendar-day' }, text: 'Mar 1: 68 activities' },
    { label: 'Apr 30', key: '1714348800000|Tue|1714435200000', visual: { kind: 'mark', role: 'calendar-day' }, text: 'Apr 30: 88 activities' },
  ],
  'Candlestick Chart': [
    { label: 'Jan 2', key: '1704153600000|187|188|183|185', visual: { kind: 'mark', role: 'candlestick' }, text: 'Jan 2: O 187, H 188, L 183, C 185' },
    { label: 'Jan 8', key: '1704672000000|182|186|182|185', visual: { kind: 'mark', role: 'candlestick' }, text: 'Jan 8: O 182, H 186, L 182, C 185' },
    { label: 'Jan 12', key: '1705017600000|186|188|185|185', visual: { kind: 'mark', role: 'candlestick' }, text: 'Jan 12: O 186, H 188, L 185, C 185' },
  ],
  Choropleth: [
    { label: 'Alaska', key: 'Alaska|0.73', visual: { kind: 'region', role: 'geographic-region' }, text: 'Alaska: 0.73' },
    { label: 'Illinois', key: 'Illinois|12.81', visual: { kind: 'region', role: 'geographic-region' }, text: 'Illinois: 12.81' },
    { label: 'Maine', key: 'Maine|1.36', visual: { kind: 'region', role: 'geographic-region' }, text: 'Maine: 1.36' },
  ],
  'Connected Scatter Plot': [
    { label: '1956 point', key: '3675|2.38', text: '1956: where the record starts' },
    { label: '1982–1983 path', key: '6835|2.92|__flint_path', visual: { kind: 'path' }, text: 'Prices fall after the oil shock' },
    { label: '2005 point', key: '10067|2.53', text: 'Driving peaks' },
  ],
  'Density Plot': [
    { label: 'Short eruptions', region: { x: [1.5, 2.5], text: 'Short eruptions' } },
    { label: 'First peak', key: '1.9040000000000001|0.23092429172368195|__flint_path', visual: { kind: 'path', role: 'area' }, text: 'First peak near 1.9 min' },
    { label: 'Long eruptions', region: { x: [3.5, null], text: 'Long eruptions' } },
  ],
  Heatmap: [
    { label: 'Singapore · Jan', key: 'Jan|Singapore', visual: { kind: 'mark', role: 'mark' }, text: 'Warm all year' },
    { label: 'Seattle · Jun', key: 'Jun|Seattle', visual: { kind: 'mark', role: 'mark' }, text: 'Mild summer' },
    { label: 'Seattle summer', enclose: ['Jun|Seattle', 'Jul|Seattle', 'Aug|Seattle'], visual: { kind: 'mark', role: 'mark' }, text: 'Seattle summer' },
  ],
  'Pie Chart': [
    { label: 'Edge', key: 'Edge', visual: { kind: 'mark', role: 'slice' }, text: 'Edge: 12%' },
    { label: 'Other', key: 'Other', visual: { kind: 'mark', role: 'slice' }, text: 'Other: 5%' },
    { label: 'Chrome', key: 'Chrome', visual: { kind: 'mark', role: 'slice' }, text: 'Chrome: 65%' },
  ],
  'Ranged Dot Plot': [
    { label: 'Nigeria range', key: '51|Nigeria|Male|__flint_path', visual: { kind: 'path', role: 'line' }, text: 'Nigeria: Male 51, Female 54' },
    { label: 'Brazil range', key: '69|Brazil|Male|__flint_path', visual: { kind: 'path', role: 'line' }, text: 'Brazil: Male 69, Female 76' },
    { label: 'Japan range', key: '81.5|Japan|Male|__flint_path', visual: { kind: 'path', role: 'line' }, text: 'Japan: Male 81.5, Female 87.6' },
  ],
  'Scatter Plot': [
    { label: 'Short flippers', key: '178|3300|Chinstrap', visual: { kind: 'mark', role: 'point' }, text: 'Shortest flippers' },
    { label: 'Heavy Adelie', key: '195|4675|Adelie', visual: { kind: 'mark', role: 'point' }, text: 'Heaviest Adelie' },
    { label: 'Large Chinstrap', key: '207|4800|Chinstrap', visual: { kind: 'mark', role: 'point' }, text: 'Largest Chinstrap' },
  ],
  'Slope Chart': [
    { label: 'Tablet 2019 point', key: '2019|69|Tablet', visual: { kind: 'mark', role: 'symbol' }, text: 'Tablet · 2019: 69 revenue' },
    { label: 'Phone path', key: '2019|56|Phone|__flint_path', visual: { kind: 'path', role: 'line' }, text: 'Phone: 56 → 42 revenue' },
    { label: 'Tablet 2024 point', key: '2024|35|Tablet', visual: { kind: 'mark', role: 'symbol' }, text: 'Tablet · 2024: 35 revenue' },
  ],
  'Violin Plot': [
    { label: 'Class A', key: 'Class A|__flint_path', visual: { kind: 'path', role: 'area' }, text: 'Class A density' },
    { label: 'Class B', key: 'Class B|__flint_path', visual: { kind: 'path', role: 'area' }, text: 'Class B density' },
    { label: 'Class D', key: 'Class D|__flint_path', visual: { kind: 'path', role: 'area' }, text: 'Class D density' },
  ],
  'Waterfall Chart': [
    { label: '1950 baseline', key: '1950', visual: { kind: 'mark', role: 'waterfall-step' }, text: '1950 baseline: 2,536M' },
    { label: 'Africa addition', key: 'Africa', visual: { kind: 'mark', role: 'waterfall-step' }, text: 'Africa: +1,134M' },
    { label: 'Oceania addition', key: 'Oceania', visual: { kind: 'mark', role: 'waterfall-step' }, text: 'Oceania: +32M' },
  ],
};

function nextLayoutTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

async function waitForStableChartLayout(container: HTMLElement): Promise<void> {
  let previous = container.getBoundingClientRect();
  let stableFrames = 0;
  for (let attempt = 0; attempt < 8 && stableFrames < 2; attempt += 1) {
    await nextLayoutTurn();
    const current = container.getBoundingClientRect();
    const stable = Math.abs(current.width - previous.width) < 0.5
      && Math.abs(current.height - previous.height) < 0.5;
    stableFrames = stable ? stableFrames + 1 : 0;
    previous = current;
  }
}

/** What a fixture annotates, the filter the page offers. */
type AnnotationKind = 'mark' | 'stretch' | 'route leg' | 'slice' | 'shape' | 'map region' | 'annotate-region' | 'annotate-enclosure' | 'set-overlay';
const KIND_CHOICES: readonly { value: AnnotationKind | 'all'; label: string; title: string }[] = [
  { value: 'all', label: 'All', title: 'Every case' },
  { value: 'mark', label: 'Mark', title: 'annotate-text on one mark: a dot, a bar, a cell, a point' },
  { value: 'stretch', label: 'Stretch', title: 'annotate-text on a stretch of a line or area' },
  { value: 'route leg', label: 'Route leg', title: 'annotate-text on a leg of a map route (visual kind: path)' },
  { value: 'slice', label: 'Slice', title: 'annotate-text on a pie slice' },
  { value: 'shape', label: 'Shape', title: 'annotate-text on a whole shape (a violin)' },
  { value: 'map region', label: 'Map region', title: 'annotate-text on a map region' },
  { value: 'annotate-region', label: 'Region', title: 'annotate-region: a shaded stretch of the plot' },
  { value: 'annotate-enclosure', label: 'Enclosure', title: 'annotate-enclosure: an outline round a group' },
  { value: 'set-overlay', label: 'Overlay', title: 'set-overlay: marks drawn through the chart’s scales, or a map’s projection' },
];

function fixtureKind(item: InteractionCase, fixture: AnnotationFixture): AnnotationKind {
  if ('overlays' in fixture) return 'set-overlay';
  if ('region' in fixture) return 'annotate-region';
  if ('enclose' in fixture) return 'annotate-enclosure';
  if (fixture.visual?.kind === 'region') return 'map region';
  if (fixture.visual?.role === 'slice') return 'slice';
  if (item.chartType === 'Violin Plot') return 'shape';
  if (fixture.visual?.kind === 'path') return item.chartType === 'Map' ? 'route leg' : 'stretch';
  return 'mark';
}

/** The width a card's stage offers, in steps, so a chart is compiled to fit it rather than scrolled. */
function useStageWidth(ref: React.RefObject<HTMLDivElement | null>): number | undefined {
  const [width, setWidth] = useState<number>();
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const inner = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const stepped = Math.max(280, Math.floor(inner / 20) * 20);
      setWidth((now) => (now === stepped ? now : stepped));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * A chart that draws wider than its card (a faceted chart sizes its own panels) is scaled down to the
 * card rather than scrolled. The annotation overlay reads the drawing's rect, so it follows the scale.
 */
function fitToStage(container: HTMLElement): void {
  container.style.transform = '';
  container.style.marginBottom = '';
  const stage = container.parentElement;
  const drawing = container.firstElementChild as HTMLElement | null;
  if (!stage || !drawing) return;
  const style = getComputedStyle(stage);
  const available = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const { width, height } = drawing.getBoundingClientRect();
  if (width <= available + 0.5) return;
  const scale = available / width;
  container.style.transformOrigin = '0 0';
  container.style.transform = `scale(${scale})`;
  container.style.marginBottom = `${-height * (1 - scale)}px`;
}

function StaticAnnotationChart({
  item,
  fixture,
  themeId,
  width,
  resetVersion,
  onStatus,
}: {
  item: InteractionCase;
  fixture: AnnotationFixture;
  themeId: string | undefined;
  width: number;
  resetVersion: number;
  onStatus: (status: StaticStatus, result?: ChartUpdateResult | Error) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<FlintChartHandle>(null);
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  // The chart is compiled to the card's width, so it is drawn whole without a scrollbar.
  const sizedInput = useMemo(() => {
    const size = { width, height: Math.round(Math.min(460, Math.max(300, width * 0.62))) };
    const input = { ...item.input, chart_spec: { ...item.input.chart_spec, baseSize: size, canvasSize: size } };
    return themeId ? { ...input, theme_spec: themeId } : input;
  }, [item, themeId, width]);
  const interactions = useMemo(() => [externalInteraction<ChartUpdate>({
    id: 'static-annotation-policy',
    handle: (update) => update,
  })], []);

  useEffect(() => statusRef.current('loading'), [fixture, item, resetVersion, themeId, width]);

  // Each mount annotates once its layout settles; a newer mount makes an older run stale.
  const annotate = async (surface: InteractiveChartSurface): Promise<void> => {
    const container = containerRef.current;
    if (!container) return;
    await waitForStableChartLayout(container);
    if (chartRef.current?.surface !== surface) return;
    fitToStage(container);
    await waitForStableChartLayout(container);
    if (chartRef.current?.surface !== surface) return;
    const id = `annotation-lab-${item.id}-${fixture.label}`;
    const result = await surface.dispatch('static-annotation-policy', { id, ops: fixtureOps(sizedInput, fixture, id) });
    if (chartRef.current?.surface !== surface) return;
    statusRef.current(result?.status === 'applied' ? 'applied' : 'unsupported', result ?? undefined);
  };

  return (
    <div className="cf-mount" ref={containerRef}>
      <FlintChart
        key={`${resetVersion}:${fixture.label}:${width}`}
        ref={chartRef}
        spec={sizedInput}
        interactions={interactions}
        renderer="svg"
        expressionInterpreter={expressionInterpreter}
        ariaLabel={item.input.chart_spec.title}
        onRender={(surface) => void annotate(surface)}
        onError={(error) => statusRef.current('error', error)}
      />
    </div>
  );
}

function StaticAnnotationCard({
  item,
  fixture,
  themeId,
  resetVersion,
}: {
  item: InteractionCase;
  fixture: AnnotationFixture;
  themeId: string | undefined;
  resetVersion: number;
}) {
  const [status, setStatus] = useState<StaticStatus>('loading');
  const [detail, setDetail] = useState('Applying annotation update');
  const stageRef = useRef<HTMLDivElement>(null);
  const width = useStageWidth(stageRef);
  return (
    <article className="cf-probe annotation-static-card">
      <header className="cf-probe-header">
        <div>
          <h2>{item.chartType}</h2>
          <p>{fixture.label} <span>{fixtureKind(item, fixture)}</span></p>
        </div>
        <span className={`cf-status cf-status-${status === 'applied' ? 'ready' : status}`} title={detail}>
          {status === 'applied' ? 'Applied' : status}
        </span>
      </header>
      <div className="cf-stage annotation-static-stage" ref={stageRef}>
        {width ? (
          <StaticAnnotationChart
            item={item}
            fixture={fixture}
            themeId={themeId}
            width={width}
            resetVersion={resetVersion}
            onStatus={(nextStatus, result) => {
              setStatus(nextStatus);
              setDetail(result instanceof Error
                ? result.message
                : result ? `${result.status}: ${result.resolvedTargets} target` : 'Applying annotation update');
            }}
          />
        ) : null}
      </div>
    </article>
  );
}

export function AnnotationLab() {
  const [themeId, setThemeId] = useState<string | undefined>();
  const [kind, setKind] = useState<AnnotationKind | 'all'>('all');
  const [resetVersion, setResetVersion] = useState(0);
  const allCases = [...annotationCases, ROUTE_CASE].flatMap((item) =>
    (ANNOTATION_FIXTURES[item.chartType] ?? []).map((fixture) => ({ item, fixture, kind: fixtureKind(item, fixture) })));
  const counts = new Map<string, number>();
  for (const entry of allCases) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
  const shown = kind === 'all' ? allCases : allCases.filter((entry) => entry.kind === kind);

  return (
    <div className="dev-page cf-page annotation-page">
      <header className="dev-page-heading cf-heading annotation-heading">
        <h1>Annotation lab</h1>
        <p>
          Static charts annotated after render, after Blabber: <code>annotate-text</code> captions what one
          mark, stretch, slice or region names and marks it by its <code>highlight</code>;
          {' '}<code>annotate-region</code> shades a stretch; <code>annotate-enclosure</code> outlines a group.
        </p>
      </header>
      <section className="annotation-controls" aria-label="Annotation lab controls">
        <div className="annotation-control">
          <span>Annotation</span>
          <div role="radiogroup" aria-label="Annotation type" className="annotation-segmented">
            {KIND_CHOICES.map((choice) => {
              const count = choice.value === 'all' ? allCases.length : counts.get(choice.value) ?? 0;
              return (
                <button key={choice.value} type="button" role="radio" aria-checked={kind === choice.value}
                  title={choice.title} disabled={count === 0} onClick={() => setKind(choice.value)}>
                  {choice.label} <small>{count}</small>
                </button>
              );
            })}
          </div>
        </div>
        <div className="annotation-control">
          <span>Theme</span>
          <ThemePicker themeId={themeId} onTheme={setThemeId} size={24} />
        </div>
        <button type="button" className="annotation-reset" title="Reapply all annotation updates"
          onClick={() => setResetVersion((value) => value + 1)}>
          <RotateCcw size={14} aria-hidden="true" /> Reapply
        </button>
      </section>
      <div className="annotation-grid">
        {shown.map(({ item, fixture }) => (
          <StaticAnnotationCard key={`${item.id}-${fixture.label}`} item={item} fixture={fixture}
            themeId={themeId} resetVersion={resetVersion} />
        ))}
      </div>
    </div>
  );
}
