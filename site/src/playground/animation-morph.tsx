import { useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import type { InteractiveChartSurface } from 'flint-chart/interactive';
import { Case, chart, type Renderer } from './animation-case';

interface Shared {
  duration: number;
  renderer: Renderer;
}

interface Stop {
  label: string;
  input: ChartAssemblyInput;
}

const TEAMS = [
  { Team: 'England', Goals: 20 }, { Team: 'France', Goals: 17 }, { Team: 'Argentina', Goals: 15 },
  { Team: 'Spain', Goals: 12 }, { Team: 'Brazil', Goals: 10 }, { Team: 'Japan', Goals: 7 },
];
const TEAM_TYPES = { Team: 'Country', Goals: 'Count' };

const COUNTRIES = [
  { Country: 'Aland', Region: 'North', 'GDP per person ($k)': 26, 'Life expectancy': 72 },
  { Country: 'Borea', Region: 'North', 'GDP per person ($k)': 45, 'Life expectancy': 81 },
  { Country: 'Corvia', Region: 'South', 'GDP per person ($k)': 9, 'Life expectancy': 64 },
  { Country: 'Dunmar', Region: 'South', 'GDP per person ($k)': 29, 'Life expectancy': 75 },
  { Country: 'Estiva', Region: 'East', 'GDP per person ($k)': 37, 'Life expectancy': 76 },
  { Country: 'Folia', Region: 'East', 'GDP per person ($k)': 31, 'Life expectancy': 77 },
];
const COUNTRY_TYPES = { Country: 'Country', Region: 'Category', 'GDP per person ($k)': 'Amount', 'Life expectancy': 'Duration' };

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const SALES = QUARTERS.flatMap((Quarter, index) => [
  { Quarter, Region: 'North', Sales: [42, 51, 47, 60][index] },
  { Quarter, Region: 'South', Sales: [38, 35, 44, 41][index] },
  { Quarter, Region: 'East', Sales: [25, 31, 28, 33][index] },
]);
const SALES_TYPES = { Quarter: 'Category', Region: 'Category', Sales: 'Amount' };
const sumBy = <T extends Record<string, unknown>>(rows: readonly T[], key: keyof T, value: keyof T) =>
  [...new Set(rows.map((row) => row[key]))].map((name) => ({
    [key]: name,
    [value]: rows.filter((row) => row[key] === name).reduce((sum, row) => sum + Number(row[value]), 0),
  }));
const QUARTER_TOTALS = sumBy(SALES, 'Quarter', 'Sales');

const CITIES = [
  ['Avon', 'North', 31], ['Bree', 'North', 22], ['Cove', 'North', 17], ['Dale', 'North', 12],
  ['Esk', 'South', 26], ['Fen', 'South', 19], ['Gale', 'South', 9],
  ['Holt', 'East', 21], ['Isle', 'East', 15], ['Jura', 'East', 11], ['Kent', 'East', 6],
].map(([City, Region, Stores]) => ({ City, Region, Stores }));
const CITY_TYPES = { City: 'City', Region: 'Category', Stores: 'Count' };
const REGION_TOTALS = sumBy(CITIES, 'Region', 'Stores');

const SKILLS = ['Speed', 'Passing', 'Shooting', 'Defence', 'Stamina', 'Vision'];
const PLAYERS = SKILLS.flatMap((Skill, index) => [
  { Skill, Player: 'Ana', Score: [82, 74, 68, 55, 77, 80][index] },
  { Skill, Player: 'Ben', Score: [64, 81, 59, 79, 70, 62][index] },
]);
const PLAYER_TYPES = { Skill: 'Category', Player: 'Name', Score: 'Score' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
const ORDERS = MONTHS.map((Month, index) => ({ Month, Orders: Math.round(120 + index * 11 + Math.sin(index / 1.4) * 30) }));
const ORDER_TYPES = { Month: 'Category', Orders: 'Count' };

/** A chart that steps through `stops` by setInput: one button per stop, and a tour of them all. */
function MorphCase({ id, title, op, note, stops, duration, renderer }: Shared & { id: string; title: string; op: string; note: string; stops: readonly Stop[] }) {
  const [current, setCurrent] = useState(0);
  const touring = useRef(false);
  const go = async (surface: InteractiveChartSurface, index: number) => {
    setCurrent(index);
    await surface.setInput(stops[index]!.input);
  };
  const tour = async (surface: InteractiveChartSurface) => {
    if (touring.current) return;
    touring.current = true;
    try {
      for (let step = 1; step <= stops.length; step += 1) {
        await go(surface, (current + step) % stops.length);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } finally {
      touring.current = false;
    }
  };
  return (
    <Case
      id={id}
      title={title}
      op={op}
      note={note}
      input={stops[0]!.input}
      duration={duration}
      renderer={renderer}
      controls={(surface) => (
        <>
          {stops.map((stop, index) => (
            <button key={stop.label} type="button" className={index === current ? 'active' : ''} onClick={() => void go(surface, index)}>{stop.label}</button>
          ))}
          <button type="button" onClick={() => void tour(surface)}>Tour</button>
        </>
      )}
    />
  );
}

export function MorphCases({ duration, renderer }: Shared) {
  const teams = useMemo(() => {
    const team = (type: string, encodings: Record<string, string>) => chart(type, 'Goals by team', TEAMS, TEAM_TYPES, encodings, 260, 200);
    return [
      { label: 'Bars', input: team('Bar Chart', { x: 'Team', y: 'Goals' }) },
      { label: 'Pie', input: team('Pie Chart', { color: 'Team', size: 'Goals' }) },
      { label: 'Donut', input: team('Donut Chart', { color: 'Team', size: 'Goals' }) },
      { label: 'Rose', input: team('Rose Chart', { x: 'Team', y: 'Goals', color: 'Team' }) },
    ];
  }, []);
  const sideways = useMemo(() => {
    const team = (type: string, encodings: Record<string, string>) => chart(type, 'Goals by team', TEAMS, TEAM_TYPES, encodings, 260, 200);
    return [
      { label: 'Bars across', input: team('Bar Chart', { x: 'Goals', y: 'Team' }) },
      { label: 'Pie', input: team('Pie Chart', { color: 'Team', size: 'Goals' }) },
    ];
  }, []);
  const countries = useMemo(() => {
    const country = (type: string, encodings: Record<string, string>) => chart(type, 'Six countries', COUNTRIES, COUNTRY_TYPES, encodings, 260, 200);
    return [
      { label: 'Scatter', input: country('Scatter Plot', { x: 'GDP per person ($k)', y: 'Life expectancy', color: 'Region' }) },
      { label: 'Bars', input: country('Bar Chart', { x: 'Country', y: 'Life expectancy', color: 'Region' }) },
      { label: 'Lollipop', input: country('Lollipop Chart', { x: 'Country', y: 'Life expectancy', color: 'Region' }) },
      { label: 'Pie', input: country('Pie Chart', { color: 'Country', size: 'GDP per person ($k)' }) },
    ];
  }, []);
  const months = useMemo(() => {
    const month = (type: string, encodings: Record<string, string>) => chart(type, 'Orders by month', ORDERS, ORDER_TYPES, encodings, 280, 200);
    return [
      { label: 'Line', input: month('Line Chart', { x: 'Month', y: 'Orders' }) },
      { label: 'Bars', input: month('Bar Chart', { x: 'Month', y: 'Orders' }) },
      { label: 'Rose', input: month('Rose Chart', { x: 'Month', y: 'Orders', color: 'Month' }) },
      { label: 'Area', input: month('Area Chart', { x: 'Month', y: 'Orders' }) },
    ];
  }, []);
  const sales = useMemo(() => {
    const quarter = (type: string, encodings: Record<string, string>) => chart(type, 'Sales by quarter and region', SALES, SALES_TYPES, encodings, 280, 200);
    return [
      { label: 'Side by side', input: quarter('Grouped Bar Chart', { x: 'Quarter', y: 'Sales', group: 'Region' }) },
      { label: 'Stacked', input: quarter('Stacked Bar Chart', { x: 'Quarter', y: 'Sales', color: 'Region' }) },
      { label: 'Stacked across', input: quarter('Stacked Bar Chart', { y: 'Quarter', x: 'Sales', color: 'Region' }) },
      { label: 'Side by side across', input: quarter('Grouped Bar Chart', { y: 'Quarter', x: 'Sales', group: 'Region' }) },
    ];
  }, []);
  const panels = useMemo(() => {
    const quarter = (type: string, encodings: Record<string, string>, width = 280) => chart(type, 'Sales by quarter and region', SALES, SALES_TYPES, encodings, width, 200);
    return [
      { label: 'Side by side', input: quarter('Grouped Bar Chart', { x: 'Quarter', y: 'Sales', group: 'Region' }) },
      { label: 'A pie per quarter', input: quarter('Pie Chart', { column: 'Quarter', color: 'Region', size: 'Sales' }, 200) },
      { label: 'Stacked', input: quarter('Stacked Bar Chart', { x: 'Quarter', y: 'Sales', color: 'Region' }) },
    ];
  }, []);
  const totals = useMemo(() => {
    const quarter = (type: string, encodings: Record<string, string>, rows: Record<string, unknown>[] = QUARTER_TOTALS) =>
      chart(type, 'Sales by quarter', rows, SALES_TYPES, encodings, 280, 200);
    return [
      { label: 'By region', input: quarter('Stacked Bar Chart', { x: 'Quarter', y: 'Sales', color: 'Region' }, SALES) },
      { label: 'Totals', input: quarter('Bar Chart', { x: 'Quarter', y: 'Sales' }) },
      { label: 'Pie of totals', input: quarter('Pie Chart', { color: 'Quarter', size: 'Sales' }) },
    ];
  }, []);
  const cities = useMemo(() => {
    const city = (type: string, encodings: Record<string, string>, rows: Record<string, unknown>[]) => chart(type, 'Stores by region', rows, CITY_TYPES, encodings, 260, 200);
    return [
      { label: 'A dot per city', input: city('Strip Plot', { x: 'Region', y: 'Stores', color: 'Region' }, CITIES) },
      { label: 'Region totals', input: city('Bar Chart', { x: 'Region', y: 'Stores', color: 'Region' }, REGION_TOTALS) },
    ];
  }, []);
  const players = useMemo(() => {
    const player = (type: string, encodings: Record<string, string>) => chart(type, 'Two players', PLAYERS, PLAYER_TYPES, encodings, 280, 220);
    return [
      { label: 'Side by side', input: player('Grouped Bar Chart', { x: 'Skill', y: 'Score', group: 'Player' }) },
      { label: 'Radar', input: player('Radar Chart', { x: 'Skill', y: 'Score', color: 'Player' }) },
      { label: 'Lines', input: player('Line Chart', { x: 'Skill', y: 'Score', color: 'Player' }) },
    ];
  }, []);
  const shared = { duration, renderer };
  return (
    <>
      <MorphCase
        id="morph-ring"
        title="Bars, a pie, a donut, a rose"
        op="setInput · gather and bend"
        note="A bar's length is a pie wedge's sweep, so the bars first gather into one column (a stacked bar), which then curls about its middle into the pie. Pie to donut moves in angle and radius about one centre. In a rose the length is the reach, so the row of bars curls along its bands instead."
        stops={teams}
        {...shared}
      />
      <MorphCase
        id="morph-across"
        title="Bars across, then a pie"
        op="setInput · gather and bend"
        note="Horizontal bars draw their value along x, so they gather into one row, not a column, before it curls into the pie. Which way a mark draws its value comes from its encoding."
        stops={sideways}
        {...shared}
      />
      <MorphCase
        id="morph-stack"
        title="Side by side, then stacked"
        op="setInput · one axis at a time"
        note="Side-by-side bars keep apart across their band, stacked bars along their value. Moving both at once would sweep bars through each other, so each moves one axis at a time: into a stack the bars rise to their places, then slide together; out of one they slide apart, then drop to the baseline. Across works the same way. Between columns and rows the chart squashes onto its baseline, travels to the new one, and grows along the new axis, so every frame with any length is the same chart on a shrinking or growing scale."
        stops={sales}
        {...shared}
      />
      <MorphCase
        id="morph-panels"
        title="A pie per quarter"
        op="setInput · gather and bend, per panel"
        note="Each quarter's pie is its own ring, so each quarter's bars gather into their own column and curl into their own pie."
        stops={panels}
        {...shared}
      />
      <MorphCase
        id="morph-merge"
        title="Segments merge into totals"
        op="setInput · merge and split"
        note="Each total is a row of its own that names its quarter; each segment names its quarter and region. The quarter is all they share, so each quarter's segments merge into its total, and the total splits back into them. One copy stays to the end; the others fade over the last quarter of the change. The total then curls into its wedge."
        stops={totals}
        {...shared}
      />
      <MorphCase
        id="morph-cities"
        title="Dots merge into their region's bar"
        op="setInput · merge and split"
        note="Each dot names a city in its region; each bar is a region's total. The dots of a region grow into its bar, and the bar breaks back into its dots."
        stops={cities}
        {...shared}
      />
      <MorphCase
        id="morph-radar"
        title="Bars, a radar, lines"
        op="setInput · gather and bend"
        note="The radar lays its points out about a centre of its own and says so, so each point is read by its angle and reach. A skill is a band in the bar chart and a spoke in the radar, so the row of bars curls along its bands, as a rose does, and each bar ends on its point."
        stops={players}
        {...shared}
      />
      <MorphCase
        id="morph-countries"
        title="Dots, bars, stems, wedges"
        op="setInput · morph by identity"
        note="Country is typed as a place, so it names each element in every chart, even where colour shows the region: each dot grows into its country's bar, thins to a lollipop head as the stems arrive, and gathers into its wedge."
        stops={countries}
        {...shared}
      />
      <MorphCase
        id="morph-months"
        title="A line, bars, a rose, an area"
        op="setInput · morph by identity"
        note="Each point of the line names its month, so it grows into that month's bar, and the bars curl into the rose. An area is drawn as one shape but keeps a point per month, so each month takes the slice of area around its point, from the midpoint with the month before to the one with the month after."
        stops={months}
        {...shared}
      />
    </>
  );
}
