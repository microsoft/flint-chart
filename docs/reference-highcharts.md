# Highcharts chart reference

> This page is generated from the live chart-template registry (`scripts/gen-chart-reference.ts`). Do not edit it by hand — run `npm run gen:reference`.

The Highcharts backend compiles to a Highcharts options object (`{ chart, xAxis, yAxis, series, tooltip, legend, colors }`) for SVG-rendered, interactive charts. It covers the common chart families with native Highcharts series types and datetime axes.

## What this page covers

This reference lists the 13 chart types currently supported by the Highcharts backend, grouped into 7 categories. Each chart entry shows:

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
| `stackMode` | choice | `normal` (Count), `percent` (Percent (100%)) | `normal` | conditional | Stacking strategy for overlapping series. |

### ![](chart-icon-histogram.svg) Histogram

**Encoding channels:** `x`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `binCount` | number | 3 – 40 (step 1) | `10` | always | Maximum bin cap; Auto lets the backend choose. |

## Line & Area

### ![](chart-icon-line.svg) Line Chart

**Encoding channels:** `x`, `y`, `color`, `opacity`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `interpolate` | choice | `linear` (Straight), `monotone` (Smooth (spline)) | `linear` | always | Line or area interpolation method. |

### ![](chart-icon-area.svg) Area Chart

**Encoding channels:** `x`, `y`, `color`, `opacity`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `interpolate` | choice | `linear` (Straight), `monotone` (Smooth (spline)) | `linear` | always | Line or area interpolation method. |

## Part-to-Whole

### ![](chart-icon-pie.svg) Pie Chart

**Encoding channels:** `size`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `innerRadius` | number | 0 – 60 (step 5) | `0` | always | Inner radius as a percentage of the outer radius. |
| `sortSlices` | choice | `none` (Data order), `descending` (Largest first), `ascending` (Smallest first) | `none` | always | Sort slices |

### ![](chart-icon-doughnut.svg) Doughnut Chart

**Encoding channels:** `size`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `innerRadius` | number | 20 – 80 (step 5) | `50` | always | Inner radius as a percentage of the outer radius. |
| `sortSlices` | choice | `none` (Data order), `descending` (Largest first), `ascending` (Smallest first) | `none` | always | Sort slices |

### ![](chart-icon-sunburst.svg) Sunburst Chart

**Encoding channels:** `color`, `group`, `detail`, `size`, `column`, `row`

_No template-specific parameters._

## Polar

### ![](chart-icon-radar.svg) Radar Chart

**Encoding channels:** `x`, `y`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `filled` | choice | `true` (Filled), `false` (Outline only) | `true` | always | Fill the enclosed radar area. |

## Statistical

### ![](chart-icon-heat-map.svg) Heatmap

**Encoding channels:** `x`, `y`, `color`, `column`, `row`

_No template-specific parameters._

## Other

### ![](chart-icon-waterfall.svg) Waterfall Chart

**Encoding channels:** `x`, `y`, `color`, `column`, `row`

| Parameter | Control | Domain | Default | Availability | Description |
|---|---|---|---|---|---|
| `totals` | choice | `auto` (Auto (data-aware)), `first` (First only), `last` (Last only), `both` (First and last) | `auto` | always | Totals |
