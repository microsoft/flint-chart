import { describe, expect, it } from 'vitest';
import { MARK_LIMIT, chartContextData, chartContextText } from '../ui/src/chart-context';
import type { ChartAssemblyInput } from 'flint-chart';
import type { ChartState } from 'flint-chart/interactive';

const values = [
  { car: 'A', weight: 2000, mpg: 30, origin: 'USA' },
  { car: 'B', weight: 2500, mpg: 25, origin: 'Europe' },
  { car: 'C', weight: 3000, mpg: 20, origin: 'Japan' },
  { car: 'D', weight: 3200, mpg: 18, origin: 'Japan' },
];

const input: ChartAssemblyInput = {
  data: { values },
  chart_spec: { chartType: 'Scatter Plot', title: 'Weight and mileage', encodings: { x: 'weight', y: 'mpg', color: 'origin' } },
};

function state(partial: Partial<ChartState>): ChartState {
  return { chartType: 'Scatter Plot', selected: [], ...partial };
}

const elementOf = (row: Record<string, unknown>) => ({ value: { ...row, __flint_key: 'k' }, records: [row] });

describe('chartContextText', () => {
  it('describes one emphasized mark by its values', () => {
    expect(chartContextText(state({ selected: [elementOf(values[0])] }), input)).toBe(
      'The chart "Weight and mileage" emphasizes 1 mark where car = A, weight = 2000, mpg = 30, origin = USA.',
    );
  });

  it('describes a series by the fields its marks share', () => {
    expect(chartContextText(state({ selected: [elementOf(values[2]), elementOf(values[3])] }), input)).toBe(
      'The chart "Weight and mileage" emphasizes 2 marks where origin = Japan.',
    );
  });

  it('describes a brush by its range on the brushed axis only', () => {
    const text = chartContextText(state({ selected: [elementOf(values[0]), elementOf(values[1])] }), input, {
      action: 'brush-x',
      geometry: {
        plot: { kind: 'rect', rect: { x1: 0, y1: 0, x2: 10, y2: 10 }, axis: 'x' },
        domain: { x: { kind: 'interval', start: 1999.99999, end: 2600 }, y: { kind: 'interval', start: 0, end: 40 } },
      },
    });
    expect(text).toBe('The chart "Weight and mileage" emphasizes 2 marks where weight from 2000 to 2600.');
  });

  it('describes a histogram bar by its field and range', () => {
    const bar = { value: { field: 'weight', range: { start: 2000, end: 2500 }, count: 2 } };
    expect(chartContextText(state({ selected: [bar] }), input)).toBe(
      'The chart "Weight and mileage" emphasizes 1 mark where field = weight, range = 2000 to 2500, count = 2.',
    );
  });

  it('lists marks that share nothing, up to the limit', () => {
    const many = Array.from({ length: MARK_LIMIT + 3 }, (_, index) => elementOf({ car: `car-${index}`, weight: index }));
    const text = chartContextText(state({ selected: many }), input);
    const lines = text.split('\n');
    expect(lines[0]).toBe(`The chart "Weight and mileage" emphasizes ${MARK_LIMIT + 3} marks:`);
    expect(lines[1]).toBe('- car = car-0, weight = 0');
    expect(lines.filter((line) => line.startsWith('- ')).length).toBe(MARK_LIMIT);
    expect(lines.at(-1)).toBe('… and 3 more marks.');
  });

  it('says that nothing is emphasized', () => {
    expect(chartContextText(state({}), input)).toBe('Nothing is emphasized on chart "Weight and mileage".');
  });

  it('names the hidden series', () => {
    expect(chartContextText(state({ hidden: [{ channel: 'color', value: 'Japan' }] }), input)).toBe([
      'Nothing is emphasized on chart "Weight and mileage".',
      'Hidden: Japan.',
    ].join('\n'));
  });

  it('names a zoomed axis and keeps quiet about an axis that shows every value', () => {
    const text = chartContextText(state({
      viewport: {
        x: { kind: 'interval', start: 2199.9925373, end: 2800 },
        y: { kind: 'interval', start: 0, end: 40 },
      },
    }), input);
    expect(text).toBe([
      'Nothing is emphasized on chart "Weight and mileage".',
      'The x axis shows weight from 2199.99 to 2800.',
    ].join('\n'));
  });
});

describe('chartContextData', () => {
  it('hands over the mark values, the hidden values and the viewport', () => {
    expect(chartContextData(state({
      selected: [elementOf(values[2])],
      hidden: [{ channel: 'color', value: 'USA' }],
      viewport: { x: { kind: 'interval', start: 1, end: 2 } },
    }), input)).toEqual({
      selected: [values[2]],
      hidden: [{ channel: 'color', value: 'USA' }],
      viewport: { x: { kind: 'interval', start: 1, end: 2 } },
    });
  });
});
