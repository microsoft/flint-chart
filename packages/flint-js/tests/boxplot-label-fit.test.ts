// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import { assembleVegaLite } from '../src';
import { computeBandLabelLayout, fitTwoLineLabels } from '../src/core/decisions';
import { genLollipopTests } from '../src/test-data/specialized-tests';
import { TEST_GENERATORS } from '../src/test-data';

/**
 * Regression: horizontal categorical x-axis labels must not overlap when the
 * per-band step is narrower than the widest label.
 *
 * Box marks declare a small defaultBandSize (28px), so a few short string
 * categories like "regular / midgrade / premium" used to be forced horizontal
 * regardless of fit and ran together ("regularidgradepremium"). The layout
 * engine now widens the band within the stretch budget to keep labels
 * horizontal, or angles them (-45°) when even the budget can't fit.
 */

// Mirror the layout engine's label-width heuristic (compute-layout.ts).
const APPROX_CHAR_WIDTH_RATIO = 0.62;

function makeBoxplotInput(grades: string[], width: number) {
  let seed = 1;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const data: any[] = [];
  for (const g of grades) for (let i = 0; i < 20; i++) {
    data.push({ Grade: g, Price: Math.round(rnd() * 100) });
  }
  return {
    data: { values: data },
    semantic_types: { Grade: 'Category', Price: 'Quantity' },
    chart_spec: {
      chartType: 'Boxplot',
      encodings: { x: { field: 'Grade' }, y: { field: 'Price' } },
      baseSize: { width, height: 300 },
    },
  };
}

function xAxisLayout(input: unknown) {
  const spec = assembleVegaLite(input as any) as any;
  const axisX = spec.config?.axisX ?? {};
  const step = typeof spec.width === 'object' ? spec.width.step : undefined;
  return { step, labelAngle: axisX.labelAngle, fontSize: axisX.labelFontSize };
}

/** Labels are non-overlapping iff they fit the band horizontally, or are angled. */
function assertNonOverlapping(grades: string[], step: number | undefined, labelAngle: number, fontSize: number) {
  const maxLen = Math.max(...grades.map((g) => g.length));
  const labelPx = maxLen * fontSize * APPROX_CHAR_WIDTH_RATIO;
  const horizontalFits = labelAngle === 0 && step !== undefined && step >= labelPx;
  const angled = labelAngle === -45;
  expect(horizontalFits || angled).toBe(true);
}

describe('boxplot categorical x-axis label fitting', () => {
  it('widens the band so 3 wide labels stay horizontal and do not overlap', () => {
    const grades = ['regular', 'midgrade', 'premium']; // longest 8 chars > 28px band
    const { step, labelAngle, fontSize } = xAxisLayout(makeBoxplotInput(grades, 300));
    // Widened beyond the 28px box defaultBandSize to fit "midgrade".
    expect(step).toBeGreaterThan(28);
    expect(labelAngle).toBe(0);
    assertNonOverlapping(grades, step, labelAngle, fontSize);
  });

  it('angles labels when the stretch budget cannot fit a wide-enough band', () => {
    const grades = ['regular_', 'midgrade', 'premium_', 'superpr_'];
    // Tiny canvas → tight per-band budget that cannot grow to ~56px.
    const { step, labelAngle, fontSize } = xAxisLayout(makeBoxplotInput(grades, 60));
    expect(labelAngle).toBe(-45);
    assertNonOverlapping(grades, step, labelAngle, fontSize);
  });

  it('leaves the band unchanged when short labels already fit horizontally', () => {
    const grades = ['A', 'B', 'C'];
    const { step, labelAngle, fontSize } = xAxisLayout(makeBoxplotInput(grades, 300));
    expect(step).toBe(28); // box defaultBandSize, no widening needed
    expect(labelAngle).toBe(0);
    assertNonOverlapping(grades, step, labelAngle, fontSize);
  });
});

describe('word-wrapped categorical axis labels', () => {
  it.each([undefined, 'nyt', 'economist', 'swiss', 'mckinsey', 'datawrapper', 'powerbi'])('wraps both waterfall balance labels (%s)', async (theme) => {
    const fixture = TEST_GENERATORS['Waterfall Chart']()[1];
    const spec: any = assembleVegaLite({
      data: { values: fixture.data },
      semantic_types: { Step: 'Category', Value: 'Quantity', Type: 'Category' },
      chart_spec: {
        chartType: 'Waterfall Chart', title: 'Cash bridge', subtitle: 'Opening to closing balance, $m',
        encodings: { x: 'Step', y: 'Value', color: 'Type' },
        chartProperties: fixture.chartProperties,
      },
      ...(theme ? { theme_spec: theme } : {}),
    });
    const view = new View(parse(compile(spec).spec), { renderer: 'none' });
    try {
      await view.runAsync();
      const labels: any[] = [];
      const visit = (item: any): void => {
        if (item.mark?.role === 'axis-label') labels.push(item);
        for (const child of item.items ?? []) visit(child);
      };
      visit((view.scenegraph() as any).root);
      expect(labels.find(item => item.datum.value === 'Starting Balance').text).toEqual(['Starting', 'Balance']);
      expect(labels.find(item => item.datum.value === 'Ending Balance').text).toEqual(['Ending', 'Balance']);
    } finally {
      view.finalize();
    }
  });

  const teams = ['United States of America', 'China', 'Japan', 'France'];
  function barInput(labels: string[], horizontal = false) {
    return {
      data: { values: labels.map((Team, index) => ({ Team, Total: 100 - index })) },
      semantic_types: { Team: 'Category', Total: 'Quantity' },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: horizontal ? { x: 'Total', y: 'Team' } : { x: 'Team', y: 'Total' },
        baseSize: { width: 480, height: 320 },
      },
    };
  }

  it('fits one long X label on two horizontal lines with bounded band growth', () => {
    const spec = assembleVegaLite(barInput(teams)) as any;
    expect(spec.config.axisX.labelAngle).toBe(0);
    expect(spec.width.step).toBeLessThanOrEqual(100);
    expect(spec.config.axisX.labelExpr).toBeDefined();
    expect(spec.config.axisX.labelLineHeight).toBeGreaterThan(spec.config.axisX.labelFontSize);
  });

  it('wraps the Y label within the gutter without rotating it', () => {
    const spec = assembleVegaLite(barInput(teams, true)) as any;
    expect(spec.config.axisY.labelAngle).toBe(0);
    expect(spec.config.axisY.labelExpr).toBeDefined();
    expect(spec.height.step).toBeLessThanOrEqual(48);
  });

  it.each([80, 160])('keeps a readable Y gutter on a %spx plot', (width) => {
    const input = barInput(['International Infrastructure Development and Regional Public Transportation Modernization Programme', ...teams.slice(1)], true);
    input.chart_spec.baseSize.width = width;
    const spec: any = assembleVegaLite(input);
    expect(spec.config.axisY.labelExpr).toBeDefined();
    expect(spec.config.axisY.labelLimit).toBeGreaterThan(width / 4);
    expect(spec.config.axisY.labelLimit).toBe(182);
    expect(spec.config.axisY.labelAngle).toBe(0);
  });

  it('allows a wider Y gutter when a quarter of the plot exceeds the native default', () => {
    const input = barInput(['International Infrastructure Development and Regional Public Transportation Modernization Programme', ...teams.slice(1)], true);
    input.chart_spec.baseSize.width = 1600;
    const spec: any = assembleVegaLite(input);
    expect(spec.config.axisY.labelLimit).toBeGreaterThan(182);
    expect(spec.config.axisY.labelLimit).toBeLessThanOrEqual(402);
  });

  it.each([undefined, 'nyt', 'economist', 'swiss'])('centers wrapped Y label blocks with breathing room (%s)', async (theme) => {
    const labels = Array.from({ length: 16 }, (_, index) => index % 3 === 2
      ? `Team ${index + 1}` : `Team ${index + 1} Olympic delegation at Paris 2024`);
    const spec: any = assembleVegaLite({ ...barInput(labels, true), theme_spec: theme });
    expect(spec.config.axisY.labelExpr).toBeDefined();
    expect(spec.height.step * labels.length).toBeLessThanOrEqual(480);
    const view = new View(parse(compile(spec).spec), { renderer: 'none' });
    try {
      await view.runAsync();
      const items: any[] = [];
      const visit = (item: any): void => {
        if (item.mark?.role === 'axis-label' && labels.includes(item.datum?.value)) items.push(item);
        for (const child of item.items ?? []) visit(child);
      };
      visit((view.scenegraph() as any).root);
      expect(items).toHaveLength(labels.length);
      expect(items.some(item => Array.isArray(item.text) && item.text.length === 2)).toBe(true);
      const scale: any = view.scale('y');
      for (const item of items) {
        const tick = scale(item.datum.value) + scale.bandwidth() / 2;
        expect(Math.abs((item.bounds.y1 + item.bounds.y2) / 2 - tick)).toBeLessThanOrEqual(1.5);
      }
      const ordered = items.sort((first, second) => first.bounds.y1 - second.bounds.y1);
      for (let index = 1; index < ordered.length; index++) {
        expect(ordered[index].bounds.y1 - ordered[index - 1].bounds.y2).toBeGreaterThanOrEqual(4 - 1e-6);
      }
    } finally {
      view.finalize();
    }
  });

  it.each([false, true])('wraps both long country names (horizontal bars: %s)', (horizontal) => {
    const labels = [teams[0], 'Japan', "People's Republic of China", 'France'];
    const spec = assembleVegaLite(barInput(labels, horizontal)) as any;
    const axis = horizontal ? spec.config.axisY : spec.config.axisX;
    expect(axis.labelAngle).toBe(0);
    expect(axis.labelExpr).toContain('United States');
    expect(axis.labelExpr).toContain("People's Republic");
    const dimension = horizontal ? spec.height : spec.width;
    expect(dimension.step * labels.length).toBeLessThanOrEqual(horizontal ? 320 : 480);
  });

  it('does not expand every band in a dense chart to accommodate one outlier', () => {
    const labels = [teams[0], ...Array.from({ length: 31 }, (_, index) => `Team ${index + 1}`)];
    const spec = assembleVegaLite(barInput(labels)) as any;
    expect(spec.width.step * labels.length).toBeLessThanOrEqual(480 * 1.5);
    expect(spec.config.axisX.labelExpr).toBeUndefined();
  });

  it.each([false, true])('prefers two lines with ellipsis to rotated truncation (horizontal bars: %s)', (horizontal) => {
    const labels = ['United States Olympic delegation at Paris 2024', 'China', 'Japan', 'Australia', 'France', 'Netherlands', 'Great Britain', 'South Korea'];
    const spec = assembleVegaLite(barInput(labels, horizontal)) as any;
    const axis = horizontal ? spec.config.axisY : spec.config.axisX;
    expect(axis.labelAngle).toBe(0);
    expect(axis.labelExpr).toBeDefined();
    expect(axis.labelLineHeight).toBeGreaterThan(axis.labelFontSize);
    expect(axis.labelLimit).toBeLessThanOrEqual(horizontal ? 182 : 62);
    expect((horizontal ? spec.height : spec.width).step * labels.length).toBeLessThanOrEqual(horizontal ? 320 : 480 * 1.1);
  });

  it('leaves the second line intact for renderer-native ellipsis and preserves short labels', () => {
    const fit = fitTwoLineLabels(['United States Olympic delegation at Paris 2024', 'China', 'Netherlands'], 10, 54, true);
    expect(fit?.lines).toEqual([
      ['United', 'States Olympic delegation at Paris 2024'], ['China'], ['Netherlands'],
    ]);
    expect(fit?.width).toBe(54);
  });

  it('keeps rotation when an unbroken label fits vertically but not horizontally', () => {
    const labels = ['ABCDEFGHIJKL', 'China', 'Japan', 'France', 'Italy', 'Spain', 'Brazil', 'Canada'];
    const spec = assembleVegaLite(barInput(labels)) as any;
    expect(spec.config.axisX.labelExpr).toBeUndefined();
  });

  it('uses elastic stretch for widespread label demand without exhausting the ceiling', () => {
    const labels = ['United States', 'China', 'Japan', 'Australia', 'France', 'Netherlands', 'Great Britain', 'South Korea']
      .map((team) => `${team} Olympic delegation at Paris 2024`);
    const spec = assembleVegaLite(barInput(labels)) as any;
    expect(spec.config.axisX.labelAngle).toBe(0);
    expect(spec.width.step * labels.length).toBeGreaterThan(480);
    expect(spec.width.step * labels.length).toBeLessThan(720);
  });

  it('honors a fixed canvas ceiling despite widespread label demand', () => {
    const labels = Array.from({ length: 8 }, (_, index) => `National Olympic delegation number ${index}`);
    const input = barInput(labels);
    const spec = assembleVegaLite({ ...input, chart_spec: { ...input.chart_spec, canvasSize: { width: 480, height: 320 } } }) as any;
    expect(spec.width.step * labels.length).toBeLessThanOrEqual(480);
  });

  it('gives repeated long labels more pressure than one outlier', () => {
    const short = ['China', 'Japan', 'France', 'Italy', 'Spain', 'Kenya', 'Brazil', 'Canada'];
    const long = short.map((team) => `${team} Olympic delegation at Paris 2024`);
    const sparse = assembleVegaLite(barInput([long[0], ...short.slice(1)])) as any;
    const widespread = assembleVegaLite(barInput(long)) as any;
    expect(sparse.config.axisX.labelAngle).toBe(0);
    expect(widespread.config.axisX.labelAngle).toBe(0);
    expect(widespread.width.step).toBeGreaterThan(sparse.width.step);
    expect(widespread.width.step * long.length).toBeLessThan(720);
  });

  it('executes wrapped labels without changing category identity or dropping bars', async () => {
    const labels = ['United States Olympic delegation at Paris 2024', 'China', 'Japan', 'Australia', 'France', 'Netherlands', 'Great Britain', 'South Korea'];
    const input = barInput(labels);
    const spec = assembleVegaLite(input) as any;
    expect(spec.data.values.map((row: any) => row.Team)).toEqual(labels);
    const view = new View(parse(compile(spec).spec), { renderer: 'none' });
    try {
      await view.runAsync();
      expect(view.scale('x').domain()).toEqual(labels);
      const svg = await view.toSVG();
      expect(svg).toContain('<tspan');
      expect(svg).toContain('China');
    } finally {
      view.finalize();
    }
  });
});

describe('faceted labels across themes', () => {
  const original = genLollipopTests()[3].data as Array<{ Item: string; Revenue: number; Region: string; Tier: string }>;
  const variants = [
    { id: 'original', long: false, wrapped: false, width: 480, horizontal: false },
    { id: 'long', long: true, wrapped: false, width: 480, horizontal: false },
    { id: 'wide', long: true, wrapped: false, width: 960, horizontal: false },
    { id: 'wrapped', long: true, wrapped: true, width: 480, horizontal: false },
    { id: 'horizontal', long: true, wrapped: false, width: 480, horizontal: true },
  ];

  it.each([undefined, 'nyt', 'economist', 'swiss'].flatMap(theme =>
    variants.map(variant => ({ theme, ...variant }))))('keeps panels, categories and non-overlapping ticks ($theme / $id)', async ({ theme, long, wrapped, width, horizontal }) => {
    const rows = original.map(row => ({ ...row, Item: long ? `${row.Item} retail department` : row.Item }));
    const data = wrapped ? ['Urban', 'Suburban'].flatMap(area => rows.map(row => ({
      ...row, Region: `${row.Region} / ${area}`,
    }))) : rows;
    const spec: any = assembleVegaLite({
      data: { values: data },
      semantic_types: { Item: 'Category', Revenue: 'Quantity', Region: 'Category', Tier: 'Category' },
      theme_spec: theme,
      chart_spec: {
        chartType: 'Lollipop Chart', title: 'Adoption by market and tier',
        encodings: horizontal
          ? { x: 'Revenue', y: 'Item', color: 'Tier', column: 'Region' }
          : { x: 'Item', y: 'Revenue', color: 'Tier', column: 'Region' },
        baseSize: { width, height: 320 },
        chartProperties: wrapped ? { facetColumns: 2 } : {},
      },
    });
    if (!theme && width === 960) {
      expect(spec.width).toBeUndefined();
      expect(spec.spec.width.step).toBeGreaterThan(20);
    }
    const axis = horizontal ? spec.config.axisY : spec.config.axisX;
    if (axis.labelExpr && axis.labelLineHeight) {
      expect(axis.labelLimit).toBeGreaterThan(0);
      expect(axis.labelLineHeight).toBeGreaterThanOrEqual(axis.labelFontSize);
    }
    const view = new View(parse(compile(spec).spec), { renderer: 'none' });
    try {
      await view.runAsync();
      const points: any[] = [];
      const axes = new Set<any>();
      const titles: Array<{ top: number; bottom: number }> = [];
      const panels: Array<{ top: number; bottom: number }> = [];
      const visit = (item: any, offsetY = 0): void => {
        if (item.mark?.role === 'mark' && item.mark.marktype === 'symbol') points.push(item);
        if (item.mark?.role === 'axis-label') axes.add(item.mark);
        if (item.mark?.role === 'axis-title' && item.text === 'Revenue' && item.angle === 0) {
          titles.push({ top: offsetY + item.bounds.y1, bottom: offsetY + item.bounds.y2 });
        }
        if (item.mark?.role === 'scope' && item.datum?.Region) {
          panels.push({ top: offsetY + item.y, bottom: offsetY + item.y + item.height });
        }
        const childOffset = offsetY + (item.mark?.marktype === 'group' ? item.y ?? 0 : 0);
        for (const child of item.items ?? []) visit(child, childOffset);
      };
      visit((view.scenegraph() as any).root);
      if (wrapped && (theme === 'nyt' || theme === 'economist')) {
        expect(titles).toHaveLength(1);
        expect(panels).toHaveLength(4);
        expect(titles[0].bottom).toBeLessThan(Math.min(...panels.map(panel => panel.top)));
        expect(spec.config.facet.spacing.row ?? spec.config.facet.spacing).toBeLessThanOrEqual(20);
        expect(spec.config.legend.offset ?? 18).toBeLessThanOrEqual(18);
        const boundaries: any[] = [];
        const findBoundaries = (item: any): void => {
          if (item.mark?.role === 'axis-grid' && item.datum?.value === 0
            && item.stroke && item.stroke !== 'transparent' && item.strokeWidth > 0) boundaries.push(item);
          for (const child of item.items ?? []) findBoundaries(child);
        };
        findBoundaries((view.scenegraph() as any).root);
        expect(boundaries).toHaveLength(4);
      }
      expect(points).toHaveLength(data.length);
      expect(new Set(points.map(point => point.datum.Region))).toEqual(new Set(data.map(row => row.Region)));
      expect(new Set(points.map(point => point.datum.Item))).toEqual(new Set(data.map(row => row.Item)));
      expect(axes.size).toBeGreaterThan(0);
      for (const axis of axes) {
        const labels = axis.items.filter((item: any) => item.opacity !== 0 && item.text != null);
        for (let index = 1; index < labels.length; index++) {
          const previous = labels[index - 1].bounds;
          const current = labels[index].bounds;
          const overlapX = Math.min(previous.x2, current.x2) - Math.max(previous.x1, current.x1);
          const overlapY = Math.min(previous.y2, current.y2) - Math.max(previous.y1, current.y1);
          expect(overlapX > 1 && overlapY > 1,
            `${labels[index - 1].text} / ${labels[index].text}`).toBe(false);
        }
      }
    } finally {
      view.finalize();
    }
  });
});

describe('band label pressure decisions', () => {
  it.each([44, 49])('keeps a two-line candidate when its first word exceeds %spx', (width) => {
    expect(fitTwoLineLabels(['Starting Balance'], 10, width, true)).toEqual({
      lines: [['Starting', 'Balance']], width,
    });
    expect(fitTwoLineLabels(['Starting Balance'], 10, width)).toBeNull();
  });

  it('does not invent a break inside an oversized unbroken word', () => {
    expect(fitTwoLineLabels(['StartingBalance'], 10, 44, true)).toBeNull();
  });

  const labels = Array.from({ length: 12 }, (_, index) => `Olympic delegation number ${index}`);
  const yInput = {
    labels, axis: 'y' as const, fontSize: 10, step: 20,
    baseSpan: 240, maxSpan: 360, gutterLimit: 100, baselineLimit: 100, elasticity: 0.5,
  };

  it('spends modest extra band height to wrap Y labels', () => {
    const result = computeBandLabelLayout(yInput);
    expect(result).not.toBeNull();
    expect(result!.step).toBeGreaterThan(20);
    expect(result!.step * labels.length).toBeLessThan(360);
    expect(result!.lines.every((row) => row.length <= 2)).toBe(true);
    expect(result!.lineHeight + yInput.fontSize + 4).toBeLessThanOrEqual(result!.step);
  });

  it.each([240, 300])('declines Y wrapping when the height ceiling cannot fit two lines and their gap (%s)', (maxSpan) => {
    expect(computeBandLabelLayout({ ...yInput, maxSpan })).toBeNull();
  });

  it('does not consume unused canvas when short labels already fit', () => {
    const result = computeBandLabelLayout({ ...yInput, axis: 'x', labels: ['A', 'B', 'C'], step: 32, baseSpan: 480, maxSpan: 720 });
    expect(result?.step).toBe(32);
  });

  it('rejects dense horizontal text even when the canvas has some stretch allowance', () => {
    const result = computeBandLabelLayout({ ...yInput, axis: 'x', labels: Array.from({ length: 32 }, (_, index) => `Team number ${index}`), step: 12, baseSpan: 400, maxSpan: 600 });
    expect(result).toBeNull();
  });

  it('does not charge a Y wrapping proposal for stretching already in the baseline', () => {
    const result = computeBandLabelLayout({
      ...yInput, labels: ['United States Olympic delegation at Paris 2024', ...Array.from({ length: 15 }, (_, index) => `Team ${index}`)],
      step: 28, baseSpan: 270, maxSpan: 480,
    });
    expect(result).not.toBeNull();
    expect(result!.step).toBe(28);
    expect(result!.lines[0]).toHaveLength(2);
  });
});
