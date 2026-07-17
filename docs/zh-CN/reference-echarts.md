# ECharts 图表参考

> 本页由实时 chart-template 注册表（`scripts/gen-chart-reference.ts`）生成。请勿手工编辑 — 请运行 `npm run gen:reference`。

ECharts 后端面向交互式、canvas 渲染的图表，并覆盖 Vega-Lite 范围之外的若干结构：sunburst、treemap、sankey、gauge、graph、tree、parallel coordinates 与 calendar heatmap。

## 本页内容

本参考列出 ECharts 后端当前支持的 37 种图表类型，分为 10 个类别。每个图表条目包含：

- **编码通道** — `chart_spec.encodings` 中接受的视觉角色，例如 `x`、`y`、`color`、`size`、`column` 或 `row`。
- **选项** — 模板专属的 `chart_spec.chartProperties` 键，包括控件类型、域、默认值、可用性与描述。

请严格按照 `chart_spec.chartType` 中显示的名称使用图表类型。

## 如何设置 encodings 与 options

在 `chart_spec.encodings` 中设置 encodings，在 `chart_spec.chartProperties` 中设置图表专属选项。选项键与下方参数名一致：

```jsonc
{
  "chartType": "Bar Chart",
  "encodings": { "x": { "field": "category" }, "y": { "field": "value" } },
  "chartProperties": { "cornerRadius": 4, "stackMode": "normalize" }
}
```

**可用性**列表示参数是 `always`（始终可用）还是 `conditional`（条件可用）；后者仅在数据与 encodings 使其相关时出现。例如，对数比例尺控件仅出现在范围较宽的轴上。传入不适用的参数是安全的；组装器会忽略它们。

## 散点与点图

### ![](chart-icon-scatter.svg) Scatter Plot

**编码通道：** `x`, `y`, `color`, `size`, `opacity`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `opacity` | number | 0.1 – 1 (step 0.05) | `1` | always | 标记不透明度。 |

### ![](chart-icon-linear-regression.svg) Regression

**编码通道：** `x`, `y`, `size`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `regressionMethod` | choice | `linear` (Linear), `log` (Logarithmic), `exp` (Exponential), `pow` (Power), `quad` (Quadratic), `poly` (Polynomial) | `linear` | always | 回归拟合方法。 |
| `polyOrder` | number | 2 – 10 (step 1) | `3` | always | 回归拟合的多项式阶数。 |

### ![](chart-icon-connected-scatter.svg) Connected Scatter Plot

**编码通道：** `x`, `y`, `order`, `color`, `detail`, `column`, `row`

_无模板专属参数。_

### ![](chart-icon-dot-plot-horizontal.svg) Ranged Dot Plot

**编码通道：** `x`, `y`, `color`

_无模板专属参数。_

### ![](chart-icon-box-plot.svg) Boxplot

**编码通道：** `x`, `y`, `color`, `opacity`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `whiskerMethod` | choice | `iqr` (Tukey (1.5 × IQR)), `minmax` (Min–Max) | `iqr` | always | 须线 |
| `showOutliers` | toggle | on / off | `true` | conditional | 异常值 |
| `dodge` | choice | `auto` (Auto), `local` (Local (compact)), `global` (Global (aligned)) | `auto` | conditional | Dodge |

### ![](chart-icon-strip-plot.svg) Strip Plot

**编码通道：** `x`, `y`, `color`, `size`, `column`, `row`

_无模板专属参数。_

## 条形图

### ![](chart-icon-column.svg) Bar Chart

**编码通道：** `x`, `y`, `color`, `opacity`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `cornerRadius` | number | 0 – 15 (step 1) | `0` | always | 支持的标记的圆角半径。 |

### ![](chart-icon-column-grouped.svg) Grouped Bar Chart

**编码通道：** `x`, `y`, `group`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `dodge` | choice | `auto` (Auto), `local` (Local (compact)), `global` (Global (aligned)) | `auto` | conditional | Dodge |

### ![](chart-icon-column-stacked.svg) Stacked Bar Chart

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `stackMode` | choice | Stacked (default) _(default)_, `normalize` (Normalize (100%)), `layered` (Layered (overlap)) | — | conditional | 重叠系列的堆叠策略。 |

### ![](chart-icon-lollipop.svg) Lollipop Chart

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `dotSize` | number | 20 – 300 (step 10) | `80` | always | 圆点标记的大小。 |

### ![](chart-icon-pyramid.svg) Pyramid Chart

**编码通道：** `x`, `y`, `color`

_无模板专属参数。_

### ![](chart-icon-heat-map.svg) Heatmap

**编码通道：** `x`, `y`, `color`, `column`, `row`

_无模板专属参数。_

### ![](chart-icon-calendar.svg) Calendar Heatmap

**编码通道：** `x`, `color`

_无模板专属参数。_

## 折线与面积

### ![](chart-icon-line.svg) Line Chart

**编码通道：** `x`, `y`, `color`, `opacity`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `interpolate` | choice | Default (linear) _(default)_, `linear` (Linear), `monotone` (Monotone (smooth)), `step` (Step), `step-before` (Step Before), `step-after` (Step After) | — | always | 折线或面积插值方法。 |
| `showPoints` | toggle | on / off | `false` | always | 在线上叠加点标记。 |

### ![](chart-icon-bump.svg) Bump Chart

**编码通道：** `x`, `y`, `color`, `detail`, `column`, `row`

_无模板专属参数。_

### ![](chart-icon-slope.svg) Slope Chart

**编码通道：** `x`, `y`, `color`, `detail`, `column`, `row`

_无模板专属参数。_

### ![](chart-icon-area.svg) Area Chart

**编码通道：** `x`, `y`, `color`, `opacity`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `interpolate` | choice | Default (linear) _(default)_, `linear` (Linear), `monotone` (Monotone (smooth)), `step` (Step), `step-before` (Step Before), `step-after` (Step After) | — | always | 折线或面积插值方法。 |
| `opacity` | number | 0.1 – 1 (step 0.05) | `0.7` | always | 标记不透明度。 |
| `stackMode` | choice | Stacked (default) _(default)_, `normalize` (Normalize (100%)), `center` (Center), `layered` (Layered (overlap)) | — | always | 重叠系列的堆叠策略。 |

### ![](chart-icon-streamgraph.svg) Streamgraph

**编码通道：** `x`, `y`, `color`, `column`, `row`

_无模板专属参数。_

### ![](chart-icon-range-area.svg) Range Area Chart

**编码通道：** `x`, `y`, `y2`, `color`, `column`, `row`

_无模板专属参数。_

## 部分与整体

### ![](chart-icon-pie.svg) Pie Chart

**编码通道：** `size`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `innerRadius` | number | 0 – 60 (step 5) | `0` | always | 内半径占外半径的百分比。 |
| `cornerRadius` | number | 0 – 10 (step 1) | `0` | always | 支持的标记的圆角半径。 |
| `sortSlices` | choice | `none` (Data order), `descending` (Largest first), `ascending` (Smallest first) | `none` | always | 排序扇区 |
| `labelType` | choice | `categoryPercent` (Name + %), `category` (Name), `value` (Value), `percent` (Percent), `none` (None) | `categoryPercent` | always | 标签 |

### ![](chart-icon-funnel.svg) Funnel Chart

**编码通道：** `y`, `size`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `sort` | choice | `descending` (Descending (default)), `ascending` (Ascending), `none` (Original order) | — | always | 有序阶段或类别的排序顺序。 |
| `orient` | choice | `vertical` (Vertical (default)), `horizontal` (Horizontal) | — | always | 图表方向。 |
| `gap` | number | 0 – 20 (step 1) | `2` | always | 段之间的间距。 |

### ![](chart-icon-treemap.svg) Treemap

**编码通道：** `color`, `size`, `detail`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `breadcrumb` | choice | `true` (Show (default)), `false` (Hide) | — | always | 显示或隐藏 treemap 面包屑导航。 |

### ![](chart-icon-sunburst.svg) Sunburst Chart

**编码通道：** `color`, `size`, `detail`, `group`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `innerRadius` | number | 0 – 80 (step 5) | `0` | always | 内半径占外半径的百分比。 |
| `labelRotate` | choice | `radial` (Radial (default)), `tangential` (Tangential), `0` (Horizontal) | — | always | sunburst 扇区的标签方向。 |

### ![](chart-icon-tree.svg) Tree

**编码通道：** `color`, `detail`, `size`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `orient` | choice | `LR` (Left → Right (default)), `TB` (Top → Bottom) | — | always | 图表方向。 |

## 统计

### ![](chart-icon-histogram.svg) Histogram

**编码通道：** `x`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `binCount` | number | 5 – 50 (step 1) | `Auto` | always | 最大分箱上限；Auto 由后端选择。 |

### ![](chart-icon-density.svg) Density Plot

**编码通道：** `x`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `bandwidth` | number | 0.05 – 2 (step 0.05) | `0` | always | 核密度带宽（0 = 自动）。 |

### ![](chart-icon-ecdf.svg) ECDF Plot

**编码通道：** `x`, `color`, `detail`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `showPoints` | toggle | on / off | `false` | always | 在线上叠加点标记。 |

### ![](chart-icon-parallel.svg) Parallel Coordinates

**编码通道：** `color`, `detail`

_无模板专属参数。_

## 金融

### ![](chart-icon-candlestick.svg) Candlestick Chart

**编码通道：** `x`, `open`, `high`, `low`, `close`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `showMA` | toggle | on / off | `false` | always | 显示移动平均线叠加层。 |
| `maWindow` | number | 3 – 30 (step 1) | `5` | always | 移动平均线窗口大小。 |

## 其他

### ![](chart-icon-waterfall.svg) Waterfall Chart

**编码通道：** `x`, `y`, `color`, `column`, `row`

_无模板专属参数。_

### ![](chart-icon-gantt.svg) Gantt Chart

**编码通道：** `y`, `x`, `x2`, `color`, `detail`, `column`, `row`

_无模板专属参数。_

### ![](chart-icon-bullet.svg) Bullet Chart

**编码通道：** `y`, `x`, `goal`, `color`, `column`, `row`

_无模板专属参数。_

## 极坐标

### ![](chart-icon-radar.svg) Radar Chart

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `shape` | choice | Polygon (default) _(default)_, `circle` (Circle) | — | always | 网格 |
| `filled` | choice | `true` (Filled (default)), `false` (Outline only) | — | always | 填充雷达图封闭区域。 |
| `fillOpacity` | number | 0.05 – 0.8 (step 0.05) | `0.3` | always | 面积或区域的填充不透明度。 |

### ![](chart-icon-rose.svg) Rose Chart

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `alignment` | choice | `left` (Left (default)), `center` (Center) | — | always | 径向图的段对齐方式。 |
| `sortSlices` | choice | `none` (Data order), `descending` (Largest first), `ascending` (Smallest first) | `none` | always | 排序扇区 |

## 指标

### ![](chart-icon-gauge.svg) Gauge Chart

**编码通道：** `size`, `column`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `min` | number | 0 – 1000 (step 10) | `0` | always | 最小值 |
| `max` | number | 0 – 10000 (step 100) | `100` | always | 最大值 |
| `showProgress` | choice | `true` (Show (default)), `false` (Hide) | — | always | 进度 |

## 流向

### ![](chart-icon-sankey.svg) Sankey Diagram

**编码通道：** `x`, `y`, `size`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `orient` | choice | `horizontal` (Horizontal (default)), `vertical` (Vertical) | — | always | 图表方向。 |
| `nodeWidth` | number | 5 – 40 (step 5) | `20` | always | 节点宽度 |
| `nodeGap` | number | 2 – 30 (step 2) | `10` | always | 节点间距 |

### ![](chart-icon-network.svg) Network Graph

**编码通道：** `x`, `y`, `size`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `layout` | choice | `circular` (Circular (default)), `force` (Force-directed) | — | always | 布局 |
