// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ChartAssemblyInput } from 'flint-chart';
import {
  assembleForBackend,
  stripPrivateKeys,
} from './assemble.js';
import { renderVegaLite } from './vegalite.js';
import { renderECharts } from './echarts.js';
import { renderChartjs } from './chartjs.js';
import type {
  RenderBackend,
  RenderFormat,
  RenderOptions,
  RenderResult,
} from './types.js';

export type {
  RenderBackend,
  RenderFormat,
  RenderOptions,
  RenderResult,
} from './types.js';
export {
  assembleForBackend,
  stripPrivateKeys,
  validateInput,
  MAX_CANVAS_DIM,
  MAX_DATA_ROWS,
} from './assemble.js';
export {
  MAX_DATA_FILE_BYTES,
  resolveDataSource,
  type DataSourceOptions,
} from './data-source.js';

const DEFAULT_BACKGROUND = '#ffffff';

/** Backends whose render path is implemented in this server. */
export const RENDERABLE_BACKENDS: readonly RenderBackend[] = [
  'vegalite',
  'echarts',
  'chartjs',
];

/**
 * Compile a {@link ChartAssemblyInput} for `backend` and render it to a PNG or
 * SVG artifact entirely in-process. Returns the artifact bytes/markup plus the
 * Flint assembler warnings.
 */
export async function renderChart(
  input: ChartAssemblyInput,
  backend: RenderBackend,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const format: RenderFormat = options.format ?? 'png';
  const scale = options.scale && options.scale > 0 ? options.scale : 1;
  const background = options.background ?? DEFAULT_BACKGROUND;

  if (backend === 'chartjs' && format === 'svg') {
    throw new Error(
      'the chartjs backend supports png output only (no SVG engine); request format "png"',
    );
  }
  if (!RENDERABLE_BACKENDS.includes(backend)) {
    throw new Error(
      `backend "${backend}" cannot be rendered; choose one of: ${RENDERABLE_BACKENDS.join(', ')}`,
    );
  }

  const { spec, warnings, width, height } = assembleForBackend(backend, input, {
    disableFileReference: options.disableFileReference,
    cwd: options.cwd,
  });

  // Extract sizing before stripping Flint's private annotation keys. Vega-Lite
  // carries its own real `width`/`height`; the `_`-prefixed keys are Flint
  // metadata and are safe to remove for every backend.
  const w = width ?? spec?.width ?? undefined;
  const h = height ?? spec?.height ?? undefined;
  stripPrivateKeys(spec);

  let artifact: Omit<RenderResult, 'warnings'>;
  switch (backend) {
    case 'vegalite':
      artifact = await renderVegaLite(spec, {
        format,
        scale,
        background,
        width: w,
        height: h,
      });
      break;
    case 'echarts':
      artifact = await renderECharts(spec, {
        format,
        scale,
        background,
        width: w ?? 400,
        height: h ?? 320,
      });
      break;
    case 'chartjs':
      artifact = await renderChartjs(spec, {
        scale,
        background,
        width: w ?? 400,
        height: h ?? 320,
      });
      break;
  }

  return { ...artifact, warnings };
}
