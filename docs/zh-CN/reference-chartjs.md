# Chart.js 图表参考

> 本页由实时 chart-template 注册表（`scripts/gen-chart-reference.ts`）生成。请勿手工编辑 — 请运行 `npm run gen:reference`。

Chart.js 后端是常见图表族的轻量嵌入目标，有意保持较小的参数面。

## 本页内容

本参考列出 Chart.js 后端当前支持的 20 种图表类型，分为 5 个类别。每个图表条目包含：

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

### ![](chart-icon-connected-scatter.svg) Connected Scatter Plot

**编码通道：** `x`, `y`, `order`, `color`, `detail`, `column`, `row`

_无模板专属参数。_

### ![](chart-icon-bubble.svg) Bubble Chart

**编码通道：** `x`, `y`, `size`, `color`, `opacity`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `opacity` | number | 0.1 – 1 (step 0.05) | `0.6` | always | 标记不透明度。 |

### ![](chart-icon-strip-plot.svg) Strip Plot

**编码通道：** `x`, `y`, `color`, `size`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `stepWidth` | number | 10 – 100 (step 5) | `20` | always | 抖动散布宽度。 |
| `pointSize` | number | 0 – 150 (step 5) | `0` | always | 点或标记大小。 |
| `opacity` | number | 0 – 1 (step 0.05) | `0` | always | 标记不透明度。 |

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

_无模板专属参数。_

### ![](chart-icon-combo.svg) Combo Chart

**编码通道：** `x`, `y`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `cornerRadius` | number | 0 – 15 (step 1) | `0` | always | 支持的标记的圆角半径。 |

### ![](chart-icon-histogram.svg) Histogram

**编码通道：** `x`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `binCount` | number | 5 – 50 (step 1) | `Auto` | always | 最大分箱上限；Auto 由后端选择。 |

### ![](chart-icon-waterfall.svg) Waterfall Chart

**编码通道：** `x`, `y`, `color`, `column`, `row`

_无模板专属参数。_

### ![](chart-icon-gantt.svg) Gantt Chart

**编码通道：** `y`, `x`, `x2`, `color`, `column`, `row`

_无模板专属参数。_

## 折线与面积

### ![](chart-icon-line.svg) Line Chart

**编码通道：** `x`, `y`, `color`, `opacity`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `interpolate` | choice | Default (linear) _(default)_, `linear` (Linear), `monotone` (Monotone (smooth)), `step` (Step), `step-before` (Step Before), `step-after` (Step After) | — | always | 折线或面积插值方法。 |

### ![](chart-icon-slope.svg) Slope Chart

**编码通道：** `x`, `y`, `color`, `detail`, `column`, `row`

_无模板专属参数。_

### ![](chart-icon-area.svg) Area Chart

**编码通道：** `x`, `y`, `color`, `opacity`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `interpolate` | choice | Default (linear) _(default)_, `linear` (Linear), `monotone` (Monotone (smooth)) | — | always | 折线或面积插值方法。 |
| `opacity` | number | 0.1 – 1 (step 0.05) | `0.4` | always | 标记不透明度。 |
| `stackMode` | choice | Stacked (default) _(default)_, `layered` (Layered (overlap)) | — | always | 重叠系列的堆叠策略。 |

### ![](chart-icon-range-area.svg) Range Area Chart

**编码通道：** `x`, `y`, `y2`, `color`, `column`, `row`

_无模板专属参数。_

### ![](chart-icon-ecdf.svg) ECDF Plot

**编码通道：** `x`, `color`, `detail`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `showPoints` | toggle | on / off | `false` | always | 在线上叠加点标记。 |

## 部分与整体

### ![](chart-icon-pie.svg) Pie Chart

**编码通道：** `size`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `innerRadius` | number | 0 – 60 (step 5) | `0` | always | 内半径占外半径的百分比。 |
| `sortSlices` | choice | `none` (Data order), `descending` (Largest first), `ascending` (Smallest first) | `none` | always | 排序扇区 |

### ![](chart-icon-doughnut.svg) Doughnut Chart

**编码通道：** `size`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `innerRadius` | number | 20 – 80 (step 5) | `55` | always | 内半径占外半径的百分比。 |
| `sortSlices` | choice | `none` (Data order), `descending` (Largest first), `ascending` (Smallest first) | `none` | always | 排序扇区 |

## 极坐标

### ![](chart-icon-radar.svg) Radar Chart

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `filled` | choice | `true` (Filled (default)), `false` (Outline only) | — | always | 填充雷达图封闭区域。 |
| `fillOpacity` | number | 0.05 – 0.8 (step 0.05) | `0.3` | always | 面积或区域的填充不透明度。 |

### ![](chart-icon-rose.svg) Rose Chart

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `alignment` | choice | `left` (Left (default)), `center` (Center) | — | always | 径向图的段对齐方式。 |
| `sortSlices` | choice | `none` (Data order), `descending` (Largest first), `ascending` (Smallest first) | `none` | always | 排序扇区 |
