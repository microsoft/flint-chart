# 概览

**Flint** 是一种面向数据可视化的语义驱动中间语言（IL）。你声明每个字段的*含义*以及想要的图表；编译器会推导比例尺、坐标轴、聚合、格式化、布局和颜色，然后输出 Vega-Lite、ECharts 或 Chart.js。

如果你是 Flint 新手，请从[入门指南](/documentation/getting-started)开始，然后再回到这里了解架构与 API 地图。

---

## 目录

- [§1 Flint 是什么](#1-what-flint-is)
- [§2 问题背景](#2-the-problem)
- [§3 Flint 规范](#3-flint-specification)
- [§4 编译器输出](#4-compiler-output)
- [§5 架构一览](#5-architecture-at-a-glance)
- [§6 文档地图](#6-documentation-map)
- [§7 安装与快速开始](#7-install-and-quick-start)
- [§8 本站工具](#8-tools-on-this-site)
- [§9 延伸阅读](#9-further-reading)

---

# §1 Flint 是什么

Flint 将**数据语义**与**图表意图**分离，就像中间语言将程序逻辑与目标机器代码分离一样。作者无需手动微调相互依赖的低层参数，LLM 智能体也可以输出紧凑的 Flint 程序，而不是冗长、重新生成成本高、且在小改动下易碎的原生规范。

---

# §2 问题背景

当原始数据类型与视觉映射一致时，声明式语法（Vega-Lite、ECharts 等）效果很好。但当**语义含义**与存储表示不一致时，它们会变得脆弱：

- 整数 `202001` 表示 **YearMonth**，而非定量幅度
- 堆叠不可加性度量（温度、比率）
- 在顺序色带上使用发散型字段

专家可以用冗长、耦合的规范修复这些情况，但在更换字段、旋转热力图或更改图表类型时，这些规范很难保持正确。Flint 将**语义类型视为一等对象**，并根据语义与数据特征解析编码和布局。

---

# §3 Flint 规范

一个 Flint 程序有两个可复用部分：

| Flint 术语 | API 字段 | 作用 |
|------------|-----------|------|
| **dataSpec** | `semantic_types` | 每个字段的含义 → 类型字符串或富注解 |
| **chartSpec** | `chart_spec` | 图表类型 + 通道 → 字段绑定 |

原始行数据存放在 `data` 中。三者共同构成 `ChartAssemblyInput`：

```text
data  +  semantic_types  +  chart_spec  →  assemble*()  →  native spec
```

### dataSpec 示例

注解**内联**在 `semantic_types` 中——没有单独的 `semantic_annotations` 字段：

```json
{
  "semantic_types": {
    "period": "YearMonth",
    "game": "Category",
    "gameType": "Category",
    "newUsers": "PercentageChange",
    "totalUsers": "Quantity",
    "region": {
      "semanticType": "Category",
      "sortOrder": ["N", "E", "S", "W"]
    }
  }
}
```

### chartSpec 示例

分面折线图：

```json
{
  "chart_spec": {
    "chartType": "Line Chart",
    "encodings": {
      "column": { "field": "region" },
      "x": { "field": "period" },
      "y": { "field": "totalUsers" },
      "color": { "field": "gameType" }
    },
    "baseSize": { "width": 480, "height": 320 }
  }
}
```

**探索工作流：** 仅修改 `chart_spec` 即可尝试热力图、分组柱状图、瀑布图或旭日图。**dataSpec 保持不变**，你还可以切换后端（例如 Vega-Lite → ECharts）而无需重写 Flint 输入。模板与后端覆盖范围请见[图库](/gallery)。

语义类型采用三级层次结构。详情见[语义类型](/documentation/semantic-types)。

---

# §4 编译器输出

| 函数 | 输出 |
|----------|--------|
| `assembleVegaLite(input)` | Vega-Lite v6 spec |
| `assembleECharts(input)` | ECharts `option` |
| `assembleChartjs(input)` | Chart.js config |

同一输入可编译到所有支持的后端。阶段 1–2（语义 + 布局）位于共享的 `core/`；仅阶段 3（模板实例化）因库而异。

完整输入模式见 [API 参考](/documentation/api-reference)。

---

# §5 架构一览

![Overview of the Flint architecture](figs/overview.png)

| Flint 阶段 | 代码 | 模块 |
|-------------|------|--------|
| **编译器前端** | Phase 0 — `resolveChannelSemantics()` | `core/resolve-semantics.ts` |
| **优化器** | Phase 1 — `computeLayout()`、overflow filter | `core/compute-layout.ts` |
| **代码生成器** | Phase 2 — `template.instantiate()` | `vegalite/`、`echarts/`、`chartjs/` |

1. **前端** — 从 dataSpec + data 推导编码类型、格式、聚合、比例尺、域、颜色和排序
2. **优化器** — 用基于物理的尺寸选择坐标轴跨度、带宽步长、分面网格和宽高比；先从[示例：自动布局](/documentation/chart-sizing)入手，再用[自动布局算法](/documentation/layout-model)了解公式
3. **代码生成器** — 为每个 `chartType` 使用动态模板，输出库原生规范

流水线详情见[架构](/documentation/architecture)。

---

# §6 文档地图

| 章节 | 页面 |
|---------|-------|
| **语言设计** | [架构](/documentation/architecture)、[语义类型](/documentation/semantic-types)、[自动布局算法](/documentation/layout-model)、[API 参考](/documentation/api-reference) |
| **图表参考** | [Vega-Lite 图表](/documentation/reference-vegalite)、[ECharts 图表](/documentation/reference-echarts)、[Chart.js 图表](/documentation/reference-chartjs) |
| **开发** | [开发指南](/documentation/development)、[扩展语义类型](/documentation/adding-a-semantic-type)、[扩展后端](/documentation/adding-a-backend)、[扩展图表模板](/documentation/adding-a-chart-template) |

---

# §7 安装与快速开始

```bash
npm install flint-chart    # JavaScript / TypeScript
npx -y flint-chart-mcp     # MCP server for agents

# Python/PyPI is planned for a later release.
```

```ts
import { assembleVegaLite } from 'flint-chart';

const spec = assembleVegaLite({
  data: { values: [{ quarter: 'Q1', revenue: 1200 }] },
  semantic_types: { quarter: 'Quarter', revenue: 'Price' },
  chart_spec: {
    chartType: 'Bar Chart',
    encodings: { x: { field: 'quarter' }, y: { field: 'revenue' } },
    baseSize: { width: 480, height: 320 },
  },
});
```

---

# §8 本站工具

| 页面 | 用途 |
|------|---------|
| [入门指南](/documentation/getting-started) | 分步创建第一张图表 |
| [配置 Flint MCP](/documentation/setup-flint-mcp) | MCP 服务器配置、文件访问、工具与验证 |
| [智能体工作流](/documentation/agent-workflows) | 自定义智能体与产品集成模式 |
| [图库](/gallery) | 所有模板 + 多后端预览 |
| [编辑器](/editor) | 粘贴 JSON，切换 Vega-Lite / ECharts / Chart.js |

---

# §9 延伸阅读

- 面向智能体的设计说明：[docs/README.md](https://github.com/microsoft/flint-chart/blob/main/docs/README.md)
