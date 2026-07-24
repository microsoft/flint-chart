# Example: Auto Layout

Flint's auto layout has one goal: fit the chart to its data and container while
keeping the marks readable. The algorithm uses pressure models and banking to
adapt the canvas size, mark spacing, aspect ratio, and facet layout as the data
gets denser.

The main tradeoff is how much to compress elements inside the chart versus how
much to stretch the chart beyond its `baseSize`. Stretch is bounded by
`canvasSize` or the default growth ceiling, so the chart gets more room when it
needs it without growing without bound.

Try the four demos first, each showing a different kind of layout pressure:
[banded axes](#banded-axes) for categories and bins,
[continuous axes](#continuous-axes) for dense points, time series, and multiple lines,
[radial charts](#radial-charts) for slices and spokes, and
[area layouts](#area-layouts) for packed 2D space.
The demos keep the growth ceiling at the library default so the controls can
focus on data density, `baseSize`, and `elasticity`.

## Banded axes

Bars, histograms, heatmaps, and boxplots allocate a slot for each item. Add categories below and watch the chart widen until the stretch cap is exhausted.

```flint-playground
discrete
```

## Continuous axes

Scatter, line, and area charts do not allocate one band per row, but dense points and multiple series still create pressure. Add points or series below and watch the axis stretch more gradually.

```flint-playground
continuous
```

## Radial charts

Pie, rose, radar, and similar closed-loop charts need enough circumference for each slice or spoke. Add slices below and watch the chart grow its radius when the requested canvas gets too tight.

```flint-playground
circumference
```

## Area layouts

Treemaps and other filled 2D layouts need enough total area for rectangles to stay legible. Add leaves below and watch the canvas expand by area rather than by a single axis.

```flint-playground
area
```

## What gets resized

Auto layout changes the space around the same chart: axis spans, band steps,
facet cells, radial space, filled layout area, and the overall plot area can
grow or shrink. The data, semantic encodings, colors, and formatting stay the
same.

## Layout modes

Choose the mode by setting `baseSize`, `canvasSize`, or both:

| Mode | Set | What happens |
|------|-----|--------------|
| **Default auto layout** | neither | Flint targets `400 × 320` and may grow when the data is dense. |
| **Target size** | `baseSize` | Flint aims for your preferred size, but can still grow if readability needs it. |
| **Fixed slot** | `canvasSize` | Flint fits the chart inside that box and never overflows it. Use this for dashboards and cards with hard dimensions. |
| **Bounded growth** | both | Flint starts from `baseSize`, grows only when needed, and never exceeds `canvasSize`. |

For the full equations and implementation details, see
[Auto Layout Algorithm](/documentation/layout-model).

## Controlling the budget

Use defaults while exploring. Set `baseSize` to change the target, and add a
`canvasSize` ceiling only when the surrounding UI has a hard size constraint:

```json
{
  "chart_spec": {
    "chartType": "Bar Chart",
    "encodings": {
      "x": { "field": "category" },
      "y": { "field": "value" }
    },
    "baseSize": { "width": 480, "height": 320 },
    "canvasSize": { "width": 720, "height": 480 }
  },
  "options": {
    "elasticity": 0.45,
    "minStep": 8
  }
}
```

Here the chart targets `480 × 320` and may stretch up to the `720 × 480` ceiling.
Drop `canvasSize` to let the chart grow to `baseSize × maxStretch`, or lower
`options.maxStretch` to tighten the default ceiling for fixed dashboard cells.

For a **fixed slot**, the simplest form is `canvasSize` on its own — Flint then
treats it as a box the chart fills and shrinks to fit, never overflowing:

```json
{
  "chart_spec": {
    "chartType": "Bar Chart",
    "encodings": {
      "x": { "field": "category" },
      "y": { "field": "value" }
    },
    "canvasSize": { "width": 320, "height": 240 }
  }
}
```

## Font size

Text (axis tick labels, axis titles, legend, chart title) adapts to the canvas
around each backend's native font, so a small chart isn't cramped and a large
one isn't tiny. To scale all text up or down, set the two base sizes in
`options`:

```json
{
  "chart_spec": {
    "chartType": "Bar Chart",
    "encodings": { "x": { "field": "category" }, "y": { "field": "value" } }
  },
  "options": {
    "baseLabelFontSize": 14,
    "baseTitleFontSize": 16
  }
}
```

`baseLabelFontSize` sets the axis tick font; `baseTitleFontSize` sets the header
font (axis titles, legend, chart title). They default to each backend's native
size (Vega-Lite 10 / 11; ECharts and Chart.js 12 / 12; Plotly 12 / 14). Dense
axes still shrink, rotate, and truncate tick labels from that base to avoid
overlap.

For facets and the model details behind these controls, continue to [Auto Layout Algorithm](/documentation/layout-model).