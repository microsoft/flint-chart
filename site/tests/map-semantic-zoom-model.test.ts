import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FOCUS_PROVINCE,
  buildSemanticZoomDataUpdate,
  cityDetailRows,
  provinceOverviewRows,
  resolveSemanticZoomLevel,
} from '../src/playground/map-semantic-zoom-model';

describe('map semantic zoom model', () => {
  it('keeps hysteresis between province and city levels', () => {
    expect(resolveSemanticZoomLevel({
      zoom: 1.8,
      currentLevel: 'province',
      focusProvince: DEFAULT_FOCUS_PROVINCE,
    })).toBe('province');

    expect(resolveSemanticZoomLevel({
      zoom: 2.2,
      currentLevel: 'province',
      focusProvince: DEFAULT_FOCUS_PROVINCE,
    })).toBe('city');

    expect(resolveSemanticZoomLevel({
      zoom: 1.9,
      currentLevel: 'city',
      focusProvince: DEFAULT_FOCUS_PROVINCE,
    })).toBe('city');

    expect(resolveSemanticZoomLevel({
      zoom: 1.6,
      currentLevel: 'city',
      focusProvince: DEFAULT_FOCUS_PROVINCE,
    })).toBe('province');
  });

  it('builds a set-data update that swaps overview rows for focused city rows', () => {
    const provinceRows = provinceOverviewRows(DEFAULT_FOCUS_PROVINCE);
    const cityRows = cityDetailRows(DEFAULT_FOCUS_PROVINCE);
    const provinceUpdate = buildSemanticZoomDataUpdate('province', DEFAULT_FOCUS_PROVINCE);
    const cityUpdate = buildSemanticZoomDataUpdate('city', DEFAULT_FOCUS_PROVINCE);

    expect(provinceRows.length).toBeGreaterThan(cityRows.length);
    expect(cityRows.every((row) => row.Province === DEFAULT_FOCUS_PROVINCE)).toBe(true);
    expect(provinceUpdate.ops).toEqual([
      { op: 'set-data', source: 'main', value: { rows: provinceRows } },
    ]);
    expect(cityUpdate.ops).toEqual([
      { op: 'set-data', source: 'main', value: { rows: cityRows } },
    ]);
  });
});
