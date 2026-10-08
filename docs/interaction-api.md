# Programming API

Use the functional Flint API to mount reusable interaction presets, create bespoke interactions that map semantic events to update operators, or connect charts with external controls. Start with [Introduction](interaction-introduction.md) for the model, [Components](interaction-components.md) for event listeners and chart updates, or [Declarative spec](interaction-spec.md) for JSON presets.

The compiler resolves raw triggers into **semantic events** that identify chart elements and data, and renders **update operators** on the canvas. You choose the triggers and define the response in a `handle` function, without reverse-engineering rendering logic or manipulating renderer-specific data.

> Flint's interaction presets currently support Vega-Lite. Mount your chart with `mountChart()`, or render `<FlintChart>` from `flint-chart/react`, to enable them. On another backend the chart renders static with an `interactions_ignored` warning.

> For agents: the [interaction-author skill](https://github.com/microsoft/flint-chart/blob/main/agent-skills/flint-interaction-author/SKILL.md) covers this API as well as the presets: the `ChartUpdate` an application or an agent applies, reading the chart state, linking charts, and bespoke definitions. The MCP server serves it as `flint://interaction-skill`.

## Mount an interactive chart

Import the API from `flint-chart/interactive` and pass a backend and interaction definitions to `mountChart(container, input, { backend, interactions })`. `container` is the chart's DOM element and `input` is your existing `ChartAssemblyInput`. `buildInteractiveChart` is the earlier name of the same function and remains as an alias.

You can use preset factories in code:

```ts
import { mountChart, clickHighlight } from 'flint-chart/interactive';

const surface = mountChart(container, input, {
  backend: 'vegalite',
  interactions: [clickHighlight({ dimOpacity: 0.2 })],
});
await surface.ready;
```

A factory and its declarative preset describe the same behavior. Spec entries mount before code definitions. A code definition with the same `id` as a spec entry replaces that entry, with an `interaction_overridden` info warning. A code definition the chart cannot honour throws; an unsupported spec entry is dropped with a warning. Tooltips are part of the spec, not an interaction: set `options.addTooltips: true` to show them (default `false`).

## Render the chart in React

`flint-chart/react` exports `<FlintChart>`, which mounts the chart through `mountChart` and remounts it when the spec content changes. Rows are compared by reference, so pass the same array to keep the chart mounted. React is an optional peer dependency, needed only for this subpath.

```tsx
import { FlintChart } from 'flint-chart/react';
import { clickHighlight } from 'flint-chart/interactive';

<FlintChart
  spec={input}
  interactions={[clickHighlight({ dimOpacity: 0.2 })]}
  width="100%"
  onChange={(change) => setSelection(change.state.selected)}
/>;
```

A spec with no interactions renders a static chart; a chart is interactive only if its spec or the `interactions` prop declares an interaction. A static chart mounts no interaction runtime, so it costs about the same as a plain Vega-Lite embed. To drive a chart without interactions from the host, pass `updates`; even `updates={[]}` mounts the runtime so the ref's `applyUpdate` works. On a static chart `applyUpdate` warns and returns `null`. `interactions` takes preset factories, never JSON entries: an array adds to the spec's `interaction_spec`, and a function `(fromSpec) => definitions` receives the spec's definitions and returns the full list.

| Prop | Purpose |
|------|---------|
| `spec` | The `ChartAssemblyInput`, `interaction_spec` included |
| `interactions` | An array added to the spec's interactions, or a function that returns the full list |
| `updates` | Host updates, diffed by id: new or changed ids apply, dropped ids clear unless the reader changed them since |
| `width`, `height`, `fit` | The box the chart fits into. `fit` is `shrink` (default, scale down only), `contain`, or `none`. The box scales the chart; the layout size stays in `chart_spec.baseSize` |
| `onChange`, `onInteraction` | What the chart shows after a state change, and the raw gesture record |
| `onRender`, `onWarnings`, `onError` | Mount and update lifecycle |
| `fallback` | Shown until the chart mounts, including in server rendering |

A ref gives a `FlintChartHandle` with `applyUpdate`, `clearUpdate`, `dispatch`, `getState`, and `refresh`. The `selectionUpdate(id, selection)` and `viewportUpdate(id, viewport)` helpers build the updates a selection or navigation preset writes: `selection` takes elements or a field key, and `viewport` takes `[start, end]` per axis or a `ChartState.viewport`. `null` clears the selection or returns the viewport home.

For a static image without a DOM, `renderSvg(input, { backend })` from `flint-chart/render` returns an SVG string for `vegalite` or `echarts`.

## Use and combine presets

Preset factories return interaction definitions for the `interactions` build option. Configure their behavior through factory options; you do not need a custom `handle` function.

For a country chart with a continuous quantity on its Y axis, combine click highlighting with wheel or pinch zoom:

```ts
import {
  mountChart,
  clickHighlight,
  navigate,
} from 'flint-chart/interactive';

const surface = mountChart(container, input, {
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
  mountChart,
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

const surface = mountChart(container, input, {
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
  mountChart,
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

const surface = mountChart(container, input, {
  backend: 'vegalite',
  interactions: [countrySelection],
});
await surface.ready;
await surface.dispatch('country-table', { Country: 'Japan' });
```

Call `dispatch` from the table's row-selection handler. Targets use semantic data keys, not SVG paths or renderer-specific mark indices. The named field must be present in the chart's semantic data.

## Filter the data with controls

`filterControls` draws one row per field under the chart, each working in a single click or drag: for a categorical field with up to eight values, pills to pick several or a segmented bar to pick one (`select`); a searchable dropdown for more; a slider with the value beside it for a one-at-a-time field with many ordered values such as years (All is its first stop when the field allows it); a two-thumb range for temporal or numeric fields, and a switch for booleans. The default `mode: 'filter'` removes the rows that fail; `mode: 'highlight'` keeps them and mutes their marks. `placement: 'auto'` (or `bottom`) puts the rows under the chart and `top` above it. Beside a chart under 280px wide, each label sits above its control. For another layout, such as a sidebar, set `render: false` and draw your own controls. A categorical field gets checkboxes when its values pick out separate marks. In `filter` mode, a field the chart needs to tell its rows apart (each value is another version of the same marks, such as a year or a population group) gets buttons, a slider, or a list without All: it always holds one value, its `initial` value or else the first, and clearing the filters returns there. Set `all: true` or `all: false` on the field to choose. With Vega-Lite, each filter lays the chart out again for the rows left, as Flint would for that data: fewer categories get thicker bars (up to the usual cap) and a shorter chart. On a chart whose categories scroll, the filter narrows the rows first and the rail scrolls the categories that are left; the rail hides once they all fit.

```ts
import { mountChart, filterControls } from 'flint-chart/interactive';

const surface = mountChart(container, input, {
  backend: 'vegalite',
  interactions: [
    filterControls({
      id: 'filters',
      fields: ['Region', { field: 'Year', widget: 'range' }],
      initial: { Region: { in: ['Europe', 'Asia'] } },
    }),
  ],
});
await surface.ready;
surface.getState().filters; // { Region: { in: ['Europe', 'Asia'] } }
await surface.dispatch('filters', { field: 'Year', value: { range: [2017, 2021] } });
await surface.dispatch('filters', { reset: true });
```

With `render: false` the preset draws nothing; your application draws its own controls and calls `dispatch` with `{ field, value }`, `{ filters }`, or `{ reset: true }`. The preset is skipped, with a warning, on a chart that has viewports from `navigate` or `brush-zoom`.

## Update operators and host responses

`set-style` controls emphasis or visibility, `set-annotation` adds or clears a label, and `set-viewport` changes the visible domains. Other operators reorder categories, add overlays, or replace data. A single handler can return multiple operators in one update.

The container emits `flint-interaction` events with the interaction id and semantic target. Your application can listen to those events to filter a table or update other widgets; Flint renders only the canvas updates. Applications can also submit operators directly through `surface.applyUpdate()` or `surface.setUpdates()`. See [Components](interaction-components.md) for the event envelope, action families, listener examples, and chart update API.

## Read the chart

The chart owns its state, and a host reads it instead of replaying gestures. `surface.getState()` returns what the chart shows now: the emphasized marks (`selected`, with `entries` per update id), the legend values a toggle hides, the viewport on a chart that navigates, and the category order. Each mark's `value` is the mark in field terms; the host owns the rows and queries them from the value and the gesture's geometry.

`surface.onChange(callback)` fires when the chart's state changes, with a `ChartChange`: the `phase` (`preview` while a gesture runs, `commit` for a committed change or a host call, `cancel` when a gesture ends with nothing), the `source` (`reader` for a gesture, `host` for `applyUpdate`, `clearUpdate`, or `setUpdates`), the `interactionId` and `action` behind it, the gesture's own `target` and `geometry`, the `state` after, the `previous` state, and the facets that `changed` (`selected`, `hidden`, `viewport`, `windows`, `categoryOrder`, `annotations`). A render that changes no facet does not fire it. A gesture that changes nothing, such as an inspected index, reaches the host only through the `flint-interaction` event (`surface.onInteraction`), the raw gesture record fired before the chart reacts. See [Interaction Design](design-interactions.md#24-the-surface) for the state model.

```ts
const stop = surface.onChange(({ phase, state }) => {
  if (phase !== 'commit') return;
  table.filter(state.selected.map((element) => element.value));
});
```

## Lifecycle and cleanup

Await `surface.ready` before dispatching application events. Use `surface.clearUpdate(id)` to remove an interaction's retained updates and `surface.destroy()` when unmounting the chart. Host-dispatched updates are not cleared by canvas reset gestures; the application owns their reset behavior.