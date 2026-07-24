# Excel chart reference

> This page is generated from the live Excel chart-template registry (`scripts/gen-chart-reference.ts`). Do not edit it by hand — run `npm run gen:reference`.

The Excel backend compiles a Flint specification into a versioned native-chart artifact, which Office.js turns into an editable chart in an Excel workbook.

## Supported charts

The backend currently supports 18 chart types. Use the exact name shown below in `chart_spec.chartType`.

| Flint chart type | Encoding channels | Native `Excel.ChartType` |
|---|---|---|
| Bar Chart | `x`, `y`, `color` | `ColumnClustered` / `BarClustered` |
| Grouped Bar Chart | `x`, `y`, `group` | `ColumnClustered` / `BarClustered` |
| Stacked Bar Chart | `x`, `y`, `color` | `ColumnStacked` / `BarStacked` |
| Pyramid Chart | `x`, `y`, `color` | `BarStacked` |
| Line Chart | `x`, `y`, `color`, `strokeDash` | `Line` |
| Area Chart | `x`, `y`, `color` | `Area` |
| Scatter Plot | `x`, `y`, `color`, `size` | `XYScatter` |
| Connected Scatter Plot | `x`, `y`, `order`, `color`, `detail` | `XYScatterLines` |
| Pie Chart | `color`, `size`, `theta` | `Pie` |
| Donut Chart | `color`, `size`, `theta` | `Doughnut` |
| Histogram | `x`, `color` | `ColumnClustered` |
| Boxplot | `x`, `y`, `color` | `BoxWhisker` |
| Candlestick Chart | `x`, `open`, `high`, `low`, `close` | `StockOHLC` |
| Waterfall Chart | `x`, `y`, `color` | `Waterfall` |
| Radar Chart | `x`, `y`, `color` | `RadarMarkers` |
| Funnel Chart | `y`, `size` | `Funnel` |
| Treemap | `color`, `size`, `detail` | `Treemap` |
| Sunburst Chart | `color`, `size`, `group`, `detail` | `Sunburst` |

## Compile and render

`assembleExcel(input)` returns a `flint.excel.chart/v1` artifact. It describes the worksheet data matrix, native chart type, series bindings, axes, legend, labels, and formatting, but does not open Excel itself.

```ts
import { assembleExcel, renderExcelChart } from 'flint-chart';

const artifact = assembleExcel(input);
const result = await renderExcelChart(Excel, artifact);
```

`renderExcelChart` must run in an Excel host that provides Office.js `Excel.run` and `Excel.ImageFittingMode.fit`. It creates a native chart on the active worksheet and returns a PNG captured through `Chart.getImage()`.

Call `generateOfficeJs(artifact)` when you need portable Office.js source instead of immediate execution.

## Limitations

- A single native Excel chart does not support Flint `column` or `row` facets.
- Chart types without a native Excel equivalent, such as Heatmap, are rejected before rendering.
- Some charts impose stricter data requirements. For example, scatter charts require quantitative `x` and `y`, while candlesticks require `open`, `high`, `low`, and `close`. The assembler reports a specific validation error.

Use `excelGetTemplateDef(chartType)` or `excelGetTemplateChannels(chartType)` to check support before compiling.
