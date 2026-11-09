import { CompilationProcessIllustration } from '../playground/CompilationProcessIllustration';
import { DevDesign } from '../routes/DevDesign';
import { OdysseyStoryStage } from '../playground/OdysseyStoryStage';
import { YouDrawItStage } from '../playground/YouDrawItStage';
import { CountryTableStage } from '../playground/ExternalToChartLab';
import { GlobeWarmingStage } from '../playground/GlobeWarmingStage';
import { CARS, FLINT_BASE, LONG_ROWS, STEPS, TYPES_FLINT, VL, flintInput, flintShown, lineByType, linkedYears, picked, PICKED_GAME, withData } from './data';
import {
  Chart, Code, Demo, FitTable, FlawList, FlawedVegaLite, MINIMAPS, Minimap, Sketch, Stable, VegaLite, fullLayout, plainLayout, specLayout, specText, stepLayout,
  type CodeRow, type Flaw,
} from './parts';
import {
  BESPOKE_ROWS, Cell, ROWS, SLIDES, SPECS, Step, TYPES_COMPILED, Trio, TypeTree, type SlideDef,
} from './slides';

/**
 * The IEEE VIS 2026 talk for the Flint paper. It reuses the general deck's slides and parts, with less
 * text on screen: the speaker carries the explanation, the slides carry the charts and the code.
 */

export const VIS_2026 = {
  title: 'Flint: A Semantics-Driven Data Visualization Intermediate Language',
  /** Who built each version: the paper's authors for 0.x, and who joined for 1.0. */
  authors: [
    { version: 'v0.x', groups: [{ names: 'Chenglong Wang, Alper Sarikaya', org: 'Microsoft' }, { names: 'Yunhai Wang, Kecheng Lu, Junhao Chen', org: 'Renmin University of China' }] },
    { version: 'v1.0', groups: [{ names: '+ Yuwei Xiao, Eunice Jun', org: 'UCLA' }] },
  ],
  venue: 'IEEE VIS 2026 · Boston',
  date: 'November 2026',
  contact: ['chenglong.wang@microsoft.com', 'alper.sarikaya@microsoft.com'],
};

const reuse = (id: string, extra: Partial<SlideDef> = {}): SlideDef => {
  const slide = SLIDES.find((s) => s.id === id);
  if (!slide) throw new Error(`No slide ${id} in the general deck`);
  return { ...slide, section: undefined, ...extra };
};

// Slide 4 keeps slide 3's layout: the same three encoding lines in the same places, so only the mark
// and the two channel names that swapped are marked.
const CARS_BAR_IN_PLACE = {
  data: CARS.carsBar.data,
  mark: CARS.carsBar.mark,
  encoding: { x: CARS.carsBar.encoding.x, color: CARS.carsBar.encoding.color, y: CARS.carsBar.encoding.y },
};

const RAW_FLAWS: Flaw[] = [
  { role: 'marks', label: 'Not responsive to size' },
  { role: 'x-axis', label: 'Axis not parsed as time' },
  { role: 'legend', label: "Colors aren't diverging" },
];

const DataTable = () => (
  <FitTable head={['game', 'region', 'period', 'newUsers']} num={[3]}
    rows={LONG_ROWS.map((r) => [r.game, r.region, r.period.replace('-', ''), r.newUsers])} />
);


/** The authors, a line per version: names, then their institution in parentheses. */
const Authors = () => (
  <dl className="talk-authors">
    {VIS_2026.authors.map((line) => (
      <div key={line.version}>
        <dt>{line.version}</dt>
        <dd>{line.groups.map((g) => <span key={g.org} className="talk-author-group">{g.names} <span className="talk-org">({g.org})</span></span>)}</dd>
      </div>
    ))}
  </dl>
);

const titleSlide: SlideDef = {
  id: 'title', section: 'Opening', kind: 'title', render: () => (<>
    <h1 style={{ fontSize: 64 }}>{VIS_2026.title}</h1>
    <Authors />
    <div className="talk-grid" style={{ gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr) minmax(0, 0.7fr)', marginTop: 16 }}>
      <Cell><Chart spec={linkedYears} /></Cell>
      <Cell><Demo width={560}><GlobeWarmingStage layout="stacked" /></Demo></Cell>
      <div className="talk-cell talk-stacked-demo"><Stable width={460} height={735}><CountryTableStage themeId="powerbi-light" /></Stable></div>
    </div>
  </>),
};

const whySlide: SlideDef = {
  id: 'why', render: () => (<>
    <h2>Trade-off: simplicity vs quality</h2>
    <div className="talk-body column"><div className="talk-fit"><Sketch name="whyFlint" /></div></div>
  </>),
};

export const VIS_2026_SLIDES: SlideDef[] = [
  titleSlide,
  whySlide,

  // ======================================================== The problem
  {
    id: 'ideal', section: 'Authoring with Vega-Lite', render: () => (<>
      <h2 className="is-act">Authoring with Vega-Lite</h2>
      <div className="talk-body">
        <div className="talk-col"><Code rows={stepLayout(CARS.cars)} max={26} tone="vl" /></div>
        <div className="talk-col" style={{ gap: 12 }}>
          <div className="talk-fit" style={{ flex: '1.1 1 0' }}><Sketch name="thinkGrammar" /></div>
          <div className="talk-col" style={{ flex: '1 1 0' }}><VegaLite spec={VL.cars} /></div>
        </div>
      </div>
    </>),
  },
  {
    id: 'ideal-bar', render: () => (<>
      <h2>Switching to a bar chart is one small edit</h2>
      <div className="talk-body">
        <div className="talk-col"><Code rows={fullLayout(CARS_BAR_IN_PLACE, CARS.cars)} max={26} tone="vl" /></div>
        <div className="talk-col"><VegaLite spec={VL.carsBar} /></div>
      </div>
    </>),
  },
  {
    id: 'reality', render: () => (<>
      <h2>Let's try a slightly more complicated example</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '1.1 1 0' }}><DataTable /></div>
        <div className="talk-col"><Code rows={ROWS.raw} max={22} tone="vl" /></div>
      </div>
    </>),
  },
  {
    id: 'broken', render: () => (<>
      <h2>Plug the data in, and the chart breaks</h2>
      <div className="talk-body column">
        <div className="talk-body" style={{ gap: 24 }}>
          <div className="talk-col" style={{ flex: '0.42 1 0' }}><div className="talk-fit"><Sketch name="thinkNotGood" /></div></div>
          <div className="talk-col" style={{ flex: '1 1 0' }}><FlawedVegaLite spec={withData(STEPS.raw)} flaws={RAW_FLAWS} /></div>
        </div>
        <FlawList flaws={RAW_FLAWS} />
      </div>
    </>),
  },
  {
    id: 'attempt-1', render: () => (<>
      <h2>Let's fix parsing and layout</h2>
      <Step before={ROWS.raw} beforeSpec={withData(STEPS.raw)} after={stepLayout(STEPS.layout, STEPS.raw)} afterSpec={withData(STEPS.layout)} />
    </>),
  },
  {
    id: 'theme-vl', render: () => (<>
      <h2>Then make it look like The Economist</h2>
      <Step before={plainLayout(stepLayout(STEPS.layout, STEPS.raw))} beforeSpec={withData(STEPS.layout)} after={ROWS.theme} afterSpec={withData(STEPS.theme)} />
    </>),
  },
  {
    id: 'interaction-vl', render: () => (<>
      <h2>Then click a game to highlight it</h2>
      <Step before={plainLayout(ROWS.theme)} beforeSpec={withData(STEPS.theme)} after={ROWS.final} afterSpec={picked(STEPS.final, PICKED_GAME)} />
    </>),
  },
  {
    id: 'tangle', render: () => (<>
      <h2>…and now the code is a tangle</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ gap: 20 }}>
          <div className="talk-fit"><Sketch name="thinkTangle" /></div>
          <p className="talk-lead" style={{ flex: 'none', margin: 0 }}>9 lines became 166.</p>
          <div className="talk-chips is-large" style={{ flex: 'none' }}>
            <span className="meaning">chart design</span><span className="look">theming</span><span className="behavior">interaction</span>
          </div>
        </div>
        <div className="talk-col"><Minimap lines={MINIMAPS.entangle.map(([i, l, c]) => [i, l, c])} links={MINIMAPS.links} /></div>
      </div>
    </>),
  },
  {
    id: 'root-cause', render: () => (<>
      <h2>The language is too low-level to support concise, high-level authoring</h2>
      <div className="talk-body column"><div className="talk-fit"><Sketch name="grammarEquation" /></div></div>
    </>),
  },

  {
    id: 'contrast', render: () => (<>
      <h2>With Flint, the compiler writes the properties</h2>
      <div className="talk-body column"><div className="talk-fit"><Sketch name="grammarContrast" /></div></div>
    </>),
  },

  // ======================================================== Flint
  {
    id: 'lifting', section: 'Flint', render: () => (<>
      <h2 className="is-act">Flint is a language for AI agents that disentangles visual and interaction logic</h2>
      <div className="talk-body column"><div className="talk-fit"><Sketch name="flintEquation" /></div></div>
    </>),
  },
  {
    id: 'design', render: () => (<>
      <h2>A Flint spec: data, chart, interaction, and theme</h2>
      <div className="talk-body column talk-poster"><DevDesign embedded /></div>
    </>),
  },

  // ======================================================== The paper: the chart spec
  {
    id: 'sec-a', section: 'The chart spec', render: () => (<>
      <h2>The paper: the chart spec</h2>
      <Trio sketch="spec" items={SPECS} focus={0} />
    </>),
  },
  reuse('a-how'),
  {
    id: 'a-what', render: () => (<>
      <h2>What each type decides for this chart</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '0.75 1 0' }}><Code rows={specLayout(TYPES_FLINT, /YearMonth|Category|Profit|semantic_types/)} /></div>
        <div className="talk-col" style={{ flex: '1.25 1 0' }}><TypeTree /></div>
      </div>
    </>),
  },
  {
    id: 'a-vl', render: () => (<>
      <h2>And this is what the compiler wrote in Vega-Lite</h2>
      <div className="talk-body talk-step">
        <div className="talk-col" style={{ flex: '0.85 1 0' }}><Code rows={specLayout(TYPES_FLINT, /YearMonth|Category|Profit|semantic_types/)} /></div>
        <div className="talk-arrow">→</div>
        <div className="talk-col" style={{ flex: '1.15 1 0' }}><Code rows={TYPES_COMPILED} tone="vl" /></div>
      </div>
    </>),
  },
  {
    id: 'a-types', render: () => (<>
      <h2>Semantic types: a small vocabulary with a lot behind it</h2>
      <div className="talk-body column" style={{ gap: 22 }}>
        <div className="talk-fit"><Sketch name="typeCloud" /></div>
        <p className="talk-task">Agents are good at picking a semantic type from a sample set.</p>
      </div>
    </>),
  },
  {
    id: 'compiler', render: () => (<>
      <h2>The compiler: from a Flint spec to any library</h2>
      <div className="talk-body column talk-compiler"><CompilationProcessIllustration theme={false} /></div>
    </>),
  },
  {
    id: 'a-spring', render: () => (<>
      <h2>Opinionated sizing: the data pushes out, the canvas pushes back</h2>
      <div className="talk-body column"><div className="talk-fit"><Sketch name="springModel" /></div></div>
    </>),
  },
  {
    id: 'a-backends', render: () => (<>
      <h2>The compiler also renders to different visualization libraries</h2>
      <div className="talk-grid" style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}>
        <Cell caption="Vega-Lite"><Chart spec={lineByType()} /></Cell>
        <Cell caption="ECharts"><Chart spec={lineByType()} backend="echarts" /></Cell>
        <Cell caption="Plotly"><Chart spec={lineByType()} backend="plotly" /></Cell>
        <Cell caption="Chart.js"><Chart spec={lineByType()} backend="chartjs" /></Cell>
      </div>
    </>),
  },

  // ======================================================== Where Flint is going
  {
    id: 'next', section: 'Where is Flint going?', render: () => (<>
      <h2>Next: the theme spec and the interaction spec</h2>
      <Trio sketch="spec" items={SPECS} />
    </>),
  },
  {
    id: 'next-bespoke', render: () => (<>
      <h2>Interactions, host updates, and annotations come together</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '0.85 1 0' }}><Code rows={BESPOKE_ROWS} max={19} /></div>
        <div className="talk-col" style={{ flex: '1.15 1 0' }}><Stable width={600} height={400}><YouDrawItStage /></Stable></div>
      </div>
    </>),
  },
  {
    id: 'next-story', render: () => (<>
      <h2>A story told on a map</h2>
      <div className="talk-body column"><Stable width={900} height={700}><OdysseyStoryStage compact /></Stable></div>
    </>),
  },

  // ======================================================== Close
  {
    id: 'recap', section: 'Close', render: () => (<>
      <h2 className="is-act">Flint: a visualization language for AI agents</h2>
      <div className="talk-body column" style={{ gap: 20 }}>
        <div className="talk-fit"><Sketch name="lifting" /></div>
        <p className="talk-task" style={{ margin: 0 }}>
          <strong>Open source (MIT)</strong>: <code>flint-chart</code> on npm and PyPI, <code>flint-chart-mcp</code> for agents. <strong>In use in Microsoft Fabric.</strong>
        </p>
      </div>
    </>),
  },
  {
    id: 'thanks', kind: 'title', render: () => (<>
      <h1>Thank you!</h1>
      <Authors />
      <p className="talk-lead">{VIS_2026.contact.join(' · ')}</p>
      <p className="talk-lead">
        <a href="https://microsoft.github.io/flint-chart">microsoft.github.io/flint-chart</a> · <a href="https://github.com/microsoft/flint-chart">github.com/microsoft/flint-chart</a>
      </p>
    </>),
  },

  // ======================================================== Appendix
  { ...reuse('a-layout-bar'), section: 'Appendix' },
  reuse('a-layout-line'),
];
