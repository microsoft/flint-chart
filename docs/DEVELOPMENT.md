# DEVELOPMENT

How to build, test, and extend **flint-chart** locally.

## Prerequisites

- Node 18+ (see [`.nvmrc`](.nvmrc) — `nvm use` if you have nvm)
- npm 9+ (npm workspaces required)

## First-time setup

```bash
git clone https://github.com/microsoft/flint-chart
cd flint-chart
npm install              # installs root + examples + agents via workspaces
```

## Daily commands

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` across the library |
| `npm run test` | run vitest once |
| `npm run test:watch` | re-run on save |
| `npm run lint` | ESLint over `src/` |
| `npm run build` | `tsup` → `dist/` (ESM + CJS + `.d.ts`) |
| `npm run site` | demo site (landing / gallery / editor) on http://localhost:5274/flint-chart/ |
| `npm run site:build` | production build of the demo site → `site/dist/` |
| `npm run build --workspace=@flint-chart/mcp-server` | build the MCP server |

The demo site aliases `flint-chart` directly to `src/index.ts` via
Vite, so changes to the library are picked up immediately by HMR — no
rebuild needed during development.

## Repo layout

```
flint-chart/
├── packages/
│   ├── flint-js/              JS/TS library — published to npm
│   │   ├── src/
│   │   │   ├── index.ts       public barrel
│   │   │   ├── core/          target-agnostic types, decisions, semantics
│   │   │   ├── vegalite/      Vega-Lite backend
│   │   │   ├── echarts/       ECharts backend
│   │   │   ├── chartjs/       Chart.js backend
│   │   │   ├── gofish/        GoFish backend
│   │   │   └── test-data/     fixtures + generators (also drives gallery)
│   │   └── tests/             JS test suites
│   └── flint-py/              Python port (Vega-Lite backend)
│       ├── src/flint_chart/   library source
│       └── tests/             Python test suites
├── shared/
│   └── test-data/             JSON test fixtures shared across JS + Python
├── site/                      unified Vite+React demo (landing / gallery / editor routes)
├── agent-skills/
│   └── SKILL.md           Agent skill for AI-assisted charting
├── docs/                      architecture, planning, how-tos, HANDOFF
```

## How a chart actually gets assembled

1. **Phase 0 — semantic resolution** ([`src/core/resolve-semantics.ts`](src/core/resolve-semantics.ts))
   For each field bound to a channel, look up the semantic type, pull
   defaults (format, zero-baseline, color scheme, …), and produce a
   `ChannelSemantics` record.

2. **Phase 1 — layout** ([`src/core/compute-layout.ts`](src/core/compute-layout.ts))
   From canvas size + discrete cardinalities + facet structure, compute
   per-axis stretch and per-subplot dimensions.

3. **Phase 2 — instantiation** (per-backend `instantiate-spec.ts`)
   Take the template skeleton, fill in encodings, scales, axes, marks,
   and emit the backend's native spec.

## Adding things

- **Chart template:** [docs/adding-a-chart-template.md](docs/adding-a-chart-template.md)
- **Semantic type:** [docs/adding-a-semantic-type.md](docs/adding-a-semantic-type.md)
- **Backend:** [docs/adding-a-backend.md](docs/adding-a-backend.md)

## Tests

- **Public-API smoke** lives in [tests/smoke.test.ts](tests/smoke.test.ts) —
  asserts every assembler returns *something* for a known input.
- **Snapshot / shape tests** can live next to source under `src/**/*.test.ts`.
- The bulk of behaviour is exercised visually through the gallery
  ([`src/test-data/`](src/test-data/)). Treat any visual regression as a
  bug — open an issue with a screenshot.

## Release

See [docs/release-process.md](docs/release-process.md). TL;DR:

```bash
# bump version in package.json + CHANGELOG.md
npm version <patch|minor|major>
git push --follow-tags     # tag push triggers .github/workflows/release.yml
```

CI publishes with `--provenance --access public`.
