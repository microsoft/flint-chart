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
  assemblePlotly,
  assembleExcel,
} from 'flint-chart';

const vlSpec  = assembleVegaLite(input);
const ecSpec  = assembleECharts(input);
const cjsSpec = assembleChartjs(input);
const plFig   = assemblePlotly(input);
const xlSpec  = assembleExcel(input);
```

| Export | Returns |
|--------|---------|
| `assembleVegaLite` | Vega-Lite JSON spec |
| `assembleECharts` | ECharts `option` object |
| `assembleChartjs` | Chart.js configuration |
| `assemblePlotly` | Plotly.js `{ data, layout }` figure |
| `assembleExcel` | Native Excel chart artifact for Office.js |

If a backend does not support a `chartType`, the assembler throws before render. Check support with `vlGetTemplateDef`, `ecGetTemplateDef`, `cjsGetTemplateDef`, `plGetTemplateDef`, or `excelGetTemplateDef`.

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
    encodings: Record<string, ChartEncoding | string>;  // string = field shorthand
    baseSize?: { width: number; height: number };      // target layout size, default 400×320
    canvasSize?: { width: number; height: number };    // optional hard ceiling on stretch
    chartProperties?: Record<string, unknown>;
  };
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

### `chart_spec`

| Field | Description |
|-------|-------------|
| `chartType` | Template name — must match a backend registry entry (`"Bar Chart"`, `"Heatmap"`, …) |
| `encodings` | Channel → encoding map |
| `baseSize` | **Target** layout size in pixels (default 400×320): the size the chart aims for with typical data. Dense data may stretch past it, up to the ceiling. |
| `canvasSize` | **Hard ceiling:** the maximum size the chart may ever reach, including faceted grids. If omitted, the ceiling is `baseSize × options.maxStretch` (default 1.5×). Per-dimension caps are `βx = canvasSize.width / baseSize.width`, `βy = canvasSize.height / baseSize.height` (each ≥ 1). The base is clamped to the ceiling, so a `canvasSize` on its own acts as a fixed box the chart fills and shrinks to fit without overflowing. |
| `chartProperties` | Template-specific toggles (e.g. `orient`, `opacity`) |

> **base vs. canvas, in one line:** `baseSize` is what the chart *aims for*;
> `canvasSize` is what it *may never exceed*. Use `canvasSize` for a fixed slot,
> and `baseSize` for a comfortable target that may grow for dense data. See the
> [Example: Auto Layout](/documentation/chart-sizing).

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
}
```

Explicit `type` overrides semantic inference. Setting `aggregate` asks Flint to
collapse the rows itself — grouping by the other (non-aggregated) field channels
and producing a derived column named `${field}_${aggregate}` (`count` →
`_count`). `average` and `mean` are synonyms. Most callers should still
aggregate their data upstream; if you do, omit `aggregate` and reference the
derived column by name.

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
  minStep?: number;            // min px per discrete item (default 6)
  minSubplotSize?: number;     // min facet subplot px (default 60)
  maxColorValues?: number;     // color cardinality before truncation (default 24)
  stepPadding?: number;        // band inner padding fraction (default 0.1)
  defaultBandSize?: number;    // baseline px per category (backend-tuned)
  maxBandSize?: number;        // max px per category when sparse (backend-tuned)
  baseLabelFontSize?: number;  // axis tick font at the reference canvas (VL 10, EC/CJS/Plotly 12)
  baseTitleFontSize?: number;  // header font — axis title / legend / chart title (VL 11, EC/CJS 12, Plotly 14)
}
```

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
| `flint-chart/test-data` | Gallery generators (`TEST_GENERATORS`) |

---

# §10 Related

- [Overview](/documentation/overview) — dataSpec + chartSpec motivation
- [Architecture](/documentation/architecture) — three-stage pipeline
- [Semantic Type](/documentation/semantic-types) — type hierarchy and resolution
- [Getting started](/documentation/getting-started) — hands-on walkthrough
- [Extending backends](/documentation/adding-a-backend) — new `assemble*()` target
