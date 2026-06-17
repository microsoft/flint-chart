# Flint: A visualization language for the AI era

<p align="center">
  <a href="https://microsoft.github.io/flint-chart/"><img src="https://img.shields.io/badge/%F0%9F%9A%80_Live_Demo-flint--chart-0078D4?style=for-the-badge" alt="Live demo"></a>
  &nbsp;
  <a href="#install"><img src="https://img.shields.io/badge/%F0%9F%92%BB_Install-npm_%7C_pip-3776AB?style=for-the-badge" alt="Install"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/flint-chart"><img src="https://img.shields.io/npm/v/flint-chart.svg?label=npm%3A%20flint-chart" alt="npm"></a>&ensp;
  <a href="https://github.com/microsoft/flint-chart/actions/workflows/ci.yml"><img src="https://github.com/microsoft/flint-chart/actions/workflows/ci.yml/badge.svg" alt="CI"></a>&ensp;
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>&ensp;
  <a href="agent-skills/SKILL.md"><img src="https://img.shields.io/badge/AI_agents-SKILL.md-8A2BE2.svg" alt="Agent skill"></a>
</p>

<p align="center">
  <a href="https://microsoft.github.io/flint-chart/">Demo site</a> ·
  <a href="https://microsoft.github.io/flint-chart/#/gallery">Gallery</a> ·
  <a href="https://microsoft.github.io/flint-chart/#/editor">Live editor</a> ·
  <a href="https://microsoft.github.io/flint-chart/#/documentation/overview">Docs</a> ·
  <a href="agent-skills/SKILL.md">Skill.md</a>
</p>

---

Flint is a visualization intermediate language that allows **AI agents to create
expressive, good-looking visualizations from simple, human-editable chart specs**.
Instead of requiring verbose low-level parameters such as scales, axes, spacing,
and layout, the Flint compiler derives optimized chart settings from the data,
semantic types, chart type, and encodings. The result is a compact chart
specification that is easy for agents to create, easy for people to edit, and
**it can be rendered in different backends (Vega-Lite, ECharts, Chart.js)**.

<p align="center">
  <img src="docs/figs/chartwall.png" alt="A wall of charts produced by Flint: bar, line, scatter, heatmap, donut, radar, streamgraph, boxplot, grouped bar, rose, Sankey, and treemap, rendered across Vega-Lite, ECharts, and Chart.js." width="100%">
</p>

## Features

- **Specify with semantic types.** Flint captures what each field *means* using 70+ fine-grained semantic types (e.g., `Rank`, `Temperature`, or `Delta`).
  They guide parsing, scales, axes, formatting, and color decisions.
- **Optimize layout automatically.** Flint adapts sizing, spacing, and mark
  arrangement to the data cardinality, chart design, and canvas constraints
  using an elastic layout model.
- **Generate simple editable specs.** Flint specs are short enough for agents
  to write reliably and clear enough for people to refine by hand. Switch chart
  types or rebind encodings, and the compiler cascades the change. The [agent skill](agent-skills/SKILL.md) helps agents generate reliable, good-looking
  charts without last-mile low-level refinement issues.
- **Render across multiple backends.** Compile the same spec to **30+ chart
  types** across **Vega-Lite, ECharts, and Chart.js** through one unified
  interface (an experimental GoFish backend is also included).

<br/>

<p align="center">
  <img src="docs/figs/workflow.png" alt="One workflow end to end: an agent infers a data spec (semantic types) from a raw table, you write a short chart spec, and Flint compiles it to a faceted line chart — then to a grouped bar, waterfall, heatmap, and sunburst as the spec is edited." width="100%">
</p>
<p align="center"><sub>Flint compiles and optimizes high-level data and chart specs into polished visualizations. Because the compiler manages low-level design details, users can move from a faceted line chart to a grouped bar, waterfall, heatmap, or sunburst, or switch rendering engines easily.</sub></p>


## Install

```bash
# JavaScript / TypeScript  (npm package: flint-chart)
npm install flint-chart

# Python  (PyPI package: flint — Vega-Lite backend)
pip install flint
```

## Use

Every backend accepts the **same** `ChartAssemblyInput` and returns that
library's native spec object.

### JavaScript / TypeScript

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
// → a ready-to-render Vega-Lite spec
```

Swap the backend without changing the input shape:

```ts
import { assembleECharts, assembleChartjs } from 'flint-chart';

const option = assembleECharts({
  data: { values: myData },
  semantic_types: { weight: 'Quantity', mpg: 'Quantity' },
  chart_spec: { chartType: 'Scatter Plot', encodings: { x: { field: 'weight' }, y: { field: 'mpg' } } },
});

const config = assembleChartjs({
  data: { values: myData },
  semantic_types: { category: 'CategoryCode', value: 'Quantity' },
  chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'category' }, y: { field: 'value' } } },
});
```

### Python

```python
from flint.vegalite import assemble_vegalite

spec = assemble_vegalite({
    "data": {"values": rows},
    "semantic_types": {"weight": "Quantity", "mpg": "Quantity"},
    "chart_spec": {
        "chartType": "Scatter Plot",
        "encodings": {"x": {"field": "weight"}, "y": {"field": "mpg"}},
        "canvasSize": {"width": 400, "height": 300},
    },
})
```

### The chart spec

```ts
assembleVegaLite(input: ChartAssemblyInput): TopLevelSpec
assembleECharts(input: ChartAssemblyInput): EChartsOption
assembleChartjs(input: ChartAssemblyInput): ChartConfiguration
```

Try the spec interactively in the [live editor](https://microsoft.github.io/flint-chart/#/editor).

| Key | What it is |
|-----|------------|
| `data` | `{ values: [...] }` (inline rows) or `{ url: "..." }` (JSON/CSV URL) |
| `semantic_types` | Per-field meaning, e.g. `{ revenue: "Price", country: "Country" }` — drives all derived config |
| `chart_spec` | What to draw: chart type, channel→field encodings, canvas size, properties |
| `options` | Layout tuning (stretch elasticity, step sizes, tooltips, …) |

Semantic types span temporal (`DateTime`, `Year`, `Month`), measures (`Quantity`,
`Price`, `Percentage`), discrete numerics (`Rank`, `Score`, `ID`), geographic
(`Latitude`, `Country`, `City`), categorical (`PersonName`, `Status`, `Boolean`),
ranges (`AgeGroup`, `Bucket`), and fallbacks (`String`, `Number`, `Unknown`). See
the [API reference](docs/api-reference.md) for the full list, the template
registries, and core utilities.

### Use Flint with AI agents

Flint is designed to be driven by AI agents. The
[**agent skill**](agent-skills/SKILL.md) tells a model exactly what to produce:
the `chart_spec` and `semantic_types` (referencing data columns by name). The host
then calls `assembleVegaLite` / `assembleECharts` / `assembleChartjs` to get the
backend spec — the model never hand-tunes sizing, color, or formatting.

- **Coding agents (Copilot, Cursor, Claude Code):** the agent writes code that
  binds data by reference — `data: { values: rows }` — and calls the assembler.
- **Chat apps with a render/MCP tool:** the agent passes the spec plus a
  reference to host-side data (file path, uploaded CSV, prior tool result).
- **Chat apps without tools:** the agent embeds a small table inline.

Point your agent at [`agent-skills/SKILL.md`](agent-skills/SKILL.md) (chart-type
catalog, channels, and worked examples) to get started.

---

## Repository overview

```
flint-chart/
├── packages/
│   ├── flint-js/          npm package `flint-chart` (TypeScript)
│   │   └── src/
│   │       ├── core/      semantics, layout, decisions, shared types
│   │       ├── vegalite/  Vega-Lite backend
│   │       ├── echarts/   ECharts backend
│   │       ├── chartjs/   Chart.js backend
│   │       ├── gofish/    GoFish backend (experimental)
│   │       └── test-data/ fixtures + generators (drive tests and the gallery)
│   └── flint-py/          PyPI package `flint` (Python port, Vega-Lite backend)
├── site/                  Vite + React demo: landing, gallery, editor, docs
├── agent-skills/          AI agent skill (SKILL.md)
├── shared/test-data/      JSON fixtures shared across JS + Python
└── docs/                  architecture and design documents
```

### Documentation

| Topic | Where |
|-------|-------|
| Overview & concepts | [docs/overview.md](docs/overview.md) · [live docs](https://microsoft.github.io/flint-chart/#/documentation/overview) |
| Architecture | [docs/architecture.md](docs/architecture.md) |
| Semantic-type design | [docs/design-semantics.md](docs/design-semantics.md) |
| Layout / stretch model | [docs/design-stretch-model.md](docs/design-stretch-model.md) |
| Color decisions | [docs/color-decisions.md](docs/color-decisions.md) |
| API reference | [docs/api-reference.md](docs/api-reference.md) |
| Extending Flint | [add a chart template](docs/adding-a-chart-template.md) · [add a semantic type](docs/adding-a-semantic-type.md) · [add a backend](docs/adding-a-backend.md) |
| For AI agents | [agent-skills/SKILL.md](agent-skills/SKILL.md) |

---

## Contributing

Contributions are welcome! See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)
and the [Developer guide](docs/DEVELOPMENT.md).

```bash
git clone https://github.com/microsoft/flint-chart
cd flint-chart
npm install            # root workspaces: packages/flint-js + site

npm run typecheck      # typecheck packages/flint-js
npm run test           # Vitest (packages/flint-js)
npm run build          # build packages/flint-js → dist/
npm run site           # demo site (gallery + editor) at http://localhost:5274/
npm run test:py        # Python compatibility tests (requires uv)
```

Node 18+ is required. The demo site aliases `flint-chart` to
`packages/flint-js/src`, so library edits hot-reload in the gallery and editor
without rebuilding `dist/`.

Quick recipes: [add a chart template](docs/adding-a-chart-template.md) ·
[add a semantic type](docs/adding-a-semantic-type.md) ·
[add a backend](docs/adding-a-backend.md). Please run
`npm run typecheck && npm run test && npm run lint` before opening a PR.

This project has adopted the
[Microsoft Open Source Code of Conduct](.github/CODE_OF_CONDUCT.md). See
[SECURITY.md](.github/SECURITY.md) to report vulnerabilities.

## Trademarks

This project may contain trademarks or logos for projects, products, or services.
Authorized use of Microsoft trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not
cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks
or logos is subject to those third parties' policies.

## License

[MIT](LICENSE) © Microsoft Corporation
