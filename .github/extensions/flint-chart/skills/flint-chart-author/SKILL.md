---
name: flint-chart-author
description: "Use when: the user asks to make or render charts with flint-chart, visualize tabular data, generate a ChartAssemblyInput, validate/render through MCP, or add Flint to a JS/TS project. Author the semantic spec, transform data before Flint when needed, install/import Flint only when executable code is needed, and reserve backend-specific style tweaks for after compiling from Flint."
---

# flint-chart: authoring and using a chart spec

## What you produce (and what you do NOT)

Your output is the **spec**: the `chart_spec` and `semantic_types` of a
`ChartAssemblyInput`. You reference data columns **by name**. The host
passes the resulting input to `assembleVegaLite`, `assembleECharts`,
or `assembleChartjs` to get a backend spec.

**You write the input spec, not the output spec.** And critically:

- **DO** emit `chart_spec` (chart type, channel→field mapping, properties)
  and `semantic_types` (field → semantic type).
- **Reference columns by name.** How `data` itself gets bound depends on
  the situation — a URL, a host-side variable, or embedded rows (see "How
  data gets bound"). Embedding is fine for small tables; just don't
  re-serialize a *large* dataset by hand, since that risks truncation and
  silent value corruption and wastes tokens.
- **Transform data before Flint.** If the requested chart needs aggregation,
  filtering, joins, pivots, derived columns, or long/wide reshaping beyond
  Flint's built-in static-series fold, use a coding, notebook, SQL, or data tool
  first. Then author the Flint spec against the transformed table.
- **Style after Flint, only when needed.** Author structure in Flint. For a
  presentation tweak Flint does not express (a reference line, annotation, or
  shaded band), use the Vega-Lite escape hatch — see "Post-Flint style
  customization". Never feed edited Vega-Lite JSON back to `render_chart`.

## When the user wants more than a spec

First decide which workflow the user is asking for:

- **Spec authoring only:** return a `ChartAssemblyInput` or its
  `semantic_types` + `chart_spec` pieces. Do not install packages or write
  renderer code unless asked.
- **MCP chart output:** if Flint MCP tools are available, **default to
  `create_chart_view`** whenever the user asks to see a chart — it opens an
  interactive, live-rendered view with a customization panel, and it validates
  the spec for you. Only fall back to `render_chart` (PNG/SVG) when the host has
  no App UI support or the user explicitly wants a static image. Use
  `validate_chart` to check a spec without rendering, `compile_chart` when the
  user wants backend-native JSON, and `list_chart_types` when you need the
  supported chart catalog.
- **Project integration, only when the user asks for code:** add Flint to an
  app, notebook, script, or agentic product, install/import the library, and
  call an assembler in code. Keep the same `ChartAssemblyInput` contract, then
  let the host render the backend result.

For MCP clients, the server can run with `npx`:

```bash
npx -y flint-chart-mcp
```

For JavaScript or TypeScript projects, install Flint first and add only the
renderer peer dependencies needed by the backend you will render:

```bash
npm install flint-chart
npm install vega vega-lite vega-embed  # browser Vega-Lite rendering
npm install echarts                    # ECharts rendering
npm install chart.js                   # Chart.js rendering
```

Then compile with the requested backend:

```ts
import { assembleChartjs, assembleECharts, assembleVegaLite } from 'flint-chart';

const vegaLiteSpec = assembleVegaLite(input);
const echartsOption = assembleECharts(input);
const chartjsConfig = assembleChartjs(input);
```

Python support is planned for a later release. Until the PyPI package is
published, use the npm package or MCP server for released workflows.

```ts
interface ChartAssemblyInput {
  // Bound by the HOST or by you, depending on the situation (see below).
  data: { values: any[] } | { url: string };
  semantic_types?: Record<string, string>;   // field → semantic type  ← you write this
  chart_spec: {                               //                        ← you write this
    chartType: string;                        // e.g. "Scatter Plot"
    encodings: Record<string, EncodingValue>; // channel → { field, ... } (or array)
    baseSize?: { width: number; height: number };    // target layout size, default 400×320
    canvasSize?: { width: number; height: number };  // optional hard ceiling on stretch
    chartProperties?: Record<string, any>;    // per-chart tuning (optional)
  };
  options?: Record<string, any>;              // global layout options (rarely needed)
}
```

## How data gets bound

Use the binding mode that matches the runtime. Do not mix them.

1. **Direct MCP rendering: embed rows.** When calling `render_chart`,
  `compile_chart`, or `validate_chart`, the tool arguments are JSON. If the
  data is small or already transformed by another tool, pass it as
  `data: { values: [...] }`. Do not pass runtime variable names in
  MCP tool calls — the MCP server cannot see your local variables.
2. **Direct MCP rendering: reference a local file.**
  The `flint-chart-mcp` server can load `data: { url: "..." }` from local
  `.json`, `.csv`, or `.tsv` files. By default any local file the agent can
  name is readable (relative paths resolve against the working directory); a
  hardened deployment may reject local file references entirely via
  `--disable-file-reference` (or `FLINT_MCP_DISABLE_FILE_REFERENCE`), in which
  case pass rows inline with `data.values`. Remote URL
  fetching is disabled. If the data must be transformed first, use a
  coding/data tool to write a small prepared file, then reference that file.
3. **Generated application or notebook code: bind runtime variables.** If the
  user asks you to add Flint to code, write normal data-loading code first and
  pass a real runtime value, e.g. `data: { values: rows }`, to
  `assembleVegaLite`, `assembleECharts`, or `assembleChartjs`. This variable
  pattern is for generated code, not for MCP tool calls.

For spec-only answers, return the `semantic_types` and `chart_spec` pieces and
state how the host should bind data. In the worked examples below, `data` is
shown as `{ values: [] }` to signal "host binds this" — focus on `chart_spec`
and `semantic_types`.

## Data transformation before charting

Flint is a chart compiler, not a data-wrangling layer. If the chart needs grouped
totals, time buckets, filters, joins, pivots, derived ratios, or a long-form
table, transform the data first with a host tool, then bind the prepared table
(see "How data gets bound"). Pick semantic types and channels for the transformed
columns, not for columns that no longer exist.

**Sanity-read the values first — don't chart blind.** Inspect the actual data
with your data tool (distinct values per category column, min/max per measure),
not just the column names, and watch for:

- **Embedded totals.** A category column may mix an aggregate level with its
  parts (e.g. `all` alongside `cage-free`/`caged`, or a `Total` region). Charting
  the total with its parts double-counts and flattens the parts — keep one or the
  other on a stacked/grouped/colored channel, not both.
- **Units.** Check whether a rate is a fraction (0–1) or already a percent
  (0–100) before tagging it `Percentage`; don't scale twice.
- **One real entity.** If your breakdown column has a single distinct value, the
  per-group chart collapses to one mark — the intended breakdown is likely a
  different column.

## Post-Flint style customization

Stay at the Flint level for structure (data, chart type, channels, transforms,
sizing, properties) — Flint specs stay portable and regenerate safely. Drop to
backend JSON only after a valid Flint chart exists, and only for a narrow
presentation change Flint does not expose (exact axis/legend/mark styling,
titles, annotations, reference lines, layout polish). Never use it to change the
data, chart type, field mappings, or transforms — fix those upstream.

For a Vega-Lite-specific style tweak:

1. Author and validate the Flint `ChartAssemblyInput`.
2. Render or inspect the Flint chart first, when possible.
3. Call `compile_chart` with `backend: "vegalite"`.
4. Make the smallest necessary style/presentation edit to the returned
  Vega-Lite spec.
5. Render the edited spec in the host environment with a Vega-Lite renderer.

This edited Vega-Lite spec is no longer a portable Flint spec. Do not send it to
`render_chart`; use `render_chart` only for Flint `ChartAssemblyInput`.

## Step 1 — pick `chartType`

Use one of the registered names **exactly**. Vega-Lite is the default and
broadest backend; the table below lists each Vega-Lite chart type, the
channels it accepts, and its tuning properties (see "Chart-level
properties"). Required channels are noted.

| chartType | Channels | Notes / required |
|---|---|---|
| `"Scatter Plot"` | x, y, color, size, opacity, column, row | x + y required |
| `"Regression"` | x, y, size, color, column, row | scatter + fit line; props `regressionMethod`, `polyOrder` |
| `"Connected Scatter Plot"` | x, y, order, color, detail, column, row | x + y required; `order` = connection sequence (time/index), so the line traces a trajectory and may self-cross |
| `"Ranged Dot Plot"` | x, y, color | dumbbell of two x per category |
| `"Strip Plot"` | x, y, color, size, column, row | jittered points; props `stepWidth`, `pointSize`, `opacity` |
| `"Bar Chart"` | x, y, color, opacity, column, row | one discrete + one measure; prop `cornerRadius` |
| `"Grouped Bar Chart"` | x, y, group, column, row | `group` = the clustering category |
| `"Stacked Bar Chart"` | x, y, color, column, row | prop `stackMode` |
| `"Pyramid Chart"` | x, y, color | diverging horizontal bars |
| `"Lollipop Chart"` | x, y, color, column, row | prop `dotSize` |
| `"Waterfall Chart"` | x, y, color, column, row | `color` = Type column, values `start`/`delta`/`end` only; omit it for auto sign coloring; props `cornerRadius`, `totals` |
| `"Gantt Chart"` | y, x, x2, color, detail, column, row | x = start, x2 = end |
| `"Bullet Chart"` | y, x, goal, color, column, row | `goal` required (target) |
| `"Histogram"` | x, color, column, row | x = measure to bin; prop `binCount` |
| `"Boxplot"` | x, y, color, opacity, column, row | category + measure; props `whiskerMethod`, `showOutliers` |
| `"ECDF Plot"` | x, color, detail, column, row | x = measure; cumulative distribution (step line); prop `showPoints` |
| `"Heatmap"` | x, y, color, column, row | color = the measure |
| `"Line Chart"` | x, y, color, strokeDash, detail, opacity, column, row | props `interpolate`, `showPoints` |
| `"Sparkline"` | x, y, color, detail, row, column | x + y required; small-multiple mini trend lines, one per series (series from `color` or `detail`); props `interpolate`, `baseline`, `trendWidth` |
| `"Bump Chart"` | x, y, color, detail, column, row | rank-over-time lines |
| `"Slope Chart"` | x, y, color, detail, column, row | two-period value change; straight segments + end points, one line per category |
| `"Area Chart"` | x, y, color, opacity, column, row | props `interpolate`, `opacity`, `stackMode` |
| `"Range Area Chart"` | x, y, y2, color, column, row | x + y + y2 required; translucent band from `y` (low) to `y2` (high), value axis fits the band (not zero) |
| `"Violin Plot"` | x, y, color, row | x (category) + y (measure) required; mirrored KDE density per category, prop `bandwidth`; **Vega-Lite only**; `column` is used internally for the per-category panels |
| `"Streamgraph"` | x, y, color, column, row | centre-stacked areas |
| `"Density Plot"` | x, color, column, row | prop `bandwidth` |
| `"Pie Chart"` | size, color, column, row | `size` = slice value (→ angle), `color` = category |
| `"Rose Chart"` | x, y, color, column, row | polar bars; props `alignment`, `innerRadius`, `padAngle` |
| `"Radar Chart"` | x, y, color, column, row | props `filled`, `fillOpacity`, `strokeWidth` |
| `"Candlestick Chart"` | x, open, high, low, close, column, row | OHLC all required |
| `"Bar Table"` | y, x, color, column, row | compact bars + value labels |
| `"KPI Card"` | metric, value, goal | big-number tile; prop `behindThreshold` |
| `"Map"` | longitude, latitude, color, size, opacity | bubble map; props `region`, `projection` |
| `"Choropleth"` | id, color, detail | `id` = geographic key |

**Donut chart:** use `"Pie Chart"` with `chartProperties.innerRadius > 0`.

**Choosing a bar chart (most common mix-up).** All three take one discrete
category on `x` (or `y`) plus one measure. They differ in how a **second**
category is shown — and each reads that second category from a **different
channel**:

- `"Bar Chart"` — no second category. One bar per `x` value. A `color`
  encoding just tints the bars (or stacks segments if multiple rows share an
  `x`). It has **no `group` channel**, so a `group` encoding is silently
  ignored.
- `"Stacked Bar Chart"` — second category on `color`, drawn as **stacked**
  segments within each bar (totals matter). Tune with `stackMode`
  (`stacked` / `normalize` / `layered`).
- `"Grouped Bar Chart"` — second category on the **`group`** channel, drawn as
  **side-by-side (dodged)** bars within each `x` cluster (compare values
  directly). Put the clustering category on `group`, *not* `color`.

Rule of thumb: comparing parts-to-whole → Stacked; comparing values
side-by-side → Grouped (use `group`); single series → Bar.

**Waterfall color is a special "Type" column, not a free category.** On a
`"Waterfall Chart"` the `color` channel is reserved for a *type* field whose
values are literally `start`, `delta`, and `end` — it drives which bars anchor
to zero, not an arbitrary grouping. Do **not** bind `color` to an
`Increase`/`Decrease` (or up/down, gain/loss) category: the up/down direction is
already derived from the **sign** of the `y` value and colored automatically
(green up / red down). For the common case, **omit `color` entirely** and let
Flint infer the start/delta/end and per-bar sign coloring. To force which bars
are anchored totals, use the `totals` property (`first`/`last`/`both`), not a
color field. Only bind `color` when you genuinely have a `start`/`delta`/`end`
type column.

**Backend coverage.** Vega-Lite supports all of the above. Other backends
support a subset (verify if targeting a non-VL backend):

- **ECharts** adds: `"Calendar Heatmap"`, `"Gauge"`,
  `"Funnel"`, `"Treemap"`, `"Sunburst"`, `"Sankey"`,
  `"Parallel Coordinates"`, `"Graph"`, `"Tree"`.
- **Chart.js** supports: Scatter, Bubble, Bar, Grouped Bar, Stacked Bar,
  Combo, Line, Area, Range Area, Pie, Doughnut, Histogram, Radar, Rose, Slope,
  Connected Scatter.

You do not need to call the library or inspect its source to author the
input — pick from this table.

## Step 2 — map fields to channels

Each channel maps to an **encoding object** `{ field, ... }` (or a bare
string shorthand, expanded to `{ field: "<string>" }`):

```json
"encodings": {
  "x": { "field": "weight" },
  "y": "mpg",
  "color": { "field": "origin" }
}
```

**Encoding object fields** (all optional except `field`):

| Field | Values | Purpose |
|---|---|---|
| `field` | column name | Bind the channel to a data column |
| `type` | `quantitative`, `nominal`, `ordinal`, `temporal` | Override the inferred encoding type (rarely needed) |
| `aggregate` | `count`, `sum`, `average`, `mean` | Force an aggregation on a measure channel |
| `sortOrder` | `ascending`, `descending` | Sort direction for a discrete/sorted axis |
| `sortBy` | channel name (e.g. `"y"`) or field | Sort a category axis by another channel's measure |
| `scheme` | Vega scheme name (e.g. `viridis`, `redblue`) | Color scheme for the `color` channel |

You usually don't need `type`, `aggregate`, or `sortOrder` — they're
inferred from the semantic type. Set them only with specific intent.

**Multi-series (wide → long).** To plot several measure columns as series,
pass an **array** on `x` or `y` (only those two channels). The library
folds them into long form and synthesizes a series/legend field:

```json
"encodings": { "x": { "field": "month" }, "y": ["sales", "profit"] }
```

All array fields must be quantitative, and you cannot also bind `color`
when using the array form (the fold owns the color/legend). This is the
**only** built-in reshape — there is no `transforms`/`fold` property. For any
other shape (long↔wide, an aggregate the encodings can't express, a derived
column, a pivot, a join), reshape the data first with a host tool — pandas/polars,
Arquero/`Array.map`/SQL, or a data/MCP tool — and pass the result as
`data.values`. If you have no way to transform, surface the gap to the developer
rather than inventing a transform property that does not exist.

## Step 3 — annotate with semantic types

**This is the most important step.** Semantic types drive all downstream
decisions — formatting, zero baseline, color scheme, scale direction, and
more. Pick the most specific type for each field. Full registered set:

| Family | Semantic types |
|---|---|
| Temporal (point) | `DateTime`, `Date`, `Time`, `Timestamp` |
| Temporal (granule) | `Year`, `Quarter`, `Month`, `Week`, `Day`, `Hour`, `YearMonth`, `YearQuarter`, `YearWeek`, `Decade` |
| Temporal (span) | `Duration` |
| Measure (amount) | `Amount`, `Price`, `Quantity`, `Count`, `Number` |
| Measure (proportion) | `Percentage` |
| Measure (signed/diverging) | `Profit`, `PercentageChange`, `Sentiment`, `Correlation` |
| Measure (physical) | `Temperature` |
| Discrete / rank | `Rank`, `Score`, `ID` |
| Geographic (coord) | `Latitude`, `Longitude` |
| Geographic (place) | `Country`, `State`, `City`, `Region`, `Address`, `ZipCode` |
| Categorical | `Category`, `Name`, `Status`, `Boolean`, `Direction`, `Range` |
| Fallback | `Unknown` |

What choosing well gets you (automatically):

- `Price` / `Amount` → currency formatting, zero baseline, sequential color
- `Temperature` → diverging color scheme, no forced zero baseline
- `Correlation` → fixed `[-1, 1]` diverging domain
- `Rank` → reversed axis (1 on top), discrete color
- `Date` / `DateTime` → temporal axis with auto-granularity formatting
- `Percentage` → percent formatting, 0–100 domain awareness

If you don't know, use `Quantity` for numbers, `Category` for strings,
`Date`/`DateTime` for date-shaped values. Do **not** invent type names.

## Chart-level properties (`chartProperties`)

`chartProperties` is an optional per-chart tuning map. Set a property only
when the user asks for that behavior — defaults are sensible. These are
**design choices**, not styling overrides (colors/fonts/ticks are still
derived). Values are clamped to the ranges shown.

| Chart type | Property | Type / range (default) | Effect |
|---|---|---|---|
| Bar Chart | `cornerRadius` | 0–15 (0) | Round bar corners (px) |
| Bar / Area / Stacked Bar | `stackMode` | `stacked` \| `normalize` \| `layered` (unset) | Stacking behavior; `normalize` = 100% |
| Line / Area / Sparkline | `interpolate` | `linear` \| `monotone` \| `step` \| `step-before` \| `step-after` \| `basis` \| `cardinal` \| `catmull-rom` (`linear`) | Curve shape |
| Line / ECDF Plot | `showPoints` | boolean (false) | Draw point markers on the line |
| Sparkline | `baseline` | `mean` \| `zero` \| `median` \| `none` (`mean`) | Reference line per spark row |
| Sparkline | `trendWidth` | 80–600 (240) | Mini line-plot width (px) |
| Boxplot | `whiskerMethod` | `iqr` \| `minmax` (`iqr`) | Whisker rule (Tukey 1.5×IQR vs min–max) |
| Boxplot | `showOutliers` | boolean (true) | Show outlier points (Tukey only) |
| Area | `opacity` | 0.1–1 (0.7) | Fill opacity |
| Scatter | `opacity` | 0.1–1 (1) | Point opacity |
| Strip Plot | `stepWidth` | 10–100 (20) | Jitter spread |
| Strip Plot | `pointSize` | 0–150 (0=auto) | Point size |
| Strip Plot | `opacity` | 0–1 (0=auto) | Point opacity |
| Histogram | `binCount` | 5–50 (10) | Number of bins |
| Density Plot | `bandwidth` | 0.05–2 (0=auto) | Kernel bandwidth |
| Pie Chart | `innerRadius` | 0–100 (0) | Donut hole size (>0 → donut) |
| Rose Chart | `alignment` | `left` \| `center` (`left`) | Wedge alignment |
| Rose Chart | `innerRadius` | 0–100 (0) | Inner radius |
| Rose Chart | `padAngle` | 0–0.1 (0) | Gap between slices |
| Lollipop | `dotSize` | 20–300 (80) | Circle size (px) |
| Waterfall | `cornerRadius` | 0–8 (0) | Round bar corners |
| Waterfall | `totals` | `auto` \| `none` \| `first` \| `last` \| `both` (`auto`) | Which bars anchor to zero as totals (only when no Type column) |
| Regression | `regressionMethod` | `linear` \| `log` \| `exp` \| `pow` \| `quad` \| `poly` (`linear`) | Fit method |
| Regression | `polyOrder` | 1–5 (3) | Polynomial order (when `poly`) |
| Radar | `filled` | boolean (true) | Fill the polygon |
| Radar | `fillOpacity` | 0–0.5 (0.15) | Polygon fill opacity |
| Radar | `strokeWidth` | 0.5–4 (1.5) | Line width |
| KPI Card | `behindThreshold` | 0–1 (0.5) | Value/goal ratio cutoff for color |
| Map | `region` | `us` \| `world` \| `auto` (`auto`) | Geographic scope |
| Map | `projection` | `mercator` \| `equalEarth` \| `orthographic` \| `stereographic` \| `conic` \| `mollweide` | Map projection |

**Cross-cutting properties** (apply to position/faceted charts when
relevant; set only to force non-default behavior):

- `independentYAxis` (boolean) — faceted charts: give each panel its own
  y-scale.
- `logScale_x` / `logScale_y` (boolean) — force a logarithmic axis.
- `includeZero_x` / `includeZero_y` (boolean) — force the axis to include 0.
- `xAxisType` / `yAxisType` (`temporal` | `nominal`) — force a temporal
  field to render as discrete bands (or vice-versa).

## Parameter overrides — when to reach for them

Overrides exist, but prefer letting semantic types drive decisions. Reach
for an override only when the user's intent genuinely conflicts with the
default:

- **Force an aggregation:** `encodings.y = { field: "sales", aggregate: "sum" }`.
- **Sort a category axis by its measure:** `encodings.x = { field: "name", sortBy: "y", sortOrder: "descending" }`.
- **Pick a color scheme:** `encodings.color = { field: "region", scheme: "tableau10" }`.
- **Override an inferred type:** `encodings.x = { field: "year", type: "ordinal" }` (e.g. treat a year as discrete bands).
- **Resize the chart:** Flint sizes from two numbers — `baseSize` (the *target*
  it aims for, default 400×320) and `canvasSize` (a *hard ceiling* it may never
  exceed). With dense data the chart stretches from base toward the ceiling.
  - Want a comfortable size that may grow for dense data → set `chart_spec.baseSize = { width, height }`.
  - Want a fixed slot it must fit inside → set `chart_spec.canvasSize = { width, height }` alone; the chart fills it and shrinks to fit, never overflowing. *What you ask for is what you get.*
  - Both → aims for `baseSize`, grows toward `canvasSize`, never beyond.
- **Force log / zero baseline:** the `logScale_*` / `includeZero_*` chart
  properties above.

Global layout tuning lives in the top-level `options` object (e.g.
`addTooltips`, band padding, facet sizing). It is rarely needed for
authoring — omit it unless asked.

## Worked examples

In each example `data` is a placeholder — the host binds real rows or a
URL. You author only `chart_spec` and `semantic_types`.

### Scatter plot

User: "Plot car weight vs fuel economy, colored by origin."

```json
{
  "data": { "values": [] },
  "semantic_types": {
    "weight": "Quantity",
    "mpg": "Quantity",
    "origin": "Country"
  },
  "chart_spec": {
    "chartType": "Scatter Plot",
    "encodings": {
      "x": { "field": "weight" },
      "y": { "field": "mpg" },
      "color": { "field": "origin" }
    },
    "baseSize": { "width": 400, "height": 300 }
  }
}
```

### Revenue bar chart with facets, sorted by value

User: "Show revenue by product line, biggest first, one panel per region."

```json
{
  "data": { "values": [] },
  "semantic_types": {
    "product_line": "Category",
    "revenue": "Amount",
    "region": "Region"
  },
  "chart_spec": {
    "chartType": "Bar Chart",
    "encodings": {
      "x": { "field": "product_line", "sortBy": "y", "sortOrder": "descending" },
      "y": { "field": "revenue" },
      "column": { "field": "region" }
    }
  }
}
```

### Time series, multiple series (wide → long via array)

User: "Line chart of monthly sales and profit."

```json
{
  "data": { "values": [] },
  "semantic_types": {
    "month": "YearMonth",
    "sales": "Amount",
    "profit": "Profit"
  },
  "chart_spec": {
    "chartType": "Line Chart",
    "encodings": {
      "x": { "field": "month" },
      "y": ["sales", "profit"]
    },
    "chartProperties": { "interpolate": "monotone", "showPoints": true }
  }
}
```

### Donut chart (Pie + innerRadius), value on `size`

User: "Show market share by vendor as a donut."

Pie/donut maps the slice value to `size` (rendered as angle) and the
category to `color`. Data is already long (one row per vendor).

```json
{
  "data": { "values": [] },
  "semantic_types": {
    "vendor": "Category",
    "share": "Percentage"
  },
  "chart_spec": {
    "chartType": "Pie Chart",
    "encodings": {
      "size": { "field": "share" },
      "color": { "field": "vendor" }
    },
    "chartProperties": { "innerRadius": 60 }
  }
}
```

### Bullet chart (KPI vs target)

User: "Show each rep's sales against their quota."

```json
{
  "data": { "values": [] },
  "semantic_types": {
    "rep": "Name",
    "sales": "Amount",
    "quota": "Amount"
  },
  "chart_spec": {
    "chartType": "Bullet Chart",
    "encodings": {
      "y": { "field": "rep" },
      "x": { "field": "sales" },
      "goal": { "field": "quota" }
    }
  }
}
```

## What you should NOT do

- **Don't re-emit the data.** Reference columns by name; let the host bind
  `data` (url, variable, or small literal). Never paste large datasets.
- **Don't write backend specs directly** — write the `ChartAssemblyInput`,
  then call the assembler. That's the whole point.
- **Don't invent transforms.** The only built-in reshape is the array form
  on `x`/`y`. If the data shape is wrong for the chart, say so and ask the
  host to reshape it.
- **Don't invent field names.** Reference only columns that exist, spelled
  exactly. If the data is the wrong shape for the chart, reshape it upstream
  rather than guessing column names that aren't there.
- **Don't set `type`/`aggregate`/`sortOrder`** unless intent conflicts
  with the default.
- **Don't pass colors, font sizes, axis tick counts** — the compiler
  derives these. Users fine-tune the *output* spec.
- **Don't invent semantic type names.** If none fit, use the family
  default (`Quantity`, `Category`, `Date`).
- **Don't call the library to discover channels/types** — this document is
  the authoring reference.

## Validation checklist

Before returning, verify:

1. `chartType` is an exact registered name supported by the target backend.
2. Every `field` referenced in `encodings` is a real column name.
3. Every encoded field has an entry in `semantic_types` (specific type).
4. Required channels for the chart type are present (e.g. Bullet→`goal`,
   Candlestick→`open/high/low/close`, Pie→`size`+`color`).
5. Any `chartProperties` keys are valid for that chart type and in range.
6. You did **not** inline large data or hand-tune derived styling.
7. The data carries no embedded total/subtotal level (e.g. an `all` / `total`
   row) mixed with its components on a stacked, grouped, or colored channel.

## Copilot CLI chart canvas

When this plugin's native **Flint Chart Canvas** is available, open it with the complete `ChartAssemblyInput` after the input has been validated. Pass the exact inline `data.values`, `semantic_types`, and `chart_spec` that Flint will render. The canvas owns interactive chart customization and shows its Vega-Lite output; do not recreate that UI or replace it with a browser page.
