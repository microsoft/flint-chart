# 示例：自动布局

Flint 的自动布局只有一个目标：让图表适应数据和容器，同时保持图形元素清晰可读。数据变密时，算法会结合压力模型和倾斜优化原则（banking），调整画布尺寸、元素间距、宽高比和多面板布局。

主要权衡是在图表内部压缩元素，与将图表拉伸超出 `baseSize` 之间的取舍。拉伸受 `canvasSize` 或默认增长上限约束，因此图表在需要时获得更多空间，但不会无限增长。

下面四个示例分别展示一种布局压力：
[带状轴](#带状轴) 用于类别与分箱，
[连续轴](#连续轴) 用于密集点、时间序列与多条线，
[径向图表](#径向图表) 用于扇区与辐条，以及
[面积布局](#面积布局) 用于紧凑的二维空间。
这些示例使用默认的增长上限，便于观察数据密度、`baseSize` 和 `elasticity` 如何影响布局。

## 带状轴

Bar、histogram、heatmap 与 boxplot 为每个项目分配一个槽位。在下方添加类别，观察图表变宽直至拉伸上限用尽。

```flint-playground
discrete
```

## 连续轴

Scatter、line 与 area 图表不为每行分配一个 band，但密集点与多系列仍会产生压力。在下方添加点或系列，观察轴更渐进地拉伸。

```flint-playground
continuous
```

## 径向图表

Pie、rose、radar 及类似闭环图表需要足够的周长容纳每个扇区或辐条。在下方添加扇区，观察当请求的画布过紧时图表如何增大半径。

```flint-playground
circumference
```

## 面积布局

Treemap 与其他填充式二维布局需要足够总面积使矩形保持可读。在下方添加叶子节点，观察画布按面积而非单轴扩展。

```flint-playground
area
```

## 什么会被调整尺寸

自动布局只调整图表占用的空间：坐标轴跨度、分类间距、子图尺寸、径向空间、填充布局面积和整体绘图区都可以增大或缩小。数据、语义编码、颜色和格式保持不变。

## 布局模式

通过设置 `baseSize`、`canvasSize` 或两者选择模式：

| 模式 | 设置 | 行为 |
|------|------|------|
| **默认自动布局** | 均不设置 | Flint 以 `400 × 320` 为目标，数据密集时可以增大。 |
| **目标尺寸** | `baseSize` | Flint 以指定尺寸为目标，需要更多空间时仍可增大。 |
| **固定空间** | `canvasSize` | Flint 将图表放入指定空间且不溢出，适合尺寸固定的仪表盘和卡片。 |
| **限制增长** | 两者都设置 | Flint 从 `baseSize` 开始，按需增大，但不超过 `canvasSize`。 |

完整公式与实现细节见
[Auto Layout Algorithm](/documentation/layout-model)。

## 控制预算

探索时使用默认值。设置 `baseSize` 更改目标，仅当周围 UI 有硬性尺寸约束时再添加 `canvasSize` 上限：

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

此处图表目标为 `480 × 320`，可拉伸至 `720 × 480` 上限。
去掉 `canvasSize` 可让图表增长至 `baseSize × maxStretch`，或降低
`options.maxStretch` 以收紧固定仪表盘单元格的默认上限。

对于**固定槽位**，最简形式是单独设置 `canvasSize` —— Flint 将其视为图表填充且收缩适配、永不溢出的盒子：

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

## 字体大小

文字（坐标轴刻度标签、轴标题、图例、图表标题）会围绕各后端的原生字号随画布自适应，
因此小图不会拥挤、大图也不会过小。要整体放大或缩小文字，可在 `options` 中设置两个基准字号：

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

`baseLabelFontSize` 设置坐标轴刻度字号；`baseTitleFontSize` 设置标题类字号（轴标题、图例、
图表标题）。默认取各后端原生字号（Vega-Lite 10 / 11；ECharts 与 Chart.js 12 / 12；Plotly 12 / 14）。
密集坐标轴仍会在此基准上缩小、旋转并截断刻度标签以避免重叠。

要了解多面板布局和这些控件背后的模型，请继续阅读[自动布局算法](/documentation/layout-model)。
