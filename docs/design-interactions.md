# Interaction Design

How a Flint chart behaves when a reader clicks, hovers, drags, or presses a key, and how a
chart type decides which of those behaviours it can honour.

> This document explains the model. For the authoring guide, see
> [Using interactions](interaction-spec.md). For the API surface, see the
> [API reference](api-reference.md).

## Table of Contents

- [§1 Overview](#1-overview)
- [§2 The interaction model](#2-the-interaction-model)
- [§3 The specification](#3-the-specification)
- [§4 Chart semantics](#4-chart-semantics)
- [§5 Capabilities and admission](#5-capabilities-and-admission)
- [§6 Reset](#6-reset)
- [§7 The pipeline](#7-the-pipeline)
- [§8 Hosts and discovery](#8-hosts-and-discovery)
- [§9 Extending the model](#9-extending-the-model)
- [Appendix: the declaration table](#appendix-the-declaration-table)

---

# §1 Overview

A Flint chart is three documents in one `ChartAssemblyInput`:

| Document | Says | Read by |
|---|---|---|
| `chart_spec` | what the chart means: type, encodings, properties | every assembler |
| `theme_spec` | how it looks | the Vega-Lite assembler |
| `interaction_spec` | how it behaves | the Vega-Lite interactive surface |

The assemblers never read `interaction_spec`. A static render is untouched by it. Only
`buildInteractiveChart()` does, after the chart is assembled.

Behaviour comes from **presets**: named interactions Flint ships, such as `click-highlight`
or `navigate`. Code reaches a preset through a factory, `clickHighlight({ dimOpacity: 0.2 })`.
A spec reaches the same preset through a name,
`{ "type": "click-highlight", "options": { "dimOpacity": 0.2 } }`. The registry maps the name
to the factory, so the two are two spellings of one definition. Everything below applies to
both.

Two facts about a chart decide what it can honour, and they are answered in two places:

- The **chart type** declares the properties it offers, in its template. This is static, known
  before any data.
- The **data** confirms the properties that depend on it, at assemble time: a legend needs a
  discrete legend channel bound, navigation needs a continuous axis.

Admission compares what a preset needs with what this chart, type and data together, provides.
A spec entry the chart cannot honour is dropped with a warning, and the chart renders. A code
definition the chart cannot honour throws, because a developer sees the exception.

# §2 The interaction model

## §2.1 Definitions

A preset factory returns a `CanvasInteractionDef`:

| Field | Role |
|---|---|
| `id` | names the interaction in updates and in the `flint-interaction` event; defaults to the preset name |
| `preset` | the preset that made it; admission reads its requirements from the core table |
| `eventSource` | the trigger: an element click or hover, a drag region, a navigation gesture |
| `reset` | the gestures that return it to neutral (§6) |
| `affordances` | cursor and hover feedback per target kind |
| `handle(event, context)` | turns a resolved semantic event into a `ChartUpdate`, or `null` |
| `origin` | `'spec'` when the resolver made it; absent for code |

An `ExternalInteractionDef` has no gesture. A host drives it through `surface.dispatch(id,
payload)`, and its `handle` turns the payload into an update. Linked dashboards and stories use
it.

## §2.2 Event sources

Three families, and admission reasons about them:

- **element**: a click, hover, long press, double-click, or inspect on marks, legend items, or
  axis labels. Needs marks that resolve to data.
- **region**: a drag that draws a rectangle, an interval along one axis, a lasso, or an angular
  sector, and resolves the marks inside. Needs a plot with a drag region of the right kind.
- **navigation**: a drag that pans and a wheel or pinch that zooms continuous axes, or a
  projection's extent on a map. Needs a navigable axis.

## §2.3 The update language

A `handle` never touches the DOM. It returns a `ChartUpdate`, `{ id, ops }`, and the runtime
applies it:

| Op | Effect |
|---|---|
| `set-style` | emphasise or mute targets, hide a series |
| `set-annotation` | pin or clear an annotation on a target |
| `set-viewport` | move a continuous domain or a projection |
| `set-order` | reorder a discrete domain |
| `set-overlay`, `set-freeform-overlay` | draw a guide or a free path |
| `set-data` | replace the rows a layer shows |

Targets are either references to resolved elements, `{ visual, elements }`, or selectors by row
key, `{ select: { key } }`. Hosts apply the same language from outside through
`surface.applyUpdate()` and `surface.setUpdates()`, so a story step and a click produce the same
kind of change.

## §2.4 The surface

`buildInteractiveChart(container, input, options)` returns an `InteractiveChartSurface`:
`ready`, `warnings`, `applyUpdate`, `setUpdates`, `clearUpdate`, `dispatch`, `refresh`,
`destroy`. The container emits a `flint-interaction` DOM event for every semantic event, with
the interaction id and the resolved target, so a host can listen without knowing the preset.

# §3 The specification

```json
{
  "interaction_spec": {
    "interactions": [
      { "type": "click-highlight" },
      { "type": "legend-toggle" },
      { "type": "navigate", "id": "pan", "options": { "axes": "y", "pan": false, "reset": ["double-click", "escape"] } }
    ],
    "assistedTargeting": true,
    "keyboardTargeting": false
  }
}
```

One plain shape, on purpose:

- Every entry is an object with a `type`. There is no string shorthand.
- Options nest under `options`. A flat option beside `type` is rejected with a hint, so a habit
  from the factory call cannot vanish silently.
- `id` sits on the entry, never inside `options`. It defaults to `type`, so two entries of one
  type need explicit ids.
- The two surface policies, `assistedTargeting` and `keyboardTargeting`, sit beside the list.
  They describe the surface, not one interaction.
- Retained state is not part of the spec. It arrives from the host through the surface.

The resolver, `resolveInteractionSpec()`, turns the spec into definitions and tags each
`origin: 'spec'`. It knows nothing about the chart. It rejects what is malformed: an unknown
`type`, a stray key, a non-object `options`, an `id` inside `options`, a missing required
option such as `groupBy`, an unknown or unsupported `reset` gesture, a duplicate id, and a
top-level key that is not one of the three, with a hint for the two keys the spec once had,
`dismiss` and `updates`. Every message names the entry by index and type.

`composeInteractiveOptions()` merges the spec with what code passed to
`buildInteractiveChart()`: spec entries first, then code; an id shared by both is an error; the
surface policies come from code when it sets them and from the spec otherwise; a backend that
runs no interactions ignores the spec with one `info` warning.

# §4 Chart semantics

Presets speak in data: "the bars for Asia". The renderer speaks in pixels. Each chart type owns
the translation, in `semanticInteractions` on its `ChartTemplateDef`. The assembler calls it
once per chart with the resolved encodings, and the runtime reads the result.

It returns a dictionary in three parts:

- **Roles.** `fields`, `categoryField`, `seriesField`, `legendFields`, `selectableMarks`: which
  fields play which part, which legend belongs to which field, which mark names a click can hit.
  Presets such as `click-group-focus` read these.
- **Two functions.** `resolve(event, context)` takes the physical hits under the pointer and
  returns a `SemanticTarget`: the data elements plus a visual kind and role such as `bar` or
  `legend-item`. `presentUpdate(update, context)` takes a generic update and returns the
  chart-specific version, for example where an annotation may sit on a bar.
- **Presentation.** `renderHoverStyles`, `renderSelectionStyles`, `annotationMarkType`,
  and where a template chooses its own reorder axis, `reorderAxes`.

This dictionary says **how to read** a chart. It does not say **what the chart type supports**.
Every one of the 36 Vega-Lite templates has one, so its presence carries no information about
support. That distinction is the reason the next section exists.

# §5 Capabilities and admission

## §5.1 Eight capabilities

A capability is a fact about a chart that at least one preset reads at runtime. There are eight,
`INTERACTION_CAPABILITIES` in core:

| Capability | The chart type says | The data confirms |
|---|---|---|
| `elements` | `elements: true`: marks resolve to data rows | nothing |
| `cartesian-region` | `region: ['cartesian']`: a rectangle, interval, or lasso drag resolves marks | nothing |
| `angular-region` | `region: ['angular']`: a sector drag resolves marks | nothing |
| `navigation` | `navigation: { axes?, geo? }` | a continuous field on x or y, on an unfaceted chart; or a projection |
| `reorder` | `reorder: { axes?, includeConnectiveMarks?, markTypes? }` | a discrete field on x or y, on an unfaceted chart |
| `legend` | `legend: true` | a discrete field on a legend channel |
| `discrete-axis` | `discreteAxis: true` | a discrete field on x or y |
| `index` | `index: true`: one x position reads every series | a field on x |

The three region and element capabilities are geometry, so the template is the only source.
The other five are confirmed against the encodings. `navigation` and `index` are also curated:
not every chart with a continuous axis should pan, and `index` names a reading model that only
some chart shapes have.

A polar chart declares both regions. A rectangle or a lasso resolves its arcs by pixel bounds,
and an interval brush on it is honoured as a sector.

## §5.2 What the type declares

Each template carries an `interactionSupport` block, `ChartInteractionSupport`:

```ts
interactionSupport: {
    elements: true,
    region: ['cartesian'],
    navigation: {},
    reorder: {},
    legend: true,
    discreteAxis: true,
},
```

An absent key means never. A present key means the type can have it, and the data decides the
rest. The block is the gate: if a template leaves a key out, the data cannot switch it on. The
appendix lists all 36 blocks.

## §5.3 What the data confirms

At assemble time the Vega-Lite assembler intersects the block with the resolved encodings and
writes the result into the compiled spec, beside the dictionary:

```ts
_interactionSemantics: {
    ...templateSemantics,
    chartType: 'Bar Chart',
    capabilities: ['elements', 'cartesian-region', 'navigation', 'reorder', 'discrete-axis'],
    navigationAxes: ['y'],
    reorderAxes: [{ axis: 'x', field: 'country' }],
    ...
}
```

The list above is a bar chart with no colour field: `legend` is declared but not confirmed, so
it is absent. `capabilities` is the single authority admission reads; no second reading of the
plan exists. The assembler writes `_interactionSemantics` for every Vega-Lite chart, so the
field is never absent on an assembled spec.

## §5.4 What a preset needs

One table in core, `INTERACTION_PRESET_REQUIREMENTS`, gives each preset the smallest set of
capabilities without which it does nothing:

| Presets | Require |
|---|---|
| `click-highlight`, `click-group-focus`, `hover-group-focus`, `click-annotate`, `context-activate`, `long-press`, `double-activate`, `inspect` | `elements` |
| `select`, `lasso-select`, `brush-x`, `brush-y`, `linked-brush` | `elements`, `cartesian-region` |
| `brush-angle` | `elements`, `angular-region` |
| `navigate`, `brush-zoom` | `navigation` |
| `legend-toggle` | `legend` |
| `axis-highlight` | `discrete-axis` |
| `drag-reorder` | `reorder` |
| `inspect-index` | `index` |

A definition reaches its row through the `preset` name its factory stamps on it. A definition
made by hand, with no preset, needs nothing; its author is responsible for it.

## §5.5 The match

`admitInteractions(plan, interactions)` runs at mount, in the compile step, with the plan the
assembler wrote:

1. For every interaction, every required capability must be in `plan.capabilities`. The first
   one missing decides the message: `Interaction "legend-toggle" requires a discrete legend;
   Bar Chart has none.`
2. A `navigate` that asks for an axis the chart does not navigate is refused by axis, because
   the capability alone cannot judge `axes: 'x'` against a chart that navigates y.
3. Three conflict rules between pairs, unchanged by the capability model: one navigation per
   chart; a pan cannot share the unmodified drag with a region preset; a double-click cannot
   both activate a mark and reset another interaction. The later entry yields.

The origin decides the consequence. A spec entry is dropped with a `ChartWarning`,
`unsupported_interaction` or `conflicting_interactions`, and the message ends with "The
interaction was dropped." A code definition throws with the same sentence. Warnings reach
`surface.warnings`, the console once, `validateChart()`, and the MCP `validate_chart`.

## §5.6 Why two layers and not one

Inference from the assembled chart alone was the model before this one, and it admitted every
preset on every chart type: every template has a dictionary, so "has element semantics" was
always true. The data cannot say no where the type must: a heatmap binds a colour legend that
is continuous; a rose binds a nominal x whose labels are sectors; a KPI card has a rect mark and
rows but no plot to drag on. And three readers need the answer before any data exists: an agent
calling `list_chart_types`, the generated reference, the coverage view.

# §6 Reset

Every preset that keeps state carries `reset`, a list of gestures that return it to neutral:

| Gesture | Meaning |
|---|---|
| `click-none` | a click whose hit resolves to no chart element: empty plot, margin, background |
| `double-click` | a double-click anywhere on the chart |
| `escape` | the Escape key while the chart has focus |

Each preset has a default list in the registry and a supported list; the resolver rejects an
unsupported gesture and any `reset` on a preset that keeps nothing. One dispatcher per chart
runs the gestures. A gesture resets only the interactions whose list holds it, each by its own
id: retained updates are cleared, a stateful brush clears through its controller, `navigate`
flies home through its own path, and a preset with closure state drops it through `onReset()`.

A chart with an `escape` reset becomes focusable and takes focus on a pointer press, so Escape
reaches the chart the reader touched last and no other. Host updates applied through the surface
are never reset by a gesture; the host clears them with `clearUpdate()`.

# §7 The pipeline

```
chart_spec + data ──► assembleVegaLite ──► spec + _interactionSemantics
                                             │   dictionary, chartType, capabilities,
                                             │   navigationAxes, reorderAxes, ...
interaction_spec ──► resolveInteractionSpec ─┤
options.interactions ──► compose ────────────┤
                                             ▼
                                   addVegaLiteInteractions
                                     admit ─► plan (admitted, warnings)
                                     instrument marks, scales, signals
                                             ▼
                                   mountVegaInteractions
                                     gestures, dispatcher, overlays, events
```

Which fact is decided where:

| Fact | Decided in |
|---|---|
| what the type offers | the template block |
| what this chart confirms | the assembler |
| what a preset needs | the core table |
| what is admitted, and the warnings | the compile step, through admission |
| how a hit becomes rows | the dictionary, at runtime |
| which gesture resets what | the dispatcher, from each definition's list |

# §8 Hosts and discovery

- **`buildInteractiveChart()`** reads `interaction_spec` from the input and merges it with code
  definitions. The MCP `create_chart_view`, the site editor, and the site gallery mount through
  it whenever the input carries interaction entries; a static render otherwise.
- **`validateChart()`** runs the resolver and admission against the assembled semantics and
  returns the same warnings the mount would, before anything renders. A malformed spec is an
  `invalid_interaction_spec` error. The MCP `validate_chart` returns the same list.
- **`supportedInteractionPresets(def.interactionSupport)`** lists the presets a chart type
  supports by declaration. `list_chart_types` returns it per chart type, and the Vega-Lite
  reference prints it. The data can still remove one at mount; the guide says so.
- **The coverage tab** in the Interactions lab assembles one representative case per chart type
  and shows every chart type against every preset: active for that data, supported by the type
  but not confirmed by that data, or never offered.

# §9 Extending the model

**A new preset.** Add its name to `INTERACTION_PRESET_TYPES` and its needs to
`INTERACTION_PRESET_REQUIREMENTS`, both in core. Add its options type to
`InteractionPresetOptions`, its registry entry with label, gesture family, supported and default
reset lists, and its factory wrapper, which stamps `preset` and attaches the reset list. The
mapped types make a missing entry a compile error. Regenerate the reference.

**A new capability.** Add its name to `INTERACTION_CAPABILITIES` and its phrase to
`INTERACTION_CAPABILITY_DESCRIPTIONS`. Add a key to `ChartInteractionSupport` and a line to
`declaredInteractionCapabilities`. If the data must confirm it, add the fact to the assembler's
`confirmed` map. Declare it on the templates that offer it.

**A new template.** Write its `interactionSupport` block: `elements` when it has a resolver, the
region kinds its geometry allows, `navigation` when a continuous axis should pan, `reorder`,
`legend`, and `discreteAxis` wherever the geometry permits, `index` only when one x position
reads across series. A test asserts every Vega-Lite template carries a block.

# Appendix: the declaration table

Generated from the templates by `npm run gen:reference`. Do not edit the table by hand.

<!-- interaction-support:start -->
| Chart type | elements | region | navigation | reorder | legend | discrete axis | index |
|---|---|---|---|---|---|---|---|
| Area Chart | ✓ | cartesian | x, y | ✓ | ✓ | ✓ | ✓ |
| Bar Chart | ✓ | cartesian | x, y | ✓ | ✓ | ✓ |  |
| Bar Table | ✓ | cartesian |  | ✓ | ✓ | ✓ |  |
| Boxplot | ✓ | cartesian | x, y | ✓ | ✓ | ✓ |  |
| Bullet Chart | ✓ | cartesian |  | ✓ | ✓ | ✓ |  |
| Bump Chart | ✓ | cartesian | x, y | ✓ | ✓ | ✓ | ✓ |
| Calendar Heatmap | ✓ | cartesian |  | ✓ | ✓ | ✓ |  |
| Candlestick Chart | ✓ | cartesian | x | ✓ |  | ✓ | ✓ |
| Choropleth | ✓ | cartesian | geo |  | ✓ |  |  |
| Connected Scatter Plot | ✓ | cartesian | x, y | ✓ | ✓ | ✓ |  |
| Density Plot | ✓ | cartesian | x | ✓ | ✓ | ✓ | ✓ |
| Donut Chart | ✓ | cartesian, angular |  |  | ✓ |  |  |
| ECDF Plot | ✓ | cartesian | x | ✓ | ✓ | ✓ | ✓ |
| Gantt Chart | ✓ | cartesian | x | ✓ | ✓ | ✓ |  |
| Grouped Bar Chart | ✓ | cartesian | x, y | ✓ | ✓ | ✓ |  |
| Heatmap | ✓ | cartesian | x, y | ✓ | ✓ | ✓ |  |
| Histogram | ✓ | cartesian | x, y | ✓ | ✓ | ✓ |  |
| KPI Card | ✓ |  |  |  |  |  |  |
| Line Chart | ✓ | cartesian | x, y | ✓ | ✓ | ✓ | ✓ |
| Lollipop Chart | ✓ | cartesian | x, y | ✓ | ✓ | ✓ |  |
| Map | ✓ | cartesian | geo |  | ✓ |  |  |
| Pie Chart | ✓ | cartesian, angular |  |  | ✓ |  |  |
| Pyramid Chart | ✓ | cartesian |  | ✓ | ✓ | ✓ |  |
| Radar Chart | ✓ | cartesian, angular |  |  | ✓ |  |  |
| Range Area Chart | ✓ | cartesian | x, y |  | ✓ | ✓ | ✓ |
| Ranged Dot Plot | ✓ | cartesian | x, y | connective marks | ✓ | ✓ |  |
| Regression | ✓ | cartesian | x, y | ✓ | ✓ | ✓ | ✓ |
| Rose Chart | ✓ | cartesian, angular |  |  | ✓ |  |  |
| Scatter Plot | ✓ | cartesian | x, y | ✓ | ✓ | ✓ | ✓ |
| Slope Chart | ✓ | cartesian | x, y | ✓ | ✓ | ✓ | ✓ |
| Sparkline | ✓ | cartesian | x | ✓ |  | ✓ | ✓ |
| Stacked Bar Chart | ✓ | cartesian | x, y | ✓ | ✓ | ✓ |  |
| Streamgraph | ✓ | cartesian | x, y | ✓ | ✓ | ✓ | ✓ |
| Strip Plot | ✓ | cartesian | x, y | ✓ | ✓ | ✓ |  |
| Violin Plot | ✓ | cartesian |  |  | ✓ | ✓ |  |
| Waterfall Chart | ✓ | cartesian | x, y | rect marks | ✓ | ✓ |  |
<!-- interaction-support:end -->

Judgment calls behind the rows:

- **`elements` on KPI Card.** The template ships a resolver and an annotation presenter, so
  `click-highlight` and `click-annotate` work on the tile.
- **`reorder` absent on Violin and Range Area.** Both refused reorder before the block existed;
  Range Area's category axis is a path, and a test guards it.
- **`region: cartesian` on Bar Table, Bullet, Sparkline, Calendar Heatmap, Map, Choropleth.**
  The region controller resolves marks by pixel bounds, so a rectangle over rows, cells, or
  bubbles selects them. Only KPI Card has no drag region.
- **`discreteAxis` absent on the polar charts and the projections.** Their labels are sectors
  or place names, not categories to click.
- **`index`** on the charts whose x is a shared index across series: the line family, the area
  family, bump, slope, density, ECDF, candlestick, sparkline, and the scatter family, where the
  lab's curated index-inspection cases rely on it.
