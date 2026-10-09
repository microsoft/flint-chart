---
name: flint-interaction-author
description: "Use when: a Flint chart should respond to the reader (highlight, zoom, brush, legend toggle, reorder, annotate, explore, link charts); an application or an agent changes a mounted chart from outside or reads what it shows; or a gesture no preset gives must be built. Produce one valid interaction_spec, one ChartUpdate, or code against flint-chart/interactive, with no invented names."
---

# flint-chart: interactions and updates on a chart

A Flint chart is shared state. A reader's gesture becomes an event, a handler
turns the event into an update `{ id, ops }`, updates compose as layers, and
the layers render into a state the host and the agent read back. An
application and an agent write the same kind of update directly. The full
model is in the documentation:
https://microsoft.github.io/flint-chart/#/documentation/interaction-introduction

The chart itself (`chart_spec`, `semantic_types`) is the `flint-chart-author`
skill. Everything here runs on the Vega-Lite backend; a static render and the
other backends leave `interaction_spec` and updates untouched.

## What you produce (and what you do NOT)

| The request says | You produce | Section |
| --- | --- | --- |
| A gesture or a behaviour on the chart: "highlight on click", "zoom", "brush a period", "make it interactive", "add behaviour to this chart". | One `interaction_spec`: `{ "interactions": [ ... ] }`, presets only. | Add interactions to the chart |
| A change to a chart that is already on screen, from outside: "point out Japan", "frame 2010 to 2020", "note this value", "reorder by value", an agent answering a user with the chart. | One `ChartUpdate`: `{ "id", "ops": [ ... ] }`. | Update the chart |
| Code around a chart: "in my app", "on click open the record", "link these two charts", "a panel that follows the hover", "play the years". | TypeScript against `flint-chart/interactive`: mount, presets as factories, `onChange`, `dispatch`. | Use Flint in an application |
| A gesture no preset gives: "drag along the path", "draw a guess", "a rule for the box", "a lens the app draws". | A `CanvasInteractionDef`: a trigger, affordances, a handler. | When no preset fits |

- **DO** use only the names in this skill: preset types, options, ops, states,
  triggers, cursors, event actions. Every name here is one the library ships.
  When the request asks for a behaviour no preset gives, say which preset
  comes closest and what it leaves out, then offer a bespoke definition if the
  host runs code.
- **DO** add behaviour only when the request or the session asks for it. A
  static image or a bare spec gets no `interaction_spec`.

## Which workflow the user is asking for

- **Presets through the MCP tools:** put the object beside `chart_spec` as
  `interaction_spec` in the input of `create_chart_view`; `validate_chart`
  reports the same warnings without rendering. `list_interaction_presets`
  with `chartType` lists the presets that chart type supports, what each
  does, and its options.
- **An update through the MCP tools:** there is no handle on the chart. Pass
  the layers as the `updates` argument of `create_chart_view`, beside the
  input; see "Step 4 — send the layer and read the result".
- **Code, only when the user asks for code:** mount with `mountChart`, or
  `<FlintChart>` in React; presets as factory calls, updates with
  `applyUpdate`, state with `getState` and `onChange`. The programming API
  is documented at
  https://microsoft.github.io/flint-chart/#/documentation/interaction-api
- **A bespoke interaction** needs a host that runs code. In the MCP view, the
  answer is the closest preset and what it leaves out.

## Add interactions to the chart

### Step 1 — read the request and the chart

Three things in the request decide the entries, read in this order:

1. **What the user named.** A gesture or a preset in their words: "brush a
   period", "zoom", "toggle the legend", "highlight on click". Each is one job.
2. **The goal they stated.** "Explore", "compare the regions", "find
   outliers", "present this", "a control in my app". A goal is the set of
   questions the reader will ask of this chart; each question is one job.
3. **Nothing named**, only "interactive", a live view, a dashboard. The chart
   and the data say what the reader can do with it.

Then read the chart spec: the chart type, the field on each channel, and the
shape of the data. What a chart invites a reader to do:

| The chart | Invites |
| --- | --- |
| A time series, one or many series | Comparing the series at one x; focusing a period; hiding a series when a colour field is bound; moving along the series when it is long. |
| A scatter or a dense point chart | Focusing a cluster; moving closer; hiding a series when a colour field is bound. |
| A bar, lollipop, or other category chart | Singling out a category; ranking by hand; hiding a series when a colour field is bound. |
| A pie, donut, rose, or radar | Singling out a sector; focusing adjacent sectors. |
| A heatmap or a calendar | Singling out a cell; reading a whole row or column. |
| A map | Singling out a region; moving closer. |
| A chart that is a control in an app | A click the app reads as a selection; a stronger gesture the app reads as an activation. |
| A chart read without a pointer | Walking the chart from the keyboard. |

### Step 2 — pick presets

Before any entry, a mounted chart already shows a tooltip with the mark's
values on hover and nothing else. An entry adds one behaviour.

Take one row of the map per job. A named gesture takes the row whose
"Gesture" is that gesture. A question takes the row whose "Answers" is that
question, on a chart whose "Needs" it offers; a broad goal takes two or three
rows, the ones the chart invites most. When nothing is named, the rows the
chart invites, two or three. A row that answers no job on the request stays
out.

| Preset | Gesture | Answers | Needs | Default reset |
| --- | --- | --- | --- | --- |
| **Single one thing out** | | | | |
| `click-highlight` | Clicks a mark, a legend item, or an axis label; it stays emphasised and the rest mute. Shift-click adds. | Which mark, series, or category is this one? | elements | click-none, escape |
| `click-group-focus` | Clicks a mark; every mark in its group stays emphasised. `groupBy` names the group field. | Which marks belong with this one? | elements | click-none, escape |
| `hover-group-focus` | Hovers a mark; its group previews until the pointer leaves. `groupBy` names the group field. | Which marks belong with this one, at a glance? | elements | none |
| `axis-highlight` | Clicks (or with `event: "hover"`, hovers) a discrete axis label; that category's marks emphasise. | Which marks share this row or column? | discrete axis | click-none, escape |
| **Read values** | | | | |
| `inspect` | Moves over the plot; a guide follows the pointer and the nearest mark on the chosen axes reads out. `mode` picks the axes and a comparison (`"x>"` reads every mark past the pointer). | What is at this x, this y, or beyond it? | elements | none |
| `inspect-index` | Moves along the index axis; every series reads out at that position on one guide, each value labelled in its series colour and the position named at the axis. `show: "single"` reads one series and switches it through the legend; `seriesBy` names the series field when the chart draws one series at a time; `displayValue: false` keeps the guides and drops the labels. | What does each series hold at this point? | index axis | escape |
| **Focus a region** | | | | |
| `select` | Drags a rectangle; the marks inside emphasise. | Which marks lie in this area? | elements, cartesian region | click-none, escape |
| `lasso-select` | Draws a freehand region; the marks inside emphasise. | Which marks lie in this irregular cluster? | elements, cartesian region | click-none, escape |
| `brush-x`, `brush-y` | Drags an interval along one axis; the marks in it emphasise. `mode: "stateful"` keeps the interval on screen to move and resize. On a polar chart the x brush is a sector. | Which marks fall in this period or this range? | elements, cartesian region | click-none, escape |
| `brush-angle` | Drags an angular sector on a pie, donut, rose, or radar; the slices in it emphasise. | Which adjacent slices make up this share? | elements, angular region | click-none, escape |
| `linked-brush` | Drags a region; the groups inside emphasise in every chart that mounts the same preset. `groupBy` names the shared field. | Where are these groups in the other charts? | elements, cartesian region | click-none, escape |
| **Move the view** | | | | |
| `navigate` | Drags to pan; wheels or pinches to zoom a continuous axis. `axes` limits it; `pan: false` leaves the plot drag free. | What is in this part of the range, closer? | navigation | double-click |
| `brush-zoom` | Drags a rectangle; the chart flies into it. | What is in this box, closer? | navigation | double-click, escape |
| **Reduce or rearrange** | | | | |
| `legend-toggle` | Clicks a legend item; its series hides or returns. Hidden series are a setting and survive every reset. | What does the chart look like without this series? | discrete legend | none |
| `drag-reorder` | Drags a discrete axis label to a new place; the categories reorder. | How do these rank in the order I choose? | reorderable axis | none |
| `filter-controls` | Picks values in controls beside the chart; the rows that fail are removed, or muted with `mode: "highlight"`. One control per listed field. | What does the chart show for this subset of a field it does not draw? | inline data | none |
| **Mark for the reader** | | | | |
| `click-annotate` | Clicks a mark; a note with its value pins to it. | What is this value, left on the chart? | elements | click-none, escape |
| **Hand a gesture to the app** | | | | |
| `double-activate` | Double-clicks a mark; the mark activates and the host reads it. | Which record should the app open? | elements | click-none, escape |
| `long-press` | Holds a mark (500 ms); the mark activates. The touch spelling of the same activation. | Which record should the app open, on touch? | elements | click-none, escape |
| `context-activate` | Right-clicks or long-presses a mark; the host receives a context target and draws its own menu. | What can the app do with this mark? | elements | none |
| **Read without a pointer** | | | | |
| `accessible-navigation` | Tabs into the chart and walks titles, axes, legends, facet headers, series, and marks with the arrow keys; each step says what the element is and emphasises its data. Space on a focused element runs the click presets. | What is on this chart, from the keyboard or a screen reader? | elements | none |

Within a family the rows answer neighbouring questions, so one chart takes
one of them: `inspect` reads the marks near the pointer, `inspect-index` reads
every series at one index; `select` takes an area, `brush-x` a period, `lasso`
a shape; `navigate` moves continuously, `brush-zoom` jumps into a box;
`double-activate`, `long-press`, and `context-activate` are three spellings of
"hand this mark to the app" for a mouse, a finger, and a menu.

"Needs" is what the chart type offers; `list_chart_types` has already applied
it to the list it returns. The data confirms a few at mount, in Step 3. A
viewport a gesture commits, and a reset, fly over 400 ms;
`"transition": { "duration": 0 }` or `"resetTransition": { "duration": 0 }`
jumps. Panning and wheel zooming follow the pointer.

**`filter-controls`.** It draws real controls beside the chart and changes the
rows the chart shows, so it answers a request that names a field to filter by
("filter by region", "one year at a time", "let me pick the group"), or a data
column the chart does not encode whose values are versions of the same chart:
a year in a snapshot scatter, a population group, a scenario. A field the
chart already draws has its own preset: the colour field `legend-toggle`, a
continuous axis `brush-x` or `navigate`, a category on an axis
`click-highlight`; and the measure the chart plots is the chart. List `fields`
explicitly, one or two, three at most: unlisted, the preset picks up to four
categorical and temporal fields itself. One entry per chart. A fixed subset
belongs in the data, and slices side by side are a facet in the
`flint-chart-author` skill.

### Step 3 — resolve conflicts

Each trigger has one owner. At mount, admission gives a trigger to the first
entry that asks for it; a later entry that asks for the same trigger yields
it with an `info` warning when it can keep the rest, or is dropped with a
warning when it cannot. The chart still renders. Four triggers are asked for
by more than one preset:

| Trigger | Asked for by | Free it with |
| --- | --- | --- |
| The plot drag | `navigate` with pan on, every region preset, `brush-zoom`, `drag-reorder` | `"pan": false` on `navigate` beside one region preset |
| The double-click | `double-activate`, and any entry whose `reset` holds `double-click` (`navigate` and `brush-zoom` by default) | `"reset": ["escape"]` on `navigate` or `brush-zoom` |
| The legend click | `legend-toggle`, `click-highlight`, `inspect-index` with `show: "single"` | `"targets": ["mark"]` on `click-highlight` |
| The retained mark focus | `click-highlight`, `click-group-focus` | one of them |

`click-highlight` yields a legend or an axis click on its own, with an `info`
warning; `targets` keeps the spec silent. `accessible-navigation` takes no
pointer trigger, so it sits beside any entry.

The data confirms what the chart type cannot promise. An entry that fails one
of these at mount is dropped with a warning:

- `legend-toggle` needs a colour field bound to a discrete legend.
- `navigate` and `brush-zoom` need a continuous, unfaceted axis.
- `drag-reorder` needs a discrete axis in the bound encodings.
- `inspect-index` needs an index axis, which it finds itself: the temporal
  axis, else the discrete axis beside a measure, else x. A horizontal bar
  chart reads along y with no option; `axis` overrides the choice. `seriesBy`
  names the series field when the chart draws one series at a time.
- `click-group-focus`, `hover-group-focus`, and `linked-brush` need `groupBy`,
  a bound field.

### Step 4 — write and validate

The object is `{ "interactions": [ ... ] }`, beside `chart_spec` as
`interaction_spec`. Every entry is
`{ "type": <preset>, "id"?: <string>, "options"?: { ... } }`:

- `type` is a preset from the map, supported by the chart type per
  `list_chart_types`.
- `options` holds the preset's own options; `list_interaction_presets` lists
  every one with its type (see "Preset options"). `reset` is one of them: omit it for the default list in the map, set it to
  free a trigger. A preset that keeps nothing (`hover-group-focus`, `inspect`,
  `context-activate`) accepts no `reset`.
- `id` sits on the entry and is needed only when one preset appears twice.
- In code, the same entry is a factory call with the same options:
  `clickHighlight({ targets: ['mark'] })`, `brushX()`, `navigate({ axes: 'x' })`.

```json
{
  "interactions": [
    { "type": "click-highlight", "options": { "targets": ["mark"] } },
    { "type": "navigate", "options": { "axes": "x" } },
    { "type": "legend-toggle" }
  ]
}
```

Run `validate_chart` with the object beside the chart spec. A malformed entry
is an error: an unknown `type`, an option beside `type`, an `id` inside
`options`, a bare string entry, a missing required option, an unsupported
`reset` gesture, a duplicate `id`. A dropped or yielded entry is a warning
that names the entry, what it needed, and the chart type:

```
Interaction "legend-toggle" requires a discrete legend; Bar Chart has none. The interaction was dropped.
Interaction "click-highlight" yields legend clicks to "legend-toggle".
```

Fix or drop what it warns about. Return the bare object, strict JSON, unless
the user asks for commentary.

### When no preset fits

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
region is ephemeral: its guide and its preview end at the commit. An axis brush
with `mode: 'stateful'` keeps the interval on screen and editable, and
`event.operation` reads `create`, `move`, `resize-leading`, `resize-trailing`,
or `clear`. Spread a trigger to tune it:
`{ ...hoverTrigger, defaultAssistDistance: 28 }` acquires the nearest mark
within 28 px. A chart admits a trigger when it offers what the trigger needs,
per the map's "Needs"; a code definition the chart cannot honour throws at
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

## Update the chart

### Step 1 — read the state

A host hands the model the chart input and the state, as text or as data. The
MCP chart view does this after every committed gesture:

```
The chart "Life expectancy" emphasizes 3 marks where continent = Asia.
Hidden: Africa.
The y axis shows life from 70 to 86.
```

The state is in field terms: which marks are emphasized and by which values,
which legend values are hidden, the viewport on view when the chart
navigates, the category order when it reorders. From it, decide what the
reader should see next: which rows stand out, what one note says, which range
frames them. The rows you were given are the source of every value; the chart
hands over no copy of the data, and nothing is computed that the chart cannot
verify.

### Step 2 — choose ops

Every change from outside is one update, `{ id, ops }`. Each op does one kind
of thing:

| Op | It is for | Effect | Shape | Needs |
| --- | --- | --- | --- | --- |
| `set-style` | The marks the chart already draws: emphasize some, fade some, hide some, recolour some. A highlight is this op with `state: 'emphasized'`. | Emphasize the targets and mute the rest; recolour; fade; hide. | `{ op, targets: UpdateTarget[], value: StyleSpec }` | marks |
| `set-annotation` | One mark that should carry a note. | Pin a note on one mark; `null` clears it. | `{ op, target: UpdateTarget, value: { text } \| null }` | one resolved element |
| `set-viewport` | The range or region the chart should frame. | Frame a continuous domain. | `{ op, axes: 'x' \| 'y' \| 'xy', value: { x?: [lo, hi], y?: [lo, hi] } }`; on a multi-level map `value: { region: { key } }` | `navigate` or `brush-zoom` mounted on that axis |
| `set-order` | The order of the categories on a discrete axis. | Reorder the axis; list every category in the order wanted. | `{ op, scope: 'category', field, values: unknown[] }` | `drag-reorder` mounted on that axis |
| `set-overlay` | Marks the chart does not draw: a reference line, a threshold band, a forecast, a sketch of rows. | Draw new rows through the plot's own scales. | `{ op, name, value: { mark, data: { values }, encodings: { x, y, x2?, y2?, order?, color?, text? }, role, interactive?, projectable?, style? } \| null }` | x and y scales |
| `set-freeform-overlay` | A custom shape with no data behind it. | Draw SVG, or a clone of marks, over the plot. | `{ op, name, value: { coordinateSpace: 'plot' \| 'renderer', body: [{ type: 'svg', content } \| { type: 'clone', targets, transform?, opacity? }] } \| null }` | — |
| `set-data` | The rows the chart draws, for playback or a swap. | Replace every row; the rows carry every encoded field. | `{ op, source: 'main', value: { rows } }` | inline data |

`StyleSpec` is `{ state?, opacity?, visible?, fill?, stroke?, strokeWidth?,
mutedOpacity? }`. Two states matter from outside: `emphasized` keeps the
targets at full ink and mutes every other mark; `normal` with `targets: []`
clears the layer. `opacity` on the targets fades a subset and leaves the rest
alone; `opacity: 0` hides marks and keeps the axes, where `visible: false`
removes the rows and shrinks the scales. The mute level is one per chart,
fixed at mount from the lowest `mutedOpacity` the mounted interactions carry
(0.25 when none).

Overlay marks are `line`, `point`, `rule`, `rect`, `text`. `encodings` name
fields of the overlay's own rows, projected through the chart's x, y, and
colour scales. `style` takes `stroke`, `strokeWidth`, `strokeDash`, `fill`,
`fillOpacity`, `opacity`, `pointRadius`, `fontSize`, `fontWeight`, `textAlign`
(`start`, `middle`, `end`), `dx`, `dy`. A `line` takes its stroke and a `text`
its fill from the `color` encoding; a `point` takes `style.fill`.

Two ops need a preset the chart mounts: `set-viewport` needs `navigate` or
`brush-zoom` on that axis, `set-order` needs `drag-reorder`. The host says
which are mounted, or the state shows `viewport` and `categoryOrder`. On a
chart that mounts neither, say so and offer an emphasis; `set-data` replaces
what the chart shows and is not a frame. Legend values belong to
`legend-toggle`: no update hides or restores one, and a series fades with
`opacity` instead.

### Step 3 — name targets and values

A target is one of two forms:

```ts
{ select: { key: { Country: 'Japan' } } }                 // rows the chart encodes
{ visual: { kind: 'mark', role: 'mark' }, elements }      // elements from an event or the state
```

- A selector key names fields the chart encodes (`x`, `y`, `color`, `detail`,
  `size`, …) and matches rows by equality, so `'2007'` and `2007` differ. One
  key may cover many marks (`{ Continent: 'Africa' }` takes every African
  mark); several fields narrow it; an annotation's key covers one. On a line
  or area chart, a key on the series field covers the whole line and a key on
  the x field covers one segment, so a run of segments is one target per row.
- A field the chart does not encode resolves to nothing. Encode the identity
  field (`detail` on a scatter), or pass elements from `event.target`,
  `state.selected`, or `context.available` through as `{ visual, elements }`,
  as they are: an element's `value` carries derived fields on a bar, pie,
  heatmap, or waterfall mark (a stack start, a sort index), so the element
  resolves where a key copied from it does not.
- A target that matches nothing is listed in the result as unresolved, and
  nothing nearby is taken in its place.

A key value, an overlay row, and a viewport bound hold what the parsed row
holds, not the source text: a CSV `120` is the number `120`, and a temporal
field (`Year`, `YearMonth`, `Date`, …) is UTC epoch milliseconds, so
`"2014-01"` and a local-time value match nothing; `Date.UTC(2014, 0, 1)` is
`1388534400000`. On a discrete axis the value is the category. Overlay rows
need the fields their mark reads: `line`, `point`, `text` read `x` and `y`;
`rule` and `rect` read `x`, `y`, `x2`, `y2`. A threshold is one `rule` row
from the first `x` to the last. An overlay whose rows do not project is
reported as unsupported.

```json
{ "id": "agent", "ops": [
  { "op": "set-style", "value": { "state": "emphasized" },
    "targets": [{ "select": { "key": { "month": 1388534400000 } } }, { "select": { "key": { "month": 1391212800000 } } }] },
  { "op": "set-overlay", "name": "threshold", "value": { "mark": "rule", "role": "reference",
    "data": { "values": [{ "x": 1388534400000, "y": 1e9, "x2": 1785542400000, "y2": 1e9 }] },
    "encodings": { "x": { "field": "x" }, "y": { "field": "y" }, "x2": { "field": "x2" }, "y2": { "field": "y2" } } } }
] }
```

### Step 4 — send the layer and read the result

**Ids are layers.** One id holds one concern: the agent's update, a story
step, a linked selection. Use one stable id, such as `agent`, and send the
whole layer each time:

- An update with an id already retained replaces that layer, and carries only
  what it lists: an omitted viewport flies home, an omitted order returns to
  the input order, an omitted annotation disappears. The ops that should hold
  are repeated; the ops the request replaces are dropped.
- Layers compose in insertion order, and a replaced layer keeps its place:
  styles accumulate across layers; for an annotation, an order, a data swap,
  or an overlay name, the layer inserted last wins. One kind of op lives in
  one layer: a drag and a playback that both swap the rows write the same id.
- A canvas interaction retains its layer under its own `id`; a host may write
  or clear that layer by the id, as a Reset button does.
- A gesture reset (`click-none`, `escape`, `double-click`) clears preset
  layers only. A host layer stays until the host clears it, or until a layer
  with `set-style`, `targets: []`, `state: 'normal'` replaces it.
- After `set-data` the marks are new; a style layer is sent again with the
  data.

**The result.** `applyUpdate`, `setUpdates`, and `dispatch` return a
`ChartUpdateResult`: `{ status: 'applied' | 'partially-applied' |
'unsupported', resolvedTargets, unresolvedTargets, unsupportedOps }`. An
unresolved target has a wrong field or value; an unsupported op needs a
preset the chart does not mount. What the chart shows is what the result says
it shows: fix an unresolved key or drop an unsupported op before describing
the chart.

**From the MCP view.** There is no `applyUpdate` to call. Pass the same layers
as the `updates` argument of `create_chart_view`, beside the chart input, not
inside it:

```json
{
  "data": { "values": [ ... ] },
  "chart_spec": { "chartType": "Bar Chart", "encodings": { "x": "region", "y": "revenue" } },
  "updates": [
    { "id": "agent", "ops": [
      { "op": "set-style", "targets": [{ "select": { "key": { "region": "East" } } }], "value": { "state": "emphasized" } },
      { "op": "set-annotation", "target": { "select": { "key": { "region": "West" } } }, "value": { "text": "Lowest in Q3" } }
    ] }
  ]
}
```

The view opens the chart with the layers applied, with the same look as a
user action. To change an open chart, call `create_chart_view` again with the
same input and the layers wanted now; the new list replaces what the previous
call declared. The argument is state, and `interaction_spec` is behaviour, so
each stays where it is. The reader's own brush or selection does not survive
the new view; the context message reports it in field terms, and it is
carried as a layer when it still serves the reader. `validate_chart` with the
same `updates` reports a malformed layer as an `invalid_updates` error; a
target that matches nothing, or an op the chart does not mount, is a warning
the view shows beside the chart.

## Use Flint in an application

### Mount

```bash
npm install flint-chart vega vega-lite vega-tooltip
```

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

### In React

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

### Read the chart

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
whole layer for that frame. Linked charts share one `theme_spec` so a value
has one colour everywhere.

Things the surface holds fixed: no preset changes the layout, so a zoom never
recomputes the bar step, the ticks, or the domain (filter the rows and mount
again for that); the mute level is set at mount; Escape reaches a chart after
a press on it, and only that chart; a preset's toggle (`select`,
`click-highlight`) needs Shift, Ctrl, or Meta, and a plain second click
replaces; a press on an overlay path resolves to no mark, so a `click-none`
reset on the definition that drew the overlay clears it at that press.

## Worked examples

In each example `data` is a placeholder; the host binds real rows.

### Presets: a named gesture

User: "An interactive chart that I can brush." A line chart of `sales` by
`month`, one series.

```json
{ "interactions": [ { "type": "brush-x" } ] }
```

The user named one job, a brush along the period axis, and the row for it is
`brush-x`. Hover already reads the values.

### Presets: a goal on a category chart

User: "Which regions stand out? Let me look." A bar chart of `revenue` by
`region`, no colour field.

The reader singles out a region and compares orders. `click-highlight` singles
one out; `drag-reorder` lets the reader rank by hand. No colour field is
bound, so `legend-toggle` has nothing to work with. Both presets ask for a
different trigger, a click on a bar and a drag on an axis label.

```json
{
  "interactions": [
    { "type": "click-highlight" },
    { "type": "drag-reorder" }
  ]
}
```

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
period. `inspect-index` reads every series at one month; `legend-toggle` has a
colour field to work with; `brush-x` focuses a period. `inspect-index` with
`show: "all"` asks for no legend click, so it sits beside `legend-toggle`.

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
import { mountChart, clickHighlight, externalInteraction } from 'flint-chart/interactive';

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
  ['gdp', mountChart(gdpEl, gdpInput, { backend: 'vegalite', interactions: [clickHighlight({ targets: ['mark'] }), linked] })],
  ['population', mountChart(popEl, popInput, { backend: 'vegalite', interactions: [clickHighlight({ targets: ['mark'] }), linked] })],
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
['click-none', 'escape']` so a click on empty plot clears it. It mounts beside
`navigate({ pan: false })` when the chart also zooms, since both ask for the
plot drag otherwise.

## Validation checklist

For an `interaction_spec`:

1. It parses as strict JSON and is a bare object with `interactions`.
2. Every entry answers a job from Step 1: a gesture the user named, a
   question their goal raises, or something the chart invites.
3. Every `type` is in the chart type's list from `list_chart_types`, and every
   option is under `options` with `id` on the entry.
4. `groupBy` and `seriesBy` are present where required, and name bound fields.
5. At most one entry owns the plot drag, the double-click, the legend click,
   and the retained mark focus.
6. `validate_chart` returns no warning.

For a `ChartUpdate`:

1. Every `op` and `state` is one from the op table.
2. Every selector key names encoded fields with values that exist in the rows,
   in the parsed form (epoch milliseconds for a temporal field).
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

## Preset options

`list_interaction_presets` returns every preset with what it needs from the
chart, its reset gestures, and every option it accepts under `options`, with
each option's type and note; `type` narrows it to one preset and `chartType`
to the presets a chart type supports. In code, the same options are the
factory's parameter type in `flint-chart/interactive`. `id` is never an
option: it sits on the entry. A `ResetGesture` is `click-none`,
`double-click`, or `escape`. `dimOpacity` is the opacity of the muted marks,
0.25 by default. A `guide` is `{ visible?, style? }`, or `false` to draw
nothing while the gesture runs.
