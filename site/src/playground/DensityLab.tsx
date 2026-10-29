import { assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import { FlintView } from '../components/FlintView';
import uis from '../data/uis-completion.json';
import classic from '../data/classic-datasets.json';
import './density-lab.css';

/**
 * How Flint's layout answers many marks: lines thin with the number of series, dots shrink with how
 * full the plot is, and a theme picks one overlap treatment (fade or halo). Every caption is read
 * from the compiled spec, so the page shows what Flint draws, not what it was asked for.
 */

type Theme = ChartAssemblyInput['theme_spec'] | undefined;
type Row = Record<string, unknown>;

interface Series { country: string; region: string; values: [number, number][] }
const SERIES = uis.series as Series[];
const LATEST = uis.latest as unknown as Row[];

const CARS: Row[] = (() => {
  const { columns, rows } = (classic as any).autoMpg as { columns: string[]; rows: unknown[][] };
  return rows.map((row) => Object.fromEntries(columns.map((column, i) => [column, row[i]])));
})();

const CELL = { width: 360, height: 270 };

/* ---------------------------------------------------------------------------------------------- */
/* Lines: weight follows the number of series                                                      */
/* ---------------------------------------------------------------------------------------------- */

export const SERIES_COUNTS = [7, 30, SERIES.length];

export function lineInput(count: number, theme: Theme): ChartAssemblyInput {
  const rows = SERIES.slice(0, count).flatMap((s) => s.values.map(([year, completion]) => ({ country: s.country, region: s.region, year, completion })));
  return {
    data: { values: rows },
    semantic_types: { year: 'Year', completion: 'Percentage', region: 'Category', country: 'Country' },
    chart_spec: { chartType: 'Line Chart', encodings: { x: 'year', y: 'completion', color: 'region', detail: 'country' }, canvasSize: CELL },
    ...(theme ? { theme_spec: theme } : {}),
  } as ChartAssemblyInput;
}

function lineWeight(input: ChartAssemblyInput): string {
  const spec = assembleVegaLite(input) as any;
  const width = spec.config?.line?.strokeWidth;
  return width != null ? `${width} px lines` : "2 px lines (Vega-Lite's default)";
}

function LineDensity() {
  const themes: { key: string; label: string; theme: Theme }[] = [
    { key: 'none', label: 'No theme', theme: undefined },
    { key: 'economist', label: 'Economist', theme: 'economist' },
  ];
  return (
    <section className="dl-block">
      <h2>Lines thin as the series grow</h2>
      <p className="dl-text">
        UNESCO UIS upper secondary completion, one line per country. The plan thins lines where the series would ink
        more than 15% of the panel's height between them (each line runs the width, so its share is its weight against
        the height), down to 0.75 px, with or without a theme. Before, the weight was 2 px (no theme) or 1.6 px
        (Economist) whatever the count.
      </p>
      {themes.map((t) => (
        <div key={t.key} className="dl-row">
          <h3>{t.label}</h3>
          <div className="dl-cells">
            {SERIES_COUNTS.map((count) => {
              const input = lineInput(count, t.theme);
              return (
                <figure key={count}>
                  <figcaption><b>{count} series</b><br />{lineWeight(input)}</figcaption>
                  <FlintView spec={input} renderer="svg" />
                </figure>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Dots: size follows fullness; the theme picks one overlap treatment                              */
/* ---------------------------------------------------------------------------------------------- */

export interface DotData { key: string; label: string; rows: Row[]; x: string; y: string; color: string; type: string }
export const DOT_DATA: DotData[] = [
  { key: 'cars', label: 'Cars: 392 dots filling the plot', rows: CARS, x: 'Horsepower', y: 'MPG', color: 'Origin', type: 'Quantity' },
  { key: 'uis', label: 'UIS: 164 dots on a diagonal', rows: LATEST, x: 'girls', y: 'boys', color: 'region', type: 'Percentage' },
];

export function dotInput(data: DotData, theme: Theme, opacity?: number): ChartAssemblyInput {
  return {
    data: { values: data.rows },
    semantic_types: { [data.x]: data.type, [data.y]: data.type, [data.color]: 'Category' },
    chart_spec: {
      chartType: 'Scatter Plot', encodings: { x: data.x, y: data.y, color: data.color }, canvasSize: CELL,
      ...(opacity != null ? { chartProperties: { opacity } } : {}),
    },
    ...(theme ? { theme_spec: theme } : {}),
  } as ChartAssemblyInput;
}

interface Variant { key: string; label: string; why: string; theme?: Theme; opacity?: number }
const point = (p: Record<string, unknown>) => ({ extends: 'economist', geometry: { point: p } }) as unknown as Theme;
const VARIANTS: Variant[] = [
  { key: 'none', label: 'No theme', why: "Vega-Lite's defaults" },
  { key: 'solid', label: 'Shrink, solid', why: 'the theme picks no overlap treatment', theme: point({ opacity: 1 }) },
  { key: 'fade', label: 'Shrink + fade', why: 'the theme fades at 0.5; shrunk dots rise toward solid (diameter × opacity held)', theme: point({ opacity: 0.5 }) },
  { key: 'halo', label: 'Shrink + halo', why: 'the theme rings solid dots; the ring is a quarter of the radius', theme: point({ halo: { presence: 'full', width: 1 } }) },
  { key: 'chart', label: 'Chart opacity 0.5', why: 'set on the chart: explicit, so never coupled', theme: point({ opacity: 1 }), opacity: 0.5 },
];

/** What the compiled spec draws: size, opacity and ring, with Vega-Lite's defaults where Flint set none. */
function drawnDots(input: ChartAssemblyInput): string {
  const spec = assembleVegaLite(input) as any;
  const mark = typeof spec.mark === 'object' ? spec.mark : {};
  const circle = spec.config?.circle ?? {};
  const size = mark.size ?? circle.size ?? 30;
  const opacity = mark.opacity ?? circle.opacity ?? 0.7;
  const ringWidth = mark.strokeWidth ?? circle.strokeWidth;
  const ring = circle.stroke && ringWidth ? `, ${ringWidth}px ring` : '';
  return `${size} px², opacity ${opacity}${ring}`;
}

function DotDensity() {
  return (
    <section className="dl-block">
      <h2>Dots: size follows fullness, the theme picks one overlap treatment</h2>
      <p className="dl-text">
        Each themed column is the Economist with one point setting changed. Size follows how full the plot is: Flint
        shrinks the cars to half the house's 66 px², not the UIS diagonal. A theme picks one overlap treatment, fade or
        halo, never both. Under fade, a shrunk dot's opacity rises with the lost diameter (0.5 → 0.71 at half the
        area), so lone dots stay readable while piles darken; holding area instead would undo the fade at half size. A
        ring is a quarter of the dot's radius and drops on dots under 28 px². An opacity set on the chart is explicit
        and is never adjusted.
      </p>
      {DOT_DATA.map((data) => (
        <div key={data.key} className="dl-row">
          <h3>{data.label}</h3>
          <div className="dl-cells">
            {VARIANTS.map((variant) => {
              const input = dotInput(data, variant.theme, variant.opacity);
              return (
                <figure key={variant.key}>
                  <figcaption><b>{variant.label}</b>: {variant.why}<br />{drawnDots(input)}</figcaption>
                  <FlintView spec={input} renderer="svg" />
                </figure>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

export function DensityLab() {
  return (
    <div className="dev-page dl-page">
      <header className="dev-page-heading dl-heading">
        <h1>Density</h1>
        <p>
          How the layout plan answers many marks. Lines thin with the number of series; dots shrink with how full the
          plot is; a theme decides how overlapping dots stay readable. Every caption is read from the compiled spec.
        </p>
      </header>

      <LineDensity />
      <DotDensity />

      <section className="dl-notes">
        <h2>The rules, and why</h2>
        <ol>
          <li>
            <b>Line weight follows the number of series.</b> Width = 15% of the plot's height ÷ the series, between
            0.75 px and the house weight, so the same count thins less on a taller plot: above, 30 series get 1.1 px
            on the unthemed 220 px plot and 1.41 px on the Economist's, which its canvas fit lays out at 282 px. The
            rule lives in the plan (<code>lineWidth</code>), so it applies with or without a theme.
          </li>
          <li>
            <b>Dot size answers how full the plot is; crowding is noted, not shrunk.</b> One size applies to every dot,
            so it follows the plot as a whole: dots shrink only where together they would ink more than 12% of the
            plot, and never below 30 px² or half the house's dot (the Economist's 66 goes no lower than 33). A first
            attempt also shrank dots that touch each other, and it backfired: clustered dots sit closer than any dot is
            wide and ties never separate (26% of the classic cars sit exactly on another), so it hit its floor on every
            theme while the sparse outliers became specks. Where more than 40% of 50 or more dots touch, Flint says so
            in the chart's warnings (<code>dots-crowded</code>), which agents read, and suggests an explicit opacity or
            a theme halo.
          </li>
          <li>
            <b>A ring around dots is a theme option</b>: <code>geometry.point.halo</code>, already used for a line's
            dots, also rings a scatter's dots where the house declares it. It is not a default: of the houses we have
            evidence for, Nature asks for one (a 0.6 px hairline) and NYT for a 1 px white ring on solid dots. The
            Economist guide draws scatter dots at 50% opacity with no ring (0.3 px stroke on bubbles); Datawrapper
            draws solid dots, ringing only the labelled ones in dark ink.
          </li>
          <li>
            <b>One overlap treatment per theme.</b> A theme fades its dots or rings them, never both, since rings break
            the darker pile an opacity shows into a lattice. Shrink works with either: under fade, shrunk dots rise
            toward solid (diameter × opacity held). Rings follow the dot: a halo is a quarter of the radius and drops
            on dots under 28 px²; an outline is 35% of it; a line's dots are ringed by their own size.
          </li>
          <li>
            <b>Opacity is never inferred from density.</b> It comes from the theme or the chart, and an opacity set on
            the chart is never adjusted; chart properties may combine treatments a theme would not.
          </li>
        </ol>
      </section>
    </div>
  );
}
