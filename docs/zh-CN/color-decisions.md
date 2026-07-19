# 颜色决策

Flint 将**使用何种颜色比例尺**（分类型、顺序型或发散型）与**各后端如何渲染**分离。颜色逻辑分两层运行：

1. **Phase 0 — 语义解析** 根据字段语义类型与数据，为每个通道分配 `ChannelSemantics.colorScheme` 建议（Vega-Lite 直接使用）。
2. **`decideColorMaps()`**（位于 `core/color-decisions.ts`）将语义 + 编码转为与后端无关的 `ColorDecision` 记录（ECharts 与 Chart.js 使用，随后在本地选取具体十六进制调色板）。

两层都不输出 Vega-Lite 或 ECharts 语法——仅输出抽象方案*类型*、可选显式方案 id、类别数量与发散中点。

---

## 在流水线中的位置

```
resolveChannelSemantics()          Phase 0
    └── cs.colorScheme             { type, scheme, domainMid? }
              │
              ├─► Vega-Lite assemble
              │     buildVLEncodings() copies scheme → encoding.scale.scheme
              │     (VL built-in scheme names: category10, viridis, redblue, …)
              │
              └─► ECharts / Chart.js assemble
                    decideColorMaps() → ColorDecisionResult
                          └── pickEChartsPalette() / pickChartJsPalette()
                                └── hex color arrays on series / legend
```

| 后端 | 颜色入口 | 调色板来源 |
|---------|-------------------|----------------|
| Vega-Lite | `vegalite/assemble.ts` 中的 `ChannelSemantics.colorScheme` | `getRecommendedColorScheme()` → [Vega scheme names](https://vega.github.io/vega/docs/schemes/) |
| ECharts | `decideColorMaps()` → `context.colorDecisions` | `echarts/colormap.ts` — `cat10`、`cat20`、`viridis`、`RdBu` |
| Chart.js | `decideColorMaps()` → `context.colorDecisions` | `chartjs/colormap.ts` — 相同 id，Chart.js 调优的十六进制值 |

ECharts 与 Chart.js 在组装期间调用一次 `decideColorMaps()`，并将结果挂到 `InstantiateContext.colorDecisions`。模板与 `instantiate-spec.ts` 读取该对象；它们不会重新推导方案族。

---

## Phase 0：语义颜色提示

在 `resolveChannelSemantics()` 期间，承载颜色的通道（`color`，有时还有 `group`）会在 `ChannelSemantics` 上获得 `colorScheme`：

```ts
interface ColorSchemeRecommendation {
  scheme: string;   // e.g. 'tableau10', 'viridis', 'redblue'
  type: 'categorical' | 'sequential' | 'diverging';
  domainMid?: number;
  reason?: string;
}
```

生产路径：

1. `resolveColorSchemeHint(semanticType, annotation, values)` — 根据类型注册表与数据范围分类发散型、顺序型与分类型。
2. `getRecommendedColorScheme(...)`（位于 `core/semantic-types.ts`）— 从内部 `colorSchemes` 注册表选取具体 Vega-Lite 方案名。

示例：

| 语义类型 | 典型提示 | 示例方案 |
|---------------|--------------|----------------|
| `Country`、`Category` | categorical | 按基数选 `tableau10` / `tableau20` |
| `Quantity`、`Temperature` | sequential | `viridis`、`reds` 等 |
| `Percentage`、`Correlation`（跨 ±） | diverging | `redblue` 与 `domainMid` |

Vega-Lite 编码构建随后应用：

- 若用户设置了 `encoding.scheme` 且不为 `'default'`，则使用该值，否则
- 对发散比例尺使用 `cs.colorScheme.scheme` 与 `domainMid`。

类型如何馈入这些提示见[语义类型](/documentation/semantic-types)。

---

## 核心：`decideColorMaps()`

**文件：** `packages/flint-js/src/core/color-decisions.ts`

### 输入

```ts
interface DecideColorMapsContext {
  chartType: string;
  encodings: Record<string, ChartEncoding>;
  channelSemantics: Record<string, ChannelSemantics>;
  table: any[];
  background?: 'light' | 'dark';  // reserved
}
```

### 输出

```ts
interface ColorDecisionResult {
  color?: ColorDecision;
  group?: ColorDecision;
  fill?: ColorDecision;    // reserved
  stroke?: ColorDecision;  // reserved
}

interface ColorDecision {
  channel: 'color' | 'group' | 'fill' | 'stroke';
  schemeType: 'categorical' | 'sequential' | 'diverging';
  schemeId?: string;           // set when user passes encoding.scheme
  divergingMidpoint?: number;
  categoryCount?: number;      // distinct values in the color field
  primary: boolean;            // true for color / group
  dataDriven: boolean;
}
```

仅有绑定字段的通道会得到决策。当前评估 **`color` 与 `group`**；`fill` / `stroke` 为保留。

### 每通道算法

`decideColorForChannel()` 按顺序执行：

1. **显式方案** — 若设置了 `encoding.scheme` 且不为 `'default'`，则透传 `schemeId`。从 `ChannelSemantics` 推断 `schemeType`（core 不校验 id；后端在其注册表中查找）。

2. **语义驱动类型** — `decideSchemeTypeFromChannel()` 读取 `cs.colorScheme` 与编码/语义上下文：

| 条件 | `schemeType` |
|-----------|--------------|
| `colorScheme.type === 'diverging'` | `diverging`（+ `domainMid` 作为中点） |
| `colorScheme.type === 'sequential'` | `sequential` |
| `colorScheme.type === 'categorical'` + 语义 `Rank` | `sequential`（在连续色带上表示秩） |
| `colorScheme.type === 'categorical'` + `color` 上 `temporal` | `sequential`（避免将日期当作离散类别） |
| `colorScheme.type === 'categorical'`（默认） | `categorical` |
| 无提示 + 语义 `Correlation` | `diverging`，中点 `0` |
| 无提示 + 编码 `quantitative` 或 `temporal` | `sequential` |
| 回退 | `categorical` |

3. **基数** — `countDistinctValues(table, field)` → `categoryCount`，供后端调色板尺寸使用（例如 `cat10` 与 `cat20`）。

Core 在自动路径上**有意不**选取默认 `schemeId`。除非用户覆盖了 `scheme`，后端根据 `schemeType` + `categoryCount` 选择调色板。

---

## 后端调色板注册表

### ECharts — `echarts/colormap.ts`

内置映射：`cat10`、`cat20`、`viridis`、`RdBu`。每项包含 `type`、`supportsDiscrete`、`supportsContinuous`、`maxCategories`、`colorblindSafe` 与 `colors: string[]` 数组。

**`pickEChartsPalette(decision)`**

1. 若设置了 `decision.schemeId` → `getPaletteForScheme(id)`。
2. 否则按 `decision.schemeType` 过滤映射：
   - **categorical** — 最小的 `maxCategories` ≥ `categoryCount`（优先 `cat10` / `cat20`）。
   - **sequential** — 首个支持连续的映射（通常为 `viridis`）。
   - **diverging** — `diverging: true` 的映射（通常为 `RdBu`）。
3. 回退 → ECharts 模板的 `DEFAULT_COLORS`。

**`getPaletteForScheme(id)`** — 按 id 查找（不区分大小写）；模板（Treemap、Heatmap、Graph 等）在需要直接取色时使用。

### Chart.js — `chartjs/colormap.ts`

结构与选择策略与 ECharts 相同，十六进制默认值为 Chart.js 调优。回退 → `cat10`。

### Vega-Lite

不调用 `decideColorMaps()`。方案为 Phase 0 解析的**名称**（`category10`、`tableau20`、`viridis`、`redblue` 等），在 `buildVLEncodings()` 期间写入 `encoding.scale.scheme`。

---

## 用户覆盖

在 `chart_spec.encodings` 的任意颜色编码上设置 `scheme`：

```json
"encodings": {
  "color": { "field": "region", "scheme": "viridis" }
}
```

| 后端 | 效果 |
|---------|--------|
| Vega-Lite | `scale.scheme = "viridis"`（Vega 内置名） |
| ECharts / Chart.js | `ColorDecision.schemeId = "viridis"` → 在后端注册表中查找调色板 |

为在 ECharts 与 Chart.js 间获得可移植结果，请使用目标后端注册表中存在的 id（`cat10`、`viridis`、`RdBu` 等）。Vega-Lite 接受更广的 [Vega 方案目录](https://vega.github.io/vega/docs/schemes/)。

---

## 设计理由

**决策与渲染分离** — 方案*族*与基数在 core（或 Vega-Lite 的 Phase 0）中一次性决定。十六进制数组与比例尺对象留在后端代码中，因此 ECharts 与 Chart.js 可在视觉上分叉而不复制语义逻辑。

**共享语义** — 同一 `ChartAssemblyInput` 在 ECharts 与 Chart.js 上产生相同的 `schemeType` 与 `categoryCount`。仅每后端主题的调色板十六进制值不同。

**优雅路径** — 显式 `encoding.scheme` 优先。否则语义与编码类型驱动方案族；后端始终有回退调色板。

### 扩展点

| 变更 | 位置 |
|--------|--------|
| 新语义 → 方案规则 | `getRecommendedColorScheme()` / `resolveColorSchemeHint()` |
| 新方案族规则 | `decideSchemeTypeFromChannel()` |
| 新 ECharts / Chart.js 调色板 | `ECHARTS_COLOR_MAPS` / `CHARTJS_COLOR_MAPS` |
| 新颜色通道 | `ColorChannel` 联合类型 + `decideColorMaps()` 中的循环 |
| Vega-Lite 统一路径 | 在 `vegalite/assemble.ts` 中调用 `decideColorMaps()`（当前未接入） |

---

## 相关

- [语义类型](/documentation/semantic-types) — 类型注册表与 Phase 0 中的 `colorScheme` 提示
- [架构](/documentation/architecture) — 完整编译流水线
- [API 参考](/documentation/api-reference) — `ChartEncoding.scheme`
