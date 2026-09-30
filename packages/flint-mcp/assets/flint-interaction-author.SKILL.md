---
name: flint-interaction-author
description: "Use when: the user's request calls for behaviour on a Flint chart (e.g., zoom, highlight, brush, legend toggle, reorder, annotate, explore, compare, find outliers, link charts, hand a click to the app), at authoring time or after the chart exists. Produce one valid interaction_spec from presets, for the chart type and data at hand, without inventing presets or options."
---

# Flint interaction authoring

Add behaviour to a Flint chart. Read the chart spec and the request, choose the
presets that serve both, and return one valid `interaction_spec`.

The user asks for the chart. The reader uses it: clicks, hovers, drags. A
request says what the reader should be able to do.

## Authoritative references

Read these before authoring. When prose and source disagree, the TypeScript
contract is authoritative.

- Interaction guide: https://github.com/microsoft/flint-chart/blob/main/docs/interaction-spec.md
- Spec shape per preset: https://github.com/microsoft/flint-chart/blob/main/packages/flint-js/src/interactive/spec/types.ts
- Option types per preset: https://github.com/microsoft/flint-chart/blob/main/packages/flint-js/src/interactive/interactions.ts
- Preset implementations: https://github.com/microsoft/flint-chart/tree/main/packages/flint-js/src/interactive/presets

Do not invent a preset or an option. When the user asks for a behaviour no
preset gives, say which preset comes closest and what it leaves out.

## Output contract

Unless the user asks for commentary, return exactly one valid JSON object:

- Return the bare `interaction_spec`, `{ "interactions": [ ... ] }`, not
  `{ "interaction_spec": ... }` and not a complete `ChartAssemblyInput`.
- Every entry is `{ "type": <preset>, "id"?: <string>, "options"?: { ... } }`.
  Options nest under `options`; an option beside `type` is rejected. `id` sits
  on the entry, never inside `options`, and is needed only when one preset
  appears twice.
- Every entry answers the request. A broad request gets at most three.
- A request for a tooltip or values on hover needs no entry. Every compiled
  chart shows a tooltip on hover already.
- Omit `reset` to accept the preset's default. Set it only when the default
  collides with another entry (see "Ownership").
- Do not wrap JSON in a Markdown fence. No comments, placeholders, or
  trailing commas.

```json
{
  "interactions": [
    { "type": "click-highlight",
      "options": { "targets": ["mark"] }
    },
    { "type": "navigate", "options": { "axes": "x" } },
    { "type": "legend-toggle" }
  ]
}
```

## Workflow

1. **Read the chart spec.** Note the chart type, the field on each channel,
   and the shape of the data: one series or many, time or categories, points
   or bars, a colour field or none.
2. **Identify the request.** What does the user want the reader to do with
   the chart? Read it from the user's words and from the goal of the session.
   Each thing the reader should be able to do is one job: "zoom" is one job,
   "explore" is a few. A request that names no behaviour, such as "make it
   interactive", a live view, a dashboard, goes to "Interactions by
   scenario".
3. **Read the presets and pick.** Call `list_chart_types` and read
   `interactions` for the chart type: the presets it supports. For each job,
   take its group in "Presets by intent", and choose among that group's
   presets the one that fits this chart and this data, with the preset map for
   what each does and takes. Take the fewest entries that serve the request.
4. **Check ownership.** Two entries must not ask for one gesture; see
   "Ownership" and the data conditions there.
5. **Validate.** Run `validate_chart` on the input with the object beside the
   chart spec, fix or drop what it warns about, and return the bare object.

## Interaction Preset map

Every option here is the factory's own; `interactions.ts` has the full list.

| Preset | The reader does | It is for | Required | Useful options | Needs | Default reset |
| --- | --- | --- | --- | --- | --- | --- |
| `click-highlight` | Clicks a mark, legend item, or axis label; it stays emphasised and the rest mute. | Single one mark or series out. | | `targets` (`mark`, `legend`, `discreteAxis`), `dimOpacity` | elements | click-none, escape |
| `click-group-focus` | Clicks a mark; every mark in its group stays emphasised. | Single one group out. | `groupBy` | `dimOpacity` | elements | click-none, escape |
| `hover-group-focus` | Hovers a mark; its group previews. | Preview a group without a click. | `groupBy` | `dimOpacity`, `tolerance` | elements | none |
| `axis-highlight` | Clicks a discrete axis label; the category's marks emphasise. | Single one category out. | | `axis`, `event` (`click`, `hover`), `dimOpacity` | discrete axis | click-none, escape |
| `inspect` | Moves over the plot; the nearest mark shows its values. | Examine one mark's values in detail. | | `mode` (`x`, `y`, `xy`), `tolerance`, `guide` | elements | none |
| `inspect-index` | Moves over the plot; every series shows its value at that x position. | Examine every series at one x position. | `seriesBy` for a single series | `axis`, `show` (`all`, `single`), `guide` | index axis | escape |
| `select` | Drags a rectangle; the marks inside emphasise. | Focus an area of points. | | `match` (`intersect`, `contain`), `dimOpacity`, `guide` | elements, cartesian region | click-none, escape |
| `lasso-select` | Draws a freehand region; the marks inside emphasise. | Focus an irregular cluster. | | `match`, `dimOpacity` | elements, cartesian region | click-none, escape |
| `brush-x`, `brush-y` | Drags an interval along one axis; on a polar chart the x brush is a sector. | Focus a period or a range. | | `mode` (`ephemeral`, `stateful`), `match` | elements, cartesian region | click-none, escape |
| `brush-angle` | Drags an angular sector on a pie, donut, rose, or radar. | Focus adjacent sectors. | | `mode` | elements, angular region | click-none, escape |
| `linked-brush` | Brushes marks; the same groups emphasise in every linked chart. | Carry a focus to another chart. | `groupBy` | `brush` (`rectangle`, `lasso`) | elements, cartesian region | click-none, escape |
| `navigate` | Drags to pan; scrolls or pinches to zoom continuous axes. | Move closer or along. | | `axes` (`x`, `y`, `xy`), `pan`, `zoom`, `domainGuard`, `resetTransition` | navigation | double-click |
| `brush-zoom` | Drags a rectangle; the chart zooms into it. | Zoom into detail with one gesture. | | `axes`, `transition`, `resetTransition` | navigation | double-click, escape |
| `legend-toggle` | Clicks a legend item; its series hides or returns. | Reduce the series on view. | | `mutedOpacity` | discrete legend | none |
| `drag-reorder` | Drags a discrete axis label; the categories reorder. | Rank by hand. | | | reorderable axis | none |
| `click-annotate` | Clicks a mark; an annotation pins with its value. | Note a value for the reader. | | `dimOpacity` | elements | click-none, escape |
| `context-activate` | Right-clicks or long-presses; the host receives a context target. | A context menu in the app. | | | elements | none |
| `long-press` | Holds a mark; it activates. | Touch-first activation. | | `holdMs`, `dimOpacity` | elements | click-none, escape |
| `double-activate` | Double-clicks a mark; it activates. | Open the record behind a mark. | | `dimOpacity` | elements | click-none, escape |
| `accessible-navigation` | Tabs into the chart and walks titles, axes and labels, legends, facet headers, series, and marks with the keyboard; each step says what the element is and what it represents, and emphasises its data. | Keyboard and screen-reader access to the whole chart. | | `emphasis`, `caption`, `sections` (`titles`, `axes`, `legends`, `headers`, `data`, `labels`), `maxFields`, `dimOpacity` | elements | none |

"Needs" is what the chart type must offer; `list_chart_types` has already
applied it. The data can still remove an entry at mount: see the data
conditions under "Ownership".

## Presets by intent

A group is one kind of thing the reader wants to see, adapted from Yi et
al., "Toward a Deeper Understanding of the Role of Interaction in Information
Visualization" (2007). A request names one or more groups; the chart spec and
the data pick the preset inside the row.

| Group | Intent | Presets | Trigger |
| --- | --- | --- | --- |
| select | Mark items so they stand out from the rest. | `click-highlight` on marks, `select`, `lasso-select`, `brush-x`, `brush-y`, `brush-angle` | a click on a mark; a drag over a region |
| explore | See another part of the data, a closer view, or the values of one item. | `navigate`, `brush-zoom`, `inspect-index`, `inspect` | a drag, a wheel, a pinch, or a drawn rectangle; a hover |
| reconfigure | Put the same items in another order. | `drag-reorder` | a label drag |
| filter | Show fewer items, on a condition. | `legend-toggle`, `click-highlight` on axes and legends, `click-group-focus`, `axis-highlight`, `hover-group-focus`, `linked-brush` | a legend or axis-label click; a click or a hover on a group; a drag mirrored on another chart |
| annotate | Add something at an item: a note the chart pins, or a menu the app opens. | `click-annotate`, `context-activate` | a click; a right-click or a hold |
| activate | Mark an item with a stronger trigger than a click, and tell the host. | `long-press`, `double-activate` | a hold; a double-click |
| access | Reach every part of the chart without a pointer, and hear what each part is. | `accessible-navigation` | Tab, the arrow keys, Enter, Escape |

## Interactions by scenario

This section applies when the user asks for an interactive chart, a live
view, or a dashboard and names no behaviour, or when the host renders live and
the goal of the session is to explore. A static image or a bare spec gets
nothing.

What the chart is for decides which groups lead. Read it from the session:

| Scenario | The chart is for | Groups that lead |
| --- | --- | --- |
| Explore | The user understands the data alone: "help me understand", "what patterns". | explore, filter |
| Analyse with the agent | The user points at things and talks about them; a chat about data with no other signal. | select, filter |
| Communicate to others | A report, a dashboard, a page other people read: "share", "publish". | filter, annotate |
| Drive an app | The chart is a control in the user's own app: "in my app", "on click open". | select, activate, annotate |

The table says which groups matter most, not which are absent. A group that
does not lead still earns an entry when the chart and the data call for it: an
explore scenario on a line chart with many series takes `inspect-index` and
`legend-toggle` first, and `brush-x` when the reader will point at a period.

Pick the preset inside each group from the chart spec and "Presets by intent".
Take the fewest entries that serve the scenario. The user's words win, and
a named preset replaces the scenario's choice for its group rather than joining
it.

## Ownership

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

## Apply after the chart exists

Keep the chart spec as it is. Put the object beside it as `interaction_spec`
in the same input and call `create_chart_view` again, or
`buildInteractiveChart(container, input)` in code. The entries mount in
order.

An entry the chart cannot honour is dropped with a warning that names the
entry, what it needed, and the chart type:

```
Interaction "legend-toggle" requires a discrete legend; Bar Chart has none. The interaction was dropped.
```

`validate_chart` returns the same warnings before anything renders. Fix the
entry or drop it, then validate again. A malformed entry is an error, not a
drop: an unknown `type`, an option beside `type`, an `id` inside `options`, a
missing required option, an unknown `reset` gesture, or a duplicate `id`.

## Validation checklist

Before returning the JSON, verify:

- It parses as strict JSON and is a bare object with `interactions`.
- Every entry answers the request, and none duplicates the tooltip.
- Every `type` is in the chart type's list from `list_chart_types`.
- Every option is under `options`; `id` is on the entry.
- `groupBy` and `seriesBy` are present where the preset requires them, and
  name bound fields.
- At most one entry owns the plot drag, the double-click, the legend click,
  and the retained mark focus.
- `validate_chart` returns no warning.
