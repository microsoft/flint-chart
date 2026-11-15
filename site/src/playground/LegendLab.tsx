import { useMemo, useState } from 'react';
import { csvParseRows } from 'd3-dsv';
import { assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import { FlintView } from '../components/FlintView';
import gapminderCsv from '../assets/gapminder-five-year.csv?raw';
import classic from '../data/classic-datasets.json';
import './legend-lab.css';

/**
 * How Flint places and sets keys: one key or several, across canvas sizes, under a chosen theme.
 * Every caption is read from the compiled spec, so the page shows where the keys went, not where
 * they were asked to go.
 */

type Row = Record<string, unknown>;
export type Size = { key: string; label: string; width: number; height: number };

export const SIZES: Size[] = [
  { key: 's', label: 'Small 360×260', width: 360, height: 260 },
  { key: 'm', label: 'Medium 560×380', width: 560, height: 380 },
  { key: 'l', label: 'Wide 800×420', width: 800, height: 420 },
  { key: 't', label: 'Tall 400×520', width: 400, height: 520 },
];

const THEMES: { id: string; label: string }[] = [
  { id: '', label: 'Unthemed' },
  { id: 'economist', label: 'Economist' },
  { id: 'nyt', label: 'NYT' },
  { id: 'datawrapper', label: 'Datawrapper' },
  { id: 'swiss', label: 'Swiss' },
  { id: 'mckinsey', label: 'McKinsey' },
  { id: 'bbc', label: 'BBC' },
  { id: 'nature', label: 'Nature' },
  { id: 'powerbi', label: 'Power BI' },
  { id: 'apple', label: 'Apple' },
  { id: 'material', label: 'Material' },
];

const GAPMINDER = csvParseRows(gapminderCsv).slice(1).map(([Country, year, population, Continent, lifeExpectancy, gdp]) => ({
  Country,
  Continent,
  Year: Number(year),
  'Population (M)': Math.round(Number(population) / 1e5) / 10,
  'Life expectancy': Number(lifeExpectancy),
  'GDP per capita': Number(gdp),
}));
const G2007 = GAPMINDER.filter((row) => row.Year === 2007)
  .map((row) => ({ ...row, Income: row['GDP per capita'] >= 12000 ? 'High income' : row['GDP per capita'] >= 2500 ? 'Middle income' : 'Low income' }))
  .sort((a, b) => b['Population (M)'] - a['Population (M)']);
const LONG_NAMES = [
  'Central African Republic', 'Bosnia and Herzegovina', 'Dominican Republic', 'Equatorial Guinea', 'Trinidad and Tobago',
  'Sao Tome and Principe', 'United Kingdom', 'Korea, Dem. Rep.', 'Congo, Dem. Rep.', 'West Bank and Gaza',
];
const PENGUINS: Row[] = (() => {
  const { columns, rows } = (classic as any).penguins as { columns: string[]; rows: unknown[][] };
  return rows.map((row) => Object.fromEntries(columns.map((column, i) => [column, row[i]])))
    .filter((row) => row.Sex === 'Male' || row.Sex === 'Female');
})();

const GAP_TYPES = {
  Country: 'Country', Continent: 'Category', Income: 'Category', Year: 'Year',
  'Population (M)': 'Quantity', 'Life expectancy': 'Quantity', 'GDP per capita': 'Quantity',
};
const PENGUIN_TYPES = { Species: 'Category', Sex: 'Category', 'Flipper length (mm)': 'Quantity', 'Body mass (g)': 'Quantity' };

export interface LegendCase {
  key: string;
  label: string;
  why: string;
  input: (canvasSize: { width: number; height: number }) => ChartAssemblyInput;
}

const scatter = (
  title: string, values: Row[], semantic: Record<string, string>, encodings: Record<string, string>, log = false,
) => (canvasSize: { width: number; height: number }) => ({
  data: { values },
  semantic_types: semantic,
  chart_spec: { chartType: 'Scatter Plot', title, encodings, canvasSize, ...(log ? { chartProperties: { logScale_x: true } } : {}) },
}) as unknown as ChartAssemblyInput;

const GAP_XY = { x: 'GDP per capita', y: 'Life expectancy' };
const PENGUIN_XY = { x: 'Flipper length (mm)', y: 'Body mass (g)' };

export const SINGLE: LegendCase[] = [
  { key: 'colour-3', label: 'Colour, 3 short names', why: 'the simplest key',
    input: scatter('Penguins', PENGUINS, PENGUIN_TYPES, { ...PENGUIN_XY, color: 'Species' }) },
  { key: 'colour-5', label: 'Colour, 5 names', why: 'a row that may wrap on a small canvas',
    input: scatter('Income and life expectancy, 2007', G2007, GAP_TYPES, { ...GAP_XY, color: 'Continent', detail: 'Country' }, true) },
  { key: 'colour-10-long', label: 'Colour, 10 long names', why: 'names that wrap or force the key beside the plot',
    input: (canvasSize) => ({
      data: { values: GAPMINDER.filter((row) => LONG_NAMES.includes(row.Country)) },
      semantic_types: GAP_TYPES,
      chart_spec: { chartType: 'Line Chart', title: 'Life expectancy', encodings: { x: 'Year', y: 'Life expectancy', color: 'Country' }, canvasSize },
    }) as unknown as ChartAssemblyInput },
  { key: 'ramp', label: 'Colour ramp', why: 'a gradient rather than swatches',
    input: scatter('Income and life expectancy, 2007', G2007, GAP_TYPES, { ...GAP_XY, color: 'Population (M)' }, true) },
  { key: 'size', label: 'Size only', why: 'a size key whose largest bubble sets its height',
    input: scatter('Income and life expectancy, 2007', G2007, GAP_TYPES, { ...GAP_XY, size: 'Population (M)', detail: 'Country' }, true) },
];

export const MULTI: LegendCase[] = [
  { key: 'colour-size', label: 'Colour + size', why: 'an untitled colour key beside a titled size key',
    input: scatter('Income and life expectancy, 2007', G2007, GAP_TYPES, { ...GAP_XY, color: 'Continent', size: 'Population (M)', detail: 'Country' }, true) },
  { key: 'colour-shape', label: 'Colour + shape', why: 'two short category keys',
    input: scatter('Penguins', PENGUINS, PENGUIN_TYPES, { ...PENGUIN_XY, color: 'Species', shape: 'Sex' }) },
  { key: 'ramp-size', label: 'Colour ramp + size', why: 'a gradient beside bubbles',
    input: scatter('Income and life expectancy, 2007', G2007, GAP_TYPES, { ...GAP_XY, color: 'Life expectancy', size: 'Population (M)', detail: 'Country' }, true) },
  { key: 'long-size', label: 'Colour, 10 long names + size', why: 'a long key and a size key competing for one edge',
    input: scatter('Ten countries, 2007', G2007.filter((row) => LONG_NAMES.includes(row.Country)), GAP_TYPES,
      { ...GAP_XY, color: 'Country', size: 'Population (M)' }, true) },
  { key: 'three', label: 'Colour + shape + size', why: 'three keys on one chart',
    input: scatter('Income and life expectancy, 2007', G2007, GAP_TYPES,
      { ...GAP_XY, color: 'Continent', shape: 'Income', size: 'Population (M)', detail: 'Country' }, true) },
];

const LEGEND_CHANNELS = ['color', 'fill', 'stroke', 'size', 'shape', 'opacity', 'strokeDash'] as const;

/** Every channel that draws a key, with the key's settings, from the compiled spec's units. */
function compiledKeys(spec: any): { channel: string; legend: Record<string, any> }[] {
  const found = new Map<string, Record<string, any>>();
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    for (const channel of LEGEND_CHANNELS) {
      const definition = node.encoding?.[channel];
      if (!definition || definition.legend === null || (!definition.field && !definition.condition?.field)) continue;
      if (!found.has(channel)) found.set(channel, definition.legend ?? {});
    }
    for (const property of ['layer', 'hconcat', 'vconcat', 'concat'] as const) (node[property] ?? []).forEach(visit);
    if (node.spec) visit(node.spec);
  };
  visit(spec);
  return [...found].map(([channel, legend]) => ({ channel, legend }));
}

/** Where the keys stand and how they are set, as one line per key and one for the shared layout. */
function describeKeys(input: ChartAssemblyInput): string[] {
  let spec: any;
  try {
    spec = assembleVegaLite(input) as any;
  } catch (error) {
    return [`error: ${(error as Error).message}`];
  }
  const config = spec.config?.legend ?? {};
  const lines = compiledKeys(spec).map(({ channel, legend }) => {
    const orient = legend.orient ?? config.orient ?? 'right';
    const direction = legend.direction ?? config.direction ?? (orient === 'top' || orient === 'bottom' ? 'horizontal' : 'vertical');
    const title = legend.title === null ? 'untitled' : `title ${legend.titleOrient ?? config.titleOrient ?? 'top'}`;
    const columns = legend.columns != null ? `, ${legend.columns} cols` : '';
    return `${channel}: ${orient}, ${direction}, ${title}${columns}`;
  });
  const layout = spec.config?.legend?.layout;
  for (const [edge, group] of Object.entries(layout ?? {}) as [string, any][]) {
    if (!group || typeof group !== 'object') continue;
    lines.push(`${edge} group: ${group.direction ?? 'auto'}, anchor ${group.anchor ?? 'start'}${group.center ? ', centred' : ''}`);
  }
  const notes = (spec._theme?.report ?? []).filter((note: any) => /^legend/.test(note.path ?? '')).map((note: any) => note.code);
  if (notes.length) lines.push(`notes: ${[...new Set(notes)].join(', ')}`);
  return lines;
}

function CaseRow({ legendCase, theme, sizes }: { legendCase: LegendCase; theme: string; sizes: Size[] }) {
  return (
    <div className="ll-row">
      <h3>{legendCase.label} <span>— {legendCase.why}</span></h3>
      <div className="ll-cells">
        {sizes.map((size) => (
          <CaseCell key={size.key} legendCase={legendCase} theme={theme} size={size} />
        ))}
      </div>
    </div>
  );
}

function CaseCell({ legendCase, theme, size }: { legendCase: LegendCase; theme: string; size: Size }) {
  const input = useMemo(() => {
    const base = legendCase.input({ width: size.width, height: size.height });
    return (theme ? { ...base, theme_spec: theme } : base) as ChartAssemblyInput;
  }, [legendCase, theme, size]);
  const keys = useMemo(() => describeKeys(input), [input]);
  return (
    <figure>
      <figcaption>
        <b>{size.label}</b>
        {keys.map((line) => <span key={line}>{line}</span>)}
      </figcaption>
      <FlintView spec={input} renderer="svg" showWarnings />
    </figure>
  );
}

export function LegendLab() {
  const [theme, setTheme] = useState('economist');
  const [sizeKeys, setSizeKeys] = useState<string[]>(SIZES.map((size) => size.key));
  const sizes = SIZES.filter((size) => sizeKeys.includes(size.key));
  const toggleSize = (key: string) =>
    setSizeKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));

  return (
    <div className="dev-page ll-page">
      <header className="dev-page-heading ll-heading">
        <h1>Legend</h1>
        <p>
          Where Flint places keys and how it sets them, for charts with one key and with several, across canvas sizes.
          Each caption is read from the compiled Vega-Lite spec: the edge, direction and title seat of every key, the
          layout of keys that share an edge, and the plan's notes where a theme's preference gave way.
        </p>
        <div className="ll-controls">
          <label>
            Theme{' '}
            <select value={theme} onChange={(event) => setTheme(event.target.value)}>
              {THEMES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <span className="ll-sizes">
            {SIZES.map((size) => (
              <label key={size.key}>
                <input type="checkbox" checked={sizeKeys.includes(size.key)} onChange={() => toggleSize(size.key)} /> {size.label}
              </label>
            ))}
          </span>
        </div>
      </header>

      <section className="ll-block">
        <h2>One key</h2>
        {SINGLE.map((legendCase) => <CaseRow key={legendCase.key} legendCase={legendCase} theme={theme} sizes={sizes} />)}
      </section>

      <section className="ll-block">
        <h2>Several keys</h2>
        {MULTI.map((legendCase) => <CaseRow key={legendCase.key} legendCase={legendCase} theme={theme} sizes={sizes} />)}
      </section>
    </div>
  );
}
