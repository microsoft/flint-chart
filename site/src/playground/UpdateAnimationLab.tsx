import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  brushZoom,
  clickHighlight,
  dragReorder,
  legendToggle,
  type ChartUpdate,
  type InteractionDef,
  type InteractiveChartSurface,
} from 'flint-chart/interactive';
import { Case, chart, versionPicker, versions, where, type Renderer } from './update-animation-case';
import { BespokeCases, ChartTypeGallery, IdentityCases } from './update-animation-gallery';
import { AnimationOverview } from './update-animation-overview';
import { CrossFade, DurationPrecedence, InterruptAndRepeat, LinkedPair, OpeningTour, WithAndWithout } from './update-animation-showcase';
import './click-focus-lab.css';
import './interaction-candidates.css';
import './overflow-viewport-lab.css';
import './layout-plan-lab.css';
import './update-animation-lab.css';

const REGIONS = [
  { Region: 'West', Sales: 186 }, { Region: 'East', Sales: 171 }, { Region: 'Central', Sales: 132 },
  { Region: 'South', Sales: 121 }, { Region: 'North', Sales: 98 }, { Region: 'Islands', Sales: 64 },
];

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const stackRows = (year: number) => QUARTERS.flatMap((Quarter, index) => [
  { Quarter, Region: 'North', Sales: year === 2024 ? [42, 51, 47, 60][index] : [55, 49, 63, 71][index] },
  { Quarter, Region: 'South', Sales: year === 2024 ? [38, 35, 44, 41][index] : [30, 41, 36, 52][index] },
  { Quarter, Region: 'East', Sales: year === 2024 ? [25, 31, 28, 33][index] : [34, 29, 38, 30][index] },
]);

const COUNTRIES: Record<string, Record<number, [number, number]>> = {
  Aland: { 2000: [8, 61], 2005: [11, 64], 2010: [15, 67], 2015: [21, 70], 2020: [26, 72] },
  Borea: { 2000: [32, 76], 2005: [36, 77], 2010: [38, 78], 2015: [43, 80], 2020: [45, 81] },
  Corvia: { 2000: [3, 52], 2005: [4, 55], 2010: [6, 59], 2015: [7, 62], 2020: [9, 64] },
  Dunmar: { 2000: [18, 70], 2005: [22, 71], 2010: [20, 72], 2015: [25, 74], 2020: [29, 75] },
  Estiva: { 2000: [12, 66], 2005: [17, 68], 2010: [24, 71], 2015: [31, 73], 2020: [37, 76] },
  Folia: { 2000: [26, 73], 2005: [27, 73], 2010: [29, 75], 2015: [30, 76], 2020: [31, 77] },
};
const YEARS = [2000, 2005, 2010, 2015, 2020];
const nearestYear = (year: number) => YEARS.reduce((best, candidate) => Math.abs(candidate - year) < Math.abs(best - year) ? candidate : best, YEARS[0]);
const countryRows = (year: number) => {
  const lower = YEARS.filter((candidate) => candidate <= year).at(-1) ?? YEARS[0];
  const upper = YEARS.find((candidate) => candidate >= year) ?? YEARS[YEARS.length - 1];
  const t = upper === lower ? 0 : (year - lower) / (upper - lower);
  return Object.entries(COUNTRIES).map(([Country, byYear]) => {
    const [g0, l0] = byYear[lower];
    const [g1, l1] = byYear[upper];
    return { Country, 'GDP per person ($k)': g0 + (g1 - g0) * t, 'Life expectancy': l0 + (l1 - l0) * t };
  });
};

const MONTHS = ['2025-01-01', '2025-02-01', '2025-03-01', '2025-04-01', '2025-05-01', '2025-06-01', '2025-07-01', '2025-08-01', '2025-09-01', '2025-10-01', '2025-11-01', '2025-12-01'];
const lineRows = (shift: number) => MONTHS.flatMap((Month, index) => [
  { Month, Series: 'Online', Orders: Math.round(120 + index * 9 + Math.sin(index / 1.6 + shift) * 28) },
  { Month, Series: 'In store', Orders: Math.round(150 - index * 4 + Math.cos(index / 2 + shift) * 18) },
]);

const SKUS = ['Laptops', 'Phones', 'Tablets', 'Monitors', 'Desks', 'Chairs', 'Lamps', 'Shelves', 'Paper', 'Pens', 'Ink', 'Folders'];
const skuRows = (count: number) => SKUS.slice(0, count).map((Product, at) => ({ Product, Units: [84, 120, 58, 63, 46, 71, 39, 27, 132, 98, 44, 52][at] }));

const DENSE = Array.from({ length: 3000 }, (_, index) => {
  const angle = index * 2.399963;
  const radius = Math.sqrt(index) * 1.7;
  return { Group: ['A', 'B', 'C'][index % 3], x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
});


export function UpdateAnimationLab() {
  const [duration, setDuration] = useState(300);
  const [renderer, setRenderer] = useState<Renderer>('svg');

  const inputs = useMemo(() => ({
    stack: chart('Stacked Bar Chart', 'Sales by quarter and region', versions('Year', [['2024', stackRows(2024)], ['2025', stackRows(2025)]]), { Year: 'Category', Quarter: 'Category', Region: 'Category', Sales: 'Quantity' }, { x: 'Quarter', y: 'Sales', color: 'Region' }),
    size: chart('Bar Chart', 'Units by product', skuRows(4), { Product: 'Category', Units: 'Count' }, { x: 'Product', y: 'Units' }),
    scatter: chart('Scatter Plot', 'Income and lifespan (illustrative)', countryRows(2000), { Country: 'Category', 'GDP per person ($k)': 'Quantity', 'Life expectancy': 'Quantity' }, { x: 'GDP per person ($k)', y: 'Life expectancy', color: 'Country' }),
    grouped: chart('Grouped Bar Chart', 'Sales by quarter and region', stackRows(2024), { Quarter: 'Category', Region: 'Category', Sales: 'Quantity' }, { x: 'Quarter', y: 'Sales', group: 'Region' }),
    monthly: chart('Bar Chart', 'Online orders by month', lineRows(0).filter((row) => row.Series === 'Online'), { Month: 'Date', Series: 'Category', Orders: 'Quantity' }, { x: 'Month', y: 'Orders' }),
    dense: chart('Scatter Plot', '3,000 points', DENSE, { Group: 'Category', x: 'Quantity', y: 'Quantity' }, { x: 'x', y: 'y', color: 'Group' }),
    zoom: chart('Line Chart', 'Orders by channel', lineRows(0), { Month: 'Date', Series: 'Category', Orders: 'Quantity' }, { x: 'Month', y: 'Orders', color: 'Series' }),
    story: chart('Bar Chart', 'Sales by region', REGIONS, { Region: 'Category', Sales: 'Quantity' }, { x: 'Region', y: 'Sales' }),
  }), []);
  const interactions = useMemo(() => ({
    stack: [versionPicker('Year'), legendToggle(), clickHighlight()],
    size: [clickHighlight()],
    scatter: [clickHighlight()],
    zoom: [brushZoom({ axes: 'x' })],
    story: [dragReorder()],
    dense: [clickHighlight()],
    grouped: [clickHighlight()],
    monthly: [clickHighlight()],
  }), []);
  const retyped = (input: ChartAssemblyInput, chartType: string, encodings: Record<string, string>): ChartAssemblyInput => ({
    ...input,
    chart_spec: { ...input.chart_spec, chartType, encodings },
  });

  const apply = (surface: InteractiveChartSurface, update: ChartUpdate) => { void surface.applyUpdate(update); };
  const shared = { duration, renderer };
  const sortedRegions = [...REGIONS].sort((a, b) => b.Sales - a.Sales).map((row) => row.Region);

  const cases: Record<string, ReactNode> = {
    'stack': (
    <Case
      id="stack"
      title="Hide a series, change the year"
      op="set-style (hide) · set-data"
      note="Click a legend item to hide its series: it fades out first, then the stacks re-form and the y axis rescales with them. Pick another year: every segment grows or shrinks in place."
      input={inputs.stack}
      interactions={interactions.stack}
      {...shared}
    />
    ),
    'size': (
    <Case
      id="size"
      title="The chart grows with its data"
      op="set-data · size"
      note="A bar chart gives each category a band, so twelve products need a wider chart than four. The new size moves with the bars: the old bars narrow into place as the new ones fade in."
      input={inputs.size}
      interactions={interactions.size}
      {...shared}
      controls={(surface) => (
        <>
          <button type="button" onClick={() => apply(surface, { id: 'rows', ops: [{ op: 'set-data', source: 'main', value: { rows: skuRows(12) } }] })}>12 products</button>
          <button type="button" onClick={() => apply(surface, { id: 'rows', ops: [{ op: 'set-data', source: 'main', value: { rows: skuRows(4) } }] })}>4 products</button>
        </>
      )}
    />
    ),
    'scatter': (
    <ScatterCase input={inputs.scatter} interactions={interactions.scatter} {...shared} />
    ),
    'zoom': (
    <Case
      id="zoom"
      title="Brush to zoom"
      op="set-viewport"
      note="Drag across the plot and release: the domain moves in. Double-click or Escape flies home. The drag itself follows the pointer."
      input={inputs.zoom}
      interactions={interactions.zoom}
      {...shared}
      controls={(surface) => (
        <>
          <button type="button" onClick={() => apply(surface, { id: 'frame', ops: [{ op: 'set-viewport', axes: 'x', value: { x: ['2025-04-01', '2025-07-01'] } }] })}>Frame Q2</button>
          <button type="button" onClick={() => { void surface.clearUpdate('frame'); }}>Whole year</button>
        </>
      )}
    />
    ),
    'story': (
    <Case
      id="story"
      title="One story step"
      op="set-order + set-annotation"
      note="A single update sorts the bars and names the leader. The note waits until its bar has landed."
      input={inputs.story}
      interactions={interactions.story}
      {...shared}
      controls={(surface) => (
        <>
          <button type="button" onClick={() => apply(surface, {
            id: 'step',
            ops: [
              { op: 'set-order', scope: 'category', field: 'Region', values: sortedRegions },
              { op: 'set-annotation', target: { select: { key: { Region: 'West' } } }, value: { text: 'West leads' } },
            ],
          })}>Step 1</button>
          <button type="button" onClick={() => apply(surface, {
            id: 'step',
            ops: [
              { op: 'set-order', scope: 'category', field: 'Region', values: [...sortedRegions].reverse() },
              { op: 'set-style', targets: [where('Region', ['Islands'])], value: { state: 'emphasized', mutedOpacity: 0.25 } },
              { op: 'set-annotation', target: { select: { key: { Region: 'Islands' } } }, value: { text: 'Islands trail' } },
            ],
          })}>Step 2</button>
          <button type="button" onClick={() => { void surface.clearUpdate('step'); }}>Reset</button>
        </>
      )}
    />
    ),
    'retype-stack': (
    <Case
      id="retype-stack"
      title="Grouped to stacked, and what carries"
      op="setInput · morph"
      note="Grouped to stacked is a transition Flint lists: each bar morphs into its segment, and the axes move and resize to the new chart. Emphasize North first: an update the host sent carries to the new chart. A bar you clicked does not; the reader's own selections start afresh."
      input={inputs.grouped}
      interactions={interactions.grouped}
      {...shared}
      controls={(surface) => (
        <>
          <button type="button" onClick={() => apply(surface, { id: 'north', ops: [{ op: 'set-style', targets: [where('Region', ['North'])], value: { state: 'emphasized', mutedOpacity: 0.2 } }] })}>Emphasize North</button>
          <button type="button" onClick={() => { void surface.setInput(retyped(inputs.grouped, 'Stacked Bar Chart', { x: 'Quarter', y: 'Sales', color: 'Region' })); }}>Stacked</button>
          <button type="button" onClick={() => { void surface.setInput(inputs.grouped); }}>Grouped</button>
          <button type="button" onClick={() => { void surface.clearUpdate('north'); }}>Clear</button>
        </>
      )}
    />
    ),
    'retype-line': (
    <Case
      id="retype-line"
      title="Bars to a line, an area, a lollipop"
      op="setInput · morph"
      note="Each is a transition Flint lists for bars on an ordered axis: the bars shrink to the line's points, fill into the area, or thin into stems. The axes and title are the same parts on both sides, so they stay put."
      input={inputs.monthly}
      interactions={interactions.monthly}
      {...shared}
      controls={(surface) => (
        <>
          <button type="button" onClick={() => { void surface.setInput(retyped(inputs.monthly, 'Line Chart', { x: 'Month', y: 'Orders' })); }}>Line</button>
          <button type="button" onClick={() => { void surface.setInput(inputs.monthly); }}>Bar</button>
          <button type="button" onClick={() => { void surface.setInput(retyped(inputs.monthly, 'Lollipop Chart', { x: 'Month', y: 'Orders' })); }}>Lollipop</button>
          <button type="button" onClick={() => { void surface.setInput(retyped(inputs.monthly, 'Area Chart', { x: 'Month', y: 'Orders' })); }}>Area</button>
        </>
      )}
    />
    ),
    'dense': (
    <Case
      id="dense"
      title="Past the item cap"
      op="set-style"
      note="Past 2,000 drawn items a committed change jumps rather than moving every mark each frame."
      input={inputs.dense}
      interactions={interactions.dense}
      {...shared}
      controls={(surface) => (
        <>
          <button type="button" onClick={() => apply(surface, { id: 'group', ops: [{ op: 'set-style', targets: [where('Group', ['B'])], value: { state: 'emphasized', mutedOpacity: 0.15 } }] })}>Emphasize B</button>
          <button type="button" onClick={() => { void surface.clearUpdate('group'); }}>Clear</button>
        </>
      )}
    />
    ),
  };
  return (
    <div className="dev-page ov-page ua-page">
      <header className="dev-page-heading ov-heading">
        <h1>Update animation</h1>
        <p>
          Every committed change eases from what is drawn to what the update says; previews that follow the
          pointer jump. Click marks and legend items, or use each card's buttons. Press one again mid-flight
          and the chart turns back from the frame on screen.
        </p>
        <div className="ua-settings">
          <label>
            Chart transition
            <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
              {[0, 150, 300, 600, 1200].map((value) => <option key={value} value={value}>{value === 0 ? 'Off' : `${value} ms`}{value === 300 ? ' (default)' : ''}</option>)}
            </select>
          </label>
          <label>
            Renderer
            <select value={renderer} onChange={(event) => setRenderer(event.target.value as Renderer)}>
              <option value="svg">SVG</option>
              <option value="canvas">Canvas</option>
            </select>
          </label>
        </div>
      </header>

      <div className="cf-grid">
        <OpeningTour {...shared} />
      </div>

      <AnimationOverview />

      <Section title="Why changes move" note="Motion lets the reader follow each thing from the old chart to the new one, instead of searching for it again.">
        <WithAndWithout {...shared} />
      </Section>

      <Section title="Rule 1 · Every frame reads true" note="Scales move from the domain drawn to the new one, and axes, gridlines and marks read the same moving scale. A chart whose size follows its data moves to its new size, and a line clips to its plot while it slides.">
        {pick(cases, 'stack', 'size')}
        <BespokeCases only={['feed']} {...shared} />
      </Section>

      <Section title="Rule 2 · Only what exists on both sides moves" note="An element is what it is about: its identity. New values move it, held selections and notes stay on it, and what has no counterpart arrives or leaves.">
        <IdentityCases {...shared} />
      </Section>

      <Section title="Leave, move, arrive, then notes" note="Rows that go fade out first, what stays moves, rows that arrive fade in last; a new order glides with its axis labels; a note an update adds waits for its marks to land.">
        <BespokeCases only={['drill', 'race']} {...shared} />
        {pick(cases, 'story')}
      </Section>

      <Section title="Commits ease, previews follow the hand" note="A drag, a scrub or a brush in progress sends previews, which show at once; letting go commits, which eases.">
        {pick(cases, 'scatter', 'zoom')}
      </Section>

      <Section title="Changes in flight, and across charts" note="A change in flight is overtaken from the frame on screen; an update the chart already holds changes nothing; a commit on one linked chart is a commit on the other.">
        <InterruptAndRepeat {...shared} />
        <LinkedPair {...shared} />
      </Section>

      <Section title="A new spec lands too" note="A new chart type is a new spec, not an update: setInput mounts it beside the chart on screen and the two hand over. Marks morph along a chart transition Flint lists; otherwise, and for a new theme, the charts cross-fade.">
        {pick(cases, 'retype-stack', 'retype-line')}
        <CrossFade {...shared} />
      </Section>

      <Section title="Duration and limits" note="The call wins, then the interaction, then the chart, then the 300 ms default; reduced motion turns every change into a jump. Past 2,000 drawn items a change jumps, and past 1,000 a change of chart cross-fades.">
        <DurationPrecedence {...shared} />
        {pick(cases, 'dense')}
      </Section>

      <Section title="Every chart type" note="Pick the other version under each chart; click a mark to emphasize it.">
        <ChartTypeGallery {...shared} />
      </Section>
    </div>
  );
}

function ScatterCase({ input, interactions, duration, renderer }: { input: ChartAssemblyInput; interactions: readonly InteractionDef[]; duration: number; renderer: Renderer }) {
  const [year, setYear] = useState(2000);
  const playing = useRef(false);
  const show = async (surface: InteractiveChartSurface, next: number) => {
    setYear(next);
    await surface.applyUpdate({ id: 'year', ops: [{ op: 'set-data', source: 'main', value: { rows: countryRows(next) } }] });
  };
  return (
    <Case
      id="scatter"
      title={`Step or scrub through years · ${Math.round(year)}`}
      op="set-data · phase"
      note="Steps commit and ease. Dragging the slider sends previews, which follow the hand; letting go commits the nearest year."
      input={input}
      interactions={interactions}
      duration={duration}
      renderer={renderer}
      controls={(surface) => (
        <>
          <button type="button" onClick={() => void show(surface, YEARS[Math.max(0, YEARS.indexOf(Math.round(year)) - 1)] ?? YEARS[0])}>◀</button>
          <button type="button" onClick={() => void show(surface, YEARS[Math.min(YEARS.length - 1, YEARS.indexOf(Math.round(year)) + 1)] ?? YEARS[0])}>▶</button>
          <button
            type="button"
            onClick={async () => {
              if (playing.current) return;
              playing.current = true;
              for (const next of YEARS) await show(surface, next);
              playing.current = false;
            }}
          >Play</button>
          <input
            type="range"
            aria-label="Year"
            min={2000}
            max={2020}
            step={0.1}
            value={year}
            onChange={(event) => {
              const next = Number(event.target.value);
              setYear(next);
              void surface.applyUpdate({ id: 'year', ops: [{ op: 'set-data', source: 'main', value: { rows: countryRows(next) } }] }, { phase: 'preview' });
            }}
            onPointerUp={() => void show(surface, nearestYear(year))}
            onKeyUp={() => void show(surface, nearestYear(year))}
          />
        </>
      )}
    />
  );
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <>
      <div className="ov-section-heading lp-group-heading ua-section-heading">
        <span>{title}</span>
      </div>
      <p className="ua-section-note">{note}</p>
      <div className="cf-grid">{children}</div>
    </>
  );
}

function pick(cases: Record<string, ReactNode>, ...ids: string[]): ReactNode[] {
  return ids.map((id) => <Fragment key={id}>{cases[id]}</Fragment>);
}
