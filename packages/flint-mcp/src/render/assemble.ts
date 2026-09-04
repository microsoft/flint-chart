// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  assembleForBackend as coreAssembleForBackend,
  validateChartInput,
  stripPrivateKeys,
  DEFAULT_MAX_CANVAS_DIM,
  DEFAULT_MAX_DATA_ROWS,
  type AssembleResult,
  type ChartAssemblyInput,
  type ValidateChartOptions,
} from 'flint-chart';
import {
  resolveDataSource,
  type DataSourceOptions,
} from './data-source.js';
import type { RenderBackend } from './types.js';

export { stripPrivateKeys, type AssembleResult };

/** Maximum number of inline data rows accepted (DoS guard). */
export const MAX_DATA_ROWS = DEFAULT_MAX_DATA_ROWS;

/** Maximum canvas dimension in pixels the host will honor (DoS guard). */
export const MAX_CANVAS_DIM = DEFAULT_MAX_CANVAS_DIM;

const CAPS: ValidateChartOptions = {
  maxDataRows: MAX_DATA_ROWS,
  maxCanvasDim: MAX_CANVAS_DIM,
};

/**
 * Validate caller-supplied input before it reaches an assembler. Inline rows
 * pass through directly. Local `data.url` references are read unless
 * `disableFileReference` is set; remote URLs stay blocked.
 */
export function validateInput(
  input: ChartAssemblyInput,
  options: DataSourceOptions = {},
): void {
  validateChartInput(resolveInput(input, options), undefined, CAPS);
}

/** Resolve `data.url` to inline rows so the core validator can see them. */
export function resolveInput(
  input: ChartAssemblyInput,
  options: DataSourceOptions = {},
): ChartAssemblyInput {
  if (input == null || typeof input !== 'object') {
    throw new Error('input must be a ChartAssemblyInput object');
  }
  const resolvedInput = resolveDataSource(input, {
    ...options,
    maxDataRows: MAX_DATA_ROWS,
  });
  // The core message assumes a host that never sees data.url; ours does.
  const data: any = (resolvedInput as any).data;
  if (data && typeof data === 'object' && !Array.isArray(data.values)) {
    throw new Error(
      'input.data must provide inline values or a readable local data.url',
    );
  }
  return resolvedInput;
}

/**
 * Resolve `data.url`, then assemble a Flint spec for one backend and split out
 * Flint's private metadata (`_warnings`, `_width`, `_height`). The returned
 * `spec` is left untouched so callers can choose to expose or strip the
 * private keys.
 */
export function assembleForBackend(
  backend: RenderBackend,
  input: ChartAssemblyInput,
  options: DataSourceOptions = {},
): AssembleResult {
  return coreAssembleForBackend(backend, resolveInput(input, options), CAPS);
}
