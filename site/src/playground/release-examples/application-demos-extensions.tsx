import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import { FlintAppInner } from '../../../../packages/flint-mcp/ui/src/FlintApp';
import mcpStyles from '../../../../packages/flint-mcp/ui/src/styles.css?inline';
import { gapminderRows } from '../gapminder-dashboard-data';
import { salesFixture } from '../interaction-demo-data';
import { DemoColumns, EmptyPanel } from './application-demos-layout';
import '../bespoke-interaction-lab.css';

const SCOPE = 'app-demo-mcp';

/** The MCP view's stylesheet, scoped to the mount so it does not restyle the site, for as long as the view is on screen. */
function useMcpStyles() {
  useEffect(() => {
    const style = document.createElement('style');
    style.dataset.appDemo = SCOPE;
    style.textContent = mcpStyles
      .replace(/:root\b/g, `.${SCOPE}`)
      .replace(/html,\s*body\s*\{/g, `.${SCOPE} {`);
    document.head.append(style);
    return () => style.remove();
  }, []);
}

type ModelContext = { content: { type: string; text: string }[] };

function useMockApp(onContext?: (text: string) => void) {
  return useMemo(() => ({
    sendMessage: async () => undefined,
    updateModelContext: async ({ content }: ModelContext) => {
      onContext?.(content.map((part) => part.text).join('\n'));
    },
    getHostCapabilities: () => ({}),
    downloadFile: async () => ({}),
  }), [onContext]);
}

function McpView({ input, onContext }: { input: ChartAssemblyInput; onContext?: (text: string) => void }) {
  useMcpStyles();
  const app = useMockApp(onContext);
  return <div className={`${SCOPE} app-demo-mcp-frame`}>
    <FlintAppInner app={app as never} input={input} />
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
  name: 'create_chart_view',
  arguments: {
    interaction_spec: MCP_CHART_INPUT.interaction_spec,
    chart_spec: MCP_CHART_INPUT.chart_spec,
    semantic_types: MCP_CHART_INPUT.semantic_types,
    data: { values: [HEALTH_ROWS[0], `… ${HEALTH_ROWS.length - 1} more rows`] },
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
