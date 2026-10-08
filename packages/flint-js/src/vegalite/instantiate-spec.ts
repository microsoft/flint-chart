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
import { snapToBoundHeuristic } from '../core/field-semantics';
import { computeBandLabelLayout } from '../core/decisions';
import { resolveStretchCaps } from '../core/compute-layout';
import {
    timeMillisecond, timeSecond, timeMinute, timeHour, timeDay, timeWeek, timeMonth, timeYear,
    utcMillisecond, utcSecond, utcMinute, utcHour, utcDay, utcWeek, utcMonth, utcYear,
} from 'd3-time';
import { timeFormat, utcFormat } from 'd3-time-format';

const DEFAULT_QUANTITATIVE_AXIS_FORMAT = ',.12~g';
const VEGA_AXIS_LABEL_LIMIT = 180;

interface LegendTextBox {
    width: number;
    height: number;
    fontSize: number;
    cost: number;
    entryRows: number;
    entryLines: number;
}

function fitLegendText(spec: any, context: InstantiateContext, budget?: { width?: number; height?: number }): LegendTextBox[] {
    const config = spec.config?.legend ?? {};
    const boxes: LegendTextBox[] = [];
    if (config.disable) return boxes;
    const canvas = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    const measure = (fontSize: number, font: string, weight: string | number, style: string) => {
        const cache = new Map<string, number>();
        return (text: string): number => {
            if (!canvas) return text.length * fontSize * 0.62;
            if (!cache.has(text)) {
                canvas.font = `${style} ${weight} ${fontSize}px ${font}`;
                cache.set(text, canvas.measureText(text).width);
            }
            return cache.get(text)!;
        };
    };
    const sideWidth = (config.labelFontSize ?? context.layout.legendFontSize) * 18;
    const wrapLines = (text: string, width: number, maxLines: number, widthOf: (text: string) => number): string[] => {
        if (text.includes('\n')) return text.split('\n');
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let line = '';
        for (const word of words) {
            const next = line ? `${line} ${word}` : word;
            if (line && widthOf(next) > width && lines.length < maxLines - 1) {
                lines.push(line);
                line = word;
            } else {
                line = next;
            }
        }
        return [...lines, line];
    };
    const visit = (node: any, inheritedWidth: number): void => {
        const block = typeof node.width === 'number' ? node.width
            : typeof node.width?.step === 'number' && context.layout.xNominalCount
                ? node.width.step * context.layout.xNominalCount : inheritedWidth;
        for (const channel of ['color', 'fill', 'stroke', 'shape', 'size', 'opacity', 'strokeDash', 'strokeWidth']) {
            const encoding = node.encoding?.[channel];
            if (!encoding?.field || encoding.legend === null || encoding.legend === false || encoding.scale === null) continue;
            const legend = encoding.legend ?? {};
            const settings = { ...config, ...legend };
            const fontSize = settings.labelFontSize ?? context.layout.legendFontSize;
            const titleFontSize = settings.titleFontSize ?? context.layout.titleFontSize;
            const labelWidth = measure(fontSize, settings.labelFont ?? spec.config?.font ?? 'sans-serif',
                settings.labelFontWeight ?? 'normal', settings.labelFontStyle ?? 'normal');
            const measureTitle = measure(titleFontSize, settings.titleFont ?? spec.config?.font ?? 'sans-serif',
                settings.titleFontWeight ?? 'bold', settings.titleFontStyle ?? 'normal');
            const title = settings.title !== undefined ? settings.title
                : encoding.title !== undefined ? encoding.title : encoding.aggregate ? undefined : encoding.field;
            const horizontal = ['top', 'bottom'].includes(settings.orient)
                && settings.direction !== 'vertical';
            const inlineTitle = horizontal && ['left', 'right'].includes(settings.titleOrient);
            const titleWidth = horizontal ? (inlineTitle ? block / 3 : block) : sideWidth;
            let titleExtent = 0;
            if (typeof title === 'string' && typeof titleFontSize === 'number'
                && settings.titleLimit === undefined && settings.titleLineHeight === undefined && !legend.encoding?.title) {
                const lines = wrapLines(title, titleWidth, 3, measureTitle);
                legend.titleLimit = 0;
                if (lines.length > 1) {
                    legend.title = lines;
                    legend.titleLineHeight = Math.ceil(titleFontSize * 1.2);
                }
            }
            if (inlineTitle && title && typeof titleFontSize === 'number') {
                const lines = Array.isArray(legend.title ?? title) ? (legend.title ?? title) : [title];
                titleExtent = Math.min(settings.titleLimit || Infinity,
                    Math.max(...lines.map(measureTitle)))
                    + (settings.titlePadding ?? 10);
            }
            const plotHeight = typeof spec.height === 'number' ? spec.height
                : context.layout.subplotHeight ?? context.canvasSize.height;
            const titleLines = Array.isArray(legend.title ?? title) ? (legend.title ?? title).length : title ? 1 : 0;
            const titleHeight = inlineTitle ? 0 : titleLines * Math.ceil(titleFontSize * 1.2) + (titleLines ? settings.titlePadding ?? 10 : 0);
            const discrete = ['nominal', 'ordinal'].includes(encoding.type);
            const numericGradient = !discrete && ['color', 'fill', 'stroke', 'opacity'].includes(channel)
                && settings.type !== 'symbol' && !['quantize', 'quantile', 'threshold', 'bin-ordinal'].includes(encoding.scale?.type);
            const nativeValues = settings.values ?? encoding.scale?.domain;
            const nativeCount = Array.isArray(nativeValues) ? nativeValues.length : discrete
                ? new Set(context.table.map(row => row[encoding.field])).size : 5;
            const nativeRows = Math.ceil(nativeCount / (settings.columns || (horizontal ? nativeCount : 1)));
            const nativeSymbol = Math.sqrt(settings.symbolSize ?? (channel === 'size'
                ? Math.max(...(encoding.scale?.range?.filter?.((value: any) => typeof value === 'number') ?? [400])) : 100)) + 2;
            const nativeLabelWidth = settings.labelLimit ?? Math.min(sideWidth, Math.max(fontSize * 4,
                ...((Array.isArray(nativeValues) ? nativeValues : context.table.map(row => row[encoding.field])).map((value: any) => labelWidth(String(value))))));
            const gradientLength = settings.gradientLength ?? 200;
            let box: LegendTextBox = {
                width: titleExtent + (numericGradient ? horizontal ? gradientLength : (settings.gradientThickness ?? 16) + nativeLabelWidth + 6
                    : (settings.columns || (horizontal ? nativeCount : 1)) * (nativeLabelWidth + nativeSymbol + 4)) + 2 * (settings.padding ?? 0),
                height: titleHeight + (numericGradient ? horizontal ? (settings.gradientThickness ?? 16) + fontSize * 1.5 : gradientLength
                    : nativeRows * (Math.max(fontSize * 1.2, nativeSymbol) + (settings.rowPadding ?? 2))) + 2 * (settings.padding ?? 0),
                fontSize, cost: 0, entryRows: numericGradient ? 1 : nativeRows, entryLines: 1,
            };
            if (['nominal', 'ordinal'].includes(encoding.type) && typeof fontSize === 'number'
                && settings.labelExpr === undefined && settings.labelLimit === undefined
                && settings.format === undefined && settings.formatType === undefined && !legend.encoding?.labels) {
                const field = encoding.field;
                const values = Array.isArray(settings.values) ? settings.values
                    : Array.isArray(encoding.scale?.domain) ? encoding.scale.domain
                    : context.table.map(row => row[field]);
                const labels = [...new Set<string>(values.filter((value: any) => value != null).map(String))];
                let selectedLines: string[][] | undefined;
                let selectedLimit = 0;
                if (labels.length) {
                    const gap = settings.columnPadding ?? 10;
                    const symbol = Math.sqrt(settings.symbolSize ?? 100) + (settings.labelOffset ?? 4);
                    const available = Math.max(1, (budget?.width ?? (horizontal ? block : sideWidth + symbol)) - titleExtent - 2 * (settings.padding ?? 0));
                    const heightBudget = budget?.height ?? (horizontal ? Math.max(48, plotHeight * 0.4) : plotHeight);
                    const rowGap = settings.rowPadding ?? 6;
                    let bestCost = Infinity;
                    let columns = 1;
                    const columnCounts = typeof settings.columns === 'number'
                        ? [settings.columns > 0 ? Math.min(settings.columns, labels.length) : labels.length]
                        : Array.from({ length: labels.length }, (_, index) => index + 1);
                    const naturalWidth = Math.max(...labels.map(labelWidth));
                    const lineHeight = Math.ceil(fontSize * 1.2);
                    const headingWidth = inlineTitle || !title ? 0 : Math.min(settings.titleLimit || Infinity,
                        Math.max(...(Array.isArray(legend.title ?? title) ? legend.title ?? title : [title]).map(measureTitle)));
                    for (const count of columnCounts) {
                        const limit = count === labels.length ? available - symbol
                            : (available - gap * (count - 1)) / count - symbol;
                        if (limit < fontSize * 4 && count > 1) continue;
                        const startWidth = Math.max(Math.min(naturalWidth, fontSize * 4), Math.min(naturalWidth, limit));
                        const minWidth = Math.min(startWidth, fontSize * 4);
                        const steps = startWidth > minWidth ? 24 : 0;
                        for (let step = 0; step <= steps; step++) {
                            const textWidth = startWidth - (startWidth - minWidth) * step / Math.max(1, steps);
                            let lines: string[][] = [];
                            let height = 0;
                            for (let maxLines = 3; maxLines >= 1; maxLines--) {
                                lines = labels.map(label => wrapLines(label, textWidth, maxLines, labelWidth));
                                const rowLines = Math.max(...lines.map(entry => entry.length));
                                const heights = lines.map(entry => Math.max(Math.sqrt(settings.symbolSize ?? 100) + 2,
                                    lineHeight * entry.length));
                                const rowCount = Math.ceil(labels.length / count);
                                height = titleHeight + Math.max(0, rowCount - 1) * rowGap + 2 * (settings.padding ?? 0);
                                for (let row = 0; row < rowCount; row++) {
                                    height += horizontal && rowLines > 1
                                        ? Math.max(fontSize + (rowLines - 1) * lineHeight, Math.sqrt(settings.symbolSize ?? 100)) + 4
                                        : Math.max(...heights.slice(row * count, (row + 1) * count));
                                }
                                if (height <= heightBudget) break;
                            }
                            const widths = lines.map(entry => Math.max(...entry.map(line => Math.min(textWidth, labelWidth(line)))));
                            const columnWidths = Array.from({ length: count }, (_, column) => Math.max(...widths
                                .filter((_, index) => index % count === column)));
                            const extent = columnWidths.reduce((sum, column) => sum + column + symbol, 0) + gap * (count - 1);
                            const width = Math.max(extent + titleExtent, headingWidth) + 2 * (settings.padding ?? 0);
                            const loss = lines.reduce((total, entry, index) => total + entry.reduce((lost, line) =>
                                lost + (labelWidth(line) > textWidth ? labelWidth(line) - Math.max(0, textWidth - labelWidth('…')) : 0), 0)
                                / Math.max(1, labelWidth(labels[index])), 0) / labels.length;
                            const wrappingCost = lines.reduce((sum, entry) => sum
                                + (entry.length > 1 ? 0.6 : 0) + Math.max(0, entry.length - 2) * 1.4, 0) / labels.length;
                            const widest = Math.max(...widths, 1);
                            const imbalance = (widest - widths.reduce((sum, value) => sum + value, 0) / widths.length) / widest;
                            const overflow = Math.max(0, height / heightBudget - 1) * 10
                                + Math.max(0, extent / available - 1) * (horizontal ? 10 : 2);
                            const widthCost = (horizontal ? 0.12 : 1) * width / (available + titleExtent + 2 * (settings.padding ?? 0));
                            const cost = overflow + widthCost
                                + wrappingCost + 0.25 * imbalance + 4 * loss + (loss ? 0.25 : 0)
                                + (horizontal ? 0.6 * height / heightBudget : 0) + 0.005 * count;
                            if (cost < bestCost) {
                                bestCost = cost;
                                columns = count;
                                selectedLines = lines;
                                selectedLimit = loss ? textWidth : 0;
                                box = { width, height, fontSize, cost: cost - overflow - widthCost,
                                    entryRows: Math.ceil(labels.length / count), entryLines: Math.max(...lines.map(entry => entry.length)) };
                            }
                        }
                    }
                    if (settings.columns === undefined && (!horizontal || columns < labels.length)) legend.columns = columns;
                    legend.labelFontSize = fontSize;
                    legend.labelLimit = selectedLimit;
                    legend.rowPadding = rowGap;
                    if (settings.symbolLimit === undefined) legend.symbolLimit = 0;
                }
                const fit = selectedLines?.some(lines => lines.length > 1) ? { lines: selectedLines } : null;
                if (fit) {
                    const index = `indexof(${JSON.stringify(labels)}, toString(datum.label))`;
                    legend.labelExpr = `${index} < 0 ? datum.label : ${JSON.stringify(fit.lines)}[${index}]`;
                    if (settings.clipHeight === undefined && settings.labelBaseline === undefined
                        && !legend.encoding?.symbols) {
                        const lineHeight = Math.ceil(fontSize * 1.2);
                        const maxLines = Math.max(...fit.lines.map(lines => lines.length));
                        const rowHeight = Math.max(fontSize + (maxLines - 1) * lineHeight, Math.sqrt(settings.symbolSize ?? 100)) + 4;
                        if (horizontal) legend.clipHeight = rowHeight;
                        legend.labelBaseline = 'top';
                        legend.rowPadding = settings.rowPadding ?? 6;
                        legend.gridAlign = settings.gridAlign ?? (horizontal ? 'all' : 'each');
                        legend.encoding = {
                            ...legend.encoding,
                            labels: { y: { value: 2 }, lineHeight: { value: lineHeight } },
                            symbols: { y: { value: 2 + fontSize / 2 } },
                        };
                    }
                }
                legend.encoding = {
                    ...legend.encoding,
                    labels: { ...legend.encoding?.labels,
                        tooltip: { value: { expr: 'datum.value' } },
                        description: { value: { expr: 'toString(datum.value)' } } },
                };
            }
            if (title && typeof titleFontSize === 'number') {
                const lines = Array.isArray(legend.title ?? title) ? legend.title ?? title : [title];
                const measuredTitleWidth = Math.min(settings.titleLimit || Infinity, Math.max(...lines.map(measureTitle)));
                if (!inlineTitle) box.width = Math.max(box.width, measuredTitleWidth + 2 * (settings.padding ?? 0));
                else box.height = Math.max(box.height, lines.length * Math.ceil(titleFontSize * 1.2) + 2 * (settings.padding ?? 0));
            }
            if (Object.keys(legend).length) encoding.legend = legend;
            boxes.push(box);
        }
        if (node.spec) visit(node.spec, block);
        for (const key of ['layer', 'concat', 'hconcat', 'vconcat']) {
            for (const child of node[key] ?? []) visit(child, block);
        }
    };
    visit(spec, spec.config?.view?.continuousWidth ?? context.canvasSize.width);
    return boxes;
}

export function vlWrapLegendText(spec: any, context: InstantiateContext): void {
    if (spec.config?.legend?.disable) return;
    const layout = context.layout;
    let plotWidth = layout.subplotWidth ?? context.canvasSize.width;
    let plotHeight = layout.subplotHeight ?? context.canvasSize.height;
    const dimensions = (node: any): void => {
        const width = typeof node.width === 'number' ? node.width
            : typeof node.width?.step === 'number' ? node.width.step * layout.xNominalCount : undefined;
        const height = typeof node.height === 'number' ? node.height
            : typeof node.height?.step === 'number' ? node.height.step * layout.yNominalCount : undefined;
        if (width > 0) plotWidth = width;
        if (height > 0) plotHeight = height;
        if (node.spec) dimensions(node.spec);
        for (const child of node.layer ?? []) dimensions(child);
        const children = node.vconcat ?? node.hconcat ?? node.concat;
        if (children) {
            const plot = children.find((child: any) => child.facet || child.encoding?.x?.field || child.encoding?.y?.field || child.layer);
            if (plot) dimensions(plot);
        }
    };
    dimensions(spec);
    plotWidth = plotWidth * (layout.facet?.columns ?? 1) + Math.max(0, (layout.facet?.columns ?? 1) - 1) * (layout.effectiveFacetGap ?? 10);
    plotHeight = plotHeight * (layout.facet?.rows ?? 1) + Math.max(0, (layout.facet?.rows ?? 1) - 1) * (layout.effectiveFacetGap ?? 10);
    const config = spec.config?.legend ?? {};
    type Candidate = LegendTextBox & { orient: string; legend: any; preference: number };
    const groups: Array<{ channel: string; encoding: any; refs: any[]; candidates: Candidate[] }> = [];
    const keys = new Map<string, number>();
    const collect = (node: any): void => {
        for (const channel of ['color', 'fill', 'stroke', 'shape', 'size', 'opacity', 'strokeDash', 'strokeWidth']) {
            const encoding = node.encoding?.[channel];
            if (!encoding?.field || encoding.legend === null || encoding.legend === false || encoding.scale === null) continue;
            const key = JSON.stringify([encoding.field, encoding.type, channel === 'size' ? 'size' : 'ink', encoding.scale, encoding.legend, encoding.title]);
            const found = keys.get(key);
            if (found !== undefined) groups[found].refs.push(encoding);
            else {
                keys.set(key, groups.length);
                groups.push({ channel, encoding, refs: [encoding], candidates: [] });
            }
        }
        if (node.spec) collect(node.spec);
        for (const key of ['layer', 'concat', 'hconcat', 'vconcat']) for (const child of node[key] ?? []) collect(child);
    };
    collect(spec);
    if (!groups.length) return;
    const sideBudget = (config.labelFontSize ?? layout.legendFontSize) * 24 + 14;
    const horizontalBudget = Math.max(48, plotHeight * 0.4);
    for (const group of groups) {
        const preferred = group.encoding.legend?.orient ?? config.orient ?? 'right';
        const authored = context.encodings?.[group.channel] as any;
        const fixed = authored?.legend?.orient !== undefined
            || (!context.encodings && (group.encoding.legend?.orient !== undefined || config.orient !== undefined))
            || !['left', 'right', 'top', 'bottom'].includes(preferred);
        const fixedTitle = authored?.legend?.titleOrient !== undefined
            || (!context.encodings && (group.encoding.legend?.titleOrient !== undefined || config.titleOrient !== undefined));
        const orients = fixed ? [preferred] : [...new Set([preferred, 'right', 'bottom', 'top', 'left'])];
        for (const orient of orients) {
            const horizontal = orient === 'top' || orient === 'bottom';
            for (const fraction of groups.length > 1 ? [1, 0.5] : [1]) {
                for (const inline of orient === 'bottom' && !fixedTitle && !group.encoding.legend?.encoding?.title ? [false, true] : [false]) {
                    const encoding = structuredClone(group.encoding);
                    encoding.legend = { ...(encoding.legend ?? {}) };
                    if (orient !== preferred) {
                        encoding.legend.orient = orient;
                        if (encoding.legend.direction === undefined) encoding.legend.direction = horizontal ? 'horizontal' : 'vertical';
                        if (encoding.legend.titleOrient === undefined) encoding.legend.titleOrient = 'top';
                    }
                    if (inline) encoding.legend.titleOrient = 'left';
                    const probe = { width: plotWidth, height: plotHeight,
                        config: { ...spec.config, legend: { ...config, orient } }, encoding: { [group.channel]: encoding } };
                    const box = fitLegendText(probe, context, {
                        width: horizontal ? plotWidth * fraction : sideBudget,
                        height: horizontal ? horizontalBudget : plotHeight * fraction,
                    })[0];
                    if (inline && (box.entryRows !== 1 || box.entryLines !== 1 || box.width > plotWidth * fraction
                        || (Array.isArray(encoding.legend.title) && encoding.legend.title.length > 1))) continue;
                    const preference = orient === preferred ? 0 : orient === 'left' ? 0.45 : 0.25;
                    group.candidates.push({ ...box, orient, legend: encoding.legend, preference });
                }
            }
        }
        const fittingSide = group.candidates.some(candidate => ['left', 'right'].includes(candidate.orient)
            && candidate.width <= sideBudget && candidate.height <= plotHeight);
        if (!fixed && fittingSide) {
            group.candidates = group.candidates.filter(candidate => !['top', 'bottom'].includes(candidate.orient)
                || (candidate.entryRows <= 2 && candidate.entryLines <= 2));
        }
    }
    const footprint = (choices: Candidate[]) => {
        const edges = [...new Set(choices.map(choice => choice.orient))].map(orient => {
            const entries = choices.filter(choice => choice.orient === orient);
            const horizontal = orient === 'top' || orient === 'bottom';
            const widthBudget = horizontal ? plotWidth : sideBudget;
            const heightBudget = horizontal ? horizontalBudget : plotHeight;
            const gap = config.layout?.[orient]?.margin ?? config.layout?.margin ?? 8;
            const fixedDirection = config.layout?.[orient]?.direction;
            const alternatives = (fixedDirection ? [fixedDirection] : ['vertical', 'horizontal']).map(direction => {
                const width = direction === 'vertical' ? Math.max(...entries.map(entry => entry.width))
                    : entries.reduce((sum, entry) => sum + entry.width, 0) + gap * (entries.length - 1);
                const height = direction === 'horizontal' ? Math.max(...entries.map(entry => entry.height))
                    : entries.reduce((sum, entry) => sum + entry.height, 0) + gap * (entries.length - 1);
                const overflow = Math.max(0, width / widthBudget - 1) + Math.max(0, height / heightBudget - 1);
                return { orient, direction, width, height, widthBudget, heightBudget, overflow,
                    cost: Math.max(0, height / heightBudget - 1) * 20
                        + Math.max(0, width / widthBudget - 1) * (horizontal ? 20 : 4)
                        + 0.15 * (horizontal ? height / heightBudget : width / widthBudget) };
            });
            return alternatives.sort((first, second) => first.cost - second.cost)[0];
        });
        const cost = edges.reduce((sum, edge) => sum + edge.cost, 0)
            + choices.reduce((sum, choice) => sum + choice.cost + choice.preference, 0)
            + Math.max(0, edges.length - 1) * 0.1;
        return { cost, edges };
    };
    let plans: Array<{ choices: Candidate[]; cost: number }> = [{ choices: [], cost: 0 }];
    for (const group of groups) {
        plans = plans.flatMap(plan => group.candidates.map(candidate => {
            const choices = [...plan.choices, candidate];
            return { choices, cost: footprint(choices).cost };
        })).sort((first, second) => first.cost - second.cost).slice(0, 32);
    }
    const chosen = plans[0].choices;
    const result = footprint(chosen);
    for (let index = 0; index < groups.length; index++) {
        for (const encoding of groups[index].refs) encoding.legend = structuredClone(chosen[index].legend);
    }
    spec.config ??= {};
    spec.config.legend ??= {};
    for (const edge of result.edges) {
        if (chosen.filter(choice => choice.orient === edge.orient).length < 2) continue;
        spec.config.legend.layout ??= {};
        spec.config.legend.layout[edge.orient] = { ...(spec.config.legend.layout[edge.orient] ?? {}),
            direction: edge.direction, anchor: spec.config.legend.layout[edge.orient]?.anchor ?? 'start' };
    }
    spec._legendLayout = {
        plotWidth, plotHeight,
        legends: chosen.map((choice, index) => ({ field: groups[index].encoding.field, orient: choice.orient,
            width: choice.width, height: choice.height, fontSize: choice.fontSize })),
        overflow: result.edges.filter(edge => edge.overflow > 0).map(({ orient, width, height, widthBudget, heightBudget }) =>
            ({ orient, width, height, widthBudget, heightBudget })),
    };
}

export function vlPlanBandLabels(context: InstantiateContext, template: any, themeFontSize?: number): void {
    const { layout, canvasSize, channelSemantics } = context;
    const options = context.assembleOptions ?? {};
    const caps = resolveStretchCaps(options);
    for (const channel of ['x', 'y'] as const) {
        const semantics = channelSemantics[channel];
        const discrete = channel === 'x' ? layout.xNominalCount > 0 : layout.yNominalCount > 0;
        if (!discrete || !semantics?.field || !['nominal', 'ordinal'].includes(semantics.type)) continue;
        const targets = [context.resolvedEncodings[channel], template.encoding?.[channel],
            ...(template.layer ?? []).map((layer: any) => layer.encoding?.[channel])].filter(Boolean);
        if (targets.some((encoding) => encoding.axis === null || encoding.axis === false
            || encoding.axis?.labelExpr !== undefined || encoding.axis?.labelAngle !== undefined
            || encoding.axis?.labelLimit !== undefined || encoding.axis?.format !== undefined)) continue;
        const labels = [...new Set(context.table.map((row) => row[semantics.field!])
            .filter((value) => value != null).map(String))];
        if (!labels.length || labels.every((label) => label.trim() !== '' && Number.isFinite(Number(label)))) continue;
        const sizing = channel === 'x' ? layout.xLabel : layout.yLabel;
        const step = channel === 'x' ? layout.xStep : layout.yStep;
        const panels = channel === 'x' ? layout.facet?.columns ?? 1 : layout.facet?.rows ?? 1;
        const fixed = channel === 'x' ? options.facetFixedPadding?.width ?? 0 : options.facetFixedPadding?.height ?? 0;
        const canvasSpan = channel === 'x' ? canvasSize.width : canvasSize.height;
        const subplotSpan = channel === 'x' ? layout.subplotWidth : layout.subplotHeight;
        const maxSpan = (canvasSpan * caps[channel] - fixed) / panels - layout.effectiveFacetGap;
        const baseSpan = Math.min(subplotSpan, (canvasSpan - fixed) / panels - layout.effectiveFacetGap);
        const fontSize = themeFontSize ?? sizing.fontSize;
        const fit = computeBandLabelLayout({
            labels, axis: channel, fontSize, step,
            baseSpan, maxSpan, gutterLimit: Math.max(VEGA_AXIS_LABEL_LIMIT, Math.min(canvasSize.width, layout.subplotWidth) / 4),
            baselineLimit: sizing.labelLimit,
            elasticity: options.elasticity ?? 0.5,
        });
        if (!fit) continue;
        if (channel === 'x') layout.xStep = fit.step;
        else layout.yStep = fit.step;
        Object.assign(sizing, {
            fontSize,
            labelAngle: 0,
            labelAlign: channel === 'x' ? 'center' : 'right',
            labelBaseline: channel === 'x' ? 'top' : 'middle',
            labelLimit: Math.ceil(fit.width) + 2,
            labelValues: labels,
            labelLines: fit.lines,
            labelLineHeight: fit.lineHeight,
        });
    }
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
    axisLabelFontSize?: number,
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
        if (!cs?.zero) continue;
        const decision = cs.zero;

        const targets = collectEncodingTargets(ch)
            .filter(enc => enc.type === 'quantitative');

        for (const enc of targets) {
            // Skip binned encodings — the bin axis represents data values,
            // not bar length, so zero-baseline is inappropriate (e.g. histograms).
            if (enc.bin) continue;
            // Skip encodings using a private/synthetic field distinct from
            // the channel's semantic field (e.g. Radar's `__y` polar coord).
            if (cs.field && enc.field && enc.field !== cs.field) continue;
            if (!enc.scale) enc.scale = {};
            if (enc.scale.zero !== undefined) continue;
            if (enc.scale.domain && Array.isArray(enc.scale.domain)) continue;

            enc.scale.zero = decision.zero;

            // No explicit domain padding — VL's native `nice` rounding
            // (on by default) already provides breathing room with clean
            // tick-aligned bounds, which is superior to computed fractional
            // bounds like [1.86, 4.94] that also conflict with semantic
            // domain constraints and log scales.
        }
    }

    // --- Apply field-context semantic decisions (format, domain, ticks, etc.) ---
    vlApplyFieldContext(vgObj, channelSemantics, collectEncodingTargets, context);

    // --- Apply safe default formatting to positional axes ---
    vlApplyDefaultAxisFormat(vgObj, collectEncodingTargets, context, axisLabelFontSize);

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

    // --- Banded continuous axis domain padding ---
    // For banded continuous axes (e.g. Heatmap with quantitative X/Y),
    // add a half-step buffer so edge cells aren't clipped at the boundary.
    // Without this, the domain starts/ends exactly at min/max data values
    // and rect marks at the edges are only half-visible.
    for (const axis of ['x', 'y'] as const) {
        const bandedCount = axis === 'x' ? layout.xContinuousAsDiscrete : layout.yContinuousAsDiscrete;
        if (bandedCount <= 1) continue;

        // Labelled heatmaps move X/Y onto rect and text layers. Looking only at
        // the top-level encoding skips both, so temporal edge cells lose their
        // half-step domain and are clipped against the axis. Apply the same
        // domain to every matching layer target; shared scales then resolve
        // consistently and neither layer introduces a competing boundary.
        for (const enc of collectEncodingTargets(axis)) {
            // Skip binned encodings — VL handles bin domain automatically
            if (enc.bin) continue;

            const isTemporal = enc.type === 'temporal';
            const isContinuous = enc.type === 'quantitative' || isTemporal;
            if (!isContinuous) continue;
            if (enc.scale?.domain) continue;

            const numericVals = context.table
                .map((r: any) => {
                    const raw = r[enc.field];
                    if (raw == null) return NaN;
                    if (isTemporal) return +new Date(raw);
                    return +raw;
                })
                .filter((v: number) => !isNaN(v));
            if (numericVals.length <= 1) continue;

            const minVal = Math.min(...numericVals);
            const maxVal = Math.max(...numericVals);
            const dataRange = maxVal - minVal;
            if (dataRange === 0) continue;

            const pad = dataRange / (bandedCount - 1) / 2;
            if (!enc.scale) enc.scale = {};
            enc.scale.nice = false;

            if (isTemporal) {
                enc.scale.domain = [
                    new Date(minVal - pad).toISOString(),
                    new Date(maxVal + pad).toISOString(),
                ];
            } else {
                enc.scale.zero = false;
                enc.scale.domain = [minVal - pad, maxVal + pad];
            }
        }
    }

    // --- Canvas sizing ---
    const axisXConfig: Record<string, any> = {
        labelLimit: layout.xLabel.labelLimit,
        labelFontSize: layout.xLabel.fontSize,
        titleFontSize: layout.titleFontSize,
    };
    if (layout.xLabel.labelAngle !== undefined) {
        axisXConfig.labelAngle = layout.xLabel.labelAngle;
        axisXConfig.labelAlign = layout.xLabel.labelAlign;
        axisXConfig.labelBaseline = layout.xLabel.labelBaseline;
    }
    const axisYConfig: Record<string, any> = {
        labelFontSize: layout.yLabel.fontSize,
        titleFontSize: layout.titleFontSize,
    };
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
            labelAngle: sizing.labelAngle,
            labelAlign: sizing.labelAlign,
            labelBaseline: sizing.labelBaseline,
            labelLimit: sizing.labelLimit,
            labelLineHeight: sizing.labelLineHeight,
            labelExpr: `${labelIndex} < 0 ? datum.label : ${JSON.stringify(sizing.labelLines)}[${labelIndex}]`,
        });
        if (channel === 'y') {
            const offsets = sizing.labelLines.map(lines => -(lines.length - 1) * (sizing.labelLineHeight ?? sizing.fontSize + 2) / 2);
            config.labelOffset = { expr: `${labelIndex} < 0 ? 0 : ${JSON.stringify(offsets)}[${labelIndex}]` };
        }
    }
    // Vega drops a tick label only once its box *overlaps* its neighbour's, so
    // two numbers whose boxes merely abut both survive and are read as one:
    // `20,000` beside `30,000` prints `20,00030,000`. Numbers need a
    // character's worth of air between them before they read as two. Bands are
    // exempt — their labels are spaced by the scale, and thinning them drops a
    // category rather than a tick.
    if (!xIsDiscrete) axisXConfig.labelSeparation = Math.round(layout.xLabel.fontSize * 0.6);
    if (!yIsDiscrete) axisYConfig.labelSeparation = Math.round(layout.yLabel.fontSize * 0.6);

    vgObj.config = {
        view: {
            continuousWidth: layout.subplotWidth,
            continuousHeight: layout.subplotHeight,
            ...((!vgObj.encoding || vgObj._hideViewStroke) && { stroke: null }),
        },
        axisX: axisXConfig,
        axisY: axisYConfig,
        legend: {
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
 * Compute the positive and negative stacked extremes for a quantitative field.
 *
 * For a stacked bar chart with:
 *   x = category (grouping), y = value (stacked), color = series
 *
 * Vega-Lite stacks positive and negative contributions *separately* (positives
 * grow up from 0, negatives down from 0), so we track each side independently —
 * summing signed values together would let a mix of +0.9 and −0.2 cancel and
 * hide a tall positive stack. Returns the largest positive group sum and the
 * most-negative group sum, used to check whether either side overflows an
 * intrinsic domain bound (e.g., correlations summing past 1).
 *
 * Returns undefined if the grouping field can't be determined.
 */
function computeStackedExtremes(
    table: any[],
    measureField: string,
    measureChannel: string,
    channelSemantics: Record<string, ChannelSemantics>,
): { maxPos: number; minNeg: number } | undefined {
    if (!table || table.length === 0) return undefined;

    // The grouping axis is the *other* positional channel
    const groupChannel = measureChannel === 'y' ? 'x' : 'y';
    const groupCS = channelSemantics[groupChannel];
    if (!groupCS) return undefined;
    const groupField = groupCS.field;
    if (!groupField) return undefined;

    // Also consider facet fields (row/column) as additional grouping
    const facetFields: string[] = [];
    for (const ch of ['row', 'column']) {
        const fcs = channelSemantics[ch];
        if (fcs?.field) facetFields.push(fcs.field);
    }

    // Group rows and sum positive / negative contributions per group separately
    const posTotals = new Map<string, number>();
    const negTotals = new Map<string, number>();
    for (const row of table) {
        const val = row[measureField];
        if (typeof val !== 'number' || isNaN(val)) continue;

        // Build group key from grouping field + facet fields
        const keyParts = [String(row[groupField])];
        for (const ff of facetFields) {
            keyParts.push(String(row[ff]));
        }
        const key = keyParts.join('|||');
        if (val >= 0) {
            posTotals.set(key, (posTotals.get(key) ?? 0) + val);
        } else {
            negTotals.set(key, (negTotals.get(key) ?? 0) + val);
        }
    }

    if (posTotals.size === 0 && negTotals.size === 0) return undefined;
    const maxPos = posTotals.size > 0 ? Math.max(...posTotals.values()) : 0;
    const minNeg = negTotals.size > 0 ? Math.min(...negTotals.values()) : 0;
    return { maxPos, minNeg };
}

const NICE_E10 = Math.sqrt(50);
const NICE_E5 = Math.sqrt(10);
const NICE_E2 = Math.SQRT2;

function niceStackSpan(start: number, stop: number, count: number): [number, number] {
    let lo = start;
    let hi = stop;
    let previousStep: number | undefined;
    for (let index = 0; index < 32; index += 1) {
        const rawStep = (hi - lo) / Math.max(1, count);
        const power = Math.floor(Math.log10(rawStep));
        const error = rawStep / 10 ** power;
        const factor = error >= NICE_E10 ? 10 : error >= NICE_E5 ? 5 : error >= NICE_E2 ? 2 : 1;
        const step = power >= 0 ? factor * 10 ** power : -(10 ** -power) / factor;
        if (step === previousStep || step === 0 || !Number.isFinite(step)) break;
        if (step > 0) {
            lo = Math.floor(lo / step) * step;
            hi = Math.ceil(hi / step) * step;
        } else {
            lo = Math.ceil(lo * step) / step;
            hi = Math.floor(hi * step) / step;
        }
        previousStep = step;
    }
    return [lo, hi];
}

/**
 * Pin a positive sum stack that already ends on the clean tick `nice` would
 * choose. Stored calculated shares can total 99.9999999999; leaving that to
 * Vega's post-stack arithmetic may cross the tick by a rounding bit and add a
 * whole empty interval. A meaningful excess remains on automatic nice.
 */
function pinCleanStackEndpoint(enc: any, extremes: { maxPos: number; minNeg: number }): void {
    if (extremes.minNeg < 0 || !(extremes.maxPos > 0)) return;
    if (enc.scale?.domain != null || enc.scale?.domainMax != null || enc.scale?.nice === false) return;
    const count = typeof enc.scale?.nice === 'number' ? enc.scale.nice : 10;
    const tolerance = Math.max(1, Math.abs(extremes.maxPos)) * 1e-9;
    const [, cleanMax] = niceStackSpan(0, extremes.maxPos - tolerance, count);
    if (Math.abs(cleanMax - extremes.maxPos) > tolerance) return;
    enc.scale = {
        ...(enc.scale ?? {}),
        domainMin: enc.scale?.domainMin ?? 0,
        domainMax: cleanMax,
        nice: false,
    };
}

/**
 * Detect whether a discrete category repeats across rows — i.e., multiple rows
 * share the same category value, which makes Vega-Lite stack the measure even
 * with no color encoding. Used to recognise implicit no-color stacking so the
 * intrinsic-domain check runs against the stacked total, not individual values.
 */
function hasRepeatedCategory(
    table: any[],
    categoryField: string | undefined,
    measureField: string,
): boolean {
    if (!table || table.length === 0 || !categoryField) return false;
    const seen = new Set<string>();
    for (const row of table) {
        const val = row[measureField];
        if (typeof val !== 'number' || isNaN(val)) continue;
        const key = String(row[categoryField]);
        if (seen.has(key)) return true;
        seen.add(key);
    }
    return false;
}

/**
 * Get the effective intrinsic domain for a field, even when no explicit
 * `intrinsicDomain` is provided in the annotation.
 *
 * Mirrors steps 2–3 of `resolveDomainConstraint` (in field-semantics.ts)
 * which infer intrinsic bounds from the semantic type:
 *   - Percentage → [0, 1] or [0, 100] depending on data scale
 *   - Latitude → [-90, 90]
 *   - Longitude → [-180, 180]
 *   - Correlation → [-1, 1]
 *
 * Without this: stacked charts with Percentage fields that lack explicit
 * annotation never get domain constraints, because the stacking re-check
 * in vlApplyFieldContext couldn't find the intrinsic bounds.
 */
function getEffectiveIntrinsicDomain(
    cs: ChannelSemantics,
    table: any[],
    field: string,
): [number, number] | undefined {
    // 1. Explicit annotation — authoritative
    if (cs.semanticAnnotation?.intrinsicDomain) {
        return cs.semanticAnnotation.intrinsicDomain;
    }

    // 2. Infer from semantic type
    const semanticType = cs.semanticAnnotation?.semanticType;
    if (!semanticType) return undefined;

    if (semanticType === 'Latitude')    return [-90, 90];
    if (semanticType === 'Longitude')   return [-180, 180];
    if (semanticType === 'Correlation') return [-1, 1];

    if (semanticType === 'Percentage') {
        const nums = table
            .map(r => r[field])
            .filter((v: any) => typeof v === 'number' && !isNaN(v));
        if (nums.length > 0) {
            // Inline scale detection: if ≥80% of |values| are ≤1, it's 0-1 scale
            const countBelow1 = nums.filter(v => Math.abs(v) <= 1).length;
            const isFractional = countBelow1 / nums.length >= 0.8;
            return isFractional ? [0, 1] : [0, 100];
        }
    }

    return undefined;
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

            // ── 2. Tooltip format ──
            // Tooltip formatting is handled via VL's tooltip encoding with format.
            // Without this: tooltips show raw floats like "0.4812" instead of "48.12%".
            // NOTE: VL's `config.mark.tooltip: true` uses default formatting;
            // explicit tooltip channels would need encoding-level format.
            // For now, we set formatType on the main encoding when tooltipFormat
            // has a simple pattern (no prefix/suffix).
            // Full tooltip encoding is deferred to template-level implementation.

            // ── 3. Domain constraint (scale.domain + scale.clamp) ──
            // Semantic domain constraints represent *intrinsic* field bounds.
            // Full constraints (both min+max) set scale.domain directly.
            // Partial constraints (only min or max) use VL's domainMin/domainMax
            // for single-ended bounds, letting the other end auto-fit from data.
            // Skip binned encodings — VL handles bin domain automatically.
            //
            // Stacking interaction:
            //   Sum-stacked charts (default / "zero" / "center") show stacked
            //   totals on the axis, not individual values. The field-level snap
            //   heuristic only saw individual values, which may not reflect the
            //   actual axis range.  We recompute: if the max group total still
            //   fits within the intrinsic bound, the snap constraint is safe
            //   (e.g., percentages summing to exactly 100%).  If totals exceed
            //   the bound, we skip the constraint to avoid clipping bars.
            //   Normalize-stacked (stack: "normalize"): VL normalizes to [0,1],
            //   so domain is always [0,1]. Constraint is harmless. → Keep.
            //   Layered / no stack (stack: null/false): each bar is
            //   independent. → Apply domain constraints as normal.
            //
            // VL auto-stacks bar/area marks whenever multiple rows share the
            // same discrete position — most obviously with a color series, but
            // ALSO with no color at all when a category repeats (several rows
            // per x). Both cases sum on the measure axis, so the intrinsic
            // domain must be checked against the stacked total, not individual
            // values.
            //
            // Without this: Rating gets auto-fitted to data range (e.g., 2-4.5)
            // instead of showing the full 1-5 scale.
            const isExplicitlyStacked = enc.stack !== undefined && enc.stack !== null && enc.stack !== false;
            const markType = typeof vgObj.mark === 'string' ? vgObj.mark : vgObj.mark?.type;
            const isBarLike = ['bar', 'area', 'rect'].includes(markType);
            // Check for color encoding at top level, in layers, or in faceted spec
            const hasColorEncoding = !!(
                vgObj.encoding?.color?.field
                || (Array.isArray(vgObj.layer) && vgObj.layer.some((l: any) => l.encoding?.color?.field))
                || vgObj.spec?.encoding?.color?.field
            );
            // The other positional channel; bar-like charts stack the measure
            // when this axis is discrete and a category repeats across rows.
            const otherChannel = ch === 'y' ? 'x' : 'y';
            const otherCS = channelSemantics[otherChannel];
            const otherIsDiscrete = otherCS?.type === 'nominal' || otherCS?.type === 'ordinal';
            const isImplicitlyStacked = isBarLike && enc.stack !== null
                && (hasColorEncoding
                    || (otherIsDiscrete && hasRepeatedCategory(context.table, otherCS?.field, enc.field)));
            const isStacked = isExplicitlyStacked || isImplicitlyStacked;
            const isNormalizeStacked = enc.stack === 'normalize';
            const isSumStacked = isStacked && !isNormalizeStacked;
            const stackedExtremes = isSumStacked
                ? computeStackedExtremes(context.table, enc.field, ch, channelSemantics)
                : undefined;

            // For sum-stacked charts, check if stacked totals exceed the
            // intrinsic domain.  If they do, skip the domain constraint.
            //
            // Also, if snap didn't fire on individual values but stacked
            // totals are near the intrinsic bound, re-run snap on the totals.
            // Example: individual percentages range 20–50% (no snap), but
            // they sum to ~100% per group → should snap to 100%.
            let skipDomain = false;
            // Size and color scales must not silently re-normalize when a
            // mounted chart replaces its rows. An explicit intrinsic domain is
            // the author's stable reference frame for both symbol area and
            // quantitative color (including a diverging scale's center).
            const declaredScaleDomain = ch === 'size' || ch === 'color'
                ? cs.semanticAnnotation?.intrinsicDomain
                : undefined;
            let effectiveDomainConstraint = declaredScaleDomain
                ? { min: declaredScaleDomain[0], max: declaredScaleDomain[1], clamp: true }
                : cs.domainConstraint;

            if (isSumStacked) {
                // Use explicit intrinsicDomain from annotation, or infer from
                // semantic type for known bounded types (Percentage, Lat/Lon, etc.)
                // Without this: Percentage fields without explicit annotation
                // never get a domain constraint on stacked charts because
                // individual values don't trigger snap, and the stacked re-check
                // can't find the intrinsic bounds to snap totals against.
                const intrinsic = getEffectiveIntrinsicDomain(cs, context.table, enc.field);
                if (intrinsic) {
                    const extremes = stackedExtremes;

                    if (extremes !== undefined) {
                        // VL stacks positive and negative contributions
                        // separately, so either side can overflow its bound.
                        const { maxPos, minNeg } = extremes;
                        const range = intrinsic[1] - intrinsic[0];
                        // Small epsilon tolerance for floating-point imprecision
                        // (e.g., shares summing to 1.0000000001 should still be
                        // treated as within bounds). Scaled to the domain range.
                        const epsilon = range * 1e-6;
                        const overflowsTop = maxPos > intrinsic[1] + epsilon;
                        const overflowsBottom = minNeg < intrinsic[0] - epsilon;

                        if (overflowsTop || overflowsBottom) {
                            // Stacked totals exceed the intrinsic bound on at
                            // least one side → skip the domain constraint so
                            // bars aren't clipped (e.g., correlations summing
                            // past 1, or percentages past 100%).
                            if (cs.domainConstraint) {
                                skipDomain = true;
                            }
                        } else {
                            // Stacked extremes are within intrinsic bounds.
                            // Re-run snap on the stacked extremes to pick up
                            // bounds that individual values missed (e.g.,
                            // individual shares of 20–40% don't snap to 100%,
                            // but stacked totals of ~100% should).
                            const stackedSnap = snapToBoundHeuristic(intrinsic, [maxPos, minNeg]);
                            if (stackedSnap) {
                                // Merge with existing constraint: keep any bound
                                // already snapped from individual values, add any
                                // new bound from stacked totals.
                                if (cs.domainConstraint) {
                                    effectiveDomainConstraint = {
                                        min: cs.domainConstraint.min ?? stackedSnap.min,
                                        max: cs.domainConstraint.max ?? stackedSnap.max,
                                        clamp: cs.domainConstraint.clamp || stackedSnap.clamp,
                                    };
                                } else {
                                    effectiveDomainConstraint = stackedSnap;
                                }
                            }
                        }
                    }
                } else if (cs.domainConstraint) {
                    // No intrinsic domain to compare against → skip to be safe
                    skipDomain = true;
                }
            }

            if (effectiveDomainConstraint && enc.type === 'quantitative' && (ch === 'x' || ch === 'y' || ch === 'size' || ch === 'color') && !enc.bin && !skipDomain) {
                if (!enc.scale) enc.scale = {};
                let { min } = effectiveDomainConstraint;
                const { max, clamp } = effectiveDomainConstraint;
                // The resolved zero decision (engine default, or the host's
                // includeZero_x/_y override) is authoritative. When it says "no
                // zero", a lower bound of exactly 0 in the semantic domain is
                // merely a non-negativity floor, not a real semantic minimum —
                // drop it so the axis fits the data instead of being re-pinned
                // to zero. Length marks (bar/area/rect) always keep zero.
                const wantsNoZero = cs.zero?.zero === false;
                if (!isBarLike && wantsNoZero && min === 0) min = undefined;
                if (min !== undefined && max !== undefined) {
                    enc.scale.domain = [min, max];
                    // For non-bar marks (scatter, line, etc.), the explicit
                    // semantic domain is authoritative — clear zero so VL
                    // doesn't extend beyond intrinsic bounds (e.g., Rating
                    // scatter [1,5] shouldn't stretch to [0,5]).
                    // For bar/area marks, keep zero:true so bars grow from
                    // zero with correct proportional lengths — VL extends
                    // the domain to include 0, and the upper bound is still
                    // capped by the domain constraint (e.g., [0,5] not [0,6]).
                    // Never clobber a decided zero:false.
                    if (!isBarLike && enc.scale.zero !== undefined && !wantsNoZero) {
                        delete enc.scale.zero;
                    }
                } else {
                    // Partial constraint (or the zero-floor dropped above) — snap
                    // the bounded end while auto-fitting the other.
                    // E.g., Percentage data at 97% → domainMax = 100, domainMin auto-fits.
                    if (min !== undefined) enc.scale.domainMin = min;
                    if (max !== undefined) enc.scale.domainMax = max;
                    // VL may suppress nice rounding on the free end when
                    // domainMin/domainMax is set, causing data to touch the
                    // chart border.  Force nice so the unconstrained end
                    // gets proper headroom (e.g., data at +26% rounds to +40%).
                    enc.scale.nice = true;
                }
                if (clamp) {
                    enc.scale.clamp = true;
                }
            }

            if (stackedExtremes) pinCleanStackEndpoint(enc, stackedExtremes);

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
}

const TEMPORAL_PLAN_SETTING_KEYS = [
    'labelFont', 'labelFontStyle', 'labelFontWeight', 'labelAngle', 'labelSeparation', 'labelLimit',
] as const;

function temporalPlanSettings(settings: Record<string, unknown>): Record<string, unknown> {
    const kept: Record<string, unknown> = {};
    for (const key of TEMPORAL_PLAN_SETTING_KEYS) if (settings[key] !== undefined) kept[key] = settings[key];
    return kept;
}

function axisPropertiesOf({ labels: _labels, ...axis }: TemporalTickPlan): Omit<TemporalTickPlan, 'labels'> {
    return axis;
}

export function temporalAxisPlanInputs(encoding: object): TemporalAxisPlanInputs | undefined {
    return temporalAxisPlans.get(encoding)?.inputs;
}

/** Tick positions (ms) and label text for a temporal axis over `domain`, laid out across `span` pixels. */
export function planTemporalTickValues(
    domain: unknown[], span: number, inputs: TemporalAxisPlanInputs,
): { values: number[]; labels: Record<string, string> } {
    const start = +new Date(domain[0] as any);
    const end = +new Date(domain[1] as any);
    const plan = Number.isFinite(start) && Number.isFinite(end)
        ? planTemporalTicks({ start, end, span, ...inputs })
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
    inputs: TemporalAxisPlanInputs;
}>();

export function vlFinalizeTemporalAxes(spec: any, context: InstantiateContext): void {
    const config = spec.config ?? {};
    const visit = (node: any, width: number, height: number): void => {
        const plotWidth = typeof node.width === 'number' ? node.width : width;
        const plotHeight = typeof node.height === 'number' ? node.height : height;
        for (const channel of ['x', 'y'] as const) {
            const encoding = node.encoding?.[channel];
            const original = encoding && temporalAxisPlans.get(encoding);
            if (!original || encoding.axis?.labelExpr !== original.labelExpr) continue;
            const settings = { ...config.axis, ...config.axisTemporal,
                ...config[channel === 'x' ? 'axisX' : 'axisY'], ...encoding.axis };
            const domain = encoding.scale?.domain;
            const domainSpan = Array.isArray(domain) && domain.length === 2
                ? +new Date(domain[1]) - +new Date(domain[0]) : original.end - original.start;
            const span = (channel === 'x' ? plotWidth : plotHeight) * (original.end - original.start) / domainSpan;
            const plan = planTemporalTicks({
                start: original.start, end: original.end, semanticType: original.semanticType,
                utc: encoding.scale?.type === 'utc', span, vertical: channel === 'y', settings,
                fontSize: settings.labelFontSize ?? (channel === 'x' ? context.layout.xLabel : context.layout.yLabel).fontSize,
            });
            if (plan) Object.assign(encoding.axis, axisPropertiesOf(plan));
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
    const textWidth = (text: string): number => canvas ? canvas.measureText(text).width : text.length * fontSize * 0.8;
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
    const ticks = [...new Set(candidates)].sort((left, right) => left - right).map(value => {
        const level = rank(value, base);
        const calendarLevel = rank(value, minimumLevel);
        const initial = value === startAnchor && calendarLevel < levels.length - 1;
        const pattern = initial ? levels[calendarLevel].context : boundaryFormat(level, base);
        const text = format(pattern)(new Date(value));
        const priority = initial ? Math.min(base, calendarLevel) + 0.5
            : base === dayLevel && monthDayLabels && levels[level].unit === 'month' ? base : level;
        return { value, pattern, text, priority, size: extent(text), initial, level: calendarLevel };
    });
    const selected: typeof ticks = [];
    for (const tick of [...ticks].sort((left, right) => right.priority - left.priority || left.value - right.value)) {
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
    axisLabelFontSize?: number,
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
                for (const row of context.table ?? vgObj.data?.values ?? []) {
                    const value = row[enc.field];
                    if (value == null) continue;
                    const timestamp = +new Date(value);
                    if (!Number.isFinite(timestamp)) continue;
                    earliest = Math.min(earliest, timestamp);
                    latest = Math.max(latest, timestamp);
                }
                const semantics = context.channelSemantics[ch];
                const fontSize = typeof formatting.labelFontSize === 'number' ? formatting.labelFontSize
                    : axisLabelFontSize ?? (ch === 'x' ? context.layout.xLabel : context.layout.yLabel).fontSize;
                const plot = vgObj.facet && vgObj.spec ? vgObj.spec : vgObj;
                const size = ch === 'x' ? plot.width : plot.height;
                const span = typeof size === 'number' ? size
                    : ch === 'x' ? context.layout.subplotWidth : context.layout.subplotHeight;
                const semanticType = semantics?.field === enc.field ? semantics.semanticAnnotation?.semanticType : undefined;
                const plan = planTemporalTicks({
                    start: earliest, end: latest, semanticType, utc: enc.scale?.type === 'utc',
                    span, vertical: ch === 'y', settings: formatting, fontSize,
                });
                if (!plan) continue;
                temporalAxisPlans.set(enc, {
                    start: earliest, end: latest,
                    semanticType,
                    labelExpr: plan.labelExpr,
                    inputs: {
                        semanticType, utc: enc.scale?.type === 'utc', vertical: ch === 'y',
                        settings: temporalPlanSettings(formatting), fontSize,
                    },
                });
                enc.axis = {
                    ...enc.axis,
                    ...axisPropertiesOf(plan),
                };
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
