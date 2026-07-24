# 入门指南

Flint 的思路很简单：先描述**数据代表什么**，再说明**你想要什么图表**。Flint 会据此生成 Vega-Lite、ECharts、Chart.js 或 Plotly 可以直接使用的规范，也可为 Office.js 宿主生成原生 Excel 图表工件。

本页只介绍最基本的流程：安装 Flint、阅读一份完整规范，再将它编译成图表。

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

下面是一份月度注册量折线图的完整输入：

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

这份输入分为两部分：

- **DataSpec**：由 `data` 和 `semantic_types` 组成，包含表格数据和每列的语义。`month` 是 `YearMonth`，所以 Flint 会把 `2024-01` 这样的字符串当作日期；`signups` 是 `Quantity`，所以会使用数值轴。如果数据来自杂乱的 CSV、数据库结构或自然语言请求，可以让 AI 智能体起草这部分。详见[智能体工作流](/documentation/agent-workflows)。
- **ChartSpec**：即 `chart_spec`，描述图表类型和字段位置。这里使用 `Line Chart`，将 `month` 放在 x 轴，将 `signups` 放在 y 轴。

这就是 Flint 的核心：DataSpec 说明数据*是什么*，ChartSpec 说明你想*怎么看*。将 JSON 粘贴到[在线编辑器](/editor)即可实时查看和修改。

## 编译

在 JavaScript 或 TypeScript 中，将同一份输入传给编译函数：

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

同一份 Flint 输入也可以编译为其他后端的配置：

```ts
import { assembleChartjs, assembleECharts, assembleExcel, assemblePlotly } from 'flint-chart';

const chartjsConfig = assembleChartjs(input);
const echartsOption = assembleECharts(input);
const plotlyFigure = assemblePlotly(input);
const excelArtifact = assembleExcel(input);
```

Plotly 返回 `{ data, layout }` 图形。Excel 返回带版本的原生图表工件，Office.js 宿主可将其传给 `renderExcelChart`。

Python 支持将使用相同的输入结构，计划在后续版本发布。

## 接下来读什么

- [示例：数据故事](/documentation/data-story)：用同一份 DataSpec 和五种 ChartSpec 生成不同图表。
- [配置 Flint MCP](/documentation/setup-flint-mcp)：在聊天工具或 IDE 中连接 Flint MCP。
- [智能体工作流](/documentation/agent-workflows)：将 Flint 集成到自己的智能体产品中。
- [语义类型](/documentation/semantic-types)：了解 `YearMonth`、`Quantity`、`Category` 和 `Profit` 等语义标签。
- [图表示例](/gallery)：浏览 Vega-Lite、ECharts、Chart.js 和 Plotly 支持的图表模板；[Excel 图表示例](/gallery/excel)展示在 Excel 中捕获的原生可编辑图表。
- [概览](/documentation/overview)：进一步了解 Flint 的整体设计和架构。
