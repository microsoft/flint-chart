# Programming API

Use the functional Flint API to mount reusable interaction presets, create bespoke interactions that map semantic events to update operators, or connect charts with external controls. Start with [Introduction](interaction-introduction.md) for the model, [Components](interaction-components.md) for event listeners and chart updates, or [Declarative spec](interaction-spec.md) for JSON presets.

The compiler resolves raw triggers into **semantic events** that identify chart elements and data, and renders **update operators** on the canvas. You choose the triggers and define the response in a `handle` function, without reverse-engineering rendering logic or manipulating renderer-specific data.

> Flint's interaction presets currently support Vega-Lite. Mount your chart with `buildInteractiveChart()` to enable them.

> For agents: the [interaction-author skill](https://github.com/microsoft/flint-chart/blob/main/agent-skills/flint-interaction-author/SKILL.md) covers this API as well as the presets: the `ChartUpdate` an application or an agent applies, reading the chart state, linking charts, and bespoke definitions. The MCP server serves it as `flint://interaction-skill`.

## Mount an interactive chart

Import the API from `flint-chart/interactive` and pass a backend and interaction definitions to `buildInteractiveChart(container, input, { backend, interactions })`. `container` is the chart's DOM element and `input` is your existing `ChartAssemblyInput`.

You can use preset factories in code:

```ts
import { buildInteractiveChart, clickHighlight } from 'flint-chart/interactive';

const surface = buildInteractiveChart(container, input, {
  backend: 'vegalite',
  interactions: [clickHighlight({ dimOpacity: 0.2 })],
});
await surface.ready;
```

A factory and its declarative preset describe the same behavior. Spec entries mount before code definitions. Every interaction must have a unique `id`, including when both approaches are used on one chart. A code definition the chart cannot honour throws; an unsupported spec entry is dropped with a warning.

## Use and combine presets

Preset factories return interaction definitions for the `interactions` build option. Configure their behavior through factory options; you do not need a custom `handle` function.

For a country chart with a continuous quantity on its Y axis, combine click highlighting with wheel or pinch zoom:

```ts
import {
  buildInteractiveChart,
  clickHighlight,
  navigate,
} from 'flint-chart/interactive';

const surface = buildInteractiveChart(container, input, {
  backend: 'vegalite',
  interactions: [
    clickHighlight({ dimOpacity: 0.2 }),
    navigate({ axes: 'y', pan: false }),
  ],
});
await surface.ready;
```

Choose presets supported by the chart's semantics. The [Declarative spec preset catalog](interaction-spec.md#the-presets) describes each preset and its requirements; the functional factories accept the corresponding options. Your app can observe these presets through [semantic event listeners](interaction-components.md#listen-to-events-in-your-application), just as it can observe bespoke interactions.

## Define a bespoke canvas interaction

This example uses a country chart whose data includes a `Country` field. Clicking a mark highlights its data and labels it with the country name.

```ts
import {
  buildInteractiveChart,
  type CanvasInteractionDef,
} from 'flint-chart/interactive';

const countryDetails: CanvasInteractionDef = {
  id: 'country-details',
  eventSource: { type: 'element', gesture: 'click' },
  affordances: { mark: { cursor: 'activate', hover: 'target' } },
  reset: ['click-none', 'escape'],
  handle(event) {
    if (event.action !== 'click-element'
        || event.phase === 'start' || event.phase === 'cancel') return null;
    const target = event.target;
    const country = target?.elements[0]?.value.Country;
    if (!target || typeof country !== 'string') return null;
    return {
      id: 'country-details',
      ops: [
        {
          op: 'set-style',
          targets: [target],
          value: { state: 'emphasized', mutedOpacity: 0.25 },
        },
        { op: 'set-annotation', target, value: { text: country } },
      ],
    };
  },
};

const surface = buildInteractiveChart(container, input, {
  backend: 'vegalite',
  interactions: [countryDetails],
});
await surface.ready;
```

- `eventSource` declares the raw trigger to listen to.
- `affordances` declares which chart elements accept that trigger and their cursor/hover feedback.
- `handle(event, context)` receives the resolved semantic event and returns `{ id, ops }`, or `null` when no update is needed.
- `reset` declares gestures that clear this interaction's retained updates.

Other event sources include hover, region selection, inspection, and navigation. See [Interaction Design](design-interactions.md#22-event-sources) for the event-source model.

## Respond to external controls

An `externalInteraction` has no canvas trigger. The application sends a payload through `surface.dispatch(id, payload)`; the handler maps it to update operators. In this example, selecting a table row highlights and annotates the corresponding country.

```ts
import {
  buildInteractiveChart,
  externalInteraction,
} from 'flint-chart/interactive';

const countrySelection = externalInteraction<{ Country: string }>({
  id: 'country-table',
  handle: ({ Country }) => {
    const target = { select: { key: { Country } } };
    return {
      id: 'country-table',
      ops: [
        {
          op: 'set-style',
          targets: [target],
          value: { state: 'emphasized', mutedOpacity: 0.25 },
        },
        { op: 'set-annotation', target, value: { text: Country } },
      ],
    };
  },
});

const surface = buildInteractiveChart(container, input, {
  backend: 'vegalite',
  interactions: [countrySelection],
});
await surface.ready;
await surface.dispatch('country-table', { Country: 'Japan' });
```

Call `dispatch` from the table's row-selection handler. Targets use semantic data keys, not SVG paths or renderer-specific mark indices. The named field must be present in the chart's semantic data.

## Update operators and host responses

`set-style` controls emphasis or visibility, `set-annotation` adds or clears a label, and `set-viewport` changes the visible domains. Other operators reorder categories, add overlays, or replace data. A single handler can return multiple operators in one update.

The container emits `flint-interaction` events with the interaction id and semantic target. Your application can listen to those events to filter a table or update other widgets; Flint renders only the canvas updates. Applications can also submit operators directly through `surface.applyUpdate()` or `surface.setUpdates()`. See [Components](interaction-components.md) for the event envelope, action families, listener examples, and chart update API.

## Read the chart

The chart owns its state, and a host reads it instead of replaying gestures. `surface.getState()` returns what the chart shows now: the emphasized marks (`selected`, with `entries` per update id), the legend values a toggle hides, the viewport on a chart that navigates, and the category order. Each mark's `value` is the mark in field terms; the host owns the rows and queries them from the value and the gesture's geometry.

`surface.onChange(callback)` fires after every render with a `ChartChange`: the `phase` (`preview` while a gesture runs, `commit` for a committed change or a host call, `cancel` when a gesture ends with nothing), the `interactionId` and `action` behind it, the gesture's own `target` and `geometry`, and the `state` after. The `flint-interaction` event is the raw gesture record, fired before the chart reacts; `onChange` is what the chart shows, fired after. See [Interaction Design](design-interactions.md#24-the-surface) for the state model.

```ts
const stop = surface.onChange(({ phase, state }) => {
  if (phase !== 'commit') return;
  table.filter(state.selected.map((element) => element.value));
});
```

## Lifecycle and cleanup

Await `surface.ready` before dispatching application events. Use `surface.clearUpdate(id)` to remove an interaction's retained updates and `surface.destroy()` when unmounting the chart. Host-dispatched updates are not cleared by canvas reset gestures; the application owns their reset behavior.