import { describe, expect, it } from 'vitest';
import { assembleVegaLite } from '../src/vegalite';

const values = [
  { 品牌: '惠普', 年度: 2025, 毛利: 49933.56 },
  { 品牌: '惠普', 年度: 2026, 毛利: 30973.54 },
  { 品牌: '华为', 年度: 2025, 毛利: 25407.73 },
  { 品牌: '华为', 年度: 2026, 毛利: 14659.13 },
];

function input(typed: boolean) {
  return {
    data: { values },
    semantic_types: typed
      ? { 品牌: 'Category', 年度: 'Year', 毛利: 'Currency' }
      : { 品牌: 'Category', 毛利: 'Currency' },
    chart_spec: {
      chartType: 'Grouped Bar Chart',
      encodings: {
        x: { field: '品牌' },
        y: { field: '毛利' },
        group: { field: '年度' },
      },
    },
  } as any;
}

describe('two-value year legend', () => {
  it('uses discrete colors when the group field is typed as Year', () => {
    const spec = assembleVegaLite(input(true)) as any;

    expect(spec.encoding.color).toMatchObject({ field: '年度', type: 'ordinal' });
    expect(spec.encoding.xOffset).toMatchObject({ field: '年度', type: 'nominal' });
  });

  it('keeps an unrecognized numeric group field quantitative', () => {
    const spec = assembleVegaLite(input(false)) as any;

    expect(spec.encoding.color).toMatchObject({ field: '年度', type: 'quantitative' });
  });
});