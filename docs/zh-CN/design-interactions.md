# 交互设计

读者点击、悬停、拖动或按键时，Flint 图表如何响应；以及一种图表类型如何决定自己能够支持其中的哪些行为。

> 本文解释模型本身。写法指南见[使用交互](interaction-spec.md)，API 见 [API 参考](api-reference.md)。

## 目录

- [§1 概览](#1-概览)
- [§2 交互模型](#2-交互模型)
- [§3 规范](#3-规范)
- [§4 图表语义](#4-图表语义)
- [§5 能力与准入](#5-能力与准入)
- [§6 重置](#6-重置)
- [§7 流水线](#7-流水线)
- [§8 宿主与发现](#8-宿主与发现)
- [§9 扩展模型](#9-扩展模型)
- [附录：声明表](#附录声明表)

---

# §1 概览

一张 Flint 图表由一个 `ChartAssemblyInput` 中的三份文档组成：

| 文档 | 说明 | 读取方 |
|---|---|---|
| `chart_spec` | 图表表达什么：类型、编码、属性 | 所有装配器 |
| `theme_spec` | 图表长什么样 | Vega-Lite 装配器 |
| `interaction_spec` | 图表如何响应 | Vega-Lite 交互层 |

装配器从不读取 `interaction_spec`，静态渲染不受它影响。只有 `buildInteractiveChart()` 在图表装配完成后读取它。

行为来自**预设（preset）**：Flint 内置的、有名字的交互，如 `click-highlight` 或 `navigate`。代码通过工厂函数使用预设，`clickHighlight({ dimOpacity: 0.2 })`；spec 通过名字使用同一预设，`{ "type": "click-highlight", "options": { "dimOpacity": 0.2 } }`。注册表把名字映射到工厂函数，因此两者是同一定义的两种写法。下文的一切同时适用于两者。

图表能支持什么，由两个事实决定，分别在两个地方回答：

- **图表类型**在模板中声明它提供的属性。这是静态的，在任何数据到来之前就已知。
- **数据**在装配时确认依赖数据的属性：图例需要绑定离散的图例通道，导航需要连续坐标轴。

准入（admission）把预设所需与这张图表（类型加数据）所提供的进行比较。图表无法支持的 spec 条目会带警告被丢弃，图表仍然渲染；无法支持的代码定义会抛出异常，因为开发者能看到异常。

# §2 交互模型

## §2.1 定义

预设工厂返回一个 `CanvasInteractionDef`：

| 字段 | 作用 |
|---|---|
| `id` | 在更新和 `flint-interaction` 事件中标识该交互；默认为预设名 |
| `preset` | 生成它的预设；准入据此从核心表读取需求 |
| `eventSource` | 触发器：元素点击或悬停、拖动区域、导航手势 |
| `reset` | 使其回到中性状态的手势（§6） |
| `affordances` | 各目标类型的光标与悬停反馈 |
| `handle(event, context)` | 把已解析的语义事件变成 `ChartUpdate`，或返回 `null` |
| `origin` | 由解析器生成时为 `'spec'`；代码定义没有该字段 |

`ExternalInteractionDef` 没有手势。宿主通过 `surface.dispatch(id, payload)` 驱动它，其 `handle` 把载荷变成更新。联动仪表盘和叙事页面使用它。

## §2.2 事件源

三个家族，准入按其推理：

- **element**：对标记、图例项或坐标轴标签的点击、悬停、长按、双击或检视。需要能解析为数据的标记。
- **region**：拖出矩形、沿一条轴的区间、套索或角度扇区，并解析其中的标记。需要具备相应区域类型的绘图区。
- **navigation**：拖动平移、滚轮或双指缩放连续坐标轴，或地图上投影的范围。需要可导航的坐标轴。

## §2.3 更新语言

`handle` 从不触碰 DOM。它返回 `ChartUpdate`，即 `{ id, ops }`，由运行时施加：

| 操作 | 效果 |
|---|---|
| `set-style` | 强调或淡化目标，隐藏系列 |
| `set-annotation` | 在目标上固定或清除注释 |
| `set-viewport` | 移动连续域或投影 |
| `set-order` | 重排离散域 |
| `set-overlay`、`set-freeform-overlay` | 绘制引导线或自由路径 |
| `set-data` | 替换某一层显示的行 |

目标要么是对已解析元素的引用 `{ visual, elements }`，要么是按行键的选择器 `{ select: { key } }`。宿主通过 `surface.applyUpdate()` 和 `surface.setUpdates()` 从外部施加同一语言，因此叙事步骤与点击产生同类变化。

## §2.4 交互层

`buildInteractiveChart(container, input, options)` 返回 `InteractiveChartSurface`：`ready`、`warnings`、`applyUpdate`、`setUpdates`、`clearUpdate`、`dispatch`、`refresh`、`destroy`。容器为每个语义事件派发 `flint-interaction` DOM 事件，携带交互 id 和已解析目标，宿主无需了解预设即可监听。

# §3 规范

```json
{
  "interaction_spec": {
    "interactions": [
      { "type": "click-highlight" },
      { "type": "legend-toggle" },
      { "type": "navigate", "id": "pan", "options": { "axes": "y", "pan": false, "reset": ["double-click", "escape"] } }
    ],
    "assistedTargeting": true,
    "keyboardTargeting": false
  }
}
```

有意保持一种简单形状：

- 每个条目是带 `type` 的对象，没有字符串简写。
- 选项嵌套在 `options` 下。与 `type` 并列的选项会被拒绝并给出提示，工厂调用的习惯不会悄悄消失。
- `id` 位于条目上，绝不在 `options` 内。默认为 `type`，因此同一类型的两个条目需要显式 id。
- 两个交互层策略 `assistedTargeting` 与 `keyboardTargeting` 与列表并列。它们描述交互层，而非某个交互。
- 保留状态不属于 spec，由宿主通过交互层施加。

解析器 `resolveInteractionSpec()` 把 spec 变成定义并为每个打上 `origin: 'spec'`。它对图表一无所知。它拒绝格式错误：未知的 `type`、多余的键、非对象的 `options`、位于 `options` 内的 `id`、缺少 `groupBy` 等必需选项、未知或不支持的 `reset` 手势、重复 id、不属于这三个的顶层键（对曾经存在的 `dismiss` 与 `updates` 给出提示）。每条消息按索引和类型指出条目。

`composeInteractiveOptions()` 把 spec 与代码传给 `buildInteractiveChart()` 的内容合并：spec 条目在前，代码在后；两边共用一个 id 是错误；交互层策略由代码设置时取代码，否则取 spec；不运行交互的后端以一条 `info` 警告忽略 spec。

# §4 图表语义

预设用数据说话：“亚洲的那些柱子”。渲染器用像素说话。每种图表类型在其 `ChartTemplateDef` 的 `semanticInteractions` 中拥有这份翻译。装配器对每张图表用解析后的编码调用它一次，运行时读取结果。

它返回一份三部分的字典：

- **角色。**`fields`、`categoryField`、`seriesField`、`legendFields`、`selectableMarks`：哪些字段扮演哪种角色，哪个图例属于哪个字段，点击能命中哪些标记名。`click-group-focus` 等预设读取它们。
- **两个函数。**`resolve(event, context)` 接收指针下的物理命中，返回 `SemanticTarget`：数据元素加上视觉类型与角色，如 `bar` 或 `legend-item`。`presentUpdate(update, context)` 接收通用更新，返回图表专用版本，例如注释可以落在柱子的哪个位置。
- **呈现。**`renderHoverStyles`、`renderSelectionStyles`、`annotationMarkType`，以及模板自选重排轴时的 `reorderAxes`。

这份字典说明**如何读**一张图表，并不说明**图表类型支持什么**。36 个 Vega-Lite 模板每个都有它，因此它的存在不携带任何关于支持的信息。这一区分正是下一节存在的原因。

# §5 能力与准入

## §5.1 八种能力

能力是至少有一个预设在运行时读取的图表事实。共有八种，即核心中的 `INTERACTION_CAPABILITIES`：

| 能力 | 图表类型声明 | 数据确认 |
|---|---|---|
| `elements` | `elements: true`：标记可解析为数据行 | 无 |
| `cartesian-region` | `region: ['cartesian']`：矩形、区间或套索拖动可解析标记 | 无 |
| `angular-region` | `region: ['angular']`：扇区拖动可解析标记 | 无 |
| `navigation` | `navigation: { axes?, geo? }` | x 或 y 上有连续字段且未分面；或为投影 |
| `reorder` | `reorder: { axes?, includeConnectiveMarks?, markTypes? }` | x 或 y 上有离散字段且未分面 |
| `legend` | `legend: true` | 图例通道上有离散字段 |
| `discrete-axis` | `discreteAxis: true` | x 或 y 上有离散字段 |
| `index` | `index: true`：一个 x 位置读取所有系列 | x 上有字段 |

三种区域与元素能力是几何事实，模板是唯一来源。其余五种针对编码确认。`navigation` 与 `index` 同时也是有意筛选的：不是每张有连续轴的图表都应当平移，而 `index` 描述的是只有部分图形具备的阅读模型。

极坐标图表声明两种区域：矩形或套索按像素范围解析其弧段，其上的区间刷选则被当作扇区。

## §5.2 类型声明什么

每个模板携带一个 `interactionSupport` 块，即 `ChartInteractionSupport`：

```ts
interactionSupport: {
    elements: true,
    region: ['cartesian'],
    navigation: {},
    reorder: {},
    legend: true,
    discreteAxis: true,
},
```

缺少的键意味着永不。存在的键意味着类型可以拥有它，其余由数据决定。这个块是闸门：模板漏掉某个键，数据无法把它打开。附录列出全部 36 个块。

## §5.3 数据确认什么

装配时，Vega-Lite 装配器把块与解析后的编码求交，并把结果写入编译后的 spec，与字典并列：

```ts
_interactionSemantics: {
    ...templateSemantics,
    chartType: 'Bar Chart',
    capabilities: ['elements', 'cartesian-region', 'navigation', 'reorder', 'discrete-axis'],
    navigationAxes: ['y'],
    reorderAxes: [{ axis: 'x', field: 'country' }],
    ...
}
```

上面是一张没有颜色字段的柱状图：`legend` 已声明但未确认，所以不在列表中。`capabilities` 是准入读取的唯一权威，不存在对计划的第二种读法。装配器为每张 Vega-Lite 图表写入 `_interactionSemantics`，因此装配过的 spec 上该字段从不缺席。

## §5.4 预设需要什么

核心中的一张表 `INTERACTION_PRESET_REQUIREMENTS` 给出每个预设的最小能力集合，缺少任何一项它都无法工作：

| 预设 | 需要 |
|---|---|
| `click-highlight`、`click-group-focus`、`hover-group-focus`、`click-annotate`、`context-activate`、`long-press`、`double-activate`、`inspect` | `elements` |
| `select`、`lasso-select`、`brush-x`、`brush-y`、`linked-brush` | `elements`、`cartesian-region` |
| `brush-angle` | `elements`、`angular-region` |
| `navigate`、`brush-zoom` | `navigation` |
| `legend-toggle` | `legend` |
| `axis-highlight` | `discrete-axis` |
| `drag-reorder` | `reorder` |
| `inspect-index` | `index` |

定义通过工厂打在其上的 `preset` 名字找到自己的行。手写的定义没有预设，不需要任何能力；其作者自行负责。

## §5.5 匹配

`admitInteractions(plan, interactions)` 在挂载时、在编译步骤中运行，使用装配器写下的计划：

1. 对每个交互，其所需的每项能力必须在 `plan.capabilities` 中。第一个缺失的能力决定消息：`Interaction "legend-toggle" requires a discrete legend; Bar Chart has none.`
2. 请求图表不能导航的轴的 `navigate` 按轴拒绝，因为仅凭能力无法判断 `axes: 'x'` 对一张只能导航 y 的图表。
3. 三条成对冲突规则，不受能力模型影响：每张图表一个导航；平移不能与区域预设共用未加修饰的拖动；双击不能既激活标记又重置另一交互。后面的条目让步。

来源决定后果。spec 条目以 `ChartWarning` 丢弃，代码为 `unsupported_interaction` 或 `conflicting_interactions`，消息以 “The interaction was dropped.” 结尾。代码定义以同一句子抛出异常。警告到达 `surface.warnings`、控制台（一次）、`validateChart()` 以及 MCP 的 `validate_chart`。

## §5.6 为什么是两层而不是一层

仅从装配后的图表推断，是这一模型之前的做法，它让每种图表类型接纳所有预设：每个模板都有字典，所以“具备元素语义”永远为真。数据无法在类型必须说不的地方说不：热力图绑定的颜色图例是连续的；玫瑰图绑定的名义 x 的标签是扇区；KPI 卡片有矩形标记和行，却没有可拖动的绘图区。而且有三类读者在数据存在之前就需要答案：调用 `list_chart_types` 的智能体、生成的参考文档、覆盖视图。

# §6 重置

每个保留状态的预设都带有 `reset`，即使其回到中性状态的手势列表：

| 手势 | 含义 |
|---|---|
| `click-none` | 没有命中任何图表元素的点击：空白绘图区、边距、背景 |
| `double-click` | 图表任意位置的双击 |
| `escape` | 图表拥有焦点时按下 Escape |

每个预设在注册表中有默认列表和支持列表；解析器拒绝不支持的手势，以及为不保留状态的预设设置的任何 `reset`。每张图表一个分派器运行这些手势。一个手势只重置列表中包含它的交互，各按自己的 id：清除保留的更新，有状态刷选通过其控制器清除，`navigate` 沿自己的路径飞回，带闭包状态的预设通过 `onReset()` 丢弃状态。

带 `escape` 重置的图表可获得焦点，并在指针按下时获取焦点，因此 Escape 只到达读者最后触碰的图表。通过交互层施加的宿主更新从不被手势重置，宿主用 `clearUpdate()` 清除它们。

# §7 流水线

```
chart_spec + data ──► assembleVegaLite ──► spec + _interactionSemantics
                                             │   字典、chartType、capabilities、
                                             │   navigationAxes、reorderAxes……
interaction_spec ──► resolveInteractionSpec ─┤
options.interactions ──► compose ────────────┤
                                             ▼
                                   addVegaLiteInteractions
                                     准入 ─► 计划（已接纳的定义、警告）
                                     为标记、比例尺、信号加装
                                             ▼
                                   mountVegaInteractions
                                     手势、分派器、叠加层、事件
```

哪个事实在哪里决定：

| 事实 | 决定于 |
|---|---|
| 类型提供什么 | 模板块 |
| 这张图确认什么 | 装配器 |
| 预设需要什么 | 核心表 |
| 接纳什么、有哪些警告 | 编译步骤，通过准入 |
| 命中如何变成行 | 字典，运行时 |
| 哪个手势重置什么 | 分派器，来自各定义的列表 |

# §8 宿主与发现

- **`buildInteractiveChart()`** 从输入读取 `interaction_spec` 并与代码定义合并。MCP 的 `create_chart_view`、站点编辑器与图库在输入含交互条目时经由它挂载，否则静态渲染。
- **`validateChart()`** 对装配后的语义运行解析器与准入，在任何渲染之前返回与挂载相同的警告。格式错误的 spec 是 `invalid_interaction_spec` 错误。MCP 的 `validate_chart` 返回同一列表。
- **`supportedInteractionPresets(def.interactionSupport)`** 列出图表类型按声明支持的预设。`list_chart_types` 按图表类型返回它，Vega-Lite 参考文档打印它。数据仍可能在挂载时移除某一项，指南对此有说明。
- **交互实验室的覆盖页签**为每种图表类型装配一个代表性用例，展示每种图表类型对每个预设的情况：对该数据生效、类型支持但该数据未确认、或从不提供。

# §9 扩展模型

**新增预设。**把名字加入核心的 `INTERACTION_PRESET_TYPES`，把需求加入 `INTERACTION_PRESET_REQUIREMENTS`。把选项类型加入 `InteractionPresetOptions`，添加带标签、手势家族、支持与默认重置列表的注册表条目，以及打上 `preset` 并附加重置列表的工厂包装。映射类型使缺失的条目成为编译错误。重新生成参考文档。

**新增能力。**把名字加入 `INTERACTION_CAPABILITIES`，把措辞加入 `INTERACTION_CAPABILITY_DESCRIPTIONS`。为 `ChartInteractionSupport` 添加键，为 `declaredInteractionCapabilities` 添加一行。若需数据确认，把事实加入装配器的 `confirmed` 映射。在提供它的模板上声明。

**新增模板。**写出它的 `interactionSupport` 块：有解析器时声明 `elements`；几何允许的区域类型；连续轴应当平移时声明 `navigation`；几何允许之处声明 `reorder`、`legend`、`discreteAxis`；只有一个 x 位置能跨系列读取时才声明 `index`。一个测试断言每个 Vega-Lite 模板都携带该块。

# 附录：声明表

由 `npm run gen:reference` 从模板生成。请勿手工编辑此表。

<!-- interaction-support:start -->
| 图表类型 | elements | region | navigation | reorder | legend | discrete axis | index |
|---|---|---|---|---|---|---|---|
| Area Chart | ✓ | cartesian | x, y | ✓ | ✓ | ✓ | ✓ |
| Bar Chart | ✓ | cartesian | x, y | ✓ | ✓ | ✓ |  |
| Bar Table | ✓ | cartesian |  | ✓ | ✓ | ✓ |  |
| Boxplot | ✓ | cartesian | x, y | ✓ | ✓ | ✓ |  |
| Bullet Chart | ✓ | cartesian |  | ✓ | ✓ | ✓ |  |
| Bump Chart | ✓ | cartesian | x, y | ✓ | ✓ | ✓ | ✓ |
| Calendar Heatmap | ✓ | cartesian |  | ✓ | ✓ | ✓ |  |
| Candlestick Chart | ✓ | cartesian | x | ✓ |  | ✓ | ✓ |
| Choropleth | ✓ | cartesian | geo |  | ✓ |  |  |
| Connected Scatter Plot | ✓ | cartesian | x, y | ✓ | ✓ | ✓ |  |
| Density Plot | ✓ | cartesian | x | ✓ | ✓ | ✓ | ✓ |
| Donut Chart | ✓ | cartesian, angular |  |  | ✓ |  |  |
| ECDF Plot | ✓ | cartesian | x | ✓ | ✓ | ✓ | ✓ |
| Gantt Chart | ✓ | cartesian | x | ✓ | ✓ | ✓ |  |
| Grouped Bar Chart | ✓ | cartesian | x, y | ✓ | ✓ | ✓ |  |
| Heatmap | ✓ | cartesian | x, y | ✓ | ✓ | ✓ |  |
| Histogram | ✓ | cartesian | x, y | ✓ | ✓ | ✓ |  |
| KPI Card | ✓ |  |  |  |  |  |  |
| Line Chart | ✓ | cartesian | x, y | ✓ | ✓ | ✓ | ✓ |
| Lollipop Chart | ✓ | cartesian | x, y | ✓ | ✓ | ✓ |  |
| Map | ✓ | cartesian | geo |  | ✓ |  |  |
| Pie Chart | ✓ | cartesian, angular |  |  | ✓ |  |  |
| Pyramid Chart | ✓ | cartesian |  | ✓ | ✓ | ✓ |  |
| Radar Chart | ✓ | cartesian, angular |  |  | ✓ |  |  |
| Range Area Chart | ✓ | cartesian | x, y |  | ✓ | ✓ | ✓ |
| Ranged Dot Plot | ✓ | cartesian | x, y | 含连接标记 | ✓ | ✓ |  |
| Regression | ✓ | cartesian | x, y | ✓ | ✓ | ✓ | ✓ |
| Rose Chart | ✓ | cartesian, angular |  |  | ✓ |  |  |
| Scatter Plot | ✓ | cartesian | x, y | ✓ | ✓ | ✓ | ✓ |
| Slope Chart | ✓ | cartesian | x, y | ✓ | ✓ | ✓ | ✓ |
| Sparkline | ✓ | cartesian | x | ✓ |  | ✓ | ✓ |
| Stacked Bar Chart | ✓ | cartesian | x, y | ✓ | ✓ | ✓ |  |
| Streamgraph | ✓ | cartesian | x, y | ✓ | ✓ | ✓ | ✓ |
| Strip Plot | ✓ | cartesian | x, y | ✓ | ✓ | ✓ |  |
| Violin Plot | ✓ | cartesian |  |  | ✓ | ✓ |  |
| Waterfall Chart | ✓ | cartesian | x, y | rect 标记 | ✓ | ✓ |  |
<!-- interaction-support:end -->

各行背后的判断：

- **KPI 卡片的 `elements`。**模板带有解析器和注释呈现器，因此 `click-highlight` 与 `click-annotate` 在卡片上可用。
- **小提琴图与范围面积图没有 `reorder`。**两者在块存在之前就拒绝重排；范围面积图的类别轴是路径，有测试守护。
- **柱状表、子弹图、迷你图、日历热力图、地图、分级统计图的 `region: cartesian`。**区域控制器按像素范围解析标记，因此覆盖行、单元格或气泡的矩形可以选中它们。只有 KPI 卡片没有拖动区域。
- **极坐标图表与投影图没有 `discreteAxis`。**它们的标签是扇区或地名，不是可点击的类别。
- **`index`** 出现在 x 为跨系列共享索引的图表上：折线族、面积族、碰撞图、斜率图、密度图、ECDF、K 线图、迷你图，以及散点族（实验室中精选的索引检视用例依赖它）。
