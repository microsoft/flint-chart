import { describe, expect, it } from 'vitest';
import { onRoundInterval } from '../src/core/label-sequence';

describe('onRoundInterval', () => {
  it('carries a thinning read on a window to every name on the same interval', () => {
    const years = Array.from({ length: 30 }, (_, index) => String(1880 + index));
    expect(onRoundInterval('year', ['1880', '1885', '1890'], years))
      .toEqual(['1880', '1885', '1890', '1895', '1900', '1905']);
    expect(onRoundInterval('year', ['1880'], years)).toBeUndefined();
  });
});
