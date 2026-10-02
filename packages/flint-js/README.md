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

Pure TypeScript. No UI framework dependencies. Data in, spec out.

## Install

```bash
npm install flint-chart
```

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

Flint ships ten presets and also accepts a custom `ThemeSpec`, or an object
that `extends` a preset and overrides selected fields. ThemeSpec currently
affects Vega-Lite output. See
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
| `flint-chart/test-data` | Sample data generators used by the gallery and tests |
| `flint-chart/gallery` | Curated example specs |

Both ESM (`import`) and CommonJS (`require`) builds are published, with type
declarations for every entry point.

## Typed Vega-Lite authoring

Use `satisfies VegaLiteChartSpec` to check an authored spec without changing
`ChartAssemblyInput` or the assembly functions:

```ts
import { assembleVegaLite, type VegaLiteChartSpec } from 'flint-chart';

const chart = {
  chartType: 'Area Chart',
  title: 'Revenue by quarter',
  encodings: { x: 'quarter', y: 'revenue', color: 'region' },
  chartProperties: { stackMode: 'layered', interpolate: 'monotone' },
} satisfies VegaLiteChartSpec;

const spec = assembleVegaLite({
  data: { values: [{ quarter: 'Q1', revenue: 120, region: 'North' }] },
  chart_spec: chart,
});
```

The package root and `flint-chart/vegalite` export three **type-only** helpers:

| Type | Contract |
|---|---|
| `VegaLiteChartType` | Literal names from the Vega-Lite template registry |
| `VegaLiteChartPropertiesMap` | Per-chart optional property shapes, e.g. `VegaLiteChartPropertiesMap['Bar Chart']` |
| `VegaLiteChartSpec` | Nongeneric union discriminated by `chartType`, preserving the native title, subtitle, sizes, and encodings (including shorthand and static series) |

Properties come from the registry's `properties` and `encodingActions` controls;
both are stored in `chart_spec.chartProperties`. For example, bar `sort` accepts
`'value-asc'` or `'value-desc'`, and only Area Chart accepts the `'layered'`
stack mode. Discrete values are literals, not display labels; registered array
options retain their tuple values. Continuous controls remain `number`, not a
UI slider range. Omit a property or pass `undefined` to request default behavior,
including when using TypeScript's `exactOptionalPropertyTypes`.

Known limitation: `projectionCenter` types describe registered presets, but
runtime normalization still compares arrays by reference, so fresh or
JSON-round-tripped tuples can warn and fall back to the default; this behavior
is unchanged.

Two assembler-supported inputs supplement that metadata: `facetColumns?: number`
on templates declaring a `column` channel, and deprecated `showTextLabels?: boolean`
where `showValueLabels` is declared. Legacy `showTextLabels: true` requests labels;
`false` or omission leaves the automatic choice intact. An explicit boolean
`showValueLabels` takes precedence over the legacy input. The alias adds no
second UI control.

This is an opt-in **static authoring** contract, not runtime validation or a
guarantee of applicability. Data and encodings still determine which options
apply; inspect `getChartOptions` for the current chart. It does not restrict
encoding channels beyond the native encoding types. Data-dependent
`chartProperties.chartType`, `pivot`, and `arrange` IDs, and other runtime inputs
outside the declared metadata, are deliberately excluded. Dynamic callers can
continue using the unchanged, broader `ChartAssemblyInput`. As with other
TypeScript object types, excess-key checks apply to fresh literals; these types
do not validate external JSON.

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
- [Semantic-type model & rationale](src/docs/design-semantics.md)
- [Stretch / banking layout model](src/docs/design-stretch-model.md)
- [Agent authoring skill](https://github.com/microsoft/flint-chart/blob/main/agent-skills/flint-chart-author/SKILL.md)

## License

MIT © Microsoft Corporation
