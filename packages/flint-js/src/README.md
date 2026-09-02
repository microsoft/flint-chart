# flint-chart

A semantic-level visualization library that compiles data + semantic annotations
into chart specifications for multiple rendering backends. The LLM outputs only
chart type, field assignments, and a **semantic type** per field (e.g. `Revenue`,
`Rank`, `CategoryCode`). A deterministic compiler derives all low-level
parameters — sizing, zero-baseline, formatting, color schemes, and mark
templates — so charts look good *and* stay editable without calling the LLM again.

Pure TypeScript · No UI framework dependencies · Data-in, spec-out

> For the semantic-type model & rationale, see [docs/design-semantics.md](docs/design-semantics.md).
> For the stretch / banking layout model, see [docs/design-stretch-model.md](docs/design-stretch-model.md).

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
    baseSize: { width: 400, height: 300 },
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
index.ts                ← public API (re-exports core/ + all backends)

core/                   ← target-language-agnostic
  types.ts              ← shared type definitions (ChartAssemblyInput, ChartTemplateDef, …)
  semantic-types.ts     ← ~70 semantic types + VisCategory helpers
  decisions.ts          ← pure decision functions (layout, encoding type)
  resolve-semantics.ts  ← Phase 0: semantic resolution
  compute-layout.ts     ← Phase 1: layout computation
  filter-overflow.ts    ← overflow filtering

vegalite/               ← Vega-Lite backend
  assemble.ts           ← assembleVegaLite() orchestrator
  instantiate-spec.ts   ← Phase 2: VL spec instantiation
  templates/            ← chart templates (bar, scatter, bump, …)

echarts/                ← ECharts backend
  assemble.ts           ← assembleECharts() orchestrator
  instantiate-spec.ts   ← Phase 2: EC option instantiation
  templates/            ← chart templates

chartjs/                ← Chart.js backend
  assemble.ts           ← assembleChartjs() orchestrator
  instantiate-spec.ts   ← Phase 2: CJS config instantiation
  templates/            ← chart templates
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

### Interactive surface

Interactive renderers are opt-in and shipped separately from the static assembly entry point. The surface owns interaction coordination, viewport state, accessible scroll controls, and renderer lifecycle; the caller supplies only a container and chart input.

```ts
import { buildInteractiveChart, clickMark, externalInteraction } from 'flint-chart/interactive';

const surface = buildInteractiveChart(
  container,
  input,
  {
    backend: 'vegalite',
    renderer: 'canvas',
    interactions: [clickMark()],
  },
);

await surface.ready;
// Later: surface.destroy();
```

Application input is transport-neutral. Register an external handler with the chart,
then dispatch payloads by interaction ID from React state, a DOM listener, a WebSocket,
or another chart:

```ts
const countryPicker = externalInteraction<{ country: string }>({
  id: 'country-picker',
  handle: ({ country }) => ({
    id: 'country-selection',
    ops: [{
      op: 'set-style',
      targets: [{ select: { key: { Country: country } } }],
      value: { state: 'emphasized' },
    }],
  }),
});

await surface.dispatch('country-picker', { country: 'Japan' });
```

The facade supports `vegalite`, `echarts`, `chartjs`, and `plotly`, and loads only the selected adapter. Viewport changes retain the backend instance and update it through Vega's dataflow, ECharts `setOption()`, Chart.js `update()`, or Plotly `react()`. Vega-Lite interactions are enabled explicitly through `interactions`; `clickMark()` selects marks, Shift/Ctrl/Meta-click toggles marks, and clicking empty plot space clears. Other backends currently reject semantic interactions. Advanced integrations can use `mountInteractiveChartSurface()` with a custom `InteractiveRendererAdapter`; the surface invokes external handlers, while adapters expose interaction context and apply renderer-neutral updates. Existing `assemble*()` calls, static SVG/PNG rendering, and Excel output do not import or execute the interactive surface; they retain the normal first-window overflow fallback.

### Input types

```ts
interface ChartAssemblyInput {
  data: { values: any[] } | { url: string };  // inline rows or host-resolved data reference
  semantic_types?: Record<string, string>;     // field → semantic type
  chart_spec: {
    chartType: string;                         // e.g. "Scatter Plot"
    encodings: Record<string, ChartEncoding>;  // channel → encoding map
    baseSize?: { width: number; height: number };    // target layout size, default 400×320
    canvasSize?: { width: number; height: number };  // optional hard ceiling on stretch
    chartProperties?: Record<string, any>;     // template-specific knobs
  };
  options?: AssembleOptions;                   // layout tuning
}
```

| Key | Description |
|---|---|
| `data` | Data source — either `{ values: [...] }` (inline row objects) or `{ url: "..." }` (host-resolved JSON/CSV reference) |
| `semantic_types` | Per-column semantic annotations (e.g., `{ revenue: "Price", country: "Country" }`) |
| `chart_spec` | What to draw — chart type, encodings, canvas size, properties |
| `options` | Layout tuning (elasticity, step sizes, tooltips, etc.) |

```ts
interface ChartEncoding {
  field?: string;
  type?: 'quantitative' | 'nominal' | 'ordinal' | 'temporal';
  aggregate?: 'count' | 'sum' | 'average' | 'mean';
  sortOrder?: 'ascending' | 'descending';
  sortBy?: string;
  scheme?: string;
}

interface AssembleOptions {
  addTooltips?: boolean;       // default false
  elasticity?: number;         // axis stretch exponent    (default 0.5)
  maxStretch?: number;         // axis stretch cap         (default 1.5)
  facetElasticity?: number;    // facet stretch exponent   (default 0.3)
  minStep?: number;            // min px per discrete tick (default 6)
  minSubplotSize?: number;     // min facet subplot px     (default 60)
  defaultBandSize?: number;    // baseline px per category (backend-tuned)
  maxBandSize?: number;        // max px per category when sparse (backend-tuned)
  baseLabelFontSize?: number;  // axis tick font, backend-native (VL 10, others 12)
  baseTitleFontSize?: number;  // header font, backend-native (VL 11, EC/CJS 12, Plotly 14)
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
