import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import { FlintView } from '../../components/FlintView';
import { ScaleToFit } from '../../components/ScaleToFit';
import { siteTheme } from '../../shared/theme';
import { odysseyLookInHouse, odysseyOpeningUpdates, odysseySpec } from '../OdysseyStoryStage';
import '../axis-label-lab.css';

/**
 * Release 1.0.2 at a glance: one board of the new maps, sized to be taken in a single screenshot,
 * and the release notes in Markdown, to paste.
 */

/** Volcanoes of the Pacific Ring of Fire. */
const VOLCANOES = [
  ['Mount Fuji', 138.73, 35.36, 'Asia'], ['Sakurajima', 130.66, 31.58, 'Asia'], ['Klyuchevskaya Sopka', 160.64, 56.06, 'Asia'],
  ['Pinatubo', 120.35, 15.13, 'Asia'], ['Mayon', 123.69, 13.26, 'Asia'], ['Krakatoa', 105.42, -6.1, 'Asia'], ['Merapi', 110.45, -7.54, 'Asia'],
  ['Ruapehu', 175.57, -39.28, 'Oceania'], ['Mount Redoubt', -152.74, 60.49, 'North America'], ['Mount St. Helens', -122.19, 46.19, 'North America'],
  ['Popocatépetl', -98.62, 19.02, 'North America'], ['Cotopaxi', -78.44, -0.68, 'South America'], ['Villarrica', -71.93, -39.42, 'South America'],
].map(([Volcano, longitude, latitude, Region]) => ({ Volcano, longitude, latitude, Region }));
/** The largest urban areas, millions of people, after the UN's World Urbanization Prospects 2018. */
const CITIES = [
  ['Tokyo', 139.69, 35.69, 'Asia', 37.5], ['Delhi', 77.21, 28.61, 'Asia', 28.5], ['Shanghai', 121.47, 31.23, 'Asia', 25.6],
  ['São Paulo', -46.63, -23.55, 'South America', 21.7], ['Mexico City', -99.13, 19.43, 'North America', 21.6], ['Cairo', 31.24, 30.04, 'Africa', 20.1],
  ['Mumbai', 72.88, 19.08, 'Asia', 20.0], ['Beijing', 116.41, 39.9, 'Asia', 19.6], ['Dhaka', 90.41, 23.81, 'Asia', 19.6], ['New York', -74.01, 40.71, 'North America', 18.8],
  ['Buenos Aires', -58.38, -34.6, 'South America', 15.0], ['Istanbul', 28.98, 41.01, 'Europe', 14.8], ['Lagos', 3.38, 6.52, 'Africa', 13.5],
].map(([City, longitude, latitude, Continent, Population]) => ({ City, longitude, latitude, Continent, 'Population (M)': Population }));
const MAGELLAN = ([
  [1, 'Sanlúcar de Barrameda', -6.35, 36.78], [2, 'Canary Islands', -15.4, 28.1], [3, 'Rio de Janeiro', -43.2, -22.9], [4, 'Río de la Plata', -56.0, -35.0],
  [5, 'Puerto San Julián', -67.7, -49.3], [6, 'Strait of Magellan', -70.9, -53.2], [7, 'Guam', 144.8, 13.4], [8, 'Cebu', 123.9, 10.3],
  [9, 'Moluccas', 127.4, 0.8], [10, 'Timor', 124.5, -9.3], [11, 'Cape of Good Hope', 18.47, -34.36], [12, 'Sanlúcar de Barrameda', -6.35, 36.78],
] as const).map(([Stop, Place, longitude, latitude]) => ({ Stop, Place, longitude, latitude }));
const WORLD = [
  ['United States', 0.62], ['Canada', 0.58], ['Mexico', 0.33], ['Brazil', 0.41], ['Argentina', 0.36], ['France', 0.55],
  ['Germany', 0.6], ['Nigeria', 0.12], ['Kenya', 0.18], ['South Africa', 0.29], ['India', 0.22], ['China', 0.38],
  ['Japan', 0.71], ['Indonesia', 0.25], ['Australia', 0.66],
].map(([Country, Share]) => ({ Country, Share }));

type Box = { width: number; height: number };

/**
 * `box` is the tile's room on the board. `drawAt`, when set, draws the chart at that size and shrinks it
 * into the box; `dataUrl`, when set, is fetched into the input's rows.
 */
interface MapTile { id: string; caption: string; box: Box; input: ChartAssemblyInput; drawAt?: Box; dataUrl?: string }

const map = (box: Box, values: Record<string, unknown>[], semantic_types: Record<string, string>, chart_spec: Record<string, unknown>) =>
  ({ data: { values }, semantic_types, chart_spec: { ...chart_spec, canvasSize: box } }) as ChartAssemblyInput;

const ODYSSEY_LOOK = odysseyLookInHouse(null);
const ODYSSEY = odysseySpec(ODYSSEY_LOOK);

const WIDE = { width: 520, height: 290 };
const SQUARE = { width: 300, height: 290 };
const ODYSSEY_BOX = { width: 380, height: 384 };
const ROUTE_BOX = { width: 380, height: 196 };

const TILES: Record<string, MapTile> = {
  dark: {
    id: 'dark', caption: 'Map style and natural breaks · mapStyle: dark, classes: jenks', box: WIDE,
    input: map(WIDE, WORLD, { Country: 'Country', Share: 'Percentage' },
      { chartType: 'Choropleth', title: 'Share of adults online', encodings: { id: 'Country', color: 'Share' }, chartProperties: { mapStyle: 'dark', classes: 'jenks' } }),
  },
  labels: {
    id: 'labels', caption: 'Places named beside their points · text, mapStyle: muted', box: WIDE,
    input: map(WIDE, CITIES, { City: 'Name', longitude: 'Longitude', latitude: 'Latitude', Continent: 'Category', 'Population (M)': 'Quantity' },
      {
        chartType: 'Map', title: 'The largest cities',
        encodings: { longitude: 'longitude', latitude: 'latitude', color: { field: 'Continent', legend: { orient: 'bottom' } }, size: { field: 'Population (M)', legend: { orient: 'bottom' } }, text: 'City' },
        chartProperties: { mapStyle: 'muted' },
      }),
  },
  globe: {
    id: 'globe', caption: 'Globe · projection: orthographic, mapStyle: atlas', box: SQUARE,
    input: map(SQUARE, VOLCANOES, { Volcano: 'Name', longitude: 'Longitude', latitude: 'Latitude', Region: 'Category' },
      {
        chartType: 'Map', title: 'Volcanoes of the Ring of Fire',
        encodings: { longitude: 'longitude', latitude: 'latitude', text: 'Volcano' },
        chartProperties: { projection: 'orthographic', projectionCenter: [138, 36], mapStyle: 'atlas' },
      }),
  },
  counties: {
    id: 'counties', caption: 'States, then counties as you zoom · level: auto', box: SQUARE,
    dataUrl: `${import.meta.env.BASE_URL}map-data/us-unemployment-2009.json`,
    input: map(SQUARE, [], { FIPS: 'Integer', Place: 'Name', Rate: 'Percentage' },
      { chartType: 'Choropleth', title: 'Unemployment, 2009', encodings: { id: 'FIPS', color: 'Rate', detail: 'Place' }, chartProperties: { region: 'us', level: 'auto' } }),
  },
  odyssey: {
    id: 'odyssey', caption: 'Leg widths, stops and notes · strokeWidth, stops, updates', box: ODYSSEY_BOX, drawAt: { width: 520, height: 525 },
    input: {
      ...ODYSSEY, chart_spec: { ...ODYSSEY.chart_spec, canvasSize: { width: 520, height: 525 } }, interaction_spec: undefined, updates: odysseyOpeningUpdates(ODYSSEY_LOOK),
    } as ChartAssemblyInput,
  },
  route: {
    id: 'route', caption: 'Routes · order', box: ROUTE_BOX,
    input: map(ROUTE_BOX, MAGELLAN, { Stop: 'Rank', Place: 'Name', longitude: 'Longitude', latitude: 'Latitude' },
      { chartType: 'Map', title: 'The first circumnavigation', encodings: { longitude: 'longitude', latitude: 'latitude', order: 'Stop' }, chartProperties: { mapStyle: 'atlas' } }),
  },
};

/** The mosaic: wide world maps on the left, the globe and the US in the middle, the Odyssey over a route on the right. */
const COLUMNS = [['dark', 'labels'], ['globe', 'counties'], ['odyssey', 'route']] as const;

function Tile({ tile }: { tile: MapTile }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  useEffect(() => {
    if (!tile.dataUrl) return;
    let live = true;
    fetch(tile.dataUrl).then((response) => response.json()).then((values) => { if (live) setRows(values); });
    return () => { live = false; };
  }, [tile.dataUrl]);
  const input = useMemo(() => (rows ? { ...tile.input, data: { values: rows } } : tile.input), [tile.input, rows]);
  const loading = tile.dataUrl !== undefined && rows === null;
  return (
    <figure style={{ margin: 0, display: 'grid', gap: 2, justifyItems: 'center' }}>
      <div style={{ width: tile.box.width, height: tile.box.height, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
        {loading ? null : tile.drawAt
          ? <div style={{ width: tile.box.width }}><ScaleToFit height={tile.box.height}><FlintView spec={input} renderer="svg" compact /></ScaleToFit></div>
          : <FlintView spec={input} renderer="svg" compact />}
      </div>
      <figcaption style={{ fontSize: 11, color: siteTheme.textMuted }}>{tile.caption}</figcaption>
    </figure>
  );
}

const NOTES = `## Flint 1.0.2

### Maps
- **Boundaries:** world maps draw World Bank Official Boundaries, and map boundaries can be customized (\`chartProperties.boundaries\`).
- **Framing:** a map frames the country, region or continent its rows cover (\`fit\`), in a projection centred on it.
- **Globes:** \`projection: "orthographic"\` turns to face the data and hides the far side; drag to turn it.
- **Choropleth classes:** five quantile classes by default; \`classes\` takes \`equal\`, \`jenks\` or \`continuous\`.
- **Map styles:** \`mapStyle\` names a ground (\`atlas\`, \`dark\`, \`muted\`, …) or restates its colours (\`{ sea, land, coast, border }\`).
- **US counties:** \`level: "auto"\` draws states, then counties as you zoom in.
- **Routes:** \`order\` joins points into routes, each leg bowed with an arrowhead; \`strokeWidth\` sets each leg's width and \`stops\` draws the stops.
- **Labels:** \`text\` names a map's points beside them and a choropleth's regions at their middles.
- **Updates on maps:** overlays and region notes are placed by longitude and latitude, and follow a pan, a zoom or a turning globe.

### Layout
- A Vega-Lite chart given a \`canvasSize\` is drawn within it: the house's chrome, the headline, keys and labels are measured first, and the plot takes the room left.
- ECharts, Chart.js and Plotly lay out their frame by the same rules: headlines broken to full lines, long names wrapped, keys and axis titles measured. Plotly draws the house's header and source line.

### Annotations
- A note (\`annotate-text\`) is a caption beside what it names, with a leader only where it stands off. The bordered card is gone; draw a callout box with \`set-overlay\`.
- A spec carries its own \`updates\` (notes, overlays, emphasis, viewport), so a copied spec keeps them.
- \`set-annotation\` is deprecated: write \`annotate-text\`.

### Fixes
- A \`Percentage\` stored as fractions prints as percentages (16.4%, not 0.164).
- Bars sorted by value stay in value order under every house.
- Dates that arrive as ISO timestamps are read as dates.
- A chart with no theme draws on the host's background.
- A theme that \`extends\` a house and recolours its text or page takes the house's type with it.

### Breaking (MCP)
- The server keeps nothing between calls: \`show\` takes the spec itself, and \`validate_chart\` and the new \`validate_board\` check a spec without drawing it.
`;

function MarkdownBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div style={{ position: 'relative', border: `1px solid ${siteTheme.border}`, borderRadius: 8, background: siteTheme.surface }}>
      <button type="button" className="ic-pill" style={{ position: 'absolute', top: 8, right: 8 }} onClick={copy}>{copied ? 'Copied' : 'Copy Markdown'}</button>
      <pre style={{ margin: 0, padding: '14px 16px', fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{text}</pre>
    </div>
  );
}

const board: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'auto auto auto', columnGap: 14, alignItems: 'start',
  width: 'max-content', padding: '16px 18px 14px', border: `1px solid ${siteTheme.border}`, borderRadius: 10, background: '#fff',
};

export function ReleaseExamples102() {
  return <section className="axis-label-lab release-examples" style={{ maxWidth: 1240 }}>
    <header className="axis-label-heading">
      <h1>Release 1.0.2</h1>
    </header>

    <section id="maps" aria-label="New in maps" style={{ display: 'grid', gap: 10, marginTop: 8 }}>
      <div style={board}>
        <h2 style={{ gridColumn: '1 / -1', margin: '0 0 8px', fontSize: 18 }}>New in Flint 1.0.2: maps</h2>
        {COLUMNS.map((column) => (
          <div key={column[0]} style={{ display: 'grid', gap: 10 }}>
            {column.map((id) => <Tile key={id} tile={TILES[id]} />)}
          </div>
        ))}
      </div>
    </section>

    <section id="notes" aria-label="Release notes" style={{ display: 'grid', gap: 10, marginTop: 28 }}>
      <MarkdownBlock text={NOTES} />
    </section>
  </section>;
}
