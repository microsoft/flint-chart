// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Core chart assembly logic — Two-Stage Pipeline Coordinator.
 *
 * Given data, encoding definitions, and semantic types,
 * produces a complete Vega-Lite specification in two stages:
 *
 * ── ANALYSIS (VL-free) ──────────────────────────────────────
 *   Phase 0:  resolveChannelSemantics  → ChannelSemantics
 *   Step 0a:  declareLayoutMode    → LayoutDeclaration
 *   Step 0b:  convertTemporalData  → converted data
 *   Step 0c:  filterOverflow       → filtered data, nominalCounts
 *   Phase 1:  computeLayout        → LayoutResult
 *
 * ── INSTANTIATE (VL-specific) ───────────────────────────────
 *   buildVLEncodings    → resolvedEncodings
 *   template.instantiate
 *   restructureFacets
 *   vlApplyLayoutToSpec
 *   post-layout adjustments (facet binning, independent scales, tooltips)
 *
 * ── Backend Translation Responsibilities ────────────────────
 * The LayoutResult from Phase 1 is target-agnostic.  This assembler
 * translates it into Vega-Lite-specific structures:
 *
 *   subplotWidth / subplotHeight
 *     → VL `width` / `height` on the spec (or `width: {step: N}` for
 *       banded discrete axes).
 *
 *   xStep / yStep / stepPadding
 *     → VL `width: {step: N}`, `encoding.x.scale.paddingInner`, etc.
 *       VL handles bar sizing natively from the step declaration.
 *
 *   Facet wrapping
 *     → `restructureFacets()` converts column-only to `facet` +
 *       `columns: N`.  The wrapping decision uses the same parameters
 *       (maxStretch, minStep, minSubplotSize) as ECharts.
 *
 *   Axis titles, labels, legends
 *     → VL handles these declaratively via encoding / config.
 *
 * This module has NO React, Redux, or UI framework dependencies.
 */

import { authoredColorScale, schemeName, withEncodingColorAnnotations } from '../core/color-controls';
import { applyAuthoredColorScaleVL, restoreColorScales, snapshotColorScales } from './color-controls';
import {
    ChartEncoding,
    ChartTemplateDef,
    ChartAssemblyInput,
    LayoutDeclaration,
    InstantiateContext,
} from '../core/types';
import type { AssembleOptions, ChartWarning, ChartOption, OptionEvalContext } from '../core/types';
import type { ThemeReport } from '../core/theme/types';
import { declaredInteractionCapabilities, type InteractionCapability } from '../core/interaction-spec';
import { analysisReadsProperty, analyzeChart, type ChartAnalysis } from '../core/analyze';
import { planLayout, type BackendLayoutProfile, type LayoutPlan, type PlanContext } from '../core/plan';
import { chartTable, type ChartTable } from '../core/chart-table';
import { groupDodge } from '../core/band-dodge';
import { applyPivot, type PivotSurface, type TransformSurface } from '../core/pivot';
import { vlGetTemplateDef } from './templates';
import { getRegistryEntry } from '../core/type-registry';
import type { SemanticAnnotation } from '../core/field-semantics';
import { resolveBaseSize, withCanvasSize } from '../core/compute-layout';
import { gapOf, plotViews, type ViewNode } from '../core/views';
import { plotHeightAfter } from '../core/title-fit';
import { inWindow, positionOf } from '../core/window';
import { vegaLiteSort } from './sort';
import { vegaLiteDepartures } from './honour';
import type { PlanDeparture } from '../core/honour';
import { escapeVlFieldName } from './field-name';
import type { CategoryOrder } from '../core/channel-decisions';
import { templateStatesAxisLabels, vlApplyLayoutToSpec, vlApplyTooltips, vlFinalizeTemporalAxes, vlListTooltipFields } from './instantiate-spec';
import { normalizeChartProperties } from '../core/normalize-properties';
import { resolveChartDefaults, resolveCompileDefaults, resolveGeometry, resolveValueLabelChoice } from '../core/theme/ground';
import { resolveThemeSpec } from '../core/theme/presets';
import { withChrome } from '../core/theme/chrome';
import { applyHeaderFurniture, applySourceLine, realizeThemeVegaLite, realizeValueLabelsVegaLite, vegaLiteBuiltFacts } from './theme';
import { applyChartValueColors } from './value-colors';
import { vlCaseKeyLabels, vlWriteKeyLayout } from './key-layout';
import { familyMeasure, rendererTextMeasurer } from '../core/text-width';
import { themeBodyFamily } from '../core/theme/ground';
import { chartDisplayNames, encodingTitle, TIGHT_X_MARKS, titleText, type BuiltFacts, type ChartStructure } from '../core/structure';
import { heightAfterTitle, type TitlePlan } from '../core/title-plan';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assemble a Vega-Lite specification.
 *
 * ```ts
 * const spec = assembleVegaLite({
 *   data: { values: myRows },
 *   semantic_types: { weight: 'Quantity', mpg: 'Quantity' },
 *   chart_spec: {
 *     chartType: 'Scatter Plot',
 *     encodings: { x: { field: 'weight' }, y: { field: 'mpg' } },
 *     canvasSize: { width: 400, height: 300 },
 *   },
 *   options: { addTooltips: true },
 * });
 * ```
 */
/** How Vega-Lite lays a chart out where nothing else says. */
/** The gap, in px, between an unthemed chart's title block and the chart below it. */
const UNTHEMED_TITLE_OFFSET = 10;

const VEGA_LITE_LAYOUT: BackendLayoutProfile = {
    spellField: (name) => escapeVlFieldName(name),
    measureText: rendererTextMeasurer,
    defaults: {
        // Vega-Lite's native width:{step} preserves the authored category pitch.
        bandStepFit: 0,
        // Vega-Lite native font defaults (labels 10, titles 11).
        baseLabelFontSize: 10,
        baseTitleFontSize: 11,
    },
    fallbacks: {
        // VL facet overhead:
        //   Fixed: y-axis labels (~35px width) + x-axis labels (~22px height)
        //          + titles/legend margin.
        //   Gap:   config.facet.spacing between panels; shrunk post-layout for
        //          small subplots (see facetGapVal below).
        facetFixedPadding: { width: 50, height: 40 },
        facetGap: 10,
        targetBandAR: 10,
    },
    // Vega-Lite's band padding where an offset channel nests marks inside each band.
    nestedBandPadding: { inner: 0.2, outer: 0.2 },
    // Vega's config defaults for axes, legends and titles.
    // The title's offset is Flint's, not Vega's 4px: a title that close to the top labels reads as one with them.
    spacing: { tickSize: 5, labelPadding: 2, axisTitlePadding: 4, keyOffset: 18, titleOffset: UNTHEMED_TITLE_OFFSET, deckPadding: 3 },
    // Vega's group-title and group-subtitle styles.
    titleSizes: { headline: 13, deck: 12 },
};

/** The headline and deck as one string, whichever shape the title took. */
/** Write the plan's axis titles on every encoding of each axis a template draws. */
function writeAxisTitles(spec: any, titles: LayoutPlan['axisTitles']): void {
    const visit = (node: any): void => {
        if (!node || typeof node !== 'object') return;
        for (const channel of ['x', 'y'] as const) {
            const title = titles[channel];
            const encoding = node.encoding?.[channel];
            if (title === undefined || !encoding || typeof encoding !== 'object' || encoding.axis === null) continue;
            const printed = encoding.axis?.title !== undefined ? encoding.axis.title
                : encoding.title === null ? null
                : titleText(typeof encoding.title === 'string' ? encoding.title : undefined, encoding.field);
            if (printed === title) continue;
            encoding.axis = { ...(encoding.axis ?? {}), title };
        }
        for (const key of ['layer', 'vconcat', 'hconcat', 'concat']) (node[key] ?? []).forEach(visit);
        if (node.spec) visit(node.spec);
    };
    visit(spec);
}

/** The headline and deck the author wrote, as a Vega-Lite title. */
function authoredTitle(input: ChartAssemblyInput): { text: string; subtitle?: string[] } | undefined {
    const headline = input.chart_spec.title?.trim();
    const deck = input.chart_spec.subtitle?.trim();
    if (!headline && !deck) return undefined;
    return { text: headline ?? '', ...(deck ? { subtitle: [deck] } : {}) };
}

/** The chart's title: the author's, else one the chart writes for itself. */
function chartTitle(input: ChartAssemblyInput, structure: ChartStructure): { text: string; subtitle?: string[] } | undefined {
    return authoredTitle(input) ?? (structure.title !== undefined ? { text: structure.title } : undefined);
}


/**
 * The axis the series run along, which an index reading moves over: the temporal axis, else
 * the discrete one beside a measure, else x.
 */
export function indexAxisOf(
    encodings: Partial<Record<'x' | 'y', { field?: string; type?: string } | undefined>>,
): 'x' | 'y' {
    const typeOf = (axis: 'x' | 'y') => (encodings[axis]?.field ? encodings[axis]?.type : undefined);
    const x = typeOf('x');
    const y = typeOf('y');
    if ((x === 'temporal') !== (y === 'temporal')) return y === 'temporal' ? 'y' : 'x';
    const discrete = (type: string | undefined) => type === 'nominal' || type === 'ordinal';
    if (discrete(y) && x !== undefined && !discrete(x)) return 'y';
    return 'x';
}

/**
 * Axis titles longer than their axes, as the plan wrapped them: two lines at the axis's length, a
 * line past it cut with an ellipsis. Written only where the title drawn is the one the plan fitted.
 */
function vlWriteAxisTitles(spec: any, fits: LayoutPlan['axisTitleFit']): void {
    if (!fits) return;
    const visit = (node: any): void => {
        if (!node || typeof node !== 'object') return;
        for (const channel of ['x', 'y'] as const) {
            const fit = fits[channel];
            const enc = node.encoding?.[channel];
            if (!fit || !enc || enc.axis === null) continue;
            const drawn = typeof enc.axis?.title === 'string' ? enc.axis.title : typeof enc.title === 'string' ? enc.title : enc.axis?.title === undefined && enc.title === undefined ? enc.field : undefined;
            if (typeof drawn !== 'string' || drawn.replace(/\s+/g, ' ').trim().toLowerCase() !== fit.lines.join(' ').toLowerCase()) continue;
            enc.axis = { ...(enc.axis ?? {}), title: fit.lines.length > 1 ? fit.lines : fit.lines[0], titleLimit: fit.limit, titleLineHeight: fit.lineHeight };
        }
        for (const key of ['layer', 'concat', 'hconcat', 'vconcat']) for (const child of node[key] ?? []) visit(child);
        if (node.spec) visit(node.spec);
    };
    visit(spec);
}

/** The plot's stated size — the view's continuous size, and the plot view's width and height — as one string. */
function plotSizeFields(spec: any, title?: TitlePlan, ruleRoom = 0, headerRoom = 0): string {
    const height = (value: unknown) => {
        if (typeof value !== 'number') return value;
        const titled = heightAfterTitle(value, title);
        const closed = ruleRoom ? plotHeightAfter(titled, ruleRoom) : titled;
        return headerRoom ? plotHeightAfter(closed, headerRoom) : closed;
    };
    // A theme may wrap the plot in a concatenation with its rules; the plot is its first view that is not one.
    let plot = spec;
    while (plot && !plot.mark && !plot.layer && !plot.facet && !plot.spec && (plot.vconcat ?? plot.hconcat ?? plot.concat)) {
        const views: any[] = plot.vconcat ?? plot.hconcat ?? plot.concat;
        plot = views.find((view) => !view.__themeSynthetic) ?? views[0];
    }
    return JSON.stringify([
        spec.config?.view?.continuousWidth, height(spec.config?.view?.continuousHeight),
        plot?.width, height(plot?.height), plot?.spec?.width, height(plot?.spec?.height),
    ]);
}

/** What a Vega-Lite compile settles from the spec and the theme before it reads the data. */
interface VegaLitePreparation {
    chartType: string;
    semanticTypes: Record<string, string | SemanticAnnotation>;
    themeSpec: ReturnType<typeof resolveThemeSpec>;
    themePresets: ReturnType<typeof resolveCompileDefaults>;
    baseSize: { width: number; height: number };
    sizeCeiling: { width: number; height: number } | undefined;
    options: AssembleOptions;
    template: ChartTemplateDef;
    chartProperties: Record<string, any> | undefined;
    chartDefaultsReport: ThemeReport[];
    chartGeometry: ReturnType<typeof resolveGeometry>['geometry'];
    geometryReport: ThemeReport[];
    warnings: ChartWarning[];
}

/** The size a chart is planned into: its base size, clamped to the ceiling its spec, its theme or a host sets. */
function plannedSize(input: ChartAssemblyInput, themeSpec: VegaLitePreparation['themeSpec']): Pick<VegaLitePreparation, 'baseSize' | 'sizeCeiling'> {
    const housePresets = themeSpec?.compileDefaults;
    const sizeCeiling = input.chart_spec.canvasSize ?? housePresets?.canvasSize;
    return { baseSize: resolveBaseSize(input.chart_spec.baseSize ?? housePresets?.baseSize, sizeCeiling), sizeCeiling };
}

function prepareVegaLite(input: ChartAssemblyInput): VegaLitePreparation {
    const chartType = input.chart_spec.chartType;
    // The colour encoding's own `colors` and `mid` speak for its field in this chart.
    const semanticTypes = withEncodingColorAnnotations(input.semantic_types ?? {}, input.chart_spec.encodings as Record<string, unknown>);
    // `theme_spec` may name a house Flint ships rather than spell one out.
    // A chart may turn off part of its house's chrome (a logo, the header, the footer).
    const themeSpec = withChrome(resolveThemeSpec(input.theme_spec), input.chart_spec.chrome);
    // A house may prefer a size, a stretch budget, a facet gap. Those settle
    // before anything is measured, and in a fixed order: the chart spec first,
    // the theme's presets under it, flint's own defaults under that.
    const themePresets = resolveCompileDefaults(themeSpec, input.options);
    // Internal layout targets the base (target) size; the optional canvasSize
    // ceiling is applied as per-dimension stretch caps once options resolve.
    // The base is clamped to the ceiling so a smaller canvasSize shrinks the
    // chart to fit rather than overflowing it.
    const { baseSize, sizeCeiling } = plannedSize(input, themeSpec);
    const canvasSize = baseSize;
    const options = themePresets.options ?? {};
    const chartTemplate = vlGetTemplateDef(chartType) as ChartTemplateDef;
    if (!chartTemplate) {
        throw new Error(`Unknown chart type: ${chartType}`);
    }

    const warnings: ChartWarning[] = [];

    // Validate discrete property *values* against the template's declared
    // options before they reach `instantiate`. This maps a known display label
    // to its accepted value and drops unrecognized values, so a bad input never
    // produces an invalid backend spec (which would render blank).
    const normalizedProps = normalizeChartProperties(
        chartTemplate.properties, input.chart_spec.chartProperties,
    );
    let chartProperties = normalizedProps.chartProperties;
    warnings.push(...normalizedProps.warnings);

    // A house's rules about the chart itself — points on a line, a bump chart
    // left unsmoothed — change what is drawn, not how it is dressed, so they
    // are folded in here, before the pipeline reads the properties. Anything
    // the caller stated already is left alone.
    if (themeSpec && !chartProperties) chartProperties = {};
    const chartDefaultsReport = chartProperties
        ? resolveChartDefaults(
            themeSpec, chartType, chartTemplate.properties,
            input.chart_spec.chartProperties, chartProperties,
            (key) => analysisReadsProperty(chartTemplate, key),
        )
        : [];

    // One toggle, whichever way the template draws the numbers. A few charts
    // print their own value labels instead of going through the theme's
    // data-label layer. They expose the same `showValueLabels` control as every
    // other chart; translating it to the older internal `showTextLabels`
    // boolean keeps saved inputs compatible without publishing two controls.
    // Silence stays silent: with no answer the template keeps its own default.
    if (chartProperties && templateOwnsValueLabels(chartTemplate)) {
        const choice = resolveValueLabelChoice(chartProperties);
        if (choice) chartProperties.showTextLabels = choice === 'on';
    }

    // Geometry settles before anything is measured: whether a line carries dots
    // and how much of its step a bar fills change what the layout has to fit,
    // not just how the result is painted.
    const { geometry: chartGeometry, report: geometryReport } = resolveGeometry(
        themeSpec, chartType, chartTemplate.geometryKinds,
    );

    return {
        chartType, semanticTypes, themeSpec, themePresets, baseSize, sizeCeiling, options,
        template: chartTemplate, chartProperties, chartDefaultsReport, chartGeometry, geometryReport, warnings,
    };
}

/** The plan inputs a Vega-Lite compile gives the planner. */
function vegaLitePlanContext(input: ChartAssemblyInput, prepared: VegaLitePreparation, analysis: ChartAnalysis): PlanContext {
    const { chartType, semanticTypes, themeSpec, baseSize, sizeCeiling, options, chartProperties } = prepared;
    return {
        chartProperties,
        authoredProperties: input.chart_spec.chartProperties,
        semanticTypes,
        options,
        chartType,
        size: { baseSize, canvasSize: sizeCeiling },
        title: authoredTitle(input),
        ...(input.chart_spec.label?.trim() ? { label: input.chart_spec.label.trim() } : {}),
        ...(sourceOf(input.chart_spec.source) ? { source: sourceOf(input.chart_spec.source) } : {}),
        fieldDisplayNames: input.field_display_names,
        theme: themeSpec,
        profile: VEGA_LITE_LAYOUT,
        bandLabels: chartType === 'Bar Table' ? undefined : { skip: (channel) => templateStatesAxisLabels(analysis.template.template, channel) },
    };
}

/** A planned chart as its template built it, before the theme. */
export interface VegaLiteBuild {
    spec: any;
    warnings: ChartWarning[];
    context: InstantiateContext;
    resolvedEncodings: Record<string, any>;
}

/** The Vega-Lite spec a planned chart's template builds, before the plan's layout is applied. */
function instantiateVegaLite(
    input: ChartAssemblyInput, prepared: VegaLitePreparation, analysis: ChartAnalysis, plan: LayoutPlan,
): VegaLiteBuild {
    const { chartType, semanticTypes, baseSize: canvasSize, chartProperties, chartGeometry } = prepared;
    const warnings: ChartWarning[] = [...prepared.warnings, ...analysis.warnings, ...plan.warnings];
    const { data, convertedData, encodings, channelSemantics, transformed, staticSeries, templateMarkType } = analysis;
    const chartTemplate = analysis.template;
    const { declaration, facetGrid: facetGridResult, rows: values, layout: layoutResult } = plan;
    const nominalCounts = { ...plan.nominalCounts };
    const effectiveOptions = plan.options;

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: Instantiate VL Spec
    // ═══════════════════════════════════════════════════════════════════════

    // --- Build VL encodings (abstract semantics → VL encoding objects) ---

    // For static series, suppress the synthetic key/value column axis titles
    // (show "Series"/"Value" instead of "__flint_series_key"/"__flint_series_value")
    // and map field names to display names
    const fieldDisplayNames = chartDisplayNames(input.field_display_names, staticSeries ?? undefined);

    const resolvedEncodings = buildVLEncodings(
        encodings, channelSemantics, declaration, data,
        canvasSize, semanticTypes, templateMarkType, chartTemplate,
        fieldDisplayNames, chartProperties, plan.orders, plan.sizes,
    );

    // --- Align sort/domain arrays to converted data types ---
    // buildVLEncodings uses the original data, but the VL spec embeds
    // post-conversion data (e.g. Year 1980 → "1980").  Re-map sort and
    // scale.domain entries so VL can match them against data.values.
    for (const enc of Object.values(resolvedEncodings)) {
        const field = enc?.field;
        if (!field) continue;
        // Build a lookup from the converted (spec-embedded) data
        const valMap = new Map<string, any>();
        for (const r of values) {
            const v = r[field];
            if (v != null && !valMap.has(String(v))) valMap.set(String(v), v);
        }
        if (valMap.size === 0) continue;
        const remap = (arr: any[]) => arr.map(v => {
            const key = String(v);
            return valMap.has(key) ? valMap.get(key) : v;
        });
        if (Array.isArray(enc.sort)) enc.sort = remap(enc.sort);
        if (Array.isArray(enc.scale?.domain)) enc.scale.domain = remap(enc.scale.domain);
    }

    // Detect x/y discrete counts inside template layers for layered specs
    const isDiscreteType = (t: string | undefined) => t === 'nominal' || t === 'ordinal';
    if (Array.isArray(chartTemplate.template?.layer)) {
        for (const axis of ['x', 'y'] as const) {
            if (nominalCounts[axis] === 0) {
                for (const layer of chartTemplate.template.layer) {
                    const layerEnc = layer.encoding?.[axis];
                    if (layerEnc?.field && isDiscreteType(layerEnc.type)) {
                        nominalCounts[axis] = new Set(values.map((r: any) => r[layerEnc.field])).size;
                        break;
                    }
                }
                if (nominalCounts[axis] === 0 && resolvedEncodings[axis]?.field) {
                    const enc = resolvedEncodings[axis];
                    if (isDiscreteType(enc.type)) {
                        nominalCounts[axis] = new Set(values.map((r: any) => r[enc.field])).size;
                    }
                }
            }
        }
    }

    // --- template.instantiate (template-specific VL spec building) ---

    const vgObj = structuredClone(chartTemplate.template);

    const instantiateContext: InstantiateContext = {
        channelSemantics,
        layout: layoutResult,
        plot: plan.plot,
        ...(plan.laidOutViews ? { views: plan.laidOutViews } : {}),
        table: values,
        fullTable: convertedData,
        resolvedEncodings,
        encodings,
        chartProperties,
        staticSeries,
        canvasSize,
        semanticTypes,
        chartType,
        ...(fieldDisplayNames ? { fieldDisplayNames } : {}),
        assembleOptions: effectiveOptions,
        geometry: chartGeometry,
        measureText: familyMeasure(
            VEGA_LITE_LAYOUT.measureText!,
            prepared.themeSpec ? themeBodyFamily(prepared.themeSpec) ?? 'sans-serif' : 'sans-serif',
        ),
    };

    chartTemplate.instantiate(vgObj, instantiateContext);

    // Facet-identity augmentation is presentation-only: the structural series
    // has already moved to column/row for semantics, layout, stacking, and
    // dodging. Reapply its learned color now so faceted panels preserve visual
    // identity without making the compiler treat color as another series role.
    if (transformed.augmentation?.kind === 'facet-identity') {
        const facetEncoding = resolvedEncodings[transformed.augmentation.facetChannel];
        if (facetEncoding?.field) {
            const colorEncoding = { ...facetEncoding };
            delete colorEncoding.header;
            delete colorEncoding.axis;
            delete colorEncoding.columns;
            const scheme = transformed.augmentation.colorEncoding.scheme;
            if (scheme) {
                colorEncoding.scale = { ...(colorEncoding.scale ?? {}), scheme };
            }
            vgObj.encoding = vgObj.encoding || {};
            vgObj.encoding.color = colorEncoding;

            // Vega-Lite implicitly stacks bars/areas whenever a discrete color
            // channel is present. This color is redundant identity, not a stack
            // series, so pin the quantitative position channel to unstacked.
            for (const axis of ['x', 'y']) {
                const encoding = vgObj.encoding[axis];
                if (encoding?.type === 'quantitative' && encoding.stack === undefined) {
                    encoding.stack = null;
                }
            }
        }
    }

    // Merge any warnings emitted by instantiate
    if (vgObj._warnings && Array.isArray(vgObj._warnings)) {
        warnings.push(...vgObj._warnings);
        delete vgObj._warnings;
    }

    // --- restructureFacets (VL-specific) ---
    // The facet grid (including wrapping) was already decided by
    // computeChannelBudgets.  restructureFacets only performs the VL structural
    // transform (column encoding → facet + spec for layered specs).

    restructureFacets(vgObj, nominalCounts, facetGridResult);

    return { spec: vgObj, warnings, context: instantiateContext, resolvedEncodings };
}

/** Builds the Vega-Lite spec for a planned chart from its template, with the plan's layout applied. */
export function buildVegaLite(input: ChartAssemblyInput, prepared: VegaLitePreparation, analysis: ChartAnalysis, plan: LayoutPlan): VegaLiteBuild {
    const { themeSpec, baseSize: canvasSize, chartProperties } = prepared;
    const { data, channelSemantics } = analysis;
    const { declaration, rows: values, layout: layoutResult } = plan;
    const effectiveOptions = plan.options;
    const addTooltipsOpt = effectiveOptions.addTooltips ?? false;
    const { spec: vgObj, warnings, context: instantiateContext, resolvedEncodings } = instantiateVegaLite(input, prepared, analysis, plan);
    writeAxisTitles(vgObj, plan.axisTitles);

    // --- vlApplyLayoutToSpec (VL-specific: config, sizing, formatting) ---

    vlApplyLayoutToSpec(vgObj, instantiateContext, warnings, plan.axisLabels, Boolean(themeSpec), plan.domains, plan.rulers, plan.bandSpans);

    // --- Post-layout adjustments (VL-specific) ---


    // Apply the planned panel gap so Vega-Lite uses it for spacing.
    const facets = plan.furniture.facets;
    vgObj.config = vgObj.config || {};
    writeFacetGap(vgObj, plannedFacetGap(plan.views) ?? gapOf(facets.spacing, 0));

    for (const channel of facets.binned) {
        const enc = vgObj.encoding?.[channel] ?? (channel === 'column' ? vgObj.encoding?.facet : undefined);
        if (enc?.type === 'quantitative') enc.bin = true;
    }

    if (facets.independentY) {
        if (!vgObj.resolve) vgObj.resolve = {};
        if (!vgObj.resolve.scale) vgObj.resolve.scale = {};
        vgObj.resolve.scale.y = "independent";
    }

    if (addTooltipsOpt) {
        vlApplyTooltips(vgObj);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HEADLINE
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Written before theming, because whether the chart has a headline is a
    // fact the theme reasons about: a house that omits axis titles is leaning
    // on this line to name the measure.
    const authored = authoredTitle(input);
    if (authored) vgObj.title = authored;

    return { spec: vgObj, warnings, context: instantiateContext, resolvedEncodings };
}

/**
 * Writes the Vega-Lite spec for a planned chart. Reads the analysis and the plan; changes neither.
 * `plotAsPlanned` is false when a stage after the plan (the theme fitting a long title) changed the plot size.
 */
function emitVegaLite(input: ChartAssemblyInput, prepared: VegaLitePreparation, analysis: ChartAnalysis, plan: LayoutPlan): { spec: any; plotAsPlanned: boolean } {
    const { chartType, themeSpec, themePresets, baseSize: canvasSize, chartProperties, geometryReport } = prepared;
    const { data, encodings, channelSemantics, authoredTemplate, transformed } = analysis;
    const chartTemplate = analysis.template;
    const typedRawEncodings = analysis.typedEncodings;
    const { declaration, facetGrid: facetGridResult, rows: values, layout: layoutResult } = plan;
    const chartDefaultsReport: ThemeReport[] = [...prepared.chartDefaultsReport, ...plan.report];
    const {
        spec: vgObj, warnings, context: instantiateContext, resolvedEncodings,
    } = buildVegaLite(input, prepared, analysis, plan);

    // ═══════════════════════════════════════════════════════════════════════
    // THEME (level 3 realization of the plan's grounded decisions)
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Runs last, deliberately. `vlApplyLayoutToSpec` builds `config` wholesale
    // from fit decisions; the theme is a style layer over a chart that already
    // fits, so it must see the finished spec. Only realization is gated on a
    // named house, so an untheme'd chart gets its numbers without also getting
    // a house's ink, type and furniture.
    const plannedPlotSize = plotSizeFields(vgObj, plan.title, plan.rules?.room, (plan.header ? plan.header.edge + plan.header.line : 0) + (plan.source?.room ?? 0));
    // Some templates write their own text on the marks. Where they do, the
    // label layer stands down (it will not print a second number beside the
    // template's), so the toggle would be a control that changes nothing.
    // Asked before realization, because realization is what adds the label
    // layer — asked after, every labelled chart would look like this.
    const templateDrawsOwnText = plan.structure.marks.includes('text');
    const design = { ...plan.design, legend: { ...plan.design.legend, placement: plan.legend.placement, orient: plan.legend.orient, direction: plan.legend.direction } };

    let themeDecisions: any;
    const authoredColor = authoredColorScale(input.chart_spec.encodings as Record<string, unknown>);
    if (themeSpec) {
        const authoredScales = authoredColor ? snapshotColorScales(vgObj, authoredColor) : undefined;
        const realizeReport = realizeThemeVegaLite(vgObj, design, values, plan);
        // A scheme the author named outranks the theme's ramp.
        if (authoredScales) restoreColorScales(authoredScales);
        themeDecisions = {
            ...design,
            report: [...themePresets.report, ...chartDefaultsReport, ...geometryReport, ...design.report, ...realizeReport],
        };
    } else {
        realizeValueLabelsVegaLite(vgObj, design, values, plan.title, plan.valueLabels, plan.legend.layout?.footprint, plan.legend.layout?.offsets?.right);
        if (vgObj.title && vgObj.config?.title?.offset === undefined) {
            vgObj.config = { ...vgObj.config, title: { ...vgObj.config?.title, offset: UNTHEMED_TITLE_OFFSET } };
        }
        applyChartValueColors(vgObj, channelSemantics, values);
        // Many series thin Vega-Lite's 2 px lines, as they thin a house's (`plan.lineWidth`).
        if (plan.lineWidth !== undefined) {
            vgObj.config = { ...vgObj.config, line: { ...vgObj.config?.line, strokeWidth: plan.lineWidth } };
        }
    }
    // The header — a figure label, a rule on the canvas edge, a logo beside the headline — is the
    // chart's as much as the theme's: drawn with or without one.
    applyHeaderFurniture(vgObj, plan.header);
    applySourceLine(vgObj, plan.source);
    drawDeckWithoutHeadline(vgObj);
    if (plan.crowding) warnings.push(crowdingWarning(plan.crowding));
    const liveLabels = design.dataLabels.liveSignal;
    if (liveLabels) {
        vgObj.params = [...(vgObj.params ?? []), {
            name: liveLabels,
            value: {
                labels: {
                    show: design.dataLabels.show,
                    minValue: design.dataLabels.segmentMinValue ?? 0,
                    format: design.dataLabels.format ?? '',
                },
            },
        }];
    }

    // The theme may have moved the facet; the gap is written again where the final spec reads it.
    if (plan.layout.facet || plannedFacetGap(plan.views)) {
        const ruled = Array.isArray(vgObj.vconcat) && vgObj.vconcat.some((child: any) => child.__themeSynthetic)
            ? vgObj.vconcat.find((child: any) => !child.__themeSynthetic)
            : undefined;
        writeFacetGap(ruled ?? vgObj, plannedFacetGap(plan.views) ?? gapOf(plan.furniture.facets.spacing, 0), vgObj.config);
    }
    chartTemplate.postProcess?.(vgObj, instantiateContext);
    // The author's colour controls win over every default and the theme's ramp.
    if (authoredColor) applyAuthoredColorScaleVL(vgObj, authoredColor, values);
    vlFinalizeTemporalAxes(vgObj, instantiateContext);
    vlWriteKeyLayout(vgObj, plan.legend, plan.plot, plan.layout, VEGA_LITE_LAYOUT.measureText!);
    vlWriteAxisTitles(vgObj, plan.axisTitleFit);
    vlCaseKeyLabels(vgObj, plan.legend);
    vlListTooltipFields(vgObj);
    const plotAsPlanned = plotSizeFields(vgObj) === plannedPlotSize;

    // ═══════════════════════════════════════════════════════════════════════
    // RESULT
    // ═══════════════════════════════════════════════════════════════════════

    const result: any = { ...vgObj, data: vgObj.data ?? { values } };
    // Runtime detail levels and a pre-projected base map travel with the
    // interaction semantics, not the spec.
    delete result._geoLevels;
    delete result._geoPreProjection;
    if (themeDecisions) {
        const { report, ...decisions } = themeDecisions;
        result._theme = {
            id: themeDecisions.themeId,
            report,
            ...(plan.options.themeDecisions ? { decisions } : {}),
        };
    }
    if (warnings.length > 0) {
        result._warnings = warnings;
    }
    // What the canvas-fit pass judged and did, for tools that inspect the layout.
    if (plan.canvasFit && (plan.canvasFit.before.flags.length || plan.canvasFit.treatment)) {
        result._canvasFit = plan.canvasFit;
    }
    if (plan.viewports.length > 0) {
        result._viewports = plan.viewports;
    }
    const unfaceted = !resolvedEncodings.column?.field && !resolvedEncodings.row?.field;
    // A projected chart navigates its projection extent, so both axes move
    // together and no continuous x/y encoding is required.
    const support = chartTemplate.interactionSupport;
    const geoNavigation = !!support?.navigation?.geo && unfaceted;
    const navigationAxes: ('x' | 'y')[] = geoNavigation
        ? ['x', 'y']
        : support?.navigation && unfaceted
            ? (support.navigation.axes ?? ['x', 'y']).filter((axis) => {
                const encoding = resolvedEncodings[axis];
                return !!encoding?.field && (encoding.type === 'quantitative' || encoding.type === 'temporal');
            })
            : [];
    const templateSemantics = chartTemplate.semanticInteractions?.({ resolvedEncodings, encodings, channelSemantics }) ?? {
        fields: [],
        identityFields: undefined,
        provenanceFields: undefined,
        temporalProvenanceFields: undefined,
        rangeProvenance: undefined,
        selectableMarks: [],
        reorderAxis: undefined,
        reorderAxes: undefined,
    };
    const semanticEncodings = Object.values(resolvedEncodings)
        .filter((encoding: any) => typeof encoding?.field === 'string') as any[];
    const hasAggregate = semanticEncodings.some((encoding) => encoding.aggregate);
    const provenanceFields = [...new Set(semanticEncodings
        .filter((encoding) => !hasAggregate || !encoding.aggregate)
        .map((encoding) => encoding.field as string))];
    const temporalProvenanceFields = [...new Set(semanticEncodings
        .filter((encoding) => encoding.type === 'temporal')
        .map((encoding) => encoding.field as string))];
    const reorderSupport = support?.reorder;
    const allowedReorderAxes: readonly ('x' | 'y')[] = reorderSupport
        ? reorderSupport.axes ?? ['x', 'y']
        : [];
    const defaultReorderAxes = allowedReorderAxes.length > 0
        && !resolvedEncodings.column?.field && !resolvedEncodings.row?.field
        ? (['x', 'y'] as const).flatMap((axis) => {
            const encoding = resolvedEncodings[axis];
            return allowedReorderAxes.includes(axis)
                && encoding?.field && (encoding.type === 'nominal' || encoding.type === 'ordinal')
                ? [{
                    axis,
                    field: encoding.field,
                    ...(reorderSupport?.includeConnectiveMarks ? { includeConnectiveMarks: true } : {}),
                    ...(reorderSupport?.markTypes ? { markTypes: reorderSupport.markTypes } : {}),
                }]
                : [];
        })
        : [];
    const explicitReorderAxes = templateSemantics.reorderAxes
        ?? (templateSemantics.reorderAxis ? [templateSemantics.reorderAxis] : []);
    const legendFields = 'legendFields' in templateSemantics ? templateSemantics.legendFields : undefined;
    const rangeLegendChannels = Object.keys(legendFields ?? {})
        .filter((channel) => {
            const type = resolvedEncodings[channel]?.type;
            return type === 'quantitative' || type === 'temporal';
        });
    const reorderAxes = [...explicitReorderAxes, ...defaultReorderAxes]
        .filter((candidate, index, candidates) =>
            getRegistryEntry(channelSemantics[candidate.axis]?.semanticAnnotation?.semanticType ?? '').t1 !== 'DateGranule'
            && candidates.findIndex(
            (axis) => axis.axis === candidate.axis && axis.field === candidate.field,
        ) === index);
    const discreteLegend = Object.keys(legendFields ?? {})
        .some((channel) => !rangeLegendChannels.includes(channel));
    const discreteAxis = (['x', 'y'] as const).some((axis) => {
        const encoding = resolvedEncodings[axis];
        return !!encoding?.field && (encoding.type === 'nominal' || encoding.type === 'ordinal');
    });
    const indexAxis = indexAxisOf(resolvedEncodings);
    const confirmed: Partial<Record<InteractionCapability, boolean>> = {
        navigation: navigationAxes.length > 0,
        reorder: reorderAxes.length > 0,
        legend: discreteLegend,
        'discrete-axis': discreteAxis,
        index: !!resolvedEncodings[indexAxis]?.field,
    };
    const capabilities = declaredInteractionCapabilities(support)
        .filter((capability) => confirmed[capability] ?? true);
    result._interactionSemantics = {
        ...templateSemantics,
        chartType: chartTemplate.chart,
        capabilities,
        indexAxis,
        axisFields: Object.fromEntries((['x', 'y'] as const).flatMap((axis) => {
            const encoding = resolvedEncodings[axis];
            return encoding?.field
                ? [[axis, { field: encoding.field, type: encoding.type ?? 'nominal' }]]
                : [];
        })),
        sourceRecords: values.map((record) => ({ ...record })),
        // The panel an element is drawn in is part of what it is about, whatever the template keys on.
        identityFields: [...new Set([
            ...(templateSemantics.identityFields ?? templateSemantics.fields.filter((field) => !Object.values(resolvedEncodings)
                .some((encoding: any) => encoding?.field === field && encoding.type === 'quantitative'))),
            ...(['column', 'row', 'facet'] as const).map((channel) => resolvedEncodings[channel]?.field).filter((field): field is string => typeof field === 'string'),
        ])],
        provenanceFields: templateSemantics.provenanceFields ?? provenanceFields,
        temporalProvenanceFields: templateSemantics.temporalProvenanceFields ?? temporalProvenanceFields,
        rangeLegendChannels,
        navigationAxes,
        geoNavigation,
        ...(vgObj._geoLevels ? { geoLevels: vgObj._geoLevels } : {}),
        ...(vgObj._geoPreProjection ? { geoPreProjection: vgObj._geoPreProjection } : {}),
        reorderAxis: reorderAxes[0],
        reorderAxes,
        selectionBoundary: design.interaction.selectionBoundary,
        continuousColorFocus: design.interaction.continuousColorFocus,
        neutralizeContinuousColor: chartTemplate.chart === 'Map' || chartTemplate.chart === 'Choropleth',
    };
    result._width = plan.plot.width;
    result._height = plan.plot.height;
    // Annotated option catalog: every configurable property this template
    // exposes, tagged with whether it is *applicable* for this spec + data and
    // the *value* the compiler will use (host choice if set, else the engine's
    // recommended default). This is the single contract a host (DF, an AI agent,
    // another renderer) reads to know which controls to surface and how to seed
    // them — see ChartOption / getChartOptions. Passing a non-applicable
    // property back to the compiler is accepted but silently ignored.
    //
    // Each property decides its own applicability through its pure `check(ctx)`
    // (the single source of truth, co-located with the property). The one piece
    // that can't live there is `independentYAxis`'s *recommended default* —
    // whether to turn it on automatically — which is layout-coupled (it needs the
    // resolved facet grid and the assembled spec's facet/y structure, differing
    // for 1-D vs 2-D facets); that value is computed above and threaded in here.
    const evalCtx: OptionEvalContext = {
        encodings,
        channelSemantics,
        data,
        chartProperties,
    };
    const ownsLabels = templateOwnsValueLabels(chartTemplate);
    const valueLabelChoice = resolveValueLabelChoice(chartProperties);
    const explicitValueLabels = valueLabelChoice == null
        ? undefined
        : valueLabelChoice === 'on';
    const layoutCoupledRecommendation: Record<string, any> = {
        independentYAxis: plan.furniture.facets.independentY,
        // Seed the labels toggle from what the house and the density actually
        // decided, so an untouched control shows the theme's own habit and
        // re-seeds when the reader switches theme. Where the template owns its
        // labels, its own boolean is the honest answer.
        showValueLabels: ownsLabels
            ? explicitValueLabels ?? design?.dataLabels?.show
            : design?.dataLabels?.show,
    };
    // Whether offering a labels control means anything is a question about the
    // resolved layout — is there anything to key a number to, and is there room
    // to print it — so only the grounded design can answer it. A chart too
    // dense to read numbers on cannot be argued into it, and neither can one
    // whose template already writes its own text. Templates that print labels
    // *on request* are the exception: they answer to the toggle themselves.
    const designCoupledApplicability: Record<string, boolean> = {
        showValueLabels: !chartTemplate.suppressValueLabels && (ownsLabels
            || (design?.dataLabels?.possible === true && !templateDrawsOwnText)),
        // The older spelling stays an accepted *input* for compatibility, but a
        // host should be shown one switch, not two that fight.
        showTextLabels: false,
    };

    result._options = (chartTemplate.properties ?? []).map((def): ChartOption => {
        const ev = def.check?.(evalCtx);
        const applicable = def.key in designCoupledApplicability
            ? designCoupledApplicability[def.key]
            : ev ? ev.applicable : true;
        const recommended = layoutCoupledRecommendation[def.key] ?? ev?.recommendedValue;
        const value = chartProperties?.[def.key] ?? recommended ?? def.defaultValue;
        // Strip the `check` rule — a ChartOption is the resolved, serializable
        // answer (`applicable`/`value`), not the predicate that produced it.
        const { check, ...rest } = def;
        return { ...rest, applicable, value };
    });
    // Layout-level facet-wrap control: offered whenever a column facet has
    // enough panels to wrap. It's not a per-template MARK property, so it's
    // injected centrally rather than declared on every faceted template. The
    // value seeds from the raw user override, else the auto-computed grid
    // column count (facetGridResult), else all panels in one row.
    const colFacetField = channelSemantics.column?.field;
    if (colFacetField) {
        const colCount = new Set(data.map((r: any) => r[colFacetField])).size;
        if (colCount > 2) {
            const rawFacetCols = input.chart_spec.chartProperties?.facetColumns;
            result._options.push({
                key: 'facetColumns',
                label: 'Columns',
                type: 'continuous',
                min: 1,
                max: colCount,
                step: 1,
                applicable: true,
                value: rawFacetCols ?? facetGridResult?.columns ?? colCount,
            } as ChartOption);
        }
    }
    // Pivot surface: the resolved set of alternative views (state ids + labels +
    // active index) for the current encodings + data. Hosts read this to render
    // a cyclic prev/next control and write the chosen id back to
    // chartProperties[pivot.key]. Absent when the chart has <= 1 state.
    if (transformed.surface) {
        result._transform = transformed.surface;
    }
    // Legacy single-control surface (composed orbit) for backward-compat
    // consumers (getChartPivot). Enumerated from the AUTHORED template so its
    // ids/labels match the pre-split contract. Rendering above is driven by
    // `transformed` (the two-control model); this is surface-only.
    const legacyPivot = applyPivot(authoredTemplate, typedRawEncodings, data, chartProperties, vlGetTemplateDef);
    if (legacyPivot.surface) {
        result._pivot = legacyPivot.surface;
    }
    return { spec: result, plotAsPlanned };
}

/** A note that many dots overlap, and the explicit choices that show where they pile up. */
function crowdingWarning(crowding: NonNullable<LayoutPlan['crowding']>): ChartWarning {
    return {
        severity: 'info',
        code: 'dots-crowded',
        message: `${Math.round(crowding.share * 100)}% of the ${crowding.points} dots touch another at ${crowding.size}px². `
            + 'Smaller dots would not separate them; to show where they pile up, set chartProperties.opacity (e.g. 0.5), '
            + 'or give the theme a ring around dots (geometry.point.halo).',
    };
}

/** The deck's own type, as Vega-Lite names it on a title and in `config.title`, and the title key it becomes. */
const DECK_TYPE: [deck: string, title: string][] = [
    ['subtitleFont', 'font'], ['subtitleFontSize', 'fontSize'], ['subtitleFontStyle', 'fontStyle'],
    ['subtitleFontWeight', 'fontWeight'], ['subtitleColor', 'color'], ['subtitleLineHeight', 'lineHeight'],
];

/**
 * A deck with no headline above it: an author's subtitle alone, or the axis titles a house writes in
 * the deck on a chart with no title. Vega-Lite drops a title whose text is empty, deck and all, so
 * the deck is drawn as the title, in the deck's own type.
 */
function drawDeckWithoutHeadline(spec: any): void {
    const title = spec.title;
    if (!title || typeof title !== 'object' || Array.isArray(title)) return;
    const headline = [title.text ?? []].flat().filter((line: unknown) => typeof line === 'string').join('').trim();
    const deck = [title.subtitle ?? []].flat().filter((line: unknown): line is string => typeof line === 'string' && line.trim() !== '');
    if (headline || deck.length === 0) return;
    const config = spec.config?.title ?? {};
    const drawn: Record<string, unknown> = { ...title, text: deck.length === 1 ? deck[0] : deck };
    delete drawn.subtitle;
    delete drawn.subtitlePadding;
    for (const [deckKey, titleKey] of DECK_TYPE) {
        const value = title[deckKey] ?? config[deckKey];
        delete drawn[deckKey];
        if (value !== undefined) drawn[titleKey] = value;
    }
    // Vega-Lite sets a headline bold; a deck is not, wherever its weight went unsaid.
    drawn.fontWeight ??= 'normal';
    spec.title = drawn;
}

export function assembleVegaLite(input: ChartAssemblyInput): any {
    const prepared = prepareVegaLite(input);
    const analysis = analyzeChart(input, prepared.template, prepared.chartProperties, vlGetTemplateDef);
    const plan = planLayout(analysis, vegaLitePlanContext(input, prepared, analysis));
    return emitVegaLite(input, prepared, analysis, plan).spec;
}

/** The rows a re-plan lays out: a subset of the analysis rows, the rows a window on x shows, or rows the host supplies. */
export type ReplanRows =
    | { keep: (row: Record<string, any>) => boolean }
    | { window: { x: readonly [unknown, unknown] } }
    | { rows: readonly Record<string, unknown>[] };

/** What a re-plan changes: the rows in view, or the room the host gives the chart. */
export type ReplanChange = (ReplanRows & { pinPlot?: boolean }) | { size: { width?: number; height?: number } };

/** A chart planned again: its spec, the plot it draws, and the plan it was emitted from. */
export interface Replanned {
    spec: any;
    plot: { width: number; height: number } | undefined;
    axisLabels: LayoutPlan['axisLabels'];
    dataLabels: LayoutPlan['design']['dataLabels'];
    plan: LayoutPlan;
}

/** A compiled chart that keeps its analysis, so it can be planned again for other rows or another size. */
export interface VegaLiteSession {
    /** The chart as compiled. */
    readonly spec: any;
    /** The plot the chart draws; undefined when it draws several views. */
    readonly plot: { width: number; height: number } | undefined;
    /** The tick labels each axis draws, as planned. */
    readonly axisLabels: LayoutPlan['axisLabels'];
    /** The theme's value-label decisions the chart drew with. */
    readonly dataLabels: LayoutPlan['design']['dataLabels'];
    /** The plan the chart was compiled from. */
    readonly plan: LayoutPlan;
    /**
     * The chart planned again from the same analysis. A change of rows plans them into the frame
     * the chart has, keeping its title fit and the room it keeps for furniture; `pinPlot` also holds
     * the plot, as a window into the data does. A change of size plans the whole chart again for
     * the new room, title and furniture room included, and later changes of rows plan into that.
     */
    replan(change: ReplanChange): Replanned;
}

/**
 * A chart's title and plot size as the plan fits the title, and as realization fits it on its own
 * from the built spec. Kept equal by a test.
 */
export function vegaLiteTitleFits(input: ChartAssemblyInput): { planned: unknown; own: unknown; composite: boolean } {
    const prepared = prepareVegaLite(input);
    const analysis = analyzeChart(input, prepared.template, prepared.chartProperties, vlGetTemplateDef);
    const plan = planLayout(analysis, vegaLitePlanContext(input, prepared, analysis));
    // The fit, not the place: where a centred title sits is the plan's alone.
    const fitted = (spec: any) => {
        const { dx: _dx, ...title } = spec.title && typeof spec.title === 'object' ? spec.title : { text: spec.title };
        return { title: spec.title && typeof spec.title === 'object' ? title : spec.title, plot: plotSizeFields(spec) };
    };
    return {
        planned: fitted(emitVegaLite(input, prepared, analysis, plan).spec),
        own: fitted(emitVegaLite(input, prepared, analysis, { ...plan, title: undefined }).spec),
        composite: plan.composite,
    };
}

/** The rows the chart draws as a table, titled, printed and styled as the Vega-Lite chart draws them. */
export function vegaLiteTable(input: ChartAssemblyInput): ChartTable {
    const prepared = prepareVegaLite(input);
    const analysis = analyzeChart(input, prepared.template, prepared.chartProperties, vlGetTemplateDef);
    return chartTable(input, analysis, planLayout(analysis, vegaLitePlanContext(input, prepared, analysis)));
}

/** A chart's analysis, plan and compiled spec, for checks that compare the plan with what the backend draws. */
export function vegaLiteStages(input: ChartAssemblyInput): { analysis: ChartAnalysis; plan: LayoutPlan; spec: any } {
    const prepared = prepareVegaLite(input);
    const analysis = analyzeChart(input, prepared.template, prepared.chartProperties, vlGetTemplateDef);
    const plan = planLayout(analysis, vegaLitePlanContext(input, prepared, analysis));
    return { analysis, plan, spec: emitVegaLite(input, prepared, analysis, plan).spec };
}

/** The structure the plan reads for a chart and the structure its template builds. Kept equal by a test. */
export function vegaLiteStructures(input: ChartAssemblyInput): { planned: ChartStructure; built: BuiltFacts } {
    const prepared = prepareVegaLite(input);
    const analysis = analyzeChart(input, prepared.template, prepared.chartProperties, vlGetTemplateDef);
    const plan = planLayout(analysis, vegaLitePlanContext(input, prepared, analysis));
    const built = vegaLiteBuiltFacts(instantiateVegaLite(input, prepared, analysis, plan).spec, plan.rows);
    return { planned: plan.structure, built };
}

/** The decisions the plan made for a chart that its emitted spec does not draw as made. */
export function vegaLiteHonour(input: ChartAssemblyInput): PlanDeparture[] {
    const prepared = prepareVegaLite(input);
    const analysis = analyzeChart(input, prepared.template, prepared.chartProperties, vlGetTemplateDef);
    const plan = planLayout(analysis, vegaLitePlanContext(input, prepared, analysis));
    const { spec, plotAsPlanned } = emitVegaLite(input, prepared, analysis, plan);
    const fields = Object.fromEntries(Object.entries(analysis.channelSemantics)
        .filter(([, cs]) => cs?.field).map(([channel, cs]) => [channel, escapeVlFieldName(cs.field)]));
    return vegaLiteDepartures(plan, spec, plotAsPlanned, fields);
}

/**
 * The plot's height as drawn: the plan's drawn view, once a broken title, a theme's closing rules,
 * the header and the source line have taken theirs from it where the plot gives them.
 */
function drawnHeight(plan: LayoutPlan): number {
    const [view] = plan.views ? plotViews(plan.views) : [];
    if (view) return view.height;
    const titled = heightAfterTitle(plan.plot.height, plan.title);
    return plan.rules?.fromPlot ? plotHeightAfter(titled, plan.rules.room) : titled;
}

export function openVegaLiteSession(
    input: ChartAssemblyInput,
    options: { pins?: Pick<NonNullable<PlanContext['pins']>, 'axisLabels' | 'reserve'> } = {},
): VegaLiteSession {
    const mounted = prepareVegaLite(input);
    const analysis = analyzeChart(input, mounted.template, mounted.chartProperties, vlGetTemplateDef);
    const contextFor = (prepared: VegaLitePreparation): PlanContext => {
        const planned = vegaLitePlanContext(input, prepared, analysis);
        return options.pins ? { ...planned, pins: { ...planned.pins, ...options.pins } } : planned;
    };
    const drawnPlot = (planned: LayoutPlan, plotAsPlanned: boolean) =>
        planned.composite || !plotAsPlanned ? undefined
            : { width: planned.plot.width, height: drawnHeight(planned) };
    const emitted = (prepared: VegaLitePreparation, plan: LayoutPlan): Replanned => {
        const out = emitVegaLite(input, prepared, analysis, plan);
        return { spec: out.spec, plot: drawnPlot(plan, out.plotAsPlanned), axisLabels: plan.axisLabels, dataLabels: plan.design.dataLabels, plan };
    };
    const xField = analysis.channelSemantics.x?.field;
    const rowsOf = (change: ReplanRows): any[] => {
        if ('keep' in change) return analysis.convertedData.filter(change.keep);
        if ('window' in change) return xField ? analysis.convertedData.filter((row) => inWindow(positionOf(row?.[xField]), change.window.x)) : analysis.convertedData;
        return analysis.shapeRows(change.rows);
    };
    // The frame: the plan at the session's size for all rows, whose plot, title and room a change of rows keeps.
    let prepared = mounted;
    let context = contextFor(prepared);
    let frame = planLayout(analysis, context);
    const planRows = (change: ReplanRows & { pinPlot?: boolean }): Replanned => emitted(prepared, planLayout(analysis, {
        ...context,
        rows: rowsOf(change),
        pins: {
            ...context.pins,
            ...(change.pinPlot ? { plot: frame.plot } : {}),
            ...(frame.title ? { title: frame.title } : {}),
            ...(frame.reserve ? { reserve: frame.reserve } : {}),
            ...(frame.canvasFit?.treatment ? { treatment: frame.canvasFit.treatment } : {}),
        },
    }));
    const first = emitted(prepared, frame);
    return {
        spec: first.spec,
        plot: first.plot,
        axisLabels: first.axisLabels,
        dataLabels: first.dataLabels,
        plan: frame,
        replan: (change) => {
            if ('size' in change) {
                prepared = { ...mounted, ...plannedSize(withCanvasSize(input, change.size), mounted.themeSpec) };
                context = contextFor(prepared);
                frame = planLayout(analysis, context);
                return emitted(prepared, frame);
            }
            return planRows(change);
        },
    };
}


/**
 * Does this template print its own value labels, rather than leaving them to
 * the theme's data-label layer?
 */
function templateOwnsValueLabels(template: ChartTemplateDef): boolean {
    return template.ownsValueLabels === true;
}

/**
 * Inspect a chart spec + dataset and report the configurable options Flint
 * exposes for it, each annotated with whether it is *applicable* and the *value*
 * the compiler will use (see ChartOption).
 *
 * This is the "ask Flint what knobs are available" entry point. A host calls it
 * with the same input it would pass to `assembleVegaLite`, renders a control for
 * each applicable option seeded from `value`, and feeds the user's choices back
 * via `chart_spec.chartProperties`. Because applicability is derived from the
 * data (not from the chosen values), the set is stable across that loop.
 *
 * It runs the same analysis pipeline as `assembleVegaLite` (the options are a
 * by-product of assembly), so applicability can never drift from what the
 * compiler actually does — a property reported applicable is exactly one the
 * compiler will honor.
 */
export function getChartOptions(input: ChartAssemblyInput): ChartOption[] {
    const spec = assembleVegaLite(input);
    return spec && Array.isArray(spec._options) ? spec._options : [];
}

/**
 * Inspect a chart spec + dataset and report the pivot surface Flint exposes for
 * it — the ordered alternative views (orientation/role/facet) the host can cycle
 * through, with the active index. Returns `undefined` when the chart has a
 * single view (no control should be shown). Mirrors getChartOptions: it runs the
 * same analysis pipeline so the surface can never drift from what the compiler
 * actually does. The host renders a cyclic control seeded from `index` and
 * writes the chosen `ids[next]` back to `chart_spec.chartProperties[key]`.
 */
export function getChartPivot(input: ChartAssemblyInput): PivotSurface | undefined {
    const spec = assembleVegaLite(input);
    return spec && spec._pivot ? (spec._pivot as PivotSurface) : undefined;
}

/**
 * Inspect a chart spec + dataset and report the two-control transform surface
 * Flint exposes for it — Control B (chart-type transitions, a dropdown) and
 * Control A (local rearrangement group, a stepper). Either sub-surface is
 * absent when that control has a single state. Mirrors getChartPivot but for the
 * factored model (design-docs/chart-transform-two-axes.md). Hosts render a
 * dropdown seeded from `chartType.index` (writing the chosen id to
 * chartProperties.chartType) and a cyclic stepper seeded from `arrange.index`
 * (writing chartProperties.arrange).
 */
export function getChartTransform(input: ChartAssemblyInput): TransformSurface | undefined {
    const spec = assembleVegaLite(input);
    return spec && spec._transform ? (spec._transform as TransformSurface) : undefined;
}

// ===========================================================================
// buildVLEncodings — Translate abstract semantics → VL encoding objects
// ===========================================================================

/**
 * Translate Phase 0 channel semantics + declaration overrides into
 * concrete Vega-Lite encoding objects. This is the only place outside
 * template.instantiate() that constructs VL-specific syntax.
 */

function buildVLEncodings(
    encodings: Record<string, ChartEncoding>,
    channelSemantics: Record<string, import('../core/types').ChannelSemantics>,
    declaration: LayoutDeclaration,
    data: any[],
    canvasSize: { width: number; height: number },
    semanticTypes: Record<string, string | SemanticAnnotation>,
    templateMarkType: string | undefined,
    chartTemplate: ChartTemplateDef,
    fieldDisplayNames?: Record<string, string>,
    chartProperties?: Record<string, any>,
    orders: Partial<Record<string, CategoryOrder>> = {},
    sizes?: LayoutPlan['sizes'],
): Record<string, any> {
    const resolvedEncodings: Record<string, any> = {};

    // Only process channels the template declares (plus facets which are always valid)
    const templateChannels = new Set([
        ...(chartTemplate.channels || []),
        'column', 'row',  // faceting is always allowed
    ]);

    for (const [channel, encoding] of Object.entries(encodings)) {
        // Skip channels not supported by this chart type
        if (!templateChannels.has(channel)) continue;

        const encodingObj: any = {};
        const fieldName = encoding.field;
        const cs = channelSemantics[channel];

        if (channel === "radius") {
            encodingObj.scale = { type: "sqrt", zero: true };
        }

        // Handle count aggregate without a field
        if (!fieldName && encoding.aggregate === "count") {
            encodingObj.field = "_count";
            encodingObj.type = "quantitative";
        }

        if (fieldName) {
            const escapedFieldName = escapeVlFieldName(fieldName);
            encodingObj.field = escapedFieldName;

            // Use Phase 0's resolved type
            encodingObj.type = cs?.type || 'nominal';

            // Explicit type override
            if (encoding.type) {
                encodingObj.type = encoding.type;
            } else if (channel === 'column' || channel === 'row') {
                if (encodingObj.type !== 'nominal' && encodingObj.type !== 'ordinal') {
                    encodingObj.type = 'nominal';
                }
            }

            // Aggregation handling — point the encoding at the derived column.
            // applyAggregation (run before semantics) produces `${field}_${op}`
            // / `_count` when the caller requests it; a pre-aggregated caller
            // supplies that column directly.
            if (encoding.aggregate) {
                if (encoding.aggregate === "count") {
                    encodingObj.field = "_count";
                    encodingObj.type = "quantitative";
                } else {
                    encodingObj.field = escapeVlFieldName(`${fieldName}_${encoding.aggregate}`);
                    encodingObj.type = "quantitative";
                }
            }

            // Scale: quantitative X axes need tight domains for line-like marks
            if (encodingObj.type === "quantitative" && channel === "x") {
                if (TIGHT_X_MARKS.has(templateMarkType ?? '')) {
                    encodingObj.scale = { nice: false };
                }
            }

        }

        // Size channel: set scale based on resolved encoding type
        if (channel === "size" && sizes) {
            encodingObj.scale = sizes.quantitative ? { type: "sqrt", zero: true, range: sizes.range } : { range: sizes.range };
        }

        // --- Sorting ---
        const order = orders[channel];
        if (order) encodingObj.sort = vegaLiteSort(order);

        // Color scheme from Phase 0 decisions; stops the author listed are laid on after the theme.
        if (channel === "color" || channel === "group") {
            const named = schemeName(encoding.scheme);
            if (named && named !== "default") {
                if ('scale' in encodingObj) {
                    encodingObj.scale.scheme = named;
                } else {
                    encodingObj.scale = { scheme: named };
                }
            } else if (fieldName && cs?.colorScheme) {
                if (!('scale' in encodingObj)) {
                    encodingObj.scale = {};
                }
                encodingObj.scale.scheme = cs.colorScheme.scheme;
                if (cs.colorScheme.type === 'diverging' && cs.colorScheme.domainMid !== undefined) {
                    encodingObj.scale.domainMid = cs.colorScheme.domainMid;
                }
            }
        }

        const { title } = encodingTitle(channel, encoding, cs, fieldDisplayNames, escapeVlFieldName);
        if (title !== undefined) encodingObj.title = title;

        // --- Collect resolved encoding ---
        if (Object.keys(encodingObj).length !== 0) {
            resolvedEncodings[channel] = encodingObj;
        }
    }

    // --- Apply declaration overrides ---

    // Apply resolved types from declareLayoutMode
    if (declaration.resolvedTypes) {
        for (const [ch, type] of Object.entries(declaration.resolvedTypes)) {
            if (resolvedEncodings[ch]) {
                resolvedEncodings[ch].type = type;
            }
        }
    }

    // Translate group channel → VL color + xOffset/yOffset encodings
    const groupCS = channelSemantics.group;
    if (groupCS?.field && resolvedEncodings.group) {
        const { axis: groupAxis, dodges } = groupDodge(
            { x: resolvedEncodings.x?.type, y: resolvedEncodings.y?.type },
            { x: channelSemantics.x?.field, y: channelSemantics.y?.field },
            groupCS.field, data, chartProperties?.dodge,
        );
        const offsetChannel = groupAxis === 'x' ? 'xOffset' : 'yOffset';

        // Map group → color encoding
        if (!resolvedEncodings.color) {
            resolvedEncodings.color = { ...resolvedEncodings.group };
        }
        delete resolvedEncodings.group;

        // Create offset encoding for position subdivision.
        // Coordinate sort with color so bar order matches legend order.
        if (dodges && !resolvedEncodings[offsetChannel]) {
            const offsetEnc: any = { field: groupCS.field, type: 'nominal' };
            if (resolvedEncodings.color?.sort !== undefined) {
                offsetEnc.sort = resolvedEncodings.color.sort;
            }
            resolvedEncodings[offsetChannel] = offsetEnc;
        }
    }

    // Merge template encoding defaults (bin, aggregate, etc.)
    const templateEncoding = chartTemplate.template?.encoding;
    if (templateEncoding) {
        for (const [ch, enc] of Object.entries(templateEncoding)) {
            if (enc && typeof enc === 'object' && Object.keys(enc as any).length > 0) {
                if (resolvedEncodings[ch]) {
                    resolvedEncodings[ch] = { ...(enc as any), ...resolvedEncodings[ch] };
                }
            }
        }
    }

    return resolvedEncodings;
}

// ===========================================================================
// restructureFacets — VL-specific spec transforms for faceted charts
// ===========================================================================

/**
 * Purely structural VL transform for faceted charts.
 *
 * This function does NOT decide wrapping or column counts — that is done
 * earlier by computeFacetGrid, which returns a `FacetGridResult`.  This function
 * only:
 *   1. Moves `encoding.column` → `encoding.facet` (with `columns: N`).
 *   2. For layered specs, hoists to top-level `facet` + `spec`.
 */
/** The gap the plan states between facet panels: the outermost facet's, or that of the facets a concat sets side by side. */
function plannedFacetGap(views: ViewNode | undefined): { row: number; column: number } | undefined {
    if (!views || views.kind === 'view') return undefined;
    if (views.kind === 'facet') return views.gap;
    for (const child of views.children) {
        const gap = plannedFacetGap(child);
        if (gap) return gap;
    }
    return undefined;
}

/**
 * Writes the facet gap where Vega-Lite reads it: each row and column field, the spec of a facet
 * operator, and the config, a pair only for a wrapped facet, since a row or column field without
 * its own gap takes a config pair whole.
 */
function writeFacetGap(vgObj: any, gap: { row: number; column: number }, config: any = vgObj.config): void {
    const spacing = gap.row === gap.column ? gap.row : { row: gap.row, column: gap.column };
    const fields = vgObj.facet && vgObj.spec ? vgObj.facet : vgObj.encoding;
    const wrapped = Boolean(fields?.facet || (vgObj.facet && vgObj.spec && vgObj.facet.field));
    config.facet = { ...config.facet, spacing: wrapped ? spacing : gap.column };
    if (vgObj.facet && vgObj.spec) vgObj.spacing = spacing;
    if (fields?.row && typeof fields.row === 'object') fields.row.spacing = gap.row;
    if (fields?.column && typeof fields.column === 'object') fields.column.spacing = gap.column;
}

function restructureFacets(
    vgObj: any,
    nominalCounts: Record<string, number>,
    facetGrid?: { columns: number; rows: number },
): void {

    const isConcatSpec = () => Array.isArray(vgObj.hconcat) || Array.isArray(vgObj.vconcat) || Array.isArray(vgObj.concat);

    const hoistConcatIntoFacet = (facetDef: any, wrapColumns?: number) => {
        const childSpec: any = {};
        for (const key of ['hconcat', 'vconcat', 'concat', 'resolve', 'spacing', 'align', 'bounds', 'center'] as const) {
            if (vgObj[key] !== undefined) {
                childSpec[key] = vgObj[key];
                delete vgObj[key];
            }
        }
        if (vgObj.encoding && Object.keys(vgObj.encoding).length > 0) {
            childSpec.encoding = vgObj.encoding;
            delete vgObj.encoding;
        }

        vgObj.facet = facetDef;
        if (wrapColumns != null) {
            vgObj.columns = wrapColumns;
        }
        vgObj.spec = childSpec;
        vgObj.resolve = {
            ...(vgObj.resolve || {}),
            scale: { ...(vgObj.resolve?.scale || {}), y: 'independent' },
        };
    };

    if (vgObj.encoding?.column != undefined && vgObj.encoding?.row == undefined) {
        vgObj.encoding.facet = vgObj.encoding.column;

        // Use the grid decided by computeFacetGrid.
        const numCols = facetGrid?.columns ?? (nominalCounts.column || 1);
        const numRows = facetGrid?.rows ?? 1;

        vgObj.encoding.facet.columns = numCols;

        // Axis title suppression for faceted charts is handled by
        // vlApplyLayoutToSpec, which uses actual subplot dimensions
        // to decide whether titles should be hidden (size-based threshold).

        delete vgObj.encoding.column;

        // Faceting a concat spec must use top-level `facet` + child
        // `spec`. Inline `encoding.facet` is ignored/invalid for
        // hconcat/vconcat, which is the structure used by Bar Table.
        if (isConcatSpec()) {
            const facetDef = { ...vgObj.encoding.facet };
            delete facetDef.columns;
            delete vgObj.encoding.facet;
            if (Object.keys(vgObj.encoding).length === 0) {
                delete vgObj.encoding;
            }
            hoistConcatIntoFacet(facetDef, numCols);
            return;
        }

        // For layered specs, VL doesn't support encoding.facet inline —
        // restructure to top-level facet + spec.
        // IMPORTANT: In top-level facet mode, `columns` must be a sibling
        // of `facet`, not nested inside it. (VL ignores columns inside
        // the facet object when it's a top-level property.)
        if (vgObj.layer && Array.isArray(vgObj.layer)) {
            const facetDef = { ...vgObj.encoding.facet };
            const wrapColumns = facetDef.columns;
            delete facetDef.columns; // remove from facet object
            delete vgObj.encoding.facet;

            vgObj.facet = facetDef;
            if (wrapColumns != null) {
                vgObj.columns = wrapColumns; // top-level sibling
            }
            vgObj.spec = {
                layer: vgObj.layer,
                encoding: vgObj.encoding,
            };
            delete vgObj.layer;
            delete vgObj.encoding;
        }

        return;
    }

    // For concat specs with row-only or column+row facets
    if (isConcatSpec() && (vgObj.encoding?.column || vgObj.encoding?.row)) {
        const facetDef: any = {};
        if (vgObj.encoding.column) {
            facetDef.column = vgObj.encoding.column;
            delete vgObj.encoding.column;
        }
        if (vgObj.encoding.row) {
            facetDef.row = vgObj.encoding.row;
            delete vgObj.encoding.row;
        }
        if (Object.keys(vgObj.encoding).length === 0) {
            delete vgObj.encoding;
        }
        hoistConcatIntoFacet(facetDef);
        return;
    }

    // For layered specs with row-only or column+row facets
    if (vgObj.layer && Array.isArray(vgObj.layer) &&
        (vgObj.encoding?.column || vgObj.encoding?.row)) {
        const facetDef: any = {};
        if (vgObj.encoding.column) {
            facetDef.column = vgObj.encoding.column;
            delete vgObj.encoding.column;
        }
        if (vgObj.encoding.row) {
            facetDef.row = vgObj.encoding.row;
            delete vgObj.encoding.row;
        }
        vgObj.facet = facetDef;
        vgObj.spec = {
            layer: vgObj.layer,
            encoding: vgObj.encoding,
        };
        delete vgObj.layer;
        delete vgObj.encoding;
    }
}

/** The chart's source, trimmed; a blank one is none. */
function sourceOf(source: string | { text: string; href?: string } | undefined): string | { text: string; href?: string } | undefined {
    if (typeof source === 'string') return source.trim() || undefined;
    if (source && typeof source.text === 'string' && source.text.trim()) return { text: source.text.trim(), ...(source.href ? { href: source.href } : {}) };
    return undefined;
}
