# Using themes

A theme in Flint is a formal specification that describes how a chart system behaves throughout creation. It is not a cosmetic skin applied after rendering. It works at three levels:

- **Layout algorithm.** Controls how the compiler allocates space, relates elements, and adapts labels, legends, axes, and annotations.
- **Semantic roles.** Sets presentation rules by meaning, so field roles, order, grouping, and hierarchy drive contrast, emphasis, and representation.
- **Geometry and typography.** Defines type, color, surfaces, line weight, corners, and mark shapes to carry a consistent visual identity.

[Explore themes](/themes) applies these three levels to the same set of charts so you can compare their effects directly.

`theme_spec` sits beside `chart_spec` in a `ChartAssemblyInput`. The chart spec says **what the chart means**. The theme spec says **how that meaning should be presented**.

> ThemeSpec currently affects Vega-Lite output. Other backend assemblers ignore it.

## Three ways to use `theme_spec`

Use the tabs below to compare the three accepted forms on a World Bank life-expectancy chart. The snippet abbreviates `data` and `semantic_types`, while keeping `chart_spec` visible for context and `theme_spec` highlighted. The chart still compiles the complete input.

```flint-theme-spec
theme-spec
```

### 1. Name a preset

Use a preset ID when one of Flint's built-in design systems fits your product. The shortest form is:

```json
{
  "theme_spec": "economist"
}
```

Flint currently ships these presets:

```flint-theme-presets
presets
```

Preset IDs are stable API values. Use `listThemePresets()` when a product needs to build its own picker.

### 2. Write a custom theme

Pass a JSON object to define a design system of your own:

```json
{
  "theme_spec": {
    "id": "our-brand",
    "ink": {
      "series": {
        "single": "#6b3fa0"
      }
    },
    "layout": {
      "density": "compact"
    }
  }
}
```

Every field is optional. Start with the decisions that matter to your product, then add detail as the system grows.

| Block | What it controls |
| --- | --- |
| `ink` | Surfaces, text, structural lines, accents, and categorical or numeric color |
| `type` | Headline, axis, label, annotation, and display-number typography |
| `structure` | Axes, ticks, grids, baselines, and frames |
| `marks` | Band width, strokes, corners, outlines, separators, and point sizing |
| `labels`, `legend`, `dataLabels` | Truncation, placement, visibility, and label ink |
| `annotation` | Units, axis titles, number formats, point emphasis, and statistics |
| `layout`, `facets` | Density, title spacing, band steps, panel spacing, and shared scales |
| `chartDefaults`, `compileDefaults` | House defaults for chart controls, base size, canvas size, and layout limits |
| `furniture` | Rules, tabs, and other recurring chart chrome |
| `variants` | Semantic conditions that adapt policy to a chart's role, density, or shape |

Theme rules are semantic. For example, `structure.grid.measure` controls the grid used to read values, whichever physical axis carries the measure. `legend.placement` gives the compiler an ordered set of acceptable positions rather than fixed coordinates. This is what lets one theme generalize across different chart types, data, and canvas sizes.

### 3. Inherit and override

Use `extends` when a preset is close to your brand:

```json
{
  "theme_spec": {
    "extends": "economist",
    "id": "our-economist",
    "ink": {
      "series": {
        "single": "#6b3fa0"
      }
    },
    "type": {
      "headline": {
        "family": "Aptos Display"
      }
    }
  }
}
```

Flint starts with the named preset and deep-merges your object over it. Nested objects merge, so changing `ink.series.single` keeps the preset's surfaces, text colors, ramps, and other series rules. Arrays and scalar values replace the preset value in full.

`categorical` and `categoricalExtended` are separate palettes. If your brand replaces categorical color, override both so charts with more series do not fall back to the preset's extended palette.

Use inheritance for a durable brand variation. It keeps the preset's compiler behavior while letting you own the identity that should differ.

## What belongs in a theme

A theme governs presentation and compiler behavior. It may decide:

- how tightly elements are packed;
- which labels can move outside a mark;
- whether a legend belongs inline, above, or beside the plot;
- how semantic groups receive contrast and emphasis;
- how axes, grids, marks, type, and surfaces are drawn.

A theme does **not** choose fields, aggregation, filtering, or sorting. Those choices determine what the chart means and belong in `data`, `semantic_types`, and `chart_spec`.

Keep that boundary and a theme can travel safely across data, chart types, canvas sizes, and products.
