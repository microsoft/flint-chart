# Extending chart templates

Use this guide when a backend already exists and you want to add another chart type to it. For a new rendering target, start with [Extending backends](/documentation/adding-a-backend).

---

## Table of Contents

- [§1 Choose the chart name and channels](#1-choose-the-chart-name-and-channels)
- [§2 Author the template](#2-author-the-template)
- [§3 Describe what the template draws](#3-describe-what-the-template-draws)
- [§4 Compose several views](#4-compose-several-views)
- [§5 Register the template](#5-register-the-template)
- [§6 Add test data and pass the plan tests](#6-add-test-data-and-pass-the-plan-tests)
- [§7 Wire the site, docs and agent skill](#7-wire-the-site-docs-and-agent-skill)
- [§8 Cross-backend parity](#8-cross-backend-parity)
- [§9 Related](#9-related)

---

# §1 Choose the chart name and channels

The public identity is the **`chart` string** on `ChartTemplateDef`. It must match `chart_spec.chartType` exactly, for example `"Scatter Plot"`.

Pick only the channels the mark actually uses. Copy a similar template as a starting point:

| Family | Vega-Lite reference |
|---|---|
| Scatter / point | `vegalite/templates/scatter.ts` |
| Bar / column | `vegalite/templates/bar.ts` |
| Line / area | `vegalite/templates/line.ts`, `area.ts`, `range-area.ts` |
| Distribution | `vegalite/templates/density.ts`, `violin.ts` |
| Radial | `vegalite/templates/pie.ts` |
| Several views | `vegalite/templates/bar-table.ts`, `marginal.ts` |

A new chart that is a variant of an existing one should look like it. Reuse the sibling's mark definition and properties (export them from the sibling's file), or call the sibling's `instantiate` on a unit of your own spec, so a theme and a reader see one family. The Ridgeline Plot draws its bands as the Range Area Chart does; the Marginal Plot builds its plot with the Scatter Plot's, Strip Plot's or Heatmap's `instantiate`, by the axis types, and its margins with the Density Plot's, Histogram's, Boxplot's or Bar Chart's.

ECharts, Chart.js, Plotly, and Highcharts use the same `ChartTemplateDef` interface under their own `templates/` folders.

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
3. **`instantiate`** — receives a **deep clone** of `template` plus `InstantiateContext` (resolved encodings, `ChannelSemantics`, `LayoutResult`, data table, canvas size, and `plot` / `views` once the plan has sized the chart).
4. **No semantic branching** — read `ctx.channelSemantics[channel].format`, `.type`, `.zero`, etc.; do not switch on raw field names or storage types. Branching on a channel's *type* (a discrete `y` names the series, a measure `y` is drawn) is fine.
5. **`interactionSupport`** — what the chart type offers to interaction presets (`ChartInteractionSupport` in `core/interaction-spec.ts`). Declare only what the chart can honour: `elements`, `region`, `navigation`, `reorder`, `legend`, `discreteAxis`, `index`. An absent key means "never"; the assembler confirms the data-dependent ones against the bound encodings. Admission drops or rejects a preset whose `requires` list names a capability the chart lacks, and `list_chart_types` reports the supported presets from the same block.
6. **`semanticInteractions`** — the fields, series field, selectable marks and hover styles interactions read, plus `resolve` and `presentUpdate`. Copy the sibling's.

Optional hooks: `normalizeEncodings` (re-route the authored channels before semantics and layout; Vega-Lite only), `postProcess` (after layout and theme), `encodingActions` (shelf quick actions).

### Where the assembler writes

The assembler and the theme write their axis, scale, key and colour decisions onto the encodings they can see: the root `encoding`, `spec.encoding` under a facet, and each `layer`. A unit inside `vconcat` / `hconcat` is not visited. A composite template that wants those decisions on one of its units leaves that unit's encodings on the root during `instantiate` and moves them into the unit in `postProcess` (see `marginal.ts`).

### Where the theme reads

A house theme decides from the built spec's mark types: an `area` or `line` mark invites names at the series' ends and value labels. A chart whose subject is a distribution's shape (a violin, a density, a ridgeline, a scatter's margins) is listed in `DISTRIBUTION_SHAPE_CHARTS` in `core/theme/ground.ts` so the theme withholds both.

---

# §3 Describe what the template draws

The plan sizes the chart before the template builds it, so it reads a **structure**: the marks, what each positional axis encodes, the series, the stacking and the keys. `skeletonStructure(template, ctx)` derives it from the skeleton; a template that builds something its skeleton does not show states its own with the `structure` hook (`ChartStructure` in `core/structure.ts`).

`tests/chart-structure.test.ts` keeps the description equal to what `instantiate` builds, for every test case in every theme. The facts it compares, and what the built spec is read for:

| Fact | Described by | Read from the build |
|---|---|---|
| `marks` | the kinds of mark, any layer | every `mark` in the tree |
| `x` / `y` `fields` | the data fields the axis reads | the encoding's field, or a field a transform reads |
| `derived` | a measure the template computes (`count`, `density`, …; extend `DerivedMeasure` for a new one) | skips the field check |
| `baseline` | `'zero'` or `'data'` | `scale.zero`, or an explicit `domain` |
| `ownScale` | the template writes the domain or tick values | `scale.domain`, `axis.values` |
| `rounded` | `false` keeps the data's span | `scale.nice`, an explicit `domain`; unset beside a binned encoding |
| `stacking` | `stacked`, `normalized`, `centered`, `none` | `stack` on the measure, and whether bands hold several rows |
| `series`, `keys` | the colour series and the keys drawn | colour encodings whose `legend` is not `null` |
| `axisTitles` | titles the template sets, `null` for none | the axis titles |

State exactly what the build will show. A working axis (a ridgeline's baselines) is `derived` with `ownScale: true` and its `baseline`; a chart that writes explicit domains is `rounded: false`.

Two more tests read the emitted spec against the plan. `tests/plan-honour.test.ts` walks every unit and layer and checks each colour encoding's `sort` against the planned category order and each measure encoding's `zero` against the planned domain, so a unit that draws something other than the plan's measure on that channel (a margin's density axis) declares `zero: false` with `domainMin: 0`, and every colour encoding carries the plot's `sort`. `tests/title-plan.test.ts` fits the title from the built spec and from the plan; an axis the template titles itself must say so in `axisTitles`, or the two disagree.

---

# §4 Compose several views

A template that draws several views side by side sets `composite: true` and plans them:

- **`planPlot(ctx)`** — the plot size when it is not the layout's (a square pie, a scatter shrunk to make room for its margins). Runs in the plan.
- **`planViews(ctx)`** — the views and how they stand: a `ViewNode` of `view`, `concat` (row or column, with a gap) and `facet` nodes (`core/views.ts`). Runs after the plot; `instantiate` reads the sizes and gaps back from `ctx.views` and draws exactly those.

`tests/plan-views.test.ts` compiles the spec and checks every drawn view's size and the view counts against the plan, so the spec must draw what `planViews` said, in the same order.

Vega-Lite does not share a scale across nested concatenations. Views that must line up (a margin and its plot) each carry an explicit, identical `scale.domain`; write it in `postProcess`, when the theme and the layout have settled the plot's scales.

---

# §5 Register the template

In `packages/flint-js/src/<backend>/templates/index.ts`:

1. Import the new `*Def` constant.
2. Add it to the appropriate category array inside `*TemplateDefs` (e.g. `"Points"`).
3. Ensure `*GetTemplateDef(chartType)` can find it: `defs.find(t => t.chart === chartType)`.

Vega-Lite also runs `withInjectedProperties()` to attach the shared facet, log-scale, zero-baseline, axis-type and value-label properties by the template's cognitive channel. Nothing to add for a new template.

---

# §6 Add test data and pass the plan tests

### Generator pattern

The `TestCase` interface lives in `packages/flint-js/src/test-data/types.ts`.

Typical flow (see `scatter-tests.ts`, `bar-tests.ts`):

1. Define a small parameter matrix (cardinality, colour on/off, facet on/off, each `chartProperties` value that changes what is drawn).
2. Export `gen<Chart>Tests(): TestCase[]` with `chartType` matching `ChartTemplateDef.chart`.
3. Register in `packages/flint-js/src/test-data/index.ts`:

```typescript
TEST_GENERATORS['Dot Plot'] = genDotPlotTests;
```

Every generated case runs through the structure, honour, views and title tests of §3 and §4, in no theme and in each preset. Register the generators before the template is finished; the failures are the checklist.

### Verify

```bash
npm run typecheck
npm run test
npm run site    # Gallery → find your chart type
```

Review formatting, layout stretch, legends and facet behaviour across 3–6 representative cases.

---

# §7 Wire the site, docs and agent skill

The user-facing contract is that the same `chartType` string should work across `assembleVegaLite`, `assembleECharts`, `assembleChartjs`, `assemblePlotly`, and `assembleHighcharts` **when templates exist**.
Nothing below is read from the registry, so each needs a line:

| Where | What |
|---|---|
| `site/src/shared/chart-categories.ts` | a `createChart(...)` entry with an icon from `site/src/assets/chart-icons/` |
| `site/src/shared/gallery-labels.ts` | the Chinese label |
| `scripts/gen-chart-reference.ts` | the icon in `ICON_BY_CHART` and a sentence per new property key in `PARAM_DESCRIPTIONS` |
| `agent-skills/flint-chart-author/SKILL.md` | a row in the chart-type table and in the property table |
| `packages/flint-js/src/core/chart-transitions.ts` | θ transitions to and from its nearest chart types, where the encodings carry over |
| `packages/flint-js/src/core/recommendation.ts` | a `ChannelRoleMap` entry, or its channels count as auxiliary |

Then regenerate and sync:

```bash
npm run gen:reference   # docs/reference-*.md and the interaction appendix
npm run sync:skills     # copies the skills into flint-mcp's assets
npm run build           # flint-mcp bundles the registry and the skills
node scripts/sync-copilot-plugin.mjs
```

The MCP server test compares the bundled app and skill copies with the sources, so the sync is part of the change.

---

# §8 Cross-backend parity

The user-facing contract is that the same `chartType` string should work across `assembleVegaLite`, `assembleECharts`, `assembleChartjs` and `assemblePlotly` **when templates exist**. In practice:

- Port to backends you need immediately; file follow-ups for the rest. Say **Vega-Lite only** in the skill's chart-type table until then.
- `site/src/shared/supported-backends.ts` filters chart types per backend registry. A Vega-Lite-only template will not appear in ECharts until it is registered there too.

---

# §9 Related

- [Extending backends](/documentation/adding-a-backend) — full assembler wiring
- [Semantic Type](/documentation/semantic-types) — what `channelSemantics` contains
- [Auto Layout Algorithm](/documentation/layout-model) — `declareLayoutMode` and stretch models
- [API reference](/documentation/api-reference) — `chart_spec.chartType` and encodings
