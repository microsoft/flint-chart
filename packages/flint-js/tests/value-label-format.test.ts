// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';
import {
  formatValueApprox,
  inferValueLabelFormat,
  longestLabelChars,
} from '../src/core/theme/value-label-format';

/**
 * How many digits a value printed on a mark carries, and how wide it lands.
 *
 * Two things have to hold together, and neither is any use alone:
 *
 *   - the label carries digits a reader can act on. Left to Vega-Lite a bar
 *     gets captioned `3.14159265`; a house asking for a k/M suffix but no
 *     precision gets `1.23457M`. Both are the raw number wearing a costume.
 *   - the fit tests measure *that* label. They used to measure
 *     `String(Math.round(value))` — the width of a number nobody prints —
 *     so a chart of decimals was measured four times narrower than it drew,
 *     and its labels were offered straight into a pile.
 */
describe('value label precision', () => {
  describe('choosing the digits', () => {
    it('keeps three significant figures rather than the raw decimals', () => {
      expect(inferValueLabelFormat([3.14159265, 2.71828182], undefined)).toBe(',.2~f');
      expect(formatValueApprox(3.14159265, ',.2~f')).toBe('3.14');
    });

    it('does not invent decimals the data does not have', () => {
      // 45 is not 45.0: whole numbers stay whole, however much room there is.
      expect(inferValueLabelFormat([12, 45, 78], undefined)).toBe(',d');
    });

    it('does not round the small values in a series out of existence', () => {
      // Sized off the largest value alone, 0.001 and 0.05 both print `0` on
      // bars that plainly are not zero. The smallest value claims the
      // decimals it needs; `~` keeps them off the large ones.
      const pattern = inferValueLabelFormat([0.001, 0.05, 3.2, 180, 5000], undefined);
      expect(pattern).toBe(',.3~f');
      const drawn = [0.001, 0.05, 3.2, 180, 5000].map((v) => formatValueApprox(v, pattern));
      expect(drawn).toEqual(['0.001', '0.05', '3.2', '180', '5,000']);
    });

    it('falls back to an exponent when the zeros outrun the digits', () => {
      expect(inferValueLabelFormat([1e-7, 3.5e-7], undefined)).toBe('.2~e');
      expect(formatValueApprox(3.5e-7, '.2~e')).toBe('3.5e-7');
    });

    it('reaches for a k/M suffix once the numbers get long', () => {
      expect(inferValueLabelFormat([1234567, 2345678], undefined)).toBe('.3~s');
      expect(formatValueApprox(1234567, '.3~s')).toBe('1.23M');
    });

    it('never uses an SI suffix on values below one', () => {
      // d3 applies `s` in both directions, so 0.00123 comes out `1.23m` — and
      // on a chart `m` reads as *millions*. A house asking to shorten large
      // numbers is not asking for that, so small values keep their decimals.
      const house = '~s';
      expect(inferValueLabelFormat([0.00123456, 0.0034], house)).not.toContain('s');
      expect(inferValueLabelFormat([0.00123456, 0.0034], house)).toBe('.5~f');
    });

    it('fills in a precision the house left open, and respects one it stated', () => {
      // `~s` is a style ("use a suffix"), not a precision — left open it
      // prints every significant digit it has.
      expect(inferValueLabelFormat([1234567.891], '~s')).toBe('.3~s');
      // But a house that named its precision has decided; nothing overrides it.
      expect(inferValueLabelFormat([1234567.891], ',.2f')).toBe(',.2f');
    });
  });

  describe('a label may not contradict the mark it sits on', () => {
    it('raises a stated precision that would print every bar the same', () => {
      // McKinsey states `precision: 'integer'`. On eight bars of visibly
      // different height that printed `100` eight times — a caption the
      // chart itself refutes, and the reader believes the number.
      const near = [100.1, 100.2, 100.15, 100.05, 100.25, 100.12, 100.18, 100.08];
      expect(inferValueLabelFormat(near, ',.0f')).toBe(',.2~f');
      // The house's grouping and sign survive; only the digits move.
      expect(inferValueLabelFormat(near, '+,.0f')).toBe('+,.2~f');
    });

    it('raises a stated precision that would print a value as zero', () => {
      expect(inferValueLabelFormat([0.45, 0.82, 0.13], ',.0f')).toBe(',.1~f');
      expect(inferValueLabelFormat([0.00123456, 0.0034, 0.0021], ',.0f')).toBe(',.3~f');
    });

    it('leaves a stated precision alone when the labels stay distinct', () => {
      expect(inferValueLabelFormat([1234, 5678, 4321], ',.0f')).toBe(',.0f');
      // A real zero is allowed to print as zero.
      expect(inferValueLabelFormat([0, 17, 25], ',.0f')).toBe(',.0f');
    });

    it('finds the digits an inferred format needs, not just the ones its magnitude suggests', () => {
      // Three significant figures off the largest value gives `100` here;
      // the information in this series lives two digits further down.
      expect(inferValueLabelFormat([100.1, 100.2, 100.15, 100.05], undefined)).toBe(',.2~f');
    });

    it('drops the suffix when three significant figures would collapse the values', () => {
      // `.3~s` prints both of these `1M`.
      expect(inferValueLabelFormat([1000000, 1000400], undefined)).toBe(',d');
      // Where they stay apart, the suffix is still the shorter read.
      expect(inferValueLabelFormat([123456789, 987654321], undefined)).toBe('.3~s');
    });

    it('never invents a digit the data does not carry', () => {
      expect(inferValueLabelFormat([3, 17, 42], ',.0f')).toBe(',.0f');
      expect(inferValueLabelFormat([3, 17, 42], undefined)).toBe(',d');
    });
  });

  describe('measuring the label that will actually be drawn', () => {
    /**
     * Verified against real d3-format: every pattern/value pair below was
     * compared with `d3.format(pattern)(value)` and matched in width for all
     * of them (d3 renders a minus as U+2212 where this uses ASCII, which is
     * the same width). flint-js carries no runtime dependencies, so the
     * comparison is pinned here as a table rather than run against d3.
     */
    const cases: Array<[number, string, string]> = [
      [1234567, '.3~s', '1.23M'],
      [12345, '.3~s', '12.3k'],
      [1999.99, '.3~s', '2k'],
      [3.14159265, ',.2f', '3.14'],
      [0.00123456, ',.5~f', '0.00123'],
      [-1234.5678, ',d', '-1,235'],
      [1234567, ',d', '1,234,567'],
      [0.45, '.0%', '45%'],
      [2500, '.3~s', '2.5k'],
    ];
    for (const [value, pattern, expected] of cases) {
      it(`${pattern} renders ${value} as ${expected}`, () => {
        expect(formatValueApprox(value, pattern)).toBe(expected);
      });
    }

    it('measures the formatted string, not the rounded integer', () => {
      // The old estimate: `String(Math.round(3.14159265)).length` === 1.
      expect(longestLabelChars([3.14159265, 2.71828182], ',.2~f')).toBe(4);
      // ...and a suffix shortens a long number rather than lengthening it.
      expect(longestLabelChars([1234567, 987654321], '.3~s')).toBe(5);
    });

    it('falls back to the raw rendering when no format is stated', () => {
      // Which is what Vega-Lite would print, so the measurement stays honest.
      expect(longestLabelChars([3.14159265], undefined)).toBe(10);
    });
  });

  describe('the fit tests inherit the honest width', () => {
    const bars = (values: number[]) => ({
      data: { values: values.map((v, i) => ({ cat: `Category ${i + 1}`, val: v })) },
      semantic_types: { cat: 'nominal', val: 'quantitative' },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: { x: 'cat', y: 'val' },
        baseSize: { width: 420, height: 400 },
        chartProperties: { showValueLabels: true },
      },
      theme_spec: 'nyt',
    }) as any;

    it('a wide label is withheld where a narrow one is printed', () => {
      // Same bar count, same room. Only the printed width differs: `13` sits
      // in the band, `0.00123` does not — it is nearly twice the band wide,
      // and there is nowhere on a vertical bar chart to put a number that
      // wide without laying it across its neighbours. The old estimate
      // measured both as their rounded integer — one character each — and
      // printed the wide one anyway.
      const narrow: any = assembleVegaLite(bars(Array.from({ length: 14 }, (_, i) => 10 + i)));
      const wide: any = assembleVegaLite(bars(Array.from({ length: 14 }, (_, i) => 0.00123456 + i * 0.0001)));
      expect(narrow._theme?.decisions?.dataLabels?.show).toBe(true);
      expect(narrow._theme?.decisions?.dataLabels?.placement).toBe('atMark');
      expect(wide._theme?.decisions?.dataLabels?.show).toBe(false);
      // ...and given room, the same wide labels are printed. The width is the
      // reason, not the digits.
      const roomy: any = assembleVegaLite({
        ...bars(Array.from({ length: 14 }, (_, i) => 0.00123456 + i * 0.0001)),
        chart_spec: {
          chartType: 'Bar Chart',
          encodings: { x: 'cat', y: 'val' },
          baseSize: { width: 1400, height: 400 },
          chartProperties: { showValueLabels: true },
        },
      });
      expect(roomy._theme?.decisions?.dataLabels?.show).toBe(true);
    });

    it('gives an unthemed chart a format too, rather than the raw number', () => {
      // Without a house there was no format at all, so Vega-Lite printed the
      // number as JavaScript renders it and a tidy bar chart came out
      // captioned `3.14159265`.
      const spec: any = assembleVegaLite({
        data: { values: [3.14159265, 2.71828182, 1.41421356].map((v, i) => ({ cat: `C${i + 1}`, val: v })) },
        semantic_types: { cat: 'nominal', val: 'quantitative' },
        chart_spec: {
          chartType: 'Bar Chart',
          encodings: { x: 'cat', y: 'val' },
          baseSize: { width: 420, height: 340 },
          chartProperties: { showValueLabels: true },
        },
      } as any);
      const text = (spec.layer ?? []).find((l: any) => (l.mark?.type ?? l.mark) === 'text');
      expect(text?.encoding?.text?.format).toBe(',.2~f');
    });

    it('reports the precision it chose, so the digits are not silently changed', () => {
      const spec: any = assembleVegaLite(bars([3.14159265, 2.71828182, 1.41421356]));
      const said = (spec._theme?.report ?? []).map((r: any) => `${r.path}: ${r.message}`);
      expect(said.some((m: string) => m.startsWith('annotation.numberFormat:'))).toBe(true);
    });
  });

  describe('which side of the mark the number sits on', () => {
    const signed = (values: number[], horizontal = false, width = 700) => assembleVegaLite({
      data: { values: values.map((v, i) => ({ cat: `C${i + 1}`, val: v })) },
      semantic_types: { cat: 'nominal', val: 'quantitative' },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: horizontal ? { y: 'cat', x: 'val' } : { x: 'cat', y: 'val' },
        baseSize: { width, height: 320 },
        chartProperties: { showValueLabels: true },
      },
      theme_spec: 'economist',
    } as any) as any;

    const labelMark = (spec: any) =>
      (spec.layer ?? []).find((l: any) => (l.mark?.type ?? l.mark) === 'text')?.mark;

    it('sends the label below a bar that runs down from zero', () => {
      // A bar drawn downwards ends at the bottom, so "outside" is below it.
      // Placed above, the number lands on top of the bar it labels. A narrow
      // column keeps the bands too thin to print the number inside.
      const spec = signed([-1234.5, -88, 12, 940, -3], false, 300);
      expect(spec._theme.decisions.dataLabels.placement).toBe('outsideMark');
      const mark = labelMark(spec);
      expect(mark.baseline).toEqual({ expr: expect.stringContaining('datum["val"] < 0') });
      expect(mark.dy).toEqual({ expr: expect.stringContaining('datum["val"] < 0') });
      // Below for a negative, above for a positive — and never the reverse.
      expect(mark.baseline.expr).toBe(`datum["val"] < 0 ? 'top' : 'bottom'`);
    });

    it('turns those sides around once the number sits inside the bar', () => {
      // Wide bands leave room to print in the mark, and inside is the other
      // way up: the number hangs under a rising bar's top and sits over the
      // end of one that runs down.
      const spec = signed([-1234.5, -88, 12, 940, -3]);
      expect(spec._theme.decisions.dataLabels.placement).toBe('atMark');
      expect(labelMark(spec).baseline.expr).toBe(`datum["val"] < 0 ? 'bottom' : 'top'`);
    });

    it('flips left and right instead when the bars run sideways', () => {
      const spec = signed([-1234.5, -88, 12, 940, -3], true);
      const marks = (spec.layer ?? [])
        .filter((l: any) => (l.mark?.type ?? l.mark) === 'text')
        .map((l: any) => l.mark);
      // Sideways there is nothing to raise or lower; the side is left or
      // right. Bars too short to hold their number are labelled by a second
      // layer on the opposite side, so the two layers must be mirrors —
      // otherwise one of them is putting the number through its own bar.
      expect(marks.length).toBe(2);
      const exprs = marks.map((m: any) => m.align.expr).sort();
      expect(exprs).toEqual([
        `datum["val"] < 0 ? 'left' : 'right'`,
        `datum["val"] < 0 ? 'right' : 'left'`,
      ]);
      for (const m of marks) expect(m.baseline).toBe('middle');
    });

    it('leaves an all-positive chart on a plain offset', () => {
      // No negatives, nothing to resolve per mark: the spec stays literal.
      const mark = labelMark(signed([12, 940, 3]));
      expect(typeof mark.baseline).toBe('string');
      expect(typeof mark.dy).toBe('number');
    });
  });
});
