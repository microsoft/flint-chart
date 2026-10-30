# API 参考

JavaScript / TypeScript 包：**`flint-chart`**（`packages/flint-js`）。

Python 移植：**`packages/flint-py`** 为源码预览。其输入形状与 JS API 一致，但 PyPI 发布计划在后续版本。

概念背景：[概览](/documentation/overview) · 流水线：[架构](/documentation/architecture)

---

## 目录

- [§1 Flint 规范映射](#1-flint-spec-mapping)
- [§2 Assembler](#2-assemblers)
- [§3 ChartAssemblyInput](#3-chartassemblyinput)
- [§4 编码与选项](#4-encodings-and-options)
- [§5 完整示例](#5-complete-example)
- [§6 模板发现](#6-template-discovery)
- [§7 核心工具](#7-core-utilities)
- [§8 溢出与警告](#8-overflow-and-warnings)
- [§9 子路径导出](#9-subpath-exports)
- [§10 相关](#10-related)

---

# §1 Flint 规范映射

| Flint | API 字段 | 内容 |
|---------------|-----------|----------|
| 原始表 | `data` | `{ values: rows[] }` 或 `{ url: "..." }` |
| **dataSpec** | `semantic_types` | `field → string` 或 `field → SemanticAnnotation` |
| **chartSpec** | `chart_spec` | `chartType`、`encodings`、`canvasSize`、`chartProperties` |

每个数据集编写一次 `semantic_types`，并在多张图表间复用。探索阶段通常只有 `chart_spec` 会变化。

### SemanticAnnotation（内联于 `semantic_types`）

```ts
interface SemanticAnnotation {
  semanticType: string;
  intrinsicDomain?: [number, number];  // e.g. Rating [1, 5]
  unit?: string;                        // e.g. USD, °C
  sortOrder?: string[];                 // custom ordinal order
  colors?: Record<string, string>;      // 绑定到取值的颜色，如 { DFL: "#0793AB" }
  percentScale?: 'fraction' | 'percent'; // 百分比的存储方式：45% 存为 0.45 还是 45
}
```

裸字符串简写：`"Price"` 等价于 `{ semanticType: "Price" }`。

---

# §2 Assembler

所有后端接受相同的 `ChartAssemblyInput`，并返回可直接渲染的对象。

```ts
import {
  assembleVegaLite,
  assembleECharts,
  assembleChartjs,
  assemblePlotly,
  assembleExcel,
} from 'flint-chart';

const vlSpec  = assembleVegaLite(input);
const ecSpec  = assembleECharts(input);
const cjsSpec = assembleChartjs(input);
const plFig   = assemblePlotly(input);
const xlSpec  = assembleExcel(input);
```

| 导出 | 返回 |
|--------|---------|
| `assembleVegaLite` | Vega-Lite JSON spec |
| `assembleECharts` | ECharts `option` object |
| `assembleChartjs` | Chart.js configuration |
| `assemblePlotly` | Plotly.js `{ data, layout }` figure |
| `assembleExcel` | 供 Office.js 使用的原生 Excel 图表工件 |

若某后端不支持某 `chartType`，assembler 会在渲染前抛出。可用 `vlGetTemplateDef`、`ecGetTemplateDef`、`cjsGetTemplateDef`、`plGetTemplateDef` 或 `excelGetTemplateDef` 检查支持情况。

## Excel 运行时与代码生成

`assembleExcel` 返回可序列化的 `flint.excel.chart/v1` 工件。可在 Office.js Excel 宿主中渲染它，或生成独立的 Office.js 源码：

```ts
import { assembleExcel, generateOfficeJs, renderExcelChart } from 'flint-chart';

const artifact = assembleExcel(input);
const { pngBase64, inspection } = await renderExcelChart(Excel, artifact, {
  scale: 3,
  cleanWorksheet: true,
  inspectNativeChart: false,
});
const { code, meta } = generateOfficeJs(artifact, {
  scale: 3,
  cleanWorksheet: true,
  functionName: 'renderFlintChart',
});
```

`renderExcelChart` 需要包含 `run` 和 `ImageFittingMode.fit` 的 Excel API 对象。它会在活动工作表中创建原生图表，并返回 PNG 捕获结果及可选的检查数据。`generateOfficeJs` 不执行 Excel；它返回可移植源码以及生成的数据区域和图表元数据。

---

# §3 ChartAssemblyInput

```ts
interface ChartAssemblyInput {
  data: { values: Record<string, unknown>[] } | { url: string };
  semantic_types?: Record<string, string | SemanticAnnotation>;
  chart_spec: {
    chartType: string;
    encodings: Record<string, ChartEncoding | string>;  // string = field shorthand
    baseSize?: { width: number; height: number };      // target layout size, default 400×320
    canvasSize?: { width: number; height: number };    // optional hard ceiling on stretch
    chartProperties?: Record<string, unknown>;
  };
  options?: AssembleOptions;
  theme_spec?: ThemeSpec | string;                     // 呈现，仅 Vega-Lite
  interaction_spec?: InteractionSpec;                  // 行为，仅 Vega-Lite 交互层
  field_display_names?: Record<string, string>;
}
```

### `data`

| 形式 | 说明 |
|------|-------------|
| `{ values: rows[] }` | 内联行对象（编辑器与教程） |
| `{ url: "..." }` | 由运行环境解析的数据路径或 URL。Flint MCP 仅支持本地 JSON、CSV 和 TSV 文件，不读取远程 URL。 |

### `semantic_types`

将列名映射到语义类型。这驱动编码类型、格式化、聚合默认值、颜色类与布局。见[语义类型](/documentation/semantic-types)。

### `interaction_spec`

图表的行为。按 `type` 列出交互预设，每项带自己的 `options`，另有 `assistedTargeting` 与 `keyboardTargeting` 两个交互层策略：

```ts
interface InteractionSpec {
  interactions: { type: InteractionPresetType; id?: string; options?: Record<string, any> }[];
  assistedTargeting?: boolean | AssistedTargetingOptions;
  keyboardTargeting?: boolean;
}
```

`mountChart()`（别名 `buildInteractiveChart()`）与 `<FlintChart>` 读取它，装配器忽略它。图表类型无法支持的条目会以 `unsupported_interaction` 警告被丢弃；`validateChart` 在渲染前报告同样的警告。`supportedInteractionPresets(def.interactionSupport)` 列出模板按声明支持的预设。参见[使用交互](/documentation/interaction-spec)。

### `chart_spec`

| 字段 | 说明 |
|-------|-------------|
| `chartType` | 模板名称 — 须与后端注册表项匹配（`"Bar Chart"`、`"Heatmap"` 等） |
| `encodings` | 通道 → 编码映射 |
| `baseSize` | **目标**布局尺寸（像素，默认 400×320）：典型数据下图表瞄准的尺寸。密集数据可能超出，直至上限。 |
| `canvasSize` | **硬上限：** 图表可达到的最大尺寸，含分面网格。若省略，上限为 `baseSize × options.maxStretch`（默认 1.5×）。各维度上限为 `βx = canvasSize.width / baseSize.width`、`βy = canvasSize.height / baseSize.height`（均 ≥ 1）。基准会被钳制到上限，因此单独设置 `canvasSize` 即相当于固定框，图表会填充并缩小以适配而不溢出。 |
| `chartProperties` | 模板特定开关（例如 `orient`、`opacity`），以及通用开关如 `labelOverflow`——x 轴类别名称放不下时依次尝试的步骤（默认 `["wrap", "rotate90"]`；时间、日期、年份或排名序列默认为 `["wrap", "skip", "rotate90"]`，`skip` 仅显示整值刻度；每一步都可截断） |
| `source` | 可选。数据来源（如 `"UN World Population Prospects 2024"`，或 `{ text, href }` 以加链接），按主题的 `source` 绘制在图表底部，默认为 `type.footnote` 样式的 “Source: …”。仅在来源已知时提供；未提供则不绘制页脚。 |
| `chrome` | 可选。不填则按主题绘制。`false` 去掉主题的页眉装饰、页脚和徽标；`{ header?, footer?, logos? }` 中设为 `false` 的一项被去掉：`header` 为标题周围的装饰，`footer` 为页脚线和来源署名，`logos` 为所有图片装饰及署名图片（署名文字保留）。图表自身的 `label` 和 `source` 文字不受影响。 |

> **base 与 canvas，一句话：** `baseSize` 是图表*瞄准*的尺寸；`canvasSize` 是*绝不超过*的尺寸。固定插槽用 `canvasSize`，舒适目标且密集数据可增长用 `baseSize`。见[示例：自动布局](/playgrounds/auto-layout)。

---

# §4 编码与选项

### ChartEncoding

```ts
interface ChartEncoding {
  field?: string;
  type?: 'quantitative' | 'nominal' | 'ordinal' | 'temporal';
  aggregate?: 'count' | 'sum' | 'average' | 'mean';
  sortOrder?: 'ascending' | 'descending';
  sortBy?: string;
  scheme?: string;
  title?: string | null;
}
```

显式 `type` 覆盖语义推断。设置 `aggregate` 表示由 Flint 自行折叠行——按其他（未聚合）字段通道分组，并产生名为 `${field}_${aggregate}` 的派生列（`count` → `_count`）。`average` 与 `mean` 同义。多数调用方仍应在上游聚合数据；若已聚合，省略 `aggregate` 并按列名引用派生列。

`title` 是该通道的坐标轴或图例显示的名称，用以替代字段名；`null` 表示不显示。图例是否带标题仍由主题决定：此处给出的名称只在显示标题时替换它。

常见通道：`x`、`y`、`color`、`size`、`shape`、`column`、`row`、`group`、`detail`。

### AssembleOptions（节选）

```ts
interface AssembleOptions {
  addTooltips?: boolean;       // default false
  elasticity?: number;         // discrete stretch exponent (default 0.5)
  maxStretch?: number;         // default stretch cap when no canvasSize ceiling (default 1.5)
  maxStretchX?: number;        // per-dimension width cap (derived from canvasSize)
  maxStretchY?: number;        // per-dimension height cap (derived from canvasSize)
  facetElasticity?: number;    // facet stretch (default 0.3)
  minStep?: number;            // min px per discrete item (default 8)
  minSubplotSize?: number;     // min facet subplot px (default 60)
  maxColorValues?: number;     // color cardinality before truncation (default 24)
  stepPadding?: number;        // band inner padding fraction (default 0.1)
  defaultBandSize?: number;    // baseline px per category (backend-tuned)
  maxBandSize?: number;        // max px per category when sparse (backend-tuned)
  bandBalance?: boolean;       // 按 band 定尺寸的图表超出其基础尺寸自身形状时回拉（默认 true）
  targetAspect?: number;       // 该形状范围的中心宽高比（默认取基础尺寸的）
  aspectTolerance?: number;    // 范围两侧的比例（默认取允许的拉伸）
  baseLabelFontSize?: number;  // axis tick font at the reference canvas (VL 10, EC/CJS/Plotly 12)
  baseTitleFontSize?: number;  // header font — axis title / legend / chart title (VL 11, EC/CJS 12, Plotly 14)
  canvasFit?: 'off' | 'auto'; // 图表在其框内读不好时布局的处理方式（默认 'auto'）
  canvasRefit?: boolean;       // 适配确定标题和图例后，在剩余空间内再布局一次绘图区（默认 true）
}
```

只有一条 band 轴的绘图区，其长度由类别数决定：四行会让条形图变成一条细带，三十列会变成又长又矮的一条。**Band balance** 按读者所见来判断——图表区，即绘图区加上无法去掉的标签（类别名按平均长度到最长计，最多取绘图区的 30% 或 40 px，超过会折行或截断）——与其基础尺寸自身会取的形状比较：从高度拉伸后的基础尺寸到宽度拉伸后的基础尺寸（300 × 300、×1.5 时为 0.67 到 1.5；两侧至少 1.25×）。在范围内保持不动；超出时只回拉到较近的一端，且只动自由边——数值轴在拉伸上限内加长，或缩短（最多到基础尺寸的一半），类别少时先加粗 band（最多到默认 step 的两倍）。在这些限制内无法达到时，改为瞄准宽一半的范围，避免把无法纠正的图表扭曲到极限。分面按整个网格判断。类别数量从不改动，网格（热力图）仍按其方格规则。

`canvasFit` 是布局的最后一步，在绘制前依据布局计划判断三件事：整张图能否清晰地**放进**其框内（宿主可以稍作缩小，但不低于 70%）；各部分是否**平衡**（标题、图例和装饰最多占图高或图宽的 40%，面板自己的标签最多占面板的 40%）；以及图表周围的内容是否把整张图明显拉伸得偏离框的**形状**——图上方的标题和一行图例是主题的设计，会被容许（上下各为图表区高度的四分之一，两侧为其宽度的三分之一）。本来就满足的图表不会被改动——只有比框略大（显示比例低于 97%）的图表例外，且只用最温和的改动：图例在原侧排成一行，或名称折行；只有在使整张图至少接近框 3 个百分点且没有引入新问题时才采用。

不满足的图表会以**读者最不易察觉的最小改动**来修正。每个问题都会归因到造成它的部分——过宽：图旁的图例；过高：上方或下方叠放的图例，只有当标题占了大部分时才归因于标题——并且只尝试这些部分的改动，先单独尝试再组合：图例在原来的一侧排成一行；图例名称折行（图例不动），或当图表区本身对框过宽时 y 轴类别名折行；标题缩小一级（不小于 13 / 11 px）；多个图例共用一侧时把其中一个移到另一侧（其余不动）；把所有图例移到另一侧；标题缩小两级。在能解决问题的改动中，保留对读者代价最小的一项——各项改动按上述顺序在同一尺度上计价，结果的可读性只用于区分代价相近的改动，绝不会让较大的改动胜过较温和的改动。若框无法清晰地容纳图表，则按原比例缩小绘图区。标题和图例确定后，绘图区会在框按显示比例留下的空间内**再布局一次**：连续轴的一侧向该空间延伸——不超过其拉伸上限，图表区保持在其自身形状的宽松范围内，band 轴保持其 step——只有当文字不更小、没有新问题且整张图更好读时才采用（`canvasRefit: false` 关闭此步）。该步骤不会把图表放大布局再交由宿主缩小：无法修正的图表按其自身尺寸绘制，由读者滚动或宿主缩放。

不会删去任何内容，不会把文字缩到难以阅读（也不会让本已过小的文字更小），也不会改变图表自身的形状。`'off'` 按原计划布局。该步骤的判断和处理会作为 `_canvasFit` 附在 Vega-Lite 规格上，并写入 `_theme.report`（`canvas-fit`）。

字体会围绕这些各后端基准值随画布尺寸自适应：默认画布下每个后端渲染其原生字号，
在更大画布上略微增大（最多 base + 4），在小型分面子图中缩小；坐标轴刻度标签还会
缩小/旋转/截断以避免重叠。设置 `baseLabelFontSize` / `baseTitleFontSize` 可整体
放大或缩小全部文字。

完整列表：`packages/flint-js/src/core/types.ts`（`AssembleOptions`）。行为见[自动布局算法](/documentation/layout-model)。

---

# §5 完整示例

```ts
const input: ChartAssemblyInput = {
  data: {
    values: [
      { quarter: 'Q1', revenue: 1200 },
      { quarter: 'Q2', revenue: 1450 },
      { quarter: 'Q3', revenue: 980 },
      { quarter: 'Q4', revenue: 1800 },
    ],
  },
  semantic_types: { quarter: 'Quarter', revenue: 'Price' },
  chart_spec: {
    chartType: 'Bar Chart',
    encodings: {
      x: { field: 'quarter' },
      y: { field: 'revenue' },
    },
    baseSize: { width: 480, height: 320 },
  },
};

const spec = assembleVegaLite(input);
```

---

# §6 模板发现

```ts
import {
  vlTemplateDefs,
  vlGetTemplateDef,
  vlGetTemplateChannels,
  ecGetTemplateDef,
  cjsGetTemplateDef,
} from 'flint-chart';

Object.keys(vlTemplateDefs);
// ["Points", "Bars", "Lines & Areas", …]

vlGetTemplateChannels('Scatter Plot');
// ["x", "y", "color", "size", "opacity", "column", "row"]
```

---

# §7 核心工具

从 `flint-chart` 与 `flint-chart/core` 再导出：

| 符号 | 用途 |
|--------|---------|
| `inferVisCategory` | 从原始数据推断粗粒度可视化类别 |
| `getVisCategory` | 按语义类型字符串查找类别 |
| `getRegistryEntry` | 查询类型的 `TypeRegistryEntry` |
| `channels`、`channelGroups` | 通道元数据 |

关键类型：`ChartAssemblyInput`、`ChartEncoding`、`ChartTemplateDef`、`AssembleOptions`、`ChartWarning`、`ChannelSemantics`。

## 校验

让 Agent 编写 `ChartAssemblyInput` 的宿主可以在渲染前先校验输入。`validateChart`
不会抛出异常；它会返回 assembler 产生的全部警告，并在输入无法编译时（未知图表类型、
不支持的通道、不存在的字段、画布上限）返回一条 `assembly_failed` 错误。
从 `flint-chart` 与 `flint-chart/validate` 再导出：

```ts
import { validateChart } from 'flint-chart/validate';

const result = validateChart(input, 'vegalite');
// { backend, chartType, valid, warnings, errors, computedSize? }
if (!result.valid) {
  // 将 result.errors 反馈给 Agent
}
```

传入 `options.updates`（ChartUpdate 列表）即可在同一次校验中对照图表检查它。格式错误的列表是
`invalid_updates` 错误。否则 `result.updates` 逐个 op 说明每个更新会做什么（`ok`、`text`），
或为何不会生效（`reason`）；每个不会生效的 op 也是一条 `update_not_applied` 警告，`valid`
仍只针对 spec。`vegalite` 以外的后端会报告更新被忽略。

```ts
const result = validateChart(input, 'vegalite', { updates });
// result.updates: [{ id, ops: [{ op, text, ok, reason? }] }]
```

| 符号 | 用途 |
|--------|---------|
| `validateChart(input, backend, options?)` | 校验并装配，并对照图表检查 `options.updates`；不抛出异常 |
| `validateChartInput(input, backend?, options?)` | 仅做结构检查；遇到第一个问题即抛出 |
| `validateSemanticTypes(semantic_types)` | 对未在类型注册表中的标签返回 `unknown_semantic_type` 警告（`validateChart` 也会包含这些警告） |
| `assembleForBackend(backend, input, options?)` | 装配并拆出 `_warnings` / `_width` / `_height` |
| `stripPrivateKeys(spec)` | 从 spec 中移除 Flint 的 `_` 前缀元数据 |
| `VALIDATION_BACKENDS` | 运行时可用的 backend 列表（`vegalite`、`echarts`、`chartjs`、`plotly`） |

`options.maxDataRows`（默认 100,000）与 `options.maxCanvasDim`（默认 4000）限制输入
大小。要求内联的 `data.values` —— 请在校验前先把 `data.url` 解析为行数据。

---

# §8 溢出与警告

当离散通道超出布局预算时，编译器会：

1. 计算可容纳多少项（[自动布局算法 §2](/documentation/layout-model#2-discrete-axis-elastic-budget-model)）
2. 应用模板溢出策略
3. 将数据过滤为保留值
4. 将警告附加到结果

默认策略优先级：

1. 连接标记（折线、面积）— 保留所有点
2. 用户指定排序 — 保留前/后 N 项
3. 对侧定量轴 — 排序并截断
4. 柱图 + count — 先 sum 聚合再截断
5. 数值字段 — 数值排序，取前 N
6. 回退 — 按数据顺序取前 N

在集成代码中检查 `_warnings` 或 `ChartWarning` 数组，以便在 UI 中展示截断信息。

---

# §9 子路径导出

| 导入路径 | 内容 |
|-------------|----------|
| `flint-chart` | Assembler + 主要再导出 |
| `flint-chart/core` | 类型、语义、布局 |
| `flint-chart/vegalite` | VL 模板与 `assembleVegaLite` |
| `flint-chart/echarts` | ECharts 模板与 `assembleECharts` |
| `flint-chart/chartjs` | Chart.js 模板与 `assembleChartjs` |
| `flint-chart/validate` | `validateChart` 与输入校验辅助函数 |
| `flint-chart/interactive` | `mountChart`、交互预设与更新辅助函数 |
| `flint-chart/interactive/<backend>` | 同上，只引用该后端（`vegalite`、`echarts`、`chartjs`、`plotly`）：用于单文件打包 |
| `flint-chart/react` | `<FlintChart>` 组件（React 为可选 peer 依赖） |
| `flint-chart/react/<backend>` | 同上，只引用该后端：用于单文件打包 |
| `flint-chart/render` | `renderSvg`，无需 DOM 即可输出静态 SVG |
| `flint-chart/test-data` | 图库生成器（`TEST_GENERATORS`） |

---

# §10 相关

- [概览](/documentation/overview) — dataSpec + chartSpec 动机
- [架构](/documentation/architecture) — 三阶段流水线
- [语义类型](/documentation/semantic-types) — 类型层次与解析
- [入门指南](/documentation/getting-started) — 动手演练
- [扩展后端](/documentation/adding-a-backend) — 新 `assemble*()` 目标
