# 开发指南

使用本页在本地搭建 **flint-chart**、运行常用检查，并在需要添加新能力时找到合适的扩展路径。

## 前置条件

- Node 18+（见 [`packages/flint-js/.nvmrc`](../packages/flint-js/.nvmrc)；若使用 nvm，请运行 `nvm use`）
- npm 9+（workspaces）

## 首次设置

```bash
git clone https://github.com/microsoft/flint-chart
cd flint-chart
npm install    # root workspace: packages/flint-js, packages/flint-mcp, site
```

## 日常命令

在**仓库根目录**运行以下命令：

| 命令 | 作用 |
|---------|----------------|
| `npm run typecheck` | 构建/类型检查 `packages/flint-js`，并对 `packages/flint-mcp` 做类型检查 |
| `npm run test` | 在 `packages/flint-js` 和 `packages/flint-mcp` 中运行 Vitest |
| `npm run build` | 构建 `packages/flint-js` 和 `packages/flint-mcp` |
| `npm run site` | 演示站点，地址 http://localhost:5274/ |
| `npm run site:build` | 生产构建 → `site/dist/` |
| `npm run build:mcp` | 构建 MCP 服务器 workspace |

演示站点通过 Vite 将 `flint-chart` 别名指向 `packages/flint-js/src`，因此库代码的修改会在画廊和编辑器中热重载，无需重新构建 `dist/`。

## 仓库结构

```
flint-chart/
├── packages/
│   ├── flint-js/          npm package `flint-chart`
│   │   ├── src/core/      semantics, layout, types
│   │   ├── src/vegalite/  Vega-Lite backend
│   │   ├── src/echarts/   ECharts backend
│   │   ├── src/chartjs/   Chart.js backend
│   │   └── src/test-data/ gallery fixtures
│   ├── flint-py/          Python port preview (PyPI package planned later)
│   └── flint-mcp/         npm package `flint-chart-mcp`
├── site/                  landing, gallery, editor, docs browser
├── docs/                  architecture + site documentation sources
├── agent-skills/          AI agent skill (SKILL.md)
└── shared/test-data/      JSON fixtures (JS + Python)
```

## 图表组装流程

1. **Phase 0 — 语义解析**（`packages/flint-js/src/core/resolve-semantics.ts`）
2. **Phase 1 — 布局**（`packages/flint-js/src/core/compute-layout.ts`）
3. **Phase 2 — 实例化**（各后端的 `assemble.ts` + templates）

完整流程见 [Architecture](/documentation/architecture)。

## 扩展指南

根据你要扩展的层面选择对应指南：

- [Extending chart templates](/documentation/adding-a-chart-template) — 在现有后端中添加新图表类型。
- [Extending semantic types](/documentation/adding-a-semantic-type) — 让 Flint 识别新的字段含义，从而改变格式化、聚合、比例尺或颜色行为。
- [Extending backends](/documentation/adding-a-backend) — 添加消费共享编译器输出的新渲染目标。

## 测试覆盖

- **冒烟测试：** `packages/flint-js/tests/smoke.test.ts`
- **视觉覆盖：** [Gallery](/gallery)，由 test-data 中的 `TEST_GENERATORS` 驱动
- **共享 fixtures：** `shared/test-data/`，供 JS 与 Python 测试共用
