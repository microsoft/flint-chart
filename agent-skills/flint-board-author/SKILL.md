---
name: flint-board-author
description: "Use when: several Flint charts should be read together in one view: a dashboard, KPI tiles over a trend, a side-by-side comparison, an overview with its detail; or a board on screen should change (add, retitle, resize, reconnect a chart). Produce one board spec whose headline, chart choice, layout and connected fields are decided, and put it on screen with show, which checks it and returns any fixes before drawing."
---

# flint-board: several charts, one view

A board holds several Flint charts under one headline. The agent writes it as
one board spec and puts it on screen with `show({ "board": … })`, which opens a
new card below the conversation's latest message. `show` checks the spec
first: when something must be fixed it draws nothing and returns the fixes, so
there is no need to validate first. The server keeps nothing between calls:
the spec in the conversation is the board; to change it later, change the
spec and call `show` again.

A board is for when the user asks for several views read together: a
dashboard, an overview, KPI tiles, linked charts, or several charts named in
one turn. An open question is not a request for a board: it gets one chart
(the `flint-chart-author` skill), and the reply offers the next views. One view split by a category
(a panel per region, same measure) is one chart with `column` or `row`, not a
board. Two charts side by side need only a title; the headline, deck, KPI
tiles and links below are for a fuller board, used as far as it helps.

Each chart on a board is a full chart spec (`flint-chart-author`), plus an
`id` and a `layout`. This skill covers what a board adds: the headline, which
charts, where they sit, how they connect, and how they look as one piece.

Work through the steps in order, then call `show` once.

## Step 1 — write the headline

The board's `title` is what the reader takes away, or what the board is for,
in one line. Its `subtitle` is the deck: the data, its scope, period and
units. `source` is the footer: where the data comes from and when.

```
title:    "Europe carried the third-quarter recovery"
subtitle: "Monthly revenue by region and product line, Jan–Sep 2025, $m"
source:   "Source: finance ledger, closed books to 30 Sep 2025"
```

A monitoring board with no single finding names its purpose instead:
`"Operations at a glance"`. The card draws the title largest, so it is the
first thing read; every board gets one.

## Step 2 — choose the charts

Start from the questions the reader brings, one chart per question, and keep
the board to the charts that answer them: three to five KPI tiles and up to
six charts. More than that is two boards.

Each card has to answer something no other card on the board answers:

- Two charts of the same fields (the same measure by the same category, in
  another form or sort) are one chart.
- A KPI tile is for a number the reader steers by and no chart prints. A
  count of the rows ("12 albums") or a number a chart already shows at a
  glance is not a tile.
- Small data holds few questions. A table of a few dozen rows or less makes
  one or two charts, and tiles only where the user asked for them.
- An open request ("an overview", "a dashboard on …") takes the three or four
  questions the data answers best, not every one it can.

| The reader asks | Chart |
|---|---|
| How are we doing on the numbers we steer by? | `KPI Card` per number, with `goal` when there is a target |
| How did it move over time? | `Line Chart` (few series), `Area Chart` (parts of a total) |
| Which is largest, how do they rank? | `Bar Chart` sorted by value, `Bar Table` for many rows with labels |
| Which records are behind it? | `Table`: the rows as given, one column per field, `encodings: {}` |
| What is it made of? | `Stacked Bar Chart`, or `Pie Chart` with `innerRadius` for up to five parts |
| How do two measures relate? | `Scatter Plot` |
| Where? | `Choropleth`, `Map` |
| How is it spread? | `Histogram`, `Boxplot` |
| Each series' trend at a glance | `Sparkline` |

Pick the lead chart, the one the headline is about, and put it first after the
KPI tiles. The charts after it explain it: a breakdown, a ranking, a relation.

Give each chart its own data, aggregated to what it draws: a bar, a slice or
a cell is one row. Rows that repeat a category (monthly rows under a by-product
bar) draw as a stack of thin slices; sum them first, or set the measure's
`aggregate: "sum"`. A KPI tile takes
one row: `{ metric, value, goal }`. It draws progress only when `value` and
`goal` are both numbers. Pass raw numbers and declare the value field's unit
in `semantic_types`: the tile prints `{ "semanticType": "Amount", "unit": "USD" }`
as `$1.18M`, a `Percentage` of 0.378 as `37.8%`, and compacts amounts and
counts from 10,000 up. A value already scaled says so in `metric`
(`"Revenue, $m"`) and is not compacted again. A string `value` prints as given.

## Step 3 — give each chart a heading

Each chart draws its own `title` and `subtitle` in its theme, as on its own
card. Write the title as the chart's finding, one line at half width (a
wrapped title pushes its plot down), and the subtitle as its units:

```
title:    "Europe climbed every month after the April dip"
subtitle: "Revenue by region, $m"
```

A `KPI Card` names itself with its `metric` field and needs no title.

## Step 4 — place them

The board is a grid of `columns` (default 2 once it has two charts that are
not KPI tiles). Charts fill rows in the order given:

- **KPI Cards in a row** share one row, up to four; a short row spreads its tiles.
- **`layout.span`** is how many columns a chart takes. Time series, maps and
  Gantt charts take the full row by default; everything else takes one column.
  A row left short stretches to the full width.
- **`layout.height`** is `compact` (~130 px), `standard` (~280 px, the default)
  or `tall` (~420 px). A row takes its tallest chart's height, so the plots of
  a row line up. A time series alone in its row defaults to `tall`: Flint
  banks a line toward readable slopes, and the height is what lets it spread
  across the width.

| Shape | Layout |
|---|---|
| KPI row, lead trend, two explaining charts | tiles; trend (full row); two charts (one column each) |
| Side-by-side comparison | `columns: 2`, both charts `span: 1`, same height |
| Overview with its detail | detail `span: 2, height: tall`; overview strip below it `height: compact` |
| Many small series | one `Sparkline` chart, `height: compact` or `standard` |

On a narrow card each chart takes its own row; the layout needs no second version.
`layout` is the only size a board chart takes: leave `baseSize` and `canvasSize`
out of its `chart_spec`, which the board does not use.

**`view: "table"`** on a chart opens its cell on the table of the rows the chart
draws; the reader can switch it back. Use it when the numbers matter more than
the shape.
A `Table` is a table either way.

## Step 5 — connect them, where it helps

Link charts when a selection in one should show up in the others: the user
asks to filter or explore across them, or the board is a dashboard on shared
dimensions. Charts that only sit side by side need no `link_spec`, and no
interactions either: on a board, a chart's `interaction_spec` is what sends a
selection, so add one only to a linked chart, or where the user asked for that
behaviour on that chart. Connect by the fields they share, not chart by chart:

```json
"link_spec": { "fields": ["product", "region"] }
```

A link emphasises; it never filters. The matching marks stay at full ink and
the rest recede, while every total, axis and KPI tile stays as drawn. When the
user asks for a click to filter the other charts, link them and say in the
reply that the other charts highlight the selection rather than recompute.

The board holds one selection that every chart shares, a part per field: a
click on Asia sets `region` to Asia, a brush over March to June then adds
`month` from March to June, and every chart shows the marks that meet both
parts on the fields it carries; a chart that carries neither stays as drawn.
A new selection on a field the board already holds replaces that part. A click
on nothing in any chart, Escape, or the selection chip under the headline
clears the whole selection everywhere.

What a selection sets comes from the interaction that made it: a click on a
mark sets every connected field the mark carries, a series or group focus its
group field, a brush its axis field as a range, an axis highlight that axis's
field. A hover interaction (`hover-group-focus`, or `axis-highlight` with
`event: "hover"`) previews its part over the selection for as long as the
pointer stays.

Connect on the fields the reader thinks in: categories with about a dozen
values or fewer, and the dimension the board is about. A chart takes part as
far as it can:

- **It receives a field** when its marks carry it. Marks carry the fields the
  chart encodes; when a chart shows the field nowhere else, encode it on
  `detail` (`encodings.detail: "product"`). A bar chart of another category
  then splits each bar into segments of its colour, one per value, so a
  selection lights up that value's share of every bar; never move the field to
  `color` for this. Titles and subtitles say what a chart shows, never how it
  links.
- **It sends** when it also has an interaction that selects, in its
  `interaction_spec`; pick the one whose subject is what the reader will ask
  about:

  | Chart | Interaction |
  |---|---|
  | Bar, Stacked Bar, Pie, Heatmap, Choropleth, Map | `click-highlight` |
  | Line | `click-group-focus` (a series), `brush-x` (a period), `hover-group-focus` (a series, on hover) |
  | Scatter Plot | `select` (drag a region) |

- **`charts`** sets a chart apart: `{ "trend": { "receive": false } }` keeps an
  overview as drawn while it still sends; `send: false` keeps a chart's own
  selections to itself.

The report's `Links:` section says what each chart sends and receives, and
why a field is left out.

Colour does the quiet linking: charts that colour by the same field (on
`color`, or `group` on a grouped bar chart) get one value order, so a value
keeps one colour across the board. To fix the colours themselves, set `colors`
on the board, per field: `"colors": { "Category": { "Jewelry": "#c0392b" } }`.
Every chart that colours by the field takes them, whatever theme the board or
the reader picks; values left out take the palette. Pass the same map again in
a later turn so the next card keeps them.

## Step 6 — theme the board once

Set `theme_spec` on the board, not on the charts. Every chart takes it and
draws its own furniture (the Economist's red tab); the board's headline and
footer take its paper, ink and fonts, with the furniture above the headline.
Pick it with `list_themes` as for one chart.

## Step 7 — read the report

`show` returns the layout in one line, then at most two sections. It does not
repeat the spec.

- **Fix before it draws.** Nothing is on screen: errors (a chart that does
  not compile), rows drawn as slices (sum them first), a chart that has a
  linked field in its data but does not carry it, a link field fewer than two
  charts carry. Fix each in the spec and call `show` again with the whole
  spec. An item you cannot fix, such as an interaction a chart cannot take, is
  something to tell the user.
- **Noted.** The board is on screen and draws with these: warnings, update
  ops that will not apply, what linked charts leave out, and a review (a
  missing deck or chart title, more tiles or charts than a board reads well
  with). Change nothing now unless the user asks; mention what matters in the
  reply, and fix the rest the next time the spec changes.

`validate_board` gives the same report without drawing, for a host with no
card UI.

What the reader then does on the card reaches the model with their next
message: selections and link emphasis, one section per chart. The reader's
changes live on that card only, and the context says how to keep each one in
the next `show`:

- **A theme** picked in the bar applies to every chart. To keep it, pass that
  `theme_spec` on the board and leave it out of the charts.
- **An arrangement** made with **Edit layout** (moving, swapping, resizing
  charts on a 12-column grid). To keep it, pass the `grid` the context gives.
  `Layout:` then reads "the reader's grid". A chart added to the
  spec takes a place below the rest and a chart left out drops its place;
  leave `grid` out to lay the board out in rows again, only when the user asks
  for a new layout.

Leave out what the user asked to change, and keep the rest: a `show` without
them gives the reader back the agent's theme and rows.

## Worked example

The board spec, passed as it is as `board` to `show`:

```json
{
  "title": "Europe carried the third-quarter recovery",
  "subtitle": "Monthly revenue by region and product line, Jan–Sep 2025, $m",
  "source": "Source: finance ledger, closed books to 30 Sep 2025",
  "theme_spec": "economist",
  "charts": [
    { "id": "k-revenue", "data": { "values": [{ "metric": "Revenue, Q3 ($m)", "value": 38.6, "goal": 36 }] },
      "chart_spec": { "chartType": "KPI Card", "encodings": { "metric": "metric", "value": "value", "goal": "goal" } } },
    { "id": "k-margin", "data": { "values": [{ "metric": "Gross margin, %", "value": 37, "goal": 40 }] },
      "chart_spec": { "chartType": "KPI Card", "encodings": { "metric": "metric", "value": "value", "goal": "goal" } } },
    { "id": "trend", "data": { "url": "./flint-data/revenue-by-month.csv" },
      "semantic_types": { "month": "YearMonth", "region": "Category", "revenue": "Amount" },
      "chart_spec": { "chartType": "Line Chart", "title": "Europe climbed every month after the April dip",
        "subtitle": "Revenue by region, $m", "encodings": { "x": "month", "y": "revenue", "color": "region" } },
      "interaction_spec": { "interactions": [{ "type": "click-group-focus" }] } },
    { "id": "by-product", "data": { "url": "./flint-data/revenue-by-product.csv" },
      "semantic_types": { "product": "Category", "region": "Category", "revenue": "Amount" },
      "chart_spec": { "chartType": "Bar Chart", "title": "Analytics leads in every region",
        "subtitle": "Revenue by product, Jan–Sep, $m", "encodings": { "y": "product", "x": "revenue", "color": "region" } },
      "interaction_spec": { "interactions": [{ "type": "click-highlight" }] } },
    { "id": "margin", "data": { "url": "./flint-data/revenue-by-product.csv" },
      "semantic_types": { "product": "Category", "region": "Category", "revenue": "Amount", "margin": "Percentage" },
      "chart_spec": { "chartType": "Scatter Plot", "title": "Security earns the widest margin",
        "subtitle": "Revenue vs gross margin, by product and region",
        "encodings": { "x": "revenue", "y": "margin", "color": "region", "detail": "product" } } }
  ],
  "link_spec": { "fields": ["product", "region"] }
}
```

Rows: two KPI tiles; the trend across the row, tall; the bar chart and the
scatter side by side. A click on one segment of a product's bar lights that
product's points on the scatter and the segment's region on the trend; a click
on a region's line lights that region on the bars and the scatter.

## Checklist

- [ ] `title` says the finding or the purpose; `subtitle` says data, scope, period, units; `source` is set.
- [ ] Three to five KPI tiles at most, up to six charts, the lead chart first after the tiles.
- [ ] On a board of three or more charts or with KPI tiles, every chart but a tile has a one-line `title` and a units `subtitle`.
- [ ] `layout` set where the default is wrong: the lead chart wide, a comparison at equal spans and heights.
- [ ] If the charts are linked: `link_spec.fields` names the shared dimensions; each chart that should take part encodes them and, to send, has the interaction whose subject the reader asks about.
- [ ] `theme_spec` on the board only.
- [ ] `show` drew the board; what it noted is in the reply where it matters.
- [ ] In a later turn: the reader's theme and `grid` from the context are kept unless the user asked to change them.
