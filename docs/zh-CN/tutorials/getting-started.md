# 入门指南

Flint 从一个简单想法出发：先描述**你的数据代表什么**，再说明**你想要什么样的图**。Flint 会将其编译为可直接渲染的图表规范，目标后端为 Vega-Lite、ECharts 或 Chart.js。

本页刻意保持第一次接触时的体量较小。你将安装包、查看一份完整的 Flint 规范，并将其编译成图表。

## 安装

### JavaScript / TypeScript

安装 Flint：

```bash
npm install flint-chart
```

若要在浏览器中渲染 Vega-Lite 图表，还需安装渲染栈：

```bash
npm install vega vega-lite vega-embed
```

### Python 规划中

Python 包计划在后续版本发布，不包含在首次公开发版中。目前请使用 JavaScript/TypeScript 包或 MCP 服务器；贡献者仍可从源码使用 Python 移植版。

## 你的第一份 Flint 规范

以下是一份小型月度注册量图表的完整输入：

```json
{
  "data": {
    "values": [
      { "month": "2024-01", "signups": 120 },
      { "month": "2024-02", "signups": 146 },
      { "month": "2024-03", "signups": 168 },
      { "month": "2024-04", "signups": 164 },
      { "month": "2024-05", "signups": 181 }
    ]
  },
  "semantic_types": {
    "month": "YearMonth",
    "signups": "Quantity"
  },
  "chart_spec": {
    "chartType": "Line Chart",
    "encodings": {
      "x": { "field": "month" },
      "y": { "field": "signups" }
    },
    "baseSize": { "width": 420, "height": 280 }
  }
}
```

```flint-chart
{
  "data": {
    "values": [
      { "month": "2024-01", "signups": 120 },
      { "month": "2024-02", "signups": 146 },
      { "month": "2024-03", "signups": 168 },
      { "month": "2024-04", "signups": 164 },
      { "month": "2024-05", "signups": 181 }
    ]
  },
  "semantic_types": {
    "month": "YearMonth",
    "signups": "Quantity"
  },
  "chart_spec": {
    "chartType": "Line Chart",
    "encodings": {
      "x": { "field": "month" },
      "y": { "field": "signups" }
    },
    "baseSize": { "width": 420, "height": 280 }
  }
}
```

可以将其理解为两部分：

- **DataSpec**：`data` 与 `semantic_types` 部分。表格数据在这里，每一列也会获得语义含义。`month` 为 `YearMonth`，因此 Flint 会将 `2024-01` 这类字符串当作日期处理。`signups` 为 `Quantity`，因此 Flint 会为其分配数值轴。若你面对的是凌乱的 CSV、数据库 schema 或自然语言请求，AI 智能体可以替你起草这部分；参见[智能体工作流](/documentation/agent-workflows)。
- **ChartSpec**：`chart_spec` 部分。这是对图表外观的请求：使用 `Line Chart` 模板，将 `month` 放在 x 轴，将 `signups` 放在 y 轴。

这就是核心工作流。DataSpec 说明数据*是什么*。ChartSpec 说明你想*如何查看它*。将 JSON 粘贴到[在线编辑器](/editor)中即可实时编辑。

## 编译

在 JavaScript 或 TypeScript 中，将相同输入传给 assembler：

```ts
import { assembleVegaLite } from 'flint-chart';

const input = {
  data: {
    values: [
      { month: '2024-01', signups: 120 },
      { month: '2024-02', signups: 146 },
      { month: '2024-03', signups: 168 },
      { month: '2024-04', signups: 164 },
      { month: '2024-05', signups: 181 },
    ],
  },
  semantic_types: {
    month: 'YearMonth',
    signups: 'Quantity',
  },
  chart_spec: {
    chartType: 'Line Chart',
    encodings: {
      x: { field: 'month' },
      y: { field: 'signups' },
    },
    baseSize: { width: 420, height: 280 },
  },
};

const spec = assembleVegaLite(input);
```

Flint 返回一份普通的 Vega-Lite 规范。使用 Vega-Embed 渲染：

```ts
import embed from 'vega-embed';

await embed('#chart', spec);
```

同一份 Flint 输入在 JavaScript 中也可指向其他后端：

```ts
import { assembleChartjs, assembleECharts } from 'flint-chart';

const chartjsConfig = assembleChartjs(input);
const echartsOption = assembleECharts(input);
```

Python 支持将使用相同的输入结构，计划在后续版本发布。

## 接下来读什么

- [示例：数据故事](/documentation/data-story) 说明这种拆分为何重要：同一份 DataSpec 只需修改 ChartSpec 即可生成五种不同图表。
- [配置 Flint MCP](/documentation/setup-flint-mcp) 说明如何在聊天或 IDE 中让智能体渲染图表时连接 MCP 服务器。
- [智能体工作流](/documentation/agent-workflows) 说明如何将 Flint 的图表契约嵌入自定义智能体或产品工作流。
- [Semantic Type](/documentation/semantic-types) 解释 Flint 理解的语义标签，例如 `YearMonth`、`Quantity`、`Category` 和 `Profit`。
- [Gallery](/gallery) 列出 Vega-Lite、ECharts 与 Chart.js 上可用的图表模板。
- [概览](/documentation/overview) 在你准备好深入了解完整模型时提供架构说明。
