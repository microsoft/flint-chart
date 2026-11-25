/**
 * The colour-system improvements, stage by stage: what each rule says, why, how it was built, what it
 * changes by default and what is opt-in, the API it adds, the code and tests behind it, and what it
 * does to existing themes. Measured against the theme matrix: 1,857 charts —
 * every preview case with no theme and under every shipped preset, plus every new-theme-test house's
 * gallery and gap charts — compiled before and after each stage and compared as rendered SVG.
 */
export interface Stage {
  id: string;
  label: string;
  title: string;
  /** The rule as reviewed. */
  rule: string;
  /** Markdown body. */
  doc: string;
  /** Points that need a decision, listed for review. */
  decisions?: string[];
  /** Issue page in the new-theme-test Issues tab this stage answers. */
  issue: string;
  /** `option`: nothing changes until a theme states it; `default`: changes charts as they are. */
  kind?: 'default' | 'option';
}

export const STAGES: Stage[] = [
  {
    id: 'r1',
    label: 'R1 · Never leave the palette',
    title: 'R1 — A house palette is never replaced by the renderer’s scheme',
    rule: 'When series outnumber the house inks and the house names no overflow ink, keep the house inks and fold the tail into a grey derived from the house — never Vega’s default scheme.',
    issue: 'palette-structure',
    doc: `
**Problem.** Grounding marked such a palette \`exhausted\` and realization then left the colour scale alone, so Vega-Lite's \`tableau10\` took over: a DHL chart with four series came out blue, orange, red and teal — none of them DHL's. The departure was reported (\`palette-exhausted\`), but the chart still left the house.

**Design.** The fold already existed for houses that name \`ink.series.overflow\`: the largest series keep a house ink, the rest share the overflow ink under one “Others (N)” key entry, and a pie sums them into one slice. R1 routes exhaustion into the same path with a derived overflow ink: the house's muted text ink (\`ink.text.muted\`, else \`secondary\`), a third of the way toward the plot surface, kept at ≥1.8:1 against it. Connected marks (lines, areas) are never folded — a folded line would thread through two series — so their extra series each keep a line, in the same grey.

**Default / option.** Default for every house without \`overflow\`. A house that names \`overflow\` is unchanged. The report keeps the code \`palette-exhausted\` and now names the grey.

**API.** None.

**Code.** \`core/theme/ground.ts\`: the exhaustion branch of \`groundSeriesInk\` now returns \`overflowTail\` with \`houseOverflowInk(theme, surface)\` instead of \`exhausted: true\`. The legend plan's fold (\`core/legend-plan.ts\`), Vega-Lite realization and Plotly realization already handle \`overflowTail\`, so nothing else changes. The \`exhausted\` flag stays in the type for any caller that sets it.

**Tests.** \`tests/theme-colour-rules.test.ts\` — R1: a five-slice pie under a three-ink house keeps the three inks and never a \`tableau10\` colour; a five-series line chart gives the extra lines one grey; a stated overflow ink still wins.

**Effect on existing themes.** No shipped preset and no unthemed chart changes (every preset either names enough inks or an overflow ink). 17 house charts change: BBC, Cato, DHL, Mailchimp, Mayo Clinic, Aviva, VTEX.
`,
    decisions: [
      'Connected marks are never folded, so on a line or area chart every series past the palette takes the same grey: two or more grey lines/bands next to each other cannot be told apart (BBC’s six-source area). Their names still label them.',
      'The derived grey is muted ink 35% toward the surface. A house context grey (the deferred emphasis/context role) should replace it once it exists.',
      'Houses that cap colours (Cato at 4, Justice Innovation Lab at 3) still get a grey tail; a `maxDistinct` report asking the author to consolidate is not part of this stage.',
    ],
  },
  {
    id: 'r1b',
    label: 'R1b · Tail of one',
    title: 'R1b — A tail of one keeps its own name (follow-up to R1, measured after R5)',
    rule: 'When exactly one series is past the house palette, it takes the overflow ink under its own name instead of an “Others (1)” key entry.',
    issue: 'palette-structure',
    doc: `
**Problem.** Reviewing R1 showed the fold relabelling a single overflowing category as “Others (1)” — on the browser pie it turned a real category called “Other” into “Others (1)”, and on the Gapminder bubbles it hid Europe. The fold exists to keep the key short when many small series share one ink; for one series it only hides a name.

**Design.** The fold still ranks categories by their share and gives the overflow ink to the smallest — that is what decides *which* category goes grey — but when the tail is one category, the fold's label is that category's own name. Pies keep one slice (summing one slice changes nothing). Plotly's pie and point folds do the same.

**API.** None.

**Code.** \`core/legend-plan.ts\` (\`foldedColour\`); \`plotly/theme.ts\` (pie and point overflow labels).

**Tests.** “R1 follow-up”: a five-slice pie under a four-ink house keeps the domain Chrome, Safari, Edge, Firefox, Other — no “Others (1)”.

**Effect on existing themes.** Measured on top of R5: 9 house charts, no preset, no unthemed chart.
`,
  },
  {
    id: 'r2',
    label: 'R2 · Signed bars by status',
    title: 'R2 — One signed series of bars takes the status inks by sign',
    rule: 'With `selection.signed: "status"`, a single series of bars whose measure crosses zero colours each bar by the sign of its own value.',
    issue: 'status-colors',
    doc: `
**Problem.** \`groundSeriesInk\` returned the single ink as soon as the chart had no series field — before it read \`selection.signed\` — so a house that asked for status colours on signed values only got them when the data carried a separate sign column (the Direction field in the anomaly preview). CFPB, CMU, Goldman Sachs, Morningstar and Opower all drew their signed bars in one ink.

**Design.** Grounding keeps \`mode: 'single'\` (so label ink, the legend plan and everything else that reads the mode is unaffected) and adds \`signedStatus: true\` when: there is no series field, the data crosses zero, the mark is read by its length (bars), the house states \`status.negative\` and \`selection.signed: 'status'\`, and \`statusUse\` is not \`never\` or \`thresholdOnly\`. Realization then gives each bar layer a colour condition on its own measure: \`datum[measure] < 0 → status.negative\`, else \`status.positive\` (or the single ink). Lines and points keep one ink: a line cannot change colour at zero without a cut the data does not have.

**Default / option.** Applies only to houses that already ask for \`selection.signed: "status"\`.

**API.** \`ResolvedSeriesInk.signedStatus\` (level 2, internal).

**Code.** \`core/theme/ground.ts\` (\`groundSeriesInk\`, before the single-series return); \`vegalite/theme.ts\` (\`applySeriesInk\`, the no-colour-channel walk).

**Tests.** R2: signed bars get the condition with the house's inks; a house without \`selection.signed\` keeps one ink; a signed line is not split.

**Effect on existing themes.** No preset or unthemed chart changes (the Economist preset asks for status, but its signed preview chart already carries a Direction field). 7 house charts change.
`,
    decisions: [
      'Colour follows the sign, not the meaning: IBCS and Opower want “a rise in cost is bad” (red for positive). That is R9 (status polarity), still under discussion.',
      'Aggregated measures (`sum_…`) are skipped; Flint’s bar templates do not aggregate in the encoding today.',
    ],
  },
  {
    id: 'r3',
    label: 'R3 · Dot ink',
    title: 'R3 — A line’s dots never take a colour the house did not name; dot ink is a theme option',
    rule: 'Reviewed as: dots in the series colour is an option for some themes, not something to force. What is fixed by default is only the leak — no dot falls back to the renderer’s default colour, and a hollow dot keeps a visible ring.',
    issue: 'point-visibility',
    doc: `
**Problem.** Two bugs and one missing option.
1. A house that dots its lines writes \`config.line.point\` (size, fill, halo), which carries no colour. On a single-series line the ink is set on the line mark only, so its dots fell back to Vega-Lite's default \`#4c78a8\` — green CFPB lines with blue dots, pink Pop lines with blue dots.
2. \`geometry.point.fill: "hollow"\` turns the fill off, and the halo/outline then wrote a stroke in the *page* colour — the only stroke the dot had — so hollow dots vanished (Government of Canada, IBM Carbon).
3. A house cannot say its dots are not in the series colour (the Economist's black index dot).

**Design.**
- *Leak (default):* when the chart has no colour field, every line is the one series, so \`config.line.point.color\` takes the single ink. Dots on coloured series already followed their line through \`harmonizeLinePoints\`; nothing changes there.
- *Hollow (default):* a hollow dot's ring takes the dot's own ink — the halo/outline stroke is not written when \`filled\` is false, in \`config.line.point\` and on marks that ask for their own points (bump, slope).
- *Option:* \`geometry.point.ink\` (and \`marks.point.ink\`): \`"series"\` (default), \`"text"\` (the house's primary text ink), or a colour. It applies to a line's vertex dots only; a scatter's dots are the series.

**API.** \`ThemeMarks.point.ink\`, \`PointGeometry.ink\`; level 2 \`ResolvedMarks.point.ink\`.

**Code.** \`core/theme/types.ts\`; \`core/theme/ground.ts\` (\`geometryToMarks\`, point resolution); \`vegalite/theme.ts\` (\`applyMarks\` — \`config.line.point\` colour and hollow ring, halo and outline passes; \`harmonizeLinePoints\` — the ink option; \`applySeriesInk\` — single-series dot ink).

**Tests.** R3: single-series dots take the line ink; a hollow dot has no page-coloured stroke; \`ink: "text"\` gives dark dots. The existing preset tests on cartoon's fitted beads and roomy panels pass unchanged.

**Effect on existing themes.** 6 preset charts change visually — the single-series dotted lines (the observed/projected line under Cartoon, Nature, Pop and Power BI; Nature's facet panels) whose dots were Vega blue and now take the house ink. 114 preset charts change in spec only (an unused \`config.line.point.color\` on charts without dotted single-series lines; the rendered SVG is identical). 16 house charts change visually: CFPB, WHO, Kraft Heinz and Liferay dots now in the line ink; Government of Canada and IBM Carbon hollow dots get their ring back.
`,
    decisions: [
      'Single-series dots now default to the line’s ink (the same thing multi-series dots already do). Houses that want dark or neutral dots set `geometry.point.ink`.',
    ],
  },
  {
    id: 'r4',
    label: 'R4 · Readable series text',
    title: 'R4 — Text written in a series’ colour stays readable',
    rule: 'Series names at line ends, area names outside their bands and values matched to a series take the house’s text variant of the ink, or the same hue darkened until it reaches 3:1 against the plot. Labels inside marks choose black or white by WCAG contrast where the house’s usual choice fails 3:1.',
    issue: 'text-ink-contrast',
    doc: `
**Problem.** Series-end labels copy the line's colour scale, so a yellow or pale-grey series names itself in yellow or grey on white (UNHCR, WHO, BBC Audiences, Human Managed, IBCS, Catalyst — 13 houses). Separately, \`readableOn\` picked white or black by the larger *luminance gap*, not by contrast, and put white on yellow and mid-tone fills.

**Design.**
- *Series-coloured text:* a final realization pass, \`applyReadableSeriesText\`, finds synthetic text layers whose colour scale is made of the house's own series inks (so the per-mark white/black label inks are never touched). Each ink under 3:1 against the plot takes \`ink.series.categoricalText[i]\` if the house gives one, else \`readableTextInk(ink, surface, 3)\` — the same hue moved toward black (white on a dark surface) in 5% steps until it passes. The text layer gets its own colour scale (\`resolve.scale.color: independent\`), so the lines and areas keep the house's inks. Reported as \`text-ink-darkened\` with every substitution.
- *Inside labels:* \`readableOn\` keeps the house's usual ink (larger luminance gap — what it always drew) wherever that ink reaches 3:1; only a failing label takes whichever of the two inks contrasts more. This keeps most themes' look and fixes only unreadable labels.

**Default / option.** Default, with the house's own variants as the option.

**API.** \`ink.series.categoricalText\` (text variant per categorical ink); \`contrastRatio\` and \`readableTextInk\` in \`core/theme/presence.ts\` (internal helpers; \`contrastRatio\` moved there from \`ground.ts\`).

**Code.** \`core/theme/presence.ts\`; \`core/theme/types.ts\`; \`core/theme/ground.ts\` (passes \`categoricalText\` through); \`vegalite/theme.ts\` (\`readableOn\`, \`applyReadableSeriesText\`, called at the end of \`realizeThemeVegaLite\`).

**Tests.** R4: pale series names are darkened to ≥3:1 while the lines keep the house inks, with a report; a house's own text variants are used verbatim.

**Effect on existing themes.** 51 preset charts change visually:
- Series names at line ends and area edges darkened where the ink is under 3:1 — Economist cyan \`#3ebcd2→#35a0b3\` and yellow \`#ebb434→#b08727\`, McKinsey light blue and teal, NYT gold and pink.
- Pop: inside labels on its yellow \`#fff200\` go from white (1.1:1) to near-black.
- Power BI (dark): inside labels on its blue go from \`#f3f2f1\` (2.9:1) to \`#1b1a19\` (5.2:1).
`,
    decisions: [
      'The threshold is 3:1 (WCAG for large/bold text and graphics). At 4.5:1 (body text) far more names would darken and lose hue identity.',
      'Inside labels flip from white to dark wherever white fails 3:1. Clear failures: Pop’s yellow (1.1:1). Borderline (2.8–2.99:1), where the house’s own product prints white: Power BI dark’s blue, Datawrapper’s cyan and orange, Cartoon’s blue and Nature’s orange. A threshold of 2.8 would keep those white and still fix the clear failures.',
      'Houses whose guide gives text variants (UNHCR, WHO, ONS, Visa) can now state them in `ink.series.categoricalText`; their new-theme-test themes do not yet.',
    ],
  },
  {
    id: 'r5',
    label: 'R5 · Visible inks',
    title: 'R5 — A series ink too faint against the plot is made visible',
    rule: 'A fill below 1.25:1 against the plot keeps its house colour and gains a 1px edge in a darker shade of its hue; a line below 1.6:1 is darkened in its hue just enough to pass. Houses can move both floors with `ink.series.minContrast`.',
    issue: 'text-ink-contrast',
    doc: `
**How.** The question was how to make a faint ink visible without rewriting brand palettes. Two floors, chosen to catch only near-invisible inks:
- **Fills (bars, wedges, areas, dots): 1.25:1.** A filled mark has an edge, so the fill keeps the house colour and gains a 1px stroke in a darker shade of the same hue (≥2:1). The shape becomes visible; the colour identity stays. Marks the house already strokes (separators, outlines, slice rules) are left as drawn.
- **Lines: 1.6:1.** A line *is* its stroke, so the ink itself is darkened in its hue until it passes — DHL yellow \`#ffcc00\` (1.54:1) moves just enough.
- Normal brand inks are untouched: the Economist cyan (2.1:1), McKinsey light blue and every preset's first inks pass both floors. An accessibility-first house can raise the floors to WCAG's 3:1 with \`ink.series.minContrast: { fill: 3, stroke: 3 }\`.

**Design.** Grounding computes once, per house and surface, which series inks are faint and what replaces them (\`ResolvedSeriesInk.visibility: { stroke, outline }\`). Realization (\`applyVisibleInks\`, before the R4 text pass) swaps line inks and adds a \`stroke\` encoding over the same field to filled marks, and reports only when a mark actually changes (\`faint-ink-darkened\`, \`faint-ink-edged\`). Series-end names still go through R4, so a darkened line's name is darkened to 3:1.

**API.** \`ink.series.minContrast: { fill?, stroke? }\`; level 2 \`ResolvedSeriesInk.visibility\`.

**Code.** \`core/theme/ground.ts\` (\`groundSeriesInk\` now wraps \`groundSeriesInkChoice\` with \`seriesVisibility\`); \`core/theme/types.ts\`; \`vegalite/theme.ts\` (\`applyVisibleInks\`).

**Tests.** R5: a \`#f2f2f2\` bar keeps its fill and gains a ≥2:1 edge with a report; a \`#ffcc00\` line is darkened to ≥1.6:1; a \`#3ebcd2\` line is left alone.

**Effect on existing themes.** 9 preset charts change visually, all lines slightly darkened: Cartoon yellow \`#ffc23c→#f2b839\`, Pop cyan \`#00d9ff→#00cef2\` and gold, Nature's Okabe–Ito yellow \`#f0e442→#d8cd3b\`. 58 house charts change — the genuinely faint inks: TASO's putty fifth ink, MetLife \`#F2F2F2\`, BBC Audiences' greys, DHL yellow, eBay's pale tints, Elastic's light pairs.
`,
    decisions: [
      'Nature’s Okabe–Ito yellow is a canonical colour-blind-safe ink; darkening it to #d8cd3b keeps the hue but departs from the published value. Nature could set `minContrast.stroke: 1.4` to keep it.',
      'Edges are added to every filled mark of a series scale that contains a faint ink (same-colour edges on the inks that pass), which grows those marks by half a pixel.',
    ],
  },
  {
    id: 'r6',
    label: 'R6 · Count palettes',
    title: 'R6 — A house can write a set for an exact number of series',
    rule: 'A house states `ink.series.categoricalByCount: { 2: [...], 3: [...] }`; a chart with exactly that many series takes that set. A house whose guide repeats its colours says `ink.series.repeat: true`. Both are theme options; nothing changes until a theme states them.',
    issue: 'count-palette',
    kind: 'option',
    doc: `
**Problem.** Seventeen houses publish colours by series count: IBM Carbon a fixed set for each of one to five series, Urban Institute an order that changes at six, Trafford orange and gold for two lines but Set2 for three, Visma a lightness-separated pair for two, HDX a reordering at four, Dell a third tier (categorical20) that is not categorical12 extended. ThemeSpec has one ordered list, so a three-series Carbon chart took the first three of the 14-colour sequence. Datadog's guide says colours repeat after six; the theme had to write the cycle out three times and still stopped at eighteen.

**Design.**
- \`categoricalByCount\` is keyed by series count. A chart with exactly that many series takes that set, ahead of \`categorical\` — whatever the general order says. A set with fewer inks than its key is ignored as a typo.
- Counted sets also join \`categorical\` and \`categoricalExtended\` as tiers: a chart past \`categorical\` takes the smallest tier that names every series (Dell: 4, then 12, then 20).
- One series keeps \`single\`; keys below 2 are ignored.
- \`repeat: true\`: past the last ink the palette starts again instead of folding the rest into the overflow grey (R1). Not on a part-to-whole: a pie's first and last slices touch, so a repeated ink would read as one part — pies still fold.
- The choice sits in grounding (\`groundSeriesInkChoice\`), so the legend plan, Vega-Lite, Plotly, R4 text inks and R5 visibility all read the chosen set without change.

**API.** \`ink.series.categoricalByCount?: Record<number, string[]>\`, \`ink.series.repeat?: boolean\`; report \`palette-repeated\`.

**Code.** \`core/theme/ground.ts\` (counted sets, tiers, repeat), \`core/theme/types.ts\`.

**Tests.** R6 in \`tests/theme-colour-rules.test.ts\`: exact counts take their set; a count without a set keeps the general order; a counted set is reached as a tier; repeat cycles a line chart and reports; a pie still folds under repeat; a house stating neither is unchanged.

**Default.** No change: with the new fields stripped, the matrix is identical to the stage before (0 charts change), so this stage's "before" is each theme without the fields.

**Opted in.** IBM Carbon (2–5), HDX (4), Urban Institute (6), Trafford (2), Visma (2), Dell (20) and Datadog (repeat, replacing its hand-written cycle). 22 house charts change; no preset or unthemed chart.
`,
    decisions: [
      'Exact count only: a five-series set is never used for three series, even though it has enough inks — Carbon says the sets apply “if the exact number of data categories is predictable”. A larger counted set is only reached as a tier past `categorical`.',
      'No shipped preset opts in. Candidates: none of the presets publishes count-specific sets today.',
      'Carbon’s two-series gallery charts (warm/cool anomaly) now take Purple 70 + Teal 50, as the count rule says, although another Carbon page shows Cyan 50 + Teal 70 for two series.',
    ],
  },
  {
    id: 'r7',
    label: 'R7 · Mark-family inks',
    title: 'R7 — Lines, areas, bars, pies and dots can each have their own inks',
    rule: 'A house states `ink.series.byMark: { line: { categorical: [...] }, point: { single: "#..." } }`, keyed by generic mark family — never by chart type. A chart whose series are drawn by one family takes that family’s inks. A theme option.',
    issue: 'per-mark-palette',
    kind: 'option',
    doc: `
**Problem.** Fourteen houses give different marks different inks: the Dallas Morning News swaps the pale beige for ocre on 3pt fever lines and uses map pastels for pies; eBay has separate line-graph tokens (“don’t use colours intended for one chart type in another”); the Economist starts scatter plots with cyan and dark red; VTEX draws a single line orange but a single bar teal. ThemeSpec had one \`single\` and one \`categorical\` for every mark.

**Design.**
- **Generic families, not chart types**, as reviewed: \`line\` (line, trail), \`area\`, \`bar\` (bar, rect), \`arc\` (pie, donut), \`point\` (point, circle, square). Families are read from the marks the template actually instantiates (\`ctx.markTypes\`), so a new chart type gets the right family with no change here.
- **One family or none.** Text and rules annotate and are ignored; dots on a line belong to the line. A chart whose series are drawn by two families — bars with a line — keeps the general set, so one series never has two colours.
- A family may state \`single\`, \`categorical\` or both; what it leaves out falls back to the general field. A family's \`categorical\` replaces the general order *and* the count sets (R6) and text variants (R4) written for it — those were written for a different list.
- The family's inks replace the general ones at the very start of grounding (\`forMarkFamily\`), so everything downstream — overflow, R6 counts, R8 bindings, R4 text, R5 visibility, both renderers — reads them unchanged.

**API.** \`ink.series.byMark?: Partial<Record<'line'|'area'|'bar'|'arc'|'point', { single?: string; categorical?: string[] }>>\`.

**Code.** \`core/theme/ground.ts\` (\`seriesMarkFamily\`, \`forMarkFamily\`); \`core/theme/types.ts\` (\`SeriesMarkFamily\`).

**Tests.** R7: a line chart takes the line set; a single line and a single bar take their families' single inks; a scatter takes the point set; a pie with no arc family keeps the general set.

**Fixtures.** No shipped preset states \`byMark\`, so no fixture moves; the matrix with \`byMark\` stripped is identical to the stage before.

**Opted in.** Dallas Morning News (line, arc), eBay (line), The Economist house (point), VTEX (single line and dot). 12 house charts change; no preset or unthemed chart.
`,
    decisions: [
      'The shipped Economist preset could opt in to the scatter order (`byMark.point`) — it would change the preset’s scatter and bubble charts, so it is left for you to decide.',
      'Mixed-family charts keep the general set. An alternative is to give each layer its family’s inks with independent colour scales, at the cost of one series showing two colours.',
      'BBC Audiences’ “every line one teal, named at its end” is not a palette rule (it is closer to `namesOnMarks` with a single ink) and is not addressed here.',
    ],
  },
  {
    id: 'r8',
    label: 'R8 · Value colours',
    title: 'R8 — A value can keep its colour: the chart says which, the house colours roles',
    rule: 'Reviewed: the mapping of particular values to colours is the chart author’s, not the library theme’s. The field annotation states it — `semantic_types: { Party: { semanticType: "Category", colors: { DFL: "#0793AB" } } }` — and it holds with or without a theme. The theme states only role inks — `ink.series.roles: { other, total, missing }` — for values such as “Other”, “Total” or “No data”. A bound value keeps its colour wherever it falls, and no other series in the chart wears it.',
    issue: 'category-color-binding',
    kind: 'option',
    doc: `
**Problem.** Colour followed position, so it followed the order rows arrived in: UNHCR's population types, MinnPost's parties and Morningstar's asset classes changed colour from chart to chart, and “Other” or “Total” took a real hue (Semrush's amber, Finastra's aqua).

**Where the mapping lives (review).** A first version put everything on the theme (\`ink.series.byValue\`). Review: which party is teal is a fact about the data that the chart's author knows; a library theme cannot know a chart's values. So it is split:
- **Chart — \`colors\` on the field annotation**, beside \`sortOrder\`: \`{ semanticType: 'Category', colors: { DFL: '#0793AB', Republican: '#A1000F' } }\`. It travels with the field to every chart that uses it, an agent writes it where it already writes \`sortOrder\` and \`unit\`, and it holds **without a theme** too.
- **Theme — \`ink.series.roles\`**, for the values that play a role in any chart: \`other\` (Other, Others, All other, Rest of world, Remainder), \`total\` (Total, Grand total), \`missing\` (Missing, Unknown, No data, N/A, Not classified). Style, not data — the same in every chart of the house.
- The chart's colour wins over a role ink.

**Design.**
- Matching is on the value, trimmed and case-insensitive (\`core/value-colors.ts\`).
- **Reserved per chart.** A bound colour of a value *present in the chart* leaves the positional palette, so no other series wears it. Nothing is reserved in a chart that holds no bound value (guard case: UNHCR's population-type colours are all six of its palette inks, and a chart of countries still has them).
- \`roles.other\` is also the overflow ink when the house names none, so the R1 tail and a real “Other” share one grey.
- Bound series take no palette place when grounding decides whether the palette, a tier or the fold is needed.
- **Vega-Lite** writes an explicit \`scale.domain\` in the order Vega-Lite itself would use (a stated domain, else the encoding's sort over the view's own rows — Flint's templates use \`sort: null\`, so row order), each value taking its bound colour, else the next palette ink. When another channel sets the order, the palette stays positional and \`value-ink-not-applied\` says why. Without a theme, the same pass runs after assembly with the chart's scheme (minus the bound colours) for the rest.
- **Plotly** (themed) binds pie slices by label and series traces by name.
- R4 treats bound colours as series inks (a light one is darkened for text); R5 checks them for visibility.

**API.** Field annotation \`colors?: Record<string, string>\`; theme \`ink.series.roles?: { other?, total?, missing? }\`; level 2 \`ResolvedSeriesInk.byValue\` (present values only); report \`value-ink-not-applied\`.

**Code.** \`core/value-colors.ts\` (roles, matching, schemes); \`core/field-semantics.ts\` (\`colors\`); \`core/theme/ground.ts\` (bound inks, reserved palette, counts); \`vegalite/value-colors.ts\` (\`discreteDomain\`, \`applyChartValueColors\` for charts without a theme); \`vegalite/theme.ts\` (\`boundPalette\`); \`vegalite/assemble.ts\`; \`plotly/theme.ts\`.

**Tests.** R8: the chart's colours bind case-insensitively; a role value takes the house's role ink; bound colours stay off other values; the chart wins over a role; the written domain matches the rows' order for a pie and a line; the chart's colours hold with no theme; \`roles.other\` becomes the overflow; Plotly pies bind; a chart holding no bound value keeps the whole palette; nothing changes when neither binds.

**Default.** No change: with \`roles\` and annotation \`colors\` stripped, the matrix is identical to the stage before.

**Opted in.** Charts that annotate their field: UNHCR (population types), MinnPost (parties), Morningstar (asset classes). Houses with roles: Semrush (total, other, missing), Finastra and MinnPost (other), Morningstar (other, missing). 15 house charts change visually and 3 only in spec (an explicit domain with the same colours); no preset or unthemed chart in the matrix.
`,
    decisions: [
      'Role words are a short fixed list per role (“Other”, “Rest of world”, “Total”, “No data” …). A real category called “Other” in a chart takes the role ink — the intent for remainders, but a chart can override it with its own `colors`.',
      'Chart colours are honoured by Vega-Lite (with and without a theme) and by Plotly with a theme. ECharts, Chart.js and Plotly without a theme do not read them yet.',
      'Morningstar’s role `other` is its asset-class yellow, so a browser pie’s “Other” slice turns yellow under that house — the role applies to every chart, which is what a role means.',
    ],
  },
  {
    id: 'r10',
    label: 'R10 · Ordered series',
    title: 'R10 — A series whose order the chart declares can take a ramp',
    rule: 'A house says `ink.series.selection.ordered: "ramp"` and may state `ink.series.ordinal` (stops in the order the categories take them); a nominal series whose order the chart declares (`sortOrder` on the field annotation) then samples that ramp instead of distinct hues. A theme option.',
    issue: 'palette-structure',
    kind: 'option',
    doc: `
**Problem.** Palette structure was the widest family of gaps: ordered subcategories in tints of one hue (RADx-UP: “when the subcategory is ordinal use blue gradients”), hue families with shades per group (PatternFly, Sunlight), named sets a chart picks from (Mailchimp's combos), a starting offset (Twilio), monochrome status tints (Finastra). Flint already sampled the \`sequential\` ramp for an \`ordinal\`-typed series, but a Category with a declared \`sortOrder\` (Gold, Silver, Bronze) took unrelated brand hues, and the ramp ran light-to-dark with no way to say which end the first category takes.

**Design — the theme-controlled part.**
- \`selection.ordered: 'ramp'\` makes a nominal series ordered for colour **only when the chart declares its order** (\`sortOrder\` on the field annotation). Orders Flint infers on its own — months, weekdays, compass points — are sequences, not magnitudes, and keep distinct hues (caught by a guard case: “North, South, East, West” matched an inferred sequence).
- \`ink.series.ordinal\` is the ramp for ordered series, its stops in the order the categories take them, so a house says “darkest first” by writing it that way and leaves out stops that sit on its gridline ink. Unset, ordered series sample \`sequential\` as before.
- Default \`categorical\`: no change for any house that does not ask.

**Not in this stage (and why).** The rest of the family is a choice per chart, not a house rule — consistent with the R8 review (the chart says what its data means):
- Mailchimp's “pick a combo per chart” and Twilio's “start anywhere in the sequence” need the chart to name a set or an offset (a chart property), not a theme field.
- PatternFly's and Sunlight's “a shade of the group's hue for each series in a group” need the chart to say which series nest in which group.
- Finastra's “a breakdown of good outcomes in tints of green” needs the chart to say the breakdown is all one status.

**API.** \`ink.series.ordinal?: Ramp\`; \`ink.series.selection.ordered?: 'ramp' | 'categorical'\`.

**Code.** \`core/theme/ground.ts\` (the ordered branch of \`groundSeriesInkChoice\`); \`core/theme/types.ts\`.

**Tests.** R10: a declared order samples the ordinal ramp, first category on the first stop; an undeclared series keeps hues; an inferred sequence (compass points) keeps hues; a declared order keeps hues unless the house asks.

**Default.** No change: with the two fields stripped the matrix is identical to the stage before.

**Opted in.** RADx-UP (Duke Blue tints, darkest first, without the gridline tint). 2 house charts change.
`,
    decisions: [
      'Only an order the chart declares counts. A house that wants months as a ramp cannot get it from this option; the chart would have to declare the order.',
      'Named sets, offsets, group families and status tints are left for a chart-level palette choice (a follow-up for the chart spec, not the theme).',
    ],
  },
  {
    id: 'r12',
    label: 'R12 · Gradient fills',
    title: 'R12 — Areas can fade to their baseline, and lines can carry a wash',
    rule: 'Two geometry options for more expressive houses: `geometry.area.fill: "fade"` runs an area from its ink to clear at the baseline; `geometry.line.wash: "tint" | "fade"` (with `washOpacity`) puts a wash of each line’s own ink beneath it, down to the baseline.',
    issue: 'gradient-fill',
    kind: 'option',
    doc: `
**Problem.** Apple (Stocks), Shopify Polaris, Salesforce and Airbnb's visx gallery draw a soft fill under their lines or fade their areas to clear; Flint had flat area fills only and nothing under a line.

**Design.**
- **Area fade.** \`geometry.area.fill: 'fade'\` gives each area a vertical linear gradient from its ink (at the area's opacity) at the value end to clear at the baseline — horizontal when the area measures along x. One ink: a gradient fill value. Several series: a colour scale cannot carry gradients, so the fill is a condition per value of the colour field, each with that series' gradient, matched to the scale's range in Vega-Lite's own domain order (R8's \`discreteDomain\`); the colour encoding stays for the key and the edge.
- **Stacks stay solid.** Bands in a stack sit on one another; a fade would melt each into the one below. They keep the flat fill and the report \`area-fade-not-applied\` says why.
- **Line wash.** \`geometry.line.wash: 'tint'\` (flat, default 0.12) or \`'fade'\` (gradient, default 0.3), strength \`washOpacity\`. Each line gets an area layer *beneath* it with the same x, y (unstacked) and series, no stroke, no tooltip and \`interactive: false\`, so the pointer and the key still belong to the line (report \`line-washed\`).
- **Which lines.** Mark-generic, not by chart type: a line that reads a quantity on y in x order. No wash for a path drawn in an order of its own (an \`order\` encoding: connected scatter, radar), a closed path, a reversed rank axis (bump), or a line drawn over bars, dots or an area (a trend line, an area's edge, a combo's second measure).
- Runs last in realization, after every colour pass, so it copies the final inks.

**API.** \`geometry.area.fill?: 'solid' | 'fade'\`; \`geometry.line.wash?: 'none' | 'tint' | 'fade'\`, \`geometry.line.washOpacity?: number\`; level 2 \`ResolvedMarks.gradient\`; reports \`area-fade-not-applied\`, \`line-washed\`.

**Code.** \`core/theme/types.ts\`, \`core/theme/ground.ts\` (\`geometryToMarks\`, \`resolveGradient\`); \`vegalite/theme.ts\` (\`applyGradientFills\`, \`fadeFill\`, \`fadeGradient\`).

**Tests.** R12: a single area fades from its ink to clear; stacked bands stay solid with a report; a single line gets a tint beneath it, non-interactive, with no tooltip; several lines each get their own fade, unstacked, with no second key; nothing is drawn for a house that asks for neither.

**Renderers.** Vega-Lite only. Plotly, ECharts and Chart.js ignore the two fields for now.

**Default.** No change: with the three fields stripped the matrix is identical to the stage before.

**Opted in.** Airbnb visx (area fade), Apple (line fade and area fade), Salesforce (line tint), Shopify Polaris (line fade). 18 house charts change visually; 2 only add the stacked-area report.
`,
    decisions: [
      'Stacked areas are never faded, although Airbnb’s gallery shows warm gradients on a stack. Fading each band toward the band below reads as a gap between them; a per-band gradient bounded by its own lower edge is not something Vega-Lite can express.',
      'A wash under several overlapping lines stacks translucent fills; with many series the plot greys out. A cap (wash only up to N series) could be added if a house needs it.',
      'Only Vega-Lite draws the gradients.',
    ],
  },
  {
    id: 'r13',
    label: 'R13 · Pattern fills',
    title: 'R13 — The texture channel draws pattern fills',
    rule: '`marks.redundantChannels: ["texture"]` was accepted and reported unrealisable. It now fills bars, wedges and areas with SVG patterns: each series its own pattern (`vary`), one shared hatch (`hatch`), or the house’s own sequence (`patterns`, where `solid` leaves a flat fill), in lines a darker shade of the ink or white, outlined in that shade.',
    issue: 'pattern-fill',
    kind: 'option',
    doc: `
**Problem.** Visa turns accessibility textures on by default (a diagonal hatch in each fill's darker variant), CFPB's template carries solid, dots and hatch, and Clarity asks for colour *and* pattern on adjacent fills. ThemeSpec accepted \`redundantChannels: ["texture"]\`, but Flint reported it unrealisable and drew flat colour (one of the seven Flint bugs found in the review).

**Design.**
- **Vocabulary.** \`marks.texture: { pattern?: 'vary' | 'hatch', patterns?: TexturePattern[], ink?: 'darker' | 'white', spacing? }\`. \`TexturePattern\` is \`solid | diagonal | antidiagonal | horizontal | vertical | cross | dots\`. \`vary\` (default) runs diagonal, other diagonal, horizontal, vertical, cross, dots; \`hatch\` is one diagonal for every series; \`patterns\` names the house's own order and wins over both.
- **When.** Grounding turns texture on as for the other redundant channels: \`always\` (even one series, as Visa asks), or \`whenNeeded\` when the inks run out. A leading \`solid\` leaves a single series flat, with no outline added.
- **Which marks.** Mark-generic, not by chart type: filled \`bar\`, \`arc\` and \`area\` marks, never lines, points or text. A colour set by condition (signed bars by status) is a choice per bar and is left alone.
- **How.** Vega-Lite has no pattern fill, but SVG paints \`fill="url(#id)"\`. The colour field's \`color\` encoding becomes a \`fill\` whose range is one pattern id per ink, in the same place, so the domain order and the key are kept. A \`stroke\` on the same field is added in the darker shade, and the key merges both, so its swatches carry the patterns. Pattern ids are hashed from their content and travel in \`usermeta.flintPatterns\`.
- **Shared colour.** When a colour encoding is shared by layers (a pie's wedges and their labels), it is moved into each layer that has none first, so the wedges take the patterns and the labels keep their ink. Found by the matrix: the first build gave Visa's pie one hatch for every wedge.
- **Strokes.** The ink outline (\`marks.outline\`, Visa's) becomes the darker shade of each series. A stroke the house draws in another ink, a separator or a slice gap in the surface colour, is kept as it was. Found in review: the first build painted dark outlines over Clarity's white slice gaps.
- **Drawing.** The renderers write the \`<pattern>\` defs into the SVG: \`render\` and the site's view inject them, and the interactive view uses the SVG renderer whenever patterns are present (canvas cannot paint them). The MCP app rasterises its PNG from that SVG.

**API.** \`marks.texture\`, \`TexturePattern\`; level 2 \`ResolvedMarks.redundant.texture: { patterns, ink, spacing }\`; \`CanvasPattern\`, \`readCanvasPatterns\`, \`canvasPatternDefs\`; \`injectCanvasFurnitureSVG(svg, items, patterns)\`.

**Code.** \`core/theme/types.ts\`; \`core/theme/ground.ts\` (\`groundRedundancy\`); \`vegalite/theme.ts\` (\`applyTextures\`); \`vegalite/canvas-furniture.ts\` (patterns); \`vegalite/interactive.ts\`, \`render/index.ts\`; \`flint-mcp/ui/src/render.ts\`; \`site/src/components/VegaLiteView.tsx\`.

**Tests.** R13: each series its own pattern in its own ink with a darker outline; one shared hatch in white; a single series hatched under \`always\`; the house's sequence with a solid entry left flat; a single series left flat when its pattern is solid; a pie keeps each wedge's ink when the colour is shared with its label layer; a slice gap is kept while the ink outline turns darker per series; the defs land ahead of the marks in the SVG; nothing for a house that does not ask.

**Renderers.** Vega-Lite SVG only. ECharts, Chart.js and Plotly ignore the texture for now (ECharts has \`decal\`, a later stage could map to it).

**Default.** No change: with \`marks.texture\` stripped and \`texture\` taken out of the channels, the matrix is identical to the stage before except for the dropped “texture not realizable” report on Visa and CFPB.

**Opted in.** Visa (\`hatch\`, darker; it already asked for texture), CFPB (\`solid, dots, diagonal\` in white; it already asked), Clarity (adds texture: \`solid, diagonal, dots\` in white). 22 house charts change: 10 Visa, 7 Clarity, 5 CFPB, all bars, wedges and areas. Lines, points and text are unchanged (the CFPB line guard).
`,
    decisions: [
      'Airbnb visx ships patterns as an optional kit, so the house is not opted in; its gap is marked addressed by the vocabulary.',
      'Not addressed: eBay hatches only its third series, Red Hat only the “success” portion, Pinterest the missing-data placeholder, and Sonos wants patterns only after its four inks run out (it keeps its tints). A per-series or per-value pattern (like R8’s value colours) would cover the first two; the last two need a missing-data mark and an exhaustion order.',
      'Visa’s hatch also falls on the stacked areas and the pie; its guide says every filled mark.',
      'Wavy lines (Sonos, visx) are not in the pattern set.',
    ],
  },
];

/** The typography fixes: every TypeRole field a theme states is drawn, measured as drawn, or reported. */
export const TYPE_STAGES: Stage[] = [
  {
    id: 't1',
    label: 'T1 · Write every weight and style',
    title: 'T1 — Every weight and slope a role states is drawn',
    rule: 'Grounding resolved each role’s weight and style, but realization wrote only some of them. Now every one is written: the deck’s weight, the axis labels’ weight and style, the axis title’s style, the key labels’ weight and style, a point label’s style, a facet header’s style.',
    issue: 'type-weight-scale',
    kind: 'default',
    doc: `
**Problem.** The theme review found weights and slopes accepted and silently dropped: Catalyst California's and the ONS's decks (\`type.deck.weight\`) came out regular because \`subtitleFontWeight\` was never written; Sunlight's semibold tick labels (\`labelFontWeight\`); MinnPost's bold key; RADx-UP's italic axis titles (\`titleFontStyle\`).

**Design.** Each Vega-Lite property the resolved role carries is written where the role is drawn:
- deck → \`config.title.subtitleFontWeight\`;
- axis labels → \`labelFontWeight\`, \`labelFontStyle\`; axis title → \`titleFontStyle\`;
- key labels → \`config.legend.labelFontWeight\`, \`labelFontStyle\` (both legend configs);
- point-emphasis labels → \`fontStyle\`; facet headers → \`labelFontStyle\`.
- A stated **regular (400)** is not written where Vega-Lite's default is already normal: it draws the same, and writing it only adds an attribute to every label (it turned 600 charts into false “changes” in the first measurement).

**Code.** \`vegalite/theme.ts\` (\`applyTypography\`, \`applyAxes\`, \`applyLegend\`, \`applyFacetChrome\`, point-emphasis labels; \`heavierThanNormal\`).

**Tests.** \`tests/theme-type-rules.test.ts\` — T1: deck weight and style, axis label weight and style, axis title style, key label weight and style are written; nothing new is written for a house that states none.

**Effect on existing themes.** One shipped preset: **Pop** states \`deck.weight: "bold"\`, so its decks are now bold (no preview case has a deck, so the matrix shows it as spec-only; the Pop case shows it drawn). 124 house charts change, across the 11 houses that state a weight other than regular, or a slope: Catalyst California, Sunlight, RADx-UP, Twilio Paste, Urban Institute, Dallas Morning News, MinnPost, BBC Audiences, ONS, Human Managed and TASO. No chart without a theme changes.
`,
    decisions: [
      'Pop’s decks become bold, as its preset states. If that was never intended, the preset should drop `deck.weight`.',
      'Measured as drawn: key labels are also measured in their weight and slope since T3 (the legend layout used to measure every key as regular).',
    ],
  },
  {
    id: 't2',
    label: 'T2 · Weight scale',
    title: 'T2 — The whole weight scale, thin to black',
    rule: '`TypeRole.weight` takes the full CSS scale — `thin` (100), `extralight`, `light`, `regular`, `medium`, `semibold`, `bold`, `extrabold`, `black` (900) — or the number itself. A theme option: the four old names mean what they meant.',
    issue: 'type-weight-scale',
    kind: 'option',
    doc: `
**Problem.** \`TypeRole.weight\` stopped at \`regular\` at the light end and \`bold\` at the heavy end. Visa's and Baltimore's light headlines, Finastra's and Morningstar's light labels, Human Managed's light axis text, Airbnb's 200-weight tick labels and Urban Institute's Lato Black headline could not be stated; the houses wrote the nearest name.

**Design.** Names for every step of the CSS scale, and numbers (rounded to the nearest hundred, clamped to 100–900). Grounding resolves both to the number (\`fontWeightOf\`); every renderer already takes a numeric weight. A face that has no such weight loaded falls back to the nearest it has — proprietary faces are not loaded here.

**Fonts on these pages.** The review and new-theme-test pages now share one font loader (\`site/src/playground/house-fonts.ts\`) that also fetches the light and black weights of the open-licence house faces (Lato 300/900, Roboto 100/300/900, Open Sans 300/800, Montserrat, Poppins and Nunito Sans 300), so the before/after shows the weights rather than a fallback.

**API.** \`TypeWeight\`: \`'thin' | 'extralight' | 'light' | 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold' | 'black' | 100 … 900\`.

**Code.** \`core/theme/types.ts\`, \`core/theme/ground.ts\` (\`fontWeightOf\`).

**Opted in.** Visa, Baltimore (light headlines), Finastra (light key and value labels), Human Managed (light axis text), Morningstar (light everywhere), Airbnb (extralight ticks), Urban Institute (black headline). Each case's “before” is the house as it was written, with the nearest old weight. 110 house charts change, all in the seven houses opted in; no preset or unthemed chart.
`,
  },
  {
    id: 't3',
    label: 'T3 · Case',
    title: 'T3 — The case a role asks for is drawn, and measured as drawn',
    rule: '`TypeRole.case` — `upper`, `lower`, `title`, the new `sentence`, or `asIs` — was accepted and never read. It is now applied to the headline, deck, axis titles, axis labels, key labels, series names at line ends and facet headers, before any of them is measured.',
    issue: 'type-case',
    kind: 'default',
    doc: `
**Problem.** Dallas Morning News, WWF and USAID set headlines in capitals, Microsoft its decks, RADx-UP its axis titles, Urban Institute, Mailchimp, MetLife, Pearson and Government of Canada title-case their headlines — and every one came out as the author typed it. Human Managed's “title case for the title, sentence case for the rest” had no sentence case to ask for.

**Design.**
- **Cased where it is measured.** Capitals are wider. The headline and deck are cased in the title plan before they are fitted (\`planTitle\`); axis titles once in the layout plan, so the same string is measured, moved into a deck and drawn; band labels before they are wrapped (\`planBandLabels\`); key labels by the legend plan, which now measures in the case, weight and slope it draws (\`KeyStyle.labelCase\`).
- **Drawn.** Strings Flint writes are cased directly. Labels the renderer draws from data are cased by an expression: \`upper(datum.label)\`, \`lower(…)\`; **title** case looks each known value up (an expression cannot split words) and falls back to sentence case; a lookup Flint already wrote for wrapped labels has only its fallback cased. Series names at line ends get a cased field. Plotly cases the text it marks up, never the markup.
- **Rules.** \`title\`: each word capitalised, short joining words (of, the, and, in …) kept lower-case inside the phrase, the rest of each word as written (acronyms survive). \`sentence\`: the first letter capitalised, the rest as written — it does not lower-case, so proper nouns and acronyms survive. Value labels print numbers; a case stated on them is reported (\`case-not-applied\`).
- Follow-up to T1: key labels are now measured in their stated weight and slope too, so a bold key that no longer fits one row breaks into columns (MinnPost).

**API.** \`TypeRole.case\` gains \`'sentence'\`; \`ResolvedText.textCase\`; \`core/text-case.ts\` (\`applyTextCase\`, \`textCaseExpr\`, \`caseLabelExpr\`).

**Code.** \`core/text-case.ts\`; \`core/title-plan.ts\`; \`core/plan.ts\`; \`core/compute-layout.ts\`; \`core/legend-plan.ts\`, \`core/legend-layout.ts\`; \`vegalite/theme.ts\` (\`applyTypeCase\`, series-end names); \`vegalite/key-layout.ts\` (\`vlCaseKeyLabels\`); \`plotly/theme.ts\` (\`styleText\`).

**Tests.** T3: the case rules; headline and deck; axis titles; key labels by expression; title-cased category labels by lookup; nothing changes for a house that states none.

**Effect on existing themes.** One shipped preset: **Pop** states \`headline.case: "upper"\`, so every Pop headline is now in capitals, fitted as capitals. 139 house charts change across 12 houses: Dallas Morning News, WWF, USAID OHA, Urban Institute, RADx-UP, MetLife, Microsoft, Human Managed, Mailchimp, Pearson, Government of Canada and MinnPost (its bold key, now measured bold). No chart without a theme changes.
`,
    decisions: [
      'Pop’s headlines become capitals (59 preview charts). That is what the preset states; if it was not meant, the preset should drop `headline.case`.',
      '`sentence` capitalises the first letter and leaves the rest as written, rather than lower-casing it — Flint cannot tell “US” from “Us”.',
      'Title case of data labels is a lookup over the values Flint sees; values it never saw (an interaction adding data) fall back to sentence case.',
    ],
  },
  {
    id: 't4',
    label: 'T4 · Unread roles',
    title: 'T4 — The roles nothing read are drawn where Flint has their text, or reported',
    rule: '`type.display` sets a KPI’s big number (its size stays fitted to the tile); `type.annotation` sets a statistic’s note; `type.footnote`, which Flint never draws, is reported.',
    issue: 'type-weight-scale',
    kind: 'default',
    doc: `
**Problem.** Three \`ThemeType\` roles were accepted and read by nothing: \`display\` (15 themes state it, including the Apple and Power BI presets), \`annotation\` and \`footnote\` (most houses state them).

**Design.**
- **display.** A template marks its display figure (\`__textRole: 'display'\`); the KPI card marks its big number. The role gives it the house's family, weight, slope and ink. Its **size stays the one the template fitted** to the tile — a stated 40px number would overflow a small card.
- **annotation.** A statistic's note (\`annotation.statistics\`) takes the annotation role when the house states one, instead of borrowing the axis labels'.
- **footnote.** Flint draws no footnote or source line, so the role is reported (\`role-not-drawn\`) rather than silently ignored; a host page that prints one can read it from the theme.

**Code.** \`core/theme/ground.ts\` (annotation, display, footnote report); \`core/theme/types.ts\` (\`DesignDecisions.display\`); \`vegalite/templates/kpi-card.ts\`; \`vegalite/theme.ts\` (\`applyDisplayType\`).

**Tests.** T4: a statistic's note in the annotation role; a KPI number in the display role at the size the tile fitted; the footnote role reported.

**Effect on existing themes.** Shipped presets: the KPI cards of **Apple**, **Power BI** and **Power BI Light** take their display role. Every theme that states \`footnote\` gains one report entry (spec only). Visually: three preset KPI cards (Apple, Power BI, Power BI Light) and MetLife’s and Aviva’s KPI cards. The footnote report changes 944 house charts and 66 preset charts in spec only. No chart without a theme changes visually (its KPI card gains the display marker in spec).
`,
    decisions: [
      'The display size is ignored in favour of the tile fit. A theme that wants its size honoured would need the tile to grow, which is a layout decision.',
      'The KPI card’s caption has no role; MetLife’s guide gives it one (a label above the number). A `displayLabel` role would be the place.',
    ],
  },
];

/** The header: the canvas edge, the line above the headline, and what sits beside it. */
export const FURNITURE_STAGES: Stage[] = [
  {
    id: 'f1',
    label: 'F1 · The canvas edge',
    title: 'F1 — “Top of the canvas” is the canvas’s top edge',
    rule: 'Furniture says where it sits — `at`: `canvasTop`, `aboveTitle`, `besideTitle`, `belowTitle` — and what it is measured against — `frame`: `canvas` (the exported graphic’s outer edges), `content` (inside the margin, where the headline starts) or `block` (the plot with its labels). A rule on `canvasTop` runs the canvas’s top edge at y = 0. The header is planned before the title, and its height comes out of the plot.',
    issue: 'brand-rule',
    kind: 'default',
    doc: `
**Problem.** Furniture had two mechanisms and no words for *where*. The masthead tab was drawn after render at the top-left *inside the margin*, and the canvas grew to hold it; \`headerRule\` was one fixed thing — a rule between the title and the plot, as wide as the plot block. So the Economist's “thin red line across the top edge, the tab at its left end” came out as a rule under the deck, and UNHCR's top bar the same. Nothing told the title plan the header was there.

**Vocabulary.**

\`\`\`
y=0 ┌─────────────────────────────────────────┐ ← canvasTop    rules, bands, tabs on the edge
    │  FIGURE 1                       [logo]  │ ← aboveTitle   figure label, wordmark, logo (pushes the title down)
    │  Headline, fitted to what is left [logo]│ ← besideTitle  level with the headline (takes its width)
    │  Deck                                   │
    │  ─────────────────────────────────────  │ ← belowTitle   a rule over the plot block (the old headerRule)
    │  plot block …                           │
\`\`\`

- **Frames**: \`canvas\` — the exported graphic's outer edges; *the canvas top is y = 0, outside the margin*. \`content\` — inside the margin; the headline's left edge. \`block\` — the plot with its axes and labels (only a rule below the title spans it).
- **Kinds**: \`rule\` (a line across its frame), \`band\` (a filled strip), \`tab\` (a short block), \`text\`, \`image\` (inline \`svg\` or a \`src\`), each with \`align: start | end\`, size, colour and an optional \`href\`. The earlier names still work: \`mastheadTab\` = a tab above the title at the content's start; \`headerRule\` = a rule below the title across the block; \`footerRule\` unchanged.

**Design.**
- **Planned before the title** (\`core/header-plan.ts\`): the edge band's height, the line above the headline, the width taken beside it, and each piece placed against its frame.
- **Space comes out of the plot**, as a broken title's does: the canvas the caller asked for holds. (The tab used to grow the canvas; Economist charts were 20px taller than asked.)
- **Drawn on the canvas after render** — Vega-Lite cannot place a mark in the margin — as the tab already was, but now against the canvas's own edges, resolved at the width it renders at: a rule with \`left: 0, right: 0\` spans whatever width that is. One resolver serves the static SVG export, the interactive view, the site's view and the MCP app's PNG; the theme matrix draws it too, so header changes show as visual changes.

**API.** \`ThemeFurniture\`: \`kind\`, \`at\`, \`frame\`, \`align\`, \`width\`, \`height\`, \`color\`, \`text\`, \`type\`, \`svg\`, \`src\`, \`href\`, \`alt\`; types \`FurnitureZone\`, \`FurnitureFrame\`. \`CanvasFurnitureItem\` gains \`left\`/\`right\`, text, image and link fields; \`placeCanvasFurniture\`, \`appendCanvasFurniture\`, \`svgDataUri\`.

**Code.** \`core/header-plan.ts\` (new); \`core/plan.ts\` (header before the title, its room out of the plot); \`core/rule-plan.ts\`; \`vegalite/theme.ts\` (\`applyHeaderFurniture\`); \`vegalite/canvas-furniture.ts\`; \`vegalite/assemble.ts\`; \`vegalite/interactive.ts\`; MCP app (\`ui/src/render.ts\`); site \`VegaLiteView\`.

**Tests.** \`tests/theme-header.test.ts\` — F1: a rule on the edge spans the canvas and a tab hangs from it flush with the headline; the band comes out of the plot; the earlier masthead tab keeps its place; a span resolves to any canvas width.

**Effect on existing themes.** The shipped **Economist** preset now draws the red line on the canvas's top edge with the tab hanging from it, and its plots give the 12px band rather than the canvas growing 20px — every Economist chart changes (59 preview charts). The Economist and UNHCR houses move their top rules to the edge. No other preset, no unthemed chart.

**Revised later.** The thin red line was taken out of the Economist preset and house: the current Economist web charts draw only the tab on the top edge. The vocabulary (a \`rule\` at \`canvasTop\`) is unchanged and UNHCR still uses it. The before/after above was measured with the line.
`,
    decisions: [
      'The Economist preset changes: a 1px red rule on the canvas edge, edge to edge, and the 44×12 tab hanging from it, flush with the headline (content frame) rather than at the canvas’s very left edge. Say if the tab should sit at x = 0 instead (`frame: "canvas"`).',
      'Header height comes out of the plot, so Economist plots are 12px shorter and the canvas is the size asked for (it used to be 20px taller).',
      'Header pieces draw after render: a chart rendered with plain vega-embed does not show them (as with the tab before).',
    ],
  },
  {
    id: 'f2',
    label: 'F2 · Above the headline',
    title: 'F2 — A figure label, wordmarks and logos above the headline',
    rule: 'The chart’s `label` (“Figure 2”, a kicker) is set above the headline in a new `type.kicker` role. Themes add `text` (a wordmark) and `image` (a logo, from inline SVG or an image, optionally linked) to the line above the title, at its start or end. The line pushes the title down.',
    issue: 'figure-number',
    kind: 'option',
    doc: `
**Problem.** Cato, RADx-UP, Urban Institute, UNHCR and CFPB number their figures above the title; Sonos heads every graphic with its wordmark, WWF and others with a logo. The chart spec had only \`title\` and \`subtitle\`, \`ThemeType\` had no role for the line, and furniture had no text or image.

**Design.**
- **Content and style apart.** The words are the chart's: \`chart_spec.label\`. How they look is the house's: \`type.kicker\` (family, size, weight, case, colour; else the deck's type). A label is drawn with no theme too.
- Pieces on the line above the headline sit from the content's start (the label first) or its end, sharing a baseline at the line's foot; the line's height and a small gap push the title down, out of the plot.
- \`image\` takes inline \`svg\` (drawn as a data URI) or a \`src\` URL, at a stated size, with an \`alt\` and an optional \`href\`; \`text\` takes the house's type. Any piece can link.
- Real logos are trademarks and are not committed: the review uses a file dropped into the gitignored \`new-theme-test/logos/\` folder (SVG or PNG) when present, and a labelled placeholder of the same size otherwise.

**API.** \`chart_spec.label\`; \`type.kicker\`; furniture \`text\` and \`image\` (\`svg\`, \`src\`, \`alt\`, \`href\`).

**Tests.** F2: a figure label above the headline in the kicker role (cased); a label with no theme; a logo from inline SVG at the end with a link, a wordmark at the start.

**Opted in.** Kicker roles: Cato, RADx-UP, Urban Institute, UNHCR (the figure labels are in the cases — no preview chart has one). Sonos wordmark; WWF logo (real file if present locally, else a placeholder). 31 house charts change (Sonos and WWF); no preset or unthemed chart.
`,
  },
  {
    id: 'f3',
    label: 'F3 · Beside the headline',
    title: 'F3 — What sits beside the headline takes its width, and the title is fitted to the rest',
    rule: 'A piece at `besideTitle` sits level with the headline at its start or end; the title plan fits the headline to the width that is left (and moves the title over by a piece at its start). Where that would leave the headline too little room, the piece moves to the line above. `layout.titleBlock.frame: "plot"` starts the title at the plot’s edge instead of the content’s.',
    issue: 'brand-mark',
    kind: 'option',
    doc: `
**Problem.** Sunlight puts its logo top-right, “across from the title”; nothing could sit beside a headline without the headline running under it, because the title was fitted to the whole width. Justice Innovation Lab starts its title where the x axis starts, past the row labels; Flint always started it at the content's edge.

**Design.**
- The header plan totals what sits beside the headline at each end (with an 8px gap); the title plan fits the headline and deck to the block less that; Vega-Lite moves the title over by the start's share (\`title.dx\`).
- **Too narrow to share**: when the headline would be left under 180px (or under three quarters of the block on a small chart), the pieces move to the line above the title, and the report says so (\`header-moved-above-title\`).
- \`layout.titleBlock.frame: "plot"\` writes Vega's \`group\` title frame: the headline and deck start at the plot's left edge.

**API.** \`at: "besideTitle"\`; \`layout.titleBlock.frame: "content" | "plot"\`; report \`header-moved-above-title\`.

**Tests.** F3: the headline is fitted to the block less the logo and its gap; a piece at the start moves the title over; a logo that would squeeze the headline moves above it; \`frame: "plot"\` writes the group frame.

**Opted in.** Sunlight (logo beside the headline, linked; real file if present locally, else a placeholder), Justice Innovation Lab (title from the plot's edge). 35 house charts change; no preset or unthemed chart.
`,
    decisions: [
      'The 180px floor for a headline beside a logo is a guess; a house could state its own if needed.',
      'The title frame applies to the title only; the line above the title still starts at the content’s edge.',
    ],
  },
];

export interface Area {
  id: string;
  label: string;
  title: string;
  intro: string;
  /** Markdown under the overview table: what the area's stages add up to. */
  note: string;
  stages: Stage[];
}

/** The value-label fixes: a label is measured as printed, and a bar and its label are laid out together. */
export const LABEL_STAGES: Stage[] = [
  {
    id: 'l1',
    label: 'L1 · Measured as printed',
    title: 'L1 — Value labels are measured as they are printed',
    rule: 'Every decision about a value label — whether it fits a band, a bar or a segment, where a short bar’s label moves outside, how much room is kept past a bar’s end — uses one measurement: the printed string (format and unit), in the label’s font, weight, slope and case, from the width table (or the host’s measurer). Inside a bar the label is checked against the bar, not the band; along a vertical bar against a line of text; and each bar against the axis as drawn.',
    issue: 'value-label-placement',
    kind: 'default',
    doc: `
**Problem.** Four different guesses sized value labels, and none was the label as drawn:
- grounding: \`0.62 em × characters + 12px\` (the fit checks, the inside/outside split);
- the plan: \`0.8 em × characters + 8px\` (room past a horizontal bar's end);
- realization: \`0.62 em\` of the rounded integer for pie labels;
- weight and case were ignored.

Digits are about half an em, so most labels were judged 20–40% wider than they print. The BBC case lost the labels of its four shortest bars: judged too wide for the bar, they moved outside. Grouped and signed charts whose house prints labels "when they fit" printed none.

**Design.**
- **One measurement** (\`core/value-label-measure.ts\`). A label is \`printValue(value, format, unit)\` (a currency before, a word unit after a space), cased as the role says, measured in its font, weight and slope.
- **Glyphs, not Vega's estimate.** A value label is a text mark Vega-Lite never lays out, so its room is its glyph width. In Node, Vega estimates 0.8 em a character; the labels use the width table calibrated to a canvas (or a host's measurer), in every environment.
- **Where the room is.**
  - *Along* a horizontal bar: the label plus 5px at each end.
  - *Along* a vertical bar: a line of text plus the same.
  - *Across* a bar (a stacked segment, a dodged bar printed at the mark, a single bar's inside label): the label plus 2px each side, against the **bar's** width (band × band fraction). It used to be the whole band.
  - *Over* dodged bars: the label plus a 4px gap, against the slot.
- **The inside/outside split is measured bar by bar against the drawn axis.** That is the ruler's domain (or the data rounded as Vega-Lite rounds it) over the plot's length. The split falls at the shortest bar that still holds its own label; no split is drawn when every bar holds its label.

**API.** No ThemeSpec change. Level 2: \`ValueLabelPlan.insideFit\`. New module \`core/value-label-measure.ts\` (\`printValue\`, \`measureValueLabels\`, \`insideMinValue\`, \`LABEL_GAP\`, \`LABEL_INSET\`, \`LABEL_SIDE\`).

**Code.** \`core/value-label-measure.ts\` (new); \`core/theme/ground.ts\` (the fit checks); \`core/value-label-plan.ts\` (\`fitInsideLabels\`, the measured inset); \`core/plan.ts\` (the fit after the rulers); \`vegalite/theme.ts\` (the split threshold, the pie labels).

**Tests.** \`tests/value-label-rules.test.ts\`, L1:
- the format, unit and case are printed;
- the measurement follows the weight;
- the shortest bar that holds its own label is found against the drawn axis, along horizontal bars by width and vertical bars by line height;
- short bars keep their labels inside where they fit.

Changed tests:
- A grouped bar's inside label is checked against the bar (a NYT 21px bar holds "13").
- The pyramid clearance test measures text as a browser does: Vega's Node estimate bounds digits at 0.8 em, wider than they draw.

**Effect.**
- 197 charts change, 114 visually.
- **No chart without a theme is drawn differently.** Two gain the value-label control.
- **Shipped presets:** 45 charts across Economist, NYT, Pop, Power BI (both), McKinsey, Nature, Swiss, Datawrapper and Cartoon. Inside/outside splits move to where the labels really stop fitting; pyramid labels sit closer; labels a house prints "when they fit" now print on grouped medals and the temperature anomaly.
- **Houses:** 69 charts in 24 houses.
- **Control only:** 78 charts only gain the value-label control (\`_options\` applicable).
`,
    decisions: [
      'Measured, labels can now sit with 2px of air across a bar; a house that wants a roomier look inside bars has no option for it yet.',
      'The unthemed monthly-revenue chart still withholds its labels: "2.41M" is 31px in a 28px band. Measurement alone cannot fix it; L3 lets the band make room.',
      'The inside/outside mix is unchanged in kind (Economist population: two bars still print outside). Making every label consistent is L4.',
    ],
  },
  {
    id: 'l2',
    label: 'L2 · Room past the bar end',
    title: 'L2 — The room past a bar’s end is the label’s, in px, inside the plot',
    rule: 'A label printed past a bar’s end is given exactly its own room, and that room comes out of the plot rather than a wider canvas. Above a column: a line of the label’s text and the gap, converted through the plot’s drawn height. Past a horizontal bar: the measured label width and the gap. A label that moves past a short bar adds margin only for what it actually overruns.',
    issue: 'value-label-placement',
    kind: 'default',
    doc: `
**Problem.** The room past a bar's end was sized without the label:
- **Columns:** the value scale extended by a flat 15% of its range. That was too little on a short plot and too much on a tall one, where the bars shrank for nothing.
- **Horizontal bars:** the measured room (L1) was kept inside the plot only when the spec stated a numeric \`width\`. Most charts state a step or nothing, so the canvas grew by 3 em instead, wider than the size asked for.
- **Moved labels:** when a short bar's label moved outside, the canvas grew by two lines of text, whether or not the label came near the edge.

**Design.**
- **Columns.** With \`p\` added past each of \`n\` labelled ends over a span \`a\`, each pad takes \`p / (a + n·p)\` of the plot. Setting that share to \`(line + gap + 2px) / height\` gives \`p = share·a / (1 − n·share)\`. The height is the plot's drawn height after the title. If one line at each end would take half the plot, it falls back to 15%. The ruler still rounds the end up to a tick where the house rules a grid.
- **Horizontal bars.** The plan's width is used when the spec states none (\`config.view.continuousWidth\`), so the measured room is kept inside the plot. The canvas keeps its size; the ruler was already planned on the shorter length.
- **Moved labels.** The plan measures where each moved label ends: bar end + gap + width (or line height). Only what runs past the plot's edge is added, on that side (the far side for negative bars, flipped on a reversed scale).

**API.** No ThemeSpec change. Level 2: \`ValueLabelInputs.lengths\`, \`ValueLabelPlan.insideFit.overflow { end, start }\`.

**Code.** \`core/value-label-plan.ts\` (\`headroomPad\`, the overflow in \`fitInsideLabels\`); \`core/plan.ts\` (passes the drawn lengths); \`vegalite/theme.ts\` (the plot width for the inset, the measured padding).

**Tests.** L2:
- a column chart's headroom follows the plot's height (smaller than 15% on a tall plot, larger on a short one);
- a horizontal bar's measured room is kept inside the plot, with no extra canvas;
- a label moved past a short bar adds no margin.

**Effect.**
- 120 charts change, all visually.
- **No chart without a theme changes.**
- **Shipped presets:** 42 charts across Cartoon, Datawrapper, Economist, McKinsey, Nature, NYT, Pop, Power BI (both) and Swiss. Taller columns with less empty space above; horizontal charts that no longer grow past their canvas.
- **Houses:** 69 charts in 28 houses.
- **Earlier cases moved:** 9 cases from the colour, type and furniture areas.
`,
    decisions: [
      'Columns keep 2px more than the line and gap, and nothing more: a house that wants more air above its tallest column cannot ask for it yet.',
      'With a ruled grid the scale still rounds up to the next tick, so the headroom there is often larger than the line.',
    ],
  },
  {
    id: 'l3',
    label: 'L3 · The band holds its label',
    title: 'L3 — A band too narrow for its labels is laid out again',
    rule: 'A bar and its label are laid out together. When a label is wider than its band (or its bar, or its slot among grouped bars), Flint first shortens the number (1,234,567 → 1.23M) where the house has not said how thousands are written; then widens the bands into the canvas’s spare room; and only then withholds the labels, saying how wide the bands would have to be.',
    issue: 'value-label-placement',
    kind: 'default',
    doc: `
**Problem.** The band step was settled before anyone asked about labels. Grounding then checked whether the labels fit the band they had been given, and withheld them when they did not. IBCS prints every value and drops the value axis; its temperature-anomaly decades were 21px, "−0.27" is 27px, so it printed nothing and the compiler restored a grid. Nothing ever asked whether the band could simply be wider.

**Design.** The remedies run in order:
1. **Shorten the number.** Only where the house leaves \`annotation.numberFormat.thousands\` open, the value is not a share or a normalized stack, and the magnitude reaches 1,000. The format becomes the SI one the label format chooses (three significant digits where they keep values apart). Reported as \`value-labels-shortened\`. A house that writes \`thousands: "separator"\` keeps its separator.
2. **Widen the bands.** Grounding states the band its labels need (\`dataLabels.bandNeed\`):
   - a line of text across a horizontal bar's band;
   - the label over a single bar;
   - the label and a gap over a grouped bar, times the series;
   - the label across a stacked or inside bar, over the band fraction.

   The plan measures the canvas less its furniture (the same reserve measurement it uses to fit bands) and lays the plot out again with that step as the floor (\`labelStep\`). Up to three passes, because a label whose type grows with the plot can need a little more once the plot is wider. Reported as \`band-widened-for-labels\`, with the step and plot before and after.
3. **Withhold.** When the canvas cannot hold the wider plot, or the passes do not settle, the chart keeps its bands. The report (\`value-labels-band-full\`) says how wide the bands would have to be.

Only width is remedied: too many marks to read, or segments too thin for a line of text, are not a band's fault and stay as they were. Panels and composite templates keep their bands.

**API.** No ThemeSpec change.
- Level 2: \`ResolvedDataLabels.bandNeed\`.
- \`AssembleOptions.labelStep\` (internal, set by the plan).
- Reports \`value-labels-shortened\`, \`band-widened-for-labels\`, \`value-labels-band-full\`.

**Code.** \`core/theme/ground.ts\` (the shortening, \`bandNeed\`); \`core/plan.ts\` (\`widenBandsForLabels\`, the passes); \`core/compute-layout.ts\` (\`labelStep\` as a step floor); \`core/types.ts\`.

**Tests.** L3:
- the bands widen into spare room and the labels print;
- with no room the labels are withheld and the report gives the band needed;
- a number with open thousands is shortened before anything widens;
- a house's separator is never shortened.

**Effect.**
- **Drawn differently:** 10 house charts. Stacked electricity mixes (Baltimore, BBC Audiences, Cato, London City Intelligence, WHO, WWF), temperature anomalies (IBCS, RADx-UP, Sprout Social) and Baltimore's projection bars widen by 2–10px a band and print their values.
- **Report only:** 38 charts gain the reason their labels are withheld.
- **No shipped preset and no chart without a theme** is drawn differently. The default layout already fills most of the canvas, so the room is usually a few px.
`,
    decisions: [
      'Shortening applies only where the house leaves thousands open. Most shipped presets state a number format, so in practice it is the unthemed and the format-silent houses that shorten.',
      'Widening never grows the canvas past the size asked for. A chart with no spare room withholds its labels with a reason, rather than growing; an option to grow (or to thin the labels) is open.',
      'The label type that grows with plot width (the type-scale drift the review noted) makes the need a moving target; it settles in at most three passes, else nothing is widened.',
      'Unthemed charts carry no report, so their withheld labels are still silent; the reason is only in the decisions.',
    ],
  },
  {
    id: 'l4',
    label: 'L4 · Inside placement',
    title: 'L4 — Inside labels: the ink of labels that move out, and where they sit',
    rule: 'A label moved past a short bar sits on the plot, so it takes an ink that reads there (not the white it had inside), and drops the per-series inside ink. Three options: `dataLabels.anchor` (`end`, `start`, `middle`) says where an inside label sits along its bar; `dataLabels.fallback: "allOutside"` prints every label past its bar once one bar is too short; `dataLabels.minContrast` raises the 3:1 floor an inside label keeps with its bar.',
    issue: 'value-label-placement',
    kind: 'default',
    doc: `
**Problem.**
- **Moved labels drawn in the inside ink.** When a short bar's label moved outside, it kept the ink chosen for inside the bar:
  - BBC's and WWF's white labels landed on the white page and vanished;
  - on Power BI's dark ground, the per-series inside ink (dark on the light blue bars) was copied onto the moved labels, which disappeared too.
- **No anchor.** Justice Innovation Lab prints its values flush at the bar's base, reading as one column. Flint only had the value end, and its short bars zigzagged outside.
- **No consistent fallback.** A house that would rather every label read alike could not say "if one moves, all move".
- **No contrast floor of its own.** JIL prints black on its orange; white there is 3.15:1, which passes Flint's 3:1 floor (R4).

**Design.**
- **Moved labels** take the label's ink where it reads on the plot at 3:1, else the text ink that does. They drop the per-series colour encoding; \`matchSeries\` keeps its series inks. *(Default.)*
- **\`dataLabels.anchor\`.** \`start\` places the label at 0 on the bar's own scale (a \`calculate\` column, titled like the bar so the shared axis keeps its title), aligned to read toward the value end, mirrored for negatives and on a reversed scale. \`middle\` places it at half the value, centred. A bar too short for its label still moves it past the end. An aggregated measure keeps \`end\`.
- **\`dataLabels.fallback: "allOutside"\`.** Decided before the rulers, on the data's extent rounded as Vega-Lite rounds it, so the room past the bar ends (L2) is planned for every label. Reported as \`value-labels-all-outside\`.
- **\`dataLabels.minContrast\`** (default 3): the floor \`contrastWithMark\` keeps, per series and for a single ink.
- Realization now reads inside or outside from the plan, so a plan that moved every label out draws them all in the plot's ink.

**API.** \`ThemeDataLabels.anchor\`, \`fallback\`, \`minContrast\`; level 2 \`ResolvedDataLabels.anchor | fallback | minContrast\`; report \`value-labels-all-outside\`.

**Code.** \`core/theme/types.ts\`, \`core/theme/ground.ts\`; \`core/value-label-plan.ts\` (\`someLabelsOverrun\`, \`outside\`); \`core/plan.ts\`; \`vegalite/theme.ts\` (\`anchorGeometry\`, the moved layer's ink, \`readableOn\` with a floor).

**Tests.** L4:
- a moved label is not white and carries no series ink;
- \`minContrast: 4.5\` turns white-on-orange black;
- \`anchor: "start"\` places labels at 0, aligned left, keeping the bar's axis title; \`middle\` centres them;
- \`allOutside\` prints every label past its bar once one is too short, and keeps them inside when every bar holds its own.

**Renderers.** Vega-Lite. Plotly keeps its own \`textposition\` and ignores the three options for now.

**Effect.**
- **Default (the moved-label ink):** 7 charts, 2 shipped presets (Power BI and Power BI Light, temperature anomaly) and WWF's population charts. No chart without a theme.
- **Opted in:** Justice Innovation Lab (\`anchor: "start"\`, \`minContrast: 4.5\`), 5 charts.
`,
    decisions: [
      'At JIL’s bold 22.5px, Bangladesh’s “173” is still a few px too wide for its bar and prints past its end; the guide squeezes it in.',
      'No house is opted into `fallback: "allOutside"` — none of the guides states it; the Economist case shows it on request.',
      'A moved label keeps the house’s label ink when it reads on the plot at 3:1, even if the house picked it for inside the bars.',
    ],
  },
  {
    id: 'l5',
    label: 'L5 · Segments and rings',
    title: 'L5 — A stacked segment and a donut ring hold their labels, or let them go',
    rule: 'A label inside a stacked segment has to fit both ways: across the bar, a line of text (a horizontal bar’s thickness, not its band); along the bar, the label’s own width on a horizontal stack, measured per value. A donut’s labels sit on the middle of its ring when the ring is as thick as the widest label; a thinner ring sends them outside it, in the plot’s ink.',
    issue: 'value-label-placement',
    kind: 'default',
    doc: `
**Problem.**
- **Rings.** A donut's inside labels sat at 72% of the outer radius, whatever the hole. On Finastra's 23px ring that put white "46%" across the edge of the hole, white on white: it read "46" and "1%".
- **Segments.** A segment was judged only by whether a line of text fits along it. On a horizontal stack the label lies along the segment, so its *width* is what has to fit. Across a horizontal bar the room is the bar's thickness, not the band's.

**Design.**
- **Rings.** A donut (\`innerRadius\` > 0) with inside labels checks the ring's thickness against the widest label plus 2px each side.
  - If it holds them, the labels sit on the ring's mid-radius.
  - If not, they move outside the ring (the same placement as \`outsideMark\`), take the plot's ink, and the report says why. A stated radius shrinks only if the outside labels would otherwise leave the plot.
  - Slices too thin for a line of text still drop their label (unchanged).
- **Segments along a horizontal stack:** the smallest value whose segment is as long as its own label is wide, plus 2px a side (a share's \`99%\` on a normalized stack). Segments below it keep the stack but hide the number, as before. Up a column: a line of text (unchanged).
- **Across a horizontal bar:** the bar's thickness has to hold a line of text.

**API.** No change.

**Code.** \`core/theme/ground.ts\` (the segment check, \`slotHoldsLine\` across a bar); \`vegalite/theme.ts\` (the ring check in the radial labels).

**Tests.** L5:
- a donut's labels sit on its ring's middle;
- a 12px ring moves them outside it, with no per-slice ink and a report;
- a 60 segment on a horizontal stack is too short for its label, even though it is tall enough for a line of text.

**Effect.**
- 28 charts drawn differently.
- **Shipped presets:** 15 charts. The Likert stacks (one more label kept where it fits) and the mobile-OS donut (labels on the ring's middle).
- **Houses:** 11 charts, Finastra's donuts among them.
- No chart without a theme.
`,
    decisions: [
      'Labels moved outside a thin ring keep the 22px gap outside labels use; a guide that wants leader lines has no option for them yet.',
      'On a normalized horizontal stack every segment is measured against “99%”, the widest share, rather than its own share.',
    ],
  },
  {
    id: 'l6',
    label: 'L6 · Values replace the axis',
    title: 'L6 — When printed values replace the axis, its title moves to the deck',
    rule: 'Where a house drops the value axis once values are printed (`structure.axis.measure.suppressWhenValuesPrinted`), the axis title no longer floats alone under the bars: it moves into the deck, unless the headline or the deck already names the quantity (its words and its unit), in which case it goes.',
    issue: 'labels-replace-axis',
    kind: 'default',
    doc: `
**Problem.** Five houses (Dallas Morning News, Kraft Heinz, RSS, Trafford, UNHCR) state \`suppressWhenValuesPrinted\`. Flint removed the ruler's labels, ticks, line and grid but kept the axis title, so "Population" floated under the bars naming nothing. That was one of the Flint bugs in the review.

**Design.**
- With the ruler gone, grounding gives the title the existing \`subtitle\` placement, marked \`unlessNamed\` (report \`axis-title-to-deck\`). The plan's deck and realization both read it, so the deck is fitted with the title in it.
- **Already named.** The title's words, less a bracketed unit, appear in the headline or deck, *and* so does a word starting with the unit: "Population (m)" in "Population, millions, 2023". One shared word is not enough: "People (million)" is not named by "People displaced across borders". A named title is dropped.
- The title's own policy still decides whether there is a title at all; this only decides where it goes when the ruler leaves.

**API.** No ThemeSpec change. Level 2: \`ResolvedAxis.title.unlessNamed\`; \`alreadyNamed\` in \`core/title-plan.ts\`; report \`axis-title-to-deck\`.

**Code.** \`core/theme/ground.ts\`, \`core/theme/types.ts\`; \`core/title-plan.ts\` (\`alreadyNamed\`, \`deckText\`); \`vegalite/theme.ts\` (\`moveAxisTitlesToSubtitle\`).

**Tests.** L6:
- naming needs the unit too;
- the title moves into the deck under a plain headline;
- it is dropped where the deck names it.

**Effect.**
- **Houses:** 5 house charts. UNHCR's title moves into the deck; the four whose deck already says "Population, millions" drop it.
- No shipped preset and no chart without a theme: none states \`suppressWhenValuesPrinted\`.
- The orphan-title bug is marked fixed in part: RSS's gridlines when the labels are drawn are still open.
`,
    decisions: [
      'The match is lexical: “Population (m)” is named by “Population, millions”, but not by “Inhabitants, millions”.',
      'A dropped title leaves the quantity named only by the headline or deck the author wrote; a house that wants it repeated has no option for it.',
    ],
  },
];

/** The group fixes: how a group of bars shares its step. */
export const GROUP_STAGES: Stage[] = [
  {
    id: 'g1',
    label: 'G1 · Gaps in and between groups',
    title: 'G1 — A group’s bars, the gap between them and the space between groups',
    rule: 'A grouped (dodged) bar chart has two gaps: between the bars in a group, and between groups. `geometry.band.group: { gap, spacing }` states each as a share of a bar’s width (`0` touching, `1` a bar’s width) or in px (`"2px"`), and the bars take what is left of the step: step = k·bar + (k − 1)·gap + spacing. Unset `spacing` keeps the house’s band fraction between groups, but never less than half a bar or three gaps; unset `gap` is a twentieth of a bar, at least 1px (it used to be the band fraction’s gap, the same as between groups). The bar’s width is always derived; the step is a guideline.',
    issue: 'bar-shape',
    kind: 'default',
    doc: `
**Problem.** A house had one number, \`bandFraction\`, for every gap. A grouped chart applied it twice:
- to the category band (the space between groups);
- again to the lanes inside each group.

So a house with a 0.6 fraction put 40% of every bar between the bars of a group, and a group read as loose bars rather than one cluster. Nothing could say "the bars in a group touch" (Cato), "small gaps inside, wide ones between" (Liferay), or "2px between bars, 16px between groups" (Tractie). The plan sized the plot for groups with yet another padding.

**Design.**
- **Vocabulary.** \`geometry.band.group\` (or \`marks.group\`): \`gap\` between the bars in a group, \`spacing\` between groups. Each is a share of a bar's width or \`"Npx"\`.
- **Solve for the bar** (\`core/group-gaps.ts\`, \`groupPadding\`). With \`k\` bars in a group and a step \`S\`:
  - \`bar = (S − (k−1)·gapPx − spacingPx) / (k + (k−1)·gapShare + spacingShare)\`.
  - Without \`spacing\`, the group fills \`bandFraction\` of its step, as one bar would, and the bars split it less their gaps.
  - **Groups read as groups.** Without \`spacing\`, the space between groups is never less than half a bar, nor three times the gap inside a group: a house with a 0.95 band fraction would otherwise leave its groups barely further apart than their bars. A stated \`spacing\` is the house's call and is kept.
  - **The default gap** is a twentieth of a bar, never under 1px, so the bars of a group read as one cluster but are still told apart.
  - **The bar's width is derived, never stated.** A house states the gaps and, through \`bandFraction\`, \`layout.bandStep\` and the canvas, how wide a step should be; the step is a guideline the layout fits, and the bar is whatever the step leaves.
  - If the gaps leave no room, the bars keep a third of the step.
- **One answer for every pass.**
  - *Vega-Lite:* the category band takes the space between groups as \`paddingInner\`; the offset band takes the gap as \`paddingInner\`, with no outer padding. Locally dodged bars (pinned by size) take \`pitch · (1 − gap share)\`. Group dividers recentre on each field's own padding.
  - *The plan:* sizes a nested band with the same padding.
  - *Plotly:* \`bargap\` and \`bargroupgap\`.
- **Unreadable values** fall back with \`group-gap-not-applied\`.
- **Default.** A themed group's bars are a twentieth of a bar apart (at least 1px); the space between groups is unchanged, unless it was under half a bar. No chart without a theme changes; unthemed charts keep Vega-Lite's own band padding.

**API.** \`BandGeometry.group\`, \`ThemeMarks.group\` (\`{ gap?: GapSize; spacing?: GapSize }\`, \`GapSize = number | "Npx"\`); level 2 \`ResolvedMarks.group\`; \`groupPadding\`, \`resolvedGroupSpacing\`; report \`group-gap-not-applied\`.

**Code.** \`core/group-gaps.ts\` (new); \`core/theme/types.ts\`, \`core/theme/ground.ts\`; \`core/plan.ts\` (\`bandSpan\`); \`vegalite/theme.ts\` (the band walk, \`centerBandDividers\`); \`plotly/theme.ts\`.

**Tests.** \`tests/theme-group-rules.test.ts\`:
- the solve (touching bars, px gaps, the default);
- the default paddings, the 1px floor on the default gap, and the half-bar floor between groups;
- stated gaps both ways round;
- the report for an unreadable gap;
- an unthemed chart unchanged;
- locally dodged sizes;
- Plotly's two gaps.

**Effect.**
- 143 charts change, all visually.
- **Shipped presets:** 33 charts, the grouped medals, earnings and Titanic charts under each of the 11. Their bars in a group close up from the band fraction's gap to a twentieth of a bar.
- **Houses:** 99 charts in 69 houses; every grouped gallery chart.
- **Opted in:** Cato (touching), Liferay (\`0.1\`, \`1\`), Tractie (\`2px\`, \`16px\`), IBCS (\`2px\`, \`1\`).
- No chart without a theme.

**Renderers.** Vega-Lite and Plotly. ECharts and Chart.js keep their own gaps for now.
`,
    decisions: [
      'Revised after review: the default gap in a group was tightened from a tenth to a twentieth of a bar (at least 1px), and the space between groups given a floor of half a bar or three gaps, so within and between read clearly apart. It is still a visible change to every shipped preset’s grouped charts.',
      'Decided: a bar’s width is derived, never stated; the band step is a guideline. Tractie’s 12px and Red Hat’s 10px are approached through their gaps and band step, not a bar width.',
      'Grouped box plots and violins keep `summary.widthFraction`; ECharts and Chart.js grouped bars are not yet spaced by the rule.',
    ],
  },
];

/** The mark fixes: what bars, areas, wedges and dots draw, each kept to the marks it names. */
export const MARK_STAGES: Stage[] = [
  {
    id: 'm1',
    label: 'M1 · Area edges',
    title: 'M1 — An area’s edge is its own line, never an outline on other marks',
    rule: '`geometry.area.edge` / `edgeWidth` draw a line along the top of each area, stacked bands included, in the area’s own ink. They no longer fold into the chart-wide `marks.outline`, which outlined bars, wedges and dots and left stacked areas without an edge.',
    issue: 'fill-and-outline',
    kind: 'default',
    doc: `
**Problem.** \`geometryToMarks\` read \`band.outline ?? area.edge\` and \`band.outlineWidth ?? area.edgeWidth\` into one \`marks.outline\`. Templates that do not declare their geometry kinds (grouped and stacked bars) got the area's edge as a structure-ink outline round every bar. Areas themselves never drew an edge. Pearson's medal bars wore 3px black borders; Elastic's, GitLab's and Sprout Social's stacked washes had no line between bands.

**Design.**
- \`marks.areaEdge\` (from \`geometry.area.edge\`/\`edgeWidth\`) is separate from \`marks.outline\`, which only \`band.outline\` and \`point.outlineWidth\` feed.
- An area with an edge gets Vega-Lite's own \`line\` overlay, which follows a stack's bands and the colour encoding. Its width is the stated one, else 1px for \`quiet\`/\`hairline\` and 2px otherwise, with the house's cap and join.
- No edge on a synthetic wash (R12), a violin's sideways density, or an area whose template draws its own line.
- Plotly: the stated width on its area traces.

**API.** \`ThemeMarks.areaEdge\`; level 2 \`ResolvedMarks.areaEdge\`.

**Code.** \`core/theme/ground.ts\` (\`geometryToMarks\`, \`geometryFromMarks\`), \`core/theme/types.ts\`; \`vegalite/theme.ts\` (\`applyMarks\`); \`plotly/theme.ts\`.

**Tests.** \`tests/theme-mark-rules.test.ts\`, M1:
- a stacked area gets an edge line of the stated width;
- stacked bars get no outline from it;
- \`omit\` draws none, and a house's own bar outline stays.

**Effect.**
- 58 charts change (43 visibly), all in the 9 houses that state an area edge: AWS Cloudscape, Elastic, GitLab, Gov Canada, Liferay, Opower, Pearson, Red Hat, Sprout Social.
- No shipped preset and no chart without a theme: none states an area edge.
- The \`area-edge-outline\` bug is fixed.
`,
    decisions: [
      'Bars in a house that also stated `band.outline` keep it; only the area edge stopped reaching them.',
    ],
  },
  {
    id: 'm2',
    label: 'M2 · Bar fill and edge',
    title: 'M2 — A bar’s opacity is its own, and its edge can be its own colour',
    rule: '`geometry.band.opacity` is drawn on bars (their fill), and an area’s opacity stays with areas. `geometry.band.outlineInk: "series"` (or `marks.outline.source: "series"`) edges each bar in its own series ink at full strength.',
    issue: 'fill-and-outline',
    kind: 'default',
    doc: `
**Problem.**
- **Opacity.** One \`marks.fillOpacity\` took both \`area.opacity\` and \`band.opacity\` (the band's winning), and was written only to \`config.area\`. So GitLab's 20% columns, Michelin's 60% bars and Trafford's 80% bars were opaque, while a house's area opacity could be overwritten by its bars'.
- **Edge colour.** An outline could only be in the structure ink or the surface. GitLab and Michelin edge their translucent fills in the full series colour.

**Design.**
- \`marks.barOpacity\` (from \`band.opacity\`) is written as \`config.bar.fillOpacity\`: the fill only, so an edge stays crisp. Plotly: \`marker.opacity\`.
- \`outlineInk: "series"\` marks the bars during the outline pass. Once the series inks are final, each bar coloured by a field gets a stroke scale that mirrors its colour scale (no key of its own); a single-ink bar gets that ink. A layered bar reads the colour its parent states. Wedges keep their slice gap: a series edge is a bar rule.

**API.** \`BandGeometry.outlineInk\`, \`ThemeMarks.barOpacity\`, \`marks.outline.source: "series"\`; level 2 \`ResolvedMarks.barOpacity\`, \`outline.series\`.

**Code.** \`core/theme/ground.ts\`, \`core/theme/types.ts\`; \`vegalite/theme.ts\` (\`applyMarks\`, \`applySeriesOutlines\`); \`plotly/theme.ts\`.

**Tests.** M2:
- \`band.opacity\` reaches \`config.bar\` and not \`config.area\`;
- a series edge on single and stacked bars;
- no bar opacity where none is stated.

**Effect.**
- 37 charts change (25 visibly), in the houses that state a band opacity: GitLab, Michelin, Pearson, Trafford.
- No shipped preset: none states a band opacity.
- Opted in to \`outlineInk: "series"\`: GitLab, Michelin.
- The \`band-opacity\` bug is fixed in part: \`band.cornerRadius\` still reaches \`config.arc\`, which only matters on a chart that draws both bars and wedges.
`,
  },
  {
    id: 'm5',
    label: 'M5 · Dots on lines',
    title: 'M5 — Which lines keep their dots, and hollow end markers',
    rule: '`geometry.point.density` says which lines keep the house’s dots: `countable` (default, up to 12 readings), `all` (every line, the dots shrinking to fit) or `sparse` (only where readings stand 20px apart). End markers (`annotation.pointEmphasis`) of a house with hollow dots are hollow too.',
    issue: 'point-visibility',
    kind: 'default',
    doc: `
**Problem.**
- **No say over density.** Goldman Sachs dots every reading; Flint stood its dots down past twelve, with no way to say otherwise. Elastic shows points only where readings stand 20px apart, and could only say all or none.
- **Solid end markers.** End markers were always solid, so Dallas Morning News's and London City Intelligence's hollow-dot houses ended their lines in solid discs.

**Design.**
- \`point.density\`: \`all\` skips the 12-reading cap (the dots still shrink, or stand down, where they cannot sit apart); \`sparse\` drops them where readings are under 20px apart. Default \`countable\` is unchanged.
- A house with \`point.fill: "hollow"\` draws its end markers as rings in the series ink round the plot surface, at the house's outline width.

**API.** \`PointGeometry.density\`, \`ThemeMarks.point.density\`; level 2 \`ResolvedMarks.point.density\`.

**Code.** \`core/theme/types.ts\`, \`core/theme/ground.ts\`; \`vegalite/theme.ts\` (the dot walk, \`applyPointEmphasis\`).

**Tests.** M5:
- the countable default and \`all\` past twelve readings;
- \`sparse\` on a wide and a narrow line;
- hollow end markers.

**Effect.**
- 31 charts change (21 visibly).
- Default (hollow end markers): Dallas Morning News and London City Intelligence.
- Opted in: Goldman Sachs (\`all\`), Elastic (\`sparse\`, hollow).
- No shipped preset: none has hollow dots.
- The \`points\` bug's dots past 12 readings now has an answer a house can state.
`,
    decisions: [
      'The end markers keep the emphasis size, not the house’s own dot size (Dallas Morning News states 45px²).',
    ],
  },
  {
    id: 'm6',
    label: 'M6 · Least bar length',
    title: 'M6 — A bar too short to see keeps a stub',
    rule: '`geometry.band.minLength` (px) draws every non-zero bar shorter than that as a stub of that length at the baseline, the right way for its sign; zero stays empty.',
    issue: 'bar-shape',
    kind: 'option',
    doc: `
**Problem.** A near-zero bar vanished into the baseline and read as missing. MinnPost's guide sets \`minPointLength: 3\`.

**Design.**
- For each simple bar layer on a quantitative measure (not stacked, not ranged, not aggregated), the stub threshold is the least length over the plot's length, times the drawn span.
- Bars below it get a second bar layer from zero with a pixel \`y2Offset\` (or \`x2Offset\`), up for positives and down for negatives.
- The value's own bar stays where it is, so labels and tooltips are unchanged. Stacked bars are left alone, since a stub would lie across the neighbouring segment.
- Capped at 20px.

**API.** \`BandGeometry.minLength\`; level 2 \`ResolvedMarks.barMinLength\`.

**Code.** \`vegalite/theme.ts\` (\`applyBarMinLength\`).

**Tests.** M6:
- rendered through Vega, a 2 and a −1 bar are at least 3px and a zero bar is empty;
- nothing is added for a house that does not ask.

**Effect.** Opted in: MinnPost. None of its matrix charts has a bar under 3px, so the matrix is unchanged; the case shows it.
`,
  },
  {
    id: 'm3',
    label: 'M3 · Data order',
    title: 'M3 — Wedges, dashes and shapes follow the colours’ order',
    rule: 'A pie’s wedges run in the data’s order from 12 o’clock, as its key does; Vega-Lite stacked them alphabetically. A redundant dash or marker shape takes the colour scale’s sort and domain, so the first series is solid and keeps the first shape whatever its name.',
    issue: 'pie-rules',
    kind: 'default',
    doc: `
**Problem.**
- **Wedges.** The pie template promised data order (\`sortSlices: "none"\`), and the colour scale and key followed it, but no \`order\` channel was written, so Vega-Lite stacked the wedges alphabetically. Chrome, the first row, did not start at 12 o'clock, and the wedges disagreed with their key.
- **Dashes and shapes.** These took a bare field, so their domain sorted alphabetically while the colours followed the data: CFPB's first series was dotted, Justice Innovation Lab's lead line dashed.

**Design.**
- **Pie template.** With no slice sort, it writes the data order as an \`order\` channel (an \`indexof\` of each name in the first-seen order). When the theme folds a long tail into "Others", the order is rewritten on the key field after the fold (kept first, Others last).
- **Redundant channels** copy the colour encoding's \`sort\` and stated \`domain\`.

**Code.** \`vegalite/templates/pie.ts\`; \`vegalite/theme.ts\` (\`applySeriesInk\` fold, \`applyRedundantChannels\`).

**Tests.** M3 and M4:
- wedges in data order, themed and unthemed, read from the rendered scenegraph;
- a chart's own \`sortSlices\` wins;
- the dash scale carries the colour's sort.

**Effect.** This is the one wide stage.
- 209 charts change (203 visibly): every pie and donut, and every chart with dashes or marker shapes.
- **Including 2 charts without a theme:** the unthemed browser pie and mobile donut now match their keys.
- Shipped presets: 34 charts (pies, donuts, and Apple's shape-encoded scatter and lines).
- The \`pie-order\` bug is fixed.
`,
    decisions: [
      'This changes unthemed pies, which no other stage does. It fixes a mismatch with the key rather than a style, so it is kept as a default; the wedge order a reader sees changes on every pie.',
    ],
  },
  {
    id: 'm4',
    label: 'M4 · Wedge rules',
    title: 'M4 — A house’s wedge order, start angle and hole',
    rule: '`geometry.arc.order` (`data` or `largestFirst`), `startAngle` (degrees clockwise from 12 o’clock) and `hole` (a share of the radius) let a house state its pie rules; a chart that sorts its own slices keeps its sort.',
    issue: 'pie-rules',
    kind: 'option',
    doc: `
**Problem.** Morningstar, Salesforce, Pearson and Opower draw pies largest first from 12 o'clock; Aviva and Finastra in the data's order. Goldman draws a half donut that starts at 9 o'clock. Aviva's hole was px in \`chartDefaults\`, which turned the ring inside out on a small donut. Only the chart could sort its slices.

**Design.**
- A realization pass (\`applyArcRules\`) after the value labels writes the order wherever the arc's colour lives (the arc, or the parent it shares with its labels), so wedges, labels and key agree.
- \`largestFirst\` sums each name's value and also sets the colour domain, so the key lists the wedges in the same order.
- \`startAngle\` turns the theta range; \`hole\` sets \`innerRadius\` as a share of the drawn outer radius.

**API.** \`ArcGeometry.order | startAngle | hole\`, \`ThemeMarks.arc\`; level 2 \`ResolvedMarks.arc\`.

**Code.** \`core/theme/types.ts\`, \`core/theme/ground.ts\`; \`vegalite/theme.ts\` (\`applyArcRules\`).

**Tests.** M4:
- largest first, with labels on, in the key too;
- a 90° start;
- a 0.6 hole.

**Effect.**
- 2 charts change (Morningstar's and Opower's donuts), drawn largest first.
- Salesforce and Pearson are opted in too, but their gallery pies already arrive largest first. Aviva and Finastra state \`data\`, which M3 already gives. An order the wedges already have is not rewritten.
- Measured after M3.
`,
    decisions: [
      'The half donut (sweep) and the slice cap (fold past N) are not here; the slice cap is close to the colour fold R1 already does.',
    ],
  },
];

/** The footer: what a chart draws at its foot — first, where its data comes from. */
export const FOOTER_STAGES: Stage[] = [
  {
    id: 's1',
    label: 'S1 · The source line',
    title: 'S1 — The chart says where its data comes from; the theme says how that reads',
    rule: 'A chart may give its source: `chart_spec.source` (a string, or `{ text, href }`), optional, given only where it is known. When it does, Flint draws it at the foot of the canvas, in the house’s `type.footnote`, as the theme’s `source` says: a lead-in (default “Source:”) and its weight, slope and case; the side it sits on; a rule above it; and a credit of the house’s own (inline, at the other end, or on the next line). Its room comes out of the plot.',
    issue: 'source-line',
    kind: 'option',
    doc: `
**Problem.** 23 style guides close every chart with a source line, and many treat it as required: BBC, the Economist, ONS, UNHCR, Urban, RADx-UP. Each has its own form:
- a bold or medium lead-in;
- right-aligned (Trafford, USAID, Baltimore);
- under a rule, solid (BBC, MinnPost) or dashed (Sunlight);
- with the house's credit inline (Trafford's handle, NZZ's "Grafik: nzz."), at the other end (BBC, London City Intelligence, Urban, TASO) or on the next line (UNHCR's copyright).

The chart spec had no source slot, and the theme's \`type.footnote\` was reported as never drawn.

**Design.**
- **Who says what.** The chart gives the words; the theme gives the form. \`chart_spec.source\` is optional. The API reference and the chart-author skill say to give it only where the source is known (stated by the user or carried by the data): an agent should not invent one, and a chart without one draws no footer.
- **Theme \`source\`:**
  - \`show\` (\`whenGiven\` | \`never\`);
  - \`leadIn\`, plus \`leadInWeight | leadInStyle | leadInCase\`;
  - \`align\` (\`start\` | \`end\`) and \`frame\` (\`content\` | \`canvas\`);
  - \`rule { width, color, dash }\`;
  - \`credit { text, placement: inline | end | nextLine, separator, weight }\`;
  - \`gap\`.

  Without a theme, or with a theme that states no \`source\`, the line is "Source: …" in the footnote role: the axis-label size less 1px, the muted ink, bottom-left.
- **Layout** (\`core/source-plan.ts\`). The words are measured in the footnote's font and wrapped at the title block's width. Runs of one weight are merged; an end credit takes its width out of the first line. Lines are laid out bottom-up from the foot of the margin, with the rule 6px above them.
- **Room.** The room (gap, lines, rule) comes out of the plot, as the header's does, so the canvas the caller asked for holds. A banded plot cannot give, so its canvas grows by the line.
- **Drawing.** Canvas furniture anchored to the canvas's bottom edge (new \`bottom\`, plus \`dash\` for a dashed rule), drawn after render by every renderer: the SVG export, the interactive view, the site and the MCP app (its PNG too).

**API.**
- \`chart_spec.source\`; \`ThemeSpec.source\` (\`ThemeSource\`); level 2 \`DesignDecisions.source\` (\`ResolvedSource\`).
- \`planSource\`, \`SourcePlan\`, \`applySourceLine\`.
- \`CanvasFurnitureItem.bottom | dash\`; \`placeCanvasFurniture(item, width, height)\`.
- \`type.footnote\` is no longer reported as not drawn.

**Code.** \`core/source-plan.ts\` (new); \`core/theme/types.ts\`, \`core/theme/ground.ts\`, \`core/types.ts\`; \`core/plan.ts\`; \`vegalite/assemble.ts\`, \`vegalite/theme.ts\` (\`applySourceLine\`); \`vegalite/canvas-furniture.ts\`, \`vegalite/interactive.ts\`; \`flint-mcp/ui/src/render.ts\`.

**Tests.** \`tests/theme-source-rules.test.ts\`:
- nothing without a source;
- the default line, themed and not, anchored to the foot;
- the canvas holds;
- the lead-in's weight, the footnote type, the end credit and a dashed rule above;
- an inline credit, right-aligned, and a linked source;
- a long source wraps;
- \`show: "never"\`.

**Effect.**
- **No chart in the matrix changes unless it gives a source.** None of the preview cases or presets give one.
- 19 houses state their \`source\` form, and each one's source-line gap chart gives the source its guide shows; only those charts draw a source line. The rest only lose the footnote role's "not drawn" report.
- BBC and Sunlight keep their \`footerRule\`, and the source sits under it, so their charts without a source are unchanged.
`,
    decisions: [
      'Optional, never invented: `chart_spec.source` is drawn only when given. The chart-author skill tells an agent to add it only when the user or the data names the source.',
      'Notes lines (CFPB, Cato, UNHCR, Urban, RADx-UP, TASO), a “Date published” / “Download” meta line (CFPB), HDX’s source strip under the headline, a box or band behind the strip (Sunlight, DMN) and a logo on the source’s baseline are not here.',
      'A banded chart has no plot height to give, so its canvas grows by the source line.',
    ],
  },
];

export const AXES_STAGES: Stage[] = [
  {
    id: 'a1',
    label: 'A1 · Names fitted to their bands',
    title: 'A1 — Category names are measured as drawn, shrunk to the floor, widened, and only then turned',
    rule: 'A band axis measures its names in the face they are drawn in. Names that do not fit flat break at a space, then shrink half a pixel at a time to the house’s floor (`type.minSize`, never below ¾ of the stated size), then widen their bands up to the chart’s stretch, and only then turn. Row names on y are never turned for the names on x. A crowded continuous ruler still shrinks as before.',
    issue: 'tick-label-fit',
    kind: 'default',
    doc: `
**Problem.** 26 houses say \`labels.angle: "horizontal"\`, yet their charts came out with names turned −45° or −90°. Four faults combined:
- **Wrapping was decided with an estimate.** Every name was 0.62 em a character, and a name could only wrap when its band was 4 em wide. The theme's check measured the *whole* name, not the lines the layout had broken it into, so a name that wrapped was refused and turned anyway (JIL's "United States").
- **No shrinking before turning.** A name 1px too wide for its band turned instead of being set half a pixel smaller.
- **Bands never widened for flat names.** The elastic budget stopped the step short of the width the names needed, though the chart could stretch further (CFPB's nine decades on a 360px canvas turned upright).
- **The wrong axis was turned.** A heat map's city names on y were turned whenever its month names on x were judged too wide.

**Design.**
- **Measure.** Themed charts measure names with the host's measurer, or the width table for the face drawn. Where the table does not know that face (Matter, Work Sans, Source Sans), it measures the fallback it knows and allows a tenth more. Unthemed charts keep the old estimate.
- **Order.**
  1. Break at a space, at the stated size, within the elastic budget.
  2. Shrink by 0.5px down to the floor, \`max(type.minSize ?? 8, ¾ × stated)\`.
  3. At the floor, widen the bands up to the chart's stretch cap.
  4. Turn.
- **Clipping.** The label limit gets 15% slack, capped at the band, so a renderer whose glyphs run slightly wider does not clip a name the band holds.
- **Continuous rulers** keep the original rule: crowded, they take the size the layout fitted. Keeping the house size was tried and dropped — in small multiples one panel's "2020" ran into the next panel's "2000". A theme's straight angle is refused only for names in bands, so continuous axes no longer report \`labels-straight-refused\`.
- **Rows.** The −45° fallback for crowded names applies to x only.

**API.** \`computeBandLabelLayout({ measure, stretchToFit })\`; \`planBandLabels({ measure, minFontSize })\`; \`LabelSizingDecision.fittedFontSize\`; \`measuresDrawnFace(font)\` in \`core/text-width.ts\`.

**Code.** \`core/decisions.ts\`, \`core/compute-layout.ts\`, \`core/plan.ts\` (\`bandLabelMeasure\`), \`core/axis-labels.ts\`, \`core/theme/ground.ts\`, \`core/text-width.ts\`.

**Tests.** \`tests/theme-axis-rules.test.ts\` (A1): flat a little smaller rather than turned; shrink, then widen; never below the floor; a continuous ruler is never refused a flat angle; heat-map rows never turned for the columns; no theme, no change. \`tests/boxplot-label-fit.test.ts\` and \`tests/theme-presets.test.ts\` now state that names may shrink toward the floor before turning.

**Effect.**
- No chart without a theme changes.
- Presets and houses change where category names were turned or cut: they now sit flat, a little smaller. Rulers in small multiples are unchanged (a guard case).
- In the gap charts: JIL, CFPB, AWS's heat map, Apple's decades, Baltimore, eBay, Michelin, Orange, Pinterest, TASO, USAID and VTEX now draw their names flat. The heat-map tiles of Economist, IBM, Kraft Heinz, Pearson, Red Hat, Microsoft, Morningstar, ONS and RSS no longer turn months or cities.
`,
    decisions: [
      'The floor is the house’s `type.minSize`, and never below ¾ of the stated size, so a house that states no floor still cannot fall to 7px.',
      'Shrinking comes before widening: a 13px flat name on the canvas asked for reads better than a 17px one on a canvas grown 40%.',
      'Thinning category names (eBay: every other month at the stated size) is not offered; eBay’s months are now flat at 9.5px instead of turned.',
      'Datadog’s minute-by-minute axis is still turned at 7px: it is a time ruler drawn in bands, and wants thinning.',
    ],
  },
  {
    id: 'a2',
    label: 'A2 · Clear of each other',
    title: 'A2 — A top key clears a flat y title; the first x label clears the lowest y label',
    rule: 'A top key stands above a flat y title by the title’s lift above the plot, its own line and a 6px gap. Where an x ruler centres its end labels and its first label sits on the plot’s left edge, the x labels drop just far enough (half the y label size and 2px) to clear the lowest y label.',
    issue: 'axis-title-relocation',
    kind: 'default',
    doc: `
**Problem.**
- **Key over the title.** CFPB lays the y title flat above the axis on phones and puts the key on top. The key's offset was a fixed \`18 + title size + 12\`, but the title sits \`gap + ¾ × label size\` above the plot. At CFPB's 17px the second key row ran through "Anomaly (°C)".
- **Corner collision.** A temporal ruler centres its end labels (\`labelFlush: false\`, so its spacing stays honest), so "2000" hangs left under the y labels. The lowest y label, centred on the plot's foot, hangs half a line below it. On BBC's 21px type, "2" sat on "2000".

**Design.**
- **Key.** The plan passes the flat title's lift to the key. The offset is the larger of the old one and \`lift + title size + 6\`.
- **Corner.** After the axes are set, a themed chart whose x and y are both continuous, whose x centres its end labels, and whose first stated tick is the data's first value gets \`labelPadding ≥ ½ × y label size + 2 − tick size\` on x. No label leaves its tick, and the tick spacing is unchanged.

**Code.** \`core/legend-plan.ts\` (\`flatYTitleLift\`), \`core/plan.ts\`; \`vegalite/theme.ts\` (\`clearAxisCorner\`, \`firstTickAtStart\`).

**Tests.** \`tests/theme-axis-rules.test.ts\` (A2).

**Effect.**
- No chart without a theme changes.
- **Economist** (6 time-series charts) and 305 house charts in 58 houses: x labels a few pixels lower wherever the first year sits on the corner.
- **CFPB's** flat titles and top keys: two rows, as the guide draws them.
`,
    decisions: [
      'The corner is cleared by moving the x labels down, not by raising the lowest y label off its gridline or flushing the first x label (which would undo the tick plan’s spacing).',
    ],
  },
  {
    id: 'a3',
    label: 'A3 · The rule at the foot',
    title: 'A3 — A footer rule runs under the whole graphic, above the source line',
    rule: 'A `footerRule` is drawn on the canvas, 6px under everything the chart lays out, across the content width (the headline’s left edge to the right margin) unless it states a `width`. A source line takes the foot and the rule sits above it. Its room still comes out of the plot.',
    issue: 'brand-rule',
    kind: 'default',
    doc: `
**Problem.** A footer rule was a second view, concatenated under the chart. Vega lines up concatenated views by their origins, so the rule began at the plot's left edge, not at the labels beside it, where the headline begins. Its width was a guess: the plot × 1.07. BBC's rule started under "2000" and ran 30px past the plot. Datawrapper's grey rule did the same.

**Design.**
- A rule at the foot is canvas furniture, like S1's source line: \`left\`/\`right\` at the content margins (or \`width\` when the theme states one), with \`bottom\` in the padding. The padding grows by the rule and the 6px gap, and the plot gives that height back.
- A source line placed afterwards moves foot furniture already seated up over itself, so the order is chart, rule, source.
- A rule at the top (\`headerRule\`, \`belowTitle\`) still joins the views.

**API.** \`ClosingRule.stated\`; \`withRules\` adds only top rules.

**Code.** \`core/rule-plan.ts\`; \`vegalite/theme.ts\` (\`applyFurniture\`, \`applySourceLine\`).

**Tests.** \`tests/theme-titles.test.ts\`: "a closing rule at the foot" runs across the graphic and sits above a source line.

**Effect.**
- No chart without a theme changes.
- **Datawrapper** (55 charts): the rule is now the title's width, from its left edge.
- 51 house charts: BBC, Sunlight and two other houses with a \`footerRule\`.
`,
  },
  {
    id: 'a4',
    label: 'A4 · A measure named once',
    title: 'A4 — The deck does not repeat a measure the author’s deck or the ticks already name',
    rule: 'Under `annotation.axisTitles: "omit"`, an axis title is not appended to the deck when the author’s deck already contains its name and states its unit (or the ruler prints the unit on its ticks). The headline is not read: a measure only the headline names still goes into the deck.',
    issue: 'axis-title-relocation',
    kind: 'default',
    doc: `
**Problem.** \`omit\` moves every axis title into the deck. Where the author's deck already says it, the deck says it twice:
- BBC: "US unemployment rate, 2000-2023; Unemployment (%)", over a ruler whose top tick prints the %;
- Economist: "United States, unemployment rate, %; Unemployment (%)";
- 18 BBC charts: "Population, millions, 2023; Population (m)".

**Design.**
- **Deck only.** \`omit\` titles carry \`unlessNamed: "deck"\`: only the author's deck is read. A headline is free to say something else, and three tests hold that a measure named only there still goes in.
- **Units.** \`alreadyNamed(title, said, tickUnit)\` counts a unit as named when the axis prints it on its ticks.
- **Shared code.** Plan (\`deckText\`) and realization (\`moveAxisTitlesToSubtitle\`) use the same check.

**API.** \`unlessNamed: true | "deck"\` on a resolved axis title; \`alreadyNamed(title, said, tickUnit?)\`, \`tickUnitOf(axis)\`.

**Code.** \`core/title-plan.ts\`, \`core/theme/ground.ts\`, \`core/theme/types.ts\`, \`vegalite/theme.ts\`.

**Tests.** \`tests/theme-axis-rules.test.ts\` (A4); the \`omit\` tests in \`tests/theme-titles.test.ts\` still hold.

**Effect.** No preset changes. 84 charts in 28 houses lose a repeated title, BBC, Economist, NZZ and Apple among them.
`,
  },
  {
    id: 'a5',
    label: 'A5 · Signed data on a one-way ramp',
    title: 'A5 — A signed field read on a sequential ramp spans the data',
    rule: 'When a chart reads a field as diverging but the house paints it on its sequential ramp (no diverging ramp, or `signed: "sequential"`), the domain balanced about the midpoint is dropped and the ramp spans the data. The report says `diverging-read-sequential`.',
    issue: 'domain-policy',
    kind: 'default',
    doc: `
**Problem.**
- **Mismatched domain.** A heat map of temperatures (−9…34 °C) is read as diverging, so the template balances its domain about zero (−34…34). Cloudscape has no diverging ramp, so grounding paints it with the sequential one, but the balanced domain stayed. The data filled only the dark half, and the heat map was a nearly uniform navy.
- **Scope.** The same happened in 38 houses' heat-map tiles.

**Design.**
- Where the theme sets a sequential range on a continuous colour scale that carries the template's \`domainMid\`, it drops the domain so the scale fits the data.
- It reports the substitution once.
- A house with a diverging ramp keeps the balanced domain.

**Code.** \`vegalite/theme.ts\` (series ink).

**Tests.** \`tests/theme-axis-rules.test.ts\` (A5): the sequential ramp spans the data and says so; a diverging ramp keeps the balance.

**Effect.** No chart without a theme changes. **McKinsey**'s heat map (its \`signed: "sequential"\`) and 39 house charts: Moscow's winter reads light and Delhi's summer dark.
`,
  },
  {
    id: 'a6',
    label: 'A6 · Numbers compacted',
    title: 'A6 — The theme compacts numbers; the field’s semantic type and unit say whether it may be',
    rule: '`annotation.numberFormat.compact` says whether, how and where numbers are compacted: the style (k/M/B, K/M/B, k/m/b, k/m/bn, k/M/G), one unit per ruler or label set or one per value, the threshold, axis ticks and/or value labels, and the semantic types it covers. A field is compacted only where its type is covered and its unit or name does not already state a scale. `thousands: "suffix"` alone keeps its old reading. No chart writes G for billions.',
    issue: 'number-format',
    kind: 'option',
    doc: `
**Problem.**
- **Axes ignored the house.** \`numberFormat\` reached value labels only. Axis ticks kept the field's format, so houses that say "$20k" or "0.5bn" got $20,000 and 500,000,000 (eBay, CFPB, Michelin, Salesforce, Semrush, Shopify, WHO, Visa).
- **SI suffixes.** On labels, \`thousands: "suffix"\` was d3's \`~s\`: SI prefixes, so a billion printed "1.43G", even without a theme.
- **No style or scope.** A house could not pick the style (K vs k, bn vs B), one unit per axis (as BI tools do), where compaction applies, or which fields it covers.
- **Lost separators.** When suffixing would print two values the same (1,429 and 1,426), the fallback dropped the grouping: "1429".

**Learned from BI and newsrooms.**
- Power BI and Tableau pick one display unit for a whole axis from its largest value (K, M, bn) and give tooltips the full value.
- Excel and Power BI write capital K; d3 and Highcharts write k; the Economist and the FT write m and bn.
- None compacts percentages, years or IDs.

**Design.**
- **Theme.** \`annotation.numberFormat.compact\`:
  - \`show: "auto" | "never"\`.
  - \`style\`: \`short\` k/M/B/T (default), \`upper\` K/M/B/T, \`lower\` k/m/b/t, \`editorial\` k/m/bn/tn, \`si\` k/M/G/T.
  - \`per\`: \`scale\` (default) is one unit for a ruler or a label set, from its largest value; \`value\` gives each value its own unit.
  - \`threshold\`: the least largest value compacted. Default 10,000, so a ruler to 8,000 stays whole.
  - \`on\`: \`axis\` and/or \`labels\` (both by default). Tooltips always print the full value.
  - \`types\`: semantic types or families. Default Amount, Price, Profit, Count, Number, Quantity.
- **Field.** A field is never compacted when:
  - its semantic type is not covered (percentages, ranks, scores, years, IDs, temperatures);
  - its unit already states a scale (k, m, mn, bn, million, thousand, 000s);
  - its name does (\`Population (m)\`, \`Debt ($bn)\`);
  - or the headline or deck does ("Most populous countries, 2023 (millions)"): compacting 1,429 there would read as 1.4k millions.
- **Ticks.** One unit chosen from the ticks the axis states, with as many decimals as the ticks need (0, 0.5M, 1.0M, 1.5M). The number inside the label expression is replaced, so a currency sign ($) or a unit tag around it stays.
- **Labels.** Three significant figures at the top of the set, or the house's stated \`precision\` (two decimals: 5.00B, 950.40M). A stated precision is for labels only; ticks keep the digits that tell them apart. Labels are measured as printed, so the band fit (L1–L3) sees the compact strings. A band too narrow for a number is shortened in the house's style from a thousand.
- **Legacy.** \`thousands: "suffix"\` without \`compact\` keeps its old reading: labels only, each value its own suffix, left whole where three figures would merge two values. Billions now print B, and the whole fallback keeps its separators.
- **Default.** An unthemed chart is unchanged except that labels reaching a billion print B, not G.

**API.** \`ThemeSpec.annotation.numberFormat.compact\`; \`ResolvedAxis.compact\` (\`CompactRule\`); \`dataLabels.compact\` (\`CompactPrint\`). \`core/number-compact.ts\`: \`COMPACT_SUFFIXES\`, \`DEFAULT_COMPACT_TYPES\`, \`compactApplies\`, \`compactPrint\`, \`formatCompact\`, \`compactExpr\`.

**Code.** \`core/number-compact.ts\` (new); \`core/theme/types.ts\`, \`core/theme/ground.ts\` (\`groundCompactRule\`, \`compactFacts\`, \`suffixBillions\`); \`core/value-label-measure.ts\`, \`core/value-label-plan.ts\`; \`vegalite/theme.ts\` (\`compactAxis\`, \`printedNumber\`, label layers).

**Tests.** \`tests/theme-number-compact.test.ts\` (15), each read from the text Vega draws:
- a ruler in one unit;
- styles;
- type and unit rules;
- currency ticks;
- label sets;
- per-value;
- shares and millions untouched;
- axis-only and \`never\`;
- the old suffix;
- B for billions without a theme;
- stated precision on labels only;
- collisions;
- a scale the headline states.

**Effect.**
- No unthemed chart in the matrix changes; none reaches a billion.
- One preset chart: NYT's population labels regain their separators (1,429).
- 57 charts in 17 houses: those opted in by their guides (Adobe, CFPB, eBay, GitLab, Government of Canada, HDX, Mailchimp, Michelin, Salesforce, Semrush, Shopify, Sprout, Visa, WHO), and separators regained where the old suffix left values whole (BBC Audiences, Datadog, London).

**Scope.** Drawn by the Vega-Lite backend; ECharts and Chart.js keep their own formats. A compacted label is a string computed per row, so an aggregated label (a sum the chart computes) keeps its format.
`,
    decisions: [
      'The default threshold is 10,000, not 1,000: a ruler to 8,000 reads better whole, and a house that wants 2K says `threshold: 1000` (CFPB, Adobe, eBay, GitLab, Michelin).',
      'One unit per ruler by default, as BI tools do: 0.5M, 1.0M rather than 500k, 1M.',
      'BBC Audiences’ “1.4B” from a field in millions needs the unit itself rescaled (1,429 m → 1.4B); the scaled-unit rule leaves it whole for now.',
      'Locale (decimal comma, thin-space grouping, “3,9 %”) is not here.',
    ],
  },
  {
    id: 'a7',
    label: 'A7 · The baseline',
    title: 'A7 — The baseline the theme states is drawn, wherever the chart puts the floor',
    rule: '`structure.baseline` is drawn as a rule along the one measure axis: at zero where zero is inside the domain, else along the floor the chart chose. Whether the axis starts at zero stays the chart’s decision. It is not drawn where a rule is already there — the house’s zero rule where data crosses zero, or the index axis line along the floor in the same ink and weight — and only under marks that stand on a base (bars, areas, lines).',
    issue: 'zero-line',
    kind: 'default',
    doc: `
**Problem.** \`structure.baseline\` was resolved by grounding and read by no realiser. BBC states an emphasised baseline. On its unemployment chart the chart chose to start the axis at 3, so the zero rule (drawn only when data crosses zero) never fired. The floor was a pale gridline like the others, though the guide's \`geom_hline\` is the heaviest line on the chart. Adobe's gray-800 rule at zero was missing for the same reason. Every preset states a baseline too, and none was drawn.

**Design.**
- **Where.** The rule is drawn at zero where zero is inside the domain (bars either side of zero meet it). Otherwise it runs along the floor of the scale the chart chose: \`y = height\`, or \`x = 0\` for horizontal bars.
- **What is the chart's call.** Whether the axis starts at zero is decided by the chart, not the theme. The baseline follows that decision.
- **Not twice.** The house's own zero rule (\`grid.zero\`) stands in where data crosses zero. The index axis line along the floor stands in when it has the same ink and at least the same weight. A heavier baseline over a quiet axis line is drawn.
- **Only under standing marks.** The chart's own first mark must be a bar, area or line. Scatters (and a fitted line over one), strips and dot plots are excluded. So are ranges (\`x2\`/\`y2\`), a dumbbell's connector (a line grouped by its own category) and reversed rankings (bump charts). Bars on a reversed scale do stand on zero: a pyramid's two halves both get the rule along their spine.
- **On the panel's own scale.** The rule carries its panel's scale and is added after every other layer, so it never widens a stated domain (it had stretched Apple's pyramid ruler from 30 to 35).
- **Only when stated.** Grounding resolves \`baseline\` as hidden when the theme does not state it, so an unthemed chart, or a theme that states none, is unchanged.

**Code.** \`core/theme/ground.ts\` (the stated baseline only); \`vegalite/theme.ts\` (\`applyBaseline\`).

**Tests.** \`tests/theme-baseline.test.ts\`, read from the scenegraph:
- along a floor the chart did not start at zero;
- at zero inside the domain;
- gives way to the zero rule;
- not drawn twice over the axis line;
- not drawn when unstated, \`omit\`, or without a theme;
- not under a scatter.

**Effect.**
- No unthemed chart changes.
- 156 preset charts: Apple, Datawrapper, Nature, Power BI and Power BI Light state a quiet baseline, McKinsey a full one; Cartoon gains one at zero on its anomaly chart. Each draws a rule at zero or at the floor of its bars, areas and lines.
- Economist, NYT and Pop are unchanged: their axis line already is the baseline.
- 284 house charts.
`,
    decisions: [
      'The baseline is drawn over a stated quiet one too (Apple, Datawrapper, Power BI): a quiet rule a step darker than the grid, which the presets stated and never showed.',
      'London City Intelligence’s guide removes the strong baseline when the axis does not start at zero; a zero-only policy (`baseline: "atZeroOnly"`) is not offered yet. Sprout’s darker zero ink and ONS’s 1.5px weight need a baseline ink and weight of their own.',
    ],
  },
  {
    id: 'ax1',
    label: 'AX1 · Axes by side',
    title: 'AX1 — An axis is placed by the way it runs, and may be styled by the side it is drawn on',
    rule: '`structure.axis.x` / `.y` style the bottom/top and left/right axes whatever they carry, overriding the role’s settings. `AxisRole.color` gives an axis its own ink. `placement` gains `leading` / `trailing` (a vertical axis’s side; a horizontal one stays at the bottom) and the screen sides `top` / `bottom` / `left` / `right` (applied only to an axis that runs that way).',
    issue: 'axis-structure',
    kind: 'option',
    doc: `
**Problem.**
- **Style by role only.** A theme styled its axes by role (categorical / measure), in one shared ink. visx styles them by side: a 2px near-black rule along the bottom, a 1px grey one up the left. On horizontal bars the categories move to the left, so Flint moved the 2px rule there and drew both dark (Airbnb).
- **One way to move an axis.** \`placement: "opposite"\` sends the axis to the far side whichever way it runs.
  - Apple's "trailing" Y axis is a horizontal direction: on horizontal bars it should leave the value axis at the bottom, but "opposite" put it on top (the shipped preset too).
  - Salesforce wants the value scale on top of bar charts and on the left of everything else; "opposite" would also move a column chart's axis to the right.

**Design.**
- **By side.** \`structure.axis.x\` and \`.y\` take the same fields as a role and override the role's settings for whatever the axis carries. A house writes the rule it draws on the bottom once, and it stays on the bottom when the chart turns sideways.
- **Ink.** \`AxisRole.color\` sets the rule's and ticks' ink in place of \`ink.structure.axis\`; the presence still tones it.
- **Placement.**
  - \`leading\` / \`trailing\` follow the reading direction: they move a vertical axis left or right and leave a horizontal one at the bottom.
  - \`top\`, \`bottom\`, \`left\` and \`right\` name a screen side and apply only to an axis that runs that way, so \`measure.placement: "top"\` moves a bar chart's value axis and leaves a line chart's where it is.
  - \`opposite\` is unchanged.
- **The Apple preset** now states \`trailing\`, as the HIG says.

**API.** \`ThemeStructure.axis.x | y\`; \`AxisRole.color\`; \`AxisRole.placement: 'leading' | 'trailing' | 'top' | 'bottom' | 'left' | 'right'\` beside \`default | opposite\`.

**Code.** \`core/theme/types.ts\`, \`core/theme/ground.ts\` (\`buildAxis\`, \`axisOrient\`); \`core/theme/presets/apple.ts\`.

**Tests.** \`tests/theme-axis-structure.test.ts\`: trailing on columns and horizontal bars; top on bars and columns; opposite unchanged; axes styled by side in their own ink; a side overriding only what it states; a role-only theme unchanged.

**Effect.**
- No chart without a theme changes.
- **Apple** (8 charts): horizontal charts keep the value axis at the bottom, as the HIG asks; columns keep it trailing.
- 21 house charts: Airbnb (axes by side), Apple HIG and Salesforce (value scale on top of bars).
`,
    decisions: [
      'Reading direction is left to right; a right-to-left locale would mirror `leading`/`trailing`, which Flint does not yet track.',
      'A screen-side placement on an axis that does not run that way is ignored rather than reported — `top` on a theme that also draws columns is the house’s intent, not a mistake.',
    ],
  },
];

export const GRID_STAGES: Stage[] = [
  {
    id: 'gr1',
    label: 'GR1 · An omitted grid stays omitted',
    title: 'GR1 — A grid the house omits is not put back while another way to read a value remains',
    rule: 'A quiet grid is restored only where no mark prints its value and no axis draws any ruler (grid, line or ticks) — and then only the grid across the value axis, never the index axis’s.',
    issue: 'gridline-style',
    kind: 'default',
    doc: `
**Problem.** Houses that rule only horizontally write \`grid: { measure: …, category: "omit" }\`. On a scatter, though, Flint drew vertical rules at every x tick, often at full grey (Visma, VTEX, Monash; and four presets — Apple, McKinsey, Power BI, Power BI Light).

The cause was a rescue rule: where a measure axis drew no grid, line or ticks, its quiet grid returned. It was checked axis by axis. A scatter has *two* measure axes, so its x axis, with no grid by the house's choice, was always "rescued" — even with the y grid right there. The restored x grid also made x start at zero (Monash's 0% where the data start at 5%).

**Design.**
- The rescue looks at the chart, not the axis: it fires only where no measure axis draws a grid, a line or ticks.
- When it does fire, it restores only the grid across the value axis — the horizontal one on a scatter — never the index axis's.
- A house that omits everything still gets one quiet way to read a dot, as before.

**Code.** \`core/theme/ground.ts\`.

**Tests.** \`tests/theme-grid-rules.test.ts\` (GR1): no vertical rules on a horizontal-only scatter; a bare scatter gets the value grid only.

**Effect.**
- No unthemed chart changes.
- 40 preset scatters (Apple, McKinsey, Power BI, Power BI Light): the vertical grid they omit is gone, and x fits the data.
- 33 house charts.
`,
  },
  {
    id: 'gr2',
    label: 'GR2 · Each rule styled on its own',
    title: 'GR2 — Each grid and rule takes its own style, weight and ink; minor lines; a grid over the marks',
    rule: 'Each of `grid.measure`, `grid.category`, `grid.zero` and `baseline` is a presence or `{ presence, style, dash, weight, color }` (a grid also `layer`). `grid.minor` draws finer lines between the labelled ones. `grid.layer: "front"` (or a grid’s own) draws it over the marks. A presence alone reads as before.',
    issue: 'gridline-style',
    kind: 'option',
    doc: `
**Problem.** One \`style\`, one \`dash\` and one \`weight\` served every grid, and \`zero\` and \`baseline\` were bare presences. Houses could not say:
- dashed verticals beside solid horizontals (Apple);
- a zero rule at 1.5px in its own grey (ONS), or a darker zero ink (Sprout);
- faint minor lines between the labelled ones (RSS's theme_minimal, Microsoft);
- white rules cut through the marks (Sonos).

**Design.**
- **A rule object.** \`RuleSpec = Presence | { presence?, style?, dash?, weight?, color?, layer? }\`, accepted by \`grid.measure\`, \`grid.category\`, \`grid.zero\` and \`baseline\`.
  - An object states a drawn rule: without \`presence\` it is \`quiet\`.
  - What it leaves out comes from the grid's shared \`style\`, \`dash\` and \`weight\`.
  - \`color\` replaces the role's ink, and the presence still tones it.
  - The type is a union, so every existing theme reads exactly as before.
- **Zero at the floor.** Where the baseline lies at zero (A7), it takes a styled zero rule's ink, weight and dash. Sprout's darker line therefore shows where zero is the floor, and ONS's 1.5px Grey 40 is drawn as stated.
- **Minor lines.** \`grid.minor: Presence | { …rule, divisions, on }\`, default \`hairline\`, one line halfway (\`divisions: 2\`), on both grids.
  - Drawn only where the grid it divides is drawn, on continuous axes.
  - The labelled lines are the axis's stated values. Where it states none, they are computed as Vega would (the domain made nice, about one per 40px) and written onto the axis, so the minor lines fall between the lines drawn.
  - A log, padded or pinned scale is left alone and reported (\`minor-grid-not-drawn\`).
  - The lines are a rule layer drawn first, so they sit under the marks. The layer carries the axis's own title, so Vega-Lite's merge of the layers' axes keeps it.
- **Over the marks.** \`grid.layer: "front"\`, or a grid's own \`layer\`, sets the axis's \`zindex\` so its grid draws over the marks (Sonos: white year rules through the stack, the dotted value grid still behind).

**API.** \`RuleSpec\`, \`MinorGridSpec\` in \`core/theme/types.ts\`; \`ResolvedAxis.minorGrid | gridFront\`.

**Code.** \`core/theme/types.ts\`, \`core/theme/ground.ts\` (\`ruleFrom\`); \`vegalite/theme.ts\` (\`applyMinorGrid\`, \`majorGridValues\`, axis \`zindex\`, the baseline's zero ink).

**Tests.** \`tests/theme-grid-rules.test.ts\` (GR2), read from the compiled axes and the scenegraph:
- grids styled apart;
- the shared style and a grid's own;
- an object without a presence;
- zero and baseline weight and ink;
- minor lines under the marks, titles kept;
- divisions and \`on\`;
- no minor lines without their grid or without a theme;
- one grid in front.

**Effect.**
- No chart without a theme, and no preset, changes visibly; the 29 preset spec-only changes are report wording.
- 73 charts in the six houses opted in by their guides:
  - Apple: dashed verticals on continuous x;
  - ONS: 1.5px Grey 40 zero;
  - Sprout: darker zero line;
  - RSS: minor grid both ways;
  - Microsoft: minor grid on the measure;
  - Sonos: white year rules through the stack.

**Scope.** Minor lines and the grid in front are drawn by the Vega-Lite backend. Plotly reads a grid's dash and colour as before.
`,
    decisions: [
      'An object without `presence` is `quiet`, not `full`: a house that styles a grid’s dash has not asked for it to be louder.',
      'Minor lines are not drawn on log axes; a log ruler’s 2…9 subdivisions are a different rule.',
      'Apple’s label on the trailing side of its gridline and its gridline continuing as the tick (`gridContinuation`) are label and tick rules, not grid styles, and stay open.',
    ],
  },
];

export const LEGEND_STAGES: Stage[] = [
  {
    id: 'lg1',
    label: 'LG1 · Inside, where it’s clear',
    title: 'LG1 — A key inside the plot takes its corner only where the marks leave it free',
    rule: '`legend.placement: "inside"` seats the key in the plot’s top-right corner only when no mark reaches that corner; otherwise the key takes the next placement the theme ranked (else `right`), reported as `legend-inside-covered`.',
    issue: 'legend-placement',
    kind: 'default',
    doc: `
**Problem.** Sunlight ranks its key \`["inside", "right"]\`, as both its specimens draw it: in its own box at the plot's right, clear of the marks. Flint resolved \`inside\` to the top-right corner unconditionally. That is exactly where a rising line ends, where the tallest bar of a growing series stands, and where a pie's wedges are. So on most charts the key was drawn over the data. The theme was right, and the ranked list already said what to do next; nothing checked the corner.

**Design.**
- **Estimate the key's box.** One line per entry at the key's label size, as wide as the longest name plus a swatch.
- **Test the corner.**
  - A pie or donut fills its square: its corner is taken unless the plot is wide enough to leave the key beside it.
  - On a chart over two scales, each row is placed on them. A bar or area covers from zero to its value; a line or point covers its own position. Any of them reaching into the box covers the corner.
  - Where the plot or a scale is not known (a chart of several views), the key keeps the corner, as before.
- **Fall through.** A covered corner sends the key to the next placement the theme ranked, else \`right\`, reported as \`legend-inside-covered\`.

**Code.** \`core/series-end.ts\` (\`insideCornerCovered\`, \`planLegendPlacement\`), \`core/plan.ts\` (the plot passed in), \`vegalite/theme.ts\` (the report).

**Tests.** \`tests/theme-legend-inside.test.ts\`: a pie's key moves; a rising line chart's key moves; a clear corner keeps the key inside.

**Effect.**
- No preset ranks \`inside\`, so no unthemed or preset chart changes.
- Sunlight (the one house that ranks it): its pie, lines, areas, bubbles and anomaly bars move the key to the right; its grouped medals keep it inside.
`,
    decisions: [
      'Only the top-right corner is tried. A house that would rather try the top-left before leaving the plot would need `inside` to name a corner, which the schema does not yet allow.',
      'The key’s box is estimated from its entries, not measured from the drawn key; a key whose names wrap may be taller than estimated.',
    ],
  },
];

/** Each area of improvement is one tab; its fixes are stages inside it. */
export const AREAS: Area[] = [
  {
    id: 'colour',
    label: 'Colour',
    title: 'Colour system',
    intro: 'Each stage fixes one colour rule from the new-theme-test review.',
    note: `**So far**: no chart without a theme changes in any stage. Shipped presets change only in stages that fix a default, and only where the rule says they must — dots that were Vega blue, series names under 3:1, inside labels that failed 3:1, and three slightly-too-pale line inks — each listed in its stage. The option stages change nothing until a theme states them; their house changes are the houses opted in. The rules are tested in \`tests/theme-colour-rules.test.ts\`.

**Cases.** From R6 on, each fix adds the cases that show it; R1–R5 got theirs after review, compared against the code before the colour work. Every case stays in the matrix, so a later stage that moves an earlier case lists it under “Earlier cases moved”.`,
    stages: STAGES,
  },
  {
    id: 'type',
    label: 'Typography',
    title: 'Typography',
    intro: 'Each stage makes one kind of TypeRole field either drawn — and measured as drawn — or reported. Stages that change a default compare their cases against a snapshot of the code taken just before the stage.',
    note: `**So far**: no chart without a theme changes visually in any stage. Two shipped presets change, each because it states something that was ignored: **Pop** (a bold deck in T1, capital headlines in T3) and the KPI cards of **Apple**, **Power BI** and **Power BI Light** (their display role, T4). House changes are the houses whose stated weights, slopes and cases are now drawn, and in T2 the houses opted into the wider weight scale. The rules are tested in \`tests/theme-type-rules.test.ts\`.

**Measuring.** Case is applied before text is measured (headline and deck fitting, axis titles, band labels, key labels), and key labels are measured in their weight and slope, so a wider capital or bold label is laid out as it is drawn.

**Not here.** Font files (\`font-source\`): a theme names a family, and a host that wants a proprietary face loads it. Labels shrunk below the stated size belong to the axes work; type that steps with width to responsive layout.`,
    stages: TYPE_STAGES,
  },
  {
    id: 'furniture',
    label: 'Furniture',
    title: 'Furniture — the header',
    intro: 'The header first: what a chart draws on its canvas’s top edge, on a line above its headline and beside it — the furniture that takes room from the title. Each stage’s cases show it; F1 changed a default, so its cases compare against a snapshot taken just before it.',
    note: `**So far**: one shipped preset changes — **Economist**, whose tab now sits on the canvas’s top edge (the thin red line F1 also drew there was later taken out: the current charts no longer carry it), and whose header room now comes out of the plot instead of growing the canvas. No chart without a theme changes. Tested in \`tests/theme-header.test.ts\`.

**Frames.** \`canvas\` — the exported graphic’s outer edges (its top is y = 0, outside the margin); \`content\` — inside the margin, where the headline starts; \`block\` — the plot with its labels.

**Not yet.** The footer (source and notes lines, credits, bottom logos) uses the same pieces and is next; plot-surface items (a rounded frame, a plot aspect) are layout.`,
    stages: FURNITURE_STAGES,
  },
  {
    id: 'labels',
    label: 'Value labels',
    title: 'Value labels',
    intro: 'Value labels are measured as they are printed, and a bar and its label are laid out together: the band holds the label, and the room past a bar’s end is the label’s. Default-changing stages compare their cases against a snapshot taken just before the stage.',
    note: `**So far**: L1 replaces four estimates with one measurement; L2 gives the room past a bar’s end in px, inside the plot; L3 lays a band out again when its labels do not fit; L4 fixes the ink of labels that move outside and adds anchor, fallback and contrast options; L5 fits labels to stacked segments and donut rings; L6 moves an orphaned axis title into the deck. No chart without a theme is drawn differently. Tested in \`tests/value-label-rules.test.ts\`.

**Not yet.** Labels at line vertices (Visa); a value column before the bars (Datadog, Morningstar); a category name above each bar (Polaris, MetLife); the label/value pair in two weights (Sonos).`,
    stages: LABEL_STAGES,
  },
  {
    id: 'groups',
    label: 'Groups',
    title: 'Groups — bars that share a band',
    intro: 'How a group of bars shares its step: the gap between the bars in a group, the space between groups, and so the bars’ width. Default-changing stages compare their cases against a snapshot taken just before the stage.',
    note: `**So far**: G1 separates the gap inside a group from the space between groups, and lets a house state either as a share of a bar or in px. A bar’s width is always derived; the step is a guideline. No chart without a theme changes. Tested in \`tests/theme-group-rules.test.ts\`.

**Not now.** Grouped box plots and violins; ECharts and Chart.js.`,
    stages: GROUP_STAGES,
  },
  {
    id: 'marks',
    label: 'Marks',
    title: 'Marks — fills, edges, dots and order',
    intro: 'What bars, areas, wedges and dots draw, each rule kept to the marks it names. Stages are listed in the order they were measured (M5 and M6 before M3 and M4); each compares against the stage before it.',
    note: `**So far**: area edges and bar opacity no longer leak between marks (M1, M2); dots and end markers follow the house (M5); a least bar length (M6); wedges, dashes and shapes in the colours' order (M3, the one stage that changes unthemed pies); a house's wedge rules (M4). Tested in \`tests/theme-mark-rules.test.ts\`.

**Not now.** Donut centre figures, callouts and leader lines, half donuts, slice caps, single-value donuts with a grey remainder; a maximum bar width.`,
    stages: MARK_STAGES,
  },
  {
    id: 'footer',
    label: 'Footer',
    title: 'Footer — the source line',
    intro: 'What a chart draws at its foot. The chart says what (its source, optional); the theme says how it reads. Stages compare against the chart without its source.',
    note: `**So far**: S1 draws \`chart_spec.source\` as the theme's \`source\` says. No chart changes unless it gives a source. Tested in \`tests/theme-source-rules.test.ts\`.

**Not yet.** Notes lines, meta lines (date published, download), a source strip under the headline, a band behind the footer, a logo on the source's baseline.`,
    stages: FOOTER_STAGES,
  },
  {
    id: 'axes',
    label: 'Axes & labels',
    title: 'Axes and labels — names, rulers and what stands around them',
    intro: 'Category names fitted to their bands, rulers kept at the house size, what stands clear of what around the plot, the rule at the foot, the deck, and a signed field on a one-way ramp. Cases compare against a snapshot of the code taken before the area began.',
    note: `**So far**: no chart without a theme changes in any stage, except that A6 prints B rather than G where labels reach a billion. A1 changes presets where names were turned (they now sit flat, a little smaller; crowded rulers still shrink); A2 moves the Economist's time-series x labels a few pixels; A3 redraws Datawrapper's footer rule across the graphic; A5 McKinsey's heat map; A6 is an option (compaction) whose only default changes are B for billions and the separators of the old suffix fallback; A7 draws the baseline the presets state (156 preset charts); AX1 lets a theme style axes by side and place them by direction, and moves the Apple preset's horizontal value axis back to the bottom. Tested in \`tests/theme-axis-rules.test.ts\` and \`tests/theme-number-compact.test.ts\`.

**Earlier cases.** The snapshots of T4, L1–L4 and M1 now carry A2's corner clearance (and L4's A3/A4), so their guards still compare their own stage. L3's NYT guard shows one later difference: A1 fits “United States” on one line.

**Not yet.** Number locale (decimal comma, thin-space grouping); thinning category names as a house option; right-to-left reading direction; gridline rules; date label formats, units on rulers, labels on gridlines, label alignment and domain policy are skipped.`,
    stages: AXES_STAGES,
  },
  {
    id: 'grid',
    label: 'Gridlines',
    title: 'Gridlines and rules',
    intro: 'How a house draws the lines a value is read against: which grids, each in its own style, the rule at zero and the baseline, finer lines between the labelled ones, and lines over the marks. Default-changing stages compare against a snapshot taken before the area.',
    note: `**So far**: GR1 stops a grid the house omitted from being put back while another ruler remains (40 preset scatters lose a vertical grid their themes omit). GR2 is an option: every grid and rule may state its own style, weight and ink, and \`grid.minor\` and \`layer: "front"\` are new; no preset changes visibly. Tested in \`tests/theme-grid-rules.test.ts\`.

**Not yet.** A label on the trailing side of its gridline, and a gridline continuing as the tick (Apple); labels on gridlines (skipped); log-axis minor ticks; a baseline drawn only at zero (London).`,
    stages: GRID_STAGES,
  },
  {
    id: 'legend',
    label: 'Legend',
    title: 'Legend — where a house’s key sits',
    intro: 'Where the key goes when the house ranks its placements. Default-changing stages compare against a snapshot taken just before the stage.',
    note: `**So far**: LG1 tests an inside key's corner against the marks. Only Sunlight ranks \`inside\`; no preset or unthemed chart changes. Tested in \`tests/theme-legend-inside.test.ts\`.

**Later.** A placement the house lists (bottom among them) as a preference the layout weighs, with the layout work; key content and swatches are skipped.`,
    stages: LEGEND_STAGES,
  },
];
