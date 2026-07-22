# Architecture

Flint is a library-agnostic intermediate language for visualization. Every `assemble*()` entry point uses the same **compiler frontend** and **optimizer**; only the **code generator** changes by backend.

For motivation and spec examples, see [Overview](/documentation/overview). For input types, see [API reference](/documentation/api-reference).

---

## Table of Contents

- [§1 Design principles](#1-design-principles)
- [§2 Three-stage pipeline](#2-three-stage-pipeline)
- [§3 Stage 1 — Compiler frontend](#3-stage-1-compiler-frontend)
- [§4 Stage 2 — Optimizer](#4-stage-2-optimizer)
- [§5 Stage 3 — Code generator](#5-stage-3-code-generator)
- [§6 Inputs](#6-inputs)
- [§7 Overflow and warnings](#7-overflow-and-warnings)
- [§8 Repository layout](#8-repository-layout)
- [§9 Related](#9-related)

---

# §1 Design principles

1. **Semantics first** — `semantic_types` guide parsing, aggregation, zero baseline, diverging detection, and formatting. Raw storage types are only the starting point.
2. **Minimal chart surface** — `chart_spec` supplies chart type and channel bindings, usually in about 10 lines. Axes, scales, legends, and step sizes are compiler-derived.
3. **Dynamic templates** — Each `chartType` maps to a `ChartTemplateDef`; its `instantiate()` hook consumes the full compilation context and adapts to cardinality and semantics.
4. **No UI dependencies** — The core is pure TypeScript (`packages/flint-js`), so it can run from agents, notebooks, servers, or this site. A Python package is planned for a later release.

Most design logic lives in Stages 1–2 and is identical across backends.

---

# §2 Three-stage pipeline

![Overview of the Flint architecture](figs/overview.png)

| Stage | Role | Implementation | Key outputs |
|-------|------------|----------------|-------------|
| **1. Compiler frontend** | Resolve semantic context | Phase 0 — `resolveChannelSemantics()` | `ChannelSemantics` per channel |
| **2. Optimizer** | Fit layout to canvas | Phase 1 — `computeLayout()`, `filterOverflow()` | `LayoutResult`, truncated data |
| **3. Code generator** | Emit backend-native output | Phase 2 — `build*Encodings()`, `template.instantiate()` | VL / EC / CJS spec or Office.js program |

```text
assembleVegaLite(input)   // or assembleECharts, assembleChartjs, assembleExcel
       │
       ▼
══ STAGE 1 — COMPILER FRONTEND (core/) ═════════════════════════
       │
       ├── resolveChannelSemantics()     semantic_types + data → ChannelSemantics
       ├── computeZeroDecision()         per quantitative axis (needs template mark)
       ├── declareLayoutMode()           template layout intent (optional)
       └── convertTemporalData()         semantic-driven date parsing
       │
       ▼
══ STAGE 2 — OPTIMIZER (core/) ══════════════════════════════════
       │
       ├── computeChannelBudgets() + filterOverflow()
       └── computeLayout()
             • Discrete axes — elastic budget (bars, heatmap cells)
             • Continuous axes — gas-pressure stretch (scatter, line)
             • Global — facet grid, aspect ratio, radial / area models
       │
       ▼
══ STAGE 3 — CODE GENERATOR (per backend) ═══════════════════════
       │
       ├── build*Encodings()             backend encoding objects
       ├── template.instantiate()        dynamic template hook
       ├── restructureFacets()           VL / ECharts faceting
       └── applyLayoutToSpec()           step, width/height, padding
       │
       ▼
   Native spec + optional warnings
```

Canonical orchestration: `packages/flint-js/src/vegalite/assemble.ts`.

---

# §3 Stage 1 — Compiler frontend

Resolution happens in two layers; [Semantic Type §4](/documentation/semantic-types#4-compilation-pipeline) describes the full pipeline.

### Field properties

Per column, independent of chart: format class, aggregation role, domain shape, diverging hints, canonical order. Driven by `type-registry.ts` and optional inline annotations (`intrinsicDomain`, `unit`, `sortOrder`).

### Channel properties

Chart-context grounding. The same `YearMonth` field may be temporal on `x` in a line chart but categorical on `color` in another view. Channel semantics prevent year-month integers from being treated as quantitative magnitudes.

**IR:** `ChannelSemantics` — flat, backend-agnostic record consumed by layout and all templates.

Tiered types (T0 → T1 → T2) allow graceful degradation when agents supply coarse labels.

### Named View Transformations

Flint exposes some alternatives as **named views** instead of asking the user or agent to rewrite a chart spec. A named view is a small transformation of the encoding assignment: flip the axes, exchange a categorical axis with a color series, route a series into facets, or re-render the same fields as a sibling chart type. The host stores only the selected state id in `chart_spec.chartProperties.pivot`; the compiler recomputes the resulting encoding map and runs the ordinary semantics, overflow, layout, and backend generation pipeline on that view.

The model is group-theoretic but deliberately practical. Start from the authored assignment `a0` and walk the orbit generated by four operators:

| Symbol | Generator | Example state id | Meaning |
|--------|-----------|------------------|---------|
| `τ` | transpose | `flip:x-y` | flip two axis slots wholesale, preserving occupancy |
| `σ` | permute | `swap:y-color` | exchange a position field with a same-profile auxiliary channel |
| `γ` | shift | `series:row` | route one discrete series field among color/group/facet channels |
| `θ` | transition | `type:Strip Plot` | re-render the same routed fields with a sibling template |

The visible View control is the finite orbit after validity checks and deduplication. Deduplication is the stabilizer quotient in concrete form: flip twice returns to `Default`, faceting then jittering can collapse to the same Strip Plot as jittering directly, and a chart-type round trip such as Scatter → Strip Plot → Scatter folds back onto the authored scatter. Compatibility checks are also typed: `σ` only swaps within the same field profile (measure with measure, category with category), while `τ` is allowed to cross profiles because it flips axis slots, not field roles. Line charts omit `τ`, so Flint never offers a vertical line chart.

Because the orbit is computed over Flint's backend-neutral encoding IR, the same View state ids apply across Vega-Lite, ECharts, and Chart.js. Each backend receives the already-transformed encoding map; only `θ` requires backend-specific template lookup so the sibling chart's own instantiation logic takes over.

---

# §4 Stage 2 — Optimizer

The optimizer receives `baseSize` (the target) and an optional `canvasSize` ceiling, then produces a `LayoutResult` that keeps the chart readable within the available space.

### Local optimization

Each layout dimension (x, y, group, facet column/row, radius) is a flexible container:

| Encoding class | Behavior |
|----------------|----------|
| Discrete (bars, heatmap cells) | Compress toward minimum readable step; stretch canvas if needed |
| Continuous (scatter, line) | Stretch when mark density exceeds overlap budget |

### Global optimization

Aspect ratio (banking-to-45° for connected marks), facet row/column wrapping, and non-Cartesian charts (treemap, gauge, pie) sized from component counts.

Implementation models: [Auto Layout Algorithm](/documentation/layout-model) — §2 elastic budget, §3 gas pressure, §4 circumference, §5 area.

---

# §5 Stage 3 — Code generator

Backend generators translate the optimized context into library-native syntax. Each `chartType` registers a **dynamic template**:

| `ChartTemplateDef` field | Role |
|--------------------------|------|
| `chart` | Public name (`"Grouped Bar Chart"`) — matches `chart_spec.chartType` |
| `template` | Native spec skeleton |
| `channels` | Allowed encodings |
| `markCognitiveChannel` | `position` / `length` / `area` / `color` — zero baseline and stretch class |
| `declareLayoutMode?` | Axis flags before layout |
| `instantiate()` | Emit spec from `InstantiateContext` |

Registries: `vlTemplateDefs`, `ecTemplateDefs`, `cjsTemplateDefs`. Lookup: `vlGetTemplateDef(name)`, etc.

New backends implement Stage 3 only; the frontend and optimizer stay unchanged. See [Extending backends](/documentation/adding-a-backend).

### Excel backend

Excel is a Stage 3 backend in `packages/flint-js`, parallel to Vega-Lite, ECharts, and Chart.js. It is not a separate package or an additional architectural layer.

Office.js is imperative and requires an Excel host, so the backend first builds a typed native-chart artifact (`ExcelNativeChartSpec`) containing the worksheet matrix, native chart type, series bindings, dimensions, axes, labels, legend, and formatting. This versioned artifact is the contract between compilation and execution.

The native-chart plan is an intermediate representation of the Excel backend, not a second user-authored chart specification. Callers continue to author the same semantic Flint input used by every backend:

```text
semantic Flint input
       │
       ▼
assembleExcel() → ExcelNativeChartSpec
                      │
                      ├── renderExcelChart(Excel, artifact) → native Excel chart
                      │
                      └── generateOfficeJs(artifact) → standalone Office.js source
```

The normal add-in path transports the artifact and passes it, with the live Excel host, to `renderExcelChart()`. `generateOfficeJs()` is an optional projection for callers that need portable Office.js source; it is not a second contract or a required step in rendering. Host concerns such as worksheet selection, image capture, and process lifecycle stay outside compilation. Test harnesses may provide those host services, but they do not define Excel chart semantics.

---

# §6 Inputs

| Part | API | Specifies |
|------|-----|-----------|
| Raw data | `data` | Row table for parsers and layout |
| **dataSpec** | `semantic_types` | Field meaning; reused across charts on the same dataset |
| **chartSpec** | `chart_spec` | `chartType` + `encodings`; cheap to edit during exploration |

LLM agents typically infer `semantic_types` once, then iterate on `chart_spec`: line → heatmap → grouped bar → waterfall → sunburst on one semantic layer.

---

# §7 Overflow and warnings

When discrete cardinality exceeds the canvas budget, the optimizer filters data and attaches `ChartWarning` metadata instead of rendering an unreadable chart. Strategy priority and `_warnings` inspection are covered in [API reference §8](/documentation/api-reference#8-overflow-and-warnings).

---

# §8 Repository layout

```text
packages/flint-js/src/
├── core/           resolve-semantics, field-semantics, compute-layout, type-registry, types
├── vegalite/       Stage 3 — Vega-Lite templates + assembleVegaLite
├── echarts/        Stage 3 — ECharts templates + assembleECharts
├── chartjs/        Stage 3 — Chart.js templates + assembleChartjs
├── excel/          Stage 3 — native Excel chart planning + Office.js generation
└── test-data/      gallery fixtures (TEST_GENERATORS)

packages/flint-py/  Python port preview (package planned later)
test-harness/excel/ Office.js runner + visual evaluations of Excel artifacts
site/               demo site (gallery, editor, documentation)
```

---

# §9 Related

- [Overview](/documentation/overview) — motivation and spec examples
- [API reference](/documentation/api-reference) — `ChartAssemblyInput`, assemblers, options
- [Semantic Type](/documentation/semantic-types) — type hierarchy and resolution rules
- [Auto Layout Algorithm](/documentation/layout-model) — stretch and facet models
- [Extending chart templates](/documentation/adding-a-chart-template) — extend Stage 3
