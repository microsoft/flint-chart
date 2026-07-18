// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { z } from 'zod';
import type { ChartAssemblyInput } from 'flint-chart';

/** The three backends this server can compile, validate, and render. */
export const SUPPORTED_BACKENDS = ['vegalite', 'echarts', 'chartjs'] as const;
export type SupportedBackend = (typeof SUPPORTED_BACKENDS)[number];

/**
 * Build the `data` source schema. When `disableFileReference` is set (e.g. on a
 * remote/hosted server) the field descriptions tell the agent NOT to use
 * `data.url` and to pass rows inline via `data.values`, so the guidance lives
 * right next to where the argument is authored.
 */
export function makeDataSchema(disableFileReference = false) {
  return z
    .object({
      values: z
        .array(z.record(z.string(), z.any()))
        .optional()
        .describe(
          disableFileReference
            ? 'Inline data rows (array of row objects), like Vega-Lite data.values. ' +
                'REQUIRED on this server: the only supported way to provide data.'
            : 'Inline data rows (array of row objects), like Vega-Lite data.values.',
        ),
      url: z
        .string()
        .optional()
        .describe(
          disableFileReference
            ? 'DISABLED on this server — do NOT set. This server cannot read local ' +
                'files; provide the rows inline via `values` instead. Remote URLs are ' +
                'never fetched.'
            : 'Local JSON/CSV/TSV file path (relative paths resolve against the working ' +
                'directory; file:// URLs allowed). Remote URLs are not fetched.',
        ),
    })
    .describe(
      disableFileReference
        ? 'Data source. Provide rows inline via `values`. Local file `url` references ' +
            'are disabled on this server.'
        : 'Data source. Provide inline `values`, or a local file `url`.',
    );
}

/** Default data schema (local file references allowed). */
export const dataSchema = makeDataSchema(false);

export const chartSpecSchema = z
  .object({
    chartType: z
      .string()
      .describe('Chart template name, e.g. "Bar Chart", "Scatter Plot", "Heatmap".'),
    encodings: z
      .record(z.string(), z.any())
      .describe(
        'Channel → encoding map, e.g. { x: { field: "region" }, y: { field: "revenue" } }. A bare string is shorthand for { field: "..." }.',
      ),
    baseSize: z
      .object({ width: z.number(), height: z.number() })
      .optional()
      .describe(
        'Target canvas size in px (default 400×320). Flint\'s layout model stretches around this base up to the ceiling.',
      ),
    canvasSize: z
      .object({ width: z.number(), height: z.number() })
      .optional()
      .describe(
        'Optional hard ceiling in px. Caps how far the chart may stretch beyond baseSize. When omitted, the cap is baseSize × the maxStretch option (default 2×).',
      ),
    chartProperties: z
      .record(z.string(), z.any())
      .optional()
      .describe('Template-specific properties (e.g. bar corner radius, show labels).'),
  })
  .describe('What to draw.');

/**
 * The five fields of a {@link ChartAssemblyInput}, expressed as a flat MCP tool
 * parameter shape so each part is self-documenting in the JSON schema.
 */
export function buildAssemblyInputShape(disableFileReference = false) {
  return {
    data: makeDataSchema(disableFileReference),
    semantic_types: z
      .record(z.string(), z.any())
      .optional()
      .describe(
        'Field name → semantic type, e.g. { revenue: "Quantity", country: "Country" }. ' +
          'An entry may also be an annotation object { semanticType, unit, intrinsicDomain }: ' +
          '{ revenue: { semanticType: "Price", unit: "USD" } } adds a currency symbol to axis labels; ' +
          '{ share: { semanticType: "Percentage", intrinsicDomain: [0, 1] } } formats values as percentages.',
      ),
    chart_spec: chartSpecSchema,
    options: z
      .record(z.string(), z.any())
      .optional()
      .describe('Assembler options (e.g. { addTooltips: true } and layout tuning).'),
    field_display_names: z
      .record(z.string(), z.string())
      .optional()
      .describe('Field name → display label, used for axis titles and legend headers.'),
  };
}

/** Default flat tool parameter shape (local file references allowed). */
export const assemblyInputShape = buildAssemblyInputShape(false);

export type AssemblyInputArgs = {
  data: { values?: unknown[]; url?: string };
  semantic_types?: Record<string, unknown>;
  chart_spec: {
    chartType: string;
    encodings: Record<string, unknown>;
    baseSize?: { width: number; height: number };
    canvasSize?: { width: number; height: number };
    chartProperties?: Record<string, unknown>;
  };
  options?: Record<string, unknown>;
  field_display_names?: Record<string, string>;
};

/** Reassemble the flat tool args into a {@link ChartAssemblyInput} object. */
export function toAssemblyInput(args: AssemblyInputArgs): ChartAssemblyInput {
  return {
    data: args.data,
    semantic_types: args.semantic_types,
    chart_spec: args.chart_spec,
    options: args.options,
    field_display_names: args.field_display_names,
  } as ChartAssemblyInput;
}
