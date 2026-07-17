# 示例：自动布局

Flint 的自动布局有一个目标：让图表适配数据与容器，同时保持 mark 可读。算法使用压力模型与 banking，在数据更密集时调整画布尺寸、mark 间距、宽高比与分面布局。

主要权衡是在图表内部压缩元素，与将图表拉伸超出 `baseSize` 之间的取舍。拉伸受 `canvasSize` 或默认增长上限约束，因此图表在需要时获得更多空间，但不会无限增长。

先试四个 demo，每种展示一种布局压力：
[带状轴](#带状轴) 用于类别与分箱，
[连续轴](#连续轴) 用于密集点、时间序列与多条线，
[径向图表](#径向图表) 用于扇区与辐条，以及
[面积布局](#面积布局) 用于紧凑的二维空间。
demo 将增长上限保持在库默认值，以便控件聚焦数据密度、`baseSize` 与 `elasticity`。

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

自动布局改变同一张图表周围的空间：轴跨度、band 步长、分面单元、径向空间、填充布局面积与整体绘图区可增大或缩小。数据、语义编码、颜色与格式保持不变。

## 布局模式

通过设置 `baseSize`、`canvasSize` 或两者选择模式：

| 模式 | 设置 | 行为 |
|------|------|------|
| **Default auto layout** | neither | Flint 以 `400 × 320` 为目标，数据密集时可增长。 |
| **Target size** | `baseSize` | Flint 以你偏好的尺寸为目标，但可读性需要时仍可增长。 |
| **Fixed slot** | `canvasSize` | Flint 将图表适配该盒子且永不溢出。适用于有硬性尺寸的仪表盘与卡片。 |
| **Bounded growth** | both | Flint 从 `baseSize` 出发，仅在需要时增长，且不超过 `canvasSize`。 |

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

关于分面与这些控件背后的模型细节，请继续阅读 [Auto Layout Algorithm](/documentation/layout-model)。
