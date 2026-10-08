import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  filterControls, legendToggle,
  type ChartChange, type FilterControlsOptions, type FilterValue, type InteractionDef,
} from 'flint-chart/interactive';
import { FlintChart, type FlintChartHandle } from 'flint-chart/react';
import { Braces, ChevronDown, ChevronRight } from 'lucide-react';
import { CodeBlock } from '../components/CodeBlock';
import { LocaleLink } from '../i18n/LocaleLink';
import epoch from '../data/epoch-ai-models.json';
import worldCup from '../data/world-cup-2026.json';
import election from '../data/election-2024.json';
import timeUse from '../data/time-use-companions.json';
import foodPrices from '../data/cpi-food-prices.json';
import pisa from '../data/pisa-oecd23-trends.json';
import { gapminderRows } from './gapminder-dashboard-data';
import './click-focus-lab.css';

const SIZE = { width: 350, height: 240 };
/** Narrower, so a chart with a legend still fits a half-width card. */
const LEGEND_SIZE = { width: 280, height: 240 };

const GAPMINDER = gapminderRows.map(({ Country, Continent, Year, Population, 'Life expectancy': life, 'GDP per capita': gdp }) => ({
  Country, Continent, Year, Population, 'Life expectancy': life, 'GDP per capita': gdp,
}));
const GAPMINDER_TYPES = {
  Country: 'Country', Continent: 'Region', Year: 'Year', Population: 'Count', 'Life expectancy': 'Quantity', 'GDP per capita': 'Amount',
};
const gapminderSpec = (title: string): ChartAssemblyInput => ({
  data: { values: GAPMINDER },
  semantic_types: GAPMINDER_TYPES,
  chart_spec: {
    chartType: 'Scatter Plot', title,
    encodings: { x: 'GDP per capita', y: 'Life expectancy', color: 'Continent', detail: 'Country' },
    baseSize: LEGEND_SIZE,
    chartProperties: { logScale_x: true },
  },
});

const MODELS = epoch.rows.map(({ Model, Organization, Domain, Parameters, 'Training cost (2023 USD)': cost, 'Open weights': open }) => ({
  Model, Organization, Domain, Parameters, 'Training cost (2023 USD)': cost, 'Open weights': open,
}));

const TEAMS = worldCup.teams.map(({ team, confed, goals }) => ({ Team: team, Confederation: confed, Goals: goals }));

const STATES = election.states.map(({ stateName, margin, total }) => ({ State: stateName, Margin: margin, 'Total votes': total }));

const FOOD = foodPrices.values.map(({ month, item, price }) => ({ Month: month, Item: item, Price: price }));

interface FilterCase {
  id: string;
  title: string;
  /** What the chart shows and what its filters add. */
  description: string;
  spec: ChartAssemblyInput;
  /** Factory options; absent when the spec carries the preset. */
  options?: FilterControlsOptions;
  extra?: () => InteractionDef[];
  code: string;
}

const cases: readonly FilterCase[] = [
  {
    id: 'gapminder-year',
    title: 'Gapminder: one year at a time',
    description: 'Twenty countries from 1952 to 2007. Each country has a point per year, so Year is a slider without All: drag it, or use the arrow keys, one year at a time. Continent is on the legend, which toggles it, so it gets no control.',
    spec: gapminderSpec('Life expectancy and GDP per capita'),
    options: { fields: [{ field: 'Year', widget: 'select' }], initial: { Year: { in: [2007] } } },
    extra: () => [legendToggle()],
    code: `<FlintChart spec={spec} interactions={[
  legendToggle(),
  filterControls({
    fields: [{ field: 'Year', widget: 'select' }],
    initial: { Year: { in: [2007] } },
  }),
]} />`,
  },
  {
    id: 'gapminder-highlight',
    title: 'Gapminder: the other years as context',
    description: 'The same data in highlight mode: every year stays drawn and the chosen one stands out, so each country\'s path shows behind it.',
    spec: gapminderSpec('Life expectancy and GDP per capita'),
    options: { mode: 'highlight', fields: [{ field: 'Year', widget: 'select' }], initial: { Year: { in: [2007] } } },
    code: `filterControls({
  mode: 'highlight',
  fields: [{ field: 'Year', widget: 'select' }],
  initial: { Year: { in: [2007] } },
})`,
  },
  {
    id: 'epoch-models',
    title: 'Notable AI models by attribute',
    description: `${MODELS.length} models by parameters and training cost (Epoch AI). Domain, organization, and open weights are not on the chart. Domain and organization have too many values to show, so each opens a searchable list; open weights is a row of buttons.`,
    spec: {
      data: { values: MODELS },
      semantic_types: { Model: 'Category', Organization: 'Category', Domain: 'Category', 'Open weights': 'Category', Parameters: 'Quantity', 'Training cost (2023 USD)': 'Amount' },
      chart_spec: {
        chartType: 'Scatter Plot', title: 'Parameters and training cost',
        encodings: { x: 'Parameters', y: 'Training cost (2023 USD)', detail: 'Model' },
        baseSize: SIZE,
        chartProperties: { logScale_x: true, logScale_y: true },
      },
    },
    options: { fields: ['Domain', 'Organization', 'Open weights'] },
    code: `filterControls({ fields: ['Domain', 'Organization', 'Open weights'] })`,
  },
  {
    id: 'world-cup',
    title: '2026 World Cup goals by team',
    description: '48 teams, more than fit, so the rail scrolls the ranking. Confederation is not on the chart; picking one leaves fewer teams to scroll, and the rail goes once they all fit. Declared in interaction_spec.',
    spec: {
      data: { values: TEAMS },
      semantic_types: { Team: 'Country', Confederation: 'Category', Goals: 'Count' },
      chart_spec: {
        chartType: 'Bar Chart', title: 'Goals by team',
        encodings: { x: 'Goals', y: { field: 'Team', sortBy: 'x', sortOrder: 'descending' } },
        baseSize: SIZE,
      },
      interaction_spec: {
        interactions: [
          { type: 'click-highlight' },
          { type: 'filter-controls', options: { fields: ['Confederation'] } },
        ],
      },
    } as ChartAssemblyInput,
    code: `"interaction_spec": {
  "interactions": [
    { "type": "click-highlight" },
    { "type": "filter-controls", "options": { "fields": ["Confederation"] } }
  ]
}`,
  },
  {
    id: 'election',
    title: '2024 presidential margin by state',
    description: '50 states and DC, scrolled by the rail. Total votes is not on the chart; narrowing its range drops states from the ranking and shortens what the rail scrolls.',
    spec: {
      data: { values: STATES },
      semantic_types: { State: 'State', Margin: 'Number', 'Total votes': 'Count' },
      chart_spec: {
        chartType: 'Bar Chart', title: 'Trump minus Harris, points',
        encodings: { x: 'Margin', y: { field: 'State', sortBy: 'x', sortOrder: 'descending' } },
        baseSize: SIZE,
      },
    },
    options: { fields: [{ field: 'Total votes', widget: 'range' }] },
    code: `filterControls({ fields: [{ field: 'Total votes', widget: 'range' }] })`,
  },
  {
    id: 'time-use',
    title: 'Who Americans spend time with, by age',
    description: 'American Time Use Survey. Each line has a value per group (all people, men, women), so Group is a segmented control without All: one group at a time. placement: top puts it above the chart.',
    spec: {
      data: { values: timeUse.values },
      semantic_types: { Group: 'Category', Age: 'Quantity', Who: 'Category', Hours: 'Quantity' },
      chart_spec: {
        chartType: 'Line Chart', title: 'Hours a day, by companion',
        encodings: { x: 'Age', y: 'Hours', color: 'Who' },
        baseSize: LEGEND_SIZE,
      },
    },
    options: { placement: 'top', fields: [{ field: 'Group', widget: 'select' }], initial: { Group: { in: ['All people'] } } },
    code: `filterControls({
  placement: 'top',
  fields: [{ field: 'Group', widget: 'select' }],
  initial: { Group: { in: ['All people'] } },
})`,
  },
  {
    id: 'food-prices',
    title: 'US food prices, a small embed',
    description: 'Monthly average prices (BLS) in a small chart. Month is a range slider under it; Item is on the legend, which toggles it, so it gets no control.',
    spec: {
      data: { values: FOOD },
      semantic_types: { Month: 'Date', Item: 'Category', Price: 'Price' },
      chart_spec: {
        chartType: 'Line Chart', title: 'Average price, USD',
        encodings: { x: 'Month', y: 'Price', color: 'Item' },
        baseSize: { width: 230, height: 240 },
      },
    },
    options: { fields: ['Month'] },
    extra: () => [legendToggle()],
    code: `<FlintChart spec={spec} interactions={[
  legendToggle(),
  filterControls({ fields: ['Month'] }),
]} />`,
  },
  {
    id: 'pisa',
    title: 'PISA scores by subject',
    description: 'OECD average scores since 2000. Each subject is its own line; a click on a button adds or removes it, and All brings every subject back.',
    spec: {
      data: { values: pisa.average },
      semantic_types: { Year: 'Year', Subject: 'Category', Score: 'Score' },
      chart_spec: {
        chartType: 'Line Chart', title: 'Average PISA score',
        encodings: { x: 'Year', y: 'Score', color: 'Subject' },
        baseSize: LEGEND_SIZE,
      },
    },
    options: { fields: ['Subject'] },
    code: `filterControls({ fields: ['Subject'] })`,
  },
];

function describeFilters(filters: Readonly<Record<string, FilterValue>> | undefined): string[] {
  return Object.entries(filters ?? {}).map(([field, value]) => 'in' in value
    ? `${field} ∈ [${value.in.map(String).join(', ')}]`
    : `${field} ∈ ${String(value.range[0])}–${String(value.range[1])}`);
}

function FilterCaseCard({ item, themeId }: { item: FilterCase; themeId?: string }) {
  const chart = useRef<FlintChartHandle>(null);
  const [filters, setFilters] = useState<Readonly<Record<string, FilterValue>> | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const spec = useMemo<ChartAssemblyInput>(() => (themeId ? { ...item.spec, theme_spec: themeId } as ChartAssemblyInput : item.spec), [item.spec, themeId]);
  const interactions = useCallback((fromSpec: readonly InteractionDef[]) => [
    ...fromSpec,
    ...(item.extra?.() ?? []),
    ...(item.options ? [filterControls(item.options)] : []),
  ], [item]);
  const onChange = useCallback((change: ChartChange) => setFilters(change.state.filters), []);
  const onRender = useCallback(() => setFilters(chart.current?.getState()?.filters), []);
  const onError = useCallback((err: Error) => setError(err.message), []);
  const active = describeFilters(filters);

  const host: ReactNode = <FlintChart ref={chart} spec={spec} interactions={interactions}
    onChange={onChange} onRender={onRender} onError={onError} ariaLabel={item.title} />;
  return (
    <article className="cf-probe fc-probe" data-filter-case={item.id}>
      <header className="cf-probe-header">
        <div>
          <h2>{item.title}</h2>
          <p>{item.description}</p>
        </div>
      </header>
      <div className="cf-stage">
        {error ? <pre className="fc-error">{error}</pre> : host}
      </div>
      <div className={`cf-spec-panel${codeOpen ? ' cf-spec-panel-open' : ''}`}>
        <div className="cf-spec-panel-bar">
          <button type="button" className="cf-spec-panel-toggle" aria-expanded={codeOpen} onClick={() => setCodeOpen(open => !open)}>
            {codeOpen ? <ChevronDown size={12} strokeWidth={2} aria-hidden="true" /> : <ChevronRight size={12} strokeWidth={2} aria-hidden="true" />}
            <Braces size={12} strokeWidth={2} aria-hidden="true" />
            {item.code.trim().startsWith('"') ? 'interaction_spec' : 'code'}
          </button>
        </div>
        {codeOpen && <CodeBlock variant="light" language={item.code.trim().startsWith('"') ? 'json' : 'tsx'}
          customStyle={{ margin: 0, padding: 8, fontSize: 10.5, lineHeight: 1.35 }}>{item.code}</CodeBlock>}
      </div>
      <footer className={`cf-probe-event ${active.length > 0 ? 'cf-probe-event-resolved' : 'cf-probe-event-warning'}`}>
        <div className="cf-probe-result-row">
          <strong className="cf-probe-result-label">Filters:</strong>
          <div className="cf-probe-event-summary" data-filter-state>
            {active.length > 0 ? active.map(line => <span key={line}>{line}</span>) : <span>None. Use the controls to filter.</span>}
          </div>
        </div>
      </footer>
    </article>
  );
}

const SPEC_PATTERN = `{
  "interaction_spec": {
    "interactions": [
      {
        "type": "filter-controls",
        "options": { "fields": ["Continent", "Year"], "placement": "auto" }
      }
    ]
  }
}`;

const FUNCTIONAL_PATTERN = `import { FlintChart } from 'flint-chart/react';
import { filterControls } from 'flint-chart/interactive';

<FlintChart
  spec={spec}
  interactions={[filterControls({ fields: ['Continent', 'Year'] })]}
  onChange={(change) => console.log(change.state.filters)}
/>`;

const behaviors: readonly { trigger: string; content: string }[] = [
  { trigger: 'Click', content: 'a button to add or remove a value; a field that holds one value at a time switches instead. Fields with many values open a searchable list.' },
  { trigger: 'Drag', content: 'a slider: two thumbs for a range of numbers or dates, one to step through years or months.' },
  { trigger: 'Toggle', content: 'a switch to keep only the rows where a boolean field is true.' },
  { trigger: 'Filter', content: 'mode removes the other rows and rescales; highlight mode mutes them instead.' },
  { trigger: 'Placement', content: 'auto and bottom put one row per field under the chart, top puts them above it; a chart under 280px wide puts each label above its control.' },
];

/** Test cases for the `filter-controls` preset, laid out like the other preset pages. */
export function FilterControlsGallery({ themeId }: { themeId?: string }) {
  const [source, setSource] = useState<'spec' | 'code'>('spec');
  return (
    <div className="dev-page cf-page fc-page">
      <header className="dev-page-heading cf-heading cf-heading-with-code">
        <div>
          <div className="cf-heading-title"><h2>Filter controls</h2></div>
          <section className="cf-interaction-detail cf-preset-description" aria-label="Available interactions">
            <ul>{behaviors.map(({ trigger, content }) => <li key={trigger}><strong>{trigger}</strong> {content}</li>)}</ul>
          </section>
          <section className="cf-interaction-detail cf-emitted-events" aria-label="Chart state">
            <div className="cf-emitted-events-heading"><h2>Chart state</h2></div>
            <ul>
              <li><code>state.filters</code> holds the active filter per field, reported through <code>onChange</code> on every commit.</li>
            </ul>
            <p className="cf-events-doc-link">See <LocaleLink to="/documentation/interaction-api" className="site-text-link">Interaction API</LocaleLink> for the preset options.</p>
          </section>
        </div>
        <section className="cf-preset-code" aria-label="Preset code">
          <div className="cf-preset-code-toolbar">
            <div className="cf-source-toggle" role="group" aria-label="Interaction source">
              {(['spec', 'code'] as const).map(value => <button key={value} type="button"
                aria-pressed={source === value} onClick={() => setSource(value)}>
                {value === 'spec' ? 'Spec (JSON)' : 'Functional'}
              </button>)}
            </div>
          </div>
          <div className="cf-gallery-spec">
            <CodeBlock variant="light" language={source === 'spec' ? 'json' : 'typescript'}
              customStyle={{ margin: 0, padding: 8, fontSize: 10.5, lineHeight: 1.35, maxHeight: 200, overflow: 'auto' }}>
              {source === 'spec' ? SPEC_PATTERN : FUNCTIONAL_PATTERN}
            </CodeBlock>
          </div>
        </section>
      </header>
      <div className="cf-grid">
        {cases.map(item => <FilterCaseCard key={item.id} item={item} themeId={themeId} />)}
      </div>
    </div>
  );
}
