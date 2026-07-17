# Vega-Lite 图表参考

> 本页由实时 chart-template 注册表（`scripts/gen-chart-reference.ts`）生成。请勿手工编辑 — 请运行 `npm run gen:reference`。

Vega-Lite 后端是 Flint 的参考实现，提供最广的图表覆盖。当你需要最完整的声明式图表支持（包括轴、比例尺与分面行为）时，应使用它。

## 本页内容

本参考列出 Vega-Lite 后端当前支持的 34 种图表类型，分为 6 个类别。每个图表条目包含：

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

## 点图

### ![](chart-icon-scatter.svg) Scatter Plot

**编码通道：** `x`, `y`, `color`, `size`, `shape`, `opacity`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `opacity` | number | 0.1 – 1 (step 0.1) | `1` | always | 标记不透明度。 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |
| `logScale_x` | toggle | on / off | `false` | conditional | 在 x 轴上使用对数/symlog 比例尺。 |
| `logScale_y` | toggle | on / off | `false` | conditional | 在 y 轴上使用对数/symlog 比例尺。 |
| `includeZero_x` | toggle | on / off | `false` | conditional | 将 x 轴锚定在零。 |
| `includeZero_y` | toggle | on / off | `false` | conditional | 将 y 轴锚定在零。 |

### ![](chart-icon-linear-regression.svg) Regression

**编码通道：** `x`, `y`, `size`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `regressionMethod` | choice | `linear` (Linear), `log` (Logarithmic), `exp` (Exponential), `pow` (Power), `quad` (Quadratic), `poly` (Polynomial) | `linear` | always | 回归拟合方法。 |
| `polyOrder` | number | 2 – 10 (step 1) | `3` | always | 回归拟合的多项式阶数。 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |
| `logScale_x` | toggle | on / off | `false` | conditional | 在 x 轴上使用对数/symlog 比例尺。 |
| `logScale_y` | toggle | on / off | `false` | conditional | 在 y 轴上使用对数/symlog 比例尺。 |
| `includeZero_x` | toggle | on / off | `false` | conditional | 将 x 轴锚定在零。 |
| `includeZero_y` | toggle | on / off | `false` | conditional | 将 y 轴锚定在零。 |

### ![](chart-icon-connected-scatter.svg) Connected Scatter Plot

**编码通道：** `x`, `y`, `order`, `color`, `detail`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |
| `logScale_x` | toggle | on / off | `false` | conditional | 在 x 轴上使用对数/symlog 比例尺。 |
| `logScale_y` | toggle | on / off | `false` | conditional | 在 y 轴上使用对数/symlog 比例尺。 |
| `includeZero_x` | toggle | on / off | `false` | conditional | 将 x 轴锚定在零。 |
| `includeZero_y` | toggle | on / off | `false` | conditional | 将 y 轴锚定在零。 |

### ![](chart-icon-dot-plot-horizontal.svg) Ranged Dot Plot

**编码通道：** `x`, `y`, `color`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `logScale_x` | toggle | on / off | `false` | conditional | 在 x 轴上使用对数/symlog 比例尺。 |
| `logScale_y` | toggle | on / off | `false` | conditional | 在 y 轴上使用对数/symlog 比例尺。 |
| `includeZero_x` | toggle | on / off | `false` | conditional | 将 x 轴锚定在零。 |
| `includeZero_y` | toggle | on / off | `false` | conditional | 将 y 轴锚定在零。 |

### ![](chart-icon-strip-plot.svg) Strip Plot

**编码通道：** `x`, `y`, `color`, `size`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `stepWidth` | number | 10 – 100 (step 5) | `20` | always | 抖动散布宽度。 |
| `pointSize` | number | 0 – 150 (step 5) | `0` | always | 点或标记大小。 |
| `opacity` | number | 0 – 1 (step 0.1) | `0` | always | 标记不透明度。 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |
| `logScale_x` | toggle | on / off | `false` | conditional | 在 x 轴上使用对数/symlog 比例尺。 |
| `logScale_y` | toggle | on / off | `false` | conditional | 在 y 轴上使用对数/symlog 比例尺。 |
| `includeZero_x` | toggle | on / off | `false` | conditional | 将 x 轴锚定在零。 |
| `includeZero_y` | toggle | on / off | `false` | conditional | 将 y 轴锚定在零。 |

## 条形图

### ![](chart-icon-column.svg) Bar Chart

**编码通道：** `x`, `y`, `color`, `group`, `opacity`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `cornerRadius` | number | 0 – 15 (step 1) | `0` | always | 支持的标记的圆角半径。 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |
| `xAxisType` | choice | `temporal` (Temporal), `nominal` (Discrete) | — | conditional | 将 x 轴解释为连续时间比例尺或离散波段。 |
| `yAxisType` | choice | `temporal` (Temporal), `nominal` (Discrete) | — | conditional | 将 y 轴解释为连续时间比例尺或离散波段。 |

### ![](chart-icon-column-grouped.svg) Grouped Bar Chart

**编码通道：** `x`, `y`, `group`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `dodge` | choice | `auto` (Auto), `local` (Local (compact)), `global` (Global (aligned)) | `auto` | conditional | Dodge |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |

### ![](chart-icon-column-stacked.svg) Stacked Bar Chart

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `stackMode` | choice | Stacked (default) _(default)_, `normalize` (Normalize (100%)), `center` (Center), `layered` (Layered (overlap)) | — | conditional | 重叠系列的堆叠策略。 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |

### ![](chart-icon-lollipop.svg) Lollipop Chart

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `dotSize` | number | 20 – 300 (step 10) | `80` | always | 圆点标记的大小。 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |
| `xAxisType` | choice | `temporal` (Temporal), `nominal` (Discrete) | — | conditional | 将 x 轴解释为连续时间比例尺或离散波段。 |
| `yAxisType` | choice | `temporal` (Temporal), `nominal` (Discrete) | — | conditional | 将 y 轴解释为连续时间比例尺或离散波段。 |

### ![](chart-icon-waterfall.svg) Waterfall Chart

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `cornerRadius` | number | 0 – 8 (step 1) | `0` | always | 支持的标记的圆角半径。 |
| `totals` | choice | `auto` (Auto), `none` (None), `first` (First), `last` (Last), `both` (Both) | `auto` | conditional | 合计 |
| `showTextLabels` | toggle | on / off | `false` | always | 在标记上渲染数值标签。 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |

### ![](chart-icon-gantt.svg) Gantt Chart

**编码通道：** `y`, `x`, `x2`, `color`, `detail`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |
| `logScale_x` | toggle | on / off | `false` | conditional | 在 x 轴上使用对数/symlog 比例尺。 |
| `logScale_y` | toggle | on / off | `false` | conditional | 在 y 轴上使用对数/symlog 比例尺。 |
| `includeZero_x` | toggle | on / off | `false` | conditional | 将 x 轴锚定在零。 |
| `includeZero_y` | toggle | on / off | `false` | conditional | 将 y 轴锚定在零。 |

### ![](chart-icon-bullet.svg) Bullet Chart

**编码通道：** `y`, `x`, `goal`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |

## 分布

### ![](chart-icon-histogram.svg) Histogram

**编码通道：** `x`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `binCount` | number | 5 – 50 (step 1) | `Auto` | always | 最大分箱上限；Auto 由后端选择。 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |

### ![](chart-icon-density.svg) Density Plot

**编码通道：** `x`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `bandwidth` | number | 0.05 – 2 (step 0.05) | `0` | always | 核密度带宽（0 = 自动）。 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |

### ![](chart-icon-ecdf.svg) ECDF Plot

**编码通道：** `x`, `color`, `detail`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `showPoints` | toggle | on / off | `false` | always | 在线上叠加点标记。 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |
| `logScale_x` | toggle | on / off | `false` | conditional | 在 x 轴上使用对数/symlog 比例尺。 |
| `logScale_y` | toggle | on / off | `false` | conditional | 在 y 轴上使用对数/symlog 比例尺。 |
| `includeZero_x` | toggle | on / off | `false` | conditional | 将 x 轴锚定在零。 |
| `includeZero_y` | toggle | on / off | `false` | conditional | 将 y 轴锚定在零。 |

### ![](chart-icon-violin.svg) Violin Plot

**编码通道：** `x`, `y`, `color`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `bandwidth` | number | 0.05 – 2 (step 0.05) | `0` | always | 核密度带宽（0 = 自动）。 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |

### ![](chart-icon-box-plot.svg) Boxplot

**编码通道：** `x`, `y`, `color`, `opacity`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `whiskerMethod` | choice | `iqr` (Tukey (1.5 × IQR)), `minmax` (Min–Max) | `iqr` | always | 须线 |
| `showOutliers` | toggle | on / off | `true` | conditional | 异常值 |
| `dodge` | choice | `auto` (Auto), `local` (Local (compact)), `global` (Global (aligned)) | `auto` | conditional | Dodge |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |
| `logScale_x` | toggle | on / off | `false` | conditional | 在 x 轴上使用对数/symlog 比例尺。 |
| `logScale_y` | toggle | on / off | `false` | conditional | 在 y 轴上使用对数/symlog 比例尺。 |
| `includeZero_x` | toggle | on / off | `false` | conditional | 将 x 轴锚定在零。 |
| `includeZero_y` | toggle | on / off | `false` | conditional | 将 y 轴锚定在零。 |

### ![](chart-icon-pyramid.svg) Pyramid Chart

**编码通道：** `x`, `y`, `color`

_无模板专属参数。_

### ![](chart-icon-candlestick.svg) Candlestick Chart

**编码通道：** `x`, `open`, `high`, `low`, `close`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |
| `logScale_x` | toggle | on / off | `false` | conditional | 在 x 轴上使用对数/symlog 比例尺。 |
| `logScale_y` | toggle | on / off | `false` | conditional | 在 y 轴上使用对数/symlog 比例尺。 |
| `includeZero_x` | toggle | on / off | `false` | conditional | 将 x 轴锚定在零。 |
| `includeZero_y` | toggle | on / off | `false` | conditional | 将 y 轴锚定在零。 |

## 折线与面积

### ![](chart-icon-line.svg) Line Chart

**编码通道：** `x`, `y`, `color`, `strokeDash`, `detail`, `opacity`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `interpolate` | choice | Default (linear) _(default)_, `linear` (Linear), `monotone` (Monotone (smooth)), `step` (Step), `step-before` (Step Before), `step-after` (Step After), `basis` (Basis (smooth)), `cardinal` (Cardinal), `catmull-rom` (Catmull-Rom) | — | always | 折线或面积插值方法。 |
| `showPoints` | toggle | on / off | `false` | always | 在线上叠加点标记。 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |
| `logScale_x` | toggle | on / off | `false` | conditional | 在 x 轴上使用对数/symlog 比例尺。 |
| `logScale_y` | toggle | on / off | `false` | conditional | 在 y 轴上使用对数/symlog 比例尺。 |
| `includeZero_x` | toggle | on / off | `false` | conditional | 将 x 轴锚定在零。 |
| `includeZero_y` | toggle | on / off | `false` | conditional | 将 y 轴锚定在零。 |
| `xAxisType` | choice | `temporal` (Temporal), `nominal` (Discrete) | — | conditional | 将 x 轴解释为连续时间比例尺或离散波段。 |
| `yAxisType` | choice | `temporal` (Temporal), `nominal` (Discrete) | — | conditional | 将 y 轴解释为连续时间比例尺或离散波段。 |

### Sparkline

**编码通道：** `x`, `y`, `color`, `detail`, `row`, `column`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `interpolate` | choice | Default (linear) _(default)_, `linear` (Linear), `monotone` (Monotone (smooth)), `step` (Step), `step-before` (Step Before), `step-after` (Step After), `basis` (Basis (smooth)), `cardinal` (Cardinal), `catmull-rom` (Catmull-Rom) | — | always | 折线或面积插值方法。 |
| `baseline` | choice | `mean` (Average), `zero` (Zero), `median` (Median), `none` (None) | `mean` | always | 参考线 |
| `trendWidth` | number | 80 – 600 (step 10) | `240` | always | 迷你图宽度 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |
| `logScale_x` | toggle | on / off | `false` | conditional | 在 x 轴上使用对数/symlog 比例尺。 |
| `logScale_y` | toggle | on / off | `false` | conditional | 在 y 轴上使用对数/symlog 比例尺。 |
| `includeZero_x` | toggle | on / off | `false` | conditional | 将 x 轴锚定在零。 |
| `includeZero_y` | toggle | on / off | `false` | conditional | 将 y 轴锚定在零。 |

### ![](chart-icon-bump.svg) Bump Chart

**编码通道：** `x`, `y`, `color`, `detail`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |
| `logScale_x` | toggle | on / off | `false` | conditional | 在 x 轴上使用对数/symlog 比例尺。 |
| `logScale_y` | toggle | on / off | `false` | conditional | 在 y 轴上使用对数/symlog 比例尺。 |
| `includeZero_x` | toggle | on / off | `false` | conditional | 将 x 轴锚定在零。 |
| `includeZero_y` | toggle | on / off | `false` | conditional | 将 y 轴锚定在零。 |

### ![](chart-icon-slope.svg) Slope Chart

**编码通道：** `x`, `y`, `color`, `detail`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |
| `logScale_x` | toggle | on / off | `false` | conditional | 在 x 轴上使用对数/symlog 比例尺。 |
| `logScale_y` | toggle | on / off | `false` | conditional | 在 y 轴上使用对数/symlog 比例尺。 |
| `includeZero_x` | toggle | on / off | `false` | conditional | 将 x 轴锚定在零。 |
| `includeZero_y` | toggle | on / off | `false` | conditional | 将 y 轴锚定在零。 |

### ![](chart-icon-area.svg) Area Chart

**编码通道：** `x`, `y`, `color`, `opacity`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `interpolate` | choice | Default (linear) _(default)_, `linear` (Linear), `monotone` (Monotone (smooth)), `step` (Step), `step-before` (Step Before), `step-after` (Step After), `basis` (Basis (smooth)), `cardinal` (Cardinal), `catmull-rom` (Catmull-Rom) | — | always | 折线或面积插值方法。 |
| `opacity` | number | 0.1 – 1 (step 0.1) | `0.7` | always | 标记不透明度。 |
| `stackMode` | choice | Stacked (default) _(default)_, `normalize` (Normalize (100%)), `center` (Center), `layered` (Layered (overlap)) | — | conditional | 重叠系列的堆叠策略。 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |
| `xAxisType` | choice | `temporal` (Temporal), `nominal` (Discrete) | — | conditional | 将 x 轴解释为连续时间比例尺或离散波段。 |
| `yAxisType` | choice | `temporal` (Temporal), `nominal` (Discrete) | — | conditional | 将 y 轴解释为连续时间比例尺或离散波段。 |

### ![](chart-icon-streamgraph.svg) Streamgraph

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `interpolate` | choice | Default (linear) _(default)_, `linear` (Linear), `monotone` (Monotone (smooth)), `step` (Step), `step-before` (Step Before), `step-after` (Step After), `basis` (Basis (smooth)), `cardinal` (Cardinal), `catmull-rom` (Catmull-Rom) | — | always | 折线或面积插值方法。 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |

### ![](chart-icon-range-area.svg) Range Area Chart

**编码通道：** `x`, `y`, `y2`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `interpolate` | choice | Default (linear) _(default)_, `linear` (Linear), `monotone` (Monotone (smooth)), `step` (Step), `step-before` (Step Before), `step-after` (Step After), `basis` (Basis (smooth)) | — | always | 折线或面积插值方法。 |
| `opacity` | number | 0.1 – 1 (step 0.1) | `0.5` | always | 标记不透明度。 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |

## 圆形图

### ![](chart-icon-pie.svg) Pie Chart

**编码通道：** `size`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `innerRadius` | number | 0 – 100 (step 5) | `0` | always | 内半径占外半径的百分比。 |
| `sortSlices` | choice | `none` (Data order), `descending` (Largest first), `ascending` (Smallest first) | `none` | always | 排序扇区 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |

### ![](chart-icon-rose.svg) Rose Chart

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `padAngle` | number | 0 – 0.1 (step 0.005) | `0` | always | 径向段之间的角度间距。 |
| `alignment` | choice | `left` (Left (default)), `center` (Center) | — | always | 径向图的段对齐方式。 |
| `sortSlices` | choice | `none` (Data order), `descending` (Largest first), `ascending` (Smallest first) | `none` | always | 排序扇区 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |

### ![](chart-icon-radar.svg) Radar Chart

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `filled` | toggle | on / off | `true` | always | 填充雷达图封闭区域。 |
| `fillOpacity` | number | 0 – 0.5 (step 0.1) | `0.15` | always | 面积或区域的填充不透明度。 |
| `strokeWidth` | number | 0.5 – 4 (step 0.5) | `1.5` | always | 线条描边宽度。 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |
| `logScale_x` | toggle | on / off | `false` | conditional | 在 x 轴上使用对数/symlog 比例尺。 |
| `logScale_y` | toggle | on / off | `false` | conditional | 在 y 轴上使用对数/symlog 比例尺。 |
| `includeZero_x` | toggle | on / off | `false` | conditional | 将 x 轴锚定在零。 |
| `includeZero_y` | toggle | on / off | `false` | conditional | 将 y 轴锚定在零。 |

## 表格与地图

### ![](chart-icon-heat-map.svg) Heatmap

**编码通道：** `x`, `y`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `showTextLabels` | toggle | on / off | `false` | always | 在标记上渲染数值标签。 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |
| `xAxisType` | choice | `temporal` (Temporal), `nominal` (Discrete) | — | conditional | 将 x 轴解释为连续时间比例尺或离散波段。 |
| `yAxisType` | choice | `temporal` (Temporal), `nominal` (Discrete) | — | conditional | 将 y 轴解释为连续时间比例尺或离散波段。 |

### ![](chart-icon-bar-table.svg) Bar Table

**编码通道：** `y`, `x`, `color`, `column`, `row`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `maxRows` | number | 5 – 100 (step 1) | `20` | always | 显示的最大表格行数。 |
| `showPercent` | toggle | on / off | `false` | conditional | 将每个值显示为占总数的百分比。 |
| `independentYAxis` | toggle | on / off | `false` | conditional | 为分面使用独立的 y 轴比例尺。 |

### ![](chart-icon-kpi-card.svg) KPI Card

**编码通道：** `metric`, `value`, `goal`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `layout` | choice | `horizontal` (Horizontal), `vertical` (Vertical), `grid` (Grid) | `grid` | always | 布局 |
| `style` | toggle | on / off | `true` | always | 卡片样式 |
| `behindThreshold` | number | 0 – 1 (step 0.05) | `0.5` | conditional | 落后阈值 |
| `logScale_x` | toggle | on / off | `false` | conditional | 在 x 轴上使用对数/symlog 比例尺。 |
| `logScale_y` | toggle | on / off | `false` | conditional | 在 y 轴上使用对数/symlog 比例尺。 |
| `includeZero_x` | toggle | on / off | `false` | conditional | 将 x 轴锚定在零。 |
| `includeZero_y` | toggle | on / off | `false` | conditional | 将 y 轴锚定在零。 |

### ![](chart-icon-world-map.svg) Map

**编码通道：** `longitude`, `latitude`, `color`, `size`, `opacity`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `region` | choice | `auto` (Auto-detect), `us` (United States), `world` (World) | `auto` | always | 区域 |
| `projection` | choice | `default` (Default), `mercator` (Mercator), `equalEarth` (Equal Earth), `orthographic` (Orthographic (Globe)), `stereographic` (Stereographic), `conicEqualArea` (Conic Equal Area), `conicEquidistant` (Conic Equidistant), `azimuthalEquidistant` (Azimuthal Equidistant), `mollweide` (Mollweide) | `default` | conditional | 投影 |
| `projectionCenter` | choice | Default _(default)_, `0,0` (World (Atlantic) [0, 0]), `150,0` (World (Pacific) [150, 0]), `105,35` (China [105, 35]), `-98,39` (USA [-98, 39]), `10,50` (Europe [10, 50]), `138,36` (Japan [138, 36]), `78,22` (India [78, 22]), `-52,-14` (Brazil [-52, -14]), `134,-25` (Australia [134, -25]), `100,60` (Russia [100, 60]), `20,0` (Africa [20, 0]), `45,28` (Middle East [45, 28]), `115,5` (Southeast Asia [115, 5]), `-60,-15` (South America [-60, -15]), `-100,45` (North America [-100, 45]), `-2,54` (UK [-2, 54]), `10,51` (Germany [10, 51]), `2,47` (France [2, 47]), `128,36` (Korea [128, 36]) | — | conditional | 中心 |
| `logScale_x` | toggle | on / off | `false` | conditional | 在 x 轴上使用对数/symlog 比例尺。 |
| `logScale_y` | toggle | on / off | `false` | conditional | 在 y 轴上使用对数/symlog 比例尺。 |
| `includeZero_x` | toggle | on / off | `false` | conditional | 将 x 轴锚定在零。 |
| `includeZero_y` | toggle | on / off | `false` | conditional | 将 y 轴锚定在零。 |

### ![](chart-icon-us-map.svg) Choropleth

**编码通道：** `id`, `color`, `detail`

| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 描述 |
|---|---|---|---|---|---|
| `region` | choice | `auto` (Auto-detect), `us` (United States), `world` (World) | `auto` | always | 区域 |
