// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  vlAllTemplateDefs,
  ecAllTemplateDefs,
  cjsAllTemplateDefs,
  listThemePresets,
  listInteractionPresets as listPresetSummaries,
  supportedInteractionPresets,
  THEME_PRESETS,
  type ChartTemplateDef,
  type InteractionPresetSummary,
  type InteractionPresetType,
} from 'flint-chart';
import type { RenderBackend } from '../render/types.js';
import { CHART_GUIDE, CROSS_CUTTING_PROPERTIES, type ChartGuideProperty } from './chart-guide.js';

const REGISTRY: Record<RenderBackend, ChartTemplateDef[]> = {
  vegalite: vlAllTemplateDefs,
  echarts: ecAllTemplateDefs,
  chartjs: cjsAllTemplateDefs,
};

export interface ChartTypeSummary {
  chartType: string;
  /** Encoding channels this chart type accepts (e.g. x, y, color, size). */
  channels: string[];
  /** What the chart is for and how its channels read; Vega-Lite types only. */
  note?: string;
}

export interface ChartTypeDetail extends ChartTypeSummary {
  /** Advice that applies whenever this type is used (map keys, which bar chart). */
  guidance?: string[];
  /** Its chartProperties: values, default and effect. Set one only when the user asks. */
  properties: ChartGuideProperty[];
  /** Properties every positional or faceted chart takes. */
  crossCutting: ChartGuideProperty[];
  /**
   * Interaction presets the chart type supports in `interaction_spec`, by
   * declaration. The data can still remove one at mount. Empty for backends that run no interactions.
   */
  interactions: InteractionPresetType[];
}

export interface BackendCatalog {
  backend: RenderBackend;
  count: number;
  chartTypes: ChartTypeSummary[];
}

/**
 * The chart-type catalog: each type, its channels and a one-line note, for one backend or all.
 * With `chartType`, that one type in full: its guidance, chartProperties and interaction presets.
 */
export function listChartTypes(backend?: RenderBackend, chartType?: string): BackendCatalog[] | ChartTypeDetail {
  if (chartType) {
    const on = backend ?? 'vegalite';
    const defs = REGISTRY[on] ?? [];
    // A near name ("choropleth map", "scatter") resolves when it points at one type.
    const loose = (name: string) => name.toLowerCase().replace(/\s+(chart|map|plot)$/, '').trim();
    const near = defs.filter((d) => loose(d.chart) === loose(chartType));
    const def = defs.find((d) => d.chart === chartType) ?? (near.length === 1 ? near[0] : undefined);
    if (!def) {
      throw new Error(`Unknown chart type "${chartType}" for ${on}. Chart types: ${defs.map((d) => d.chart).sort().join(', ')}.`);
    }
    const guide = on === 'vegalite' ? CHART_GUIDE[def.chart] : undefined;
    return {
      chartType: def.chart,
      channels: def.channels ?? [],
      ...(guide?.note ? { note: guide.note } : {}),
      ...(guide?.guidance ? { guidance: guide.guidance } : {}),
      properties: guide?.properties ?? [],
      crossCutting: CROSS_CUTTING_PROPERTIES,
      interactions: supportedInteractionPresets(def.interactionSupport),
    };
  }
  const backends: RenderBackend[] = backend
    ? [backend]
    : (Object.keys(REGISTRY) as RenderBackend[]);
  return backends.map((b) => {
    const defs = REGISTRY[b] ?? [];
    const chartTypes = defs
      .map((d) => ({
        chartType: d.chart,
        channels: d.channels ?? [],
        ...(b === 'vegalite' && CHART_GUIDE[d.chart] ? { note: CHART_GUIDE[d.chart].note } : {}),
      }))
      .sort((a, b2) => a.chartType.localeCompare(b2.chartType));
    return { backend: b, count: chartTypes.length, chartTypes };
  });
}

/**
 * The design languages Flint ships, to be named in `theme_spec`.
 *
 * Without an `id`, the catalogue: enough to choose by. With one, that house's
 * guidance too — what an author has to supply for it to work, which is worth
 * reading before writing the chart spec, not after.
 */
export function listThemes(id?: string) {
  if (!id) return { themes: listThemePresets() };
  const preset = THEME_PRESETS[id];
  if (!preset) {
    throw new Error(
      `Unknown theme \`${id}\`. Flint ships: ${Object.keys(THEME_PRESETS).join(', ')}.`,
    );
  }
  // `spec` is the compiler's business and `icon` is a picker's; neither
  // helps an agent decide, and both are large.
  const { spec: _spec, icon: _icon, ...rest } = preset;
  return rest;
}

/**
 * The interaction presets, each with what it needs from a chart, its reset
 * gestures, and every option it accepts. `chartType` narrows the list to the
 * presets that Vega-Lite chart type supports by declaration; `type` returns one.
 */
export function listInteractionPresets(filter: { chartType?: string; type?: string } = {}): {
  presets: readonly InteractionPresetSummary[];
} {
  let presets = listPresetSummaries();
  if (filter.chartType !== undefined) {
    const def = vlAllTemplateDefs.find((d) => d.chart === filter.chartType);
    if (!def) {
      throw new Error(
        `Unknown Vega-Lite chart type \`${filter.chartType}\`. Call list_chart_types for the registered names.`,
      );
    }
    const supported = new Set<string>(supportedInteractionPresets(def.interactionSupport));
    presets = presets.filter((preset) => supported.has(preset.type));
  }
  if (filter.type !== undefined) {
    const one = presets.find((preset) => preset.type === filter.type);
    if (!one) {
      throw new Error(
        `Unknown interaction preset \`${filter.type}\`. Flint ships: ${presets.map((preset) => preset.type).join(', ')}.`,
      );
    }
    presets = [one];
  }
  return { presets };
}
