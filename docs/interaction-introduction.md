# Introduction to interactions

Flint interactions turn a chart into a surface that readers can click, hover, brush, inspect, or navigate. Reusable presets provide common behaviors across compatible chart types. Your application can also listen to chart events, send chart updates, or define bespoke interactions.

Interactions currently run on the Vega-Lite interactive surface. Static chart assemblers do not execute interaction presets or emit interaction events.

## Choose an entry point

| Goal | Guide |
|---|---|
| Understand events and the chart update API | [Components](interaction-components.md) |
| Add presets through JSON | [Declarative spec](interaction-spec.md) |
| Use preset factories or create bespoke interactions | [Programming API](interaction-api.md) |

## How an interaction works

1. A reader performs a gesture, such as clicking a mark or dragging a rectangle.
2. Flint resolves the gesture into a semantic event describing the chart element, data, or domain involved.
3. A preset or bespoke handler maps that event to chart update operators.
4. Flint renders those updates and emits a `flint-interaction` event that your application can consume.

The event refers to semantic data rather than SVG paths or renderer-specific mark indices. For example, a click can identify a country; a brush can identify matching records; a zoom can report visible domains.

## Use presets

Presets cover highlighting, selection, brushing, inspection and annotation, view changes, and accessible navigation. Their options control behavior such as grouping, retained selections, and reset gestures. A preset must be compatible with the chart's semantics: continuous-axis navigation needs continuous axes, and legend toggling needs a discrete legend.

You can configure the same behavior in either form:

```json
{
  "interaction_spec": {
    "interactions": [{ "type": "click-highlight" }]
  }
}
```

```ts
import { mountChart, clickHighlight } from 'flint-chart/interactive';

const surface = mountChart(container, input, {
  backend: 'vegalite',
  interactions: [clickHighlight()],
});
await surface.ready;
```

The JSON fragment belongs beside `chart_spec` in your chart input. The functional version mounts the preset through build options instead. See [Declarative spec](interaction-spec.md) for the preset catalog and compatibility rules.

## Connect your application

Chart-to-app communication uses `flint-interaction` events. Your app can use them to filter a table, update another chart, or change application state. App-to-chart communication uses the chart update API or a named external interaction. Both approaches work with semantic data keys.

For example, clicking Japan can select its row in a table, while selecting Japan in that table can highlight it in the chart. See [Components](interaction-components.md) for event listeners, update operators, and cleanup.

When presets do not cover your behavior, define a trigger and a `handle` function that returns chart updates. See [Programming API](interaction-api.md) for bespoke canvas and external interactions. [Interaction Design](design-interactions.md) explains the compiler and runtime architecture in more depth.