// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * What each Vega-Lite chart type is for, how its channels read, and what its `chartProperties` do:
 * the reference `list_chart_types` serves, so the authoring skill need not carry it.
 */
export interface ChartGuideProperty { key: string; values: string; effect: string }
export interface ChartGuide { note: string; properties: ChartGuideProperty[]; guidance?: string[] }

export const CHART_GUIDE: Record<string, ChartGuide> = {
 "Scatter Plot": {
  "note": "x + y required; `detail` carries a field (e.g. `country`) on each point without a visual channel, for tooltips and linking",
  "properties": [
   {
    "key": "opacity",
    "values": "0.1–1 (1)",
    "effect": "Point opacity"
   }
  ]
 },
 "Regression": {
  "note": "scatter + fit line; props `regressionMethod`, `polyOrder`",
  "properties": [
   {
    "key": "regressionMethod",
    "values": "`linear` | `log` | `exp` | `pow` | `quad` | `poly` (`linear`)",
    "effect": "Fit method"
   },
   {
    "key": "polyOrder",
    "values": "1–5 (3)",
    "effect": "Polynomial order (when `poly`)"
   }
  ]
 },
 "Connected Scatter Plot": {
  "note": "x + y required; `order` = connection sequence (time/index), so the line traces a trajectory and may self-cross",
  "properties": []
 },
 "Ranged Dot Plot": {
  "note": "dumbbell of two x per category",
  "properties": []
 },
 "Strip Plot": {
  "note": "jittered points; props `stepWidth`, `pointSize`, `opacity`",
  "properties": [
   {
    "key": "stepWidth",
    "values": "10–100 (20)",
    "effect": "Jitter spread"
   },
   {
    "key": "pointSize",
    "values": "0–150 (0=auto)",
    "effect": "Point size"
   },
   {
    "key": "opacity",
    "values": "0–1 (0=auto)",
    "effect": "Point opacity"
   }
  ]
 },
 "Bar Chart": {
  "note": "one discrete + one measure; prop `cornerRadius`; `detail` carries a finer field (e.g. `state` under `magnitude`) by splitting each bar into segments of its colour, for tooltips and linking",
  "properties": [
   {
    "key": "cornerRadius",
    "values": "0–15 (0)",
    "effect": "Round bar corners (px)"
   },
   {
    "key": "showValueLabels",
    "values": "boolean",
    "effect": "Print the numbers on the marks. Works with or without a theme: unset, it follows the house's own habit at this density (and with no house named, stays off), so the default the compiler reports is always the honest one. Set it to overrule that for one chart. Reported inapplicable (and ignored) where the marks are too dense to carry readable numbers, or where the template already writes its own text, so it is never a control that does nothing. On a stacked bar each segment prints its own value in the middle of the segment (at the edge it would read as the running total); segments too thin to hold a line of text go unlabelled, and a normalized stack prints each segment's share rather than its raw value, since the share is what the length shows. The printed number is rounded to roughly three significant figures — with a k/M suffix once the values get long, and enough decimals that the smallest value in the series still says something — so a raw `3.14159265` lands as `3.14` and a series of `0.001` to `5000` reads at both ends. Rounding never goes so far that two marks of different size print the same number, or that a non-zero value prints as `0`; where a house asked for a coarser precision than that, the digits are raised until the labels agree with the marks."
   }
  ],
  "guidance": [
   "Bar Chart is one series (a second category on color stacks). Stacked Bar Chart puts a second category on color, stacked (parts of a total). Grouped Bar Chart puts the second category on group, side by side (compare values); not on color."
  ]
 },
 "Grouped Bar Chart": {
  "note": "`group` = the clustering category; prop `dodge`; `detail` carries a finer field (e.g. `state` under `magnitude`) by splitting each bar into segments of its colour, for tooltips and linking",
  "properties": [
   {
    "key": "dodge",
    "values": "`auto` | `local` | `global` (`auto`)",
    "effect": "`local` compacts sparse groups per category; `global` preserves aligned group lanes; leave `auto` unless the user requests one"
   },
   {
    "key": "showValueLabels",
    "values": "boolean",
    "effect": "Print the numbers on the marks. Works with or without a theme: unset, it follows the house's own habit at this density (and with no house named, stays off), so the default the compiler reports is always the honest one. Set it to overrule that for one chart. Reported inapplicable (and ignored) where the marks are too dense to carry readable numbers, or where the template already writes its own text, so it is never a control that does nothing. On a stacked bar each segment prints its own value in the middle of the segment (at the edge it would read as the running total); segments too thin to hold a line of text go unlabelled, and a normalized stack prints each segment's share rather than its raw value, since the share is what the length shows. The printed number is rounded to roughly three significant figures — with a k/M suffix once the values get long, and enough decimals that the smallest value in the series still says something — so a raw `3.14159265` lands as `3.14` and a series of `0.001` to `5000` reads at both ends. Rounding never goes so far that two marks of different size print the same number, or that a non-zero value prints as `0`; where a house asked for a coarser precision than that, the digits are raised until the labels agree with the marks."
   }
  ],
  "guidance": [
   "Bar Chart is one series (a second category on color stacks). Stacked Bar Chart puts a second category on color, stacked (parts of a total). Grouped Bar Chart puts the second category on group, side by side (compare values); not on color."
  ]
 },
 "Stacked Bar Chart": {
  "note": "prop `stackMode`; `detail` carries a finer field (e.g. `state` under `magnitude`) by splitting each bar into segments of its colour, for tooltips and linking",
  "properties": [
   {
    "key": "stackMode",
    "values": "`stacked` | `normalize` | `center` | `layered` (unset)",
    "effect": "Stacking behavior; `normalize` = 100%, `center` = streamgraph"
   },
   {
    "key": "showValueLabels",
    "values": "boolean",
    "effect": "Print the numbers on the marks. Works with or without a theme: unset, it follows the house's own habit at this density (and with no house named, stays off), so the default the compiler reports is always the honest one. Set it to overrule that for one chart. Reported inapplicable (and ignored) where the marks are too dense to carry readable numbers, or where the template already writes its own text, so it is never a control that does nothing. On a stacked bar each segment prints its own value in the middle of the segment (at the edge it would read as the running total); segments too thin to hold a line of text go unlabelled, and a normalized stack prints each segment's share rather than its raw value, since the share is what the length shows. The printed number is rounded to roughly three significant figures — with a k/M suffix once the values get long, and enough decimals that the smallest value in the series still says something — so a raw `3.14159265` lands as `3.14` and a series of `0.001` to `5000` reads at both ends. Rounding never goes so far that two marks of different size print the same number, or that a non-zero value prints as `0`; where a house asked for a coarser precision than that, the digits are raised until the labels agree with the marks."
   }
  ],
  "guidance": [
   "Bar Chart is one series (a second category on color stacks). Stacked Bar Chart puts a second category on color, stacked (parts of a total). Grouped Bar Chart puts the second category on group, side by side (compare values); not on color."
  ]
 },
 "Pyramid Chart": {
  "note": "diverging horizontal bars",
  "properties": [
   {
    "key": "showValueLabels",
    "values": "boolean",
    "effect": "Print the numbers on the marks. Works with or without a theme: unset, it follows the house's own habit at this density (and with no house named, stays off), so the default the compiler reports is always the honest one. Set it to overrule that for one chart. Reported inapplicable (and ignored) where the marks are too dense to carry readable numbers, or where the template already writes its own text, so it is never a control that does nothing. On a stacked bar each segment prints its own value in the middle of the segment (at the edge it would read as the running total); segments too thin to hold a line of text go unlabelled, and a normalized stack prints each segment's share rather than its raw value, since the share is what the length shows. The printed number is rounded to roughly three significant figures — with a k/M suffix once the values get long, and enough decimals that the smallest value in the series still says something — so a raw `3.14159265` lands as `3.14` and a series of `0.001` to `5000` reads at both ends. Rounding never goes so far that two marks of different size print the same number, or that a non-zero value prints as `0`; where a house asked for a coarser precision than that, the digits are raised until the labels agree with the marks."
   }
  ]
 },
 "Lollipop Chart": {
  "note": "prop `dotSize`",
  "properties": [
   {
    "key": "dotSize",
    "values": "20–300 (80)",
    "effect": "Circle size (px)"
   },
   {
    "key": "showValueLabels",
    "values": "boolean",
    "effect": "Print the numbers on the marks. Works with or without a theme: unset, it follows the house's own habit at this density (and with no house named, stays off), so the default the compiler reports is always the honest one. Set it to overrule that for one chart. Reported inapplicable (and ignored) where the marks are too dense to carry readable numbers, or where the template already writes its own text, so it is never a control that does nothing. On a stacked bar each segment prints its own value in the middle of the segment (at the edge it would read as the running total); segments too thin to hold a line of text go unlabelled, and a normalized stack prints each segment's share rather than its raw value, since the share is what the length shows. The printed number is rounded to roughly three significant figures — with a k/M suffix once the values get long, and enough decimals that the smallest value in the series still says something — so a raw `3.14159265` lands as `3.14` and a series of `0.001` to `5000` reads at both ends. Rounding never goes so far that two marks of different size print the same number, or that a non-zero value prints as `0`; where a house asked for a coarser precision than that, the digits are raised until the labels agree with the marks."
   }
  ]
 },
 "Waterfall Chart": {
  "note": "`color` = Type column, values `start`/`delta`/`end` only; omit it for auto sign coloring; props `cornerRadius`, `totals`",
  "properties": [
   {
    "key": "cornerRadius",
    "values": "0–8 (0)",
    "effect": "Round bar corners"
   },
   {
    "key": "totals",
    "values": "`auto` | `none` | `first` | `last` | `both` (`auto`)",
    "effect": "Which bars anchor to zero as totals (only when no Type column)"
   },
   {
    "key": "showTextLabels",
    "values": "boolean (false)",
    "effect": "Legacy spelling of `showValueLabels`; still accepted"
   },
   {
    "key": "showValueLabels",
    "values": "boolean",
    "effect": "Print the numbers on the marks. Works with or without a theme: unset, it follows the house's own habit at this density (and with no house named, stays off), so the default the compiler reports is always the honest one. Set it to overrule that for one chart. Reported inapplicable (and ignored) where the marks are too dense to carry readable numbers, or where the template already writes its own text, so it is never a control that does nothing. On a stacked bar each segment prints its own value in the middle of the segment (at the edge it would read as the running total); segments too thin to hold a line of text go unlabelled, and a normalized stack prints each segment's share rather than its raw value, since the share is what the length shows. The printed number is rounded to roughly three significant figures — with a k/M suffix once the values get long, and enough decimals that the smallest value in the series still says something — so a raw `3.14159265` lands as `3.14` and a series of `0.001` to `5000` reads at both ends. Rounding never goes so far that two marks of different size print the same number, or that a non-zero value prints as `0`; where a house asked for a coarser precision than that, the digits are raised until the labels agree with the marks."
   }
  ],
  "guidance": [
   "**Waterfall color is a special \"Type\" column, not a free category.** On a `\"Waterfall Chart\"` the `color` channel is reserved for a *type* field whose values are literally `start`, `delta`, and `end` — it drives which bars anchor to zero, not an arbitrary grouping. Do **not** bind `color` to an `Increase`/`Decrease` (or up/down, gain/loss) category: the up/down direction is already derived from the **sign** of the `y` value and colored automatically (green up / red down). For the common case, **omit `color` entirely** and let Flint infer the start/delta/end and per-bar sign coloring. To force which bars are anchored totals, use the `totals` property (`first`/`last`/`both`), not a color field. Only bind `color` when you genuinely have a `start`/`delta`/`end` type column."
  ]
 },
 "Gantt Chart": {
  "note": "x = start, x2 = end",
  "properties": []
 },
 "Bullet Chart": {
  "note": "`goal` required (target)",
  "properties": []
 },
 "Histogram": {
  "note": "x = measure to bin; prop `binCount`",
  "properties": [
   {
    "key": "binCount",
    "values": "5–50 (10)",
    "effect": "Number of bins"
   }
  ]
 },
 "Boxplot": {
  "note": "category + measure; props `whiskerMethod`, `showOutliers`, `dodge`",
  "properties": [
   {
    "key": "dodge",
    "values": "`auto` | `local` | `global` (`auto`)",
    "effect": "`local` compacts sparse groups per category; `global` preserves aligned group lanes; leave `auto` unless the user requests one"
   },
   {
    "key": "whiskerMethod",
    "values": "`iqr` | `minmax` (`iqr`)",
    "effect": "Whisker rule (Tukey 1.5×IQR vs min–max)"
   },
   {
    "key": "showOutliers",
    "values": "boolean (true)",
    "effect": "Show outlier points (Tukey only)"
   }
  ]
 },
 "ECDF Plot": {
  "note": "x = measure; cumulative distribution (step line); prop `showPoints`",
  "properties": [
   {
    "key": "showPoints",
    "values": "boolean (false)",
    "effect": "Draw point markers on the line"
   }
  ]
 },
 "Heatmap": {
  "note": "color = the measure",
  "properties": [
   {
    "key": "showValueLabels",
    "values": "boolean",
    "effect": "Print the numbers on the marks. Works with or without a theme: unset, it follows the house's own habit at this density (and with no house named, stays off), so the default the compiler reports is always the honest one. Set it to overrule that for one chart. Reported inapplicable (and ignored) where the marks are too dense to carry readable numbers, or where the template already writes its own text, so it is never a control that does nothing. On a stacked bar each segment prints its own value in the middle of the segment (at the edge it would read as the running total); segments too thin to hold a line of text go unlabelled, and a normalized stack prints each segment's share rather than its raw value, since the share is what the length shows. The printed number is rounded to roughly three significant figures — with a k/M suffix once the values get long, and enough decimals that the smallest value in the series still says something — so a raw `3.14159265` lands as `3.14` and a series of `0.001` to `5000` reads at both ends. Rounding never goes so far that two marks of different size print the same number, or that a non-zero value prints as `0`; where a house asked for a coarser precision than that, the digits are raised until the labels agree with the marks."
   }
  ]
 },
 "Calendar Heatmap": {
  "note": "x = date; color = daily value (summed per day); GitHub-style week × weekday grid",
  "properties": []
 },
 "Line Chart": {
  "note": "props `interpolate`, `showPoints`",
  "properties": [
   {
    "key": "interpolate",
    "values": "`linear` | `monotone` | `step` | `step-before` | `step-after` | `basis` | `cardinal` | `catmull-rom` (`linear`)",
    "effect": "Curve shape"
   },
   {
    "key": "showPoints",
    "values": "boolean (false)",
    "effect": "Draw point markers on the line"
   }
  ]
 },
 "Sparkline": {
  "note": "x + y required; small-multiple mini trend lines, one per series (series from `color` or `detail`); props `interpolate`, `baseline`, `trendWidth`",
  "properties": [
   {
    "key": "interpolate",
    "values": "`linear` | `monotone` | `step` | `step-before` | `step-after` | `basis` | `cardinal` | `catmull-rom` (`linear`)",
    "effect": "Curve shape"
   },
   {
    "key": "baseline",
    "values": "`mean` | `zero` | `median` | `none` (`mean`)",
    "effect": "Reference line per spark row"
   },
   {
    "key": "trendWidth",
    "values": "80–600 (240)",
    "effect": "Mini line-plot width (px)"
   }
  ]
 },
 "Bump Chart": {
  "note": "rank-over-time lines",
  "properties": []
 },
 "Slope Chart": {
  "note": "two-period value change; straight segments + end points, one line per category",
  "properties": []
 },
 "Area Chart": {
  "note": "props `interpolate`, `opacity`, `stackMode`",
  "properties": [
   {
    "key": "stackMode",
    "values": "`stacked` | `normalize` | `center` | `layered` (unset)",
    "effect": "Stacking behavior; `normalize` = 100%, `center` = streamgraph"
   },
   {
    "key": "interpolate",
    "values": "`linear` | `monotone` | `step` | `step-before` | `step-after` | `basis` | `cardinal` | `catmull-rom` (`linear`)",
    "effect": "Curve shape"
   },
   {
    "key": "opacity",
    "values": "0.1–1 (0.7)",
    "effect": "Fill opacity"
   }
  ]
 },
 "Range Area Chart": {
  "note": "x + y + y2 required; translucent band from `y` (low) to `y2` (high), value axis fits the band (not zero)",
  "properties": []
 },
 "Violin Plot": {
  "note": "x (category) + y (measure) required; mirrored KDE density per category, prop `bandwidth`; **Vega-Lite only**; a genuine `color` subgroup splits two groups or grids 3+ groups",
  "properties": []
 },
 "Streamgraph": {
  "note": "centre-stacked areas",
  "properties": []
 },
 "Density Plot": {
  "note": "props `bandwidth`, `stackMode` (series stack; `layered` overlaps them), `opacity`",
  "properties": [
   {
    "key": "stackMode",
    "values": "`normalize` | `layered` (unset = stacked)",
    "effect": "`layered` overlaps the series, translucent"
   },
   {
    "key": "opacity",
    "values": "0.1–1 (0.7)",
    "effect": "Layered series opacity"
   },
   {
    "key": "bandwidth",
    "values": "0.05–2 (0=auto)",
    "effect": "Kernel bandwidth"
   }
  ]
 },
 "Ridgeline Plot": {
  "note": "x = measure; `color` (or a discrete `y`) names the ridges, each the KDE of x on its own baseline; a measure `y` draws each series' curve instead; props `overlap`, `order`, `tailCut`, `colorBy`, `perspective` (plans unset `skew`, `tilt`, `overlap` from the ridge count so the depth takes about 40% of the plot), `skew`, `tilt`, `valueMax`, `markAt` (`true` marks the x ticks, or a list of x values; each ridge's value is dotted and labelled, joined across ridges), `opacity`, `interpolate`, `bandwidth`; named ridges share one ink unless `colorBy` asks otherwise; a numeric `color` keeps a gradient key; **Vega-Lite only**",
  "properties": [
   {
    "key": "bandwidth",
    "values": "0.05–2 (0=auto)",
    "effect": "Kernel bandwidth"
   },
   {
    "key": "overlap",
    "values": "0.5–4 (1.8)",
    "effect": "How many baselines up the tallest ridge reaches"
   },
   {
    "key": "order",
    "values": "`mean`, `reverse` (unset = as given; a quantitative series lowest at the front)",
    "effect": "Highest mean on top, or reversed"
   },
   {
    "key": "tailCut",
    "values": "0–0.2 (0)",
    "effect": "Trim each ridge to where its density is at least this share of its peak"
   },
   {
    "key": "colorBy",
    "values": "`series`, `x` (unset = one colour)",
    "effect": "Named ridges share one ink by default; `series` colours each ridge, `x` fills each with a ramp along x"
   },
   {
    "key": "perspective",
    "values": "boolean (false)",
    "effect": "Stand the ridges on a floor seen in perspective: `skew`, `tilt`, `overlap` left unset are planned so the depth takes about 40% of the plot's width and more of its height as ridges are added; the depth names, edge and value ticks give way (along the axis, then level, then every n-th) before they touch"
   },
   {
    "key": "skew",
    "values": "0–0.4 (0)",
    "effect": "Perspective: shift the back ridges left by this share of the x range"
   },
   {
    "key": "tilt",
    "values": "0–6 (0)",
    "effect": "Perspective: the x axis rises this many baselines across its range, labels following its edge"
   },
   {
    "key": "opacity",
    "values": "0.1–1 (0.5)",
    "effect": "Ridge opacity, as the Range Area Chart; solid in perspective unless set"
   },
   {
    "key": "valueMax",
    "values": "number (0 = tallest peak)",
    "effect": "Perspective: the value the full ridge height stands for, read on the back-left value axis"
   },
   {
    "key": "markAt",
    "values": "boolean | number[]",
    "effect": "Mark and label every ridge's value at the x ticks inside the range (`true`) or at these x; a dashed line joins the marks at one x across the ridges"
   }
  ]
 },
 "Marginal Plot": {
  "note": "the plot follows the axis types (measure × measure = scatter, category × measure = strip, category × category = heatmap of counts) with each axis's distribution along it (density, histogram or boxplot on a measure axis, a bar of counts on a category axis, split by `color`; density margins layer by default); props `marginal`, `stackMode`, `bandwidth`, `binCount`, `whiskerMethod`, `showOutliers`; **Vega-Lite only**",
  "properties": [
   {
    "key": "stackMode",
    "values": "`stacked` (unset = layered)",
    "effect": "Stack the density margins instead of layering them"
   },
   {
    "key": "bandwidth",
    "values": "0.05–2 (0=auto)",
    "effect": "Kernel bandwidth"
   },
   {
    "key": "marginal",
    "values": "`density` | `histogram` | `boxplot` (`density`)",
    "effect": "What each margin draws along a measure axis; a category axis gets a bar of counts"
   }
  ]
 },
 "Pie Chart": {
  "note": "`size` = slice value (→ angle), `color` = category; props `innerRadius`, `sortSlices`",
  "properties": [
   {
    "key": "innerRadius",
    "values": "0–100 (0)",
    "effect": "Donut hole size (>0 → donut)"
   },
   {
    "key": "sortSlices",
    "values": "`none` | `descending` | `ascending` (`none`)",
    "effect": "Order wedges and their legend by slice value"
   },
   {
    "key": "showValueLabels",
    "values": "boolean",
    "effect": "Print the numbers on the marks. Works with or without a theme: unset, it follows the house's own habit at this density (and with no house named, stays off), so the default the compiler reports is always the honest one. Set it to overrule that for one chart. Reported inapplicable (and ignored) where the marks are too dense to carry readable numbers, or where the template already writes its own text, so it is never a control that does nothing. On a stacked bar each segment prints its own value in the middle of the segment (at the edge it would read as the running total); segments too thin to hold a line of text go unlabelled, and a normalized stack prints each segment's share rather than its raw value, since the share is what the length shows. The printed number is rounded to roughly three significant figures — with a k/M suffix once the values get long, and enough decimals that the smallest value in the series still says something — so a raw `3.14159265` lands as `3.14` and a series of `0.001` to `5000` reads at both ends. Rounding never goes so far that two marks of different size print the same number, or that a non-zero value prints as `0`; where a house asked for a coarser precision than that, the digits are raised until the labels agree with the marks."
   }
  ],
  "guidance": [
   "A donut is the Donut Chart type, or a Pie Chart with chartProperties.innerRadius > 0."
  ]
 },
 "Donut Chart": {
  "note": "`size` = slice value (→ angle), `color` = category; props `innerRadius`, `sortSlices`",
  "properties": [
   {
    "key": "innerRadius",
    "values": "0–100 (50)",
    "effect": "Donut hole size"
   },
   {
    "key": "sortSlices",
    "values": "`none` | `descending` | `ascending` (`none`)",
    "effect": "Order wedges and their legend by slice value"
   },
   {
    "key": "showValueLabels",
    "values": "boolean",
    "effect": "Print the numbers on the marks. Works with or without a theme: unset, it follows the house's own habit at this density (and with no house named, stays off), so the default the compiler reports is always the honest one. Set it to overrule that for one chart. Reported inapplicable (and ignored) where the marks are too dense to carry readable numbers, or where the template already writes its own text, so it is never a control that does nothing. On a stacked bar each segment prints its own value in the middle of the segment (at the edge it would read as the running total); segments too thin to hold a line of text go unlabelled, and a normalized stack prints each segment's share rather than its raw value, since the share is what the length shows. The printed number is rounded to roughly three significant figures — with a k/M suffix once the values get long, and enough decimals that the smallest value in the series still says something — so a raw `3.14159265` lands as `3.14` and a series of `0.001` to `5000` reads at both ends. Rounding never goes so far that two marks of different size print the same number, or that a non-zero value prints as `0`; where a house asked for a coarser precision than that, the digits are raised until the labels agree with the marks."
   }
  ],
  "guidance": [
   "A Pie Chart with a hole: the same channels and properties, with `innerRadius` 50 unless set."
  ]
 },
 "Rose Chart": {
  "note": "polar bars; props `alignment`, `padAngle`, `sortSlices`",
  "properties": [
   {
    "key": "sortSlices",
    "values": "`none` | `descending` | `ascending` (`none`)",
    "effect": "Order wedges and their legend by slice value"
   },
   {
    "key": "alignment",
    "values": "`left` | `center` (`left`)",
    "effect": "Wedge alignment"
   },
   {
    "key": "padAngle",
    "values": "0–0.1 (0)",
    "effect": "Gap between slices"
   }
  ]
 },
 "Radar Chart": {
  "note": "props `filled`, `fillOpacity`, `strokeWidth`",
  "properties": [
   {
    "key": "filled",
    "values": "boolean (true)",
    "effect": "Fill the polygon"
   },
   {
    "key": "fillOpacity",
    "values": "0–0.5 (0.15)",
    "effect": "Polygon fill opacity"
   },
   {
    "key": "strokeWidth",
    "values": "0.5–4 (1.5)",
    "effect": "Line width"
   }
  ]
 },
 "Candlestick Chart": {
  "note": "OHLC all required",
  "properties": []
 },
 "Bar Table": {
  "note": "compact bars + value labels",
  "properties": []
 },
 "KPI Card": {
  "note": "big-number tile; prop `behindThreshold`",
  "properties": [
   {
    "key": "behindThreshold",
    "values": "0–1 (0.5)",
    "effect": "Value/goal ratio cutoff for color"
   }
  ]
 },
 "Table": {
  "note": "the rows as given, one column per field in row order; shape `data.values` to the rows and fields to list, name columns with `field_display_names`; numbers and dates print by `semantic_types`; receives links and `updates`, sends no selection",
  "properties": []
 },
 "Map": {
  "note": "bubble map; `text` names points beside them (placed clear of each other, the most salient first — largest by `size`, else the ends of a quantity's `color` — at most one per 36,000 px² of plot; the rest keep their tooltips); `shape` tells points apart; `order` joins the points into routes (one per `detail`, else per categorical `color`); `size` is always the dots' area, `strokeWidth` each leg's width; props `region`, `projection`, `boundaries`, `arrows`, `curve`; with routes, a dot at every stop only where `size`, `shape`, `text` or a quantity's `color` asks for one, else at each route's start",
  "properties": [
   {
    "key": "region",
    "values": "`us` | `world` | `auto` (`auto`)",
    "effect": "Geographic scope"
   },
   {
    "key": "projection",
    "values": "`mercator` | `equalEarth` | `orthographic` | `stereographic` | `conic` | `mollweide`",
    "effect": "Map projection"
   },
   {
    "key": "arrows",
    "values": "boolean (true)",
    "effect": "Arrowheads on routes (with `order`)"
   },
   {
    "key": "curve",
    "values": "`auto` | `arc` | `great-circle` | `straight` (`auto`)",
    "effect": "Route legs: arcs between stops, great circles on a globe or along a long track"
   }
  ],
  "guidance": [
   "**Maps: `boundaries`.** Leave it unset: world maps draw the World Bank's official boundaries, US maps the Census Bureau's. `\"natural-earth\"` draws de facto borders instead. Only when the user gives a boundary file, pass it: `{ \"url\": \"...\", \"feature\": \"<TopoJSON object>\", \"ids\": \"iso-numeric\" | \"iso3\" | \"iso2\" | \"fips\" | \"as-is\", \"key\": \"properties.code\", \"attribution\": \"...\" }` (`ids` says what the file's feature ids are; `as-is` matches the rows exactly).",
   "**Maps: the user's region.** Where borders are drawn differs by country, and\nsome require their own official map. Never hold the chart for it:\n- Frame what the data covers: the map already fits the rows' countries or\n  region; set `region` (or the US `level`) when the data is one country's.\n- Always draw with the default borders; never wait on an answer about them.\n- Only where the user, their audience or their data is in a country whose\n  borders the World Bank draws differently (a disputed area, a line of\n  control, a claimed territory), add one line after the chart, once per\n  conversation: e.g. \"Borders follow the World Bank's map; if this is for an\n  audience in India, send your official boundary file and I'll switch to it.\"\n- If they send a file, pass it as `boundaries`. Flint ships no per-country\n  official sets: do not invent a URL or swap in `\"natural-earth\"` for one.\n- Otherwise say nothing about borders."
  ]
 },
 "Choropleth": {
  "note": "`text` names each region at its middle where it fits (small ones on zoom); `id` = region key (see guidance); props `region` (`\"world\"`/`\"us\"`), `level` (US: `\"state\"`/`\"county\"`/`\"auto\"`), `projection` (world), `boundaries`",
  "properties": [
   {
    "key": "region",
    "values": "`us` | `world` | `auto` (`auto`)",
    "effect": "Geographic scope"
   },
   {
    "key": "projection",
    "values": "`mercator` | `equalEarth` | `orthographic` | `stereographic` | `conic` | `mollweide`",
    "effect": "Map projection"
   }
  ],
  "guidance": [
   "**Maps: what `id` accepts.** Flint joins the key to its own boundaries; you supply no geometry or lookup. A **world** map takes country names (\"India\", \"DR Congo\", \"United Kingdom\"), ISO 3166 alpha-2 / alpha-3 codes (\"IN\", \"IND\"), or ISO numeric codes (356), all in one column. A **US** map takes state names, USPS codes (\"CA\") or FIPS codes (6), and county FIPS (6037) with `level: \"county\"`. Declare the key `Country` or `State` in `semantic_types` (or set `chartProperties.region`) whenever codes could collide: \"CA\", \"IN\", \"Georgia\", or small numbers. A key that matches no region is not drawn. Map marks carry only `id`, `color` and `detail`: to link a map with charts keyed by a name column, encode that column as `id` (names resolve too) or put it on `detail` (e.g. `id: \"map_id\", detail: \"country\"`), which also labels the tooltip.",
   "**Maps: `boundaries`.** Leave it unset: world maps draw the World Bank's official boundaries, US maps the Census Bureau's. `\"natural-earth\"` draws de facto borders instead. Only when the user gives a boundary file, pass it: `{ \"url\": \"...\", \"feature\": \"<TopoJSON object>\", \"ids\": \"iso-numeric\" | \"iso3\" | \"iso2\" | \"fips\" | \"as-is\", \"key\": \"properties.code\", \"attribution\": \"...\" }` (`ids` says what the file's feature ids are; `as-is` matches the rows exactly).",
   "**Maps: the user's region.** Where borders are drawn differs by country, and\nsome require their own official map. Never hold the chart for it:\n- Frame what the data covers: the map already fits the rows' countries or\n  region; set `region` (or the US `level`) when the data is one country's.\n- Always draw with the default borders; never wait on an answer about them.\n- Only where the user, their audience or their data is in a country whose\n  borders the World Bank draws differently (a disputed area, a line of\n  control, a claimed territory), add one line after the chart, once per\n  conversation: e.g. \"Borders follow the World Bank's map; if this is for an\n  audience in India, send your official boundary file and I'll switch to it.\"\n- If they send a file, pass it as `boundaries`. Flint ships no per-country\n  official sets: do not invent a URL or swap in `\"natural-earth\"` for one.\n- Otherwise say nothing about borders."
  ]
 }
};

/** Properties every positional or faceted chart takes; set only to force a non-default. */
export const CROSS_CUTTING_PROPERTIES: ChartGuideProperty[] = [
 {
  "key": "independentYAxis",
  "values": "boolean",
  "effect": "Faceted charts: give each panel its own y-scale."
 },
 {
  "key": "logScale_x / logScale_y",
  "values": "boolean",
  "effect": "Force a logarithmic axis."
 },
 {
  "key": "includeZero_x / includeZero_y",
  "values": "boolean",
  "effect": "Force the axis to include 0."
 },
 {
  "key": "xAxisType / yAxisType",
  "values": "temporal | nominal",
  "effect": "Force a temporal field to render as discrete bands, or the reverse."
 },
 {
  "key": "labelOverflow",
  "values": "list of wrap | skip | rotate45 | rotate90",
  "effect": "How x category names that do not fit take their band. Leave it out (names wrap, then stand upright; sequences print round values); set only when the user asks, e.g. [\"wrap\",\"rotate90\"] to label every year."
 }
];
