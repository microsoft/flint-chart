import type { ReactNode } from 'react';
import type { ChartAssemblyInput, ThemeSpec } from 'flint-chart';
import { THEME_PRESETS } from 'flint-chart';
import { TYPE_TREE } from './sketches';
import { SizingPlayground } from '../components/SizingPlayground';
import { ThemeExplorer } from './ThemeExplorer';
import { WorldCupScorersDemo } from '../playground/WorldCupScorersDemo';
import { CarOriginTableStage, CountryTableStage } from '../playground/ExternalToChartLab';
import { McpChatTurn } from '../routes/McpExperience';
import { GlobeWarmingStage } from '../playground/GlobeWarmingStage';
import { RetailDrilldownStage } from '../playground/RetailDrilldownStage';
import { YouDrawItStage } from '../playground/YouDrawItStage';
import { ArticleSection } from '../playground/InteractiveDataReportLab';
import { TIME_USE } from '../playground/interactive-data-report-content';
import {
  FLINT_BASE, LONG_ROWS, TYPES_FLINT, typesCompiled, CARS, flintInput, flintShown, linkedYears, PICKED_GAME, PICKED_ROWS, STEPS, VL, foodLines, gameBars, heatmap, lineByType,
  penguins, picked, withData, type FlintState,
} from './data';
import {
  Chart, Code, Demo, FitTable, FlawList, FlawedVegaLite, Stable, MINIMAPS, Minimap, Sketch, VegaLite, fullLayout, type Flaw, lineDiff, plainLayout, specLayout, stepLayout, textRows,
  type CodeRow, type CodeSource,
} from './parts';
import glue from './specs/vl-final-glue.txt?raw';

export interface SlideDef { id: string; kind?: 'title' | 'section' | 'statement'; section?: string; render: () => ReactNode }

const UPDATE_PROMPTS: Record<string, string> = {
  dense: 'Show all 24 games.',
  theme: 'Restyle this chart to match our new brand theme.',
  brush: 'Let me brush a range of months instead of clicking a game.',
  facet: 'Split this chart into a separate panel for each region.',
};

const fmt = (n: number) => n.toLocaleString('en-US', { signDisplay: 'always' });
const Cell = ({ caption, children, framed }: { caption?: string; children: ReactNode; framed?: boolean }) => (
  <div className="talk-cell">
    <div className={framed ? 'talk-fit talk-framed' : 'talk-fit'} style={{ display: 'flex' }}>{children}</div>
    {caption && <p className="talk-caption">{caption}</p>}
  </div>
);

/** One step of the traditional way: the code and chart before, then the code and chart after. */
const Step = ({ before, beforeSpec, after, afterSpec, note, flaws }: { before: CodeSource; beforeSpec: unknown; after: CodeSource; afterSpec: unknown; note?: ReactNode; flaws?: Flaw[] }) => (<>
  <div className="talk-body talk-step">
    <div className="talk-col"><Code rows={before} tone="vl" />{flaws ? <FlawedVegaLite spec={beforeSpec} flaws={flaws} /> : <VegaLite spec={beforeSpec} />}</div>
    <div className="talk-arrow">→</div>
    <div className="talk-col"><Code rows={after} tone="vl" /><VegaLite spec={afterSpec} /></div>
  </div>
  {note && <p className="talk-note">{note}</p>}
</>);

// Each step's code: the new spec with what changed highlighted. The next slide starts from it, in black.
const ROWS = {
  raw: stepLayout(STEPS.raw),
  parse: stepLayout(STEPS.parse, STEPS.raw),
  layout: stepLayout(STEPS.layout, STEPS.parse),
  theme: stepLayout(STEPS.theme, STEPS.layout),
  final: stepLayout(STEPS.final, STEPS.theme),
};
const DIFF = {
  parse: lineDiff(STEPS.raw, STEPS.parse),
  layout: lineDiff(STEPS.parse, STEPS.layout),
  theme: lineDiff(STEPS.layout, STEPS.theme, 72),
  final: lineDiff(STEPS.theme, STEPS.final, 72),
};
const GLUE_LINES = glue.trimEnd().split('\n').length;

/** What is wrong with the raw chart, circled on it. */
const RAW_FLAWS: Flaw[] = [
  { role: 'marks', label: 'The chart runs far too wide for the page.' },
  { role: 'x-axis', label: 'Months show as raw numbers like 202101.' },
  { role: 'legend', label: 'Losses and gains share one color ramp, with no midpoint at zero.' },
];

/** A brand theme an agent might write from a short style guide; the slide shows this exact object. */
const BRAND_THEME = {
  extends: 'swiss',
  id: 'northwind',
  label: 'Northwind',
  ink: {
    text: { primary: '#14213d', secondary: '#4a5568' },
    series: { single: '#1f3b73', categorical: ['#1f3b73', '#1b998b', '#e3a72f', '#8d99ae', '#c8553d', '#5b8e7d'] },
    accent: '#1b998b',
  },
  type: { headline: { family: "Georgia, 'Times New Roman', serif", weight: 'bold' } },
  structure: { grid: { measure: 'quiet', category: 'omit' } },
} as unknown as ThemeSpec;

const PRESETS: { caption: string; spec: ChartAssemblyInput }[] = [
  { caption: 'Click a bar to highlight it.', spec: gameBars(8, { interaction_spec: { interactions: [{ type: 'click-highlight' }] } } as Partial<ChartAssemblyInput>) },
  { caption: 'Brush a range of months.', spec: lineByType({ interaction_spec: { interactions: [{ type: 'brush-x' }] } } as Partial<ChartAssemblyInput>) },
  { caption: 'Lasso a group of penguins.', spec: penguins([{ type: 'lasso-select' }]) },
  { caption: 'Hover to read both prices at any month.', spec: foodLines([{ type: 'inspect-index', options: { show: 'all' } }]) },
  { caption: 'Click the legend to hide a series.', spec: lineByType({ interaction_spec: { interactions: [{ type: 'legend-toggle' }] } } as Partial<ChartAssemblyInput>) },
  { caption: 'Drag a box to zoom in.', spec: penguins([{ type: 'brush-zoom' }]) },
];

const TLDR_SPEC = `{
  "data": { "values": [...] },
  "semantic_types": {
    "Month": "Date",
    "Price": "Currency",
    "Food": "Category"
  },
  "chart_spec": {
    "chartType": "Line Chart",
    "encodings": {
      "x": "Month", "y": "Price", "color": "Food"
    }
  },
  "theme_spec": "economist",
  "interaction_spec": {
    "interactions": [{ "type": "inspect-index" }]
  }
}`;

// After the Flint version: one request at a time, each starting where the last one left off.
const FLINT_W = 52;

/**
 * The type tree: the drawn boxes and connectors from the sketch, with the branch text set over them in
 * the deck's own type. Both sit on the same 1000 × 720 frame, so the text stays on its line at any size.
 */
const TypeTree = () => (
  <div className="talk-fit">
    <div className="talk-frame" style={{ aspectRatio: '1000 / 720' }}>
      <Sketch name="typesTree" />
      {TYPE_TREE.flatMap((r) => r.leaves).map((l) => (
        <span key={l.text} className={`talk-leaf${l.mono ? ' mono' : ''}${l.tone ? ` ${l.tone}` : ''}`}
          style={{ left: `${((l.mono ? 436 : 396) / 1000) * 100}%`, top: `${(l.y / 720) * 100}%` }}>
          {l.text}
        </span>
      ))}
    </div>
  </div>
);

/** The three use cases, labelled under the sketch's three panels. */
const USE_CASES = [
  { title: 'Explore data', short: 'A chart or a dashboard, right in your chat.', long: 'Ask, and a live chart or dashboard opens in your chat through the Flint MCP server.' },
  { title: 'Build apps', short: 'Flint as a component in your app.', long: 'Your coding agent writes Flint into the app as a component and wires it to the rest of the page.' },
  { title: 'Design', short: 'One theme for every chart.', long: 'Write your house style once as a theme, and every chart in every library follows it.' },
];

/** The three specs, labelled under the sketch's three panels, each in its section color. */
const SPECS = [
  { title: 'The chart spec', short: 'What the data means.', long: 'Semantic types and a layout engine take care of what the data means.', color: '#2f6db5' },
  { title: 'The theme spec', short: 'How it looks.', long: 'A formal specification of style, written once for every chart.', color: '#e8954a' },
  { title: 'The interaction spec', short: 'How it behaves.', long: 'Semantic events and update operators describe how a chart behaves.', color: '#d9534f' },
];

/**
 * A three-panel sketch with readable labels under its panels. With `focus`, the sketch circles that
 * panel, its label is spelled out, and the other two fade back.
 */
const Trio = ({ sketch, items, focus }: {
  sketch: string; items: { title: string; short: string; long: string; color?: string }[]; focus?: number;
}) => (
  <div className="talk-body column" style={{ gap: 8 }}>
    <div className="talk-fit"><Sketch name={focus === undefined ? `${sketch}s` : `${sketch}${focus + 1}`} /></div>
    <div className="talk-usecases">
      {items.map((u, i) => (
        <div key={u.title} className={focus === undefined ? undefined : focus === i ? 'on' : 'off'}>
          <h3 style={focus === i && u.color ? { color: u.color } : undefined}>{i + 1}. {u.title}</h3>
          <p>{focus === i ? u.long : u.short}</p>
        </div>
      ))}
    </div>
  </div>
);
const UseCases = ({ focus }: { focus?: number }) => <Trio sketch="useCase" items={USE_CASES} focus={focus} />;

/** The "draw your guess" demo's interaction, condensed: a trigger, and a handler that answers with an update. */
const BESPOKE_ROWS: CodeRow[] = [
  { text: 'const draw: CanvasInteractionDef = {', hot: true },
  { text: '  id: "draw-guess",' },
  { text: '  eventSource: lassoTrigger("contain"),', hot: true },
  { text: '  affordances: { plot: { cursor: "draw" } },' },
  { text: '  handle(event) {', hot: true },
  { text: '    // the stroke arrives in data units, not pixels', gap: true },
  { text: '    const points = event.geometry.domain.points;' },
  { text: '    const guess = extendPath(drawn, points);' },
  { text: '    if (isComplete(guess)) reveal();' },
  { text: '    // answer with an update: an overlay', gap: true },
  { text: '    return { ops: [', hot: true },
  { text: '      { op: "set-overlay",', hot: true },
  { text: '        name: "guess", value: guess },', hot: true },
  { text: '    ] };', hot: true },
  { text: '  },' },
  { text: '};' },
  { text: '' },
  { text: '<FlintChart spec={coalShare}' },
  { text: '  interactions={[draw, reveal]} />' },
];

/** The World Cup demo's own wiring, condensed: the chart says what was clicked, the page does the rest. */
const APP_ROWS: CodeRow[] = [
  { text: 'const spec = {' },
  { text: '  data,' },
  { text: '  semantic_types: {' },
  { text: '    Team: "Category", Goals: "Count" },' },
  { text: '  chart_spec: { chartType: "Bar Chart",' },
  { text: '    encodings: { x: "Goals", y: "Team" } },' },
  { text: '  interaction_spec: { interactions: [' },
  { text: '    { type: "click-highlight", id: "team" }', hot: true },
  { text: '  ] },' },
  { text: '};' },
  { text: '' },
  { text: '<FlintChart', hot: true },
  { text: '  spec={spec}', hot: true },
  { text: '  onChange={(c) => setTeam(pinnedTeam(c))}', hot: true },
  { text: '/>', hot: true },
  { text: '<ScorerList team={team} />' },
];


/** The parts of the real "economist" preset that the theme slides talk about. */
const ECON = (THEME_PRESETS as Record<string, { spec: Record<string, any> }>).economist.spec;
const ECONOMIST_ROWS = specLayout({
  id: ECON.id,
  ink: {
    series: {
      diverging: { stops: ECON.ink.series.diverging.stops, consumption: ECON.ink.series.diverging.consumption, quantizeCount: ECON.ink.series.diverging.quantizeCount },
      status: { positive: ECON.ink.series.status.positive, negative: ECON.ink.series.status.negative },
    },
    accent: ECON.ink.accent,
  },
  type: { minSize: ECON.type.minSize, headline: { weight: ECON.type.headline.weight } },
  structure: {
    axis: { measure: { line: ECON.structure.axis.measure.line, placement: ECON.structure.axis.measure.placement } },
    grid: { category: ECON.structure.grid.category, zero: ECON.structure.grid.zero },
  },
});

const INTERACTION_ROWS: CodeRow[] = [
  { text: '"interaction_spec": {' },
  { text: '  "interactions": [' },
  { text: '    { "type": "click-group-focus",', hot: true },
  { text: '      "options": { "groupBy": "game" } }', hot: true },
  { text: '  ]' },
  { text: '}' },
  { text: '' },
  { text: '// the event your app receives', gap: true },
  { text: '{ "action": "click-element", "phase": "commit",' },
  { text: '  "target": { "game": "Neon Drift 2049" } }', hot: true },
  { text: '' },
  { text: '// the update it can send back', gap: true },
  { text: '{ "ops": [' },
  { text: '  { "op": "set-style", "targets": [target],', hot: true },
  { text: '    "value": { "state": "emphasized" } },', hot: true },
  { text: '  { "op": "set-annotation", "target": target,', hot: true },
  { text: '    "value": { "text": "Launch month" } }', hot: true },
  { text: '] }' },
];
const TYPES_COMPILED = typesCompiled();
const UPDATES: { id: string; title: string; prompt: string; change: Partial<FlintState> }[] = [
  { id: 'u-theme', title: 'Another theme is a one-line change', prompt: 'Use the Datawrapper style instead.', change: { theme: 'datawrapper' } },
  { id: 'u-swap', title: 'Swapping the axes swaps two names', prompt: 'Put the games across and the months down.', change: { swap: true } },
  { id: 'u-facet', title: 'One panel per region is one more encoding', prompt: 'Split it into a panel for each region.', change: { facet: true } },
  { id: 'u-brush', title: 'Brushing instead of clicking is one line', prompt: 'Let me brush a range of months instead of clicking a game.', change: { brush: true } },
  { id: 'u-pop', title: 'And a pop look is still one line', prompt: 'Now make it pop: bold colors and playful type.', change: { theme: 'pop' } },
];
const UPDATE_SLIDES: SlideDef[] = UPDATES.reduce<{ state: FlintState; slides: SlideDef[] }>(({ state, slides }, u) => {
  const next = { ...state, ...u.change };
  const prev = flintShown(state), shown = flintShown(next);
  const { plus } = lineDiff(prev, shown, FLINT_W);
  slides.push({
    id: u.id, render: () => (<>
      <h2>{u.title}</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '0.8 1 0', gap: 16 }}>
          <p className="talk-task talk-task-sm">"{u.prompt}"</p>
          <Code rows={fullLayout(shown, prev)} />
        </div>
        <div className="talk-col" style={{ flex: '1.2 1 0' }}>
          <Chart spec={flintInput(next)} />
          <p className="talk-caption">{plus === 1 ? 'One line changed' : `${plus} lines changed`}, highlighted. Nothing else in the spec moved.</p>
        </div>
      </div>
    </>),
  });
  return { state: next, slides };
}, { state: FLINT_BASE, slides: [] }).slides;

export const SLIDES: SlideDef[] = [
  // ======================================================== Act 0
  {
    id: 'title', section: 'Opening', kind: 'title', render: () => (<>
      <h1>Flint: a visualization language for the AI era</h1>
      <p className="talk-lead"><a href="https://microsoft.github.io/flint-chart">microsoft.github.io/flint-chart</a></p>
      <div className="talk-grid" style={{ gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr) minmax(0, 0.7fr)', marginTop: 20 }}>
        <Cell><Chart spec={linkedYears} /></Cell>
        <Cell><Demo width={560}><GlobeWarmingStage layout="stacked" /></Demo></Cell>
        <div className="talk-cell talk-stacked-demo"><Stable width={460} height={735}><CountryTableStage themeId="powerbi-light" /></Stable></div>
      </div>
    </>),
  },

  {
    id: 'tldr', render: () => (<>
      <h2>Conclusion</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '0.9 1 0' }}>
          <p className="talk-lead">Flint is a visualization language for AI agents to <strong>reliably create polished data visualizations</strong>. The agent writes a short, simple spec, and Flint's compiler takes care of the rest.</p>
          <ul className="talk-lead" style={{ fontSize: 28 }}>
            <li><strong>52 chart types</strong> on five rendering libraries, from Vega-Lite to native Excel charts.</li>
            <li><strong>{Object.keys(THEME_PRESETS).length} themes and 23 interaction presets</strong>, and room for your own.</li>
            <li>Use it <strong>in chat</strong> through MCP, or <strong>in your app</strong> with a coding agent.</li>
          </ul>
        </div>
        <div className="talk-col talk-stack">
          <div className="talk-card talk-card-code"><Code rows={textRows(TLDR_SPEC)} max={15} min={11} /></div>
          <div className="talk-card talk-card-chart">
            <Chart spec={{ ...foodLines([{ type: 'inspect-index', options: { axis: 'x', show: 'all', displayValue: true, seriesBy: 'Food' } }]), theme_spec: 'economist' } as ChartAssemblyInput} />
          </div>
        </div>
      </div>
    </>),
  },

  // ======================================================== Act 1
  {
    id: 'ideal', section: 'Authoring with Vega-Lite', render: () => (<>
      <h2 className="is-act">Authoring with Vega-Lite</h2>
      <p className="talk-callout">Ideally, a chart is a few lines that are easy to change.</p>
      <div className="talk-body">
        <div className="talk-col"><Code rows={stepLayout(CARS.cars)} max={26} tone="vl" /></div>
        <div className="talk-col"><VegaLite spec={VL.cars} /></div>
      </div>
    </>),
  },
  {
    id: 'ideal-bar', render: () => (<>
      <h2>Switching to a bar chart is one small edit</h2>
      <div className="talk-body">
        <div className="talk-col"><Code rows={fullLayout(CARS.carsBar, CARS.cars)} max={26} tone="vl" /></div>
        <div className="talk-col"><VegaLite spec={VL.carsBar} /></div>
      </div>
    </>),
  },
  {
    id: 'reality', render: () => (<>
      <h2>Let's try a slightly more complicated example</h2>
      <div className="talk-body" style={{ gap: 64 }}>
        <div className="talk-col" style={{ flex: '1.15 1 0' }}>
          <p className="talk-task"><strong>Task:</strong> "Make a heatmap of net new users by game and month for our report page, in The Economist style, and let me click a game to highlight it next to our table."</p>
          <FitTable head={['game', 'region', 'period', 'newUsers']} num={[3]}
            rows={LONG_ROWS.map((r) => [r.game, r.region, r.period.replace('-', ''), r.newUsers])} />
          <p className="talk-note">Rows: 60 months × 24 games × 4 regions = 5,760.</p>
        </div>
        <div className="talk-col"><Code rows={ROWS.raw} max={22} tone="vl" /></div>
      </div>
    </>),
  },
  {
    id: 'broken', render: () => (<>
      <h2>Plug the data in, and the chart breaks</h2>
      <div className="talk-body column">
        <FlawedVegaLite spec={withData(STEPS.raw)} flaws={RAW_FLAWS} />
        <FlawList flaws={RAW_FLAWS} />
      </div>
    </>),
  },
  {
    id: 'attempt-1', render: () => (<>
      <h2>Let's fix parsing and layout</h2>
      <Step
        before={ROWS.raw} beforeSpec={withData(STEPS.raw)}
        after={stepLayout(STEPS.layout, STEPS.raw)} afterSpec={withData(STEPS.layout)}
        note={<>Parse 202101 into a date, sum the four regions, centre the colours on zero, then widen the chart and label each year once: {lineDiff(STEPS.raw, STEPS.layout).plus} lines.</>}
      />
    </>),
  },
  {
    id: 'theme-vl', render: () => (<>
      <h2>Making it look like The Economist is mostly new work</h2>
      <Step
        before={plainLayout(stepLayout(STEPS.layout, STEPS.raw))} beforeSpec={withData(STEPS.layout)}
        after={ROWS.theme} afterSpec={withData(STEPS.theme)}
        note={<>Fonts and axes go into the config, the house colours into the encoding, and the red tab, headline, and source line become extra views placed by hand. The spec grows by {DIFF.theme.plus} lines.</>}
      />
    </>),
  },
  {
    id: 'interaction-vl', render: () => (<>
      <h2>Then clicking a game should highlight its row</h2>
      <Step
        before={plainLayout(ROWS.theme)} beforeSpec={withData(STEPS.theme)}
        after={ROWS.final} afterSpec={picked(STEPS.final, PICKED_GAME)}
        note={<>Selection parameters and conditional styles are woven into the opacity, the stroke, and the axis labels, adding {DIFF.final.plus} lines across the spec.</>}
      />
    </>),
  },
  {
    id: 'app-vl', render: () => (<>
      <h2>Hosting it in our app takes code that speaks in signals</h2>
      <div className="talk-body">
        <div className="talk-col"><Code rows={textRows(glue, true)} tone="vl" /></div>
        <div className="talk-col">
          <VegaLite spec={picked(STEPS.final, PICKED_GAME)} />
          <table className="talk-table" style={{ flex: 'none', fontSize: 18 }}>
            <thead><tr><th>month</th><th>game</th><th>region</th><th className="num">net new users</th></tr></thead>
            <tbody>{PICKED_ROWS.slice(0, 4).map((r, i) => <tr key={i}><td>{r.period}</td><td>{r.game}</td><td>{r.region}</td><td className="num">{fmt(r.newUsers)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <p className="talk-note">{GLUE_LINES} lines, all in signal names.</p>
    </>),
  },
  {
    id: 'tangle', render: () => (<>
      <h2>…and now the code is a tangle</h2>
      <div className="talk-body">
        <div className="talk-col middle">
          <p className="talk-lead">Nine lines became 166 lines of spec and 24 lines of app code.</p>
          <p>Each bar on the right is one line of the final spec, coloured by what it is about: <span className="c-meaning">what the data means</span>, <span className="c-look">how it looks</span>, and <span className="c-behavior">how it behaves</span>. The concern switches 22 times from top to bottom.</p>
        </div>
        <div className="talk-col"><Minimap lines={MINIMAPS.entangle.map(([i, l, c]) => [i, l, c])} links={MINIMAPS.links} /></div>
      </div>
    </>),
  },
  {
    id: 'changes', render: () => (<>
      <h2>Every small request touches the whole file</h2>
      <div className="talk-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {MINIMAPS.changes.map((c) => (
          <div className="talk-cell" key={c.id}>
            <p className="talk-task talk-task-sm">"{UPDATE_PROMPTS[c.id]}"</p>
            <Minimap lines={c.vl.lines} dels={c.vl.dels} diff maxLines={200} />
          </div>
        ))}
      </div>
    </>),
  },

  // Act 1, continued: handing it to an agent
  {
    id: 'five-problems', render: () => (<>
      <h2>Just let an AI agent do it? Five problems show up</h2>
      <div className="talk-body column">
        <div className="talk-fit" style={{ flex: '1.2 1 0' }}><Sketch name="agentProblems" /></div>
        <ul style={{ flex: '1 1 0', columns: 2, columnGap: 56 }}>
          <li>It needs a strong model to be reliable.</li>
          <li>It is slow.</li>
          <li>It is costly, on every request when a product serves users.</li>
          <li>It is unreliable and fragile: charts compile but lie, and nobody is there to catch them.</li>
          <li>It is hard to edit: a small request rewrites large parts of the code.</li>
        </ul>
      </div>
    </>),
  },
  {
    id: 'root-cause', render: () => (<>
      <h2>The root cause is <em>the language</em></h2>
      <div className="talk-body column"><div className="talk-fit"><Sketch name="entangle" /></div></div>
    </>),
  },

  // ======================================================== Act 3
  {
    id: 'lifting', section: 'Flint', render: () => (<>
      <h2 className="is-act">Flint is a language for AI agents that disentangles visual and interaction logic</h2>
      <div className="talk-body column">
        <div className="talk-fit"><Sketch name="lifting" /></div>
      </div>
    </>),
  },
  {
    id: 'flint-version', render: () => (<>
      <h2>The same chart, written in Flint</h2>
      <div className="talk-body">
        <div className="talk-col"><Code rows={stepLayout(flintShown(FLINT_BASE))} /></div>
        <div className="talk-col">
          <Chart spec={flintInput(FLINT_BASE)} />
        </div>
      </div>
    </>),
  },

  ...UPDATE_SLIDES,

  // Section A
  {
    id: 'sec-a', section: 'The chart spec', render: () => (<>
      <h2>1. The chart spec</h2>
      <Trio sketch="spec" items={SPECS} focus={0} />
    </>),
  },
  { id: 'a-how', render: () => (<><h2>Semantic types: say what the data means, and the compiler does the rest</h2><div className="talk-body"><div className="talk-fit"><Sketch name="typesHow" /></div></div></>) },
  {
    id: 'a-what', render: () => (<>
      <h2>What each type decides for this chart</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '0.75 1 0', gap: 22 }}>
          <Code rows={specLayout(TYPES_FLINT, /YearMonth|Category|Profit|semantic_types/)} />
          <p className="talk-callout talk-callout-inline">Semantic types decide data processing, axes, and colors, so the compiler can infer the low-level configuration reliably, without heuristics.</p>
        </div>
        <div className="talk-col" style={{ flex: '1.25 1 0' }}><TypeTree /></div>
      </div>
    </>),
  },
  {
    id: 'a-vl', render: () => (<>
      <h2>And this is what the compiler wrote in Vega-Lite</h2>
      <div className="talk-body talk-step">
        <div className="talk-col" style={{ flex: '0.85 1 0' }}>
          <Code rows={specLayout(TYPES_FLINT, /YearMonth|Category|Profit|semantic_types/)} />
        </div>
        <div className="talk-arrow">→</div>
        <div className="talk-col" style={{ flex: '1.15 1 0' }}>
          <Code rows={TYPES_COMPILED} tone="vl" />
        </div>
      </div>
    </>),
  },
  {
    id: 'a-types', render: () => (<>
      <h2>Semantic types: a small vocabulary with a lot behind it</h2>
      <div className="talk-body column" style={{ gap: 22 }}>
        <div className="talk-fit"><Sketch name="typeCloud" /></div>
        <p className="talk-task"><strong>Agents are really good at this.</strong> Saying that a column is a month, a profit, or a country is just reading the data, and it is far easier than writing parsing, scale, and format code.</p>
      </div>
    </>),
  },
  {
    id: 'a-spring', render: () => (<>
      <h2>The layout engine: the data pushes out, the canvas pushes back</h2>
      <div className="talk-body column">
        <div className="talk-fit"><Sketch name="springModel" /></div>
      </div>
    </>),
  },
  {
    id: 'a-layout-bar', render: () => (<>
      <h2>Try it: more bars ask for more room, and the canvas pushes back</h2>
      <div className="talk-body column"><Stable width={940} height={645}><SizingPlayground mode="discrete" /></Stable></div>
    </>),
  },
  {
    id: 'a-layout-line', render: () => (<>
      <h2>The same balance works for lines over time</h2>
      <div className="talk-body column"><Stable width={940} height={695}><SizingPlayground mode="continuous" /></Stable></div>
    </>),
  },
  {
    id: 'a-backends', render: () => (<>
      <h2>One spec, five rendering libraries</h2>
      <div className="talk-body">
        <div className="talk-col narrow">
          <ul>
            <li>Vega-Lite, with 39 chart types</li>
            <li>ECharts, with 37</li>
            <li>Plotly, with 38</li>
            <li>Chart.js, with 22</li>
            <li>Native Excel charts, with 18 templates</li>
          </ul>
        </div>
        <div className="talk-col wide">
          <div className="talk-grid" style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}>
            <Cell caption="Vega-Lite"><Chart spec={lineByType()} /></Cell>
            <Cell caption="ECharts"><Chart spec={lineByType()} backend="echarts" /></Cell>
            <Cell caption="Plotly"><Chart spec={lineByType()} backend="plotly" /></Cell>
            <Cell caption="Chart.js"><Chart spec={lineByType()} backend="chartjs" /></Cell>
          </div>
        </div>
      </div>
    </>),
  },

  // Section B
  {
    id: 'sec-b', section: 'The theme spec', render: () => (<>
      <h2>2. The theme spec</h2>
      <Trio sketch="spec" items={SPECS} focus={1} />
    </>),
  },
  {
    id: 'b-what', render: () => (<>
      <h2>Name a house style once, and every chart takes it on</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '0.95 1 0' }}><div className="talk-fit"><Sketch name="themeBeforeNow" /></div></div>
        <div className="talk-col" style={{ flex: '1.1 1 0' }}>
          <Code rows={ECONOMIST_ROWS} max={20} />
        </div>
      </div>
    </>),
  },
  { id: 'b-how', render: () => (<><h2>How it works: what the theme says, and what the compiler decides</h2><div className="talk-body"><div className="talk-fit"><Sketch name="themeHow" /></div></div></>) },
  {
    id: 'theme-explorer', render: () => (<>
      <h2>Themes apply to all charts in the library</h2>
      <ThemeExplorer />
    </>),
  },
  // Section C
  {
    id: 'sec-c', section: 'The interaction spec', render: () => (<>
      <h2>3. The interaction spec</h2>
      <Trio sketch="spec" items={SPECS} focus={2} />
    </>),
  },
  {
    id: 'c-what', render: () => (<>
      <h2>Every gesture arrives as something in the data</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '0.95 1 0' }}><div className="talk-fit"><Sketch name="interactionBeforeNow" /></div></div>
        <div className="talk-col" style={{ flex: '1.05 1 0' }}><Code rows={INTERACTION_ROWS} /></div>
      </div>
    </>),
  },
  { id: 'c-how', render: () => (<><h2>How it works: from a gesture to the update</h2><div className="talk-body"><div className="talk-fit"><Sketch name="interactionHow" /></div></div></>) },
  {
    id: 'c-presets', render: () => (<>
      <h2>Twenty-three presets, one line each</h2>
      <div className="talk-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: '1fr 1fr' }}>
        {PRESETS.map((p) => <Cell key={p.caption} caption={p.caption}><Chart spec={p.spec} /></Cell>)}
      </div>
    </>),
  },

  {
    id: 'bespoke-pair', render: () => (<>
      <h2>More bespoke interactions, built the same way</h2>
      <div className="talk-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)' }}>
        <div className="talk-cell">
          <Stable width={560} height={580}><GlobeWarmingStage layout="stacked" /></Stable>
          <p className="talk-caption">Drag to turn the globe; the country facing you is the focus.</p>
        </div>
        <div className="talk-cell">
          <Stable width={900} height={580}><RetailDrilldownStage /></Stable>
          <p className="talk-caption">Scroll to zoom the months, and the bars, axis, and labels are laid out again.</p>
        </div>
      </div>
    </>),
  },

  // Summary
  // ======================================================== Act 4
  {
    id: 'act4', section: 'Applications', render: () => (<>
      <h2 className="is-act">Applications: what can you build with Flint?</h2>
      <UseCases />
    </>),
  },
  {
    id: 'uc-explore', render: () => (<>
      <h2>1. When you explore data</h2>
      <UseCases focus={0} />
    </>),
  },
  {
    id: 'chat-chart', render: () => (<>
      <h2>Ask for a chart, and a live chart opens in the chat</h2>
      <div className="talk-body column"><Stable width={900} height={700}><McpChatTurn kind="chart" /></Stable></div>
    </>),
  },
  {
    id: 'chat-board', render: () => (<>
      <h2>Ask for a dashboard, and its charts work together</h2>
      <div className="talk-body column"><Stable width={900} height={820}><McpChatTurn kind="board" height={820} /></Stable></div>
    </>),
  },
  {
    id: 'uc-apps', render: () => (<>
      <h2>2. When you build apps</h2>
      <UseCases focus={1} />
    </>),
  },
  {
    id: 'app', render: () => (<>
      <h2>Your agent writes Flint as a component of your app</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '0.85 1 0', gap: 16 }}>
          <p className="talk-task talk-task-sm">"Show goals by team, and when I click a team, list its scorers in the panel beside it."</p>
          <Code rows={APP_ROWS} max={20} />
        </div>
        <div className="talk-col" style={{ flex: '1.15 1 0' }}>
          <Stable width={900} height={700}><WorldCupScorersDemo /></Stable>
          <p className="talk-caption">Click a team, and the panel lists its scorers.</p>
        </div>
      </div>
    </>),
  },
  {
    id: 'app-tables', render: () => (<>
      <h2>Connect charts to your own components and tables</h2>
      <div className="talk-body column">
        <Stable width={1000} height={420}><CarOriginTableStage /></Stable>
        <p className="talk-caption">Pick a row in the table, and the chart follows; select points in the chart, and the table follows.</p>
      </div>
    </>),
  },
  {
    id: 'story', render: () => (<>
      <h2>Create interactive data stories</h2>
      <div className="talk-body column">
        <Cell framed><Demo width={1300}><ArticleSection spec={TIME_USE} editable={false} /></Demo></Cell>
        <p className="talk-note">Hover a sentence in the text, and the chart shows what it is about.</p>
      </div>
    </>),
  },
  {
    id: 'bespoke-code', render: () => (<>
      <h2>Create bespoke interactions beyond the presets</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '0.9 1 0', gap: 16 }}>
          <p className="talk-task talk-task-sm">"Let readers draw where they think coal's share of U.S. electricity went, then reveal the real line."</p>
          <Code rows={BESPOKE_ROWS} max={19} />
        </div>
        <div className="talk-col" style={{ flex: '1.1 1 0' }}>
          <Stable width={900} height={620}><YouDrawItStage /></Stable>
          <p className="talk-caption">Draw the line past the cutoff, and the real data appears when you finish.</p>
        </div>
      </div>
    </>),
  },
  {
    id: 'uc-design', render: () => (<>
      <h2>3. When you design</h2>
      <UseCases focus={2} />
    </>),
  },
  {
    id: 'own-theme', render: () => (<>
      <h2>You can create your own theme like a designer</h2>
      <div className="talk-body">
        <div className="talk-col" style={{ flex: '0.85 1 0', gap: 16 }}>
          <p className="talk-task talk-task-sm">"Here is our brand guide: navy and teal, slate for supporting series, Georgia for headlines, and quiet grids. Write a Flint theme so every chart in our reports matches."</p>
          <Code rows={specLayout({ theme_spec: BRAND_THEME })} max={18} />
        </div>
        <div className="talk-grid" style={{ flex: '1.15 1 0', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridTemplateRows: '1fr 1fr' }}>
          <Cell><Chart spec={lineByType({ theme_spec: BRAND_THEME } as Partial<ChartAssemblyInput>)} /></Cell>
          <Cell><Chart spec={gameBars(8, { theme_spec: BRAND_THEME } as Partial<ChartAssemblyInput>)} /></Cell>
          <Cell><Chart spec={{ ...penguins(), theme_spec: BRAND_THEME } as ChartAssemblyInput} /></Cell>
          <Cell><Chart spec={{ ...foodLines(), theme_spec: BRAND_THEME } as ChartAssemblyInput} /></Cell>
        </div>
      </div>
    </>),
  },

  // ======================================================== Act 5
  {
    id: 'recap', section: 'Close', render: () => (<>
      <h2 className="is-act">Flint: a visualization language for AI agents</h2>
      <div className="talk-body column" style={{ gap: 20 }}>
        <div className="talk-fit"><Sketch name="lifting" /></div>
        <p className="talk-task" style={{ margin: 0 }}><strong>Open source, MIT license.</strong> <code>flint-chart</code> on npm and PyPI, and the <code>flint-chart-mcp</code> server for your agent, at <a href="https://github.com/microsoft/flint-chart">github.com/microsoft/flint-chart</a>.</p>
      </div>
    </>),
  },
  {
    id: 'try', render: () => (<>
      <h2>Let's build with Flint</h2>
      <div className="talk-cta-wrap">
      <div className="talk-cta-sketch"><Sketch name="useCases" /></div>
      <div className="talk-body talk-cta">
        <div className="talk-col talk-cta-card meaning">
          <h3>1. If you explore data</h3>
          <p>Add the Flint MCP server to GitHub Copilot or your own agent with <code>npx -y flint-chart-mcp</code>, and ask for charts and dashboards right in the chat.</p>
        </div>
        <div className="talk-col talk-cta-card behavior">
          <h3>2. If you build apps</h3>
          <p>Build Flint into your product with <code>npm install flint-chart</code>. Give your agent the Flint skills, and its charts will talk to your tables, widgets, and app state.</p>
        </div>
        <div className="talk-col talk-cta-card look">
          <h3>3. If you design</h3>
          <p>Let's work on new themes together. Your team's style guide can become a Flint theme that every chart follows.</p>
        </div>
      </div>
      <p className="talk-task talk-collab"><strong>We want to collaborate!</strong> Ping me and I'm happy to demonstrate Flint to your team, and to work together on the next generation of interactive artifacts.</p>
      </div>
      <p className="talk-lead" style={{ flex: 'none', margin: 0 }}>
        <a href="https://github.com/microsoft/flint-chart">github.com/microsoft/flint-chart</a> and <a href="https://microsoft.github.io/flint-chart">microsoft.github.io/flint-chart</a>
      </p>
    </>),
  },
];
