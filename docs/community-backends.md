# Community backends

Community backends extend Flint to additional renderers and delivery surfaces.
They use the same `ChartAssemblyInput`, but may have different chart coverage,
release cadence, and gallery, editor, MCP, or ThemeSpec integration from Flint's
core backends.

## Image-Charts

> Originally contributed by
> [François-Guillaume Ribreau](https://github.com/FGRibreau).

The Image-Charts backend compiles a Flint input into an unsigned URL for the
third-party [Image-Charts](https://www.image-charts.com/) service. It is useful
when the output must work as an ordinary image URL, including email, generated
documents, chat messages, and other no-JavaScript environments.

```ts
import {
  assembleImageCharts,
  isImageChartsSupported,
} from 'flint-chart/image-charts';

if (isImageChartsSupported(input.chart_spec.chartType)) {
  const artifact = assembleImageCharts(input);
  // { type: 'image-charts', url: 'https://image-charts.com/chart?...' }
}
```

Assembly is pure: it creates the URL without making a network request. Loading
the returned URL sends the encoded chart data to Image-Charts, so do not use it
with confidential data unless sending that data to the service is acceptable
under your privacy and deployment requirements.

### Supported charts

- Bar Chart, Grouped Bar Chart, and Stacked Bar Chart
- Line Chart, Sparkline, and Area Chart
- Scatter Plot
- Pie Chart and Donut Chart
- Radar Chart

Unsupported chart types and faceted inputs throw an error rather than silently
falling back to another representation.

### Current scope

- Output is an unsigned `https://image-charts.com/chart?...` GET URL. Account
  identifiers, HMAC signatures, and secrets are outside this pure compiler.
- Width and height are clamped to 999 pixels, and total area is clamped to
  998,001 pixels, matching the service's documented chart-size limits.
- Data, labels, legends, colors, and titles are carried in the query string.
  Large or label-heavy charts can produce long URLs; Flint does not currently
  convert them to Image-Charts POST requests or enforce a maximum URL length.
- Banded bar charts use Flint's overflow filtering before URL serialization.
- The backend uses a fixed categorical palette. ThemeSpec and most
  `chartProperties` are not applied.
- Flint does not currently render this artifact in its gallery, editor, or MCP
  server. Availability, caching, retention, quotas, and subscription behavior
  are controlled by Image-Charts.

See the [Image-Charts API documentation](https://documentation.image-charts.com/)
for the hosted service's current request grammar and limits.
