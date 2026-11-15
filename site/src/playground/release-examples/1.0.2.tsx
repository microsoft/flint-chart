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
    id: 'odyssey', caption: 'Leg widths and notes · strokeWidth, updates', box: ODYSSEY_BOX, drawAt: { width: 520, height: 525 },
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
- **Routes:** \`order\` joins points into routes, each leg bowed with an arrowhead whose tip sits on its stop; \`strokeWidth\` sets each leg's width. A route draws a dot at its start; every stop takes a dot where \`size\`, \`shape\`, \`text\` or a quantity's \`color\` asks for one, laid beneath the lines.
- **Route density:** arrowheads are sized to their lines, and a map crowded with long legs draws them thinner. Short legs keep a small head; where many legs arrive at one stop, their heads fan round it and only the widest twelve keep one.
- **Labels:** \`text\` names a map's points beside them and a choropleth's regions at their middles. A crowded map names its most salient points first (the largest, or the ends of the colour scale), leaving the rest to their tooltips.
- **Updates on maps:** overlays and region notes are placed by longitude and latitude, and follow a pan, a zoom or a turning globe.

### Layout
- A Vega-Lite chart given a \`canvasSize\` is drawn within it: the house's chrome, the headline, keys and labels are measured first, and the plot takes the room left.
- ECharts, Chart.js and Plotly lay out their frame by the same rules: headlines broken to full lines, long names wrapped, keys and axis titles measured. Plotly draws the house's header and source line.
- A distribution's value axis (boxplot, violin, density, ridgeline, ECDF) fits its data instead of reaching to zero.
- A bar split only by \`detail\` reads as one bar: no seams between its segments, and its label shows the bar's total.

### Annotations
- A note (\`annotate-text\`) is a caption beside what it names, with a leader only where it stands off. The bordered card is gone; draw a callout box with \`set-overlay\`.
- A spec carries its own \`updates\` (notes, overlays, emphasis, viewport), so a copied spec keeps them.
- \`set-annotation\` is deprecated: write \`annotate-text\`.

### MCP
- **Chart guides:** \`list_chart_types\` with \`chartType\` returns that type in full: what it is for, its guidance, its \`chartProperties\` and interaction presets.
- **App skill:** \`get_flint_skill\` serves \`app\` (\`flint-app-author\`) for code that uses \`flint-chart\` in an app, a notebook or a script.
- **Board colours:** a board's \`colors\` binds colours to values per field, so a value keeps one colour on every chart and across turns.
- **Clearer reports:** \`show\` lists what must be fixed before a chart draws apart from what it draws with.

### Performance
Faster compiles on large data, from Shayne Boyer (@spboyer, #160). Each change keeps its output identical and ships with the script that measured it.
- **Long category lists in a stated order.** Trimming an overflowing category axis to an explicit order no longer scans the order once per value: at 10,000 categories it takes 6 ms instead of 119 ms in JS, and 2 ms instead of 421 ms in Python (#167).
- **Sort repair does only the work it needs.** A chart whose sort needs no lookup of the raw fields no longer walks every row and field (100k rows × 10 fields: about 21 ms to under 0.01 ms); a sort that does look fields up collects them once (about 21 ms to 6.5 ms, with a third of the memory) (#168).
- **Python: dates convert with less memory.** Temporal columns are inferred one at a time, cutting peak memory by 90% on a wide numeric table (10k rows × 20 columns) and 16% on a mixed one, at the same speed (#169).
- **Python: one full semantics pass fewer.** Only the encodings' preliminary types are resolved before overrides are composed; a 10k-row scatter assembles about 20% faster (152 ms to 121 ms), with identical output across all 705 fixtures (#170).
- **Render baselines.** \`npm run benchmark:render\` records cold and warm compile and MCP render times and memory per backend, so later changes can be compared against a baseline (#171).

### Fixes

**Reading data**
- **ISO timestamps are read as dates.** Dates that arrive as timestamps (\`"2005-05-01T00:00:00.000"\`, \`"…Z"\`, \`"2005-05-01 00:00:00"\`, as a database \`DATE\` column often serialises) are read as dates under \`Year\`, \`YearMonth\`, \`Date\` and the other calendar types. A midnight timestamp becomes its date, so the axis prints short labels (\`Jun · Jul · Aug\`) instead of full timestamps. A timestamp without a zone is read in UTC, so marks sit on their date in every time zone (a Pacific machine used to draw them 7 hours late).
- **Percentages stored as fractions print as percentages.** A \`Percentage\` field holding 0.164 prints \`16.4%\`, not \`0.164\`, without needing an \`intrinsicDomain\`.
- **\`Number\` is not added up.** A field typed \`Number\` has unknown additivity, so it is no longer summed or stacked by default: a bar's label or share takes the encoding's \`aggregate\`, else the mean. Type totals as \`Count\`, \`Amount\`, \`Quantity\` or \`Profit\`; an untyped numeric field still sums.
- **One-letter units keep their case.** A unit of \`M\` is millions, not metres.
- **A percentage's scale can be stated.** The new \`percentScale\` annotation (\`"fraction"\` or \`"percent"\`) settles how a percentage is stored instead of guessing from the values. Before, a growth rate stored as 2.4 (for 240%) printed as "2.4%", and the same column could be formatted two ways depending on which rows a query returned. Axes, tooltips, domains and KPI cards all follow it (#154).

**Layout and sizing**
- **A chart stays inside its \`canvasSize\`.** A Vega-Lite chart that read well only when drawn larger than its box (a key beside a full-width plot, a title over a full-height one) used to overflow and get cut off by hosts that draw the SVG at its own size. It is now laid out again for the smaller room: the plot gives up space so keys, labels and title fit. The plot keeps at least half of each side, and no value is cut or label turned to make room. \`canvasFit: 'off'\` keeps the old drawing.
- **No more few-pixel overrun.** The canvas fit reserved 8 px of padding where Vega-Lite pads by 5, so a chart sized to its box ran slightly over it.
- **Value labels past horizontal bars extend the axis.** The room kept for labels at bar ends now runs the axis, ticks and gridlines on to the plot's edge, instead of leaving an empty stretch with no scale. Bars keep their lengths.
- **Stepped colour keys fit beside short plots.** A binned colour key next to the plot no longer runs past it: Vega-Lite drew the ramp at its 200 px default, twice the height of a short heatmap.
- **Bars sorted by value stay sorted under every house.** With \`sortBy: "x"\`, the NYT, Economist, Power BI, Pop and De Stijl houses drew bars in name order, because their value labels and row names sit on the same band and Vega-Lite drops a sort the layers don't share. Datawrapper's names-above-bars layout failed to compile in 1.0.1. Every layer now states the same order.
- **A chart with no theme draws on the host's background.** \`options.background\` and the \`background\` taken by the React view, the interactive renderer and \`renderSvg\` now reach the chart, where Vega-Lite's default white used to win. A theme with its own canvas keeps it.

**Keys and labels**
- **Compact numbers roll over.** A value that rounds up to the next unit prints in it: 999,600 is \`1M\`, not \`1000k\` (#172).
- **Size keys print the values they list.** A size key for 0.5, 1 and 2.5 used to read "1, 1, 3". Each key now carries a format precise enough for its values, and its width is measured from those labels. Plotly and ECharts size keys no longer round small values to 0.

**Interactions and updates**
- **Filters work on aggregated charts.** \`filterControls\` on a chart with an \`aggregate\` encoding (average, count, sum) or several y fields used to empty the plot, because filtered rows were swapped in raw. They are now shaped the way the chart's own rows were.
- **No internal sort index in tooltips.** A tooltip on a filtered stacked chart no longer lists Vega-Lite's \`_<field>_sort_index\`.
- **Updates that validated now draw.** Four kinds of update that \`validateChart\` accepted were silently dropped when drawn: a numeric key on a field drawn as categories (\`{ Year: 2016 }\` on a banded year), a single-row series on a line chart (now drawn as a point a note can point at), a region caption asked to sit where it doesn't fit (now placed where it fits), and overlays with \`strokeDash: 'dash'\` or \`'dot'\`. An overlay the renderer can't read no longer stops the chart's other updates.
- **Line dots are drawn once.** In the live view, a line chart under a house with its own vertex dots (\`cartoon\`, \`pop\`) drew a second, full-size set beneath them.
- **Live legends keep their order and colours.** An unsorted colour (\`sort: null\`) kept the static chart's order but turned alphabetical when drawn live, recolouring every series; a faint ink's darker edge also landed on the wrong series.
- **Tooltips and hover read in the house's type.** A tooltip is set in the house's label face (11–13 px); a hovered line vertex shows as a dot a little wider than the line.
- **Notes attach to points on a line.** A note keyed to an interior point of a line drawn with points matched both the point and the segment starting there, and reported "matched nothing".

**Annotations**
- **Captions keep off the chart's furniture.** A note's, region's or enclosure's caption no longer lands on the source line, a map's credit, or a house's header and rules; and on a map it no longer treats land and water as marks to avoid.
- **Enclosures at the plot's edge are drawn whole.** Where an enclosed dot sits within 12 px of a continuous axis's end, the axis is padded so the outline isn't cut.
- **Enclosures take the cluster's colour.** An outline round a cluster of dots uses the dots' fill, not the outline a house draws round every dot (every cluster came out black under \`pop\`).

**Themes**
- **An area's edge takes its ink.** A single series inked on the mark drew Vega-Lite's default blue edge.
- **Extended houses keep readable type.** A theme that \`extends\` a house and recolours its text or page takes the house's typography with it, and colours that would no longer read on the new page are adjusted. A dark page extending \`nyt\` no longer sets its title in near-black.

**Installing**
- **\`npm install flint-chart\` is the whole install** (#155). An app no longer fails to build for want of a backend it doesn't use: \`flint-chart\` now depends on every backend it draws with. For single-file bundles, new \`flint-chart/react/<backend>\` and \`flint-chart/interactive/<backend>\` entries carry just one library.

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
