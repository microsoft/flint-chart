# Contributing to flint-chart

Thanks for your interest. This document describes the workflow, code layout,
and conventions for contributions.

## Code of Conduct

This project adopts the [Microsoft Open Source Code of Conduct](./CODE_OF_CONDUCT.md).

## Project layout

```
src/                         library source (published to npm)
  index.ts                   public barrel
  core/                      target-agnostic types, decisions, semantics
  vegalite/                  Vega-Lite backend
  echarts/                   ECharts backend
  chartjs/                   Chart.js backend
  test-data/                 fixtures + generators (used by gallery + tests)
tests/                       repo-level tests (unit + snapshot)
site/                        unified demo app (Vite + React, landing / gallery / editor)
agent-skills/                      Agent skill (SKILL.md) for AI-assisted charting
docs/                        design docs, planning, contributor how-tos
```

## Local setup

```bash
npm install            # installs root + examples + agents via workspaces
npm run typecheck      # tsc --noEmit
npm run test           # vitest run
npm run lint
npm run build          # tsup → dist/ (dual ESM + CJS + .d.ts)
```

Node 18+ required (see `.nvmrc`).

## Quick contribution recipes

- **Add a chart template to a backend.** See [docs/adding-a-chart-template.md](../docs/adding-a-chart-template.md).
- **Add a semantic type.** See [docs/adding-a-semantic-type.md](../docs/adding-a-semantic-type.md).
- **Add a new backend.** See [docs/adding-a-backend.md](../docs/adding-a-backend.md).
- **Add a test case to the gallery.** Add a generator under `src/test-data/`, then
  reference it from `gallery-tree.ts`.

## Commit / PR guidelines

- One topic per PR. Keep diffs reviewable.
- Run `npm run typecheck && npm run test && npm run lint` before pushing.
- Snapshot test updates: justify the diff in your PR description.

### Sort-repair performance comparison

From the repository root, run `node scripts/bench-sort-repair.mjs <baseline-ref>`
after installing workspace dependencies. It compares the baseline sort-repair
module with the working copy in three interleaved rounds, verifies matching
outputs, and emits raw JSON timings and V8 sampled allocation estimates for
1,000- and 100,000-row tables. Run it without competing builds or benchmarks.
Sampling can miss small allocations; these figures are not exact allocation
counts, retained heap, or end-to-end chart-rendering measurements.

## Public API & semver

The public surface is whatever is re-exported from [`src/index.ts`](../src/index.ts)
and the per-backend `./vegalite`, `./echarts`, `./chartjs`,
`./core`, `./test-data` subpath exports. We follow semver: breaking changes go in
a major release; new templates / semantic types / fields on non-required types
are minor; bug fixes are patch.

## Release process

Releases are handled by project maintainers.
