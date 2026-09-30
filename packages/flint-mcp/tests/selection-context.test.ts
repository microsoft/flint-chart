import { describe, expect, it } from 'vitest';
import { selectionContextText } from '../ui/src/selection-context';
import type { ChartAssemblyInput } from 'flint-chart';
import type { ChartSelection } from 'flint-chart/interactive';

const input: ChartAssemblyInput = {
  data: { values: [] },
  chart_spec: { chartType: 'Scatter Plot', title: 'Weight and mileage', encodings: { x: 'weight', y: 'mpg' } },
};

describe('selectionContextText', () => {
  it('names the chart, the gesture, the range, and lists the rows as a table', () => {
    const selection: ChartSelection = {
      chartId: 'flint-chart-view',
      interactionId: 'brush',
      action: 'brush-x',
      range: { x: { field: 'weight', start: 1899.9925373, end: 2600 } },
      rows: [{ car: 'A', weight: 2000 }, { car: 'B', weight: 2500, mpg: 25 }],
    };
    expect(selectionContextText(selection, input)).toBe([
      'The user selected 2 rows on chart "Weight and mileage" with brush-x (weight from 1899.99 to 2600):',
      '',
      '| car | weight | mpg |',
      '| --- | --- | --- |',
      '| A | 2000 |  |',
      '| B | 2500 | 25 |',
    ].join('\n'));
  });

  it('says that the selection was cleared when no rows remain', () => {
    const selection: ChartSelection = { chartId: 'c', interactionId: 'brush', action: 'brush-x', rows: [] };
    expect(selectionContextText(selection, input)).toBe('The user cleared the selection on chart "Weight and mileage".');
  });
});
