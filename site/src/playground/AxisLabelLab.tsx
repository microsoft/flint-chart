import { useMemo, useState } from 'react';
import { schemeTableau10, schemeSet3 } from 'd3';
import type { ChartAssemblyInput } from 'flint-chart';
import { ScaleToFit } from '../components/ScaleToFit';
import { VegaLiteView } from '../components/VegaLiteView';
import { EChartsView } from '../components/EChartsView';
import { ChartjsView } from '../components/ChartjsView';
import { PlotlyView } from '../components/PlotlyView';
import { BACKENDS, ALL_BACKENDS, type PreviewBackend } from '../shared/supported-backends';
import { LABEL_CASES, DUAL_LEGEND_CASES, HORIZONTAL_LEGEND_CASES, FACET_LABEL_CASES, MEDAL_SOURCE, labelCaseInput, type LabelSurface } from './axis-label-cases';
import './axis-label-lab.css';

const SURFACES: Array<{ id: LabelSurface; label: string }> = [
  { id: 'x', label: 'X axis' }, { id: 'y', label: 'Y axis' },
  { id: 'color', label: 'Color legend' },
];

function LabelChart({ input, surface, backend }: {
  input: ChartAssemblyInput; surface: LabelSurface | 'facet' | 'horizontal'; backend: PreviewBackend;
}) {
  const built = useMemo(() => {
    try {
      return { spec: BACKENDS[backend].assemble(input) as any, error: '' };
    } catch (error) {
      return { spec: null, error: String(error) };
    }
  }, [input, backend]);
  return (
    <div className="axis-label-chart" data-surface={surface}>
      {built.error ? <p role="alert">{built.error}</p> : (
        <ScaleToFit adaptiveHeight height={440} minHeight={180} padding={0}>
          {backend === 'vegalite' && <VegaLiteView spec={built.spec} renderer="svg" />}
          {backend === 'echarts' && <EChartsView option={built.spec} constrain={false} />}
          {backend === 'chartjs' && <ChartjsView config={built.spec} constrain={false} />}
          {backend === 'plotly' && <PlotlyView figure={built.spec} constrain={false} />}
        </ScaleToFit>
      )}
    </div>
  );
}

export function AxisLabelLab() {
  const [backend, setBackend] = useState<PreviewBackend>('vegalite');
  return (
    <section className="axis-label-lab">
      <header className="axis-label-heading">
        <div><h1>Axis labels</h1><p><a href={MEDAL_SOURCE} target="_blank" rel="noreferrer">Paris 2024 medals</a> · Real counts, with extended labels in stress cases</p></div>
        <label>Backend <select value={backend} onChange={(event) => setBackend(event.target.value as PreviewBackend)}>{ALL_BACKENDS.map((id) => <option key={id} value={id}>{BACKENDS[id].label}</option>)}</select></label>
      </header>
      {backend === 'vegalite' && <section>
        <h2>Horizontal legends and side fallback</h2>
        {HORIZONTAL_LEGEND_CASES.map(testCase => (
          <article className="axis-label-case" data-case={testCase.id} key={testCase.id}>
            <h2>{testCase.title}</h2>
            <div className="axis-label-comparison axis-label-horizontal">
              {['nyt', 'economist'].map(theme => (
                <figure data-theme={theme} key={theme}>
                  <figcaption>{theme === 'nyt' ? 'NYT' : 'Economist'} / extended palette</figcaption>
                  <LabelChart input={{ ...testCase.input, theme_spec: {
                    extends: theme, ink: { series: { categoricalExtended: [...schemeTableau10, ...schemeSet3] } },
                  } }} surface="horizontal" backend={backend} />
                </figure>
              ))}
            </div>
          </article>
        ))}
      </section>}
      {LABEL_CASES.map((testCase) => (
        <article className="axis-label-case" data-case={testCase.id} key={testCase.id}>
          <h2>{testCase.title}</h2>
          <div className="axis-label-comparison">
            {SURFACES.map(({ id, label }) => (
              <figure key={id}>
                <figcaption>{label}</figcaption>
                <LabelChart key={backend} input={labelCaseInput(testCase, id, 480, 320)} surface={id} backend={backend} />
              </figure>
            ))}
          </div>
        </article>
      ))}
      <section className="axis-label-case">
        <h2>Color + size legends</h2>
        <div className="axis-label-comparison">
          {DUAL_LEGEND_CASES.map((testCase) => (
            <figure data-case={testCase.id} key={testCase.id}>
              <figcaption>{testCase.title}{testCase.longSizeTitle ? ' / long size title' : ''}</figcaption>
              <LabelChart key={backend} input={labelCaseInput(testCase, 'dual', 480, 320)} surface="dual" backend={backend} />
            </figure>
          ))}
        </div>
      </section>
      {backend === 'vegalite' && <section>
        <h2>Facets and themes</h2>
        <p className="axis-label-source">Generated market data from the theme lab fixture</p>
        {FACET_LABEL_CASES.map(testCase => (
          <article className="axis-label-case" data-case={testCase.id} key={testCase.id}>
            <h2>{testCase.title}</h2>
            <div className="axis-label-comparison axis-label-themes">
              {['flint', 'nyt', 'economist', 'swiss'].map(theme => (
                <figure data-theme={theme} key={theme}>
                  <figcaption>{theme === 'flint' ? 'Flint' : theme === 'nyt' ? 'NYT' : theme === 'economist' ? 'Economist' : 'Swiss'}</figcaption>
                  <LabelChart input={{ ...testCase.input, theme_spec: theme === 'flint' ? undefined : theme }} surface="facet" backend={backend} />
                </figure>
              ))}
            </div>
          </article>
        ))}
      </section>}
    </section>
  );
}