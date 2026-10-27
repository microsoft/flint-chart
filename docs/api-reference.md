# API reference

JavaScript / TypeScript package: **`flint-chart`** (`packages/flint-js`).

Python port: **`packages/flint-py`** is a source preview. Its input shape
mirrors the JS API, but PyPI publishing is planned for a later release.

Conceptual background: [Overview](/documentation/overview) · Pipeline: [Architecture](/documentation/architecture)

---

## Table of Contents

- [§1 Flint spec mapping](#1-flint-spec-mapping)
- [§2 Assemblers](#2-assemblers)
- [§3 ChartAssemblyInput](#3-chartassemblyinput)
- [§4 Encodings and options](#4-encodings-and-options)
- [§5 Complete example](#5-complete-example)
- [§6 Template discovery](#6-template-discovery)
- [§7 Core utilities](#7-core-utilities)
- [§8 Overflow and warnings](#8-overflow-and-warnings)
- [§9 Subpath exports](#9-subpath-exports)
- [§10 Related](#10-related)

---

# §1 Flint spec mapping

| Flint | API field | Contents |
|---------------|-----------|----------|
| Raw table | `data` | `{ values: rows[] }` or `{ url: "..." }` |
| **dataSpec** | `semantic_types` | `field → string` or `field → SemanticAnnotation` |
| **chartSpec** | `chart_spec` | `chartType`, `encodings`, `canvasSize`, `chartProperties` |

Author `semantic_types` once per dataset and reuse it across charts. During most exploration, `chart_spec` is the only part that changes.

### SemanticAnnotation (inline in `semantic_types`)

```ts
interface SemanticAnnotation {
  semanticType: string;
  intrinsicDomain?: [number, number];  // e.g. Rating [1, 5]
  unit?: string;                        // e.g. USD, °C
  sortOrder?: string[];                 // custom ordinal order
  colors?: Record<string, string>;      // colours bound to values, e.g. { DFL: "#0793AB" }
}
```

Bare string shorthand: `"Price"` is equivalent to `{ semanticType: "Price" }`.

---

# §2 Assemblers

All backends accept the same `ChartAssemblyInput` and return a render-ready object.

```ts
import {
  assembleVegaLite,
  assembleECharts,
  assembleChartjs,
  assembleHighcharts,
  assemblePlotly,
  assembleExcel,
} from 'flint-chart';

const vlSpec  = assembleVegaLite(input);
const ecSpec  = assembleECharts(input);
const cjsSpec = assembleChartjs(input);
const hcSpec  = assembleHighcharts(input);
const plFig   = assemblePlotly(input);
const xlSpec  = assembleExcel(input);
```

| Export | Returns |
|--------|---------|
| `assembleVegaLite` | Vega-Lite JSON spec |
| `assembleECharts` | ECharts `option` object |
| `assembleChartjs` | Chart.js configuration |
| `assembleHighcharts` | Highcharts `option` object |
| `assemblePlotly` | Plotly.js `{ data, layout }` figure |
| `assembleExcel` | Native Excel chart artifact for Office.js |

If a backend does not support a `chartType`, the assembler throws before render. Check support with `vlGetTemplateDef`, `ecGetTemplateDef`, `cjsGetTemplateDef`, `hcGetTemplateDef`, `plGetTemplateDef`, or `excelGetTemplateDef`.

## Excel runtime and code generation

`assembleExcel` returns a serializable `flint.excel.chart/v1` artifact. Render it
inside an Office.js Excel host, or turn it into standalone Office.js source:

```ts
import { assembleExcel, generateOfficeJs, renderExcelChart } from 'flint-chart';

const artifact = assembleExcel(input);
const { pngBase64, inspection } = await renderExcelChart(Excel, artifact, {
  scale: 3,
  cleanWorksheet: true,
  inspectNativeChart: false,
});
const { code, meta } = generateOfficeJs(artifact, {
  scale: 3,
  cleanWorksheet: true,
  functionName: 'renderFlintChart',
});
```

`renderExcelChart` requires an Excel API object with `run` and
`ImageFittingMode.fit`. It creates the native chart on the active worksheet and
returns a PNG capture plus optional inspection data. `generateOfficeJs` does not
execute Excel; it returns portable source and metadata about the generated data
range and chart.

---

# §3 ChartAssemblyInput

```ts
interface ChartAssemblyInput {
  data: { values: Record<string, unknown>[] } | { url: string };
  semantic_types?: Record<string, string | SemanticAnnotation>;
  chart_spec: {
    chartType: string;
    title?: string;                                    // headline
    subtitle?: string;                                 // deck: what is measured, of whom, when, in what units
    label?: string;                                    // a figure label or kicker above the headline ("Figure 2")
    source?: string | { text: string; href?: string };  // optional: where the data comes from, drawn as the source line
    encodings: Record<string, ChartEncoding | string>;  // string = field shorthand
    baseSize?: { width: number; height: number };      // target layout size, default 400×320
    canvasSize?: { width: number; height: number };    // optional hard ceiling on stretch
    chartProperties?: Record<string, unknown>;
  };
  theme_spec?: ThemeSpec | string;                     // presentation, Vega-Lite only
  interaction_spec?: InteractionSpec;                  // behaviour, Vega-Lite interactive surface only
  options?: AssembleOptions;
  field_display_names?: Record<string, string>;
}
```

### `data`

| Form | Description |
|------|-------------|
| `{ values: rows[] }` | Inline row objects (editor and tutorials) |
| `{ url: "..." }` | Remote JSON or CSV URL |

### `semantic_types`

Maps column name → semantic type. This drives encoding type, formatting, aggregation defaults, color class, and layout. See [Semantic Type](/documentation/semantic-types).

### `field_display_names`

Maps raw column names to readable presentation labels used for axis titles and
legend headers. Keep encodings bound to the original field names:

```ts
{
  field_display_names: {
    percentageOfCountries: 'Percentage of countries'
  },
  chart_spec: {
    chartType: 'Bar Chart',
    encodings: { x: 'country', y: 'percentageOfCountries' }
  }
}
```

### `interaction_spec`

How the chart behaves. Lists interaction presets by `type`, each with its own
`options`, plus the surface policies `assistedTargeting` and `keyboardTargeting`:

```ts
interface InteractionSpec {
  interactions: { type: InteractionPresetType; id?: string; options?: Record<string, any> }[];
  assistedTargeting?: boolean | AssistedTargetingOptions;
  keyboardTargeting?: boolean;
}
```

`mountChart()` (alias `buildInteractiveChart()`) and `<FlintChart>` read it; the assemblers ignore it. An entry the chart type
cannot honour is dropped with an `unsupported_interaction` warning, and `validateChart`
reports the same warnings before anything renders. `supportedInteractionPresets(def.interactionSupport)`
lists the presets a template supports by declaration. See [Using interactions](/documentation/interaction-spec).

### `chart_spec`

| Field | Description |
|-------|-------------|
| `chartType` | Template name — must match a backend registry entry (`"Bar Chart"`, `"Heatmap"`, …) |
| `title` | The chart headline. Themes that prefer omitting axis titles append required measure names and declared units to the subtitle instead. The compiler does not interpret headline or subtitle prose to infer whether an axis title is redundant. |
| `subtitle` | The deck — what is measured, of whom, when, in what units. |
| `label` | A short line above the headline: a figure label (“Figure 2”) or a kicker, set in the theme's `type.kicker`. |
| `source` | Optional. Where the data comes from (“UN World Population Prospects 2024”, or `{ text, href }` to link it), drawn at the foot as the theme's `source` says: “Source: …” in `type.footnote` by default. Give it only when the source is known; a chart without one draws no footer. |
| `chrome` | Optional. Leave it out to draw what the theme specifies. `false` drops the theme's header pieces, footer and logos; `{ header?, footer?, logos? }` with `false` drops one kind: `header` is the furniture around the title, `footer` the footer rule and source credit, `logos` every image piece and a credit's image (the credit keeps its words). The chart's own `label` and `source` text are not affected. |
| `encodings` | Channel → encoding map |
| `baseSize` | **Target** layout size in pixels (default 400×320): the size the chart aims for with typical data. Dense data may stretch past it, up to the ceiling. |
| `canvasSize` | **Hard ceiling:** the maximum size the chart may ever reach, including faceted grids. If omitted, the ceiling is `baseSize × options.maxStretch` (default 1.5×). Per-dimension caps are `βx = canvasSize.width / baseSize.width`, `βy = canvasSize.height / baseSize.height` (each ≥ 1). The base is clamped to the ceiling, so a `canvasSize` on its own acts as a fixed box the chart fills and shrinks to fit without overflowing. |
| `chartProperties` | Template-specific toggles (e.g. `orient`, `opacity`), and cross-cutting ones such as `labelOverflow` — the path x category names that do not fit their band take (default `["wrap", "rotate90"]`; on a run of times, dates, years or ranks `["wrap", "skip", "rotate90"]`, where `skip` prints only round values; any step may trim) |

> **base vs. canvas, in one line:** `baseSize` is what the chart *aims for*;
> `canvasSize` is what it *may never exceed*. Use `canvasSize` for a fixed slot,
> and `baseSize` for a comfortable target that may grow for dense data. See the
> [Example: Auto Layout](/playgrounds/auto-layout).

---

# §4 Encodings and options

### ChartEncoding

```ts
interface ChartEncoding {
  field?: string;
  type?: 'quantitative' | 'nominal' | 'ordinal' | 'temporal';
  aggregate?: 'count' | 'sum' | 'average' | 'mean';
  sortOrder?: 'ascending' | 'descending';
  sortBy?: string;
  scheme?: string;
  title?: string | null;
}
```

Explicit `type` overrides semantic inference. Setting `aggregate` asks Flint to
collapse the rows itself — grouping by the other (non-aggregated) field channels
and producing a derived column named `${field}_${aggregate}` (`count` →
`_count`). `average` and `mean` are synonyms. Most callers should still
aggregate their data upstream; if you do, omit `aggregate` and reference the
derived column by name.

`title` is the name the channel's axis or key prints in place of the field's;
`null` prints none. A theme still decides whether a key is titled at all: a
name given here renames it where it is.

For **Vega-Lite**, `sortBy` accepts a mapped `x`, `y`, or `color` channel, an
existing data-field name, or a JSON-encoded category-order array string.
Field-name sorts default to ascending and use the minimum field value per
category when several rows share a category. Self-channel sorts default to
ascending; cross-channel sorts default to descending. Explicit arrays preserve
their order unless `sortOrder: 'descending'` reverses it. Channel names take
precedence over identically named data fields.

With no `sortBy`, `sortOrder` preserves or reverses a canonical semantic
sequence, such as January through December for `Month`; it does not request
lexical ordering. Without a canonical sequence it uses native value order.
To explicitly sort month labels lexically, use
`{ field: 'month', sortBy: 'month', sortOrder: 'ascending' }`.

Invalid sort targets, malformed/non-array JSON, unmapped channels, and invalid
directions are rejected by validation and Vega-Lite compilation with the
encoding path in the diagnostic. Raw field-name sorting is currently a
Vega-Lite capability; validation rejects it for other backends.

Common channels: `x`, `y`, `color`, `size`, `shape`, `column`, `row`, `group`, `detail`.

### AssembleOptions (selected)

```ts
interface AssembleOptions {
  addTooltips?: boolean;       // default false
  elasticity?: number;         // discrete stretch exponent (default 0.5)
  maxStretch?: number;         // default stretch cap when no canvasSize ceiling (default 1.5)
  maxStretchX?: number;        // per-dimension width cap (derived from canvasSize)
  maxStretchY?: number;        // per-dimension height cap (derived from canvasSize)
  facetElasticity?: number;    // facet stretch (default 0.3)
  minStep?: number;            // min px per discrete item (default 8)
  minSubplotSize?: number;     // min facet subplot px (default 60)
  maxColorValues?: number;     // color cardinality before truncation (default 24)
  stepPadding?: number;        // band inner padding fraction (default 0.1)
  defaultBandSize?: number;    // baseline px per category (backend-tuned)
  maxBandSize?: number;        // max px per category when sparse (backend-tuned)
  bandBalance?: boolean;       // lean a chart sized by its bands back into its base's own shapes (default true)
  targetAspect?: number;       // the centre of those shapes, width:height (default: the base's)
  aspectTolerance?: number;    // their spread either side, as a ratio (default: the stretch allowed)
  baseLabelFontSize?: number;  // axis tick font at the reference canvas (VL 10, EC/CJS/Plotly 12)
  baseTitleFontSize?: number;  // header font — axis title / legend / chart title (VL 11, EC/CJS 12, Plotly 14)
  canvasFit?: 'off' | 'auto'; // what the layout does when the chart will not read well in its box (default 'auto')
  canvasRefit?: boolean;       // once the fit settles the title and keys, lay the plot out once more in the room left (default true)
}
```

A plot with one banded axis is as long as its categories make it: four rows leave a bar chart a
strip, thirty columns a long low band. **Band balance** judges it as the reader sees it — the chart
area, the plot with the labels it cannot drop (names counted from their mean to their longest,
capped at 30% of the plot or 40 px, where they would wrap or be cut) — against the shapes a chart of
its base takes on its own: from the base with its height stretched to the base with its width
stretched (300 × 300 at ×1.5: 0.67 to 1.5; at least 1.25× either side). Inside that range it is left
alone. Past it, it leans back only to the nearer end, and only by its free sides — the value axis
lengthens (within the stretch cap) or shortens (to half its base at most), and a few bands thicken
first (to twice the house step). Where that cannot reach the range within those limits it aims for
a range half as wide again, so a chart it cannot set right is not bent as far as the limits go.
Panels are judged as one grid. The number of bands is never touched, and grids of cells are left to
their square-cell rule.

`canvasFit` is the layout's last pass. It aims for three things, judged on the plan before anything
is drawn: the drawing **fits** its box legibly (a host may shrink it a little, never below 70%); its
parts are in **balance** (the title, keys and chrome take at most 40% of its height or width, a
panel's own labels at most 40% of it); and nothing around the chart bends it badly out of its box's
**shape** — a title and a row of keys above a plot are the theme's design and are allowed for (a
quarter of the chart area's height above and below it, a third of its width beside it). A chart that
meets them as planned is never changed — except one drawn a little larger than its box (shown under
97%), which only the gentlest edits mend: keys in a row on their edge, or names wrapped, kept where they
bring it at least 3 points nearer its box with nothing going wrong.

One that does not is mended with the **least edit a reader would notice**. Each problem is put down
to the parts that cause it — too wide: the keys beside the plot; too tall: the keys stacked above or
below, and the title only where it is most of what stands there — and only their edits are tried,
one at a time before any two together: keys in one row on their edge; key names wrapped (the keys
stay), or — where the chart area itself is too wide for its box — the names down the y axis wrapped;
the title a size down (never below 13 / 11 px); one of several keys sharing an edge moved to another
(the others stay); every key to another edge; the title two sizes down.
Of the edits that clear, the one that costs the reader least is kept — each is priced on one scale,
in that order, and how the result reads only tells edits alike apart, never a larger edit over a
gentler one. Where the box cannot hold the chart legibly, the plot comes down, keeping its shape.
With the title and keys settled, the plot is laid out **once more** in the room the box leaves it, at
the scale the drawing is shown: a continuous side grows into that room — never past its stretch cap,
the chart area staying within the looser range of its own shapes, banded sides keeping their steps —
and the result is kept only where the text is no smaller, nothing new goes wrong and the drawing
reads better (`canvasRefit: false` leaves this step out). The
pass never lays a chart out larger for the host to shrink: a chart nothing mends is drawn at its own
size, for the reader to scroll or the host to scale.

Nothing is cut, no edit shrinks text past legibility — nor makes text already too small smaller still — and the chart's own shape is never changed. `'off'` lays every chart out as planned. What the pass judged and did is attached
to a Vega-Lite spec as `_canvasFit`, and reported in `_theme.report` (`canvas-fit`).

Fonts adapt to canvas size around these per-backend bases: at the default
canvas each backend renders its native size, growing subtly on larger canvases
(up to base + 4) and shrinking in small-multiple subplots; axis tick labels also
shrink/rotate/truncate to avoid overlap. Set `baseLabelFontSize` /
`baseTitleFontSize` to scale all text up or down — e.g. `baseLabelFontSize: 14`
for larger tick labels across the whole chart.

Full list: `packages/flint-js/src/core/types.ts` (`AssembleOptions`). Behavior: [Auto Layout Algorithm](/documentation/layout-model).

---

# §5 Complete example

```ts
const input: ChartAssemblyInput = {
  data: {
    values: [
      { quarter: 'Q1', revenue: 1200 },
      { quarter: 'Q2', revenue: 1450 },
      { quarter: 'Q3', revenue: 980 },
      { quarter: 'Q4', revenue: 1800 },
    ],
  },
  semantic_types: { quarter: 'Quarter', revenue: 'Price' },
  chart_spec: {
    chartType: 'Bar Chart',
    encodings: {
      x: { field: 'quarter' },
      y: { field: 'revenue' },
    },
    baseSize: { width: 480, height: 320 },
  },
};

const spec = assembleVegaLite(input);
```

---

# §6 Template discovery

```ts
import {
  vlTemplateDefs,
  vlGetTemplateDef,
  vlGetTemplateChannels,
  ecGetTemplateDef,
  cjsGetTemplateDef,
} from 'flint-chart';

Object.keys(vlTemplateDefs);
// ["Points", "Bars", "Lines & Areas", …]

vlGetTemplateChannels('Scatter Plot');
// ["x", "y", "color", "size", "opacity", "column", "row"]
```

---

# §7 Core utilities

Re-exported from `flint-chart` and `flint-chart/core`:

| Symbol | Purpose |
|--------|---------|
| `inferVisCategory` | Infer coarse vis category from raw data |
| `getVisCategory` | Look up category for a semantic type string |
| `getRegistryEntry` | Query `TypeRegistryEntry` for a type |
| `channels`, `channelGroups` | Channel metadata |

Key types: `ChartAssemblyInput`, `ChartEncoding`, `ChartTemplateDef`, `AssembleOptions`, `ChartWarning`, `ChannelSemantics`.

## Validation

Hosts that let an agent author a `ChartAssemblyInput` can validate it before
rendering. `validateChart` never throws; it reports every warning the assembler
emits plus a single `assembly_failed` error when the input cannot be compiled
(unknown chart type, unsupported channel, nonexistent field, canvas caps).
Re-exported from `flint-chart` and `flint-chart/validate`:

```ts
import { validateChart } from 'flint-chart/validate';

const result = validateChart(input, 'vegalite');
// { backend, chartType, valid, warnings, errors, computedSize? }
if (!result.valid) {
  // feed result.errors back to the agent
}
```

Pass `options.updates` (a ChartUpdate list) to check it against the chart in the
same pass. A malformed list is an `invalid_updates` error. Otherwise
`result.updates` says, op by op, what each update will do (`ok`, `text`) or why
it will not apply (`reason`); each op that will not apply is also an
`update_not_applied` warning, and `valid` stays about the spec. Backends other
than `vegalite` report the updates as ignored.

```ts
const result = validateChart(input, 'vegalite', { updates });
// result.updates: [{ id, ops: [{ op, text, ok, reason? }] }]
```

| Symbol | Purpose |
|--------|---------|
| `validateChart(input, backend, options?)` | Validate and assemble, and check `options.updates` against the chart; never throws |
| `validateChartInput(input, backend?, options?)` | Shape checks only; throws on the first problem |
| `validateSemanticTypes(semantic_types)` | `unknown_semantic_type` warnings for labels not in the type registry (also included by `validateChart`) |
| `assembleForBackend(backend, input, options?)` | Assemble and split out `_warnings` / `_width` / `_height` |
| `stripPrivateKeys(spec)` | Remove Flint's `_`-prefixed metadata from a spec |
| `VALIDATION_BACKENDS` | Runtime list of accepted backends (`vegalite`, `echarts`, `chartjs`, `highcharts`, `plotly`) |

`options.maxDataRows` (default 100,000) and `options.maxCanvasDim` (default
4000) cap input size. Inline `data.values` are required — resolve `data.url`
to rows before validating.

---

# §8 Overflow and warnings

When a discrete channel exceeds the layout budget, the compiler:

1. Computes how many items fit ([Auto Layout Algorithm §2](/documentation/layout-model#2-discrete-axis-elastic-budget-model))
2. Applies the template overflow strategy
3. Filters data to kept values
4. Attaches warnings to the result

Default strategy priority:

1. Connected marks (line, area) — keep all points
2. User-specified sort — keep top/bottom N
3. Opposite quantitative axis — sort and truncate
4. Bar + count — sum-aggregate then truncate
5. Numeric field — numeric sort, first N
6. Fallback — first N in data order

Inspect `_warnings` or `ChartWarning` arrays in integration code to surface truncation in your UI.

---

# §9 Subpath exports

| Import path | Contents |
|-------------|----------|
| `flint-chart` | Assemblers + main re-exports |
| `flint-chart/core` | Types, semantics, layout |
| `flint-chart/vegalite` | VL templates and `assembleVegaLite` |
| `flint-chart/echarts` | ECharts templates and `assembleECharts` |
| `flint-chart/chartjs` | Chart.js templates and `assembleChartjs` |
| `flint-chart/highcharts` | Highcharts templates and `assembleHighcharts` |
| `flint-chart/validate` | `validateChart` and input validation helpers |
| `flint-chart/interactive` | `mountChart`, interaction presets, update helpers |
| `flint-chart/react` | `<FlintChart>` component (React is an optional peer dependency) |
| `flint-chart/render` | `renderSvg` for static SVG without a DOM |
| `flint-chart/test-data` | Gallery generators (`TEST_GENERATORS`) |

---

# §10 Related

- [Overview](/documentation/overview) — dataSpec + chartSpec motivation
- [Architecture](/documentation/architecture) — three-stage pipeline
- [Semantic Type](/documentation/semantic-types) — type hierarchy and resolution
- [Getting started](/documentation/getting-started) — hands-on walkthrough
- [Extending backends](/documentation/adding-a-backend) — new `assemble*()` target
