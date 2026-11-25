# flint-chart demo site

Unified single-page app that hosts the **landing page**, **chart gallery**,
and **live editor**, all served from one bundle at `/flint-chart/` on
GitHub Pages.

Routes (`HashRouter`):

| Path        | What it is                                                  |
| ----------- | ----------------------------------------------------------- |
| `#/`        | Landing page (overview + links to GitHub and the two demos) |
| `#/gallery` | Every chart template across Vega-Lite / ECharts / Chart.js / Highcharts  |
| `#/editor`  | JSON ChartAssemblyInput playground, live-render per backend |

## Local development

From the **repository root** (monorepo):

```sh
npm install
npm run site
```

Vite serves the site at <http://localhost:5274/>.

## Build

```sh
npm run site:build
```

Static output is written to `dist/`. `VITE_BASE_PATH` overrides the deployment
base if you host outside the default `/flint-chart/` path.
