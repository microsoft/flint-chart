// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite, getChartOptions } from '../src';
import { coerceGanttEndpoint, formatGanttDuration, sortGanttRows } from '../src/chart-types/gantt';
import { genGanttTests, genBulletTests } from '../src/test-data';
import type { TestCase } from '../src/test-data/types';

/**
 * Gantt and Bullet chart types.
 *
 * Gantt renders one horizontal bar per task spanning [start, end] on x/x2 (a
 * non-zero time axis), with tasks ordered by start. Bullet layers a value bar
 * (length from zero) under a target tick. These tests assert the assembled
 * Vega-Lite spec has the right marks, channels and scale flags, and that the
 * bundled gallery examples compile.
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

describe('Gantt chart', () => {
  const spec = assembleVegaLite(toInput(genGanttTests()[0])) as any;

  it('formats elapsed durations with an adaptive unit', () => {
    expect(formatGanttDuration(0)).toBe('0ms');
    expect(formatGanttDuration(500)).toBe('500ms');
    expect(formatGanttDuration(30_000)).toBe('30s');
    expect(formatGanttDuration(90_000)).toBe('1.5min');
    expect(formatGanttDuration(7_200_000)).toBe('2h');
    expect(formatGanttDuration(129_600_000)).toBe('1.5d');
  });

  it('distinguishes epoch seconds from millisecond timestamps before 2001', () => {
    expect(coerceGanttEndpoint(1_700_000_000, true)).toBe(1_700_000_000_000);
    expect(coerceGanttEndpoint(946_684_800_000, true)).toBe(946_684_800_000);
  });

  it('keeps an explicitly temporal one-task interval temporal', () => {
    const input = {
      data: { values: [{ task: 'Review', start: '2026-07-19T09:00:00Z', end: '2026-07-19T10:30:00Z' }] },
      semantic_types: { task: 'Category', start: 'DateTime', end: 'DateTime' },
      chart_spec: {
        chartType: 'Gantt Chart',
        encodings: { y: 'task', x: 'start', x2: 'end' },
        chartProperties: { intervalLabels: true },
      },
    };
    const configured = assembleVegaLite(input as any) as any;

    expect(configured.layer[0].encoding.x.type).toBe('temporal');
    expect(configured.transform[0].calculate).toContain("'h'");
  });

  it('exposes labels as an off-by-default binary toggle', () => {
    const labels = getChartOptions(toInput(genGanttTests()[0]) as any)
      .find((option) => option.key === 'intervalLabels');

    expect(labels).toMatchObject({ type: 'binary', value: false, applicable: true });
  });

  it('renders a single bar mark spanning x → x2', () => {
    expect(spec.mark?.type).toBe('bar');
    expect(spec.encoding?.x?.field).toBe('start');
    expect(spec.encoding?.x2?.field).toBe('end');
  });

  it('treats the interval as temporal and does not anchor the axis at zero', () => {
    expect(spec.encoding?.x?.type).toBe('temporal');
    // On a time scale, zero is meaningless; it must not be forced on.
    expect(spec.encoding?.x?.scale?.zero).not.toBe(true);
  });

  it('orders tasks by their start date', () => {
    expect(spec.encoding?.y?.field).toBe('task');
    expect(spec.encoding?.y?.sort).toMatchObject({ field: 'start', op: 'min', order: 'ascending' });
  });

  it('colors bars by phase', () => {
    expect(spec.encoding?.color?.field).toBe('phase');
  });

  it('applies task height, corners, and interval labels while retaining start order', () => {
    const input = toInput(genGanttTests()[0]) as any;
    input.chart_spec.chartProperties = {
      taskHeight: 55,
      cornerRadius: 6,
      intervalLabels: true,
    };
    const configured = assembleVegaLite(input) as any;
    const bar = configured.layer[0];
    const labels = configured.layer[1];

    expect(bar.mark).toMatchObject({ type: 'bar', height: { band: 0.55 }, cornerRadius: 6 });
    expect(bar.encoding.y.sort).toMatchObject({ field: 'start', order: 'ascending' });
    expect(labels.mark.type).toBe('text');
    expect(labels.encoding.y.axis).not.toBeNull();
    expect(labels.encoding.text.field).toBe('__gantt_label');
    expect(configured.transform.some((t: any) => t.as === '__gantt_label')).toBe(true);
    expect(bar.encoding.x.scale.padding).toBeGreaterThanOrEqual(40);
  });

  it('uses input order as the tie-breaker for equal starts', () => {
    const rows = sortGanttRows([
      { task: 'Second', start: 10, end: 15, inputIndex: 1 },
      { task: 'First', start: 10, end: 20, inputIndex: 0 },
      { task: 'Later', start: 20, end: 25, inputIndex: 2 },
    ]);
    expect(rows.map((row) => row.task)).toEqual(['First', 'Second', 'Later']);
  });
});

describe('Bullet chart', () => {
  const spec = assembleVegaLite(toInput(genBulletTests()[0])) as any;
  const markType = (l: any) => (typeof l.mark === 'string' ? l.mark : l.mark?.type);
  const bands = spec.layer.filter((l: any) => markType(l) === 'rect');
  const bar = spec.layer.find((l: any) => markType(l) === 'bar');
  const tick = spec.layer.find((l: any) => markType(l) === 'tick');

  it('layers gray percentile bands beneath a value bar and target tick', () => {
    expect(Array.isArray(spec.layer)).toBe(true);
    expect(bands.length).toBeGreaterThan(0);
    expect(bar).toBeDefined();
    expect(tick).toBeDefined();
    // Bands paint first (behind), then the bar, then the target tick on top.
    const firstBar = spec.layer.findIndex((l: any) => markType(l) === 'bar');
    const lastBand = spec.layer.map(markType).lastIndexOf('rect');
    const tickIdx = spec.layer.findIndex((l: any) => markType(l) === 'tick');
    expect(lastBand).toBeLessThan(firstBar);
    expect(firstBar).toBeLessThan(tickIdx);
  });

  it('shades each row with muted gray zones from a zero baseline', () => {
    for (const b of bands) {
      expect(b.mark?.color).toMatch(/^#[d-f]/i); // muted light grays
      expect(b.encoding?.x?.field).toBe('__lo');
      expect(b.encoding?.x2?.field).toBe('__hi');
    }
    // Bands are per row (one rect per category), not a single shared block.
    const rows = genBulletTests()[0].data.length;
    for (const b of bands) {
      expect(b.data?.values?.length).toBe(rows);
    }
  });

  it('derives each row band breakpoints from that row goal', () => {
    // Three muted zones split the row goal into quarters: 0–25%, 25–50%,
    // 50–75%; 75%→max stays white. So a row goal of 200 yields band tops at
    // 50, 100 and 150.
    expect(bands).toHaveLength(3);
    const yField = spec.encoding.y.field;
    const sample = bands[0].data.values[0];
    const rowGoal = genBulletTests()[0]!.data.find(
      (r: any) => r[yField] === sample[yField],
    )!.quota;
    const tops = bands.map(
      (b: any) => b.data.values.find((v: any) => v[yField] === sample[yField]).__hi,
    );
    expect(tops[0]).toBeCloseTo(0.25 * rowGoal);
    expect(tops[1]).toBeCloseTo(0.5 * rowGoal);
    expect(tops[2]).toBeCloseTo(0.75 * rowGoal);
  });

  it('shares one banded category axis across all layers', () => {
    expect(spec.encoding?.y?.field).toBe('rep');
    expect(bar.encoding?.y).toBeUndefined();
  });

  it('puts the value on the bar and the target on the tick', () => {
    expect(bar.encoding?.x?.field).toBe('sales');
    expect(tick.encoding?.x?.field).toBe('quota');
  });

  it('colors each bar by goal attainment via a status field', () => {
    const calc = bar.transform?.[0]?.calculate ?? '';
    expect(calc).toContain('sales');
    expect(calc).toContain('quota');
    const color = bar.encoding?.color;
    expect(color?.field).toBe('__status');
    expect(color?.type).toBe('nominal');
    // Two distinct status values; default scheme assigns blue/orange by order.
    expect(color?.scale?.domain).toHaveLength(2);
    expect(color.scale.domain[0]).not.toBe(color.scale.domain[1]);
  });

  it('keeps the value bar anchored at zero', () => {
    expect(bar.encoding?.x?.scale?.zero).toBe(true);
  });

  it('sizes the target tick to a positive pixel height', () => {
    expect(typeof tick.mark?.size).toBe('number');
    expect(tick.mark.size).toBeGreaterThan(0);
  });

  it('keeps the target tick within its row band (no cross-row spill)', () => {
    // The tick is sized off the layout band (yStep), so it must never exceed the
    // per-row step — otherwise it bleeds into neighbouring rows / past the plot
    // edge on low-cardinality bullets. spec.height is `{ step: N }` for the
    // banded category axis.
    const step = (spec.height && typeof spec.height === 'object')
      ? spec.height.step
      : undefined;
    expect(typeof step).toBe('number');
    expect(tick.mark.size).toBeLessThanOrEqual(step);
  });
});

describe('gallery examples compile', () => {
  for (const tc of [...genGanttTests(), ...genBulletTests()]) {
    it(`${tc.chartType}: ${tc.title}`, () => {
      const spec = assembleVegaLite(toInput(tc)) as any;
      expect(spec).toBeDefined();
      expect(spec.encoding || spec.layer).toBeDefined();
    });
  }
});
