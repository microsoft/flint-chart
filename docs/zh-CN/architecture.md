# 架构

Flint 是一种与库无关的可视化中间语言。每个 `assemble*()` 入口都使用相同的**编译器前端**和**优化器**；仅**代码生成器**因后端而异。

动机与规范示例见[概览](/documentation/overview)。输入类型见 [API 参考](/documentation/api-reference)。

---

## 目录

- [§1 设计原则](#1-design-principles)
- [§2 三阶段流水线](#2-three-stage-pipeline)
- [§3 阶段 1 — 编译器前端](#3-stage-1-compiler-frontend)
- [§4 阶段 2 — 优化器](#4-stage-2-optimizer)
- [§5 阶段 3 — 代码生成器](#5-stage-3-code-generator)
- [§6 输入](#6-inputs)
- [§7 溢出与警告](#7-overflow-and-warnings)
- [§8 仓库布局](#8-repository-layout)
- [§9 相关](#9-related)

---

# §1 设计原则

1. **语义优先** — `semantic_types` 指导解析、聚合、零基线、发散检测和格式化。原始存储类型只是起点。
2. **最小图表表面** — `chart_spec` 提供图表类型与通道绑定，通常约 10 行。坐标轴、比例尺、图例和步长由编译器推导。
3. **动态模板** — 每个 `chartType` 映射到 `ChartTemplateDef`；其 `instantiate()` 钩子消费完整编译上下文，并适应基数与语义。
4. **无 UI 依赖** — 核心为纯 TypeScript（`packages/flint-js`），可从智能体、笔记本、服务器或本站运行。Python 包计划在后续版本发布。

大部分设计逻辑位于阶段 1–2，且在各后端间完全相同。

---

# §2 三阶段流水线

![Overview of the Flint architecture](figs/overview.png)

| 阶段 | 作用 | 实现 | 关键输出 |
|-------|------------|----------------|-------------|
| **1. 编译器前端** | 解析语义上下文 | Phase 0 — `resolveChannelSemantics()` | 每通道 `ChannelSemantics` |
| **2. 优化器** | 将布局适配画布 | Phase 1 — `computeLayout()`、`filterOverflow()` | `LayoutResult`、截断数据 |
| **3. 代码生成器** | 输出库原生规范 | Phase 2 — `build*Encodings()`、`template.instantiate()` | VL / EC / CJS spec |

```text
assembleVegaLite(input)   // or assembleECharts, assembleChartjs
       │
       ▼
══ STAGE 1 — COMPILER FRONTEND (core/) ═════════════════════════
       │
       ├── resolveChannelSemantics()     semantic_types + data → ChannelSemantics
       ├── computeZeroDecision()         per quantitative axis (needs template mark)
       ├── declareLayoutMode()           template layout intent (optional)
       └── convertTemporalData()         semantic-driven date parsing
       │
       ▼
══ STAGE 2 — OPTIMIZER (core/) ══════════════════════════════════
       │
       ├── computeChannelBudgets() + filterOverflow()
       └── computeLayout()
             • Discrete axes — elastic budget (bars, heatmap cells)
             • Continuous axes — gas-pressure stretch (scatter, line)
             • Global — facet grid, aspect ratio, radial / area models
       │
       ▼
══ STAGE 3 — CODE GENERATOR (per backend) ═══════════════════════
       │
       ├── build*Encodings()             backend encoding objects
       ├── template.instantiate()        dynamic template hook
       ├── restructureFacets()           VL / ECharts faceting
       └── applyLayoutToSpec()           step, width/height, padding
       │
       ▼
       后端配置 + 可选警告
```

规范编排：`packages/flint-js/src/vegalite/assemble.ts`。

---

# §3 阶段 1 — 编译器前端

解析分两层；完整流水线见[语义类型 §4](/documentation/semantic-types#4-compilation-pipeline)。

### 字段属性

按列、与图表无关：格式类、聚合角色、域形状、发散提示、规范顺序。由 `type-registry.ts` 与可选内联注解（`intrinsicDomain`、`unit`、`sortOrder`）驱动。

### 通道属性

图表上下文落地。同一 `YearMonth` 字段在折线图的 `x` 上可能是时间型，在另一视图的 `color` 上可能是分类型。通道语义防止年月整数被当作定量幅度。

**IR：** `ChannelSemantics` — 扁平、与后端无关的记录，供布局与所有模板消费。

分层类型（T0 → T1 → T2）在智能体提供粗粒度标签时允许优雅降级。

### 命名视图变换

Flint 将部分替代方案提供为**命名视图**，用户或智能体无需重写图表规范。命名视图会小范围调整字段映射，例如翻转坐标轴、交换分类轴与颜色系列、将系列移到分面，或改用相关图表类型渲染相同字段。应用只需在 `chart_spec.chartProperties.pivot` 中保存所选状态 id；编译器会重新计算字段映射，再执行语义解析、溢出处理、布局和后端生成。

该模型在群论意义上成立，但刻意保持实用。从作者分配 `a0` 出发，沿四个算子生成的轨道遍历：

| 符号 | 生成元 | 示例状态 id | 含义 |
|--------|-----------|------------------|---------|
| `τ` | transpose | `flip:x-y` | 整体翻转两个轴槽位，保持占用关系 |
| `σ` | permute | `swap:y-color` | 将位置字段与同配置的辅助通道交换 |
| `γ` | shift | `series:row` | 在 color/group/facet 通道间路由一个离散系列字段 |
| `θ` | transition | `type:Strip Plot` | 用兄弟模板重新渲染相同路由字段 |

可见的 View 控件是有效性检查与去重后的有限轨道。去重是稳定子群的具象形式：翻转两次回到 `Default`，先分面再抖动可能与直接抖动坍缩为同一 Strip Plot，Scatter → Strip Plot → Scatter 这类图表类型往返会折叠回作者编写的散点图。兼容性检查也有类型约束：`σ` 仅在同一字段配置内交换（度量与度量、类别与类别），而 `τ` 允许跨配置，因为它翻转的是轴槽位而非字段角色。折线图省略 `τ`，因此 Flint 从不提供垂直折线图。

由于轨道在 Flint 的后端中立编码 IR 上计算，相同的 View 状态 id 适用于 Vega-Lite、ECharts 和 Chart.js。各后端接收已变换的编码映射；仅 `θ` 需要后端特定的模板查找，以便兄弟图表自身的实例化逻辑接管。

---

# §4 阶段 2 — 优化器

优化器接收 `baseSize`（目标）和可选的 `canvasSize` 上限，然后产生在可用空间内保持图表可读的 `LayoutResult`。

### 局部优化

每个布局维度（x、y、group、分面列/行、radius）都是弹性容器：

| 编码类 | 行为 |
|----------------|----------|
| 离散（柱、热力图单元格） | 向最小可读步长压缩；必要时拉伸画布 |
| 连续（散点、折线） | 标记密度超过重叠预算时拉伸 |

### 全局优化

宽高比（连接标记的 banking-to-45°）、分面行列换行，以及由组件数量确定尺寸的非笛卡尔图表（treemap、gauge、pie）。

实现模型：[自动布局算法](/documentation/layout-model) — §2 弹性预算、§3 气压、§4 周长、§5 面积。

---

# §5 阶段 3 — 代码生成器

后端生成器将优化后的上下文翻译为库原生语法。每个 `chartType` 注册一个**动态模板**：

| `ChartTemplateDef` 字段 | 作用 |
|--------------------------|------|
| `chart` | 公开名称（`"Grouped Bar Chart"`）— 与 `chart_spec.chartType` 匹配 |
| `template` | 原生规范骨架 |
| `channels` | 允许的编码 |
| `markCognitiveChannel` | `position` / `length` / `area` / `color` — 零基线与拉伸类 |
| `declareLayoutMode?` | 布局前的轴标志 |
| `instantiate()` | 从 `InstantiateContext` 输出规范 |

注册表：`vlTemplateDefs`、`ecTemplateDefs`、`cjsTemplateDefs`。查找：`vlGetTemplateDef(name)` 等。

新后端仅实现阶段 3；前端与优化器保持不变。见[扩展后端](/documentation/adding-a-backend)。

---

# §6 输入

| 部分 | API | 指定内容 |
|------|-----|-----------|
| 原始数据 | `data` | 供解析器与布局使用的行表 |
| **dataSpec** | `semantic_types` | 字段含义；在同一数据集上的多张图表间复用 |
| **chartSpec** | `chart_spec` | `chartType` + `encodings`；探索时易于编辑 |

LLM 智能体通常一次性推断 `semantic_types`，然后迭代 `chart_spec`：在同一语义层上从折线 → 热力图 → 分组柱 → 瀑布 → 旭日图。

---

# §7 溢出与警告

当离散基数超过画布预算时，优化器会过滤数据并附加 `ChartWarning` 元数据，而不是渲染不可读的图表。策略优先级与 `_warnings` 检查见 [API 参考 §8](/documentation/api-reference#8-overflow-and-warnings)。

---

# §8 仓库布局

```text
packages/flint-js/src/
├── core/           resolve-semantics, field-semantics, compute-layout, type-registry, types
├── vegalite/       Stage 3 — Vega-Lite templates + assembleVegaLite
├── echarts/        Stage 3 — ECharts templates + assembleECharts
├── chartjs/        Stage 3 — Chart.js templates + assembleChartjs
└── test-data/      gallery fixtures (TEST_GENERATORS)

packages/flint-py/  Python port preview (package planned later)
site/               demo site (gallery, editor, documentation)
```

---

# §9 相关

- [概览](/documentation/overview) — 动机与规范示例
- [API 参考](/documentation/api-reference) — `ChartAssemblyInput`、assembler、options
- [语义类型](/documentation/semantic-types) — 类型层次与解析规则
- [自动布局算法](/documentation/layout-model) — 拉伸与分面模型
- [扩展图表模板](/documentation/adding-a-chart-template) — 扩展阶段 3
