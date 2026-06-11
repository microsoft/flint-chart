---
name: flint-chart-author
description: Author a flint-chart ChartAssemblyInput — pick a chart type, map fields to channels, annotate each field with a semantic type. USE WHEN the user asks to "make a chart", "visualize this data", or "generate a Vega-Lite/ECharts/Chart.js spec" from tabular data. The library deterministically derives sizing, zero baseline, color schemes, and formatting from the semantic types, so DO NOT hand-tune those values.
---

# flint-chart: authoring a chart spec

## What you produce

A single `ChartAssemblyInput` object. Pass it to `assembleVegaLite`,
`assembleECharts`, `assembleChartjs`, or `assembleGoFish` to get a
backend spec. **You write the input, not the output spec.**

```ts
interface ChartAssemblyInput {
  data: { values: any[] } | { url: string };
  semantic_types?: Record<string, string>;   // field → semantic type
  chart_spec: {
    chartType: string;                       // e.g. "Scatter Plot"
    encodings: Record<string, { field?: string; ... }>;
    canvasSize?: { width: number; height: number };
    chartProperties?: Record<string, any>;
  };
}
```

## Step 1 — pick `chartType`

Use one of the registered names exactly. Common ones:

`"Bar Chart"`, `"Stacked Bar Chart"`, `"Grouped Bar Chart"`,
`"Line Chart"`, `"Area Chart"`, `"Scatter Plot"`, `"Histogram"`,
`"Heatmap"`, `"Pie Chart"`, `"Rose Chart"`, `"Boxplot"`,
`"Density Plot"`, `"Lollipop Chart"`, `"Radar Chart"`,
`"Waterfall Chart"`, `"Candlestick Chart"`, `"Pyramid Chart"`,
`"Streamgraph"`, `"Sankey"`, `"Sunburst"`, `"Treemap"`,
`"Funnel"`, `"Gauge"`.

Not every backend supports every chart type. Vega-Lite has the broadest
coverage; ECharts and Chart.js each support a subset. If unsure, call
`vlGetTemplateChannels(name)` (or the equivalent for your backend) to
check availability and see which channels are valid.

**Pie chart note:** Pie charts need long-format data — one row per slice,
with a category field on `color` and a value field on `angle`. If the
data has separate value columns (wide format), fold them first via
`chartProperties.transforms` (see worked example below).

## Step 2 — map fields to channels

Channels: `x`, `y`, `x2`, `y2`, `color`, `size`, `shape`, `opacity`,
`strokeDash`, `column`, `row`, `angle`, `radius`, `detail`, `group`,
`open`, `high`, `low`, `close`.

```json
"encodings": {
  "x": { "field": "weight" },
  "y": { "field": "mpg" },
  "color": { "field": "origin" }
}
```

You usually don't need `type`, `aggregate`, or `sortOrder` —
they're inferred from the semantic type. Set them only when you
have a specific intent (e.g., forcing an aggregation the data doesn't
naturally suggest).

## Step 3 — annotate with semantic types

**This is the most important step.** Semantic types drive all downstream
decisions — formatting, zero baseline, color scheme, scale direction,
and more. Pick the most specific type for each field:

| Family | Semantic types |
|---|---|
| Counts / amounts | `Quantity`, `Count`, `Percentage`, `Score` |
| Money | `Price`, `Revenue`, `Profit`, `Cost` |
| Time | `Date`, `DateTime`, `Year`, `Month`, `Quarter`, `Weekday`, `Hour` |
| Geography | `Country`, `Region`, `City`, `State`, `Continent` |
| Identifiers | `Category`, `Name`, `ID`, `Code` |
| Ratings / ranks | `Rank`, `Rating`, `Score` |
| Physical | `Temperature`, `Distance`, `Weight`, `Speed`, `Pressure` |

What choosing well gets you (automatically):

- `Price` / `Revenue` → currency formatting (`$,.0f`), zero baseline, sequential color
- `Temperature` → diverging color scheme, no zero baseline
- `Rank` → reversed axis (1 on top), discrete color
- `Date` → temporal axis with auto-granularity formatting
- `Percentage` → percent formatting (`.0%`), 0–100 domain awareness

If you don't know, use `Quantity` for numbers, `Category` for strings,
`Date` for date-shaped values.

## Worked examples

### Scatter plot

User: "Plot car weight vs fuel economy, colored by origin."

```json
{
  "data": { "values": [/* rows */] },
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
    "canvasSize": { "width": 400, "height": 300 }
  }
}
```

### Revenue bar chart with facets

User: "Show quarterly revenue by product line, one panel per region."

```json
{
  "data": { "values": [/* rows */] },
  "semantic_types": {
    "quarter": "Quarter",
    "revenue": "Revenue",
    "product_line": "Category",
    "region": "Region"
  },
  "chart_spec": {
    "chartType": "Bar Chart",
    "encodings": {
      "x": { "field": "quarter" },
      "y": { "field": "revenue" },
      "color": { "field": "product_line" },
      "column": { "field": "region" }
    }
  }
}
```

### Time series

User: "Line chart of daily temperature over the past year."

```json
{
  "data": { "values": [/* rows */] },
  "semantic_types": {
    "date": "Date",
    "temperature": "Temperature"
  },
  "chart_spec": {
    "chartType": "Line Chart",
    "encodings": {
      "x": { "field": "date" },
      "y": { "field": "temperature" }
    }
  }
}
```

### Pie chart from wide-format data (fold transform)

User: "Show the energy mix (renewable, fossil, nuclear) as a pie chart."

The data has separate columns for each energy type (wide format).
Fold them into long format so the pie chart can map one field to `angle`:

```json
{
  "data": { "values": [/* rows with renewables_pct, fossil_pct, nuclear_pct */] },
  "semantic_types": {
    "source": "Category",
    "share": "Percentage"
  },
  "chart_spec": {
    "chartType": "Pie Chart",
    "encodings": {
      "angle": { "field": "share" },
      "color": { "field": "source" }
    },
    "chartProperties": {
      "transforms": [
        { "fold": ["renewables_pct", "fossil_pct", "nuclear_pct"],
          "as": ["source", "share"] }
      ]
    }
  }
}
```

## What you should NOT do

- **Don't write backend specs directly** — write the `ChartAssemblyInput`,
  then call the assembler. That's the whole point.
- **Don't set `type: "quantitative"` etc.** unless the semantic type and
  data genuinely conflict and you need to override.
- **Don't pass colors, font sizes, axis tick counts** in the input —
  the compiler derives these. Users can fine-tune the *output* spec.
- **Don't invent semantic type names.** If none of the ~70 types fit,
  use the family default (`Quantity`, `Category`, `Date`).

## Validation checklist

Before returning, verify:

1. Every `field` in `encodings` references a column in `data.values[0]`.
2. Every field used in `encodings` has an entry in `semantic_types`.
3. `chartType` is a supported name for the chosen backend.
4. No hand-tuned styling properties leaked into `chart_spec`.
