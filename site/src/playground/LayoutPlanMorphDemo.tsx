import { useCallback, useMemo, useRef, useState } from 'react';
import { getChartTransitions, type ChartAssemblyInput } from 'flint-chart';
import { FlintChart } from 'flint-chart/react';
import { BASKET_ROWS, TEAMS } from './layout-plan-shared';
import './layout-plan-morph.css';

/**
 * A chart that becomes its next spec whenever `spec` changes, through Flint's own chart swap: marks
 * morph by what they are about, axes, labels and legends by their values, the rest cross-fades.
 * `onMorph` runs once the swap has landed.
 */
export function MorphingChart({ spec, duration = 800, onMorph, className }: {
  spec: ChartAssemblyInput;
  duration?: number;
  onMorph?: () => void;
  className?: string;
}) {
  const transition = useMemo(() => ({ duration }), [duration]);
  const latest = useRef(onMorph);
  latest.current = onMorph;
  const landed = useCallback(() => latest.current?.(), []);
  return (
    <div className={className ?? 'lm-chart'}>
      <FlintChart spec={spec} renderer="svg" transition={transition} onRender={landed} />
    </div>
  );
}

// ─── Demo ──────────────────────────────────────────────────────────────────

const TOP_TEAMS = [...TEAMS].sort((a, b) => b.Goals - a.Goals).slice(0, 8);
const TEAM_TYPES = { Team: 'Country', Confederation: 'Category', Goals: 'Count' };
const EGG_ROWS = BASKET_ROWS.filter(({ Food }) => Food === 'Eggs').slice(-24);
const EGG_TYPES = { Month: 'YearMonth', Price: { semanticType: 'Price', unit: 'USD' }, Food: 'Category' };
const SIZE = { width: 380, height: 240 };

const teamChart = (chartType: string, encodings: Record<string, string>): ChartAssemblyInput => ({
  data: { values: TOP_TEAMS },
  semantic_types: TEAM_TYPES,
  chart_spec: { chartType, title: 'Goals per team, top eight', encodings, baseSize: SIZE },
});

const eggChart = (chartType: string): ChartAssemblyInput => ({
  data: { values: EGG_ROWS },
  semantic_types: EGG_TYPES,
  field_display_names: { Price: 'Price per dozen' },
  chart_spec: { chartType, title: 'Egg prices, last two years', encodings: { x: 'Month', y: 'Price' }, baseSize: SIZE },
});

export interface MorphDataset {
  id: string;
  label: string;
  charts: { type: string; label: string; spec: ChartAssemblyInput }[];
}

export const MORPH_DATASETS: MorphDataset[] = [
  {
    id: 'teams',
    label: 'Teams',
    charts: [
      { type: 'Bar Chart', label: 'Bar', spec: teamChart('Bar Chart', { x: 'Team', y: 'Goals', color: 'Confederation' }) },
      { type: 'Pie Chart', label: 'Pie', spec: teamChart('Pie Chart', { size: 'Goals', color: 'Team' }) },
      { type: 'Donut Chart', label: 'Donut', spec: teamChart('Donut Chart', { size: 'Goals', color: 'Team' }) },
      { type: 'Lollipop Chart', label: 'Lollipop', spec: teamChart('Lollipop Chart', { x: 'Team', y: 'Goals', color: 'Confederation' }) },
      { type: 'Strip Plot', label: 'Strip', spec: teamChart('Strip Plot', { x: 'Confederation', y: 'Goals', color: 'Confederation' }) },
    ],
  },
  {
    id: 'eggs',
    label: 'Egg prices',
    charts: [
      { type: 'Bar Chart', label: 'Bar', spec: eggChart('Bar Chart') },
      { type: 'Line Chart', label: 'Line', spec: eggChart('Line Chart') },
      { type: 'Area Chart', label: 'Area', spec: eggChart('Area Chart') },
      { type: 'Scatter Plot', label: 'Scatter', spec: eggChart('Scatter Plot') },
    ],
  },
];

export function MorphDemo() {
  const [datasetId, setDatasetId] = useState(MORPH_DATASETS[0].id);
  const dataset = MORPH_DATASETS.find(({ id }) => id === datasetId)!;
  const [current, setCurrent] = useState(0);
  const [previous, setPrevious] = useState<number | undefined>(undefined);
  const [duration, setDuration] = useState(900);
  const [busy, setBusy] = useState(false);
  // The swap the demo waits on lands when the chart reports its next render.
  const landing = useRef<(() => void) | null>(null);

  const siblings = useMemo(() => new Set(getChartTransitions(dataset.charts[current].type).map(({ to }) => to)), [dataset, current]);

  const pickDataset = (id: string) => {
    setDatasetId(id);
    setCurrent(0);
    setPrevious(undefined);
  };

  const goTo = (index: number): Promise<void> => new Promise((resolve) => {
    landing.current = resolve;
    setCurrent(index);
  });

  const choose = (index: number) => {
    if (index === current) return;
    setPrevious(current);
    setCurrent(index);
  };

  const playBothWays = async () => {
    const home = current;
    const away = previous ?? (current + 1) % dataset.charts.length;
    setBusy(true);
    await goTo(away);
    await goTo(home);
    setBusy(false);
  };

  const landed = useCallback(() => {
    const resolve = landing.current;
    landing.current = null;
    resolve?.();
  }, []);

  return (
    <section className="ov-demo lp-demo" data-demo="morph">
      <header className="ov-demo-header">
        <div>
          <h2>One chart becomes another</h2>
          <p>The chart takes the new spec in place. Marks morph by what they are about, ticks and labels move by their values, titles by their role; whatever has no partner fades.</p>
        </div>
        <div className="ov-backends" role="group" aria-label="Data">
          {MORPH_DATASETS.map(({ id, label }) => (
            <button type="button" key={id} className={id === datasetId ? 'active' : ''} onClick={() => pickDataset(id)}>{label}</button>
          ))}
        </div>
      </header>
      <div className="lm-controls">
        <div className="ov-backends lm-targets" role="group" aria-label="Chart type">
          {dataset.charts.map(({ type, label }, index) => (
            <button
              type="button"
              key={type}
              className={index === current ? 'active' : ''}
              data-type={type}
              title={siblings.has(type) ? `${type} · a registered transition from ${dataset.charts[current].type}` : type}
              onClick={() => choose(index)}
            >
              {label}{siblings.has(type) ? <span className="lm-edge" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
        <label className="lp-slider lm-slider">
          <span>{duration} ms</span>
          <input type="range" min={200} max={3000} step={100} value={duration} onChange={(event) => setDuration(Number(event.target.value))} />
        </label>
        <div className="ov-backends" role="group" aria-label="Play">
          <button type="button" className="lm-play" disabled={busy} onClick={() => void playBothWays()}>Play both ways</button>
        </div>
      </div>
      <div className="lm-stage">
        <MorphingChart key={datasetId} spec={dataset.charts[current].spec} duration={duration} onMorph={landed} />
      </div>
      <p className="lp-note lm-summary">
        Pick a chart type to change into. A dot marks the types Flint lists as transitions from the current one; the rest cross-fade.
      </p>
    </section>
  );
}
