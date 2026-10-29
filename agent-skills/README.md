# agent-skills/

Agent skills for **flint-chart** teach LLMs and IDE agents how to author
portable chart and theme specifications.

- [flint-chart-author/SKILL.md](flint-chart-author/SKILL.md) covers
    `ChartAssemblyInput`, MCP rendering, project integration, and backend
    compilation.
- [flint-theme-author/SKILL.md](flint-theme-author/SKILL.md) translates brand
    guidelines, websites, slide decks, and publication references into reusable
    custom `ThemeSpec` JSON.
- [flint-interaction-author/SKILL.md](flint-interaction-author/SKILL.md) covers
    behaviour on a chart: how an interaction works, the presets and one valid
    `interaction_spec`, the `ChartUpdate` an application or an agent applies to
    a mounted chart, reading the chart state, linking charts, and bespoke
    interactions built from a trigger and a handler.
- [flint-board-author/SKILL.md](flint-board-author/SKILL.md) covers a board of
    several charts in one live MCP card: the headline, which charts, their
    layout, links between them, and refining the board from its report.

## How agents should use flint-chart

The whole point of flint-chart is that LLMs **don't have to know low-level
chart knobs**. The agent contract is:

1. Pick a `chartType` from the registry.
2. Map fields to channels (`x`, `y`, `color`, …).
3. Annotate each field with a **semantic type** (`Quantity`, `Price`,
   `Country`, `Date`, …).

That's it. Sizing, zero baselines, color schemes, number formatting,
sort order — all derived deterministically by the compiler.

When the user wants more than a spec, the skill also tells the agent how to:

- validate and render charts with the Flint MCP server;
- install `flint-chart` (Vega-Lite included) and the library of any other backend, and import that backend's entry;
- call `assembleVegaLite`, `assembleECharts`, or `assembleChartjs` in JS/TS;
- use the Python package when it is published in a later release.

See the relevant skill for its full output contract, references, worked
examples, and validation checklist.
