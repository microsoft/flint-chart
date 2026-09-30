# Accessible Navigation

Accessible navigation is a keyboard and screen-reader walk of a rendered chart.
It lets a reader who cannot see the chart, or cannot use a pointer, reach the
same things a sighted reader scans: the title, the axes and their labels, the
legend and its items, facet headers, panels, series, and each mark. At each step
it says what the element is and what data it stands for, and it highlights that
data on the chart for sighted keyboard users.

The feature is the `accessible-navigation` interaction preset. It works on the
Vega-Lite backend. Plotly, ECharts, and Chart.js have no interaction runtime yet;
the plan for Plotly is at the end of this document.

```ts
import { accessibleNavigation, legendToggle } from 'flint-chart/interactive';

buildInteractiveChart(host, input, {
    backend: 'vegalite',
    interactions: [accessibleNavigation(), legendToggle()],
});
```

```json
{ "interactions": [{ "type": "accessible-navigation" }, { "type": "legend-toggle" }] }
```

## 1. What the reader experiences

The chart is **one tab stop**. Tabbing to it reads a summary:

> Stacked Bar Chart: Sales by country. X axis Country; Y axis Sales; color
> legend Source. 6 bars. Press Enter to explore 5 parts, or H for help.

From there the reader moves through a tree:

```
Chart
├─ Title, Subtitle
├─ X axis / Y axis ── axis title, tick labels ── (categorical label) its marks
├─ Legend ── legend title, items ── its marks
├─ Column / Row / Facet headers ── header ── its panels
├─ Data ── panels ── series (a line or an area) ── marks
└─ Text labels
```

Each step is read as `<type> <i> of <n>. <content>.`:

> X axis label 2 of 4. US. 2 bars.
> Legend item 2 of 3. Source: Coal. 3 bars.
> Bar 1 of 6. Country: US, Sales: 200, Source: Coal.
> Line series 1 of 2. Food: Eggs. 4 points on line, Price from 2 to 5.

### Keys

| Key | Command |
| --- | --- |
| Right / Left | Next / previous sibling |
| Down / Up | On a mark: the nearest mark below / above (on a line chart, the next series at that point). In a vertical list (a vertical legend, a y axis): next / previous. |
| Enter | Go into the focused element. On a leaf that can be activated, activate it. |
| Escape, Backspace | Go back out. On the chart itself, leave the walk. |
| Home / End | First / last sibling |
| Page Down / Page Up | Jump ten siblings |
| Space | Activate a mark, legend item, or axis label: run the click presets |
| T, X, Y, L, F, D | Jump to the title, x axis, y axis, legend, facet headers, data |
| I | Read the focused element again |
| H or ? | Read the key map |

Keys with Alt, Ctrl, or Meta are left to the page and the screen reader. A key
that cannot move ("End of the legend.", "No mark below.") is announced without
moving focus.

### Activation

Space (or Enter on a leaf) does what a click would do. It dispatches a
`commit` with action `activate-element` to the click presets that listen for
the element's role: `legend-toggle` for a legend item, `click-highlight` for a
mark, axis click presets for a categorical label. After the chart re-renders,
the walk re-reads the element and announces its new state:

> Activated. Source: Coal. No bars.

With no click preset mounted, activation reads the element again.

## 2. Architecture

```
interactive/presets/accessible-navigation.ts   preset: what a focused element does to the chart
interactive/triggers.ts                        settings (emphasis, caption, sections, maxFields)
vegalite/interactions/runtime.ts               mounts the walk, maps nodes to semantic targets,
                                               dispatches focus and activation events
vegalite/interactions/accessible-navigation/
    model.ts        scene -> tree, readings, key map, AccessibleNavigator
    controller.ts   DOM: focus proxy, caption, live region, key handling
```

The split is deliberate:

- **The preset** owns the chart's response. It claims no pointer gesture, so it
  composes with every other preset. On `focus-element` preview it returns an
  emphasis update (dim everything outside the focused element's data); on cancel
  it returns nothing, and the preview is dropped.
- **The model** is pure: a function from a rendered scene to a tree of
  `AccessibleNode`s, plus the navigator that moves a cursor through that tree.
  It has no DOM dependency and is unit-tested in Node.
- **The controller** owns the DOM and the keys. It knows nothing about Vega.
- **The runtime** glues them: it builds the tree from `view.scenegraph()`,
  turns a node into a `SemanticTarget`, and dispatches preview, cancel, and
  activation events through the same path pointer interactions use.

Only `buildAccessibleTree` and `accessibleSceneSignature` read the Vega
scenegraph. The navigator, the readings (`describeAccessibleNode`), the key
map, and the controller are renderer-neutral.

## 3. The tree

### Nodes

```ts
interface AccessibleNode {
    id: string;              // stable path of local ids, e.g. chart/legend:0/item:Coal
    kind: AccessibleNodeKind;
    type: string;            // spoken type: "Bar", "Legend item", "X axis label"
    content: string;         // spoken content: "Source: Coal. 3 bars"
    children: AccessibleNode[];
    parent?: AccessibleNode;
    bounds?: AccessibleBounds;  // scene coordinates, for the focus ring
    shape?: 'rect' | 'point';
    members: MarkRef[];      // the marks this node stands for
    axis?, legend?, item?    // what the runtime needs to build a target
}
```

Kinds: `chart`, `title`, `subtitle`, `axis`, `axis-title`, `axis-label`,
`legend`, `legend-title`, `legend-item`, `headers`, `header`, `data`, `panel`,
`series`, `mark`, `labels`, `text-label`.

Ids are paths of local ids built from content, not from positions, so the same
element has the same id after a re-render. Duplicate local ids under one parent
get a `#n` suffix.

### Building from the scenegraph

`collectScene` walks the Vega scenegraph once and gathers:

- **titles** (role `title-text`), **axes** (role `axis`, with their title and
  label items and the scale they draw), **legends** (role `legend`, with symbol
  and label items, gradient or discrete), **facet headers** and scope groups
  (panels);
- **marks**: every item carrying `__flint_interaction_key`, with its absolute
  bounds, its panel scope, and, for a line or area, the path it belongs to;
- **text labels** that are not titles, axes, or legends.

`representativeMarks` then chooses one entry per data element. Several scene
items may share a key (a bar and its text label, a line vertex and its point
symbol); the highest-ranked, largest one represents them. The grouping key is
the interaction key **within one panel scope**, because keys need not name the
facet field: equal keys in two panels are two marks. When every vertex of a path
shares one key, the path is one mark (a violin, a density curve). When only some
vertices share it (tied values on an ECDF step), each vertex stays a point.

### Sections

- **Axes.** A categorical axis label lists the marks whose axis field equals
  the label's value ("US. 2 bars."). A quantitative axis reads its range ("0 to
  350"). A time axis reads full dates: a label reads `Apr (April 2021)`, a year
  tick reads `January 2021`, and the range reads "from January 2020 to October
  2022". The granularity is inferred from the ticks; dates are formatted in
  local time unless the scale is `utc`.
- **Legends.** A discrete item lists its members ("Source: Coal. 3 bars."). A
  quantized or binned item reads its interval ("40, covering 35 to 45"). A
  gradient legend reads its scale. The spoken prefix is the legend title.
  Membership uses the legend's field in the mark data, or its aggregate
  (`sum_Activity`) when only that is present.
- **Data.** Panels when marks sit in more than one facet cell or concatenated
  view; within a panel, one series per line or area path, then the loose marks.
  A series is named by the series or color field, else by a text field that
  holds one value along it (a stroke-dash series), else "Series n".
- **Membership honesty.** If *no* label of an axis (or item of a legend) matches
  any mark, membership is unknown, not empty, and nothing is said. Otherwise an
  empty one says so: "increase. No steps."
- **Overflow.** When the chart shows `...N items omitted` in place of excess
  categories, the placeholder is read as "N more items not shown" and the
  section summary ends with ", and N more not shown".

### Readings

`describeAccessibleNode(node)` returns `{ kind, type, content, position, text }`.
Numbers are read at a spoken precision: two fraction digits at or above 1,
three significant digits below 1, exponent form below 1e-4. Tooltip strings
printed to full precision are tidied the same way. A mark reads its tooltip
fields (the chart's own display names), capped at `maxFields`.

## 4. Navigation

`AccessibleNavigator` holds the tree and a cursor. `run(command)` returns an
`AccessibleMove`: the node, whether it moved, an optional message, and flags for
activation and exit.

- Left and right move among siblings and stop at the ends with a message.
- Up and down on a mark pick the nearest mark in that direction by geometry. On
  a line chart the pool is the other series, so up and down move between lines
  at the same x. In a vertical list they step through the list.
- Jumps (T, X, Y, L, F, D) go to the first child of the chart of that kind.
- `refresh()` rebuilds the tree and finds the cursor again by id, walking up the
  old ancestry until an id still exists. So hiding a series keeps the reader on
  the legend item, and a series that disappears returns the reader to Data.

## 5. DOM and ARIA

The controller adds one layer over the chart:

```html
<div data-flint-accessible-navigation role="application"
     aria-roledescription="interactive chart" aria-label="<chart summary>">
  <div data-flint-accessible-focus tabindex="0" role="img" aria-label="<reading>"></div>
  <div data-flint-accessible-caption aria-hidden="true">…</div>
  <div data-flint-accessible-live role="status" aria-live="polite"></div>
</div>
```

- **Proxy.** The focused element is a transparent `div` laid over the rendered
  element. Its accessible name is the reading; it draws the focus ring (a
  circle for points, a rectangle otherwise). Each move creates a new proxy and
  focuses it, so screen readers speak the move as a focus change. Tabbing in
  refreshes the existing proxy in place instead, so the first reading is not
  spoken twice.
- **Caption.** A visible box under the element repeats the reading with a key
  hint, for sighted keyboard users. It is `aria-hidden`.
- **Live region.** Messages that do not move focus (edges, help, activation
  results) go to a polite status region.
- **`role="application"`** asks screen readers to pass the arrow and letter
  keys through instead of using them for browse-mode navigation.
- **Tab order.** The proxy is the only tab stop. When another preset needs the
  container focusable for Escape (`click-highlight`, `legend-toggle`), the
  container gets `tabindex="-1"`: a pointer press still focuses it, but Tab
  does not stop on it.

Handled keys call `preventDefault` and `stopPropagation`. Escape on the chart
itself does neither: the walk ends, and the container's Escape reset still runs.

## 6. Events, emphasis, and composition

On every move the runtime:

1. builds a `SemanticTarget` for the node (a mark, a legend cohort, a category,
   a series or panel region, or a plain text element for titles and axes);
2. dispatches a `semantic` event, source `element`, phase `preview`, action
   `focus-element`, with `event.description` set to the reading;
3. sets hover presentation: the legend cohort, the category, the whole line for
   a point on a line.

Leaving the chart, or stepping back to the chart node, dispatches `cancel` and
clears the hover. Hosts can listen for `flint-interaction` events and read
`event.description` (for example, to mirror the reading in their own UI).

Activation dispatches `commit` / `activate-element` to the click presets and
resolves after they have rendered. The controller then refreshes and announces.

| With | Behavior |
| --- | --- |
| `legend-toggle` | Space on a legend item hides or shows it; the walk re-reads the item. |
| `click-highlight` | Space on a mark highlights its cohort. |
| Escape-reset presets | Escape on the chart node leaves the walk and resets. |
| `keyboardTargeting` | Ignored while accessible navigation is mounted; both would claim the arrows. |
| Viewport presets | The tree is rebuilt from the scene after each render, so it follows the viewport. |

## 7. Refresh and cost

The walk refreshes before every key, on resize, and after activation, because
the chart may have changed underneath it (a legend toggle, a viewport change,
new data). Rebuilding is linear in the marks and takes up to ~90 ms on a
6,000-point chart, so the navigator is given a **scene signature**: a hash of
every scene item's geometry (`x`, `y`, `x2`, `y2`, `width`, `height`, angles,
radii, `size`), text, path length, and interaction key. It deliberately
ignores bounds and style, which hover emphasis changes. The tree is rebuilt
only when the signature changes. Computing the signature on that chart takes
~3 ms.

## 8. Settings

| Option | Default | Meaning |
| --- | --- | --- |
| `emphasis` | `true` | Dim the marks outside the focused element's data. |
| `caption` | `true` | Show the visible caption. |
| `sections` | all | Which of `titles`, `axes`, `legends`, `headers`, `data`, `labels` the tree includes. |
| `maxFields` | `8` | The most fields read for one mark. |
| `dimOpacity` | preset default | Opacity of de-emphasised marks. |

## 9. Testing

- `tests/accessible-navigation.test.ts` builds real Vega views in Node and
  checks: every Vega-Lite chart type has a tree with unique ids, a type and
  content on every node, and one member per mark; no reading contains
  `undefined`, `NaN`, `Untitled`, or a raw overflow placeholder; the key map;
  moves, edges, and spatial up/down; the cursor surviving a rebuild; and the
  regressions in the readings (number precision, ECDF ties, overflow
  placeholders, full dates, facet panels, aggregated legend fields, stroke-dash
  series, signature-gated rebuilds).
- The DOM controller has no automated test in the repository, because the
  test environment is Node without a DOM. It was verified with a jsdom sweep
  across all 36 Vega-Lite chart types (one tab stop, focus never leaves the
  layer, exactly one proxy, valid readings after each of ~50 keys, activation
  with `legend-toggle` and `click-highlight`).

## 10. Limits

- **Scroll windows.** When a chart shows a window of many categories with a
  scrollbar, the walk reaches only the rendered window. The scrollbar is its own
  tab stop.
- **Large charts.** Every mark is reachable, but walking thousands of marks
  one by one is slow; Page Up/Down jump ten. There is no data-table view or
  summary statistics beyond ranges.
- **Language.** Readings are English; dates use `en-US` formatting.
- **Screen readers.** The ARIA pattern (`application` + focused `img` proxies +
  a status region) has been checked structurally, not with NVDA, JAWS,
  VoiceOver, or TalkBack.
- **Template semantics.** The walk is only as good as the interaction semantics
  a template declares (its key fields, series and legend fields). Where a
  template draws something its semantics do not name (a stroke-dash legend on a
  line chart, a waterfall's derived step type), the matching legend items read
  without members.

## 11. Plotly

Plotly has no interaction runtime in flint-chart: `buildInteractiveChart`
rejects semantic interactions on any backend other than Vega-Lite. Accessible
navigation on Plotly therefore needs, in order:

1. **A minimal Plotly runtime** that can apply a preview update (emphasis) and
   dispatch semantic events. Emphasis maps onto `Plotly.restyle` with
   `selectedpoints` (or per-point `marker.opacity`), and a cancel restores the
   figure.
2. **A Plotly tree builder** producing the same `AccessibleNode` tree:
   - titles from `layout.title`, axes from `_fullLayout.xaxis*` / `yaxis*`
     (`_vals` for ticks, `title.text`), legends from `_fullLayout.showlegend`
     and trace names, facet panels from the axis domains of each subplot;
   - marks from `figure.data[i]` points, with bounds from the axis `l2p`
     transforms (or from the rendered `.point`, `.bars path` nodes);
   - keys from the same `__flint_interaction_key` the compiler attaches to
     records, so the targets agree with Vega-Lite's.
3. **Reuse** of the renderer-neutral parts unchanged: `AccessibleNavigator`,
   `describeAccessibleNode`, the key map, and the controller. The controller
   needs only `buildTree`, `sceneSignature`, a coordinate space, and the
   present / clear / activate callbacks.

The one refactor this implies is moving the navigator, readings, and key map
out of `vegalite/interactions/accessible-navigation/model.ts` into a
backend-neutral module (for example `interactive/accessible-navigation/`),
leaving `buildAccessibleTree(scene)` as the per-backend adapter.
