# 配置 Flint MCP

本页介绍如何在 MCP 客户端中配置 `flint-chart-mcp`，以及服务器提供哪些工具和资源。

如果你想让 VS Code、Claude Desktop、Cursor 或其他 MCP 客户端中的智能体创建 Flint 图表，请从这里开始。如果要将 Flint 库直接集成到自己的智能体产品中，请参阅[智能体工作流](/documentation/agent-workflows)。

## MCP 服务器提供什么

智能体负责生成 `ChartAssemblyInput`，MCP 服务器负责在本地校验、编译和渲染图表。

| 工具 | 用途 |
|------|------|
| `create_chart_view` | 打开交互式图表视图，提供实时 SVG 预览和图表选项。客户端支持 MCP Apps 时优先使用。 |
| `validate_chart` | 检查 Flint 输入，返回警告、错误和计算后的图表尺寸。 |
| `render_chart` | 渲染静态 PNG 或 SVG。客户端不支持 MCP Apps，或需要导出图片时使用。 |
| `compile_chart` | 生成可供 Vega-Lite、ECharts 或 Chart.js 直接使用的 JSON 规范。 |
| `list_chart_types` | 列出支持的图表类型和编码通道。 |

| 资源或提示词 | 用途 |
|--------------------|------|
| `flint://agent-skill` | 加载随服务器提供的 Flint 图表编写指南。 |
| `flint://chart-types` | 浏览支持的图表目录。 |
| `ui://flint-chart/chart-view.html` | `create_chart_view` 使用的 MCP App 界面资源。 |
| `author_flint_chart` | 加载 Flint 图表编写指南的提示词。 |

调用图表工具前，请让客户端加载 `flint://agent-skill`，或运行 `author_flint_chart` 提示词。编写指南包含有效的 `chartType` 名称、字段与通道的对应关系、语义类型、数据绑定规则，以及各渲染工具的适用场景。

## 要求

你需要：

- 能运行 stdio 服务器的 MCP 客户端；
- 该客户端可用的 Node.js 与 npm；
- 图表数据直接嵌入工具调用，或从本地文件读取。

服务器在本地渲染图表，不会把内联数据或本地文件上传到远程渲染服务。

## 使用 `npx` 运行

多数客户端可通过 `npx` 运行已发布包，无需全局安装：

```bash
npx -y flint-chart-mcp
```

该命令会启动 stdio MCP 服务器。通常只需把它写入 MCP 客户端配置，无需手动运行。

## 使用托管服务器

如果客户端仅支持远程 HTTP MCP 服务器，可连接 Flint 公共端点：

```text
https://flint.data-formulator.ai/mcp
```

客户端支持本地 stdio 时建议优先使用本地服务器，尤其是需要读取本地图表数据文件时。托管服务器接受直接嵌入工具调用的数据。

## 配置 VS Code

在 VS Code 中，于 `.vscode/mcp.json` 添加服务器条目：

```jsonc
{
  "servers": {
    "flint": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "flint-chart-mcp"]
    }
  }
}
```

默认配置允许智能体通过 `data.url` 读取本地 `.csv`、`.tsv` 或 `.json` 文件。如果运行环境不可信，请使用 `--disable-file-reference` 禁用本地文件引用。此时智能体必须通过 `data.values` 直接传入数据：

```jsonc
{
  "servers": {
    "flint": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "flint-chart-mcp", "--disable-file-reference"]
    }
  }
}
```

修改服务器代码或配置后，请在客户端重启 MCP 服务器。可以让智能体调用 `list_chart_types`，确认连接是否正常。

## 配置 Claude Desktop 或 Cursor

许多 MCP 客户端使用 `mcpServers` 对象：

```jsonc
{
  "mcpServers": {
    "flint": {
      "command": "npx",
      "args": ["-y", "flint-chart-mcp"]
    }
  }
}
```

要完全禁用本地文件读取（仅内联 `data.values`）：

```jsonc
{
  "mcpServers": {
    "flint": {
      "command": "npx",
      "args": ["-y", "flint-chart-mcp", "--disable-file-reference"]
    }
  }
}
```

## 从本仓库运行

开发 Flint 本身时，构建各包并将客户端指向本地 CLI。MCP 包依赖 `flint-chart`，因此需同时构建两者（根目录 `build` 脚本先构建 `flint-js`，再构建 `flint-mcp`）：

```bash
npm install
npm run build
```

若库已构建，仅需重建 MCP 包时，运行 `npm run build:mcp`。

VS Code 本地源码配置：

```jsonc
{
  "servers": {
    "flint": {
      "type": "stdio",
      "command": "node",
      "args": [
        "${workspaceFolder}/packages/flint-mcp/dist/cli.js"
      ]
    }
  }
}
```

修改服务器代码、渲染代码或捆绑的 MCP App UI 后，请重建并重启 MCP 服务器。

## 数据访问

MCP 工具调用可通过两种方式绑定数据：

- **直接传入数据：** 在工具调用中设置 `data: { values: [...] }`，适合较小或已经整理好的表格。
- **读取本地文件：** 使用 `data: { url: "..." }` 引用本地 `.json`、`.csv` 或 `.tsv` 文件。

默认情况下，服务器可以读取智能体指定的本地文件；相对路径从当前工作目录开始解析。服务器不会读取远程 URL。

对于不可信部署，使用 `--disable-file-reference` 完全拒绝本地文件引用。智能体须通过 `data.values` 内联传入行：

```bash
npx -y flint-chart-mcp --disable-file-reference
FLINT_MCP_DISABLE_FILE_REFERENCE=1 npx -y flint-chart-mcp
```

若图表请求需要聚合、过滤、连接、透视、派生列或长表重塑，请让智能体在调用 Flint 前准备可直接作图的表格。Flint 编译图表；它不是通用数据整理引擎。

## 后端与渲染选项

服务器支持以下后端：

- `vegalite` 用于语法式统计图表；
- `echarts` 用于更丰富的交互与层次图表类型；
- `chartjs` 用于熟悉的 canvas 图表。Chart.js 仅渲染 PNG。

可在启动时只暴露子集：

```bash
npx -y flint-chart-mcp --backends vegalite,echarts
FLINT_MCP_BACKENDS=vegalite,echarts npx -y flint-chart-mcp
```

客户端支持 MCP Apps 时，使用 `create_chart_view` 查看和调整图表。需要静态图片时使用 `render_chart`。需要在其他渲染器或编辑器中继续使用时，通过 `compile_chart` 生成对应的 JSON 规范。

## 验证配置

在 MCP 客户端中，请智能体做简单验证：

```text
Load flint://agent-skill or run the author_flint_chart prompt.
Then call list_chart_types for the vegalite backend and tell me whether Flint is connected.
```

然后尝试第一张图表：

```text
Use Flint MCP to create a bar chart from these rows:
[{"region":"North","revenue":120},{"region":"South","revenue":90}]
Use region as Category and revenue as Quantity.
Open it with create_chart_view if this client supports MCP Apps; otherwise render an SVG.
```

如果 `list_chart_types` 可用，但无法读取本地文件，请检查文件路径以及是否设置了 `--disable-file-reference`。如果 `create_chart_view` 不可用，客户端可能不支持 MCP Apps；请改用 `render_chart`。

## 下一步

- [智能体工作流](/documentation/agent-workflows) 说明如何将 Flint 的语义图表契约嵌入自定义智能体或智能体产品。
- [入门指南](/documentation/getting-started) 用一张小图解释 `DataSpec` 与 `ChartSpec` 的结构。
- [Vega-Lite 图表](/documentation/reference-vegalite)、
  [ECharts 图表](/documentation/reference-echarts)、
  [Chart.js 图表](/documentation/reference-chartjs) 和
  [Plotly 图表](/documentation/reference-plotly) 按后端列出支持的图表类型。
