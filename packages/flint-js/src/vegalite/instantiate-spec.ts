// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * =============================================================================
 * PHASE 2: INSTANTIATE SPEC
 * =============================================================================
 *
 * Combine semantic decisions (Phase 0) and layout dimensions (Phase 1) to
 * produce the final Vega-Lite specification.
 *
 * This is the **only phase that knows about Vega-Lite** (or whichever
 * output format is targeted).
 *
 * VL dependency: **Yes — this is where VL lives**
 * =============================================================================
 */

import type {
    ChannelSemantics,
    InstantiateContext,
    ChartWarning,
} from '../core/types';
import { formatSpecToLabelExpr } from './format';
import { measureDomain, type MeasureDomain } from '../core/measure-domain';
import type { AxisRuler } from '../core/ruler';
import type { LayoutPlan } from '../core/plan';
import { AXIS_LABEL_LIMIT } from '../core/compute-layout';
import { planAxisLabels, type AxisLabelPlan } from '../core/axis-labels';
import { OWNED_AXIS_KEYS } from './owned-axis-keys';
import {
    timeMillisecond, timeSecond, timeMinute, timeHour, timeDay, timeWeek, timeMonth, timeYear,
    utcMillisecond, utcSecond, utcMinute, utcHour, utcDay, utcWeek, utcMonth, utcYear,
} from 'd3-time';
import { timeFormat, utcFormat } from 'd3-time-format';
import { hostTextMeasurer } from '../core/text-width';

const DEFAULT_QUANTITATIVE_AXIS_FORMAT = ',.12~g';
const VEGA_AXIS_LABEL_LIMIT = AXIS_LABEL_LIMIT;

/** Whether a template states its own labels for this axis, so the band labels are left as it wrote them. */
export function templateStatesAxisLabels(template: any, channel: 'x' | 'y'): boolean {
    return [template.encoding?.[channel], ...(template.layer ?? []).map((layer: any) => layer.encoding?.[channel])]
        .filter(Boolean)
        .some((encoding) => encoding.axis === null || encoding.axis === false
            || encoding.axis?.labelExpr !== undefined || encoding.axis?.labelAngle !== undefined
            || encoding.axis?.labelLimit !== undefined || encoding.axis?.format !== undefined);
}

// ---------------------------------------------------------------------------
// Public API: instantiateSpec
// ---------------------------------------------------------------------------

/**
 * Phase 2: Build the final VL specification from semantic decisions and
 * layout results.
 *
 * This is the shared assembler logic that translates abstract decisions
 * into VL syntax. Template-specific logic is handled by
 * template.instantiate(spec, context).
 *
 * This function handles the VL-specific plumbing that is common across
 * all templates:
 *   - Canvas dimensions (config.view.continuousWidth/Height)
 *   - Discrete step sizing (width: {step: N})
 *   - Zero-baseline application
 *   - Color scheme application
 *   - Temporal format application
 *   - Label sizing application
 *   - Overflow warning styling
 *
 * @param vgObj       The mutated VL spec (after template encoding construction)
 * @param context     Combined context from all phases
 * @param warnings    Array to append warnings to
 */
export function vlApplyLayoutToSpec(
    vgObj: any,
    context: InstantiateContext,
    warnings: ChartWarning[],
    axisLabels: Record<'x' | 'y', AxisLabelPlan> = planAxisLabels(context.layout, {}, undefined),
    themed = false,
    domains?: Partial<Record<'x' | 'y', MeasureDomain>>,
    rulers: Partial<Record<'x' | 'y', AxisRuler>> = {},
    bandSpans: LayoutPlan['bandSpans'] = {},
): void {
    const { channelSemantics, layout } = context;

    const xIsDiscrete = layout.xNominalCount > 0;
    const yIsDiscrete = layout.yNominalCount > 0;

    // --- Helper: iterate encoding targets across top-level, spec, and layers ---
    // After facet restructuring, encodings may live under vgObj.spec instead
    // of vgObj directly, and layers may be under vgObj.spec.layer.
    const collectEncodingTargets = (ch: string): any[] => {
        const targets: any[] = [];
        if (vgObj.encoding?.[ch]) targets.push(vgObj.encoding[ch]);
        if (vgObj.spec?.encoding?.[ch]) targets.push(vgObj.spec.encoding[ch]);
        if (Array.isArray(vgObj.layer)) {
            for (const layer of vgObj.layer) {
                if (layer.encoding?.[ch]) targets.push(layer.encoding[ch]);
            }
        }
        if (Array.isArray(vgObj.spec?.layer)) {
            for (const layer of vgObj.spec.layer) {
                if (layer.encoding?.[ch]) targets.push(layer.encoding[ch]);
            }
        }
        return targets;
    };

    // --- Apply zero-baseline decisions ---
    for (const ch of ['x', 'y'] as const) {
        const cs = channelSemantics[ch];
        const zero = domains ? domains[ch]?.zero : cs?.zero?.zero;
        if (zero === undefined) continue;

        const targets = collectEncodingTargets(ch)
            .filter(enc => enc.type === 'quantitative');

        for (const enc of targets) {
            // Skip binned encodings — the bin axis represents data values,
            // not bar length, so zero-baseline is inappropriate (e.g. histograms).
            if (enc.bin) continue;
            // Skip encodings using a private/synthetic field distinct from
            // the channel's semantic field (e.g. Radar's `__y` polar coord).
            if (cs?.field && enc.field && enc.field !== cs.field) continue;
            if (!enc.scale) enc.scale = {};
            if (enc.scale.zero !== undefined) continue;
            if (enc.scale.domain && Array.isArray(enc.scale.domain)) continue;

            enc.scale.zero = zero;

            // No explicit domain padding — VL's native `nice` rounding
            // (on by default) already provides breathing room with clean
            // tick-aligned bounds, which is superior to computed fractional
            // bounds like [1.86, 4.94] that also conflict with semantic
            // domain constraints and log scales.
        }
    }

    // --- Apply field-context semantic decisions (format, domain, ticks, etc.) ---
    vlApplyFieldContext(vgObj, channelSemantics, collectEncodingTargets, context, domains);

    // --- Write the planned rulers: the domain unrounded, and the ticks with their count so none is thinned ---
    for (const [ch, ruler] of Object.entries(rulers) as Array<['x' | 'y', AxisRuler]>) {
        for (const enc of collectEncodingTargets(ch)) {
            if ((enc.type && enc.type !== 'quantitative') || enc.bin) continue;
            // A template that states its own ticks (a ridgeline marking its rounds) lines other marks up with them.
            if (Array.isArray(enc.axis?.values)) continue;
            const scale = { ...(enc.scale ?? {}), nice: false };
            if (scale.domain != null) scale.domain = ruler.domain;
            else Object.assign(scale, { domainMin: ruler.domain[0], domainMax: ruler.domain[1] });
            enc.scale = scale;
            if (enc.axis !== null) enc.axis = { ...(enc.axis ?? {}), values: ruler.values, tickCount: ruler.values.length };
        }
    }

    // --- Apply safe default formatting to positional axes ---
    vlApplyDefaultAxisFormat(vgObj, collectEncodingTargets, context, axisLabels, themed);

    // --- Apply temporal formatting ---
    const applyTemporalFormat = (enc: any, channel: string, cs: ChannelSemantics | undefined) => {
        if (!enc || !cs?.temporalFormat) return;
        if (enc.type === 'temporal') {
            if (channel === 'color') {
                if (!enc.legend) enc.legend = {};
                enc.legend.format = cs.temporalFormat;
            }
            // x/y: intentionally omitted — let VL use native multi-level labels
        }
    };

    // Discrete (ordinal/nominal) temporal axes and legends render the raw
    // string value as-is. A discrete axis treats values as opaque categories,
    // so the label should match what's in the table (e.g. "2010-01"). We avoid
    // toDate/timeFormat reformatting here: it added no value for already-string
    // data and risked timezone-shifted labels ("2010-01" → "Dec 2009"). If a
    // column genuinely needs date parsing/formatting (e.g. numeric timestamps),
    // the user can switch that axis to temporal (continuous), where Vega-Lite
    // handles parsing and multi-level labels natively.

    // Iterate all encoding locations (top-level, spec, layers)
    const applyTemporalToEncoding = (encoding: Record<string, any>) => {
        for (const [ch, enc] of Object.entries(encoding)) {
            applyTemporalFormat(enc, ch, channelSemantics[ch]);
        }
    };

    if (vgObj.encoding) applyTemporalToEncoding(vgObj.encoding);
    if (vgObj.spec?.encoding) applyTemporalToEncoding(vgObj.spec.encoding);
    if (Array.isArray(vgObj.layer)) {
        for (const layer of vgObj.layer) {
            if (layer.encoding) applyTemporalToEncoding(layer.encoding);
        }
    }
    if (Array.isArray(vgObj.spec?.layer)) {
        for (const layer of vgObj.spec.layer) {
            if (layer.encoding) applyTemporalToEncoding(layer.encoding);
        }
    }

    // --- Write the planned spans of banded continuous axes, where no domain is stated ---
    // Labelled heatmaps move X/Y onto rect and text layers, so every matching target takes the span.
    for (const [axis, planned] of Object.entries(bandSpans) as Array<['x' | 'y', NonNullable<LayoutPlan['bandSpans']['x']>]>) {
        for (const enc of collectEncodingTargets(axis)) {
            if (enc.bin || enc.scale?.domain) continue;
            if (enc.type !== (planned.temporal ? 'temporal' : 'quantitative')) continue;
            const [min, max] = planned.span;
            enc.scale = {
                ...(enc.scale ?? {}),
                nice: false,
                ...(planned.temporal
                    ? { domain: [new Date(min).toISOString(), new Date(max).toISOString()] }
                    : { zero: false, domain: [min, max] }),
            };
        }
    }

    // --- Canvas sizing ---
    const axisXConfig: Record<string, any> = {
        labelLimit: axisLabels.x.limit,
        labelFontSize: axisLabels.x.fontSize,
        titleFontSize: layout.titleFontSize,
    };
    const axisYConfig: Record<string, any> = {
        labelFontSize: axisLabels.y.fontSize,
        titleFontSize: layout.titleFontSize,
    };
    if (axisLabels.y.limit !== undefined && !(layout.yLabel.labelLines && layout.yLabel.labelValues)) {
        axisYConfig.labelLimit = axisLabels.y.limit;
    }
    for (const [channel, config] of [['x', axisXConfig], ['y', axisYConfig]] as const) {
        const labels = axisLabels[channel];
        if (labels.angle === undefined) continue;
        config.labelAngle = labels.angle;
        if (labels.align !== undefined) config.labelAlign = labels.align;
        if (labels.baseline !== undefined) config.labelBaseline = labels.baseline;
        const fit = labels.overflowFit;
        if (fit?.step === 'skip' && fit.shown) {
            // The names on round values (16:45, 17:00 …), looked up by the value as written; each band keeps its tick.
            config.labelExpr = `indexof(${JSON.stringify(fit.shown)}, toString(datum.value)) >= 0 ? datum.label : ''`;
        }
    }
    for (const channel of ['x', 'y'] as const) {
        const sizing = channel === 'x' ? layout.xLabel : layout.yLabel;
        if (!sizing.labelLines || !sizing.labelValues) continue;
        const targets = collectEncodingTargets(channel);
        if (targets.some((encoding) => encoding.axis === null || encoding.axis === false
            || encoding.axis?.labelExpr !== undefined || encoding.axis?.labelAngle !== undefined
            || encoding.axis?.labelLimit !== undefined || encoding.axis?.format !== undefined)) continue;
        const config = channel === 'x' ? axisXConfig : axisYConfig;
        const labelIndex = `indexof(${JSON.stringify(sizing.labelValues)}, toString(datum.value))`;
        Object.assign(config, {
            labelAngle: axisLabels[channel].angle,
            labelAlign: axisLabels[channel].align,
            labelBaseline: axisLabels[channel].baseline,
            labelLimit: axisLabels[channel].limit,
            labelLineHeight: axisLabels[channel].lineHeight,
            labelExpr: `${labelIndex} < 0 ? datum.label : ${JSON.stringify(sizing.labelLines)}[${labelIndex}]`,
        });
        if (channel === 'y') {
            const offsets = sizing.labelLines.map(lines => -(lines.length - 1) * (sizing.labelLineHeight ?? sizing.fontSize + 2) / 2);
            config.labelOffset = { expr: `${labelIndex} < 0 ? 0 : ${JSON.stringify(offsets)}[${labelIndex}]` };
        }
    }
    if (axisLabels.x.separation !== undefined) axisXConfig.labelSeparation = axisLabels.x.separation;
    if (axisLabels.y.separation !== undefined) axisYConfig.labelSeparation = axisLabels.y.separation;

    // The template's own config stands where the layout sets nothing.
    const templateConfig = vgObj.config ?? {};
    vgObj.config = {
        ...templateConfig,
        view: {
            ...templateConfig.view,
            continuousWidth: layout.subplotWidth,
            continuousHeight: layout.subplotHeight,
            ...((!vgObj.encoding || vgObj._hideViewStroke) && { stroke: null }),
        },
        axisX: { ...templateConfig.axisX, ...axisXConfig },
        axisY: { ...templateConfig.axisY, ...axisYConfig },
        legend: {
            ...templateConfig.legend,
            labelFontSize: layout.legendFontSize,
            titleFontSize: layout.titleFontSize,
        },
    };

    // --- Step-based sizing for discrete axes ---
    const plotSpec = vgObj.facet && vgObj.spec ? vgObj.spec : vgObj;
    if (xIsDiscrete && typeof plotSpec.width !== 'number') {
        plotSpec.width = layout.xStepUnit === 'group'
            ? { step: layout.xStep, for: 'position' }
            : { step: layout.xStep };
    }
    if (yIsDiscrete && typeof plotSpec.height !== 'number') {
        plotSpec.height = layout.yStepUnit === 'group'
            ? { step: layout.yStep, for: 'position' }
            : { step: layout.yStep };
    }

    // Sync hardcoded template width/height to config.view
    if (typeof plotSpec.width === 'number') {
        vgObj.config.view.continuousWidth = plotSpec.width;
    } else if (plotSpec.width && typeof plotSpec.width === 'object' && 'step' in plotSpec.width) {
        plotSpec.width = layout.xStepUnit === 'group'
            ? { step: layout.xStep, for: 'position' }
            : { step: layout.xStep };
    }
    if (typeof plotSpec.height === 'number') {
        vgObj.config.view.continuousHeight = plotSpec.height;
    } else if (plotSpec.height && typeof plotSpec.height === 'object' && 'step' in plotSpec.height) {
        plotSpec.height = layout.yStepUnit === 'group'
            ? { step: layout.yStep, for: 'position' }
            : { step: layout.yStep };
    }

    // Facet header sizing — constrain labels to subplot width
    const totalFacets = (layout.facet?.columns ?? 1) * (layout.facet?.rows ?? 1);
    const facetRows = layout.facet?.rows ?? 1;
    const facetCols = layout.facet?.columns ?? 1;
    if (facetRows > 1 || facetCols > 1) {
        // Constrain each header's labels to the subplot it belongs to:
        //   • column / wrap-facet headers run horizontally on top → bound by WIDTH
        //   • row headers run rotated down the side → bound by HEIGHT
        // Only inject the configs for the facet channels that actually exist.
        const enc = vgObj.encoding || vgObj.spec?.encoding;
        const facetDef = vgObj.facet || {};
        const hasRow = !!(enc?.row || facetDef.row);
        const hasColumn = !!(enc?.column || facetDef.column);
        const hasWrap = !!(enc?.facet || (vgObj.facet && !facetDef.row && !facetDef.column));

        const fontCfg: Record<string, any> = totalFacets > 6 ? { labelFontSize: 9 } : {};
        const colLimit = Math.max(80, layout.subplotWidth + 20);
        const rowLimit = Math.max(30, layout.subplotHeight);

        if (hasColumn) {
            vgObj.config.headerColumn = { ...(vgObj.config.headerColumn || {}), ...fontCfg, labelLimit: colLimit };
        }
        if (hasRow) {
            vgObj.config.headerRow = { ...(vgObj.config.headerRow || {}), ...fontCfg, labelLimit: rowLimit };
        }
        if (hasWrap) {
            vgObj.config.headerFacet = { ...(vgObj.config.headerFacet || {}), ...fontCfg, labelLimit: colLimit };
        }
    }
    const encTarget = vgObj.spec?.encoding || vgObj.encoding;

    if (facetRows > 1 || facetCols > 1) {
        if (!vgObj.config) vgObj.config = {};
        const lightTitle = { titleFontWeight: 'normal' as const, titleFontSize: 11, titleColor: '#666' };
        vgObj.config.axisX = { ...(vgObj.config.axisX || {}), ...lightTitle };
        vgObj.config.axisY = { ...(vgObj.config.axisY || {}), ...lightTitle };
    }

    // Row-faceted y-axis title handling.
    // Vega-Lite draws the y-axis title once PER facet row, so on a stack of
    // short subplots the same label repeats down the left edge until it
    // collapses into an unreadable vertical smear right next to the row header.
    //
    //   • Nominal y — the category labels are self-describing, so just drop the
    //     repeated title.
    //   • Quantitative/temporal y on a SHARED scale — the measure is identical
    //     in every subplot, so fold it into the row header title (e.g. the
    //     rotated left label becomes "Product: Price Index (Start = 100)") and
    //     suppress the per-subplot title. With an INDEPENDENT y scale each
    //     subplot can differ, so we leave the per-subplot titles in place.
    const rowEnc = encTarget?.row || vgObj.facet?.row;
    const yEnc = encTarget?.y;
    if (yEnc && (rowEnc || (facetRows > 1 && encTarget?.y))) {
        if (yEnc.type === 'nominal') {
            if (!vgObj.config) vgObj.config = {};
            vgObj.config.axisY = { ...(vgObj.config.axisY || {}), title: null };
            if (!yEnc.axis) yEnc.axis = {};
            yEnc.axis.title = null;
        } else if (rowEnc && vgObj.resolve?.scale?.y !== 'independent' && !vgObj._suppressFacetMeasureTitle) {
            const yTitle = (yEnc.axis && yEnc.axis.title) || yEnc.title || yEnc.field;
            const rowTitle = (rowEnc.header && rowEnc.header.title) || rowEnc.title || rowEnc.field;
            if (yTitle && rowTitle) {
                if (!rowEnc.header) rowEnc.header = {};
                rowEnc.header.title = `${rowTitle}: ${yTitle}`;
                if (!vgObj.config) vgObj.config = {};
                vgObj.config.axisY = { ...(vgObj.config.axisY || {}), title: null };
                if (!yEnc.axis) yEnc.axis = {};
                yEnc.axis.title = null;
            }
        }
    }

    // --- Overflow styling (from TruncationWarning[]) ---
    // Applied AFTER template.instantiate and facet restructuring,
    // so we modify the spec's actual encoding objects.
    for (const trunc of layout.truncations) {
        const ch = trunc.channel;
        const targets = collectEncodingTargets(ch);

        for (const enc of targets) {
            if (!enc.field) continue;

            // Axis/legend label color: grey for placeholder
            if (ch === 'x' || ch === 'y') {
                if (enc.axis === null) continue; // preserve axis suppression
                if (!enc.axis) enc.axis = {};
                enc.axis.labelColor = {
                    condition: {
                        test: `datum.label == '${trunc.placeholder}'`,
                        value: "#999999",
                    },
                    value: "#000000",
                };
                // Set domain to kept values + placeholder
                if (!enc.scale) enc.scale = {};
                enc.scale.domain = [...trunc.keptValues, trunc.placeholder];
            } else if (ch === 'color') {
                if (!enc.legend) enc.legend = {};
                enc.legend.values = [...trunc.keptValues, trunc.placeholder];
            }
        }
    }
}

// ---------------------------------------------------------------------------
// vlApplyFieldContext — Apply field-level semantic decisions to VL encodings
// ---------------------------------------------------------------------------

/**
 * Whether Vega-Lite sums stacked segments on this channel: a stated stack other than normalize,
 * or length marks it stacks by default, which it does where a colour series splits them or a
 * category repeats across rows.
 */
function vegaLiteSums(
    vgObj: any, enc: any, ch: string, lengthMark: boolean, channelSemantics: Record<string, ChannelSemantics>, rows: any[],
): boolean {
    if (enc.stack === 'normalize') return false;
    if (enc.stack !== undefined && enc.stack !== null && enc.stack !== false) return true;
    if (!lengthMark || enc.stack === null) return false;
    const colorSeries = !!(
        vgObj.encoding?.color?.field
        || (Array.isArray(vgObj.layer) && vgObj.layer.some((l: any) => l.encoding?.color?.field))
        || vgObj.spec?.encoding?.color?.field
    );
    if (colorSeries) return true;
    const other = channelSemantics[ch === 'y' ? 'x' : 'y'];
    if (other?.type !== 'nominal' && other?.type !== 'ordinal' || !other.field) return false;
    const seen = new Set<string>();
    for (const row of rows ?? []) {
        const val = row[enc.field];
        if (typeof val !== 'number' || isNaN(val)) continue;
        const key = String(row[other.field]);
        if (seen.has(key)) return true;
        seen.add(key);
    }
    return false;
}

/**
 * Write a channel's decided extent to its encoding. Fixed bounds set the domain; one bound sets
 * that end and keeps the other rounded. A stack that ends on a clean tick is pinned there unless
 * the scale already has an upper end.
 */
function applyMeasureDomain(enc: any, ch: string, decided: MeasureDomain): void {
    const { bounds } = decided;
    if (bounds && enc.type === 'quantitative' && (ch === 'x' || ch === 'y' || ch === 'size' || ch === 'color') && !enc.bin) {
        if (!enc.scale) enc.scale = {};
        const { min, max, clamp } = bounds;
        if (min !== undefined && max !== undefined) {
            enc.scale.domain = [min, max];
            if (decided.dropZero && enc.scale.zero !== undefined) delete enc.scale.zero;
        } else {
            if (min !== undefined) enc.scale.domainMin = min;
            if (max !== undefined) enc.scale.domainMax = max;
            enc.scale.nice = true;
        }
        if (clamp) enc.scale.clamp = true;
    }
    const top = decided.stackTop;
    if (top === undefined) return;
    if (enc.scale?.domain != null || enc.scale?.domainMax != null || enc.scale?.nice === false) return;
    enc.scale = { ...(enc.scale ?? {}), domainMin: enc.scale?.domainMin ?? 0, domainMax: top, nice: false };
}

/**
 * Apply field-context semantic properties to VL encoding objects.
 *
 * Consumes the following ChannelSemantics properties that were previously
 * dead writes (computed by resolveChannelSemantics but never read):
 *
 *   1. format       → axis.format / axis.labelExpr  (number formatting)
 *   2. tooltipFormat → tooltip encoding format
 *   3. domainConstraint → scale.domain + scale.clamp  (bounded types)
 *   4. tickConstraint   → axis.tickMinStep + axis.values  (integer ticks)
 *   5. reversed     → scale.reverse  (rank axes)
 *   6. nice         → scale.nice  (bounded types disable nice)
 *   7. scaleType    → scale.type  (log, sqrt, symlog)
 */
function vlApplyFieldContext(
    vgObj: any,
    channelSemantics: Record<string, ChannelSemantics>,
    collectEncodingTargets: (ch: string) => any[],
    context: InstantiateContext,
    domains?: Partial<Record<'x' | 'y', MeasureDomain>>,
): void {
    for (const [ch, cs] of Object.entries(channelSemantics)) {
        const targets = collectEncodingTargets(ch);
        if (targets.length === 0) continue;

        for (const enc of targets) {
            if (!enc.field) continue;

            // Skip encodings whose field differs from the channel's semantic
            // field. Templates (e.g. Radar) may inject private computed fields
            // (e.g. `__x`, `__y` for polar coordinates) on the same VL channel;
            // applying the user field's semantic context (domain, format, etc.)
            // to those synthetic fields produces wrong scales.
            if (cs.field && enc.field !== cs.field) continue;

            // ── 0. Temporal + bin incompatibility guard ──
            // VL's `bin` operates on numeric values. Setting `type: "temporal"`
            // with `bin` causes VL to parse values (e.g., year 2004) as dates
            // and bin in milliseconds, producing nonsensical time-of-day labels.
            // For temporal binning, VL expects `timeUnit` instead.
            // Fix: demote to `quantitative` so bins work on raw numbers.
            if (enc.bin && enc.type === 'temporal') {
                enc.type = 'quantitative';
                // Year/Decade values should show as plain integers, not "2,004"
                if (enc.axis !== null) {
                    if (!enc.axis) enc.axis = {};
                    if (!enc.axis.format) enc.axis.format = 'd';
                }
            }

            // ── 1. Number format (axis.format / axis.labelExpr) ──
            // Only apply to quantitative positional channels.
            // Skip binned encodings — VL formats bin ranges natively and
            // our semantic format (e.g. percent) would misinterpret the
            // bin boundaries.
            // Without this: axes show raw numbers like "1000000" instead of "$1,000,000".
            if ((cs.format?.pattern || cs.format?.abbreviate) && (ch === 'x' || ch === 'y') && enc.type === 'quantitative' && !enc.bin) {
                // Skip if the encoding already has an explicit format
                if (enc.axis === null) { /* preserve axis suppression */ }
                else if (!enc.axis?.format && !enc.axis?.labelExpr) {
                    if (!enc.axis) enc.axis = {};
                    const expr = formatSpecToLabelExpr(cs.format);
                    if (expr) {
                        enc.axis.labelExpr = expr;
                    } else {
                        enc.axis.format = cs.format.pattern;
                    }
                }
            }
            // A key to values reads its numbers the way an axis on the same field would: a ramp of
            // percentage changes is labelled "−20%", not "−0.20".
            if ((cs.format?.pattern || cs.format?.abbreviate) && (ch === 'color' || ch === 'size')
                && enc.type === 'quantitative' && !enc.bin && enc.legend !== null
                && !enc.legend?.format && !enc.legend?.labelExpr) {
                const expr = formatSpecToLabelExpr(cs.format);
                enc.legend = { ...(enc.legend ?? {}), ...(expr ? { labelExpr: expr } : { format: cs.format.pattern }) };
            }

            // ── 2. Tooltip format ──
            // Tooltip formatting is handled via VL's tooltip encoding with format.
            // Without this: tooltips show raw floats like "0.4812" instead of "48.12%".
            // NOTE: VL's `config.mark.tooltip: true` uses default formatting;
            // explicit tooltip channels would need encoding-level format.
            // For now, we set formatType on the main encoding when tooltipFormat
            // has a simple pattern (no prefix/suffix).
            // Full tooltip encoding is deferred to template-level implementation.

            // ── 3. Domain constraint (scale.domain + scale.clamp) ──
            // Skip binned encodings — VL handles bin domain automatically.
            const markType = typeof vgObj.mark === 'string' ? vgObj.mark : vgObj.mark?.type;
            const lengthMark = ['bar', 'area', 'rect'].includes(markType);
            const planned = domains && (ch === 'x' || ch === 'y');
            const decided = planned ? domains[ch] : measureDomain({
                channel: ch,
                field: enc.field,
                summed: vegaLiteSums(vgObj, enc, ch, lengthMark, channelSemantics, context.table),
                lengthMark,
                channelSemantics,
                rows: context.table,
            });
            if (decided) applyMeasureDomain(enc, ch, decided);

            // ── 4. Tick constraint (axis.tickMinStep + axis.values) ──
            // Skip binned encodings — VL handles bin ticks natively.
            // Without this: Rating 1-5 and Count axes show fractional ticks
            // like 1.5, 2.5, 3.5 that have no physical meaning.
            if (cs.tickConstraint && (ch === 'x' || ch === 'y') && enc.type === 'quantitative' && !enc.bin) {
                if (enc.axis === null) { /* preserve axis suppression */ }
                else {
                if (!enc.axis) enc.axis = {};
                if (cs.tickConstraint.integersOnly && enc.axis.tickMinStep === undefined) {
                    enc.axis.tickMinStep = cs.tickConstraint.minStep ?? 1;
                }
                if (cs.tickConstraint.exactTicks && !enc.axis.values) {
                    enc.axis.values = cs.tickConstraint.exactTicks;
                }
                // Hide fractional tick labels for integer-only fields.
                // VL may still generate fractional ticks when the domain
                // span is small (e.g., all values = 1 → domain [0,1] →
                // ticks at 0, 0.2, 0.4…). The `,d` format rounds these
                // to duplicate labels. This labelExpr suppresses them.
                if (cs.tickConstraint.integersOnly && !enc.axis.labelExpr && !enc.axis.values) {
                    enc.axis.labelExpr = "datum.value === ceil(datum.value) ? format(datum.value, ',d') : ''";
                }
                // When ticks are integers, axis labels should show integers
                // even if the underlying data has decimals (e.g., Rating
                // data 3.7 with ticks at 1,2,3,4,5 → labels "1,2,3,4,5"
                // not "1.0,2.0,3.0").
                if (cs.tickConstraint.integersOnly && enc.axis.format) {
                    // Replace decimal format with integer format for axis only
                    enc.axis.format = enc.axis.format.replace(/\.\d+f$/, 'd');
                }
                // Same for labelExpr — swap the d3-format pattern inside
                if (cs.tickConstraint.integersOnly && enc.axis.labelExpr) {
                    enc.axis.labelExpr = enc.axis.labelExpr.replace(
                        /format\(datum\.value,\s*'([^']*)\.\d+f'\)/,
                        "format(datum.value, '$1d')",
                    );
                }
                } // close else (axis !== null)
            }

            // ── 5. Reversed axis (scale.reverse) ──
            // Only for quantitative axes. Ordinal y-axes already place the
            // first domain value (rank 1) at the top by default, so adding
            // scale.reverse there would double-reverse, putting 1 back at
            // the bottom.
            // Skip binned encodings — VL handles bin axis direction natively.
            if (cs.reversed && (ch === 'x' || ch === 'y') && enc.type === 'quantitative' && !enc.bin) {
                if (!enc.scale) enc.scale = {};
                if (enc.scale.reverse === undefined) {
                    enc.scale.reverse = true;
                }
            }

            // ── 6. Nice rounding (scale.nice) ──
            // Without this: Domain [1, 5] for ratings gets "nice-rounded"
            // to [0, 6] which wastes space and implies values that don't exist.
            // Skip binned encodings — VL computes bin extents automatically.
            if (cs.nice === false && enc.type === 'quantitative' && !enc.bin) {
                if (!enc.scale) enc.scale = {};
                if (enc.scale.nice === undefined) {
                    enc.scale.nice = false;
                }
            }

            // ── 7. Scale type (scale.type) ──
            // Only applies for specific semantic types (Population, GDP, etc.)
            // when data spans ≥ 4 orders of magnitude. Conservative policy
            // to avoid surprising users on normal datasets.
            // Skip binned encodings — log/sqrt scales conflict with VL's
            // linear bin computation and break when data contains zeros.
            if (cs.scaleType && cs.scaleType !== 'linear' && enc.type === 'quantitative' && !enc.bin) {
                if (!enc.scale) enc.scale = {};
                if (!enc.scale.type) {
                    enc.scale.type = cs.scaleType;

                    // Log/symlog scales don't support zero baseline — clean it up
                    if (cs.scaleType === 'log' || cs.scaleType === 'symlog') {
                        if (enc.scale.zero !== undefined) {
                            delete enc.scale.zero;
                        }
                        // Log axes produce many grid lines (1,2,3…9 per
                        // decade).  Make them very light so they convey the
                        // log-scale structure without competing with data.
                        if (ch === 'x' || ch === 'y') {
                            if (enc.axis === null) { /* preserve axis suppression */ }
                            else {
                                if (!enc.axis) enc.axis = {};
                                enc.axis.gridColor = '#e8e8e8';
                                enc.axis.gridOpacity = 0.5;
                            }
                        }
                    }
                }
            }
        }
    }
}

const TEMPORAL_LEVELS = [
    { unit: 'millisecond', local: timeMillisecond, utc: utcMillisecond, steps: [1, 2, 5, 10, 20, 50, 100, 200, 500], format: '.%L', context: '%b %-d, %Y %H:%M:%S.%L' },
    { unit: 'second', local: timeSecond, utc: utcSecond, steps: [1, 5, 15, 30], format: ':%S', context: '%b %-d, %Y %H:%M:%S' },
    { unit: 'minute', local: timeMinute, utc: utcMinute, steps: [1, 5, 15, 30], format: '%-I:%M', context: '%b %-d, %Y %H:%M' },
    { unit: 'hour', local: timeHour, utc: utcHour, steps: [1, 3, 6, 12], format: '%-I %p', context: '%b %-d, %Y %-I %p' },
    { unit: 'day', local: timeDay, utc: utcDay, steps: [1, 2, 7, 14], format: '%-d', context: '%b %-d, %Y' },
    { unit: 'month', local: timeMonth, utc: utcMonth, steps: [1, 3, 6], format: '%b', context: '%b %Y' },
    { unit: 'year', local: timeYear, utc: utcYear, steps: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000], format: '%Y', context: '%Y' },
] as const;

interface TemporalTickPlan {
    values: string[];
    labels: Record<string, string>;
    labelExpr: string;
    labelOverlap: false;
    labelFlush: false;
}

/** What a temporal axis needs besides its domain and pixel span to plan its ticks again at runtime. */
export interface TemporalAxisPlanInputs {
    semanticType: string | undefined;
    utc: boolean;
    vertical: boolean;
    settings: Record<string, unknown>;
    fontSize: number;
    /** The first and last instant in the data; ticks are planned over the data the domain shows, as at compile time. */
    extent?: [number, number];
}

const TEMPORAL_PLAN_SETTING_KEYS = [
    'labelFont', 'labelFontStyle', 'labelFontWeight', 'labelAngle', 'labelSeparation', 'labelLimit',
] as const;

function temporalPlanSettings(settings: Record<string, unknown>): Record<string, unknown> {
    const kept: Record<string, unknown> = {};
    for (const key of TEMPORAL_PLAN_SETTING_KEYS) if (settings[key] !== undefined) kept[key] = settings[key];
    return kept;
}

/**
 * The axis properties a tick plan writes. The tick count is the plan's own: Vega-Lite states
 * `ceil(width / 40)` by default, and Vega strides explicit values down to a count, so a plot
 * narrower than the plan expected would keep every other tick — and drop the January that names
 * the year.
 */
function axisPropertiesOf({ labels: _labels, ...axis }: TemporalTickPlan): Omit<TemporalTickPlan, 'labels'> & { tickCount: number } {
    return { ...axis, tickCount: axis.values.length };
}

export function temporalAxisPlanInputs(encoding: object): TemporalAxisPlanInputs | undefined {
    return temporalAxisPlans.get(encoding)?.inputs;
}

/** The ticks and label text an axis draws as its plan wrote them; nothing where a template stated its own over them. */
export function plannedTemporalTicks(encoding: { axis?: { labelExpr?: unknown } | null }): { values: number[]; labels: Record<string, string> } | undefined {
    const plan = temporalAxisPlans.get(encoding);
    return plan && encoding.axis?.labelExpr === plan.labelExpr ? plan.ticks : undefined;
}

const ticksOf = (plan: TemporalTickPlan): { values: number[]; labels: Record<string, string> } =>
    ({ values: plan.values.map((value) => +new Date(value)), labels: plan.labels });

/** Tick positions (ms) and label text for a temporal axis over `domain`, laid out across `span` pixels. */
export function planTemporalTickValues(
    domain: unknown[], span: number, inputs: TemporalAxisPlanInputs,
): { values: number[]; labels: Record<string, string> } {
    const bounds = domain.map((value) => +new Date(value as any));
    const [lo, hi] = [Math.min(...bounds), Math.max(...bounds)];
    const start = Math.max(lo, inputs.extent?.[0] ?? lo);
    const end = Math.min(hi, inputs.extent?.[1] ?? hi);
    const plan = Number.isFinite(start) && Number.isFinite(end) && hi > lo
        ? planTemporalTicks({ ...inputs, start, end, span: span * (end - start) / (hi - lo) })
        : undefined;
    if (!plan) return { values: [], labels: {} };
    return { values: plan.values.map(value => +new Date(value)), labels: plan.labels };
}

interface TemporalTickLayout {
    start: number;
    end: number;
    semanticType: string | undefined;
    utc: boolean;
    span: number;
    vertical: boolean;
    settings: any;
    fontSize: number;
}

const temporalAxisPlans = new WeakMap<object, {
    start: number; end: number; semanticType: string | undefined; labelExpr: string;
    /** The ticks the plan placed, and the text each labelled one shows. */
    ticks: { values: number[]; labels: Record<string, string> };
    /** The pixels the ticks were planned across. */
    span: number;
    inputs: TemporalAxisPlanInputs;
}>();


/**
 * The label settings a temporal axis's ticks are planned with: the plan's labels, under what the
 * encoding states for itself.
 */
function temporalLabelSettings(
    labels: AxisLabelPlan, formatting: Record<string, unknown>, stated: Record<string, unknown> | undefined, themed: boolean,
): { fontSize: number; settings: Record<string, unknown> } {
    const own = { ...stated };
    if (themed) for (const key of OWNED_AXIS_KEYS) delete own[key];
    const planned: Record<string, unknown> = {
        labelFont: labels.font, labelAngle: labels.angle, labelSeparation: labels.separation, labelLimit: labels.limit,
    };
    for (const key of Object.keys(planned)) if (planned[key] === undefined) delete planned[key];
    return {
        fontSize: typeof own.labelFontSize === 'number' ? own.labelFontSize : labels.fontSize,
        settings: temporalPlanSettings({ ...formatting, ...planned, ...own }),
    };
}

/**
 * Plans a temporal axis's ticks again where a stage after the plan changed the plot they run
 * across, such as the theme fitting a long title.
 */
export function vlFinalizeTemporalAxes(spec: any, context: InstantiateContext): void {
    const config = spec.config ?? {};
    const visit = (node: any, width: number, height: number): void => {
        const plotWidth = typeof node.width === 'number' ? node.width : width;
        const plotHeight = typeof node.height === 'number' ? node.height : height;
        for (const channel of ['x', 'y'] as const) {
            const encoding = node.encoding?.[channel];
            const original = encoding && temporalAxisPlans.get(encoding);
            if (!original || encoding.axis?.labelExpr !== original.labelExpr) continue;
            const domain = encoding.scale?.domain;
            const domainSpan = Array.isArray(domain) && domain.length === 2
                ? +new Date(domain[1]) - +new Date(domain[0]) : original.end - original.start;
            const span = (channel === 'x' ? plotWidth : plotHeight) * (original.end - original.start) / domainSpan;
            if (span === original.span) continue;
            const plan = planTemporalTicks({
                start: original.start, end: original.end, semanticType: original.semanticType,
                utc: original.inputs.utc, span, vertical: channel === 'y',
                settings: original.inputs.settings, fontSize: original.inputs.fontSize,
            });
            if (!plan) continue;
            Object.assign(encoding.axis, axisPropertiesOf(plan));
            original.labelExpr = plan.labelExpr;
            original.ticks = ticksOf(plan);
            original.span = span;
        }
        if (node.spec) visit(node.spec, plotWidth, plotHeight);
        for (const child of [...(node.layer ?? []), ...(node.vconcat ?? []), ...(node.hconcat ?? []), ...(node.concat ?? [])]) {
            visit(child, plotWidth, plotHeight);
        }
    };
    visit(spec, config.view?.continuousWidth ?? context.layout.subplotWidth,
        config.view?.continuousHeight ?? context.layout.subplotHeight);
}

function planTemporalTicks({
    start, end, semanticType, utc, span, vertical, settings, fontSize,
}: TemporalTickLayout): TemporalTickPlan | undefined {
    if (!(end > start && span > 0)) return;
    if (['Month', 'Quarter', 'Week', 'Day', 'Hour', 'Time', 'YearWeek'].includes(semanticType ?? '')) return;
    const levels = TEMPORAL_LEVELS.map(level => ({ ...level, interval: utc ? level.utc : level.local }));
    const format = utc ? utcFormat : timeFormat;
    const minimumUnit = semanticType === 'Date' ? 'day'
        : semanticType === 'YearMonth' || semanticType === 'YearQuarter' ? 'month'
        : semanticType === 'Year' || semanticType === 'Decade' ? 'year' : 'millisecond';
    const minimumLevel = levels.findIndex(level => level.unit === minimumUnit);
    const dayLevel = levels.findIndex(level => level.unit === 'day');
    const month = levels[dayLevel + 1].interval;
    const monthsCrossed = month.count(new Date(start), new Date(end));
    let monthDayLabels = false;
    const ordinaryFormat = (level: number): string =>
        level === dayLevel && monthDayLabels ? '%b %-d' : levels[level].format;
    const minimumStep = semanticType === 'YearQuarter' ? 3 : semanticType === 'Decade' ? 10 : 1;
    const canvas = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    if (canvas) canvas.font = `${settings.labelFontStyle ?? 'normal'} ${settings.labelFontWeight ?? 'normal'} ${fontSize}px ${settings.labelFont ?? 'sans-serif'}`;
    const angle = (typeof settings.labelAngle === 'number' ? settings.labelAngle : 0) * Math.PI / 180;
    const host = canvas ? undefined : hostTextMeasurer()?.(fontSize, settings.labelFont ?? 'sans-serif', settings.labelFontWeight ?? 'normal', settings.labelFontStyle ?? 'normal');
    const textWidth = (text: string): number => canvas ? canvas.measureText(text).width : host ? host(text) : text.length * fontSize * 0.8;
    const extent = (text: string): number => {
        const width = textWidth(text);
        return vertical ? Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * fontSize
            : Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * fontSize;
    };
    const gap = typeof settings.labelSeparation === 'number' ? settings.labelSeparation : Math.round(fontSize * 0.6);
    const position = (value: number): number => (value - start) / (end - start) * span;
    const rank = (value: number, base: number): number => {
        for (let level = levels.length - 1; level > base; level--) {
            if (+levels[level].interval.floor(new Date(value)) === value) return level;
        }
        return base;
    };
    const boundaryFormat = (level: number, base: number): string => {
        if (base === dayLevel && monthDayLabels) {
            return levels[level].unit === 'year' ? '%Y' : ordinaryFormat(base);
        }
        if (level === base) return ordinaryFormat(base);
        const detail = base + 1;
        if (levels[level].unit === 'year') return levels[detail].context;
        if (level >= dayLevel && base < dayLevel) return levels[detail].context.replace(', %Y', '');
        if (levels[detail].unit === 'second' && level > detail) return '%H:%M:%S';
        return levels[detail].format;
    };
    let candidates: number[] = [];
    let base = minimumLevel;
    let cadence = 1;
    for (let level = minimumLevel; level < levels.length && candidates.length === 0; level++) {
        for (const step of levels[level].steps) {
            if (level === minimumLevel && step % minimumStep !== 0) continue;
            if (levels[level].interval.count(new Date(start), new Date(end)) / step > Math.max(2, span / fontSize)) continue;
            const interval = levels[level].unit === 'day' && step >= 7
                ? (utc ? utcWeek : timeWeek).every(step / 7)
                : levels[level].interval.every(step);
            if (!interval) continue;
            const ticks = interval.range(new Date(start), new Date(end + 1)).map(Number);
            if (!ticks.length) continue;
            monthDayLabels = false;
            if (level === dayLevel && monthsCrossed >= 2) {
                const repetitions = new Map<number, number>();
                for (const value of ticks) {
                    const period = +month.floor(new Date(value));
                    repetitions.set(period, (repetitions.get(period) ?? 0) + 1);
                }
                monthDayLabels = Math.max(...repetitions.values()) <= 5;
            }
            const ordinarySize = (value: number): number => extent(format(ordinaryFormat(level))(new Date(value)));
            const fits = ticks.every((value, index) => index === 0 || position(value) - position(ticks[index - 1])
                >= (ordinarySize(value) + ordinarySize(ticks[index - 1])) / 2 + gap);
            if (fits) {
                candidates = ticks;
                base = level;
                cadence = step;
                break;
            }
        }
    }
    if (!candidates.length) return;
    let startAnchor = +levels[minimumLevel].interval.ceil(new Date(start));
    if (levels[base].unit === 'day' && cadence > 1) {
        const day = levels[base].interval;
        const month = levels[base + 1].interval;
        let periodStart = day.ceil(new Date(start));
        const openingDays = day.count(periodStart, month.ceil(new Date(+periodStart + 1)));
        const openingStep = openingDays / Math.max(1, Math.round(openingDays / cadence));
        if (Math.abs(openingStep - cadence) > 2) periodStart = month.floor(periodStart);
        candidates = [];
        while (+periodStart <= end) {
            const periodEnd = month.ceil(new Date(+periodStart + 1));
            const days = day.count(periodStart, periodEnd);
            const divisions = Math.max(1, Math.round(days / cadence));
            for (let index = 0; index < divisions; index++) {
                const value = +day.offset(periodStart, Math.round(days * index / divisions));
                if (value >= start && value <= end) candidates.push(value);
            }
            periodStart = periodEnd;
        }
        startAnchor = candidates[0];
    }
    for (let level = base + 1; level < levels.length; level++) {
        candidates.push(...levels[level].interval.range(new Date(start), new Date(end + 1)).map(Number));
    }
    if (startAnchor <= end) candidates.push(startAnchor);
    const choose = (anchor: number, from: number) => {
        const ticks = [...new Set(candidates)].sort((left, right) => left - right).map(value => {
            const level = rank(value, base);
            const calendarLevel = rank(value, minimumLevel);
            const initial = value === anchor && calendarLevel < levels.length - 1;
            const pattern = initial ? levels[calendarLevel].context : boundaryFormat(level, base);
            const text = format(pattern)(new Date(value));
            const priority = initial ? Math.min(base, calendarLevel) + 0.5
                : base === dayLevel && monthDayLabels && levels[level].unit === 'month' ? base : level;
            return { value, pattern, text, priority, size: extent(text), initial, level: calendarLevel };
        });
        const selected: typeof ticks = [];
        for (const tick of [...ticks].sort((left, right) => right.priority - left.priority || left.value - right.value)) {
            if (tick.value < from) continue;
            if (tick.initial) {
                const parent = levels[Math.min(base + 1, levels.length - 1)].interval;
                const periodEnd = +parent.offset(parent.floor(new Date(tick.value)), 1);
                const hasYearContext = selected.some(other => other.level > base && levels[other.level].unit === 'year'
                    && other.value > tick.value && other.value <= periodEnd);
                if (hasYearContext) {
                    const floor = Math.max(base, tick.level);
                    tick.pattern = boundaryFormat(rank(tick.value, floor), floor);
                    tick.text = format(tick.pattern)(new Date(tick.value));
                    tick.size = extent(tick.text);
                }
            }
            if (selected.every(other => Math.abs(position(tick.value) - position(other.value)) >= (tick.size + other.size) / 2 + gap)) {
                selected.push(tick);
            }
        }
        return { ticks, selected };
    };
    let { ticks, selected } = choose(startAnchor, -Infinity);
    // An opening label crowded out (say a half-hour start beside the next full hour) would leave
    // the axis without its date; the earliest label that fits carries it instead.
    if (selected.length > 0 && ticks.some(tick => tick.initial) && !selected.some(tick => tick.initial)) {
        const first = Math.min(...selected.map(tick => tick.value));
        ({ ticks, selected } = choose(first, first));
    }
    selected.sort((left, right) => left.value - right.value);
    const expandMonth = (pattern: string): string =>
        pattern === '%b' || pattern === '%b %Y' ? pattern.replace('%b', '%B') : pattern;
    const expanded = selected.map(tick => {
        const pattern = expandMonth(tick.pattern);
        const text = format(pattern)(new Date(tick.value));
        return { value: tick.value, size: extent(text), width: textWidth(text), changed: pattern !== tick.pattern };
    });
    const labelLimit = typeof settings.labelLimit === 'number' ? settings.labelLimit : VEGA_AXIS_LABEL_LIMIT;
    const fullMonthNames = expanded.every((tick, index) =>
        (!tick.changed || labelLimit <= 0 || tick.width <= labelLimit)
        && (index === 0 || position(tick.value) - position(expanded[index - 1].value)
            >= (tick.size + expanded[index - 1].size) / 2 + gap));
    const labelPattern = (pattern: string): string => JSON.stringify(fullMonthNames ? expandMonth(pattern) : pattern);
    const formatter = utc ? 'utcFormat' : 'timeFormat';
    const boundaries = [
        ['', ''], ['%L', '000'], ['%S.%L', '00.000'], ['%M:%S.%L', '00:00.000'],
        ['%H:%M:%S.%L', '00:00:00.000'], ['%d %H:%M:%S.%L', '01 00:00:00.000'],
        ['%m-%d %H:%M:%S.%L', '01-01 00:00:00.000'],
    ];
    const boundaryExpr = (level: number, value: string): string =>
        `${formatter}(${value}, ${JSON.stringify(boundaries[level][0])}) === ${JSON.stringify(boundaries[level][1])}`;
    const patternExpr = (floor: number, context: boolean): string => {
        let pattern = labelPattern(context ? levels[floor].context : ordinaryFormat(floor));
        for (let level = floor + 1; level < levels.length; level++) {
            const promoted = context ? levels[level].context : boundaryFormat(level, floor);
            pattern = `(${boundaryExpr(level, 'datum.value')} ? ${labelPattern(promoted)} : ${pattern})`;
        }
        return pattern;
    };
    let pattern = patternExpr(base, false);
    const initial = selected.find(tick => tick.initial);
    if (initial) {
        const parent = levels[Math.min(base + 1, levels.length - 1)].interval;
        const periodEnd = +parent.offset(parent.floor(new Date(initial.value)), 1);
        const yearContext = selected.filter(tick => tick.level > base && levels[tick.level].unit === 'year'
            && tick.value > initial.value && tick.value <= periodEnd)
            .map(tick => `(${boundaryExpr(levels.length - 1, String(tick.value))})`).join(' || ') || 'false';
        pattern = `(toNumber(datum.value) === ${initial.value} && !(${yearContext}) ? ${patternExpr(minimumLevel, true)} : ${pattern})`;
    }
    const labels = Object.fromEntries(selected.map(tick => [tick.value, true]));
    return {
        values: ticks.map(tick => new Date(tick.value).toISOString()),
        labels: Object.fromEntries(selected.map(tick =>
            [tick.value, format(fullMonthNames ? expandMonth(tick.pattern) : tick.pattern)(new Date(tick.value))])),
        labelExpr: `(${JSON.stringify(labels)})[toString(toNumber(datum.value))] ? ${formatter}(datum.value, ${pattern}) : ''`,
        labelOverlap: false,
        labelFlush: false,
    };
}

function vlApplyDefaultAxisFormat(
    vgObj: any,
    collectEncodingTargets: (ch: string) => any[],
    context: InstantiateContext,
    axisLabels: Record<'x' | 'y', AxisLabelPlan>,
    themed: boolean,
): void {
    for (const ch of ['x', 'y'] as const) {
        for (const enc of collectEncodingTargets(ch)) {
            if (!enc || enc.bin || enc.axis === null) continue;
            if (enc.axis?.format || enc.axis?.labelExpr) continue;

            if (enc.type === 'quantitative') {
                if (!enc.axis) enc.axis = {};
                enc.axis.format = DEFAULT_QUANTITATIVE_AXIS_FORMAT;
            } else if (enc.type === 'temporal' && !enc.timeUnit && enc.scale !== null && enc.format == null) {
                const config = vgObj.config ?? {};
                const formatting = {
                    ...config.axis, ...config.axisTemporal,
                    ...config[ch === 'x' ? 'axisX' : 'axisY'], ...enc.axis,
                };
                if (config.timeFormat != null || formatting.format != null
                    || formatting.formatType != null || formatting.labelExpr != null
                    || formatting.tickCount != null || formatting.values != null || formatting.tickMinStep != null
                    || formatting.labelOverlap != null || formatting.labelFlush != null
                    || enc.scale?.domain != null || enc.scale?.domainMin != null || enc.scale?.domainMax != null) continue;
                let earliest = Infinity;
                let latest = -Infinity;
                // Date-only strings such as "2026-06" parse to UTC midnights; ticks planned on the local
                // calendar would sit hours off every point and drop the last one past the domain's end.
                let utcMidnights = true;
                let localMidnights = true;
                for (const row of context.table ?? vgObj.data?.values ?? []) {
                    const value = row[enc.field];
                    if (value == null) continue;
                    const date = new Date(value);
                    const timestamp = +date;
                    if (!Number.isFinite(timestamp)) continue;
                    earliest = Math.min(earliest, timestamp);
                    latest = Math.max(latest, timestamp);
                    if (date.getUTCHours() || date.getUTCMinutes() || date.getUTCSeconds() || date.getUTCMilliseconds()) utcMidnights = false;
                    if (date.getHours() || date.getMinutes() || date.getSeconds() || date.getMilliseconds()) localMidnights = false;
                }
                // UTC-midnight dates are calendar dates read as UTC, wherever the chart is built.
                const utc = enc.scale?.type === 'utc' || utcMidnights;
                const semantics = context.channelSemantics[ch];
                const { fontSize, settings } = temporalLabelSettings(axisLabels[ch], formatting, enc.axis, themed);
                const plot = vgObj.facet && vgObj.spec ? vgObj.spec : vgObj;
                const size = ch === 'x' ? plot.width : plot.height;
                const span = typeof size === 'number' ? size
                    : ch === 'x' ? context.layout.subplotWidth : context.layout.subplotHeight;
                const semanticType = semantics?.field === enc.field ? semantics.semanticAnnotation?.semanticType : undefined;
                const plan = planTemporalTicks({
                    start: earliest, end: latest, semanticType, utc,
                    span, vertical: ch === 'y', settings, fontSize,
                });
                if (!plan) continue;
                temporalAxisPlans.set(enc, {
                    start: earliest, end: latest,
                    ticks: ticksOf(plan),
                    semanticType,
                    labelExpr: plan.labelExpr,
                    span,
                    inputs: {
                        semanticType, utc, vertical: ch === 'y',
                        settings, fontSize,
                        extent: [earliest, latest],
                    },
                });
                enc.axis = {
                    ...enc.axis,
                    ...axisPropertiesOf(plan),
                };
                // The scale agrees with the labels, so tooltips and mark descriptions read
                // the same calendar date instead of the previous day west of UTC.
                if (utc) enc.scale = { ...(enc.scale ?? {}), type: 'utc' };
            }
        }
    }
}

/**
 * Apply tooltip configuration to a VL spec.
 *
 * Keep tooltip activation separate from axis/legend number formatting. Global
 * numberFormat also affects axes and can force small tick values into scientific
 * notation, so axis defaults are applied explicitly in vlApplyLayoutToSpec.
 */
export function vlApplyTooltips(vgObj: any): void {
    if (!vgObj.config) vgObj.config = {};
    vgObj.config.mark = { ...vgObj.config.mark, tooltip: true };
}

/** A working column Flint computes for itself: a position, an order, a jitter, a connector. */
const isWorkingColumn = (field: unknown): boolean => typeof field === 'string' && /^(__|_flint)/.test(field);

/** The channels a mark's own tooltip lists, as Vega-Lite reads them from its encoding. */
const NOT_LISTED = new Set(['tooltip', 'href', 'url', 'description', 'key']);
const TOOLTIP_FIELD_KEYS = ['field', 'type', 'title', 'aggregate', 'timeUnit', 'bin', 'format', 'formatType'] as const;
const COMPOSITE_MARKS = new Set(['boxplot', 'errorbar', 'errorband']);

/**
 * Keeps Flint's working columns out of the tooltips Vega-Lite builds from each mark's encoding.
 * A column that repacks the author's field — a folded colour key, a waterfall's step kind — carries
 * that field's name as its title and stays, under the name. One with no name of its own — a radar's
 * positions, a pie's order, a strip's jitter — names nothing a reader asked about, and is left out;
 * a mark with nothing else to list shows no tooltip. A mark whose tooltip lists no working column
 * is left as it is, and so is a composite mark (a boxplot), whose summary a stated list would drop.
 */
export function vlListTooltipFields(spec: any): void {
    if (spec?.config?.mark?.tooltip !== true) return;
    const visit = (node: any, inherited: Record<string, any>): void => {
        if (!node || typeof node !== 'object') return;
        const encoding = { ...inherited, ...(node.encoding ?? {}) };
        const markTooltip = node.mark && typeof node.mark === 'object' ? node.mark.tooltip : undefined;
        // A mark whose encoding asks for no tooltip shows none: with tooltips on for every mark, an
        // encoding's `null` alone does not turn its own off — the mark's does.
        const silence = () => { node.mark = { ...(typeof node.mark === 'object' ? node.mark : { type: node.mark }), tooltip: null }; };
        // A composite mark lists its own summary — a box's quartiles and whiskers — which a list given
        // to it would replace: it keeps Vega-Lite's own.
        const composite = COMPOSITE_MARKS.has(typeof node.mark === 'object' ? node.mark?.type : node.mark);
        if (node.mark && encoding.tooltip === null && markTooltip !== false && markTooltip !== null) silence();
        else if (node.mark && !composite && markTooltip !== false && markTooltip !== null && encoding.tooltip === undefined) {
            const listed: any[] = [];
            let working = false;
            for (const [channel, def] of Object.entries<any>(encoding)) {
                if (NOT_LISTED.has(channel) || !def || typeof def !== 'object' || Array.isArray(def)) continue;
                if (def.field === undefined && def.aggregate !== 'count') continue;
                if (isWorkingColumn(def.field)) {
                    working = true;
                    // A column that repacks the author's field is listed under that field's name.
                    if (typeof def.title !== 'string') continue;
                }
                const entry: Record<string, unknown> = {};
                for (const key of TOOLTIP_FIELD_KEYS) if (def[key] !== undefined && def[key] !== null) entry[key] = def[key];
                listed.push(entry);
            }
            // Stated in full, so Vega-Lite adds none of its own working columns — a sorted key's index.
            if (working && listed.length) node.encoding = { ...(node.encoding ?? {}), tooltip: listed };
            else if (working) silence();
        }
        // A layer's children read its encoding; a facet's or a concatenation's children do not.
        for (const child of node.layer ?? []) visit(child, encoding);
        for (const child of [node.spec, ...(node.hconcat ?? []), ...(node.vconcat ?? []), ...(node.concat ?? [])]) if (child) visit(child, {});
    };
    visit(spec, {});
}

/**
 * Lets the full-text tooltips Flint puts on truncated legend and axis labels fire.
 *
 * Vega-Lite has no way to mark a guide's labels interactive, so this runs on the
 * compiled Vega spec. Pass it as vega-embed's `patch` when embedding yourself;
 * `mountChart` applies it already.
 */
export function enableGuideLabelTooltips<T>(vegaSpec: T): T {
    const visit = (node: any): void => {
        for (const guide of [...(node?.legends ?? []), ...(node?.axes ?? [])]) {
            if (guide.encode?.labels?.update?.tooltip) guide.encode.labels.interactive = true;
        }
        for (const child of node?.marks ?? []) visit(child);
    };
    visit(vegaSpec);
    return vegaSpec;
}
