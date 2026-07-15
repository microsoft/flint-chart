// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Flint chart-option model for the gallery's dynamic options bar.
 *
 * Ported from the MCP App UI (`packages/flint-mcp/ui/src/options.ts`). Everything
 * here is derived from Flint's own metadata so the controls stay in lockstep
 * with the compiler:
 *   - chart properties -> getChartOptions(input) (cornerRadius, stack mode, ...)
 *   - encoding actions -> template.encodingActions (sort, ...)
 *
 * In the gallery this is used for DISPLAY ONLY: changing a control updates the
 * shown Flint spec JSON, it does not mutate any persisted state.
 */
import {
  getChartOptions,
  getChartPivot,
  resolveEncodingType,
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
import { BACKENDS, type PreviewBackend } from './supported-backends';

/** Control descriptor shared by chart properties and encoding actions. */
export type ControlSpec =
  | { type: 'continuous'; min: number; max: number; step?: number }
  | { type: 'discrete'; options: { value: unknown; label: string }[] }
  | { type: 'binary' };

/** A resolved encoding action ready for rendering (control + current value). */
export interface ResolvedAction {
  key: string;
  label: string;
  control: EncodingActionDef['control'];
  value: unknown;
}

/** Everything the options bar needs to render for the current input. */
export interface PanelModel {
  /** Applicable chart properties (continuous / discrete / binary controls). */
  properties: ChartOption[];
  /** Applicable encoding actions (e.g. Sort). */
  actions: ResolvedAction[];
  /** Cyclic pivot surface (alternative views), or undefined when single-view. */
  pivot?: PivotSurface;
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
function normalizeEncodings(
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

/**
 * Chart-property keys the given backend's template actually implements.
 *
 * The option list is derived from the Vega-Lite template (`getChartOptions`
 * assembles VL), but each backend template declares its own `properties` — a
 * *subset* of the knobs for that chart type (e.g. Chart.js `polarArea` has no
 * cutout, so a rose chart there can't do "Inner Radius" or "Gap"). We intersect
 * the shown controls with the selected backend's declared set, hiding dead
 * controls that would silently do nothing. Returns `null` when there is nothing
 * to narrow by (the backend template declares no properties → fall back to the
 * full VL list). For Vega-Lite itself this is a no-op: the option list already
 * *is* the VL template's properties, so the intersection keeps everything.
 */
function backendSupportedPropertyKeys(
  chartType: string,
  backend: PreviewBackend,
): Set<string> | null {
  const props = BACKENDS[backend].getTemplateDef(chartType)?.properties;
  if (!props || props.length === 0) return null;
  return new Set(props.map((p) => p.key));
}

/** Build the option model (properties + encoding actions) for the input. */
export function buildPanelModel(
  input: ChartAssemblyInput,
  backend: PreviewBackend = 'vegalite',
): PanelModel {
  const def = vlGetTemplateDef(input.chart_spec.chartType);

  let properties: ChartOption[] = [];
  try {
    properties = getChartOptions(input).filter((o) => o.applicable);
  } catch {
    properties = [];
  }

  // Non-Vega-Lite backends only honor a subset of the VL properties; drop the
  // controls the selected backend's template doesn't implement so the options
  // bar never shows a knob that does nothing.
  const supported = backendSupportedPropertyKeys(input.chart_spec.chartType, backend);
  if (supported) {
    properties = properties.filter((o) => supported.has(o.key));
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

  return { properties, actions, pivot };
}
