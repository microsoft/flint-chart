# Extending backends

Add a backend when Flint needs to target a new rendering library or spec format. A backend is an `assemble<Backend>(input)` orchestrator plus a `templates/` registry; together they turn shared compiler output into a native chart spec or artifact. Existing references live under `packages/flint-js/src/`: `vegalite/`, `echarts/`, `chartjs/`, `plotly/`, and `excel/`.

For pipeline stages and repo layout, see [Architecture](/documentation/architecture).

---

## Table of Contents

- [§1 Create the skeleton](#1-create-the-skeleton)
- [§2 Follow the assembly contract](#2-follow-the-assembly-contract)
- [§3 Add templates](#3-add-templates)
- [§4 Wire up the package](#4-wire-up-the-package)
- [§5 Site and gallery](#5-site-and-gallery)
- [§6 Acceptance checklist](#6-acceptance-checklist)
- [§7 Related](#7-related)

---

# §1 Create the skeleton

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

Copy the closest existing backend before starting from scratch. Vega-Lite is the most complete reference for the shared pipeline; ECharts adds `colormap.ts` and `facet.ts` for backend-specific concerns.

---

# §2 Follow the assembly contract

```typescript
function assemble<Backend>(input: ChartAssemblyInput): <BackendSpec>
```

`ChartAssemblyInput` is defined in `packages/flint-js/src/core/types.ts` and includes `data`, `chart_spec`, `semantic_types`, `options`, and related fields.

### Pipeline (do not skip core stages)

The orchestrator **coordinates** `core/`. It should not re-derive format, zero baseline, or color from raw field types.

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

See `packages/flint-js/src/vegalite/assemble.ts` (file header + `assembleVegaLite`) for the canonical ordering.

**IR boundary:** downstream code reads flat `ChannelSemantics` and `LayoutResult` instead of re-inspecting semantic type strings.

---

# §3 Add templates

Templates encode **shape**, not **decisions**. If a template needs to branch on `field.type === 'temporal'`, move that logic to `core/` instead.

Each template exports a `ChartTemplateDef` (`core/types.ts`):

| Field | Role |
|---|---|
| `chart` | Display name — must match `chart_spec.chartType` |
| `template` | Native spec skeleton (mark + encoding structure) |
| `channels` | Allowed encoding slots |
| `markCognitiveChannel` | `position` / `length` / `area` / `color` — drives zero baseline and compression |
| `declareLayoutMode?` | Axis flags before layout (banded vs continuous, σ overrides) |
| `instantiate` | Mutate spec from `InstantiateContext` (encodings, layout, semantics) |
| `properties?` | Configurable chart properties |
| `postProcess?` | Final visual tweaks after layout |

Register in `templates/index.ts`: import defs, add them to the category map, and expose `*GetTemplateDef(chartType)` as `find(t => t.chart === chartType)`.

---

# §4 Wire up the package

1. **Barrel** — `export * from './<backend>'` in `packages/flint-js/src/index.ts`
2. **Bundle** — add a `packages/flint-js/tsup.config.ts` entry (`<backend>/index`)
3. **Exports** — add the `"./<backend>"` subpath in `packages/flint-js/package.json#exports`
4. **Smoke test** — extend `packages/flint-js/tests/smoke.test.ts` with one `assemble<Backend>()` shape assertion
5. **Gallery data** — add `gen<Backend>*Tests()` in `src/test-data/` and register it in `TEST_GENERATORS`

---

# §5 Site and gallery

- **Gallery dev server:** `npm run site` from the repo root, then open `/gallery`
- **Supported backends:** update `site/src/shared/supported-backends.ts` if the new backend should appear in the UI
- **Renderers:** only add a new React view (`site/src/components/`) when the spec format cannot reuse `VegaLiteView`, `EChartsView`, or `ChartjsView`. `TripleChart` currently covers VL + ECharts + Chart.js.

Optional: wire the assembler into `agent-skills/mcp-server/` if MCP clients should be able to call it.

---

# §6 Acceptance checklist

A backend is ready when:

- [ ] Bar, line, area, and scatter templates render correctly on standard gallery matrices
- [ ] `tests/smoke.test.ts` passes for the new assembler
- [ ] `npm run typecheck` and `npm run test` pass at repo root
- [ ] At least one dedicated test-data generator exercises backend-specific options

**Parity note:** not every `chart` name exists in every backend today. Document which templates you port; cross-backend parity is a goal, not a prerequisite for the first merge.

---

# §7 Related

- [Extending chart templates](/documentation/adding-a-chart-template) — `ChartTemplateDef` authoring
- [Auto Layout Algorithm](/documentation/layout-model) — what `computeLayout()` expects
- [API reference](/documentation/api-reference) — `ChartAssemblyInput` and assembler entry points
