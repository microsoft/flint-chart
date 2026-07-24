# Plotly 图表参考

> 本页由实时图表模板注册表生成（`scripts/gen-chart-reference.ts`）。请勿手动编辑；请运行 `npm run gen:reference`。

Plotly 后端编译为 Plotly.js `{ data, layout }` 图形，并优先使用原生 trace 类型。地图使用 Plotly 内置地理图集，无需外部 TopoJSON。

## 本页内容

本参考列出 Plotly 后端当前支持的 38 种图表，分为 8 类。图表名称必须与 `chart_spec.chartType` 中的值完全一致。

- **编码通道**：`chart_spec.encodings` 接受的视觉角色。
- **选项**：模板专用的 `chart_spec.chartProperties` 键及其取值范围、默认值和可用性。

## 设置编码与选项

```jsonc
{
  "chartType": "Bar Chart",
  "encodings": { "x": { "field": "category" }, "y": { "field": "value" } },
  "chartProperties": { "cornerRadius": 4, "stackMode": "normalize" }
}
```

可用性为 `conditional` 的参数仅在数据和编码适用时生效；不适用的参数会被 assembler 忽略。

## 散点与点图

### ![](chart-icon-scatter.svg) Scatter Plot

**编码通道：** `x`, `y`, `color`, `size`, `opacity`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `opacity` | number | 0.1 – 1 (step 0.05) | `1` | always | 标记不透明度。 |

### ![](chart-icon-linear-regression.svg) Regression

**编码通道：** `x`, `y`, `size`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `regressionMethod` | choice | `linear` (Linear), `log` (Logarithmic), `exp` (Exponential), `pow` (Power), `quad` (Quadratic), `poly` (Polynomial) | `linear` | always | 回归拟合方法。 |
| `polyOrder` | number | 2 – 10 (step 1) | `3` | always | 多项式回归阶数。 |
| `opacity` | number | 0.1 – 1 (step 0.05) | `1` | always | 标记不透明度。 |

### ![](chart-icon-connected-scatter.svg) Connected Scatter Plot

**编码通道：** `x`, `y`, `order`, `color`, `detail`, `column`, `row`

_无模板专用参数。_

### ![](chart-icon-dot-plot-horizontal.svg) Ranged Dot Plot

**编码通道：** `x`, `y`, `color`

_无模板专用参数。_

### ![](chart-icon-strip-plot.svg) Strip Plot

**编码通道：** `x`, `y`, `color`, `size`, `column`, `row`

_无模板专用参数。_

## 条形图

### ![](chart-icon-column.svg) Bar Chart

**编码通道：** `x`, `y`, `color`, `opacity`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `cornerRadius` | number | 0 – 15 (step 1) | `0` | always | 受支持标记的圆角半径。 |

### ![](chart-icon-column-grouped.svg) Grouped Bar Chart

**编码通道：** `x`, `y`, `group`, `color`, `column`, `row`

_无模板专用参数。_

### ![](chart-icon-column-stacked.svg) Stacked Bar Chart

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `stackMode` | choice | Stacked (default) _(default)_, `normalize` (Normalize (100%)) | — | conditional | 重叠系列的堆叠策略。 |

### ![](chart-icon-lollipop.svg) Lollipop Chart

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `dotSize` | number | 20 – 300 (step 10) | `80` | always | 点标记大小。 |

### ![](chart-icon-waterfall.svg) Waterfall Chart

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `totals` | choice | `auto` (Auto), `none` (None), `first` (First only), `last` (Last only), `both` (First and last) | `auto` | always | 瀑布图总计标记。 |
| `showTextLabels` | toggle | on / off | `false` | always | 在标记上显示数值标签。 |

### ![](chart-icon-pyramid.svg) Pyramid Chart

**编码通道：** `x`, `y`, `color`

_无模板专用参数。_

## 分布图

### ![](chart-icon-histogram.svg) Histogram

**编码通道：** `x`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `binCount` | number | 5 – 50 (step 1) | `10` | always | 最大分箱数。 |

### ![](chart-icon-box-plot.svg) Boxplot

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `showOutliers` | toggle | on / off | `true` | always | 显示离群点。 |

### ![](chart-icon-violin.svg) Violin Plot

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `showBox` | toggle | on / off | `true` | always | 显示内部箱体。 |
| `showPoints` | toggle | on / off | `false` | always | 在线上叠加点标记。 |

### ![](chart-icon-density.svg) Density Plot

**编码通道：** `x`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `bandwidth` | number | 0.05 – 2 (step 0.05) | `0` | always | 核密度带宽，0 表示自动。 |

### ![](chart-icon-ecdf.svg) ECDF Plot

**编码通道：** `x`, `color`, `detail`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `showPoints` | toggle | on / off | `false` | always | 在线上叠加点标记。 |

### ![](chart-icon-candlestick.svg) Candlestick Chart

**编码通道：** `x`, `open`, `high`, `low`, `close`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `showMA` | toggle | on / off | `false` | always | 显示移动平均线。 |
| `maWindow` | number | 3 – 30 (step 1) | `5` | always | 移动平均窗口大小。 |

### Density Contour

**编码通道：** `x`, `y`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `binCount` | number | 5 – 50 (step 1) | `20` | always | 最大分箱数。 |
| `showPoints` | toggle | on / off | `true` | always | 在线上叠加点标记。 |

## 折线与区域图

### ![](chart-icon-line.svg) Line Chart

**编码通道：** `x`, `y`, `color`, `opacity`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `interpolate` | choice | Default (linear) _(default)_, `linear` (Linear), `monotone` (Monotone (smooth)), `step` (Step), `step-before` (Step Before), `step-after` (Step After) | — | always | 线或区域的插值方式。 |
| `showPoints` | toggle | on / off | `false` | always | 在线上叠加点标记。 |

### ![](chart-icon-area.svg) Area Chart

**编码通道：** `x`, `y`, `color`, `opacity`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `interpolate` | choice | Default (linear) _(default)_, `linear` (Linear), `monotone` (Monotone (smooth)) | — | always | 线或区域的插值方式。 |
| `opacity` | number | 0.1 – 1 (step 0.05) | `0.4` | always | 标记不透明度。 |
| `stackMode` | choice | Stacked (default) _(default)_, `normalize` (Normalize (100%)), `layered` (Layered (overlap)) | — | conditional | 重叠系列的堆叠策略。 |

### ![](chart-icon-bump.svg) Bump Chart

**编码通道：** `x`, `y`, `color`, `detail`, `column`, `row`

_无模板专用参数。_

### ![](chart-icon-slope.svg) Slope Chart

**编码通道：** `x`, `y`, `color`, `detail`, `column`, `row`

_无模板专用参数。_

### ![](chart-icon-streamgraph.svg) Streamgraph

**编码通道：** `x`, `y`, `color`, `column`, `row`

_无模板专用参数。_

### ![](chart-icon-range-area.svg) Range Area Chart

**编码通道：** `x`, `y`, `y2`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `opacity` | number | 0.1 – 1 (step 0.05) | `0.35` | always | 标记不透明度。 |

## 圆形图

### ![](chart-icon-pie.svg) Pie Chart

**编码通道：** `size`, `color`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `sortSlices` | choice | `none` (Data order), `descending` (Largest first), `ascending` (Smallest first) | `none` | always | 扇区排序方式。 |
| `labelType` | choice | `categoryPercent` (Name + %), `category` (Name), `value` (Value), `percent` (Percent), `none` (None) | `categoryPercent` | always | 标签内容。 |

### ![](chart-icon-doughnut.svg) Donut Chart

**编码通道：** `size`, `color`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `innerRadius` | number | 20 – 80 (step 5) | `55` | always | 内半径占外半径的百分比。 |
| `sortSlices` | choice | `none` (Data order), `descending` (Largest first), `ascending` (Smallest first) | `none` | always | 扇区排序方式。 |
| `labelType` | choice | `categoryPercent` (Name + %), `category` (Name), `value` (Value), `percent` (Percent), `none` (None) | `categoryPercent` | always | 标签内容。 |

### ![](chart-icon-radar.svg) Radar Chart

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `filled` | choice | `true` (Filled (default)), `false` (Outline only) | — | always | 填充雷达图围成的区域。 |
| `fillOpacity` | number | 0.05 – 0.8 (step 0.05) | `0.3` | always | 区域填充不透明度。 |

### ![](chart-icon-rose.svg) Rose Chart

**编码通道：** `x`, `y`, `color`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `sortSlices` | choice | `none` (Data order), `descending` (Largest first), `ascending` (Smallest first) | `none` | always | 扇区排序方式。 |

## 表格与 KPI

### ![](chart-icon-heat-map.svg) Heatmap

**编码通道：** `x`, `y`, `color`, `column`, `row`

_无模板专用参数。_

### ![](chart-icon-gantt.svg) Gantt Chart

**编码通道：** `y`, `x`, `x2`, `color`, `detail`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `taskHeight` | number | 40 – 90 (step 5) | `70` | always | 任务条占每行高度的百分比。 |
| `cornerRadius` | number | 0 – 8 (step 1) | `2` | always | 受支持标记的圆角半径。 |
| `intervalLabels` | toggle | on / off | `false` | always | 在任务区间上显示文本。 |

### ![](chart-icon-bullet.svg) Bullet Chart

**编码通道：** `y`, `x`, `goal`, `color`, `column`, `row`

_无模板专用参数。_

### ![](chart-icon-kpi-card.svg) KPI Card

**编码通道：** `metric`, `value`, `goal`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `layout` | choice | `horizontal` (Horizontal (default)), `vertical` (Vertical), `grid` (Grid) | — | always | 布局方向。 |

### Sparkline

**编码通道：** `x`, `y`, `color`, `detail`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `baseline` | choice | `mean` (Average), `zero` (Zero), `median` (Median), `none` (None) | `mean` | always | 参考基线。 |
| `trendWidth` | number | 80 – 600 (step 10) | `240` | always | 迷你趋势图宽度。 |

### ![](chart-icon-bar-table.svg) Bar Table

**编码通道：** `y`, `x`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `maxRows` | number | 5 – 100 (step 1) | `20` | always | 最多显示的表格行数。 |
| `showPercent` | toggle | on / off | `false` | conditional | 将数值显示为总量百分比。 |

## 地图

### ![](chart-icon-world-map.svg) Map

**编码通道：** `longitude`, `latitude`, `color`, `size`, `opacity`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `region` | choice | `auto` (Auto-detect), `us` (United States), `world` (World) | `auto` | always | 地图区域。 |
| `projection` | choice | `default` (Default), `mercator` (Mercator), `equalEarth` (Equal Earth), `orthographic` (Orthographic (Globe)), `stereographic` (Stereographic), `conicEqualArea` (Conic Equal Area), `conicEquidistant` (Conic Equidistant), `azimuthalEquidistant` (Azimuthal Equidistant), `mollweide` (Mollweide) | `default` | conditional | 地图投影。 |
| `projectionCenter` | choice | Default _(default)_, `0,0` (World (Atlantic) [0, 0]), `150,0` (World (Pacific) [150, 0]), `105,35` (China [105, 35]), `-98,39` (USA [-98, 39]), `10,50` (Europe [10, 50]), `138,36` (Japan [138, 36]), `78,22` (India [78, 22]), `-52,-14` (Brazil [-52, -14]), `134,-25` (Australia [134, -25]), `100,60` (Russia [100, 60]), `20,0` (Africa [20, 0]), `45,28` (Middle East [45, 28]), `115,5` (Southeast Asia [115, 5]), `-60,-15` (South America [-60, -15]), `-100,45` (North America [-100, 45]), `-2,54` (UK [-2, 54]), `10,51` (Germany [10, 51]), `2,47` (France [2, 47]), `128,36` (Korea [128, 36]) | — | conditional | 地图投影中心。 |

### ![](chart-icon-us-map.svg) Choropleth

**编码通道：** `id`, `color`, `detail`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `region` | choice | `auto` (Auto-detect), `us` (United States), `world` (World) | `auto` | always | 地图区域。 |

## Plotly 特有图表

### ![](chart-icon-funnel.svg) Funnel Chart

**编码通道：** `y`, `size`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `sort` | choice | `descending` (Descending (default)), `ascending` (Ascending), `none` (Original order) | `descending` | always | 有序阶段或类别的排序方式。 |

### ![](chart-icon-gauge.svg) Gauge Chart

**编码通道：** `size`, `column`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |
|---|---|---|---|---|---|
| `min` | number | 0 – 1000 (step 10) | `0` | always | 最小值。 |
| `max` | number | 0 – 10000 (step 100) | `100` | always | 最大值。 |
