// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * @module flint-chart/canvasxpress
 *
 * CanvasXpress backend for flint-chart.
 *
 * Compiles the core semantic layer into a CanvasXpress render spec
 * ({ graphType, data, config }) — the object passed to `new CanvasXpress(...)`.
 *
 * Architecture note (cf. echarts/index.ts):
 *   VL: encoding-channel-based — { encoding: { x: {...}, y: {...} } }
 *   EC: series-based           — { series: [{ type, data }], xAxis, yAxis }
 *   CX: matrix-based           — { data: { y: { vars, smps, data } }, config }
 *
 * Same core pipeline (Phase 0 semantic resolution + Phase 1 layout); the
 * CanvasXpress-specific work is confined to Phase 2 (template.instantiate),
 * which fills the y-matrix and config block.
 *
 * SCOPE: the shared pre-phase / Phase 0 / Phase 1 orchestration and template
 * instantiation. Faceting (column/row small multiples) is handled inside each
 * template through CanvasXpress's own panel layout, not by a multi-grid combiner
 * here. Deliberately DEFERRED to follow-up PRs, with markers below, are: the
 * canvas-fit refit loop, authored-color-scale application, overflow filtering,
 * and display-name framing. Each is isolated so this file stays reviewable.
 */

import {
    ChartAssemblyInput,
    AssembleOptions,
    LayoutDeclaration,
    InstantiateContext,
} from '../core/types';
import { cxGetTemplateDef } from './templates';
import { resolveChannelSemantics, convertTemporalData } from '../core/resolve-semantics';
import { computeLayout, resolveBaseSize } from '../core/compute-layout';
import { normalizeStaticSeries } from '../core/static-series';
import { CanvasXpressSpec } from './spec';

/**
 * Assemble a CanvasXpress render spec from the core semantic input.
 *
 * @param input The backend-agnostic chart assembly input (see core/types.ts).
 * @returns A CanvasXpressSpec: { graphType, data, config } ready for `new CanvasXpress(...)`.
 * @public
 */
export function assembleCanvasXpress(input: ChartAssemblyInput): CanvasXpressSpec {
    const chartType = input.chart_spec.chartType;

    const template = cxGetTemplateDef(chartType);
    if (!template) {
        throw new Error(
            `Unknown CanvasXpress chart type: ${chartType}. Use cxAllTemplateDefs to see available types.`,
        );
    }

    const semanticTypes = input.semantic_types ?? {};
    const options = input.options ?? {};
    const chartProperties = input.chart_spec.chartProperties ?? {};

    // Resolve the designed size the same way the other backends do.
    const sizeCeiling = input.chart_spec.canvasSize;
    const baseSize = resolveBaseSize(input.chart_spec.baseSize, sizeCeiling);
    const canvasSize = baseSize;

    const rawData = input.data.values ?? [];

    // ── PRE-PHASE: Normalize encodings ────────────────────────────────────
    // Expand bare-string channel shorthands ({ x: "weight" } → { x: { field } })
    // and fold any array-valued (static-series) encodings into rows, so the rest
    // of the pipeline only ever sees full ChartEncoding objects. Mirrors the
    // ECharts assembler's normalizeStaticSeries step.
    const normalized = normalizeStaticSeries(
        input.chart_spec.encodings,
        rawData,
        semanticTypes,
        template.chart,
    );
    const encodings = normalized.encodings;
    const data = normalized.data;
    const staticSeries = normalized.staticSeries;

    // ── PHASE 0: Resolve semantics (shared, target-agnostic) ──────────────
    // Temporal fields are converted once and threaded through, exactly as the
    // ECharts assembler does, so category detection and layout agree.
    const convertedData = convertTemporalData(data, semanticTypes);
    const channelSemantics = resolveChannelSemantics(
        encodings,
        data,
        semanticTypes,
        convertedData,
        { chartType: template.chart },
    );

    // ── STEP 0a: declareLayoutMode (shared hook) ──────────────────────────
    const declaration: LayoutDeclaration = template.declareLayoutMode
        ? template.declareLayoutMode(channelSemantics, data, chartProperties)
        : {};

    const effectiveOptions: AssembleOptions = {
        ...options,
        ...(declaration.paramOverrides || {}),
    };

    // NOTE (deferred): the ECharts backend runs computeChannelBudgets +
    // filterOverflow between Phase 0 and Phase 1 to cap discrete cardinality.
    // CanvasXpress renders its own scrollable/zoomable axes, so overflow
    // filtering is lower priority for the first PR; `convertedData` is used
    // directly as the table. Revisit if gallery matrices overplot.
    const table = convertedData;

    // ── PHASE 1: Compute layout (shared, target-agnostic) ─────────────────
    const layout = computeLayout(
        channelSemantics,
        declaration,
        table,
        canvasSize,
        effectiveOptions,
        undefined, // facetGrid — unused: templates facet through the engine's panel layout
    );

    // ── PHASE 2: Instantiate (CanvasXpress-specific) ──────────────────────
    // The template seed clones into the working spec, then instantiate()
    // mutates it in place — same contract as the ECharts backend.
    const spec: CanvasXpressSpec = structuredClone(template.template) as CanvasXpressSpec;

    const ctx: InstantiateContext = {
        channelSemantics,
        layout,
        table,
        fullTable: convertedData,
        resolvedEncodings: {}, // CX reads channelSemantics directly; no VL-style resolve needed yet
        encodings,
        chartProperties,
        staticSeries,
        canvasSize,
        semanticTypes,
        chartType,
    };

    template.instantiate(spec, ctx);

    if (template.postProcess) {
        template.postProcess(spec, ctx);
    }

    // DEFERRED to follow-up PRs (kept as explicit seams, not silent gaps):
    //   • applyAuthoredColorScale — honor chart_spec.encodings.color.{colors,scheme,mid}
    //   • ecFitFrame / refitCanvas analogue — CanvasXpress self-sizes to its
    //     container, so a first pass can let the engine lay out the frame and
    //     only pass the designed width/height through config.setMinX etc.
    //   • applyFieldDisplayNames — remap field keys to input.field_display_names

    spec.graphType = spec.graphType || defaultGraphType(chartType);
    spec._dataLength = table.length;
    return spec;
}

/**
 * Fallback CanvasXpress graphType for a chart whose template did not set one.
 * Templates normally set graphType in their seed `template`; this guards the
 * four acceptance charts.
 * @private
 */
function defaultGraphType(chartType: string): string {
    switch (chartType) {
        case 'Bar Chart': return 'Bar';
        case 'Line Chart': return 'Line';
        case 'Area Chart': return 'Area';
        case 'Scatter Plot': return 'Scatter2D';
        default: return 'Bar';
    }
}
