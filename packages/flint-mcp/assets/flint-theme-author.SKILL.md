---
name: flint-theme-author
description: "Use when: creating, translating, refining, reviewing, or validating a custom Flint ThemeSpec from brand guidelines, websites, slide decks, publication references, design tokens, or an existing visual identity. Produce a reusable ThemeSpec JSON object for Flint Theme Lab without inventing fields or changing chart semantics."
---

# Flint ThemeSpec authoring

Create a reusable visual system for Flint charts. Translate the user's reference
materials into one valid `ThemeSpec` that can be pasted directly into Theme Lab.

## Authoritative references

Read these before authoring. When prose and source disagree, the TypeScript
contract is authoritative.

- Theme guide: https://github.com/microsoft/flint-chart/blob/main/docs/theme-spec.md
- Exhaustive ThemeSpec types and allowed values: https://github.com/microsoft/flint-chart/blob/main/packages/flint-js/src/core/theme/types.ts
- Real preset implementations: https://github.com/microsoft/flint-chart/tree/main/packages/flint-js/src/core/theme/presets
- Theme Lab: https://microsoft.github.io/flint-chart/#/theme-lab

Do not invent keys. If a requested decision cannot be represented by
`ThemeSpec`, omit it and briefly identify the unsupported decision outside the
JSON only when the user asked for an explanation.

## Output contract

Unless the user asks for commentary, return exactly one valid JSON object:

- Return the bare `ThemeSpec`, not `{ "theme_spec": ... }` and not a complete
  `ChartAssemblyInput`.
- Do not wrap JSON in a Markdown fence.
- Do not include comments, placeholders, ellipses, or trailing commas.
- Include a stable kebab-case `id` and a human-readable `label`.
- Include only supported fields and only decisions justified by the references.
- Omit unspecified optional fields rather than guessing.

The top-level output schema is:

```json
{
  "extends": "optional-preset-id",
  "id": "theme-id",
  "label": "Theme label",
  "ink": {},
  "type": {},
  "structure": {},
  "marks": {},
  "labels": {},
  "legend": {},
  "dataLabels": {},
  "annotation": {},
  "furniture": [],
  "facets": {},
  "layout": {},
  "chartDefaults": {},
  "compileDefaults": {},
  "interaction": {},
  "variants": []
}
```

Every block except `id` and `label` may be omitted. The skeleton shows the
shape, not a requirement to emit empty blocks.

## Theme boundary

A theme controls presentation and compiler behavior across many charts. It may
decide color, typography, surfaces, grids, axes, mark geometry, labels,
legends, annotations, density, spacing, facets, and reusable chart defaults.

A theme does not choose data fields, encodings, aggregation, filtering,
sorting, chart titles, or data values. Never put those decisions in a
`ThemeSpec`. Outside `chartDefaults`, authored policy must not name a chart
type, positional channel, mark type, field, or backend property.

## Workflow

1. Inspect the supplied references. Extract recurring decisions, not isolated
   decoration from one screenshot.
2. Ask only for missing decisions that materially affect the theme:
   identity, required colors, typography, surface/background, density,
   accessibility constraints, and whether an existing Flint preset is a useful
   base.
3. Separate evidence into system roles:
   - surfaces and text hierarchy;
   - categorical, sequential, diverging, and status color;
   - typography roles;
   - axes, grids, baselines, frames, and structural ink;
   - mark weight, corners, points, separators, and spacing;
   - labels, legends, annotations, facets, and layout behavior.
4. Choose standalone authoring or inheritance.
5. Author the smallest coherent spec that expresses the system.
6. Check every key and enum against `types.ts`.
7. Return the bare JSON object.

## Choosing inheritance

Use `extends` when a built-in preset already supplies the intended compiler
behavior and the new theme is a focused variation. Available preset IDs are:

`nyt`, `economist`, `swiss`, `nature`, `mckinsey`, `datawrapper`, `powerbi`,
`powerbi-light`, `pop`, and `cartoon`.

Nested objects merge. Arrays and scalar values replace the preset value. If you
replace `ink.series.categorical`, also consider replacing
`categoricalExtended`; otherwise high-cardinality charts may return to the
base preset's extended palette.

Use a standalone theme when the reference system does not honestly inherit a
preset's layout, typography, and presentation behavior.

## Schema map

Use the source contract for exhaustive nested fields and enum values. These are
the authored blocks and their jobs:

| Block | Purpose |
| --- | --- |
| `ink` | Canvas, plot, panel, text, structural, series, status, and accent colors |
| `type` | Minimum size and role-based typography for headlines, axes, values, annotations, footnotes, and displays |
| `structure` | Semantic categorical/measure axes, grids, baseline, and frame |
| `marks` | Band width, strokes, interpolation, opacity, corners, outlines, points, connectors, intervals, summaries, and separators |
| `labels` | Truncation, flush behavior, and angle policy |
| `legend` | Visibility, ordered placement choices, direction, title, swatches, and redundancy suppression |
| `dataLabels` | Visibility, placement, and ink behavior for values on marks |
| `annotation` | Units, axis titles, number formatting, point emphasis, labels, and statistics |
| `furniture` | Repeating masthead tabs and header/footer rules |
| `facets` | Headers, frames, axis repetition, spacing, columns, and scale sharing |
| `layout` | Density, target width, title block, and band step |
| `chartDefaults` | Optional defaults keyed by registered chart type or `*`; caller values still win |
| `compileDefaults` | Preferred base size, canvas size, and supported assemble options |
| `interaction` | Tooltip format |
| `variants` | Conditional policy adaptations; variants may not change `ink` or `type` |

### High-value nested shapes

```json
{
  "ink": {
    "surface": { "source": "house", "canvas": "#ffffff", "plot": "#ffffff", "panel": "#f5f5f5" },
    "text": { "primary": "#111111", "secondary": "#444444", "muted": "#777777", "inverse": "#ffffff" },
    "structure": { "axis": "#222222", "grid": "#dddddd", "frame": "#cccccc", "rule": "#222222", "zero": "#222222", "connector": "#888888" },
    "series": {
      "single": "#0067b8",
      "categorical": ["#0067b8", "#d83b01", "#107c10"],
      "categoricalExtended": ["#0067b8", "#d83b01", "#107c10", "#5c2d91"],
      "overflow": "#777777",
      "sequential": { "stops": ["#e8f3fb", "#0067b8"], "space": "lab", "endpointsAgainstSurface": true },
      "diverging": { "stops": ["#0067b8", "#f5f5f5", "#d83b01"], "neutral": "#f5f5f5", "space": "lab", "endpointsAgainstSurface": true },
      "status": { "positive": "#107c10", "negative": "#d83b01", "neutral": "#777777" }
    },
    "accent": "#0067b8"
  }
}
```

This is a shape example, not a palette recommendation. Derive actual values
from the user's references.

Typography roles accept `family`, `size`, `weight`, `style`, `case`, and
`color`. Allowed weights are `regular`, `medium`, `semibold`, and `bold`.
Use available font families or defensible fallback stacks; do not claim a font
is available merely because it appears in an image.

Presence-driven policies use `omit`, `hairline`, `quiet`, `full`, or
`emphasised`. Density uses `compact`, `normal`, or `airy`. Read `types.ts`
before using less common enums.

## Translation guidance

- Map brand neutrals to surfaces, text hierarchy, and structure before mapping
  accent colors to data series.
- Treat categorical colors as an ordered identity set. Keep adjacent colors
  distinguishable and ensure the palette remains legible on the plot surface.
- Build sequential ramps with ordered lightness. Build diverging ramps around a
  meaningful neutral. Do not use categorical arrays as numeric ramps.
- Use status colors only for semantic positive, negative, and neutral meaning.
- Preserve readable contrast for primary text, axes, labels, and values.
- Translate recurring geometry into `marks`; do not encode a one-off shape from
  a single chart as global policy.
- Prefer semantic structure (`measure` versus `category`) over physical x/y
  assumptions.
- Keep the system coherent across line, bar, area, pie, matrix, distribution,
  multiseries, and faceted charts.
- Use `variants` only for real conditional policy and include `because` to state
  why the adaptation exists.

## Validation checklist

Before returning the JSON, verify:

- It parses as strict JSON.
- It is a bare object with `id` and `label`.
- Every top-level and nested key exists in `types.ts`.
- Every enum value and value type matches the source contract.
- It contains no chart data, fields, encodings, titles, or backend JSON.
- Text and structural ink remain readable against their surfaces.
- Categorical colors are distinguishable; ramps have ordered lightness and
  usable endpoints.
- Inherited arrays are intentionally replaced.
- The theme expresses reusable rules rather than one chart's decoration.
- The result can be pasted directly into Flint Theme Lab.
