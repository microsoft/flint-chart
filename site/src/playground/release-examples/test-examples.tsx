import type { ChartAssemblyInput } from 'flint-chart';
import type { InteractionDef } from 'flint-chart/interactive';
import epoch from '../../data/epoch-ai-models.json';
import pisa from '../../data/pisa-oecd23-trends.json';
import { InteractionDemoChart } from '../InteractionDemoChart';
import { PisaDrawStage } from '../PisaDrawStage';
import type { InteractionDemoFixture } from '../interaction-demo-data';
import '../axis-label-lab.css';
import '../interaction-transport.css';
import './application-demos.css';

const MODELS_FIXTURE: InteractionDemoFixture = {
  id: 'epoch-ai-models',
  title: 'Parameters and training cost of notable AI models',
  source: epoch.source,
  input: {
    data: { values: epoch.rows },
    semantic_types: {
      Model: 'Category',
      Organization: 'Category',
      Domain: 'Category',
      Year: 'Year',
      Parameters: 'Quantity',
      'Training cost (2023 USD)': 'Amount',
    },
    chart_spec: {
      chartType: 'Scatter Plot',
      title: 'Parameters and training cost of notable AI models',
      subtitle: `${epoch.rows.length} models with both estimates, 2012 to 2026`,
      encodings: { x: 'Parameters', y: 'Training cost (2023 USD)', color: 'Domain', detail: 'Model' },
      baseSize: { width: 820, height: 520 },
      chartProperties: { logScale_x: true, logScale_y: true },
    },
    interaction_spec: {
      interactions: [
        { type: 'inspect', id: 'inspect' },
        { type: 'legend-toggle', id: 'legend' },
      ],
    },
  } as ChartAssemblyInput,
};

const NO_INTERACTIONS: readonly InteractionDef[] = [];

const PISA_INK = {
  Science: '#5b8fd6',
  Mathematics: '#f2a89b',
  Reading: '#e3120b',
} as const;

export function TestExamples() {
  return <section className="axis-label-lab">
    <header className="axis-label-heading"><h1>Test examples</h1></header>
    <section className="axis-label-compact app-demo-section" id="epoch-ai-models" aria-labelledby="epoch-ai-models-heading">
      <h2 id="epoch-ai-models-heading">AI models: parameters and training cost</h2>
      <p className="axis-label-source">{epoch.source}. Hover a point to inspect a model; click a legend entry to hide a domain.</p>
      <div className="app-demo-full">
        <InteractionDemoChart fixture={MODELS_FIXTURE} interactions={NO_INTERACTIONS} chartId="epoch-ai-models" />
      </div>
    </section>
    <section className="axis-label-compact app-demo-section" id="pisa-you-draw-it" aria-labelledby="pisa-you-draw-it-heading">
      <h2 id="pisa-you-draw-it-heading">You draw it: PISA scores after 2012</h2>
      <p className="axis-label-source">{pisa.meta.source} Pick a subject, draw its line to 2025; the real lines appear once all three are drawn.</p>
      <div className="app-demo-full">
        <PisaDrawStage theme="economist" ink={PISA_INK} />
      </div>
    </section>
  </section>;
}
