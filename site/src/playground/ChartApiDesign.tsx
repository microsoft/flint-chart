import type { CSSProperties, ReactNode } from 'react';
import { CodeBlock } from '../components/CodeBlock';
import { siteTheme } from '../shared/theme';

const page: CSSProperties = { width: 'min(100%, 1180px)', display: 'flex', flexDirection: 'column', gap: 44, color: siteTheme.text };
const section: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const h2: CSSProperties = { margin: 0, fontSize: 18, fontWeight: 650 };
const prose: CSSProperties = { margin: 0, fontSize: 14, lineHeight: 1.65, color: siteTheme.textMuted, maxWidth: 860 };
const list: CSSProperties = { ...prose, paddingLeft: 18, display: 'grid', gap: 4 };
const pair: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16, alignItems: 'start' };
const label: CSSProperties = { fontSize: 11.5, fontWeight: 650, letterSpacing: 0.4, textTransform: 'uppercase', color: siteTheme.navInactive, margin: '0 0 -4px' };
const code: CSSProperties = { margin: '8px 0 0', fontSize: 12, lineHeight: 1.5, padding: 12, border: `1px solid ${siteTheme.border}` };

function Code({ title, language = 'tsx', children }: { title?: string; language?: string; children: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      {title && <p style={label}>{title}</p>}
      <CodeBlock language={language} variant="light" customStyle={code}>{children.trim()}</CodeBlock>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={section}>
      <h2 style={h2}>{title}</h2>
      {children}
    </section>
  );
}

const SHIP_TODAY = `
npm flint-chart
  /, /core, /<backend>        assemble* for every backend, validate
  /interactive                buildInteractiveChart, presets, triggers
  /<backend>/interactive      renderer adapters, loaded on demand
  /test-data, /gallery        fixtures
  peers (all optional)        vega, vega-lite, vega-tooltip,
                              echarts, chart.js, plotly.js
  dependencies                @floating-ui/dom, d3-time(-format)

npm flint-chart-mcp           MCP server + App UI (bundles flint-chart)
flint-py                      source-only Python port: core + vegalite

No framework binding. No static render entry point: the only DOM
API is named "interactive", so static rendering is left to each host.
`;

const SHIP_NEXT = `
npm flint-chart
  /, /core, /<backend>        unchanged
  /interactive                + mountChart
                              (buildInteractiveChart kept as alias)
  /render           (new)     renderSvg(spec, options): Promise<string>
  /react            (new)     FlintChart; peer react >= 18, optional

Shipped with it, in the library (full list in section 7):
  addTooltips defaults to false on every path
  same-id override when spec and code define one interaction
  static render + warning when a backend can't run interactions
  onChange compares state; ChartChange gains source, changed, previous
  ChartState gains annotations; entries remember their last writer
  VL legend labels get interactive: true when they carry a tooltip
`;

const DOWNSTREAM_SITE = `
this site today                            after
VegaLiteView + vega-embed legend patch     <FlintChart>; patch moves into the VL assembler
EChartsView / ChartjsView / PlotlyView     <FlintChart backend={...}>
  for hand-authored backend specs          kept, site-only
InteractiveVegaLiteView                    <FlintChart> + a site ChartDiagnostics list
hasInteractionEntries                      deleted
~20 bespoke useEffect mounts               <FlintChart updates onInteraction onRender>
`;

const DOWNSTREAM_MCP_BEFORE = `
// packages/flint-mcp/ui/src/FlintApp.tsx (abridged)
const interactive =
  (current.interaction_spec?.interactions?.length ?? 0) > 0
  || updates.length > 0;

{interactive
  ? <InteractiveChart app={app} input={previewInput} updates={updates} />
  : <div dangerouslySetInnerHTML={{ __html: render.svg }} />}

function InteractiveChart({ app, input, updates }) {
  useEffect(() => {
    let live = true;
    const surface = buildInteractiveChart(mount, input, {
      backend: 'vegalite', renderer: 'svg', expressionInterpreter, updates,
    });
    void surface.warnings.then((list) => live && onWarnings(list));
    surface.onChange(({ phase, state, action, geometry }) => {
      if (phase !== 'commit') return;
      const context = chartContext(state, input, { action, geometry });
      void app.updateModelContext({
        content: [{ type: 'text', text: context.text }],
      });
    });
    return () => { live = false; surface.destroy(); };
  }, [app, input, updates]);
}
`;

const DOWNSTREAM_MCP_AFTER = `
// CSP-safe Vega: host webviews forbid eval
<FlintChart
  spec={previewInput}
  updates={updates}
  renderer="svg"
  expressionInterpreter={expressionInterpreter}
  width="100%"
  fit={autoSize ? 'relayout' : 'scale-down'}   // labels keep their size in narrow panels
  onWarnings={setSurfaceWarnings}
  onChange={(c) => {
    if (c.phase !== 'commit') return;
    const context = chartContext(c.state, previewInput, c);
    void app.updateModelContext({
      content: [{ type: 'text', text: context.text }],
    });
  }}
/>

// Every chart, static or live, goes through this one component;
// Copy PNG renders the image on demand at the same width.
`;

const DOWNSTREAM_EXTERNAL = `
// External hosts that compile and embed themselves (e.g. Data Formulator)
const vl = assembleVegaLite(spec);   // still supported, nothing to change
await embed(el, vl);

// Optional move: same result, plus interaction_spec and onChange for free
<FlintChart spec={spec} />
`;

const STATIC_BEFORE = `
import { assembleVegaLite, assembleECharts } from 'flint-chart';
import embed from 'vega-embed';
import * as echarts from 'echarts';

// Flint stops at a backend spec; the caller wires each renderer.
const vl = assembleVegaLite(spec);
await embed('#chart', vl, { actions: false });

const option = assembleECharts(spec);
const chart = echarts.init(document.querySelector('#chart-2')!);
chart.setOption(option);
window.addEventListener('resize', () => chart.resize());
`;

const STATIC_BEFORE_REACT = `
// site/src/components/TripleChart.tsx: one branch per backend
{backend === 'vegalite' && <VegaLiteView spec={assembleVegaLite(spec)} />}
{backend === 'echarts' && <EChartsView option={assembleECharts(spec)} />}
{backend === 'chartjs' && <ChartjsView config={assembleChartjs(spec)} />}
{backend === 'plotly' && <PlotlyView figure={assemblePlotly(spec)} />}
`;

const STATIC_AFTER = `
import { FlintChart } from 'flint-chart/react';

// No interactions declared: static
<FlintChart spec={spec} />

// Same spec, another renderer
<FlintChart spec={spec} backend="echarts" />

// Tooltips are presentation, so they live in the spec
const withTips = {
  ...spec,
  options: { ...spec.options, addTooltips: true },
};
<FlintChart spec={withTips} />
`;

const STATIC_AFTER_VANILLA = `
// Unchanged API, new name; buildInteractiveChart remains as an alias
import { mountChart } from 'flint-chart/interactive';

const chart = mountChart(element, spec, { backend: 'vegalite' });
await chart.ready;
chart.destroy();
`;

const STATIC_KEEP = `
// Unchanged: compile when you need the backend spec itself
// (SSR, export, notebooks, MCP compile_chart, hand edits)
const vl = assembleVegaLite(spec);
`;

const APP_BEFORE_BRANCH = `
// site/src/components/TripleChart.tsx and routes/Editor.tsx
// The caller inspects the spec to pick a mode the spec already implies.
{hasInteractionEntries(spec)
  ? <InteractiveVegaLiteView input={spec} />
  : <VegaLiteView spec={assembleVegaLite(spec)} />}
`;

const APP_BEFORE_VIEW = `
// InteractiveVegaLiteView: lifecycle every app rewrites
useEffect(() => {
  const host = ref.current;
  if (!host) return;
  let live = true;
  let surface: InteractiveChartSurface;
  try {
    surface = buildInteractiveChart(host, spec, {
      backend: 'vegalite',
      renderer: 'svg',
    });
  } catch (err) {
    setError(String(err));
    return;
  }
  void surface.warnings.then((list) => live && setWarnings(list));
  void surface.ready.catch((err) => live && setError(String(err)));
  const unsubscribe = surface.onChange((change) => {
    if (live && change.phase === 'commit') setSelection(change.state);
  });
  return () => {
    live = false;
    unsubscribe();
    surface.destroy();
  };
}, [spec]);
`;

const APP_AFTER = `
// spec: e.g. agent output; its interaction_spec runs as-is
// interactions: the app's own additions
<FlintChart
  spec={spec}
  interactions={[legendToggle()]}
  onChange={(c) => c.phase === 'commit' && setSelection(c.state)}
  onWarnings={setWarnings}
  onError={setError}
/>
`;

const APP_CONFLICTS = `
// spec.interaction_spec.interactions:
//   [{ type: 'click-highlight' }, { type: 'inspect' }]

// Array: added on top. Same id ('click-highlight'),
// so the code entry replaces the spec entry.
<FlintChart
  spec={spec}
  interactions={[clickHighlight({ targets: ['mark'] })]}
/>

// Function: full control over what the spec declared.
<FlintChart
  spec={spec}
  interactions={(fromSpec) => fromSpec.filter((d) => d.id !== 'inspect')}
/>
`;

const BESPOKE_BEFORE = `
// site/src/playground/IndexChartStage.tsx (abridged)
useEffect(() => {
  const mount = mountRef.current;
  if (!mount) return;
  const handleInteraction = (event: Event) => {
    const { detail } = event as CustomEvent<FlintInteractionEventDetail>;
    if (detail.interactionId !== INSPECT_ID) return;
    if (detail.event.phase === 'cancel') return;
    moveReferenceDate(detail.event.geometry.plot);
  };
  mount.addEventListener('flint-interaction', handleInteraction);
  const surface = buildInteractiveChart(mount, chartInput(initialRows), {
    backend: 'vegalite', renderer: 'svg', chartId: 'index-chart-stage',
  });
  surfaceRef.current = surface;
  void surface.ready.then(() => {
    if (mount.isConnected) setPlotBounds(measurePlotBounds(mount));
  });
  return () => {
    mount.removeEventListener('flint-interaction', handleInteraction);
    surfaceRef.current = null;
    surface.destroy();
  };
}, [initialRows]);

// A second effect waits for readiness, then pushes re-indexed rows.
useEffect(() => {
  const surface = surfaceRef.current;
  if (!surface) return;
  let cancelled = false;
  void surface.ready.then(async () => {
    if (cancelled) return;
    await surface.applyUpdate({
      id: 'indexed-rows',
      ops: [{
        op: 'set-data', source: 'main', value: { rows: indexedRows },
      }],
    });
    setPlotBounds(measurePlotBounds(mountRef.current!));
  });
  return () => { cancelled = true; };
}, [indexedRows]);
`;

const BESPOKE_AFTER = `
const dataUpdate = useMemo(() => ({
  id: 'indexed-rows',
  ops: [{
    op: 'set-data', source: 'main', value: { rows: indexedRows },
  }],
}), [indexedRows]);

// spec declares inspect-index in interaction_spec
// updates: controlled, queued until ready, diffed by id
<FlintChart
  spec={chartInput(initialRows)}
  updates={[dataUpdate]}
  onInteraction={({ interactionId, event }) => {
    if (interactionId === INSPECT_ID && event.phase !== 'cancel') {
      moveReferenceDate(event.geometry.plot);
    }
  }}
  onRender={(chart) => setPlotBounds(measurePlotBounds(chart.element))}
/>
{/* The bespoke overlay stays app code */}
<svg className="index-chart-overlay">…</svg>
`;

const BESPOKE_CUSTOM = `
// Bespoke behaviour is code: a definition with handle() -> ChartUpdate
const dragProjection: CanvasInteractionDef = {
  id: 'drag-projection',
  eventSource: dragTrigger,
  affordances: { mark: { cursor: 'drag' } },
  handle: (event, context) => projectMonth(event, context),
};

// Driven from outside the chart: an external definition plus dispatch
const playback = externalInteraction({
  id: 'playback',
  handle: (frame: number) => frameUpdate(frame),
});

const chart = useRef<FlintChartHandle>(null);
<FlintChart
  spec={climateSpec}
  interactions={[dragProjection, playback]}
  ref={chart}
/>
// chart.current?.dispatch('playback', 3);
`;

const EVENTS_BEFORE = `
// Today: one call per handled event, state attached, never compared
surface.onChange((change) => {
  // also fires for a click that hit nothing (handle returned null),
  // and again for the app's own applyUpdate / setUpdates
  setSelection(change.state.selected); // re-renders when nothing moved
});
`;

const EVENTS_TYPE = `
interface ChartChange {
  phase: 'preview' | 'commit' | 'cancel';
  source: 'reader' | 'host';
  changed: readonly ChartStateFacet[];  // the parts of state that moved
  state: ChartState;
  previous: ChartState;
  // The cause: a reader gesture, or an external interaction run by dispatch
  interactionId?: string;
  action?: CanvasInteractionAction;
  target?: SemanticTarget | null;
  geometry?: CanvasInteractionEvent['geometry'];
}

type ChartStateFacet =
  | 'selected' | 'hidden' | 'viewport' | 'windows' | 'categoryOrder'
  | 'annotations';
`;

const EVENTS_AFTER = `
<FlintChart
  spec={spec}
  updates={restoredFromUrl}
  onChange={(c) => {
    if (c.source === 'host' || c.phase !== 'commit') return;
    if (c.changed.includes('selected')) setSelection(c.state.selected);
    if (c.changed.includes('viewport')) writeUrl({ view: c.state.viewport });
  }}
  onInteraction={(d) => track(d.interactionId, d.event.action)}
/>
`;

const EVENTS_ORDER = `
pointer event
  -> onInteraction(detail)         every gesture event, effect or not
  -> handle(event, context)        ChartUpdate | null
  -> render
  -> onChange(change)              only if the state key differs
`;

const FLOW_SELF_BEFORE = `
// ClickFocusLab / InteractionGallery (abridged): one mount per chart
useEffect(() => {
  const container = ref.current;
  if (!container) return;
  const surface = buildInteractiveChart(container, input, {
    backend: 'vegalite',
    renderer: 'svg',
    interactions: [brushX(), legendSelection],
  });
  return () => surface.destroy();
}, [input]);
`;

const FLOW_SELF_AFTER = `
// Declared in the spec, as JSON (e.g. written by an agent)
//   interaction_spec: { interactions: [{ type: 'brush-x' }] }
<FlintChart spec={spec} />

// Or in code: presets and a custom handle side by side
const legendSelection: CanvasInteractionDef = {
  id: 'legend-selection',
  eventSource: clickTrigger,
  affordances: { 'legend-item': { cursor: 'activate' } },
  handle: (event) => event.action === 'click-legend' && event.target
    ? { id: 'legend-selection', ops: [{
        op: 'set-style', targets: [event.target],
        value: { state: 'emphasized' },
      }] }
    : null,
};

<FlintChart spec={spec} interactions={[brushX(), legendSelection]} />
`;

const FLOW_CC_BEFORE = `
// InteractionDashboardLab.tsx (abridged)
const surfaces = useRef(new Map<string, InteractiveChartSurface>());

const dispatchSelection = (ids: string[], excludeId?: string) => {
  for (const [id, surface] of surfaces.current) {
    if (id === excludeId) continue;
    void surface.dispatch(LINKED_ID, { observationIds: ids });
  }
};

// Routed writes are host calls with no interaction id,
// so they do not route again.
const routeSelection = (sourceId: string, change: ChartChange) => {
  if (change.phase !== 'commit' || !change.interactionId) return;
  const ids = observationIds(change.target);
  dispatchSelection(ids, sourceId);
  setSelection(ids);
};

const registerSurface = (id, surface) => {
  unsubscribes.get(id)?.();
  if (!surface) return surfaces.delete(id);
  surfaces.set(id, surface);
  unsubscribes.set(id, surface.onChange((c) => routeSelection(id, c)));
};

// Each panel also carries an externalInteraction that turns
// { observationIds } into a set-style update.
`;

const FLOW_CC_AFTER = `
const [link, setLink] = useState({ source: '', ids: [] as string[] });

{charts.map((chart) => (
  <FlintChart
    key={chart.id}
    spec={chart.spec}
    interactions={[chart.interaction]}
    updates={chart.id === link.source ? [] : linked(chart, link.ids)}
    onChange={(c) => {
      if (c.source !== 'reader' || c.phase !== 'commit') return;
      setLink({ source: chart.id, ids: observationIds(c.state.selected) });
    }}
  />
))}

// linked(): emphasis under the chart's own interaction id, so a routed
// selection replaces that chart's earlier one. Host writes report
// source 'host', so nothing routes twice.
`;

const FLOW_EC_BEFORE = `
// ExternalToChartLab.tsx (abridged)
const interactions = useMemo(() => [externalInteraction({
  id: CONTROL_ID,
  handle: (payload) => ({ id: CONTROL_ID, ops: emphasis(payload.match) }),
})], []);

const handleSurface = (surface) => {
  surfaceRef.current = surface;
  if (surface) void surface.ready.then(() => {
    if (payloadRef.current) surface.dispatch(CONTROL_ID, payloadRef.current);
  });
};

const select = async (payload) => {
  payloadRef.current = payload;
  setLastPayload(payload);
  const surface = surfaceRef.current;
  if (!surface) return;
  await surface.ready;
  await surface.dispatch(CONTROL_ID, payload);
};
`;

const FLOW_EC_AFTER = `
const [match, setMatch] = useState<Match | null>(defaultMatch);

const updates = useMemo(() => match
  ? [{ id: 'control', ops: emphasis(match) }]
  : [], [match]);

<FlintChart spec={spec} updates={updates} />
<Control value={match} onSelect={setMatch} />

// Initial selection is initial state; clearing removes the entry.
// dispatch stays for commands that need the chart's context.
`;

const FLOW_CE_BEFORE = `
// InteractionDemoChart.tsx: the site's private FlintChart
useEffect(() => {
  const mount = mountRef.current;
  if (!mount) return;
  const handle = (e: Event) => onSemanticEvent?.(
    (e as CustomEvent<FlintInteractionEventDetail>).detail,
  );
  mount.addEventListener('flint-interaction', handle);
  const surface = buildInteractiveChart(mount, fixture.input, {
    backend: 'vegalite', renderer: 'svg', interactions, updates,
  });
  onSurface?.(surface);
  const unsubscribe = onChange ? surface.onChange(onChange) : undefined;
  return () => {
    onSurface?.(null);
    unsubscribe?.();
    mount.removeEventListener('flint-interaction', handle);
    surface.destroy();
  };
}, [fixture, interactions, updates, onChange, onSemanticEvent, onSurface]);

// ChartToExternalLab.tsx: rebuilds the panel on every report
<InteractionDemoChart fixture={fixture} onChange={handleChange} />
`;

const FLOW_CE_AFTER = `
<FlintChart
  spec={spec}
  onChange={(c) => {
    if (c.changed.includes('selected')) setShown(c.state.selected);
    if (c.changed.includes('viewport') && c.phase === 'commit') {
      setVisibleRows(rowsIn(c.state.viewport));
    }
  }}
  onInteraction={({ event }) => setHover(event.target)}
/>

// Hover readouts that change nothing on the chart use onInteraction;
// panels that mirror chart state use onChange.
`;

const FLOW_BI_BEFORE = `
// ExternalToChartLab.tsx, bidirectional mode (abridged)
// Two writers own the same emphasis; each clears the other by hand.
const onChartEvent = (detail) => {
  const { phase, target } = detail.event;
  if (phase === 'start' || phase === 'cancel') return;
  const continent = target?.elements[0]?.value.Continent;
  setLastPayload(continent ? { match: { Continent: continent } } : null);
  // drop the control's emphasis
  void surfaceRef.current?.clearUpdate(CONTROL_ID);
};

const select = async (payload) => {
  const surface = surfaceRef.current;
  await surface.ready;
  // drop the click's emphasis, and everything else
  await surface.setUpdates([]);
  await surface.dispatch(CONTROL_ID, payload);
};
`;

const FLOW_BI_AFTER = `
// One owner: the app. The update reuses the interaction's id,
// so a click and the control write the same entry.
const [continent, setContinent] = useState<string | null>(null);

// Must draw what clickGroupFocus draws, or a click's look is replaced
const updates = useMemo(() => continent
  ? [selectionUpdate('click-group-focus', { Continent: continent })]
  : [], [continent]);

<FlintChart
  spec={spec}
  interactions={[clickGroupFocus({ groupBy: 'Continent' })]}
  updates={updates}
  onChange={(c) => {
    if (c.source !== 'reader' || c.phase !== 'commit') return;
    setContinent(continentOf(c.state.selected));
  }}
/>
<ContinentControl value={continent} onChange={setContinent} />

// Click -> onChange -> state -> same update -> same state: no echo.
// Click on empty space clears the entry; the prop then drops the id,
// which is a no-op because the reader, not the host, wrote last.
`;

const SIZE_BEFORE = `
// this site: every chart wrapped for fitting
<ScaleToFit height={360} minHeight={280} adaptiveHeight padding={8}>
  <InteractiveVegaLiteView input={input} />
</ScaleToFit>

// MCP App UI: re-lays out to the measured box
const previewInput = useMemo(
  () => withAppPreviewDefaults(
    current,
    chartWidth ? { width: chartWidth } : undefined,
  ),
  [current, chartWidth],
);
`;

const SIZE_AFTER = `
// Layout size: compiler input, in the spec. Changing it re-lays out.
const spec = {
  ...input,
  chart_spec: {
    ...input.chart_spec,
    baseSize: { width: 400, height: 320 },   // target
    canvasSize: { width: 600, height: 480 }, // ceiling under pressure
  },
};

// Box: the host sizes it; fit says how the chart meets it.
<FlintChart spec={spec} />                            // natural size, no box
<FlintChart spec={spec} width="100%" />               // scale-down: scale down to fit
<FlintChart spec={spec} width={320} height={240}
            fit="crop" />                            // natural size, clipped
<FlintChart spec={spec} width="100%" fit="relayout" /> // the box becomes canvasSize:
                                                      // laid out again for the room
`;

const V1_SPEC_CHANGE = `
spec prop changes
  same object                  -> nothing
  same content                 -> nothing   (reference first; data by reference,
                                             the rest hashed)
  content differs              -> remount: new view, host updates reapplied

reader state (selection, viewport, toggles) -> lost, as today
keep it across a spec change -> mirror out with onChange, send back as
                                updates under the interaction's id
                                (not legend toggles until presets drop
                                private state)
fast data-only paths         -> set-data through updates or ref still works
`;

const V1_PERF = `
                       today                                   v1
when a chart remounts  new input object (useEffect([input]));    content differs; never more often
                       inline specs remount every render        than today
cost of deciding       none                                     identity check, then a hash of
                                                                everything but data
host updates           setUpdates at mount, wipes reader state  changed ids only
data-only changes      set-data pages avoid remounting          remount on a new spec; set-data via
                                                                updates or ref keeps the fast path
static charts          vega-embed                               Flint mount with no interactions;
                                                                first-mount and bundle cost UNMEASURED
per-gesture cost       -                                        unchanged (same runtime)
`;

const V1_ABILITY = `
                          today                               v1
static vs interactive     host chooses and wires it           follows from what is declared
backends                  a branch per backend in each host   backend prop; static fallback + warning
onChange                  per event, can loop                 real changes, with source and changed
app vs reader state       setUpdates wipes the reader's       side by side; same id = takeover
sizing                    ScaleToFit, hand-rolled re-layout   width / height / fit (contain, crop, relayout)
static export             each host                           renderSvg
reader state on spec      lost                                lost (unchanged)
Vega View access          VegaLiteView onReady                none; ref is the Flint surface
vega-embed extras         actions menu, legend patch          legend fix in library; no actions menu
`;

const V1_LATER = `
step                                       changes        prerequisite
data-only changes in place                 performance    compare compiled output; Vega changeset
  (compiled output differs only in rows)
reapply stored updates after a remount     ability        presets keep no private state
  (reader state survives where it resolves)               (legendToggle hidden list, region gestures)
surface.setInput for non-React hosts       both           the two steps above

None of these changes the component's props.
`;

const PROPS = `
interface FlintChartProps {
  spec: ChartAssemblyInput;            // the Flint spec, interaction_spec included
  backend?: InteractiveBackend;        // default 'vegalite'
  interactions?:
    | readonly InteractionDef[]                                     // added on top of the spec's
    | ((fromSpec: readonly InteractionDef[]) => InteractionDef[]);  // full control
  updates?: readonly ChartUpdate[];    // host updates, applied by id diff
  renderer?: 'svg' | 'canvas';
  expressionInterpreter?: unknown;     // CSP hosts: Vega without eval; read at mount
  background?: string;
  width?: number | string;             // the box; omitted: natural size
  height?: number | string;
  fit?: 'scale-down' | 'crop' | 'relayout'; // default 'scale-down'

  onChange?(change: ChartChange): void;                        // the semantic state moved
  onInteraction?(detail: FlintInteractionEventDetail): void;   // every gesture event
  onRender?(chart: InteractiveChartSurface): void;             // after each mount and applied update
  onWarnings?(warnings: readonly ChartWarning[]): void;
  onError?(error: Error): void;        // the chart failed; the box shows a muted error
  fallback?: ReactNode;                // server render; default: empty box at the compiled size

  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;                  // applied in place
  chartId?: string;                    // identity: a new id remounts
}

interface FlintChartHandle {           // the ref; follows remounts
  readonly surface: InteractiveChartSurface | null;
  applyUpdate(update, options?): Promise<ChartUpdateResult | null>;
  clearUpdate(id): Promise<void>;
  dispatch(interactionId, payload): Promise<ChartUpdateResult | null>;
  getState(): ChartState | undefined;
  refresh(): void;
}
`;

export function ChartApiDesign() {
  return (
    <div className="dev-page">
      <div style={page}>
        <header style={section}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 650 }}>API design: one chart entry point</h1>
          <p style={prose}>
            Proposal: a <code>&lt;FlintChart spec={'{…}'} /&gt;</code> component (and a matching imperative
            <code> mountChart</code>) becomes the default way to render Flint. Behaviour comes only from what is
            declared: no interactions means a static chart, there is no <code>interactive</code> flag. The
            compile functions (<code>assemble*</code>) and the surface API stay as the lower layers. Each section
            compares current code from this repository with the proposed form.
          </p>
          <Code language="text">{`
Compile    assembleVegaLite / assembleECharts / ...   spec in, backend spec out (unchanged)
Mount      mountChart(element, spec, options)         DOM, imperative; static or interactive
Component  <FlintChart spec={...} />                  flint-chart/react, wraps mountChart
`}</Code>
        </header>

        <Section title="Shipping and downstream use">
          <ul style={list}>
            <li><strong>Today</strong> Flint ships compilers plus a DOM layer framed as interactive. Everything that turns
              a Flint spec into a chart on screen (picking the renderer, choosing static or interactive, lifecycle,
              warnings) is written by each host. This site and the MCP App UI each wrote their own.</li>
            <li><strong>Next</strong> the compilers are unchanged. The DOM layer becomes the general mount
              (<code>mountChart</code>) and gains a React binding. The library fixes found while writing this page
              ship with it, including the legend tooltip fix the site currently patches in.</li>
            <li><strong>Downstream</strong> the site and MCP App UI replace their wrappers with <code>FlintChart</code>.
              Backend views remain only for specs Flint didn't produce. External hosts that compile and embed
              themselves keep working as before.</li>
          </ul>
          <div style={pair}>
            <Code title="Ships today" language="text">{SHIP_TODAY}</Code>
            <Code title="Ships next" language="text">{SHIP_NEXT}</Code>
          </div>
          <Code title="Downstream: this site" language="text">{DOWNSTREAM_SITE}</Code>
          <div style={pair}>
            <Code title="Before: downstream MCP App UI">{DOWNSTREAM_MCP_BEFORE}</Code>
            <div>
              <Code title="After: MCP App UI">{DOWNSTREAM_MCP_AFTER}</Code>
              <Code title="Downstream: external hosts">{DOWNSTREAM_EXTERNAL}</Code>
            </div>
          </div>
        </Section>

        <Section title="1. Static use">
          <ul style={list}>
            <li><strong>Today</strong> Flint stops at a backend spec. The caller installs the renderer, mounts it,
              handles resize and teardown, and repeats that per backend; the site carries one branch per backend.</li>
            <li><strong>Proposed</strong> rendering is part of Flint. The backend is a prop, its renderer loads on demand,
              and tooltips are a spec option (<code>options.addTooltips</code>, default <code>false</code> everywhere).</li>
            <li><strong>Unchanged</strong> <code>assemble*</code> remains the right call when the backend JSON is the
              product. A hand-edited backend spec is rendered by that backend's own renderer; <code>FlintChart</code> only takes Flint specs.</li>
          </ul>
          <div style={pair}>
            <div>
              <Code title="Before: vanilla">{STATIC_BEFORE}</Code>
              <Code title="Before: downstream React (this site)">{STATIC_BEFORE_REACT}</Code>
            </div>
            <div>
              <Code title="After: React">{STATIC_AFTER}</Code>
              <Code title="After: vanilla">{STATIC_AFTER_VANILLA}</Code>
              <Code title="Still available">{STATIC_KEEP}</Code>
            </div>
          </div>
        </Section>

        <Section title="2. App-level chart">
          <ul style={list}>
            <li><strong>Today</strong> the caller inspects the spec and picks the static or interactive view, then
              rewrites the mount lifecycle: the <code>live</code> flag, warnings, errors, change listener, teardown.</li>
            <li><strong>Proposed</strong> one component with no mode. Spec interactions run automatically; the
              <code> interactions</code> prop adds to them. Precedence is code over spec.</li>
            <li><strong>Conflicts</strong> same id: the code entry replaces the spec entry with an info warning
              (today this throws). Same trigger: the existing narrowing, and the spec entry yields to code. A spec entry
              the chart can't support is dropped with a warning. Any error fails the chart instead of hiding: a code
              definition that is unsupported, conflicts with another code definition, or repeats an id, a malformed
              <code> interaction_spec</code>, or a compile error. <code>onError</code> receives it and the box shows a
              muted error in place of the chart.
              Interactions on a backend that can't run them render static with a warning (today the mount fails).</li>
          </ul>
          <div style={pair}>
            <div>
              <Code title="Before: downstream, choosing a mode (this site)">{APP_BEFORE_BRANCH}</Code>
              <Code title="Before: downstream, mounting (this site)">{APP_BEFORE_VIEW}</Code>
            </div>
            <div>
              <Code title="After">{APP_AFTER}</Code>
              <Code title="After: spec and code together">{APP_CONFLICTS}</Code>
            </div>
          </div>
        </Section>

        <Section title="3. Bespoke interaction">
          <ul style={list}>
            <li><strong>Today</strong> most of a bespoke stage is plumbing: a DOM listener filtered by interaction id,
              readiness sequencing with a <code>cancelled</code> flag, a ref to reach the surface from a second effect,
              and manual cleanup.</li>
            <li><strong>Proposed</strong> the component absorbs the plumbing and leaves the domain logic. Host updates
              become a controlled <code>updates</code> prop (queued until ready, diffed by id); raw events arrive through
              <code> onInteraction</code>; <code>onRender</code> fires after mount and after each applied update, which
              is when overlays re-measure.</li>
            <li><strong>Where code goes</strong> behaviour (<code>handle → ChartUpdate</code>) is a custom definition in
              <code> interactions</code>; reacting in the app is <code>onChange</code> or <code>onInteraction</code>;
              driving from outside is <code>externalInteraction</code> plus <code>ref.dispatch</code>. Preset options
              stay JSON-serialisable, so callbacks never go in them (<code>clickAnnotate.format</code> is the one
              exception to fix, see section 7).</li>
          </ul>
          <div style={pair}>
            <Code title="Before: downstream bespoke stage (this site)">{BESPOKE_BEFORE}</Code>
            <div>
              <Code title="After">{BESPOKE_AFTER}</Code>
              <Code title="After: custom and external behaviour">{BESPOKE_CUSTOM}</Code>
            </div>
          </div>
        </Section>

        <Section title="4. Chart-to-app events">
          <ul style={list}>
            <li><strong>Today</strong> <code>onChange</code> fires once per handled event with a state snapshot. It
              fires when <code>handle()</code> returned nothing, and again for the host's own <code>applyUpdate</code>,
              <code> setUpdates</code> and <code>clearUpdate</code>. Only previews are deduplicated, and by gesture,
              not by state. An app that writes the state back through <code>updates</code> can loop.</li>
            <li><strong>Proposed</strong> two callbacks with distinct contracts. <code>onInteraction</code> reports every
              gesture event, effect or not. <code>onChange</code> fires only when the rendered semantic state differs
              from the last one reported, and names the parts that moved.</li>
            <li><strong>State key</strong> built from semantic identities: selected element keys, entry ids and layers,
              hidden values, viewport domain, category windows, category order, annotations (update id, target keys,
              text). No data rows, so the comparison is cheap. Data and overlays are not state: the host creates them
              and already knows; <code>set-data</code> alone does not fire. Annotations are, because readers create them
              (<code>click-annotate</code>) and a text-only change must still reach <code>onChange</code>.</li>
            <li><strong>Phase</strong> follows the layer that moved: <code>preview</code> when the preview layer changed,
              <code> commit</code> when the retained layer changed, <code>cancel</code> when a preview cleared and the
              state returned. A hover preview followed by a click on the same mark still differs, because the entry
              moves from preview to retained.</li>
            <li><strong>Source</strong> who started the change. <code>reader</code> for gestures on the chart, reset
              gestures included. <code>host</code> for <code>updates</code>, <code>ref.applyUpdate</code>,
              <code> ref.clearUpdate</code> and <code>ref.dispatch</code>; a dispatched external interaction also sets
              <code> interactionId</code>. Host changes are always <code>commit</code>. Re-passing unchanged
              <code> updates</code> applies nothing and fires nothing, so writing state back is loop-safe.</li>
            <li><strong>Mount</strong> no initial <code>onChange</code>; read <code>chart.getState()</code> in <code>onRender</code>.</li>
          </ul>
          <div style={pair}>
            <div>
              <Code title="Before">{EVENTS_BEFORE}</Code>
              <Code title="Order of one gesture" language="text">{EVENTS_ORDER}</Code>
            </div>
            <div>
              <Code title="After: the change type" language="typescript">{EVENTS_TYPE}</Code>
              <Code title="After: syncing app state">{EVENTS_AFTER}</Code>
            </div>
          </div>
        </Section>

        <Section title="5. Data flow: five directions">
          <ul style={list}>
            <li><strong>Three channels into the chart</strong> <code>spec</code> when the chart itself changes (data,
              encodings, theme); <code>updates</code> for state the app owns (linked selection, restored view,
              annotations); <code>ref.dispatch</code> for commands whose result depends on the chart (top-N, playback step).</li>
            <li><strong>Two channels out</strong> <code>onChange</code> mirrors chart state; <code>onInteraction</code>
              reports gestures that may change nothing.</li>
            <li><strong>Diffing rule</strong> the component applies the <code>updates</code> prop entry by entry, never
              through <code>setUpdates</code>. An entry is applied when its id is new, or when it is a new object whose
              serialised ops differ (<code>set-data</code> rows compared by reference). An id dropped from the prop is
              cleared. Today interaction state and host updates share one store and <code>setUpdates</code> clears all
              of it, so passing the prop through would erase the reader's selection on every app render.</li>
            <li><strong>Takeover and ownership</strong> reusing an interaction's id lets the app write that interaction's
              state. Each stored entry remembers who wrote it last: the reader (a gesture) or the host. Dropping an id
              from the prop clears the entry only if the host wrote it last, so a reader's newer selection is never
              erased by the app's stale prop.</li>
            <li><strong>Observation</strong> the site already wrote a private <code>FlintChart</code>
              (<code>InteractionDemoChart</code>: <code>updates</code>, <code>onChange</code>,
              <code> onSemanticEvent</code>, <code>onSurface</code>). The proposal is its public, corrected form.</li>
            <li><strong>Where linking lives</strong> within a chart, behaviour belongs to interaction definitions: a
              gesture in, an update for the same chart out. Across charts it does not: a definition returns one
              <code> ChartUpdate</code> for its own chart, and <code>interaction_spec</code> sits inside one chart's spec,
              so naming sibling charts there would break a self-contained spec. Linking sits above the charts: app
              state as the hub in v1; later an optional Flint link group (<code>useFlintLink({'{'} fields {'}'})</code>)
              that projects a committed selection onto the fields each chart encodes and excludes the source. A
              declarative multi-chart form would be a dashboard spec above <code>ChartAssemblyInput</code>, not part
              of <code>interaction_spec</code>.</li>
          </ul>
          <Code language="text" title="Summary">{`
flow                  today                                       proposed
within a chart        a hand-written mount per chart              interaction definitions only, no app code:
                                                                  spec JSON or the interactions prop
chart -> other charts surface registry, dispatch fan-out,          app state as the hub: onChange -> state
(dashboard)           loop guard by a missing interactionId        -> updates per chart; source tag stops loops
external -> chart     externalInteraction, surface ref,             updates derived from control state;
                      ready.then(dispatch) for the initial value   dispatch only for chart-dependent commands
chart -> external     site wrapper + onChange on every event       onChange with changed facets; onInteraction
bidirectional         two writers clearing each other by hand      one owner; update reuses the interaction id
                      (clearUpdate, setUpdates([]) wipes all)
`}</Code>
          <p style={label}>Within a chart</p>
          <div style={pair}>
            <Code title="Before: downstream gallery (this site)">{FLOW_SELF_BEFORE}</Code>
            <Code title="After">{FLOW_SELF_AFTER}</Code>
          </div>
          <p style={label}>Chart to other charts (dashboard)</p>
          <div style={pair}>
            <Code title="Before: downstream dashboard (this site)">{FLOW_CC_BEFORE}</Code>
            <Code title="After">{FLOW_CC_AFTER}</Code>
          </div>
          <p style={label}>External to chart</p>
          <div style={pair}>
            <Code title="Before: downstream control (this site)">{FLOW_EC_BEFORE}</Code>
            <Code title="After">{FLOW_EC_AFTER}</Code>
          </div>
          <p style={label}>Chart to external</p>
          <div style={pair}>
            <Code title="Before: downstream panel (this site)">{FLOW_CE_BEFORE}</Code>
            <Code title="After">{FLOW_CE_AFTER}</Code>
          </div>
          <p style={label}>Bidirectional</p>
          <div style={pair}>
            <Code title="Before: downstream control + chart (this site)">{FLOW_BI_BEFORE}</Code>
            <Code title="After">{FLOW_BI_AFTER}</Code>
          </div>
        </Section>

        <Section title="6. Sizing: box and layout">
          <ul style={list}>
            <li><strong>Layout size</strong> is a compiler input: <code>chart_spec.baseSize</code> (target),
              <code> canvasSize</code> (ceiling) and <code>options</code> such as <code>maxStretch</code>. It decides band
              widths, label fitting, facet wrapping and the font ladder. Changing it re-lays out the chart. It lives in the
              spec, so it is deterministic, inspectable and writable by an agent.</li>
            <li><strong>Box size</strong> is where the chart is shown, and the host owns it: <code>width</code>/<code>height</code>
              in pixels or CSS lengths, or the host's own CSS through <code>className</code> and <code>style</code>. A
              percentage follows the container through a ResizeObserver. With only one side given, the other follows the chart.</li>
            <li><strong>Fit</strong> is the one decision where the two meet. As with CSS <code>object-fit</code>, the chart is centred in
              any room the box leaves. <code>scale-down</code> (default, as in CSS) scales the compiled
              chart down to fit and never enlarges it: more room should mean a new layout, not bigger type. <code>crop</code>
              keeps the natural size and clips. <code>relayout</code> writes the box into <code>canvasSize</code>, the
              ceiling, on the sides the host sized; <code>baseSize</code> stays the spec's or the house's, so a sparse chart
              keeps its footprint, a dense one grows into the room, and a narrow box shrinks the layout instead of the type.
              Whatever still overflows is scaled down. Hit testing accounts for CSS scale; the component calls
              <code> refresh()</code> when it scales.</li>
            <li><strong>Relayout cost</strong> in v1 a new room is a remount, so the component waits until a resize settles
              and ignores changes under 4px. Reader state does not survive it. Galleries, documents and thumbnails stay on
              <code> scale-down</code>. Pages that want more presentation (centring, enlarging small charts) wrap a
              box-less <code>FlintChart</code> in their own container.</li>
          </ul>
          <div style={pair}>
            <Code title="Before: downstream (this site, MCP App UI)">{SIZE_BEFORE}</Code>
            <Code title="After">{SIZE_AFTER}</Code>
          </div>
        </Section>

        <Section title="7. Proposed props">
          <Code language="typescript">{PROPS}</Code>
          <p style={label}>Rules</p>
          <ul style={list}>
            <li>Nothing declared: static. <code>options.addTooltips</code>: static with native tooltips. Any interaction in the spec or the prop: interactive.
              Host <code>updates</code> do not make a chart interactive; they render on a static chart too.</li>
            <li>Code over spec. Array adds, function replaces, same id overrides.</li>
            <li>The spec is JSON (presets as <code>type</code> + <code>options</code>); functions live only in the props.
              Preset options stay JSON-serialisable.</li>
          </ul>
          <p style={label}>Library changes</p>
          <ul style={list}>
            <li>The interactive Vega-Lite renderer defaults <code>addTooltips</code> to <code>false</code>, matching <code>assembleVegaLite</code>.</li>
            <li>Same-id override mode in <code>composeInteractiveOptions</code>.</li>
            <li>A warning instead of a failed mount when a non-Vega-Lite backend receives interactions.</li>
            <li><code>notifyChange</code> compares a semantic state key before reporting, and adds <code>source</code>,
              <code> changed</code> and <code>previous</code> to <code>ChartChange</code>.</li>
            <li>The Vega-Lite assembler sets <code>labels.interactive: true</code> on legends whose labels carry a
              tooltip, replacing the site's vega-embed patch.</li>
            <li>The component applies <code>updates</code> by id diff, never <code>setUpdates</code>. Stored entries
              record their last writer (reader or host); a host clear only removes an entry the host wrote last.</li>
            <li><code>ChartState</code> gains <code>annotations</code> (update id, target keys, text), and the state key
              includes it. Without it, the v1 <code>onChange</code> rule would drop text-only annotation changes that
              today's per-event reporting delivers.</li>
            <li><code>clickAnnotate</code>'s <code>format</code> callback breaks the JSON rule: in <code>interaction_spec</code>
              it cannot be expressed. Give it a JSON form (a field template) or document it as code-only.</li>
            <li>Small helpers that build the update a preset would write, such as
              <code> selectionUpdate(id, elementsOrKey)</code> and <code>viewportUpdate(id, domain)</code>, so the
              onChange-to-updates round trip needs no hand-written ops and a host write looks like the reader's.</li>
          </ul>
          <p style={label}>Decided</p>
          <ul style={list}>
            <li>Rename <code>buildInteractiveChart</code> to <code>mountChart</code>, keeping the old name as an alias.</li>
            <li>Sizing has two kinds: the box (the host's, through props or CSS) and the layout size (in the
              spec, read by the compiler). <code>fit</code> joins them: <code>scale-down</code> and <code>crop</code> leave the
              layout alone; <code>relayout</code> makes the box the <code>canvasSize</code> ceiling.</li>
            <li>A core <code>renderSvg(spec)</code> for static images, export and server rendering. The MCP App UI's
              Flint → Vega → SVG path and the MCP server's static render move onto it; the server keeps its own font and
              text-metric setup.</li>
            <li>v1 handles spec changes by comparing content and remounting; see section 8.</li>
            <li>Server rendering: by default the component compiles on the server (pure JS) and outputs an empty box at
              the compiled size, so the page does not shift when the chart mounts; <code>fallback</code> replaces the
              box's content. A server-rendered SVG stays opt-in through <code>renderSvg</code>: without the browser's
              text metrics its layout can differ and jump on hydration.</li>
            <li>The <code>interactions</code> prop takes definitions only. JSON stays in <code>interaction_spec</code>;
              every JSON type maps one-to-one to a preset function, and <code>resolveInteractionSpec</code> converts JSON
              when needed.</li>
            <li>No controlled <code>state</code> prop. <code>ChartState</code> is a read model (resolved elements, previews,
              entries keyed by update id) and cannot be written back without losing who owns what. Control stays per
              interaction through <code>updates</code>, with the helpers above.</li>
          </ul>
          <p style={label}>Open, needs more discussion</p>
          <ul style={list}>
            <li>A Flint link group for dashboards. Unsettled: projecting a selection across aggregation levels
              (observations to continents), highlight versus filter, several publishers (union, intersection, last
              wins), brushed ranges as range predicates. Next step: prototype on the site with v1 primitives for the
              dashboard and one more case, then promote what both agree on. A declarative multi-chart spec comes later.</li>
          </ul>
        </Section>

        <Section title="8. v1 scope">
          <ul style={list}>
            <li><strong>Spec changes</strong> compare content and remount when it differs. No in-place update and no
              replay of reader state in v1. Vega cannot swap a spec into a live view, and Flint compiles data-dependent
              decisions (inline data, explicit domains, planned ticks, band sizing) into its output, so pushing new rows
              into an old compiled spec is not safe in general.</li>
            <li><strong>Against today</strong> no worse on any spec change, and better on remount frequency, host updates,
              backends, events, sizing and export. Three known costs: static charts through the Flint mount are unmeasured
              against vega-embed, direct Vega <code>View</code> access goes away, and reader state is still lost on a spec
              change, as it is today.</li>
            <li><strong>Before migrating the gallery wall</strong> benchmark first mount and bundle size of a static
              <code> FlintChart</code> against <code>VegaLiteView</code>, and check SVG parity.</li>
            <li><strong>Later steps</strong> ship independently and change no props.</li>
          </ul>
          <Code title="Spec change rule" language="text">{V1_SPEC_CHANGE}</Code>
          <Code title="Performance: today and v1" language="text">{V1_PERF}</Code>
          <Code title="Ability: today and v1" language="text">{V1_ABILITY}</Code>
          <Code title="Later steps" language="text">{V1_LATER}</Code>
        </Section>
      </div>
    </div>
  );
}
