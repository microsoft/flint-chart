// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
  assembleVegaLite,
  assembleECharts,
  assembleChartjs,
  getChartPivot,
  getChartTransform,
  getEChartsPivot,
  getChartjsPivot,
} from '../src';
import {
  computePivot,
  applyPivot,
  applyTransform,
  computeArrangeStates,
  computeChartTypeStates,
} from '../src/core/pivot';
import { CHART_TRANSITIONS, getChartTransitions } from '../src/core/chart-transitions';
import { barChartDef } from '../src/vegalite/templates/bar';
import { groupedBarChartDef, stackedBarChartDef, histogramDef } from '../src/vegalite/templates/bar';
import { lineChartDef } from '../src/vegalite/templates/line';
import { areaChartDef } from '../src/vegalite/templates/area';
import { lollipopChartDef } from '../src/vegalite/templates/lollipop';
import { densityPlotDef } from '../src/vegalite/templates/density';
import { scatterPlotDef } from '../src/vegalite/templates/scatter';
import { stripPlotDef } from '../src/vegalite/templates/jitter';
import { vlGetTemplateDef } from '../src/vegalite/templates';

const BAR_DATA = [
  { region: 'North', segment: 'A', sales: 10 },
  { region: 'North', segment: 'B', sales: 12 },
  { region: 'South', segment: 'A', sales: 8 },
  { region: 'South', segment: 'B', sales: 14 },
];
const BAR_SEMANTIC = { region: 'Category', segment: 'Category', sales: 'Quantity' };

const BAR_ENC = {
  x: { field: 'region', type: 'nominal' as const },
  y: { field: 'sales', type: 'quantitative' as const },
  color: { field: 'segment', type: 'nominal' as const },
};

describe('computePivot — enumeration', () => {
  it('augments a color series with mutually exclusive facet identity states', () => {
    const comp = computeArrangeStates(barChartDef, BAR_ENC, BAR_DATA)!;
    expect(comp.ids).toContain('augment:column');
    expect(comp.ids).not.toContain('augment:row');
    expect(comp.labels[comp.ids.indexOf('augment:column')]).toBe('Color + Columns');
    expect(comp.statesById['augment:column'].column.field).toBe('segment');
    expect(comp.statesById['augment:column'].color).toBeUndefined();
    expect(comp.augmentationById['augment:column']).toMatchObject({
      kind: 'facet-identity',
      sourceChannel: 'color',
      facetChannel: 'column',
      colorEncoding: { field: 'segment', type: 'nominal' },
    });
    expect(comp.ids.some(id => id.includes('augment:column|augment:row'))).toBe(false);
  });

  it('prefers row augmentation for a horizontal bar', () => {
    const enc = {
      x: { field: 'sales', type: 'quantitative' as const },
      y: { field: 'region', type: 'nominal' as const },
      color: { field: 'segment', type: 'nominal' as const },
    };
    const comp = computeArrangeStates(barChartDef, enc, BAR_DATA)!;
    expect(comp.ids).toContain('augment:row');
    expect(comp.ids).not.toContain('augment:column');
  });

  it('revalidates facet preference after composing an orientation flip', () => {
    const comp = computeArrangeStates(barChartDef, BAR_ENC, BAR_DATA)!;
    expect(comp.ids).not.toContain('augment:column|flip:x-y');
    expect(comp.ids).toContain('flip:x-y|augment:row');
    expect(comp.augmentationById['flip:x-y|augment:row']?.facetChannel).toBe('row');
  });

  it('defaults to column augmentation without a discrete domain axis', () => {
    const enc = {
      x: { field: 'sales', type: 'quantitative' as const },
      y: { field: 'profit', type: 'quantitative' as const },
      color: { field: 'segment', type: 'nominal' as const },
    };
    const data = BAR_DATA.map((row, index) => ({ ...row, profit: index + 1 }));
    const comp = computeArrangeStates(scatterPlotDef, enc, data)!;
    expect(comp.ids).toContain('augment:column');
    expect(comp.ids).not.toContain('augment:row');
  });

  it('only shifts an authored facet toward the preferred direction', () => {
    const data = BAR_DATA.map((row, index) => ({ ...row, market: index % 2 ? 'East' : 'West' }));
    const verticalWithRow = computeArrangeStates(barChartDef, {
      x: { field: 'region', type: 'nominal' },
      y: { field: 'sales', type: 'quantitative' },
      row: { field: 'market', type: 'nominal' },
    }, data)!;
    expect(verticalWithRow.ids).toContain('series:column');

    const horizontalWithColumn = computeArrangeStates(barChartDef, {
      x: { field: 'sales', type: 'quantitative' },
      y: { field: 'region', type: 'nominal' },
      column: { field: 'market', type: 'nominal' },
    }, data)!;
    expect(horizontalWithColumn.ids).toContain('series:row');

    const verticalWithColumn = computeArrangeStates(barChartDef, {
      x: { field: 'region', type: 'nominal' },
      y: { field: 'sales', type: 'quantitative' },
      column: { field: 'market', type: 'nominal' },
    }, data)!;
    expect(verticalWithColumn.ids).not.toContain('series:row');
  });

  it('materializes facet identity color after structural bar layout', () => {
    const spec = assembleVegaLite({
      data: { values: BAR_DATA },
      semantic_types: BAR_SEMANTIC,
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: BAR_ENC,
        chartProperties: { arrange: 'augment:column' },
      },
    });
    expect(spec.encoding.facet.field).toBe('segment');
    expect(spec.encoding.color.field).toBe('segment');
    expect(spec.encoding.y.stack).toBeNull();
  });

  it.each([
    ['Grouped Bar Chart', { x: 'region', y: 'sales', group: 'segment' }],
    ['Line Chart', { x: 'region', y: 'sales', color: 'segment' }],
    ['Scatter Plot', { x: 'sales', y: 'profit', color: 'segment' }],
  ])('materializes facet identity color for %s', (chartType, encodings) => {
    const data = BAR_DATA.map((row, index) => ({ ...row, profit: index + 1 }));
    const spec = assembleVegaLite({
      data: { values: data },
      semantic_types: { ...BAR_SEMANTIC, profit: 'Quantity' },
      chart_spec: {
        chartType,
        encodings,
        chartProperties: { arrange: 'augment:column' },
      },
    });
    const marks = spec.spec?.encoding ?? spec.encoding;
    const facet = spec.facet ?? spec.encoding?.facet ?? spec.encoding?.column;
    expect(facet.field).toBe('segment');
    expect(marks.color.field).toBe('segment');
    expect(marks.xOffset).toBeUndefined();
  });

  it('reserves the group channel for Grouped Bar', () => {
    expect(barChartDef.channels).not.toContain('group');
    expect(groupedBarChartDef.channels).toContain('group');
  });

  it('bar chart exposes default + orientation + role + series routing states', () => {
    const comp = computePivot(barChartDef, BAR_ENC, BAR_DATA);
    expect(comp).not.toBeNull();
    // series field is on color; plain Bar can route it to column / row facets.
    // Group routing belongs to the explicit Grouped Bar chart type. The
    // orbit is enumerated at runtime and also composes these generators (e.g.
    // orient · augment:*), so assert the single-generator states are all present
    // rather than pinning an exact flat list.
    for (const id of ['default', 'flip:x-y', 'swap:x-color', 'augment:column', 'augment:row']) {
      expect(comp!.ids).toContain(id);
    }
    expect(comp!.ids).not.toContain('series:group');
    expect(comp!.ids[0]).toBe('default');
    // composition shows up as multi-step path ids.
    expect(comp!.ids.some(id => id.includes('|'))).toBe(true);
  });

  it('orientation state swaps the x and y channels', () => {
    const comp = computePivot(barChartDef, BAR_ENC, BAR_DATA)!;
    const orient = comp.statesById['flip:x-y'];
    expect(orient.x.field).toBe('sales');
    expect(orient.y.field).toBe('region');
  });

  it('role state swaps the discrete position field with the color field', () => {
    const comp = computePivot(barChartDef, BAR_ENC, BAR_DATA)!;
    const role = comp.statesById['swap:x-color'];
    expect(role.x.field).toBe('segment');
    expect(role.color.field).toBe('region');
    expect(role.y.field).toBe('sales');
  });

  it('series augmentation retains color identity across column and row facets', () => {
    const comp = computePivot(barChartDef, BAR_ENC, BAR_DATA)!;
    expect(comp.statesById['series:group']).toBeUndefined();
    const cols = comp.statesById['augment:column'];
    expect(cols.column.field).toBe('segment');
    expect(cols.color).toBeUndefined();
    const rows = comp.statesById['augment:row'];
    expect(rows.row.field).toBe('segment');
  });

  it('routes a series authored on column back to color/row, not group', () => {
    const enc = {
      x: { field: 'segment', type: 'nominal' as const },
      y: { field: 'sales', type: 'quantitative' as const },
      column: { field: 'region', type: 'nominal' as const },
    };
    const comp = computePivot(barChartDef, enc, BAR_DATA)!;
    expect(comp.ids).toContain('series:color');
    expect(comp.ids).not.toContain('series:group');
    expect(comp.ids).toContain('series:row');
    expect(comp.statesById['series:color'].color.field).toBe('region');
    expect(comp.statesById['series:color'].column).toBeUndefined();
    expect(comp.statesById['series:row'].row.field).toBe('region');
  });

  it('separates facet shifting from augmentation when color and column are occupied', () => {
    const enc = {
      x: { field: 'region', type: 'nominal' as const },
      y: { field: 'sales', type: 'quantitative' as const },
      color: { field: 'segment', type: 'nominal' as const },
      column: { field: 'market', type: 'nominal' as const },
    };
    const data = BAR_DATA.map((row, index) => ({ ...row, market: index % 2 ? 'East' : 'West' }));
    const comp = computePivot(barChartDef, enc, data)!;

    expect(comp.ids).not.toContain('augment:column');
    expect(comp.ids).not.toContain('series:column');
    expect(comp.ids).toContain('augment:row');
    expect(comp.labels[comp.ids.indexOf('augment:row')]).toBe('Color + Rows');
    expect(comp.statesById['augment:row'].column.field).toBe('market');
    expect(comp.augmentationById['augment:row']?.colorEncoding.field).toBe('segment');
    expect(comp.ids).toContain('series:row');
    expect(comp.labels[comp.ids.indexOf('series:row')]).toBe('Columns ⇄ Rows');
    expect(comp.statesById['series:row'].row.field).toBe('market');
    expect(comp.statesById['series:row'].color.field).toBe('segment');

    const spec = assembleVegaLite({
      data: { values: data },
      semantic_types: { ...BAR_SEMANTIC, market: 'Category' },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: enc,
        chartProperties: { arrange: 'augment:row' },
      },
    });
    expect(spec.encoding.facet.field).toBe('market');
    expect(spec.encoding.row).toBeUndefined();
    expect(spec.encoding.color.field).toBe('segment');
  });

  it('returns null when the template declares no pivot', () => {
    const noPivot = { ...barChartDef, pivot: undefined };
    expect(computePivot(noPivot, BAR_ENC, BAR_DATA)).toBeNull();
  });
});

describe('computePivot — gating', () => {
  it('offers orientation on a bar with a banded temporal axis', () => {
    const enc = {
      x: { field: 'sales', type: 'quantitative' as const },
      y: { field: 'day', type: 'temporal' as const },
      color: { field: 'segment', type: 'nominal' as const },
    };
    const comp = computePivot(barChartDef, enc, BAR_DATA)!;
    // bar bands its temporal axis → orientation + role (temporal acts discrete).
    expect(comp.ids).toContain('flip:x-y');
    expect(comp.ids).toContain('swap:y-color');
  });

  it('suppresses orientation on a line for any x type (no vertical line)', () => {
    const temporalX = {
      x: { field: 'day', type: 'temporal' as const },
      y: { field: 'sales', type: 'quantitative' as const },
      color: { field: 'segment', type: 'nominal' as const },
    };
    expect(computePivot(lineChartDef, temporalX, BAR_DATA)!.ids).not.toContain('flip:x-y');
    // A non-temporal (quantitative) x must also never flip into a vertical line,
    // and the domain axis is never demoted into a series (no x↔color).
    const quantX = {
      x: { field: 'sales', type: 'quantitative' as const },
      y: { field: 'profit', type: 'quantitative' as const },
      color: { field: 'segment', type: 'nominal' as const },
    };
    const comp = computePivot(lineChartDef, quantX, BAR_DATA)!;
    expect(comp.ids).not.toContain('flip:x-y');
    expect(comp.ids).not.toContain('swap:x-color');
  });

  it('suppresses role swap without a discrete color field', () => {
    const enc = {
      x: { field: 'region', type: 'nominal' as const },
      y: { field: 'sales', type: 'quantitative' as const },
    };
    const comp = computePivot(barChartDef, enc, BAR_DATA)!;
    expect(comp.ids).not.toContain('swap:x-color');
  });

  it('suppresses facet routing when cardinality exceeds the budget', () => {
    const wide = Array.from({ length: 40 }, (_, i) => ({
      region: 'R' + (i % 3),
      segment: 'S' + i,
      sales: i,
    }));
    const comp = computePivot(barChartDef, BAR_ENC, wide)!;
    expect(comp.ids).not.toContain('augment:column');
    expect(comp.ids).not.toContain('augment:row');
  });

  it('scatter with two measures exposes orientation + a regression transition', () => {
    const enc = {
      x: { field: 'a', type: 'quantitative' as const },
      y: { field: 'b', type: 'quantitative' as const },
    };
    const comp = computePivot(scatterPlotDef, enc, BAR_DATA)!;
    expect(comp.ids).toContain('flip:x-y');
    expect(comp.ids).toContain('type:Regression');
    // No discrete role swap without a color/size field.
    expect(comp.ids.some((id) => id.startsWith('swap:'))).toBe(false);
  });

  it('scatter swaps a quantitative position field with a quantitative color', () => {
    const enc = {
      x: { field: 'a', type: 'quantitative' as const },
      y: { field: 'b', type: 'quantitative' as const },
      color: { field: 'c', type: 'quantitative' as const },
    };
    const comp = computePivot(scatterPlotDef, enc, BAR_DATA)!;
    // identity + axis swap + (X↔color, Y↔color) + the Regression transition,
    // plus their compositions (the runtime orbit). No discrete role swap.
    expect(comp.ids).toContain('flip:x-y');
    expect(comp.ids).toContain('swap:x-color');
    expect(comp.ids).toContain('swap:y-color');
    expect(comp.ids).toContain('type:Regression');
    // Y↔color exchanges the field on Y with the field on color (type-preserving).
    const yColor = comp.statesById['swap:y-color'];
    expect(yColor.y.field).toBe('c');
    expect(yColor.color.field).toBe('b');
    expect(yColor.color.type).toBe('quantitative');
    expect(yColor.x.field).toBe('a');
  });

  it('scatter also offers swapping a position field with a quantitative size', () => {
    const enc = {
      x: { field: 'a', type: 'quantitative' as const },
      y: { field: 'b', type: 'quantitative' as const },
      size: { field: 'd', type: 'quantitative' as const },
    };
    const comp = computePivot(scatterPlotDef, enc, BAR_DATA)!;
    expect(comp.ids).toContain('swap:x-size');
    expect(comp.ids).toContain('swap:y-size');
    expect(comp.statesById['swap:x-size'].x.field).toBe('d');
    expect(comp.statesById['swap:x-size'].size.field).toBe('a');
  });

  it('scatter does NOT swap a discrete color into a precise position axis', () => {
    const enc = {
      x: { field: 'a', type: 'quantitative' as const },
      y: { field: 'b', type: 'quantitative' as const },
      color: { field: 'segment', type: 'nominal' as const },
    };
    const comp = computePivot(scatterPlotDef, enc, BAR_DATA)!;
    // A category can't faithfully occupy a *quantitative* axis, so no role swap.
    // It can, however, become a jitter category axis via the Strip Plot transition.
    expect(comp.ids).not.toContain('swap:x-color');
    expect(comp.ids).not.toContain('swap:y-color');
    expect(comp.ids).toContain('type:Strip Plot');
  });

  it('bars do NOT offer measure↔color swaps (length measure is privileged)', () => {
    const enc = {
      x: { field: 'region', type: 'nominal' as const },
      y: { field: 'sales', type: 'quantitative' as const },
      color: { field: 'profit', type: 'quantitative' as const },
    };
    const comp = computePivot(barChartDef, enc, BAR_DATA)!;
    expect(comp.ids.some(id => id.startsWith('swap:') && id.includes('color'))).toBe(false);
  });
});

describe('applyPivot — composition + surface', () => {
  it('falls back to the identity state for a stale stored id', () => {
    const { encodings, surface } = applyPivot(
      barChartDef, BAR_ENC, BAR_DATA, { pivot: 'does-not-exist' },
    );
    expect(surface!.index).toBe(0);
    expect(encodings.x.field).toBe('region');
  });

  it('composes the stored state and reports its index', () => {
    const { encodings, surface } = applyPivot(
      barChartDef, BAR_ENC, BAR_DATA, { pivot: 'flip:x-y' },
    );
    expect(surface!.index).toBe(1);
    expect(encodings.x.field).toBe('sales');
  });

  it('returns to the authored view when the override is absent', () => {
    const { encodings, surface } = applyPivot(barChartDef, BAR_ENC, BAR_DATA, undefined);
    expect(surface!.index).toBe(0);
    expect(encodings.x.field).toBe('region');
  });
});

describe('getChartPivot — end-to-end through assembleVegaLite', () => {
  const input = (pivot?: string) => ({
    data: { values: BAR_DATA },
    semantic_types: BAR_SEMANTIC,
    chart_spec: {
      chartType: 'Bar Chart',
      encodings: { x: 'region', y: 'sales', color: 'segment' },
      baseSize: { width: 400, height: 300 },
      ...(pivot ? { chartProperties: { pivot } } : {}),
    },
  });

  it('surfaces the pivot states and active index', () => {
    const surface = getChartPivot(input());
    expect(surface).toBeDefined();
    expect(surface!.length).toBeGreaterThan(1);
    expect(surface!.index).toBe(0);
    expect(surface!.ids[0]).toBe('default');
  });

  it('reflects the stored pivot id in the active index', () => {
    const surface = getChartPivot(input('flip:x-y'));
    expect(surface!.index).toBe(surface!.ids.indexOf('flip:x-y'));
  });

  it('orientation pivot swaps the axes in the assembled spec', () => {
    const base = assembleVegaLite(input());
    const swapped = assembleVegaLite(input('flip:x-y'));
    expect(base.encoding.x.field).toBe('region');
    expect(swapped.encoding.x.field).toBe('sales');
    expect(swapped.encoding.y.field).toBe('region');
  });
});

describe('backend pivot parity — ECharts and Chart.js', () => {
  const barInput = (pivot?: string) => ({
    data: { values: BAR_DATA },
    semantic_types: BAR_SEMANTIC,
    chart_spec: {
      chartType: 'Bar Chart',
      encodings: { x: 'region', y: 'sales', color: 'segment' },
      baseSize: { width: 400, height: 300 },
      ...(pivot ? { chartProperties: { pivot } } : {}),
    },
  });

  const scatterInput = (pivot?: string) => ({
    data: {
      values: [
        { a: 1, b: 2, c: 'X' }, { a: 3, b: 1, c: 'Y' },
        { a: 2, b: 4, c: 'X' }, { a: 5, b: 3, c: 'Y' },
      ],
    },
    semantic_types: { a: 'Quantity', b: 'Quantity', c: 'Category' },
    chart_spec: {
      chartType: 'Scatter Plot',
      encodings: { x: 'a', y: 'b', color: 'c' },
      baseSize: { width: 400, height: 300 },
      ...(pivot ? { chartProperties: { pivot } } : {}),
    },
  });

  const stackedFacetInput = (backend: 'vegalite' | 'echarts' | 'chartjs') => ({
    data: { values: BAR_DATA },
    semantic_types: BAR_SEMANTIC,
    chart_spec: {
      chartType: 'Stacked Bar Chart',
      encodings: { x: 'region', y: 'sales', color: 'segment' },
      baseSize: { width: 400, height: 300 },
      chartProperties: { pivot: 'augment:column', stackMode: backend === 'vegalite' ? 'center' : 'normalize' },
    },
  });

  const stripContinuousColorInput = () => ({
    data: {
      values: [
        { group: 'Alpha', y: 2, score: 1 },
        { group: 'Beta', y: 4, score: 5 },
        { group: 'Alpha', y: 3, score: 9 },
      ],
    },
    semantic_types: { group: 'Category', y: 'Quantity', score: 'Quantity' },
    chart_spec: {
      chartType: 'Strip Plot',
      encodings: { x: 'group', y: 'y', color: 'score' },
      baseSize: { width: 400, height: 300 },
    },
  });

  it('ECharts exposes the View surface and applies orientation before assembly', () => {
    const surface = getEChartsPivot(barInput());
    expect(surface?.label).toBe('View');
    expect(surface?.ids).toContain('flip:x-y');

    const option = assembleECharts(barInput('flip:x-y')) as any;
    expect(option._pivot.index).toBe(option._pivot.ids.indexOf('flip:x-y'));
    expect(option.xAxis.name).toBe('sales');
    expect(option.yAxis.name).toBe('region');
  });

  it('Chart.js exposes the View surface and applies orientation before assembly', () => {
    const surface = getChartjsPivot(barInput());
    expect(surface?.label).toBe('View');
    expect(surface?.ids).toContain('flip:x-y');

    const config = assembleChartjs(barInput('flip:x-y')) as any;
    expect(config._pivot.index).toBe(config._pivot.ids.indexOf('flip:x-y'));
    expect(config.options.indexAxis).toBe('y');
    expect(config.options.scales.x.title.text).toBe('sales');
    expect(config.options.scales.y.title.text).toBe('region');
  });

  it('ECharts re-dispatches scatter → Strip Plot for the jitter View', () => {
    const option = assembleECharts(scatterInput('type:Strip Plot')) as any;
    expect(option._pivot.ids).toContain('type:Strip Plot');
    expect(Array.isArray(option.xAxis)).toBe(true);
    expect(option.xAxis[0].name).toBe('c');
    expect(option.yAxis.name).toBe('b');
  });

  it('Chart.js re-dispatches scatter → Strip Plot for the jitter View', () => {
    const config = assembleChartjs(scatterInput('type:Strip Plot')) as any;
    expect(config._pivot.ids).toContain('type:Strip Plot');
    expect(config.type).toBe('scatter');
    expect(config.options.scales.x.title.text).toBe('c');
    expect(config.options.scales.y.title.text).toBe('b');
  });

  it('does not keep stack offsets when a stacked series is routed to facets', () => {
    const vl = assembleVegaLite(stackedFacetInput('vegalite')) as any;
    expect(vl.encoding.color.field).toBe('segment');
    expect(vl.encoding.facet?.field ?? vl.encoding.column?.field).toBe('segment');
    expect(vl.encoding.y.stack).toBeNull();

    const ec = assembleECharts(stackedFacetInput('echarts')) as any;
    for (const series of ec.series ?? []) {
      expect(series.stack).toBeUndefined();
    }

    const cjs = assembleChartjs(stackedFacetInput('chartjs')) as any;
    for (const row of cjs._facetPanels ?? []) {
      for (const panel of row) {
        expect(panel.config.options.scales.x.stacked).toBe(false);
        expect(panel.config.options.scales.y.stacked).toBe(false);
      }
    }
  });

  it('keeps quantitative strip-plot color continuous instead of categorical', () => {
    const ec = assembleECharts(stripContinuousColorInput()) as any;
    expect(ec.legend).toBeUndefined();
    expect(ec.series).toHaveLength(1);
    expect(ec.series[0].data[0]).toHaveLength(3);
    expect(ec.visualMap?.type).toBe('continuous');
    expect(ec.visualMap?.dimension).toBe(2);

    const cjs = assembleChartjs(stripContinuousColorInput()) as any;
    expect(cjs.options.plugins.legend.display).toBe(false);
    expect(cjs.data.datasets).toHaveLength(1);
    expect(Array.isArray(cjs.data.datasets[0].backgroundColor)).toBe(true);
  });
});

describe('computePivot — chart-type transitions', () => {
  const GROUPED_ENC = {
    x: { field: 'region', type: 'nominal' as const },
    y: { field: 'sales', type: 'quantitative' as const },
    group: { field: 'segment', type: 'nominal' as const },
  };
  const STACKED_ENC = {
    x: { field: 'region', type: 'nominal' as const },
    y: { field: 'sales', type: 'quantitative' as const },
    color: { field: 'segment', type: 'nominal' as const },
  };
  const SCATTER_DATA = [
    { a: 1, b: 2, c: 'X' }, { a: 3, b: 1, c: 'Y' },
    { a: 2, b: 4, c: 'X' }, { a: 5, b: 3, c: 'Y' },
  ];
  const SCATTER_ENC = {
    x: { field: 'a', type: 'quantitative' as const },
    y: { field: 'b', type: 'quantitative' as const },
    color: { field: 'c', type: 'nominal' as const },
  };

  it('grouped bar offers a transition to a stacked bar (group → color)', () => {
    const comp = computePivot(groupedBarChartDef, GROUPED_ENC, BAR_DATA)!;
    expect(comp.ids).toContain('type:Stacked Bar Chart');
    const st = comp.statesById['type:Stacked Bar Chart'];
    expect(st.color.field).toBe('segment');
    expect(st.group).toBeUndefined();
    expect(comp.chartTypeById['type:Stacked Bar Chart']).toBe('Stacked Bar Chart');
  });

  it('stacked bar offers a transition to a grouped bar (color → group)', () => {
    const comp = computePivot(stackedBarChartDef, STACKED_ENC, BAR_DATA)!;
    expect(comp.ids).toContain('type:Grouped Bar Chart');
    const st = comp.statesById['type:Grouped Bar Chart'];
    expect(st.group.field).toBe('segment');
    expect(st.color).toBeUndefined();
    expect(comp.chartTypeById['type:Grouped Bar Chart']).toBe('Grouped Bar Chart');
  });

  it('suppresses stacked → grouped when the series cardinality is too high', () => {
    const wide = Array.from({ length: 40 }, (_, i) => ({
      region: 'R' + (i % 3), segment: 'S' + i, sales: i,
    }));
    const comp = computePivot(stackedBarChartDef, STACKED_ENC, wide)!;
    expect(comp.ids).not.toContain('type:Grouped Bar Chart');
  });

  it('scatter with a discrete color offers a Strip/Jitter transition (x ↔ color swap)', () => {
    const comp = computePivot(scatterPlotDef, SCATTER_ENC, SCATTER_DATA)!;
    expect(comp.ids).toContain('type:Strip Plot');
    const st = comp.statesById['type:Strip Plot'];
    expect(st.x.field).toBe('c');         // discrete color → x (category)
    expect(st.color.field).toBe('a');      // displaced quantitative x → color
    expect(st.y.field).toBe('b');          // measure stays on y
    expect(comp.chartTypeById['type:Strip Plot']).toBe('Strip Plot');
  });

  it('a FACETED scatter (discrete on column) routes the field to color and offers jitter', () => {
    const enc = {
      x: { field: 'a', type: 'quantitative' as const },
      y: { field: 'b', type: 'quantitative' as const },
      column: { field: 'c', type: 'nominal' as const },
    };
    const comp = computePivot(scatterPlotDef, enc, SCATTER_DATA)!;
    // series routing surfaces the facet field on color ("swap with color").
    expect(comp.ids).toContain('series:color');
    expect(comp.statesById['series:color'].color.field).toBe('c');
    // and the jitter transition sources the series wherever it sits (column here).
    expect(comp.ids).toContain('type:Strip Plot');
    const st = comp.statesById['type:Strip Plot'];
    expect(st.x.field).toBe('c');          // facet field → x (category)
    expect(st.color.field).toBe('a');       // displaced x → color gradient
    expect(st.column).toBeUndefined();      // facet channel vacated
  });

  it('scatter with an all-quantitative encoding offers no jitter transition', () => {
    const enc = {
      x: { field: 'a', type: 'quantitative' as const },
      y: { field: 'b', type: 'quantitative' as const },
      color: { field: 'd', type: 'quantitative' as const },
    };
    const comp = computePivot(scatterPlotDef, enc, SCATTER_DATA)!;
    expect(comp.ids).not.toContain('type:Strip Plot');
  });

  it('applyPivot reports the transition chartType for the active state', () => {
    const { encodings, chartType } = applyPivot(
      scatterPlotDef, SCATTER_ENC, SCATTER_DATA, { pivot: 'type:Strip Plot' },
    );
    expect(chartType).toBe('Strip Plot');
    expect(encodings.x.field).toBe('c');
  });

  it('a standalone strip plot offers a reverse transition back to a scatter', () => {
    const enc = {
      x: { field: 'c', type: 'nominal' as const },          // jitter category axis
      y: { field: 'b', type: 'quantitative' as const },
      color: { field: 'a', type: 'quantitative' as const },  // spilled measure
    };
    const comp = computePivot(stripPlotDef, enc, SCATTER_DATA)!;
    // A strip plot bridges to the two-measure family (Scatter) AND the
    // distribution family (Box / Violin).
    expect(comp.ids).toContain('type:Scatter Plot');
    expect(comp.ids).toContain('type:Boxplot');
    expect(comp.ids).toContain('type:Violin Plot');
    const st = comp.statesById['type:Scatter Plot'];
    expect(st.x.field).toBe('a');         // color measure → x
    expect(st.color.field).toBe('c');      // displaced category → color series
    expect(st.y.field).toBe('b');          // measure stays on y
    expect(comp.chartTypeById['type:Scatter Plot']).toBe('Scatter Plot');
  });

  it('scatter → jitter → scatter folds back onto Default (θ round-trip)', () => {
    // With the reverse transition declared, the scatter orbit must NOT grow a
    // phantom `type:Strip Plot|type:Scatter Plot` state.
    const comp = computePivot(scatterPlotDef, SCATTER_ENC, SCATTER_DATA, vlGetTemplateDef)!;
    expect(comp.ids).toContain('type:Strip Plot');
    expect(comp.ids.some(id => id.endsWith('|type:Scatter Plot'))).toBe(false);
  });

  it('assembleVegaLite re-dispatches a grouped→stacked transition to the stacked template', () => {
    const groupedInput = (pivot?: string) => ({
      data: { values: BAR_DATA },
      semantic_types: BAR_SEMANTIC,
      chart_spec: {
        chartType: 'Grouped Bar Chart',
        encodings: { x: 'region', y: 'sales', group: 'segment' },
        baseSize: { width: 400, height: 300 },
        ...(pivot ? { chartProperties: { pivot } } : {}),
      },
    });
    const stacked = assembleVegaLite(groupedInput('type:Stacked Bar Chart'));
    // A stacked bar carries the series on color and does not dodge via xOffset.
    expect(stacked.encoding.color?.field).toBe('segment');
    expect(stacked.encoding.xOffset).toBeUndefined();
  });
});

describe('computePivot — runtime orbit (composition, dedup, validity)', () => {
  const SCATTER_DATA = Array.from({ length: 60 }, (_, i) => ({
    a: i, b: (i % 17) + 1, c: ['X', 'Y', 'Z'][i % 3],
  }));
  const SCATTER_ENC = {
    x: { field: 'a', type: 'quantitative' as const },
    y: { field: 'b', type: 'quantitative' as const },
    color: { field: 'c', type: 'nominal' as const },
  };

  it('composes generators into multi-step states (orient · series)', () => {
    const comp = computePivot(scatterPlotDef, SCATTER_ENC, SCATTER_DATA, vlGetTemplateDef)!;
    // single-generator states are present...
    expect(comp.ids).toContain('flip:x-y');
    expect(comp.ids).toContain('augment:column');
    // ...and so are their compositions, with a composed operator label.
    expect(comp.ids).toContain('flip:x-y|augment:column');
    const i = comp.ids.indexOf('flip:x-y|augment:column');
    expect(comp.labels[i]).toBe('X ⇄ Y · Color + Columns');
    const enc = comp.statesById['flip:x-y|augment:column'];
    expect(enc.x.field).toBe('b');     // orientation swapped the axes
    expect(enc.y.field).toBe('a');
    expect(enc.column.field).toBe('c'); // series routed to a facet
  });

  it('dedups paths that reach the same encoding (stabilizer quotient)', () => {
    const comp = computePivot(scatterPlotDef, SCATTER_ENC, SCATTER_DATA, vlGetTemplateDef)!;
    // every state id maps to a distinct channel→field fingerprint.
    const fingerprints = comp.ids.map(id => {
      const e = comp.statesById[id];
      const ct = comp.chartTypeById[id] ?? '';
      return ct + '::' + Object.keys(e).filter(k => e[k]?.field).sort()
        .map(k => `${k}=${e[k].field}`).join(',');
    });
    expect(new Set(fingerprints).size).toBe(comp.ids.length);
    // σ∘σ folds back onto the identity rather than appearing twice.
    expect(comp.ids.filter(id => id === 'flip:x-y').length).toBe(1);
    // faceting then jittering reaches the SAME strip plot as jittering directly,
    // so no `series:*|type:Strip Plot` duplicate of `type:Strip Plot` exists.
    expect(comp.ids).toContain('type:Strip Plot');
    expect(comp.ids.some(id => id.endsWith('|type:Strip Plot') &&
      JSON.stringify(comp.statesById[id]) === JSON.stringify(comp.statesById['type:Strip Plot']))).toBe(false);
  });

  it('never emits a cartesian state with a missing x or y (validity guard)', () => {
    const comp = computePivot(scatterPlotDef, SCATTER_ENC, SCATTER_DATA, vlGetTemplateDef)!;
    for (const id of comp.ids) {
      const e = comp.statesById[id];
      const ct = comp.chartTypeById[id] ?? 'Scatter Plot';
      const tpl = vlGetTemplateDef(ct)!;
      if (tpl.channels.includes('x') && tpl.channels.includes('y')) {
        expect(e.x?.field, `${id} keeps x`).toBeTruthy();
        expect(e.y?.field, `${id} keeps y`).toBeTruthy();
      }
    }
  });

  it('crosses θ edges only when a template resolver is supplied', () => {
    // With a resolver, jitter is reachable; the strip plot itself has no pivot
    // so it stays a leaf (no further composition past the chart-type change).
    const withResolver = computePivot(scatterPlotDef, SCATTER_ENC, SCATTER_DATA, vlGetTemplateDef)!;
    expect(withResolver.ids).toContain('type:Strip Plot');
    // Without a resolver the θ state is still emitted (as a leaf) but cannot be
    // expanded further; the orbit stays within the authored template otherwise.
    const noResolver = computePivot(scatterPlotDef, SCATTER_ENC, SCATTER_DATA)!;
    expect(noResolver.ids).toContain('type:Strip Plot');
  });

  it('folds a θ round-trip back to the authored view (Stacked → Grouped → Stacked)', () => {
    const enc = {
      x: { field: 'region', type: 'nominal' as const },
      y: { field: 'sales', type: 'quantitative' as const },
      color: { field: 'segment', type: 'nominal' as const },
    };
    const comp = computePivot(stackedBarChartDef, enc, BAR_DATA, vlGetTemplateDef)!;
    // The forward transition is offered...
    expect(comp.ids).toContain('type:Grouped Bar Chart');
    // ...but returning to the authored Stacked type is the identity, not a new
    // state: no path ends by re-entering the authored chart type.
    expect(comp.ids.some(id => id.endsWith('|type:Stacked Bar Chart'))).toBe(false);
    // and every emitted state is genuinely distinct from the authored base.
    const baseKey = JSON.stringify(enc);
    const dupes = comp.ids.filter(id => id !== 'default' &&
      comp.chartTypeById[id] === undefined &&
      JSON.stringify(comp.statesById[id]) === baseKey);
    expect(dupes).toEqual([]);
  });
});

describe('computePivot — Tier-1 templates (lollipop, area, histogram, density)', () => {
  const DIST_DATA = [
    { score: 10, grp: 'A' }, { score: 12, grp: 'A' },
    { score: 8, grp: 'B' }, { score: 14, grp: 'B' },
    { score: 9, grp: 'A' }, { score: 11, grp: 'B' },
  ];
  const DIST_ENC = {
    x: { field: 'score', type: 'quantitative' as const },
    color: { field: 'grp', type: 'nominal' as const },
  };

  it('lollipop offers orientation, role swap, and series routing', () => {
    const comp = computePivot(lollipopChartDef, BAR_ENC, BAR_DATA)!;
    expect(comp.ids).toContain('flip:x-y');
    expect(comp.ids).toContain('swap:x-color');
    expect(comp.ids).toContain('augment:column');
    expect(comp.ids).toContain('augment:row');
  });

  it('lollipop offers a chart-type transition to a bar', () => {
    const comp = computePivot(lollipopChartDef, BAR_ENC, BAR_DATA, vlGetTemplateDef)!;
    expect(comp.ids.some(id => id.includes('type:Bar Chart'))).toBe(true);
  });

  it('horizontal lollipop (temporal domain) anchors the stem from x=0, not the temporal baseline', () => {
    const input = {
      data: {
        values: [
          { t: '2020-01-01', v: 10 },
          { t: '2021-01-01', v: 20 },
          { t: '2022-01-01', v: 15 },
        ],
      },
      semantic_types: { t: 'Date', v: 'Quantity' },
      chart_spec: {
        chartType: 'Lollipop Chart',
        encodings: { x: 'v', y: 't' },
        baseSize: { width: 400, height: 300 },
      },
    };
    const spec = assembleVegaLite(input);
    const rule = spec.layer[0].encoding;
    // Measure is on x → horizontal stem anchored at x=0, NOT a vertical stem to
    // the temporal baseline (the bug: temporal was mis-classified as the measure).
    expect(rule.x2).toEqual({ datum: 0 });
    expect(rule.y2).toBeUndefined();
  });

  it('bar offers a chart-type transition to a lollipop', () => {
    const comp = computePivot(barChartDef, BAR_ENC, BAR_DATA, vlGetTemplateDef)!;
    expect(comp.ids.some(id => id.includes('type:Lollipop Chart'))).toBe(true);
  });

  it('area offers series routing + a line transition but no orientation flip', () => {
    const enc = {
      x: { field: 'day', type: 'temporal' as const },
      y: { field: 'sales', type: 'quantitative' as const },
      color: { field: 'segment', type: 'nominal' as const },
    };
    const comp = computePivot(areaChartDef, enc, BAR_DATA, vlGetTemplateDef)!;
    // No vertical area: x is pinned (no orientation flip).
    expect(comp.ids).not.toContain('flip:x-y');
    expect(comp.ids).toContain('augment:column');
    expect(comp.ids).toContain('augment:row');
    // θ edge to a line (same T×M signature).
    expect(comp.ids.some(id => id.includes('type:Line Chart'))).toBe(true);
  });

  it('line offers a chart-type transition to an area (non-negative values)', () => {
    const enc = {
      x: { field: 'day', type: 'temporal' as const },
      y: { field: 'sales', type: 'quantitative' as const },
      color: { field: 'segment', type: 'nominal' as const },
    };
    const comp = computePivot(lineChartDef, enc, BAR_DATA, vlGetTemplateDef)!;
    expect(comp.ids.some(id => id.includes('type:Area Chart'))).toBe(true);
  });

  it('histogram routes a series to facets and offers a density transition', () => {
    const comp = computePivot(histogramDef, DIST_ENC, DIST_DATA)!;
    expect(comp.ids).toContain('augment:column');
    expect(comp.ids).toContain('augment:row');
    expect(comp.ids).toContain('type:Density Plot');
    expect(comp.chartTypeById['type:Density Plot']).toBe('Density Plot');
    // The transition re-views the same field; nothing is re-routed.
    expect(comp.statesById['type:Density Plot'].x.field).toBe('score');
  });

  it('density routes a series to facets and offers a histogram transition', () => {
    const comp = computePivot(densityPlotDef, DIST_ENC, DIST_DATA)!;
    expect(comp.ids).toContain('augment:column');
    expect(comp.ids).toContain('augment:row');
    expect(comp.ids).toContain('type:Histogram');
    expect(comp.chartTypeById['type:Histogram']).toBe('Histogram');
    expect(comp.statesById['type:Histogram'].x.field).toBe('score');
  });

  it('applyPivot re-dispatches a histogram→density transition to the density type', () => {
    const { chartType, encodings } = applyPivot(
      histogramDef, DIST_ENC, DIST_DATA, { pivot: 'type:Density Plot' },
    );
    expect(chartType).toBe('Density Plot');
    expect(encodings.x.field).toBe('score');
  });
});

// ─── Factored two-control model (chart-transform-two-axes.md) ────────────────

const SCATTER_ENC = {
  x: { field: 'a', type: 'quantitative' as const },
  y: { field: 'b', type: 'quantitative' as const },
  color: { field: 'c', type: 'nominal' as const },
};
const SCATTER_DATA = [
  { a: 1, b: 2, c: 'X' }, { a: 3, b: 1, c: 'Y' },
  { a: 2, b: 4, c: 'X' }, { a: 5, b: 3, c: 'Y' },
];

describe('computeChartTypeStates — Control B (θ only, one hop)', () => {
  it('scatter (Q,Q,N) exposes default + Strip Plot sibling, labelled by chart name', () => {
    const comp = computeChartTypeStates(scatterPlotDef, SCATTER_ENC, SCATTER_DATA)!;
    expect(comp).not.toBeNull();
    expect(comp.key).toBe('chartType');
    expect(comp.ids[0]).toBe('default');
    expect(comp.labels[0]).toBe('Scatter Plot');
    expect(comp.ids).toContain('type:Strip Plot');
    expect(comp.labels).toContain('Strip Plot');
    // one hop only: no composed path ids, no local (τ/σ/γ) ids.
    expect(comp.ids.every((id) => id === 'default' || id.startsWith('type:'))).toBe(true);
    expect(comp.ids.some((id) => id.includes('|'))).toBe(false);
  });

  it('bar (nominal x) exposes only the unconditional Lollipop sibling', () => {
    const comp = computeChartTypeStates(barChartDef, BAR_ENC, BAR_DATA)!;
    expect(comp).not.toBeNull();
    expect(comp.ids).toContain('type:Lollipop Chart');
    // Line/Area are gated out: region is nominal (not an ordered axis).
    expect(comp.ids).not.toContain('type:Line Chart');
    expect(comp.ids).not.toContain('type:Area Chart');
  });

  it('bar (ordinal x) offers the Line + Area ordered-axis bridge', () => {
    const enc = {
      x: { field: 'region', type: 'ordinal' as const },
      y: { field: 'sales', type: 'quantitative' as const },
    };
    const comp = computeChartTypeStates(barChartDef, enc, BAR_DATA)!;
    expect(comp.ids).toContain('type:Line Chart');
    expect(comp.ids).toContain('type:Area Chart');
  });

  it('Scatter → Regression is gated to a clean two-measure scatter', () => {
    const qq = {
      x: { field: 'a', type: 'quantitative' as const },
      y: { field: 'b', type: 'quantitative' as const },
    };
    expect(
      computeChartTypeStates(scatterPlotDef, qq, [{ a: 1, b: 2 }, { a: 3, b: 4 }], vlGetTemplateDef)!.ids,
    ).toContain('type:Regression');

    // Category x → a regression line is meaningless.
    const catX = {
      x: { field: 'c', type: 'nominal' as const },
      y: { field: 'b', type: 'quantitative' as const },
    };
    const catStates = computeChartTypeStates(scatterPlotDef, catX, [{ c: 'X', b: 1 }], vlGetTemplateDef);
    expect(catStates?.ids ?? []).not.toContain('type:Regression');

    // Bubble (size bound) → keep the trend off a cluttered bubble chart.
    const bubble = {
      x: { field: 'a', type: 'quantitative' as const },
      y: { field: 'b', type: 'quantitative' as const },
      size: { field: 's', type: 'quantitative' as const },
    };
    const sizeStates = computeChartTypeStates(scatterPlotDef, bubble, [{ a: 1, b: 2, s: 3 }], vlGetTemplateDef);
    expect(sizeStates?.ids ?? []).not.toContain('type:Regression');
  });

  it('a HORIZONTAL bar → Line re-orients the temporal domain onto x (no vertical line)', () => {
    // Horizontal bar: the ordered/temporal domain sits on y, the measure on x.
    const enc = {
      x: { field: 'sales', type: 'quantitative' as const },
      y: { field: 'day', type: 'temporal' as const },
    };
    const comp = computeChartTypeStates(barChartDef, enc, BAR_DATA)!;
    const line = comp.statesById['type:Line Chart'];
    expect(line).toBeDefined();
    // domain (temporal) must land on x; measure on y — never a vertical line.
    expect(line.x.field).toBe('day');
    expect(line.y.field).toBe('sales');
  });
});

describe('computeArrangeStates — Control A (τ/σ/γ only, no θ)', () => {
  it('bar exposes the local group but never a chart-type transition', () => {
    const comp = computeArrangeStates(barChartDef, BAR_ENC, BAR_DATA)!;
    expect(comp.key).toBe('arrange');
    expect(comp.ids[0]).toBe('default');
    for (const id of ['flip:x-y', 'swap:x-color', 'augment:column']) {
      expect(comp.ids).toContain(id);
    }
    expect(comp.ids).not.toContain('augment:row');
    expect(comp.ids.some((id) => id.startsWith('type:'))).toBe(false);
  });

  it('scatter arrange excludes the Strip Plot transition', () => {
    const comp = computeArrangeStates(scatterPlotDef, SCATTER_ENC, SCATTER_DATA)!;
    expect(comp.ids).not.toContain('type:Strip Plot');
    expect(comp.ids).toContain('flip:x-y');
  });
});

describe('applyTransform — two independent overrides', () => {
  it('default: authored view + both surfaces', () => {
    const { encodings, chartType, surface } = applyTransform(
      scatterPlotDef, SCATTER_ENC, SCATTER_DATA, undefined, vlGetTemplateDef,
    );
    expect(chartType).toBeUndefined();
    expect(encodings.x.field).toBe('a');
    expect(surface.chartType!.index).toBe(0);
    expect(surface.arrange!.index).toBe(0);
  });

  it('Control B: a chart-type override re-routes + re-selects the sibling', () => {
    const { chartType, encodings } = applyTransform(
      scatterPlotDef, SCATTER_ENC, SCATTER_DATA, { chartType: 'type:Strip Plot' }, vlGetTemplateDef,
    );
    expect(chartType).toBe('Strip Plot');
    // series (color=c) moved onto x; measure a spilled to color.
    expect(encodings.x.field).toBe('c');
  });

  it('Control A: an arrange override swaps axes on the current object', () => {
    const { chartType, encodings } = applyTransform(
      barChartDef, BAR_ENC, BAR_DATA, { arrange: 'flip:x-y' }, vlGetTemplateDef,
    );
    expect(chartType).toBeUndefined();
    expect(encodings.x.field).toBe('sales');
    expect(encodings.y.field).toBe('region');
  });

  it('reset: a stale arrange id falls back to identity after a θ switch', () => {
    const { chartType, encodings } = applyTransform(
      scatterPlotDef, SCATTER_ENC, SCATTER_DATA,
      { chartType: 'type:Strip Plot', arrange: 'flip:x-y' }, vlGetTemplateDef,
    );
    expect(chartType).toBe('Strip Plot');
    // If 'flip:x-y' is not a Strip Plot arrange state, it is ignored (reset to
    // identity) rather than corrupting the encoding — x stays the series field.
    expect(encodings.x.field).toBe('c');
  });

  it('legacy shim: a composed `pivot` id splits into chartType + arrange', () => {
    const local = applyTransform(
      barChartDef, BAR_ENC, BAR_DATA, { pivot: 'flip:x-y' }, vlGetTemplateDef,
    );
    expect(local.encodings.x.field).toBe('sales');

    const theta = applyTransform(
      scatterPlotDef, SCATTER_ENC, SCATTER_DATA, { pivot: 'type:Strip Plot' }, vlGetTemplateDef,
    );
    expect(theta.chartType).toBe('Strip Plot');
  });
});

describe('getChartTransform — end-to-end through assembleVegaLite', () => {
  const scatterInput = (props?: Record<string, unknown>) => ({
    data: { values: SCATTER_DATA },
    semantic_types: { a: 'Quantity', b: 'Quantity', c: 'Category' },
    chart_spec: {
      chartType: 'Scatter Plot',
      encodings: { x: 'a', y: 'b', color: 'c' },
      baseSize: { width: 400, height: 300 },
      ...(props ? { chartProperties: props } : {}),
    },
  });

  it('surfaces both controls with active indices', () => {
    const surface = getChartTransform(scatterInput())!;
    expect(surface).toBeDefined();
    expect(surface.chartType!.ids).toContain('type:Strip Plot');
    expect(surface.chartType!.index).toBe(0);
    expect(surface.arrange!.index).toBe(0);
  });

  it('a chart-type override re-dispatches the assembled spec to the sibling', () => {
    const base = assembleVegaLite(scatterInput());
    const strip = assembleVegaLite(scatterInput({ chartType: 'type:Strip Plot' }));
    // The strip plot puts the category on x; the scatter keeps the measure.
    expect(base.encoding.x.field).toBe('a');
    expect(strip.encoding.x.field).toBe('c');
  });

  it('backward-compat: getChartPivot still surfaces the legacy composed orbit', () => {
    const surface = getChartPivot(scatterInput())!;
    expect(surface).toBeDefined();
    expect(surface.ids[0]).toBe('default');
    expect(surface.ids).toContain('type:Strip Plot');
  });

  it('a Pyramid Chart (no local pivot def) still offers a Grouped Bar sibling', () => {
    const input = {
      data: {
        values: [
          { age: '0-9', gender: 'Male', pop: 100 },
          { age: '0-9', gender: 'Female', pop: 110 },
          { age: '10-19', gender: 'Male', pop: 90 },
          { age: '10-19', gender: 'Female', pop: 95 },
        ],
      },
      semantic_types: { age: 'Category', gender: 'Category', pop: 'Quantity' },
      chart_spec: {
        chartType: 'Pyramid Chart',
        encodings: { y: 'age', x: 'pop', color: 'gender' },
        baseSize: { width: 400, height: 300 },
      },
    };
    const surface = getChartTransform(input)!;
    expect(surface.chartType).toBeDefined();
    expect(surface.chartType!.ids).toContain('type:Grouped Bar Chart');
    // Pyramid has no local τ/σ/γ group (fixed orientation).
    expect(surface.arrange).toBeUndefined();
  });

  it('a multi-series Line offers a Sparkline sibling; a single-series Line does not', () => {
    const withSeries = {
      data: {
        values: [
          { t: '2020-01-01', region: 'US', v: 10 },
          { t: '2021-01-01', region: 'US', v: 20 },
          { t: '2020-01-01', region: 'CN', v: 8 },
          { t: '2021-01-01', region: 'CN', v: 14 },
        ],
      },
      semantic_types: { t: 'Date', region: 'Category', v: 'Quantity' },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: { x: 't', y: 'v', color: 'region' },
        baseSize: { width: 400, height: 300 },
      },
    };
    expect(getChartTransform(withSeries)!.chartType!.ids).toContain('type:Sparkline');

    const noSeries = {
      data: { values: [{ t: '2020-01-01', v: 10 }, { t: '2021-01-01', v: 20 }] },
      semantic_types: { t: 'Date', v: 'Quantity' },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: { x: 't', y: 'v' },
        baseSize: { width: 400, height: 300 },
      },
    };
    const s2 = getChartTransform(noSeries);
    expect(s2?.chartType?.ids ?? []).not.toContain('type:Sparkline');
  });

  it('a FACETED line (series on column) routes the series onto color for Sparkline', () => {
    const enc = {
      x: { field: 'm', type: 'temporal' as const },
      y: { field: 'rev', type: 'quantitative' as const },
      column: { field: 'region', type: 'nominal' as const },
    };
    const data = [
      { m: '2020-01-01', region: 'North', rev: 73 },
      { m: '2020-02-01', region: 'North', rev: 61 },
      { m: '2020-01-01', region: 'South', rev: 50 },
      { m: '2020-02-01', region: 'South', rev: 55 },
    ];
    const comp = computeChartTypeStates(lineChartDef, enc, data, vlGetTemplateDef)!;
    const spark = comp.statesById['type:Sparkline'];
    expect(spark).toBeDefined();
    // The facet series was moved to color (where Sparkline expects it); column cleared.
    expect(spark.color.field).toBe('region');
    expect(spark.column).toBeUndefined();
  });

  it('Regression (a scatter sibling) keeps an Arrange control after the θ switch', () => {
    const input = {
      data: {
        values: [
          { Height: 165, Weight: 90, Group: 'A' },
          { Height: 159, Weight: 70, Group: 'A' },
          { Height: 180, Weight: 85, Group: 'B' },
          { Height: 175, Weight: 78, Group: 'B' },
        ],
      },
      semantic_types: { Height: 'Value', Weight: 'Value', Group: 'Category' },
      chart_spec: {
        chartType: 'Scatter Plot',
        encodings: { x: 'Height', y: 'Weight', column: 'Group' },
        baseSize: { width: 400, height: 300 },
        chartProperties: { chartType: 'type:Regression' },
      },
    };
    const surface = getChartTransform(input)!;
    expect(surface.chartType!.index).toBeGreaterThan(0); // now on Regression
    // Control A is available on the Regression (scatter-like local group).
    expect(surface.arrange).toBeDefined();
    expect(surface.arrange!.ids).toContain('flip:x-y');
    expect(surface.arrange!.ids).toContain('series:color');
  });
});


// ─── Central transition registry validation ─────────────────────────────────

describe('CHART_TRANSITIONS — registry integrity', () => {
  it('every transition target is a registered Vega-Lite template', () => {
    for (const [from, edges] of Object.entries(CHART_TRANSITIONS)) {
      expect(vlGetTemplateDef(from), `source '${from}' should be a real chart type`).toBeDefined();
      for (const t of edges) {
        expect(
          vlGetTemplateDef(t.to),
          `'${from}' → '${t.to}' target must exist as a VL template`,
        ).toBeDefined();
      }
    }
  });

  it('no edge points a chart type back at itself', () => {
    for (const [from, edges] of Object.entries(CHART_TRANSITIONS)) {
      for (const t of edges) {
        expect(t.to, `'${from}' should not transition to itself`).not.toBe(from);
      }
    }
  });

  it('every edge is reversible (A→B implies B→A) so a transform round-trips', () => {
    // Intentional one-directional edges: unwinding a stack back to a plain trend
    // is a safe read, but the forward hop is a bigger semantic leap we don't offer.
    const ONE_WAY = new Set(['Streamgraph→Line Chart']);
    for (const [from, edges] of Object.entries(CHART_TRANSITIONS)) {
      for (const t of edges) {
        if (ONE_WAY.has(`${from}→${t.to}`)) continue;
        const back = getChartTransitions(t.to).some((r) => r.to === from);
        expect(back, `'${t.to}' should declare a reverse edge to '${from}'`).toBe(true);
      }
    }
  });
});
