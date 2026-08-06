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
  getChartTransform,
  resolveEncodingType,
  TRANSFORM_CHART_TYPE_KEY,
} from 'flint-chart';
import type {
  ChartAssemblyInput,
  ChartEncoding,
  ChartOption,
  ChartPropertyDef,
  EncodingActionDef,
  PivotSurface,
  RawEncodingValue,
} from 'flint-chart';
import { BACKENDS, type PreviewBackend } from './supported-backends';
import { themeOwnsContinuousColor } from './theme-color';

/** Control descriptor shared by chart properties and encoding actions. */
export type ControlSpec =
  | { type: 'continuous'; min: number; max: number; step?: number }
  | { type: 'discrete'; options: { value: unknown; label: string }[] }
  | { type: 'binary' };

/** Stable string key for an arbitrary option value (handles undefined/objects). */
export function valueKey(value: unknown): string {
  return JSON.stringify(value ?? null);
}

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
  /** Control B — chart-type transitions (θ), or undefined when no siblings. */
  chartType?: PivotSurface;
  /** Control A — local rearrangement group (τ/σ/γ), or undefined when trivial. */
  arrange?: PivotSurface;
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
 * Effective chart type for controls: honor a gallery chart-type override
 * (`chartProperties.chartType = 'type:Strip Plot'`) so properties/actions match
 * what assemble will actually render after applyTransform.
 */
function effectiveChartType(input: ChartAssemblyInput): string {
  const raw = input.chart_spec.chartProperties?.[TRANSFORM_CHART_TYPE_KEY];
  if (typeof raw === 'string' && raw.startsWith('type:') && raw.length > 5) {
    return raw.slice('type:'.length);
  }
  return input.chart_spec.chartType;
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

/**
 * Narrow a discrete ChartOption's value list to what the selected backend
 * template actually accepts. Without this, VL-only Curve tokens (e.g. `basis`)
 * appear in the gallery for ECharts/Chart.js/Plotly, then
 * `normalizeChartProperties` silently drops them and the chart never changes.
 */
function alignDiscreteOptionsToBackend(
  option: ChartOption,
  backendProps: ChartPropertyDef[] | undefined,
): ChartOption {
  if (option.type !== 'discrete' || !backendProps) return option;
  const def = backendProps.find((p) => p.key === option.key);
  if (!def || def.type !== 'discrete' || !def.options?.length) return option;
  return {
    ...option,
    options: def.options.map((o) => ({
      value: o.value,
      label: o.label ?? (o.value == null ? 'Default' : String(o.value)),
    })),
  };
}

/** Build the option model (properties + encoding actions) for the input. */
export function buildPanelModel(
  input: ChartAssemblyInput,
  backend: PreviewBackend = 'vegalite',
): PanelModel {
  const chartType = effectiveChartType(input);
  const backendDef = BACKENDS[backend].getTemplateDef(chartType);
  // Fall back to VL actions only when the selected backend has no template for
  // this type (shouldn't happen for gallery tiles, but keeps the bar usable).
  const actionSource = backendDef ?? BACKENDS.vegalite.getTemplateDef(chartType);

  let properties: ChartOption[] = [];
  try {
    properties = getChartOptions(input).filter((o) => o.applicable);
  } catch {
    properties = [];
  }

  // Non-Vega-Lite backends only honor a subset of the VL properties; drop the
  // controls the selected backend's template doesn't implement so the options
  // bar never shows a knob that does nothing. `facetColumns` is exempt: it is a
  // LAYOUT-level control (facet wrap) honored by every backend's assembler, not
  // a per-template mark property, so it never appears in a template's own list.
  const supported = backendSupportedPropertyKeys(chartType, backend);
  if (supported) {
    properties = properties.filter((o) => o.key === 'facetColumns' || supported.has(o.key));
  }
  // Also replace discrete option lists with the backend's accepted values so
  // Curve / stackMode / etc. can't offer tokens normalizeChartProperties drops.
  const backendProps = backendDef?.properties;
  if (backend !== 'vegalite' && backendProps) {
    properties = properties.map((o) => alignDiscreteOptionsToBackend(o, backendProps));
  }

  const encodings = normalizeEncodings(input);
  const ctx = {
    encodings,
    data: input.data?.values ?? [],
    chartProperties: input.chart_spec.chartProperties,
  };
  const actions: ResolvedAction[] = (actionSource?.encodingActions ?? [])
    .filter((action) => !(
      backend === 'vegalite'
      && themeOwnsContinuousColor(input.theme_spec)
      && action.key === 'colorScheme'
    ))
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

  // Factored two-control transform surfaces (chart type = θ, arrange = τ/σ/γ).
  let chartTypeSurface: PivotSurface | undefined;
  let arrange: PivotSurface | undefined;
  try {
    const transform = getChartTransform(input);
    chartTypeSurface = transform?.chartType;
    arrange = transform?.arrange;
  } catch {
    chartTypeSurface = undefined;
    arrange = undefined;
  }

  return { properties, actions, pivot, chartType: chartTypeSurface, arrange };
}

/**
 * Drop the option overrides that only restate what the chart would have chosen
 * anyway.
 *
 * A control the reader nudged and a control that happens to sit where it was
 * put are stored the same way — as an explicit value — so once written, a value
 * outranks every house forever. That is right when it is a decision and wrong
 * when it is an echo, and after a theme change the difference is visible: the
 * reader picks a house whose line carries points and gets a bare line, because
 * a `showPoints: false` identical to the old house's default is still sitting
 * there outranking it.
 *
 * A value that agrees with what the chart would have done unaided says nothing,
 * so it is not carried across a house change. Anything that disagrees is a real
 * choice and stays.
 */
export function withoutEchoedOverrides(
  input: ChartAssemblyInput,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const keys = Object.keys(overrides ?? {});
  if (!keys.length) return overrides;
  const stated = { ...(input.chart_spec.chartProperties ?? {}), ...overrides };
  const kept: Record<string, unknown> = {};
  for (const key of keys) {
    const rest = { ...stated };
    delete rest[key];
    const unaided = {
      ...input,
      chart_spec: { ...input.chart_spec, chartProperties: rest },
    } as ChartAssemblyInput;
    let fallback: unknown;
    try {
      fallback = getChartOptions(unaided).find((option) => option.key === key)?.value;
    } catch {
      // The chart does not compile without it — not ours to judge; keep it.
      fallback = undefined;
    }
    if (fallback === undefined || valueKey(fallback) !== valueKey(overrides[key])) {
      kept[key] = overrides[key];
    }
  }
  return kept;
}
