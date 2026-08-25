import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type {
  FlintInteractionEventDetail,
  InteractionDef,
  InteractiveChartSurface,
  SemanticElement,
} from 'flint-chart/interactive';
import {
  brushY,
  clickHighlight,
  externalTrigger,
  select,
} from 'flint-chart/interactive';
import { InteractionDemoChart } from './InteractionDemoChart';
import type { InteractionDemoFixture } from './interaction-demo-data';
import { gapminderRows, type GapminderRow } from './gapminder-dashboard-data';
import './interaction-dashboard-lab.css';

type Row = Record<string, unknown>;

interface LinkPayload {
  observationIds: string[];
}

interface DashboardChart {
  id: string;
  fixture: InteractionDemoFixture;
  interaction: InteractionDef;
}

interface DashboardSelection {
  ids: string[];
}

const rows: Row[] = gapminderRows.map((row) => ({ ...row, 'Year label': String(row.Year) }));
const years = [...new Set(gapminderRows.map((row) => row.Year))];
const countryCount = new Set(gapminderRows.map((row) => row.Country)).size;
const focusCountries = new Set([
  'Argentina', 'Australia', 'Brazil', 'China', 'Egypt', 'France', 'Germany', 'India',
  'Japan', 'Nigeria', 'South Africa', 'United States',
]);

type DashboardMetric = 'Life expectancy' | 'GDP per capita';
type TrendDensity = 'focus' | 'all';

const semanticTypes = {
  Observation: 'Category',
  'Observation IDs': 'Category',
  Country: 'Country',
  Continent: 'Category',
  Year: 'Quantity',
  'Year label': 'Category',
  Population: 'Quantity',
  'Population (M)': 'Quantity',
  'Life expectancy': 'Quantity',
  'GDP per capita': 'Currency',
};

function idsFor(test: (row: GapminderRow) => boolean): string[] {
  return gapminderRows.filter(test).map((row) => row.Observation);
}

function recordObservationIds(record: Row): string[] {
  return Array.isArray(record['Observation IDs'])
    ? record['Observation IDs'].map(String)
    : [String(record.Observation)];
}

function dashboardFixture(
  id: string,
  title: string,
  chartType: string,
  encodings: Record<string, unknown>,
  values: Row[] = rows,
  chartProperties?: Record<string, unknown>,
  baseSize = { width: 350, height: 245 },
): InteractionDemoFixture {
  return {
    id,
    title,
    source: 'Gapminder five-year data via Jenny Bryan / Plotly datasets',
    input: {
      data: { values },
      semantic_types: semanticTypes,
      options: chartType === 'Bar Chart'
        ? { defaultBandSize: 44, maxBandSize: 64 }
        : undefined,
      chart_spec: {
        chartType,
        title,
        encodings,
        baseSize,
        chartProperties,
      },
    },
  } as InteractionDemoFixture;
}

const linkedFocus: InteractionDef<LinkPayload> = {
  id: 'dashboard-linked-focus',
  eventSource: externalTrigger('dashboard-link'),
  update(event, context) {
    if (event.type !== 'external' || event.source !== 'dashboard-link') return null;
    const selected = new Set(event.payload.observationIds);
    if (selected.size === 0) return { ops: [{ op: 'reset' }] };
    const elements = context.available?.filter((element) =>
      element.records?.some((record) => recordObservationIds(record)
        .some((id) => selected.has(id)))) ?? [];
    return elements.length > 0
      ? { ops: [{ op: 'emphasize', elements, mode: 'replace', dimOpacity: 0.22 }] }
      : { ops: [{ op: 'reset' }] };
  },
};

function buildDashboardCharts(
  snapshotYear: number,
  metric: DashboardMetric,
  trendDensity: TrendDensity,
): DashboardChart[] {
  const snapshotRows: Row[] = gapminderRows
    .filter((row) => row.Year === snapshotYear)
    .map((row) => ({
      ...row,
      'Population (M)': row.Population / 1_000_000,
      'Observation IDs': idsFor((candidate) => candidate.Country === row.Country),
    }));
  const continentRows: Row[] = [...new Set(gapminderRows.map((row) => row.Continent))].map((Continent) => {
    const snapshot = gapminderRows.filter((row) => row.Year === snapshotYear && row.Continent === Continent);
    return {
      Continent,
      'Population (M)': snapshot.reduce((sum, row) => sum + row.Population, 0) / 1_000_000,
      'Observation IDs': idsFor((row) => row.Continent === Continent),
    };
  });
  const trendRows = trendDensity === 'all'
    ? rows
    : rows.filter((row) => focusCountries.has(String(row.Country)));
  const metricTitle = metric === 'Life expectancy' ? 'Life expectancy' : 'Income per person';

  return [
    {
      id: 'countries',
      fixture: dashboardFixture(
        `dashboard-countries-${snapshotYear}`,
        `Health and wealth in ${snapshotYear}`,
        'Scatter Plot',
        { x: 'GDP per capita', y: 'Life expectancy', size: 'Population (M)', color: 'Continent', detail: 'Country' },
        snapshotRows,
        { logScale_x: true },
        { width: 430, height: 245 },
      ),
      interaction: select({ id: 'dashboard-country-select' }),
    },
    {
      id: 'continents',
      fixture: dashboardFixture(
        `dashboard-continents-${snapshotYear}`,
        `Population by continent, ${snapshotYear}`,
        'Bar Chart',
        { x: 'Population (M)', y: 'Continent' },
        continentRows,
        undefined,
        { width: 430, height: 245 },
      ),
      interaction: clickHighlight({ id: 'dashboard-continent-click' }),
    },
    {
      id: 'trends',
      fixture: dashboardFixture(
        `dashboard-trends-${metric}-${trendDensity}`,
        `${metricTitle} trajectories, 1952–2007`,
        'Line Chart',
        { x: 'Year label', y: metric, color: 'Country' },
        trendRows,
        { showPoints: trendDensity === 'focus', logScale_y: metric === 'GDP per capita' },
        { width: 430, height: 300 },
      ),
      interaction: clickHighlight({ id: 'dashboard-trend-click' }),
    },
    {
      id: 'history',
      fixture: dashboardFixture(
        `dashboard-history-${metric}`,
        `${metricTitle} by country and year`,
        'Heatmap',
        { x: 'Year label', y: 'Country', color: metric },
        rows,
      ),
      interaction: brushY({ id: 'dashboard-brush-y' }),
    },
  ];
}

function observationIds(elements: readonly SemanticElement[]): string[] {
  return [...new Set(elements.flatMap((element) =>
    element.records?.flatMap(recordObservationIds) ?? []))]
    .filter((id) => id !== 'undefined');
}

function DashboardPanel({
  chart,
  registerSurface,
  routeEvent,
}: {
  chart: DashboardChart;
  registerSurface: (id: string, surface: InteractiveChartSurface | null) => void;
  routeEvent: (detail: FlintInteractionEventDetail) => void;
}) {
  const interactions = useMemo(() => [chart.interaction, linkedFocus], [chart.interaction]);
  const handleSurface = useCallback(
    (surface: InteractiveChartSurface | null) => registerSurface(chart.id, surface),
    [chart.id, registerSurface],
  );

  return (
    <article className={`idash-panel idash-panel-${chart.id}`}>
      <InteractionDemoChart
        fixture={chart.fixture}
        interactions={interactions}
        chartId={`dashboard-${chart.id}`}
        onSurface={handleSurface}
        onSemanticEvent={routeEvent}
      />
    </article>
  );
}

export function InteractionDashboardLab() {
  const surfaces = useRef(new Map<string, InteractiveChartSurface>());
  const [selection, setSelection] = useState<DashboardSelection | null>(null);
  const [snapshotYear, setSnapshotYear] = useState(2007);
  const [metric, setMetric] = useState<DashboardMetric>('Life expectancy');
  const [trendDensity, setTrendDensity] = useState<TrendDensity>('focus');
  const deferredYear = useDeferredValue(snapshotYear);
  const deferredMetric = useDeferredValue(metric);
  const deferredTrendDensity = useDeferredValue(trendDensity);
  const dashboardCharts = useMemo(
    () => buildDashboardCharts(deferredYear, deferredMetric, deferredTrendDensity),
    [deferredMetric, deferredTrendDensity, deferredYear],
  );

  const registerSurface = useCallback((id: string, surface: InteractiveChartSurface | null) => {
    if (surface) surfaces.current.set(id, surface);
    else surfaces.current.delete(id);
  }, []);

  const dispatchSelection = useCallback((ids: string[], excludeId?: string) => {
    for (const [id, surface] of surfaces.current) {
      if (id === excludeId) continue;
      surface.dispatch({
        type: 'external',
        source: 'dashboard-link',
        phase: 'commit',
        payload: { observationIds: ids },
      });
    }
  }, []);

  const routeEvent = useCallback((detail: FlintInteractionEventDetail) => {
    if (detail.event.phase !== 'commit') return;
    const ids = observationIds(detail.event.target?.elements ?? []);
    const source = dashboardCharts.find((chart) => `dashboard-${chart.id}` === detail.chartId);
    dispatchSelection(ids, source?.id);
    setSelection(ids.length > 0 ? { ids } : null);
  }, [dispatchSelection]);

  const clearSelection = useCallback(() => {
    dispatchSelection([]);
    setSelection(null);
  }, [dispatchSelection]);

  const changeYear = useCallback((year: number) => {
    clearSelection();
    setSnapshotYear(year);
  }, [clearSelection]);

  const changeMetric = useCallback((nextMetric: DashboardMetric) => {
    clearSelection();
    setMetric(nextMetric);
  }, [clearSelection]);

  const changeTrendDensity = useCallback((density: TrendDensity) => {
    clearSelection();
    setTrendDensity(density);
  }, [clearSelection]);

  const activeIds = new Set(selection?.ids ?? rows.map((row) => String(row.Observation)));
  const activeRows = rows.filter((row) => activeIds.has(String(row.Observation)));
  const activeCountries = new Set(activeRows.map((row) => String(row.Country)));
  const activeYears = activeRows.map((row) => Number(row.Year));
  const averageMetric = activeRows.reduce((sum, row) => sum + Number(row[metric]), 0)
    / activeRows.length;
  const yearSpan = activeYears.length > 0
    ? `${Math.min(...activeYears)}–${Math.max(...activeYears)}`
    : '—';

  return (
    <div className="dev-page idash-page">
      <header className="idash-heading">
        <div>
          <h1>How health and wealth reshaped the world</h1>
          <p>Twenty countries across five continents and six decades of Gapminder observations.</p>
        </div>
        <div className="idash-status" aria-live="polite">
          <button type="button" onClick={clearSelection} disabled={!selection} title="Clear linked focus">
            <RotateCcw size={15} aria-hidden="true" />
            Reset view
          </button>
        </div>
      </header>

      <section className="idash-controls" aria-label="Dashboard controls">
        <label className="idash-year-control">
          <span>Snapshot year</span>
          <input
            type="range"
            min={0}
            max={years.length - 1}
            step={1}
            value={years.indexOf(snapshotYear)}
            onChange={(event) => changeYear(years[Number(event.target.value)])}
          />
          <strong>{snapshotYear}</strong>
        </label>
        <div className="idash-control-group">
          <span>Story metric</span>
          <div className="idash-segments" role="group" aria-label="Story metric">
            {(['Life expectancy', 'GDP per capita'] as DashboardMetric[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={metric === option}
                onClick={() => changeMetric(option)}
              >
                {option === 'GDP per capita' ? 'Income' : 'Life expectancy'}
              </button>
            ))}
          </div>
        </div>
        <div className="idash-control-group">
          <span>Trend lines</span>
          <div className="idash-segments" role="group" aria-label="Trend density">
            <button type="button" aria-pressed={trendDensity === 'focus'} onClick={() => changeTrendDensity('focus')}>
              Focus 12
            </button>
            <button type="button" aria-pressed={trendDensity === 'all'} onClick={() => changeTrendDensity('all')}>
              All 20
            </button>
          </div>
        </div>
      </section>

      <section className="idash-kpis" aria-label="Current selection summary">
        <div><span>Countries</span><strong>{activeCountries.size} of {countryCount}</strong></div>
        <div><span>Years in focus</span><strong>{yearSpan}</strong></div>
        <div>
          <span>Average {metric === 'Life expectancy' ? 'life expectancy' : 'income'}</span>
          <strong>{metric === 'Life expectancy' ? `${averageMetric.toFixed(1)} years` : `$${Math.round(averageMetric).toLocaleString()}`}</strong>
        </div>
        <div><span>Observations</span><strong>{activeRows.length} of {rows.length}</strong></div>
      </section>

      <div className="idash-chart-grid">
        {dashboardCharts.map((chart) => (
          <DashboardPanel
            key={chart.id}
            chart={chart}
            registerSurface={registerSurface}
            routeEvent={routeEvent}
          />
        ))}
      </div>
    </div>
  );
}
