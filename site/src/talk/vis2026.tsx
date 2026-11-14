import { Fragment, useState, type ReactNode } from 'react';
import { Filter, GripVertical, Lasso, Link2, ListChecks, MessageSquareText, MoreHorizontal, MousePointer2, MousePointerClick, Move, Scan, ZoomIn } from 'lucide-react';
import { INTERACTION_PRESET_TYPES, THEME_PRESETS } from 'flint-chart';
import { ThemeSwatches } from '../components/ThemeSwatches';
import { CHART_CATEGORIES } from '../shared/chart-categories';
import { DevDesign } from '../routes/DevDesign';
import { GitHubIcon } from '../components/SiteShell';
import { GITHUB_REPO } from '../shared/theme';
import { CountryTableStage } from '../playground/ExternalToChartLab';
import { GlobeWarmingStage } from '../playground/GlobeWarmingStage';
import { DiverseChartWallIllustration } from '../playground/DiverseChartWallIllustration';
import { OdysseyStoryStage, odysseyLookInHouse } from '../playground/OdysseyStoryStage';
import { YouDrawItStage } from '../playground/YouDrawItStage';
import { ClimatePhaseStage } from '../playground/ClimatePhaseStage';
// Odyssey's mount reads its layout from the interaction stages' shared sheet.
import '../playground/interaction-candidates.css';
import flintLogo from '../assets/flint-logo.svg';
import brokenAnnotatedChart from '../assets/talk-broken-annotated.svg';
import stepLayoutChart from '../assets/talk-step-layout.png';
import stepThemeAfterChart from '../assets/talk-step-theme-after.png';
import stepInteractionChart from '../assets/talk-step-interaction.png';
import { COMPILED, INTRO, INTRO_ROWS, FLINT_BASE, LONG_ROWS, STEPS, TYPES_INPUT, TYPES_VEGA_LITE, VL, flintInput, flintShown, heatmap, withData } from './data';
import {
  Chart, Code, Demo, FitTable, FlawList, MINIMAPS, Minimap, Sketch, Stable, VegaLite, fullLayout, lineDiff, specLayout, specText, stepLayout, textRows,
  type CodeRow, type Flaw,
} from './parts';
import {
  Cell, ROWS, type SlideDef,
} from './slides';
import { AUTHOR, BROKEN, CLOSEUP_TOP, DEEP_DIVE, TIMELINE, DETAILED, IMAGINE, TANGLE, TYPE_GROUPS } from './sketches';

/**
 * The IEEE VIS 2026 talk for the Flint paper. It reuses the general deck's slides and parts, with less
 * text on screen: the speaker carries the explanation, the slides carry the charts and the code.
 */

export const VIS_2026 = {
  title: 'Flint: A semantic-driven data visualization language',
  /** Who built each version: the paper's authors for 0.5, and who joined for 1.0. */
  authors: [
    { version: 'v0.5', groups: [{ names: 'Chenglong Wang, Alper Sarikaya', org: 'Microsoft' }, { names: 'Yunhai Wang, Kecheng Lu, Junhao Chen', org: 'Renmin University of China' }] },
    { version: 'v1.0', groups: [{ names: '+ Yuwei Xiao, Eunice Jun', org: 'UCLA' }] },
  ],
  venue: 'IEEE VIS 2026 · Boston',
  date: 'November 2026',
  contact: ['chenglong.wang@microsoft.com', 'alper.sarikaya@microsoft.com'],
};

// Slide 4 keeps slide 3's layout: the same three encoding lines in the same places, so only the mark
// and the two channel names that swapped are marked.
const INTRO_BAR_IN_PLACE = {
  data: INTRO.bar.data,
  width: INTRO.bar.width,
  height: INTRO.bar.height,
  mark: INTRO.bar.mark,
  encoding: { x: INTRO.bar.encoding.x, color: INTRO.bar.encoding.color, y: INTRO.bar.encoding.y },
};

const RAW_FLAWS: Flaw[] = [
  { role: 'marks', label: 'Chart is too long' },
  { role: 'x-axis', label: 'Awkward axis labels' },
  { role: 'legend', label: 'Weird color scheme' },
];

const AUTHORING_EFFORT = [
  { title: 'Parse & lay out', detail: 'Dates, axes, canvas dimensions', tone: 'meaning', before: STEPS.raw, after: STEPS.layout, chart: stepLayoutChart, alt: 'Heatmap after correcting date parsing and layout.' },
  { title: 'Style the chart', detail: 'Typography, colors, labels, rules', tone: 'look', before: STEPS.layout, after: COMPILED.theme, chart: stepThemeAfterChart, alt: 'Heatmap with an Economist-style visual theme.' },
  { title: 'Wire interactions', detail: 'Selection, fading, linked labels', tone: 'behavior', before: COMPILED.theme, after: COMPILED.final, chart: stepInteractionChart, alt: 'Heatmap with one game highlighted and the others faded.' },
].map((stage) => ({
  ...stage,
  rows: stepLayout(stage.after, stage.before)(60),
  changes: lineDiff(stage.before, stage.after).plus,
}));

const DataTable = () => (
  <FitTable head={['game', 'region', 'period', 'newUsers']} num={[3]}
    rows={LONG_ROWS.map((r) => [r.game, r.region, r.period.replace('-', ''), r.newUsers])} />
);

const DEEP_DIVE_INPUT = textRows(`{
  "semantic_types": {
    "period": "YearMonth",
    "game": "Category",
    "newUsers": "Delta"
  },
  "chart_spec": {
    "chartType": "Heatmap",
    "encodings": {
      "x": "period", "y": "game",
      "color": {
        "field": "newUsers",
        "aggregate": "sum"
      }
    }
  }
}`);

const DEEP_DIVE_OUTPUT: unknown = JSON.parse(JSON.stringify({
  mark: TYPES_VEGA_LITE.mark,
  height: TYPES_VEGA_LITE.height,
  encoding: TYPES_VEGA_LITE.encoding,
  transform: TYPES_VEGA_LITE.transform,
  config: TYPES_VEGA_LITE.config,
}, (key, value: unknown) => {
  if (key === 'data' || key === 'datasets') return undefined;
  if (Array.isArray(value) && value.length > 8) return [...value.slice(0, 2), '…'];
  if (typeof value === 'string' && value.length > 180) return `${value.slice(0, 160)}…`;
  return value;
}));

/** A box over a sketched scene, in the scene's own design units. */
const slot = (b: { x: number; y: number; w: number; h: number }, frame: { w: number; h: number } = IMAGINE) => ({
  left: `${(b.x / frame.w) * 100}%`, top: `${(b.y / frame.h) * 100}%`, width: `${(b.w / frame.w) * 100}%`, height: `${(b.h / frame.h) * 100}%`,
});

const SEMANTIC_TYPE_GROUPS = [...TYPE_GROUPS, { group: 'Fallbacks', color: '#52606b', types: ['Number', 'Unknown'] }];

const CAPABILITY_CHARTS = [
  ['Bar Chart', 'Bars'], ['Line Chart', 'Lines'], ['Area Chart', 'Areas'], ['Scatter Plot', 'Scatter'],
  ['Pie Chart', 'Pies'], ['Heatmap', 'Heatmaps'], ['Boxplot', 'Boxplots'], ['Map', 'Maps'],
  ['Histogram', 'Histograms'], ['Violin Plot', 'Violins'], ['Radar Chart', 'Radar'],
  ['Grouped Bar Chart', 'Grouped bars'], ['Stacked Bar Chart', 'Stacked bars'],
  ['Density Plot', 'Density'], ['Sankey', 'Sankey'],
].map(([type, label]) => {
  const chart = CHART_CATEGORIES.flatMap((category) => category.charts).find((chart) => chart.label === type);
  if (!chart) throw new Error(`Missing chart icon for ${type}`);
  return { label, icon: chart.icon };
});
const CAPABILITY_THEMES = [
  { id: 'nyt', label: 'NYT' }, { id: 'economist', label: 'Economist' },
  { id: 'swiss', label: 'Swiss' }, { id: 'nature', label: 'Nature' },
  { id: 'mckinsey', label: 'McKinsey' }, { id: 'pop', label: 'Pop' },
  { id: 'bbc', label: 'BBC' }, { id: 'material', label: 'Material' },
  { id: 'cartoon', label: 'Cartoon' }, { id: 'apple', label: 'Apple' },
  { id: 'datawrapper', label: 'Datawrapper' },
];
const CAPABILITY_INTERACTIONS = [
  { label: 'Highlight', Icon: MousePointerClick }, { label: 'Brush', Icon: Scan },
  { label: 'Inspect', Icon: MousePointer2 }, { label: 'Zoom', Icon: ZoomIn },
  { label: 'Legend toggle', Icon: ListChecks }, { label: 'Filters', Icon: Filter },
  { label: 'Linked views', Icon: Link2 }, { label: 'Annotate', Icon: MessageSquareText },
  { label: 'Pan & zoom', Icon: Move }, { label: 'Lasso', Icon: Lasso },
  { label: 'Reorder', Icon: GripVertical },
];
const CHART_TYPE_COUNT = new Set(CHART_CATEGORIES.flatMap((category) => category.charts.map((chart) => chart.label.replace(/\s+\*$/u, '')))).size;

const CapabilityTimeline = () => (
  <div className="talk-body column">
    <div className="talk-fit">
      <div className="talk-frame talk-scene" style={{ aspectRatio: `${TIMELINE.w} / ${TIMELINE.h}` }}>
        <Sketch name="flintTimeline" />
        <div className="talk-slot talk-capability-catalog" style={slot(TIMELINE.catalog, TIMELINE)}>
          <section className="talk-capability-block" aria-label="Supported chart types">
            <h3>Chart types</h3>
            <p className="talk-capability-tease">Presets + visual transformations (expressiveness)</p>
            <ul>
              {CAPABILITY_CHARTS.map((chart) => <li key={chart.label}><img src={chart.icon} alt="" /><span>{chart.label}</span></li>)}
              <li className="talk-capability-more"><MoreHorizontal aria-hidden /><span>+{CHART_TYPE_COUNT - CAPABILITY_CHARTS.length} more</span></li>
            </ul>
          </section>
          <section className="talk-capability-block" aria-label="Supported themes">
            <h3>Themes</h3>
            <p className="talk-capability-tease">Design as a formal specification that captures aesthetics and layout dynamics</p>
            <ul>
              {CAPABILITY_THEMES.map((theme) => <li key={theme.id}><ThemeSwatches theme={THEME_PRESETS[theme.id].spec} size={18} /><span>{theme.label}</span></li>)}
              <li className="talk-capability-more"><MoreHorizontal aria-hidden /><span>+{Object.keys(THEME_PRESETS).length - CAPABILITY_THEMES.length} more</span></li>
            </ul>
          </section>
          <section className="talk-capability-block" aria-label="Supported interactions">
            <h3>Interactions</h3>
            <p className="talk-capability-tease">Semantic-driven interactions with a reverse compiler</p>
            <ul>
              {CAPABILITY_INTERACTIONS.map(({ label, Icon }) => <li key={label}><Icon aria-hidden /><span>{label}</span></li>)}
              <li className="talk-capability-more"><MoreHorizontal aria-hidden /><span>+{INTERACTION_PRESET_TYPES.length - CAPABILITY_INTERACTIONS.length} more</span></li>
            </ul>
          </section>
        </div>
        <a className="talk-slot talk-collab-callout" href={GITHUB_REPO} target="_blank" rel="noreferrer" style={slot(TIMELINE.callout, TIMELINE)}>
          <GitHubIcon size={26} /><span>Subscribe <span className="talk-collab-repo">github.com/microsoft/flint-chart</span> &amp; let&apos;s collaborate!</span>
        </a>
      </div>
    </div>
  </div>
);

const BACKEND_VOCABULARY = {
  vegalite: textRows(`{
  "mark": "rect",
  "encoding": {
    "x": { … },
    "y": { … },
    "color": {
      "scale": { … }
    }
  },
  "width": …, "height": …
}`),
  echarts: textRows(`{
  "xAxis": { … },
  "yAxis": { … },
  "visualMap": {
    "inRange": { … }
  },
  "series": [{
    "type": "heatmap",
    "data": [ … ]
  }]
}`),
  plotly: textRows(`{
  "data": [{
    "type": "heatmap",
    "x": […], "y": […],
    "z": [[ … ]],
    "colorscale": …
  }],
  "layout": {
    "xaxis": { … },
    "yaxis": { … }
  }
}`),
};

const DeepDiveScene = ({ showTypes = false }: { showTypes?: boolean }) => (
  <div className="talk-body column">
    <div className="talk-fit">
      <div className="talk-frame talk-scene" style={{ aspectRatio: `${DEEP_DIVE.w} / ${DEEP_DIVE.h}` }}>
        <Sketch name="dataChartDeepDive" />
        <div className="talk-slot talk-deep-dive-code" style={slot(DEEP_DIVE.input, DEEP_DIVE)}>
          <Code rows={DEEP_DIVE_INPUT} max={22} min={18} lineHeight={1.6} />
        </div>
        <div className="talk-slot talk-deep-dive-output" style={slot(DEEP_DIVE.output, DEEP_DIVE)} aria-hidden={showTypes || undefined}>
          <Code rows={specLayout(DEEP_DIVE_OUTPUT)} max={10} min={9} tone="vl" lineHeight={1.3} />
        </div>
        {showTypes && <div className="talk-slot talk-type-overlay" style={slot(DEEP_DIVE.types, DEEP_DIVE)}>
          <h3>Semantic types</h3>
          <div className="talk-type-groups">
            {SEMANTIC_TYPE_GROUPS.map((group) => (
              <section key={group.group} className="talk-type-group" style={{ borderColor: group.color, backgroundColor: `${group.color}12` }}>
                <h4 style={{ color: group.color }}>{group.group}</h4>
                <div className="talk-type-chips">{group.types.map((type) => <code key={type}>{type}</code>)}</div>
              </section>
            ))}
          </div>
        </div>}
      </div>
    </div>
  </div>
);

const CompilerCloseupScene = ({ stage }: { stage: 'resolve' | 'layout' | 'backend' }) => (
  <div className="talk-body column">
    <div className="talk-fit">
      <div className="talk-frame talk-scene" style={{ aspectRatio: `${DEEP_DIVE.w} / ${DEEP_DIVE.h}` }}>
        <Sketch name={{ resolve: 'resolveConfigCloseup', layout: 'layoutOptimizationCloseup', backend: 'backendGenerationCloseup' }[stage]} />
        <div className="talk-slot talk-deep-dive-code" style={slot({ ...DEEP_DIVE.input, y: CLOSEUP_TOP, h: DEEP_DIVE.h - CLOSEUP_TOP }, DEEP_DIVE)}>
          <Code rows={DEEP_DIVE_INPUT} max={22} min={18} lineHeight={1.6} />
        </div>
        {stage === 'backend' && DEEP_DIVE.backends.map((output) => <Fragment key={output.backend}>
          <div className="talk-slot" style={slot({ ...output, y: 225, h: 260 }, DEEP_DIVE)} aria-label={`${output.label} specification vocabulary`}>
            <Code rows={BACKEND_VOCABULARY[output.backend]} max={16} min={14} lineHeight={1.35} />
          </div>
          <div className="talk-slot" style={slot(output, DEEP_DIVE)} aria-label={`${output.label} heatmap compiled from the Flint spec`}>
            <Chart spec={{
              ...TYPES_INPUT,
              chart_spec: {
                ...TYPES_INPUT.chart_spec,
                encodings: { ...TYPES_INPUT.chart_spec.encodings, x: { field: 'period', title: 'period' } },
                baseSize: { width: output.w, height: output.h },
                canvasSize: { width: output.w, height: output.h },
              },
            }} backend={output.backend} />
          </div>
        </Fragment>)}
      </div>
    </div>
  </div>
);

const IntroTable = () => (
  <FitTable head={['year', 'game', 'activeUsers']} num={[2]} rows={INTRO_ROWS.map((r) => [r.year, r.game, r.activeUsers])} />
);

/** Input ── [spec] ──▶ chart, a person at the bottom left thinking; the sketch draws the lines, the slide fills the slots. */
const AuthorFlow = ({ sketch, input, spec, chart }: { sketch: string; input: ReactNode; spec: ReactNode; chart: ReactNode }) => (
  <div className="talk-fit">
    <div className="talk-frame talk-scene" style={{ aspectRatio: `${AUTHOR.w} / ${AUTHOR.h}` }}>
      <Sketch name={sketch} />
      <div className="talk-slot" style={slot(sketch === 'authorHeatmap' ? AUTHOR.table : AUTHOR.input, AUTHOR)}>{input}</div>
      <div className="talk-slot" style={slot(AUTHOR.spec, AUTHOR)}>{spec}</div>
      <div className="talk-slot" style={slot(AUTHOR.chart, AUTHOR)}>{chart}</div>
    </div>
  </div>
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
    <div className="talk-contributors">
      <dt />
      <dd>+ GitHub contributors</dd>
    </div>
  </dl>
);

const titleSlide: SlideDef = {
  id: 'title', section: 'Opening', kind: 'title', render: () => (<>
    <div className="talk-title-head">
      <h1 className="talk-title-logo"><img src={flintLogo} alt="" aria-hidden="true" /><span className="talk-title-text">{VIS_2026.title}</span></h1>
      <a className="talk-title-link" href={GITHUB_REPO} target="_blank" rel="noreferrer"><GitHubIcon size={30} />github.com/microsoft/flint-chart</a>
      <span className="talk-title-rule" aria-hidden="true" />
      <Authors />
    </div>
    <div className="talk-title-wall" aria-hidden="true"><DiverseChartWallIllustration rows={2} /></div>
  </>),
};

const whySlide: SlideDef = {
  id: 'why', render: () => (<>
    <h2>Trade-off: simplicity vs quality <span className="talk-h2-note">(esp. for AI agents)</span></h2>
    <div className="talk-body column"><div className="talk-fit"><Sketch name="whyFlint" /></div></div>
  </>),
};

/** The Flint spec taken apart, as a poster: shown in the talk and again at its close. */
const designSlide: SlideDef = {
  id: 'design', kind: 'full', render: () => (<>
    <h2 className="talk-sr">Flint Demo</h2>
    <div className="talk-body column talk-poster"><DevDesign embedded /></div>
  </>),
};

/** Advanced interactions to play with live: each a Flint chart and a little host code on its semantic events. */
/** The voyage in a house's colours, on a map wider than tall, as the Mediterranean is. */
const ODYSSEY_LOOK = odysseyLookInHouse('economist');
// Tall enough that the map, which keeps its shape, meets the width rather than the height: its title and keys take ~150px.
const ODYSSEY_SIZE = { width: 760, height: 620 };

const FUN_DEMOS: { id: string; label: string; width: number; demo: () => ReactNode }[] = [
  { id: 'odyssey', label: 'Odyssey journey', width: 1100, demo: () => <OdysseyStoryStage look={ODYSSEY_LOOK} size={ODYSSEY_SIZE} /> },
  { id: 'globe', label: 'Turn the globe', width: 1000, demo: () => <GlobeWarmingStage /> },
  { id: 'draw', label: 'You draw it', width: 900, demo: () => <YouDrawItStage /> },
  { id: 'climate', label: 'Climate loops', width: 900, demo: () => <ClimatePhaseStage /> },
];

/** A switch between the advanced demos, one live at a time, the demo given the rest of the slide. */
function FunInteractions({ title }: { title: ReactNode }) {
  const [active, setActive] = useState(0);
  const demo = FUN_DEMOS[active];
  return (
    <div className="talk-body column talk-fun">
      <div className="talk-fun-head">
        <h2 aria-hidden>{title}</h2>
        <div className="talk-fun-tabs" role="tablist" aria-label="FlintChart examples">
          {FUN_DEMOS.map((d, i) => (
            <button key={d.id} type="button" role="tab" aria-selected={i === active} onClick={() => setActive(i)}>{d.label}</button>
          ))}
        </div>
      </div>
      <div className="talk-fun-stage" role="tabpanel" aria-label={demo.label}>
        <Demo key={demo.id} width={demo.width} maxScale={1.5}>{demo.demo()}</Demo>
      </div>
    </div>
  );
}

export const VIS_2026_SLIDES: SlideDef[] = [
  titleSlide,
  whySlide,

  // ======================================================== The problem
  {
    id: 'broken', section: 'Authoring with Vega-Lite', render: () => (<>
      <h2>A simple spec is not always good-looking</h2>
      <div className="talk-fit">
        <div className="talk-frame talk-scene" style={{ aspectRatio: `${BROKEN.w} / ${BROKEN.h}` }}>
          <Sketch name="brokenScene" />
          <div className="talk-slot" style={slot(BROKEN.table, BROKEN)}><DataTable /></div>
          <div className="talk-slot" style={slot(BROKEN.spec, BROKEN)}><Code rows={ROWS.raw} max={20} min={10} tone="vl" /></div>
          <div className="talk-slot" style={slot(BROKEN.chart, BROKEN)}>
            <img className="talk-baked-chart" src={brokenAnnotatedChart} width={950} height={320} alt="Squashed heatmap with numbered red circles marking the layout, temporal-axis, and color-scale problems." />
          </div>
          <div className="talk-slot" style={slot(BROKEN.flaws, BROKEN)}><FlawList flaws={RAW_FLAWS} lead="Smart defaults miss:" /></div>
          <div className="talk-overlay"><Sketch name="brokenThinker" /></div>
        </div>
      </div>
    </>),
  },
  {
    id: 'detailed', render: () => (<>
      <h2>A detailed spec looks good, but is hard to edit</h2>
      <div className="talk-fit">
        <div className="talk-frame talk-scene" style={{ aspectRatio: `${DETAILED.w} / ${DETAILED.h}` }}>
          <Sketch name="detailedScene" />
          <div className="talk-slot" style={slot(DETAILED.table, DETAILED)}><DataTable /></div>
          <div className="talk-slot" style={slot(DETAILED.spec, DETAILED)}><Code rows={specLayout(COMPILED.final)} max={12} min={6} tone="vl" /></div>
          <div className="talk-slot" style={slot(DETAILED.chart, DETAILED)}><VegaLite spec={withData(COMPILED.final)} /></div>
          <div className="talk-slot" style={slot(DETAILED.tangle, DETAILED)}>
            <div className="talk-col talk-tangle-mess is-narrow" style={{ height: '100%' }}>
              <div className="talk-fit" style={{ display: 'flex' }}><Minimap lines={MINIMAPS.entangle.map(([i, l, c]) => [i, l, c])} links={MINIMAPS.links} /></div>
              <p className="talk-linecount"><s>9 lines</s> 166 lines</p>
              <div className="talk-chips">
                <span className="meaning">chart design</span><span className="look">theming</span><span className="behavior">interaction</span>
              </div>
            </div>
          </div>
          <div className="talk-overlay"><Sketch name="detailedThinker" /></div>
        </div>
      </div>
    </>),
  },
  {
    id: 'root-cause', render: () => (<>
      <h2>Issue: low-level properties have intricate dependencies that are hard to generate right and revise</h2>
      <div className="talk-body column"><div className="talk-fit"><Sketch name="grammarEquation" /></div></div>
    </>),
  },

  // ======================================================== Flint
  {
    id: 'lifting', section: 'Flint', render: () => (<>
      <h2 className="is-act">Flint: Semantic-driven specification for data visualizations</h2>
      <div className="talk-body column"><div className="talk-fit"><Sketch name="flintEquation" /></div></div>
    </>),
  },
  designSlide,

  // ======================================================== The paper: data and chart specs
  {
    id: 'sec-a', section: 'Data and chart specs', render: () => (<>
      <h2>Deep dive: data spec + chart spec <span className="talk-h2-note">(VIS 2026)</span></h2>
      <DeepDiveScene />
    </>),
  },
  {
    id: 'a-types', render: () => (<>
      <h2>Deep dive: data spec + chart spec <span className="talk-h2-note">(VIS 2026)</span></h2>
      <DeepDiveScene showTypes />
    </>),
  },
  {
    id: 'compiler', render: () => (<>
      <h2 className="talk-sr">Compiler deep dive: resolving configuration by rule-based deduction</h2>
      <CompilerCloseupScene stage="resolve" />
    </>),
  },
  {
    id: 'a-spring', render: () => (<>
      <h2 className="talk-sr">Compiler deep dive: layout as a constraint optimization problem</h2>
      <CompilerCloseupScene stage="layout" />
    </>),
  },
  {
    id: 'a-backends', render: () => (<>
      <h2 className="talk-sr">Compiler deep dive: backend generation</h2>
      <CompilerCloseupScene stage="backend" />
    </>),
  },

  // ======================================================== Flint's expanding vocabulary
  {
    id: 'next', section: 'Flint today', render: () => (<>
      <h2 className="is-act">Flint: Semantic-driven specification for data visualizations</h2>
      <CapabilityTimeline />
    </>),
  },
  {
    id: 'fun', render: () => (<>
      <h2 className="talk-sr">Examples of FlintChart</h2>
      <FunInteractions title={<>Examples of <code className="talk-tt">{'<FlintChart … />'}</code></>} />
    </>),
  },

  // ======================================================== Backup
  {
    id: 'backup', kind: 'section', section: 'Backup', restartCount: true, render: () => (<>
      <h1 className="talk-backup-title">Backup slides</h1>
    </>),
  },
  {
    id: 'attempt-1', render: () => (<>
      <h2>To make it good-looking…</h2>
      <div className="talk-body talk-effort-stages">
        {AUTHORING_EFFORT.map((stage, i) => <Fragment key={stage.tone}>
          {i > 0 && <div className="talk-effort-arrow" aria-hidden>→</div>}
          <section className={`talk-effort-card is-${stage.tone}`}>
            <header><span>{i + 1}</span><h3>{stage.title}</h3></header>
            <p>{stage.detail}</p>
            <div className="talk-effort-code"><Code rows={stage.rows} tone="vl" max={9} min={6} lineHeight={1.22} /></div>
            <strong className="talk-effort-count">{stage.changes} lines added / revised</strong>
            <div className="talk-effort-preview"><img className="talk-baked-chart" src={stage.chart} decoding="sync" fetchPriority="high" alt={stage.alt} /></div>
          </section>
        </Fragment>)}
      </div>
    </>),
  },
  {
    id: 'tangle', render: () => (<>
      <h2>The code is a little messy, with entangled parameters</h2>
      <p className="talk-entangled">timeUnit · labelExpr · scale.domainMid · axis.values · labelLimit · legend.orient · gradientLength · config.view.step · stroke · params · selection · condition · opacity · tooltip · …</p>
      <div className="talk-fit">
        <div className="talk-frame talk-scene" style={{ aspectRatio: `${TANGLE.w} / ${TANGLE.h}` }}>
          <Sketch name="tangleScene" />
          <div className="talk-slot" style={slot(TANGLE.code, TANGLE)}>
            <div className="talk-col talk-tangle-mess" style={{ height: '100%' }}>
              <div className="talk-fit" style={{ display: 'flex' }}><Minimap lines={MINIMAPS.entangle.map(([i, l, c]) => [i, l, c])} links={MINIMAPS.links} /></div>
              <p className="talk-linecount"><s>9 lines</s> 166 lines</p>
              <div className="talk-chips">
                <span className="meaning">chart design</span><span className="look">theming</span><span className="behavior">interaction</span>
              </div>
            </div>
          </div>
          <div className="talk-slot" style={slot(TANGLE.chart, TANGLE)}><VegaLite spec={withData(COMPILED.final)} /></div>
          <div className="talk-overlay"><Sketch name="tangleThinker" /></div>
        </div>
      </div>
    </>),
  },
  {
    id: 'ideal', render: () => (<>
      <h2 className="is-act">Authoring with Vega-Lite</h2>
      <AuthorFlow sketch="authorHeatmap" input={<IntroTable />}
        spec={<Code rows={stepLayout(INTRO.heatmap)} max={22} min={12} tone="vl" />}
        chart={<VegaLite spec={VL.heatmap} />} />
    </>),
  },
  {
    id: 'ideal-bar', render: () => (<>
      <h2>Quite easy to change the design</h2>
      <AuthorFlow sketch="authorBar" input={<VegaLite spec={VL.heatmap} />}
        spec={<Code rows={fullLayout(INTRO_BAR_IN_PLACE, INTRO.heatmap)} max={22} min={12} tone="vl" />}
        chart={<VegaLite spec={VL.bar} />} />
    </>),
  },
];
