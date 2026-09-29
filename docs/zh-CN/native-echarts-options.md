# 原生 ECharts 能力（逃生口）

Flint 的语义层覆盖的是常见情况，而 ECharts 远大于任何一组通道：第二根数值轴、
柱线混排、`markLine` / `markArea`、`dataZoom`、`visualMap`、轴与 tooltip 的
formatter、逐系列 `areaStyle`、自定义 `grid`……列不完。没有出口的话，需要这些
能力的调用方只能放弃 Flint 手写 option，连带丢掉它本来要用的语义层。

`chart_spec.echarts` 就是这个出口。它是**原生逃生口，不是第二套语义语言**：它
不替你决定任何和数据有关的事，只把你写的东西合并到 Flint 编出来的 option 上；
并且可以选择让新增系列直接绑定数据列，免得为了加一条线重新序列化整个数据集。

```jsonc
{
  "chartType": "Line Chart",
  "encodings": { "x": { "field": "month" }, "y": { "field": "revenue" } },
  "echarts": {
    "legend": { "show": true, "top": 6 },
    "yAxis": [{ "name": "营收" }, { "name": "毛利率", "position": "right" }],
    "series": [
      { "name": "营收", "lineStyle": { "width": 2 } },
      { "type": "line", "field": "margin", "name": "毛利率", "axis": "right", "lineStyle": { "type": "dashed" } }
    ]
  }
}
```

上面这段编出来就是一张真正的双轴图：Flint 自己那条线留在左轴，新增的
`margin` 系列落在右轴——不需要任何模板支持，也不需要改 `encodings`。

<p align="center">
  <img src="figs/native-echarts-dual-axis.png" alt="语义层的系列在左轴、绑列新增的系列在右侧虚线轴上的折线图。" width="70%">
</p>

## 放在哪

放在 `chart_spec` 里，与 `encodings`、`chartProperties` 同级。它以名字标明后端，
其他装配器会忽略它——和 `theme_spec` 只属于 Vega-Lite 是同一惯例。把它交给
Vega-Lite 构建是无害的，也不会生效。

补丁**最后**应用（在布局计算与模板自身的后处理之后），所以你写的东西优先于
Flint 在上游做出的任何决定。

## 合并语义

整个契约就四条：

| 补丁里的值 | 行为 |
|---|---|
| 普通对象 | 逐键递归合并 |
| 普通对象组成的数组（`series`、`xAxis`、`yAxis` 等） | **按下标逐项**合并；超出基数组长度的条目追加 |
| 其他数组（某系列的 `data`、`color` 列表） | **整体替换** |
| 其他（标量、`null`） | 替换 |

「对象数组按下标合并」是单条系列可寻址的关键：
`"series": [{}, { "lineStyle": { "type": "dashed" } }]` 就能只改第二条线，不必
把第一条重抄一遍；基系列保留自己的 `data`，只有你点名的键会变。

空数组表示「没有要说的」，绝不会把 Flint 刚构造好的值清空。

以 `_` 开头的键是 Flint 保留的（`_warnings`、`_pivot`、`_viewports` 等），会被
丢弃并在 `_warnings` 里留一条 `info`。

## 把系列绑到数据列

系列条目可以用 `field` / `fields` 代替 `data`：

| 键 | 含义 |
|---|---|
| `field` | 一列 → 一条系列；`data` 从数据行读成 `[类目, 数值]` 对 |
| `fields` | 多列 → 各成一条系列，默认以列名命名 |
| `categoryField` | 与哪一列配对（默认取图表自己的 x 字段） |
| `axis` | `"right"` 表示这条系列走右轴 |

**绑列的条目是「新增」，不绑列的条目是「按下标修补」。** 两种意图可以写在同一个
数组里；新增系列在补丁里的位置无关紧要，只有新增之间的先后有意义。

`"axis": "right"` 是语法糖：该系列拿到 `yAxisIndex: 1`，图表若没有右轴就建一根
（并把 grid 的右边距留出来）。如果你自己补了 `yAxis`，以你的为准。

两种情况下绑列会跳过并给出警告：图表没有类目字段（比如饼图，此时系列拿到纯数值
数组）；图表是分面的（一个 option 装所有面板，「那个」类目轴是有歧义的，请显式给
`data`）。

## 它不做什么

- **不增加通道**：`chart_spec.encodings` 仍然只接受模板声明的通道；通道之外的能力
  走这个出口，而不是新造一个通道。
- **不校验 ECharts 自己的词表**：没见过的键照传，ECharts 自己忽略它——和手写
  option 一样。
- **不造数据**：原生系列只能绑已有列，不能算新列。先在 SQL 或
  `chartProperties.aggregate` 里聚合好再绑。
- **只有 ECharts 后端读它**：Chart.js、Plotly、Excel、Vega-Lite 构建会忽略该键。

## 相关

- [ECharts 图表参考](./reference-echarts.md)——每种图型的通道与 `chartProperties`。
- [API 参考](./api-reference.md)——`ChartAssemblyInput` 与 `chart_spec`。
