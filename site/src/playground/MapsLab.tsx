import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { THEME_PRESETS, assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import { basemaps } from 'flint-chart/geo';
import { FlintView } from '../components/FlintView';
import { siteTheme } from '../shared/theme';

/**
 * Maps lab: one card per behaviour of the map plan (framing in the box, the globe, regions without
 * data, the join and its report, offline boundaries). Each card draws the chart at its own size
 * against the box the host gives it, lists what to check, and shows what the compile decided.
 */

// ---------------------------------------------------------------- data
const SHARES = [
  ['United States', 0.62], ['Canada', 0.58], ['Mexico', 0.33], ['Brazil', 0.41], ['Argentina', 0.36], ['France', 0.55],
  ['Germany', 0.6], ['Nigeria', 0.12], ['Kenya', 0.18], ['South Africa', 0.29], ['India', 0.22], ['China', 0.38],
  ['Japan', 0.71], ['Indonesia', 0.25], ['Australia', 0.66],
].map(([Country, Share]) => ({ Country, Share }));
const EUROPE = [['France', 0.55], ['Germany', 0.6], ['Italy', 0.48], ['Spain', 0.51], ['Poland', 0.37], ['Netherlands', 0.64], ['Sweden', 0.69]]
  .map(([Country, Share]) => ({ Country, Share }));
const DATA_CENTRES = [
  ['Dublin', -6.26, 53.35, 'Europe'], ['Hamina', 27.19, 60.57, 'Europe'], ['St. Ghislain', 3.82, 50.47, 'Europe'],
  ['Singapore', 103.8, 1.35, 'Asia'], ['Changhua', 120.54, 24.08, 'Asia'], ['Inzai', 140.2, 35.83, 'Asia'],
  ['Council Bluffs', -95.86, 41.26, 'North America'], ['The Dalles', -121.18, 45.6, 'North America'], ['Moncks Corner', -80.01, 33.2, 'North America'],
  ['Quilicura', -70.73, -33.36, 'South America'], ['Sydney', 151.2, -33.87, 'Oceania'],
].map(([location, longitude, latitude, continent]) => ({ location, longitude, latitude, continent }));
const STATES = [['California', 7.2], ['Texas', 6.1], ['New York', 8.3], ['Florida', 5.4], ['Washington', 6.6], ['Illinois', 7.7], ['Georgia', 5.9]]
  .map(([State, Rate]) => ({ State, Rate }));
const COUNTIES = [[6037, 'Los Angeles', 9.1], [17031, 'Cook', 7.4], [48201, 'Harris', 6.8], [4013, 'Maricopa', 5.2], [53033, 'King', 4.1], [36061, 'New York', 8.8], [12086, 'Miami-Dade', 6.3]]
  .map(([FIPS, County, Rate]) => ({ FIPS, County, Rate }));
const MESSY = [
  { Country: 'France', Population: 40e6 }, { Country: 'FRA', Population: 28e6 }, { Country: 'Germany', Population: 84e6 },
  { Country: 'Côte d’Ivoire', Population: 28e6 }, { Country: 'S. Korea', Population: 52e6 }, { Country: 'Tuvalu', Population: 11e3 },
  { Country: 'World', Population: 8.1e9 }, { Country: 'OECD members', Population: 1.38e9 }, { Country: 'Narnia', Population: 1e6 },
];
const CODES = [['CA', 0.4], ['IN', 0.7], ['GE', 0.2], ['WA', 0.5]].map(([Code, Share]) => ({ Code, Share }));

// ---------------------------------------------------------------- cases
interface MapCase {
  id: string;
  group: string;
  title: string;
  check: string[];
  input: Omit<ChartAssemblyInput, 'chart_spec'> & { chart_spec: Record<string, any> };
}

const choropleth = (values: Record<string, unknown>[], semantic_types: Record<string, string>, id: string, color: string, chartProperties: Record<string, unknown> = {}) => ({
  data: { values }, semantic_types, chart_spec: { chartType: 'Choropleth', encodings: { id, color }, chartProperties },
});
const points = (chartProperties: Record<string, unknown> = {}, values: Record<string, unknown>[] = DATA_CENTRES) => ({
  data: { values },
  semantic_types: { location: 'Name', longitude: 'Longitude', latitude: 'Latitude', continent: 'Category' },
  chart_spec: { chartType: 'Map', encodings: { longitude: 'longitude', latitude: 'latitude', color: 'continent' }, chartProperties },
});

const CASES: MapCase[] = [
  {
    id: 'world-span', group: 'Framing', title: 'Countries on every continent',
    check: ['Frames the world’s land: Antarctica is not drawn and the frame stops near 58°S', 'Fills the canvas width at the land’s shape (≈2.3:1 in Equal Earth), the key beside it'],
    input: choropleth(SHARES, { Country: 'Country', Share: 'Percentage' }, 'Country', 'Share'),
  },
  {
    id: 'europe', group: 'Framing', title: 'Europe only',
    check: ['Region level: the countries’ box with a margin; continent level (all of Europe) once they cover 40% of it', 'Neighbours (UK, Norway, North Africa) drawn grey and clipped at the plot edge', 'Shape between 0.8:1 and 2:1'],
    input: choropleth(EUROPE, { Country: 'Country', Share: 'Percentage' }, 'Country', 'Share'),
  },
  {
    id: 'two-points', group: 'Framing', title: 'Two points far apart east–west (New York, Paris)',
    check: ['Frames the North Atlantic, widened north–south so it is not a strip', 'Both points inside, clipped base map'],
    input: points({}, [{ location: 'New York', longitude: -74, latitude: 40.7, continent: 'North America' }, { location: 'Paris', longitude: 2.35, latitude: 48.86, continent: 'Europe' }]),
  },
  {
    id: 'one-country', group: 'Framing', title: 'One small country (Japan)',
    check: [
      'Country level: all of Japan, Hokkaido to Kyushu, centred, a margin round it (at least 16° × 10°) for Korea and the coast of China',
      'Drawn upright: a conic equal-area centred on Japan, not the world’s Equal Earth sheared at 138°E',
      'A window on the world: water fills the frame, a neatline closes the cut edges',
    ],
    input: choropleth([{ Country: 'Japan', Share: 0.71 }], { Country: 'Country', Share: 'Percentage' }, 'Country', 'Share'),
  },
  {
    id: 'antarctica', group: 'Framing', title: 'A row names Antarctica',
    check: [
      'Frame runs to 90°S; no Antarctica filter in the transforms',
      'World Bank: “"Antarctica" is not in the World Bank map. Consider using another map via chartProperties.boundaries.”',
    ],
    input: choropleth([...SHARES, { Country: 'Antarctica', Share: 0.01 }], { Country: 'Country', Share: 'Percentage' }, 'Country', 'Share'),
  },
  {
    id: 'basemap', group: 'Framing', title: 'Europe, framed on the whole base map (fit: basemap)',
    check: ['Whole world including Antarctica, although the data is European'],
    input: choropleth(EUROPE, { Country: 'Country', Share: 'Percentage' }, 'Country', 'Share', { fit: 'basemap' }),
  },
  {
    id: 'us', group: 'Framing', title: 'US states',
    check: ['The atlas’s shape (975:610 ≈ 1.6:1)', 'Alaska and Hawaii inset', 'States without a value in grey'],
    input: choropleth(STATES, { State: 'State', Rate: 'Percentage' }, 'State', 'Rate'),
  },
  {
    id: 'south-pacific', group: 'Framing', title: 'South Pacific countries (Fiji, New Zealand, Samoa)',
    check: [
      'Region level across the antimeridian: New Zealand to Samoa (166°E to 172°W) as one frame, centred near 177°E',
      'World Bank: Samoa coloured; natural-earth: Samoa reported not in the map',
    ],
    input: choropleth([['Fiji', 0.3], ['New Zealand', 0.6], ['Samoa', 0.2]].map(([Country, Share]) => ({ Country, Share })), { Country: 'Country', Share: 'Percentage' }, 'Country', 'Share'),
  },
  {
    id: 'antimeridian', group: 'Framing', title: 'Points across the antimeridian (Honolulu, Suva, Auckland, Papeete)',
    check: ['Points on both sides of 180° frame the Pacific between them, not the world', 'Projection centred on the Pacific, so no point sits at the map’s seam'],
    input: points({}, [['Honolulu', -157.86, 21.31], ['Suva', 178.44, -18.14], ['Auckland', 174.76, -36.85], ['Papeete', -149.57, -17.54]]
      .map(([location, longitude, latitude]) => ({ location, longitude, latitude, continent: 'Oceania' }))),
  },
  {
    id: 'globe-auto', group: 'Globe', title: 'Data centres on a globe, facing the data (drag to turn)',
    check: ['Square plot, sea disc and rim under the land', 'Faces the data’s mean longitude, tilted ≤ 60° (no pole view)', 'Points behind the horizon hidden; drag to bring them round and watch them appear'],
    input: points({ projection: 'orthographic' }),
  },
  {
    id: 'globe-china', group: 'Globe', title: 'Globe centred on China (projectionCenter preset)',
    check: ['Asian sites shown, American sites hidden', 'Rotation [-105, -35, 0]'],
    input: points({ projection: 'orthographic', projectionCenter: [105, 35] }),
  },
  {
    id: 'globe-choropleth', group: 'Globe', title: 'Choropleth globe',
    check: ['Square, sea and rim', 'Countries without data drawn as land, not holes', 'Faces the countries named'],
    input: choropleth(SHARES, { Country: 'Country', Share: 'Percentage' }, 'Country', 'Share', { projection: 'orthographic' }),
  },
  {
    id: 'disputed', group: 'Boundaries', title: 'India, Pakistan and China: areas of non-determined status',
    check: [
      'World Bank boundaries (default): Jammu and Kashmir, Aksai Chin and Arunachal Pradesh are regions of their own, in the no-data fill, borders dotted',
      'Credit under the map, linked, its disclaimer on hover',
      'boundaries: natural-earth draws the de facto borders, no dotted lines, no credit',
    ],
    input: choropleth([{ Country: 'India', Share: 0.42 }, { Country: 'Pakistan', Share: 0.31 }, { Country: 'China', Share: 0.55 }, { Country: 'Nepal', Share: 0.2 }], { Country: 'Country', Share: 'Percentage' }, 'Country', 'Share'),
  },
  {
    id: 'taiwan', group: 'Boundaries', title: 'A row names Taiwan',
    check: [
      'World Bank: “"Taiwan" is not in the World Bank map. Consider using another map via chartProperties.boundaries.”',
      'natural-earth: Taiwan coloured, no warning',
    ],
    input: choropleth([{ Country: 'Taiwan', Share: 0.6 }, { Country: 'Japan', Share: 0.3 }, { Country: 'South Korea', Share: 0.4 }], { Country: 'Country', Share: 'Percentage' }, 'Country', 'Share'),
  },
  {
    id: 'counties', group: 'Regions without data', title: 'US counties (level: county), seven counties',
    check: ['Every county drawn; the 3,000+ without a value in grey', 'Counties keyed by FIPS numbers'],
    input: choropleth(COUNTIES, { FIPS: 'Integer', County: 'Name', Rate: 'Percentage' }, 'FIPS', 'Rate', { level: 'county' }),
  },
  {
    id: 'messy', group: 'Join and report', title: 'Messy country keys, a total measure',
    check: [
      'France + FRA combine into one region: Population summed (68M)', 'Côte d’Ivoire and S. Korea resolve',
      'Warnings: Narnia unmatched; World and OECD members are groups; rows combined; a total on a choropleth',
      'Tuvalu coloured on the World Bank map; under natural-earth it is reported not in the map',
    ],
    input: choropleth(MESSY, { Country: 'Country', Population: 'Count' }, 'Country', 'Population'),
  },
  {
    id: 'iso2', group: 'Join and report', title: 'keyType: iso2 — CA, IN, GE, WA as countries',
    check: ['World map: Canada, India, Georgia (the country) coloured', 'WA (no ISO 2 code) reported unmatched'],
    input: choropleth(CODES, { Code: 'Category', Share: 'Percentage' }, 'Code', 'Share', { keyType: 'iso2' }),
  },
  {
    id: 'us-state', group: 'Join and report', title: 'keyType: us-state — the same codes as states',
    check: ['US map: California, Indiana and Washington coloured', 'GE reported unmatched: Georgia’s USPS code is GA'],
    input: choropleth(CODES, { Code: 'Category', Share: 'Percentage' }, 'Code', 'Share', { keyType: 'us-state' }),
  },
];

// ---------------------------------------------------------------- inspection
interface Facts {
  plot: string;
  aspect: string;
  projection: string;
  frame: string;
  clip: string;
  antarctica: string;
  layers: string;
  source: string;
  attribution: string;
  colour: string;
  ground: { label: string; color: string }[];
  warnings: { code: string; message: string }[];
}

const round = (value: number) => Math.round(value * 10) / 10;

/** The data colour scale: classed (its breaks) or continuous. */
function colourOf(units: any[]): string {
  const enc = units.map((unit) => unit.encoding?.color).find((color) => color?.field && color.type === 'quantitative');
  if (!enc) return units.some((unit) => unit.encoding?.color?.field) ? 'categorical' : '—';
  const scale = enc.scale ?? {};
  const short = (value: number) => Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 }).format(value);
  if (scale.type === 'threshold') return `${(scale.domain ?? []).length + 1} classes at ${(scale.domain ?? []).map(short).join(' · ')}`;
  if (scale.type) return `${scale.type}`;
  return `continuous${Array.isArray(scale.domain) ? ` over ${scale.domain.map(short).join('…')}` : ''}`;
}

/** The colours the ground was painted in. */
function groundOf(spec: any, units: any[]): { label: string; color: string }[] {
  const out: { label: string; color: string }[] = [];
  const add = (label: string, color: unknown) => { if (typeof color === 'string' && !out.some((entry) => entry.label === label)) out.push({ label, color }); };
  add('page', spec.background ?? spec.config?.background ?? '#ffffff');
  add('frame', spec.config?.view?.fill);
  for (const unit of units) {
    if (unit.data?.sphere) { add('sea', unit.mark?.fill); add('rim', unit.mark?.stroke); }
    if (unit.data?.graticule) add('graticule', unit.mark?.stroke);
    const color = unit.encoding?.color;
    const condition = Array.isArray(color?.condition) ? color.condition[0] : color?.condition;
    if (condition?.test?.includes('isValid')) add('no data', condition.value);
    if (unit.mark?.type === 'geoshape' && !unit.data?.sphere && !unit.data?.graticule) {
      if (unit.mark.fill && !color?.field) add(unit.encoding?.color?.value ? 'no data' : 'land', unit.encoding?.color?.value ?? unit.mark.fill);
      add('border', unit.mark.stroke);
    }
  }
  return out;
}

function inspect(spec: any): Facts {
  const projection = spec.projection ?? {};
  const fit = projection.fit;
  let frame = 'Vega-Lite fits the base map';
  if (fit?.type === 'Sphere') frame = 'the whole sphere';
  else if (fit?.geometry?.coordinates) {
    const coordinates: [number, number][] = fit.geometry.coordinates;
    const lons = coordinates.map(([lon]) => lon);
    const lats = coordinates.map(([, lat]) => lat);
    frame = `${round(Math.min(...lons))}°…${round(Math.max(...lons))}° lon, ${round(Math.min(...lats))}°…${round(Math.max(...lats))}° lat`;
  }
  if (spec._mapFrame?.level) frame = `${spec._mapFrame.level}: ${frame}`;
  const units: any[] = spec.layer ?? [spec];
  const markType = (mark: any) => (typeof mark === 'string' ? mark : mark?.type);
  const transforms = units.flatMap((unit) => unit.transform ?? []).concat(spec.layer ? spec.transform ?? [] : []);
  const dataOf = (unit: any) => unit.data ?? spec.data;
  const sources = units.map(dataOf).filter((data) => data && (data.url || data.values));
  return {
    plot: `${spec.width} × ${spec.height}`,
    aspect: `${(spec.width / spec.height).toFixed(2)} : 1`,
    projection: `${projection.type ?? '—'}${projection.rotate ? `, rotate [${projection.rotate.join(', ')}]` : ''}`,
    frame,
    clip: units.some((unit) => unit.mark?.clip) ? 'clipped to the plot' : 'not clipped',
    antarctica: projection.type === 'identity' || projection.type === 'albersUsa' ? 'n/a (US map)'
      : transforms.some((step: any) => step.filter === 'datum.id !== 10') ? 'filtered out' : 'kept',
    layers: units.map((unit) => {
      const kind = markType(unit.mark);
      if (unit.data?.sphere) return 'sea';
      const noData = unit.mark?.invalid === null ? ' (no-data kept)' : '';
      const hidden = unit.encoding?.opacity?.condition ? ' (far side hidden)' : '';
      return `${kind}${noData}${hidden}`;
    }).join(' → '),
    source: sources.some((data) => typeof data.url === 'string') ? `fetched: ${[...new Set(sources.filter((data) => data.url).map((data) => data.url.split('/').pop()))].join(', ')}` : 'inline (nothing fetched)',
    attribution: spec._attribution ?? '—',
    colour: colourOf(units),
    ground: groundOf(spec, units),
    warnings: spec._warnings ?? [],
  };
}

// ---------------------------------------------------------------- page
/** The canvas every map is laid out in; a map fills it. */
const CANVAS = { width: 640, height: 440 };

interface Settings {
  theme: string; bundled: boolean; navigate: boolean; boundaries: string;
  mapStyle: string; classes: string; classCount: number; graticule: boolean; borderWidth: string;
}

function withSettings(item: MapCase, settings: Settings): ChartAssemblyInput {
  const { input } = item;
  const styled = {
    ...(settings.boundaries !== 'world-bank' ? { boundaries: settings.boundaries } : {}),
    ...(settings.mapStyle !== 'auto' ? { mapStyle: settings.mapStyle } : {}),
    ...(settings.classes !== 'auto' ? { classes: settings.classes } : {}),
    ...(settings.classCount !== 5 ? { classCount: settings.classCount } : {}),
    ...(settings.graticule ? { graticule: true } : {}),
    ...(settings.borderWidth !== '' ? { borderWidth: Number(settings.borderWidth) } : {}),
  };
  return {
    ...input,
    chart_spec: {
      ...input.chart_spec,
      chartProperties: { ...(input.chart_spec.chartProperties ?? {}), ...styled },
      canvasSize: CANVAS,
    },
    options: { ...(input.options ?? {}), ...(settings.bundled ? { basemaps } : {}) },
    ...(settings.theme ? { theme_spec: settings.theme } : {}),
    ...(settings.navigate ? { interaction_spec: { interactions: [{ type: 'navigate' }] } } : {}),
  } as ChartAssemblyInput;
}

function useDrawnSize(host: React.RefObject<HTMLDivElement | null>, key: unknown) {
  const [drawn, setDrawn] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    setDrawn(null);
    const timer = setInterval(() => {
      const svg = host.current?.querySelector('svg');
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      setDrawn((now) => (now && now.width === next.width && now.height === next.height ? now : next));
    }, 300);
    return () => clearInterval(timer);
  }, [host, key]);
  return drawn;
}

const label: CSSProperties = { color: siteTheme.textMuted, paddingRight: 8, whiteSpace: 'nowrap', verticalAlign: 'top' };

function CaseCard({ item, settings }: { item: MapCase; settings: Settings }) {
  const input = useMemo(() => withSettings(item, settings), [item, settings]);
  const facts = useMemo(() => {
    try {
      return inspect(assembleVegaLite(input));
    } catch (error) {
      return { error: String((error as Error).message ?? error) };
    }
  }, [input]);
  const host = useRef<HTMLDivElement>(null);
  const drawn = useDrawnSize(host, input);
  const [showSpec, setShowSpec] = useState(false);
  return (
    <article data-map-case={item.id} style={{ border: '1px solid #e1e4e8', borderRadius: 8, padding: 12, background: '#fff', display: 'grid', gridTemplateColumns: `${CANVAS.width}px minmax(280px, 1fr)`, gap: 16 }}>
      <div ref={host} style={{ width: CANVAS.width, minHeight: CANVAS.height }}>
        <FlintView spec={input} renderer="svg" compact showWarnings />
      </div>
      <div style={{ fontSize: 12, minWidth: 0 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>{item.title}</h3>
        <div style={{ fontSize: 11, color: siteTheme.textMuted, marginBottom: 4 }}>What to check</div>
        <ul style={{ margin: '0 0 10px', paddingLeft: 18 }}>
          {item.check.map((line) => <li key={line}>{line}</li>)}
        </ul>
        {'error' in facts ? (
          <pre style={{ color: siteTheme.error, whiteSpace: 'pre-wrap' }}>{facts.error}</pre>
        ) : (
          <>
            <table style={{ borderCollapse: 'collapse', fontSize: 11, marginBottom: 8 }}>
              <tbody>
                <tr><td style={label}>Plot</td><td>{facts.plot} · {facts.aspect}</td></tr>
                <tr><td style={label}>Drawn</td><td>{drawn ? `${drawn.width} × ${drawn.height}` : '…'} in a {CANVAS.width} × {CANVAS.height} canvas</td></tr>
                <tr><td style={label}>Projection</td><td>{facts.projection}</td></tr>
                <tr><td style={label}>Frame</td><td>{facts.frame}</td></tr>
                <tr><td style={label}>Base map</td><td>{facts.clip} · Antarctica {facts.antarctica}</td></tr>
                <tr><td style={label}>Layers</td><td>{facts.layers}</td></tr>
                <tr><td style={label}>Boundaries</td><td>{facts.source} · credit: {facts.attribution}</td></tr>
                <tr><td style={label}>Colour</td><td>{facts.colour}</td></tr>
                <tr><td style={label}>Ground</td><td>{facts.ground.map((entry) => (
                  <span key={entry.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 8 }}>
                    <span style={{ width: 11, height: 11, background: entry.color, border: '1px solid #aaa', display: 'inline-block' }} />{entry.label} <code style={{ fontSize: 10 }}>{entry.color}</code>
                  </span>
                ))}</td></tr>
              </tbody>
            </table>
            {facts.warnings.length > 0 ? (
              <ul style={{ margin: '0 0 8px', paddingLeft: 18, color: '#9a6700', fontSize: 11 }}>
                {facts.warnings.map((warning) => <li key={warning.code}><code>{warning.code}</code> {warning.message}</li>)}
              </ul>
            ) : <div style={{ fontSize: 11, color: '#1a7f37', marginBottom: 8 }}>No warnings</div>}
          </>
        )}
        <button type="button" onClick={() => setShowSpec((open) => !open)} style={{ fontSize: 11 }}>{showSpec ? 'Hide' : 'Show'} Flint input</button>
        {showSpec ? (
          <pre style={{ fontSize: 10, maxHeight: 260, overflow: 'auto', background: '#f6f8fa', padding: 8, borderRadius: 4 }}>
            {JSON.stringify({ ...input, options: { ...input.options, ...(settings.bundled ? { basemaps: '<flint-chart/geo basemaps>' } : {}) } }, null, 2)}
          </pre>
        ) : null}
      </div>
    </article>
  );
}

const THEMES = ['', ...Object.keys(THEME_PRESETS)];

export function MapsLab() {
  const [settings, setSettings] = useState<Settings>({
    theme: '', bundled: false, navigate: true, boundaries: 'world-bank',
    mapStyle: 'auto', classes: 'auto', classCount: 5, graticule: false, borderWidth: '',
  });
  const [only, setOnly] = useState<string>('');
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((now) => ({ ...now, [key]: value }));
  const groups = [...new Set(CASES.map((item) => item.group))];
  const shown = CASES.filter((item) => !only || item.id === only);
  return (
    <div className="dev-page" style={{ gap: 12 }}>
      <header className="dev-page-heading" style={{ width: 'min(100%, 1280px)' }}>
        <h1>Maps</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: siteTheme.textMuted }}>
          The map plan, case by case: a map frames its data and fills the canvas at that frame’s shape, its title
          and key given their room first; a region is drawn in a projection centred on it, framed by a neatline; a
          point map turns into a globe; every region stays on the map; the join combines and reports. The world is
          the World Bank’s official boundaries unless a chart asks for Natural Earth’s, loaded from the package on
          first draw; boundaries can also come inline. Every map has a {CANVAS.width} × {CANVAS.height} canvas.
        </p>
      </header>
      <section style={{ width: 'min(100%, 1280px)', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', fontSize: 12, background: '#fafbfc', padding: '8px 10px', border: '1px solid #e1e4e8', borderRadius: 8 }}>
        <label>Theme <select value={settings.theme} onChange={(event) => set('theme', event.target.value)}>{THEMES.map((theme) => <option key={theme} value={theme}>{theme || 'none'}</option>)}</select></label>
        <label title="Unchecked, the spec names the boundaries by URL and the renderer serves them from the package on first draw"><input type="checkbox" checked={settings.bundled} onChange={(event) => set('bundled', event.target.checked)} /> Inline boundaries in the spec (flint-chart/geo)</label>
        <label><input type="checkbox" checked={settings.navigate} onChange={(event) => set('navigate', event.target.checked)} /> Navigate (drag, wheel)</label>
        <span style={{ flexBasis: '100%', height: 0 }} />
        <span style={{ color: siteTheme.textMuted }}>chartProperties:</span>
        <label>boundaries <select value={settings.boundaries} onChange={(event) => set('boundaries', event.target.value)}>{['world-bank', 'natural-earth'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>mapStyle <select value={settings.mapStyle} onChange={(event) => set('mapStyle', event.target.value)}>{['auto', 'light', 'muted', 'atlas', 'dark', 'minimal'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>classes <select value={settings.classes} onChange={(event) => set('classes', event.target.value)}>{['auto', 'quantile', 'equal', 'jenks', 'continuous'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>classCount <input type="number" min={3} max={9} value={settings.classCount} onChange={(event) => set('classCount', Number(event.target.value) || 5)} style={{ width: 44 }} /></label>
        <label><input type="checkbox" checked={settings.graticule} onChange={(event) => set('graticule', event.target.checked)} /> graticule</label>
        <label>borderWidth <select value={settings.borderWidth} onChange={(event) => set('borderWidth', event.target.value)}>{['', '0', '0.25', '0.5', '1', '1.5'].map((value) => <option key={value} value={value}>{value || 'auto'}</option>)}</select></label>
        <span style={{ flexBasis: '100%', height: 0 }} />
        <label>Case <select value={only} onChange={(event) => setOnly(event.target.value)}>
          <option value="">all</option>
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {CASES.filter((item) => item.group === group).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </optgroup>
          ))}
        </select></label>
      </section>
      {groups.map((group) => {
        const items = shown.filter((item) => item.group === group);
        if (!items.length) return null;
        return (
          <section key={group} style={{ width: 'min(100%, 1280px)', display: 'grid', gap: 12 }}>
            <h2 style={{ margin: '8px 0 0', fontSize: 16 }}>{group}</h2>
            {items.map((item) => <CaseCard key={item.id} item={item} settings={settings} />)}
          </section>
        );
      })}
    </div>
  );
}
