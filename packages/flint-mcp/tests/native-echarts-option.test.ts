import { describe, it, expect } from 'vitest';
import type { ChartAssemblyInput } from 'flint-chart';
import { renderChart } from '../src/render/index.js';

/**
 * The native ECharts escape hatch, end to end through the renderer.
 *
 * The flint-chart unit tests pin the compile-time contract; this one pins the
 * thing a caller actually depends on — that a native patch survives the MCP
 * render path (compile → SSR → SVG) and reaches ECharts, including the
 * column-bound series and the axis Flint creates for it.
 */
const sales: ChartAssemblyInput = {
  data: {
    values: [
      { month: '2026-01', revenue: 120, margin: 0.18 },
      { month: '2026-02', revenue: 96, margin: 0.22 },
      { month: '2026-03', revenue: 141, margin: 0.15 },
      { month: '2026-04', revenue: 110, margin: 0.19 },
    ],
  },
  semantic_types: { month: 'DateTime', revenue: 'Quantity', margin: 'Percentage' },
  chart_spec: {
    chartType: 'Line Chart',
    title: 'Revenue with margin on a second axis',
    encodings: { x: { field: 'month' }, y: { field: 'revenue' } },
    baseSize: { width: 480, height: 320 },
    echarts: {
      legend: { show: true, top: 6 },
      yAxis: [{ name: 'Revenue' }, { name: 'Margin', position: 'right' }],
      series: [
        { name: 'Revenue' },
        { type: 'line', field: 'margin', name: 'Margin rate', axis: 'right', lineStyle: { type: 'dashed' } },
      ],
    },
  },
};

describe('renderChart — chart_spec.echarts', () => {
  it('renders the column-bound series, its right axis, and the native legend', async () => {
    const res = await renderChart(sales, 'echarts', { format: 'svg' });
    const svg = res.svg ?? '';

    expect(svg).toContain('Revenue');
    expect(svg).toContain('Margin rate');
    expect(svg).toContain('Margin');
    // The dashed line is the native series' own style, not a template default.
    expect(svg).toContain('stroke-dasharray');
  });

  it('reports no warnings for that spec', async () => {
    const res = await renderChart(sales, 'echarts', { format: 'svg' });
    expect(res.warnings).toEqual([]);
  });

  it('still renders when the chart is built by the semantic layer alone', async () => {
    const plain: ChartAssemblyInput = {
      ...sales,
      chart_spec: { ...sales.chart_spec, echarts: undefined } as ChartAssemblyInput['chart_spec'],
    };
    const res = await renderChart(plain, 'echarts', { format: 'svg' });

    // The layer's own axis title (the raw field) and none of the native additions.
    expect(res.svg).toContain('revenue');
    expect(res.svg).not.toContain('Margin rate');
    expect(res.svg).not.toContain('Margin');
  });
});
