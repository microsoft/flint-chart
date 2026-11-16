---
name: flint-app-author
description: "Use when: the user asks for code that uses flint-chart: add Flint to a JS/TS app, a React component, a notebook or a script; mount a chart with interactions; read selections with onChange; apply updates from code; link charts in an app; or build a gesture no preset gives. Not for chart specs shown through the MCP tools."
---

# flint-chart: Flint in an application

The chart input is the same `ChartAssemblyInput` the `flint-chart-author`
skill writes, and the `interaction_spec` and update ops are the
`flint-interaction-author` skill's. This skill is the code around them:
install, compile, mount, read the chart, link charts, and bespoke gestures.
Write code only when the user asks for it.

In code, data is a runtime value: load it with normal code (a real CSV
parser, never `line.split(',')`) and pass `data: { values: rows }`. Keep the
values as the data has them; `semantic_types` reads them.

## Install and compile

For MCP clients, the server can run with `npx`:

```bash
npx -y flint-chart-mcp
```

For JavaScript or TypeScript projects:

```bash
npm install flint-chart
```

- `npm install flint-chart` is the whole install: it comes with every backend
  (Vega-Lite, ECharts, Chart.js, Plotly). React is an optional peer, needed only
  for `flint-chart/react`.
- Draw with `<FlintChart backend="…">` from `flint-chart/react`, or `mountChart`
  from `flint-chart/interactive`; presets, update helpers and types come from
  `flint-chart/interactive` too.
- Compile with `assembleVegaLite`, `assembleECharts`, `assembleChartjs` or
  `assemblePlotly` from `flint-chart`; `renderSvg` from `flint-chart/render`
  draws a static SVG (Vega-Lite or ECharts).
- Only for an app bundled into one file (no code splitting): import
  `flint-chart/react/<backend>` or `flint-chart/interactive/<backend>`
  (`vegalite`, `echarts`, `chartjs`, `plotly`), which reaches no other backend,
  so the file carries one library.

Then compile with the requested backend:

```ts
import { assembleChartjs, assembleECharts, assembleVegaLite } from 'flint-chart';

const vegaLiteSpec = assembleVegaLite(input);
const echartsOption = assembleECharts(input);
const chartjsConfig = assembleChartjs(input);
```

Python support is planned for a later release. Until the PyPI package is
published, use the npm package or MCP server for released workflows.

## Mount

```ts
import { mountChart, navigate, legendToggle } from 'flint-chart/interactive';

const surface = mountChart(container, input, {
  backend: 'vegalite',
  renderer: 'svg',
  interactions: [navigate({ axes: 'x' }), legendToggle()],
  chartId: 'sales',
});
await surface.ready;
const warnings = await surface.warnings; // interactions the chart could not honour
// …
surface.destroy();
```

| Member | What it does |
| --- | --- |
| `ready`, `warnings` | Promises: the first render; the dropped or yielded interactions. Every call below waits for `ready` itself. |
| `applyUpdate(update, options?)` | Retains one update by id; replaces the layer with the same id. `options.transition.duration` animates a viewport. |
| `setUpdates(updates)` | Replaces every retained update. |
| `clearUpdate(id)` | Removes one layer. |
| `dispatch(id, payload)` | Runs an `externalInteraction` handler and applies what it returns. |
| `getState()` | What the chart shows now; `undefined` before `ready`. |
| `onChange(callback)` | Every change to that state, after the render; returns the unsubscribe. |
| `layout` | Once ready: `plot`, the plot box `{ width, height }` on a chart that draws one plot; `views`, each drawn view as `{ role, box: { x, y, width, height } }` (role `plot`, `text`, `tile` or `rule`; facet panels row by row); `block`, the box the views take with their axes and headers, without title and keys. Boxes are in pixels from the drawn chart's top left, read from what it drew, so they follow filters and resizes. `undefined` on charts with a category rail and on non-Vega-Lite backends. |
| `refresh()` | Re-projects overlays after the host rescales the chart. |
| `element`, `chartId` | The mount's root and the stable chart id. |
| `destroy()` | Removes listeners, the renderer, and the DOM. |

- `input` is a `ChartAssemblyInput`. Presets go in `input.interaction_spec` as
  JSON or in `options.interactions` as factory calls. Both may appear; spec
  entries mount first, and a code definition with a spec entry's `id`
  replaces it with an `interaction_overridden` info warning.
- A malformed `interaction_spec`, a repeated code `id`, or a code definition
  the chart cannot honour fails the mount with an error that names it. A spec
  entry the chart cannot honour is dropped with a warning instead.
- `options.availableSize: { width?, height? }` is the room the host gives the
  chart. It becomes the `canvasSize` ceiling on the sides given, so the chart
  lays out for that room rather than being scaled into it.
- `options.updates` holds retained updates present at the first render, for a
  chart that starts with a part hidden or framed.
- `renderer: 'svg'` for charts whose marks a host reads from the DOM, or under
  a few thousand marks; `'canvas'` for maps and dense charts.
- A `Year` or `Date` field makes a temporal axis whose rows hold `Date`s or
  ISO strings; a bare number such as `2013` reads as milliseconds after 1970.
  A `semantic_types` entry may be an object,
  `{ semanticType, intrinsicDomain: [lo, hi] }`; the intrinsic domain holds an
  axis still while the rows change.
- `options: { addTooltips: false }` on the input is the switch for the
  tooltip, for a chart whose hidden values it would give away.
- Build with a bundler. The interactive entry reaches every backend through
  lazy imports with no file extension; when `echarts`, `chart.js`, and
  `plotly.js-dist-min` are not installed, mark them external (esbuild
  `--splitting --external:echarts --external:chart.js --external:plotly.js-dist-min`;
  Vite `build.rollupOptions.external`).
- In React, use `<FlintChart>` from `flint-chart/react` rather than mounting
  in an effect; see "In React" below.

## In React

```tsx
import { FlintChart, type FlintChartHandle } from 'flint-chart/react';
import { clickHighlight } from 'flint-chart/interactive';

const chartRef = useRef<FlintChartHandle>(null);

<FlintChart
  ref={chartRef}
  spec={input}
  interactions={[clickHighlight({ targets: ['mark'] })]}
  width="100%"
  fit="relayout"
  onChange={(change) => setSelected(change.state.selected)}
  onError={(error) => report(error)}
/>;
```

| Prop | What it does |
| --- | --- |
| `spec` | The `ChartAssemblyInput`, `interaction_spec` included. A change of content remounts; rows compare by reference. |
| `interactions` | Factory calls added to the spec's entries, or `(fromSpec) => definitions` for the full list. A factory rebuilt with the same id and options keeps the chart; a changed option remounts it. |
| `updates` | Host updates, diffed by id. Passing even `[]` mounts the runtime on a chart with no interactions. |
| `width`, `height`, `fit` | The box. `fit` is `scale-down` (default; never scales up), `crop` (natural size, clipped), or `relayout` (the box becomes the layout room; a resize remounts once it settles, so a selection does not survive it). |
| `onChange`, `onInteraction` | The state after a change, and the raw gesture record. |
| `onRender`, `onWarnings`, `onError` | Each mount's render and warnings; a failed mount, shown in the box as a muted error. |
| `fallback` | Shown until the chart mounts. |
| `ariaLabel`, `chartId` | `ariaLabel` applies in place; a new `chartId` remounts. |

The ref's `FlintChartHandle` holds `surface` (the mounted surface or `null`),
`applyUpdate`, `clearUpdate`, `dispatch`, `getState`, and `refresh`. A remount
keeps the old chart on screen until the new one is ready.

## Read the chart

| `getState()` field | Holds |
| --- | --- |
| `selected` | The marks the chart emphasizes now, previews included. |
| `entries` | The same marks per update id, with `layer: 'retained' \| 'preview'`. |
| `hidden` | Legend values a `legend-toggle` hides, as `{ channel, value }`. |
| `viewport` | The domain on view after a pan or zoom; absent on a chart that does not navigate. |
| `categoryOrder` | The order of the reorderable axis now. |
| `windows` | Category rail windows, `{ start, count, total }` per channel. |

Each element's `value` is the mark in field terms: a bar's category and
measure, a legend item's `{ channel, field, domain }`, a histogram bar's
`{ field, range }`. The host owns the rows and queries them from the value and
the geometry.

`onChange` fires after every render with a `ChartChange`: `phase` (`preview`
while a gesture runs, `commit` for a committed change or a host call, `cancel`
when a gesture ends with nothing), `interactionId` and `action` (absent for a
host call and for a reset), the gesture's own `target` and `geometry`, and the
`state` after. An overlay or a data swap leaves no trace in the state, so the
host keeps that model itself.

```ts
const valuesOf = (elements: readonly SemanticElement[]) => elements.map((element) => element.value);

// A panel follows the gesture live, else shows what the chart shows.
surface.onChange(({ phase, target, state }) => {
  const hit = valuesOf(target?.elements ?? []);
  panel.show(phase === 'preview' && hit.length > 0 ? hit : valuesOf(state.selected));
});

// An agent context reads committed state only: values and ranges, never rows.
surface.onChange(({ phase, state, geometry }) => {
  if (phase !== 'commit') return;
  sendContext({ selected: valuesOf(state.selected), range: geometry?.domain, hidden: state.hidden, viewport: state.viewport });
});
```

The container also emits a bubbling DOM event, `flint-interaction`, for every
canvas interaction, before the chart reacts: `detail.chartId`,
`detail.interactionId`, and `detail.event`, the same `CanvasInteractionEvent`
a handler gets. It fires for a definition whose `handle` returns `null`, so it
is the path for a host that draws its own response to a gesture.

Things the surface holds fixed: no preset changes the layout, so a zoom never
recomputes the bar step, the ticks, or the domain (filter the rows and mount
again for that); the mute level is set at mount; Escape reaches a chart after
a press on it, and only that chart; a preset's toggle (`select`,
`click-highlight`) needs Shift, Ctrl, or Meta, and a plain second click
replaces; a press on an overlay path resolves to no mark, so a `click-none`
reset on the definition that drew the overlay clears it at that press.

## Apply updates and read the result

`applyUpdate`, `setUpdates` and `dispatch` take the same `{ id, ops }` layers
as the interaction skill's "Update the chart", and return what applied.
**The result.** `applyUpdate`, `setUpdates`, and `dispatch` return a
`ChartUpdateResult`: `{ status: 'applied' | 'partially-applied' |
'unsupported', resolvedTargets, unresolvedTargets, unsupportedOps }`. An
unresolved target has a wrong field or value; an unsupported op needs a
preset the chart does not mount. What the chart shows is what the result says
it shows: fix an unresolved key or drop an unsupported op before describing
the chart.

## Link charts

`linkCharts` links mounted charts on the fields they share. A selection on one
chart (a click, a brush, a group focus, a hover) becomes one condition, a part
per field; every chart emphasizes the marks that meet it, the source included,
through one `linked-selection` layer; a reset on any chart clears it everywhere.

```ts
import { linkCharts, mountChart, clickHighlight, brushX } from 'flint-chart/interactive';

const link = linkCharts({
  bars: { input: barsInput, surface: mountChart(barsEl, barsInput, { backend: 'vegalite', interactions: [clickHighlight()] }) },
  trend: { input: trendInput, surface: mountChart(trendEl, trendInput, { backend: 'vegalite', interactions: [brushX()] }) },
}, { fields: ['region', 'month'] });
for (const [id, chart] of Object.entries(await link.links)) console.log(id, chart.notes); // what each chart left out
link.onCondition(({ condition }) => table.filter(condition)); // { region: { in: ['Asia'] }, month: { range: [start, end] } }
// link.clear(); link.destroy();
```

**A table, a filter or any control beside linked charts** joins the same
condition: `link.select(parts)` sets parts as if a chart had selected them, and
`onCondition` gives the table what to show. One condition, so a row click, a
region picker and a brush combine (AND) and a reset on any chart clears them all.

```ts
row.addEventListener('click', () => link.select({ country: { in: [row.dataset.country] } }));
regionPicker.addEventListener('change', (e) => link.select({ region: e.target.value ? { in: [e.target.value] } : null })); // null lets go
link.onCondition(({ condition }) => renderTable(rows.filter((r) => meets(r, condition))));
```

- `select` only takes fields in `fields`; a chart shows a part when its marks
  carry the field (encode it, or put it on `detail`).
- The link emphasizes the matching marks; to drop rows instead (a filter), give
  the charts filtered data as below.

```tsx
import { FlintChart, useLinkedCharts } from 'flint-chart/react';

const link = useLinkedCharts({ bars: barsInput, trend: trendInput }, { fields: ['region', 'month'] });
<FlintChart spec={barsInput} {...link.chart('bars')} />;
// link.select({ region: { in: ["Asia"] } }) from a table or control; link.clear()
<FlintChart spec={trendInput} {...link.chart('trend', { onChange: setPageState, updates: myUpdates })} />;
// the chart's own onChange, onRender and updates go through chart(id, own); a prop after the spread replaces the link's
// link.condition.condition is the same condition; filtered rows in `spec` keep it
```

- A chart receives a field when its marks carry it (encode it, on `detail` if
  nothing else shows it), and sends through each selecting interaction whose
  subject includes a connected field. `{ charts: { trend: { receive: false } } }`
  keeps a chart as drawn; `send: false` keeps its selections to itself.
- The link emphasizes; it never filters or re-aggregates. To filter, read the
  condition (`onCondition`, `link.condition`) and give each chart its rows:
  beside `linkCharts`, a `set-data` update (a new spec remounts the chart, and
  the link holds the old surface); beside `useLinkedCharts`, a `spec` with the
  filtered rows.
- `setUpdates` replaces every layer, the link's included, until the condition
  next changes; use `applyUpdate` and `clearUpdate` beside a link.
- `linkCharts` checks the charts with the validator, loaded on first use; pass
  `{ links }` from `validateLinks` (`flint-chart/validate`) to skip that load.

For a link `linkCharts` does not express (a payload each chart reads its own
way), wire `onChange` to an `externalInteraction` on the other charts:

```ts
const linked = externalInteraction<{ countries: string[] }>({
  id: 'linked',
  handle: ({ countries }) => ({
    id: 'linked',
    ops: [{ op: 'set-style', targets: [{ select: { where: { Country: { in: countries } } } }], value: { state: 'emphasized' } }],
  }),
});
source.onChange(({ phase, interactionId, state }) => {
  if (phase !== 'commit' || !interactionId) return;       // host writes carry no id: no loop
  void other.dispatch('linked', { countries: state.selected.map((element) => String(element.value.Country)) });
});
```

Linked charts share one `theme_spec` so a value has one colour everywhere.

The same `dispatch` drives a chart over time: a playback loop dispatches one
frame per animation frame, and the handler returns the whole layer for that
frame.

## When no preset fits

A host that runs code mounts a `CanvasInteractionDef` in `options.interactions`
beside presets: a trigger, what it affords, and a handler that returns the
layer for its id.

```ts
import { rectangleTrigger, type CanvasInteractionDef } from 'flint-chart/interactive';

const timebox: CanvasInteractionDef = {
  id: 'timebox',
  eventSource: rectangleTrigger('contain'),
  affordances: { plot: { cursor: 'region' } },
  reset: ['click-none', 'escape'],
  handle(event) {
    if (event.action !== 'select-region' || event.phase !== 'commit') return null;
    const x = event.geometry.domain?.x;
    const y = event.geometry.domain?.y;
    if (x?.kind !== 'interval' || y?.kind !== 'interval') return null;
    const keep = seriesInsideBox(x.start, x.end, Number(y.start), Number(y.end)); // host logic over host rows
    return {
      id: 'timebox',
      ops: [{ op: 'set-style',
        targets: keep.map((series) => ({ select: { key: { Series: series } } })),
        value: { state: 'emphasized' } }],
    };
  },
};
```

| Field | Role |
| --- | --- |
| `id` | Names the interaction in events and the layer it retains. |
| `eventSource` | The trigger: what to capture and how to read it. |
| `affordances` | The kinds of hit the handler receives, each with its cursor and hover; a hit of a kind not listed never reaches it. Keys: `mark`, `legend-item`, `axis-label`, `plot`. Cursors: `activate`, `drag`, `region`, `navigate`, `inspect`, `draw`. Hovers: `target` (the mark), `cohort` (its group). |
| `handle(event, context)` | Returns the whole layer for this id, or `null` for no change. |
| `reset` | Gestures that clear the layer: `click-none`, `double-click`, `escape`. A reset reports as a commit with no `interactionId`. It suits a layer of styles the state shows; an overlay or a data layer is cleared by the host. |

**Triggers.**

| Trigger | The reader does | `action` | `geometry.plot` | `geometry.domain` | Affordance key |
| --- | --- | --- | --- | --- | --- |
| `clickTrigger` | Clicks a mark, legend item, or axis label. | `click-element`, `click-legend`, `click-axis` | `point` | — | `mark`, `legend-item`, `axis-label` |
| `hoverTrigger` | Moves over a mark. | `hover-element`, `hover-legend`, `hover-axis` | `point` | — | same |
| `dragTrigger(tolerance?)` | Presses a mark, or a projectable overlay path, within `tolerance` px (12) and drags. | `drag` | `drag { start, current, delta }` | the pointer's values; `geometry.projection` while over a projectable overlay | `mark` |
| `rectangleTrigger(match?, guide?)` | Drags a rectangle. | `select-region` | `rect` | `x`, `y` intervals | `plot` |
| `xBrushTrigger(match?, mode?, guide?)`, `yBrushTrigger(…)` | Drags an interval along one axis. | `brush-x`, `brush-y` | `rect` | that axis's interval | `plot` |
| `lassoTrigger(match?, guide?)` | Draws a freehand region; previews begin at the third point. | `select-lasso` | `polygon` | `points`: the stroke so far, in data values | `plot` |
| `angularBrushTrigger(match?, mode?, guide?)` | Drags a sector on a polar chart. | `brush-angle` | `angular-sector` | — | `plot` |
| `inspectTrigger(mode?)` | Moves over the plot. | `inspect-x`, `inspect-y`, `inspect-xy` | `point` | `x`, `y` values | `plot` |
| `inspectIndexTrigger(axis?, show?, seriesBy?)` | Moves along the index axis. | `inspect-x`, `inspect-y` | `point` | the index value | `plot` |
| `navigationTrigger({ axes?, pan?, zoom?, reset? })` | Drags, wheels, pinches. | `pan-viewport`, `zoom-viewport`, `reset-viewport` | `viewport { delta, factor, anchor }` | the viewport after the move | `plot` |
| `contextTrigger`, `longPressTrigger(ms?)`, `doubleActivateTrigger` | Right-clicks, holds (500 ms), double-clicks a mark. | `context-element`, `long-press-element`, `double-activate-element` | `point` | — | `mark` |

`match` is `'intersect'` (default) or `'contain'` and decides which marks the
region's `target` lists. `guide` styles the drawn shape; `false` hides it. A
region is ephemeral: its guide and its preview end at the commit. A brush or
`select` with `mode: 'stateful'` keeps its region on screen and editable, and
`event.operation` reads `create`, `move`, `resize-leading`, `resize-trailing`,
or `clear`. Spread a trigger to tune it:
`{ ...hoverTrigger, defaultAssistDistance: 28 }` acquires the nearest mark
within 28 px. A chart admits a trigger when it offers what the trigger needs,
per what `list_interaction_presets` says each preset requires; a code definition the chart cannot honour throws at
mount with a message that names what it needed.

**The event.**

```ts
interface CanvasInteractionEvent {
  action: string;                                     // from the table
  phase: 'start' | 'preview' | 'commit' | 'cancel';   // clicks and hovers skip start
  operation?: string;                                 // a stateful brush's edit, or pan | zoom | reset
  geometry: { plot?, domain?, projection? };
  target: { visual: { kind, role }, elements: [{ value, records? }] } | null;
  modifiers?: { shift, ctrl, meta };
  description?: { kind, type, content, text };  // on focus-element from accessible-navigation
}
```

- `target.elements[i].value` holds the mark's encoded values, derived fields
  included; `records` holds the source rows when the runtime can prove them. A
  region target lists every mark inside. A legend hit's `value` is a
  `LegendTargetValue`: `{ channel, field, domain: { kind: 'value', value } }`,
  or `{ kind: 'interval', start, end }` on a continuous legend. An axis-label
  hit's `value` is an `AxisTargetValue`: `{ axis, field, value }`.
- `geometry.domain` is inverted through the plot's scales: a brush on a time
  axis gives `domain.x = { kind: 'interval', start: Date, end: Date }`, a linear
  axis gives numbers, a discrete axis gives the category.
- `description` arrives on `focus-element` while `accessible-navigation` walks
  the chart: what the focused element is (`type`, such as "Bar") and what it
  represents (`content`), with the spoken `text`. The walk's emphasis reports
  through `onChange` as a `preview`.
- `geometry.projection.kind === 'path'` during a drag over an overlay with
  `projectable: true`: `segment.start.value` and `segment.end.value` are the
  overlay rows on each side of the pointer and `segment.t` the fraction between
  them.

**The types.** `flint-chart/interactive` exports these, and `flint-chart/react`
re-exports them. `onChange` receives a `ChartChange`: the gesture's own
`target` and `geometry`, and the chart's `state` after it. Generated from the
source by `npm run gen:reference`:

<!-- event-types:start -->
```ts
interface ChartChange {
  // `preview` while a gesture runs, `commit` for a committed change, `cancel` when a gesture ends with none.
  phase: ChartChangePhase;
  // `host` for `updates`, `applyUpdate`, `clearUpdate` and `dispatch`; always `commit`.
  source: ChartChangeSource;
  changed: ChartStateFacet[];
  // The interaction behind the change: a reader's gesture, or an external interaction run by `dispatch`.
  interactionId?: string;
  action?: CanvasInteractionAction;
  // The gesture's own hit: the hovered point, or the marks at an inspected index.
  target?: SemanticTarget | null;
  // The gesture's geometry: a brushed range, an index value, or the viewport after a move.
  geometry?: CanvasInteractionEvent['geometry'];
  // The reset gesture a reader made: a click on nothing, Escape, or a double-click. Reported even when the chart held nothing to reset, so a host that shows a selection of its own can let it go.
  reset?: InteractionResetGesture;
  state: ChartState;
  previous: ChartState;
}

interface ChartState {
  chartType: string;
  // The marks the chart emphasizes or focuses now, previews included.
  selected: SemanticElement[];
  // The emphasized marks of each update, by update id; `selected` is their union.
  entries?: ReadonlyMap<string, ChartStateEntry>;
  // The legend values a toggle hides now.
  hidden?: ChartHiddenValue[];
  // The domain the plot shows now, when the chart navigates.
  viewport?: DomainGeometry;
  // The category window of each rail.
  windows?: Partial<Record<'x' | 'y', ChartCategoryWindow>>;
  categoryOrder?: unknown[];
  // The notes the chart holds now, previews included; `inView` tells which ones it draws.
  annotations?: ChartAnnotation[];
  // The active filter of each field, set by filter controls; absent fields show every value.
  filters?: Readonly<Record<string, FilterValue>>;
}

interface SemanticTarget {
  visual: {
    kind: 'mark' | 'path' | 'region' | 'widget' | 'handle' | 'legend' | 'axis' | 'chart' | 'title' | 'header';
    role: string;
  };
  elements: SemanticElement[];
}

interface SemanticElement {
  // Values represented by the mark's channels, or by a semantic control such as a legend item.
  value: Record<string, unknown>;
  // Contributing input records when provenance is available; zero or many may support one value.
  records?: Record<string, unknown>[];
}

interface LegendTargetValue {
  channel?: string;
  field?: string;
  // The entry's value on a reader's hit; read `domain`, which every legend target carries.
  value?: unknown;
  domain: LegendDomain;
}

type LegendDomain =
  | { kind: 'value'; value: unknown }
  | { kind: 'interval'; start?: number; end?: number };

interface AxisTargetValue {
  axis: 'x' | 'y';
  field: string;
  value: unknown;
}

interface DomainGeometry {
  x?: DomainCoordinate;
  y?: DomainCoordinate;
  points?: DomainPoint[];
  // The detail level a multi-level projected chart draws for this viewport.
  level?: string;
  // On a multi-level projected chart, the coarsest-level region under the plot centre: its feature id and properties plus the joined row fields.
  focus?: Record<string, unknown>;
}

type DomainCoordinate =
  | { kind: 'value'; value: DomainValue }
  | { kind: 'interval'; start: DomainValue; end: DomainValue };

type DomainValue = number | Date | string;

interface DomainPoint {
  x?: DomainValue;
  y?: DomainValue;
}

interface ChartHiddenValue {
  channel: string;
  value: unknown;
}

type FilterValue =
  | { in: unknown[] }
  | { range: [unknown, unknown] };
```
<!-- event-types:end -->
- `context` is the chart state plus `available`, every drawn mark, for
  building refs, and `selected`, the current emphasis, for a toggle rule.

**The handler.**

- It returns the complete layer for the id on every `preview` and `commit`;
  the runtime drops the preview on `cancel`. A `null` on a `preview` shows
  nothing until the commit, which is how a rule applies to the committed box
  only. A region gesture keeps a preview layer under the interaction's id
  while the drag runs, so a commit after previews restates the layer; a
  `null` there lets the last preview stand.
- It maps geometry to the host's model and the model to ops. Host side
  effects (state, panels, overlays the host draws) come from
  `flint-interaction` or `onChange`, which carry the same event; the handler
  itself returns ops and leaves the DOM to the runtime.
- Triggers have one owner for code definitions as for presets; two code
  definitions on one trigger throw at mount. `navigate({ pan: false })` goes
  beside a region trigger.
- An element drag owns the press on the marks it affords. A press there is a
  `drag` with phase `start`; `target` is the pressed mark through every phase.
  The layer returned at `start` is kept as the gesture's preview, and a release
  without movement commits that preview with no further call. No click
  definition fires on those marks, so the definition that drags a mark also
  answers its press.
- A click definition that affords `hover` on marks receives `preview` events
  for the hover cue. Return `null` or an emphasis for them, and the layer on
  `commit`.

**Patterns.**

| Pattern | Flow | Pieces |
| --- | --- | --- |
| Gesture rule | Flint in, Flint out | A region trigger reads `geometry.domain`; the host rule picks rows; `set-style` by key (the timebox above). |
| Host-drawn detail | Flint in, custom out | `hoverTrigger` or `inspectTrigger` with a `null` handle; the host listens to `flint-interaction` for the resolved element and draws a lens, a cursor, or a badge over the mount. |
| Application drives the chart | external in, Flint out | `externalInteraction` plus `dispatch` per frame: a playback year, a reveal progress. |
| Drag along a path | press, then drag | One `dragTrigger()` definition and one layer. At `start` on a mark it returns the mark's path as a `set-overlay` `line` with `interactive: true, projectable: true` and `order`, plus `set-data` for the current position. On `preview` and `commit` with `geometry.projection` it returns the same two ops for the pointer's position. `intrinsicDomain` on the x and y fields holds the axes still across the swaps. |
| Freehand stroke | draw | The rows to guess form their own series, and a mount update sets `opacity: 0` on that series, which keeps the axis. `lassoTrigger('contain', false)` with `plot: { cursor: 'draw' }` is the pen: `geometry.domain.points` become the rows of a `set-overlay` line. An `externalInteraction` reveals the truth as an overlay, then the host clears the hide. |
| Chart-level zoom | wheel | When the layout itself must change (bar step, ticks, domain), filter the rows and `mountChart` again in a hidden layer; swap on `ready`. No preset re-lays out. |
| Semantic zoom on a map | navigate | A Choropleth with `level: 'auto'` (US states, then counties) or with your own `levels: [{ value, url, feature?, enter?, exit? }]` (one GeoJSON or TopoJSON object per level, rows joined on the feature `id` or `featureKey`, `baseMapUrl` drawn beneath as land without data), or a Map with `levelField` and `levels`; `navigate()`, and `set-viewport { region: { key } }` with a `transition` to fly into a region. Navigation events carry `geometry.domain.level` and `focus` (the coarsest region under the centre). A hover reaches the host through a hover affordance (`hover: 'target'`); a handler that returns `null` leaves the map as drawn. |

Host-drawn detail, the shape of it:

```ts
const probe: CanvasInteractionDef = {
  id: 'probe',
  eventSource: { ...hoverTrigger, defaultAssistDistance: 28 },
  affordances: { mark: { hover: 'target' } },
  handle() { return null; },
};
container.addEventListener('flint-interaction', (e) => {
  const { interactionId, event } = (e as CustomEvent<FlintInteractionEventDetail>).detail;
  if (interactionId !== 'probe' || event.phase !== 'preview') return;
  const row = event.target?.elements[0]?.records?.[0];
  if (row) lens.show(row);                 // the host draws; the chart is unchanged
});
```

## Worked examples

### A chart that drives the app

User: "In my dashboard, a click selects the country and a double-click opens
its page. Zooming the y axis would help too." A scatter of `gdp` by `life`
with `color: continent` and `detail: country`.

`navigate` holds the double-click by default for its reset, and
`double-activate` needs it; `reset: ["escape"]` frees it. `click-highlight`
takes `targets: ["mark"]` so the app's selection comes from marks only.

```json
{
  "interactions": [
    { "type": "click-highlight", "options": { "targets": ["mark"] } },
    { "type": "double-activate" },
    { "type": "navigate", "options": { "axes": "y", "reset": ["escape"] } }
  ]
}
```

The app reads the selection from `onChange` on a `commit` whose `action` is
`click-element`, and the activation from one whose `action` is
`double-activate-element`.

### Code: two linked charts

Two bar charts share a `Country` field: GDP per country, and population per
country. A click on one emphasizes the same country on both.

```ts
import { mountChart, clickHighlight, linkCharts } from 'flint-chart/interactive';

const mount = (el: HTMLElement, input: ChartAssemblyInput) =>
  ({ input, surface: mountChart(el, input, { backend: 'vegalite', interactions: [clickHighlight({ targets: ['mark'] })] }) });
const link = linkCharts({ gdp: mount(gdpEl, gdpInput), population: mount(popEl, popInput) }, { fields: ['Country'] });
```

The clicked chart drops its own emphasis once the link shows the condition, so
both charts show one selection. A `click-none`, Escape, or double-click on
either chart clears it on both; the link's own writes are host changes, so no
chart echoes them back.

### Bespoke: a rule over the brushed box

A line chart of `Series` by `Month`. The reader drags a box; the series whose
every point in that month range lies inside the y range stay emphasized. No
preset applies a rule over series, so the definition is the `timebox` above:
`rectangleTrigger('contain')`, a `plot` affordance with the `region` cursor,
a handler that acts on `select-region` at `commit`, and `reset:
['click-none', 'escape']` so a click on empty plot clears it. It mounts beside
`navigate({ pan: false })` when the chart also zooms, since both ask for the
plot drag otherwise.

## Validation checklist

1. Every trigger, cursor, and field name is one from this skill or the
   installed `flint-chart/interactive` types.
2. Every definition declares `affordances` for the hits its trigger yields.
3. No two definitions, and no definition and spec entry, share a trigger or
   an `id`.
4. The surface is destroyed on unmount, and every `applyUpdate` or `dispatch`
   result is read.

