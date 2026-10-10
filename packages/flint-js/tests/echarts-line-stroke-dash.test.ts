// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleECharts, ecGetTemplateDef } from '../src';
import { validateChartInput } from '../src/validate';
import type { ChartAssemblyInput } from '../src/core/types';

const DASHED = [8, 4];
const DOTTED = [2, 3];

/** Flow constraints over two periods: consumption (listed first) and a limit. */
const ROWS = [
  { period: 'P1', value: 5, constraint: 'C1', measure: 'Consumption' },
  { period: 'P2', value: 6, constraint: 'C1', measure: 'Consumption' },
  { period: 'P1', value: 8, constraint: 'C1', measure: 'Limit' },
  { period: 'P2', value: 8, constraint: 'C1', measure: 'Limit' },
  // C2's limit rows come before its consumption rows.
  { period: 'P1', value: 9, constraint: 'C2', measure: 'Limit' },
  { period: 'P2', value: 9, constraint: 'C2', measure: 'Limit' },
  { period: 'P1', value: 4, constraint: 'C2', measure: 'Consumption' },
  { period: 'P2', value: 7, constraint: 'C2', measure: 'Consumption' },
  // C3 has a limit only, so its one line is dashed.
  { period: 'P1', value: 2, constraint: 'C3', measure: 'Limit' },
  { period: 'P2', value: 2, constraint: 'C3', measure: 'Limit' },
];

const SEMANTIC_TYPES = { period: 'Category', value: 'Quantity', constraint: 'Category', measure: 'Category' };

function lineInput(
  encodings: Record<string, string>,
  values: Record<string, unknown>[] = ROWS,
  semanticTypes: Record<string, string> = SEMANTIC_TYPES,
): ChartAssemblyInput {
  return {
    data: { values },
    semantic_types: semanticTypes,
    chart_spec: { chartType: 'Line Chart', encodings, baseSize: { width: 500, height: 300 } },
  } as ChartAssemblyInput;
}

const drawn = (option: any) => option.series.filter((s: any) => s.data.length > 0);
/** Legend entries as they read: a dash entry's name ends in a zero-width space. */
const legendNames = (option: any) =>
  option.legend.data.map((d: any) => (typeof d === 'string' ? d : d.name).replace(/\u200b$/, ''));

/** The axis tooltip at one category, as ECharts calls the formatter with one item per line. */
function axisTooltip(option: any, categoryIndex: number, series: any[] = drawn(option)): string {
  const params = series.map((s: any) => ({
    seriesName: s.name,
    value: s.data[categoryIndex],
    axisValue: option.xAxis.data?.[categoryIndex] ?? (Array.isArray(option.xAxis) ? option.xAxis[0].data[categoryIndex] : undefined),
  }));
  return option.tooltip.formatter(params);
}

describe('ECharts Line Chart — strokeDash', () => {
  it('declares strokeDash, so validation accepts it for ECharts', () => {
    expect(ecGetTemplateDef('Line Chart')!.channels).toContain('strokeDash');
    expect(() => validateChartInput(
      lineInput({ x: 'period', y: 'value', color: 'constraint', strokeDash: 'measure' }),
      'echarts',
    )).not.toThrow();
  });

  describe('with colour on another field', () => {
    const option = assembleECharts(
      lineInput({ x: 'period', y: 'value', color: 'constraint', strokeDash: 'measure' }),
    ) as any;

    it('draws one series per colour × dash pair, named after its colour value', () => {
      expect(drawn(option).map((s: any) => [s.name, s.lineStyle.type])).toEqual([
        ['C1', 'solid'],
        ['C1', DASHED],
        ['C2', 'solid'],
        ['C2', DASHED],
        ['C3', DASHED],
      ]);
    });

    it('gives every line of a colour value one palette colour', () => {
      const colorOf = (name: string) =>
        [...new Set(drawn(option).filter((s: any) => s.name === name).map((s: any) => s.itemStyle.color))];
      const [c1, c2, c3] = [colorOf('C1'), colorOf('C2'), colorOf('C3')];
      expect(c1).toHaveLength(1);
      expect(c2).toHaveLength(1);
      expect(new Set([c1[0], c2[0], c3[0]]).size).toBe(3);
      // Same colours as the chart without strokeDash.
      const plain = assembleECharts(lineInput({ x: 'period', y: 'value', color: 'constraint' })) as any;
      expect(plain.series.map((s: any) => s.itemStyle.color)).toEqual([c1[0], c2[0], c3[0]]);
    });

    it('assigns dash styles by first appearance across the data', () => {
      const reordered = assembleECharts(lineInput(
        { x: 'period', y: 'value', color: 'constraint', strokeDash: 'measure' },
        [...ROWS].reverse(),
      )) as any;
      // Reversed, Limit appears first, so Limit is solid and Consumption dashed.
      const styles = new Map<string, any>();
      for (const s of drawn(reordered)) styles.set(`${s.name}/${s.data[0][2]}`, s.lineStyle.type);
      expect(legendNames(reordered).slice(-2)).toEqual(['Limit', 'Consumption']);
      expect(styles.get('C3/0')).toBe('solid');
      expect(styles.get('C1/1')).toEqual(DASHED);
    });

    it('lists colour values with solid samples, then a gray sample per dash value', () => {
      expect(legendNames(option)).toEqual(['C1', 'C2', 'C3', 'Consumption', 'Limit']);
      const [c1, c2, c3, consumption, limit] = option.legend.data;
      for (const entry of [c1, c2, c3]) expect(entry.lineStyle).toEqual({ type: 'solid' });
      expect(consumption.lineStyle).toEqual({ type: 'solid', color: '#777777' });
      expect(limit.lineStyle).toEqual({ type: DASHED, color: '#777777' });
      expect(limit.itemStyle.opacity).toBe(0);
    });

    it('backs each dash entry with an empty proxy series', () => {
      const proxies = option.series.filter((s: any) => s.data.length === 0);
      expect(proxies.map((s: any) => [s.name, s.lineStyle.type, s.itemStyle.color])).toEqual([
        ['Consumption\u200b', 'solid', '#777777'],
        ['Limit\u200b', DASHED, '#777777'],
      ]);
    });

    it('keeps a dash value equal to a colour value its own legend entry', () => {
      // 'Limit' is both a colour value and a dash value.
      const clash = assembleECharts(lineInput(
        { x: 'period', y: 'value', color: 'constraint', strokeDash: 'measure' },
        [
          { period: 'P1', value: 8, constraint: 'Limit', measure: 'Consumption' },
          { period: 'P1', value: 9, constraint: 'Limit', measure: 'Limit' },
          { period: 'P1', value: 5, constraint: 'C1', measure: 'Consumption' },
        ],
      )) as any;
      expect(legendNames(clash)).toEqual(['Limit', 'C1', 'Consumption', 'Limit']);
      // A legend entry toggles the series of its name: the colour entry its two
      // lines, the dash entry its empty proxy alone.
      const toggledBy = (entry: any) => clash.series
        .filter((s: any) => s.name === entry.name)
        .map((s: any) => (s.data.length > 0 ? 'line' : 'proxy'));
      const [limitColour, , , limitDash] = clash.legend.data;
      expect(toggledBy(limitColour)).toEqual(['line', 'line']);
      expect(toggledBy(limitDash)).toEqual(['proxy']);
    });

    it('names each line after its colour and dash values in the axis tooltip', () => {
      expect(axisTooltip(option, 0)).toBe([
        'period: P1',
        'C1 · Consumption: 5',
        'C1 · Limit: 8',
        'C2 · Consumption: 4',
        'C2 · Limit: 9',
        'C3 · Limit: 2',
      ].join('<br/>'));
    });

    it('keeps missing values as gaps on a category axis', () => {
      const sparse = assembleECharts(lineInput(
        { x: 'period', y: 'value', color: 'constraint', strokeDash: 'measure' },
        ROWS.filter((r) => !(r.constraint === 'C1' && r.measure === 'Limit' && r.period === 'P1')),
      )) as any;
      const c1Limit = drawn(sparse).find((s: any) => s.name === 'C1' && s.data[0][2] === 1);
      expect(c1Limit.data).toEqual([['P1', null, 1], ['P2', 8, 1]]);
    });
  });

  it('without colour, draws one line per dash value in one colour, titled by the dash field', () => {
    const option = assembleECharts(lineInput(
      { x: 'period', y: 'value', strokeDash: 'measure' },
      ROWS.filter((r) => r.constraint === 'C1'),
    )) as any;
    const lines = drawn(option);
    expect(lines.map((s: any) => [s.name, s.lineStyle.type])).toEqual([
      ['Consumption', 'solid'],
      ['Limit', DASHED],
    ]);
    expect(new Set(lines.map((s: any) => s.itemStyle.color)).size).toBe(1);
    expect(option.series).toHaveLength(2);
    expect(legendNames(option)).toEqual(['Consumption', 'Limit']);
    expect(option.graphic.map((g: any) => g.style?.text)).toContain('measure');
    expect(axisTooltip(option, 1)).toBe('period: P2<br/>Consumption: 6<br/>Limit: 8');
  });

  it('with colour and strokeDash on one field, gives each value its own colour and dash', () => {
    const option = assembleECharts(lineInput(
      { x: 'period', y: 'value', color: 'measure', strokeDash: 'measure' },
      ROWS.filter((r) => r.constraint === 'C1'),
    )) as any;
    expect(option.series.map((s: any) => [s.name, s.lineStyle.type])).toEqual([
      ['Consumption', 'solid'],
      ['Limit', DASHED],
    ]);
    expect(new Set(option.series.map((s: any) => s.itemStyle.color)).size).toBe(2);
    expect(option.legend.data).toEqual(['Consumption', 'Limit']);
    expect(axisTooltip(option, 0)).toBe('period: P1<br/>Consumption: 5<br/>Limit: 8');
  });

  it('labels a missing dash value null', () => {
    const option = assembleECharts(lineInput(
      { x: 'period', y: 'value', strokeDash: 'measure' },
      [
        { period: 'P1', value: 1, measure: 'A' },
        { period: 'P1', value: 2, measure: null },
        { period: 'P1', value: 3, measure: 'B' },
      ],
    )) as any;
    expect(drawn(option).map((s: any) => [s.name, s.lineStyle.type])).toEqual([
      ['A', 'solid'],
      ['B', DASHED],
      ['null', DOTTED],
    ]);
  });

  it('with continuous colour, splits the gray line by dash value and keeps one point series', () => {
    const option = assembleECharts(lineInput(
      { x: 'x', y: 'y', color: 'score', strokeDash: 'state' },
      [
        { x: 1, y: 10, score: 0.1, state: 'Actual' },
        { x: 2, y: 12, score: 0.2, state: 'Actual' },
        { x: 2, y: 12, score: 0.2, state: 'Forecast' },
        { x: 3, y: 15, score: 0.9, state: 'Forecast' },
      ],
      { x: 'Quantity', y: 'Quantity', score: 'Quantity', state: 'Category' },
    )) as any;
    const lines = option.series.filter((s: any) => s.type === 'line');
    expect(lines.map((s: any) => [s.name, s.lineStyle.type, s.data])).toEqual([
      ['Actual', 'solid', [[1, 10], [2, 12]]],
      ['Forecast', DASHED, [[2, 12], [3, 15]]],
    ]);
    const points = option.series.findIndex((s: any) => s.type === 'scatter');
    expect(points).toBe(2);
    expect(option.visualMap.seriesIndex).toBe(points);
    expect(legendNames(option)).toEqual(['Actual', 'Forecast']);
    const tip = option.tooltip.formatter({ data: option.series[points].data[3] });
    expect(tip).toBe('x: 3<br/>y: 15<br/>score: 0.9<br/>state: Forecast');
  });

  it('keeps dash styles and tooltip names across facet panels', () => {
    const values = [
      ...ROWS.filter((r) => r.constraint !== 'C3').map((r) => ({ ...r, region: 'East' })),
      // West's first row is a limit, but Consumption appears first across the data.
      { period: 'P1', value: 3, constraint: 'C3', measure: 'Limit', region: 'West' },
      { period: 'P2', value: 3, constraint: 'C3', measure: 'Limit', region: 'West' },
      { period: 'P1', value: 1, constraint: 'C3', measure: 'Consumption', region: 'West' },
      { period: 'P2', value: 2, constraint: 'C3', measure: 'Consumption', region: 'West' },
    ];
    const option = assembleECharts(lineInput(
      { x: 'period', y: 'value', color: 'constraint', strokeDash: 'measure', column: 'region' },
      values,
      { ...SEMANTIC_TYPES, region: 'Category' },
    )) as any;
    const west = drawn(option).filter((s: any) => s.xAxisIndex === 1);
    expect(west.map((s: any) => [s.name, s.lineStyle.type])).toEqual([
      ['C3', 'solid'],
      ['C3', DASHED],
    ]);
    expect(legendNames(option).slice(-2)).toEqual(['Consumption', 'Limit']);
    const tip = west[1].data[0];
    expect(option.tooltip.formatter(west.map((s: any) => ({ seriesName: s.name, value: s.data[0], axisValue: 'P1' }))))
      .toBe(`period: P1<br/>C3 · Consumption: 1<br/>C3 · Limit: ${tip[1]}`);
  });

  it('orders measure-sorted dash values over all panels, so every panel agrees', () => {
    const row = (period: string, value: number, constraint: string, state: string, region: string) =>
      ({ period, value, constraint, state, region });
    // Ascending by total value: Forecast (22) before Actual (202) overall, though
    // East alone (Actual 2, Forecast 20) would order them the other way.
    const values = [
      row('P1', 1, 'C1', 'Actual', 'East'), row('P2', 1, 'C1', 'Actual', 'East'),
      row('P1', 10, 'C1', 'Forecast', 'East'), row('P2', 10, 'C1', 'Forecast', 'East'),
      row('P1', 100, 'C2', 'Actual', 'West'), row('P2', 100, 'C2', 'Actual', 'West'),
      row('P1', 1, 'C2', 'Forecast', 'West'), row('P2', 1, 'C2', 'Forecast', 'West'),
    ];
    const option = assembleECharts({
      data: { values },
      semantic_types: { period: 'Category', value: 'Quantity', constraint: 'Category', state: 'Category', region: 'Category' },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: {
          x: 'period', y: 'value', color: 'constraint', column: 'region',
          strokeDash: { field: 'state', sortBy: 'y', sortOrder: 'ascending' },
        },
        baseSize: { width: 500, height: 300 },
      },
    } as any) as any;
    const panel = (grid: number) => drawn(option)
      .filter((s: any) => s.xAxisIndex === grid)
      .map((s: any) => [
        option.tooltip.formatter([{ seriesName: s.name, value: s.data[0], axisValue: 'P1' }]).split('<br/>')[1],
        s.lineStyle.type,
      ]);
    expect(panel(0)).toEqual([['C1 · Forecast: 10', 'solid'], ['C1 · Actual: 1', DASHED]]);
    expect(panel(1)).toEqual([['C2 · Forecast: 1', 'solid'], ['C2 · Actual: 100', DASHED]]);
    expect(legendNames(option).slice(-2)).toEqual(['Forecast', 'Actual']);
  });
});
