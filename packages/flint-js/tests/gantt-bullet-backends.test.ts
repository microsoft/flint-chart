// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleECharts, assembleChartjs } from '../src';
import { genGanttTests, genBulletTests, genWaterfallTests } from '../src/test-data';
import type { TestCase } from '../src/test-data/types';

/**
 * Gantt / Bullet / Waterfall on the ECharts and Chart.js backends.
 *
 * ECharts has no native interval mark, so Gantt and Waterfall float a colored
 * bar over a transparent base sharing one stack, and Bullet overlays a narrow
 * value bar (`barGap: '-100%'`) on stacked gray bands with a rect target tick.
 * Chart.js bars take a native `[start, end]` tuple, so Gantt is a horizontal
 * floating bar and Waterfall a vertical one. These tests assert the assembled
 * specs carry the right series / datasets, float tuples and colors, and that
 * every bundled gallery example compiles on each backend.
 */

/** Convert a gallery TestCase into the assembler input shape. */
function toInput(tc: TestCase) {
  const encodings: Record<string, string> = {};
  for (const [channel, item] of Object.entries(tc.encodingMap)) {
    const field = tc.fields.find((f) => f.id === (item as any).fieldID);
    if (field) encodings[channel] = field.name;
  }
  const semantic_types: Record<string, string> = {};
  for (const [name, meta] of Object.entries(tc.metadata)) {
    semantic_types[name] = meta.semanticType;
  }
  return {
    data: { values: tc.data },
    semantic_types,
    chart_spec: {
      chartType: tc.chartType,
      encodings,
      baseSize: { width: 500, height: 300 },
      ...(tc.chartProperties ? { chartProperties: tc.chartProperties } : {}),
    },
  };
}

describe('ECharts Gantt chart', () => {
  const tc = genGanttTests()[0];
  const option = assembleECharts(toInput(tc)) as any;
  const base = option.series.find((s: any) => s.name === '_base');
  const task = option.series.find((s: any) => s.name === 'Task');

  it('floats a colored Task bar over a transparent base, sharing one stack', () => {
    expect(base).toBeDefined();
    expect(task).toBeDefined();
    expect(base.itemStyle.color).toBe('transparent');
    expect(base.stack).toBe('gantt');
    expect(task.stack).toBe('gantt');
  });

  it('positions tasks on a value x-axis and an inverted category y-axis', () => {
    expect(option.xAxis.type).toBe('value');
    expect(option.yAxis.type).toBe('category');
    expect(option.yAxis.inverse).toBe(true);
    expect(option.yAxis.data.length).toBe(base.data.length);
  });

  it('makes the base hold the start offset and the Task hold the duration', () => {
    // Task bar value = end − start, so base + task value reconstructs end.
    const baseVal = base.data[0] as number;
    const taskVal = (task.data[0] as any).value as number;
    expect(Number.isFinite(baseVal)).toBe(true);
    expect(taskVal).toBeGreaterThan(0);
  });

  it('applies task height, corners, and interval labels while retaining start order', () => {
    const input = toInput(tc) as any;
    input.chart_spec.chartProperties = {
      taskHeight: 55,
      cornerRadius: 6,
      intervalLabels: true,
    };
    const configured = assembleECharts(input) as any;
    const configuredTask = configured.series.find((s: any) => s.name === 'Task');
    const starts = configured.series.find((s: any) => s.name === '_base').data;

    expect(configuredTask.barWidth).toBe('55%');
    expect(configuredTask.itemStyle.borderRadius).toBe(6);
    expect(configuredTask.label.show).toBe(true);
    expect(configuredTask.label.position).toBe('right');
    expect(configuredTask.label.formatter({ dataIndex: 0 })).toMatch(/d$/);
    expect(configured.grid.right).toBeGreaterThanOrEqual(40);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

describe('ECharts Bullet chart', () => {
  const tc = genBulletTests()[0];
  const option = assembleECharts(toInput(tc)) as any;
  const bands = option.series.filter((s: any) => s.name?.startsWith('_band'));
  const value = option.series.find((s: any) => s.name === 'value');
  const target = option.series.find((s: any) => s.name === 'target');

  it('stacks three gray qualitative bands behind the value bar', () => {
    expect(bands).toHaveLength(3);
    for (const b of bands) {
      expect(b.stack).toBe('bullet-bands');
      expect(b.itemStyle.color).toMatch(/^#[d-f]/i); // muted light grays
    }
  });

  it('overlays a narrower value bar concentrically over the bands', () => {
    expect(value).toBeDefined();
    expect(value.barGap).toBe('-100%');
    expect(value.barWidth).toBe('34%');
    expect(bands[0].barWidth).toBe('62%');
  });

  it('colors each value bar by goal attainment', () => {
    const colors = new Set(value.data.map((d: any) => d.itemStyle.color));
    for (const c of colors) {
      expect(['#c44e52', '#2f855a']).toContain(c);
    }
  });

  it('marks the target as a tall thin rect tick on a zero-based axis', () => {
    expect(target.type).toBe('scatter');
    expect(target.symbol).toBe('rect');
    expect(target.symbolSize[1]).toBeGreaterThan(0);
    expect(option.xAxis.min).toBe(0);
  });
});

describe('Chart.js Gantt chart', () => {
  const tc = genGanttTests()[0];
  const config = assembleChartjs(toInput(tc)) as any;
  const ds = config.data.datasets[0];

  it('draws a horizontal floating bar per task', () => {
    expect(config.type).toBe('bar');
    expect(config.options.indexAxis).toBe('y');
    expect(ds.data.length).toBe(config.data.labels.length);
  });

  it('encodes each interval as a native [start, end] tuple', () => {
    for (const d of ds.data) {
      expect(Array.isArray(d)).toBe(true);
      expect(d).toHaveLength(2);
      expect(d[1]).toBeGreaterThanOrEqual(d[0]);
    }
  });

  it('orders tasks chronologically by start', () => {
    const starts = ds.data.map((d: [number, number]) => d[0]);
    const sorted = [...starts].sort((a, b) => a - b);
    expect(starts).toEqual(sorted);
  });

  it('applies task height, corners, and interval labels while retaining start order', () => {
    const input = toInput(tc) as any;
    input.chart_spec.chartProperties = {
      taskHeight: 55,
      cornerRadius: 6,
      intervalLabels: true,
    };
    const configured = assembleChartjs(input) as any;
    const configuredDataset = configured.data.datasets[0];

    expect(configuredDataset.barPercentage).toBe(0.55);
    expect(configuredDataset.borderRadius).toBe(6);
    const starts = configuredDataset.data.map((value: [number, number]) => value[0]);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(configured.plugins[0].id).toBe('ganttLabels');
    expect(configured.options.layout.padding.right).toBeGreaterThanOrEqual(40);
  });
});

describe('Chart.js Waterfall chart', () => {
  const tc = genWaterfallTests()[0];
  const config = assembleChartjs(toInput(tc)) as any;
  const ds = config.data.datasets[0];

  it('draws a single dataset of floating [lo, hi] bars', () => {
    expect(config.type).toBe('bar');
    expect(config.data.datasets).toHaveLength(1);
    expect(ds.data.length).toBe(config.data.labels.length);
    for (const d of ds.data) {
      expect(Array.isArray(d)).toBe(true);
      expect(d[1]).toBeGreaterThanOrEqual(d[0]);
    }
  });

  it('anchors the first (start) bar at zero', () => {
    expect(ds.data[0][0]).toBe(0);
  });

  it('colors each bar (start/end, increase, decrease) per step', () => {
    expect(new Set(ds.backgroundColor).size).toBeGreaterThan(1);
    expect(ds.backgroundColor.length).toBe(ds.data.length);
  });
});

describe('backend gallery examples compile', () => {
  for (const tc of [...genGanttTests(), ...genBulletTests()]) {
    it(`ECharts ${tc.chartType}: ${tc.title}`, () => {
      const option = assembleECharts(toInput(tc)) as any;
      expect(option.series?.length).toBeGreaterThan(0);
    });
  }
  for (const tc of [...genGanttTests(), ...genWaterfallTests()]) {
    it(`Chart.js ${tc.chartType}: ${tc.title}`, () => {
      const config = assembleChartjs(toInput(tc)) as any;
      expect(config.type).toBe('bar');
      expect(config.data?.datasets?.length).toBeGreaterThan(0);
    });
  }
});
