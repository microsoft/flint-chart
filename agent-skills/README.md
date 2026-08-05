# agent-skills/

Agent skills for **flint-chart** teach LLMs and IDE agents how to author
portable chart and theme specifications.

- [flint-chart-author/SKILL.md](flint-chart-author/SKILL.md) covers
    `ChartAssemblyInput`, MCP rendering, project integration, and backend
    compilation.
- [flint-theme-author/SKILL.md](flint-theme-author/SKILL.md) translates brand
    guidelines, websites, slide decks, and publication references into reusable
    custom `ThemeSpec` JSON.

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
- install `flint-chart` and the needed renderer peer dependencies;
- call `assembleVegaLite`, `assembleECharts`, or `assembleChartjs` in JS/TS;
- use the Python package when it is published in a later release.

See the relevant skill for its full output contract, references, worked
examples, and validation checklist.
