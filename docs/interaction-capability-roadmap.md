# Interaction capability roadmap

## Goal

Flint has four public layers:

1. **Canvas interactions** acquire gestures, report what the user did, and resolve the
   chart target.
2. **External interactions** bind transport-neutral application payloads to handlers.
3. **Updates** describe what should change on the chart.
4. **Presets** combine common canvas interactions and updates.

Presets should cover about 80% of chart interaction use cases. Developers should be
able to cover about 95% by combining Flint interactions and updates with their own
handler.

```text
canvas event -> gesture state -> canvas handler ---\
                                                   -> ChartUpdate -> update processor
external payload -> bound external handler -------/
```

React state, DOM listeners, WebSockets, and other charts are transports outside the
interaction contract. They invoke the same `surface.dispatch(interactionId, payload)`
boundary. External payloads do not masquerade as canvas events and do not acquire
gesture phases.

Flint focuses on interactions inside a chart. Opening application panels, navigating
pages, fetching data, and changing business data remain application responsibilities.

## Canvas interactions

Canvas interactions must be useful without a preset. Each emits a
`CanvasInteractionEvent` with its phase, geometry, modifiers, and semantic chart target.

| Interaction | Examples | Status |
| --- | --- | --- |
| Hover | Hover a mark, legend item, axis, facet, or annotation | Supported |
| Activate | Click or tap a chart target | Supported |
| Region select | Drag a rectangle over marks | Supported |
| Axis brush | Drag, move, or resize an X or Y interval | Supported |
| Angular brush | Drag across pie, donut, or rose sectors | Supported; stateful intervals can be moved and resized |
| Drag target | Drag a mark to another semantic target | Supported for category reorder |
| Viewport navigation | Pan, wheel zoom, and reset continuous axes | Supported where the chart declares navigable axes |
| Assisted target | Snap to a nearby small mark and optionally show a target indicator | Enabled by eligible preset defaults; `assistedTargeting` disables or hard-overrides the radius |
| Keyboard target | Move among semantic targets and activate with Enter or Space | Supported via `keyboardTargeting` |
| Lasso | Draw a freeform selection around marks | Supported |
| Context activate | Request a context action on a chart target | Supported via `contextActivate()`; menu rendering belongs to the application |

Pinch zoom and long press can be added later as touch inputs to existing interactions.
They do not need separate event or preset families.

## Update language

Updates are renderer-neutral chart display state. They can come from a canvas handler,
an external handler, an agent, direct application code, or a serialized static chart.
The original chart specification is not mutated.

The renderer receives only the effective `updates` collection. Interaction handlers own
preview, commit, and cancel behavior; preview bookkeeping is private interaction state,
not a renderer input or a second update language. A controller may compose a preview
over retained updates while a gesture is active, then retain it on commit or drop it on
cancel before asking the renderer to display the resulting collection.

| Operator | State described | Vega-Lite status |
| --- | --- | --- |
| `set-style` | Visibility, appearance, and semantic style state for targets | Visibility, opacity, fill, stroke, stroke width, and emphasized/focused state supported |
| `set-annotation` | Annotation specification for one target, or `null` | Supported; effective annotations compose by update and target identity |
| `set-viewport` | Exact X and/or Y domains | Supported on declared continuous navigation axes |
| `set-order` | Absolute category, series, or facet order | Category order supported; series and facet order missing |

The language intentionally has no `reset`, `clear-annotation`, `pan`, `zoom`, `toggle`,
or relative reorder operators. Those are interaction intents. A handler removes an
update, writes `null`, or computes the next absolute retained value.

### Missing update coverage

1. Extend `set-style` only when another renderer-neutral visual channel has a demonstrated use case.
2. Implement `set-order` for series and facets, coordinating marks, scales, legends,
   stacks, and facet layout.
3. Add target-fit viewport reduction as an interaction/application helper that emits
   exact `set-viewport` domains; it is not another update operator.

The assisted pointer and keyboard indicator is temporary interaction-surface state, not
a new update. Assisted targeting and keyboard movement may show compact semantic details
using the compiled pointer-tooltip fields. Keyboard movement also emits `focus-element`.
Moving the active target must not select, annotate, or otherwise mutate the chart.

Filtering data, changing encodings or chart type, opening UI, and fetching drill-down
data are not chart updates. A canvas interaction may notify the application to perform
those actions.

## Presets

A preset supplies a common policy. It chooses an update for an interaction while the
lower-level interaction and update remain independently available.

### Existing presets

| Preset | Combination |
| --- | --- |
| `clickHighlight()` | Activate a configured mark, legend, or discrete-axis target -> `set-style` |
| `clickGroupFocus()` | Activate target -> expand its cohort -> `set-style` |
| `clickAnnotate()` | Activate target -> `set-annotation` and `set-style` |
| `select()` | Rectangle selection -> temporary or retained `set-style` |
| `brushX()` / `brushY()` | Axis interval -> temporary or retained `set-style` |
| `brushAngle()` | Polar angular interval -> temporary or retained `set-style` |
| `navigate()` | Pan/zoom input -> absolute temporary or retained `set-viewport` |
| `dragReorder()` | Drag target -> temporary or retained `set-order` |
| `lassoSelect()` | Lasso -> temporary or retained `set-style` |
| `legendToggle()` | Activate legend item -> `set-style` visibility; scales and source data remain unchanged |
| `axisHighlight()` | Activate a categorical axis tick -> `set-style` for represented marks |

### Presets to add

| Preset | Combination | Priority |
| --- | --- | --- |

Assisted targeting and keyboard targeting do not require new presets. Eligible element
presets declare default assisted radii; the surface may disable or hard-override them.
Region and drag controls remain direct regardless of that override. The configured preset
still decides the effect: for example, the same assisted click can run `clickHighlight()` or
`clickAnnotate()`.

## Demonstration plan

Use the existing interaction playground to demonstrate the layers independently:

1. Add an **Assisted target** toggle to the existing click presets. Show the enlarged
   indicator and verify that clicking anywhere inside it activates the same target.
2. Add a **Keyboard** input mode. Show the active target and verify that Enter or Space
   invokes the currently selected click preset.
3. Add **Legend toggle** and **Legend isolate** after `set-visibility` exists.
4. Add **Lasso select** after polygon acquisition exists.

The inspector should show the emitted canvas action, semantic target, and applied
update. This makes it clear which behavior belongs to the interaction, the update, and
the preset.