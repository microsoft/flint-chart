# 使用交互

`interaction_spec` 与 `chart_spec`、`theme_spec` 并列位于 `ChartAssemblyInput` 中。chart spec 说明图表**表达什么**，theme spec 说明图表**长什么样**，interaction spec 说明读者点击、悬停、拖动或按键时图表**如何响应**。

每种行为都来自一个**预设（preset）**：Flint 内置的、有名字的交互，例如 `click-highlight` 或 `navigate`。你列出想要的预设和各自的选项，Flint 挂载图表能够支持的那些，并告诉你哪些无法支持。

> `interaction_spec` 只影响 Vega-Lite 交互层。装配器和静态后端不会读取它；对这些后端，`validateChart` 会报告该字段被忽略。

## 结构

```json
{
  "chart_spec": { "chartType": "Bar Chart", "encodings": { "x": "country", "y": "gdp", "color": "region" } },
  "interaction_spec": {
    "interactions": [
      { "type": "click-highlight" },
      { "type": "legend-toggle" },
      { "type": "navigate", "options": { "axes": "y", "pan": false, "reset": ["double-click", "escape"] } }
    ]
  }
}
```

| 键 | 含义 |
|---|---|
| `interactions` | 每个交互一项，按挂载顺序排列。 |
| `interactions[].type` | 生成该交互的预设，同时也是交互的默认 `id`。 |
| `interactions[].id` | 可选。同一图表两次使用同一预设时用来区分，也是 `flint-interaction` 事件中的名字。 |
| `interactions[].options` | 预设自己的选项，始终嵌套在 `options` 下，不要与 `type` 并列。 |
| `assistedTargeting` | 可选。指针吸附到附近的标记；`false` 要求精确命中，对象可设置 `maxDistance`、`indicator`、`details`。 |
| `keyboardTargeting` | 可选。允许读者用键盘在标记间移动。 |

条目没有字符串简写：单独的 `"click-highlight"` 会被拒绝，`{ "type": "click-highlight" }` 是最小形式。

## 预设一览

| 类型 | 读者的操作 | 需要图表提供 | 默认重置 |
|---|---|---|---|
| `click-highlight` | 点击标记、图例项或坐标轴标签以强调它并淡化其余。 | 元素 | click-none, escape |
| `click-group-focus` | 点击标记以强调同组的所有标记（`groupBy`）。 | 元素 | click-none, escape |
| `hover-group-focus` | 悬停标记以预览其组（必须提供 `groupBy`）。 | 元素 | 无 |
| `click-annotate` | 点击标记以固定一个带数值的注释。 | 元素 | click-none, escape |
| `context-activate` | 右键或长按，把上下文目标交给宿主。 | 元素 | 无 |
| `long-press` | 长按标记以激活。 | 元素 | click-none, escape |
| `double-activate` | 双击标记以激活。 | 元素 | click-none, escape |
| `inspect` | 在绘图区移动，读取最近标记的值。 | 元素 | 无 |
| `inspect-index` | 在绘图区移动，读取同一 x 位置上所有系列的值（`seriesBy` 指定单个系列）。 | 索引轴 | escape |
| `select` | 拖出矩形以强调其中的标记。 | 元素、直角坐标区域 | click-none, escape |
| `lasso-select` | 自由绘制区域以强调其中的标记。 | 元素、直角坐标区域 | click-none, escape |
| `brush-x`、`brush-y` | 沿一条轴拖出区间；在极坐标图上，x 刷选是一个角度扇区。 | 元素、直角坐标区域 | click-none, escape |
| `brush-angle` | 在饼图、环图、玫瑰图或雷达图上拖出角度扇区。 | 元素、角度区域 | click-none, escape |
| `linked-brush` | 刷选标记，在其他视图中高亮相同的组（必须提供 `groupBy`）。 | 元素、直角坐标区域 | click-none, escape |
| `brush-zoom` | 拖出矩形并放大到该范围。 | 导航 | double-click, escape |
| `navigate` | 拖动平移、滚轮或双指缩放连续坐标轴（`axes`、`pan`、`domainGuard`）。 | 导航 | double-click |
| `legend-toggle` | 点击图例项以隐藏或恢复其系列。 | 离散图例 | 无 |
| `axis-highlight` | 点击离散坐标轴标签以强调该类别。 | 离散坐标轴 | click-none, escape |
| `drag-reorder` | 拖动离散坐标轴标签以改变类别顺序。 | 可重排坐标轴 | 无 |

选项名与 `flint-chart/interactive` 中对应工厂函数接受的选项一致；TypeScript 调用方可用该入口的 `InteractionPresetSpec` 获得逐类型的精确形状。

## 重置手势

每个保留状态的预设都接受 `reset`，即让它回到中性状态的手势列表：

| 手势 | 含义 |
|---|---|
| `click-none` | 一次没有命中任何图表元素的点击：空白绘图区、边距、背景。 |
| `double-click` | 图表任意位置的双击。 |
| `escape` | 图表获得焦点时按下 Escape。带 `escape` 重置的图表在读者按下时获取焦点，因此 Escape 只作用于最后触碰的图表。 |

一个手势只重置列表中包含它的交互，各自按 id 处理。通过 surface 施加的宿主更新不会被手势重置。不保留状态的预设（`hover-group-focus`、`inspect`、`context-activate`）没有 `reset`，解析器会拒绝为其设置。

## 图表类型支持什么

每种图表类型声明它提供的属性：可解析为数据的标记、拖动区域、可导航的坐标轴、可重排的坐标轴、离散图例、离散坐标轴标签、索引轴。每个预设声明它需要的属性。图表类型提供了预设所需的全部属性时，该预设即受支持。

三个地方可以查看结果：

- [Vega-Lite 图表参考](/documentation/reference-vegalite) 为每种图表类型打印一行 **交互**。
- MCP 工具 `list_chart_types` 为每种图表类型返回 `interactions`。
- 交互实验室的 **Coverage** 页签展示每种图表类型对每个预设的支持情况。

数据仍可能在挂载时移除某个预设。柱状图支持 `legend-toggle`，但没有颜色字段的柱状图没有可切换的图例；`navigate` 需要连续且未分面的坐标轴；`drag-reorder` 需要绑定编码中有离散坐标轴。

## 警告

图表无法支持的条目会**带警告被丢弃**，图表仍然渲染。消息中会写明交互名、所需属性和图表类型：

```
Interaction "legend-toggle" requires a discrete legend; Bar Chart has none. The interaction was dropped.
```

两个条目也可能冲突：第二个 `navigate`、平移手势旁的拖动手势、或与 `double-click` 重置并存的 `double-activate`。后面的条目让步。

在哪里读取警告：

- `validateChart(input, 'vegalite')` 在渲染前返回它们，格式错误的 spec 以 `invalid_interaction_spec` 错误报告。
- `buildInteractiveChart(container, input)` 通过 `surface.warnings` 暴露它们，并在控制台记录一次。
- MCP 工具 `validate_chart` 返回同一列表。

格式错误的条目是错误而不是丢弃：未知的 `type`、放在 `options` 外的选项、放在 `options` 内的 `id`、缺少 `groupBy` 等必需选项、未知或不支持的 `reset` 手势、重复的 `id`。

## 代码与 spec，同一定义

spec 条目和工厂调用是同一交互的两种写法：

```ts
import { buildInteractiveChart, clickHighlight } from 'flint-chart/interactive';

// 来自 spec
buildInteractiveChart(container, { ...input, interaction_spec: { interactions: [{ type: 'click-highlight', options: { dimOpacity: 0.2 } }] } });

// 来自代码
buildInteractiveChart(container, input, { interactions: [clickHighlight({ dimOpacity: 0.2 })] });
```

两者可以同时出现在一张图表上；spec 条目先挂载。两边使用同一个 `id` 是错误。图表无法支持的代码定义会抛出异常，因为开发者能看到异常；spec 条目则被丢弃，因为智能体读取的是警告。

## 在哪里生效

`buildInteractiveChart()` 从输入中读取 `interaction_spec`。MCP 工具 `create_chart_view` 挂载同一交互层，因此智能体可以在请求图表的同一份 JSON 中请求行为。站点的编辑器和图库同样从 spec 挂载。
