# Interaction components

Flint separates semantic events from chart updates. Events describe what the reader interacted with; update operators describe what the chart should render. Your application can consume events and submit updates without accessing renderer-specific marks.

Use these APIs with a chart mounted by `buildInteractiveChart` from `flint-chart/interactive`. Presets can come from `interaction_spec` or functional factories; see [Declarative spec](interaction-spec.md) and [Programming API](interaction-api.md).

## Listen to events in your application

Listen for the `flint-interaction` DOM event on the chart container. Each event's `detail` is a `FlintInteractionEventDetail` containing the interaction id and resolved semantic event.

This example mounts a country chart and updates an application selection when a reader clicks a mark. `input` is your `ChartAssemblyInput`, with a `Country` field in its data.

```ts
import {
  buildInteractiveChart,
  clickHighlight,
  type FlintInteractionEventDetail,
} from 'flint-chart/interactive';

const surface = buildInteractiveChart(container, input, {
  backend: 'vegalite',
  interactions: [clickHighlight()],
});

let selectedCountry: string | null = null;

function onInteraction(raw: Event) {
  const { event } =
    (raw as CustomEvent<FlintInteractionEventDetail>).detail;

  if (event.action !== 'click-element' || event.phase !== 'commit') return;

  const country = event.target?.elements[0]?.value.Country;
  selectedCountry = typeof country === 'string' ? country : null;
  console.log('Application selection:', selectedCountry);
}

container.addEventListener('flint-interaction', onInteraction);
await surface.ready;

function disposeChart() {
  container.removeEventListener('flint-interaction', onInteraction);
  surface.destroy();
}
```

Replace the selection assignment with your application's state setter or table-filter callback. Call `disposeChart()` when the component unmounts. A listener observes the interaction; it does not need to return chart update operators. A bespoke `handle` function serves a different purpose: it defines the chart's response.

## Event envelope

| Field | Meaning |
|---|---|
| `detail.chartId` | Identifies the chart surface. |
| `detail.interactionId` | Identifies the preset or bespoke interaction that emitted the event. |
| `detail.timestamp` | Event timestamp. |
| `detail.transactionId` | Optional transaction identifier. |
| `detail.event` | The semantic `CanvasInteractionEvent`. |

Use the interaction id when the chart mounts multiple interactions, especially multiple instances of the same preset with different ids.

## Semantic event fields

| Field | Meaning |
|---|---|
| `event.action` | What happened, such as `click-element`, `select-region`, or `zoom-viewport`. |
| `event.phase` | `start`, `preview`, `commit`, or `cancel`. The phases emitted depend on the interaction. |
| `event.target` | Resolved semantic target, or `null` when there is no target. |
| `event.target.elements` | Resolved elements with semantic `value` fields and, where available, source `records`. |
| `event.geometry.plot` | Optional geometry in plot coordinates. |
| `event.geometry.domain` | Optional values or intervals in data-domain coordinates. |
| `event.geometry.projection` | Optional coordinate projection metadata. |
| `event.operation` | Optional operation, such as `create`, `move`, `clear`, `pan`, `zoom`, or `reset`. |
| `event.dropTarget` | Optional resolved drop target for drag interactions. |
| `event.modifiers` | Optional Shift, Ctrl, and Meta key state. |
| `event.description` | Structured description supplied by accessible navigation. |

Do not assume every event has a target or represents one data row. Aggregated marks can represent multiple records; navigation events can report geometry without a selected element. Handle a null target and empty element lists explicitly.

Use `preview` for transient feedback and `commit` for retained app state when the chosen interaction emits those phases. Avoid expensive app updates on every hover or drag preview; throttle them or wait for a commit as appropriate.

## Common event actions

| Family | Actions |
|---|---|
| Mark, legend, axis, facet, or annotation activation | `click-element`, `click-legend`, `click-axis`, `click-facet`, `click-annotation` |
| Hover | `hover-element`, `hover-legend`, `hover-axis`, `hover-facet`, `hover-annotation` |
| Context, long press, and double activation | `context-element`, `long-press-element`, `double-activate-element`, and corresponding legend, axis, facet, or annotation actions |
| Region selection | `select-region`, `select-lasso`, `brush-x`, `brush-y`, `brush-angle` |
| Inspection | `inspect-x`, `inspect-y`, `inspect-xy` |
| Navigation | `pan-viewport`, `zoom-viewport`, `reset-viewport` |
| Dragging | `drag` |
| Accessible navigation | `focus-element`, `activate-element` |

The available actions depend on the mounted interaction and the chart's capabilities. The exported `CanvasInteractionAction` type defines the complete action union.

## Send updates from your application

Use `surface.applyUpdate()` to apply a named chart update. Its operators target semantic elements or data keys, not rendered DOM nodes. Await `surface.ready` before sending updates.

For the country chart above, a table-row handler can call:

```ts
async function highlightCountry(country: string) {
  await surface.ready;
  await surface.applyUpdate({
    id: 'app-country-selection',
    ops: [
      {
        op: 'set-style',
        targets: [{ select: { key: { Country: country } } }],
        value: { state: 'emphasized', mutedOpacity: 0.25 },
      },
    ],
  });
}

async function clearCountrySelection() {
  await surface.ready;
  await surface.clearUpdate('app-country-selection');
}
```

The selector field must exist in the chart's semantic data. Host-owned updates are not cleared by a preset's canvas reset gestures; clear them explicitly when application state changes. Use a distinct id for each host-owned update.

## Chart update operators

| Operator | Effect |
|---|---|
| `set-style` | Emphasize, mute, or hide marks the chart draws, a run of line segments included. |
| `set-annotation` | Add or clear a note on one mark. |
| `set-viewport` | Change visible continuous domains or a geographic viewport. |
| `set-order` | Reorder categories. |
| `set-overlay` | Draw new rows through the chart's scales: `line`, `point`, `text` rows carry `x` and `y`; `rule` and `rect` rows carry `x`, `y`, `x2`, `y2`. |
| `set-freeform-overlay` | Draw SVG or a clone of marks over the plot. |
| `set-data` | Replace the rows the chart draws. |

A `ChartUpdate` has an `id` and an `ops` array. A single update can combine several operators.

Key values, overlay rows, and viewport bounds hold what the parsed row holds: a number for a numeric field, UTC epoch milliseconds for a temporal field, the category for a discrete one. A target that matches nothing and an overlay whose rows do not project are reported in the `ChartUpdateResult`, never rebound to a near match.

## Surface lifecycle

| API | Purpose |
|---|---|
| `ready` | Resolves when the interactive chart is mounted. |
| `warnings` | Reports unsupported declarative entries dropped during mounting. |
| `applyUpdate(update)` | Apply one host-owned update. |
| `setUpdates(updates)` | Replace the collection of host-owned updates. |
| `clearUpdate(id)` | Remove one retained update by id. |
| `onSelection(callback)` | Observe committed selection summaries; returns an unsubscribe function. |
| `dispatch(id, payload)` | Send a payload to a named external interaction. |
| `refresh()` | Refresh the mounted surface. |
| `destroy()` | Release the chart and its interaction resources. |

Remove your app's DOM listeners as part of cleanup; destroying the chart does not replace that responsibility. For a named external interaction that maps app payloads to updates, see [Programming API](interaction-api.md#respond-to-external-controls).