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

export interface ValidatedChart {
  result: ValidateResult;
  /** The input with `data.url` read into `data.values`; the input as given when that failed. */
  input: ChartAssemblyInput;
}

/**
 * Resolve `data.url`, then validate a {@link ChartAssemblyInput} for a backend
 * via `flint-chart`'s `validateChart`, with `updates` checked against the chart.
 * Never throws — data-source and assembly failures are surfaced as an error entry.
 */
export function validateChart(
  input: ChartAssemblyInput,
  backend: RenderBackend,
  options: DataSourceOptions & { updates?: unknown } = {},
): ValidatedChart {
  const { updates, ...sources } = options;
  let resolvedInput: ChartAssemblyInput;
  try {
    resolvedInput = resolveInput(input, sources);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      input,
      result: {
        backend,
        chartType: input?.chart_spec?.chartType ?? '(unknown)',
        valid: false,
        warnings: [],
        errors: [{ severity: 'error', code: 'assembly_failed', message }],
      },
    };
  }
  return { input: resolvedInput, result: coreValidateChart(resolvedInput, backend, { ...INPUT_CAPS, updates }) };
}
