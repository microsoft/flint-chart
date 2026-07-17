# 示例：数据故事

简单的折线图足以理解 Flint 规范的结构。当问题变得更复杂时，才真正有趣起来。

本示例使用游戏市场数据集：一组游戏组合的月度活跃用户，按月份、标题、游戏类型和地区拆分。我们将用同一份源数据，以三种方式推进叙事：

- **概览**：用户在哪里？各地区趋势有何不同？
- **变化**：是什么推动组合上升或下降？
- **构成**：最新组合按地区、类型和标题如何分解？

先说清楚一点：Flint 是图表编译器，不是完整的 ETL 引擎。它期望你传入的行已经匹配你想绘制的视图。在本故事中，各视图均源自同一数据集，但部分图表使用的是已汇总的、可直接作图的表格。瀑布图有意保持简单：它使用按月的 `period` / `newUsers` 行，模板将首尾两个 period 视为起始/结束柱。

这仍是重点。一旦视图存在，图表请求就保持精简：DataSpec 说明视图字段的含义，ChartSpec 说明如何绘制。

## 从真实源数据开始

源表每个 `period × game × region` 一行，每个标题附带游戏类型：

| period | game | gameType | region | newUsers | totalUsers |
|--------|------|----------|--------|----------|------------|
| 2025-01 | Starforge Tactics | PC / Client | N | 5997 | 10173 |
| 2025-01 | Starforge Tactics | PC / Client | E | 682 | 4475 |
| 2025-01 | Starforge Tactics | PC / Client | S | -886 | 1917 |
| 2025-01 | Starforge Tactics | PC / Client | W | -1619 | 605 |
| 2025-01 | Neon Drift 2049 | Console | N | 8195 | 14920 |
| ... | ... | ... | ... | ... | ... |

DataSpec 为这些列命名并记录其含义：

```json
{
  "data": { "values": [ /* period × game × gameType × region rows */ ] },
  "semantic_types": {
    "period": "YearMonth",
    "game": "Category",
    "gameType": "Category",
    "newUsers": "Profit",
    "totalUsers": "Quantity",
    "region": { "semanticType": "Category", "sortOrder": ["N", "E", "S", "W"] }
  }
}
```

这些语义标签承载的不只是名称：

- `YearMonth` 告诉 Flint 将 `period` 解析为时间并格式化月份刻度。
- `Quantity` 为 `totalUsers` 提供数值轴。
- `Profit` 将 `newUsers` 标记为有符号值，因此热力图可在零附近使用发散色标。
- `region.sortOrder` 使地区面板按 N、E、S、W 排列，而不是沿用原始表中的任意顺序。

下方示例使用从该源数据派生的、可直接作图的视图：

- 折线视图：按 `region × period × gameType` 对 `sum(totalUsers)` 汇总；
- 分组柱状视图：按 `period × gameType` 对 `sum(totalUsers)` 汇总；
- 瀑布视图：按 `period` 对 `sum(newUsers)` 汇总，首尾 period 自动视为起始/结束柱；
- 热力图视图：按 `game × period` 对 `sum(newUsers)` 汇总；
- 旭日图视图：最新月份的 `region × gameType × game` 行，以 `totalUsers` 作为大小。

AI 智能体、SQL 查询、notebook 或应用层可以准备这些视图。Flint 随后处理图表相关的编译：坐标轴、标记、颜色、布局与后端语法。

## 第一幕：概览

首先提出一个宽泛问题：用户在哪里？

折线视图包含 `region`、`period`、`gameType` 和 `totalUsers`。图表按地区拆成多个面板，每种游戏类型对应一条线：

```json
"chart_spec": {
  "chartType": "Line Chart",
  "encodings": {
    "column": { "field": "region" },
    "x": { "field": "period" },
    "y": { "field": "totalUsers" },
    "color": { "field": "gameType" }
  }
}
```

```flint-chart
{ "generator": "Omni: Line", "canvasSize": { "width": 360, "height": 520 } }
```

值得注意：

- ChartSpec 指定 `column: region`；Flint 自动将各地区排成多个面板。
- 因 DataSpec 声明 `YearMonth`，`period` 保持为时间轴。
- 图表会为多个面板留出足够空间，而不是把它们全挤进 `baseSize`。

接下来将视图从地区趋势面板切换为月度对比。分组柱状视图包含 `period`、`gameType` 和 `totalUsers`：

```json
"chart_spec": {
  "chartType": "Grouped Bar Chart",
  "encodings": {
    "x": { "field": "period" },
    "y": { "field": "totalUsers" },
    "color": { "field": "gameType" },
    "group": { "field": "gameType" }
  }
}
```

```flint-chart
{ "generator": "Omni: Grouped Bar", "canvasSize": { "width": 640, "height": 340 }, "options": { "maxStretch": 1 } }
```

这是第一个回报：只需更换模板和少量通道，图表设计就从多面板折线图变为分组柱状图。虽然数据汇总方式不同，字段语义保持不变。

## 第二幕：变化

概览说明用户在哪里。现在问组合是如何到达那里的。对于这个瀑布图，视图仅为每月一行：`period` 加上组合范围内汇总的月度 `newUsers`。无需显式的 start/end/type 列；模板将第一个 period 视为起始柱，最后一个 period 视为结束柱，中间月份为增量。

ChartSpec 只是映射：

```json
"chart_spec": {
  "chartType": "Waterfall Chart",
  "encodings": {
    "x": { "field": "period" },
    "y": { "field": "newUsers" }
  }
}
```

```flint-chart
{ "generator": "Omni: Waterfall", "canvasSize": { "width": 640, "height": 360 }, "options": { "maxStretch": 1 } }
```

定制部分在模板中：连接线、起始/结束推断、增量柱，以及后端特定的瀑布语法。规范只命名 period 与度量。

要查看哪些游戏驱动了波动，使用另一个派生视图：按 `game × period` 对 `sum(newUsers)` 汇总。热力图将月份放在 x、游戏放在 y，净用户数映射到颜色：

```json
"chart_spec": {
  "chartType": "Heatmap",
  "encodings": {
    "x": { "field": "period" },
    "y": { "field": "game" },
    "color": { "field": "newUsers" }
  }
}
```

```flint-chart
{ "generator": "Omni: Heatmap", "canvasSize": { "width": 640, "height": 460 }, "options": { "maxStretch": 1 } }
```

这里语义类型做了简单图表中容易忽略的工作。因 `newUsers` 被当作 `Profit` 处理，Flint 知道零有意义，可使用红蓝发散色标，而非通用顺序渐变。

## 第三幕：构成

最后问最新组合由什么构成。

旭日图视图过滤到最新月份，保留 `region`、`gameType`、`game` 和 `totalUsers`。ChartSpec 描述层次结构：地区，再游戏类型，再单个游戏，以 total users 作为大小。

```json
"chart_spec": {
  "chartType": "Sunburst Chart",
  "encodings": {
    "color": { "field": "region" },
    "group": { "field": "gameType" },
    "detail": { "field": "game" },
    "size": { "field": "totalUsers" }
  }
}
```

```flint-chart
echarts
{ "generator": "Omni: Sunburst", "canvasSize": { "width": 460, "height": 460 } }
```

此图也演示了后端切换。Vega-Lite 没有原生 sunburst 图元，因此渲染使用 ECharts。输入仍读起来像 Flint：字段、通道、语义。因设计需要 ECharts 原生图表类型，后端随之改变。

## 本示例说明了什么

同一份源数据集经过五个可直接作图的视图与五种图表设计：

- 多面板折线图展示地区趋势；
- 分组柱状图进行月度对比；
- 瀑布图展示组合变化；
- 热力图展示游戏×月份变动；
- 旭日图展示层次构成。

三项 Flint 特性承担了大部分图表工作：

- **语义类型决定底层设置。** 时间解析、定量轴、发散颜色和面板顺序都来自 DataSpec。
- **自动布局保持复杂视图可读。** 多面板图、分组柱状图、密集热力图和径向图都能根据可用画布扩展或缩放。
- **图表设计和渲染后端都容易切换。** 只要视图包含所需字段，ChartSpec 通常只需修改几行；图表类型受支持时，同一份输入可以编译到 Vega-Lite、ECharts 或 Chart.js。

这就是示例背后的现实承诺：准备正确视图，标注字段含义，然后更换图表设计而无需手写后端规范。

## 下一步

- [入门指南](/documentation/getting-started) 用一张小图介绍 DataSpec 与 ChartSpec。
- [Gallery](/gallery) 展示每种图表模板与后端组合。
- [Semantic Type](/documentation/semantic-types) 说明语义标签如何驱动时间解析、颜色与聚合行为等默认值。
- [自动布局算法](/documentation/layout-model) 说明 Flint 如何为密集、多面板和层次视图计算尺寸。
- [在线编辑器](/editor) 可实时编辑 Flint 规范。
