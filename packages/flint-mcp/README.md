# flint-chart-mcp

> Model Context Protocol (MCP) server for [Flint](https://github.com/microsoft/flint-chart).
> Give it data **+** one semantic chart spec; get back a **rendered chart** —
> PNG or SVG — across Vega-Lite, ECharts, and Chart.js. Rendering is local and
> **in-process**: your data never leaves the host.

Flint's [bundled agent skill](assets/flint-chart-author.SKILL.md) teaches an agent how to *author*
a `ChartAssemblyInput`. This MCP server exposes that skill and acts as the
execution counterpart: it compiles, validates, and renders that one spec.

## Why a small tool surface

Most chart MCP servers expose one tool per chart type (26+ tools) because every
chart has a different schema, and they upload your config to a remote render
service. Flint has **one schema** (`ChartAssemblyInput`) spanning ~40 chart
types × multiple backends, so this server exposes **five focused tools** and
renders **locally**.

## Tools

| Tool | Input | Output |
|---|---|---|
| `render_chart` | spec + `backend` + `format` (`png`/`svg`) + `scale?` | inline PNG image or SVG text |
| `compile_chart` | spec + `backend` | backend-native spec JSON + warnings |
| `validate_chart` | spec + `backend` | validity, warnings/errors, computed size |
| `list_chart_types` | `backend?` | chart types + encoding channels per backend |
| `create_chart_view` | spec | interactive chart **UI** (MCP App): live SVG preview + customization panel |

## MCP App: interactive chart view

In hosts that support MCP App UIs (e.g. Claude Desktop), `create_chart_view`
opens an interactive view that renders the spec live (Vega-Lite → SVG) and shows
a customization panel built from Flint's own option model — chart type, channel
bindings, chart properties (corner radius, stack mode, donut hole, …), and
encoding actions (sort). Rendering and edits run entirely in the host UI; no
data leaves the host. The UI is a single self-contained HTML bundle served as
the `ui://flint-chart/chart-view.html` resource and built with `npm run build:ui`.

## Resources and prompt

| Name | Kind | Purpose |
|---|---|---|
| `flint://agent-skill` | resource | Bundled Flint authoring instructions for generating valid `ChartAssemblyInput` specs. |
| `flint://chart-types` | resource | Browsable chart-type catalog and encoding channels across backends. |
| `ui://flint-chart/chart-view.html` | resource | Bundled UI for the `create_chart_view` MCP App (live chart + customization panel). |
| `author_flint_chart` | prompt | Embeds the bundled skill so prompt-aware clients can load the chart-spec rules before tool calls. |

For best results, have your MCP client include `flint://agent-skill` or run the
`author_flint_chart` prompt before asking the agent to call `create_chart_view`,
`render_chart`, `compile_chart`, or `validate_chart`.

Data can be provided in two ways:

- **Embedded rows:** pass `data: { values: [...] }` directly in the MCP tool call.
- **Local file references:** pass `data: { url: "..." }` for a `.json`, `.csv`, or
  `.tsv` file. Remote URLs are never fetched.

By default the server **trusts the agent's host** for file access: any local file
the agent references can be read (the host already governs what the agent may
touch, and the agent can already inline the same rows via `data.values`).
Relative `data.url` paths resolve against the server's working directory; absolute
paths and `file://` URLs are read as given. For data it downloads or generates,
the agent can simply create a folder in the project (e.g. `./flint-data`) and
reference files from it — the server doesn't create or require any special
directory.

For untrusted/server deployments, pass `--disable-file-reference` to reject local
`data.url` file references entirely, accepting only inline `data.values`. Reads
stay read-only either way — the server never writes your data.

`backend` is one of `vegalite`, `echarts`, `chartjs`. The `chartjs` backend
renders **PNG only** (its engine has no SVG output).

## Install / run

Zero-install via `npx`:

```bash
npx -y flint-chart-mcp
```

### MCP client config

```json
{
  "mcpServers": {
    "flint": {
      "command": "npx",
      "args": ["-y", "flint-chart-mcp"]
    }
  }
}
```

To **disable local file references** (accept only inline `data.values` — useful
for untrusted/server deployments), pass `--disable-file-reference`:

```json
{
  "mcpServers": {
    "flint": {
      "command": "npx",
      "args": ["-y", "flint-chart-mcp", "--disable-file-reference"]
    }
  }
}
```

Works with Claude Desktop, Cursor, VS Code, and any MCP client that speaks
**stdio**.

### CLI options

```
--transport <stdio>   Transport (only "stdio" is supported). Default: stdio.
--backends <list>     Comma-separated subset of vegalite,echarts,chartjs.
                      Overridden by FLINT_MCP_BACKENDS if set.
--disable-file-reference
                      Reject local data.url file references; accept only inline
                      data.values. When unset, any local file the agent
                      references is readable (relative paths resolve against the
                      working directory). Also enabled by
                      FLINT_MCP_DISABLE_FILE_REFERENCE.
--data-roots <list>   Deprecated and ignored. Local files are readable by default.
--data-root <dir>     Deprecated and ignored. Local files are readable by default.
-v, --version         Print version.
-h, --help            Print help.
```

Gate the exposed backends at deploy time:

```bash
FLINT_MCP_BACKENDS=vegalite,echarts npx -y flint-chart-mcp
```

Local `data.url` files are readable by default. To harden an untrusted
deployment, reject local file references and accept only inline rows:

```bash
npx -y flint-chart-mcp --disable-file-reference
```

## Example `render_chart` call

```jsonc
{
  "name": "render_chart",
  "arguments": {
    "data": {
      "values": [
        { "region": "North", "revenue": 120 },
        { "region": "South", "revenue": 90 },
        { "region": "East",  "revenue": 150 }
      ]
    },
    "semantic_types": { "region": "Category", "revenue": "Quantity" },
    "chart_spec": {
      "chartType": "Bar Chart",
      "encodings": { "x": { "field": "region" }, "y": { "field": "revenue" } },
      "baseSize": { "width": 360, "height": 240 }
    },
    "backend": "vegalite",
    "format": "png"
  }
}
```

The response contains the PNG inline (MCP `ImageContent`, base64) plus a short
note with the artifact size and any assembly warnings.

## Programmatic rendering

The in-process render core is also importable, so build scripts and tools can
reuse one shared SSR recipe:

```ts
import { renderChart } from 'flint-chart-mcp/render';

const { buffer, warnings } = await renderChart(input, 'echarts', { format: 'png', scale: 2 });
```

## How it renders (in-process, no browser)

- **Vega-Lite** → compile to Vega → headless `vega.View` → SVG → (PNG via `@resvg/resvg-js`).
- **ECharts** → server-side SVG rendering → (PNG via resvg).
- **Chart.js** → `@napi-rs/canvas` → PNG (no SVG engine).

Bundled Liberation Sans faces are registered for server-side text measurement
and rasterization, with DejaVu Sans available as a broad Unicode fallback. Flint's
computed `width`/`height` (its stretch-layout result) is applied so the semantic
layout shows up in the artifact.

## Security & limits

- **No remote upload.** All rendering is in-process; data stays on the host.
- **Read-only file access.** `data.url` reads local `.json`, `.csv`, or `.tsv`
  files only — the server never writes your data. By default it trusts the
  agent's host for which files are readable (the agent could already inline the
  same rows); use `--disable-file-reference` to reject local file references in
  untrusted deployments. Remote URLs are disabled to avoid SSRF.
- **DoS guards.** Row count, file size, and canvas dimensions are capped for hostile specs.

## Development

```bash
npm install            # from the repo root (workspaces)
npm run build:mcp      # build this package (requires flint-js built first)
npm run test:mcp       # run the test suite
```

## License

MIT © Microsoft Corporation
