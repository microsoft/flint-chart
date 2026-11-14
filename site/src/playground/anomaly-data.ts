import type { ChartAssemblyInput } from 'flint-chart';

export const ANOMALY_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Monthly anomalies shaped like NASA GISTEMP: numeric years 1880–2023, 2023 through May only. */
export const anomalyRows = Array.from({ length: 144 }, (_, index) => 1880 + index).flatMap((Year) =>
  ANOMALY_MONTHS.slice(0, Year === 2023 ? 5 : 12).map((Month, month) => {
    const trend = Year < 1910 ? -0.25 : Year < 1975 ? -0.25 + (Year - 1910) * 0.004 : 0.01 + (Year - 1975) * 0.019;
    const wobble = 0.12 * Math.sin(Year * 1.7 + month * 0.9) + 0.08 * Math.cos(Year * 0.37 + month * 2.1);
    return { Year, Month, Anomaly: Math.round((trend + wobble) * 100) / 100 };
  }));

/** The eval chart that drew nothing, then labelled one window, then put its rail under the source line. */
export const anomalyInput = {
  data: { values: anomalyRows },
  semantic_types: {
    Year: 'Year', Month: 'Month',
    Anomaly: { semanticType: 'Temperature', unit: '°C', divergingMidpoint: 0 },
  },
  field_display_names: { Anomaly: 'Temperature anomaly (°C)' },
  chart_spec: {
    chartType: 'Heatmap',
    title: 'Recent decades are consistently warmer than the 1951–1980 baseline',
    subtitle: 'Monthly global surface temperature anomalies, 1880–2023 (°C). 2023 includes January–May only.',
    source: { text: 'NASA GISTEMP v4 (shape only; values synthetic)' },
    encodings: { x: { field: 'Year', type: 'ordinal' }, y: { field: 'Month' }, color: { field: 'Anomaly' } },
    baseSize: { width: 1100, height: 400 },
  },
} as unknown as ChartAssemblyInput;
