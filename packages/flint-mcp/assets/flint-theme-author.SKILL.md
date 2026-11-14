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
`powerbi-light`, `pop`, `cartoon`, `apple`, `de-stijl`, `bbc`, and `material`.

Nested objects merge. Arrays and scalar values replace the preset value. If you
replace `ink.series.categorical`, also consider replacing
`categoricalExtended`; otherwise high-cardinality charts may return to the
base preset's extended palette.

How series colour holds up past the palette and on the page:

- Past `categorical` (and `categoricalExtended`), the largest series keep the
  house inks and the rest take `ink.series.overflow`; with no overflow ink they
  take a grey derived from `ink.text.muted`. A single extra series keeps its own
  name. The renderer's default scheme is never used.
- `ink.series.categoricalText` gives each categorical ink a text variant, used
  where a series is written in its colour (line-end names, matched values).
  Without it, an ink under 3:1 against the plot is darkened in its hue for text.
- `ink.series.minContrast: { fill, stroke }` (defaults 1.25 and 1.6) sets when a
  faint ink is made visible: fills gain a darker edge, lines darken in hue.
- `geometry.point.ink` (`series`, `text`, or a colour) sets the ink of a line's
  vertex dots; by default they take the line's own ink.
- `ink.series.categoricalByCount: { 2: [...], 3: [...] }` states a set for an
  exact series count, when the guide publishes one; `ink.series.repeat: true`
  restarts the palette past its end when the guide says colours repeat.
- `ink.series.byMark: { line, area, bar, arc, point }` (each `{ single,
  categorical }`) gives one family of marks its own inks, when the guide does.
- `ink.series.roles: { other, total, missing }` colours values that play a role
  (Other, Total, No data) in every chart. Do not put particular values (parties,
  products) in the theme: those belong to the chart's field annotation
  `colors`.
- `ink.series.selection.ordered: "ramp"` with `ink.series.ordinal` gives a
  series whose order the chart declares (`sortOrder`) tints of one ramp.
- `geometry.area.fill: "fade"` and `geometry.line.wash: "tint" | "fade"`
  (with `washOpacity`) draw gradient fills; use them only for a guide that
  shows them.
- Mark rules stay with their marks: `geometry.area.edge` is a line on areas
  only; `geometry.band.opacity` and `outlineInk: "series"` are for bars;
  `geometry.band.minLength` keeps a near-zero bar visible;
  `geometry.point.density` (`countable`, `all`, `sparse`) says which lines keep
  dots; `geometry.point.shape` (`circle`, `square`, `diamond`, `triangle`,
  `cross`) is the glyph every dot is drawn as, and `geometry.point.opacity`
  how opaque (unset, a scatter's dots are 0.7; on a full plot shrunk dots rise
  toward solid); `geometry.point.halo: { presence, width }` rings a scatter's
  dots in the plot colour (declare it only where the house's dots carry a ring;
  a halo and an opacity below 1 are not combined, so declare one or the other);
  `geometry.arc.order` (`data`, `largestFirst`), `startAngle` and `hole` state
  pie rules.
- `marks.redundantChannels: ["texture"]` with `marks.texture` draws pattern
  fills on bars, wedges and areas: `pattern: "vary" | "hatch"`, or the guide's
  own order as `patterns` (`solid`, `diagonal`, `antidiagonal`, `horizontal`,
  `vertical`, `cross`, `dots`), lines `ink: "darker" | "white"`. Pair it with
  `redundantEncoding: "always"` only when the guide patterns every chart.

Type roles take the full weight scale (`thin`, `extralight`, `light`,
`regular`, `medium`, `semibold`, `bold`, `extrabold`, `black`, or 100–900) and a
`case` (`upper`, `lower`, `title`, `sentence`, `asIs`) that is applied before
text is measured. State the weight the guide names rather than the nearest
old one. `display` styles a KPI's big number; `annotation` a fitted statistic's
note; `footnote` is not drawn by Flint.

Furniture says where it sits and what it is measured against. `canvasTop` is
the canvas's own top edge (y = 0, outside the margin) — use it for a house that
rules the top of the graphic (the Economist's red line, UNHCR's top bar), with
`frame: "canvas"` to run edge to edge or `"content"` to stay inside the margin.
`aboveTitle` is a line over the headline (a wordmark, a logo); `besideTitle`
sits level with the headline and narrows it; `belowTitle` is a rule over the
plot block. Logos are `kind: "image"` with inline `svg` or a `src`, a size, an
`alt` and an optional `href`. The figure label itself is the chart's
`chart_spec.label`; the theme styles it with `type.kicker`.

Use a standalone theme when the reference system does not honestly inherit a
preset's layout, typography, and presentation behavior.

## Schema map

Use the source contract for exhaustive nested fields and enum values. These are
the authored blocks and their jobs:

| Block | Purpose |
| --- | --- |
| `ink` | Canvas, plot, panel, text, structural, series, status, and accent colors |
| `type` | Minimum size and role-based typography for headlines, axes, values, annotations, footnotes, and displays |
| `structure` | Semantic categorical/measure axes (and `axis.x`/`axis.y` to style the bottom and left axes by side; `placement` takes `opposite`, `leading`/`trailing`, or a screen side), grids, baseline, and frame. `axis.floating` (`omit`, `keep`, `rangeFrame`) says what the axis lines are where the values do not start at zero: a base that is not drawn there, the window's frame, or a frame spanning only the data (Tufte; Vega-Lite only); leave it unset unless the guide says. Each grid, `grid.zero`, `baseline` and `frame` is a presence or `{ presence, style, dash, weight, color }`; a grid may also take `layer: "front"` (over the marks). `grid.minor: { presence, divisions, on }` draws finer lines between the labelled ones |
| `marks` | Band width, strokes, interpolation, opacity, corners, outlines, points, connectors, intervals, summaries, and separators; `group: { gap, spacing }` (also `geometry.band.group`) for grouped bars — the gap between bars in a group and between groups, each a share of a bar's width or `"Npx"` |
| `labels` | Truncation, flush behavior, and the path category names that do not fit their band take. Leave `overflow` unset for the general path: a row of names `wrap` → `rotate90`; a run of times, dates, years or ranks `wrap` → `skip` (round values only) → `rotate90`. Set `overflow` only where the guide asks for something else, e.g. `["wrap", "rotate45", "rotate90"]` for 45° labels (steps: `wrap`, `skip`, `rotate45`, `rotate90`). Trimming is an add-on to every step, governed by `truncation` (`"never"` forbids it). Flint weighs each step whole and trimmed, at every size down to `type.minSize`, and takes the cheapest within the path's order. `fit` holds the thresholds: `minChars` (4), `turnedLimit` (px or `"40%"` of plot height), `gap` (em), `rowLimit` (px or % of chart width, for names down y). Names that fit are always flat; a row of names is never thinned |
| `legend` | Visibility, ordered placement choices, direction, title, swatches (`swatch`: `auto`, `square`, `circle`, `line`), redundancy suppression, and how several keys stand: `arrangement` (`row`/`stack`), `titlePosition` (`above`/`inline`) and `align` (`start`/`center`/`end`/`spread`), preferences the layout keeps unless the keys would overflow |
| `dataLabels` | Visibility, placement, and ink behavior for values on marks; `anchor` (`end`/`start`/`middle`) for labels inside bars, `fallback` (`perMark`/`allOutside`) when some bars are too short, `minContrast` for the ink inside a bar |
| `annotation` | Units, axis titles, number formatting, point emphasis, labels, and statistics. `numberFormat.compact` sets number compaction: `style` (k/M/B, K/M/B, k/m/b, k/m/bn), `per` (`scale`: one unit per axis, or `value`), `threshold`, `on` (`axis`, `labels`) and the semantic `types` it covers; values already in a scale (`m`, `bn`, "(millions)") are never compacted |
| `source` | How a chart's source line reads, when the chart gives one: `leadIn` (and its weight, style, case), `align`, `frame`, a `rule` above it, a house `credit` (`inline`/`end`/`nextLine`); set in `type.footnote` |
| `furniture` | The header around the title: rules, bands, tabs, wordmarks and logos, placed by `at` (`canvasTop`, `aboveTitle`, `besideTitle`, `belowTitle`) against a `frame` (`canvas`, `content`, `block`) |
| `facets` | Headers, frames, axis repetition, spacing, columns, and scale sharing |
| `layout` | Density, target width, title block, and band step |
| `chartDefaults` | Optional defaults keyed by registered chart type or `*`; caller values still win |
| `compileDefaults` | Preferred base size, canvas size, and supported assemble options |
| `interaction` | Tooltip format and semantic selection-boundary paint |
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

`interaction.selectionBoundary` accepts `color`, `width`, `opacity`, `haloColor`, `haloWidth`, and `haloOpacity`. Omitted paint is grounded from the theme: foreground from `ink.accent` then primary text, and halo from the plot or canvas surface. Use explicit values only when the house has a distinct interaction treatment.

`interaction.highlight` accepts `color`, `width`, `haloColor`, and `haloWidth`: the paint of the ring round a dot, the outline round a bar, cell, slice or region an annotation names, and an enclosure's outline. Unset, they take the neutral annotation grey; an update's own `highlightStyle` (or an enclosure's `color` and `width`) overrides it.

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
