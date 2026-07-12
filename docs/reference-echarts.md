# ECharts chart reference

> This page is generated from the live chart-template registry (`scripts/gen-chart-reference.ts`). Do not edit it by hand — run `npm run gen:reference`.

The ECharts backend targets interactive, canvas-rendered charts and covers several structures outside Vega-Lite's scope: sunburst, treemap, sankey, gauge, graph, tree, parallel coordinates, and calendar heatmap.

## What this page covers

This reference lists the 37 chart types currently supported by the ECharts backend, grouped into 10 categories. Each chart entry shows:

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

### ![](chart-icon-connected-scatter.svg) Connected Scatter Plot

**Encoding channels:** `x`, `y`, `order`, `color`, `detail`, `column`, `row`

_No template-specific parameters._

### ![](chart-icon-dot-plot-horizontal.svg) Ranged Dot Plot

**Encoding channels:** `x`, `y`, `color`

_No template-specific parameters._

### ![](chart-icon-box-plot.svg) Boxplot

**Encoding channels:** `x`, `y`, `color`, `opacity`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `whiskerMethod` | choice | `iqr` (Tukey (1.5 × IQR)), `minmax` (Min–Max) | `iqr` | always | Whiskers |
| `showOutliers` | toggle | on / off | `true` | conditional | Outliers |

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
| `stackMode` | choice | Stacked (default) _(default)_, `normalize` (Normalize (100%)), `layered` (Layered (overlap)) | — | conditional | Stacking strategy for overlapping series. |

### ![](chart-icon-lollipop.svg) Lollipop Chart

**Encoding channels:** `x`, `y`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `dotSize` | number | 20 – 300 (step 10) | `80` | always | Size of the dot mark. |

### ![](chart-icon-pyramid.svg) Pyramid Chart

**Encoding channels:** `x`, `y`, `color`

_No template-specific parameters._

### ![](chart-icon-heat-map.svg) Heatmap

**Encoding channels:** `x`, `y`, `color`, `column`, `row`

_No template-specific parameters._

### ![](chart-icon-calendar.svg) Calendar Heatmap

**Encoding channels:** `x`, `color`

_No template-specific parameters._

## Line & Area

### ![](chart-icon-line.svg) Line Chart

**Encoding channels:** `x`, `y`, `color`, `opacity`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `interpolate` | choice | Default (linear) _(default)_, `linear` (Linear), `monotone` (Monotone (smooth)), `step` (Step), `step-before` (Step Before), `step-after` (Step After) | — | always | Line or area interpolation method. |
| `showPoints` | toggle | on / off | `false` | always | Overlay point markers on the line. |

### ![](chart-icon-bump.svg) Bump Chart

**Encoding channels:** `x`, `y`, `color`, `detail`, `column`, `row`

_No template-specific parameters._

### ![](chart-icon-slope.svg) Slope Chart

**Encoding channels:** `x`, `y`, `color`, `detail`, `column`, `row`

_No template-specific parameters._

### ![](chart-icon-area.svg) Area Chart

**Encoding channels:** `x`, `y`, `color`, `opacity`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `interpolate` | choice | Default (linear) _(default)_, `linear` (Linear), `monotone` (Monotone (smooth)), `step` (Step), `step-before` (Step Before), `step-after` (Step After) | — | always | Line or area interpolation method. |
| `opacity` | number | 0.1 – 1 (step 0.05) | `0.7` | always | Mark opacity. |
| `stackMode` | choice | Stacked (default) _(default)_, `normalize` (Normalize (100%)), `center` (Center), `layered` (Layered (overlap)) | — | always | Stacking strategy for overlapping series. |

### ![](chart-icon-streamgraph.svg) Streamgraph

**Encoding channels:** `x`, `y`, `color`, `column`, `row`

_No template-specific parameters._

### ![](chart-icon-range-area.svg) Range Area Chart

**Encoding channels:** `x`, `y`, `y2`, `color`, `column`, `row`

_No template-specific parameters._

## Part-to-Whole

### ![](chart-icon-pie.svg) Pie Chart

**Encoding channels:** `size`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `innerRadius` | number | 0 – 60 (step 5) | `0` | always | Inner radius as a percentage of the outer radius. |
| `cornerRadius` | number | 0 – 10 (step 1) | `0` | always | Corner radius for supported marks. |
| `sortSlices` | choice | `none` (Data order), `descending` (Largest first), `ascending` (Smallest first) | `none` | always | Sort slices |
| `labelType` | choice | `categoryPercent` (Name + %), `category` (Name), `value` (Value), `percent` (Percent), `none` (None) | `categoryPercent` | always | Labels |

### ![](chart-icon-funnel.svg) Funnel Chart

**Encoding channels:** `y`, `size`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `sort` | choice | `descending` (Descending (default)), `ascending` (Ascending), `none` (Original order) | — | always | Sort order for ordered stages or categories. |
| `orient` | choice | `vertical` (Vertical (default)), `horizontal` (Horizontal) | — | always | Chart orientation. |
| `gap` | number | 0 – 20 (step 1) | `2` | always | Gap between segments. |

### ![](chart-icon-treemap.svg) Treemap

**Encoding channels:** `color`, `size`, `detail`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `breadcrumb` | choice | `true` (Show (default)), `false` (Hide) | — | always | Show or hide treemap breadcrumb navigation. |

### ![](chart-icon-sunburst.svg) Sunburst Chart

**Encoding channels:** `color`, `size`, `detail`, `group`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `innerRadius` | number | 0 – 80 (step 5) | `0` | always | Inner radius as a percentage of the outer radius. |
| `labelRotate` | choice | `radial` (Radial (default)), `tangential` (Tangential), `0` (Horizontal) | — | always | Label orientation for sunburst sectors. |

### ![](chart-icon-tree.svg) Tree

**Encoding channels:** `color`, `detail`, `size`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `orient` | choice | `LR` (Left → Right (default)), `TB` (Top → Bottom) | — | always | Chart orientation. |

## Statistical

### ![](chart-icon-histogram.svg) Histogram

**Encoding channels:** `x`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `binCount` | number | 5 – 50 (step 1) | `Auto` | always | Maximum bin cap; Auto lets the backend choose. |

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

### ![](chart-icon-parallel.svg) Parallel Coordinates

**Encoding channels:** `color`, `detail`

_No template-specific parameters._

## Financial

### ![](chart-icon-candlestick.svg) Candlestick Chart

**Encoding channels:** `x`, `open`, `high`, `low`, `close`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `showMA` | toggle | on / off | `false` | always | Show a moving-average overlay. |
| `maWindow` | number | 3 – 30 (step 1) | `5` | always | Moving-average window size. |

## Other

### ![](chart-icon-waterfall.svg) Waterfall Chart

**Encoding channels:** `x`, `y`, `color`, `column`, `row`

_No template-specific parameters._

### ![](chart-icon-gantt.svg) Gantt Chart

**Encoding channels:** `y`, `x`, `x2`, `color`, `detail`, `column`, `row`

_No template-specific parameters._

### ![](chart-icon-bullet.svg) Bullet Chart

**Encoding channels:** `y`, `x`, `goal`, `color`, `column`, `row`

_No template-specific parameters._

## Polar

### ![](chart-icon-radar.svg) Radar Chart

**Encoding channels:** `x`, `y`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `shape` | choice | Polygon (default) _(default)_, `circle` (Circle) | — | always | Grid |
| `filled` | choice | `true` (Filled (default)), `false` (Outline only) | — | always | Fill the enclosed radar area. |
| `fillOpacity` | number | 0.05 – 0.8 (step 0.05) | `0.3` | always | Fill opacity for the area or region. |

### ![](chart-icon-rose.svg) Rose Chart

**Encoding channels:** `x`, `y`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `alignment` | choice | `left` (Left (default)), `center` (Center) | — | always | Segment alignment for radial charts. |
| `sortSlices` | choice | `none` (Data order), `descending` (Largest first), `ascending` (Smallest first) | `none` | always | Sort slices |

## Indicator

### ![](chart-icon-gauge.svg) Gauge Chart

**Encoding channels:** `size`, `column`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `min` | number | 0 – 1000 (step 10) | `0` | always | Min |
| `max` | number | 0 – 10000 (step 100) | `100` | always | Max |
| `showProgress` | choice | `true` (Show (default)), `false` (Hide) | — | always | Progress |

## Flow

### ![](chart-icon-sankey.svg) Sankey Diagram

**Encoding channels:** `x`, `y`, `size`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `orient` | choice | `horizontal` (Horizontal (default)), `vertical` (Vertical) | — | always | Chart orientation. |
| `nodeWidth` | number | 5 – 40 (step 5) | `20` | always | Node Width |
| `nodeGap` | number | 2 – 30 (step 2) | `10` | always | Node Gap |

### ![](chart-icon-network.svg) Network Graph

**Encoding channels:** `x`, `y`, `size`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `layout` | choice | `circular` (Circular (default)), `force` (Force-directed) | — | always | Layout |
