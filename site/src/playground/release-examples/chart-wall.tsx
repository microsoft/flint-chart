import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { csvParseRows } from 'd3-dsv';
import { assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import { FlintView } from '../../components/FlintView';
import { siteTheme } from '../../shared/theme';
import { PREVIEW_CASES } from '../../shared/preview-cases';
import gapminderCsv from '../../assets/gapminder-five-year.csv?raw';
import classic from '../../data/classic-datasets.json';
import '../axis-label-lab.css';

/**
 * A wall of Flint charts for the README: everyday charts beside the newer types (globes, routes,
 * ridgelines, calendars, waterfalls), each in one of the preset themes, all from real data, packed
 * on one board sized to be taken in a single screenshot. It does not replace `docs/figs/chartwall.png`.
 */

type Row = Record<string, unknown>;
type Size = { width: number; height: number };
interface WeatherRows { daily: Row[]; seattle: Row[] }

interface WallTile {
  id: string;
  height: number;
  /** How much larger than its slot the chart is drawn before it shrinks into the card. */
  drawAt?: number;
  /** Builds the input at the tile's size; `weather` is null until the weather file arrives. */
  input: (size: Size, weather: WeatherRows | null) => ChartAssemblyInput | null;
}

/** Charts are laid out at a comfortable size and shrunk, rather than squeezed into a small canvas. */
const DRAW_AT = 1.25;

interface Words { title: string; subtitle?: string }

function input(values: Row[], semantic_types: Record<string, string>, theme: string, size: Size, chart_spec: Record<string, unknown>) {
  // baseSize is the size the chart is laid out for; canvasSize alone only caps it.
  return { data: { values }, semantic_types, chart_spec: { ...chart_spec, baseSize: size, canvasSize: size }, theme_spec: theme } as ChartAssemblyInput;
}

/**
 * A gallery case, in its real data, under new words, in `theme`. `more` derives fields from each row
 * (`relabel`) and adds their types and encodings, so a plain chart can carry a second reading.
 */
interface More { relabel?: (row: Row) => Row; semantic_types?: Record<string, string>; encodings?: Record<string, unknown>; chartProperties?: Record<string, unknown> }

function fromCase(id: string, theme: string, words: Words, more: More = {}) {
  const c = PREVIEW_CASES.find((candidate) => candidate.id === id);
  if (!c) throw new Error(`No preview case "${id}"`);
  const values = more.relabel ? c.data.map(more.relabel) : c.data;
  return (size: Size) => input(values, { ...c.semantic_types, ...more.semantic_types }, theme, size, {
    chartType: c.chartType, ...words, encodings: { ...c.encodings, ...more.encodings },
    ...(c.chartProperties || more.chartProperties ? { chartProperties: { ...c.chartProperties, ...more.chartProperties } } : {}),
  });
}

/** Continents of the countries in the CO₂ case. */
const CONTINENT: Record<string, string> = {
  Qatar: 'Asia', UAE: 'Asia', 'South Korea': 'Asia', Japan: 'Asia', China: 'Asia', India: 'Asia', Australia: 'Oceania',
  'United States': 'Americas', Canada: 'Americas', Mexico: 'Americas', Brazil: 'Americas',
  Russia: 'Europe', Germany: 'Europe', UK: 'Europe', France: 'Europe', 'South Africa': 'Africa',
};

/** Every country in Gapminder's 2007 snapshot: a full field of bubbles rather than a sample. */
const GAPMINDER_2007 = csvParseRows(gapminderCsv).slice(1)
  .filter(([, year]) => year === '2007')
  .map(([Country, , population, Continent, lifeExpectancy, gdp]) => ({
    Country, Continent, 'Population (M)': Number(population) / 1e6, 'Life expectancy': Number(lifeExpectancy), 'GDP per capita': Number(gdp),
  }));

/** Volcanoes of the Pacific Ring of Fire. */
const VOLCANOES = [
  ['Fuji', 138.73, 35.36], ['Sakurajima', 130.66, 31.58], ['Klyuchevskaya', 160.64, 56.06],
  ['Pinatubo', 120.35, 15.13], ['Mayon', 123.69, 13.26], ['Krakatoa', 105.42, -6.1], ['Merapi', 110.45, -7.54],
  ['Ruapehu', 175.57, -39.28], ['Redoubt', -152.74, 60.49], ['Kīlauea', -155.29, 19.41],
].map(([Volcano, longitude, latitude]) => ({ Volcano, longitude, latitude }));

/**
 * Magellan and Elcano's circumnavigation, 1519–1522, with the ships still sailing as each leg left: the
 * Santiago was wrecked near San Julián, the San Antonio deserted in the strait, the Concepción was burned
 * after Cebu, and the Trinidad stayed in the Moluccas, so only the Victoria came home.
 */
const MAGELLAN = ([
  [1, 'Sanlúcar', -6.35, 36.78, 5], [2, 'Canary Islands', -15.4, 28.1, 5], [3, 'Rio de Janeiro', -43.2, -22.9, 5], [4, 'Río de la Plata', -56.0, -35.0, 5],
  [5, 'San Julián', -67.7, -49.3, 4], [6, 'Strait of Magellan', -70.9, -53.2, 3], [7, 'Guam', 144.8, 13.4, 3], [8, 'Cebu', 123.9, 10.3, 2],
  [9, 'Moluccas', 127.4, 0.8, 1], [10, 'Timor', 124.5, -9.3, 1], [11, 'Cape of Good Hope', 18.47, -34.36, 1], [12, 'Sanlúcar', -6.35, 36.78, 1],
] as const).map(([Stop, Place, longitude, latitude, Ships]) => ({ Stop, Place, longitude, latitude, Ships }));

/** Short names for the UN sub-regions, so the waterfall's labels fit a small tile. */
const REGION_SHORT: Record<string, string> = {
  'South-Central Asia': 'S Asia', 'Eastern Asia': 'E Asia', 'Sub-Saharan Africa': 'Africa', 'South-Eastern Asia': 'SE Asia',
  'Latin America': 'Lat Am', 'Western Asia': 'W Asia', 'Northern Africa': 'N Africa', 'Northern America': 'N Am',
};

/** A chart with captions beside what they name (`annotate-text`), keyed by the rows' own values. */
const noted = (build: (size: Size) => ChartAssemblyInput, notes: Array<[Record<string, unknown>, string]>) => (size: Size) =>
  ({
    ...build(size),
    updates: [{ id: 'notes', ops: notes.map(([key, text]) => ({ op: 'annotate-text' as const, target: { select: { key } }, value: { text } })) }],
  }) as ChartAssemblyInput;

/** Palmer Station penguins, every bird measured, with its sex. */
const PENGUINS = (() => {
  const { columns, rows } = (classic as any).penguins as { columns: string[]; rows: unknown[][] };
  return rows.map((row) => Object.fromEntries(columns.map((column, i) => [column, row[i]])))
    .filter((row) => row.Sex === 'Male' || row.Sex === 'Female');
})();

const tile = (id: string, height: number, build: (size: Size) => ChartAssemblyInput, drawAt?: number): WallTile =>
  ({ id, height, drawAt, input: (size) => build(size) });

/**
 * Columns of different widths, each a stack of charts whose heights add up to about the same,
 * so the board packs like a pinned-up wall. Neighbouring charts keep to different themes.
 */
const COLUMNS: { width: number; tiles: WallTile[] }[] = [
  {
    width: 220, tiles: [
      tile('globe', 220, (size) => input(VOLCANOES, { Volcano: 'Name', longitude: 'Longitude', latitude: 'Latitude' }, 'swiss', size, {
        chartType: 'Map', title: 'The Ring of Fire', encodings: { longitude: 'longitude', latitude: 'latitude', text: 'Volcano' },
        chartProperties: { projection: 'orthographic', projectionCenter: [160, 15], mapStyle: 'atlas' },
      })),
      tile('bump', 200, fromCase('olympic-bump', 'cartoon', { title: 'Medal-table rank' })),
      tile('donut', 200, fromCase('mobile-donut', 'apple', { title: 'Mobile OS share, 2024' })),
    ],
  },
  {
    width: 290, tiles: [
      tile('ev', 180, noted(fromCase('ev-share', 'nyt', { title: 'The electric-car takeover' }), [[{ Country: 'Norway', Year: 2023 }, '9 in 10 new cars']])),
      {
        id: 'ridge', height: 224,
        input: (size, weather) => weather && input(weather.daily, { City: 'Name', 'Temperature (°C)': 'Temperature' }, 'nature', size, {
          chartType: 'Ridgeline Plot', title: 'A year of daily temperatures', encodings: { x: 'Temperature (°C)', y: 'City' },
          chartProperties: { order: 'mean', colorBy: 'x', overlap: 2.4 },
        }),
      },
      tile('electricity', 190, fromCase('electricity-stacked', 'datawrapper', { title: 'How countries make electricity' })),
    ],
  },
  {
    width: 260, tiles: [
      tile('gapminder', 230, noted((size) => input(GAPMINDER_2007, { Country: 'Country', Continent: 'Category', 'Population (M)': 'Quantity', 'Life expectancy': 'Quantity', 'GDP per capita': 'Quantity' }, 'economist', size, {
        chartType: 'Scatter Plot', title: 'Richer, longer lives',
        encodings: { x: 'GDP per capita', y: 'Life expectancy', size: 'Population (M)', color: 'Continent', detail: 'Country' },
        chartProperties: { logScale_x: true },
      }), [[{ Country: 'China' }, 'China'], [{ Country: 'India' }, 'India'], [{ Country: 'United States' }, 'US']])),
      {
        id: 'cal', height: 150,
        input: (size, weather) => weather && input(weather.seattle, { Date: 'Date', 'Temperature (°C)': 'Temperature' }, 'material', size, {
          chartType: 'Calendar Heatmap', title: 'Seattle, summer into autumn', encodings: { x: 'Date', color: 'Temperature (°C)' },
        }),
      },
      tile('radar', 255, fromCase('nutrition-radar', 'de-stijl', { title: 'What’s in 100 g?' }, { chartProperties: { filled: true, fillOpacity: 0.55, strokeWidth: 3 } })),
    ],
  },
  {
    width: 320, tiles: [
      tile('route', 200, (size) => input(MAGELLAN, { Stop: 'Rank', Place: 'Name', longitude: 'Longitude', latitude: 'Latitude', Ships: 'Count' }, 'datawrapper', size, {
        chartType: 'Map', title: 'Around the world, 1519–1522', encodings: { longitude: 'longitude', latitude: 'latitude', order: 'Stop', strokeWidth: 'Ships' },
      }), 1.2),
      tile('choro', 225, fromCase('state-unemployment', 'bbc', { title: 'Unemployment by state, 2023' })),
      tile('water', 210, fromCase('population-waterfall', 'mckinsey', { title: 'Where 5.3 billion more people came from' }, {
        relabel: (row) => ({ ...row, Step: REGION_SHORT[row.Step as string] ?? row.Step }),
      })),
    ],
  },
  {
    width: 240, tiles: [
      tile('stream', 215, fromCase('population-stream', 'powerbi', { title: 'World population by region' })),
      tile('violin', 225, (size) => input(PENGUINS, { Species: 'Category', Sex: 'Category', 'Body mass (g)': 'Quantity' }, 'powerbi-light', size, {
        chartType: 'Violin Plot', title: 'Penguin body mass, by sex', encodings: { x: 'Species', y: 'Body mass (g)', color: 'Sex' },
      })),
      tile('lollipop', 215, fromCase('co2-lollipop', 'nyt', { title: 'CO₂ per person, 2022' }, {
        relabel: (row) => ({ ...row, Continent: CONTINENT[row.Country as string] }),
        semantic_types: { Continent: 'Category' }, encodings: { color: 'Continent' },
      })),
    ],
  },
  {
    width: 280, tiles: [
      tile('medals', 205, fromCase('medals-grouped', 'apple', { title: 'Paris 2024 medals' })),
      tile('heatmap', 245, fromCase('temp-heatmap', 'swiss', { title: 'Monthly temperature by city' })),
      tile('mix', 195, fromCase('electricity-mix-area', 'economist', { title: 'How the world makes electricity' })),
    ],
  },
  {
    width: 240, tiles: [
      tile('driving', 160, fromCase('driving', 'bbc', { title: 'Driving shifts into reverse' })),
      tile('pyramid', 220, fromCase('us-pyramid', 'material', { title: 'US population by age and sex' })),
      tile('trust', 222, fromCase('trust-likert', 'pop', { title: 'Confidence in US institutions' })),
    ],
  },
];

/** Seattle from June to November: six months read better than a year at a tile's size. */
const CALENDAR_MONTHS = (date: string) => date >= '2023-06-01' && date < '2023-12-01';

let weatherRequest: Promise<WeatherRows> | null = null;
function loadWeather(): Promise<WeatherRows> {
  weatherRequest ??= fetch(`${import.meta.env.BASE_URL}data/timebox-weather-2023.json`)
    .then((response) => response.json())
    .then((json: { dates: string[]; cities: { name: string; temperature: number[] }[] }) => {
      const daily: Row[] = [];
      for (const city of json.cities) for (const t of city.temperature) daily.push({ City: city.name, 'Temperature (°C)': t });
      const seattle = json.cities.find((city) => city.name === 'Seattle')!;
      const days = json.dates.map((Date, i) => ({ Date, 'Temperature (°C)': seattle.temperature[i] }));
      return { daily, seattle: days.filter((day) => CALENDAR_MONTHS(day.Date)) };
    });
  return weatherRequest;
}

/** A small, fixed tilt per card, varied so neighbours lean apart. */
const TILTS = [-1.1, 0.7, -0.4, 0.9, -0.8, 0.5, -0.6, 1, -0.3, 0.6, -0.9];

/**
 * Shrinks a drawn chart into its slot, measured by the SVG it drew rather than the canvas it asked
 * for: a chart can draw past its canvas (a calendar's weeks, a pyramid's keys). The slot's height
 * follows the scaled drawing, up to `height`.
 */
function Fit({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const measure = () => {
      const svg = host.querySelector('svg');
      const w = Number(svg?.getAttribute('width')), h = Number(svg?.getAttribute('height'));
      if (w > 0 && h > 0) setDrawn((prev) => (prev && prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    };
    const observer = new MutationObserver(measure);
    observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['width', 'height'] });
    measure();
    return () => observer.disconnect();
  }, []);
  const scale = drawn ? Math.min(width / drawn.width, height / drawn.height) : 1;
  return (
    <div style={{ position: 'relative', width, height: drawn ? Math.round(drawn.height * scale) : height, overflow: 'hidden' }}>
      <div ref={ref} style={{
        position: 'absolute', top: 0, left: drawn ? (width - drawn.width * scale) / 2 : 0,
        transform: `scale(${scale})`, transformOrigin: 'top left', visibility: drawn ? undefined : 'hidden',
      }}>
        {children}
      </div>
    </div>
  );
}

function Tile({ tile, width, index, weather, tilted }: { tile: WallTile; width: number; index: number; weather: WeatherRows | null; tilted: boolean }) {
  const scale = tile.drawAt ?? DRAW_AT;
  const spec = useMemo(() => tile.input({ width: Math.round(width * scale), height: Math.round(tile.height * scale) }, weather), [tile, width, scale, weather]);
  // The card takes the chart's own ground, so a house's paper runs to the card's edges.
  const ground = useMemo(() => {
    if (!spec) return '#fff';
    try {
      const compiled: any = assembleVegaLite(spec);
      const fill = compiled.background ?? compiled.config?.background;
      return typeof fill === 'string' && fill !== 'transparent' ? fill : '#fff';
    } catch { return '#fff'; }
  }, [spec]);
  const card: CSSProperties = {
    position: 'relative', width, background: ground, borderRadius: 3, overflow: 'hidden',
    boxShadow: '0 0 0 1px rgba(30, 30, 20, 0.07), 0 2px 4px rgba(30, 30, 20, 0.06), 0 8px 22px rgba(30, 30, 20, 0.10)',
    transform: tilted ? `rotate(${TILTS[index % TILTS.length]}deg)` : undefined,
  };
  // The chart is drawn larger than the card and shrinks into it, whatever size it came out at.
  return (
    <div style={card}>
      <Fit width={width} height={tile.height}>
        {spec && <FlintView spec={spec} renderer="svg" compact />}
      </Fit>
    </div>
  );
}

/** Plain white, with no frame, so a screenshot sits on GitHub's page without a seam. */
const board: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'flex-start', width: 'max-content', padding: '22px 20px 26px', backgroundColor: '#fff',
};

/** Columns start a little apart so their seams don't line up. */
const COLUMN_DROP = [0, 14, 4, 18, 8, 0, 12];

export function ReleaseChartWall() {
  const [weather, setWeather] = useState<WeatherRows | null>(null);
  const [tilted, setTilted] = useState(true);
  useEffect(() => {
    let live = true;
    loadWeather().then((rows) => { if (live) setWeather(rows); });
    return () => { live = false; };
  }, []);

  let index = 0;
  return <section className="axis-label-lab release-examples" style={{ maxWidth: 'none', width: 'max-content' }}>
    <header className="axis-label-heading" style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
      <h1>Chart wall</h1>
      <label style={{ fontSize: 13, color: siteTheme.textMuted }}>
        <input type="checkbox" checked={tilted} onChange={(event) => setTilted(event.target.checked)} /> Tilt the cards
      </label>
    </header>
    <p style={{ margin: '0 0 14px', color: siteTheme.textMuted, fontSize: 13 }}>
      For the README: everyday and newer chart types, each in one of the preset themes, all from real data. Screenshot the board.
    </p>
    <div id="chart-wall" style={board}>
      {COLUMNS.map((column, c) => (
        <div key={column.tiles[0].id} style={{ display: 'grid', gap: 8, marginTop: COLUMN_DROP[c % COLUMN_DROP.length] }}>
          {column.tiles.map((t) => <Tile key={t.id} tile={t} width={column.width} index={index++} weather={weather} tilted={tilted} />)}
        </div>
      ))}
    </div>
  </section>;
}
