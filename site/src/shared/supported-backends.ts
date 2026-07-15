import {
  assembleVegaLite,
  assembleECharts,
  assembleChartjs,
  cjsGetTemplateDef,
  ecGetTemplateDef,
  vlGetTemplateDef,
  type ChartAssemblyInput,
} from 'flint-chart';

export type PreviewBackend = 'vegalite' | 'echarts' | 'chartjs';

/** A backend's template def (or `undefined` when it has no template for a type). */
type TemplateDef = ReturnType<typeof vlGetTemplateDef>;

/**
 * Everything the site needs to drive one rendering backend, in one row.
 *
 * This is the single dispatch point for "do X for the selected backend" so the
 * rest of the app never branches on `backend === 'vegalite'` etc. Adding a new
 * backend is one entry here (plus the `PreviewBackend` union) — consumers
 * (`getSupportedBackends`, the options panel, the chart views) pick it up for
 * free instead of each growing another `if`-ladder.
 */
export interface BackendAdapter {
  id: PreviewBackend;
  /** Human-readable name shown in the UI. */
  label: string;
  /** Compile a Flint input into this backend's native spec/config. */
  assemble: (input: ChartAssemblyInput) => unknown;
  /** This backend's template for a chart type (`undefined` = unsupported). */
  getTemplateDef: (chartType: string) => TemplateDef;
}

export const BACKENDS: Record<PreviewBackend, BackendAdapter> = {
  vegalite: {
    id: 'vegalite',
    label: 'Vega-Lite',
    assemble: assembleVegaLite,
    getTemplateDef: vlGetTemplateDef,
  },
  echarts: {
    id: 'echarts',
    label: 'ECharts',
    assemble: assembleECharts,
    getTemplateDef: ecGetTemplateDef,
  },
  chartjs: {
    id: 'chartjs',
    label: 'Chart.js',
    assemble: assembleChartjs,
    getTemplateDef: cjsGetTemplateDef,
  },
};

export const ALL_BACKENDS = Object.keys(BACKENDS) as PreviewBackend[];

export const BACKEND_LABELS = Object.fromEntries(
  ALL_BACKENDS.map((backend) => [backend, BACKENDS[backend].label]),
) as Record<PreviewBackend, string>;

/** Backends that have a registered template for the given chart type. */
export function getSupportedBackends(chartType: string): PreviewBackend[] {
  return ALL_BACKENDS.filter((backend) => !!BACKENDS[backend].getTemplateDef(chartType));
}
