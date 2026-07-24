# Flint Excel test harness

This test harness provides an Office.js transport plugin for rendering and evaluating artifacts from the Excel backend in `packages/flint-js/src/excel`. It does not interpret chart artifacts.

The ownership boundary is:

- `flint-chart/excel`: compiles semantic Flint input, validates the versioned Excel artifact, executes it through Office.js, and generates standalone Office.js source.
- `office-runner/`: builds and serves the backend bundle, transports jobs, and hosts the Office add-in worker.
- `evaluations/`: generates semantic inputs, renders comparisons, and records visual evaluation results.

```text
test-harness/excel/
├── office-runner/       HTTPS queue server and Office add-in
├── evaluations/         evaluation scripts, inputs, ledger, and ignored output
├── package.json         harness commands
└── README.md
```

## Artifact flow

```js
import {
  assembleExcel,
  renderExcelChart,
} from 'flint-chart/excel';

const artifact = assembleExcel(input);
const result = await renderExcelChart(Excel, artifact, { scale: 3 });
```

Serialized artifacts have `schema: "flint.excel.chart/v1"`, `kind: "chart"`, a native Office.js chart type, a matrix data range, and declarative formatting. Image scale, worksheet cleanup, and native inspection are host options and are not artifact fields. Legacy neutral aliases such as `"column"` and unversioned hand-authored specs are rejected.

## Start the worker

One-time setup:

```bash
npx office-addin-dev-certs install
cp office-runner/officejs/manifest.xml ~/Library/Containers/com.microsoft.Excel/Data/Documents/wef/
```

Start the HTTPS transport from this directory:

```bash
npm run server:supervised
```

Run the supervised server in a dedicated terminal. It builds `packages/flint-js`, serves its Excel backend to the taskpane, listens at `https://localhost:3000`, and restarts after an unexpected process exit. In Excel, open Home > Add-ins > My Add-ins > Flint Render once. Use `npm run server` only when debugging the server process without automatic restart.

Active evaluations compile semantic Flint inputs with `assembleExcel` and submit this envelope:

```json
{
  "artifact": {
    "schema": "flint.excel.chart/v1",
    "kind": "chart",
    "chartType": "ColumnClustered",
    "seriesBy": "Columns",
    "data": [["Quarter", "Sales"], ["Q1", 120], ["Q2", 205]]
  },
  "renderOptions": {
    "scale": 3,
    "cleanWorksheet": true,
    "inspectNativeChart": false
  }
}
```

Run backend-owned headless validation with:

```bash
npm run test:mock
```

Generate or run visual evaluations with:

```bash
npm run evaluate:inputs
npm run evaluate:gallery -- all
npm run evaluate:sheets
npm run evaluate:candlestick
npm run evaluate:layout
```

Generated images and summaries are written under `evaluations/out/` and are ignored by Git.

## Native Excel examples

The [curated example gallery](evaluations/examples/README.md) contains tracked snapshots of native Excel charts captured from the real Office.js worker. Bulk evaluation output stays ignored; after reviewing regenerated output, refresh the selected snapshots with:

```bash
npm run evaluate:examples
```

## Worker safety

Run only one worker server on port 3000. Render clients cancel abandoned jobs, the server expires queued jobs after two minutes, and the taskpane renders at most one job per polling interval.

Native `Pareto` remains quarantined. Excel for Mac exits while creating it before Office.js can return a catchable error. The server, artifact validator, and taskpane guard reject Pareto before `Excel.run`.
