# Flint Chart Canvas

Copilot CLI plugin bundling Flint's native chart canvas, MCP server configuration,
and chart-authoring skill. The native canvas requires a Copilot CLI build that
supports the `@github/copilot-sdk/extension` Canvas API.

## Refresh the bundle

From the repository root:

```bash
npm run build:copilot-plugin
npm run check:copilot-plugin
npm run test:mcp -- tests/server.test.ts
```

The build compiles the current Flint library and MCP UI, then copies the
self-contained HTML and canonical authoring skill into this plugin. The skill
receives a Canvas-specific instruction to pass resolved inline data. The plugin
version and pinned MCP dependency are derived from the MCP package version;
that version must be published to npm before distributing the plugin.

Do not edit the generated HTML, bundled skill, or version metadata by hand.
Edit the sources and rerun the build command. The Canvas bridge reads the
manifest and MCP configuration so it uses the same version as the plugin.

## Smoke test

From the repository root, launch a Canvas-capable Copilot CLI host with:

```bash
copilot --plugin-dir .github/extensions/flint-chart
```

Ask it to open a
validated Flint chart with inline `data.values`. Check that the chart renders,
customization controls work, and closing and reopening the canvas works.
Also test a chart carrying a theme and `interaction_spec`.