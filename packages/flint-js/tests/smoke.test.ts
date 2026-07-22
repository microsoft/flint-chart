// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
  assembleVegaLite,
  assembleECharts,
  assembleChartjs,
  assemblePlotly,
  assembleExcel,
} from '../src';

const DATA = [
  { weight: 1.6, mpg: 32, origin: 'JP' },
  { weight: 2.1, mpg: 27, origin: 'US' },
  { weight: 1.9, mpg: 29, origin: 'EU' },
];

const INPUT = {
  data: { values: DATA },
  semantic_types: { weight: 'Quantity', mpg: 'Quantity', origin: 'Country' },
  chart_spec: {
    chartType: 'Scatter Plot',
    encodings: {
      x: { field: 'weight' },
      y: { field: 'mpg' },
      color: { field: 'origin' },
    },
    baseSize: { width: 400, height: 300 },
  },
};

describe('public API smoke', () => {
  it('assembleVegaLite returns a Vega-Lite spec', () => {
    const spec = assembleVegaLite(INPUT) as any;
    expect(spec).toBeDefined();
    expect(spec.$schema ?? spec.encoding ?? spec.layer ?? spec.mark).toBeDefined();
  });

  it('assembleECharts returns an option object', () => {
    const option = assembleECharts(INPUT) as any;
    expect(option).toBeDefined();
    expect(typeof option).toBe('object');
  });

  it('assembleChartjs returns a config object', () => {
    const config = assembleChartjs(INPUT) as any;
    expect(config).toBeDefined();
    expect(config.type ?? config.data ?? config.options).toBeDefined();
  });

  it('assembleExcel returns an Excel chart spec with a wide data matrix', () => {
    const spec = assembleExcel(INPUT) as any;
    expect(spec).toBeDefined();
    // XYScatter (both axes quantitative), wide matrix with a header row
    expect(spec.chartType).toBe('XYScatter');
    expect(Array.isArray(spec.data)).toBe(true);
    expect(spec.data[0]).toEqual([
      'JP weight', 'JP mpg',
      'US weight', 'US mpg',
      'EU weight', 'EU mpg',
    ]);
    expect(spec.series).toEqual([
      { name: 'JP', xColumn: 0, yColumn: 1, rowCount: 1 },
      { name: 'US', xColumn: 2, yColumn: 3, rowCount: 1 },
      { name: 'EU', xColumn: 4, yColumn: 5, rowCount: 1 },
    ]);
    expect(spec.seriesBy).toBe('Columns');
  });

  it('assembleExcel preserves bar-template roles when both axes are quantitative', () => {
    const spec = assembleExcel({
      data: { values: [{ X: 1, Value: 10 }, { X: 2, Value: 20 }] },
      semantic_types: { X: 'Quantity', Value: 'Quantity' },
      chart_spec: { chartType: 'Bar Chart', encodings: { x: 'X', y: 'Value' } },
    }) as any;

    expect(spec.kind).toBe('chart');
    expect(spec.chartType).toBe('ColumnClustered');
    expect(spec.data).toEqual([['X', 'Value'], ['1', 10], ['2', 20]]);
  });

  it('assembleExcel uses stacked charts for a colored Bar Chart', () => {
    const spec = assembleExcel({
      data: { values: [
        { Category: 'A', Value: 3, Segment: 'US' },
        { Category: 'A', Value: 4, Segment: 'JP' },
      ] },
      semantic_types: { Category: 'Category', Value: 'Quantity', Segment: 'Category' },
      chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Category', y: 'Value', color: 'Segment' } },
    }) as any;

    expect(spec.chartType).toBe('ColumnStacked');
    expect(spec.data[0]).toEqual(['Category', 'US', 'JP']);
  });

  it('assembleExcel emits native histogram data without requiring a category', () => {
    const spec = assembleExcel({
      data: { values: [{ Value: 1 }, { Value: 2 }, { Value: 3 }] },
      semantic_types: { Value: 'Quantity' },
      chart_spec: { chartType: 'Histogram', encodings: { x: 'Value' } },
    }) as any;

    expect(spec.chartType).toBe('ColumnClustered');
    expect(spec.data[0]).toEqual(['Value', 'Count']);
    expect(spec.data.slice(1).reduce((sum: number, row: any[]) => sum + row[1], 0)).toBe(3);
    expect(spec.gapWidth).toBe(0);
  });

  it('assembleExcel emits a native delta Waterfall with connector lines', () => {
    const spec = assembleExcel({
      data: { values: [
        { Department: 'Engineering', Variance: 120 },
        { Department: 'Sales', Variance: -45 },
        { Department: 'Marketing', Variance: -80 },
      ] },
      semantic_types: { Department: 'Category', Variance: 'Quantity' },
      chart_spec: {
        chartType: 'Waterfall Chart',
        encodings: { x: 'Department', y: 'Variance' },
        chartProperties: { totals: 'first' },
      },
    }) as any;

    expect(spec.kind).toBe('chart');
    expect(spec.chartType).toBe('Waterfall');
    expect(spec.data).toEqual([
      ['Department', 'Variance'],
      ['Engineering', 120],
      ['Sales', -45],
      ['Marketing', -80],
    ]);
    expect(spec.showConnectorLines).toBe(true);
  });

  it('assembleExcel normalizes native Radar series by each metric maximum', () => {
    const spec = assembleExcel({
      data: { values: [
        { Team: 'A', Metric: 'Speed', Value: 80 },
        { Team: 'B', Metric: 'Speed', Value: 100 },
        { Team: 'A', Metric: 'Cost', Value: 20 },
        { Team: 'B', Metric: 'Cost', Value: 40 },
        { Team: 'A', Metric: 'Quality', Value: 75 },
        { Team: 'B', Metric: 'Quality', Value: 50 },
      ] },
      semantic_types: { Team: 'Category', Metric: 'Category', Value: 'Quantity' },
      chart_spec: {
        chartType: 'Radar Chart',
        encodings: { x: 'Metric', y: 'Value', color: 'Team' },
      },
    }) as any;

    expect(spec.chartType).toBe('RadarMarkers');
    expect(spec.data).toEqual([
      ['Metric', 'A', 'B'],
      ['Speed (100)', 0.8, 1],
      ['Cost (50)', 0.4, 0.8],
      ['Quality (100)', 0.75, 0.5],
    ]);
    expect(spec.valueAxis).toEqual({ minimumScale: 0, maximumScale: 1, majorUnit: 0.25 });
    expect(spec.legend).toEqual({ visible: true, position: 'Bottom' });
    expect(spec.warnings).toEqual([expect.objectContaining({ code: 'excel-radar-fill-unsupported' })]);
  });

  it('assembleExcel maps unfilled Radar to native markers and rejects facets', () => {
    const input = {
      data: { values: [
        { Metric: 'A', Value: 1, Region: 'North' },
        { Metric: 'B', Value: 2, Region: 'North' },
        { Metric: 'C', Value: 3, Region: 'North' },
      ] },
      semantic_types: { Metric: 'Category', Value: 'Quantity', Region: 'Category' },
      chart_spec: {
        chartType: 'Radar Chart',
        encodings: { x: 'Metric', y: 'Value' },
        chartProperties: { filled: false },
      },
    };
    expect((assembleExcel(input) as any).chartType).toBe('RadarMarkers');

    expect(() => assembleExcel({
      ...input,
      chart_spec: {
        ...input.chart_spec,
        encodings: { ...input.chart_spec.encodings, column: 'Region' },
      },
    } as any)).toThrow('does not support faceting');
  });

  it('assembleExcel rejects generic chart facets instead of collapsing panels', () => {
    expect(() => assembleExcel({
      data: { values: [
        { Region: 'North', Category: 'A', Value: 10 },
        { Region: 'South', Category: 'A', Value: 20 },
      ] },
      semantic_types: { Region: 'Category', Category: 'Category', Value: 'Quantity' },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: { x: 'Category', y: 'Value', column: 'Region' },
      },
    })).toThrow('does not support faceting in one native Excel chart');
  });

  it('assembleExcel rejects Waterfalls requiring a non-initial total point', () => {
    expect(() => assembleExcel({
      data: { values: [
        { Step: 'Opening', Value: 500, Type: 'start' },
        { Step: 'Sales', Value: 200, Type: 'delta' },
        { Step: 'Closing', Value: 700, Type: 'end' },
      ] },
      semantic_types: { Step: 'Category', Value: 'Quantity', Type: 'Category' },
      chart_spec: {
        chartType: 'Waterfall Chart',
        encodings: { x: 'Step', y: 'Value', color: 'Type' },
      },
    })).toThrow('Office.js does not expose Waterfall total-point semantics');
  });

  it('assembleExcel preserves raw observations for native Boxplot quartiles', () => {
    const spec = assembleExcel({
      data: { values: [
        { Group: 'A', Value: 1 },
        { Group: 'A', Value: 5 },
        { Group: 'B', Value: 2 },
        { Group: 'B', Value: 8 },
      ] },
      semantic_types: { Group: 'Category', Value: 'Quantity' },
      chart_spec: { chartType: 'Boxplot', encodings: { x: 'Group', y: 'Value' } },
    }) as any;

    expect(spec.chartType).toBe('BoxWhisker');
    expect(spec.data).toEqual([
      ['Group', 'Value'],
      ['A', 1],
      ['A', 5],
      ['B', 2],
      ['B', 8],
    ]);
    expect(spec.boxWhiskerOptions).toEqual({
      quartileCalculation: 'Inclusive',
      showInnerPoints: false,
      showMeanLine: false,
      showMeanMarker: false,
      showOutlierPoints: true,
    });
  });

  it('assembleExcel emits the native StockOHLC date-open-high-low-close range', () => {
    const spec = assembleExcel({
      data: { values: [
        { Date: '2026-01-02', Open: 100, High: 108, Low: 98, Close: 105 },
        { Date: '2026-01-05', Open: 105, High: 110, Low: 101, Close: 103 },
      ] },
      semantic_types: { Date: 'Date', Open: 'Quantity', High: 'Quantity', Low: 'Quantity', Close: 'Quantity' },
      chart_spec: {
        chartType: 'Candlestick Chart',
        encodings: { x: 'Date', open: 'Open', high: 'High', low: 'Low', close: 'Close' },
      },
    }) as any;

    expect(spec.chartType).toBe('StockOHLC');
    expect(spec.seriesBy).toBe('Columns');
    expect(spec.data).toEqual([
      ['Date', 'Open', 'High', 'Low', 'Close'],
      [46024, 100, 108, 98, 105],
      [46027, 105, 110, 101, 103],
    ]);
    expect(spec.categoryAxis.numberFormat).toBe('yyyy-mm-dd');
    expect(spec.valueAxis).toEqual({
      title: 'Price',
      numberFormat: undefined,
      minimumScale: 95,
      maximumScale: 115,
      majorUnit: 5,
    });
    expect(spec.legend).toEqual({ visible: false });
  });

  it('assembleExcel rejects invalid native Candlestick rows and unsupported encodings', () => {
    const input = {
      data: { values: [
        { Date: '2026-01-02', Open: 100, High: 99, Low: 98, Close: 105, Ticker: 'A' },
      ] },
      semantic_types: {
        Date: 'Date', Open: 'Quantity', High: 'Quantity', Low: 'Quantity', Close: 'Quantity', Ticker: 'Category',
      },
      chart_spec: {
        chartType: 'Candlestick Chart',
        encodings: { x: 'Date', open: 'Open', high: 'High', low: 'Low', close: 'Close' },
      },
    };

    expect(() => assembleExcel(input)).toThrow('requires coherent OHLC values at row 1');
    expect(() => assembleExcel({
      ...input,
      data: { values: [
        { Date: '2026-01-05', Open: 100, High: 108, Low: 98, Close: 105, Ticker: 'A' },
        { Date: '2026-01-02', Open: 105, High: 110, Low: 101, Close: 103, Ticker: 'A' },
      ] },
    })).toThrow('sorted in strictly increasing chronological order');
    expect(() => assembleExcel({
      ...input,
      data: { values: [{ Date: '2026-01-02', Open: 100, High: 108, Low: 98, Close: 105, Ticker: 'A' }] },
      chart_spec: {
        ...input.chart_spec,
        encodings: { ...input.chart_spec.encodings, color: 'Ticker' },
      },
    })).toThrow('does not support color, group, or detail encodings');
    expect(() => assembleExcel({
      ...input,
      semantic_types: { ...input.semantic_types, Open: 'Category' },
      data: { values: [{ Date: '2026-01-02', Open: 'start', High: 108, Low: 98, Close: 105, Ticker: 'A' }] },
    })).toThrow('requires a quantitative open field');
    expect(() => assembleExcel({
      ...input,
      data: { values: [{ Date: '2026-01-02', Open: 100, High: Number.POSITIVE_INFINITY, Low: 98, Close: 105, Ticker: 'A' }] },
    })).toThrow('requires finite open, high, low, and close values');
  });

  it('assembleExcel accepts an explicitly ordered date-like Candlestick x field', () => {
    const spec = assembleExcel({
      data: { values: [
        { Session: '2026-01-02', Open: 100, High: 108, Low: 98, Close: 105 },
        { Session: '2026-01-05', Open: 105, High: 110, Low: 101, Close: 103 },
      ] },
      semantic_types: { Session: 'Category', Open: 'Quantity', High: 'Quantity', Low: 'Quantity', Close: 'Quantity' },
      chart_spec: {
        chartType: 'Candlestick Chart',
        encodings: {
          x: { field: 'Session', type: 'ordinal' },
          open: 'Open', high: 'High', low: 'Low', close: 'Close',
        },
      },
    }) as any;

    expect(spec.chartType).toBe('StockOHLC');
    expect(spec.data.slice(1).map((row: any[]) => row[0])).toEqual([46024, 46027]);
  });

  it('assembleExcel thins dense Candlestick date labels without dropping OHLC rows', () => {
    const values = Array.from({ length: 90 }, (_, index) => ({
      Date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
      Open: 100 + index,
      High: 103 + index,
      Low: 98 + index,
      Close: 101 + index,
    }));
    const spec = assembleExcel({
      data: { values },
      semantic_types: { Date: 'Date', Open: 'Quantity', High: 'Quantity', Low: 'Quantity', Close: 'Quantity' },
      chart_spec: {
        chartType: 'Candlestick Chart',
        encodings: { x: 'Date', open: 'Open', high: 'High', low: 'Low', close: 'Close' },
        baseSize: { width: 640, height: 380 },
      },
    }) as any;

    expect(spec.data).toHaveLength(91);
    expect(spec.categoryAxis.tickLabelSpacing).toBe(3);
  });

  it('assembleExcel rejects color-grouped native Boxplots', () => {
    expect(() => assembleExcel({
      data: { values: [{ Group: 'A', Value: 1, Segment: 'X' }] },
      semantic_types: { Group: 'Category', Value: 'Quantity', Segment: 'Category' },
      chart_spec: { chartType: 'Boxplot', encodings: { x: 'Group', y: 'Value', color: 'Segment' } },
    })).toThrow('does not yet support color-grouped');
  });

  it('assembleExcel rejects Boxplot min-max whiskers', () => {
    expect(() => assembleExcel({
      data: { values: [{ Group: 'A', Value: 1 }, { Group: 'A', Value: 2 }] },
      semantic_types: { Group: 'Category', Value: 'Quantity' },
      chart_spec: {
        chartType: 'Boxplot',
        encodings: { x: 'Group', y: 'Value' },
        chartProperties: { whiskerMethod: 'minmax' },
      },
    })).toThrow('does not support min-max whiskers');
  });

  it('assembleExcel uses native numeric-x lines instead of row-index categories', () => {
    const spec = assembleExcel({
      data: { values: [{ X: 0, Value: 2 }, { X: 10, Value: 5 }] },
      semantic_types: { X: 'Quantity', Value: 'Quantity' },
      chart_spec: { chartType: 'Line Chart', encodings: { x: 'X', y: 'Value' } },
    }) as any;

    expect(spec.chartType).toBe('XYScatterLines');
    expect(spec.data).toEqual([['X', 'Value'], [0, 2], [10, 5]]);
    expect(spec.categoryAxis).toMatchObject({ minimumScale: 0, maximumScale: 10.5, majorUnit: 2 });
    expect(spec.valueAxis).toMatchObject({ minimumScale: 2, maximumScale: 5.3, majorUnit: 1 });
  });

  it('assembleExcel binds grouped numeric-x lines as explicit XY series', () => {
    const spec = assembleExcel({
      data: { values: [
        { X: 1, Value: 10, Series: 'A' },
        { X: 2, Value: 20, Series: 'A' },
        { X: 1, Value: 30, Series: 'B' },
      ] },
      semantic_types: { X: 'Quantity', Value: 'Quantity', Series: 'Category' },
      chart_spec: { chartType: 'Line Chart', encodings: { x: 'X', y: 'Value', color: 'Series' } },
    }) as any;

    expect(spec.chartType).toBe('XYScatterLines');
    expect(spec.series).toEqual([
      { name: 'A', xColumn: 0, yColumn: 1, rowCount: 2 },
      { name: 'B', xColumn: 2, yColumn: 3, rowCount: 1 },
    ]);
    expect(spec.data[0]).toEqual(['A X', 'A Value', 'B X', 'B Value']);
  });

  it('assembleExcel thins dense temporal labels without dropping data points', () => {
    const values = Array.from({ length: 60 }, (_value, index) => ({
      Date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
      Value: index,
    }));
    const spec = assembleExcel({
      data: { values },
      semantic_types: { Date: 'Date', Value: 'Quantity' },
      chart_spec: {
        chartType: 'Area Chart',
        encodings: { x: 'Date', y: 'Value' },
        baseSize: { width: 550, height: 400 },
      },
    }) as any;

    expect(spec.data).toHaveLength(values.length + 1);
    expect(spec.categoryAxis.tickLabelSpacing).toBe(2);
  });

  it('assembleExcel emits grouped bubble series with explicit size ranges', () => {
    const spec = assembleExcel({
      data: { values: [
        { X: 1, Y: 10, Size: 5, Segment: 'A' },
        { X: 2, Y: 20, Size: 8, Segment: 'B' },
      ] },
      semantic_types: { X: 'Quantity', Y: 'Quantity', Size: 'Quantity', Segment: 'Category' },
      chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'X', y: 'Y', size: 'Size', color: 'Segment' } },
    }) as any;

    expect(spec.kind).toBe('chart');
    expect(spec.chartType).toBe('Bubble');
    expect(spec.series).toEqual([
      { name: 'A', xColumn: 0, yColumn: 1, rowCount: 1, bubbleSizeColumn: 2 },
      { name: 'B', xColumn: 3, yColumn: 4, rowCount: 1, bubbleSizeColumn: 5 },
    ]);
    expect(spec.data[0]).toEqual(['A X', 'A Y', 'A Size', 'B X', 'B Y', 'B Size']);
    expect(spec.data[1].slice(0, 2)).toEqual([1, 10]);
    expect(spec.data[1].slice(3, 5)).toEqual([2, 20]);
    expect(spec.data[1][2]).toBeLessThan(spec.data[1][5]);
  });

  it('assembleExcel rejects categorical scatter positions instead of drawing worksheet shapes', () => {
    expect(() => assembleExcel({
      data: { values: [
        { Category: 'A', Group: 'One', Size: 3 },
        { Category: 'B', Group: 'Two', Size: 8 },
      ] },
      semantic_types: { Category: 'Category', Group: 'Category', Size: 'Quantity' },
      chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'Category', y: 'Group', size: 'Size' } },
    })).toThrow('requires quantitative x and y fields');
  });

  it('assembleExcel rejects continuous-color scatter instead of dropping the color encoding', () => {
    expect(() => assembleExcel({
      data: { values: [
        { X: 1, Y: 10, Color: 0.2 },
        { X: 2, Y: 20, Color: 0.8 },
      ] },
      semantic_types: { X: 'Quantity', Y: 'Quantity', Color: 'Quantity' },
      chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'X', y: 'Y', color: 'Color' } },
    })).toThrow('does not support continuous color');
  });

  it('assembleExcel rejects categorical-y lines instead of drawing worksheet geometry', () => {
    expect(() => assembleExcel({
      data: { values: [
        { X: 0, Step: 'Stage 1' },
        { X: 50, Step: 'Stage 2' },
        { X: 100, Step: 'Stage 3' },
      ] },
      semantic_types: { X: 'Quantity', Step: 'Category' },
      chart_spec: { chartType: 'Line Chart', encodings: { x: 'X', y: 'Step' } },
    })).toThrow('requires a quantitative y field');
  });

  it('assembleExcel rejects continuous-color lines instead of overlaying worksheet shapes', () => {
    expect(() => assembleExcel({
      data: { values: [
        { Stage: 'Stage 1', Value: 10, Color: 0 },
        { Stage: 'Stage 2', Value: 20, Color: 5 },
        { Stage: 'Stage 3', Value: 15, Color: 10 },
      ] },
      semantic_types: { Stage: 'Category', Value: 'Quantity', Color: 'Quantity' },
      chart_spec: { chartType: 'Line Chart', encodings: { x: 'Stage', y: 'Value', color: 'Color' } },
    })).toThrow('does not support continuous color');
  });

  it('assembleExcel maps ordinal bubble sizes to finite ordered areas', () => {
    const spec = assembleExcel({
      data: { values: [
        { X: 1, Y: 10, Level: 'Low' },
        { X: 2, Y: 20, Level: 'Medium' },
        { X: 3, Y: 30, Level: 'High' },
      ] },
      semantic_types: { X: 'Quantity', Y: 'Quantity', Level: 'Rank' },
      chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'X', y: 'Y', size: 'Level' } },
    }) as any;

    expect(spec.chartType).toBe('Bubble');
    expect(spec.series).toEqual([
      { name: 'Y', xColumn: 0, yColumn: 1, rowCount: 3, bubbleSizeColumn: 2 },
    ]);
    const sizes = spec.data.slice(1).map((row: any[]) => row[2]);
    expect(sizes.every(Number.isFinite)).toBe(true);
    expect(sizes[0]).toBeLessThan(sizes[1]);
    expect(sizes[1]).toBeLessThan(sizes[2]);
  });

  it('assembleExcel stacks multi-series areas and anchors them at zero', () => {
    const spec = assembleExcel({
      data: { values: [
        { Date: '2026-01-01', Value: 2, Series: 'A' },
        { Date: '2026-01-01', Value: 3, Series: 'B' },
      ] },
      semantic_types: { Date: 'Date', Value: 'Quantity', Series: 'Category' },
      chart_spec: { chartType: 'Area Chart', encodings: { x: 'Date', y: 'Value', color: 'Series' } },
    }) as any;

    expect(spec.chartType).toBe('AreaStacked');
    expect(spec.valueAxis.minimumScale).toBe(0);
  });

  it('assembleExcel resamples quantitative-x areas onto a sparse-labeled numeric grid', () => {
    const spec = assembleExcel({
      data: { values: [
        { X: 0, Value: 0 },
        { X: 1, Value: 1 },
        { X: 10, Value: 10 },
      ] },
      semantic_types: { X: 'Quantity', Value: 'Quantity' },
      chart_spec: { chartType: 'Area Chart', encodings: { x: 'X', y: 'Value' } },
    }) as any;

    expect(spec.chartType).toBe('Area');
    expect(spec.data).toHaveLength(50);
    expect(spec.data[1]).toEqual(['0', 0]);
    expect(spec.data[2][0]).toBe('');
    expect(spec.data[25]).toEqual(['5', 5]);
    expect(spec.data[49]).toEqual(['10', 10]);
  });

  it('assembleExcel preserves semantic series and null gaps in sparse grouped bars', () => {
    const spec = assembleExcel({
      data: { values: [
        { Region: 'North', Sales: 10, Channel: 'Retail' },
        { Region: 'North', Sales: 20, Channel: 'Online' },
        { Region: 'South', Sales: 30, Channel: 'Online' },
        { Region: 'South', Sales: 40, Channel: 'Direct' },
      ] },
      semantic_types: { Region: 'Category', Sales: 'Quantity', Channel: 'Category' },
      chart_spec: { chartType: 'Grouped Bar Chart', encodings: { x: 'Region', y: 'Sales', group: 'Channel' } },
    }) as any;

    expect(spec.data).toEqual([
      ['Region', 'Retail', 'Online', 'Direct'],
      ['North', 10, 20, null],
      ['South', null, 30, 40],
    ]);
    expect(spec.legend).toEqual({ visible: true, position: 'Bottom' });
    expect(spec.gapWidth).toBe(180);
    expect(spec.overlap).toBe(0);
  });

  it('assembleExcel keeps horizontal grouped bars compact', () => {
    const spec = assembleExcel({
      data: { values: [
        { Region: 'North', Sales: 10, Channel: 'Retail' },
        { Region: 'North', Sales: 20, Channel: 'Online' },
        { Region: 'South', Sales: 30, Channel: 'Direct' },
      ] },
      semantic_types: { Region: 'Category', Sales: 'Quantity', Channel: 'Category' },
      chart_spec: { chartType: 'Grouped Bar Chart', encodings: { x: 'Sales', y: 'Region', group: 'Channel' } },
    }) as any;

    expect(spec.chartType).toBe('BarClustered');
    expect(spec.gapWidth).toBe(120);
    expect(spec.overlap).toBe(0);
  });

  it('assembleExcel emits a symmetric two-group native pyramid', () => {
    const spec = assembleExcel({
      data: { values: [
        { Age: '0-17', Gender: 'Male', Population: 30 },
        { Age: '0-17', Gender: 'Female', Population: 28 },
        { Age: '18-34', Gender: 'Male', Population: 20 },
        { Age: '18-34', Gender: 'Female', Population: 22 },
        { Age: '18-34', Gender: 'Female', Population: 3 },
        { Age: '35-49', Gender: 'Female', Population: 12 },
      ] },
      semantic_types: { Age: 'Category', Gender: 'Category', Population: 'Quantity' },
      chart_spec: { chartType: 'Pyramid Chart', encodings: { y: 'Age', x: 'Population', color: 'Gender' } },
    }) as any;

    expect(spec.chartType).toBe('BarStacked');
    expect(spec.data).toEqual([
      ['Age', 'Male', 'Female'],
      ['0-17', -30, 28],
      ['18-34', -20, 25],
      ['35-49', null, 12],
    ]);
    expect(spec.valueAxis).toEqual({
      title: 'Population',
      numberFormat: '#,##0;#,##0;0',
      minimumScale: -30,
      maximumScale: 30,
      majorUnit: 10,
    });
    expect(spec.seriesFormats).toEqual([{ color: '#4472C4' }, { color: '#C55A5A' }]);
    expect(spec.overlap).toBe(100);
  });

  it('assembleExcel rejects pyramids without exactly two groups', () => {
    expect(() => assembleExcel({
      data: { values: [
        { Age: '0-17', Gender: 'Female', Population: 28 },
        { Age: '18-34', Gender: 'Female', Population: 22 },
      ] },
      semantic_types: { Age: 'Category', Gender: 'Category', Population: 'Quantity' },
      chart_spec: { chartType: 'Pyramid Chart', encodings: { y: 'Age', x: 'Population', color: 'Gender' } },
    })).toThrow('requires exactly two groups');
  });

  it('assembleExcel emits a sorted native funnel and aggregates duplicate stages', () => {
    const spec = assembleExcel({
      data: { values: [
        { Stage: 'Trial', Count: 20 },
        { Stage: 'Visit', Count: 70 },
        { Stage: 'Trial', Count: 10 },
        { Stage: 'Signup', Count: 50 },
      ] },
      semantic_types: { Stage: 'Category', Count: 'Quantity' },
      chart_spec: { chartType: 'Funnel Chart', encodings: { y: 'Stage', size: 'Count' } },
    }) as any;

    expect(spec.chartType).toBe('Funnel');
    expect(spec.data).toEqual([
      ['Stage', 'Count'],
      ['Visit', 70],
      ['Signup', 50],
      ['Trial', 30],
    ]);
    expect(spec.legend).toEqual({ visible: false });
    expect(spec.dataLabels).toEqual({
      visible: true,
      numberFormat: undefined,
      fontColor: '#FFFFFF',
      fontSize: 11,
    });
    expect(spec.seriesFormats).toEqual([{ color: '#4472C4' }]);
  });

  it('assembleExcel rejects negative native funnel values', () => {
    expect(() => assembleExcel({
      data: { values: [
        { Stage: 'Visit', Count: 70 },
        { Stage: 'Refund', Count: -5 },
      ] },
      semantic_types: { Stage: 'Category', Count: 'Quantity' },
      chart_spec: { chartType: 'Funnel Chart', encodings: { y: 'Stage', size: 'Count' } },
    })).toThrow('requires non-negative values');
  });

  it('assembleExcel emits a two-level native treemap and aggregates duplicate leaves', () => {
    const spec = assembleExcel({
      data: { values: [
        { Region: 'Americas', Country: 'USA', Revenue: 20 },
        { Region: 'Europe', Country: 'France', Revenue: 30 },
        { Region: 'Americas', Country: 'USA', Revenue: 10 },
        { Region: 'Americas', Country: 'Canada', Revenue: 15 },
      ] },
      semantic_types: { Region: 'Category', Country: 'Country', Revenue: 'Amount' },
      chart_spec: { chartType: 'Treemap', encodings: { color: 'Region', detail: 'Country', size: 'Revenue' } },
    }) as any;

    expect(spec.chartType).toBe('Treemap');
    expect(spec.data).toEqual([
      ['Region', 'Country', 'Revenue'],
      ['Americas', 'USA', 30],
      ['Europe', 'France', 30],
      ['Americas', 'Canada', 15],
    ]);
    expect(spec.legend).toEqual({ visible: false });
  });

  it('assembleExcel rejects negative native treemap values', () => {
    expect(() => assembleExcel({
      data: { values: [{ Sector: 'Energy', Value: -10 }] },
      semantic_types: { Sector: 'Category', Value: 'Quantity' },
      chart_spec: { chartType: 'Treemap', encodings: { color: 'Sector', size: 'Value' } },
    })).toThrow('requires non-negative values');
  });

  it('assembleExcel emits a two-level native sunburst and aggregates duplicate leaves', () => {
    const spec = assembleExcel({
      data: { values: [
        { Department: 'Engineering', Team: 'Frontend', Headcount: 20 },
        { Department: 'Product', Team: 'Design', Headcount: 15 },
        { Department: 'Engineering', Team: 'Frontend', Headcount: 10 },
        { Department: 'Engineering', Team: 'Backend', Headcount: 25 },
      ] },
      semantic_types: { Department: 'Category', Team: 'Category', Headcount: 'Quantity' },
      chart_spec: { chartType: 'Sunburst Chart', encodings: { color: 'Department', group: 'Team', size: 'Headcount' } },
    }) as any;

    expect(spec.chartType).toBe('Sunburst');
    expect(spec.data).toEqual([
      ['Department', 'Team', 'Headcount'],
      ['Engineering', 'Frontend', 30],
      ['Product', 'Design', 15],
      ['Engineering', 'Backend', 25],
    ]);
    expect(spec.legend).toEqual({ visible: false });
  });

  it('assembleExcel rejects a sunburst detail field without a group level', () => {
    expect(() => assembleExcel({
      data: { values: [{ Department: 'Engineering', Team: 'Frontend', Headcount: 20 }] },
      semantic_types: { Department: 'Category', Team: 'Category', Headcount: 'Quantity' },
      chart_spec: { chartType: 'Sunburst Chart', encodings: { color: 'Department', detail: 'Team', size: 'Headcount' } },
    })).toThrow('requires a group field before detail');
  });

  it('assembleExcel emits connected scatter points in explicit path order', () => {
    const spec = assembleExcel({
      data: { values: [
        { Step: 3, X: 0, Y: 1 },
        { Step: 1, X: 2, Y: 0 },
        { Step: 4, X: 1, Y: 0 },
        { Step: 2, X: 1, Y: 2 },
      ] },
      semantic_types: { Step: 'Quantity', X: 'Quantity', Y: 'Quantity' },
      chart_spec: { chartType: 'Connected Scatter Plot', encodings: { x: 'X', y: 'Y', order: 'Step' } },
    }) as any;

    expect(spec.chartType).toBe('XYScatterLines');
    expect(spec.data).toEqual([
      ['X', 'Y'],
      [2, 0],
      [1, 2],
      [0, 1],
      [1, 0],
    ]);
  });

  it('assembleExcel requires connected scatter order', () => {
    expect(() => assembleExcel({
      data: { values: [{ X: 1, Y: 2 }] },
      semantic_types: { X: 'Quantity', Y: 'Quantity' },
      chart_spec: { chartType: 'Connected Scatter Plot', encodings: { x: 'X', y: 'Y' } },
    })).toThrow('requires an explicit order field');
  });

  it('assembleExcel keeps scatter axes close to the data extent', () => {
    const spec = assembleExcel({
      data: { values: [
        { X: 0, Y: 0 },
        { X: 100, Y: 100 },
      ] },
      semantic_types: { X: 'Quantity', Y: 'Quantity' },
      chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'X', y: 'Y' } },
    }) as any;

    expect(spec.categoryAxis).toMatchObject({ minimumScale: 0, maximumScale: 105, majorUnit: 20 });
    expect(spec.valueAxis).toMatchObject({ minimumScale: 0, maximumScale: 105, majorUnit: 20 });
  });

  it('assembleExcel uses a sequential scale for ordered grouped-bar series', () => {
    const spec = assembleExcel({
      data: { values: [
        { Category: 'A', Value: 10, Rank: 1 },
        { Category: 'A', Value: 20, Rank: 2 },
        { Category: 'B', Value: 30, Rank: 1 },
        { Category: 'B', Value: 40, Rank: 2 },
      ] },
      semantic_types: { Category: 'Category', Value: 'Quantity', Rank: 'Rank' },
      chart_spec: { chartType: 'Grouped Bar Chart', encodings: { x: 'Category', y: 'Value', group: 'Rank' } },
    }) as any;

    expect(spec.seriesFormats.map((format: any) => format.color)).toEqual(['#d9e2f3', '#2f5597']);
  });

  it('assembleExcel rejects occupancy matrices instead of drawing worksheet heatmaps', () => {
    expect(() => assembleExcel({
      data: { values: [
        { Category: 'A', Group: 'North', Segment: 'Sales' },
        { Category: 'B', Group: 'South', Segment: 'Engineering' },
      ] },
      semantic_types: { Category: 'Category', Group: 'Category', Segment: 'Category' },
      chart_spec: { chartType: 'Grouped Bar Chart', encodings: { x: 'Category', y: 'Group', group: 'Segment' } },
    })).toThrow('requires one quantitative measure axis');
  });

  it('assembleExcel caps dense categorical bars in the default display order', () => {
    const values = Array.from({ length: 96 }, (_value, index) => ({
      Group: `Category ${index + 1}`,
      Value: (index * 37) % 101,
    }));
    const input = {
      data: { values },
      semantic_types: { Group: 'Category', Value: 'Quantity' },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: { x: 'Value', y: 'Group' },
        baseSize: { width: 560, height: 360 },
      },
    } as const;

    const excel = assembleExcel(input) as any;
    const vegaLite = assembleVegaLite(input) as any;
    const expectedOrder = vegaLite.encoding.y.scale.domain.filter((value: string) =>
      !value.includes('items omitted'),
    );

    expect(excel.data.slice(1).map((row: any[]) => row[0])).toEqual(expectedOrder);
    expect(expectedOrder).toEqual(values.slice(0, expectedOrder.length).map((row) => row.Group));
    expect(excel.data.length).toBeLessThan(values.length + 1);
    expect(excel.categoryAxis.labelFontSize).toBe(5);
  });

  it('assembleExcel caps dense bars using the selected value sort', () => {
    const values = Array.from({ length: 96 }, (_value, index) => ({
      Group: `Category ${index + 1}`,
      Value: index,
    }));
    const input = {
      data: { values },
      semantic_types: { Group: 'Category', Value: 'Quantity' },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: {
          x: 'Value',
          y: { field: 'Group', sortBy: 'x', sortOrder: 'descending' as const },
        },
        baseSize: { width: 560, height: 360 },
      },
    };

    const excel = assembleExcel(input as any) as any;
    const kept = excel.data.slice(1).map((row: any[]) => row[0]);

    expect(kept).toEqual(values.slice(-kept.length).reverse().map((row) => row.Group));
  });

  it('assembleExcel interpolates sparse connected series', () => {
    const spec = assembleExcel({
      data: { values: [
        { Date: '2026-01-01', Value: 10, Series: 'A' },
        { Date: '2026-01-02', Value: 20, Series: 'B' },
        { Date: '2026-01-03', Value: 30, Series: 'A' },
      ] },
      semantic_types: { Date: 'Date', Value: 'Quantity', Series: 'Category' },
      chart_spec: { chartType: 'Area Chart', encodings: { x: 'Date', y: 'Value', color: 'Series' } },
    }) as any;

    expect(spec.data).toEqual([
      ['Date', 'A', 'B'],
      ['2026-01-01', 10, null],
      ['2026-01-02', 20, 20],
      ['2026-01-03', 30, null],
    ]);
  });

  it('assembleExcel rejects continuous-color lines as unsupported native charts', () => {
    expect(() => assembleExcel({
      data: { values: [
        { Date: '2026-01-01', Value: 10, Color: 0.2 },
        { Date: '2026-01-02', Value: 12, Color: 0.8 },
      ] },
      semantic_types: { Date: 'Date', Value: 'Quantity', Color: 'Quantity' },
      chart_spec: { chartType: 'Line Chart', encodings: { x: 'Date', y: 'Value', color: 'Color' } },
    })).toThrow('does not support continuous color');
  });

  it('assembleExcel preserves forecast handoffs as styled dash series', () => {
    const spec = assembleExcel({
      data: { values: [
        { Date: '2026-01-01', Value: 10, Type: 'actual' },
        { Date: '2026-01-02', Value: 12, Type: 'actual' },
        { Date: '2026-01-02', Value: 12, Type: 'forecast' },
        { Date: '2026-01-03', Value: 15, Type: 'forecast' },
      ] },
      semantic_types: { Date: 'Date', Value: 'Quantity', Type: 'Category' },
      chart_spec: { chartType: 'Line Chart', encodings: { x: 'Date', y: 'Value', strokeDash: 'Type' } },
    }) as any;

    expect(spec.data).toEqual([
      ['Date', 'actual', 'forecast'],
      ['2026-01-01', 10, null],
      ['2026-01-02', 12, 12],
      ['2026-01-03', null, 15],
    ]);
    expect(spec.seriesFormats).toEqual([
      { color: '#4472C4', lineStyle: 'Continuous' },
      { color: '#4472C4', lineStyle: 'Dash' },
    ]);
  });

  it('line chart with quantitative color uses a line layer plus colored points', () => {
    const spec = assembleVegaLite({
      data: {
        values: [
          { Date: '2019-12-31', Value: 117, ColorVal: 2.4 },
          { Date: '2020-02-05', Value: 109, ColorVal: 1.9 },
        ],
      },
      semantic_types: { Date: 'Date', Value: 'Quantity', ColorVal: 'Quantity' },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: {
          x: { field: 'Date' },
          y: { field: 'Value' },
          color: { field: 'ColorVal' },
        },
        baseSize: { width: 480, height: 320 },
      },
    }) as any;

    expect(spec.layer).toHaveLength(2);
    expect(spec.layer[0].mark.type).toBe('line');
    expect(spec.layer[0].encoding.x?.field).toBe('Date');
    expect(spec.layer[0].encoding.y?.field).toBe('Value');
    expect(spec.layer[1].encoding.color?.field).toBe('ColorVal');
    expect(spec.layer[1].encoding.color?.type).toBe('quantitative');
  });

  it('line chart preserves the interpolate chart property', () => {
    const spec = assembleVegaLite({
      data: {
        values: [
          { Date: '2026-02', Value: 12 },
          { Date: '2026-03', Value: 18 },
          { Date: '2026-04', Value: 15 },
        ],
      },
      semantic_types: { Date: 'YearMonth', Value: 'Quantity' },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: {
          x: { field: 'Date' },
          y: { field: 'Value' },
        },
        chartProperties: { interpolate: 'monotone' },
      },
    }) as any;

    expect(spec.mark).toMatchObject({ type: 'line', interpolate: 'monotone' });
  });

  it('chart.js line with quantitative color uses separate datasets per color value', () => {
    const config = assembleChartjs({
      data: {
        values: [
          { Date: '2019-12-31', Value: 117, ColorVal: 2.4 },
          { Date: '2020-02-05', Value: 109, ColorVal: 9.5 },
        ],
      },
      semantic_types: { Date: 'Date', Value: 'Quantity', ColorVal: 'Quantity' },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: {
          x: { field: 'Date' },
          y: { field: 'Value' },
          color: { field: 'ColorVal' },
        },
        baseSize: { width: 480, height: 320 },
      },
    }) as any;

    expect(config.data.datasets).toHaveLength(2);
    expect(config.data.datasets[0].data).toHaveLength(1);
    expect(config.data.datasets[1].data).toHaveLength(1);
  });

  it('aggregate encodings compute the derived field from raw rows (count/sum/average/mean)', () => {
    const makeBar = (aggregate: 'count' | 'sum' | 'average' | 'mean') =>
      assembleVegaLite({
        data: {
          // Raw, un-aggregated rows: method A has times [1, 3], method B has [2, 4].
          values: [
            { method: 'A', time: 1 },
            { method: 'A', time: 3 },
            { method: 'B', time: 2 },
            { method: 'B', time: 4 },
          ],
        },
        semantic_types: { method: 'Category', time: 'Quantity' },
        chart_spec: {
          chartType: 'Bar Chart',
          encodings: {
            x: { field: 'method' },
            y: { field: 'time', aggregate },
          },
        },
      }) as any;

    // The encoding points at the derived column (`${field}_${aggregate}`; count
    // uses `_count`) and the type is quantitative.
    expect(makeBar('sum').encoding.y.field).toBe('time_sum');
    expect(makeBar('average').encoding.y.field).toBe('time_average');
    expect(makeBar('mean').encoding.y.field).toBe('time_mean');
    expect(makeBar('count').encoding.y.field).toBe('_count');
    for (const agg of ['sum', 'average', 'mean', 'count'] as const) {
      expect(makeBar(agg).encoding.y.type).toBe('quantitative');
    }

    // Flint actually computes the aggregation: rows collapse to one per group
    // (method A, method B) with the correct derived values.
    const rowsFor = (agg: 'count' | 'sum' | 'average' | 'mean', col: string) =>
      (makeBar(agg).data.values as any[])
        .sort((a, b) => String(a.method).localeCompare(String(b.method)))
        .map(r => r[col]);

    expect(rowsFor('sum', 'time_sum')).toEqual([4, 6]);        // A: 1+3, B: 2+4
    expect(rowsFor('average', 'time_average')).toEqual([2, 3]); // A: mean(1,3), B: mean(2,4)
    expect(rowsFor('mean', 'time_mean')).toEqual([2, 3]);       // synonym of average
    expect(rowsFor('count', '_count')).toEqual([2, 2]);         // 2 rows per group
  });
});
