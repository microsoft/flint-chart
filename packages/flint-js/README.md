# flint-chart

> A semantic-level visualization library that compiles data **+** semantic types
> into chart specifications for [Vega-Lite](https://vega.github.io/vega-lite/),
> [ECharts](https://echarts.apache.org/), [Chart.js](https://www.chartjs.org/),
> [Plotly](https://plotly.com/javascript/), and native Excel charts through Office.js.

You (or an LLM) describe a chart at the semantic level: chart type, field
assignments, and a **semantic type** per field (e.g. `Revenue`, `Rank`,
`CategoryCode`). A deterministic compiler derives the low-level parameters
(sizing, zero-baseline, number formatting, color schemes, mark templates) so
charts look good and stay editable without another model call.

Pure TypeScript. Data in, spec out, with optional interactive charts for your
own apps (React is an optional peer dependency).

## Install

```bash
npm install flint-chart
```

It comes with every backend it draws with: Vega-Lite (`vega`, `vega-lite`,
`vega-tooltip`), ECharts, Chart.js and Plotly (`plotly.js-dist-min`). React is
an optional peer, needed only for `flint-chart/react`.

## Quick start

```ts
import { assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';

const input: ChartAssemblyInput = {
  data: {
    values: [
      { region: 'North', revenue: 120 },
      { region: 'South', revenue: 90 },
      { region: 'East', revenue: 150 },
    ],
  },
  semantic_types: { region: 'Category', revenue: 'Quantity' },
  chart_spec: {
    chartType: 'Bar Chart',
    encodings: { x: { field: 'region' }, y: { field: 'revenue' } },
  },
};

const vegaLiteSpec = assembleVegaLite(input);
```

Add a formal visual theme without changing the chart's data or encodings:

```ts
const themedSpec = assembleVegaLite({
  ...input,
  theme_spec: 'economist',
});
```

Flint ships 14 presets and also accepts a custom `ThemeSpec`, or an object
that `extends` a preset and overrides selected fields. Themes apply to
Vega-Lite and Plotly output; the ECharts, Chart.js, and Excel assemblers ignore
them. See
[Using themes](https://microsoft.github.io/flint-chart/#/documentation/theme-spec)
and the [live theme wall](https://microsoft.github.io/flint-chart/#/themes).

The same `ChartAssemblyInput` compiles to any backend:

```ts
import { assembleVegaLite, assembleECharts, assembleChartjs, assemblePlotly, assembleExcel } from 'flint-chart';

const vl = assembleVegaLite(input);   // Vega-Lite spec
const ec = assembleECharts(input);    // ECharts option
const cj = assembleChartjs(input);    // Chart.js config
const pl = assemblePlotly(input);      // Plotly.js figure
const xl = assembleExcel(input);       // Native Excel chart artifact
```

## Interactive charts

Add `interaction_spec` to make a chart interactive with any of 23 presets, such
as `click-highlight`, `brush-x`, `inspect-index`, `navigate`, or `legend-toggle`.
Interactions run on the Vega-Lite surface:

```tsx
import { FlintChart } from 'flint-chart/react';

<FlintChart
  spec={{ ...input, interaction_spec: { interactions: [{ type: 'click-highlight' }] } }}
  onChange={({ phase, state }) => {
    if (phase === 'commit') console.log(state.selected);
  }}
/>
```

Pass `backend="echarts"` (or `chartjs`, `plotly`) to draw with another library.

An app that bundles into one file (no code splitting) can import a backend's
own entry, `flint-chart/react/vegalite` (or `/echarts`, `/chartjs`, `/plotly`;
`flint-chart/interactive/<backend>` likewise), which reaches no other backend's
library, so the file carries only that one. To draw a second backend from such
an entry, pass its factory: `renderers={{ echarts: createEChartsInteractiveRenderer }}`,
with `createEChartsInteractiveRenderer` from `flint-chart/echarts/interactive`.

Without React, `mountChart(element, input, { backend: 'vegalite' })` from
`flint-chart/interactive` mounts the same chart in any page. Bespoke interactions map semantic events to chart
updates with the [interaction API](https://microsoft.github.io/flint-chart/#/documentation/interaction-api);
see the [interaction presets](https://microsoft.github.io/flint-chart/#/interactions/gallery)
and [advanced interactions](https://microsoft.github.io/flint-chart/#/interactions/advanced).

## Subpath exports

| Import | Contents |
|---|---|
| `flint-chart` | Top-level assemblers plus core types |
| `flint-chart/core` | Semantic types, `ChartAssemblyInput`, shared compiler logic |
| `flint-chart/vegalite` | Vega-Lite backend |
| `flint-chart/echarts` | ECharts backend |
| `flint-chart/chartjs` | Chart.js backend |
| `flint-chart/plotly` | Plotly backend |
| `flint-chart/excel` | Native Excel / Office.js backend |
| `flint-chart/validate` | `validateChart` — per-problem input validation for agent loops |
| `flint-chart/interactive` | `mountChart`, interaction presets, and update helpers |
| `flint-chart/interactive/<backend>` | The same, reaching only `vegalite`, `echarts`, `chartjs` or `plotly`: for one-file bundles |
| `flint-chart/react` | `<FlintChart>` component (React is an optional peer dependency) |
| `flint-chart/react/<backend>` | The same, reaching only `vegalite`, `echarts`, `chartjs` or `plotly`: for one-file bundles |
| `flint-chart/render` | `renderSvg` — static SVG output (Vega-Lite or ECharts) |
| `flint-chart/image-charts` | Image-Charts URL backend |
| `flint-chart/test-data` | Sample data generators used by the gallery and tests |
| `flint-chart/gallery` | Curated example specs |

Both ESM (`import`) and CommonJS (`require`) builds are published, with type
declarations for every entry point.

## Rendering

The web backends produce **specs**, not pixels. To render those specs to PNG or SVG
without a browser, use the companion
[`flint-chart-mcp`](https://github.com/microsoft/flint-chart/tree/main/packages/flint-mcp)
server (or pass the spec to your own Vega-Lite / ECharts / Chart.js / Plotly renderer).
The Excel backend instead produces a native-chart artifact: use
`renderExcelChart(Excel, artifact)` inside an Office.js Excel host, or
`generateOfficeJs(artifact)` to emit portable Office.js source.

## Documentation

- [Project overview & docs](https://github.com/microsoft/flint-chart#readme)
- [Using themes](https://microsoft.github.io/flint-chart/#/documentation/theme-spec)
- [Interaction spec](https://microsoft.github.io/flint-chart/#/documentation/interaction-spec) and [API](https://microsoft.github.io/flint-chart/#/documentation/interaction-api)
- [Semantic-type model & rationale](src/docs/design-semantics.md)
- [Stretch / banking layout model](src/docs/design-stretch-model.md)
- [Agent authoring skill](https://github.com/microsoft/flint-chart/blob/main/agent-skills/flint-chart-author/SKILL.md)

## License

MIT © Microsoft Corporation
