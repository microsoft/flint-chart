# Development guide

Use this page to set up **flint-chart** locally, run the common checks, and find the right extension path when you need to add a new capability.

## Prerequisites

- Node 18+ (see [`packages/flint-js/.nvmrc`](../packages/flint-js/.nvmrc); run `nvm use` if you use nvm)
- npm 9+ (workspaces)

## First-time setup

```bash
git clone https://github.com/microsoft/flint-chart
cd flint-chart
npm install    # root workspace: packages/flint-js, packages/flint-mcp, site
```

## Daily commands

Run these from the **repository root**:

| Command | What it does |
|---------|----------------|
| `npm run typecheck` | Build/typecheck `packages/flint-js` and typecheck `packages/flint-mcp` |
| `npm run test` | Vitest in `packages/flint-js` and `packages/flint-mcp` |
| `npm run build` | Build `packages/flint-js` and `packages/flint-mcp` |
| `npm run site` | Demo site at http://localhost:5274/ |
| `npm run site:build` | Production build → `site/dist/` |
| `npm run build:mcp` | Build MCP server workspace |

The demo site aliases `flint-chart` to `packages/flint-js/src` through Vite, so library edits hot-reload in the gallery and editor without rebuilding `dist/`.

## Repo layout

```
flint-chart/
├── packages/
│   ├── flint-js/          npm package `flint-chart`
│   │   ├── src/core/      semantics, layout, types
│   │   ├── src/vegalite/  Vega-Lite backend
│   │   ├── src/echarts/   ECharts backend
│   │   ├── src/chartjs/   Chart.js backend
│   │   └── src/test-data/ gallery fixtures
│   ├── flint-py/          Python port preview (PyPI package planned later)
│   └── flint-mcp/         npm package `flint-chart-mcp`
├── site/                  landing, gallery, editor, docs browser
├── docs/                  architecture + site documentation sources
├── agent-skills/          AI agent skill (SKILL.md)
└── shared/test-data/      JSON fixtures (JS + Python)
```

## How chart assembly works

1. **Phase 0 — semantic resolution** (`packages/flint-js/src/core/resolve-semantics.ts`)
2. **Phase 1 — layout** (`packages/flint-js/src/core/compute-layout.ts`)
3. **Phase 2 — instantiation** (per-backend `assemble.ts` + templates)

For the full flow, see [Architecture](/documentation/architecture).

## Extension guides

Start with the guide that matches the surface you want to extend:

- [Extending chart templates](/documentation/adding-a-chart-template) - add a new chart type to an existing backend.
- [Extending semantic types](/documentation/adding-a-semantic-type) - teach Flint a new field meaning that changes formatting, aggregation, scale, or color behavior.
- [Extending backends](/documentation/adding-a-backend) - add a new rendering target that consumes the shared compiler output.

## Test coverage

- **Smoke tests:** `packages/flint-js/tests/smoke.test.ts`
- **Complete visual coverage:** [Full test cases](/playground/full-test-cases), driven by `TEST_GENERATORS` in `packages/flint-js/src/test-data/`
- **Curated examples:** [Gallery](/gallery)
- **Shared fixtures:** `shared/test-data/`, consumed by JS and Python tests
- **Coverage matrices and authoring workflow:** [Chart engine test plan](/documentation/test-plan)
