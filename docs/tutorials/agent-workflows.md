# Agent workflows

This guide walks through a Data Formulator-style integration: a custom agentic
product where the agent helps create a chart, but the host owns data execution,
validation, state, UI controls, compilation, rendering, and review.

If you only want to connect Flint as an MCP tool in a chat or IDE client, start
with [Set up Flint MCP](/documentation/setup-flint-mcp). This page focuses on
library-style integration: the pattern used by products like
[Data Formulator](https://github.com/microsoft/data-formulator), where the agent
can propose data shaping and a chart request, while the product controls what
actually runs and what gets stored.

## The core idea

Do not ask the agent to write Vega-Lite, ECharts, Chart.js, or renderer code as
the primary artifact. Ask it to write a Flint `ChartAssemblyInput`:

```jsonc
{
  "data": { "values": [/* rows, or bound by the host */] },
  "semantic_types": {
    "month": "YearMonth",
    "product": "Category",
    "revenue": "Quantity"
  },
  "chart_spec": {
    "chartType": "Line Chart",
    "encodings": {
      "x": { "field": "month" },
      "y": { "field": "revenue" },
      "color": { "field": "product" }
    }
  }
}
```

This makes the chart request small, inspectable, and editable. Flint's compiler
derives the lower-level chart decisions: axis types, zero baselines, temporal
parsing, number formatting, color defaults, sizing, layout, and backend-specific
mark details.

Think of Flint as the semantic chart layer between an agent and a renderer:

```text
user intent + data context
        ↓
agent proposes data preparation + ChartAssemblyInput
        ↓
host validates fields, schema, policy, and backend support
        ↓
Flint compiles to Vega-Lite / ECharts / Chart.js
        ↓
product renders, stores, edits, or asks the agent for a revision
```

## Product responsibilities

In a custom workflow, the agent should not own the whole visualization system.
Give each part a clear job:

| Layer | Responsibility |
|------|----------------|
| Agent | Interpret the user request, inspect data context, propose transformations, choose semantic types, and draft or revise `chart_spec`. |
| Host product | Execute data transforms, bind rows, validate fields, enforce policy, store chart state, expose UI controls, and choose the backend. |
| Flint | Compile the semantic chart request into backend-native chart specs with deterministic design defaults. |
| Renderer | Draw the backend spec in the browser, notebook, service, or export pipeline. |

That split is what makes the workflow robust. The agent works at the semantic
level, where language models are useful. The product keeps control of execution,
state, security, and user experience. Flint handles the visualization rules that
should not live in prompts.

## Store Flint input as chart state

Store the Flint input, not the generated backend JSON, whenever you can.

- **DataSpec** is the `data` and `semantic_types` section. It tells Flint what
  columns exist and what they mean.
- **ChartSpec** is the `chart_spec` section. It tells Flint which chart template
  to use and how fields map to channels.

The stored input is usually small enough for a product database, a notebook
cell, a dashboard config, or a conversation state object. It also stays editable:
your UI can change a channel, chart type, sort option, size, or chart property
without asking the agent to regenerate low-level backend JSON.

Compile backend specs on demand:

```ts
import { assembleChartjs, assembleECharts, assembleVegaLite } from 'flint-chart';

const vegaLiteSpec = assembleVegaLite(input);
const echartsOption = assembleECharts(input);
const chartjsConfig = assembleChartjs(input);
```

Install only the renderer dependencies your product needs:

```bash
npm install flint-chart
npm install vega vega-lite vega-embed  # browser Vega-Lite rendering
npm install echarts                    # ECharts rendering
npm install chart.js                   # Chart.js rendering
```

Python support will use the same input shape, but it is planned for a later
release and is not part of the first public launch. For now, use the npm package
or the MCP server in released workflows.

## Give the agent the authoring skill

The chart-author skill lives at
[agent-skills/flint-chart-author/SKILL.md](https://github.com/microsoft/flint-chart/blob/main/agent-skills/flint-chart-author/SKILL.md).
Use it as a reference instruction in your agent prompt, tool description, or
retrieval context.

The skill is important when the agent does not have the library installed or
cannot call a live catalog tool. It contains the exact chart type names,
supported channels, chart properties, semantic types, and data-binding rules.

The durable instruction for the agent is:

- choose semantic types for fields, such as `YearMonth`, `Quantity`,
  `Category`, `Price`, `Profit`, or `Percentage`;
- choose a supported `chartType` by exact name;
- bind real fields to supported channels like `x`, `y`, `color`, `row`,
  `column`, `size`, or `group`;
- transform data before Flint when the requested view needs aggregation,
  filtering, joins, pivots, derived columns, or wide/long reshaping;
- return Flint input, not backend-native JSON, unless the user is explicitly
  asking for a post-Flint backend customization.

## Walkthrough: Data Formulator-style authoring

Imagine a Data Formulator-style product with a raw `orders` table. The user asks:

```text
Show monthly revenue by region.
```

The raw table has columns like:

| Field | Example | Meaning |
|-------|---------|---------|
| `order_date` | `2025-01-17` | Date of each order |
| `region` | `West` | Sales region |
| `segment` | `Consumer` | Customer segment |
| `sales` | `1240.50` | Revenue for the order |
| `profit` | `310.20` | Signed profit for the order |

The user did not ask for a chart over individual orders. They asked for a
monthly aggregate, so the product should not ask the agent to hide aggregation
inside a Vega-Lite transform. The product should ask for two things:

1. code or a declarative plan that creates the chart-ready table;
2. a Flint `ChartAssemblyInput` for that derived table.

### 1. Send compact context to the agent

The host sends the user request plus a data profile. It usually does not need to
send the whole dataset.

```text
Use the Flint chart authoring skill.

User request: Show monthly revenue by region.

Current table: orders
Fields:
- order_date: Date, examples 2025-01-17, 2025-01-22
- region: Category, examples West, East, Central, South
- segment: Category, examples Consumer, Corporate
- sales: Quantity, numeric, non-negative
- profit: Profit, numeric, signed

Return one JSON object with:
- transform_code: Python pandas code that creates a chart-ready DataFrame named chart_df
- chart_input: a Flint ChartAssemblyInput for chart_df

Do not write Vega-Lite, ECharts, Chart.js, or renderer code.
Use only fields produced by chart_df in chart_input.
Leave chart_input.data.values empty; the host will bind rows after executing the transform.
```

### 2. Let the agent propose data shaping and Flint input

A good response separates the data transformation from the chart request:

```jsonc
{
  "transform_code": "import pandas as pd\nchart_df = orders.copy()\nchart_df['month'] = pd.to_datetime(chart_df['order_date']).dt.to_period('M').astype(str)\nchart_df = chart_df.groupby(['month', 'region'], as_index=False).agg(revenue=('sales', 'sum'))",
  "chart_input": {
    "data": { "values": [] },
    "semantic_types": {
      "month": "YearMonth",
      "region": "Region",
      "revenue": "Amount"
    },
    "chart_spec": {
      "chartType": "Line Chart",
      "encodings": {
        "x": { "field": "month" },
        "y": { "field": "revenue" },
        "color": { "field": "region" }
      }
    }
  }
}
```

The important property is the split: the agent does not smuggle aggregation into
backend JSON, and the Flint input references only fields that will exist in the
derived table.

### 3. Execute and inspect in the host

The product executes `transform_code` in its own trusted or sandboxed compute
path, then inspects `chart_df` before rendering. For example:

```text
month    region   revenue
2025-01  East     18420.50
2025-01  West     21310.10
2025-02  East     19770.00
2025-02  West     22640.75
```

At this point the host can reject the result if the code uses unknown columns,
creates too many rows, produces unexpected nulls, or fails a policy check. The
agent proposed the operation; the product decides whether to run and keep it.

### 4. Bind rows and compile with Flint

After execution, the host fills `chart_input.data.values` with rows from
`chart_df` and compiles the chart.

```ts
import { assembleVegaLite } from 'flint-chart';

const chartInput = {
  ...agentResult.chart_input,
  data: { values: chartRows },
};

const vegaLiteSpec = assembleVegaLite(chartInput);
```

The same stored Flint input can later be compiled to a different backend:

```ts
import { assembleECharts } from 'flint-chart';

const echartsOption = assembleECharts(chartInput);
```

### 5. Build the UI around Flint state

In a Data Formulator-style UI, the product can show both artifacts:

- the derived data view (`chart_df`) so the user can inspect the table being
  charted;
- the ChartSpec controls so the user can change chart type, channels, sort, size,
  or chart properties without editing backend JSON.

If the user says "split this by segment too," the host can ask the agent for a
revision, or it can expose a direct UI operation that adds `segment` to
`column`, `row`, or `color` depending on the chart design. Either way, the
revision changes the Flint input and then recompiles.

### 6. Keep backend tweaks downstream

If the product needs a backend-specific annotation or interaction, apply that
after Flint compiles the semantic chart. Keep the Flint input as the canonical
state; treat patched Vega-Lite or ECharts JSON as a render-time artifact.

## Reusable prompt templates

For product integration, use stricter prompts than you would in free-form chat.
Ask the agent for a machine-readable object your system can validate. When the
data view is already chart-ready, ask only for Flint input:

```text
Use the Flint chart authoring skill.

Return only a valid ChartAssemblyInput JSON object.
The current data view has fields: month, product, revenue, profit.
Create a monthly revenue trend by product.
Infer semantic_types, use only fields that exist, and do not write Vega-Lite,
ECharts, Chart.js, or renderer code.
```

When the data is not chart-ready, ask for transformation code plus Flint input:

```text
Use the Flint chart authoring skill.

From the orders table, create monthly revenue by region.
Return one JSON object with:
- transform_code: Python pandas code that creates a chart-ready DataFrame named chart_df
- chart_input: a Flint ChartAssemblyInput for the transformed rows

The chart_input.data field should be empty or placeholder rows. The host will
execute the code, inspect the derived table, and bind data.values afterward.
```

Your system can then parse the JSON, validate it, execute or reject the transform,
store the accepted Flint input, compile it, render a preview, or send concrete
feedback back to the agent.

## Validate before rendering or saving

Validation belongs in the host, not only in the prompt. Before accepting an
agent-authored chart, check:

- every encoded field exists in the current or derived data view;
- `semantic_types` use Flint's registered labels rather than invented names;
- the `chartType` is allowed for the selected backend and product surface;
- encoded channels are supported by that chart type;
- required channels are present;
- local policy allows the requested backend, data size, chart size, and file
  access pattern;
- derived data shaping happened upstream of Flint, not through invented Flint
  transform properties.

If your product uses the MCP server internally, `validate_chart` can perform a
separate server-side validation pass. If your product embeds the library
directly, call the relevant assembler in a try/catch and surface warnings or
errors in your own review UI.

## Build an editing loop

After the first chart renders, keep revisions semantic. Ask the agent or UI to
change the Flint input, not the backend spec:

| User intent | Product action |
|-------------|----------------|
| "Compare regions side by side" | Change chart type or route the region field to `group`, `color`, `column`, or `row`, depending on the chart family. |
| "Show profit instead of revenue" | Replace the measure field in `chart_spec.encodings`. |
| "Use a small multiple view" | Move the grouping field to `column` or `row` when the chart supports facets. |
| "Make it a donut" | Keep `Pie Chart` and set `chartProperties.innerRadius`. |
| "Try ECharts" | Recompile the same Flint input with `assembleECharts`. |

This keeps user edits cheap and deterministic. The agent is useful for ambiguous
intent, data transformation, or chart design suggestions. Routine UI edits can
modify the ChartSpec directly.

## Use backend customization only after Flint

Some product requirements are backend-specific: annotations, exact axis styling,
custom mark decorations, or a renderer-specific interaction. Keep those changes
after the Flint compile step.

Recommended path:

1. Store the Flint input as the canonical chart state.
2. Compile it to the target backend.
3. Apply the smallest backend-specific presentation patch.
4. Render the patched backend spec.

Do not feed patched Vega-Lite, ECharts, or Chart.js JSON back into Flint. Once
you edit backend JSON, it is no longer portable Flint state.

## A practical host loop

A typical custom agent implementation looks like this:

1. Collect the user's request and a compact data profile: column names, sample
   rows, semantic hints, cardinalities, min/max values, and known units.
2. Ask the agent for either a `ChartAssemblyInput` or transformation code plus a
   `ChartAssemblyInput`.
3. Execute transformations in a sandbox or trusted compute path owned by the
   product.
4. Bind `data.values` from the current or derived table.
5. Validate fields, semantic types, chart type, channels, backend support, size,
   and policy.
6. Store the Flint input as canonical chart state.
7. Compile to the selected backend and render.
8. Let UI controls or the agent revise the Flint input, then repeat from
   validation.

That loop lets Flint serve as a stable contract between natural-language chart
intent and production rendering.

## Next steps

- [Getting started](/documentation/getting-started) explains the DataSpec and
  ChartSpec shape with a tiny first chart.
- [Example: a data story](/documentation/data-story) shows how one source data
  view can become several chart designs by changing only the ChartSpec.
- [Set up Flint MCP](/documentation/setup-flint-mcp) explains how to expose
  Flint as an MCP server when you want a ready-made agent tool surface.
- [Vega-Lite charts](/documentation/reference-vegalite),
  [ECharts charts](/documentation/reference-echarts),
  [Chart.js charts](/documentation/reference-chartjs), and
  [Plotly charts](/documentation/reference-plotly) list supported chart
  types by backend.
- [Semantic Type](/documentation/semantic-types) lists the labels the agent can
  use for fields.