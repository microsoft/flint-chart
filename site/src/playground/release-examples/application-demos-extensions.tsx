import { useState, type ReactNode } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import { ChartView, shownChart } from '../../../../packages/flint-mcp/ui/src/ChartView';
import { useHostPage, useMcpStyles, useMockApp } from '../../components/mcp-embed';
import { gapminderRows } from '../gapminder-dashboard-data';
import { salesFixture } from '../interaction-demo-data';
import { DemoColumns, EmptyPanel } from './application-demos-layout';
import '../bespoke-interaction-lab.css';

const SCOPE = 'app-demo-mcp';

function McpView({ input, onContext }: { input: ChartAssemblyInput; onContext?: (text: string) => void }) {
  useMcpStyles(SCOPE);
  useHostPage();
  const app = useMockApp(onContext);
  return <div className={`${SCOPE} app-demo-mcp-frame`}>
    <ChartView app={app as never} shown={shownChart(input)} />
  </div>;
}

const HEALTH_ROWS = gapminderRows
  .filter((row) => row.Year === 2007)
  .map(({ Country, Continent, Population, 'Life expectancy': life, 'GDP per capita': gdp }) => ({
    Country, Continent, 'GDP per capita': gdp, 'Life expectancy': life, Population,
  }));

const MCP_CHART_INPUT: ChartAssemblyInput = {
  data: { values: HEALTH_ROWS },
  semantic_types: {
    Country: 'Country',
    Continent: 'Category',
    'GDP per capita': 'Amount',
    'Life expectancy': 'Quantity',
    Population: 'Count',
  },
  chart_spec: {
    chartType: 'Scatter Plot',
    title: 'Health and wealth, 2007',
    encodings: { x: 'GDP per capita', y: 'Life expectancy', color: 'Continent', size: 'Population', detail: 'Country' },
  },
  interaction_spec: {
    interactions: [
      { type: 'click-highlight', options: { targets: ['mark', 'legend'] } },
      { type: 'navigate', options: { axes: 'xy' } },
    ],
  },
} as ChartAssemblyInput;

const MCP_CHART_CALL = JSON.stringify({
  name: 'show',
  arguments: {
    chart: {
      interaction_spec: MCP_CHART_INPUT.interaction_spec,
      chart_spec: MCP_CHART_INPUT.chart_spec,
      semantic_types: MCP_CHART_INPUT.semantic_types,
      data: { values: [HEALTH_ROWS[0], `… ${HEALTH_ROWS.length - 1} more rows`] },
    },
  },
}, null, 2);

export function McpChartDemo() {
  return <DemoColumns
    chart={<McpView input={MCP_CHART_INPUT} />}
    panel={<pre className="app-demo-code">{MCP_CHART_CALL}</pre>}
    panelTitle="Tool call"
  />;
}

const MCP_CONTEXT_INPUT: ChartAssemblyInput = {
  ...salesFixture.input,
  interaction_spec: {
    interactions: [
      { type: 'click-highlight', options: { targets: ['mark', 'discreteAxis'] } },
      { type: 'legend-toggle' },
    ],
  },
} as ChartAssemblyInput;

export function McpContextDemo() {
  const [context, setContext] = useState<string | null>(null);
  return <DemoColumns
    chart={<McpView input={MCP_CONTEXT_INPUT} onContext={setContext} />}
    panel={context
      ? <pre className="app-demo-code">{context}</pre>
      : <EmptyPanel>Click a bar or a region, or hide a segment in the legend. The model receives the chart state after each change.</EmptyPanel>}
    panelTitle="Model context"
  />;
}

export function BespokeFrame({ children }: { children: ReactNode }) {
  return <div className="bespoke-case bespoke-case--single app-demo-bespoke">{children}</div>;
}
