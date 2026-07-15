// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Flint chart-option model for the customization panel.
 *
 * Everything here is derived from Flint's own metadata so the panel stays in
 * lockstep with the compiler:
 *   - chart types & channels  -> vlAllTemplateDefs / vlGetTemplateDef
 *   - chart properties        -> getChartOptions(input)  (cornerRadius, stack
 *                                mode, donut hole, interpolate, log scale, ...)
 *   - encoding actions        -> template.encodingActions (sort, ...)
 *
 * This mirrors the model Data Formulator consumes, restricted to Flint options.
 */
import {
  getChartOptions,
  getChartPivot,
  resolveEncodingType,
  vlAllTemplateDefs,
  vlGetTemplateDef,
} from 'flint-chart';
import type {
  ChartAssemblyInput,
  ChartEncoding,
  ChartOption,
  EncodingActionDef,
  PivotSurface,
  RawEncodingValue,
} from 'flint-chart';

/** A resolved encoding action ready for rendering (control + current value). */
export interface ResolvedAction {
  key: string;
  label: string;
  control: EncodingActionDef['control'];
  value: unknown;
}

/** Everything the panel needs to render for the current input. */
export interface PanelModel {
  chartTypes: string[];
  /** Channels accepted by the current chart type (e.g. x, y, color). */
  channels: string[];
  /** Current channel -> field binding (undefined = unbound). */
  bindings: Record<string, string | undefined>;
  /** Applicable chart properties (continuous / discrete / binary controls). */
  properties: ChartOption[];
  /** Applicable encoding actions (e.g. Sort). */
  actions: ResolvedAction[];
  /** Cyclic pivot surface (alternative views), or undefined when single-view. */
  pivot?: PivotSurface;
}

/** Sorted list of every available Vega-Lite chart type. */
export function allChartTypes(): string[] {
  return vlAllTemplateDefs
    .map((d) => d.chart)
    .sort((a, b) => a.localeCompare(b));
}

/** Union of column names across all data rows. */
export function dataColumns(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  for (const row of rows ?? []) {
    for (const key of Object.keys(row ?? {})) seen.add(key);
  }
  return [...seen];
}

/** Extract the bound field name from a raw encoding value (shorthand-aware). */
function rawField(value: RawEncodingValue | undefined): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return undefined; // static series — not edited here
  return (value as ChartEncoding).field;
}

/** Pull the semantic-type string for a field, if annotated. */
function semanticTypeOf(input: ChartAssemblyInput, field: string): string {
  const st = input.semantic_types?.[field];
  if (!st) return '';
  return typeof st === 'string' ? st : ((st as { type?: string }).type ?? '');
}

/**
 * Normalize the user's raw encodings into `ChartEncoding` objects with a
 * resolved Vega type, so encoding actions (which read `enc.type`) work without
 * re-running the full assembler. Only bound channels are included.
 */
export function normalizeEncodings(
  input: ChartAssemblyInput,
): Record<string, ChartEncoding> {
  const rows = input.data?.values ?? [];
  const out: Record<string, ChartEncoding> = {};
  for (const [channel, raw] of Object.entries(input.chart_spec.encodings ?? {})) {
    const field = rawField(raw);
    if (!field) continue;
    const base: ChartEncoding =
      typeof raw === 'string' ? { field } : { ...(raw as ChartEncoding) };
    if (!base.type) {
      try {
        const values = rows.map((r) => r[field]);
        const decision = resolveEncodingType(
          semanticTypeOf(input, field),
          values,
          channel,
          rows,
          field,
        ) as { vlType?: ChartEncoding['type'] };
        if (decision?.vlType) base.type = decision.vlType;
      } catch {
        /* leave type unset on failure */
      }
    }
    out[channel] = base;
  }
  return out;
}

/** Current value of an encoding action: explicit override, else derived. */
function actionValue(
  input: ChartAssemblyInput,
  action: EncodingActionDef,
  encodings: Record<string, ChartEncoding>,
): unknown {
  const override = input.chart_spec.chartProperties?.[action.key];
  if (override !== undefined) return override;
  try {
    return action.get(encodings);
  } catch {
    return undefined;
  }
}

/** Build the full panel model for the current input. */
export function buildPanelModel(input: ChartAssemblyInput): PanelModel {
  const def = vlGetTemplateDef(input.chart_spec.chartType);
  const channels = def?.channels ?? [];

  const bindings: Record<string, string | undefined> = {};
  for (const channel of channels) {
    bindings[channel] = rawField(input.chart_spec.encodings?.[channel]);
  }

  let properties: ChartOption[] = [];
  try {
    properties = getChartOptions(input).filter((o) => o.applicable);
  } catch {
    properties = [];
  }

  const encodings = normalizeEncodings(input);
  const ctx = {
    encodings,
    data: input.data?.values ?? [],
    chartProperties: input.chart_spec.chartProperties,
  };
  const actions: ResolvedAction[] = (def?.encodingActions ?? [])
    .filter((a) => (a.isApplicable ? a.isApplicable(ctx) : true))
    .map((a) => ({
      key: a.key,
      label: a.label,
      control: a.control,
      value: actionValue(input, a, encodings),
    }));

  let pivot: PivotSurface | undefined;
  try {
    pivot = getChartPivot(input);
  } catch {
    pivot = undefined;
  }

  return { chartTypes: allChartTypes(), channels, bindings, properties, actions, pivot };
}

// ---------------------------------------------------------------------------
// Immutable edit helpers — each returns a new ChartAssemblyInput.
// ---------------------------------------------------------------------------

function cloneInput(input: ChartAssemblyInput): ChartAssemblyInput {
  return {
    ...input,
    chart_spec: {
      ...input.chart_spec,
      encodings: { ...(input.chart_spec.encodings ?? {}) },
      chartProperties: { ...(input.chart_spec.chartProperties ?? {}) },
    },
  };
}

/** Switch the chart type, keeping compatible encodings and clearing properties. */
export function setChartType(
  input: ChartAssemblyInput,
  chartType: string,
): ChartAssemblyInput {
  const next = cloneInput(input);
  next.chart_spec.chartType = chartType;
  // Properties are template-specific; drop them so stale keys don't linger.
  next.chart_spec.chartProperties = {};
  return next;
}

/** Bind (or clear, when field is undefined) a channel to a field. */
export function setChannelField(
  input: ChartAssemblyInput,
  channel: string,
  field: string | undefined,
): ChartAssemblyInput {
  const next = cloneInput(input);
  if (!field) {
    delete next.chart_spec.encodings[channel];
  } else {
    const prev = next.chart_spec.encodings[channel];
    next.chart_spec.encodings[channel] =
      prev && typeof prev === 'object' && !Array.isArray(prev)
        ? { ...(prev as ChartEncoding), field }
        : { field };
  }
  return next;
}

/**
 * Set (or reset, when value is undefined) a chart property or encoding-action
 * override. Both are stored under `chart_spec.chartProperties[key]`.
 */
export function setProperty(
  input: ChartAssemblyInput,
  key: string,
  value: unknown,
): ChartAssemblyInput {
  const next = cloneInput(input);
  if (value === undefined) {
    delete next.chart_spec.chartProperties![key];
  } else {
    next.chart_spec.chartProperties![key] = value;
  }
  return next;
}
