# Extending chart templates

Use this guide when a backend already exists and you want to add another chart type to it. For a new rendering target, start with [Extending backends](/documentation/adding-a-backend).

---

## Table of Contents

- [§1 Choose the chart name and channels](#1-choose-the-chart-name-and-channels)
- [§2 Author the template](#2-author-the-template)
- [§3 Register the template](#3-register-the-template)
- [§4 Add test data and gallery coverage](#4-add-test-data-and-gallery-coverage)
- [§5 Cross-backend parity](#5-cross-backend-parity)
- [§6 Related](#6-related)

---

# §1 Choose the chart name and channels

The public identity is the **`chart` string** on `ChartTemplateDef`. It must match `chart_spec.chartType` exactly, for example `"Scatter Plot"`.

Pick only the channels the mark actually uses. Copy a similar template as a starting point:

| Family | Vega-Lite reference |
|---|---|
| Scatter / point | `vegalite/templates/scatter.ts` |
| Bar / column | `vegalite/templates/bar.ts` |
| Line / area | `vegalite/templates/line.ts` |
| Radial | `vegalite/templates/pie.ts` |

ECharts and Chart.js use the same `ChartTemplateDef` interface under their own `templates/` folders.

---

# §2 Author the template

`ChartTemplateDef` lives in `packages/flint-js/src/core/types.ts`.

```typescript
import { ChartTemplateDef } from '../../core/types';
import { defaultBuildEncodings } from './utils';

export const dotPlotDef: ChartTemplateDef = {
    chart: 'Dot Plot',
    template: { mark: 'circle', encoding: {} },
    channels: ['x', 'y', 'color', 'size', 'column', 'row'],
    interactionSupport: {
        elements: true,            // marks resolve to data rows
        region: ['cartesian'],     // rectangle and lasso drags resolve marks
        navigation: {},            // continuous x and y pan and zoom
        legend: true,              // a discrete colour legend can be toggled
    },
    markCognitiveChannel: 'position',

    declareLayoutMode: (channelSemantics, table, chartProperties) => {
        // optional: banded axes, σ overrides, Q→O conversion
        return { /* LayoutDeclaration */ };
    },

    instantiate: (spec, ctx) => {
        defaultBuildEncodings(spec, ctx.resolvedEncodings);
        // ctx.channelSemantics, ctx.layout, ctx.table, ctx.chartProperties, …
    },

    properties: [
        { key: 'opacity', label: 'Opacity', type: 'continuous',
          min: 0.1, max: 1, step: 0.05, defaultValue: 1 },
    ],
};
```

### Key rules

1. **`template`** — minimal native skeleton; `instantiate` fills encodings and mark properties.
2. **`markCognitiveChannel`** — tells the compiler how readers decode value (affects zero baseline and [Auto Layout Algorithm](/documentation/layout-model) compression).
3. **`instantiate`** — receives a **deep clone** of `template` plus `InstantiateContext` (resolved encodings, `ChannelSemantics`, `LayoutResult`, data table, canvas size).
4. **No semantic branching** — read `ctx.channelSemantics[channel].format`, `.type`, `.zero`, etc.; do not switch on raw field names or storage types.
5. **`interactionSupport`** — what the chart type offers to interaction presets (`ChartInteractionSupport` in `core/interaction-spec.ts`). Declare only what the chart can honour: `elements`, `region`, `navigation`, `reorder`, `legend`, `discreteAxis`, `index`. An absent key means "never"; the assembler confirms the data-dependent ones against the bound encodings. Admission drops or rejects a preset whose `requires` list names a capability the chart lacks, and `list_chart_types` reports the supported presets from the same block.

Optional hooks: `postProcess` (after layout), `encodingActions` (shelf quick actions).

---

# §3 Register the template

In `packages/flint-js/src/<backend>/templates/index.ts`:

1. Import the new `*Def` constant.
2. Add it to the appropriate category array inside `*TemplateDefs` (e.g. `scatterTemplates`).
3. Ensure `*GetTemplateDef(chartType)` can find it: `defs.find(t => t.chart === chartType)`.

Vega-Lite also runs `withInjectedProperties()` to attach shared facet and log-scale properties across templates. Follow existing entries in that file when your chart needs the same hooks.

### Regenerate Vega-Lite authoring types

After changing Vega-Lite registry names, channels, properties, or encoding-action
controls, run from the repository root:

```bash
npm run gen:chart-types -w packages/flint-js
npm run check:chart-types -w packages/flint-js
npm run typecheck:js
npm run test -w packages/flint-js -- tests/vegalite-chart-types.test.ts
npm run build:js
npm run test:types -w packages/flint-js
```

Check in `packages/flint-js/src/vegalite/chart-types.generated.ts`; do not edit it
by hand. The generator in `packages/flint-js/scripts/vegalite-chart-types.ts`
reads the source registry (including injected properties), not `dist`. Builds
regenerate before declaration emission. CI checks drift **before** any build can
rewrite the output, then runs source and built-package TypeScript fixtures.
The built-package check uses public package entrypoints without path aliases,
with `skipLibCheck: false` and `exactOptionalPropertyTypes: true`.

New metadata/value shapes need explicit generator support and tests; unsupported
shapes fail generation rather than producing loose types. Keep the two
assembler-backed supplements (`facetColumns` and deprecated `showTextLabels`)
aligned with `vegalite/assemble.ts`. Do not infer static domains from runtime
applicability callbacks or dynamic pivot/arrangement IDs.

---

# §4 Add test data and gallery coverage

### Generator pattern

The `TestCase` interface lives in `packages/flint-js/src/test-data/types.ts`.

Typical flow (see `scatter-tests.ts`, `bar-tests.ts`):

1. Define a small parameter matrix (cardinality, color on/off, facet on/off).
2. Export `gen<Chart>Tests(): TestCase[]` with `chartType` matching `ChartTemplateDef.chart`.
3. Register in `packages/flint-js/src/test-data/index.ts`:

```typescript
TEST_GENERATORS['Dot Plot'] = genDotPlotTests;
```

4. Optionally add a page in `gallery-tree.ts` listing the generator key.

### Verify

```bash
npm run typecheck
npm run test
npm run site    # Gallery → find your chart type
```

Review formatting, layout stretch, legends, and facet behavior across 3–6 representative cases.

---

# §5 Cross-backend parity

The user-facing contract is that the same `chartType` string should work across `assembleVegaLite`, `assembleECharts`, and `assembleChartjs` **when templates exist**. In practice:

- Port to backends you need immediately; file follow-ups for the rest.
- `site/src/shared/supported-backends.ts` filters chart types per backend registry. A Vega-Lite-only template will not appear in ECharts until it is registered there too.

---

# §6 Related

- [Extending backends](/documentation/adding-a-backend) — full assembler wiring
- [Semantic Type](/documentation/semantic-types) — what `channelSemantics` contains
- [Auto Layout Algorithm](/documentation/layout-model) — `declareLayoutMode` and stretch models
- [API reference](/documentation/api-reference) — `chart_spec.chartType` and encodings
