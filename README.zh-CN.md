# Flint：AI 时代的可视化语言

[English](README.md) | **简体中文** | [日本語](README.ja.md)

[![npm: flint-chart](https://img.shields.io/npm/v/flint-chart.svg?label=npm%3A%20flint-chart)](https://www.npmjs.com/package/flint-chart)
[![npm: flint-chart-mcp](https://img.shields.io/npm/v/flint-chart-mcp.svg?label=npm%3A%20flint-chart-mcp)](https://www.npmjs.com/package/flint-chart-mcp)
[![CI](https://github.com/microsoft/flint-chart/actions/workflows/ci.yml/badge.svg)](https://github.com/microsoft/flint-chart/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**请访问：** [**Flint 项目网站**](https://microsoft.github.io/flint-chart/) | [**MCP 服务器指南**](https://microsoft.github.io/flint-chart/#/mcp) | [**中文主页**](https://microsoft.github.io/flint-chart/#/zh)

Flint 是一种可视化中间语言，让 **AI 智能体能够根据简单且便于人工编辑的图表规范，
创建表现力丰富、精美完善的可视化图表**。
智能体或开发者无需再逐项调整比例尺、坐标轴、间距、标签和布局等冗长的图表配置
细节；Flint 编译器会根据数据、语义类型、图表类型和
编码推导出优化后的图表设置。最终得到的紧凑图表规范既能由智能体
可靠生成，也可由人工直接编辑，还能通过多个后端渲染为原生
[Vega-Lite](https://vega.github.io/vega-lite/)、
[ECharts](https://echarts.apache.org/) 或
[Chart.js](https://www.chartjs.org/) 规范。

本仓库包含两个主要组件：

- **`flint-chart`**：一个 JavaScript/TypeScript 库，可将同一份
  Flint 输入编译为 Vega-Lite、ECharts 或 Chart.js 规范。
- **`flint-chart-mcp`**：一个 MCP 服务器，让智能体能够直接在聊天或编码
  环境中创建、验证和渲染图表。

<p align="center">
  <img src="docs/figs/chartwall.png" alt="由 Flint 生成的一组图表：条形图、折线图、散点图、热力图、环形图、雷达图、河流图、箱线图、分组条形图、玫瑰图、桑基图和矩形树图，并分别通过 Vega-Lite、ECharts 和 Chart.js 渲染。" width="100%">
</p>

## 功能


- **语义化图表规范。** Flint 使用 70 多种语义类型来描述每个字段的含义，
  例如 `Rank`、`Temperature`、`Price` 或 `Country`。
- **自动布局。** Flint 会根据数据基数、图表设计和画布约束，
  自动调整尺寸、间距、标签、标记和图例。
- **多个后端。** 使用同一份输入，即可通过
  [Vega-Lite](https://vega.github.io/vega-lite/)、
  [ECharts](https://echarts.apache.org/) 和
  [Chart.js](https://www.chartjs.org/) 编译出 30 多种图表类型，未来还会支持更多后端。
- **面向智能体的图表创作。** MCP 服务器为智能体提供 Flint 工具和
  图表指导，使其可以选择模板、完成验证，并在支持 MCP 的客户端中打开
  交互式图表视图。

## 更新

- **2026 年 7 月 19 日** — Flint 0.3.0 新增动态图表小组件，可切换图表
  类型并直接编辑图表属性。([v0.3.0](https://github.com/microsoft/flint-chart/releases/tag/0.3.0))
- **2026 年 7 月 15 日** — Flint 0.2.2 新增紧凑的错开模式和分组小提琴图
  布局。
- **2026 年 7 月 13 日** — Flint 0.2.1 改进了图表属性验证和后端
  一致性。([v0.2.1](https://github.com/microsoft/flint-chart/releases/tag/0.2.1))

完整的发布说明请参阅[变更日志](CHANGELOG.md)。


<p align="center">
  <img src="docs/figs/compile-demo.png" alt="Flint 将紧凑的图表规范编译为 Vega-Lite 规范和渲染后的热力图可视化。" width="100%">
  <br>
  <sub>Flint 将紧凑的图表规范转换为后端原生规范和渲染后的可视化图表。</sub>
</p>

## 安装

```bash
# Use Flint in your JavaScript/TypeScript codebase
npm install flint-chart

# For agents and MCP clients
npx -y flint-chart-mcp
```

<p><sub><span style="color: #6a737d;">Python 包尚未发布。仓库中的当前 Python 移植版本仅提供源码预览。</span></sub></p>

## 将 Flint 用作库

每个后端都接受同一种 `ChartAssemblyInput`，并返回目标
库的原生规范对象。

```ts
import { assembleVegaLite } from 'flint-chart';

const spec = assembleVegaLite({
  data: { values: myData },
  semantic_types: { weight: 'Quantity', mpg: 'Quantity', origin: 'Country' },
  chart_spec: {
    chartType: 'Scatter Plot',
    encodings: { x: { field: 'weight' }, y: { field: 'mpg' }, color: { field: 'origin' } },
    baseSize: { width: 400, height: 300 },
  },
});
// → a ready-to-render Vega-Lite spec
```

无需改变输入结构即可切换后端：

```ts
import { assembleECharts, assembleChartjs } from 'flint-chart';

const echartsOption = assembleECharts(input);
const chartjsConfig = assembleChartjs(input);
```

更多库示例请参阅 [API 参考](docs/api-reference.md)、[后端参考](docs/reference-vegalite.md)
和[在线编辑器](https://microsoft.github.io/flint-chart/#/editor)。

## 将 Flint 用作 MCP 服务器

如果希望智能体在发起问题的同一个对话中创建图表，可将 `flint-chart-mcp`
安装为 [Model Context Protocol](https://modelcontextprotocol.io/) 服务器。
它可以打开交互式图表视图、返回静态 PNG/SVG 输出，或生成后端原生图表规范。

配置时请先查看
[Flint MCP 项目页面](https://microsoft.github.io/flint-chart/#/mcp)，其中包含
客户端配置、使用示例以及更深入参考资料的链接。

<p align="center">
  <img src="docs/figs/flint-mcp-experience.png" alt="智能体聊天界面展示作为 MCP App 运行的 Flint Chart，其中包含分组条形图预览和图表选项。" width="100%">
</p>

MCP 调用可以通过 `data.values` 直接嵌入数据行，也可以通过 `data.url`
读取本地 JSON、CSV 或 TSV 文件。对于不使用 MCP 的智能体工作流，
请使用独立的[智能体技能](agent-skills/flint-chart-author/SKILL.md)。

## 仓库概览

```
flint-chart/
├── packages/
│   ├── flint-js/          npm package `flint-chart` (TypeScript)
│   │   └── src/
│   │       ├── core/      semantics, layout, decisions, shared types
│   │       ├── vegalite/  Vega-Lite backend
│   │       ├── echarts/   ECharts backend
│   │       ├── chartjs/   Chart.js backend
│   │       └── test-data/ fixtures + generators (drive tests and the gallery)
│   ├── flint-py/          Python port preview (package to be released)
│   └── flint-mcp/         npm package `flint-chart-mcp` (MCP render server)
├── site/                  Vite + React demo: landing, gallery, editor, docs
├── agent-skills/          fallback copy of the MCP-served agent skill
├── shared/test-data/      JSON fixtures shared across JS + Python
└── docs/                  architecture and design documents
```

### 文档

[项目网站](https://microsoft.github.io/flint-chart/)是示例、在线编辑器和概念文档的主要
入口。若要查看源码级参考资料，请从 [API 参考](docs/api-reference.md)、
[Flint MCP 项目页面](https://microsoft.github.io/flint-chart/#/mcp)或
[开发指南](docs/DEVELOPMENT.md)开始。每个版本的重要变更请参阅
[变更日志](CHANGELOG.md)。

---

## 参与贡献

欢迎贡献！请参阅 [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)
和[开发指南](docs/DEVELOPMENT.md)。

```bash
git clone https://github.com/microsoft/flint-chart
cd flint-chart
npm install            # root workspaces: packages/flint-js + flint-mcp + site

npm run typecheck      # typecheck packages/flint-js + packages/flint-mcp
npm run test           # Vitest (packages/flint-js + packages/flint-mcp)
npm run build          # build packages/flint-js + packages/flint-mcp
npm run site           # demo site (gallery + editor) at http://localhost:5274/
```

需要 Node 18 或更高版本。演示网站会将 `flint-chart` 映射到
`packages/flint-js/src`，因此库的编辑内容可在图库和编辑器中热更新，
无需重新构建 `dist/`。

我们尤其欢迎贡献新的
[图表模板](docs/adding-a-chart-template.md)或新的
[渲染后端](docs/adding-a-backend.md)。

本项目已采用
[Microsoft 开源行为准则](.github/CODE_OF_CONDUCT.md)。安全漏洞请按照
[SECURITY.md](.github/SECURITY.md) 中的说明报告。

## 贡献者

Flint 由 [Microsoft Research](https://www.microsoft.com/en-us/research/)
与中国人民大学 [IDEAS Lab](https://ideas-lab.net/) 合作开发。欢迎加入我们——请参阅[参与贡献](#参与贡献)。

介绍 Flint 的研究论文即将发布。

## 商标

本项目可能包含项目、产品或服务的商标或徽标。
Microsoft 商标或徽标的授权使用必须遵守
[Microsoft 商标和品牌指南](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general)。
在本项目的修改版本中使用 Microsoft 商标或徽标时，不得造成混淆或暗示获得 Microsoft 赞助。
任何第三方商标或徽标的使用均须遵守相应第三方的政策。

## 许可证

[MIT](LICENSE) © Microsoft Corporation
