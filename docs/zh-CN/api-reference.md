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
} from 'flint-chart';

const vlSpec  = assembleVegaLite(input);
const ecSpec  = assembleECharts(input);
const cjsSpec = assembleChartjs(input);
```

| 导出 | 返回 |
|--------|---------|
| `assembleVegaLite` | Vega-Lite JSON spec |
| `assembleECharts` | ECharts `option` object |
| `assembleChartjs` | Chart.js configuration |

若某后端不支持某 `chartType`，assembler 会在渲染前抛出。可用 `vlGetTemplateDef`、`ecGetTemplateDef` 或 `cjsGetTemplateDef` 检查支持情况。

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
  field_display_names?: Record<string, string>;
}
```

### `data`

| 形式 | 说明 |
|------|-------------|
| `{ values: rows[] }` | 内联行对象（编辑器与教程） |
| `{ url: "..." }` | 远程 JSON 或 CSV URL |

### `semantic_types`

将列名映射到语义类型。这驱动编码类型、格式化、聚合默认值、颜色类与布局。见[语义类型](/documentation/semantic-types)。

### `chart_spec`

| 字段 | 说明 |
|-------|-------------|
| `chartType` | 模板名称 — 须与后端注册表项匹配（`"Bar Chart"`、`"Heatmap"` 等） |
| `encodings` | 通道 → 编码映射 |
| `baseSize` | **目标**布局尺寸（像素，默认 400×320）：典型数据下图表瞄准的尺寸。密集数据可能超出，直至上限。 |
| `canvasSize` | **硬上限：** 图表可达到的最大尺寸，含分面网格。若省略，上限为 `baseSize × options.maxStretch`（默认 1.5×）。各维度上限为 `βx = canvasSize.width / baseSize.width`、`βy = canvasSize.height / baseSize.height`（均 ≥ 1）。基准会被钳制到上限，因此单独设置 `canvasSize` 即相当于固定框，图表会填充并缩小以适配而不溢出。 |
| `chartProperties` | 模板特定开关（例如 `orient`、`opacity`） |

> **base 与 canvas，一句话：** `baseSize` 是图表*瞄准*的尺寸；`canvasSize` 是*绝不超过*的尺寸。固定插槽用 `canvasSize`，舒适目标且密集数据可增长用 `baseSize`。见[示例：自动布局](/documentation/chart-sizing)。

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
}
```

显式 `type` 覆盖语义推断。设置 `aggregate` 表示由 Flint 自行折叠行——按其他（未聚合）字段通道分组，并产生名为 `${field}_${aggregate}` 的派生列（`count` → `_count`）。`average` 与 `mean` 同义。多数调用方仍应在上游聚合数据；若已聚合，省略 `aggregate` 并按列名引用派生列。

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
  minStep?: number;            // min px per discrete item (default 6)
  minSubplotSize?: number;     // min facet subplot px (default 60)
  maxColorValues?: number;     // color cardinality before truncation (default 24)
  stepPadding?: number;        // band inner padding fraction (default 0.1)
  defaultBandSize?: number;    // baseline px per category (backend-tuned)
}
```

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
| `flint-chart/test-data` | 图库生成器（`TEST_GENERATORS`） |

---

# §10 相关

- [概览](/documentation/overview) — dataSpec + chartSpec 动机
- [架构](/documentation/architecture) — 三阶段流水线
- [语义类型](/documentation/semantic-types) — 类型层次与解析
- [入门指南](/documentation/getting-started) — 动手演练
- [扩展后端](/documentation/adding-a-backend) — 新 `assemble*()` 目标
