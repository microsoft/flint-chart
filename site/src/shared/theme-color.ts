import { resolveThemeSpec } from 'flint-chart';
import type { ThemeSpec } from 'flint-chart';

export function themeOwnsContinuousColor(theme: string | ThemeSpec | undefined): boolean {
  if (!theme) return false;
  try {
    const series = resolveThemeSpec(theme)?.ink?.series;
    return !!(series?.sequential || series?.diverging);
  } catch {
    return false;
  }
}