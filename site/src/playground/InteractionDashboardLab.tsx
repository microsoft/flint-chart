import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type {
  FlintInteractionEventDetail,
  InteractionDef,
  InteractiveChartSurface,
  SemanticElement,
  UpdateTarget,
} from 'flint-chart/interactive';
import {
  brushY,
  clickGroupFocus,
  clickHighlight,
  externalInteraction,
  select,
} from 'flint-chart/interactive';
import { InteractionDemoChart } from './InteractionDemoChart';
import type { InteractionDemoFixture } from './interaction-demo-data';
import { gapminderRows, type GapminderRow } from './gapminder-dashboard-data';
import './interaction-dashboard-lab.css';

type Row = Record<string, unknown>;

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
const DASHBOARD_SELECTION_ID = 'dashboard-selection';
const DASHBOARD_LINKED_SELECTION_ID = 'dashboard-linked-selection';

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

const dashboardTheme = {
  extends: 'economist',
  ink: {
    series: {
      categoricalExtended: [
        '#006ba2', '#3ebcd2', '#ebb434', '#379a8b', '#9a3d5b', '#a17ba5',
        '#003f5c', '#d46b27', '#5f8f3b', '#c75146', '#d66aa5', '#74624f',
      ],
    },
  },
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
  baseSize = { width: 400, height: 230 },
): InteractionDemoFixture {
  return {
    id,
    title,
    source: 'Gapminder five-year data via Jenny Bryan / Plotly datasets',
    input: {
      data: { values },
      semantic_types: semanticTypes,
      theme_spec: dashboardTheme,
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

function buildDashboardCharts(
  snapshotYear: number,
  metric: DashboardMetric,
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
  const trendRows = rows.filter((row) => focusCountries.has(String(row.Country)));
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
        { width: 400, height: 230 },
      ),
      interaction: select({ id: DASHBOARD_SELECTION_ID, dimOpacity: 0.22 }),
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
        { width: 400, height: 230 },
      ),
      interaction: clickHighlight({
        id: DASHBOARD_SELECTION_ID,
        dimOpacity: 0.22,
        targets: ['mark'],
      }),
    },
    {
      id: 'trends',
      fixture: dashboardFixture(
        `dashboard-trends-${metric}`,
        `${metricTitle} trajectories, 1952–2007`,
        'Line Chart',
        { x: 'Year label', y: metric, color: 'Country' },
        trendRows,
        { showPoints: true, logScale_y: metric === 'GDP per capita' },
        { width: 400, height: 260 },
      ),
      interaction: clickGroupFocus({
        id: DASHBOARD_SELECTION_ID,
        groupBy: 'Country',
        dimOpacity: 0.22,
      }),
    },
    {
      id: 'history',
      fixture: dashboardFixture(
        `dashboard-history-${metric}`,
        `${metricTitle} by country and year`,
        'Heatmap',
        { x: 'Year label', y: 'Country', color: metric },
        rows,
        undefined,
        { width: 400, height: 260 },
      ),
      interaction: brushY({ id: DASHBOARD_SELECTION_ID, dimOpacity: 0.22 }),
    },
  ];
}

function observationIds(elements: readonly SemanticElement[]): string[] {
  return [...new Set(elements.flatMap((element) =>
    element.records?.flatMap(recordObservationIds) ?? []))]
    .filter((id) => id !== 'undefined');
}

function linkedTargets(chartId: string, observationIds: readonly string[]): UpdateTarget[] {
  const selected = new Set(observationIds);
  const selectedRows = gapminderRows.filter((row) => selected.has(row.Observation));
  const field = chartId === 'continents' ? 'Continent' : 'Country';
  const values = new Set(selectedRows.map((row) => row[field]));
  return [...values].map((value) => ({ select: { key: { [field]: value } } }));
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
  const interactions = useMemo(() => [
    chart.interaction,
    externalInteraction<{ observationIds: string[] }>({
      id: DASHBOARD_LINKED_SELECTION_ID,
      handle: ({ observationIds: ids }) => {
        const targets = linkedTargets(chart.id, ids);
        return {
          id: DASHBOARD_SELECTION_ID,
          ops: targets.length > 0
            ? [{
                op: 'set-style',
                targets,
                value: { state: 'emphasized', mutedOpacity: 0.22 },
              }]
            : [{ op: 'set-style', targets: [], value: { state: 'normal' } }],
        };
      },
    }),
  ], [chart.id, chart.interaction]);
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
  const deferredYear = useDeferredValue(snapshotYear);
  const deferredMetric = useDeferredValue(metric);
  const dashboardCharts = useMemo(
    () => buildDashboardCharts(deferredYear, deferredMetric),
    [deferredMetric, deferredYear],
  );

  const registerSurface = useCallback((id: string, surface: InteractiveChartSurface | null) => {
    if (surface) surfaces.current.set(id, surface);
    else surfaces.current.delete(id);
  }, []);

  const dispatchSelection = useCallback((ids: string[], excludeId?: string) => {
    for (const [id, surface] of surfaces.current) {
      if (id === excludeId) continue;
      void surface.dispatch(DASHBOARD_LINKED_SELECTION_ID, { observationIds: ids });
    }
  }, []);

  const routeEvent = useCallback((detail: FlintInteractionEventDetail) => {
    if (detail.event.phase !== 'commit') return;
    const ids = observationIds(detail.event.target?.elements ?? []);
    const source = dashboardCharts.find((chart) => `dashboard-${chart.id}` === detail.chartId);
    dispatchSelection(ids, source?.id);
    setSelection(ids.length > 0 ? { ids } : null);
  }, [dashboardCharts, dispatchSelection]);

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

      <section className="idash-summary" aria-label="Story controls and current selection summary">
        <label className="idash-summary-item idash-year-control">
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
        <div className="idash-summary-item idash-control-group">
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
        <div className="idash-summary-item"><span>Countries</span><strong>{activeCountries.size} of {countryCount}</strong></div>
        <div className="idash-summary-item"><span>Years in focus</span><strong>{yearSpan}</strong></div>
        <div className="idash-summary-item">
          <span>Average {metric === 'Life expectancy' ? 'life expectancy' : 'income'}</span>
          <strong>{metric === 'Life expectancy' ? `${averageMetric.toFixed(1)} years` : `$${Math.round(averageMetric).toLocaleString()}`}</strong>
        </div>
        <div className="idash-summary-item"><span>Observations</span><strong>{activeRows.length} of {rows.length}</strong></div>
      </section>

      <div className="idash-chart-grid">
        {dashboardCharts.slice(0, 2).map((chart) => (
          <DashboardPanel
            key={chart.id}
            chart={chart}
            registerSurface={registerSurface}
            routeEvent={routeEvent}
          />
        ))}
        {dashboardCharts.slice(2).map((chart) => (
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
