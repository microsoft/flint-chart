import { describe, expect, it } from 'vitest';
import { MARK_LIMIT, chartContext, chartView, type ChartContextSource } from '../src/chart-context';
import { validateChart, type ChartAssemblyInput, type ChartUpdate } from 'flint-chart';
import type { ChartState, ChartStateEntry } from 'flint-chart/interactive';

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

const HEADER = [
  'Chart "Weight and mileage": Scatter Plot, theme default.',
  'Encodings: x = weight, y = mpg, color = origin.',
];

function state(partial: Partial<ChartState>): ChartState {
  return { chartType: 'Scatter Plot', selected: [], ...partial };
}

const elementOf = (row: Record<string, unknown>) => ({ value: { ...row, __flint_key: 'k' }, records: [row] });

function entries(map: Record<string, Record<string, unknown>[]>): Map<string, ChartStateEntry> {
  return new Map(Object.entries(map).map(([id, rows]) => [id, { layer: 'retained', elements: rows.map(elementOf) }]));
}

const checksOf = (shown: ChartAssemblyInput, updates: readonly ChartUpdate[] = []) =>
  validateChart(shown, 'vegalite', { updates }).updates;

function text(source: Partial<ChartContextSource> & { state: ChartState }): string {
  return chartContext({ agent: input, shown: input, checks: checksOf(source.shown ?? input, source.updates), ...source }).text;
}

const emphasize = (id: string, key: Record<string, unknown>): ChartUpdate => ({
  id,
  ops: [{ op: 'set-style', targets: [{ select: { key } }], value: { state: 'emphasized' } }],
});

describe('chartContext header', () => {
  it('names the chart, its theme and encodings, and says the reader did nothing', () => {
    expect(text({ state: state({}) })).toBe([...HEADER, 'User interactions: none.'].join('\n'));
  });

  it('names what the reader changed in the panel and counts the other options', () => {
    const shown: ChartAssemblyInput = {
      ...input,
      theme_spec: 'economist',
      chart_spec: {
        ...input.chart_spec,
        chartType: 'Bubble Chart',
        encodings: { x: 'weight', y: 'mpg', color: 'car' },
        chartProperties: { opacity: 0.5 },
      },
    };
    expect(text({ state: state({}), shown }).split('\n').slice(0, 2)).toEqual([
      'Chart "Weight and mileage": Bubble Chart, theme economist.',
      'Edited in panel: chart type Scatter Plot → Bubble Chart, theme default → economist, color origin → car, and 1 style option.',
    ]);
  });

  it('names the chart type and view the panel transform draws, not the authored type', () => {
    const shown: ChartAssemblyInput = {
      ...input,
      chart_spec: { ...input.chart_spec, chartProperties: { chartType: 'type:Bubble Chart', arrange: 'swap' } },
    };
    const lines = text({
      state: state({}),
      shown,
      shownView: chartView(shown, {
        chartType: { key: 'chartType', label: 'Chart type', length: 2, index: 1, ids: ['default', 'type:Bubble Chart'], labels: ['Scatter Plot', 'Bubble Chart'] },
        arrange: { key: 'arrange', label: 'Arrange', length: 2, index: 1, ids: ['default', 'swap'], labels: ['Default', 'Swapped axes'] },
      }),
    }).split('\n');
    expect(lines.slice(0, 2)).toEqual([
      'Chart "Weight and mileage": Bubble Chart, view Swapped axes, theme default.',
      'Edited in panel: chart type Scatter Plot → Bubble Chart, view default → Swapped axes.',
    ]);
  });

  it('lists the warnings', () => {
    const warnings = [{ severity: 'warning' as const, code: 'partially_applied_update', message: 'Update "x" was partially applied.' }];
    expect(text({ state: state({}), warnings }).split('\n').slice(-2)).toEqual([
      'Warnings:',
      '- Update "x" was partially applied.',
    ]);
  });
});

describe('chartContext agent updates', () => {
  it('says what each update emphasizes, and which matched nothing', () => {
    const updates = [emphasize('japan', { origin: 'Japan' }), emphasize('mars', { origin: 'Mars' })];
    const lines = text({ state: state({ entries: entries({ japan: [values[2], values[3]], mars: [] }) }), updates }).split('\n');
    expect(lines.slice(2, 7)).toEqual([
      'Agent updates (yours):',
      '- japan:',
      '  ✓ emphasizes 2 marks where origin = Japan',
      '- mars:',
      '  ✗ emphasizes marks where origin = Mars: no row has origin = Mars.',
    ]);
  });

  it('names marks by the data columns, without the fields assembly derives', () => {
    const derived = { ...values[2], x_origin_sort_index: 2, mpg_start: 0, mpg_end: 20 };
    const lines = text({ state: state({ entries: entries({ c: [derived] }) }), updates: [emphasize('c', { weight: 3000 })] }).split('\n');
    expect(lines[4]).toBe('  ✓ emphasizes 1 mark where car = C, weight = 3000, mpg = 20, origin = Japan');
  });

  it('reports each note once, at its key', () => {
    const note = (weight: number, label: string) => ({ op: 'set-annotation' as const, target: { select: { key: { weight } } }, value: { text: label } });
    const updates: ChartUpdate[] = [{ id: 'best', ops: [note(2000, 'Best mileage'), note(3200, 'Heaviest')] }];
    const lines = text({ state: state({}), updates }).split('\n');
    expect(lines.slice(3, 6)).toEqual(['- best:', '  ✓ note "Best mileage" at weight = 2000', '  ✓ note "Heaviest" at weight = 3200']);
  });

  it('lists marks that share nothing, up to the limit', () => {
    const many = Array.from({ length: MARK_LIMIT + 3 }, (_, index) => ({ car: `car-${index}`, weight: index }));
    const updates = [emphasize('some', { car: 'x' })];
    const lines = text({ state: state({ entries: entries({ some: many }) }), updates, drawnUpdates: updates }).split('\n');
    expect(lines[4]).toBe(`  ✓ emphasizes ${MARK_LIMIT + 3} marks:`);
    expect(lines[5]).toBe('    - car = car-0, weight = 0');
    expect(lines.filter((line) => line.startsWith('    - ')).length).toBe(MARK_LIMIT);
    expect(lines[5 + MARK_LIMIT]).toBe('    … and 3 more marks');
  });

  it('before the chart is drawn, reports each op from the checks, with why one will not apply', () => {
    const overlay = (encodings: unknown) => ({
      id: 'line',
      ops: [{ op: 'set-overlay', name: 'target', value: { mark: 'rule', role: 'reference', data: { values: [{ y: 22 }] }, encodings } }],
    }) as ChartUpdate;
    const report = (updates: ChartUpdate[]) => chartContext({ agent: input, shown: input, updates, checks: checksOf(input, updates) }).text;
    const lines = report([overlay({ y: 'y' })]).split('\n');
    expect(lines.slice(2)).toEqual([
      'Agent updates (yours):',
      '- line:',
      '  ✗ overlay "target" (rule, 1 row): encodings.y must be { "field": "y" }, not "y".',
      'User interactions: none.',
    ]);
    const fixed = report([overlay({ y: { field: 'y' } })]);
    expect(fixed).toContain('  ✓ overlay "target" (rule, 1 row)');
  });

  it('on a drawn chart, takes what it left out from the mount warning, not the checks', () => {
    const updates: ChartUpdate[] = [{
      id: 'ref',
      ops: [{ op: 'set-overlay', name: 'target', value: { mark: 'rule', role: 'reference', data: { values: [{ y: 22 }] }, encodings: { y: { field: 'y' } } } }],
    }];
    const warnings = [{
      severity: 'warning' as const,
      code: 'unsupported_update',
      message: 'Update "ref" was unsupported: unsupported: set-overlay.',
      update: { id: 'ref', unsupportedOps: ['set-overlay' as const], unresolvedTargets: [] },
    }];
    const lines = text({ state: state({}), updates, warnings, drawnUpdates: updates }).split('\n');
    expect(lines[4]).toBe('  ✗ overlay "target" (rule, 1 row): the chart could not apply it.');
    expect(lines.some((line) => line.startsWith('Warnings'))).toBe(false);
  });
});

describe('chartContext user interactions', () => {
  it('describes a brush by its range on the brushed axis only', () => {
    const gestures = new Map([['brush', {
      action: 'brush-x' as const,
      geometry: {
        plot: { kind: 'rect' as const, rect: { x1: 0, y1: 0, x2: 10, y2: 10 }, axis: 'x' as const },
        domain: { x: { kind: 'interval' as const, start: 1999.99999, end: 2600 }, y: { kind: 'interval' as const, start: 0, end: 40 } },
      },
    }]]);
    const lines = text({ state: state({ entries: entries({ brush: [values[0], values[1]] }) }), gestures }).split('\n');
    expect(lines.slice(2)).toEqual(['User interactions:', '- brush: emphasizes 2 marks where weight from 2000 to 2600.']);
  });

  it('keeps the agent updates out of the reader section and skips previews', () => {
    const state_ = state({
      entries: new Map<string, ChartStateEntry>([
        ['japan', { layer: 'retained', elements: [elementOf(values[2])] }],
        ['hover', { layer: 'preview', elements: [elementOf(values[0])] }],
      ]),
    });
    const lines = text({ state: state_, updates: [emphasize('japan', { origin: 'Japan' })] }).split('\n');
    expect(lines.slice(-1)).toEqual(['User interactions: none.']);
  });

  it('names hidden series, filters and a zoomed axis', () => {
    const lines = text({
      state: state({
        hidden: [{ channel: 'color', value: 'Japan' }],
        filters: { origin: { in: ['USA', 'Europe'] }, mpg: { range: [20, 30] } },
        viewport: {
          x: { kind: 'interval', start: 2199.9925373, end: 2800 },
          y: { kind: 'interval', start: 0, end: 40 },
        },
      }),
    }).split('\n');
    expect(lines.slice(2)).toEqual([
      'User interactions:',
      '- Hidden: Japan.',
      '- Filters: origin in [USA, Europe]; mpg from 20 to 30.',
      'The x axis shows weight from 2199.99 to 2800.',
    ]);
  });
});

describe('chartContext data', () => {
  it('hands over the same facts as fields', () => {
    const data = chartContext({
      state: state({ entries: entries({ japan: [values[2]] }), hidden: [{ channel: 'color', value: 'USA' }] }),
      agent: input,
      shown: input,
      updates: [emphasize('japan', { origin: 'Japan' })],
      checks: checksOf(input, [emphasize('japan', { origin: 'Japan' })]),
    }).data;
    expect(data).toMatchObject({
      chartType: 'Scatter Plot',
      theme: 'default',
      encodings: { x: ['weight'], y: ['mpg'], color: ['origin'] },
      editedInPanel: [],
      agentUpdates: [{ id: 'japan', ops: [{ op: 'set-style', ok: true }], marks: [values[2]], annotations: [] }],
      userInteractions: [],
      hidden: [{ channel: 'color', value: 'USA' }],
    });
  });
});
