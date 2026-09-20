import { useState } from 'react';
import { Braces, ChevronDown, ChevronRight } from 'lucide-react';
import type { ChartAssemblyInput, InteractionEntry } from 'flint-chart';
import { InteractiveVegaLiteView } from '../components/InteractiveVegaLiteView';
import { ScaleToFit } from '../components/ScaleToFit';
import './click-focus-lab.css';
import './interaction-conflicts.css';

const BARS = [
  { country: 'Viet Nam', region: 'East Asia and the Pacific', reading: 83.2 },
  { country: 'Belarus', region: 'Europe and Central Asia', reading: 82.4 },
  { country: 'Tunisia', region: 'Middle East and North Africa', reading: 66.0 },
  { country: 'Mongolia', region: 'East Asia and the Pacific', reading: 63.2 },
  { country: 'Kyrgyzstan', region: 'Europe and Central Asia', reading: 57.8 },
  { country: 'Bangladesh', region: 'South Asia', reading: 48.8 },
  { country: 'Zimbabwe', region: 'Sub-Saharan Africa', reading: 44.4 },
  { country: 'Nepal', region: 'South Asia', reading: 39.2 },
  { country: 'Ghana', region: 'Sub-Saharan Africa', reading: 21.4 },
  { country: 'Chad', region: 'Sub-Saharan Africa', reading: 4.4 },
];

const POINTS = Array.from({ length: 24 }, (_, index) => ({
  x: Math.round(((index * 37) % 100) * 10) / 10,
  y: Math.round(((index * 53 + 17) % 100) * 10) / 10,
  group: ['North', 'South', 'East'][index % 3],
}));

function bar(interactions: readonly InteractionEntry[], colour = true): ChartAssemblyInput {
  return {
    data: { values: BARS },
    semantic_types: {
      country: 'Country',
      region: 'Region',
      reading: { semanticType: 'Percentage', intrinsicDomain: [0, 100] },
    },
    chart_spec: {
      chartType: 'Bar Chart',
      encodings: {
        y: { field: 'country', sortBy: 'x', sortOrder: 'descending' },
        x: { field: 'reading' },
        ...(colour ? { color: { field: 'region' } } : {}),
      },
      baseSize: { width: 380, height: 260 },
    },
    interaction_spec: { interactions },
  } as ChartAssemblyInput;
}

function scatter(interactions: readonly InteractionEntry[]): ChartAssemblyInput {
  return {
    data: { values: POINTS },
    semantic_types: { x: 'Number', y: 'Number', group: 'Category' },
    chart_spec: {
      chartType: 'Scatter Plot',
      encodings: { x: { field: 'x' }, y: { field: 'y' }, color: { field: 'group' } },
      baseSize: { width: 380, height: 260 },
    },
    interaction_spec: { interactions },
  } as ChartAssemblyInput;
}

interface ConflictCase {
  id: string;
  title: string;
  input: ChartAssemblyInput;
}

const CASES: readonly ConflictCase[] = [
  { id: 'legend-click', title: 'click-highlight and legend-toggle', input: bar([{ type: 'click-highlight' }, { type: 'legend-toggle' }]) },
  { id: 'axis-click', title: 'click-highlight and axis-highlight', input: bar([{ type: 'click-highlight' }, { type: 'axis-highlight' }]) },
  {
    id: 'focus-mark',
    title: 'click-highlight and click-group-focus',
    input: bar([{ type: 'click-highlight' }, { type: 'click-group-focus', options: { groupBy: 'region' } }]),
  },
  { id: 'composes', title: 'click-highlight and click-annotate', input: bar([{ type: 'click-highlight' }, { type: 'click-annotate' }]) },
  {
    id: 'targets-option',
    title: 'click-highlight on marks only, and legend-toggle',
    input: bar([{ type: 'click-highlight', options: { targets: ['mark'] } }, { type: 'legend-toggle' }]),
  },
  { id: 'owner-dropped', title: 'legend-toggle on a chart with no legend', input: bar([{ type: 'click-highlight' }, { type: 'legend-toggle' }], false) },
  { id: 'region-slot', title: 'brush-x and brush-y', input: scatter([{ type: 'brush-x' }, { type: 'brush-y' }]) },
  { id: 'plot-drag', title: 'navigate and select', input: scatter([{ type: 'navigate' }, { type: 'select' }]) },
  { id: 'double-click', title: 'navigate and double-activate', input: scatter([{ type: 'navigate' }, { type: 'double-activate' }]) },
  {
    id: 'reset-option',
    title: 'navigate that resets on Escape, and double-activate',
    input: scatter([{ type: 'navigate', options: { reset: ['escape'] } }, { type: 'double-activate' }]),
  },
];

function CaseCard({ item }: { item: ConflictCase }) {
  const [specOpen, setSpecOpen] = useState(false);
  const entries = item.input.interaction_spec?.interactions ?? [];
  return (
    <article className="cf-probe">
      <header className="cf-probe-header icf-header">
        <h2>{item.title}</h2>
      </header>
      <div className="cf-stage">
        <ScaleToFit height={360} minHeight={280} adaptiveHeight padding={8}>
          <InteractiveVegaLiteView input={item.input} chartId={`icf-${item.id}`} ariaLabel={item.title} />
        </ScaleToFit>
      </div>
      <div className={`cf-spec-panel${specOpen ? ' cf-spec-panel-open' : ''}`}>
        <div className="cf-spec-panel-bar">
          <button
            type="button"
            className="cf-spec-panel-toggle"
            aria-expanded={specOpen}
            onClick={() => setSpecOpen((open) => !open)}
          >
            {specOpen
              ? <ChevronDown size={12} strokeWidth={2} aria-hidden="true" />
              : <ChevronRight size={12} strokeWidth={2} aria-hidden="true" />}
            <Braces size={12} strokeWidth={2} aria-hidden="true" />
            interaction_spec
            <span className="cf-spec-panel-count">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
          </button>
        </div>
        {specOpen && <pre className="cf-json">{JSON.stringify(item.input.interaction_spec, null, 2)}</pre>}
      </div>
    </article>
  );
}

export function InteractionConflictsLab() {
  return (
    <div className="dev-page cf-page">
      <header className="dev-page-heading cf-heading">
        <h1>Conflict cases</h1>
        <p>
          Two presets that share a trigger. The line under each chart is the warning the surface reports:
          <strong> info</strong> when one entry gave up the shared trigger and kept the rest,
          <strong> warning</strong> when the later entry was dropped.
        </p>
      </header>
      <div className="cf-grid">
        {CASES.map((item) => <CaseCard key={item.id} item={item} />)}
      </div>
    </div>
  );
}
