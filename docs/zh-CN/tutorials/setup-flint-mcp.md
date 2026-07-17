# 配置 Flint MCP

本页说明如何在 MCP 客户端中运行 `flint-chart-mcp`，以及连接后服务器暴露的内容。它比简短的 MCP 概览页更详细，但仍从基本配置路径开始。

若你希望 VS Code、Claude Desktop、Cursor 或其他 MCP 客户端中的智能体创建、验证、预览或渲染 Flint 图表，请使用本页。对于直接嵌入库的自定义智能体与产品集成，参见[智能体工作流](/documentation/agent-workflows)。

## MCP 服务器提供什么

MCP 服务器是 Flint 面向智能体的执行端。智能体编写一份语义化的 `ChartAssemblyInput`，服务器在本地编译、验证、渲染或打开该图表。

| Tool | 用途 |
|------|------|
| `create_chart_view` | 当宿主支持 MCP Apps 时的首选默认：打开带实时 SVG 预览与图表选项的交互式图表视图。 |
| `validate_chart` | 检查 Flint 输入是否有效，并查看警告、错误与计算尺寸。 |
| `render_chart` | 需要产物或宿主无 MCP App UI 时，在本地渲染静态 PNG 或 SVG。 |
| `compile_chart` | 返回后端原生的 Vega-Lite、ECharts 或 Chart.js JSON。 |
| `list_chart_types` | 查看支持的图表类型与编码通道。 |

| Resource or prompt | 用途 |
|--------------------|------|
| `flint://agent-skill` | 加载捆绑的 chart-author 说明。 |
| `flint://chart-types` | 浏览支持的图表目录。 |
| `ui://flint-chart/chart-view.html` | MCP App 宿主中 `create_chart_view` 使用的捆绑 UI 资源。 |
| `author_flint_chart` | 从嵌入 chart-author skill 的 prompt 开始。 |

为获得最佳效果，请让客户端加载 `flint://agent-skill`，或运行 `author_flint_chart` 提示，再让智能体调用图表工具。该 skill 会教智能体有效的 `chartType` 名称、字段到通道的映射、语义类型、数据绑定规则，以及何时使用各渲染工具。

## 要求

你需要：

- 能运行 stdio 服务器的 MCP 客户端；
- 该客户端可用的 Node.js 与 npm；
- 图表数据直接嵌入工具调用，或从主机上的本地文件读取。

服务器在主机上进程内渲染。内联行与本地文件保持本地；服务器不会将数据上传到远程渲染服务。

## 使用 `npx` 运行

多数客户端可通过 `npx` 运行已发布包，无需全局安装：

```bash
npx -y flint-chart-mcp
```

该命令启动 stdio MCP 服务器。实践中，你通常将其写入客户端的 MCP 配置，而非手动运行。

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

若智能体应通过 `data.url` 对本地 `.csv`、`.tsv` 或 `.json` 文件作图，默认即可。若要在不可信部署中加强限制，使用 `--disable-file-reference` 完全拒绝本地文件引用（智能体须通过 `data.values` 内联传入行）：

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

修改服务器代码或配置后，请在客户端重启 MCP 服务器。有用的冒烟测试是让智能体用 `list_chart_types` 列出 Flint 图表类型。

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

- **内嵌行：** 在工具调用中直接传入 `data: { values: [...] }`。这是小型或已准备表格的最简路径。
- **本地文件引用：** 对主机上的 `.json`、`.csv` 或 `.tsv` 文件传入 `data: { url: "..." }`。

默认情况下，服务器信任主机并读取智能体引用的任意本地文件（相对路径相对于工作目录解析）；智能体本也可内联相同行。远程 URL 永远不会被获取。

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

当用户希望在支持 MCP App 的主机中查看并迭代图表时，使用 `create_chart_view`。需要静态产物时使用 `render_chart`。当用户需要供其他渲染器或编辑器使用的后端原生 JSON 时，使用 `compile_chart`。

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

若 `list_chart_types` 可用但本地文件图表失败，请检查文件路径是否正确，以及是否未设置 `--disable-file-reference`。若 `create_chart_view` 不可用，主机可能不支持 MCP Apps；请让智能体改用 `render_chart`。

## 下一步

- [智能体工作流](/documentation/agent-workflows) 说明如何将 Flint 的语义图表契约嵌入自定义智能体或智能体产品。
- [入门指南](/documentation/getting-started) 用一张小图解释 `DataSpec` 与 `ChartSpec` 的结构。
- [Vega-Lite charts](/documentation/reference-vegalite)、
  [ECharts charts](/documentation/reference-echarts) 与
  [Chart.js charts](/documentation/reference-chartjs) 按后端列出支持的图表类型。
