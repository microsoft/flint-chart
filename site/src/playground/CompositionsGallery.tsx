import { useMemo, useState } from 'react';
import type { ChartAssemblyInput, InteractionSpec } from 'flint-chart';
import { FlintChart } from 'flint-chart/react';
import stringify from 'json-stringify-pretty-compact';
import { CodeBlock } from '../components/CodeBlock';
import { ScaleToFit } from '../components/ScaleToFit';
import { LocaleLink } from '../i18n/LocaleLink';
import { flintChartCode, presetFactoryName } from '../shared/flint-chart-code';
import { gapminderRows, interactionCases } from './ClickFocusLab';
import { navigationDemoCases } from './navigation-demo-data';
import './click-focus-lab.css';

interface CompositionCase {
  id: string;
  title: string;
  /** The question the pair answers that neither preset answers alone. */
  question: string;
  behaviors: readonly { trigger: string; content: string }[];
  input: ChartAssemblyInput;
  spec: InteractionSpec;
}

const caseInput = (id: string): ChartAssemblyInput => {
  const found = interactionCases.find((item) => item.id === id) ?? navigationDemoCases.find((item) => item.id === id);
  if (!found) throw new Error(`Missing composition case ${id}`);
  return found.input;
};

const cases: CompositionCase[] = [
  {
    id: 'read-what-you-keep',
    title: 'Hide series, read the rest',
    question: 'What do the series I care about read at this month?',
    behaviors: [
      { trigger: 'Click', content: 'a legend item to hide or restore its food.' },
      { trigger: 'Move', content: 'along the time axis to read every visible food at that month.' },
    ],
    input: caseInput('inspect-index-line-multi'),
    spec: { interactions: [{ type: 'legend-toggle' }, { type: 'inspect-index' }] },
  },
  {
    id: 'preview-then-commit',
    title: 'Preview on hover, keep on click',
    question: 'Where is this country in the other year, and can I keep it in view?',
    behaviors: [
      { trigger: 'Hover', content: 'a country to preview it in both years.' },
      { trigger: 'Click', content: 'it to keep it highlighted while you move on; click empty space to clear.' },
    ],
    input: caseInput('Scatter Plot-Gapminder-faceted-years'),
    spec: {
      interactions: [
        { type: 'hover-group-focus', options: { groupBy: 'Country' } },
        { type: 'click-group-focus', options: { groupBy: 'Country' } },
      ],
    },
  },
  {
    id: 'zoom-and-read',
    title: 'Zoom in, then read',
    question: 'What happened in this week, day by day?',
    behaviors: [
      { trigger: 'Scroll', content: 'or pinch to zoom the time axis, and drag to pan; double-click to return.' },
      { trigger: 'Move', content: 'along the axis to read the day under the pointer.' },
    ],
    input: caseInput('navigate-electricity-demand'),
    spec: { interactions: [{ type: 'navigate', options: { axes: 'x' } }, { type: 'inspect-index' }] },
  },
  {
    id: 'brush-and-wheel',
    title: 'Brush a period, zoom around it',
    question: 'Which hours fall in this episode, seen closer?',
    behaviors: [
      { trigger: 'Drag', content: 'across the plot to select a period; drag it or its edges to adjust it.' },
      { trigger: 'Scroll', content: 'to zoom the time axis around the pointer. Drag stays with the brush, so there is no pan.' },
    ],
    input: caseInput('navigate-air-quality'),
    spec: {
      interactions: [
        { type: 'brush-x', options: { mode: 'stateful' } },
        { type: 'navigate', options: { axes: 'x', pan: false } },
      ],
    },
  },
  {
    id: 'hide-then-lasso',
    title: 'Hide a group, select the rest',
    question: 'Which of the remaining penguins form this cluster?',
    behaviors: [
      { trigger: 'Click', content: 'a species in the legend to hide it or bring it back.' },
      { trigger: 'Draw', content: 'around the points that remain to select them.' },
    ],
    input: caseInput('Scatter Plot-Palmer Penguins — flipper length vs body mass'),
    spec: { interactions: [{ type: 'legend-toggle' }, { type: 'lasso-select' }] },
  },
  {
    id: 'filter-then-focus',
    title: 'Filter, then select',
    question: 'In this year, which countries sit in this corner?',
    behaviors: [
      { trigger: 'Pick', content: 'a year under the chart; the chart shows only that year and rescales.' },
      { trigger: 'Drag', content: 'a rectangle to select the countries inside it; picking another year clears the selection.' },
    ],
    input: {
      data: { values: gapminderRows },
      semantic_types: { Country: 'Country', Continent: 'Category', Year: 'Year', 'GDP per capita': 'Quantity', 'Life expectancy': 'Quantity' },
      chart_spec: {
        chartType: 'Scatter Plot',
        title: 'Gapminder: income and life expectancy',
        encodings: { x: 'GDP per capita', y: 'Life expectancy', color: 'Continent', detail: 'Country' },
        chartProperties: { logScale_x: true },
        baseSize: { width: 380, height: 260 },
      },
    } as ChartAssemblyInput,
    spec: {
      interactions: [
        { type: 'filter-controls', options: { fields: ['Year'], initial: { Year: { in: [2007] } } } },
        { type: 'select' },
      ],
    },
  },
  {
    id: 'brush-zoom-and-read',
    title: 'Drag to zoom, read inside',
    question: 'What is in this stretch, value by value?',
    behaviors: [
      { trigger: 'Drag', content: 'a box to zoom into it; double-click or press Escape to return.' },
      { trigger: 'Move', content: 'along the axis to read the day under the pointer.' },
    ],
    input: caseInput('navigate-electricity-demand'),
    spec: { interactions: [{ type: 'brush-zoom', options: { axes: 'x' } }, { type: 'inspect-index' }] },
  },
  {
    id: 'keyboard-focus',
    title: 'Click or use the keyboard',
    question: 'Can a keyboard reader pick the same mark a mouse reader clicks?',
    behaviors: [
      { trigger: 'Click', content: 'a bar to highlight it.' },
      { trigger: 'Tab', content: 'to the chart, move between bars with the arrow keys, and press Enter to highlight one.' },
    ],
    input: caseInput('Bar Chart-Most populous countries, 2023 (millions)'),
    spec: { interactions: [{ type: 'click-highlight', options: { targets: ['mark'] } }], keyboardTargeting: true },
  },
];

function CompositionRow({ item, themeId }: { item: CompositionCase; themeId?: string }) {
  const [source, setSource] = useState<'spec' | 'code'>('spec');
  const spec = useMemo<ChartAssemblyInput>(() => ({
    ...item.input,
    ...(themeId ? { theme_spec: themeId } : {}),
    interaction_spec: item.spec,
  }) as ChartAssemblyInput, [item, themeId]);
  const code = source === 'spec'
    ? stringify({ interaction_spec: item.spec }, { maxLength: 64 })
    : flintChartCode({
      presets: item.spec.interactions.map((entry) => ({
        factory: presetFactoryName(entry.type),
        options: entry.options ? stringify(entry.options, { maxLength: 56 }) : '',
      })),
      keyboardTargeting: item.spec.keyboardTargeting,
    });
  return (
    <section className="cmp-case" aria-labelledby={`cmp-${item.id}`}>
      <div className="cf-probe cmp-chart">
        <div className="cf-stage">
          <ScaleToFit height={380} minHeight={260} adaptiveHeight padding={8}>
            <FlintChart spec={spec} renderer="svg" ariaLabel={item.title} />
          </ScaleToFit>
        </div>
      </div>
      <div className="cmp-detail">
        <h3 id={`cmp-${item.id}`}>{item.title}</h3>
        <p className="cmp-question">{item.question}</p>
        <ul>{item.behaviors.map(({ trigger, content }) => <li key={trigger}><strong>{trigger}</strong> {content}</li>)}</ul>
        <div className="cf-preset-code-toolbar">
          <div className="cf-source-toggle" role="group" aria-label="Interaction source">
            {(['spec', 'code'] as const).map((value) => <button key={value} type="button"
              aria-pressed={source === value} onClick={() => setSource(value)}>
              {value === 'spec' ? 'Spec (JSON)' : 'Functional'}
            </button>)}
          </div>
        </div>
        <div className="cf-gallery-spec">
          <CodeBlock variant="light" language={source === 'spec' ? 'json' : 'typescript'}
            customStyle={{ margin: 0, padding: 8, fontSize: 10.5, lineHeight: 1.35 }}>
            {code}
          </CodeBlock>
        </div>
      </div>
    </section>
  );
}

/** Presets that stack on one chart, each pair answering a two-step question. */
export function CompositionsGallery({ themeId }: { themeId?: string }) {
  return (
    <div className="dev-page cf-page cmp-page">
      <header className="dev-page-heading cf-heading">
        <div className="cf-heading-title"><h2>Compositions</h2></div>
        <p className="cmp-intro">
          Presets stack on one chart when each takes a different gesture: a click, a hover, a drag, the wheel, or the keyboard.
          Two that want the same gesture conflict, and the later one is dropped with a warning. Each pair below answers a
          question neither preset answers alone. See <LocaleLink to="/documentation/interaction-spec" className="site-text-link">Interaction spec</LocaleLink> for
          how conflicts are resolved.
        </p>
      </header>
      <div className="cmp-list">
        {cases.map((item) => <CompositionRow key={item.id} item={item} themeId={themeId} />)}
      </div>
    </div>
  );
}
