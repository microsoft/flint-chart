# Exploring data with flint-chart

This tutorial continues from [Getting started](/documentation/getting-started). You
already have a bar chart of average `b` by category `a`. Now we explore how
**semantic types** and **chart type** changes propagate through the compiler —
without hand-editing axis, scale, or legend blocks.

Work in the [online editor](/editor) and keep the **Preview** tabs (Vega-Lite /
ECharts / Chart.js) open so you can see which backends support each chart.

## Starting point

```json
{
  "data": {
    "values": [
      { "a": "C", "b": 2 },
      { "a": "C", "b": 7 },
      { "a": "C", "b": 4 },
      { "a": "D", "b": 1 },
      { "a": "D", "b": 2 },
      { "a": "D", "b": 6 },
      { "a": "E", "b": 8 },
      { "a": "E", "b": 4 },
      { "a": "E", "b": 7 }
    ]
  },
  "semantic_types": {
    "a": "Category",
    "b": "Quantity"
  },
  "chart_spec": {
    "chartType": "Bar Chart",
    "encodings": {
      "x": { "field": "a" },
      "y": { "field": "b", "aggregate": "average" }
    },
    "baseSize": { "width": 480, "height": 320 }
  }
}
```

```flint-chart
{
  "data": {
    "values": [
      { "a": "C", "b": 2 },
      { "a": "C", "b": 7 },
      { "a": "C", "b": 4 },
      { "a": "D", "b": 1 },
      { "a": "D", "b": 2 },
      { "a": "D", "b": 6 },
      { "a": "E", "b": 8 },
      { "a": "E", "b": 4 },
      { "a": "E", "b": 7 }
    ]
  },
  "semantic_types": {
    "a": "Category",
    "b": "Quantity"
  },
  "chart_spec": {
    "chartType": "Bar Chart",
    "encodings": {
      "x": { "field": "a" },
      "y": { "field": "b", "aggregate": "average" }
    },
    "baseSize": { "width": 480, "height": 320 }
  }
}
```

---

## Swap fields, keep semantics

Suppose `b` is not a generic count but a **rating** on a 1–5 scale. Change only
the semantic type:

```json
"semantic_types": {
  "a": "Category",
  "b": "Score"
}
```

Recompile (the editor does this automatically). Expect:

- Y-axis tick formatting suited to scores (not thousands separators).
- Zero-baseline behavior appropriate for ratings (Score is bounded; the
  compiler avoids misleading bar baselines where the type calls for it).

Swap which field is on x vs y:

```json
"encodings": {
  "x": { "field": "b", "aggregate": "average" },
  "y": { "field": "a" }
}
```

You get a horizontal bar chart. **No `orient` property** — orientation follows
from which channel is discrete.

This is the editability advantage described in
[Overview](/documentation/overview): users change fields and types; the
compiler refreshes dozens of low-level parameters.

---

## Change chart type

### Scatter plot

```json
"chartType": "Scatter Plot",
"encodings": {
  "x": { "field": "a" },
  "y": { "field": "b" }
}
```

Remove `aggregate` — scatter shows raw rows. Axis treatment for `Category` vs
`Quantity` (or `Score`) is recomputed for point marks instead of bar length.

### Line chart

Add a time-like column to see temporal semantics:

```json
{
  "data": {
    "values": [
      { "month": "2025-01", "value": 12 },
      { "month": "2025-02", "value": 19 },
      { "month": "2025-03", "value": 15 },
      { "month": "2025-04", "value": 22 }
    ]
  },
  "semantic_types": {
    "month": "YearMonth",
    "value": "Temperature"
  },
  "chart_spec": {
    "chartType": "Line Chart",
    "encodings": {
      "x": { "field": "month" },
      "y": { "field": "value" }
    },
    "baseSize": { "width": 520, "height": 280 }
  }
}
```

```flint-chart
{
  "data": {
    "values": [
      { "month": "2025-01", "value": 12 },
      { "month": "2025-02", "value": 19 },
      { "month": "2025-03", "value": 15 },
      { "month": "2025-04", "value": 22 }
    ]
  },
  "semantic_types": {
    "month": "YearMonth",
    "value": "Temperature"
  },
  "chart_spec": {
    "chartType": "Line Chart",
    "encodings": {
      "x": { "field": "month" },
      "y": { "field": "value" }
    },
    "baseSize": { "width": 520, "height": 280 }
  }
}
```

`YearMonth` drives temporal parsing and tick format. `Temperature` selects
intensive aggregation defaults and y-axis scale tightness (no forced zero).

---

## Compare backends

The same `ChartAssemblyInput` compiles to every supported backend:

| Function | Output |
|----------|--------|
| `assembleVegaLite(input)` | Vega-Lite v6 spec |
| `assembleECharts(input)` | ECharts `option` object |
| `assembleChartjs(input)` | Chart.js config |
| `assemblePlotly(input)` | Plotly.js `{ data, layout }` figure |
| `assembleExcel(input)` | Native Excel chart artifact for Office.js |

Not every `chartType` exists in every backend. The
[gallery](/gallery) shows only tabs for supported engines — e.g. **Sankey** is
ECharts-only. Lookup helpers:

```ts
import {
  vlGetTemplateDef,
  ecGetTemplateDef,
  cjsGetTemplateDef,
  plGetTemplateDef,
  excelGetTemplateDef,
} from 'flint-chart';

vlGetTemplateDef('Bar Chart');   // defined
ecGetTemplateDef('Bar Chart');   // defined
cjsGetTemplateDef('Sankey Diagram'); // undefined
plGetTemplateDef('Density Contour'); // defined
excelGetTemplateDef('Treemap'); // defined
```

When a template is missing, the assembler throws a clear error before your
renderer crashes — part of Flint's validation story in
[Overview](/documentation/overview#overflow--warning-system).

---

## Color and grouping

Add a third field to split bars by group:

```json
{
  "data": {
    "values": [
      { "a": "C", "b": 2, "g": "X" },
      { "a": "C", "b": 7, "g": "Y" },
      { "a": "D", "b": 1, "g": "X" },
      { "a": "D", "b": 6, "g": "Y" },
      { "a": "E", "b": 8, "g": "X" },
      { "a": "E", "b": 4, "g": "Y" }
    ]
  },
  "semantic_types": {
    "a": "Category",
    "b": "Quantity",
    "g": "Category"
  },
  "chart_spec": {
    "chartType": "Grouped Bar Chart",
    "encodings": {
      "x": { "field": "a" },
      "y": { "field": "b", "aggregate": "average" },
      "color": { "field": "g" }
    },
    "baseSize": { "width": 480, "height": 320 }
  }
}
```

```flint-chart
{
  "data": {
    "values": [
      { "a": "C", "b": 2, "g": "X" },
      { "a": "C", "b": 7, "g": "Y" },
      { "a": "D", "b": 1, "g": "X" },
      { "a": "D", "b": 6, "g": "Y" },
      { "a": "E", "b": 8, "g": "X" },
      { "a": "E", "b": 4, "g": "Y" }
    ]
  },
  "semantic_types": {
    "a": "Category",
    "b": "Quantity",
    "g": "Category"
  },
  "chart_spec": {
    "chartType": "Grouped Bar Chart",
    "encodings": {
      "x": { "field": "a" },
      "y": { "field": "b", "aggregate": "average" },
      "color": { "field": "g" }
    },
    "baseSize": { "width": 480, "height": 320 }
  }
}
```

The compiler assigns a categorical palette from semantic types. You did not pass
`scale.scheme` or hex colors.

For stacked instead of grouped bars, use `"Stacked Bar Chart"` with the same
encodings.

---

## Layout and canvas size

If labels crowd or facets overflow, tune layout via `options` (optional):

```json
{
  "chart_spec": { /* … */ },
  "options": {
    "elasticity": 0.5,
    "maxStretch": 2,
    "minStep": 8
  }
}
```

These control the spring / pressure sizing models — see
[Example: Auto Layout](/playgrounds/auto-layout) for a quick walkthrough or
[Auto Layout Algorithm](/documentation/layout-model) for the full model. Most
tutorials and gallery examples work with defaults.

---

## Load examples from the gallery

The [gallery](/gallery) links each example to the editor (`Open in editor`). That loads a full `ChartAssemblyInput` built from real
test cases — useful when you want to see encodings for bump charts, heatmaps,
facets, and other templates.

Workflow:

1. Browse [gallery](/gallery) by chart family.
2. Open an example in the editor.
3. Change one field name or semantic type and watch the compiler rebuild all
   three backends.

---

## Next steps

| Goal | Where to go |
|------|-------------|
| Full API & architecture | [Overview](/documentation/overview) |
| Semantic type reference | [Semantic Type](/documentation/semantic-types) |
| All chart templates | [Gallery](/gallery) |
| Author a new template | [Extending chart templates](/documentation/adding-a-chart-template) |
| Local dev setup | [Development](/documentation/development) |

Return to [Getting started](/documentation/getting-started) if you want to rebuild
the tutorial dataset from scratch.
