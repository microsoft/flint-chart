---
name: flint-interaction-author
description: "Use when: a Flint chart should respond to the reader (highlight, zoom, brush, legend toggle, reorder, annotate, explore, link charts); an application or an agent changes a mounted chart from outside or reads what it shows; or a gesture no preset gives must be built. Produce one valid interaction_spec, one ChartUpdate, or code against flint-chart/interactive, with no invented names."
---

# flint-chart: interactions on a chart

A Flint chart is shared state. A reader changes it with gestures, an
application changes it with code, an agent changes it with JSON, and all three
read the same state back. This skill is the reference for all three, with no
need to read the library's source.

The chart itself (`chart_spec`, `semantic_types`) is the `flint-chart-author`
skill. Everything here runs on the Vega-Lite backend; a static render and the
other backends leave `interaction_spec` untouched.

## What you produce (and what you do NOT)

Three outputs, picked by what the request asks for:

| The request says | You produce | Section |
| --- | --- | --- |
| A gesture or a behaviour on the chart: "highlight on click", "zoom", "brush a period", "make it interactive", "add behaviour to this chart". | One `interaction_spec`: `{ "interactions": [ ... ] }`, presets only. | Presets |
| A change to a chart that is already on screen, from outside: "point out Japan", "frame 2010 to 2020", "note this value", "reorder by value", an agent answering a user with the chart. | One `ChartUpdate`: `{ "id", "ops": [ ... ] }`. | Change the chart |
| Code around a chart: "in my app", "on click open the record", "link these two charts", "a panel that follows the hover", "play the years". | TypeScript against `flint-chart/interactive`: mount, presets as factories, `onChange`, `dispatch`. | Use Flint in an application |
| A gesture no preset gives: "drag along the path", "draw a guess", "a rule for the box", "a lens the app draws". | A `CanvasInteractionDef`: a trigger, affordances, a handler. | Build a bespoke interaction |

- **DO** use only the names in this skill: preset types, options, ops, states,
  triggers, cursors, event actions. Every name here is one the library ships.
- **DO** return the whole layer for an id on every update, and read the result.
- **DO** add behaviour only when the request or the session asks for it. A
  static image or a bare spec gets no `interaction_spec`.
- **Never** invent a preset, an option, an op, or a trigger. When the request
  asks for a behaviour no preset gives, say which preset comes closest and
  what it leaves out, then offer a bespoke definition if the host runs code.
- **Never** add an entry for a tooltip or values on hover. Every compiled chart
  shows a tooltip on hover already.

## How an interaction works

One model runs under presets, updates, and bespoke definitions. Read it once;
every rule below follows from it.

```
reader gesture ──► trigger ──► event (action, phase, target, geometry)
                                 │
host payload ───► dispatch ──────┤──► handle(event | payload, context) ──► ChartUpdate { id, ops }
                                 │                                            │
agent / app ────► applyUpdate ───┴────────────────────────────────────────────┤
                                                                              ▼
                                                        layers by id ──► render ──► state
                                                                              │
                                              getState(), onChange(), the MCP view's context ◄──┘
```

- **A trigger** reads the pointer, the wheel, or the keyboard and makes an
  event. Three families: **element** (a click, hover, long press, double-click,
  drag, or inspect on marks, legend items, or axis labels), **region** (a drag
  that draws a rectangle, an interval along one axis, a lasso, or an angular
  sector, and lists the marks inside), **navigation** (a drag that pans, a
  wheel or pinch that zooms a continuous axis). The keyboard is a fourth
  source: `accessible-navigation` walks the chart with Tab and the arrow keys.
- **An event** carries `action` (what the gesture is: `click-element`,
  `select-region`, `pan-viewport`, …), `phase` (`start`, `preview` while the
  gesture runs, `commit`, `cancel`), `target` (the marks hit, each as a
  `value` in field terms: a bar's category and measure, a legend item's field
  and value), and `geometry` (the gesture in plot pixels and in data values,
  inverted through the chart's scales).
- **A handler** maps the event to one `ChartUpdate`, or `null` for no change.
  It never touches the DOM. A preset is a packaged trigger plus handler with
  a name; `click-highlight` in JSON and `clickHighlight()` in code are two
  spellings of the same definition.
- **An update** is `{ id, ops }`. The `id` names a layer; applying an update
  with an id already held replaces that layer. Layers compose in insertion
  order. A gesture, a host call, and an agent's JSON all write the same kind of
  layer, so a click and a story step produce the same kind of change.
- **The state** is what the chart shows now: the emphasized marks, the hidden
  legend values, the viewport, the category order. A host reads it with
  `getState()` and hears every change with `onChange()`, instead of replaying
  gestures. The MCP chart view sends it to the model after each commit.
- **Admission** runs at mount and decides what the chart can honour. The chart
  type declares what it offers (marks that resolve to data, a drag region,
  navigable axes, a reorderable axis, a discrete legend, discrete axis labels,
  an index axis). The data confirms the parts that depend on it (a colour field
  bound to a legend, a continuous unfaceted axis). Each preset needs some of
  these. A spec entry the chart cannot honour is **dropped with a warning**,
  and the chart renders; a code definition **throws**, because a developer sees
  the exception.
- **One trigger has one owner.** Two definitions that ask for the same gesture
  on the same kind of hit collide: the plot drag, the double-click, the legend
  click, the axis-label click, the retained mark focus. The later entry yields,
  or, when it can keep the rest, gives up only that trigger with an `info`
  warning. See "Ownership".
- **A reset** is a gesture that returns a preset to neutral: `click-none` (a
  click that hits no element), `double-click`, `escape`. Each preset has a
  default list. A reset clears preset layers only; a layer a host wrote stays
  until the host clears it.

## Presets (`interaction_spec`)

### Output contract

Unless the user asks for commentary, return exactly one valid JSON object:

- The bare `interaction_spec`, `{ "interactions": [ ... ] }`, not
  `{ "interaction_spec": ... }` and not a whole `ChartAssemblyInput`.
- Every entry is `{ "type": <preset>, "id"?: <string>, "options"?: { ... } }`.
  Options nest under `options`; an option beside `type` is rejected. `id` sits
  on the entry, never inside `options`, and is needed only when one preset
  appears twice. No string shorthand: `"click-highlight"` alone is rejected.
- Every entry answers the request. A broad request gets at most three.
- Omit `reset` to accept the preset's default. Set it only when the default
  collides with another entry.
- Strict JSON, no Markdown fence, no comments, no trailing commas.

```json
{
  "interactions": [
    { "type": "click-highlight", "options": { "targets": ["mark"] } },
    { "type": "navigate", "options": { "axes": "x" } },
    { "type": "legend-toggle" }
  ]
}
```

### Workflow

1. **Read the chart spec.** Note the chart type, the field on each channel,
   and the shape of the data: one series or many, time or categories, points
   or bars, a colour field or none.
2. **Name the jobs.** Each thing the reader should be able to do is one job:
   "zoom" is one, "explore" is a few. A request that names no gesture goes to
   "When the request names no gesture".
3. **Pick a preset per job.** Call `list_chart_types` and read `interactions`
   for the chart type: the presets it supports. Choose from the preset map
   the one that fits this chart and this data. Fewest entries that serve the
   request.
4. **Check ownership.** Two entries must not ask for one trigger; see
   "Ownership" and the data conditions there.
5. **Validate.** Run `validate_chart` on the input with the object beside the
   chart spec, fix or drop what it warns about, and return the bare object.

### Preset map

| Preset | The reader does | It is for | Required | Needs | Default reset |
| --- | --- | --- | --- | --- | --- |
| `click-highlight` | Clicks a mark, legend item, or axis label; it stays emphasised and the rest mute. | Single one mark or series out. | | elements | click-none, escape |
| `click-group-focus` | Clicks a mark; every mark in its group stays emphasised. | Single one group out. | `groupBy` | elements | click-none, escape |
| `hover-group-focus` | Hovers a mark; its group previews. | Preview a group without a click. | `groupBy` | elements | none |
| `axis-highlight` | Clicks (or hovers) a discrete axis label; the category's marks emphasise. | Single one category out. | | discrete axis | click-none, escape |
| `inspect` | Moves over the plot; the nearest mark shows its values. | Examine one mark in detail. | | elements | none |
| `inspect-index` | Moves over the plot; every series shows its value at that x. | Compare every series at one x. | `seriesBy` for a single series | index axis | escape |
| `select` | Drags a rectangle; the marks inside emphasise. | Focus an area of points. | | elements, cartesian region | click-none, escape |
| `lasso-select` | Draws a freehand region; the marks inside emphasise. | Focus an irregular cluster. | | elements, cartesian region | click-none, escape |
| `brush-x`, `brush-y` | Drags an interval along one axis; on a polar chart the x brush is a sector. | Focus a period or a range. | | elements, cartesian region | click-none, escape |
| `brush-angle` | Drags an angular sector on a pie, donut, rose, or radar. | Focus adjacent sectors. | | elements, angular region | click-none, escape |
| `linked-brush` | Brushes marks; the same groups emphasise in every linked chart. | Carry a focus to another chart. | `groupBy` | elements, cartesian region | click-none, escape |
| `navigate` | Drags to pan; scrolls or pinches to zoom continuous axes. | Move closer or along. | | navigation | double-click |
| `brush-zoom` | Drags a rectangle; the chart zooms into it. | Zoom into detail with one gesture. | | navigation | double-click, escape |
| `legend-toggle` | Clicks a legend item; its series hides or returns. | Reduce the series on view. | | discrete legend | none |
| `drag-reorder` | Drags a discrete axis label; the categories reorder. | Rank by hand. | | reorderable axis | none |
| `click-annotate` | Clicks a mark; an annotation pins with its value. | Note a value for the reader. | | elements | click-none, escape |
| `context-activate` | Right-clicks or long-presses; the host receives a context target. | A context menu in the app. | | elements | none |
| `long-press` | Holds a mark; it activates. | Touch-first activation. | | elements | click-none, escape |
| `double-activate` | Double-clicks a mark; it activates. | Open the record behind a mark. | | elements | click-none, escape |
| `accessible-navigation` | Tabs into the chart and walks titles, axes, legends, facet headers, series, and marks with the keyboard; each step says what the element is and emphasises its data. | Keyboard and screen-reader access to the whole chart. | | elements | none |

"Needs" is what the chart type must offer; `list_chart_types` has already
applied it. The data can still remove an entry at mount: see the data
conditions under "Ownership". A viewport a gesture commits, and a reset, fly
over 400 ms; `"transition": { "duration": 0 }` or
`"resetTransition": { "duration": 0 }` jumps. Panning and wheel zooming follow
the pointer and never animate.

### When the request names no gesture

"Make it interactive", a live view, a dashboard, or a session whose goal is to
explore the data: the chart shape picks the entries. Take the fewest that fit,
and let a named preset in the user's words replace the default for its job.

- **A time series, one or many series:** `inspect-index`, and `legend-toggle`
  when a colour field is bound. Add `brush-x` when the reader will point at a
  period, `navigate` with `axes: "x"` when the series is long.
- **A scatter or a dense point chart:** `select`, `navigate`. Add
  `legend-toggle` when a colour field is bound.
- **A bar, lollipop, or other category chart:** `click-highlight`. Add
  `legend-toggle` when a colour field is bound, `drag-reorder` when the reader
  ranks by hand.
- **A pie, donut, rose, or radar:** `click-highlight` with
  `targets: ["mark", "legend"]`, or `brush-angle` for adjacent sectors.
- **A heatmap or a calendar:** `click-highlight` with `targets: ["mark"]`,
  `axis-highlight` to read a row or a column.
- **A map:** `click-highlight`, `navigate`.
- **A chart that is a control in the user's app** ("in my app", "on click
  open"): `click-highlight` with `targets: ["mark"]`, and `double-activate` or
  `context-activate` for the stronger trigger the app reads.
- **A chart other people read without a pointer** (accessibility, a screen
  reader, "keyboard"): `accessible-navigation`, beside any other entry.

### Ownership

One trigger has one owner. Admission drops the later entry that asks for a
trigger an earlier entry holds, with a warning. Four triggers collide in
practice:

| Trigger | Who asks for it | How to free it |
| --- | --- | --- |
| the plot drag | `navigate` with pan on, every region preset, `brush-zoom`, `drag-reorder` | `navigate` with `"pan": false` beside one region preset |
| the double-click | `double-activate`, and any entry whose `reset` holds `double-click` (`navigate`, `brush-zoom` by default) | `"reset": ["escape"]` on `navigate` or `brush-zoom` |
| the legend click | `legend-toggle`, `click-highlight`, `inspect-index` with `show: "single"` | `click-highlight` with `"targets": ["mark"]` |
| the retained mark focus | `click-highlight`, `click-group-focus` | pick one |

`click-highlight` yields a legend or an axis click on its own, with an `info`
warning. Set `targets` to keep the spec silent.

`accessible-navigation` takes no pointer trigger, so it sits beside any other
entry. Space on a focused mark, legend item, or axis label runs the click
presets on the list, so `legend-toggle` and `click-highlight` also answer the
keyboard.

Data conditions the chart type cannot promise; an entry that fails one is
dropped at mount with a warning:

- `legend-toggle` needs a colour field bound to a discrete legend.
- `navigate` and `brush-zoom` need a continuous, unfaceted axis.
- `drag-reorder` needs a discrete axis in the bound encodings.
- `inspect-index` needs the index axis; `seriesBy` names the series field
  when the chart shows one series at a time.
- `click-group-focus`, `hover-group-focus`, and `linked-brush` need `groupBy`,
  a bound field.

Two pairs answer one question twice; keep one of each: `inspect` with
`inspect-index`, and `long-press` with `context-activate`.

### Apply after the chart exists

Keep the chart spec as it is. Put the object beside it as `interaction_spec`
in the same input and call `create_chart_view` again, or
`buildInteractiveChart(container, input)` in code. The entries mount in order.

An entry the chart cannot honour is dropped with a warning that names the
entry, what it needed, and the chart type:

```
Interaction "legend-toggle" requires a discrete legend; Bar Chart has none. The interaction was dropped.
Interaction "click-highlight" yields legend clicks to "legend-toggle".
```

`validate_chart` returns the same warnings before anything renders. A
malformed entry is an error, not a drop: an unknown `type`, an option beside
`type`, an `id` inside `options`, a missing required option, an unknown or
unsupported `reset` gesture, a `reset` on a preset that keeps nothing
(`hover-group-focus`, `inspect`, `context-activate`), or a duplicate `id`.

### Preset options

Every option a preset accepts, from the library's own types. `id` is omitted:
it sits on the entry. A `ResetGesture` is `click-none`, `double-click`, or
`escape`; the preset map has each default list. `dimOpacity` is the opacity of
the muted marks, 0.25 by default. A `guide` is `{ visible?, style? }`, or
`false` to draw nothing while the gesture runs. `click-annotate` also takes
`format`, a function, in code only.

<!-- preset-options:start -->
| Preset | Option | Type | Notes |
| --- | --- | --- | --- |
| `click-highlight` | `dimOpacity` | `number` |  |
|  | `targets` | `('mark' \| 'legend' \| 'discreteAxis')[]` | Semantic surfaces activated by this preset. Defaults to all three targets. |
|  | `reset` | `ResetGesture[]` | Gestures that return this interaction to its neutral state. |
| `axis-highlight` | `axis` | `'x' \| 'y'` | Limits the preset to one axis; both discrete axes when unset. |
|  | `event` | `'hover' \| 'click'` | Defaults to 'click'. |
|  | `dimOpacity` | `number` |  |
|  | `reset` | `ResetGesture[]` | Gestures that return this interaction to its neutral state. |
| `click-group-focus` | `dimOpacity` | `number` |  |
|  | `groupBy` | `string \| string[]` |  |
|  | `reset` | `ResetGesture[]` | Gestures that return this interaction to its neutral state. |
| `hover-group-focus` | `groupBy` (required) | `string \| string[]` |  |
|  | `dimOpacity` | `number` |  |
|  | `tolerance` | `number` | Nearest-mark hover radius in renderer pixels. Defaults to 8. |
| `click-annotate` | `dimOpacity` | `number` |  |
|  | `reset` | `ResetGesture[]` | Gestures that return this interaction to its neutral state. |
| `select` | `match` | `'intersect' \| 'contain'` | The marks the region lists: those it touches, or only those it contains. Defaults to 'intersect'. |
|  | `dimOpacity` | `number` |  |
|  | `guide` | `{ visible?, style?: { fill?, fillOpacity?, stroke?, strokeOpacity?, strokeWidth? } } \| false` | Transient region shown during the gesture; false disables visual feedback. |
|  | `reset` | `ResetGesture[]` | Gestures that return this interaction to its neutral state. |
| `lasso-select` | `match` | `'intersect' \| 'contain'` | The marks the region lists: those it touches, or only those it contains. Defaults to 'intersect'. |
|  | `dimOpacity` | `number` |  |
|  | `guide` | `{ visible?, style?: { fill?, fillOpacity?, stroke?, strokeOpacity?, strokeWidth? } } \| false` | Transient region shown during the gesture; false disables visual feedback. |
|  | `reset` | `ResetGesture[]` | Gestures that return this interaction to its neutral state. |
| `brush-x` | `match` | `'intersect' \| 'contain'` | The marks the region lists: those it touches, or only those it contains. Defaults to 'intersect'. |
|  | `dimOpacity` | `number` |  |
|  | `guide` | `{ visible?, style?: { fill?, fillOpacity?, stroke?, strokeOpacity?, strokeWidth? } } \| false` | Transient region shown during the gesture; false disables visual feedback. |
|  | `reset` | `ResetGesture[]` | Gestures that return this interaction to its neutral state. |
|  | `mode` | `'ephemeral' \| 'stateful'` | 'stateful' keeps the interval on screen and editable after the drag. Defaults to 'ephemeral'. |
| `brush-y` | `match` | `'intersect' \| 'contain'` | The marks the region lists: those it touches, or only those it contains. Defaults to 'intersect'. |
|  | `dimOpacity` | `number` |  |
|  | `guide` | `{ visible?, style?: { fill?, fillOpacity?, stroke?, strokeOpacity?, strokeWidth? } } \| false` | Transient region shown during the gesture; false disables visual feedback. |
|  | `reset` | `ResetGesture[]` | Gestures that return this interaction to its neutral state. |
|  | `mode` | `'ephemeral' \| 'stateful'` | 'stateful' keeps the interval on screen and editable after the drag. Defaults to 'ephemeral'. |
| `brush-angle` | `match` | `'intersect' \| 'contain'` | The marks the region lists: those it touches, or only those it contains. Defaults to 'intersect'. |
|  | `dimOpacity` | `number` |  |
|  | `guide` | `{ visible?, style?: { fill?, fillOpacity?, stroke?, strokeOpacity?, strokeWidth? } } \| false` | Transient region shown during the gesture; false disables visual feedback. |
|  | `reset` | `ResetGesture[]` | Gestures that return this interaction to its neutral state. |
|  | `mode` | `'ephemeral' \| 'stateful'` | 'stateful' keeps the sector on screen and editable after the drag. Defaults to 'ephemeral'. |
| `brush-zoom` | `axes` | `'x' \| 'y' \| 'xy'` | Defaults to 'xy'. |
|  | `guide` | `{ visible?, style?: { fill?, fillOpacity?, stroke?, strokeOpacity?, strokeWidth? } } \| false` |  |
|  | `reset` | `ResetGesture[]` | Returns the viewport to the full frame. Defaults to ['double-click', 'escape']. |
|  | `transition` | `{ duration: ms }` | The zoom into the brushed region. Defaults to 400 ms; `{ duration: 0 }` jumps. |
|  | `resetTransition` | `{ duration: ms }` | The flight home on reset. Defaults to 400 ms; `{ duration: 0 }` jumps. |
| `linked-brush` | `match` | `'intersect' \| 'contain'` | The marks the region lists: those it touches, or only those it contains. Defaults to 'intersect'. |
|  | `dimOpacity` | `number` |  |
|  | `guide` | `{ visible?, style?: { fill?, fillOpacity?, stroke?, strokeOpacity?, strokeWidth? } } \| false` | Transient region shown during the gesture; false disables visual feedback. |
|  | `reset` | `ResetGesture[]` | Gestures that return this interaction to its neutral state. |
|  | `groupBy` (required) | `string \| string[]` |  |
|  | `brush` | `'rectangle' \| 'lasso'` | Defaults to 'rectangle'. |
| `legend-toggle` | `mutedOpacity` | `number` |  |
|  | `reset` | `ResetGesture[]` | Hidden series are a setting, so nothing resets them unless this list says so. |
| `context-activate` | — | | |
| `long-press` | `holdMs` | `number` | Defaults to 500. |
|  | `dimOpacity` | `number` |  |
|  | `reset` | `ResetGesture[]` | Gestures that return this interaction to its neutral state. |
| `double-activate` | `dimOpacity` | `number` |  |
|  | `reset` | `ResetGesture[]` | Gestures that return this interaction to its neutral state. |
| `inspect` | `mode` | `'x' \| 'y' \| 'xy', with an optional comparison such as 'x>' or 'x<=;y>='` | The axes the pointer reads, with an optional comparison per axis. Defaults to 'xy'. |
|  | `cycle` | `InspectMode[]` | Ordered modes cycled by wheel or context-menu gestures; mode is included automatically. |
|  | `tolerance` | `number` | Hit tolerance as a plot-size fraction. Defaults to 0.02 for XY and 0.01 otherwise. |
|  | `guide` | `{ visible?, style?: { color?, opacity?, width?, fillOpacity?, haloColor?, haloOpacity?, haloWidth? } } \| false` | Transient guide shown while inspecting; false disables visual feedback. |
|  | `selector` | `{ select: { key } }` |  |
|  | `dimOpacity` | `number` |  |
| `inspect-index` | `axis` | `'x' \| 'y'` | Independent chart axis used to acquire one index slice. |
|  | `tolerance` | `number` | Near-axis acquisition radius as a plot-size fraction. Defaults to 0.01. |
|  | `show` | `'all' \| 'single' \| { series: value }` | Which series to present: all, the first series, or a preferred initial series. |
|  | `seriesBy` | `string` | Record field identifying a series; single-series policies switch through the legend. |
|  | `displayValue` | `boolean` | Show compact series-colored labels on value guides inside the plot. Defaults to false. |
|  | `guide` | `{ visible?, style?: { color?, opacity?, width?, fillOpacity?, haloColor?, haloOpacity?, haloWidth? } } \| false` |  |
|  | `selector` | `{ select: { key } }` |  |
|  | `reset` | `ResetGesture[]` | Releases a locked series. Defaults to ['escape']. |
| `navigate` | `axes` | `'x' \| 'y' \| 'xy' \| 'available'` | 'available' navigates every axis the chart confirms. Defaults to 'available'. |
|  | `pan` | `boolean` | Defaults to true. |
|  | `zoom` | `boolean` | Defaults to true. |
|  | `wheelSensitivity` | `number` | Defaults to 0.002. |
|  | `domainGuard` | `{ minVisibleFraction?, maxVisibleFraction?, overscrollFraction? }` |  |
|  | `reset` | `ResetGesture[]` | Returns the viewport to the full frame. Defaults to ['double-click']. |
|  | `resetTransition` | `{ duration: ms }` | The flight home on reset. Defaults to 400 ms; `{ duration: 0 }` jumps. |
| `drag-reorder` | `reset` | `ResetGesture[]` | The order is a setting, so nothing resets it unless this list says so. |
| `accessible-navigation` | `emphasis` | `boolean` | Dim the marks outside the focused element, as a click highlight does. Defaults to true. |
|  | `dimOpacity` | `number` |  |
|  | `caption` | `boolean` | Show a visible caption naming the focused element and its content. Defaults to true. |
|  | `sections` | `('titles' \| 'axes' \| 'legends' \| 'headers' \| 'data' \| 'labels')[]` | The chart parts the walk reaches, in reading order. Defaults to every section. |
|  | `maxFields` | `number` | The most data fields read out for one mark. Defaults to 8. |
<!-- preset-options:end -->

## Use Flint in an application

### Mount

```bash
npm install flint-chart vega vega-lite vega-tooltip
```

```ts
import { buildInteractiveChart, navigate, legendToggle } from 'flint-chart/interactive';

const surface = buildInteractiveChart(container, input, {
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
| `refresh()` | Re-projects overlays after the host rescales the chart. |
| `element`, `chartId` | The mount's root and the stable chart id. |
| `destroy()` | Removes listeners, the renderer, and the DOM. |

- `input` is a `ChartAssemblyInput`. Presets go in `input.interaction_spec` as
  JSON or in `options.interactions` as factory calls (`clickHighlight()`,
  `select()`, `brushX()`, `navigate()`, …, one per preset, same options). Both
  may appear; spec entries mount first, and one `id` in both is an error.
- `options.updates` holds retained updates present at the first render, for a
  chart that starts with a part hidden or framed.
- `renderer: 'svg'` for charts whose marks a host reads from the DOM, or under
  a few thousand marks; `'canvas'` for maps and dense charts.
- A `Year` or `Date` field makes a temporal axis whose rows hold `Date`s or
  ISO strings; a bare number such as `2013` reads as milliseconds after 1970.
  A `semantic_types` entry may be an object,
  `{ semanticType, intrinsicDomain: [lo, hi] }`; the intrinsic domain holds an
  axis still while the rows change.
- `options: { addTooltips: false }` on the input when a tooltip would give
  away hidden values.
- Build with a bundler. The interactive entry reaches every backend through
  lazy imports; when `echarts`, `chart.js`, and `plotly.js-dist-min` are not
  installed, mark them external (esbuild
  `--splitting --external:echarts --external:chart.js --external:plotly.js-dist-min`;
  Vite `build.rollupOptions.external`).
- In React, mount in an effect, keep the surface in a ref, destroy in the
  cleanup.

### Change the chart: `ChartUpdate`

Every change from outside is one update, `{ id, ops }`:

| Op | Effect | Shape | Needs |
| --- | --- | --- | --- |
| `set-style` | Emphasize the targets and mute the rest; recolour; fade; hide. | `{ op, targets: UpdateTarget[], value: StyleSpec }` | marks |
| `set-annotation` | Pin a note on one mark; `null` clears it. | `{ op, target: UpdateTarget, value: { text } \| null }` | one resolved element |
| `set-viewport` | Frame a continuous domain. | `{ op, axes: 'x' \| 'y' \| 'xy', value: { x?: [lo, hi], y?: [lo, hi] } }`; on a multi-level map `value: { region: { key } }` | `navigate` or `brush-zoom` mounted on that axis |
| `set-order` | Reorder a discrete axis. List every category in the order wanted. | `{ op, scope: 'category', field, values: unknown[] }` | `drag-reorder` mounted on that axis |
| `set-overlay` | Draw rows through the plot's own scales. | `{ op, name, value: { mark, data: { values }, encodings: { x, y, x2?, y2?, order?, color?, text? }, role, interactive?, projectable?, style? } \| null }` | x and y scales |
| `set-freeform-overlay` | Draw SVG, or a clone of marks, over the plot. | `{ op, name, value: { coordinateSpace: 'plot' \| 'renderer', body: [{ type: 'svg', content } \| { type: 'clone', targets, transform?, opacity? }] } \| null }` | — |
| `set-data` | Replace every row the chart draws; the rows carry every encoded field. | `{ op, source: 'main', value: { rows } }` | inline data |

`StyleSpec` is `{ state?, opacity?, visible?, fill?, stroke?, strokeWidth?,
mutedOpacity? }`. Two states matter from outside: `emphasized` keeps the
targets at full ink and mutes every other mark; `normal` with `targets: []`
clears the layer. To fade a subset and leave the rest alone, set `opacity` on
the targets; `opacity: 0` hides marks and keeps the axes, where
`visible: false` removes the rows and shrinks the scales. The mute level is one
per chart, fixed at mount from the lowest `mutedOpacity` the mounted
interactions carry (0.25 when none); a `mutedOpacity` in a later update does
not change it.

Overlay marks are `line`, `point`, `rule`, `rect`, `text`. `encodings` name
fields of the overlay's own rows, projected through the chart's x, y, and
colour scales. `style` takes `stroke`, `strokeWidth`, `strokeDash`, `fill`,
`fillOpacity`, `opacity`, `pointRadius`, `fontSize`, `fontWeight`, `textAlign`
(`start`, `middle`, `end`), `dx`, `dy`. A `line` takes its stroke and a `text`
its fill from the `color` encoding; a `point` takes `style.fill`.

**Targets.** Two forms:

```ts
{ select: { key: { Country: 'Japan' } } }                 // rows the chart encodes
{ visual: { kind: 'mark', role: 'mark' }, elements }      // elements from an event or the state
```

- A selector key names fields the chart encodes (`x`, `y`, `color`, `detail`,
  `size`, …) and matches rows by equality, so `'2007'` and `2007` differ. One
  key may cover many marks (`{ Continent: 'Africa' }` takes every African
  mark); several fields narrow it; an annotation's key must cover one. On a
  line or area chart, a key on the series field covers the whole line.
- A field the chart does not encode never resolves: encode the identity field
  (`detail` on a scatter), or pass elements from `event.target`,
  `state.selected`, or `context.available` through as `{ visual, elements }`.
  Pass elements as they are: an element's `value` carries derived fields on a
  bar, pie, heatmap, or waterfall mark (a stack start, a sort index), so a key
  copied from it does not resolve, where a key on the encoded fields does.
- A target that matches nothing is listed in the result, never rebound to a
  near match.

**The result.** `applyUpdate`, `setUpdates`, and `dispatch` return a
`ChartUpdateResult`: `{ status: 'applied' | 'partially-applied' |
'unsupported', resolvedTargets, unresolvedTargets, unsupportedOps }`. Read it.
An unresolved target has a wrong field or value; an unsupported op needs a
preset the chart does not mount.

**Ids are layers.**

- One id holds one concern: the agent's update, a story step, a linked
  selection. `applyUpdate` with an id already retained replaces that layer;
  `clearUpdate(id)` removes it.
- A replacing update carries only what it lists: an omitted viewport flies
  home, an omitted order returns to the input order, an omitted annotation
  disappears. Repeat the ops that should hold.
- Layers compose in insertion order, and a replaced layer keeps its place:
  styles accumulate across layers; for an annotation, an order, a data swap,
  or an overlay name, the layer inserted last wins. One kind of op lives in
  one layer: a drag and a playback that both swap the rows write the same id.
- A canvas interaction retains its layer under its own `id`. A host may write
  or clear that layer by the id, as a Reset button does.
- A gesture reset (`click-none`, `escape`, `double-click`) clears preset
  layers only. A host layer stays until the host clears it.

### Read the chart

| `getState()` field | Holds |
| --- | --- |
| `selected` | The marks the chart emphasizes now, previews included. |
| `entries` | The same marks per update id, with `layer: 'retained' \| 'preview'`. |
| `hidden` | Legend values a `legend-toggle` hides, as `{ channel, value }`. The toggle owns them: no update hides or restores a legend value; fade marks with `opacity` instead. |
| `viewport` | The domain on view after a pan or zoom; absent on a chart that does not navigate. |
| `categoryOrder` | The order of the reorderable axis now. |
| `windows` | Category rail windows, `{ start, count, total }` per channel. |

Each element's `value` is the mark in field terms: a bar's category and
measure, a legend item's `{ channel, field, domain }`, a histogram bar's
`{ field, range }`. The host owns the rows and queries them from the value and
the geometry; the chart hands over no copy of the data.

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

### Link charts, and drive a chart over time

Each chart decides what a shared payload means to it; the host owns the wiring.

```ts
import { clickHighlight, externalInteraction } from 'flint-chart/interactive';

const linked = externalInteraction<{ countries: string[] }>({
  id: 'linked',
  handle: ({ countries }) => ({
    id: 'linked',
    ops: countries.length > 0
      ? [{ op: 'set-style', targets: countries.map((c) => ({ select: { key: { Country: c } } })),
           value: { state: 'emphasized' } }]
      : [{ op: 'set-style', targets: [], value: { state: 'normal' } }],
  }),
});
// mount every chart with `interactions: [clickHighlight({ targets: ['mark'] }), linked]`, then:
for (const [id, source] of surfaces) {
  source.onChange(({ phase, interactionId, target }) => {
    if (phase !== 'commit' || !interactionId) return;       // host writes carry no id: no loop
    const countries = (target?.elements ?? []).map((element) => String(element.value.Country));
    for (const [other, surface] of surfaces) if (other !== id) void surface.dispatch('linked', { countries });
  });
}
```

`dispatch` is also how an application drives a chart over time: a playback
loop dispatches one frame per animation frame, and the handler returns the
whole layer for that frame. Give linked charts one `theme_spec` so a value has
one colour everywhere.

### An agent in the loop

A host mounts the chart and hands the model the input and the state, as text
or as data. The MCP chart view does this after every committed gesture:

```
The chart "Life expectancy" emphasizes 3 marks where continent = Asia.
Hidden: Africa.
The y axis shows life from 70 to 86.
```

The model answers with one `ChartUpdate`; the host applies it and returns the
result.

1. Read the state: the marks emphasized, `hidden`, `viewport`.
2. Decide what the reader should see: which rows stand out, what one note
   says, which range frames them. Compute nothing the chart cannot verify.
3. Name targets by encoded fields, with values from the rows you were given. A
   key may cover many marks; an annotation's key covers one.
4. Use one stable id, such as `agent`, and return the whole layer each turn:
   carry the ops that still serve the reader, drop the ones the request
   replaces.
5. Add `set-viewport` only when the chart navigates: the host says so, or
   `viewport` is in the state. Add `set-order` only when it reorders. When the
   chart does neither, say so and offer an emphasis; `set-data` replaces what
   the chart shows and is not a frame.
6. On the result, fix an unresolved key before saying what the chart shows.

To stand down: `{ "id": "agent", "ops": [{ "op": "set-style", "targets": [],
"value": { "state": "normal" } }] }`, or the host calls `clearUpdate('agent')`.

## Build a bespoke interaction

A `CanvasInteractionDef` is a trigger, what it affords, and a handler. Mount
it in `options.interactions` beside presets.

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
| `affordances` | The kinds of hit it receives, each with its cursor and hover. A hit of a kind not listed never reaches the handler. Keys: `mark`, `legend-item`, `axis-label`, `plot`. Cursors: `activate`, `drag`, `region`, `navigate`, `inspect`, `draw`. Hovers: `target` (the mark), `cohort` (its group). |
| `handle(event, context)` | Returns the whole update for this id, or `null` for no change. |
| `reset` | Optional gestures that clear the layer: `click-none`, `double-click`, `escape`. A reset reports as a commit with no `interactionId`; give it to a layer of styles the state shows, and clear an overlay or data layer from the host instead. |

### Triggers

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

`match` is `'intersect'` (default) or `'contain'`, and decides which marks the
region's `target` lists. `guide` styles the drawn shape; `false` hides it. A
region is ephemeral: its guide and its preview end at the commit. An axis brush
with `mode: 'stateful'` keeps the interval on screen and editable;
`event.operation` then reads `create`, `move`, `resize-leading`,
`resize-trailing`, or `clear`. Spread a trigger to tune it:
`{ ...hoverTrigger, defaultAssistDistance: 28 }` acquires the nearest mark
within 28 px.

A chart type admits a trigger when it offers what the trigger needs: marks
that resolve to data for element triggers, a drag region for region triggers,
a continuous axis for navigation, a discrete axis for an element drag. A code
definition the chart cannot honour throws at mount with a message that names
what it needed; the preset map's "Needs" column says what each chart offers.

### The event

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
  region target lists every mark inside. A legend hit has `value.field` and
  `value.domain.value`.
- `geometry.domain` is inverted through the plot's scales: a temporal axis
  gives `Date` values; a discrete axis gives the category.
- `description` arrives on `focus-element` while `accessible-navigation` walks
  the chart: what the focused element is (`type`, such as "Bar") and what it
  represents (`content`), with the spoken `text`. The walk's emphasis reports
  through `onChange` as a `preview`.
- `geometry.projection.kind === 'path'` during a drag over an overlay with
  `projectable: true`: `segment.start.value` and `segment.end.value` are the
  overlay rows on each side of the pointer and `segment.t` the fraction between
  them.
- `context` is the chart state plus `available`, every drawn mark, for
  building refs, and `selected`, the current emphasis, for a toggle rule.

### Handler rules

- Return the complete layer for the id on every `preview` and `commit`; the
  runtime drops the preview on `cancel`. A `null` on a `preview` shows nothing
  until the commit, which is how a rule applies to the committed box only. A
  region gesture keeps a preview layer under the interaction's id while the
  drag runs, so a handler that returns `null` on the commit after previews lets
  the last preview take the layer: restate the layer instead.
- The handler maps geometry to the host's model and the model to ops. It never
  reads or writes the DOM. Host side effects (state, panels, overlays the host
  draws) come from `flint-interaction` or `onChange`.
- One trigger has one owner, for code definitions as for presets. Two code
  definitions on one trigger throw at mount; mount `navigate({ pan: false })`
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

### Patterns

| Pattern | Flow | Pieces |
| --- | --- | --- |
| Gesture rule | Flint in, Flint out | A region trigger reads `geometry.domain`; the host rule picks rows; `set-style` by key (the timebox above). |
| Host-drawn detail | Flint in, custom out | `hoverTrigger` or `inspectTrigger` with a `null` handle; the host listens to `flint-interaction` for the resolved element and draws a lens, a cursor, or a badge over the mount. |
| Application drives the chart | external in, Flint out | `externalInteraction` plus `dispatch` per frame: a playback year, a reveal progress. |
| Drag along a path | press, then drag | One `dragTrigger()` definition and one layer. At `start` on a mark it returns the mark's path as a `set-overlay` `line` with `interactive: true, projectable: true` and `order`, plus `set-data` for the current position. On `preview` and `commit` with `geometry.projection` it returns the same two ops for the pointer's position. `intrinsicDomain` on the x and y fields holds the axes still across the swaps. |
| Freehand stroke | draw | The rows to guess form their own series, and a mount update sets `opacity: 0` on that series, which keeps the axis. `lassoTrigger('contain', false)` with `plot: { cursor: 'draw' }` is the pen: `geometry.domain.points` become the rows of a `set-overlay` line. An `externalInteraction` reveals the truth as an overlay, then the host clears the hide. |
| Chart-level zoom | wheel | When the layout itself must change (bar step, ticks, domain), filter the rows and `buildInteractiveChart` again in a hidden layer; swap on `ready`. No preset re-lays out. |
| Semantic zoom on a map | navigate | A Choropleth with `level: 'auto'` or a Map with `levelField` and `levels`, `navigate()`, and `set-viewport { region: { key } }` with a `transition` to fly into a region. Navigation events carry `geometry.domain.level` and `focus`. |

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

In each example `data` is a placeholder; the host binds real rows.

### Presets: a multi-series line chart in an explore session

User: "Help me understand how these three regions moved." The chart:

```json
{
  "data": { "values": [] },
  "semantic_types": { "month": "YearMonth", "sales": "Amount", "region": "Region" },
  "chart_spec": { "chartType": "Line Chart", "encodings": { "x": { "field": "month" }, "y": { "field": "sales" }, "color": { "field": "region" } } }
}
```

The reader compares the series at one month, hides a region, and points at a
period. `inspect-index` reads every series at one x; `legend-toggle` has a
colour field to work with; `brush-x` focuses a period. `inspect-index` and
`legend-toggle` do not collide: the index reads all series, so it asks for no
legend click.

```json
{
  "interactions": [
    { "type": "inspect-index" },
    { "type": "legend-toggle" },
    { "type": "brush-x" }
  ]
}
```

### Presets: a chart that drives the app

User: "In my dashboard, a click selects the country and a double-click opens
its page. Zooming the y axis would help too." A scatter of `gdp` by `life`
with `color: continent` and `detail: country`.

`navigate` holds the double-click by default for its reset, and
`double-activate` needs it. Free it with `reset: ["escape"]`. `click-highlight`
takes `targets: ["mark"]` so the app's selection never comes from a legend
click.

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

### ChartUpdate: an agent points out rows

User: "Which Asian countries are past 80 years? Point them out." The chart is
the scatter above, with `navigate` on `y`, and the state says nothing is
emphasized. The agent finds Japan and Singapore in its rows and answers:

```json
{
  "id": "agent",
  "ops": [
    { "op": "set-style",
      "targets": [
        { "select": { "key": { "country": "Japan" } } },
        { "select": { "key": { "country": "Singapore" } } }
      ],
      "value": { "state": "emphasized" } },
    { "op": "set-annotation",
      "target": { "select": { "key": { "country": "Japan" } } },
      "value": { "text": "Japan, 82.6 years" } },
    { "op": "set-viewport", "axes": "y", "value": { "y": [70, 86] } }
  ]
}
```

`country` resolves because it is encoded on `detail`. The result returns
`applied` with two resolved targets; a key with `"Country"` would come back
unresolved, and the agent fixes the spelling before it describes the chart.

### Code: two linked charts

Two bar charts share a `Country` field: GDP per country, and population per
country. A click on one emphasizes the same country on the other.

```ts
import { buildInteractiveChart, clickHighlight, externalInteraction } from 'flint-chart/interactive';

const linked = externalInteraction<{ countries: string[] }>({
  id: 'linked',
  handle: ({ countries }) => ({
    id: 'linked',
    ops: [countries.length > 0
      ? { op: 'set-style', targets: countries.map((c) => ({ select: { key: { Country: c } } })), value: { state: 'emphasized' } }
      : { op: 'set-style', targets: [], value: { state: 'normal' } }],
  }),
});

const surfaces = new Map([
  ['gdp', buildInteractiveChart(gdpEl, gdpInput, { backend: 'vegalite', interactions: [clickHighlight({ targets: ['mark'] }), linked] })],
  ['population', buildInteractiveChart(popEl, popInput, { backend: 'vegalite', interactions: [clickHighlight({ targets: ['mark'] }), linked] })],
]);
for (const [id, source] of surfaces) {
  source.onChange(({ phase, interactionId, state }) => {
    if (phase !== 'commit' || interactionId !== 'click-highlight') return;
    const countries = state.selected.map((element) => String(element.value.Country));
    for (const [other, surface] of surfaces) if (other !== id) void surface.dispatch('linked', { countries });
  });
}
```

A `click-none` reset on the source reports a commit with no `interactionId`,
so the guard also covers it; to mirror the reset, drop the `interactionId`
test and keep the `phase` test. The dispatch is a host write, which carries no
`interactionId`, so the other chart never dispatches back.

### Bespoke: a rule over the brushed box

A line chart of `Series` by `Month`. The reader drags a box; the series whose
every point in that month range lies inside the y range stay emphasized. No
preset applies a rule over series, so the definition is the `timebox` above:
`rectangleTrigger('contain')`, a `plot` affordance with the `region` cursor,
a handler that acts on `select-region` at `commit`, and `reset:
['click-none', 'escape']` so a click on empty plot clears it. Mount it beside
`navigate({ pan: false })` if the chart also zooms; both ask for the plot drag
otherwise.

## Limits and gotchas

- No preset changes the layout: zooming never recomputes the bar step, the
  ticks, or the domain. Filter the rows and mount again for that.
- No update hides or restores a legend value; `legend-toggle` owns `hidden`.
  Fade marks with `opacity` instead.
- The tooltip is always on; `options: { addTooltips: false }` on the input is
  the only switch.
- The mute level is fixed at mount; a later `mutedOpacity` does not change it.
- Viewport bounds on a temporal axis take `Date` or epoch milliseconds, never
  a bare year.
- `set-annotation` needs exactly one resolved element. On a paired mark such
  as a dumbbell, name the end that resolves alone.
- A selector resolves to marks when its update is stored. After `set-data` the
  marks are new, so apply the style layer again with the data.
- A press on an overlay path resolves to no mark, so a `click-none` reset on
  the definition that drew the overlay clears it at that press.
- A preset's toggle (`select`, `click-highlight`) needs Shift, Ctrl, or Meta; a
  plain second click replaces.
- Escape reaches a chart after a press on it, and only that chart.
- The package's lazy imports carry no file extension, so a browser cannot
  load it from `node_modules` through an import map. Build with a bundler.

## What you should NOT do

- **Don't invent names.** Presets, options, ops, states, triggers, cursors, and
  event actions are the ones in this skill. A behaviour outside them is a
  bespoke definition or a plain answer that it is not available.
- **Don't add behaviour nobody asked for.** A static image, a bare spec, and a
  request for a tooltip get no entry.
- **Don't write an option beside `type`, an `id` inside `options`, or a bare
  string entry.**
- **Don't put two owners on one trigger.** Free the double-click with `reset`,
  the legend click with `targets`, the plot drag with `pan: false`.
- **Don't send a partial layer.** An update replaces the whole layer for its
  id; repeat the ops that should hold.
- **Don't name a field the chart does not encode in a selector.** Encode it or
  pass elements through.
- **Don't read or write the DOM in a handler.** Return ops; let the host react
  through `onChange` or `flint-interaction`.
- **Don't claim what the chart shows before the result says `applied`.**

## Validation checklist

For an `interaction_spec`:

1. It parses as strict JSON and is a bare object with `interactions`.
2. Every `type` is in the chart type's list from `list_chart_types`, and every
   option is under `options` with `id` on the entry.
3. `groupBy` and `seriesBy` are present where required, and name bound fields.
4. At most one entry owns the plot drag, the double-click, the legend click,
   and the retained mark focus.
5. `validate_chart` returns no warning.

For a `ChartUpdate`:

1. Every `op` and `state` is one from the op table.
2. Every selector key names encoded fields with values that exist in the rows.
3. The update is the whole layer for its id; clearing uses `targets: []` with
   `state: 'normal'`.
4. Ops that need a mounted preset have it, or `unsupportedOps` has been read
   and acted on.
5. The result came back `applied` before you said what the chart shows.

For code:

1. Every trigger, cursor, and field name is one from this skill or the
   installed `flint-chart/interactive` types.
2. Every definition declares `affordances` for the hits its trigger yields.
3. No two definitions, and no definition and spec entry, share a trigger or
   an `id`.
4. The surface is destroyed on unmount, and every `applyUpdate` or `dispatch`
   result is read.
