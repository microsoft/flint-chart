<h1><img src="assets/flint-logo.svg" alt="" width="42" align="absmiddle"> Flint: A Visualization Language for the AI Era</h1>

[![npm: flint-chart](https://img.shields.io/npm/v/flint-chart.svg?label=npm%3A%20flint-chart)](https://www.npmjs.com/package/flint-chart)
[![npm: flint-chart-mcp](https://img.shields.io/npm/v/flint-chart-mcp.svg?label=npm%3A%20flint-chart-mcp)](https://www.npmjs.com/package/flint-chart-mcp)
[![arXiv: 2607.20775](https://img.shields.io/badge/arXiv-2607.20775-b31b1b.svg)](https://arxiv.org/abs/2607.20775)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Discord](https://img.shields.io/badge/discord-chat-green?logo=discord)](https://discord.gg/hnm4Y8YX8)

[**Project site**](https://microsoft.github.io/flint-chart/) ·
[**中文主页**](https://microsoft.github.io/flint-chart/#/zh) ·
[**MCP server**](https://microsoft.github.io/flint-chart/#/mcp) ·
[**Gallery**](https://microsoft.github.io/flint-chart/#/gallery)

Flint lets AI agents **reliably create expressive, good-looking and interactive
charts** from simple, human-editable specs. Good-looking charts usually take
verbose low-level settings that tangle visual, style and interaction logic
together; Flint moves that work into a compiler, so the spec stays short.

Use it as an [MCP server](https://microsoft.github.io/flint-chart/#/mcp) with your
agent, or as an [npm library](https://www.npmjs.com/package/flint-chart) in your
app. Flint supports **52 chart types across 5 rendering backends**
([Vega-Lite](https://vega.github.io/vega-lite/), [ECharts](https://echarts.apache.org/),
[Chart.js](https://www.chartjs.org/), [Plotly](https://plotly.com/javascript/) and
native Excel charts), with **14 preset themes** and **23 interaction presets**.

https://github.com/user-attachments/assets/c1cda0fa-3ea7-41af-b3fd-a127bc83d641

<p align="center">
  <sub>🔊 Click the speaker icon for sound</sub>
  &nbsp;
  <a href="https://youtu.be/JAJy7ToczMs"><img src="https://img.shields.io/badge/Watch%20on-YouTube-FF0000?logo=youtube&logoColor=white" alt="Watch on YouTube" align="absmiddle"></a>
</p>

## Updates

- **November 15, 2026** — Flint 1.1 brings maps and layout: maps with
  customizable boundaries, globes, routes and labelled points, framed to their
  data; charts that fit their canvas on every backend; and annotations as
  captions beside what they name.
  ([release notes](https://github.com/microsoft/flint-chart/releases/tag/1.1))
- **October 19, 2026** — Flint 1.0 introduces
  [Flint Interactive](https://microsoft.github.io/flint-chart/#/interactions):
  interaction presets, semantic events, and an interaction API that connects
  charts to your app.

See the [changelog](CHANGELOG.md) for every release.

## Quick start

### With your agent (MCP server)

Paste this into your agent, such as GitHub Copilot, Claude Code, Codex or Cursor.
It adds the Flint MCP server and draws your first chart:

```text
Help me set up Flint as an MCP server named "flint"!

1. Add it to my client config, using whichever option my client supports:
   - a local (stdio) server: npx -y flint-chart-mcp
   - the hosted server over HTTP: https://flint.data-formulator.ai/mcp
2. Verify the setup by listing the available Flint chart types.
3. Show me a fun first chart: how many moons each planet has, in a Flint theme you like.
```

Then ask for charts in your own words, such as *"compare today's change for
the Magnificent Seven stocks in Economist style, and let me hover to read each
one"*. The agent opens a live chart in the conversation, or returns a PNG, an
SVG or a backend-native spec. To set it up by hand, see the
[MCP server guide](https://microsoft.github.io/flint-chart/#/mcp).

<p align="center">
  <img src="docs/figs/flint-mcp-chat.png" alt="An agent chat where the user asks for global temperatures since 1880 in a newspaper style with brushing, and Flint answers with a live, interactive line chart." width="520">
</p>

### In your app (npm library)

```bash
npm install flint-chart
```

```tsx
import type { ChartAssemblyInput } from 'flint-chart';
import { FlintChart } from 'flint-chart/react';

const spec: ChartAssemblyInput = {
  data: { values: [
    { Month: '2026-01', Users: 1200 },
    { Month: '2026-02', Users: 1800 },
  ] },
  semantic_types: { Month: 'YearMonth', Users: 'Quantity' },
  chart_spec: { chartType: 'Line Chart', encodings: { x: 'Month', y: 'Users' } },
  theme_spec: 'economist',
  interaction_spec: { interactions: [{ type: 'inspect-index' }] },
};

<FlintChart spec={spec} />
```

`flint-chart` comes with every backend it draws with; React is an optional peer,
needed only for `<FlintChart>`. Without React, `mountChart` from
`flint-chart/interactive` mounts the same chart in any page, and
`assembleVegaLite`, `assembleECharts`, `assembleChartjs`, `assemblePlotly` and
`assembleExcel` compile a spec into each library's own. To have your coding agent
build it, point it at Flint's
[chart](agent-skills/flint-chart-author/SKILL.md) and
[interaction](agent-skills/flint-interaction-author/SKILL.md) authoring skills.

## How it works

A Flint spec is the data, semantic types, a chart spec, and optional theme and
interaction specs. Instead of leaving the glue to you, the compiler resolves
each part against the others and composes a complete spec for the backend.

<p align="center">
  <img src="docs/figs/flint-compilation-pipeline.png" alt="A Flint spec with semantic types, theme and interaction compiled into a Vega-Lite spec and rendered as a temperature heatmap." width="100%">
</p>

- **Describe data with semantic types.** Fields carry types such as `Rank`,
  `YearMonth`, `Delta` or `Temperature`, with their domains and units, and the
  compiler infers parsing, scales, axes, formatting and colors from them.
- **Build charts with library-agnostic chart specs.** Charts name a chart type
  and its encodings; the compiler sizes, spaces and labels them for their data,
  and the same spec renders on every backend.
  See the [gallery](https://microsoft.github.io/flint-chart/#/gallery).
- **Unify the look with a theme spec.** Pick a preset such as the New York
  Times, the Economist or Swiss, or extend one with your brand:
  `{ extends: 'economist', id: 'our-brand', ink: { series: { single: '#6b3fa0' } } }`.
  See the [theme explorer](https://microsoft.github.io/flint-chart/#/themes) and
  the [Theme Lab](https://microsoft.github.io/flint-chart/#/theme-lab).
- **Add interactions with an interaction spec.** Brushing, hover readouts,
  legend toggles and more; the compiler turns a reader's gestures into semantic
  events, so your app answers with high-level chart updates.
  See the [interaction gallery](https://microsoft.github.io/flint-chart/#/interactions/gallery)
  and [advanced interactions](https://microsoft.github.io/flint-chart/#/interactions/advanced).

## Documentation

- [Project site](https://microsoft.github.io/flint-chart/): gallery, live editor, themes and interactions
- [API reference](docs/api-reference.md), with backend references for
  [Vega-Lite](docs/reference-vegalite.md), [ECharts](docs/reference-echarts.md),
  [Chart.js](docs/reference-chartjs.md), [Plotly](docs/reference-plotly.md) and
  [Excel](docs/reference-excel.md)
- [Theme guide](docs/theme-spec.md), [interaction spec](docs/interaction-spec.md)
  and [interaction API](docs/interaction-api.md)
- [MCP server guide](https://microsoft.github.io/flint-chart/#/mcp) and [agent skills](agent-skills/)
- [Paper on arXiv](https://arxiv.org/abs/2607.20775)

A Python port is in preview as source in [`packages/flint-py`](packages/flint-py);
its package is not yet released.

## Contributing

Contributions are welcome, especially new
[chart templates](docs/adding-a-chart-template.md) and
[rendering backends](docs/adding-a-backend.md). See
[CONTRIBUTING](.github/CONTRIBUTING.md), and the
[development guide](docs/DEVELOPMENT.md) for setup, commands and the repository
layout. Pick up an [issue](https://github.com/microsoft/flint-chart/issues), add
a chart template or a theme, or share what you build.

<a href="https://github.com/microsoft/flint-chart/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=microsoft/flint-chart" alt="Contributors to Flint">
</a>

## Community

Join the [Flint Discord](https://discord.gg/hnm4Y8YX8) to ask questions, share
your charts and follow releases.

<details>
<summary>Flint WeChat group</summary>
<br>
<img src="docs/figs/QR-code.png" alt="Flint WeChat user group QR code" width="160">
</details>

## Code of conduct, security and trademarks

This project has adopted the
[Microsoft Open Source Code of Conduct](.github/CODE_OF_CONDUCT.md). See
[SECURITY.md](.github/SECURITY.md) to report vulnerabilities.

This project may contain trademarks or logos for projects, products, or services.
Authorized use of Microsoft trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not
cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks
or logos is subject to those third parties' policies.

## License

[MIT](LICENSE) © Microsoft Corporation
