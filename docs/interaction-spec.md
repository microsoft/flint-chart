# Using interactions

`interaction_spec` sits beside `chart_spec` and `theme_spec` in a `ChartAssemblyInput`. The chart spec says **what the chart means**. The theme spec says **how it looks**. The interaction spec says **how it behaves** when a reader clicks, hovers, drags, or presses a key.

Every behaviour comes from a **preset**: a named interaction Flint ships, such as `click-highlight` or `navigate`. You list the presets you want, each with its own options. Flint mounts the ones the chart can honour and tells you about the ones it cannot.

> `interaction_spec` affects the Vega-Lite interactive surface only. The assemblers and the static backends leave it untouched, and `validateChart` reports it as ignored for those backends.

## Shape

```json
{
  "chart_spec": { "chartType": "Bar Chart", "encodings": { "x": "country", "y": "gdp", "color": "region" } },
  "interaction_spec": {
    "interactions": [
      { "type": "click-highlight" },
      { "type": "legend-toggle" },
      { "type": "navigate", "options": { "axes": "y", "pan": false, "reset": ["double-click", "escape"] } }
    ]
  }
}
```

| Key | Meaning |
|---|---|
| `interactions` | One entry per interaction, in the order they are mounted. |
| `interactions[].type` | The preset that makes the interaction. It is also the interaction's default `id`. |
| `interactions[].id` | Optional. Names the interaction when a chart uses the same preset twice, and names it in the `flint-interaction` event. |
| `interactions[].options` | The preset's own options, always nested under `options`. Never put an option beside `type`. |
| `assistedTargeting` | Optional. Pointer acquisition that snaps to a nearby mark. `false` requires direct hits; an object sets `maxDistance`, `indicator`, `details`. |
| `keyboardTargeting` | Optional. Lets a reader move between marks with the keyboard. |

An entry has no string shorthand: `"click-highlight"` alone is rejected, `{ "type": "click-highlight" }` is the smallest form.

## The presets

| Type | What the reader does | Needs from the chart | Default reset |
|---|---|---|---|
| `click-highlight` | Clicks a mark, legend item, or axis label to emphasise it and mute the rest. | elements | click-none, escape |
| `click-group-focus` | Clicks a mark to emphasise every mark in its group (`groupBy`). | elements | click-none, escape |
| `hover-group-focus` | Hovers a mark to preview its group (`groupBy` required). | elements | none |
| `click-annotate` | Clicks a mark to pin an annotation with its value. | elements | click-none, escape |
| `context-activate` | Right-clicks or long-presses to hand the host a context target. | elements | none |
| `long-press` | Holds a mark to activate it. | elements | click-none, escape |
| `double-activate` | Double-clicks a mark to activate it. | elements | click-none, escape |
| `inspect` | Moves over the plot to read the nearest mark's values. | elements | none |
| `inspect-index` | Moves over the plot to read every series at one x position (`seriesBy` for a single series). | index axis | escape |
| `select` | Drags a rectangle to emphasise the marks inside. | elements, cartesian region | click-none, escape |
| `lasso-select` | Draws a freehand region to emphasise the marks inside. | elements, cartesian region | click-none, escape |
| `brush-x`, `brush-y` | Drags an interval along one axis; on a polar chart the x brush is an angular sector. | elements, cartesian region | click-none, escape |
| `brush-angle` | Drags an angular sector on a pie, donut, rose, or radar chart. | elements, angular region | click-none, escape |
| `linked-brush` | Brushes marks to highlight the same groups elsewhere (`groupBy` required). | elements, cartesian region | click-none, escape |
| `brush-zoom` | Drags a rectangle to zoom into it. | navigation | double-click, escape |
| `navigate` | Drags to pan and scrolls or pinches to zoom continuous axes (`axes`, `pan`, `domainGuard`). | navigation | double-click |
| `legend-toggle` | Clicks a legend item to hide or restore its series. | discrete legend | none |
| `axis-highlight` | Clicks a discrete axis label to emphasise its category. | discrete axis | click-none, escape |
| `drag-reorder` | Drags a discrete axis label to change the category order. | reorderable axis | none |

The option names are the ones the matching factory in `flint-chart/interactive` accepts. `InteractionPresetSpec` in that entry gives the precise shape per type for TypeScript callers.

## Reset gestures

Every preset that keeps state accepts `reset`, a list of the gestures that return it to neutral:

| Gesture | Meaning |
|---|---|
| `click-none` | A click whose hit resolves to no chart element: empty plot, margin, background. |
| `double-click` | A double-click anywhere on the chart. |
| `escape` | The Escape key, while the chart has focus. A chart with an `escape` reset takes focus when the reader presses on it, so Escape reaches the last chart touched and no other. |

A gesture resets only the interactions whose list holds it, each by its own id. Host updates applied through the surface are never reset by a gesture. A preset that keeps nothing (`hover-group-focus`, `inspect`, `context-activate`) has no `reset`, and the resolver rejects one.

## What a chart type supports

Each chart type declares the properties it offers: marks that resolve to data, a drag region, navigable axes, a reorderable axis, a discrete legend, discrete axis labels, an index axis. Each preset declares the properties it needs. A preset is supported when the chart type offers everything it needs.

Three places show the answer:

- The [Vega-Lite chart reference](/documentation/reference-vegalite) prints an **Interactions** line per chart type.
- The MCP tool `list_chart_types` returns `interactions` per chart type.
- The Interactions lab's **Coverage** tab shows every chart type against every preset.

The data can still remove a preset at mount. A bar chart supports `legend-toggle`, but a bar chart with no colour field has no legend to toggle. `navigate` needs a continuous, unfaceted axis. `drag-reorder` needs a discrete axis in the bound encodings.

## Warnings

An entry the chart cannot honour is **dropped with a warning**, and the chart still renders. The message names the interaction, what it needed, and the chart type:

```
Interaction "legend-toggle" requires a discrete legend; Bar Chart has none. The interaction was dropped.
```

Two entries can also conflict: a second `navigate`, a pan gesture next to a drag gesture, or `double-activate` next to a `double-click` reset. The later entry yields.

Where to read the warnings:

- `validateChart(input, 'vegalite')` returns them before anything renders, with a malformed spec reported as an `invalid_interaction_spec` error.
- `buildInteractiveChart(container, input)` exposes them on `surface.warnings` and logs them once to the console.
- The MCP tool `validate_chart` returns the same list.

A malformed entry is an error, not a drop: an unknown `type`, an option outside `options`, an `id` inside `options`, a missing required option such as `groupBy`, an unknown or unsupported `reset` gesture, or a duplicate `id`.

## Code and spec, one definition

A spec entry and a factory call are two spellings of one interaction:

```ts
import { buildInteractiveChart, clickHighlight } from 'flint-chart/interactive';

// From the spec
buildInteractiveChart(container, { ...input, interaction_spec: { interactions: [{ type: 'click-highlight', options: { dimOpacity: 0.2 } }] } });

// From code
buildInteractiveChart(container, input, { interactions: [clickHighlight({ dimOpacity: 0.2 })] });
```

Both may appear on one chart; the spec entries mount first. An `id` used by both is an error. A code definition the chart cannot honour throws, because a developer sees the exception; a spec entry is dropped, because an agent reads warnings.

## Where it runs

`buildInteractiveChart()` reads `interaction_spec` from the input. The MCP tool `create_chart_view` mounts the same surface, so an agent can ask for behaviour in the same JSON that asks for the chart. The site's editor and gallery mount from the spec too.
