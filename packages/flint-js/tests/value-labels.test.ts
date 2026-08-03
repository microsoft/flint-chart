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
