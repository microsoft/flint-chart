# Excel 图表参考

> 本页由实时 Excel 图表模板注册表生成（`scripts/gen-chart-reference.ts`）。请勿手动编辑；请运行 `npm run gen:reference`。

Excel 后端把 Flint 规范编译为带版本的原生图表工件，再由 Office.js 在 Excel 工作簿中创建可编辑图表。

## 支持的图表

当前支持 18 种图表。请在 `chart_spec.chartType` 中使用下表所示的精确名称。

| Flint 图表类型 | 编码通道 | 原生 `Excel.ChartType` |
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

## 编译与渲染

`assembleExcel(input)` 返回一个 `flint.excel.chart/v1` 工件。它描述工作表数据矩阵、原生图表类型、系列绑定、坐标轴、图例、标签及格式，但不会自行打开 Excel。

```ts
import { assembleExcel, renderExcelChart } from 'flint-chart';

const artifact = assembleExcel(input);
const result = await renderExcelChart(Excel, artifact);
```

`renderExcelChart` 必须在提供 Office.js `Excel.run` 和 `Excel.ImageFittingMode.fit` 的 Excel 宿主中运行。它会在活动工作表中创建原生图表，并返回由 `Chart.getImage()` 捕获的 PNG。

若需要可移植的 Office.js 源码而不是立即执行，可调用 `generateOfficeJs(artifact)`。

## 限制

- 一个原生 Excel 图表不支持 Flint 的 `column` 或 `row` 分面。
- 没有原生 Excel 对应类型的图表（例如 Heatmap）会在渲染前被拒绝。
- 部分图表有更严格的数据要求；例如散点图要求定量 `x` 和 `y`，蜡烛图要求 `open`、`high`、`low`、`close` 通道。Assembler 会返回具体的验证错误。

可使用 `excelGetTemplateDef(chartType)` 或 `excelGetTemplateChannels(chartType)` 在编译前检查支持情况。
