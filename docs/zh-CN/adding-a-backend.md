# 扩展后端

当 Flint 需要面向新的渲染库或 spec 格式时，添加后端。后端是 `assemble<Backend>(input)` 编排器加上 `templates/` 注册表；二者共同将共享编译器输出转换为原生图表 spec。现有参考实现位于 `packages/flint-js/src/` 下的 `vegalite/`、`echarts/` 和 `chartjs/`。

流水线阶段与仓库结构见 [Architecture](/documentation/architecture)。

---

## 目录

- [§1 创建骨架](#1-创建骨架)
- [§2 遵循组装契约](#2-遵循组装契约)
- [§3 添加模板](#3-添加模板)
- [§4 接入包](#4-接入包)
- [§5 站点与画廊](#5-站点与画廊)
- [§6 验收清单](#6-验收清单)
- [§7 相关文档](#7-相关文档)

---

# §1 创建骨架

```
packages/flint-js/src/<backend>/
├── index.ts              # public barrel
├── assemble.ts           # orchestrator: ChartAssemblyInput → native spec
├── instantiate-spec.ts   # encoding + layout → spec (optional; some backends inline this)
├── recommendation.ts     # chart-type recommendations (optional)
└── templates/
    ├── index.ts          # category map + getTemplateDef()
    ├── bar.ts
    ├── line.ts
    └── …
```

从零开始前，先复制最接近的现有后端。Vega-Lite 是共享流水线最完整的参考；ECharts 额外包含 `colormap.ts` 和 `facet.ts` 以处理后端特定关注点。

---

# §2 遵循组装契约

```typescript
function assemble<Backend>(input: ChartAssemblyInput): <BackendSpec>
```

`ChartAssemblyInput` 定义于 `packages/flint-js/src/core/types.ts`，包含 `data`、`chart_spec`、`semantic_types`、`options` 及相关字段。

### 流水线（不要跳过 core 阶段）

编排器**协调** `core/`，不应从原始字段类型重新推导格式、零基线或颜色。

```text
PRE-PHASE     normalizeStaticSeries(), applyEncodingOverrides()
              (may need a preliminary resolveChannelSemantics for types)

PHASE 0       resolveChannelSemantics()  → Record<channel, ChannelSemantics>
              computeZeroDecision() per quantitative x/y (needs template mark)
              chartProperties overrides (includeZero_*, logScale_*, …)

STEP 0a       template.declareLayoutMode?.()  → LayoutDeclaration

STEP 0b       convertTemporalData()

STEP 0c       computeChannelBudgets() + filterOverflow()

PHASE 1       computeLayout()  → LayoutResult

PHASE 2       build backend encodings
              template.instantiate(spec, InstantiateContext)
              apply layout (vlApplyLayoutToSpec / ecApplyLayoutToSpec / …)
              postProcess?, tooltips, facet combine
```

规范顺序见 `packages/flint-js/src/vegalite/assemble.ts`（文件头 + `assembleVegaLite`）。

**IR 边界：** 下游代码读取扁平的 `ChannelSemantics` 和 `LayoutResult`，而不是重新检查语义类型字符串。

---

# §3 添加模板

模板编码**形状**，而非**决策**。若模板需要按 `field.type === 'temporal'` 分支，应将该逻辑移到 `core/`。

每个模板导出一个 `ChartTemplateDef`（`core/types.ts`）：

| 字段 | 作用 |
|---|---|
| `chart` | 显示名称 — 必须与 `chart_spec.chartType` 一致 |
| `template` | 原生 spec 骨架（mark + encoding 结构） |
| `channels` | 允许的编码槽位 |
| `markCognitiveChannel` | `position` / `length` / `area` / `color` — 驱动零基线与压缩 |
| `declareLayoutMode?` | 布局前的轴标志（banded vs continuous、σ 覆盖） |
| `instantiate` | 根据 `InstantiateContext` 修改 spec（encodings、layout、semantics） |
| `properties?` | 可配置的图表属性 |
| `postProcess?` | 布局后的最终视觉微调 |

在 `templates/index.ts` 中注册：导入 defs，加入 category map，并暴露 `*GetTemplateDef(chartType)` 为 `find(t => t.chart === chartType)`。

---

# §4 接入包

1. **Barrel** — 在 `packages/flint-js/src/index.ts` 中 `export * from './<backend>'`
2. **Bundle** — 在 `packages/flint-js/tsup.config.ts` 中添加 `<backend>/index` 入口
3. **Exports** — 在 `packages/flint-js/package.json#exports` 中添加 `"./<backend>"` 子路径
4. **冒烟测试** — 在 `packages/flint-js/tests/smoke.test.ts` 中扩展一条 `assemble<Backend>()` 形状断言
5. **Gallery 数据** — 在 `src/test-data/` 中添加 `gen<Backend>*Tests()`，并在 `TEST_GENERATORS` 中注册

---

# §5 站点与画廊

- **Gallery 开发服务器：** 在仓库根目录运行 `npm run site`，然后打开 `/gallery`
- **Supported backends：** 若新后端应出现在 UI 中，更新 `site/src/shared/supported-backends.ts`
- **Renderers：** 仅当 spec 格式无法复用 `VegaLiteView`、`EChartsView` 或 `ChartjsView` 时，才添加新的 React 视图（`site/src/components/`）。`TripleChart` 当前覆盖 VL + ECharts + Chart.js。

可选：若 MCP 客户端应能调用该组装器，将其接入 `agent-skills/mcp-server/`。

---

# §6 验收清单

后端就绪的标志：

- [ ] Bar、line、area 和 scatter 模板在标准 gallery 矩阵上渲染正确
- [ ] `tests/smoke.test.ts` 对新组装器通过
- [ ] 仓库根目录的 `npm run typecheck` 和 `npm run test` 通过
- [ ] 至少有一个专用 test-data 生成器覆盖后端特定选项

**对等说明：** 并非每个 `chart` 名称目前在各后端都存在。记录你移植了哪些模板；跨后端对等是目标，而非首次合并的前置条件。

---

# §7 相关文档

- [Extending chart templates](/documentation/adding-a-chart-template) — `ChartTemplateDef` 编写
- [Auto Layout Algorithm](/documentation/layout-model) — `computeLayout()` 的期望输入
- [API reference](/documentation/api-reference) — `ChartAssemblyInput` 与组装器入口
