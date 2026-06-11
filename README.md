# flint-chart

[![npm](https://img.shields.io/npm/v/flint-chart.svg)](https://www.npmjs.com/package/flint-chart)
[![CI](https://github.com/microsoft/flint-chart/actions/workflows/ci.yml/badge.svg)](https://github.com/microsoft/flint-chart/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A semantic-level visualization library that compiles data + semantic annotations
into chart specifications for multiple rendering backends. The LLM outputs only
chart type, field assignments, and a **semantic type** per field (e.g. `Revenue`,
`Rank`, `CategoryCode`). A deterministic compiler derives all low-level
parameters — sizing, zero-baseline, formatting, color schemes, and mark
templates — so charts look good *and* stay editable without calling the LLM again.

Available in **JavaScript/TypeScript** and **Python**.

- **Demos:** [Site](https://microsoft.github.io/flint-chart/) — landing page, [gallery](https://microsoft.github.io/flint-chart/#/gallery), and [live editor](https://microsoft.github.io/flint-chart/#/editor) in one place.
- **Architecture:** [docs/design-semantics.md](docs/design-semantics.md) · [docs/design-stretch-model.md](docs/design-stretch-model.md) · [docs/color-decisions-summary.md](docs/color-decisions-summary.md)
- **For contributors:** [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) · [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)
- **For AI agents:** [agent-skills/skills/flint-chart-author/SKILL.md](agent-skills/skills/flint-chart-author/SKILL.md) · [agent-skills/mcp-server](agent-skills/mcp-server/)

```bash
# JavaScript / TypeScript
npm install flint-chart

# Python
pip install flint
```

## Repository Structure

```
├── packages/
│   ├── flint-js/          TypeScript package (npm: flint-chart)
│   │   └── src/           4 backends: Vega-Lite, ECharts, Chart.js, GoFish
│   └── flint-py/          Python package (PyPI: flint)
│       └── flint/         Vega-Lite backend
├── shared/
│   └── test-data/     JSON test cases shared across both languages
├── agent-skills/                MCP server + agent skills
├── site/                  Documentation website
└── docs/                  Design documents
```

---

## Why

LLM-generated chart specs face a dilemma:

| Approach | Looks good | Editable | Bespoke charts | Cost to re-encode |
|----------|:---:|:---:|:---:|:---:|
| Library defaults | ✗ | ✓ | ✗ | 0 |
| LLM-tuned spec | ✓ | ✗ | Sometimes | 1 LLM call |
| **flint-chart** | **✓** | **✓** | **✓** | **0** |

**Simple specs** are editable but look bad (wrong sizing, misleading
encodings). **Polished specs** look great but are brittle (hard-coded
values break on every field swap). flint-chart resolves this: when a user
swaps fields, changes chart type, or adds facets for exploration, the
compiler re-derives all parameters automatically — no LLM call needed.

Because the output is native library code (Vega-Lite, ECharts, or Chart.js),
users retain full control over aesthetic fine-tuning — fonts, colors, legends,
annotations — using each library's own API. There is no abstraction tax or
reduced expressiveness.

### Key insight: semantic types as the contract

Instead of asking the LLM to set dozens of low-level parameters, we ask
it one thing: **what does this data mean?** — expressed as a semantic type.

```
Semantic type (e.g. "Revenue")
    ├── Encoding type:   quantitative
    ├── Zero baseline:   true
    ├── Domain padding:  0%
    ├── Scale direction: normal
    ├── Axis formatting: "$,.0f"
    ├── Color scheme:    sequential
    └── Sizing model:    per-axis stretch
```

When the user swaps a field, the compiler re-derives everything from the new
semantic type. No hard-coded constants go stale. No LLM call needed.

### The workflow

```
1. LLM generates:   chart type + semantic types   (~10-line JSON)
2. User edits:      swap field / change mark / add facet → compiler handles it (no AI)
3. Fine-tune (2%):  edit the generated spec directly for bespoke styling
```

---

## Quick start

### Vega-Lite

```ts
import { assembleVegaLite } from 'flint-chart';

const spec = assembleVegaLite({
  data: { values: myData },
  semantic_types: { weight: 'Quantity', mpg: 'Quantity', origin: 'Country' },
  chart_spec: {
    chartType: 'Scatter Plot',
    encodings: { x: { field: 'weight' }, y: { field: 'mpg' }, color: { field: 'origin' } },
    canvasSize: { width: 400, height: 300 },
  },
});
```

### ECharts

```ts
import { assembleECharts } from 'flint-chart';

const option = assembleECharts({
  data: { values: myData },
  semantic_types: { weight: 'Quantity', mpg: 'Quantity' },
  chart_spec: {
    chartType: 'Scatter Plot',
    encodings: { x: { field: 'weight' }, y: { field: 'mpg' } },
  },
});
```

### Chart.js

```ts
import { assembleChartjs } from 'flint-chart';

const config = assembleChartjs({
  data: { values: myData },
  semantic_types: { weight: 'Quantity' },
  chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'category' }, y: { field: 'value' } } },
});
```

---

## Architecture

```
packages/flint-js/src/
  index.ts                ← public API (re-exports core/ + all backends)
  core/                   ← target-language-agnostic
    types.ts              ← shared type definitions (ChartAssemblyInput, ChartTemplateDef, …)
    semantic-types.ts     ← ~70 semantic types + VisCategory helpers
    decisions.ts          ← pure decision functions (layout, encoding type)
    resolve-semantics.ts  ← Phase 0: semantic resolution
    compute-layout.ts     ← Phase 1: layout computation
    filter-overflow.ts    ← overflow filtering
  vegalite/               ← Vega-Lite backend
  echarts/                ← ECharts backend
  chartjs/                ← Chart.js backend
  gofish/                 ← GoFish backend
  test-data/              ← fixtures + generators (also drives the gallery)

packages/flint-py/src/flint_chart/
  core/                   ← Python port of core/ (Vega-Lite backend only)
  vegalite/               ← assemble_vegalite() + templates

shared/test-data/         ← JSON fixtures shared across JS + Python
site/                     ← unified Vite+React demo (landing / gallery / editor routes)

agent-skills/
  skills/                 ← Copilot/Claude SKILL.md bundles
  prompts/                ← standalone system prompts
  instructions/           ← .instructions.md drop-ins
  mcp-server/             ← MCP server exposing flint-chart as agent tools
```

### Type resolution pipeline

```
  semantic type → getVisCategory() → VisCategory → channel/chart rules → encoding type
                                      ↑
            (fallback: inferVisCategory() inspects raw data)
```

---

## Public API

### Assembly functions

Each backend has its own assembly function. All accept the same
`ChartAssemblyInput` shape:

| Function | Output | Import |
|----------|--------|--------|
| `assembleVegaLite(input)` | Vega-Lite spec | `import { assembleVegaLite } from 'flint-chart'` |
| `assembleECharts(input)` | ECharts option object | `import { assembleECharts } from 'flint-chart'` |
| `assembleChartjs(input)` | Chart.js config object | `import { assembleChartjs } from 'flint-chart'` |

### Input types

```ts
interface ChartAssemblyInput {
  data: { values: any[] } | { url: string };  // inline rows or URL
  semantic_types?: Record<string, string>;     // field → semantic type
  chart_spec: {
    chartType: string;                         // e.g. "Scatter Plot"
    encodings: Record<string, ChartEncoding>;  // channel → encoding map
    canvasSize?: { width: number; height: number }; // default 400×320
    chartProperties?: Record<string, any>;     // template-specific knobs
  };
  options?: AssembleOptions;                   // layout tuning
}
```

| Key | Description |
|---|---|
| `data` | Data source — either `{ values: [...] }` (inline row objects) or `{ url: "..." }` (JSON/CSV URL) |
| `semantic_types` | Per-column semantic annotations (e.g., `{ revenue: "Price", country: "Country" }`) |
| `chart_spec` | What to draw — chart type, encodings, canvas size, properties |
| `options` | Layout tuning (elasticity, step sizes, tooltips, etc.) |

```ts
interface ChartEncoding {
  field?: string;
  type?: 'quantitative' | 'nominal' | 'ordinal' | 'temporal';
  aggregate?: 'count' | 'sum' | 'average';
  sortOrder?: 'ascending' | 'descending';
  sortBy?: string;
  scheme?: string;
}

interface AssembleOptions {
  addTooltips?: boolean;       // default false
  elasticity?: number;         // axis stretch exponent    (default 0.5)
  maxStretch?: number;         // axis stretch cap         (default 2)
  facetElasticity?: number;    // facet stretch exponent   (default 0.3)
  maxStretch?: number;         // unified stretch cap     (default 2)
  minStep?: number;            // min px per discrete tick (default 6)
  minSubplotSize?: number;     // min facet subplot px     (default 60)
}
```

### Template registries

Each backend has its own set of supported chart types and template
definitions. Templates are organized by category and can be looked up by
chart type name.

| Backend | Template map | Flat list | Lookup | Channels |
|---------|-------------|-----------|--------|----------|
| Vega-Lite | `vlTemplateDefs` | `vlAllTemplateDefs` | `vlGetTemplateDef(name)` | `vlGetTemplateChannels(name)` |
| ECharts | `ecTemplateDefs` | `ecAllTemplateDefs` | `ecGetTemplateDef(name)` | `ecGetTemplateChannels(name)` |
| Chart.js | `cjsTemplateDefs` | `cjsAllTemplateDefs` | `cjsGetTemplateDef(name)` | `cjsGetTemplateChannels(name)` |

```ts
// Example: list available Vega-Lite chart categories
import { vlTemplateDefs } from 'flint-chart';
Object.keys(vlTemplateDefs); // ["Scatter & Point", "Bar", "Line & Area", ...]

// Example: get channels for a specific chart type
import { vlGetTemplateChannels } from 'flint-chart';
vlGetTemplateChannels('Scatter Plot'); // ["x", "y", "color", "size", "shape"]
```

### Semantic types (~70 types)

| Group | Examples |
|-------|---------|
| Temporal | `DateTime`, `Date`, `Year`, `Month` |
| Measures | `Quantity`, `Count`, `Price`, `Percentage` |
| Discrete numerics | `Rank`, `Score`, `ID` |
| Geographic | `Latitude`, `Longitude`, `Country`, `City` |
| Categorical | `PersonName`, `Company`, `Status`, `Boolean` |
| Ranges | `Range`, `AgeGroup`, `Bucket` |
| Fallbacks | `String`, `Number`, `Unknown` |

### Core utilities (shared across backends)

These are re-exported from `core/` and available at the top level:

```ts
import {
  // Semantic type helpers
  inferVisCategory,     // infer VisCategory from raw data
  getVisCategory,       // look up VisCategory for a known semantic type

  // Shared types
  type ChartAssemblyInput,
  type ChartEncoding,
  type ChartTemplateDef,
  type AssembleOptions,
  type ChartWarning,

  // Layout constants
  channels,
  channelGroups,
} from 'flint-chart';
```

---

## What the compiler handles automatically

- **Sizing** — spring model for discrete axes, pressure model for continuous;
  composable with facets and layers. No more 6400 px charts from 80 × 4 facets.
- **Zero baseline** — Revenue → include zero; Temperature → don't; Rank → don't.
- **Scale direction** — Rank → reversed; others → normal.
- **Formatting** — Revenue → `$,.0f`; Percentage → `.0%`; Year → `%Y`.
- **Color schemes** — categorical codes → distinct hues; measures → sequential.
- **Label overflow** — auto-rotation and truncation from count + string lengths.
- **Bespoke marks** — lollipops, bump charts, candlesticks as single templates.
- **Semantic validation** — actionable errors before rendering, not after crashing.

## Design principles

1. **No UI dependencies** — pure data-in, spec-out.
2. **Semantic types drive everything** — the caller annotates fields; the
   compiler derives all config. Fallback: `inferVisCategory()` inspects raw data.
3. **Callers own the data** — no aggregation transforms applied.
4. **Layout is configurable** — elastic stretch, facet sizing, step sizes
   exposed in `AssembleOptions`.
5. **Templates are declarative** — each chart type is a `ChartTemplateDef`
   with a skeleton, channel list, and optional post-processor.
6. **Backend-agnostic semantics** — the same semantic reasoning targets
   Vega-Lite, ECharts, and Chart.js through separate assembly functions.
