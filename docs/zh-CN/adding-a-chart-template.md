# 扩展图表模板

当后端已存在、你想为其添加另一种图表类型时使用本指南。若要添加新的渲染目标，请从 [Extending backends](/documentation/adding-a-backend) 开始。

---

## 目录

- [§1 选择图表名称与通道](#1-选择图表名称与通道)
- [§2 编写模板](#2-编写模板)
- [§3 注册模板](#3-注册模板)
- [§4 添加测试数据与 gallery 覆盖](#4-添加测试数据与-gallery-覆盖)
- [§5 跨后端对等](#5-跨后端对等)
- [§6 相关文档](#6-相关文档)

---

# §1 选择图表名称与通道

公开标识是 `ChartTemplateDef` 上的 **`chart` 字符串**。它必须与 `chart_spec.chartType` 完全一致，例如 `"Scatter Plot"`。

只选择标记实际使用的通道。以相似模板为起点复制：

| 族 | Vega-Lite 参考 |
|---|---|
| Scatter / point | `vegalite/templates/scatter.ts` |
| Bar / column | `vegalite/templates/bar.ts` |
| Line / area | `vegalite/templates/line.ts` |
| Radial | `vegalite/templates/pie.ts` |

ECharts 与 Chart.js 在各自的 `templates/` 目录下使用相同的 `ChartTemplateDef` 接口。

---

# §2 编写模板

`ChartTemplateDef` 位于 `packages/flint-js/src/core/types.ts`。

```typescript
import { ChartTemplateDef } from '../../core/types';
import { defaultBuildEncodings } from './utils';

export const dotPlotDef: ChartTemplateDef = {
    chart: 'Dot Plot',
    template: { mark: 'circle', encoding: {} },
    channels: ['x', 'y', 'color', 'size', 'column', 'row'],
    markCognitiveChannel: 'position',

    declareLayoutMode: (channelSemantics, table, chartProperties) => {
        // optional: banded axes, σ overrides, Q→O conversion
        return { /* LayoutDeclaration */ };
    },

    instantiate: (spec, ctx) => {
        defaultBuildEncodings(spec, ctx.resolvedEncodings);
        // ctx.channelSemantics, ctx.layout, ctx.table, ctx.chartProperties, …
    },

    properties: [
        { key: 'opacity', label: 'Opacity', type: 'continuous',
          min: 0.1, max: 1, step: 0.05, defaultValue: 1 },
    ],
};
```

### 关键规则

1. **`template`** — 最小原生骨架；`instantiate` 填充 encodings 与 mark 属性。
2. **`markCognitiveChannel`** — 告诉编译器读者如何解码数值（影响零基线与 [Auto Layout Algorithm](/documentation/layout-model) 压缩）。
3. **`instantiate`** — 接收 `template` 的**深拷贝**以及 `InstantiateContext`（已解析 encodings、`ChannelSemantics`、`LayoutResult`、数据表、画布尺寸）。
4. **不做语义分支** — 读取 `ctx.channelSemantics[channel].format`、`.type`、`.zero` 等；不要按原始字段名或存储类型 switch。

可选钩子：`postProcess`（布局后）、`encodingActions`（shelf 快捷操作）。

---

# §3 注册模板

在 `packages/flint-js/src/<backend>/templates/index.ts` 中：

1. 导入新的 `*Def` 常量。
2. 将其加入 `*TemplateDefs` 内合适的 category 数组（例如 `scatterTemplates`）。
3. 确保 `*GetTemplateDef(chartType)` 能找到它：`defs.find(t => t.chart === chartType)`。

Vega-Lite 还会运行 `withInjectedProperties()`，为各模板附加共享的分面与对数比例尺属性。若你的图表需要相同钩子，请参照该文件中的现有条目。

---

# §4 添加测试数据与 gallery 覆盖

### 生成器模式

`TestCase` 接口位于 `packages/flint-js/src/test-data/types.ts`。

典型流程（见 `scatter-tests.ts`、`bar-tests.ts`）：

1. 定义小型参数矩阵（基数、是否着色、是否分面）。
2. 导出 `gen<Chart>Tests(): TestCase[]`，其中 `chartType` 与 `ChartTemplateDef.chart` 一致。
3. 在 `packages/flint-js/src/test-data/index.ts` 中注册：

```typescript
TEST_GENERATORS['Dot Plot'] = genDotPlotTests;
```

4. 可选地在 `gallery-tree.ts` 中添加列出该生成器键的页面。

### 验证

```bash
npm run typecheck
npm run test
npm run site    # Gallery → find your chart type
```

在 3–6 个代表性用例上检查格式化、布局拉伸、图例与分面行为。

---

# §5 跨后端对等

面向用户的契约是：在模板存在的前提下，相同的 `chartType` 字符串应能在 `assembleVegaLite`、`assembleECharts` 和 `assembleChartjs` 上工作。实践中：

- 先移植到你立即需要的后端；其余可另开跟进。
- `site/src/shared/supported-backends.ts` 按各后端注册表过滤图表类型。仅 Vega-Lite 的模板在注册到 ECharts 之前不会出现在 ECharts 中。

---

# §6 相关文档

- [Extending backends](/documentation/adding-a-backend) — 完整组装器接线
- [Semantic Type](/documentation/semantic-types) — `channelSemantics` 包含的内容
- [Auto Layout Algorithm](/documentation/layout-model) — `declareLayoutMode` 与 stretch 模型
- [API reference](/documentation/api-reference) — `chart_spec.chartType` 与 encodings
