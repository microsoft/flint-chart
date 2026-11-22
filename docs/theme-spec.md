# Using themes

A theme in Flint is a formal specification that describes how a chart system behaves throughout creation. It works at three levels:

- **Layout algorithm.** Controls how the compiler allocates space, relates elements, and adapts labels, legends, axes, and annotations.
- **Semantic roles.** Sets presentation rules by meaning, so field roles, order, grouping, and hierarchy drive contrast, emphasis, and representation.
- **Geometry and typography.** Defines type, color, surfaces, line weight, corners, and mark shapes to carry a consistent visual identity.

[Explore themes](/themes) applies these three levels to the same set of charts so you can compare their effects directly.

`theme_spec` sits beside `chart_spec` in a `ChartAssemblyInput`. The chart spec says **what the chart means**. The theme spec says **how that meaning should be presented**.

> ThemeSpec applies to Vega-Lite and Plotly output. The ECharts, Chart.js, and Excel assemblers ignore it.

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
| `chartDefaults`, `compileDefaults` | House defaults for chart controls, base size, canvas size, and layout limits. `chartDefaults` sets only controls that change how the chart looks; a control that changes how the data is read (axis type, zero baseline, log scale, transform, sort) is reported and dropped |
| `interaction` | Tooltip formatting and semantic selection-boundary paint |
| `furniture` | Rules, tabs, and other recurring chart chrome |
| `variants` | Semantic conditions that adapt policy to a chart's role, density, or shape |

Theme rules are semantic. For example, `structure.grid.measure` controls the grid used to read values, whichever physical axis carries the measure. `legend.placement` gives the compiler an ordered set of acceptable positions rather than fixed coordinates. This is what lets one theme generalize across different chart types, data, and canvas sizes.

For axis titles, `annotation.axisTitles: "omit"` moves required axis names and declared units to the end of the chart subtitle. Existing subtitle text is preserved, followed by a semicolon and the measure label, such as `Two shipments in September; Mass (kg)`. If both axes need titles, the appended labels identify `X:` and `Y:`. Without an existing subtitle or headline, the compiler creates a subtitle; with no headline above it, the subtitle is drawn alone in the deck's type. Labels shared across layers or facets are included once. The headline is not read: a headline is free to say something else, so a measure it names still goes into the subtitle. The author's own subtitle is read: a title whose name it already contains, and whose unit it or the ticks already state (`annotation.unit` on the ticks), is not appended again — `US unemployment rate, 2000-2023` over a ruler that prints `10%` does not gain `; Unemployment (%)`. `"whenAmbiguous"` retains required titles on their axes, while `"always"` retains all axis titles. Category and date title omission under `"omit"` and `"whenAmbiguous"` is otherwise unchanged.

An axis title longer than its axis does not run past the plot, nor stretch the drawing to hold it: it wraps onto two lines at the axis's length, split where the two come out most even, and where two lines will not hold it the second is cut with an ellipsis. One view's axes; panels keep theirs.

Selection boundaries are inferred from the theme unless explicitly stated. Their foreground defaults to `ink.accent`, then `ink.text.primary`; their halo defaults to the plot or canvas surface. This gives a continuous-color grid an outline that belongs to the house while remaining legible across both ends of its ramp. A theme can override the treatment:

```json
{
  "interaction": {
    "selectionBoundary": {
      "color": "#b54a20",
      "width": 1.25,
      "opacity": 0.68,
      "haloColor": "#ffffff",
      "haloWidth": 2.5,
      "haloOpacity": 0.35
    }
  }
}
```

This block controls paint only. Set `haloWidth` to `0` to disable the contrast halo. The ChartDef still decides whether a representation needs a boundary and the renderer still computes its contiguous geometry.

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

When a chart has more series than the house names inks, the largest series keep the house's inks and the rest share `ink.series.overflow` — or, when the house names none, a grey derived from its muted text ink. The renderer's default scheme is never used. Text written in a series' colour, such as a name at a line's end, takes `ink.series.categoricalText[i]` when the house gives one; otherwise an ink under 3:1 against the plot is darkened in its own hue. A series ink too faint to see against the plot (`ink.series.minContrast`, defaults 1.25:1 for fills and 1.6:1 for lines) keeps its fill with a darker edge, or is darkened as a line.

A house can say more about how series take colour, all optional:

- `ink.series.categoricalByCount: { 2: [...], 3: [...] }` — a set for an exact number of series, chosen ahead of `categorical` (IBM Carbon's one-to-five sets). Counted sets also serve as larger tiers past `categorical`, the way `categoricalExtended` does.
- `ink.series.repeat: true` — past the last ink, start the palette again instead of greying the rest. Pies still fold their tail: their first and last slices touch.
- `ink.series.byMark: { line?, area?, bar?, arc?, point? }`, each `{ single?, categorical? }` — inks for one family of marks (the Economist's scatter order, eBay's line tokens). A chart drawn by one family takes them; a chart mixing families (bars with a line) keeps the general set.
- `ink.series.roles: { other?, total?, missing? }` — inks for values that play a role in any chart: Other / Rest of world, Total, Missing / No data / N/A. A value with a role keeps its ink wherever it falls, and no other series wears it; `other` is also the overflow ink when the house names none. Colours for particular values — a party, an asset class — belong to the chart, not the theme: the field annotation `colors` (`semantic_types: { Party: { semanticType: "Category", colors: { DFL: "#0793AB" } } }`), which wins over a role.
- `ink.series.selection.ordered: "ramp"` with `ink.series.ordinal` — a series whose order the chart declares (`sortOrder` on the field annotation) samples the ordinal ramp, its stops in the order the categories take them, instead of distinct hues. Sequences Flint infers on its own (months, compass points) keep distinct hues.
- `geometry.area.fill: "fade"` — areas fade from their ink to clear at the baseline (stacked bands stay solid). `geometry.line.wash: "tint" | "fade"` with `washOpacity` — a wash of each line's own ink beneath it, down to the baseline, out of reach of the pointer and the key. Vega-Lite only.
- `marks.redundantChannels: ["texture"]` with `marks.texture: { pattern?: "vary" | "hatch", patterns?, ink?: "darker" | "white", spacing? }` — pattern fills on bars, wedges and areas, so series differ without colour. `vary` gives each series its own pattern, `hatch` one diagonal for all, and `patterns` the house's own order (`solid`, `diagonal`, `antidiagonal`, `horizontal`, `vertical`, `cross`, `dots`; `solid` leaves a flat fill). The lines are a darker shade of the ink or white, the outline turns the darker shade, a separator or slice gap is kept, and the key carries the patterns. With `redundantEncoding: "always"` even one series is patterned (unless its pattern is `solid`); `whenNeeded` waits until the inks run out. Vega-Lite SVG only: the renderers write the pattern defs into the SVG and the interactive view switches to SVG.


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

## Type roles

Each role under `type` — `headline`, `deck`, `axisLabel`, `axisTitle`, `keyLabel`, `keyTitle`, `valueLabel`, `annotation`, `footnote`, `display` — takes `family`, `size`, `weight`, `style`, `case` and `color`. Every field a theme states is either drawn or reported:

- `weight` takes the whole CSS scale: `thin` (100), `extralight`, `light`, `regular` (400), `medium`, `semibold`, `bold` (700), `extrabold`, `black` (900), or the number itself. A face that has no such weight loaded falls back to the nearest it has.
- `style: "italic"` and `weight` are drawn on every role that states them — the deck, axis labels and titles, key labels, facet headers.
- `case` — `upper`, `lower`, `title`, `sentence` or `asIs` — is applied before the text is measured, so capitals are fitted as capitals. `title` capitalises each word and keeps short joining words lower-case; `sentence` capitalises the first letter and leaves the rest as written. Value labels print numbers and take no case.
- `keyTitle` sets a key's title (`Population (M)`). A key title names a field as an axis title does, so what it leaves unset follows `axisTitle`'s family, slope and ink, at `keyLabel`'s size; where neither states them, the labels' family and the secondary text ink. Its weight is bold, or heavier where `axisTitle` is, and lighter only where `keyTitle.weight` says so: set in the labels' face, size and often ink, the weight is what tells a title from its entries. Its `case` is not applied: the title is the field's name as written.
- `display` sets a KPI card's big number (family, weight, slope, ink; its size stays fitted to the tile). `annotation` sets the note under a fitted statistic. Flint draws no footnote, so a `footnote` role is reported (`role-not-drawn`) for the host page to use.

## Grouped bars

A grouped (dodged) bar chart has two gaps. `geometry.band.group` states each one, as a share of a bar's width or in px:

```json
"geometry": { "band": { "fraction": 0.7, "group": { "gap": "2px", "spacing": 1 } } }
```

- `gap` — between the bars in a group: `0` touching, `0.1` a tenth of a bar, `"2px"`. Unset, a twentieth of a bar, never under 1px.
- `spacing` — between groups: `1` a bar's width, `"16px"`. Unset, the group fills `fraction` of its step, as a single bar would, but groups stay at least half a bar (and three gaps) apart.

The bars take what is left of the step: `step = k·bar + (k − 1)·gap + spacing`, with `k` bars in a group. A bar's width is never stated; the step is a guideline the layout fits. The layout, Vega-Lite and Plotly all use this one rule.

## Mark rules

Each rule reaches only the marks it names:

- `geometry.area.edge` / `edgeWidth` — a line along the top of each area, stacked bands included, in the area's ink. It is never an outline on bars, wedges or dots.
- `geometry.band.opacity` — the fill of bars (areas keep `geometry.area.opacity`). `geometry.band.outlineInk: "series"` edges each bar in its own series ink.
- `geometry.band.minLength` — a non-zero bar shorter than this many px is drawn as a stub of that length; zero stays empty.
- `geometry.point.density` — which lines keep their dots: `countable` (up to 12 readings, the default), `all`, or `sparse` (readings at least 20px apart). A house with hollow dots also gets hollow end markers.
- `geometry.point.shape` — the glyph every dot is drawn as: `circle` (the default), `square`, `diamond`, `triangle` or `cross`. It reaches a scatter's points, a line's vertices, a dumbbell's ends and the end markers. A chart that encodes shape keeps its encoding, and the house's glyph is the first shape its scale hands out. `geometry.point.opacity` (0–1) sets how opaque dots are; unset, Vega-Lite draws a scatter's dots at 0.7. Where a full plot shrinks the dots, the opacity rises with the lost diameter (0.5 at half the area becomes 0.71), so a lone dot stays readable while piles still darken. A chart's own `opacity` property still wins.
- `geometry.point.halo: { presence, width }` — a ring in the plot's colour around each dot, so overlapping dots stay countable. A line's dots get one wherever lines can cross unless it says `omit`; a scatter's dots only where it is declared. It is a quarter of the dot's radius, at most `width`, and a scatter's dots under about 6 px across (28 px²) get none. An outline takes its place (35% of the radius, at least 0.6 px, at most its width), and hollow dots get none. A halo and an opacity are two answers to overlap and are not combined: ringed dots are solid, and a house or chart that sets an opacity below 1 drops the ring. Declare one or the other.
- `geometry.arc.order` (`data` or `largestFirst`), `startAngle` (degrees clockwise from 12 o'clock) and `hole` (a share of the radius). Pies run in the data's order by default, as their key does; a chart's own `sortSlices` wins.

Dashes and marker shapes follow the colour order, so the first series is solid and keeps the first shape.

The house's curve (`geometry.line.interpolation`, else `geometry.area.interpolation`) reaches areas as well as lines, so an area's fill and its edge always take the same curve.

## Axis labels

Category names on a band axis are measured in the face they are drawn in (a face the width table does not know is measured as the fallback it knows, with room for a tenth more). Names that fit their band are set flat; a theme never forces a turn.

Names along x that do not fit take one of **two paths**:

| Axis | Path |
|---|---|
| A row of names (countries, products, categories, ordered words) | `wrap` → `rotate45` (if the theme permits it) → `rotate90` |
| A sequence that explains itself — times, dates, months, quarters, years, decades or ranks in bands, by semantic type | `wrap` → `skip` → `rotate45` (if permitted) → `rotate90` |

- `wrap` sets the names on two lines broken at a space, or on one line in bands widened within the stretch budget.
- `skip` prints only the names on the finest round interval that stands them apart (every 5 or 15 minutes, every 3 or 12 months, every 5, 10 or 50 years, every 10 ranks), flat and at the theme's size; every band keeps its tick, and the reader fills in the rest. A row of names is never thinned.
- `rotate45` / `rotate90` turn the names −45° / upright.

**Trimming is an add-on to every step, not a step**: wrapped lines trimmed to the band, skipped names trimmed to the room between them, turned names trimmed at `fit.turnedLimit`. `truncation: "never"` forbids it, and identifiers (`ID`, `ZipCode`) are never trimmed.

The path's order binds — a sequence that can skip does not turn, and −45°, where it holds, comes before upright. Within it, each step is tried whole and trimmed at every size from the stated one down to the floor (`type.minSize`, never below ¾ of the stated size), and the cheapest is taken. The cost adds what a reader loses: the share of each name trimmed away (×1), the size given up (×0.25), a turn (0.3 at −45°, 0.34 upright), wider bands (×0.18), a second line (×0.04), names left out of a sequence (×0.15). So a slightly smaller name beats a turned one, and a trimmed wrap gives way to a turn only when the trim would take most of each name. Where nothing holds, every name still prints, upright and as small as the band needs.

`labels.overflow` states a house's path where its guide asks for something other than the general one — e.g. `["wrap", "rotate45", "rotate90"]` for a house that turns labels 45°. A chart can state its own in `chartProperties.labelOverflow`. The thresholds sit in `labels.fit`, each with a default:

| Key | Meaning | Default |
|---|---|---|
| `minChars` | Characters a trimmed name keeps before its ellipsis; a trim that keeps fewer is not taken | 4 |
| `turnedLimit` | The widest a turned name runs before it is trimmed: px, or a share of the plot's height | `"40%"` |
| `gap` | Space two straight names keep between them, in em | half an em, at least 6px |
| `rowLimit` | The widest a row name down y runs before it wraps or is trimmed: px, or a share of the chart's width | a quarter of it, at least 180px |

The report `labels-overflow` names the step taken, and `+ trim` where it trims.

Names down y never turn: they wrap onto two lines, with the band widened within the stretch budget, where that reads better than cutting them at `rowLimit`. They may run wider than names along x, but not without end: past a cap — a little inside two-fifths of the chart (0.6 of the plot's width, less the tick), never under twelve of their size — they wrap there, whole on two lines where they can be, then are cut with an ellipsis (on one line where the rows hold one). The cap holds even where `truncation` is `"never"`; identifiers are never cut.

`labels.rowNames` sets where the names of horizontal bars stand: `beside` (the default, down the y axis), `above` (each on its own line over its bar, from the plot's left edge across its width), or `auto` (above only where, beside, a name would be cut or wrapped — Datawrapper's choice, after its "labels on a separate line"). A band holding a name over its bar is laid out from its top: air, the name, a small gap, the bar (as thick as the house makes a bar in half the band) and a gap; all the band has to spare is air over the name, at least twice the name's gap to its bar, so each name reads with the bar under it. The band starts at twice the house band, never under twice the least step nor what a name, a readable bar and that air need, and stretches by the same budget as any band; where the canvas's stretch cannot hold that, the names stand beside as before. It applies to one bar to a band — plain and stacked horizontal bars; grouped bars, small multiples and vertical bars keep their names on the axis. With names above, the axis keeps no gutter for them and no rule runs up the zero line through them.

`labels.timeContext` sets how a horizontal time axis names the larger period its ticks fall in — the month over days, the year over months, the date over hours. `inline` keeps it in the row: on the opening tick and at each boundary (`Nov 21, 2026 · 23 · 25`, `2025 · Apr · Jul`). `stacked` sets it on a second row under the tick labels, where the axis starts and again where the period changes (`21 22 23` over `Nov 2026`); each period name runs from its tick label's left edge into the plot, in the longest form that fits before the next, and the plot gives the row its height. `auto` (the default) stays inline except where small multiples stand side by side and the inline end labels would meet a neighbouring panel's across the gap — a week of days whose opening `Nov 21, 2026` hangs into the panel before, for instance — and then stacks. Under `inline`, a label that would cross that gap gives way, and the earliest label that fits carries the context. Year axes, turned labels and vertical axes keep one row.

A crowded continuous ruler (numbers, dates) still takes the smaller size the layout fits it at, so neighbouring small multiples do not run their end labels together; it is never turned for a flat house. Row names down a y axis are never turned for the names along x.

A key stands an em of its labels from the plot — `layout.density` makes it 0.8 em (`compact`) or 1.4 em (`airy`); keys one above another in the header stand 0.6 em apart, while keys side by side, and keys one above another beside the plot, stand 2.25 em apart, about twice the air between two entries of one key, so where one key ends and the next begins is plain. Every gap is in em of the keys' labels, so it keeps its proportion to the type, and eases smoothly with the plot's shorter side, from 0.7 on a small tile to 1.3 on a large chart (the stated em at 300 px), each kept to a least px (4 between keys, 7 from the title, 8 to the plot) so a small tile still shows its grouping. `legend.gaps` sets each, in em: `{ title, stack, row, plot }` — the title block to keys under it, keys one above another, keys side by side, a key to the plot. A key under the title stands the title block's gap from the plot instead (see `layout.titleBlock.gap`). A grid's cells (both axes banded) sit at a 28 px reading target and stay square — rows widen with columns widened for their names. Where `layout.bandStepFit` lets bands grow into spare room, cells grow by that share toward the size that fills the base, to twice the target at most. A size key lists round values (1, 2, 2.5 or 5 of a power of ten, never zero), as many as its edge has room for — one for every 80 px of the plot's side it stands on, from three to five, at most `legend.maxSwatches` — each symbol clearly larger than the last, so fewer where the data's range cannot hold more apart. Charts with no theme list them too, rather than every tick of the scale. Keys sharing an edge are weighed by the lines of entries the edge takes, alike whether they stand side by side (as many as the tallest key's) or one above another (all of them): a key wrapped into a grid beside another is as tall as the grid, so two keys each on one line, stacked, are often the shorter. Several keys may share an edge unevenly — one narrow and wrapped beside one long on a line. Keys side by side seat their titles alike — all on their entries' line or all above them — so one never reads as wrapped beside another; and keys too wide to stand at the house's `legend.align` set their titles above or stack before they move along the edge, though never off it. Around the plot, a top key stands clear of a flat y title (`axisTitlePlacement: "flatAboveAxis"`) by the title's lift above the plot, its line and a gap. Where an x ruler's first label sits on the plot's left edge, centred under its tick, the x labels drop just far enough to clear the lowest y label.

`structure.baseline` is drawn as a rule along the one measure axis, under bars, areas and lines, at zero where zero is inside the domain. Along a floor that is not zero — the chart chose not to start there, or the data dips below it — a base would claim one the chart does not have, so it is drawn there only where the house states it strongly (`emphasised`, or with its own ink or weight); and the index axis's line along such a floor is not drawn: the value grid draws it where a tick stands, and where none does a line would mark a value nobody labelled; the line's ticks go with it. A house that rules the value axis too keeps the line, as the frame of the window. It gives way to `grid.zero` where data crosses zero, and to an index axis line already along the floor, at least as heavy and as dark; at zero it takes a styled zero rule's ink and weight. Vega-Lite only.

`grid.zero` sets zero apart where the data crosses it — as a step past the grid, not an axis: stated plainly (`full`, `quiet`), it is drawn in an ink between the grid's and the axis's, at the grid's weight, solid; a house that gives it its own ink (`ink.structure.zero`, or a color on the rule) or asks for it `emphasised` gets that stronger line.

## Axes by side and direction

`structure.axis.categorical` and `.measure` style an axis by what it does. `structure.axis.x` (the bottom or top axis) and `.y` (the left or right one) style it by where it is drawn, whatever it carries, and override the role's settings — a house that draws a 2px rule along the bottom of every chart writes `axis.x: { line: 'full', lineWeight: 2 }`. Any axis may take its own `color` for its rule and ticks.

`structure.axis.floating` says what the axis lines are where the value scale floats — does not start at zero, as a line or a scatter at 45–90 does. `omit` reads the line along the floor as a base: off zero it would claim one the chart does not have, so it is not drawn, its ticks go with it, and the value grid marks the floor where a tick stands. `keep` reads the lines as the frame of the window, drawn wherever it starts. `rangeFrame` keeps the frame but has each continuous axis's line span only the data, set a few pixels off the plot (Tufte's range frame), so the frame itself says where the data runs; it is drawn by Vega-Lite only. Unset, a house that rules its value axis keeps the frame and one that only grids its values omits the line. Stated, it also decides `structure.baseline` along such a floor: only `keep` draws it there; unset, a strongly stated baseline (`emphasised`, or its own ink or weight) is drawn there as before. Bars and areas start at zero, so a floor under them is always a base.

`placement` places an axis:
- `default`; `opposite` — the far side, whichever way the axis runs;
- `leading` / `trailing` — the start or end of the reading direction: a vertical axis on the left or right, a horizontal one at the bottom;
- `top` / `bottom` / `left` / `right` — a screen side, applied only to an axis that runs that way (`measure.placement: 'top'` puts a bar chart's scale on top and leaves a line chart's on the left).

## Key placement

`legend.placement` ranks the places a key may go, best first. `inside` seats the key in the plot's top-right corner only where no mark reaches that corner — a pie, a radar, a rising line or a full stack covers it — and otherwise the key takes the next placement ranked, else `right` (reported as `legend-inside-covered`). A chart that draws past its plot — a radar's spoke labels stand outside its outer ring — keeps a key beside it its gap past what it draws there, not past the plot's edge.

A colour ramp beside the plot runs no longer than the plot is tall, down to about five lines of its labels (at least 60px). A short plot, such as a heatmap with more columns than rows, keeps its key at the side the house asks for rather than losing it to another edge for want of a shorter ramp.

`legend.titlePosition` seats a key's title above or below the plot: `inline`, on its entries' line, or `above` them. Where the house states none, the title stays on the entries' line wherever the row holds it, which saves a line, and stands above them otherwise. An inline title stands half again as far from its first entry as the entries stand apart, so it reads as the key's name rather than one more entry.

`legend.title` decides whether a key carries its field's name: `always`, or `whenAmbiguous` (the default), under which a house leaves the name off only where the chart proves the reader does not need it — a title not needed costs a line, a title needed and missing leaves the colours unread. A key to values — a size, an opacity or a colour ramp, whose labels are numbers — is always titled, even where the headline or an axis names its field. A key naming categories is left untitled on proof only: the headline or deck already names the field (`Three species, three clusters` over a Species key); an axis on the same field prints its title; the chart makes the key itself (a waterfall's `total`, `increase`, `decrease`); or every value proves one closed kind — month or weekday names, quarters, years, dates, country names, US state names, continents, never codes like `US` or `CA` — under a field name that says no more than that kind (`Country` or `country_name` over country names, not `Origin`). A semantic type is not proof: what the reader sees is the values and the name. Everything else is titled, and so is every key where a chart draws several (keys on one field merge and count once): untitled, one key's names run on into the next's. An author who wants a key untitled, or named otherwise, says so on the encoding: `title: null`, or `title: "Penguin"`. Whether the reader gets the name is not a house's choice, so the older `omit` is read as `whenAmbiguous` and reported (`legend-title-omit-read-as-when-ambiguous`).

`legend.swatch` sets the symbol beside each name in a key to categories: `auto` (the default) takes it from the mark — a square for bars, a stroke for lines, the dot's own glyph for points; `square`, `circle` or `line` draws that symbol for every mark. A key whose entries are shapes or sizes keeps its own symbols. Vega-Lite only; Plotly draws each entry from its trace and reports `swatch-unsupported`.

## Gridlines and rules

Every rule a house draws — each grid, the zero rule, the baseline, the frame round the plot — is a `Presence` or, where the house says more, an object:

```ts
structure: {
  grid: {
    measure: 'quiet',                                    // across the value axis
    category: { presence: 'quiet', style: 'dashed', color: '#D1D1D6' },  // across the index axis, styled on its own
    style: 'solid', dash: [3, 3], weight: 1,             // shared defaults a grid's own fields override
    zero: { presence: 'full', weight: 1.5, color: '#B3B3B3' },          // the rule at zero
    minor: { presence: 'hairline', divisions: 2, on: ['measure'] },     // finer lines between the labelled ones
    layer: 'behind',                                     // or 'front': both grids over the marks; a grid may state its own `layer`
  },
  baseline: { presence: 'full', weight: 2 },
  frame: { presence: 'full', weight: 3 },                // round the plot; a dash is drawn by Vega-Lite only
}
```

- A rule object: `presence` (unset means `quiet` — an object states a drawn rule), `style` (`solid` | `dashed` | `dotted`), `dash` (`[dash, gap]` px), `weight` (px before the presence scales it), `color` (its own ink; the presence still tones it), and for a grid `layer`.
- `category` is the grid across the axis the chart is indexed by — on a scatter, the vertical one — and `omit` keeps it off there too. A grid is restored only where no mark prints its value and no axis draws any ruler, and then only the value axis's.
- `minor` draws the finer lines (default one halfway, `divisions: 2`) on continuous axes, under the marks, only where the grid it divides is drawn. The labelled lines are the axis's stated values, or Vega's own computed and written down; a log or padded scale is left alone and reported (`minor-grid-not-drawn`). Vega-Lite only.
- `layer: "front"` draws a grid over the marks — white rules through a stack (Sonos). Vega-Lite only.

A signed field on a house without a diverging ramp is read on the sequential ramp across the data's own range, not a domain balanced about zero, and the report says so (`diverging-read-sequential`).

## Number compaction

`annotation.numberFormat.compact` says whether, how and where numbers are compacted (`1,250,000` → `1.25M`). The field says whether it may be.

```ts
annotation: {
  numberFormat: {
    compact: {
      show: 'auto',            // or 'never'
      style: 'short',          // k/M/B/T; 'upper' K/M/B/T; 'lower' k/m/b/t; 'editorial' k/m/bn/tn; 'si' k/M/G/T
      per: 'scale',            // one unit for a ruler or label set, from its largest value; 'value': each its own
      threshold: 10000,        // the least largest value compacted
      on: ['axis', 'labels'],  // measure-axis ticks and/or value labels; tooltips always print the full value
      types: ['Amount', 'Price', 'Profit', 'Count', 'Number', 'Quantity'],  // semantic types or families
    },
  },
}
```

- A field is never compacted when its semantic type is not covered (percentages, ranks, scores, years, IDs, temperatures). It is also left whole when its unit, its name or the chart's headline or deck already states a scale: a unit of `m` or `bn`, `Population (m)`, `Debt ($bn)`, "… (millions)".
- Ticks keep a currency sign or unit written around the number (`$0.5M`) and as many decimals as the ticks need (0, 0.5M, 1.0M). Labels take three significant figures, or the house's `precision` (two: `5.00B`).
- Without `compact`, `thousands: "suffix"` keeps its earlier reading: value labels only, each value its own suffix, left whole where three figures would merge two values.
- No chart writes SI's `G` for a billion, with or without a theme.
- Compaction is drawn by the Vega-Lite backend.

## Value labels

Value labels are measured as they are printed: the format and unit, in the label's font, weight, slope and case. A bar and its label are laid out together.

- **Inside a bar.** A label is checked against the bar, not the band. A bar too short for its own label prints it past its end, in an ink that reads on the plot.
- **Past a bar's end.** The plot keeps exactly the label's room: a line of text above a column, the measured width beside a horizontal bar. That room comes out of the plot, not a wider canvas.
- **When the band is too narrow:**
  1. the number is shortened (`1,234,567` → `1.23M`) — in the house's compact style where it states `numberFormat.compact`, else unless it states `annotation.numberFormat.thousands`;
  2. otherwise the bands widen into the canvas's spare room;
  3. otherwise the labels are withheld, with a report saying how wide the bands would have to be.

A theme can also say:

- `dataLabels.anchor: "end" | "start" | "middle"` — where a label printed inside a bar sits along it (`start` sets the values flush at the bar's base, reading as one column).
- `dataLabels.fallback: "perMark" | "allOutside"` — when some bars are too short for their label, move just those (default) or print every label past its bar's end.
- `dataLabels.minContrast` — the contrast an inside label keeps with its bar under `inkMode: "contrastWithMark"` (default 3, i.e. 3:1).

Vega-Lite draws all three; Plotly ignores them for now.

## Source line

A chart may give where its data comes from (`chart_spec.source`, optional). The theme says how that reads:

```json
"source": {
  "leadIn": "Source:", "leadInWeight": "bold",
  "align": "start",
  "rule": { "width": 1, "color": "#cccccc", "dash": [4, 4] },
  "credit": { "text": "BBC", "placement": "end", "weight": "bold" }
}
```

- `show`: `whenGiven` (default) or `never` (the host page prints it).
- `leadIn` (default `"Source:"`, `""` for none), with `leadInWeight`, `leadInStyle` and `leadInCase`.
- `align`: `start` or `end`. `frame`: `content` (inside the margin, with the headline) or `canvas`.
- `rule`: a line above the source, solid or dashed.
- `credit`: the house's own words, `inline` after the source (with `separator`, default ` | `), at the other `end`, or on the `nextLine`.
- `gap`: px between the chart and the footer.

The line is set in `type.footnote` (default: the axis-label size less 1px, in the muted ink). It wraps at the title block's width, and its room comes out of the plot, so the canvas keeps its size.

- `source.credit.image: { svg | src, width, height }` draws a logo in place of the credit's words at the line's other end (`placement: "end"`), level with the source — the BBC blocks. `src` takes a URL or a data URI, so a PNG works as well as an SVG; `text` stays its alternative text.

## Header furniture

`furniture` places the pieces a house draws around its title. Each says where it sits (`at`) and what it is measured against (`frame`):

```
y=0 ┌─────────────────────────────────────────┐ ← canvasTop    rules, bands, tabs on the canvas edge
    │  FIGURE 1                       [logo]  │ ← aboveTitle   figure label, wordmark, logo
    │  Headline, fitted to what is left [logo]│ ← besideTitle  level with the headline
    │  Deck                                   │
    │  ─────────────────────────────────────  │ ← belowTitle   a rule over the plot block
```

- Frames: `canvas` is the exported graphic's outer edges — the canvas top is y = 0, outside the margin; `content` is inside the margin, where the headline starts; `block` is the plot with its labels.
- Kinds: `rule`, `band`, `tab`, `text` (a wordmark, in its own `type`), `image` (a logo from inline `svg` or a `src`, with `alt`). Any piece can carry an `href`. `align` puts it at its frame's `start` or `end`.
- The header is planned before the title: the edge band and the line above push the title down, and their height comes out of the plot, so the canvas keeps the size asked for. Pieces beside the headline take its width — the headline is fitted to what is left — and move to the line above when that would leave it too narrow.
- The figure label is the chart's (`chart_spec.label`), set in `type.kicker`.
- `layout.titleBlock.frame: "plot"` starts the title at the plot's edge instead of the content's.
- `layout.titleBlock.gap` sets the space between the title block and the chart below it: `tight` 0.7, `normal` 1.25 and `loose` 2 times the headline size — more than a deck line even at `tight`, so the deck and the labels under it do not read as one column of text. A chart with no theme keeps 10px. Keys above the plot join the title block, grouped by its gaps: keys one above another stand closest (0.6 em, `legend.gaps.stack`); the title stands an em over them (`legend.gaps.title`), clearly more than its deck's leading so the keys do not read as another line of it; and this gap stands once, between the keys and the plot, eased with the plot and held between 1.25 and 2.5 times the title's gap to the keys, so a loose house's header does not float off its plot nor a tight one run into it. A `legend.gaps.plot` the theme sets stands as set.
- A chart can turn the theme's pieces off with `chart_spec.chrome`: `false` for all, or `{ header: false }`, `{ footer: false }` (footer rule and source credit), `{ logos: false }` (image pieces and a credit's image; the credit keeps its words). Left out, the theme decides.
- Header pieces are drawn on the canvas after render by Flint's renderers (static SVG, the interactive view, the MCP app); a chart rendered by plain vega-embed does not show them. The earlier `mastheadTab`, `headerRule` and `footerRule` still work. A `footerRule` is drawn on the canvas too: across the content width (where the headline starts to the right margin, unless it states a `width`), 6px under everything the chart lays out, and above a source line.
