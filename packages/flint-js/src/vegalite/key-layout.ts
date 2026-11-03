import { planKeyLayout, type KeyLayout, type KeyToLayout, type LegendLayoutPlan, type TextMeasurer } from '../core/legend-layout';
import type { LayoutResult } from '../core/types';
import type { LegendPlan } from '../core/legend-plan';
import { KEY_CHANNELS } from '../core/structure';
import { rendererTextMeasurer } from '../core/text-width';
import { caseLabelExpr } from '../core/text-case';
import { exactLegendLabels } from './exact-labels';
import { plannedKeyFor } from './theme';



const walk = (node: any, visit: (node: any) => void): void => {
    if (!node || typeof node !== 'object') return;
    visit(node);
    if (node.spec) walk(node.spec, visit);
    for (const key of ['layer', 'concat', 'hconcat', 'vconcat']) for (const child of node[key] ?? []) walk(child, visit);
};

/** The legend settings of a key's planned layout, written over what its encoding already states. */
function keyLegend(legend: any, layout: KeyLayout, labels: string[] | undefined, offset?: number): any {
    const out = { ...(legend ?? {}) };
    // The key's air to the plot, as planned; an author's offset stands.
    if (offset !== undefined && out.offset === undefined) out.offset = offset;
    if (layout.moved) {
        out.orient = layout.orient;
        if (out.direction === undefined) out.direction = ['top', 'bottom'].includes(layout.orient) ? 'horizontal' : 'vertical';
        if (out.titleOrient === undefined) out.titleOrient = 'top';
    }
    if (layout.gradientLength !== undefined) out.gradientLength = layout.gradientLength;
    if (layout.inlineTitle) {
        out.titleOrient = 'left';
        if (layout.titlePadding !== undefined && out.titlePadding === undefined) out.titlePadding = layout.titlePadding;
    }
    if (layout.titleFitted) out.titleLimit = 0;
    if (layout.titleLines) {
        out.title = layout.titleLines;
        out.titleLineHeight = layout.titleLineHeight;
    }
    // A row of values too wide for its edge wraps onto the columns planned for it.
    if (!layout.labelsFitted && layout.columns !== undefined && out.columns === undefined) out.columns = layout.columns;
    if (layout.labelsFitted && labels?.length) {
        if (layout.columns !== undefined) out.columns = layout.columns;
        out.labelFontSize = layout.labelFontSize;
        out.labelLimit = layout.labelLimit;
        out.rowPadding = layout.rowPadding;
        if (out.symbolLimit === undefined) out.symbolLimit = 0;
        if (layout.labelLines) {
            const index = `indexof(${JSON.stringify(labels)}, toString(datum.label))`;
            out.labelExpr = `${index} < 0 ? datum.label : ${JSON.stringify(layout.labelLines)}[${index}]`;
            if (out.clipHeight === undefined && out.labelBaseline === undefined && !out.encoding?.symbols) {
                const fontSize = layout.labelFontSize;
                const lineHeight = Math.ceil(fontSize * 1.2);
                const maxLines = Math.max(...layout.labelLines.map((lines) => lines.length));
                const horizontal = ['top', 'bottom'].includes(layout.orient) && layout.direction !== 'vertical';
                const rowHeight = Math.max(fontSize + (maxLines - 1) * lineHeight, Math.sqrt(layout.symbolSize ?? 100)) + 4;
                if (horizontal) out.clipHeight = rowHeight;
                out.labelBaseline = 'top';
                out.gridAlign = out.gridAlign ?? (horizontal ? 'all' : 'each');
                out.encoding = {
                    ...out.encoding,
                    labels: { y: { value: 2 }, lineHeight: { value: lineHeight } },
                    symbols: { y: { value: 2 + fontSize / 2 } },
                };
            }
        }
        out.encoding = {
            ...out.encoding,
            labels: { ...out.encoding?.labels, tooltip: { value: { expr: 'datum.value' } }, description: { value: { expr: 'toString(datum.value)' } } },
        };
    }
    return out;
}

/** Colour scales whose key Vega-Lite draws as a stepped ramp, dropping the key's own `gradientLength`. */
const BINNED_SCALES = new Set(['quantize', 'quantile', 'threshold', 'bin-ordinal']);

/**
 * A stepped ramp standing up beside the plot runs the length the plan gave it. Vega-Lite drops a
 * binned key's own `gradientLength` and reads the config's, 200 px unless set: a ramp twice the
 * height of a short plot, running past it. A row of bins above or below is sized for its labels
 * where the theme lays it ({@link fitBinnedKeyLength}), so only an upright one is held here, never
 * shorter than a line of label per bin.
 */
function holdBinnedKeyLength(spec: any, encoding: any, layout: KeyLayout): void {
    const length = encoding.legend?.gradientLength;
    if (!BINNED_SCALES.has(encoding.scale?.type) || typeof length !== 'number') return;
    const config = (spec.config ??= {});
    const legendConfig = (config.legend ??= {});
    const direction = encoding.legend.direction ?? legendConfig.direction ?? (['top', 'bottom'].includes(layout.orient) ? 'horizontal' : 'vertical');
    if (direction !== 'vertical') return;
    const bins = Array.isArray(encoding.scale.range) ? encoding.scale.range.length
        : encoding.scale.type === 'threshold' && Array.isArray(encoding.scale.domain) ? encoding.scale.domain.length + 1
            : encoding.scale.scheme?.count ?? 0;
    const fontSize = encoding.legend.labelFontSize ?? legendConfig.labelFontSize ?? 10;
    const held = Math.round(Math.max(length, bins * (fontSize + 2)));
    // Keys share the config's length: an upright stepped ramp holds the shortest any of them asks for.
    legendConfig.gradientLength = Math.min(legendConfig.gradientLength ?? Infinity, held);
}

/** Stack keys that share an edge as the plan says: one row each, or side by side. */
function writeEdges(spec: any, edges: LegendLayoutPlan['edges']): void {
    if (!edges.length) return;
    spec.config ??= {};
    spec.config.legend ??= {};
    spec.config.legend.layout ??= {};
    for (const edge of edges) {
        spec.config.legend.layout[edge.orient] = { ...(spec.config.legend.layout[edge.orient] ?? {}),
            direction: edge.direction, anchor: edge.anchor, margin: edge.gap,
            // Keys of different heights in a row share its middle rather than its top, so their entries line up.
            ...(edge.direction === 'horizontal' && (edge.orient === 'top' || edge.orient === 'bottom') ? { center: true } : {}) };
    }
}

/**
 * Write each key's planned layout to every encoding that draws it, a theme's redundant channels on
 * the same field included, and stack keys that share an edge as the plan says.
 */
/** The panel a composite chart draws its keys beside: the width and height its plot child states, repeated over facets. */
function drawnPanel(spec: any, plot: { width: number; height: number }, layout: LayoutResult): { width: number; height: number } {
    let { width, height } = plot;
    const dimensions = (node: any): void => {
        if (typeof node.width === 'number' && node.width > 0) width = node.width;
        if (typeof node.height === 'number' && node.height > 0) height = node.height;
        if (node.spec) dimensions(node.spec);
        for (const child of node.layer ?? []) dimensions(child);
        const children = node.vconcat ?? node.hconcat ?? node.concat;
        if (children) {
            const panel = children.find((child: any) => child.facet || child.encoding?.x?.field || child.encoding?.y?.field || child.layer);
            if (panel) dimensions(panel);
        }
    };
    dimensions(spec);
    const columns = layout.facet?.columns ?? 1;
    const rows = layout.facet?.rows ?? 1;
    const gap = layout.effectiveFacetGap ?? 10;
    return { width: width * columns + Math.max(0, columns - 1) * gap, height: height * rows + Math.max(0, rows - 1) * gap };
}

export function vlWriteKeyLayout(
    spec: any, plan: LegendPlan, plot: { width: number; height: number }, layoutResult: LayoutResult, measure: TextMeasurer,
): void {
    const layout = plan.layout ?? (plan.keyInputs ? planKeyLayout(plan.keyInputs, drawnPanel(spec, plot, layoutResult), measure, plan.preferences) : undefined);
    if (!layout || spec.config?.legend?.disable || !layout.keys.some(Boolean)) return;
    walk(spec, (node) => {
        for (const channel of KEY_CHANNELS) {
            const encoding = node.encoding?.[channel];
            if (!encoding?.field || encoding.legend === null || encoding.legend === false || encoding.scale === null) continue;
            const key = plannedKeyFor(plan.keys, channel, encoding);
            const index = key ? plan.keys.indexOf(key) : -1;
            const keyLayout = index >= 0 ? layout.keys[index] : undefined;
            if (!key || !keyLayout) continue;
            encoding.legend = keyLegend(encoding.legend, keyLayout, key.entries, layout.offsets?.[keyLayout.orient as 'top']);
            // A key to values lists the round values the plan sampled, with or without a theme.
            if (key.samples && encoding.legend.values === undefined) {
                encoding.legend = { ...encoding.legend, values: key.samples, ...exactLegendLabels(encoding.legend, key.samples) };
            }
            holdBinnedKeyLength(spec, encoding, keyLayout);
        }
    });
    writeEdges(spec, layout.edges);
    // A title over keys above the plot stands at the header's inner gap; the keys keep the title's gap below them.
    if (layout.headerGap !== undefined && spec.title) {
        spec.config ??= {};
        spec.config.title = { ...spec.config.title, offset: layout.headerGap };
    }
    spec._legendLayout = {
        plotWidth: layout.plot.width, plotHeight: layout.plot.height,
        legends: plan.keys.map((key, index) => ({ key, laid: layout.keys[index] })).filter((entry) => entry.laid)
            .map(({ key, laid }) => ({ field: key.via ?? key.field, orient: laid!.orient, width: laid!.width, height: laid!.height, fontSize: laid!.labelFontSize })),
        overflow: layout.overflow,
    };
}

/**
 * Key labels in the case the theme asks for (T3). Runs after the layout is written: a label the
 * layout broke over lines was measured and broken in that case already, so only the fallback text
 * of its lookup — or the bare label — is cased here.
 */
export function vlCaseKeyLabels(spec: any, plan: LegendPlan): void {
    walk(spec, (node) => {
        for (const channel of KEY_CHANNELS) {
            const encoding = node.encoding?.[channel];
            if (!encoding?.field || encoding.legend === null || encoding.legend === false) continue;
            const key = plannedKeyFor(plan.keys, channel, encoding);
            const index = key ? plan.keys.indexOf(key) : -1;
            const textCase = index >= 0 ? plan.keyInputs?.[index]?.style.labelCase : undefined;
            if (!key || !textCase || !key.entries) continue;
            const labelExpr = caseLabelExpr(encoding.legend?.labelExpr, textCase, key.entries);
            if (labelExpr) encoding.legend = { ...(encoding.legend ?? {}), labelExpr };
        }
    });
}

/** What a Vega-Lite legend states for itself: its config merged under its own settings. */
function keyFromSpec(spec: any, channel: string, encoding: any, table: any[], layout: LayoutResult, encodings: Record<string, any> | undefined): KeyToLayout {
    const config = spec.config?.legend ?? {};
    const legend = encoding.legend ?? {};
    const settings = { ...config, ...legend };
    const discrete = ['nominal', 'ordinal'].includes(encoding.type);
    const labelsStated = settings.labelExpr !== undefined || settings.format !== undefined || settings.formatType !== undefined
        || Boolean(legend.encoding?.labels);
    const values = Array.isArray(settings.values) ? settings.values : Array.isArray(encoding.scale?.domain) ? encoding.scale.domain : undefined;
    const tableValues = table.map((row) => row[encoding.field]);
    const labels = discrete ? [...new Set<string>((values ?? tableValues).filter((value: any) => value != null).map(String))] : undefined;
    const title = settings.title !== undefined ? settings.title
        : encoding.title !== undefined ? encoding.title : encoding.aggregate ? null : encoding.field;
    const numericGradient = !discrete && ['color', 'fill', 'stroke', 'opacity'].includes(channel)
        && settings.type !== 'symbol' && !['quantize', 'quantile', 'threshold', 'bin-ordinal'].includes(encoding.scale?.type);
    const preferred = legend.orient ?? config.orient ?? 'right';
    const authored = encodings?.[channel]?.legend;
    const fixed = authored?.orient !== undefined || (!encodings && (legend.orient !== undefined || config.orient !== undefined))
        || !['left', 'right', 'top', 'bottom'].includes(preferred);
    const fixedTitle = authored?.titleOrient !== undefined || (!encodings && (legend.titleOrient !== undefined || config.titleOrient !== undefined))
        || Boolean(legend.encoding?.title);
    const font = spec.config?.font ?? 'sans-serif';
    return {
        gradient: numericGradient,
        ...(labels ? { labels } : { valueLabels: (values ?? tableValues).map((value: any) => String(value)) }),
        count: Array.isArray(values) ? values.length : discrete ? new Set(tableValues).size : 5,
        title: typeof title === 'string' ? title : null,
        style: {
            labelFont: settings.labelFont ?? font, labelFontSize: settings.labelFontSize ?? layout.legendFontSize,
            labelFontWeight: settings.labelFontWeight ?? 'normal', labelFontStyle: settings.labelFontStyle ?? 'normal',
            titleFont: settings.titleFont ?? font, titleFontSize: settings.titleFontSize ?? layout.titleFontSize,
            titleFontWeight: settings.titleFontWeight ?? 'bold', titleFontStyle: settings.titleFontStyle ?? 'normal',
            ...(settings.symbolSize !== undefined ? { symbolSize: settings.symbolSize } : {}),
            padding: settings.padding ?? 0,
            ...(settings.rowPadding !== undefined ? { rowPadding: settings.rowPadding } : {}),
            ...(settings.columnPadding !== undefined ? { columnPadding: settings.columnPadding } : {}),
            ...(settings.labelOffset !== undefined ? { labelOffset: settings.labelOffset } : {}),
            ...(settings.titlePadding !== undefined ? { titlePadding: settings.titlePadding } : {}),
            ...(settings.gradientLength !== undefined ? { gradientLength: settings.gradientLength } : {}),
            ...(settings.gradientThickness !== undefined ? { gradientThickness: settings.gradientThickness } : {}),
            ...(settings.columns !== undefined ? { columns: settings.columns } : {}),
            ...(settings.labelLimit !== undefined ? { labelLimit: settings.labelLimit } : {}),
            ...(settings.titleLimit !== undefined || settings.titleLineHeight !== undefined || legend.encoding?.title ? { titleLimit: settings.titleLimit ?? 0 } : {}),
            labelsStated,
        },
        ...(channel === 'size' ? { largestSymbol: Math.max(...(encoding.scale?.range?.filter?.((value: any) => typeof value === 'number') ?? [400])) } : {}),
        orient: preferred,
        fixed,
        fixedTitle,
        ...(config.direction !== undefined ? { direction: config.direction } : {}),
        ...(config.titleOrient !== undefined ? { titleOrient: config.titleOrient } : {}),
        ...(legend.direction !== undefined ? { ownDirection: legend.direction } : {}),
        ...(legend.titleOrient !== undefined ? { ownTitleOrient: legend.titleOrient } : {}),
    };
}

/**
 * Lay out the legends of a Vega-Lite spec Flint did not plan, from the settings the spec states:
 * one key per field, type, scale and legend, set by the same rules as a planned chart's keys.
 */
export function vlWrapLegendText(
    spec: any,
    context: Pick<import('../core/types').InstantiateContext, 'layout' | 'canvasSize' | 'table' | 'plot'> & { encodings?: Record<string, any> },
    measure: TextMeasurer = rendererTextMeasurer,
): void {
    if (spec.config?.legend?.disable) return;
    const groups: Array<{ channel: string; encoding: any; refs: any[] }> = [];
    const seen = new Map<string, number>();
    walk(spec, (node) => {
        for (const channel of KEY_CHANNELS) {
            const encoding = node.encoding?.[channel];
            if (!encoding?.field || encoding.legend === null || encoding.legend === false || encoding.scale === null) continue;
            const id = JSON.stringify([encoding.field, encoding.type, channel === 'size' ? 'size' : 'ink', encoding.scale, encoding.legend, encoding.title]);
            const found = seen.get(id);
            if (found !== undefined) groups[found].refs.push(encoding);
            else {
                seen.set(id, groups.length);
                groups.push({ channel, encoding, refs: [encoding] });
            }
        }
    });
    if (!groups.length) return;
    const layoutResult = context.layout;
    const plot = context.plot ?? { width: layoutResult.subplotWidth ?? context.canvasSize.width, height: layoutResult.subplotHeight ?? context.canvasSize.height };
    const keys = groups.map((group) => keyFromSpec(spec, group.channel, group.encoding, context.table ?? [], layoutResult, context.encodings));
    const planned = planKeyLayout(keys, drawnPanel(spec, plot, layoutResult), measure);
    groups.forEach((group, index) => {
        const laid = planned.keys[index];
        if (!laid) return;
        const legend = keyLegend(group.encoding.legend, laid, keys[index].labels);
        for (const encoding of group.refs) encoding.legend = structuredClone(legend);
    });
    writeEdges(spec, planned.edges);
    spec._legendLayout = {
        plotWidth: planned.plot.width, plotHeight: planned.plot.height,
        legends: groups.map((group, index) => ({ field: group.encoding.field, orient: planned.keys[index]!.orient,
            width: planned.keys[index]!.width, height: planned.keys[index]!.height, fontSize: planned.keys[index]!.labelFontSize })),
        overflow: planned.overflow,
    };
}
