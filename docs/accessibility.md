# Accessibility

Flint sits at the compile step, so accessibility surfaces can be generated
once from the semantic layer and land in every backend consistently —
designed in rather than patched on per chart.

## What is emitted by default

Every compiled chart carries a short generated description built from the
resolved semantics and the data: chart type, measure (with unit), dimension,
series, category/series counts, and the value range. The copy is structural
and statistical only — Flint never emits perceptual or interpretive claims
("X is trending up") it cannot verify.

Example, for a bar chart of `revenue` (annotated `Price` + `unit: "USD"`) by
`region`:

```
Bar Chart of revenue (USD) by region. 3 categories. Range 145–168.
```

Per backend:

| Backend | Surface |
|---|---|
| Vega-Lite | Top-level `description` (rendered as the SVG `aria-label`) |
| ECharts | `aria: { enabled: true, label: { description } }` (built-in aria module) |
| Chart.js | `_a11y.description` metadata — see wiring note below |

`field_display_names` is respected, so hosts can control the field wording
without touching the data.

## Decal patterns (opt-in)

ECharts can overlay per-series texture patterns so series remain
distinguishable without color (color-vision deficiency support):

```ts
assembleECharts(input, /* options: */) // via input.options
// { ...input, options: { a11yDecal: true } }
```

When `options.a11yDecal` is `true`, the compiled option gains
`aria.decal.show: true`. This is off by default because decals visibly change
the chart; the description metadata above is invisible and always on.

## Chart.js wiring note

Chart.js renders to a canvas, which has no native description surface. The
compiled config carries the text as `_a11y.description`; hosts should set it
on the canvas element:

```ts
const config = assembleChartjs(input);
canvas.setAttribute('role', 'img');
canvas.setAttribute('aria-label', config._a11y.description);
```

## Chartability coverage

Mapped against [Chartability](https://chartability.github.io/POUR-CAF/)
heuristics, this baseline addresses the critical "no title/summary/caption"
failure (generated descriptions) and part of "conveys meaning through visuals
alone" (aria metadata; decal for color-independent series identity on
ECharts). Not yet covered at the compile step: contrast floors on palette
selection, text-size floors, and data-density checks — candidates for
follow-up work on the existing `ChartWarning` channel. Keyboard navigation,
screen-reader interaction testing, and cognitive-load concerns live with the
host application, outside a compiler's reach.
