// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * @module flint-chart/validate
 *
 * Backend-aware validation of {@link ChartAssemblyInput} for hosts that let an
 * agent author chart inputs and need precise, per-problem feedback before
 * anything renders. Pure JS — no file system or native dependencies. Inline
 * `data.values` are required; hosts resolve `data.url` to rows themselves.
 *
 * ```ts
 * import { validateChart } from 'flint-chart/validate';
 *
 * const result = validateChart(input, 'vegalite');
 * if (!result.valid) console.log(result.errors);
 * ```
 */

import type {
    ChartAssemblyInput,
    ChartEncoding,
    ChartTemplateDef,
    ChartWarning,
} from '../core/types';
import { isRegistered } from '../core/type-registry';
import { toTypeString } from '../core/field-semantics';
import { assembleVegaLite } from '../vegalite/assemble';
import { vlGetTemplateDef } from '../vegalite/templates';
import { assembleECharts } from '../echarts/assemble';
import { ecGetTemplateDef } from '../echarts/templates';
import { assembleChartjs } from '../chartjs/assemble';
import { cjsGetTemplateDef } from '../chartjs/templates';
import { assemblePlotly } from '../plotly/assemble';
import { plGetTemplateDef } from '../plotly/templates';

/** Backends whose inputs can be validated and assembled. */
export type ValidationBackend = 'vegalite' | 'echarts' | 'chartjs' | 'plotly';

export const VALIDATION_BACKENDS: readonly ValidationBackend[] = [
    'vegalite',
    'echarts',
    'chartjs',
    'plotly',
];

/** Default cap on inline data rows. */
export const DEFAULT_MAX_DATA_ROWS = 100_000;

/** Default cap on `baseSize` / `canvasSize` dimensions in pixels. */
export const DEFAULT_MAX_CANVAS_DIM = 4000;

export interface ValidateChartOptions {
    /** Maximum number of inline data rows accepted. Default: 100,000. */
    maxDataRows?: number;
    /** Maximum `baseSize` / `canvasSize` dimension in pixels. Default: 4000. */
    maxCanvasDim?: number;
}

export interface AssembleResult {
    /** The backend-native spec (still carrying Flint's private `_`-keys). */
    spec: any;
    /** Warnings emitted by the assembler. */
    warnings: ChartWarning[];
    /** Computed subplot width from the stretch model, if present. */
    width?: number;
    /** Computed subplot height from the stretch model, if present. */
    height?: number;
}

export interface ValidateResult {
    backend: ValidationBackend;
    chartType: string;
    /** True when assembly succeeded with no error-severity warnings. */
    valid: boolean;
    /** All warnings (info/warning/error) emitted during validation and assembly. */
    warnings: ChartWarning[];
    /** Error-severity warnings plus any thrown assembly failure. */
    errors: ChartWarning[];
    /** Computed layout size from Flint's stretch model, if available. */
    computedSize?: { width: number; height: number };
}

const ASSEMBLERS: Record<ValidationBackend, (input: ChartAssemblyInput) => any> = {
    vegalite: assembleVegaLite,
    echarts: assembleECharts,
    chartjs: assembleChartjs,
    plotly: assemblePlotly,
};

const TEMPLATE_LOOKUP: Record<
    ValidationBackend,
    (chartType: string) => ChartTemplateDef | undefined
> = {
    vegalite: vlGetTemplateDef,
    echarts: ecGetTemplateDef,
    chartjs: cjsGetTemplateDef,
    plotly: plGetTemplateDef,
};

/**
 * Validate the shape of a {@link ChartAssemblyInput} before it reaches an
 * assembler: data presence, row shape and caps, `chartType`, encodings against the
 * backend's template (channel support, required channels, field existence),
 * and canvas caps. Throws on the first problem found. When `backend` is given
 * and the chart type is unknown to that backend, encoding checks are skipped
 * so the assembler reports the unknown type.
 */
export function validateChartInput(
    input: ChartAssemblyInput,
    backend?: ValidationBackend,
    options: ValidateChartOptions = {},
): void {
    if (!isRecord(input)) {
        throw new Error('input must be a ChartAssemblyInput object');
    }
    const rows = validateData(input.data, options.maxDataRows ?? DEFAULT_MAX_DATA_ROWS);
    const chartSpec = input.chart_spec;
    if (!isRecord(chartSpec) || typeof chartSpec.chartType !== 'string') {
        throw new Error('input.chart_spec.chartType is required');
    }
    validateEncodings(chartSpec.chartType, chartSpec.encodings, rows, backend);
    validateCanvasCaps(chartSpec, options.maxCanvasDim ?? DEFAULT_MAX_CANVAS_DIM);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object' && !Array.isArray(value);
}

function validateData(data: unknown, maxDataRows: number): Record<string, unknown>[] {
    if (!isRecord(data)) {
        throw new Error('input.data is required (provide { values: [...] })');
    }
    const rows = data.values;
    if (!Array.isArray(rows)) {
        throw new Error('input.data must provide inline values');
    }
    if (typeof data.url === 'string') {
        throw new Error('input.data must provide either values or url, not both');
    }
    if (rows.length > maxDataRows) {
        throw new Error(
            `input.data.values has ${rows.length} rows, exceeding the limit of ${maxDataRows}`,
        );
    }
    if (rows.length === 0) {
        throw new Error('input.data.values must contain at least one row');
    }
    for (const [index, row] of rows.entries()) {
        if (!isRecord(row)) {
            throw new Error(`data row ${index + 1} must be an object`);
        }
    }
    return rows;
}

function validateEncodings(
    chartType: string,
    encodings: unknown,
    rows: Record<string, unknown>[],
    backend?: ValidationBackend,
): void {
    if (!isRecord(encodings)) {
        throw new Error('input.chart_spec.encodings must be a channel-to-encoding object');
    }
    const entries = Object.entries(encodings);
    if (entries.length === 0) {
        throw new Error('input.chart_spec.encodings must bind at least one channel');
    }

    if (backend) {
        const template = TEMPLATE_LOOKUP[backend]?.(chartType);
        if (!template) return;
        validateEncodingsAgainstTemplate(chartType, backend, template, encodings);
    }

    const dataFields = new Set(rows.flatMap((row) => Object.keys(row)));
    for (const [channel, encoding] of entries) {
        for (const field of encodingFields(encoding)) {
            if (!dataFields.has(field)) {
                throw new Error(
                    `chart_spec.encodings.${channel}.field "${field}" does not exist in data.values`,
                );
            }
        }
    }
}

function validateEncodingsAgainstTemplate(
    chartType: string,
    backend: ValidationBackend,
    template: ChartTemplateDef,
    encodings: Record<string, unknown>,
): void {
    const allowed = new Set(template.channels ?? []);
    for (const channel of Object.keys(encodings)) {
        if (!allowed.has(channel)) {
            throw new Error(
                `chart_spec.encodings.${channel} is not supported by ${chartType} for ${backend}`,
            );
        }
    }
    for (const channel of requiredChannels(template)) {
        if (!hasEncodingBinding(encodings[channel])) {
            throw new Error(`chart_spec.encodings.${channel} is required for ${chartType}`);
        }
    }
}

function validateCanvasCaps(chartSpec: Record<string, unknown>, maxCanvasDim: number): void {
    for (const field of ['baseSize', 'canvasSize'] as const) {
        const size = chartSpec[field];
        if (!isRecord(size)) continue;
        const { width, height } = size;
        if (
            (typeof width === 'number' && width > maxCanvasDim) ||
            (typeof height === 'number' && height > maxCanvasDim)
        ) {
            throw new Error(
                `chart_spec.${field} exceeds the maximum dimension of ${maxCanvasDim}px`,
            );
        }
    }
}

function requiredChannels(template: ChartTemplateDef): string[] {
    const channels = template.channels ?? [];
    if (channels.includes('x') && channels.includes('y')) return ['x', 'y'];
    if (template.chart === 'KPI Card') return ['metric', 'value'];
    return [];
}

function hasEncodingBinding(value: unknown): boolean {
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.some(hasEncodingBinding);
    if (value && typeof value === 'object') {
        const encoding = value as ChartEncoding;
        return (
            (typeof encoding.field === 'string' && encoding.field.trim().length > 0) ||
            encoding.aggregate === 'count'
        );
    }
    return false;
}

function encodingFields(value: unknown): string[] {
    if (typeof value === 'string') return value.trim() ? [value] : [];
    if (Array.isArray(value)) return value.flatMap(encodingFields);
    if (value && typeof value === 'object') {
        const field = (value as ChartEncoding).field;
        return typeof field === 'string' && field.trim() ? [field] : [];
    }
    return [];
}

/**
 * Report `semantic_types` labels that are not in Flint's type registry as
 * `unknown_semantic_type` warnings. Unregistered labels are not an error —
 * assembly falls back to inferring from the data — but a host that expects
 * the registry to be honored can use this to catch typos and drift.
 */
export function validateSemanticTypes(
    semanticTypes: ChartAssemblyInput['semantic_types'] | undefined,
): ChartWarning[] {
    if (!isRecord(semanticTypes)) return [];
    const warnings: ChartWarning[] = [];
    for (const [field, annotation] of Object.entries(semanticTypes)) {
        const semanticType = toTypeString(annotation);
        if (!semanticType || !isRegistered(semanticType)) {
            warnings.push({
                severity: 'warning',
                code: 'unknown_semantic_type',
                message: `semantic_types.${field} "${semanticType}" is not a registered semantic type; the field's type will be inferred from the data`,
                field,
            });
        }
    }
    return warnings;
}

/**
 * Validate and assemble a Flint spec for one backend, splitting out Flint's
 * private metadata (`_warnings`, `_width`, `_height`). The returned `spec` is
 * left untouched so callers can choose to expose or strip the private keys
 * (see {@link stripPrivateKeys}). Throws on validation or assembly failure.
 */
export function assembleForBackend(
    backend: ValidationBackend,
    input: ChartAssemblyInput,
    options: ValidateChartOptions = {},
): AssembleResult {
    const assemble = ASSEMBLERS[backend];
    if (!assemble) {
        throw new Error(`unknown backend: ${backend}`);
    }
    validateChartInput(input, backend, options);
    const spec = assemble(input);
    const warnings: ChartWarning[] = Array.isArray(spec?._warnings) ? spec._warnings : [];
    const width = typeof spec?._width === 'number' ? spec._width : undefined;
    const height = typeof spec?._height === 'number' ? spec._height : undefined;
    return { spec, warnings, width, height };
}

/**
 * Validate a {@link ChartAssemblyInput} for a backend: report warnings/errors,
 * applicability, and the computed layout size. Never throws — validation and
 * assembly failures are surfaced as an error entry. Unregistered
 * `semantic_types` labels are included as warnings (see
 * {@link validateSemanticTypes}) and do not affect `valid`.
 */
export function validateChart(
    input: ChartAssemblyInput,
    backend: ValidationBackend,
    options: ValidateChartOptions = {},
): ValidateResult {
    const chartType = typeof input?.chart_spec?.chartType === 'string'
        ? input.chart_spec.chartType
        : '(unknown)';
    const semanticTypeWarnings = validateSemanticTypes(input?.semantic_types);
    try {
        const { warnings, width, height } = assembleForBackend(backend, input, options);
        const all = [...warnings, ...semanticTypeWarnings];
        const errors = all.filter((w) => w.severity === 'error');
        return {
            backend,
            chartType,
            valid: errors.length === 0,
            warnings: all,
            errors,
            computedSize:
                width !== undefined && height !== undefined ? { width, height } : undefined,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            backend,
            chartType,
            valid: false,
            warnings: semanticTypeWarnings,
            errors: [{ severity: 'error', code: 'assembly_failed', message }],
        };
    }
}

/**
 * Remove Flint's private `_`-prefixed annotation keys from a top-level spec
 * object so it is render-ready and safe to surface to callers.
 */
export function stripPrivateKeys<T extends Record<string, any>>(spec: T): T {
    for (const key of Object.keys(spec)) {
        if (key.startsWith('_')) {
            delete (spec as Record<string, any>)[key];
        }
    }
    return spec;
}
