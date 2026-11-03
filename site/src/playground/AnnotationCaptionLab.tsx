import { useMemo } from 'react';
import { FlintChart } from 'flint-chart/react';
import type { ChartAssemblyInput } from 'flint-chart';
import AGENT_EXAMPLES from './annotation-agent-examples.json';
import './annotation-lab.css';

/**
 * Notes that name one mark, set as captions beside it: the words in the chart's label face with a
 * halo, a short leader to the mark's outline only where the caption is not plainly beside it, each
 * note placed one after another clear of the marks, the text and the notes before it.
 */

type Update = { id: string; ops: unknown[] };

const CARS: { name: string; horsepower: number; mpg: number; origin: string }[] = [
  { name: 'datsun 1200', horsepower: 69, mpg: 35, origin: 'Japan' },
  { name: 'toyota corolla 1200', horsepower: 65, mpg: 31, origin: 'Japan' },
  { name: 'opel 1900', horsepower: 90, mpg: 28, origin: 'Europe' },
  { name: 'datsun pl510', horsepower: 88, mpg: 27, origin: 'Japan' },
  { name: 'volkswagen 1131 deluxe sedan', horsepower: 46, mpg: 26, origin: 'Europe' },
  { name: 'bmw 2002', horsepower: 113, mpg: 26, origin: 'Europe' },
  { name: 'saab 99e', horsepower: 95, mpg: 25, origin: 'Europe' },
  { name: 'peugeot 504', horsepower: 87, mpg: 25, origin: 'Europe' },
  { name: 'toyota corona', horsepower: 95, mpg: 25.2, origin: 'Japan' },
  { name: 'audi 100 ls', horsepower: 90, mpg: 24, origin: 'Europe' },
  { name: 'toyota corona hardtop', horsepower: 95, mpg: 24, origin: 'Japan' },
  { name: 'toyota corona mark ii', horsepower: 97, mpg: 24, origin: 'Japan' },
  { name: 'chevrolet chevelle malibu', horsepower: 130, mpg: 18, origin: 'USA' },
  { name: 'plymouth satellite', horsepower: 150, mpg: 18, origin: 'USA' },
  { name: 'ford torino', horsepower: 140, mpg: 17, origin: 'USA' },
  { name: 'amc rebel sst', horsepower: 150, mpg: 16, origin: 'USA' },
  { name: 'buick skylark 320', horsepower: 165, mpg: 15, origin: 'USA' },
  { name: 'ford galaxie 500', horsepower: 198, mpg: 15, origin: 'USA' },
];

const SIZE = { width: 640, height: 400 };

const cars = (theme?: string): ChartAssemblyInput => ({
  data: { values: CARS },
  semantic_types: { name: 'Name', horsepower: 'Quantity', mpg: 'Quantity', origin: 'Category' },
  chart_spec: {
    chartType: 'Scatter Plot',
    title: 'Horsepower and fuel economy',
    encodings: { x: 'horsepower', y: 'mpg', color: 'origin', detail: 'name' },
    canvasSize: SIZE,
  },
  ...(theme ? { theme_spec: theme } : {}),
}) as unknown as ChartAssemblyInput;

const note = (id: string, key: Record<string, unknown>, text: string, extra: Record<string, unknown> = {}): Update => ({
  id,
  ops: [{ op: 'set-annotation', target: { select: { key } }, value: { text, ...extra } }],
});

const FEW = [
  note('datsun', { name: 'datsun 1200' }, 'datsun 1200: best mileage'),
  note('bmw', { name: 'bmw 2002' }, 'bmw 2002'),
  note('corona', { name: 'toyota corona' }, 'toyota corona'),
  note('galaxie', { name: 'ford galaxie 500' }, 'ford galaxie 500: most power'),
];
const EVERY = CARS.map((car) => note(car.name, { name: car.name }, car.name));

const SALES = ['North', 'South', 'East', 'West', 'Central', 'Online'].map((region, i) => ({ region, revenue: [42, 31, 55, 28, 37, 61][i] }));
const bars: ChartAssemblyInput = {
  data: { values: SALES },
  semantic_types: { region: 'Category', revenue: 'Amount' },
  chart_spec: { chartType: 'Bar Chart', title: 'Revenue by region', encodings: { x: 'region', y: 'revenue' }, canvasSize: SIZE },
} as unknown as ChartAssemblyInput;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SERIES = MONTHS.flatMap((month, i) => [
  { month: `2024-${String(i + 1).padStart(2, '0')}`, product: 'Hardware', units: 120 + i * 9 + (i === 6 ? 40 : 0) },
  { month: `2024-${String(i + 1).padStart(2, '0')}`, product: 'Software', units: 90 + i * 5 },
]);
const lines: ChartAssemblyInput = {
  data: { values: SERIES },
  semantic_types: { month: 'YearMonth', product: 'Category', units: 'Count' },
  chart_spec: { chartType: 'Line Chart', title: 'Units sold', encodings: { x: 'month', y: 'units', color: 'product' }, canvasSize: SIZE },
} as unknown as ChartAssemblyInput;

const CITIES = ['Oslo', 'Paris', 'Rome', 'Cairo'];
const TEMPS = CITIES.flatMap((city, j) => MONTHS.map((month, i) => ({ city, month, temp: Math.round(-4 + j * 7 + 12 * Math.sin((i - 3) / 12 * Math.PI * 2)) })));
const heat: ChartAssemblyInput = {
  data: { values: TEMPS },
  semantic_types: { city: 'Category', month: 'Month', temp: { semanticType: 'Temperature', unit: '°C' } },
  chart_spec: { chartType: 'Heatmap', title: 'Monthly temperature', encodings: { x: 'month', y: 'city', color: 'temp' }, canvasSize: SIZE },
} as unknown as ChartAssemblyInput;

const CASES: { key: string; title: string; why: string; spec: ChartAssemblyInput; updates: Update[] }[] = [
  { key: 'few', title: 'A few notes on a scatter', why: 'Four notes, each beside its dot; a leader only where the dot is crowded.', spec: cars(), updates: FEW },
  { key: 'every', title: 'Every car named, one after another', why: 'Eighteen notes placed in turn, each clear of the notes before it — sequential, not a joint search.', spec: cars(), updates: EVERY },
  { key: 'themed', title: 'Under a theme', why: 'The caption takes the house\'s label face and background.', spec: cars('economist'), updates: FEW },
  { key: 'bar', title: 'A bar\'s value', why: 'Stands at the value end, the side the bar suggests.', spec: bars, updates: [note('online', { region: 'Online' }, 'Only channel still growing')] },
  { key: 'line', title: 'A point on a line', why: 'The July spike, beside its point, clear of both lines.', spec: lines, updates: [note('july', { month: '2024-07', product: 'Hardware' }, 'July promotion', { anchor: 'point' })] },
  { key: 'cell', title: 'A heatmap cell', why: 'Beside its cell, haloed over the neighbours.', spec: heat, updates: [note('cairo', { city: 'Cairo', month: 'Jul' }, 'hottest month')] },
];

/** The chart as it was before it took part: no room made for its notes, and no highlight on the marks they name. */
const uncoordinated = (spec: ChartAssemblyInput, updates: Update[]): { spec: ChartAssemblyInput; updates: Update[] } => ({
  spec: { ...spec, options: { ...(spec as { options?: object }).options, notes: [] } } as ChartAssemblyInput,
  updates: updates.map((update) => ({
    ...update,
    ops: update.ops.map((op) => ({ ...(op as object), value: { ...(op as { value: object }).value, highlight: 'none' } })),
  })),
});

const hbars: ChartAssemblyInput = {
  ...bars,
  chart_spec: { ...bars.chart_spec, encodings: { y: 'region', x: 'revenue' } },
} as unknown as ChartAssemblyInput;
const nytBars: ChartAssemblyInput = { ...bars, theme_spec: 'nyt' } as unknown as ChartAssemblyInput;

const PAIRS: { key: string; title: string; why: string; spec: ChartAssemblyInput; updates: Update[] }[] = [
  { key: 'bar', title: 'The tallest bar', why: 'The axis runs on to the next round tick, so the caption stands at the bar\'s end; the bar is faintly outlined.', spec: bars, updates: [note('online', { region: 'Online' }, 'Only channel still growing')] },
  { key: 'nyt', title: 'The tallest bar, on a ruled axis', why: 'Flint\'s own ticks run on at their step: 60 → 70.', spec: nytBars, updates: [note('online', { region: 'Online' }, 'Only channel still growing')] },
  { key: 'hbar', title: 'The longest bar, across', why: 'A caption across needs its width past the bar: at most a third of the axis is given.', spec: hbars, updates: [note('online', { region: 'Online' }, 'Only channel still growing')] },
  { key: 'peak', title: 'A peak at the top', why: 'The July spike gets a dot in its line\'s ink and room above it.', spec: lines, updates: [note('july', { month: '2024-07', product: 'Hardware' }, 'July promotion', { anchor: 'point' })] },
  { key: 'dots', title: 'Dots in a crowd', why: 'Each named dot is drawn again above its neighbours with a halo.', spec: cars(), updates: FEW },
];

const LEVELS = (['none', 'light', 'strong', 'exclusive'] as const).map((highlight) => ({
  key: `level-${highlight}`,
  title: `highlight: '${highlight}'`,
  why: {
    none: 'The mark as drawn: only the caption and its leader say which.',
    light: 'The default. Lifted above its neighbours with a halo; a bar or cell faintly outlined.',
    strong: 'A thin ring round the dot, a full outline round a bar or cell.',
    exclusive: 'Strong, and every other mark recedes, as an emphasis does.',
  }[highlight],
  spec: cars(),
  updates: [note('corona', { name: 'toyota corona' }, 'Best-selling import of 1972', { highlight })],
}));

const region = (id: string, name: string, value: Record<string, unknown>): Update => ({ id, ops: [{ op: 'annotate-region', name, value }] });
const enclosure = (id: string, name: string, value: Record<string, unknown>): Update => ({ id, ops: [{ op: 'annotate-enclosure', name, value }] });
const where = (fields: Record<string, unknown>) => ({ select: { where: Object.fromEntries(Object.entries(fields).map(([field, values]) => [field, Array.isArray(values) ? { in: values } : values])) } });
const themed = (spec: ChartAssemblyInput, theme: string): ChartAssemblyInput => ({ ...spec, theme_spec: theme }) as unknown as ChartAssemblyInput;

const MARKUP: { key: string; title: string; why: string; spec: ChartAssemblyInput; updates: Update[] }[] = [
  { key: 'region-period', title: 'A period on a line', why: 'An x stretch: the wash under the lines, its caption centred on it, clear of the series.', spec: lines,
    updates: [region('summer', 'summer', { x: ['2024-06', '2024-08'], text: 'Summer promotion' })] },
  { key: 'region-band', title: 'A band of values', why: 'A y stretch: across it, inside where clear.', spec: lines,
    updates: [region('target', 'target', { y: [100, 140], text: 'Target range' })] },
  { key: 'region-box', title: 'A box on a scatter', why: 'Both axes: inside the box where clear, else outside on a leader.', spec: cars(),
    updates: [region('sweet', 'sweet', { x: [80, 120], y: [23, 29], text: 'Mid-power, efficient' })] },
  { key: 'region-categories', title: 'Adjacent categories', why: 'Whole bands of the named categories; two regions take distinct muted washes.', spec: bars,
    updates: [region('weak', 'weak', { x: ['West', 'Central'], text: 'Below forty' }), region('strong', 'strong', { x: ['Online'] })] },
  { key: 'region-themed', title: 'A period, under a theme', why: 'The house\'s face and page; the caption in a readable shade of the wash.', spec: themed(lines, 'economist'),
    updates: [region('summer', 'summer', { x: ['2024-06', '2024-08'], text: 'Summer promotion' })] },
  { key: 'enclose-hull', title: 'A cluster on a scatter', why: 'A padded hull round the US cars, in their own colour, its caption beside it.', spec: cars(),
    updates: [enclosure('usa', 'usa', { targets: [where({ origin: ['USA'] })], text: 'American V8s' })] },
  { key: 'enclose-shared', title: 'Two groups, one caption', why: 'Ellipses round two clusters with one shared caption and a leader to each.', spec: cars(),
    updates: [enclosure('imports', 'imports', { targets: [where({ name: ['datsun 1200', 'toyota corolla 1200'] }), where({ name: ['bmw 2002', 'opel 1900'] })], shape: 'ellipse', text: 'Imports at both ends' })] },
  { key: 'enclose-bars', title: 'A run of bars', why: 'A rectangle tight round the bars, in a keyline that reads on them and the page.', spec: bars,
    updates: [enclosure('legacy', 'legacy', { targets: [where({ region: ['North', 'South'] })], text: 'Legacy regions' })] },
  { key: 'enclose-cells', title: 'Heatmap cells', why: 'Cells outlined inside their edges, in a hue apart from the ramp.', spec: heat,
    updates: [enclosure('hot', 'hot', { targets: [where({ city: ['Cairo'], month: ['Jun', 'Jul', 'Aug'] })], text: 'Hottest stretch' })] },
  { key: 'enclose-themed', title: 'A cluster, under a theme', why: 'The same hull on the economist house.', spec: cars('economist'),
    updates: [enclosure('usa', 'usa', { targets: [where({ origin: ['USA'] })], text: 'American V8s' })] },
  { key: 'together', title: 'Region, enclosure and a note', why: 'Drawn in order: the region\'s and enclosure\'s captions first, the note clear of them.', spec: cars(),
    updates: [
      region('sweet', 'sweet', { x: [80, 120], y: [23, 29], text: 'Mid-power, efficient' }),
      enclosure('usa', 'usa', { targets: [where({ origin: ['USA'] })], text: 'American V8s' }),
      note('datsun', { name: 'datsun 1200' }, 'Best mileage of the set'),
    ] },
];

export function AnnotationCaptionLab() {
  const cases = useMemo(() => CASES, []);
  const pairs = useMemo(() => PAIRS.flatMap((pair) => {
    const before = uncoordinated(pair.spec, pair.updates);
    return [
      { key: `${pair.key}-before`, title: `${pair.title} — before`, why: 'No room made, no highlight: the chart as drawn, the caption on its own.', ...before },
      { key: `${pair.key}-after`, title: `${pair.title} — after`, why: pair.why, spec: pair.spec, updates: pair.updates },
    ];
  }), []);
  return (
    <div className="dev-page cf-page annotation-page">
      <header className="dev-page-heading">
        <h1>Annotation captions</h1>
        <p>
          A note on one mark — a dot, a bar's value, a line's point, a cell — is set as words beside the mark, not a card: the
          chart's label face a size up, haloed in its background, joined by a short leader to the mark's outline only where it
          is not plainly beside it (<code>core/annotation</code>). Notes on a stretch of a line, a slice or a region keep their card.
        </p>
      </header>
      <header className="dev-page-heading">
        <h2>From agent runs</h2>
        <p>
          Charts agents made in the annotation experiment (<code>experiments/annotation</code>): given a dataset and a
          question, each chose the chart and its annotations. One per dataset, as the agent wrote it.
        </p>
      </header>
      <div className="cf-grid caption-grid">
        {(AGENT_EXAMPLES as { key: string; question: string; spec: unknown; updates: unknown[] }[]).map((item) => (
          <article key={item.key} className="cf-probe caption-card" data-case={item.key}>
            <header className="cf-probe-heading"><p>{item.question}</p></header>
            <div className="cf-mount">
              <FlintChart spec={item.spec as ChartAssemblyInput} updates={item.updates as never} renderer="svg" ariaLabel={item.question} />
            </div>
          </article>
        ))}
      </div>
      <header className="dev-page-heading">
        <h2>Hand-made cases</h2>
      </header>
      <div className="cf-grid caption-grid">
        {cases.map((item) => (
          <article key={item.key} className="cf-probe caption-card" data-case={item.key}>
            <header className="cf-probe-heading"><h3>{item.title}</h3><p>{item.why}</p></header>
            <div className="cf-mount">
              <FlintChart spec={item.spec} updates={item.updates as never} renderer="svg" ariaLabel={item.title} />
            </div>
          </article>
        ))}
      </div>
      <header className="dev-page-heading">
        <h2>The chart helps the note</h2>
        <p>
          Unlike a labeller working over a finished chart, Flint draws the chart too, so it can make the note's job easier
          rather than ask more of the caption. The mark a note names is highlighted — lifted above its neighbours with a
          halo by default (<code>highlight</code>: <code>'none'</code>, <code>'light'</code>, <code>'strong'</code>,
          <code>'exclusive'</code>). The notes a chart mounts with get room: where the noted
          mark sits at the end of a measure axis, the axis runs on to the next round tick, at most a third of its length
          (<code>AssembleOptions.notes</code>). Each pair shows the chart without, then with.
        </p>
      </header>
      <div className="cf-grid caption-grid">
        {pairs.map((item) => (
          <article key={item.key} className="cf-probe caption-card" data-case={item.key}>
            <header className="cf-probe-heading"><h3>{item.title}</h3><p>{item.why}</p></header>
            <div className="cf-mount">
              <FlintChart spec={item.spec} updates={item.updates as never} renderer="svg" ariaLabel={item.title} />
            </div>
          </article>
        ))}
      </div>
      <header className="dev-page-heading">
        <h2>How much the mark stands out</h2>
        <p>
          One note on a dot in the crowd, at each <code>highlight</code> level. A note says what the chart does not — not the
          value a label already prints (<code>validateChart</code> flags that as <code>note_repeats_chart</code>).
        </p>
      </header>
      <div className="cf-grid caption-grid">
        {LEVELS.map((item) => (
          <article key={item.key} className="cf-probe caption-card" data-case={item.key}>
            <header className="cf-probe-heading"><h3>{item.title}</h3><p>{item.why}</p></header>
            <div className="cf-mount">
              <FlintChart spec={item.spec} updates={item.updates as never} renderer="svg" ariaLabel={item.title} />
            </div>
          </article>
        ))}
      </div>
      <header className="dev-page-heading">
        <h2>Regions and enclosures</h2>
        <p>
          <code>annotate-region</code> shades a stretch of the plot and <code>annotate-enclosure</code> outlines groups of marks,
          after Blabber's <code>region</code> and <code>enclose</code>, each with an optional caption, shape, connectors and colour.
          <code>annotate-text</code> is the caption on one mark (<code>set-annotation</code> is its older name).
        </p>
      </header>
      <div className="cf-grid caption-grid">
        {MARKUP.map((item) => (
          <article key={item.key} className="cf-probe caption-card" data-case={item.key}>
            <header className="cf-probe-heading"><h3>{item.title}</h3><p>{item.why}</p></header>
            <div className="cf-mount">
              <FlintChart spec={item.spec} updates={item.updates as never} renderer="svg" ariaLabel={item.title} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
