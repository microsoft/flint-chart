// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { useMemo } from 'react';
import { assembleVegaLite, THEME_PRESETS, type ChartAssemblyInput } from 'flint-chart';
import { ScaleToFit } from '../components/ScaleToFit';
import { VegaLiteView } from '../components/VegaLiteView';
import './label-experiment-lab.css';

type Outcome = 'direct' | 'dodge' | 'fallback';

interface ExperimentCase {
  id: string;
  title: string;
  note: string;
  expected: Outcome;
  input: ChartAssemblyInput;
}

const baseTheme = (THEME_PRESETS as any).datawrapper.spec;
const labelTheme = {
  ...baseTheme,
  id: 'label-experiment',
  label: 'Label experiment',
  legend: {
    ...baseTheme.legend,
    show: 'always',
    placement: ['seriesEnd', 'right'],
  },
};

function lineRows(endValues: number[], endYears?: number[]): any[] {
  return endValues.flatMap((endValue, seriesIndex) => {
    const endYear = endYears?.[seriesIndex] ?? 2020;
    return [1950, 1980, endYear].map((year, index) => ({
      year,
      series: `S${seriesIndex + 1}`,
      value: index === 2 ? endValue : 72 - seriesIndex * 4 - index * 5,
    }));
  });
}

function lineInput(endValues: number[], endYears?: number[]): ChartAssemblyInput {
  return {
    data: { values: lineRows(endValues, endYears) },
    semantic_types: { year: 'Year', series: 'Category', value: 'Quantity' },
    chart_spec: {
      chartType: 'Line Chart',
      encodings: { x: 'year', y: 'value', color: 'series' },
      baseSize: { width: 420, height: 280 },
    },
    theme_spec: labelTheme,
  } as ChartAssemblyInput;
}

const connectedRows = [
  ['0', 1955, 4.3, 37], ['0', 1980, 5.5, 55], ['0', 2005, 6.1, 58],
  ['1', 1955, 1.8, 79], ['1', 1980, 2.8, 69], ['1', 2005, 6.5, 54],
  ['2', 1955, 1.6, 77], ['2', 1980, 2.7, 68], ['2', 2005, 6.7, 55],
  ['3', 1955, 1.9, 75], ['3', 1980, 3.2, 66], ['3', 2005, 4.9, 63],
  ['4', 1955, 1.7, 73], ['4', 1980, 3.0, 67], ['4', 2005, 5.9, 60],
  ['5', 1955, 2.8, 71], ['5', 1980, 4.1, 68], ['5', 2005, 6.7, 47],
].map(([cluster, year, fertility, longevity]) => ({ cluster, year, fertility, longevity }));

const CASES: ExperimentCase[] = [
  {
    id: 'separated',
    title: 'Aligned and separated',
    note: 'One endpoint column; labels already have enough vertical air.',
    expected: 'direct',
    input: lineInput([18, 38, 58]),
  },
  {
    id: 'small-dodge',
    title: 'Two close endpoints',
    note: 'A sub-line-height adjustment is accepted and connected back to each point.',
    expected: 'dodge',
    input: lineInput([50, 52]),
  },
  {
    id: 'dense',
    title: 'Dense endpoint cluster',
    note: 'The required movement exceeds one line of text, so the whole set returns to a legend.',
    expected: 'fallback',
    input: lineInput([50, 51, 52, 53]),
  },
  {
    id: 'staggered',
    title: 'Staggered final x positions',
    note: 'Different final years are harmless when the natural label rows do not overlap.',
    expected: 'direct',
    input: lineInput([20, 42, 64], [2020, 2010, 2000]),
  },
  {
    id: 'boundary',
    title: 'Top boundary endpoint',
    note: 'The highest label stays centred on its endpoint; the figure bounds carry the overhang.',
    expected: 'direct',
    input: lineInput([25, 48, 72]),
  },
  {
    id: 'connected',
    title: 'Connected scatter trajectories',
    note: 'Rightmost points occupy a broad x range, matching the difficult real-world pattern.',
    expected: 'fallback',
    input: {
      data: { values: connectedRows },
      semantic_types: {
        cluster: 'Category',
        year: 'Year',
        fertility: { semanticType: 'Quantity', unit: 'children per woman' },
        longevity: { semanticType: 'Duration', unit: 'years' },
      },
      chart_spec: {
        chartType: 'Connected Scatter Plot',
        title: 'Cluster development trajectories',
        subtitle: 'Synthetic endpoints modeled after the reported collision',
        encodings: { x: 'fertility', y: 'longevity', color: 'cluster', order: 'year' },
        baseSize: { width: 420, height: 280 },
      },
      theme_spec: labelTheme,
    } as ChartAssemblyInput,
  },
];

function stripInternal(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach(stripInternal);
    return;
  }
  for (const key of Object.keys(node)) {
    if (/^_[^_]/.test(key)) delete node[key];
    else stripInternal(node[key]);
  }
}

function buildCase(testCase: ExperimentCase): { spec?: any; outcome: Outcome; message: string; error?: string } {
  try {
    const spec = assembleVegaLite(testCase.input as any) as any;
    const messages = (spec._theme?.report ?? [])
      .filter((entry: any) => entry.path === 'legend.placement')
      .map((entry: any) => entry.message);
    const message = messages.find((entry: string) =>
      entry.includes('dodged by at most')
      || entry.includes('key is drawn')
      || entry.includes('do not form one readable label column')
      || entry.includes('more than one line of text')
    ) ?? messages.at(-1) ?? 'No placement report';
    const outcome: Outcome = messages.some((entry: string) => entry.includes('dodged by at most'))
      ? 'dodge'
      : messages.some((entry: string) => entry.includes('key is drawn'))
        ? 'fallback'
        : 'direct';
    stripInternal(spec);
    return { spec, outcome, message };
  } catch (error) {
    return { outcome: 'fallback', message: 'Assembly failed', error: String((error as Error)?.message ?? error) };
  }
}

function CaseTile({ testCase }: { testCase: ExperimentCase }) {
  const built = useMemo(() => buildCase(testCase), [testCase]);
  const matches = built.outcome === testCase.expected;

  return (
    <article className="label-case">
      <header className="label-case-header">
        <div>
          <h2>{testCase.title}</h2>
          <p>{testCase.note}</p>
        </div>
        <span className={`label-outcome label-outcome-${built.outcome}`}>
          {built.outcome}
        </span>
      </header>
      <div className="label-chart-frame">
        {built.error || !built.spec
          ? <div className="label-error">{built.error}</div>
          : (
            <ScaleToFit height={300} padding={8}>
              <VegaLiteView spec={built.spec} renderer="svg" />
            </ScaleToFit>
          )}
      </div>
      <footer className="label-case-footer">
        <code>{built.message}</code>
        {!matches && <span className="label-mismatch">Expected {testCase.expected}</span>}
      </footer>
    </article>
  );
}

export function LabelExperimentLab() {
  return (
    <section className="label-lab">
      <header className="label-lab-intro">
        <h1>Series-end label experiment</h1>
        <p>
          Direct labels stay when no more than eight endpoints form one column and need at most one
          line of vertical adjustment. Otherwise, the complete set falls back to a legend.
        </p>
      </header>
      <div className="label-case-grid">
        {CASES.map((testCase) => <CaseTile key={testCase.id} testCase={testCase} />)}
      </div>
    </section>
  );
}
