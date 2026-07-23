# Overview

**Flint** is a semantics-driven intermediate language (IL) for data visualization. You declare what each field *means* and the chart you want; the compiler derives scales, axes, aggregation, formatting, layout, and color, then emits Vega-Lite, ECharts, or Chart.js.

If you're new to Flint, start with [Getting started](/documentation/getting-started), then come back here for the architecture and API map.

---

## Table of Contents

- [§1 What Flint is](#1-what-flint-is)
- [§2 The problem](#2-the-problem)
- [§3 Flint specification](#3-flint-specification)
- [§4 Compiler output](#4-compiler-output)
- [§5 Architecture at a glance](#5-architecture-at-a-glance)
- [§6 Documentation map](#6-documentation-map)
- [§7 Install and quick start](#7-install-and-quick-start)
- [§8 Tools on this site](#8-tools-on-this-site)
- [§9 Further reading](#9-further-reading)

---

# §1 What Flint is

Flint separates **data semantics** from **chart intent**, much as an intermediate language separates program logic from target-machine code. Authors avoid hand-tuning interdependent low-level parameters, and LLM agents can emit compact Flint programs instead of verbose native specs that are costly to regenerate and brittle under small edits.

---

# §2 The problem

Declarative grammars (Vega-Lite, ECharts, …) work well when primitive data types line up with visual mappings. They get brittle when **semantic meaning** diverges from storage representation:

- Integer `202001` as **YearMonth**, not a quantitative magnitude
- Stacking non-additive measures (temperature, rates)
- Diverging fields on sequential color ramps

Experts can fix these cases with long, coupled specs, but those specs are hard to keep correct when you swap a field, rotate a heatmap, or change chart type. Flint treats **semantic types as first-class objects** and resolves encoding and layout from semantics plus data characteristics.

---

# §3 Flint specification

A Flint program has two reusable parts:

| Flint term | API field | Role |
|------------|-----------|------|
| **dataSpec** | `semantic_types` | Per-field meaning → type string or enriched annotation |
| **chartSpec** | `chart_spec` | Chart type + channel → field bindings |

Raw rows live in `data`. Together they form `ChartAssemblyInput`:

```text
data  +  semantic_types  +  chart_spec  →  assemble*()  →  native spec
```

### dataSpec example

Annotations are **inline** in `semantic_types` — there is no separate `semantic_annotations` field:

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

### chartSpec example

Faceted line chart:

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

**Exploration workflow:** change only `chart_spec` to try a heatmap, grouped bar, waterfall, or sunburst. The **dataSpec stays fixed**, and you can switch backend (for example, Vega-Lite → ECharts) without rewriting the Flint input. See the [gallery](/gallery) for template and backend coverage.

Semantic types use a three-level hierarchy. Details: [Semantic Type](/documentation/semantic-types).

---

# §4 Compiler output

| Function | Output |
|----------|--------|
| `assembleVegaLite(input)` | Vega-Lite v6 spec |
| `assembleECharts(input)` | ECharts `option` |
| `assembleChartjs(input)` | Chart.js config |

The same input compiles to every supported backend. Stages 1–2 (semantics + layout) live in shared `core/`; only Stage 3 (template instantiation) is library-specific.

Full input schema: [API reference](/documentation/api-reference).

---

# §5 Architecture at a glance

![Overview of the Flint architecture](figs/overview.png)

| Flint stage | Code | Module |
|-------------|------|--------|
| **Compiler frontend** | Phase 0 — `resolveChannelSemantics()` | `core/resolve-semantics.ts` |
| **Optimizer** | Phase 1 — `computeLayout()`, overflow filter | `core/compute-layout.ts` |
| **Code generator** | Phase 2 — `template.instantiate()` | `vegalite/`, `echarts/`, `chartjs/` |

1. **Frontend** — derives encoding type, format, aggregation, scale, domain, color, and sort from dataSpec + data
2. **Optimizer** — chooses axis span, band step, facet grid, and aspect ratio with physics-based sizing; start with [Example: Auto Layout](/documentation/chart-sizing), then use [Auto Layout Algorithm](/documentation/layout-model) for the equations
3. **Code generator** — uses dynamic templates for each `chartType` to emit library-native specs

Pipeline detail: [Architecture](/documentation/architecture).

---

# §6 Documentation map

| Section | Pages |
|---------|-------|
| **Language design** | [Architecture](/documentation/architecture), [Semantic Type](/documentation/semantic-types), [Auto Layout Algorithm](/documentation/layout-model), [API reference](/documentation/api-reference) |
| **Chart reference** | [Vega-Lite charts](/documentation/reference-vegalite), [ECharts charts](/documentation/reference-echarts), [Chart.js charts](/documentation/reference-chartjs), [Plotly charts](/documentation/reference-plotly) |
| **Development** | [Development guide](/documentation/development), [Extending semantic types](/documentation/adding-a-semantic-type), [Extending backends](/documentation/adding-a-backend), [Extending chart templates](/documentation/adding-a-chart-template) |

---

# §7 Install and quick start

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

# §8 Tools on this site

| Page | Use for |
|------|---------|
| [Getting started](/documentation/getting-started) | Step-by-step first chart |
| [Set up Flint MCP](/documentation/setup-flint-mcp) | MCP server setup, file access, tools, and verification |
| [Agent workflows](/documentation/agent-workflows) | Custom agent and product integration patterns |
| [Gallery](/gallery) | Every template + multi-backend preview |
| [Editor](/editor) | Paste JSON, switch Vega-Lite / ECharts / Chart.js |

---

# §9 Further reading

- Agent-oriented design notes: [docs/README.md](https://github.com/microsoft/flint-chart/blob/main/docs/README.md)
