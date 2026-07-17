# 智能体工作流

本指南介绍一种 Data Formulator 风格的集成方式：智能体协助创建图表，应用负责数据处理、校验、状态管理、界面控件、编译和渲染。

若你只想在聊天或 IDE 客户端中将 Flint 作为 MCP 工具连接，请从[配置 Flint MCP](/documentation/setup-flint-mcp) 开始。本页聚焦库式集成：即 [Data Formulator](https://github.com/microsoft/data-formulator) 等产品所用的模式——智能体可提议数据塑形与图表请求，而产品控制实际运行与存储内容。

## 核心思想

不要让智能体直接输出 Vega-Lite、ECharts、Chart.js 或渲染器代码。让它生成 Flint `ChartAssemblyInput`：

```jsonc
{
  "data": { "values": [/* rows, or bound by the host */] },
  "semantic_types": {
    "month": "YearMonth",
    "product": "Category",
    "revenue": "Quantity"
  },
  "chart_spec": {
    "chartType": "Line Chart",
    "encodings": {
      "x": { "field": "month" },
      "y": { "field": "revenue" },
      "color": { "field": "product" }
    }
  }
}
```

这样得到的图表请求简洁、可检查、可编辑。Flint 编译器负责轴类型、零基线、时间解析、数字格式、默认颜色、尺寸、布局和后端图形细节。

将 Flint 视为智能体与渲染器之间的语义图表层：

```text
user intent + data context
        ↓
agent proposes data preparation + ChartAssemblyInput
        ↓
host validates fields, schema, policy, and backend support
        ↓
Flint compiles to Vega-Lite / ECharts / Chart.js
        ↓
product renders, stores, edits, or asks the agent for a revision
```

## 产品职责

在自定义工作流中，智能体不应拥有整个可视化系统。为每一部分明确分工：

| 层级 | 职责 |
|------|------|
| Agent | 理解用户请求、检查数据上下文、提议转换、选择语义类型，并起草或修订 `chart_spec`。 |
| Host product | 执行数据转换、绑定行、验证字段、执行策略、存储图表状态、暴露 UI 控件并选择后端。 |
| Flint | 将语义图表请求编译为带确定性设计默认值的后端原生图表规范。 |
| Renderer | 在浏览器、notebook、服务或导出流水线中绘制后端规范。 |

这种分工让工作流更稳定。智能体处理图表意图，应用控制执行、状态、安全和用户体验，Flint 负责不应堆在提示词里的可视化规则。

## 将 Flint 输入存为图表状态

尽可能存储 Flint 输入，而非生成的后端 JSON。

- **DataSpec** 是 `data` 与 `semantic_types` 部分。它告诉 Flint 有哪些列及其含义。
- **ChartSpec** 是 `chart_spec` 部分。它告诉 Flint 使用哪种图表模板以及字段如何映射到通道。

Flint 输入通常很小，可以存入产品数据库、notebook 单元、仪表盘配置或对话状态。界面可以直接修改通道、图表类型、排序、尺寸和图表属性，无需让智能体重新生成底层 JSON。

按需编译后端规范：

```ts
import { assembleChartjs, assembleECharts, assembleVegaLite } from 'flint-chart';

const vegaLiteSpec = assembleVegaLite(input);
const echartsOption = assembleECharts(input);
const chartjsConfig = assembleChartjs(input);
```

只安装产品需要的渲染器依赖：

```bash
npm install flint-chart
npm install vega vega-lite vega-embed  # browser Vega-Lite rendering
npm install echarts                    # ECharts rendering
npm install chart.js                   # Chart.js rendering
```

Python 支持将使用相同的输入结构，但计划在后续版本发布，不属于首次公开发版。目前请在已发布工作流中使用 npm 包或 MCP 服务器。

## 为智能体提供图表编写指南

图表编写指南位于
[agent-skills/flint-chart-author/SKILL.md](https://github.com/microsoft/flint-chart/blob/main/agent-skills/flint-chart-author/SKILL.md)。
可以将它放入智能体提示词、工具描述或检索上下文。

即使智能体没有安装 Flint，也可以通过这份指南了解准确的图表类型名称、支持的通道、图表属性、语义类型和数据绑定规则。

给智能体的持久指令是：

- 为字段选择语义类型，例如 `YearMonth`、`Quantity`、`Category`、`Price`、`Profit` 或 `Percentage`；
- 按确切名称选择受支持的 `chartType`；
- 将真实字段绑定到受支持通道，如 `x`、`y`、`color`、`row`、`column`、`size` 或 `group`；
- 当请求的视图需要聚合、过滤、连接、透视、派生列或宽/长重塑时，在 Flint 之前转换数据；
- 返回 Flint 输入，而非后端原生 JSON，除非用户明确要求 post-Flint 后端定制。

## 演练：Data Formulator 风格创作

想象一个 Data Formulator 风格产品，拥有原始 `orders` 表。用户问：

```text
Show monthly revenue by region.
```

原始表包含如下列：

| Field | Example | 含义 |
|-------|---------|------|
| `order_date` | `2025-01-17` | 每笔订单的日期 |
| `region` | `West` | 销售地区 |
| `segment` | `Consumer` | 客户细分 |
| `sales` | `1240.50` | 订单收入 |
| `profit` | `310.20` | 订单的有符号利润 |

用户并未要求对单笔订单作图。他们要求月度聚合，因此产品不应让智能体把聚合藏进 Vega-Lite transform。产品应要求两件事：

1. 创建可直接作图表格的代码或声明式计划；
2. 针对该派生表的 Flint `ChartAssemblyInput`。

### 1. 向智能体发送紧凑上下文

应用向智能体发送用户请求和数据概要，通常无需发送整个数据集。

```text
Use the Flint chart authoring skill.

User request: Show monthly revenue by region.

Current table: orders
Fields:
- order_date: Date, examples 2025-01-17, 2025-01-22
- region: Category, examples West, East, Central, South
- segment: Category, examples Consumer, Corporate
- sales: Quantity, numeric, non-negative
- profit: Profit, numeric, signed

Return one JSON object with:
- transform_code: Python pandas code that creates a chart-ready DataFrame named chart_df
- chart_input: a Flint ChartAssemblyInput for chart_df

Do not write Vega-Lite, ECharts, Chart.js, or renderer code.
Use only fields produced by chart_df in chart_input.
Leave chart_input.data.values empty; the host will bind rows after executing the transform.
```

### 2. 让智能体提议数据塑形与 Flint 输入

好的响应将数据转换与图表请求分开：

```jsonc
{
  "transform_code": "import pandas as pd\nchart_df = orders.copy()\nchart_df['month'] = pd.to_datetime(chart_df['order_date']).dt.to_period('M').astype(str)\nchart_df = chart_df.groupby(['month', 'region'], as_index=False).agg(revenue=('sales', 'sum'))",
  "chart_input": {
    "data": { "values": [] },
    "semantic_types": {
      "month": "YearMonth",
      "region": "Region",
      "revenue": "Amount"
    },
    "chart_spec": {
      "chartType": "Line Chart",
      "encodings": {
        "x": { "field": "month" },
        "y": { "field": "revenue" },
        "color": { "field": "region" }
      }
    }
  }
}
```

重要属性是拆分：智能体不会把聚合塞进后端 JSON，Flint 输入只引用派生表中会存在的字段。

### 3. 在应用中执行并检查

产品在自有可信或沙箱计算路径中执行 `transform_code`，然后在渲染前检查 `chart_df`。例如：

```text
month    region   revenue
2025-01  East     18420.50
2025-01  West     21310.10
2025-02  East     19770.00
2025-02  West     22640.75
```

如果代码使用未知列、产生过多行、出现意外空值或未通过安全检查，应用可以拒绝执行。智能体提出方案，应用决定是否运行和保留结果。

### 4. 绑定行并用 Flint 编译

执行后，应用将 `chart_df` 的数据写入 `chart_input.data.values`，再编译图表。

```ts
import { assembleVegaLite } from 'flint-chart';

const chartInput = {
  ...agentResult.chart_input,
  data: { values: chartRows },
};

const vegaLiteSpec = assembleVegaLite(chartInput);
```

同一份存储的 Flint 输入稍后也可编译到其他后端：

```ts
import { assembleECharts } from 'flint-chart';

const echartsOption = assembleECharts(chartInput);
```

### 5. 围绕 Flint 状态构建 UI

在 Data Formulator 风格的界面中，产品可以同时展示两项内容：

- 派生数据视图（`chart_df`），供用户检查正在作图的表格；
- ChartSpec 控件，使用户可更改图表类型、通道、排序、尺寸或图表属性，而无需编辑后端 JSON。

如果用户说“也按 segment 拆分”，应用可以让智能体修改规范，也可以提供界面控件，将 `segment` 加入 `column`、`row` 或 `color`。无论采用哪种方式，都只需修改 Flint 输入并重新编译。

### 6. 将后端微调放在下游

如果产品需要某个后端特有的标注或交互，请在 Flint 编译之后添加。Flint 输入仍是图表的主要状态；修改后的 Vega-Lite 或 ECharts JSON 只用于最终渲染。

## 可复用的提示词

集成到产品时，提示词应比自由对话更严格，并要求智能体返回可验证的结构化数据。如果当前数据已经可以直接作图，只需让智能体返回 Flint 输入：

```text
Use the Flint chart authoring skill.

Return only a valid ChartAssemblyInput JSON object.
The current data view has fields: month, product, revenue, profit.
Create a monthly revenue trend by product.
Infer semantic_types, use only fields that exist, and do not write Vega-Lite,
ECharts, Chart.js, or renderer code.
```

当数据尚未可直接作图时，要求转换代码加 Flint 输入：

```text
Use the Flint chart authoring skill.

From the orders table, create monthly revenue by region.
Return one JSON object with:
- transform_code: Python pandas code that creates a chart-ready DataFrame named chart_df
- chart_input: a Flint ChartAssemblyInput for the transformed rows

The chart_input.data field should be empty or placeholder rows. The host will
execute the code, inspect the derived table, and bind data.values afterward.
```

系统随后可解析 JSON、验证、执行或拒绝转换、存储接受的 Flint 输入、编译、渲染预览，或将具体反馈发回智能体。

## 渲染或保存前验证

校验应由应用执行，不能只依赖提示词。接受智能体生成的图表前，请检查：

- 每个编码字段存在于当前或派生数据视图中；
- `semantic_types` 使用 Flint 已注册标签，而非自造名称；
- `chartType` 对所选后端与产品界面允许；
- 编码通道被该图表类型支持；
- 必需通道存在；
- 本地策略允许请求的后端、数据大小、图表大小与文件访问模式；
- 派生数据塑形发生在 Flint 上游，而非通过自造的 Flint transform 属性。

如果产品使用 MCP 服务器，可以调用 `validate_chart` 在服务端校验。如果产品直接集成 Flint 库，请在 `try/catch` 中调用对应的编译函数，并在界面中显示警告或错误。

## 构建编辑循环

首张图表渲染后，修订保持语义化。请智能体或 UI 更改 Flint 输入，而非后端规范：

| 用户意图 | 产品操作 |
|----------|----------|
| "Compare regions side by side" | 更改图表类型，或将 region 字段路由到 `group`、`color`、`column` 或 `row`，取决于图表族。 |
| "Show profit instead of revenue" | 在 `chart_spec.encodings` 中替换度量字段。 |
| "Use a small multiple view" | 当图表支持分面时，将分组字段移到 `column` 或 `row`。 |
| "Make it a donut" | 保持 `Pie Chart` 并设置 `chartProperties.innerRadius`。 |
| "Try ECharts" | 用 `assembleECharts` 重新编译同一份 Flint 输入。 |

这使用户编辑廉价且确定。智能体对模糊意图、数据转换或图表设计建议有用。常规 UI 编辑可直接修改 ChartSpec。

## 仅在 Flint 之后做后端定制

部分产品需求是后端特定的：标注、精确轴样式、自定义 mark 装饰或渲染器特定交互。将这些更改放在 Flint 编译步骤之后。

推荐路径：

1. 将 Flint 输入存为规范图表状态。
2. 编译到目标后端。
3. 应用最小的后端特定展示 patch。
4. 渲染 patch 后的后端规范。

不要将 patch 后的 Vega-Lite、ECharts 或 Chart.js JSON 回灌 Flint。一旦编辑后端 JSON，它就不再是可移植的 Flint 状态。

## 一套实用流程

典型的自定义智能体实现如下：

1. 收集用户请求与紧凑数据概要：列名、样本行、语义提示、基数、最小/最大值与已知单位。
2. 请智能体返回 `ChartAssemblyInput`，或转换代码加 `ChartAssemblyInput`。
3. 在产品拥有的沙箱或可信计算路径中执行转换。
4. 从当前或派生表绑定 `data.values`。
5. 验证字段、语义类型、图表类型、通道、后端支持、尺寸与策略。
6. 将 Flint 输入存为规范图表状态。
7. 编译到所选后端并渲染。
8. 让 UI 控件或智能体修订 Flint 输入，然后从验证重复。

该循环使 Flint 成为自然语言图表意图与生产渲染之间的稳定契约。

## 下一步

- [入门指南](/documentation/getting-started) 用一张小图解释 DataSpec 与 ChartSpec 的结构。
- [示例：数据故事](/documentation/data-story) 展示同一份源数据视图如何仅通过更改 ChartSpec 变成多种图表设计。
- [配置 Flint MCP](/documentation/setup-flint-mcp) 说明如何通过 MCP 服务器为智能体提供 Flint 图表工具。
- [Vega-Lite charts](/documentation/reference-vegalite)、
  [ECharts charts](/documentation/reference-echarts) 与
  [Chart.js charts](/documentation/reference-chartjs) 按后端列出支持的图表类型。
- [语义类型](/documentation/semantic-types) 列出智能体可用于字段的标签。
