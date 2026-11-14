import type { ChartAssemblyInput, ChartEncoding, ChartTemplateDef, ChartWarning, SemanticResult } from './types';
import { withEncodingColorAnnotations } from './color-controls';
import { applyAggregation, resolveImplicitAggregation } from './aggregate';
import { applyEncodingOverrides } from './encoding-overrides';
import { applyTransform } from './pivot';
import { validateUnknownInputKeys } from './validate-input-keys';
import { convertTemporalData, repairEncodingSorts, resolveChannelSemantics, resolveChannelTypes } from './resolve-semantics';
import { computeZeroDecision } from './semantic-types';
import { normalizeStaticSeries } from './static-series';

export { analysisReadsProperty } from './analysis-properties';

/** What a compile learns from the data and the chart spec, before any room or theme is read. */
export interface ChartAnalysis {
    /** Rows after static-series folding and aggregation. */
    data: any[];
    /** `data` with temporal fields converted. */
    convertedData: any[];
    /** Encodings after the transform, encoding overrides, normalization. */
    encodings: Record<string, ChartEncoding>;
    channelSemantics: SemanticResult;
    /** The template that draws the chart; a chart-type transform may swap it for a sibling. */
    template: ChartTemplateDef;
    authoredTemplate: ChartTemplateDef;
    /** The authored encodings with inferred types, before the transform. */
    typedEncodings: Record<string, ChartEncoding>;
    transformed: ReturnType<typeof applyTransform>;
    staticSeries: ReturnType<typeof normalizeStaticSeries>['staticSeries'];
    templateMarkType: string | undefined;
    warnings: ChartWarning[];
    /** Rows shaped as the analysis shaped its own: static series folded, aggregated, dates converted. */
    shapeRows(rows: readonly Record<string, unknown>[]): any[];
}

export function analyzeChart(
    input: ChartAssemblyInput,
    authored: ChartTemplateDef,
    chartProperties: Record<string, any> | undefined,
    getTemplateDef: (chartType: string) => ChartTemplateDef | undefined,
): ChartAnalysis {
    const chartType = input.chart_spec.chartType;
    // The colour encoding's own `colors` and `mid` speak for its field in this chart.
    const semanticTypes = withEncodingColorAnnotations(input.semantic_types ?? {}, input.chart_spec.encodings as Record<string, unknown>);
    let template = authored;

    // ═══════════════════════════════════════════════════════════════════════
    // PRE-PHASE: Static Series Normalization
    // ═══════════════════════════════════════════════════════════════════════
    // Detect array-valued encodings (static series), validate, and fold data.
    const rawData = input.data.values ?? [];
    const sortRepair = repairEncodingSorts(input.chart_spec.encodings, rawData);
    const warnings: ChartWarning[] = [...sortRepair.warnings];
    const normalized = normalizeStaticSeries(
        sortRepair.encodings, rawData, semanticTypes, chartType,
    );
    let data = normalized.data;
    const staticSeries = normalized.staticSeries;

    // Compose Category-B encoding-action overrides (stored by the host in
    // chartProperties, keyed by action key) onto the base encodings before any
    // pipeline phase runs. Flint owns the transform; the host only stores the
    // override value. See applyEncodingOverrides / EncodingActionDef.
    //
    // Some actions (e.g. Sort) must know each channel's resolved encoding TYPE
    // to decide which position axis is the discrete category and which is the
    // measure. The host leaves `type` unset ("auto") for most encodings, so we
    // resolve the inferred types first, compose the overrides onto the
    // type-enriched encodings, then resolve semantics on the result below (so
    // that, e.g., a value-sort correctly suppresses the field's canonical
    // ordinal ordering).
    const inferredTypes = resolveChannelTypes(normalized.encodings, data, semanticTypes, { chartType: template.chart });
    const typedRawEncodings: Record<string, ChartEncoding> = {};
    for (const [ch, enc] of Object.entries(normalized.encodings)) {
        typedRawEncodings[ch] = enc.type
            ? enc
            : { ...enc, type: inferredTypes[ch] };
    }
    // Axis dtype override (`xAxisType` / `yAxisType` properties): the user can
    // force a position channel's interpretation between a continuous time scale
    // ('temporal') and discrete bands ('nominal') for date-like fields that
    // carry a dual interpretation. Applies to either axis — x on a vertical
    // bar/line, y on a horizontal (transposed) bar/lollipop. Applied at the
    // encoding level so the whole pipeline (sorting, layout, formatting) honors
    // it — resolveChannelSemantics treats an explicit encoding.type as
    // authoritative. Whether each control is *offered* is decided by the
    // property's own `check` (see axisDtypeProperties).
    for (const axis of ['x', 'y'] as const) {
        const choice = chartProperties?.[`${axis}AxisType`];
        if ((choice === 'temporal' || choice === 'nominal') && typedRawEncodings[axis]?.field) {
            typedRawEncodings[axis] = { ...typedRawEncodings[axis], type: choice };
        }
    }
    // Transform (derived Category-B operator): re-route fields across position/
    // legend/facet channels + optionally re-render as a sibling chart type, to
    // surface alternative views. Split into TWO independent controls (see
    // design-docs/chart-transform-two-axes.md):
    //   - Control B (chart type, θ): stored under chartProperties.chartType
    //   - Control A (arrange, τ/σ/γ): stored under chartProperties.arrange
    // (A legacy composed `pivot` id is migrated by applyTransform.) Composed
    // BEFORE other overrides so sort/overflow/layout resolve against the result.
    // Both surfaces are exposed to hosts via `_transform` / getChartTransform;
    // the legacy single-control `_pivot` surface is still emitted below.
    const authoredTemplate = template;
    const transformed = applyTransform(template, typedRawEncodings, data, chartProperties, getTemplateDef);
    // A chart-type *transition* (Control B) re-renders the same data as a sibling
    // chart type (e.g. Grouped Bar → Stacked Bar, Scatter → Strip/Jitter). The
    // authored chartType / encodings are untouched; rendering re-dispatches to
    // the sibling template so its instantiate / layout logic takes over. See §4.6.
    if (transformed.chartType && transformed.chartType !== chartType) {
        const swapped = getTemplateDef(transformed.chartType);
        if (swapped) template = swapped;
    }
    warnings.push(...validateUnknownInputKeys(
        [authoredTemplate, template], input.chart_spec.chartProperties, input.options,
    ));
    const composedEncodings = applyEncodingOverrides(template, transformed.encodings, chartProperties);

    // Template-level encoding normalization (e.g. Sparkline remaps its series
    // field onto the `row` facet channel). Runs BEFORE semantics/layout so the
    // whole pipeline resolves against the normalized channel map.
    const normalizedEncodings = template.normalizeEncodings
        ? template.normalizeEncodings(composedEncodings, data)
        : composedEncodings;
    // Several rows on one mark's key: aggregate the measure (and say so) rather than overplot.
    const implicit = resolveImplicitAggregation(template.chart, normalizedEncodings, data, semanticTypes);
    const encodings = implicit.encodings;
    warnings.push(...implicit.warnings);

    // Optional aggregation transform: when an encoding sets `aggregate`, collapse
    // the rows here (grouping by the dimension channels) so the derived
    // `${field}_${op}` / `_count` columns the assemblers reference actually
    // exist. No-op when no encoding requests it or the data is pre-aggregated.
    data = applyAggregation(encodings, data);

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 0: Resolve Semantics (VL-free)
    // ═══════════════════════════════════════════════════════════════════════

    const tplMark = template.template?.mark;
    const templateMarkType = typeof tplMark === 'string' ? tplMark : tplMark?.type;

    // Convert temporal data on the (possibly folded) dataset for Phase 0+
    const convertedData = convertTemporalData(data, semanticTypes);

    const channelSemantics = resolveChannelSemantics(
        encodings, data, semanticTypes, convertedData, { chartType: template.chart },
    );

    // Finalize zero-baseline (requires template mark knowledge)
    const effectiveMarkType = templateMarkType || 'point';
    for (const [channel, cs] of Object.entries(channelSemantics)) {
        if ((channel === 'x' || channel === 'y') && cs.type === 'quantitative') {
            const numericValues = data
                .map(r => r[cs.field])
                .filter((v: any) => v != null && typeof v === 'number' && !isNaN(v));
            cs.zero = computeZeroDecision(
                cs.semanticAnnotation.semanticType, channel, effectiveMarkType, numericValues,
            );
        }
    }

    // ── Zero-baseline override (position-cognitive axes) ──
    // computeZeroDecision (above) is the single authority on whether an axis
    // includes zero. For axes where that call is a genuine toss-up worth
    // surfacing (see makeZeroBaselineCheck / ZeroDecision.uncertain), the host
    // may override it via the stored config `includeZero_x`/`includeZero_y` (a boolean on/off
    // toggle). We honor it by overwriting `cs.zero.zero`, leaving the rest of
    // the decision intact, so every downstream consumer — the spec applier
    // (instantiate-spec) AND banking layout (compute-layout reads cs.zero) —
    // renders the user's choice consistently. Placed before the log-scale
    // override and the layout phase so banking is zero-aware of the override.
    if (template.markCognitiveChannel === 'position') {
        for (const axis of ['x', 'y'] as const) {
            const cs = channelSemantics[axis];
            if (!cs?.field || cs.type !== 'quantitative' || !cs.zero) continue;
            const choice = chartProperties?.[`includeZero_${axis}`];
            if (choice === undefined) continue; // keep the engine's decision
            cs.zero = { ...cs.zero, zero: choice };
        }
    }

    // ── Log-scale override (position-cognitive axes) ──
    // A log/symlog scale only makes sense on a continuous quantitative POSITION
    // axis (scatter/line/strip) — never on length/area marks, where bars encode
    // magnitude as length from a zero baseline (log destroys the baseline and
    // log(0) is undefined). The engine recommends log conservatively in
    // resolveScaleType (→ cs.scaleType). Here we apply the user's per-axis
    // override of that recommendation via the stored config `logScale_x`/
    // `logScale_y` (a boolean on/off toggle). Whether the control is *offered*
    // and its recommended default are decided by the property's own `check`
    // (see LOG_SCALE_PROPERTIES) and surfaced through `getChartOptions`.
    // On non-position marks we additionally strip any recommended log/symlog
    // scale so length/area encodings always render linearly from their baseline.
    if (template.markCognitiveChannel === 'position') {
        for (const axis of ['x', 'y'] as const) {
            const cs = channelSemantics[axis];
            if (!cs?.field || cs.type !== 'quantitative') continue;
            // Binned axes use VL's linear bin computation — log conflicts.
            if (template.template?.encoding?.[axis]?.bin) continue;

            const choice = chartProperties?.[`logScale_${axis}`];
            if (choice === undefined) continue; // keep the engine's recommendation

            // The control is a simple on/off toggle: `true` forces log (symlog
            // when zeros are present), `false` forces linear.
            const hasZero = data.some(row => row[cs.field] === 0);
            cs.scaleType = choice === false
                ? undefined                       // force linear
                : (hasZero ? 'symlog' : 'log');   // force log (symlog if zeros)
        }
    } else {
        // Non-position mark (length/area): never apply a log/symlog scale —
        // these encodings read magnitude from a zero baseline that log destroys.
        for (const axis of ['x', 'y'] as const) {
            const cs = channelSemantics[axis];
            if (cs?.scaleType === 'log' || cs?.scaleType === 'symlog') {
                cs.scaleType = undefined;
            }
        }
    }

    return {
        data,
        convertedData,
        encodings,
        channelSemantics,
        template,
        authoredTemplate,
        typedEncodings: typedRawEncodings,
        transformed,
        staticSeries,
        templateMarkType,
        warnings,
        shapeRows: (rows) => convertTemporalData(
            applyAggregation(encodings, normalizeStaticSeries(sortRepair.encodings, [...rows], semanticTypes, chartType).data),
            semanticTypes,
        ),
    };
}
