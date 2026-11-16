---
name: flint-chart-author
description: "Use when: the user asks to make or render charts with flint-chart, visualize tabular data, generate a ChartAssemblyInput, validate/render through MCP, or add Flint to a JS/TS project. Author the semantic spec, transform data before Flint when needed, install/import Flint only when executable code is needed, and reserve backend-specific style tweaks for after compiling from Flint."
---

# flint-chart: authoring a chart spec

You write a `ChartAssemblyInput`: the data, the `semantic_types` of its
fields, and a `chart_spec` naming the chart type and which field goes on
which channel. Flint compiles it to Vega-Lite, ECharts, Chart.js or Plotly and
decides the rest (scales, formats, layout, colours) from the semantic types.

## What you produce (and what you do NOT)

Your output is the **spec**: the `chart_spec` and `semantic_types` of a
`ChartAssemblyInput`. You reference data columns **by name**. The host
passes the resulting input to `assembleVegaLite`, `assembleECharts`,
or `assembleChartjs` to get a backend spec.

**You write the input spec, not the output spec.** And critically:

- **DO** emit `chart_spec` (chart type, channel→field mapping, properties)
  and `semantic_types` (field → semantic type).
- **DO** add `interaction_spec` or `updates` only for a reason (see
  "Interactions and updates").
- **Reference columns by name.** How `data` itself gets bound depends on
  the situation — a URL, a host-side variable, or embedded rows (see "How
  data gets bound"). Embedding is fine for small tables; just don't
  re-serialize a *large* dataset by hand, since that risks truncation and
  silent value corruption and wastes tokens.
- **Transform data before Flint.** If the requested chart needs aggregation,
  filtering, joins, pivots, derived columns, or long/wide reshaping beyond
  Flint's built-in static-series fold, use a coding, notebook, SQL, or data tool
  first. Then author the Flint spec against the transformed table.
- **Style after Flint, only when needed** (see "Post-Flint style
  customization"). Notes, shaded regions, emphasis and reference lines are
  Flint `updates`, not style edits.

## On the Flint MCP server

- **Show it.** When the user asks to see a chart, pass the whole spec to
  `show({ "chart": … })`: a live card with an editing panel. There is no
  need to validate first: `show` checks the spec, and one with errors draws
  nothing and returns them, so fix and call `show` again. What it notes
  (warnings, update ops that will not apply) is drawn with; change nothing
  now unless the user asks, and fix it the next time the spec changes.
  `validate_chart` gives the same report without a card, for a host with no
  card UI.
- **The lightest view that answers.** One question is one chart. An open
  question ("how did X do", "what does this data say", "tell me something
  interesting") gets the one chart that answers it best, or two side by side
  only when it has two halves; name in your reply what else you could show,
  and draw it when the user asks. One view split by a category (a panel per
  region, same measure) is still one chart: put the category on `column` or
  `row`. A board is for when the user asks for one (a dashboard, an overview,
  KPI tiles, linked views, or several charts named in one turn): load the
  `flint-board-author` skill (`get_flint_skill` with `board`).
- **Nothing is kept.** The spec in the conversation is the chart. To change
  it, change the spec and call `show` again: a new card opens and earlier ones
  stay. A card's context gives the `chart_spec` with the reader's panel edits;
  pass it on unless the user asked for something else.
- **Numbers.** `view: "table"` on `show` opens the card on the rows the chart
  draws. Records with no chart are `chartType: "Table"`.
- **Other tools.** `render_chart` (PNG/SVG) only when the host has no app UI or
  the user wants a static image; `compile_chart` for backend JSON.
- **Code.** Adding Flint to an app, a notebook or a script is the
  `flint-app-author` skill.

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
- **Units.** `Percentage` accepts either a fraction (0–1) or a percent (0–100):
  Flint reads which from the values and formats both as `%`. Don't rescale a
  column for Flint, and don't scale it twice.
- **One real entity.** If your breakdown column has a single distinct value, the
  per-group chart collapses to one mark — the intended breakdown is likely a
  different column.

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
  - Parse CSV with a real parser (`d3.csvParse`, Papa Parse, `pandas`), never
    `line.split(',')`: quoted values such as `"Korea, Rep."` shift every later
    column, and a shifted measure silently changes the chart (a wrong domain,
    an unwanted log scale).
  - Keep values as the data has them and let `semantic_types` read them: a
    number column `year` typed `Year`, and a `YearMonth` column as `202501`,
    `"202501"` or `"2025-01"`, are labelled as years and months; don't convert
    them to date strings first.

For spec-only answers, return the `semantic_types` and `chart_spec` pieces and
state how the host should bind data. In the worked examples below, `data` is
shown as `{ values: [] }` to signal "host binds this" — focus on `chart_spec`
and `semantic_types`.

## Choose the chart type

`list_chart_types` lists every chart type with its channels and a one-line
note on what it is for. Pick the type that answers the question, then call
`list_chart_types` with that `chartType` before writing its encodings: it
returns the type's guidance (what a map's `id` accepts, which bar chart takes
a second category, a waterfall's Type column), its `chartProperties` with
values and defaults, and the interaction presets it supports. Use names
exactly as listed. Vega-Lite draws every type; the other backends draw a
subset.

Without the tool, these are the Vega-Lite types and their channels; each
type's properties and guidance are in the chart reference,
https://microsoft.github.io/flint-chart/#/documentation/reference-vegalite:

```
"Area Chart": x, y, color, opacity, column, row
"Bar Chart": x, y, color, detail, opacity, column, row
"Bar Table": y, x, color, column, row
"Boxplot": x, y, color, opacity, column, row
"Bullet Chart": y, x, goal, color, column, row
"Bump Chart": x, y, color, detail, column, row
"Calendar Heatmap": x, color
"Candlestick Chart": x, open, high, low, close, column, row
"Choropleth": id, color, detail, text
"Connected Scatter Plot": x, y, order, color, detail, column, row
"Density Plot": x, color, column, row
"Donut Chart": size, color, column, row
"ECDF Plot": x, color, detail, column, row
"Gantt Chart": y, x, x2, color, detail, column, row
"Grouped Bar Chart": x, y, group, color, detail, column, row
"Heatmap": x, y, color, column, row
"Histogram": x, color, column, row
"KPI Card": metric, value, goal
"Line Chart": x, y, color, strokeDash, detail, opacity, column, row
"Lollipop Chart": x, y, color, column, row
"Map": longitude, latitude, color, size, shape, opacity, order, detail, strokeWidth, text
"Marginal Plot": x, y, color, size, shape, opacity
"Pie Chart": size, color, column, row
"Pyramid Chart": x, y, color
"Radar Chart": x, y, color, column, row
"Range Area Chart": x, y, y2, color, column, row
"Ranged Dot Plot": x, y, color
"Regression": x, y, size, color, column, row
"Ridgeline Plot": x, y, color
"Rose Chart": x, y, color, column, row
"Scatter Plot": x, y, color, size, shape, detail, opacity, column, row
"Slope Chart": x, y, color, detail, column, row
"Sparkline": x, y, color, detail, row, column
"Stacked Bar Chart": x, y, color, detail, column, row
"Streamgraph": x, y, color, column, row
"Strip Plot": x, y, color, size, column, row
"Table": none (`encodings: {}`)
"Violin Plot": x, y, color, row
"Waterfall Chart": x, y, color, column, row
```

## Map fields to channels

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
| `aggregate` | `count`, `sum`, `average`, `mean` | Force an aggregation on a measure channel. A heatmap that gets several rows per cell aggregates its colour on its own (sum for additive types such as `Quantity` or `Profit`, average otherwise) and warns; set `aggregate` to choose |
| `sortOrder` | `ascending`, `descending` | Sort direction; in Vega-Lite, direction alone preserves/reverses the semantic sequence |
| `sortBy` | mapped `"x"`, `"y"`, `"color"`; Vega-Lite also accepts a data field or JSON-array string | Explicit category ordering; see the Vega-Lite contract below |
| `scheme` | Vega scheme name (e.g. `viridis`, `redblue`), or a list of stops low end first (`["#c0392b", "#f2f2f2", "#2e75b6"]`) | Color scheme for the `color` channel; wins over the theme's ramp |
| `reverse` | `true` / `false` | `color` only: run the color scale the other way round |
| `mid` | number | `color` only: where a diverging scale pivots, for this chart (the field's `divergingMidpoint`) |
| `domain` | `[low, high]` | `color` only: the measure extent the ramp spans, in place of the data's |
| `bins` | integer ≥ 2, or `0` | `color` only: quantize a continuous measure into that many steps; `0` keeps the ramp continuous |
| `colors` | `{ value: color }` | `color` only: colors bound to category values, for this chart (the field's `colors`) |
| `title` | a string, or `null` | The name the channel's axis or key prints in place of the field's; `null` prints none |

You usually don't need `type`, `aggregate`, or `sortOrder` — they're
inferred from the semantic type. Set them only with specific intent.

**Vega-Lite sorting.** Omit sorting for canonical Month/Day/Quarter order.
`sortOrder` alone follows that semantic sequence (descending reverses it),
not alphabetical month names. Without a semantic sequence, direction alone
uses the field's native value order.

- `sortBy: "month_number"` sorts by that existing data field, ascending by
  default. Multiple rows per category use the minimum sort-field value.
- `sortBy: "y"` sorts by the mapped channel; cross-channel sorts default to
  descending, while self-channel sorts default to ascending. `x`, `y`, and
  `color` are reserved channel names and must be mapped.
- `sortBy: "[\"Mar\",\"Jan\",\"Feb\"]"` supplies an explicit category order;
  `sortOrder: "descending"` reverses it. Use a JSON-array **string**, not an array
  or a Vega-Lite sort object. Members must be strings, numbers, or booleans.
- For explicit lexical ordering of month labels, sort by the category field
  itself: `{ "field": "month", "sortBy": "month", "sortOrder": "ascending" }`.

Unknown fields, unmapped channels, invalid directions, and malformed sort
arrays are errors, not fallback orders. Raw field-name sorting is currently
supported by the Vega-Lite backend; for other backends use their supported
channel-sort controls. Validate inputs against the selected backend.

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

## Semantic types

**This matters most.** Semantic types drive all downstream
decisions — formatting, zero baseline, color scheme, scale direction, and
more. Pick the most specific type for each field. Full registered set:

| Family | Semantic types |
|---|---|
| Temporal (point) | `DateTime`, `Date`, `Time`, `Timestamp` |
| Temporal (granule) | `Year`, `Quarter`, `Month`, `Week`, `Day`, `Hour`, `YearMonth`, `YearQuarter`, `YearWeek`, `Decade` |
| Temporal (span) | `Duration` |
| Measure (amount) | `Amount`, `Price`, `Quantity`, `Count` |
| Measure (generic) | `Number` — a measure whose values should not be added up (or whose additivity is unknown); use `Count`, `Amount`, `Quantity` or `Profit` for totals |
| Measure (proportion) | `Percentage` |
| Measure (signed/diverging) | `Profit`, `PercentageChange`, `Sentiment`, `Correlation` |
| Measure (physical) | `Temperature` |
| Discrete / rank | `Rank`, `Score`, `ID` |
| Geographic (coord) | `Latitude`, `Longitude` |
| Geographic (place) | `Country`, `State`, `City`, `Region`, `Address`, `ZipCode` |
| Categorical | `Category`, `Name`, `Status`, `Boolean`, `Direction`, `Range` |
| Fallback | `Unknown` |

A temporal type also tells Flint how to read the values: a `YearMonth` accepts `202501`, `2025-01`, `2025/1`, `01/2025`, `2025M01`, `Jan 2025`, `2025-Jul`, `July-2025` or `Jul '25`; a `Date` accepts `20250115`, `2025/01/15`, `Jan 15, 2025` or `15-Jan-2025`. Pass the values as they are; an untyped field is never reinterpreted.

What choosing well gets you (automatically):

- `Price` / `Amount` → currency formatting, zero baseline, sequential color
- `Temperature` → diverging color scheme, no forced zero baseline
- `Correlation` → fixed `[-1, 1]` diverging domain
- `Rank` → reversed axis (1 on top), discrete color
- `Date` / `DateTime` → temporal axis with auto-granularity formatting
- `Percentage` → percent formatting, 0–100 domain awareness

If you don't know, use `Quantity` for numbers that add up to a total and
`Number` for ones that don't, `Category` for strings,
`Date`/`DateTime` for date-shaped values. Do **not** invent type names.

### Saying more than the type name

A field's entry can be an object instead of a string when the type alone
understates what you know:

```json
"semantic_types": {
  "anomaly": { "semanticType": "Quantity", "unit": "°C", "divergingMidpoint": 0 },
  "rating":  { "semanticType": "Score", "intrinsicDomain": [1, 5] }
}
```

- `unit` — an optional assertion that authorizes Flint to display a unit. Add
  it only when the data or surrounding context establishes the measurement
  and seeing it materially changes how a reader interprets the number. A type
  such as `Duration`, a field name such as `life_expectancy`, or values that
  merely look plausible are not enough evidence by themselves.
  - Prefer canonical codes: `"USD"`, `"°C"`, `"kg"`, `"km/h"`, `"min"`.
  - Conventional compact units are normalized and may appear beside values
    (`USD` → `$`, `hours` → `hr`).
  - Lexical units such as `"years"` are stated once beside the field name as
    `field (years)`, not repeated after every value.
  - Do not put explanatory phrases in `unit`. Put qualifications such as
    `"per working-age resident"` or `"constant 2024 prices"` in the subtitle.
  - Omit `unit` when its meaning, scale, or denominator is uncertain. Flint
    does not infer a visible unit from the semantic type or field name.
- `intrinsicDomain` — the field's own bounds, for bounded scales only: `[1, 5]`
  for a five-star rating, `[0, 100]` for a percentage score. Not for
  open-ended measures.
- `percentScale` — `"fraction"` or `"percent"`: how a `Percentage` or
  `PercentageChange` field is stored (0.45 or 45 for 45%). Set it when you know;
  otherwise Flint guesses from the values, which misreads fractions mostly past
  1 (growth of 2.4 meaning 240%).
- `divergingMidpoint` — where the middle colour of a diverging scale sits.
  Set it if you can tell what the reader is comparing against; leave it out if
  you can't.
- `divergingNeutral` — for a colour stepped into classes, how far either side
  of the midpoint still reads as neither side: `0.1` makes correlations within
  ±0.1 one neutral class; `false` makes the midpoint a break, so a small gain
  never looks like a small loss. Leave it out and the type decides
  (`Correlation`, `Sentiment`: a neutral class; `Profit`, `PercentageChange`:
  a break).
- `sortOrder` — the order the categories should appear in, when the order in
  the data is not the one you want and it isn't alphabetical either:
  `["Low", "Medium", "High"]`. For a handful of categories, not a long list.
- `colors` — colours that belong to particular values, when the data has a
  convention the reader expects: `{ "DFL": "#0793AB", "Republican": "#A1000F" }`.
  Matched on the value (case-insensitive); values left out take the palette,
  which then skips these colours. Only for real conventions (parties, brands,
  asset classes), not to restyle a chart — the theme owns the palette.
- `polarity` — `"higher-is-better"` or `"lower-is-better"`: which end of a
  diverging colour is the alarming one. Signed measures (`Profit`,
  `PercentageChange`) read as higher-is-better on their own; set
  `"lower-is-better"` for costs, errors, churn or delays, so their highs, not
  their lows, take the warm end, under any theme.

## Write a headline

Set `chart_spec.title` to the finding, in a sentence, and `chart_spec.subtitle`
to the reading of it — what is measured, of whom, when, in what units:

```
title:    "A pyramid that is no longer a pyramid"
subtitle: "United States population by age and sex, 2020, millions"
```

Add `chart_spec.label` only when the chart sits in a numbered sequence or
under a section name: `label: "Figure 2"`. It is drawn above the headline in
the theme's kicker style.

`chart_spec.source` is optional. Add it only when the user names the source or
asks for a source line, or the data itself states where it comes from:
`source: "UN World Population Prospects 2024"` (or `{ text, href }` to link
it). Never invent or guess one. The theme decides how it reads ("Source:",
side, rule, credit); a chart without one draws no footer.

`chart_spec.chrome` is the house decoration the theme draws around the chart:
header rules, tabs, wordmarks, logos, the footer rule and the house credit. It is
not the chart's own title, label or source. The theme draws it by default; leave
`chrome` out unless the user asks to drop it: `chrome: false`
drops all of it; `chrome: { logos: false }` (or `header`, `footer: false`) drops
one part. Without logos a credit keeps its words.

`Jan`, `Cairo`, `Chrome` name their own kind; `26`, `5,300`, `0.42` do not, and
the headline is where they get named. Leave it out only where the chart is not
read on its own — a sparkline in a cell, a tile under its own caption. Nothing
breaks: with no headline to lean on, the compiler keeps the axis titles instead.

## Write the spec

One `ChartAssemblyInput`, with the data bound as in "How data gets bound" and
a headline as in "Write a headline":

```json
{
  "data": { "url": "sales.csv" },
  "semantic_types": { "month": "YearMonth", "revenue": "Amount", "region": "Region" },
  "chart_spec": {
    "chartType": "Line Chart",
    "title": "Europe climbed every month after the April dip",
    "subtitle": "Revenue by region, $m",
    "encodings": { "x": { "field": "month" }, "y": { "field": "revenue" }, "color": { "field": "region" } }
  }
}
```

The full shape:

```ts
interface ChartAssemblyInput {
  // Bound by the HOST or by you, as in "How data gets bound".
  data: { values: any[] } | { url: string };
  semantic_types?: Record<string, string | SemanticAnnotation>;  // field → type ( ← you write this)
  chart_spec: {                               //                        ← you write this
    chartType: string;                        // e.g. "Scatter Plot"
    title?: string;                           // the headline — write one
    subtitle?: string;                        // what is measured, of whom, when, in what units
    label?: string;                           // a figure number or kicker, above the headline
    source?: string | { text: string; href?: string }; // only when known; never invented
    chrome?: false | { header?: false; footer?: false; logos?: false }; // drop the house's decoration
    encodings: Record<string, EncodingValue>; // channel → { field, ... } (or array)
    baseSize?: { width: number; height: number };    // target layout size, default 400×320
    canvasSize?: { width: number; height: number };  // optional hard ceiling on stretch
    chartProperties?: Record<string, any>;    // per-chart tuning (optional)
  };
  options?: Record<string, any>;              // global layout options (rarely needed)
  field_display_names?: Record<string, string>; // field → readable axis/legend title
  theme_spec?: string | { extends: string; [key: string]: any }; // preset or preset override (Vega-Lite, Plotly)
  interaction_spec?: { interactions: { type: string; id?: string; options?: Record<string, any> }[] }; // behaviour (interaction skill)
  updates?: { id: string; ops: any[] }[];     // the agent's marks on the chart (interaction skill)
}
```

Set `chartProperties` only when the user asks for that behaviour; defaults
are sensible. Global layout `options` are rarely needed.

## Interactions and updates

A mounted chart already shows a tooltip and lets a legend click dim a group.
Add more only for a reason:

- `interaction_spec` (behaviour): the user asks for a gesture or describes
  what the chart should do, the chart is linked to others on a board, or the
  data has more detail than the chart can show at its size.
- `updates` (marks the agent leaves: a note, emphasis, a shaded range, a
  reference line): the user asks for marks on the chart, asks about a chart
  on screen, or asks a concrete question the chart can point at lightly.

Otherwise the chart stays clean and your reply carries the answer. Both are
the `flint-interaction-author` skill (`get_flint_skill` with `interaction`).

## Visual themes (`theme_spec`)

Add `theme_spec` only when the user names a look, a house or a brand; without
one the chart draws in the host's style. Pick a preset id from `list_themes`
(`list_themes` with an `id` gives that house's authoring advice) and place it
beside `chart_spec`: `"theme_spec": "economist"`. For a brand adjustment,
extend a preset with only what changes:
`{ "extends": "economist", "id": "our-brand", "ink": { "series": { "single": "#6b3fa0" } } }`.
Do not copy a whole preset or invent theme keys; a new or substantially
customised theme is the `flint-theme-author` skill. ThemeSpec applies to
Vega-Lite and Plotly.

## Parameter overrides — when to reach for them

Overrides exist, but prefer letting semantic types drive decisions. Reach
for an override only when the user's intent genuinely conflicts with the
default:

- **Force an aggregation:** `encodings.y = { field: "sales", aggregate: "sum" }`.
- **Sort a category axis by its measure:** `encodings.x = { field: "name", sortBy: "y", sortOrder: "descending" }`.
- **Pick a color scheme:** `encodings.color = { field: "region", scheme: "tableau10" }`.
- **Control a color ramp when the user asks for it:** `encodings.color = { field: "net", scheme: ["#c0392b", "#f2f2f2", "#2e75b6"], mid: 0, bins: 5 }`; add `reverse: true` to flip it or `domain: [-50000, 50000]` to fix its extent. These win over the theme.
- **Override an inferred type:** `encodings.x = { field: "year", type: "ordinal" }` (e.g. treat a year as discrete bands).
- **Use readable field titles:** `field_display_names = { percentageOfCountries: "Percentage of countries" }`.
  Keep encodings bound to the real column name; Flint uses the display name for axis titles and legend headers.
- **Resize the chart:** set `baseSize` to suit where the chart is shown when
  you know it (a wide panel or page, a narrow side bar, a size the user asked
  for); otherwise leave it out and the MCP card starts at 300×300. The card
  lets a dense chart grow up to 1.5× and always fits it to the host's width.
  Flint sizes from two numbers — `baseSize` (the *target*
  it aims for, default 400×320) and `canvasSize` (a *hard ceiling* it may never
  exceed). With dense data the chart stretches from base toward the ceiling.
  - Want a comfortable size that may grow for dense data → set `chart_spec.baseSize = { width, height }`.
  - Want a fixed slot it must fit inside → set `chart_spec.canvasSize = { width, height }` alone; the chart fills it and shrinks to fit (a host narrower than the slot lays the chart out again for the room it has).
  - Both → aims for `baseSize`, grows toward `canvasSize`, never beyond.
- **Force log / zero baseline:** the `logScale_*` / `includeZero_*` chart
  properties (`list_chart_types` with a `chartType` lists them).

Global layout tuning lives in the top-level `options` object (e.g.
`addTooltips`, band padding, facet sizing). It is rarely needed for
authoring — omit it unless asked.

## Post-Flint style customization

Stay at the Flint level for structure (data, chart type, channels, transforms,
sizing, properties) — Flint specs stay portable and regenerate safely. Drop to
backend JSON only after a valid Flint chart exists, and only for a narrow
presentation change Flint does not expose (exact axis/legend/mark styling,
layout polish). Titles are `chart_spec.title`; notes, regions and reference
lines are `updates`. Never use it to change the
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
    }
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

### Donut chart, value on `size`

User: "Show market share by vendor as a donut."

Pie and Donut map the slice value to `size` (rendered as angle) and the
category to `color`. Data is already long (one row per vendor).
`innerRadius` sizes the hole (a Pie with `innerRadius` is a donut too).

```json
{
  "data": { "values": [] },
  "semantic_types": {
    "vendor": "Category",
    "share": "Percentage"
  },
  "chart_spec": {
    "chartType": "Donut Chart",
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
  derives these. Users fine-tune the *output* spec. The exception is a colour
  mapping the user asked for (a brand ramp, fixed bins, a pivot): use the
  `color` encoding's `scheme`, `reverse`, `mid`, `domain`, `bins` and `colors`.
- **Don't invent semantic type names.** If none fit, use the family
  default (`Quantity`, `Category`, `Date`).
- **Don't read the library's source** to find channels or properties:
  `list_chart_types` lists them.

## Validation checklist

Before returning, verify:

1. `chartType` is an exact registered name supported by the target backend.
2. Every `field` referenced in `encodings` is a real column name.
3. Every encoded field has an entry in `semantic_types` (specific type).
4. Required channels for the chart type are present (e.g. Bullet→`goal`,
   Candlestick→`open/high/low/close`, Pie→`size`+`color`).
5. Any `chartProperties` keys are ones `list_chart_types` lists for the type.
6. You did **not** inline large data or hand-tune derived styling.
7. The data carries no embedded total/subtotal level (e.g. an `all` / `total`
   row) mixed with its components on a stacked, grouped, or colored channel.

## Copilot CLI chart canvas

When this plugin's native **Flint Chart Canvas** is available, prefer it over `validate_chart` and `show`. Validate the complete `ChartAssemblyInput` first, then open the canvas with that input, including any theme, options, and `interaction_spec`. Pass resolved inline `data.values`, not a local `data.url`: the canvas cannot read local data files. The canvas owns interactive chart customization; do not recreate that UI or replace it with a browser page.
