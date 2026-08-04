// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite, getChartOptions } from '../src';

/**
 * The `showValueLabels` toggle — "print the numbers on the marks?".
 *
 * A house already has a standing habit here (`dataLabels.show`), and that habit
 * is what seeds the control. The toggle exists so a reader can overrule it for
 * one chart, in both directions, without ever being able to overprint a chart
 * too dense to read.
 *
 * The invariants worth protecting:
 *
 *   - the seed is the house's own answer at this density, so leaving the
 *     control alone and writing its seed back produce the same chart;
 *   - `false` silences even a house that always prints — this was impossible
 *     before, the theme printed labels no chartProperty could suppress;
 *   - `true` overrules a cautious house, but not the hard density ceiling;
 *   - past that ceiling the control is withheld, not offered inert;
 *   - templates that print their own labels (waterfall, heatmap) answer to the
 *     same toggle and expose only that one, while still accepting the older
 *     `showTextLabels` spelling as input.
 */

const bars = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ cat: `C${i + 1}`, val: 10 + ((i * 7) % 90) }));

/** Tall enough that each band can hold a number, up to a large n. */
const barChart = (n: number, theme: string | undefined, props?: Record<string, unknown>) => ({
  data: { values: bars(n) },
  semantic_types: { cat: 'nominal', val: 'quantitative' },
  chart_spec: {
    chartType: 'Bar Chart',
    encodings: { y: 'cat', x: 'val' },
    baseSize: { width: 700, height: 1800 },
    ...(props ? { chartProperties: props } : {}),
  },
  ...(theme ? { theme_spec: theme } : {}),
}) as any;

/** Count text marks anywhere in the spec — the value labels are text layers. */
function countTextMarks(spec: any): number {
  let n = 0;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const mark = typeof node.mark === 'string' ? node.mark : node.mark?.type;
    if (mark === 'text') n += 1;
    for (const key of Object.keys(node)) if (key !== 'mark') walk(node[key]);
  };
  walk(spec);
  return n;
}

const option = (input: any, key: string) =>
  getChartOptions(input).find((o: any) => o.key === key);

/** Houses that print labels whenever they fit, vs. houses that always print. */
const WHEN_THEY_FIT = ['economist', 'nature', 'powerbi', 'datawrapper'];
const ALWAYS = ['nyt', 'mckinsey'];

describe('showValueLabels', () => {
  it('seeds from the house, so writing the seed back changes nothing', () => {
    for (const house of [...WHEN_THEY_FIT, ...ALWAYS]) {
      for (const n of [12, 30, 50, 90]) {
        const seed = option(barChart(n, house), 'showValueLabels')?.value;
        expect(typeof seed, `${house} n=${n}`).toBe('boolean');
        const untouched = countTextMarks(assembleVegaLite(barChart(n, house)));
        const reseeded = countTextMarks(assembleVegaLite(barChart(n, house, { showValueLabels: seed })));
        expect(reseeded, `${house} n=${n} round-trip`).toBe(untouched);
      }
    }
  });

  it('the seed reflects each house\'s own habit at a density where they disagree', () => {
    // 50 bars: comfortably readable, but past the point a cautious house bothers.
    for (const house of WHEN_THEY_FIT) {
      expect(option(barChart(50, house), 'showValueLabels')?.value, house).toBe(false);
    }
    for (const house of ALWAYS) {
      expect(option(barChart(50, house), 'showValueLabels')?.value, house).toBe(true);
    }
  });

  it('false silences a house that would otherwise print', () => {
    for (const house of [...WHEN_THEY_FIT, ...ALWAYS]) {
      // Sparse enough that every house prints of its own accord.
      expect(countTextMarks(assembleVegaLite(barChart(12, house))), `${house} baseline`)
        .toBeGreaterThan(0);
      expect(countTextMarks(assembleVegaLite(barChart(12, house, { showValueLabels: false }))), house)
        .toBe(0);
    }
  });

  it('true overrules a cautious house', () => {
    for (const house of WHEN_THEY_FIT) {
      expect(countTextMarks(assembleVegaLite(barChart(50, house))), `${house} untouched`).toBe(0);
      expect(countTextMarks(assembleVegaLite(barChart(50, house, { showValueLabels: true }))), house)
        .toBeGreaterThan(0);
    }
  });

  it('true is not a licence to overprint: the density ceiling still holds', () => {
    for (const house of [...WHEN_THEY_FIT, ...ALWAYS]) {
      expect(countTextMarks(assembleVegaLite(barChart(130, house, { showValueLabels: true }))), house)
        .toBe(0);
    }
  });

  it('is withheld rather than offered inert once labels cannot be read', () => {
    for (const house of [...WHEN_THEY_FIT, ...ALWAYS]) {
      expect(option(barChart(12, house), 'showValueLabels')?.applicable, `${house} sparse`).toBe(true);
      expect(option(barChart(130, house), 'showValueLabels')?.applicable, `${house} dense`).toBe(false);
    }
  });

  it('is a toggle, not a multi-choice', () => {
    const opt = option(barChart(12, 'economist'), 'showValueLabels');
    expect(opt?.type).toBe('binary');
  });
});

describe('showValueLabels without a theme', () => {
  it('is offered on a plain bar chart, defaulting to off', () => {
    const opt = option(barChart(12, undefined), 'showValueLabels');
    expect(opt?.applicable).toBe(true);
    expect(opt?.value).toBe(false);
  });

  it('prints the numbers when asked, with no house in sight', () => {
    expect(countTextMarks(assembleVegaLite(barChart(12, undefined)))).toBe(0);
    expect(countTextMarks(assembleVegaLite(barChart(12, undefined, { showValueLabels: true }))))
      .toBeGreaterThan(0);
  });

  it('obeys the same density ceiling as a house does', () => {
    expect(option(barChart(130, undefined), 'showValueLabels')?.applicable).toBe(false);
    expect(countTextMarks(assembleVegaLite(barChart(130, undefined, { showValueLabels: true })))).toBe(0);
  });

  it('leaves an untouched chart exactly as it was', () => {
    // The default is silence, so simply grounding the neutral house must not
    // put a single mark on a chart nobody asked to label.
    const strip = (s: any) => { const { _theme, _options, _warnings, ...rest } = s; return JSON.stringify(rest); };
    const untouched = strip(assembleVegaLite(barChart(12, undefined)));
    const explicitOff = strip(assembleVegaLite(barChart(12, undefined, { showValueLabels: false })));
    expect(explicitOff).toBe(untouched);
  });

  it('does not leak a _theme onto a chart that named no house', () => {
    expect((assembleVegaLite(barChart(12, undefined)) as any)._theme).toBeUndefined();
    expect((assembleVegaLite(barChart(12, undefined, { showValueLabels: true })) as any)._theme)
      .toBeUndefined();
  });
});

describe('an empty ThemeSpec is the neutral house, not an error', () => {
  it('grounds instead of throwing', () => {
    expect(() => assembleVegaLite({ ...barChart(12, undefined), theme_spec: {} } as any)).not.toThrow();
  });

  it('is a real theme, so it reports itself', () => {
    const spec = assembleVegaLite({ ...barChart(12, undefined), theme_spec: {} } as any) as any;
    expect(spec._theme?.id).toBe('flint');
  });
});

describe('showValueLabels on templates that print their own labels', () => {
  const waterfall = (props?: Record<string, unknown>) => ({
    data: {
      values: Array.from({ length: 12 }, (_, i) => ({
        step: `S${i + 1}`, delta: (i % 3 === 0 ? -1 : 1) * (5 + i),
      })),
    },
    semantic_types: { step: 'nominal', delta: 'quantitative' },
    chart_spec: {
      chartType: 'Waterfall Chart',
      encodings: { x: 'step', y: 'delta' },
      baseSize: { width: 600, height: 380 },
      ...(props ? { chartProperties: props } : {}),
    },
  }) as any;

  const heatmap = (props?: Record<string, unknown>) => ({
    data: {
      values: Array.from({ length: 12 }, (_, i) => ({
        row: `R${i % 4}`, col: `C${Math.floor(i / 4)}`, val: (i * 13) % 50,
      })),
    },
    semantic_types: { row: 'nominal', col: 'nominal', val: 'quantitative' },
    chart_spec: {
      chartType: 'Heatmap',
      encodings: { x: 'col', y: 'row', color: 'val' },
      baseSize: { width: 600, height: 380 },
      ...(props ? { chartProperties: props } : {}),
    },
  }) as any;

  for (const [name, build] of [['waterfall', waterfall], ['heatmap', heatmap]] as const) {
    it(`${name} answers to the same toggle`, () => {
      expect(countTextMarks(assembleVegaLite(build({ showValueLabels: true })))).toBeGreaterThan(0);
      expect(countTextMarks(assembleVegaLite(build({ showValueLabels: false })))).toBe(0);
    });

    it(`${name} still accepts the older showTextLabels spelling`, () => {
      expect(countTextMarks(assembleVegaLite(build({ showTextLabels: true })))).toBeGreaterThan(0);
    });

    it(`${name} offers one labels control, not two`, () => {
      const shown = getChartOptions(build())
        .filter((o: any) => o.applicable && /label/i.test(o.key))
        .map((o: any) => o.key);
      expect(shown).toEqual(['showValueLabels']);
    });
  }

  it('is withheld where the template already writes its own text', () => {
    // A rose prints its own text on the marks, so the label layer stands down.
    // Offering a toggle there would be offering a control that changes nothing.
    const rose = (props?: Record<string, unknown>) => ({
      data: { values: bars(6) },
      semantic_types: { cat: 'nominal', val: 'quantitative' },
      chart_spec: {
        chartType: 'Rose Chart',
        encodings: { x: 'cat', y: 'val' },
        baseSize: { width: 600, height: 380 },
        ...(props ? { chartProperties: props } : {}),
      },
    }) as any;
    expect(option(rose(), 'showValueLabels')?.applicable).toBe(false);
    // ...and it is withheld precisely because it would be inert.
    const strip = (s: any) => { const { _theme, _options, _warnings, ...rest } = s; return JSON.stringify(rest); };
    expect(strip(assembleVegaLite(rose({ showValueLabels: true }))))
      .toBe(strip(assembleVegaLite(rose({ showValueLabels: false }))));
  });
});

/**
 * Bars that share a band — grouped and stacked.
 *
 * Both divide the room a single bar would have had, and each divides it a
 * different way, so each needs its own fit test:
 *
 *   - a *grouped* bar splits the band across the categorical axis, so the room
 *     for a number is the band over the series count. The applicability test
 *     used to read the whole band while the renderer read the slot, so between
 *     those two readings the control was offered on charts that then printed
 *     nothing; the horizontal case had no slot test at all and printed a
 *     hundred-odd clipped numbers over each other.
 *   - a *stacked* bar keeps the whole band but splits the measure axis, so
 *     what has to hold a line of text is each segment's own thickness. The
 *     number goes in the middle of the segment: at the edge it reads as the
 *     running total, which is why stacks went unlabelled before.
 */
describe('value labels on bars that share a band', () => {
  const grid = (cats: number, series: number, value: (c: number, s: number) => number) => {
    const out: any[] = [];
    for (let c = 0; c < cats; c++) {
      for (let s = 0; s < series; s++) out.push({ cat: `C${c + 1}`, grp: `S${s + 1}`, val: value(c, s) });
    }
    return out;
  };
  const spread = (c: number, s: number) => 10 + ((c * 7 + s * 13) % 60);

  const sharedBar = (
    chartType: 'Grouped Bar Chart' | 'Stacked Bar Chart',
    cats: number,
    series: number,
    opts: { horizontal?: boolean; props?: Record<string, unknown>; value?: (c: number, s: number) => number } = {},
  ) => ({
    data: { values: grid(cats, series, opts.value ?? spread) },
    semantic_types: { cat: 'nominal', grp: 'nominal', val: 'quantitative' },
    chart_spec: {
      chartType,
      encodings: chartType === 'Grouped Bar Chart'
        ? (opts.horizontal ? { y: 'cat', x: 'val', group: 'grp' } : { x: 'cat', y: 'val', group: 'grp' })
        : (opts.horizontal ? { y: 'cat', x: 'val', color: 'grp' } : { x: 'cat', y: 'val', color: 'grp' }),
      baseSize: { width: 800, height: 420 },
      ...(opts.props ? { chartProperties: opts.props } : {}),
    },
    theme_spec: 'nyt',
  }) as any;

  /** The synthetic label layer, wherever it ended up. */
  const labelLayer = (spec: any): any => {
    let found: any;
    const walk = (node: any) => {
      if (!node || typeof node !== 'object' || found) return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      const mark = typeof node.mark === 'string' ? node.mark : node.mark?.type;
      if (mark === 'text' && node.__themeSynthetic) { found = node; return; }
      for (const key of Object.keys(node)) if (key !== 'mark') walk(node[key]);
    };
    walk(spec);
    return found;
  };

  describe('grouped bars offer the control only where the slot holds the number', () => {
    for (const horizontal of [false, true]) {
      const way = horizontal ? 'horizontal' : 'vertical';

      it(`${way}: a roomy grid both offers and prints`, () => {
        const input = sharedBar('Grouped Bar Chart', 4, 3, { horizontal });
        expect(option(input, 'showValueLabels')?.applicable).toBe(true);
        const on = sharedBar('Grouped Bar Chart', 4, 3, { horizontal, props: { showValueLabels: true } });
        expect(countTextMarks(assembleVegaLite(on))).toBeGreaterThan(0);
      });

      it(`${way}: a crowded grid withholds the control rather than offering it inert`, () => {
        // 20 categories x 6 series leaves each bar a few pixels: the numbers
        // would overlap and clip. The control must be withheld *and* silent —
        // offering it while printing nothing is the bug this pins down.
        const input = sharedBar('Grouped Bar Chart', 20, 6, { horizontal });
        expect(option(input, 'showValueLabels')?.applicable).toBe(false);
        const on = sharedBar('Grouped Bar Chart', 20, 6, { horizontal, props: { showValueLabels: true } });
        expect(countTextMarks(assembleVegaLite(on))).toBe(0);
      });
    }
  });

  describe('stacked bars label each segment, in the middle of it', () => {
    it('offers the control and prints a number per segment', () => {
      const input = sharedBar('Stacked Bar Chart', 6, 3);
      expect(option(input, 'showValueLabels')?.applicable).toBe(true);
      const layer = labelLayer(assembleVegaLite(sharedBar('Stacked Bar Chart', 6, 3, { props: { showValueLabels: true } })));
      expect(layer).toBeTruthy();
      // Centred in the segment, not at its edge: the edge reads as the total.
      expect(layer.encoding.y.stack).toBeTruthy();
      expect(layer.encoding.y.bandPosition).toBe(0.5);
      expect(layer.mark.baseline).toBe('middle');
    });

    it('stacks its labels in the same order as the bars', () => {
      // Vega-Lite reads stack order off the colour field, which the label
      // layer does not carry; without a stated order every number lands on a
      // neighbour's segment. The order is stated as a position within the
      // colour scale's domain rather than as a sort of the field itself,
      // because those two differ whenever a template pins its own domain.
      // The two axes run opposite ways, so the direction flips with the
      // orientation.
      const vertical = labelLayer(assembleVegaLite(
        sharedBar('Stacked Bar Chart', 6, 3, { props: { showValueLabels: true } })));
      expect(vertical.encoding.order).toMatchObject({ field: '__flintStackOrder', sort: 'descending' });
      const horizontal = labelLayer(assembleVegaLite(
        sharedBar('Stacked Bar Chart', 6, 3, { horizontal: true, props: { showValueLabels: true } })));
      expect(horizontal.encoding.order).toMatchObject({ field: '__flintStackOrder', sort: 'ascending' });
    });

    it('takes the order from the domain the bars stack by, not the alphabet', () => {
      // A Likert scale is pinned to its own order — "A great deal", "Some",
      // "Not much", "None at all" — which is not alphabetical. Sorting the
      // colour field instead put every number on the wrong segment: `Some`
      // sorts last but stacks second.
      const responses = ['A great deal', 'Some', 'Not much', 'None at all'];
      const values = [['Scientists', [39, 45, 12, 4]], ['Congress', [8, 30, 38, 24]]] as [string, number[]][];
      const spec: any = assembleVegaLite({
        data: {
          values: values.flatMap(([Institution, vals]) =>
            responses.map((Response, i) => ({ Institution, Response, Share: vals[i] }))),
        },
        semantic_types: { Institution: 'Category', Response: 'Category', Share: 'Quantity' },
        chart_spec: {
          chartType: 'Stacked Bar Chart',
          encodings: { x: 'Share', y: 'Institution', color: 'Response' },
          baseSize: { width: 600, height: 380 },
          chartProperties: { showValueLabels: true },
        },
        theme_spec: 'swiss',
      } as any);
      const bar = (spec.layer ?? []).find((l: any) => (l.mark?.type ?? l.mark) === 'bar');
      const domain = bar.encoding.color.scale.domain;
      expect(domain).toEqual(responses);
      // The label layer indexes into exactly that domain.
      const order = (labelLayer(spec).transform ?? [])
        .find((t: any) => t.as === '__flintStackOrder');
      expect(order).toBeTruthy();
      expect(order.calculate).toContain(JSON.stringify(domain));
    });

    it('picks the ink per segment, so a dark series does not swallow its number', () => {
      // Swiss puts a near-black in its categorical palette and prints its
      // labels in a near-black ink: on that one series the number vanished.
      // One ink cannot serve a palette, so the label carries its own colour
      // scale over the same field — same sort, so the domains line up — and
      // each entry is the ink readable on the matching fill.
      const responses = ['A great deal', 'Some', 'Not much', 'None at all'];
      const spec: any = assembleVegaLite({
        data: {
          values: [['Scientists', [39, 45, 12, 4]], ['Congress', [8, 30, 38, 24]]]
            .flatMap(([Institution, vals]: any) =>
              responses.map((Response, i) => ({ Institution, Response, Share: vals[i] }))),
        },
        semantic_types: { Institution: 'Category', Response: 'Category', Share: 'Quantity' },
        chart_spec: {
          chartType: 'Stacked Bar Chart',
          encodings: { x: 'Share', y: 'Institution', color: 'Response' },
          baseSize: { width: 600, height: 380 },
          chartProperties: { showValueLabels: true },
        },
        theme_spec: 'swiss',
      } as any);
      const bar = (spec.layer ?? []).find((l: any) => (l.mark?.type ?? l.mark) === 'bar');
      const fills: string[] = bar.encoding.color.scale.range;
      const inks: string[] = labelLayer(spec).encoding.color.scale.range;
      expect(inks.length).toBe(fills.length);
      // Not one ink repeated: the palette spans light and dark, so the inks
      // must too, or one of them is sitting on its own colour.
      expect(new Set(inks).size).toBeGreaterThan(1);
      // And the two scales must not be merged into one by Vega-Lite, or the
      // fill range wins and the number is painted its own background.
      expect(spec.resolve?.scale?.color).toBe('independent');
    });

    it('drops the number from segments too thin to hold it', () => {
      // One series is a sliver against the others; it cannot carry a line of
      // text, so it is hidden by opacity — not dropped, which would restack
      // the surviving labels onto the wrong segments.
      const sliver = (_c: number, s: number) => (s === 0 ? 1 : 60);
      const layer = labelLayer(assembleVegaLite(
        sharedBar('Stacked Bar Chart', 6, 3, { props: { showValueLabels: true }, value: sliver })));
      expect(layer.encoding.opacity?.condition?.test).toBeTruthy();
      expect(layer.encoding.opacity.value).toBe(0);
    });

    it('prints shares, not raw values, when the stack is normalized', () => {
      // The axis is a percentage and the segment's length *is* its share, so a
      // raw value there would name a quantity the chart does not draw.
      const layer = labelLayer(assembleVegaLite(sharedBar('Stacked Bar Chart', 6, 3, {
        props: { stackMode: 'normalize', showValueLabels: true },
      })));
      expect(layer.encoding.text.format).toBe('.0%');
      expect(JSON.stringify(layer.transform)).toContain('joinaggregate');
    });

    it('withholds the control when the bars are narrower than the number', () => {
      // A stacked bar cannot move a too-wide number above itself the way a
      // single-series bar can — above the bar is the top of the whole stack.
      const wide = (c: number, s: number) => 1234567 + c * 100000 + s * 70000;
      const input = sharedBar('Stacked Bar Chart', 20, 4, { value: wide, props: { valueFormat: 'raw' } });
      expect(option(input, 'showValueLabels')?.applicable).toBe(false);
      const on = sharedBar('Stacked Bar Chart', 20, 4, {
        value: wide, props: { valueFormat: 'raw', showValueLabels: true },
      });
      expect(countTextMarks(assembleVegaLite(on))).toBe(0);
    });
  });

  describe('a ribbon is not a set of marks', () => {
    const stackedArea = (normalized: boolean) => {
      const values = ([[1990, [4430, 1780, 2160]], [2000, [5990, 2760, 2620]],
        [2010, [8670, 4760, 3440]], [2020, [9420, 6270, 4360]]] as [number, number[]][])
        .flatMap(([Year, vals]) => ['Coal', 'Gas', 'Hydro']
          .map((Source, i) => ({ Year, Source, TWh: vals[i] })));
      return {
        data: { values },
        semantic_types: { Year: 'Year', Source: 'Category', TWh: 'Quantity' },
        chart_spec: {
          chartType: 'Area Chart',
          encodings: { x: 'Year', y: 'TWh', color: 'Source' },
          baseSize: { width: 600, height: 380 },
          ...(normalized ? { chartProperties: { stackMode: 'normalize' } } : {}),
        },
        theme_spec: 'swiss',
      } as any;
    };

    it('does not print values on a normalized stacked area', () => {
      // `isPartToWhole` is true here — a normalized stack *is* parts of a
      // whole — but that test was written for wedges, which have a slot each.
      // An area is one continuous ribbon: the numbers land on the vertices,
      // which are sampling points rather than marks to read off one at a
      // time. Worse, on a normalized chart the axis is a percentage while the
      // number is a raw total, so it names a quantity nothing on the chart
      // draws.
      const spec: any = assembleVegaLite(stackedArea(true));
      expect(spec._theme?.decisions?.dataLabels?.possible).toBe(false);
      expect(countTextMarks(spec)).toBe(0);
    });

    it('does not print them on a plain stacked area either', () => {
      const spec: any = assembleVegaLite(stackedArea(false));
      expect(countTextMarks(spec)).toBe(0);
    });

    it('withholds the toggle rather than offering it inert', () => {
      const offered = getChartOptions(stackedArea(true)).map((o: any) => o.key);
      expect(offered).not.toContain('showValueLabels');
    });
  });
});
