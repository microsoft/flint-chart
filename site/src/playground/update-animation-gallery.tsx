import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  clickHighlight,
  dragReorder,
  type ChartUpdate,
  type InteractionDef,
  type InteractiveChartSurface,
} from 'flint-chart/interactive';
import { Case, chart, versionPicker, versions, where, type Renderer } from './update-animation-case';

type Row = Record<string, unknown>;

interface Shared {
  duration: number;
  renderer: Renderer;
}

/** A repeatable stream of numbers in [0, 1), so every load draws the same data. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS = Array.from({ length: 12 }, (_, index) => `2025-${String(index + 1).padStart(2, '0')}-01`);
const round = (value: number, digits = 0) => Number(value.toFixed(digits));
const normal = (random: () => number, mean: number, spread: number) =>
  mean + spread * (random() + random() + random() + random() - 2);

const send = (surface: InteractiveChartSurface, update: ChartUpdate) => { void surface.applyUpdate(update); };

interface TypeCaseSpec {
  id: string;
  /** The field that names each version of the data; a dropdown under the chart picks one. */
  version: string;
  chartType: string;
  title: string;
  types: Record<string, string>;
  encodings: Record<string, string>;
  variants: readonly (readonly [string, Row[]])[];
  emphasis?: { label: string; field: string; values: readonly unknown[] };
  width?: number;
  height?: number;
  chartProperties?: Record<string, unknown>;
}

function series(seed: number, names: readonly string[], field: string, base: number, spread: number): Row[] {
  const random = seeded(seed);
  return MONTHS.flatMap((Month, index) => names.map((name, at) => ({
    Month,
    [field]: name,
    Value: round(base + at * spread * 0.4 + Math.sin(index / 2 + at + seed) * spread + random() * spread * 0.5),
  })));
}

function raw(seed: number, groups: readonly string[], count: number, means: readonly number[], spread: number): Row[] {
  const random = seeded(seed);
  return groups.flatMap((Group, at) => Array.from({ length: count }, () => ({ Group, Value: round(normal(random, means[at]!, spread), 1) })));
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const SLOTS = ['9am', '10am', '11am', '12pm', '1pm'];
const heat = (seed: number): Row[] => {
  const random = seeded(seed);
  return DAYS.flatMap((Day) => SLOTS.map((Slot) => ({ Day, Slot, Visits: round(20 + random() * 80) })));
};
const COUNTRIES = ['Norway', 'Chile', 'Kenya', 'Japan', 'Peru'];
const SKILLS = ['Speed', 'Power', 'Stamina', 'Skill', 'Defence', 'Vision'];
const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const AGES = ['0–14', '15–29', '30–44', '45–59', '60–74', '75+'];

const TYPE_CASES: readonly TypeCaseSpec[] = [
  {
    id: 'stream', version: 'Year', chartType: 'Streamgraph', title: 'Listening by genre',
    types: { Month: 'Date', Genre: 'Category', Value: 'Quantity' }, encodings: { x: 'Month', y: 'Value', color: 'Genre' },
    variants: [['2024', series(3, ['Jazz', 'Rock', 'Pop', 'Folk'], 'Genre', 30, 14)], ['2025', series(11, ['Jazz', 'Rock', 'Pop', 'Folk'], 'Genre', 30, 22)]],
    emphasis: { label: 'Rock', field: 'Genre', values: ['Rock'] },
  },
  {
    id: 'heatmap', version: 'Week', chartType: 'Heatmap', title: 'Store visits by hour',
    types: { Day: 'Category', Slot: 'Category', Visits: 'Count' }, encodings: { x: 'Day', y: 'Slot', color: 'Visits' },
    variants: [['Week 1', heat(5)], ['Week 2', heat(9)]],
    emphasis: { label: 'Wednesday', field: 'Day', values: ['Wed'] },
  },
  {
    id: 'slope', version: 'Measure', chartType: 'Slope Chart', title: 'Renewable share, 2015 and 2025',
    types: { Year: 'Category', Country: 'Country', Share: 'Percentage' }, encodings: { x: 'Year', y: 'Share', color: 'Country' },
    variants: [
      ['Electricity', COUNTRIES.flatMap((Country, at) => [{ Year: '2015', Country, Share: [97, 41, 80, 15, 52][at] }, { Year: '2025', Country, Share: [98, 64, 90, 26, 61][at] }])],
      ['All energy', COUNTRIES.flatMap((Country, at) => [{ Year: '2015', Country, Share: [58, 25, 72, 7, 30][at] }, { Year: '2025', Country, Share: [66, 33, 75, 13, 36][at] }])],
    ],
    emphasis: { label: 'Chile', field: 'Country', values: ['Chile'] },
  },
  {
    id: 'donut', version: 'Version', chartType: 'Donut Chart', title: 'Budget by department',
    types: { Department: 'Category', Budget: 'Amount' }, encodings: { color: 'Department', size: 'Budget' },
    variants: [
      ['Plan', ['Research', 'Sales', 'Ops', 'Support'].map((Department, at) => ({ Department, Budget: [40, 25, 20, 15][at] }))],
      ['Actual', ['Research', 'Sales', 'Ops', 'Support'].map((Department, at) => ({ Department, Budget: [28, 34, 26, 12][at] }))],
    ],
    emphasis: { label: 'Sales', field: 'Department', values: ['Sales'] },
    width: 240,
  },
  {
    id: 'radar', version: 'Season', chartType: 'Radar Chart', title: 'Player profile',
    types: { Skill: 'Category', Player: 'Name', Score: 'Score' }, encodings: { x: 'Skill', y: 'Score', color: 'Player' },
    variants: [
      ['Season 1', SKILLS.flatMap((Skill, at) => [{ Skill, Player: 'Ada', Score: [80, 55, 70, 90, 40, 75][at] }, { Skill, Player: 'Ben', Score: [60, 85, 65, 50, 80, 55][at] }])],
      ['Season 2', SKILLS.flatMap((Skill, at) => [{ Skill, Player: 'Ada', Score: [85, 65, 80, 92, 55, 70][at] }, { Skill, Player: 'Ben', Score: [55, 90, 70, 60, 75, 65][at] }])],
    ],
    emphasis: { label: 'Ben', field: 'Player', values: ['Ben'] },
    width: 240,
  },
  {
    id: 'waterfall', version: 'Quarter', chartType: 'Waterfall Chart', title: 'From revenue to profit',
    types: { Step: 'Category', Change: 'Amount' }, encodings: { x: 'Step', y: 'Change' },
    variants: [
      ['Q1', [['Revenue', 120], ['Returns', -12], ['Costs', -64], ['Marketing', -18], ['Tax', -7]].map(([Step, Change]) => ({ Step, Change }))],
      ['Q2', [['Revenue', 150], ['Returns', -9], ['Costs', -70], ['Marketing', -30], ['Tax', -11]].map(([Step, Change]) => ({ Step, Change }))],
    ],
    emphasis: { label: 'Costs', field: 'Step', values: ['Costs'] },
  },
  {
    id: 'histogram', version: 'Period', chartType: 'Histogram', title: 'Delivery times',
    types: { Minutes: 'Duration' }, encodings: { x: 'Minutes' },
    variants: [
      ['Before', raw(21, ['all'], 260, [34], 10).map((row) => ({ Minutes: row.Value }))],
      ['After', raw(22, ['all'], 260, [26], 7).map((row) => ({ Minutes: row.Value }))],
    ],
  },
  {
    id: 'boxplot', version: 'Month', chartType: 'Boxplot', title: 'Response time by team',
    types: { Group: 'Category', Value: 'Duration' }, encodings: { x: 'Group', y: 'Value' },
    variants: [['March', raw(31, ['North', 'South', 'East'], 40, [30, 42, 36], 9)], ['April', raw(32, ['North', 'South', 'East'], 40, [26, 35, 44], 12)]],
    emphasis: { label: 'South', field: 'Group', values: ['South'] },
  },
  {
    id: 'violin', version: 'Term', chartType: 'Violin Plot', title: 'Scores by class',
    types: { Group: 'Category', Value: 'Score' }, encodings: { x: 'Group', y: 'Value' },
    variants: [['Term 1', raw(41, ['A', 'B', 'C'], 60, [62, 70, 55], 12)], ['Term 2', raw(42, ['A', 'B', 'C'], 60, [70, 66, 64], 9)]],
  },
  {
    id: 'gantt', version: 'Version', chartType: 'Gantt Chart', title: 'Launch plan',
    types: { Task: 'Category', Start: 'Date', End: 'Date' }, encodings: { y: 'Task', x: 'Start', x2: 'End' },
    variants: [
      ['Plan', [['Research', '2025-01-06', '2025-02-14'], ['Design', '2025-02-03', '2025-03-21'], ['Build', '2025-03-10', '2025-05-30'], ['Launch', '2025-06-02', '2025-06-20']].map(([Task, Start, End]) => ({ Task, Start, End }))],
      ['Slipped', [['Research', '2025-01-06', '2025-03-07'], ['Design', '2025-02-24', '2025-04-18'], ['Build', '2025-04-07', '2025-07-11'], ['Launch', '2025-07-14', '2025-08-01']].map(([Task, Start, End]) => ({ Task, Start, End }))],
    ],
    emphasis: { label: 'Build', field: 'Task', values: ['Build'] },
  },
  {
    id: 'bullet', version: 'Quarter', chartType: 'Bullet Chart', title: 'Quarter against target',
    types: { Metric: 'Category', Value: 'Quantity', Target: 'Quantity' }, encodings: { y: 'Metric', x: 'Value', goal: 'Target' },
    variants: [
      ['Q1', [['Revenue', 72, 80], ['Signups', 54, 50], ['Retention', 61, 70]].map(([Metric, Value, Target]) => ({ Metric, Value, Target }))],
      ['Q2', [['Revenue', 88, 85], ['Signups', 47, 55], ['Retention', 69, 70]].map(([Metric, Value, Target]) => ({ Metric, Value, Target }))],
    ],
    emphasis: { label: 'Signups', field: 'Metric', values: ['Signups'] },
  },
  {
    id: 'range-area', version: 'City', chartType: 'Range Area Chart', title: 'Daily temperature range',
    types: { Month: 'Date', Low: 'Temperature', High: 'Temperature' }, encodings: { x: 'Month', y: 'Low', y2: 'High' },
    variants: [
      ['Oslo', MONTHS.map((Month, at) => ({ Month, Low: round(-6 + 16 * Math.sin((at - 2) / 3.8)), High: round(1 + 20 * Math.sin((at - 2) / 3.8)) }))],
      ['Lima', MONTHS.map((Month, at) => ({ Month, Low: round(17 - 3 * Math.sin((at - 2) / 3.8)), High: round(24 - 4 * Math.sin((at - 2) / 3.8)) }))],
    ],
  },
  {
    id: 'candle', version: 'Stock', chartType: 'Candlestick Chart', title: 'Share price',
    types: { Day: 'Date', Open: 'Price', High: 'Price', Low: 'Price', Close: 'Price' }, encodings: { x: 'Day', open: 'Open', high: 'High', low: 'Low', close: 'Close' },
    variants: [1, 2].map((seed) => {
      const random = seeded(60 + seed);
      let price = seed === 1 ? 40 : 55;
      return [seed === 1 ? 'Acme' : 'Globex', Array.from({ length: 12 }, (_, at) => {
        const open = price;
        price = round(price + (random() - 0.45) * 6, 1);
        return { Day: `2025-03-${String(at + 3).padStart(2, '0')}`, Open: open, Close: price, High: round(Math.max(open, price) + random() * 3, 1), Low: round(Math.min(open, price) - random() * 3, 1) };
      })] as const;
    }),
  },
  {
    id: 'pyramid', version: 'Year', chartType: 'Pyramid Chart', title: 'Population by age',
    types: { Age: 'Category', Sex: 'Category', Population: 'Quantity' }, encodings: { x: 'Population', y: 'Age', color: 'Sex' },
    variants: [
      ['1990', AGES.flatMap((Age, at) => [{ Age, Sex: 'Women', Population: [21, 24, 22, 16, 11, 6][at] }, { Age, Sex: 'Men', Population: [22, 25, 22, 15, 9, 4][at] }])],
      ['2030', AGES.flatMap((Age, at) => [{ Age, Sex: 'Women', Population: [15, 17, 19, 20, 18, 13][at] }, { Age, Sex: 'Men', Population: [16, 18, 19, 19, 16, 9][at] }])],
    ],
    emphasis: { label: '75+', field: 'Age', values: ['75+'] },
  },
  {
    id: 'regression', version: 'Channel', chartType: 'Regression', title: 'Ad spend and sales',
    types: { Spend: 'Amount', Sales: 'Amount' }, encodings: { x: 'Spend', y: 'Sales' },
    variants: [1, 2].map((seed) => {
      const random = seeded(80 + seed);
      return [seed === 1 ? 'Online' : 'Print', Array.from({ length: 30 }, () => {
        const Spend = round(random() * 100);
        return { Spend, Sales: round(seed === 1 ? 20 + Spend * 1.4 + normal(random, 0, 25) : 60 + Spend * 0.5 + normal(random, 0, 18)) };
      })] as const;
    }),
  },
];

function TypeCase({ spec, duration, renderer, note = '', title, emphasize = false }: { spec: TypeCaseSpec; note?: string; title?: string; emphasize?: boolean } & Shared) {
  const input = useMemo(() => chart(
    spec.chartType,
    spec.title,
    versions(spec.version, spec.variants),
    { [spec.version]: 'Category', ...spec.types },
    spec.encodings,
    spec.width,
    spec.height,
    spec.chartProperties,
  ), [spec]);
  const interactions = useMemo(() => [versionPicker(spec.version), clickHighlight()], [spec.version]);
  const emphasis = emphasize ? spec.emphasis : undefined;
  return (
    <Case
      id={`type-${spec.id}`}
      title={title ?? spec.chartType}
      op={emphasis ? 'set-style · set-data' : 'set-data'}
      note={note}
      input={input}
      interactions={interactions}
      duration={duration}
      renderer={renderer}
      controls={emphasis && ((surface) => (
        <>
          <button type="button" onClick={() => send(surface, { id: 'emphasis', ops: [{ op: 'set-style', targets: [where(emphasis.field, emphasis.values)], value: { state: 'emphasized', mutedOpacity: 0.2 } }] })}>Emphasize {emphasis.label}</button>
          <button type="button" onClick={() => { void surface.clearUpdate('emphasis'); }}>Clear</button>
        </>
      ))}
    />
  );
}

const IDENTITY_NOTES: Record<string, [string, string]> = {
  gantt: ['Gantt: a task slides and stretches', 'The Gantt declares its own identity: the task. Its dates are values. Emphasize Build, then pick Slipped: the same bar slides and stretches, and stays lit.'],
  radar: ['Radar: a vertex slides along its spoke', 'Identity is the axis and the player, so a new score moves the vertex along its spoke. Emphasize Ben, then pick Season 2: Ben stays lit.'],
};

export function IdentityCases(shared: Shared) {
  return (
    <>
      {Object.entries(IDENTITY_NOTES).map(([id, [title, note]]) => {
        const spec = TYPE_CASES.find((candidate) => candidate.id === id)!;
        return <TypeCase key={id} spec={{ ...spec, id: `identity-${id}` }} title={title} note={note} emphasize {...shared} />;
      })}
      <AbsentCase {...shared} />
      <SharedColourCase {...shared} />
    </>
  );
}

const STOCK = versions('Store', [
  ['Main street', [['Laptops', 84], ['Phones', 120], ['Desks', 46], ['Chairs', 71], ['Paper', 132]].map(([Product, Units]) => ({ Product, Units }))],
  ['Airport', [['Laptops', 52], ['Phones', 140], ['Chairs', 18], ['Paper', 64]].map(([Product, Units]) => ({ Product, Units }))],
]);

/** An emphasized element that the new rows lack: the rest recede until it returns. */
function AbsentCase(shared: Shared) {
  const input = useMemo(() => chart('Bar Chart', 'Units by product', STOCK, { Store: 'Category', Product: 'Category', Units: 'Count' }, { x: 'Product', y: 'Units' }), []);
  const interactions = useMemo(() => [versionPicker('Store'), clickHighlight()], []);
  return (
    <Case
      id="identity-absent"
      title="An emphasized element goes missing"
      op="set-style held · set-data"
      note="Emphasize Desks, then pick Airport, which sells none: Desks leaves and the rest stay receded, because the emphasis still names Desks. Pick Main street again and Desks comes back lit."
      input={input}
      interactions={interactions}
      {...shared}
      controls={(surface) => (
        <>
          <button type="button" onClick={() => send(surface, { id: 'emphasis', ops: [{ op: 'set-style', targets: [where('Product', ['Desks'])], value: { state: 'emphasized', mutedOpacity: 0.2 } }] })}>Emphasize Desks</button>
          <button type="button" onClick={() => { void surface.clearUpdate('emphasis'); }}>Clear</button>
        </>
      )}
    />
  );
}

const sample = (seed: number): Row[] => {
  const random = seeded(seed);
  return ['North', 'South', 'East'].flatMap((Group, at) => Array.from({ length: 14 }, () => ({
    Group, Spend: round(normal(random, 30 + at * 20, 12)), Visits: round(normal(random, 40 + at * 15, 14)),
  })));
};

/** Points with only a colour to their name: the colour is shared, so each row is its own element. */
function SharedColourCase(shared: Shared) {
  const input = useMemo(() => chart('Scatter Plot', 'Visits and spend, one sample', sample(3), { Group: 'Category', Spend: 'Amount', Visits: 'Count' }, { x: 'Spend', y: 'Visits', color: 'Group' }), []);
  const interactions = useMemo(() => [clickHighlight()], []);
  const draw = useRef(3);
  return (
    <Case
      id="identity-shared"
      title="Points that share a colour"
      op="identity: the row"
      note="Fourteen points share each colour, so the colour names no single point and each row is its own element. Shift-click two points of one colour: both stay selected. Draw a new sample: the old points fade out and the new ones fade in, since no point is the same point again."
      input={input}
      interactions={interactions}
      {...shared}
      controls={(surface) => (
        <button type="button" onClick={() => {
          draw.current += 1;
          send(surface, { id: 'sample', ops: [{ op: 'set-data', source: 'main', value: { rows: sample(draw.current) } }] });
        }}>New sample</button>
      )}
    />
  );
}

export function ChartTypeGallery(shared: Shared) {
  return (
    <>
      {TYPE_CASES.filter((spec) => !(spec.id in IDENTITY_NOTES)).map((spec) => <TypeCase key={spec.id} spec={spec} {...shared} />)}
    </>
  );
}

const RACE_COUNTRIES = ['Avalon', 'Borea', 'Corvia', 'Dunmar', 'Estiva', 'Folia', 'Galt', 'Halden'];
const RACE_YEARS = [2000, 2004, 2008, 2012, 2016, 2020, 2024];
const raceRows = (year: number): Row[] => RACE_COUNTRIES.map((Country, at) => {
  const growth = [0.02, 0.07, 0.04, 0.11, 0.03, 0.09, 0.05, 0.13][at]!;
  return { Country, GDP: round([900, 300, 650, 120, 780, 210, 480, 90][at]! * (1 + growth) ** (year - 2000)) };
});
const raceOrder = (rows: Row[]) => [...rows].sort((a, b) => Number(b.GDP) - Number(a.GDP)).map((row) => row.Country);

const DRILL: Record<string, Row[]> = {
  'All regions': [['West', 186], ['East', 171], ['Central', 132], ['South', 121]].map(([Name, Sales]) => ({ Name, Sales })),
  West: [['Laptops', 64], ['Phones', 52], ['Desks', 38], ['Chairs', 32]].map(([Name, Sales]) => ({ Name, Sales })),
  East: [['Phones', 70], ['Paper', 41], ['Monitors', 36], ['Pens', 24]].map(([Name, Sales]) => ({ Name, Sales })),
};

const FEED_INTERVAL = 800;
const feedPoint = (index: number): Row => ({
  Time: new Date(Date.UTC(2025, 0, 1, 9, 0, index * 5)).toISOString(),
  Load: round(50 + 22 * Math.sin(index / 4) + 9 * Math.sin(index / 1.7) + (index % 7) * 2),
});

function useInputs() {
  return useMemo(() => ({
    race: chart('Bar Chart', 'GDP race (illustrative)', raceRows(RACE_YEARS[0]!), { Country: 'Country', GDP: 'Amount' }, { x: 'GDP', y: 'Country' }, 300, 230),
    drill: chart('Bar Chart', 'Sales, drill down', versions('View', Object.entries(DRILL)), { View: 'Category', Name: 'Category', Sales: 'Amount' }, { x: 'Name', y: 'Sales' }),
    feed: chart('Line Chart', 'Server load, live', Array.from({ length: 24 }, (_, index) => feedPoint(index)), { Time: 'Date', Load: 'Percentage' }, { x: 'Time', y: 'Load' }),
  }), []);
}

export function BespokeCases({ duration, renderer, only }: Shared & { only: readonly string[] }) {
  const inputs = useInputs();
  const interactions = useMemo(() => ({
    race: [dragReorder()] as InteractionDef[],
    plain: [clickHighlight()] as InteractionDef[],
    drill: [versionPicker('View'), clickHighlight()] as InteractionDef[],
  }), []);
  const shared = { duration, renderer };
  const racing = useRef(false);
  const feeding = useRef<number | null>(null);
  const mounted = useRef(true);
  const [raceYear, setRaceYear] = useState(RACE_YEARS[0]!);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (feeding.current !== null) window.clearInterval(feeding.current);
      feeding.current = null;
    };
  }, []);

  const cases: Record<string, ReactNode> = {
    'race': (
      <Case
        id="race"
        title={`Bar chart race · ${raceYear}`}
        op="set-data + set-order"
        note="Each step changes the values and the order in one update: bars grow and overtake, and the value axis rescales under them."
        input={inputs.race}
        interactions={interactions.race}
        {...shared}
        controls={(surface) => (
          <button type="button" onClick={async () => {
            if (racing.current) return;
            racing.current = true;
            for (const year of RACE_YEARS) {
              if (!mounted.current) break;
              setRaceYear(year);
              const rows = raceRows(year);
              await surface.applyUpdate({ id: 'race', ops: [
                { op: 'set-data', source: 'main', value: { rows } },
                { op: 'set-order', scope: 'category', field: 'Country', values: raceOrder(rows) },
              ] });
              await new Promise((resolve) => window.setTimeout(resolve, 250));
            }
            racing.current = false;
          }}>Race</button>
        )}
      />

    ),
    'drill': (
      <Case
        id="drill"
        title="Drill down"
        op="set-data (rows leave and arrive)"
        note="Pick a region under the chart: the regions leave, then its products arrive. The stages run in order, so the eye never follows both at once."
        input={inputs.drill}
        interactions={interactions.drill}
        {...shared}
      />

    ),
    'feed': (
      <Case
        id="feed"
        title="Live feed"
        op="set-data (streaming commits)"
        note="A point arrives every 800 ms and the oldest leaves. Each update asks for a linear transition as long as the interval, so the line slides at one speed without stopping: old points leave through the left edge, new ones come in from the right."
        input={inputs.feed}
        interactions={interactions.plain}
        {...shared}
        controls={(surface) => (
          <button type="button" onClick={(event) => {
            const button = event.currentTarget;
            if (feeding.current !== null) {
              window.clearInterval(feeding.current);
              feeding.current = null;
              button.textContent = 'Start feed';
              return;
            }
            let next = 24;
            button.textContent = 'Stop feed';
            feeding.current = window.setInterval(() => {
              next += 1;
              const rows = Array.from({ length: 24 }, (_, index) => feedPoint(next - 24 + index));
              void surface.applyUpdate({ id: 'feed', ops: [{ op: 'set-data', source: 'main', value: { rows } }] }, { transition: { duration: FEED_INTERVAL, easing: 'linear' } });
            }, FEED_INTERVAL);
          }}>Start feed</button>
        )}
      />

    ),
  };
  return <>{only.map((id) => <Fragment key={id}>{cases[id]}</Fragment>)}</>;
}
