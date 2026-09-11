// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  validateChart as coreValidateChart,
  type ChartAssemblyInput,
  type ValidateResult,
} from 'flint-chart';
import { INPUT_CAPS, resolveInput } from '../render/assemble.js';
import type { DataSourceOptions } from '../render/data-source.js';
import type { RenderBackend } from '../render/types.js';

export type { ValidateResult };

/**
 * Resolve `data.url`, then validate a {@link ChartAssemblyInput} for a backend
 * via `flint-chart`'s `validateChart`. Never throws — data-source and assembly
 * failures are surfaced as an error entry.
 */
export function validateChart(
  input: ChartAssemblyInput,
  backend: RenderBackend,
  options: DataSourceOptions = {},
): ValidateResult {
  let resolvedInput: ChartAssemblyInput;
  try {
    resolvedInput = resolveInput(input, options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      backend,
      chartType: input?.chart_spec?.chartType ?? '(unknown)',
      valid: false,
      warnings: [],
      errors: [{ severity: 'error', code: 'assembly_failed', message }],
    };
  }
  return coreValidateChart(resolvedInput, backend, INPUT_CAPS);
}
