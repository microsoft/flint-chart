import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  brushX,
  clickHighlight,
  externalInteraction,
  type ChartChange,
  type InteractionDef,
  type UpdateTarget,
} from 'flint-chart/interactive';
import { FlintChart, type FlintChartHandle } from 'flint-chart/react';
import { expressionInterpreter } from 'vega-interpreter';
import epoch from '../../data/epoch-ai-models.json';

/*
 * Two charts on the notable AI models, each driving the other. A brush on the
 * release dates re-counts the bars; a click on an organization lights its
 * models on the scatter. Each chart reads the other through `onChange` and
 * writes to it through an external interaction, so a routed write carries no
 * interaction id and never routes back.
 *
 * Both charts colour by company. A nominal colour domain follows the data
 * order, and both tables list the companies in `COMPANIES` order (the scatter
 * by first appearance, the bars by construction), so one company has one
 * colour in both views.
 */

type ModelRow = typeof epoch.rows[number];

/** The company behind a model, with the labs and the joint credits folded into their parent. */
function companyOf(organization: string): string | undefined {
  const names = organization.split(',').map((name) => name.trim());
  if (names.some((name) => /^(Google|DeepMind)/.test(name))) return 'Google';
  if (names.some((name) => /^(Meta AI|Facebook)/.test(name))) return 'Meta';
  if (names.some((name) => /^OpenAI$/.test(name))) return 'OpenAI';
  if (names.some((name) => /^Microsoft/.test(name))) return 'Microsoft';
  if (names.some((name) => /^Nvidia$/.test(name))) return 'Nvidia';
  if (names.some((name) => /^DeepSeek$/.test(name))) return 'DeepSeek';
  if (names.some((name) => /^Alibaba$/.test(name))) return 'Alibaba';
  if (names.some((name) => /^Amazon$/.test(name))) return 'Amazon';
  if (names.some((name) => /^xAI$/.test(name))) return 'xAI';
  return undefined;
}

type Model = { Model: string; Company: string; Date: string; 'Training compute (FLOP)': number };
const MODELS: Model[] = epoch.rows.flatMap((row: ModelRow) => {
  const company = companyOf(row.Organization);
  const compute = row['Training compute (FLOP)'];
  return company && typeof compute === 'number' ? [{ Model: row.Model, Company: company, Date: row.Date, 'Training compute (FLOP)': compute }] : [];
});
const COMPANIES = [...new Set(MODELS.map((row) => row.Company))];

const SCATTER_ID = 'connected-models';
const BARS_ID = 'connected-companies';
const WINDOW_ID = 'window';
const COMPANY_ID = 'company';
const FROM_BARS = 'from-bars';
const FROM_SCATTER = 'from-scatter';
/** Flint's default palette, stated so the theme pipeline keeps it, plus no key where the axis already names the companies. */
const THEME: ChartAssemblyInput['theme_spec'] = {
  ink: { series: { categorical: ['#4c78a8', '#f58518', '#e45756', '#72b7b2', '#54a24b', '#eeca3b', '#b279a2', '#ff9da6', '#9d755d', '#bab0ac'] } },
  legend: { suppressWhenAxisNames: true },
};

const SCATTER_SPEC = {
  data: { values: MODELS },
  semantic_types: { Model: 'Category', Company: 'Category', Date: 'Date', 'Training compute (FLOP)': 'Quantity' },
  chart_spec: {
    chartType: 'Scatter Plot',
    title: 'Training compute of notable AI models',
    subtitle: `${MODELS.length} models from ${COMPANIES.length} companies, by release date`,
    encodings: { x: 'Date', y: 'Training compute (FLOP)', color: 'Company', detail: 'Model' },
    baseSize: { width: 470, height: 400 },
    chartProperties: { logScale_y: true },
  },
  theme_spec: { ...THEME, legend: { show: 'never' } },
} as ChartAssemblyInput;

/** One bar per company: the models among `models`, with every company kept so the bars never vanish. */
function countRows(models: readonly Model[]): Record<string, unknown>[] {
  const counts = new Map(COMPANIES.map((company) => [company, 0]));
  for (const row of models) counts.set(row.Company, (counts.get(row.Company) ?? 0) + 1);
  return [...counts].map(([Company, Models]) => ({ Company, Models }));
}

const BARS_SPEC = {
  data: { values: countRows(MODELS) },
  semantic_types: { Company: 'Category', Models: 'Count' },
  options: { defaultBandSize: 34, maxBandSize: 40 },
  chart_spec: {
    chartType: 'Bar Chart',
    title: 'Models per company',
    subtitle: 'In the brushed dates',
    encodings: { x: 'Models', y: { field: 'Company', sortBy: 'x', sortOrder: 'descending' }, color: 'Company' },
    baseSize: { width: 280, height: 400 },
    canvasSize: { width: 280, height: 400 },
  },
  theme_spec: THEME,
} as ChartAssemblyInput;

const SCATTER_INTERACTIONS: readonly InteractionDef[] = [
  brushX({ id: WINDOW_ID, dimOpacity: 0.25 }),
  externalInteraction<{ models: string[]; others: string[] }>({
    id: FROM_BARS,
    // The brush's own layer already mutes everything outside the window, so the
    // company layer lights its models and fades the rest of the window explicitly;
    // a second emphasis alone would merge into the brush's and change nothing.
    handle: ({ models, others }) => ({
      id: COMPANY_ID,
      ops: models.length > 0
        ? [
          { op: 'set-style', targets: models.map((model): UpdateTarget => ({ select: { key: { Model: model } } })), value: { state: 'emphasized' } },
          ...(others.length > 0
            ? [{ op: 'set-style' as const, targets: others.map((model): UpdateTarget => ({ select: { key: { Model: model } } })), value: { opacity: 0.25 } }]
            : []),
        ]
        : [{ op: 'set-style', targets: [], value: { state: 'normal' } }],
    }),
  }),
];

const BARS_INTERACTIONS: readonly InteractionDef[] = [
  clickHighlight({ id: COMPANY_ID, targets: ['mark'], dimOpacity: 0.3 }),
  externalInteraction<{ models: readonly Model[] }>({
    id: FROM_SCATTER,
    handle: ({ models }) => ({ id: WINDOW_ID, ops: [{ op: 'set-data', source: 'main', value: { rows: countRows(models) } }] }),
  }),
];

/** The model names a change's target names, read from each element's value. */
const modelsOf = (change: ChartChange): string[] =>
  [...new Set((change.target?.elements ?? []).map((element) => (element.value as { Model?: unknown })?.Model).filter((name): name is string => typeof name === 'string'))];

export function ConnectedModelsDemo() {
  const scatter = useRef<FlintChartHandle>(null);
  const bars = useRef<FlintChartHandle>(null);
  const [window, setWindow] = useState<readonly Model[] | null>(null);
  const [company, setCompany] = useState<string | null>(null);
  const windowRef = useRef<readonly Model[] | null>(null);
  const companyRef = useRef<string | null>(null);

  /** The models the scatter should light: the company's models, inside the window when one is set. */
  const lightCompany = useCallback((name: string | null) => {
    const pool = windowRef.current ?? MODELS;
    const models = name ? pool.filter((row) => row.Company === name).map((row) => row.Model) : [];
    const others = name ? pool.filter((row) => row.Company !== name).map((row) => row.Model) : [];
    void scatter.current?.dispatch(FROM_BARS, { models, others }).then((result) => {
      if (result && result.status !== 'applied') console.warn(`${SCATTER_ID}: ${result.status}`, result);
    });
  }, []);

  /** A reader's reset (click on the background, Escape) reports with no interaction and nothing selected. */
  const cleared = (change: ChartChange) => change.source === 'reader' && !change.interactionId && change.state.selected.length === 0;

  const onScatterChange = useCallback((change: ChartChange) => {
    if (change.phase !== 'commit' || (change.interactionId !== WINDOW_ID && !cleared(change))) return;
    const names = new Set(modelsOf(change));
    const inWindow = names.size > 0 ? MODELS.filter((row) => names.has(row.Model)) : null;
    windowRef.current = inWindow;
    setWindow(inWindow);
    void bars.current?.dispatch(FROM_SCATTER, { models: inWindow ?? MODELS }).then(async (result) => {
      if (result && result.status !== 'applied') console.warn(`${BARS_ID}: ${result.status}`, result);
      // The click's emphasis resolved to the old bars; after set-data the marks
      // are new, so the lit company is restated by key under the same layer.
      if (companyRef.current) {
        await bars.current?.applyUpdate({
          id: COMPANY_ID,
          ops: [{ op: 'set-style', targets: [{ select: { key: { Company: companyRef.current } } }], value: { state: 'emphasized' } }],
        });
      }
    });
    // A narrower window also narrows the lit company.
    if (companyRef.current) lightCompany(companyRef.current);
  }, [lightCompany]);

  const onBarsChange = useCallback((change: ChartChange) => {
    if (change.phase !== 'commit' || (change.interactionId !== COMPANY_ID && !cleared(change))) return;
    const value = change.target?.elements[0]?.value as { Company?: unknown } | undefined;
    const name = typeof value?.Company === 'string' ? value.Company : null;
    companyRef.current = name;
    setCompany(name);
    lightCompany(name);
  }, [lightCompany]);

  const status = useMemo(() => {
    const scope = window ? `${window.length} of ${MODELS.length} models in the brushed dates` : `All ${MODELS.length} models`;
    const lit = company ? `; ${company} lit on the scatter` : '';
    return `${scope}${lit}. Drag across the dates to brush; click a bar to light a company; click the background to clear.`;
  }, [company, window]);

  return <div className="app-demo-stack">
    <p className="it-detail-note app-demo-year-note">{status}</p>
    <div className="app-demo-pair">
      <div className="app-demo-box app-demo-stack-chart">
        <FlintChart
          ref={scatter}
          spec={SCATTER_SPEC}
          interactions={SCATTER_INTERACTIONS}
          chartId={SCATTER_ID}
          ariaLabel="Training compute of notable AI models"
          renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%"
          onChange={onScatterChange}
        />
      </div>
      <div className="app-demo-box app-demo-stack-chart">
        <FlintChart
          ref={bars}
          spec={BARS_SPEC}
          interactions={BARS_INTERACTIONS}
          chartId={BARS_ID}
          ariaLabel="Models per company"
          renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%"
          onChange={onBarsChange}
        />
      </div>
    </div>
  </div>;
}
