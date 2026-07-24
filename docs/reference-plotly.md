# Plotly chart reference

> This page is generated from the live chart-template registry (`scripts/gen-chart-reference.ts`). Do not edit it by hand — run `npm run gen:reference`.

The Plotly backend compiles to a Plotly.js figure (`{ data, layout }`) and leans on Plotly-native trace types wherever one exists (candlestick, box, violin, heatmap, waterfall, `scatterpolar`/`barpolar`, `indicator`, `scattergeo`/`choropleth`) instead of hand-building the mark. Funnel and Gauge have no Vega-Lite equivalent and showcase Plotly-specific native primitives. Map and Choropleth use Plotly's own built-in geo atlas (no external TopoJSON fetch/join needed). Sparkline and Bar Table are composite, self-contained figures (their own multi-axis-pair grid + annotations) rather than the generic column/row facet combiner.

## What this page covers

This reference lists the 38 chart types currently supported by the Plotly backend, grouped into 8 categories. Each chart entry shows:

- **Encoding channels** — the visual roles accepted in `chart_spec.encodings`, such as `x`, `y`, `color`, `size`, `column`, or `row`.
- **Options** — template-specific `chart_spec.chartProperties` keys, including control type, domain, default, availability, and description.

Use the chart type name exactly as shown in `chart_spec.chartType`.

## How to set encodings and options

Set encodings in `chart_spec.encodings` and chart-specific options in `chart_spec.chartProperties`. Option keys match the parameter names below:

```jsonc
{
  "chartType": "Bar Chart",
  "encodings": { "x": { "field": "category" }, "y": { "field": "value" } },
  "chartProperties": { "cornerRadius": 4, "stackMode": "normalize" }
}
```

The **Availability** column shows whether a parameter is `always` available or `conditional`, meaning it appears only when the data and encodings make it relevant. For example, log-scale controls appear only on wide-range axes. Non-applicable parameters are safe to pass; the assembler ignores them.

## Scatter & Point

### ![](chart-icon-scatter.svg) Scatter Plot

**Encoding channels:** `x`, `y`, `color`, `size`, `opacity`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `opacity` | number | 0.1 – 1 (step 0.05) | `1` | always | Mark opacity. |

### ![](chart-icon-linear-regression.svg) Regression

**Encoding channels:** `x`, `y`, `size`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `regressionMethod` | choice | `linear` (Linear), `log` (Logarithmic), `exp` (Exponential), `pow` (Power), `quad` (Quadratic), `poly` (Polynomial) | `linear` | always | Regression fit method. |
| `polyOrder` | number | 2 – 10 (step 1) | `3` | always | Polynomial order for the regression fit. |
| `opacity` | number | 0.1 – 1 (step 0.05) | `1` | always | Mark opacity. |

### ![](chart-icon-connected-scatter.svg) Connected Scatter Plot

**Encoding channels:** `x`, `y`, `order`, `color`, `detail`, `column`, `row`

_No template-specific parameters._

### ![](chart-icon-dot-plot-horizontal.svg) Ranged Dot Plot

**Encoding channels:** `x`, `y`, `color`

_No template-specific parameters._

### ![](chart-icon-strip-plot.svg) Strip Plot

**Encoding channels:** `x`, `y`, `color`, `size`, `column`, `row`

_No template-specific parameters._

## Bar

### ![](chart-icon-column.svg) Bar Chart

**Encoding channels:** `x`, `y`, `color`, `opacity`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `cornerRadius` | number | 0 – 15 (step 1) | `0` | always | Corner radius for supported marks. |

### ![](chart-icon-column-grouped.svg) Grouped Bar Chart

**Encoding channels:** `x`, `y`, `group`, `color`, `column`, `row`

_No template-specific parameters._

### ![](chart-icon-column-stacked.svg) Stacked Bar Chart

**Encoding channels:** `x`, `y`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `stackMode` | choice | Stacked (default) _(default)_, `normalize` (Normalize (100%)) | — | conditional | Stacking strategy for overlapping series. |

### ![](chart-icon-lollipop.svg) Lollipop Chart

**Encoding channels:** `x`, `y`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `dotSize` | number | 20 – 300 (step 10) | `80` | always | Size of the dot mark. |

### ![](chart-icon-waterfall.svg) Waterfall Chart

**Encoding channels:** `x`, `y`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `totals` | choice | `auto` (Auto), `none` (None), `first` (First only), `last` (Last only), `both` (First and last) | `auto` | always | Totals |
| `showTextLabels` | toggle | on / off | `false` | always | Render value labels on the marks. |

### ![](chart-icon-pyramid.svg) Pyramid Chart

**Encoding channels:** `x`, `y`, `color`

_No template-specific parameters._

## Distributions

### ![](chart-icon-histogram.svg) Histogram

**Encoding channels:** `x`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `binCount` | number | 5 – 50 (step 1) | `10` | always | Maximum bin cap; Auto lets the backend choose. |

### ![](chart-icon-box-plot.svg) Boxplot

**Encoding channels:** `x`, `y`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `showOutliers` | toggle | on / off | `true` | always | Outliers |

### ![](chart-icon-violin.svg) Violin Plot

**Encoding channels:** `x`, `y`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `showBox` | toggle | on / off | `true` | always | Inner box |
| `showPoints` | toggle | on / off | `false` | always | Overlay point markers on the line. |

### ![](chart-icon-density.svg) Density Plot

**Encoding channels:** `x`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `bandwidth` | number | 0.05 – 2 (step 0.05) | `0` | always | Kernel-density bandwidth (0 = auto). |

### ![](chart-icon-ecdf.svg) ECDF Plot

**Encoding channels:** `x`, `color`, `detail`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `showPoints` | toggle | on / off | `false` | always | Overlay point markers on the line. |

### ![](chart-icon-candlestick.svg) Candlestick Chart

**Encoding channels:** `x`, `open`, `high`, `low`, `close`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `showMA` | toggle | on / off | `false` | always | Show a moving-average overlay. |
| `maWindow` | number | 3 – 30 (step 1) | `5` | always | Moving-average window size. |

### Density Contour

**Encoding channels:** `x`, `y`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `binCount` | number | 5 – 50 (step 1) | `20` | always | Maximum bin cap; Auto lets the backend choose. |
| `showPoints` | toggle | on / off | `true` | always | Overlay point markers on the line. |

## Line & Area

### ![](chart-icon-line.svg) Line Chart

**Encoding channels:** `x`, `y`, `color`, `opacity`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `interpolate` | choice | Default (linear) _(default)_, `linear` (Linear), `monotone` (Monotone (smooth)), `step` (Step), `step-before` (Step Before), `step-after` (Step After) | — | always | Line or area interpolation method. |
| `showPoints` | toggle | on / off | `false` | always | Overlay point markers on the line. |

### ![](chart-icon-area.svg) Area Chart

**Encoding channels:** `x`, `y`, `color`, `opacity`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `interpolate` | choice | Default (linear) _(default)_, `linear` (Linear), `monotone` (Monotone (smooth)) | — | always | Line or area interpolation method. |
| `opacity` | number | 0.1 – 1 (step 0.05) | `0.4` | always | Mark opacity. |
| `stackMode` | choice | Stacked (default) _(default)_, `normalize` (Normalize (100%)), `layered` (Layered (overlap)) | — | conditional | Stacking strategy for overlapping series. |

### ![](chart-icon-bump.svg) Bump Chart

**Encoding channels:** `x`, `y`, `color`, `detail`, `column`, `row`

_No template-specific parameters._

### ![](chart-icon-slope.svg) Slope Chart

**Encoding channels:** `x`, `y`, `color`, `detail`, `column`, `row`

_No template-specific parameters._

### ![](chart-icon-streamgraph.svg) Streamgraph

**Encoding channels:** `x`, `y`, `color`, `column`, `row`

_No template-specific parameters._

### ![](chart-icon-range-area.svg) Range Area Chart

**Encoding channels:** `x`, `y`, `y2`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `opacity` | number | 0.1 – 1 (step 0.05) | `0.35` | always | Mark opacity. |

## Circular

### ![](chart-icon-pie.svg) Pie Chart

**Encoding channels:** `size`, `color`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `sortSlices` | choice | `none` (Data order), `descending` (Largest first), `ascending` (Smallest first) | `none` | always | Sort slices |
| `labelType` | choice | `categoryPercent` (Name + %), `category` (Name), `value` (Value), `percent` (Percent), `none` (None) | `categoryPercent` | always | Labels |

### ![](chart-icon-doughnut.svg) Donut Chart

**Encoding channels:** `size`, `color`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `innerRadius` | number | 20 – 80 (step 5) | `55` | always | Inner radius as a percentage of the outer radius. |
| `sortSlices` | choice | `none` (Data order), `descending` (Largest first), `ascending` (Smallest first) | `none` | always | Sort slices |
| `labelType` | choice | `categoryPercent` (Name + %), `category` (Name), `value` (Value), `percent` (Percent), `none` (None) | `categoryPercent` | always | Labels |

### ![](chart-icon-radar.svg) Radar Chart

**Encoding channels:** `x`, `y`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `filled` | choice | `true` (Filled (default)), `false` (Outline only) | — | always | Fill the enclosed radar area. |
| `fillOpacity` | number | 0.05 – 0.8 (step 0.05) | `0.3` | always | Fill opacity for the area or region. |

### ![](chart-icon-rose.svg) Rose Chart

**Encoding channels:** `x`, `y`, `color`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `sortSlices` | choice | `none` (Data order), `descending` (Largest first), `ascending` (Smallest first) | `none` | always | Sort slices |

## Tables & KPIs

### ![](chart-icon-heat-map.svg) Heatmap

**Encoding channels:** `x`, `y`, `color`, `column`, `row`

_No template-specific parameters._

### ![](chart-icon-gantt.svg) Gantt Chart

**Encoding channels:** `y`, `x`, `x2`, `color`, `detail`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `taskHeight` | number | 40 – 90 (step 5) | `70` | always | Task bar height as a percentage of each row. |
| `cornerRadius` | number | 0 – 8 (step 1) | `2` | always | Corner radius for supported marks. |
| `intervalLabels` | toggle | on / off | `false` | always | Text shown on task intervals. |

### ![](chart-icon-bullet.svg) Bullet Chart

**Encoding channels:** `y`, `x`, `goal`, `color`, `column`, `row`

_No template-specific parameters._

### ![](chart-icon-kpi-card.svg) KPI Card

**Encoding channels:** `metric`, `value`, `goal`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `layout` | choice | `horizontal` (Horizontal (default)), `vertical` (Vertical), `grid` (Grid) | — | always | Layout |

### Sparkline

**Encoding channels:** `x`, `y`, `color`, `detail`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `baseline` | choice | `mean` (Average), `zero` (Zero), `median` (Median), `none` (None) | `mean` | always | Reference line |
| `trendWidth` | number | 80 – 600 (step 10) | `240` | always | Sparkline width |

### ![](chart-icon-bar-table.svg) Bar Table

**Encoding channels:** `y`, `x`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `maxRows` | number | 5 – 100 (step 1) | `20` | always | Maximum number of table rows to display. |
| `showPercent` | toggle | on / off | `false` | conditional | Show each value as a percentage of the total. |

## Maps

### ![](chart-icon-world-map.svg) Map

**Encoding channels:** `longitude`, `latitude`, `color`, `size`, `opacity`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `region` | choice | `auto` (Auto-detect), `us` (United States), `world` (World) | `auto` | always | Region |
| `projection` | choice | `default` (Default), `mercator` (Mercator), `equalEarth` (Equal Earth), `orthographic` (Orthographic (Globe)), `stereographic` (Stereographic), `conicEqualArea` (Conic Equal Area), `conicEquidistant` (Conic Equidistant), `azimuthalEquidistant` (Azimuthal Equidistant), `mollweide` (Mollweide) | `default` | conditional | Projection |
| `projectionCenter` | choice | Default _(default)_, `0,0` (World (Atlantic) [0, 0]), `150,0` (World (Pacific) [150, 0]), `105,35` (China [105, 35]), `-98,39` (USA [-98, 39]), `10,50` (Europe [10, 50]), `138,36` (Japan [138, 36]), `78,22` (India [78, 22]), `-52,-14` (Brazil [-52, -14]), `134,-25` (Australia [134, -25]), `100,60` (Russia [100, 60]), `20,0` (Africa [20, 0]), `45,28` (Middle East [45, 28]), `115,5` (Southeast Asia [115, 5]), `-60,-15` (South America [-60, -15]), `-100,45` (North America [-100, 45]), `-2,54` (UK [-2, 54]), `10,51` (Germany [10, 51]), `2,47` (France [2, 47]), `128,36` (Korea [128, 36]) | — | conditional | Center |

### ![](chart-icon-us-map.svg) Choropleth

**Encoding channels:** `id`, `color`, `detail`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `region` | choice | `auto` (Auto-detect), `us` (United States), `world` (World) | `auto` | always | Region |

## Opportunity

### ![](chart-icon-funnel.svg) Funnel Chart

**Encoding channels:** `y`, `size`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `sort` | choice | `descending` (Descending (default)), `ascending` (Ascending), `none` (Original order) | `descending` | always | Sort order for ordered stages or categories. |

### ![](chart-icon-gauge.svg) Gauge Chart

**Encoding channels:** `size`, `column`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `min` | number | 0 – 1000 (step 10) | `0` | always | Min |
| `max` | number | 0 – 10000 (step 100) | `100` | always | Max |
