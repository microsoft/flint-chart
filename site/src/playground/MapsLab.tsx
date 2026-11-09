import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { THEME_PRESETS, assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import { FlintView } from '../components/FlintView';
import { siteTheme } from '../shared/theme';
import { countryAlpha } from '../../../packages/flint-js/src/chart-types/geo';

/**
 * Maps lab: one card per behaviour of the map plan (framing in the box, the globe, regions without
 * data, the join and its report, boundaries of the chart's own). Each card draws the chart at its own size
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
/** Volcanoes of the Pacific Ring of Fire, either side of the antimeridian. */
const VOLCANOES = [
  ['Mount Fuji', 138.73, 35.36, 'Asia'], ['Sakurajima', 130.66, 31.58, 'Asia'], ['Klyuchevskaya Sopka', 160.64, 56.06, 'Asia'],
  ['Pinatubo', 120.35, 15.13, 'Asia'], ['Mayon', 123.69, 13.26, 'Asia'], ['Krakatoa', 105.42, -6.1, 'Asia'], ['Merapi', 110.45, -7.54, 'Asia'],
  ['Ruapehu', 175.57, -39.28, 'Oceania'], ['Mount Redoubt', -152.74, 60.49, 'North America'], ['Mount St. Helens', -122.19, 46.19, 'North America'],
  ['Popocatépetl', -98.62, 19.02, 'North America'], ['Cotopaxi', -78.44, -0.68, 'South America'], ['Villarrica', -71.93, -39.42, 'South America'],
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
const CITIES = ([
  ['Paris', 2.35, 48.86, 2.1, 'Capital'], ['London', -0.13, 51.51, 8.9, 'Capital'], ['Berlin', 13.4, 52.52, 3.6, 'Capital'], ['Madrid', -3.7, 40.42, 3.2, 'Capital'],
  ['Rome', 12.5, 41.9, 2.8, 'Capital'], ['Brussels', 4.35, 50.85, 1.2, 'Capital'], ['Amsterdam', 4.9, 52.37, 0.9, 'Capital'], ['Vienna', 16.37, 48.21, 1.9, 'Capital'],
  ['Prague', 14.42, 50.08, 1.3, 'Capital'], ['Warsaw', 21.0, 52.23, 1.8, 'Capital'], ['Lisbon', -9.14, 38.72, 0.5, 'Capital'], ['Dublin', -6.26, 53.35, 0.6, 'Capital'],
  ['Luxembourg', 6.13, 49.61, 0.1, 'Capital'], ['Bern', 7.45, 46.95, 0.13, 'Capital'], ['Zurich', 8.54, 47.37, 0.4, 'City'], ['Munich', 11.58, 48.14, 1.5, 'City'],
  ['Milan', 9.19, 45.46, 1.4, 'City'], ['Barcelona', 2.17, 41.39, 1.6, 'City'], ['Hamburg', 9.99, 53.55, 1.8, 'City'], ['Lyon', 4.84, 45.76, 0.5, 'City'],
  ['Antwerp', 4.4, 51.22, 0.5, 'City'], ['Rotterdam', 4.48, 51.92, 0.65, 'City'], ['Frankfurt', 8.68, 50.11, 0.75, 'City'], ['Cologne', 6.96, 50.94, 1.1, 'City'],
] as const).map(([City, longitude, latitude, Population, Kind]) => ({ City, longitude, latitude, Population, Kind }));
/** State populations in millions (2020 census, rounded). */
const STATE_POPULATION = ([
  ['CA', 39.5], ['TX', 29.1], ['FL', 21.5], ['NY', 20.2], ['PA', 13], ['IL', 12.8], ['OH', 11.8], ['GA', 10.7], ['NC', 10.4], ['MI', 10.1],
  ['NJ', 9.3], ['VA', 8.6], ['WA', 7.7], ['AZ', 7.2], ['MA', 7], ['TN', 6.9], ['IN', 6.8], ['MD', 6.2], ['MO', 6.2], ['WI', 5.9],
  ['CO', 5.8], ['MN', 5.7], ['SC', 5.1], ['AL', 5], ['LA', 4.7], ['KY', 4.5], ['OR', 4.2], ['OK', 4], ['CT', 3.6], ['UT', 3.3],
  ['IA', 3.2], ['NV', 3.1], ['AR', 3], ['MS', 3], ['KS', 2.9], ['NM', 2.1], ['NE', 2], ['ID', 1.8], ['WV', 1.8], ['HI', 1.5],
  ['NH', 1.4], ['ME', 1.4], ['RI', 1.1], ['MT', 1.1], ['DE', 1], ['SD', 0.9], ['ND', 0.8], ['AK', 0.7], ['VT', 0.6], ['WY', 0.6],
] as const).map(([State, Population]) => ({ State, Population }));
/** Life expectancy at birth, years (rounded). */
const LIFE = ([
  ['USA', 'United States', 76], ['CAN', 'Canada', 82], ['MEX', 'Mexico', 75], ['BRA', 'Brazil', 73], ['ARG', 'Argentina', 76], ['FRA', 'France', 82],
  ['DEU', 'Germany', 81], ['GBR', 'United Kingdom', 81], ['RUS', 'Russia', 73], ['CHN', 'China', 78], ['IND', 'India', 70], ['AUS', 'Australia', 83],
  ['ZAF', 'South Africa', 64], ['NGA', 'Nigeria', 53], ['EGY', 'Egypt', 72], ['JPN', 'Japan', 84], ['IDN', 'Indonesia', 71], ['SAU', 'Saudi Arabia', 77],
  ['KAZ', 'Kazakhstan', 70], ['DZA', 'Algeria', 76], ['COD', 'DR Congo', 60], ['NLD', 'Netherlands', 82], ['BEL', 'Belgium', 82], ['CHE', 'Switzerland', 84],
  ['SRB', 'Serbia', 75], ['HRV', 'Croatia', 78], ['BIH', 'Bosnia', 75], ['ALB', 'Albania', 77], ['MNE', 'Montenegro', 76], ['MKD', 'North Macedonia', 76],
] as const).map(([iso, Country, Life]) => ({ iso, Country, Life }));
const CODES = [['CA', 0.4], ['IN', 0.7], ['GE', 0.2], ['WA', 0.5]].map(([Code, Share]) => ({ Code, Share }));

// ---------------------------------------------------------------- cases
interface MapCase {
  id: string;
  group: string;
  title: string;
  check: string[];
  input: Omit<ChartAssemblyInput, 'chart_spec'> & { chart_spec: Record<string, any> };
  /** Boundaries of the chart's own, loaded before the card draws (`chartProperties.boundaries`). */
  boundaries?: () => Promise<Record<string, unknown>>;
}

/** The bundled boundaries, loaded only when a card that draws its own asks for them. */
const geo = () => import('flint-chart/geo');

/** A countries topology with each feature keyed by its ISO alpha-3 code, as a file of the chart's own might be. */
function keyedByAlpha3(topology: any): any {
  const countries = topology.objects.countries;
  return {
    ...topology,
    objects: {
      ...topology.objects,
      countries: { ...countries, geometries: countries.geometries.map((shape: any) => ({ ...shape, id: countryAlpha(Number(shape.id), 'iso3') ?? shape.id })) },
    },
  };
}

const PROVINCES = [[440000, 0.21], [330000, 0.17], [320000, 0.09], [510000, 0.04], [110000, 0.12], [650000, 0.06], [540000, 0.03]]
  .map(([Adcode, Growth]) => ({ Adcode, Growth }));

const choropleth = (values: Record<string, unknown>[], semantic_types: Record<string, string>, id: string, color: string, chartProperties: Record<string, unknown> = {}) => ({
  data: { values }, semantic_types, chart_spec: { chartType: 'Choropleth', encodings: { id, color }, chartProperties },
});
const points = (chartProperties: Record<string, unknown> = {}, values: Record<string, unknown>[] = VOLCANOES) => ({
  data: { values },
  semantic_types: { location: 'Name', longitude: 'Longitude', latitude: 'Latitude', continent: 'Category' },
  chart_spec: { chartType: 'Map', encodings: { longitude: 'longitude', latitude: 'latitude', color: 'continent' }, chartProperties },
});

// Routes: stops joined in order. Places after their usual identifications; the storm tracks are synthetic.
const ODYSSEY = ([
  [1, 'Troy', 26.24, 39.96], [2, 'Ismarus', 25.52, 40.89], [3, 'Lotus-Eaters', 10.86, 33.81], [4, 'Cyclops', 15.16, 37.56],
  [5, 'Aeolia', 14.95, 38.47], [6, 'Laestrygonians', 9.16, 41.39], [7, 'Aeaea', 13.05, 41.23], [8, 'Underworld', 14.07, 40.84],
  [9, 'Sirens', 14.43, 40.58], [10, 'Scylla and Charybdis', 15.63, 38.25], [11, 'Thrinacia', 15.0, 37.08], [12, 'Ogygia', 14.25, 36.05],
  [13, 'Scheria', 19.92, 39.62], [14, 'Ithaca', 20.71, 38.37],
] as const).map(([Stop, Place, longitude, latitude]) => ({ Stop, Place, longitude, latitude }));
/** The crew aboard leaving each Odyssey stop, after a traditional reckoning (twelve ships at Troy, one after the Laestrygonians, none after Thrinacia). */
const CREW = [600, 528, 528, 522, 522, 46, 45, 45, 45, 39, 1, 1, 1, 1];
/** Days spent at each Odyssey stop, roughly as the poem tells it (a month with Aeolus, a year with Circe, seven years on Ogygia). */
const DAYS = [0, 2, 1, 3, 30, 2, 365, 1, 1, 1, 30, 2555, 3, 0];
const MAGELLAN = ([
  [1, 'Sanlúcar de Barrameda', -6.35, 36.78], [2, 'Canary Islands', -15.4, 28.1], [3, 'Rio de Janeiro', -43.2, -22.9], [4, 'Río de la Plata', -56.0, -35.0],
  [5, 'Puerto San Julián', -67.7, -49.3], [6, 'Strait of Magellan', -70.9, -53.2], [7, 'Guam', 144.8, 13.4], [8, 'Cebu', 123.9, 10.3],
  [9, 'Moluccas', 127.4, 0.8], [10, 'Timor', 124.5, -9.3], [11, 'Cape of Good Hope', 18.47, -34.36], [12, 'Sanlúcar de Barrameda', -6.35, 36.78],
] as const).map(([Stop, Place, longitude, latitude]) => ({ Stop, Place, longitude, latitude }));
const LEWIS_CLARK = ([
  [1, 'Camp Dubois', -90.12, 38.81], [2, 'Fort Mandan', -101.27, 47.3], [3, 'Great Falls', -111.3, 47.5], [4, 'Lemhi Pass', -113.45, 44.97],
  [5, 'Traveler’s Rest', -114.08, 46.75], [6, 'Fort Clatsop', -123.88, 46.13],
] as const).map(([Stop, Place, longitude, latitude]) => ({ Stop, Place, longitude, latitude }));
const OUT_AND_BACK = ([[1, 'London', -0.13, 51.51], [2, 'New York', -74.0, 40.71], [3, 'London', -0.13, 51.51]] as const)
  .map(([Stop, Place, longitude, latitude]) => ({ Stop, Place, longitude, latitude }));
const STORMS = (['Ana', 'Bill', 'Cleo'] as const).flatMap((Storm, s) => Array.from({ length: 40 }, (_, Fix) => ({
  Storm, Fix,
  longitude: [-45, -60, -35][s] + [-1.1, -0.8, -0.7][s] * Fix + 6 * Math.sin(Fix / 7),
  latitude: [12, 15, 18][s] + [0.35, 0.55, 0.75][s] * Fix + 0.006 * Fix * Fix,
})));
const route = (values: Record<string, unknown>[], chartProperties: Record<string, unknown> = {}) => ({
  data: { values },
  semantic_types: { Stop: 'Rank', Place: 'Name', longitude: 'Longitude', latitude: 'Latitude' },
  chart_spec: { chartType: 'Map', encodings: { longitude: 'longitude', latitude: 'latitude', order: 'Stop' }, chartProperties },
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
    id: 'whole', group: 'Framing', title: 'Europe, framed on the whole map (fit: whole)',
    check: ['Whole world including Antarctica, although the data is European'],
    input: choropleth(EUROPE, { Country: 'Country', Share: 'Percentage' }, 'Country', 'Share', { fit: 'whole' }),
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
    id: 'globe-auto', group: 'Globe', title: 'Ring of Fire volcanoes on a globe, facing the data (drag to turn)',
    check: ['Square plot, sea disc and rim under the land', 'Faces the data’s mean longitude, tilted ≤ 60° (no pole view)', 'Points behind the horizon hidden; drag to bring them round and watch them appear'],
    input: points({ projection: 'orthographic' }),
  },
  {
    id: 'globe-china', group: 'Globe', title: 'Globe centred on China (projectionCenter preset)',
    check: ['Asian volcanoes shown, American ones hidden', 'Rotation [-105, -35, 0]'],
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
    id: 'file-inline', group: 'Boundaries', title: 'A file of its own, inline: Natural Earth’s shapes, attributed',
    check: [
      'Boundaries: inline (nothing fetched) · credit: Natural Earth (inline)',
      '“Boundaries: Natural Earth (inline)” at the foot; no dotted borders; no World Bank credit',
      'Framed and projected as the world map: country ids (iso-numeric, the default)',
    ],
    input: choropleth(SHARES, { Country: 'Country', Share: 'Percentage' }, 'Country', 'Share'),
    boundaries: async () => ({ values: (await geo()).naturalEarthTopology, feature: 'countries', attribution: 'Natural Earth (inline)' }),
  },
  {
    id: 'file-iso3', group: 'Boundaries', title: 'A file keyed by ISO alpha-3 (ids: iso3), the rows by name',
    check: [
      'Every named country coloured: “India” joins the feature keyed IND',
      'Spec: a calculate of upper(toString(datum["id"])) as __geo_key, the join on it',
      'No “not in the map” warning: only the file knows what it draws',
    ],
    input: choropleth(SHARES, { Country: 'Country', Share: 'Percentage' }, 'Country', 'Share'),
    boundaries: async () => ({ values: keyedByAlpha3((await geo()).naturalEarthTopology), feature: 'countries', ids: 'iso3', attribution: 'Natural Earth, keyed by alpha-3' }),
  },
  {
    id: 'file-disputed', group: 'Boundaries', title: 'A file that names its disputed borders, with a linked credit',
    check: [
      'Dotted borders from the object the file names (disputed: "disputed")',
      'Credit as given: its text, a link, and its note on hover',
    ],
    input: choropleth([{ Country: 'India', Share: 0.42 }, { Country: 'Pakistan', Share: 0.31 }, { Country: 'China', Share: 0.55 }, { Country: 'Nepal', Share: 0.2 }], { Country: 'Country', Share: 'Percentage' }, 'Country', 'Share'),
    boundaries: async () => ({
      values: (await geo()).worldBankTopology.medium, feature: 'countries', disputed: 'disputed',
      attribution: { text: 'Boundaries: an example national view', href: 'https://example.org/boundaries', title: 'Shown to test a credit with a link and a note.' },
    }),
  },
  {
    id: 'file-fips', group: 'Boundaries', title: 'US states in longitude and latitude (ids: fips)',
    check: [
      'albersUsa fitted to the file’s shapes (no 975 × 610 pre-projection)',
      'States by name join the file’s zero-padded FIPS ids ("06" ← California)',
      'Plot takes the room’s shape',
    ],
    input: choropleth(STATES, { State: 'State', Rate: 'Percentage' }, 'State', 'Rate'),
    boundaries: async () => ({ values: (await geo()).usStatesTopology, feature: 'states', attribution: 'US Census Bureau, via us-atlas' }),
  },
  {
    id: 'file-own-keys', group: 'Boundaries', title: 'Chinese provinces from a GeoJSON URL, keyed by adcode (ids: as-is)',
    check: [
      'Mercator fitted to the provinces; the rows match properties.adcode exactly',
      'Provinces without a value in the no-data fill',
      'Boundaries: fetched: china-provinces.geojson',
    ],
    input: choropleth(PROVINCES, { Adcode: 'Category', Growth: 'Percentage' }, 'Adcode', 'Growth', {
      boundaries: { url: `${import.meta.env.BASE_URL}map-data/china-provinces.geojson`, ids: 'as-is', key: 'properties.adcode', attribution: 'DataV.GeoAtlas' },
    }),
  },
  {
    id: 'unknown-boundaries', group: 'Boundaries', title: 'A boundaries name Flint does not ship',
    check: ['Draws the World Bank’s', 'Warning invalid-option-value, listing the names and the file form accepted'],
    input: choropleth(SHARES, { Country: 'Country', Share: 'Percentage' }, 'Country', 'Share', { boundaries: 'ordnance-survey' }),
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
  {
    id: 'route-stops', group: 'Routes', title: 'A route of stops: the Odyssey (order: Stop)',
    check: [
      'One line through the 14 stops in order, each leg bowed to the left of travel; a head at each leg’s end, short of the dot',
      'White casing under the line; the line in neutral ink, the points their own colour', 'Frame takes in the bowed legs',
    ],
    input: route(ODYSSEY),
  },
  {
    id: 'route-out-back', group: 'Routes', title: 'Out and back: London → New York → London',
    check: ['The leg out and the leg back part ways, each bowed to its left', 'Two heads, one at each city'],
    input: route(OUT_AND_BACK),
  },
  {
    id: 'route-plain', group: 'Routes', title: 'Arrows off, straight legs (arrows: false, curve: straight)',
    check: ['Plain lines between the stops, no heads', 'Straight on the map: each leg keeps one compass bearing'],
    input: route(ODYSSEY, { arrows: false, curve: 'straight' }),
  },
  {
    id: 'route-antimeridian', group: 'Routes', title: 'Across the antimeridian: Magellan–Elcano, 1519–1522',
    check: ['The Pacific leg leaves the map’s edge and comes back on the other side, not across the whole map', 'Heads on every leg'],
    input: route(MAGELLAN),
  },
  {
    id: 'route-globe', group: 'Routes', title: 'On a globe (projection: orthographic)',
    check: ['Legs follow great circles, unbowed', 'Lines and heads past the horizon hidden; drag the globe with navigate on and the heads turn with their legs'],
    input: route(MAGELLAN, { projection: 'orthographic' }),
  },
  {
    id: 'route-us', group: 'Routes', title: 'On the US map: Lewis and Clark, 1804–1806',
    check: ['Drawn in the US map’s projection', 'Arcs and heads as on the world map'],
    input: route(LEWIS_CLARK, { region: 'us' }),
  },
  {
    id: 'route-tracks', group: 'Routes', title: 'Tracks: three storms of 40 fixes each, coloured by storm (synthetic)',
    check: [
      'More than 24 legs: great circles, unbowed, one head at each track’s end, over the dots',
      'Each line in its storm’s colour; one key, solid swatches',
    ],
    input: {
      data: { values: STORMS },
      semantic_types: { Storm: 'Category', Fix: 'Rank', longitude: 'Longitude', latitude: 'Latitude' },
      chart_spec: { chartType: 'Map', encodings: { longitude: 'longitude', latitude: 'latitude', order: 'Fix', color: 'Storm' }, chartProperties: {} },
    },
  },
  {
    id: 'route-width', group: 'Routes', title: 'Width by a measure (strokeWidth: Crew)',
    check: [
      'Each leg as wide as the crew that sailed it, from zero (1 to 8 px); a key reads the widths; the stops plain dots',
      'Each head sized to its line and joined to it: the line ends inside the head, no rim',
      'A leg too short on screen for its head keeps its line alone; zoom in and the head returns',
    ],
    input: {
      data: { values: ODYSSEY.map((row) => ({ ...row, Crew: CREW[row.Stop - 1] })) },
      semantic_types: { Stop: 'Rank', Place: 'Name', Crew: 'Count', longitude: 'Longitude', latitude: 'Latitude' },
      chart_spec: { chartType: 'Map', encodings: { longitude: 'longitude', latitude: 'latitude', order: 'Stop', strokeWidth: 'Crew' }, chartProperties: {} },
    },
  },
  {
    id: 'route-width-and-size', group: 'Routes', title: 'Stops sized, legs widened (size: Days, strokeWidth: Crew)',
    check: [
      'Each stop a dot sized by the days spent there, from zero by area (2.5 to 7 px), with a key of its own; Ogygia the largest',
      'Each leg as wide as its crew, with its own line-width key: the two keys do not merge',
      'Stops are drawn without asking (size sets them to all); each head stops at the edge of the next dot',
    ],
    input: {
      data: { values: ODYSSEY.map((row) => ({ ...row, Crew: CREW[row.Stop - 1], Days: DAYS[row.Stop - 1] })) },
      semantic_types: { Stop: 'Rank', Place: 'Name', Crew: 'Count', Days: 'Count', longitude: 'Longitude', latitude: 'Latitude' },
      chart_spec: { chartType: 'Map', encodings: { longitude: 'longitude', latitude: 'latitude', order: 'Stop', strokeWidth: 'Crew', size: 'Days' }, chartProperties: {} },
    },
  },
  {
    id: 'route-detail', group: 'Routes', title: 'Routes split by detail, coloured by a quantity',
    check: ['Two routes (detail: Voyage) in neutral ink', 'Points coloured by Stop on a ramp'],
    input: {
      data: { values: [...ODYSSEY.map((row) => ({ ...row, Voyage: 'Odysseus' })), ...OUT_AND_BACK.map((row) => ({ ...row, Voyage: 'Atlantic' }))] },
      semantic_types: { Stop: 'Rank', Place: 'Name', Voyage: 'Category', longitude: 'Longitude', latitude: 'Latitude' },
      chart_spec: { chartType: 'Map', encodings: { longitude: 'longitude', latitude: 'latitude', order: 'Stop', detail: 'Voyage', color: 'Stop' }, chartProperties: {} },
    },
  },
  {
    id: 'point-labels', group: 'Labels and shapes', title: 'Points named beside them (text: City, size: Population)',
    check: [
      'Each city named beside its dot, right first, else left, above or below; no label over a dot or another label',
      'The largest cities named first: a crowded small one is left unnamed (an info warning says how many)',
      'Pan and zoom: every label stays beside its dot',
    ],
    input: {
      data: { values: CITIES },
      semantic_types: { City: 'Name', Population: 'Quantity', longitude: 'Longitude', latitude: 'Latitude' },
      chart_spec: { chartType: 'Map', encodings: { longitude: 'longitude', latitude: 'latitude', text: 'City', size: 'Population' }, chartProperties: {} },
    },
  },
  {
    id: 'point-shapes', group: 'Labels and shapes', title: 'Points told apart by shape (shape: Kind, color: Kind)',
    check: ['Capitals and other cities as two symbols, filled, with one key for shape and colour'],
    input: {
      data: { values: CITIES },
      semantic_types: { City: 'Name', Kind: 'Category', Population: 'Quantity', longitude: 'Longitude', latitude: 'Latitude' },
      chart_spec: { chartType: 'Map', encodings: { longitude: 'longitude', latitude: 'latitude', shape: 'Kind', color: 'Kind', text: 'City' }, chartProperties: {} },
    },
  },
  {
    id: 'route-labels', group: 'Labels and shapes', title: 'A route’s stops named (text: Place)',
    check: ['Each stop named beside it, clear of the others; labels follow a pan or zoom'],
    input: {
      data: { values: ODYSSEY },
      semantic_types: { Stop: 'Rank', Place: 'Name', longitude: 'Longitude', latitude: 'Latitude' },
      chart_spec: { chartType: 'Map', encodings: { longitude: 'longitude', latitude: 'latitude', order: 'Stop', text: 'Place' }, chartProperties: { stops: 'all' } },
    },
  },
  {
    id: 'choropleth-labels', group: 'Labels and shapes', title: 'Regions named at their middles (text: State)',
    check: [
      'Each state that holds its label named at its middle; RI, DE, CT and the like unnamed',
      'Zoom into New England: their labels appear as the states grow',
    ],
    input: {
      data: { values: STATE_POPULATION },
      semantic_types: { State: 'State', Population: 'Quantity' },
      chart_spec: { chartType: 'Choropleth', encodings: { id: 'State', color: 'Population', text: 'State' }, chartProperties: {} },
    },
  },
  {
    id: 'world-labels', group: 'Labels and shapes', title: 'Countries named where they hold it (text: Country)',
    check: ['Large countries named; small ones (Benelux, the Balkans) named only once zoomed in'],
    input: {
      data: { values: LIFE },
      semantic_types: { iso: 'Country', Country: 'Name', Life: 'Quantity' },
      chart_spec: { chartType: 'Choropleth', encodings: { id: 'iso', color: 'Life', text: 'Country' }, chartProperties: {} },
    },
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
    clip: units.some((unit) => unit.mark?.clip && !unit.data?.values?.[0]?.flintRoute) ? 'clipped to the plot' : 'not clipped',
    antarctica: projection.type === 'identity' || projection.type === 'albersUsa' ? 'n/a (US map)'
      : transforms.some((step: any) => typeof step.filter === 'string' && /!== (10|"ATA"|"AQ")$/.test(step.filter)) ? 'filtered out' : 'kept',
    layers: units.map((unit) => {
      const kind = markType(unit.mark);
      if (unit.data?.sphere) return 'sea';
      if (unit.data?.values?.[0]?.flintRoute) return kind === 'point' ? 'route heads' : 'route';
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
  theme: string; navigate: boolean; boundaries: string;
  mapStyle: string; classes: string; classCount: number; graticule: boolean; borderWidth: string;
}

function withSettings(item: MapCase, settings: Settings): ChartAssemblyInput {
  const { input } = item;
  const styled = {
    // A card that gives boundaries of its own keeps them.
    ...(settings.boundaries !== 'world-bank' && input.chart_spec.chartProperties?.boundaries === undefined ? { boundaries: settings.boundaries } : {}),
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

/** A card whose boundaries load first: drawn once they have, with them in its chart properties. */
function LoadedCaseCard({ item, settings }: { item: MapCase; settings: Settings }) {
  const [loaded, setLoaded] = useState<MapCase | null>(item.boundaries ? null : item);
  useEffect(() => {
    if (!item.boundaries) return;
    let live = true;
    void item.boundaries().then((boundaries) => {
      if (!live) return;
      const { chart_spec } = item.input;
      setLoaded({ ...item, input: { ...item.input, chart_spec: { ...chart_spec, chartProperties: { ...(chart_spec.chartProperties ?? {}), boundaries } } } });
    });
    return () => { live = false; };
  }, [item]);
  if (!loaded) return <article data-map-case={item.id} style={{ border: '1px solid #e1e4e8', borderRadius: 8, padding: 12, fontSize: 12 }}>{item.title}: loading its boundaries…</article>;
  return <CaseCard item={loaded} settings={settings} />;
}

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
            {JSON.stringify(input, null, 2)}
          </pre>
        ) : null}
      </div>
    </article>
  );
}

const THEMES = ['', ...Object.keys(THEME_PRESETS)];

/** One choice from a few, as a row of buttons: every option visible, one click to change. */
function Segmented<T extends string>({ label, value, options, onChange, title }: {
  label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void; title?: string;
}) {
  return (
    <div title={title} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: siteTheme.textMuted }}>{label}</span>
      <div role="radiogroup" aria-label={label} style={{ display: 'inline-flex', border: `1px solid ${siteTheme.borderMuted}`, borderRadius: siteTheme.radius, overflow: 'hidden', background: siteTheme.surface }}>
        {options.map((option, index) => {
          const active = option.value === value;
          return (
            <button
              key={option.value} type="button" role="radio" aria-checked={active} onClick={() => onChange(option.value)}
              style={{
                font: 'inherit', fontSize: 12, padding: '3px 9px', cursor: 'pointer', border: 'none',
                borderLeft: index ? `1px solid ${siteTheme.border}` : 'none',
                background: active ? siteTheme.accent : 'transparent', color: active ? '#ffffff' : siteTheme.text,
              }}
            >{option.label}</button>
          );
        })}
      </div>
    </div>
  );
}

/** An on/off setting as a button that shows its state. */
function Toggle({ label, checked, onChange, title }: { label: string; checked: boolean; onChange: (checked: boolean) => void; title?: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} title={title} onClick={() => onChange(!checked)}
      style={{
        font: 'inherit', fontSize: 12, padding: '3px 10px', cursor: 'pointer', borderRadius: 999,
        border: `1px solid ${checked ? siteTheme.accent : siteTheme.borderMuted}`,
        background: checked ? siteTheme.accentBg : siteTheme.surface, color: checked ? siteTheme.accent : siteTheme.text,
      }}
    >{checked ? '✓ ' : ''}{label}</button>
  );
}

const choices = <T extends string>(values: readonly T[], labels: Partial<Record<T, string>> = {}) =>
  values.map((value) => ({ value, label: labels[value] ?? value }));

const DEFAULT_SETTINGS: Settings = {
  theme: '', navigate: true, boundaries: 'world-bank',
  mapStyle: 'auto', classes: 'auto', classCount: 5, graticule: false, borderWidth: '',
};

export function MapsLab() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((now) => ({ ...now, [key]: value }));
  const groups = [...new Set(CASES.map((item) => item.group))];
  const changed = (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).some((key) => settings[key] !== DEFAULT_SETTINGS[key]);
  return (
    <div className="dev-page" style={{ gap: 12 }}>
      <header className="dev-page-heading" style={{ width: 'min(100%, 1280px)' }}>
        <h1>Maps</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: siteTheme.textMuted }}>
          The map plan, case by case: a map frames its data and fills the canvas at that frame’s shape, its title
          and key given their room first; a region is drawn in a projection centred on it, framed by a neatline; a
          point map turns into a globe; every region stays on the map; the join combines and reports. The world is
          the World Bank’s official boundaries unless a chart asks for Natural Earth’s, loaded from the package on
          first draw; a chart can also give a boundary file of its own. Every map has a {CANVAS.width} × {CANVAS.height} canvas.
        </p>
      </header>
      <section style={{
        // Below the sticky dev header, as the other playground pages pin their panels.
        position: 'sticky', top: 60, zIndex: 5, width: 'min(100%, 1280px)', display: 'flex', flexWrap: 'wrap', gap: '10px 18px',
        alignItems: 'center', fontSize: 12, background: 'rgba(250, 251, 252, 0.96)', padding: '10px 12px',
        border: `1px solid ${siteTheme.border}`, borderRadius: 8, boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)',
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: siteTheme.textMuted }}>Theme</span>
          <select value={settings.theme} onChange={(event) => set('theme', event.target.value)} style={{ font: 'inherit', fontSize: 12, padding: '3px 6px', borderRadius: siteTheme.radius, border: `1px solid ${siteTheme.borderMuted}` }}>
            {THEMES.map((theme) => <option key={theme} value={theme}>{theme || 'none'}</option>)}
          </select>
        </label>
        <Segmented label="Style" value={settings.mapStyle} onChange={(value) => set('mapStyle', value)}
          options={choices(['auto', 'light', 'muted', 'atlas', 'dark', 'minimal'] as const, { auto: 'from theme' })} title="chartProperties.mapStyle" />
        <Segmented label="Boundaries" value={settings.boundaries} onChange={(value) => set('boundaries', value)}
          options={choices(['world-bank', 'natural-earth'] as const, { 'world-bank': 'World Bank', 'natural-earth': 'Natural Earth' })}
          title="chartProperties.boundaries (cards with a file of their own keep it)" />
        <span style={{ flexBasis: '100%', height: 0 }} />
        <Segmented label="Classes" value={settings.classes} onChange={(value) => set('classes', value)}
          options={choices(['auto', 'quantile', 'equal', 'jenks', 'continuous'] as const)} title="chartProperties.classes" />
        <label title="chartProperties.classCount" style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: settings.classes === 'continuous' ? 0.45 : 1 }}>
          <span style={{ color: siteTheme.textMuted }}>Count</span>
          <input type="range" min={3} max={9} step={1} value={settings.classCount} disabled={settings.classes === 'continuous'}
            onChange={(event) => set('classCount', Number(event.target.value))} style={{ width: 90 }} />
          <span style={{ minWidth: 10, fontVariantNumeric: 'tabular-nums' }}>{settings.classCount}</span>
        </label>
        <Segmented label="Borders" value={settings.borderWidth} onChange={(value) => set('borderWidth', value)}
          options={choices(['', '0', '0.25', '0.5', '1'] as const, { '': 'auto', '0': 'none' })} title="chartProperties.borderWidth" />
        <Toggle label="Graticule" checked={settings.graticule} onChange={(value) => set('graticule', value)} title="chartProperties.graticule" />
        <Toggle label="Navigate" checked={settings.navigate} onChange={(value) => set('navigate', value)} title="interaction_spec: navigate (drag, wheel)" />
        {changed ? (
          <button type="button" onClick={() => setSettings(DEFAULT_SETTINGS)} style={{ font: 'inherit', fontSize: 12, padding: '3px 10px', marginLeft: 'auto', cursor: 'pointer', border: 'none', background: 'transparent', color: siteTheme.accent }}>Reset</button>
        ) : null}
      </section>
      {groups.map((group) => (
        <section key={group} style={{ width: 'min(100%, 1280px)', display: 'grid', gap: 12 }}>
          <h2 style={{ margin: '8px 0 0', fontSize: 16 }}>{group}</h2>
          {CASES.filter((item) => item.group === group).map((item) => <LoadedCaseCard key={item.id} item={item} settings={settings} />)}
        </section>
      ))}
    </div>
  );
}
