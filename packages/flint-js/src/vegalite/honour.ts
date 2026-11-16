import type { LayoutPlan } from '../core/plan';
import { gapOf, type ViewNode } from '../core/views';
import { sameDecision, type PlanDeparture } from '../core/honour';
import { INTERACTION_PROVENANCE } from './interaction-provenance';
import { vegaLiteSort } from './sort';

/** Vega's axis label defaults where neither the encoding nor the config states one. */
const VEGA_LABEL_FONT_SIZE = 10;
const VEGA_LABEL_LIMIT = 180;

const CONCATS = ['vconcat', 'hconcat', 'concat'] as const;
const POSITIONS = ['x', 'y'] as const;

interface View {
    node: any;
    at: string;
}

/** Every unit or layered view in a spec, a layered view once with all its layers. */
function viewsOf(spec: any): View[] {
    const views: View[] = [];
    const walk = (node: any, at: string): void => {
        if (!node || typeof node !== 'object') return;
        if (node.mark || node.layer) views.push({ node, at });
        CONCATS.forEach((key) => (node[key] ?? []).forEach((child: any, index: number) => walk(child, `${at}.${key}[${index}]`)));
        if (node.spec) walk(node.spec, `${at}.spec`);
    };
    walk(spec, '$');
    return views;
}

/** The encodings of one channel across a view and its layers, outermost first. */
function channelEncodings(node: any, channel: string): any[] {
    const out: any[] = [];
    const visit = (unit: any): void => {
        const encoding = unit?.encoding?.[channel];
        if (encoding && (encoding.field || encoding.aggregate || encoding.datum !== undefined || encoding.condition)) out.push(encoding);
        (unit?.layer ?? []).forEach(visit);
    };
    visit(node);
    return out;
}

/** Every node in a spec, depth first. */
function nodesOf(spec: any): any[] {
    const out: any[] = [];
    const visit = (node: any): void => {
        if (!node || typeof node !== 'object') return;
        out.push(node);
        for (const key of [...CONCATS, 'layer'] as const) (node[key] ?? []).forEach(visit);
        if (node.spec) visit(node.spec);
    };
    visit(spec);
    return out;
}

const first = <T>(values: T[]): T | undefined => values.find((value) => value !== undefined);

/** An axis property as Vega-Lite resolves it: the encoding's own, then the channel's config, the type's, then every axis's. */
function axisProperty(spec: any, encodings: any[], channel: 'x' | 'y', key: string): unknown {
    const config = spec.config ?? {};
    const typed = encodings[0]?.type === 'temporal' ? config.axisTemporal : undefined;
    return first([
        ...encodings.map((encoding) => encoding.axis?.[key]),
        config[channel === 'x' ? 'axisX' : 'axisY']?.[key],
        typed?.[key],
        config.axis?.[key],
    ]);
}

/** The domain each layer states for one channel, as its two ends; an end it leaves open is undefined. */
function statedDomains(encodings: any[]): Array<[unknown, unknown]> {
    return encodings.flatMap((encoding): Array<[unknown, unknown]> => {
        const scale = encoding.scale ?? {};
        if (Array.isArray(scale.domain)) return [[scale.domain[0], scale.domain[scale.domain.length - 1]]];
        return scale.domainMin !== undefined || scale.domainMax !== undefined ? [[scale.domainMin, scale.domainMax]] : [];
    });
}

/** The tick labels, rulers and extents each view draws against what the plan decided for them. */
function axisDepartures(plan: LayoutPlan, spec: any, out: PlanDeparture[]): void {
    for (const { node, at } of viewsOf(spec)) {
        for (const channel of POSITIONS) {
            const encodings = channelEncodings(node, channel);
            if (!encodings.length || encodings.every((encoding) => encoding.axis === null || encoding.axis === false)) continue;
            const property = (key: string) => axisProperty(spec, encodings, channel, key);
            const labels = plan.axisLabels[channel];
            if (property('labels') !== false) {
                const fontSize = property('labelFontSize') ?? VEGA_LABEL_FONT_SIZE;
                if (fontSize !== labels.fontSize) out.push({ decision: `axisLabels.${channel}.fontSize`, at, planned: labels.fontSize, drawn: fontSize });
                const angle = property('labelAngle');
                if (labels.angle !== undefined && angle !== labels.angle) out.push({ decision: `axisLabels.${channel}.angle`, at, planned: labels.angle, drawn: angle });
                const limit = property('labelLimit') ?? VEGA_LABEL_LIMIT;
                if (labels.limit !== undefined && limit !== labels.limit) out.push({ decision: `axisLabels.${channel}.limit`, at, planned: labels.limit, drawn: limit });
            }
            const quantitative = encodings[0].type === 'quantitative' && !encodings.some((encoding) => encoding.bin);
            if (!quantitative) continue;
            const stated = statedDomains(encodings);
            const ruler = plan.rulers[channel];
            if (ruler) {
                // Room for value labels past horizontal bars runs the ruler on past its planned end, with
                // its ticks at the same step: the planned ruler is the start of the drawn one.
                const labelRoom = channel === 'x' && plan.valueLabels && !('refused' in plan.valueLabels)
                    && plan.valueLabels.channel === 'x' && (plan.valueLabels.inset ?? 0) > 0;
                const departs = !stated.length || stated.some(([min, max]) => (min !== undefined && min !== ruler.domain[0])
                    || (max !== undefined && max !== ruler.domain[1] && !(labelRoom && typeof max === 'number' && max > ruler.domain[1])));
                if (departs) out.push({ decision: `rulers.${channel}.domain`, at, planned: ruler.domain, drawn: stated });
                const values = encodings.map((encoding) => encoding.axis?.values).filter((list) => list !== undefined);
                const matches = (list: unknown) => sameDecision(ruler.values, list)
                    || (labelRoom && Array.isArray(list) && sameDecision(ruler.values, list.slice(0, ruler.values.length)));
                if (!values.length || values.some((list) => !matches(list))) out.push({ decision: `rulers.${channel}.values`, at, planned: ruler.values, drawn: values });
                continue;
            }
            const planned = plan.domains[channel];
            const linear = encodings.every((encoding) => encoding.scale?.type === undefined || encoding.scale.type === 'linear');
            if (planned?.zero === undefined || !linear) continue;
            const spans = stated.filter(([min, max]) => typeof min === 'number' && typeof max === 'number') as Array<[number, number]>;
            const zero = spans.length
                ? spans.every(([min, max]) => Math.min(min, max) <= 0 && Math.max(min, max) >= 0)
                : first(encodings.map((encoding) => encoding.scale?.zero)) ?? true;
            const crossesZero = planned.extent !== undefined && planned.extent[0] < 0 && planned.extent[1] > 0;
            if (planned.zero && !zero && !crossesZero) out.push({ decision: `domains.${channel}.zero`, at, planned: planned.zero, drawn: spans.length ? spans : zero });
            if (!planned.zero && !spans.length && zero) out.push({ decision: `domains.${channel}.zero`, at, planned: planned.zero, drawn: zero });
        }
    }
}

/**
 * The order each channel's categories stand in and the areas a size channel spans, where the
 * channel draws the field the plan ordered rather than a working column the template made.
 */
function encodingDepartures(plan: LayoutPlan, spec: any, fields: Partial<Record<string, string>>, out: PlanDeparture[]): void {
    for (const { node, at } of viewsOf(spec)) {
        for (const [channel, order] of Object.entries(plan.orders)) {
            if (!order) continue;
            const sort = vegaLiteSort(order);
            for (const encoding of channelEncodings(node, channel)) {
                if (!encoding.field || encoding.field !== fields[channel]) continue;
                if (!sameDecision(sort, encoding.sort)) out.push({ decision: `orders.${channel}`, at, planned: sort, drawn: encoding.sort });
            }
        }
        if (!plan.sizes) continue;
        for (const encoding of channelEncodings(node, 'size')) {
            if (!encoding.field) continue;
            if (!sameDecision(plan.sizes.range, encoding.scale?.range)) out.push({ decision: 'sizes.range', at, planned: plan.sizes.range, drawn: encoding.scale?.range });
        }
    }
}

/** The gap the plan states between facet panels: the outermost facet's, or that of the facets a concat sets side by side. */
function facetGapOf(views: ViewNode | undefined): { row: number; column: number } | undefined {
    if (!views || views.kind === 'view') return undefined;
    if (views.kind === 'facet') return views.gap;
    for (const child of views.children) {
        const gap = facetGapOf(child);
        if (gap) return gap;
    }
    return undefined;
}

/** How a faceted chart's panels sit, and a flat y title's lift. */
function furnitureDepartures(plan: LayoutPlan, spec: any, out: PlanDeparture[]): void {
    const facets = plan.furniture.facets;
    const faceted = nodesOf(spec).find((node) => node.facet || node.encoding?.row || node.encoding?.column || node.encoding?.facet);
    if (plan.layout.facet && faceted) {
        const planned = facetGapOf(plan.views) ?? gapOf(facets.spacing, 0);
        const config = gapOf(spec.config?.facet?.spacing, 0);
        const stated = gapOf(faceted.spacing, Number.NaN);
        const fields = faceted.facet && faceted.spec ? faceted.facet : faceted.encoding ?? {};
        const drawn = {
            row: fields.row?.spacing ?? (Number.isNaN(stated.row) ? config.row : stated.row),
            column: fields.column?.spacing ?? (Number.isNaN(stated.column) ? config.column : stated.column),
        };
        const rows = Boolean(fields.row || fields.facet || fields.field || plan.views?.kind === 'facet' && plan.views.rows > 1);
        const columns = Boolean(fields.column || fields.facet || fields.field);
        if ((rows && drawn.row !== planned.row) || (columns && drawn.column !== planned.column)) {
            out.push({ decision: 'views.gap', planned, drawn });
        }
        const independent = [faceted, spec].some((node) => node.resolve?.scale?.y === 'independent');
        if (independent !== facets.independentY) out.push({ decision: 'furniture.facets.independentY', planned: facets.independentY, drawn: independent });
        for (const channel of facets.binned) {
            const encoding = faceted.encoding?.[channel] ?? faceted.facet?.[channel] ?? (channel === 'column' ? faceted.encoding?.facet ?? faceted.facet : undefined);
            if (!encoding?.bin) out.push({ decision: `furniture.facets.binned.${channel}`, planned: true, drawn: Boolean(encoding?.bin) });
        }
    }
    const yTitle = plan.furniture.yTitle;
    if (!yTitle) return;
    const titled = viewsOf(spec).flatMap(({ node }) => channelEncodings(node, 'y'))
        .filter((encoding) => encoding.axis !== null && encoding.axis?.title !== null && encoding.title !== null);
    if (titled.length && !titled.some((encoding) => encoding.axis?.titleAngle === 0 && encoding.axis?.titleY === -yTitle.lift)) {
        out.push({ decision: 'furniture.yTitle.lift', planned: yTitle.lift, drawn: first(titled.map((encoding) => encoding.axis?.titleY)) });
    }
}

/** Whether a synthesized text layer names a band at its end rather than printing a value. */
const namesBandEnd = (node: any) => (node.transform ?? []).some((step: any) => step.as === '__bandEndLabel');

/** Where the chart names its series, each key's edge and columns, and whether value labels are printed. */
function legendDepartures(plan: LayoutPlan, spec: any, out: PlanDeparture[]): void {
    const nodes = nodesOf(spec).filter((node) => node.__themeSynthetic);
    const names = nodes.some((node) => node[INTERACTION_PROVENANCE]?.role === 'legend-label' || namesBandEnd(node));
    const values = nodes.some((node) => node[INTERACTION_PROVENANCE]?.role === 'text-label' && !namesBandEnd(node));
    const seriesEnd = plan.legend.placement === 'seriesEnd' && plan.design.legend.show && !plan.legend.ownNames;
    if (seriesEnd !== names) out.push({ decision: 'legend.placement', planned: plan.legend.placement, drawn: names ? 'names at the series ends' : 'no names at the series ends' });
    plan.legend.keys.forEach((key, index) => {
        const layout = plan.legend.layout?.keys[index];
        if (!layout) return;
        for (const node of nodesOf(spec)) {
            const encoding = node.encoding?.[key.channel];
            if (!encoding || encoding.legend === null || !(encoding.field || encoding.condition)) continue;
            const orient = encoding.legend?.orient ?? spec.config?.legend?.orient ?? 'right';
            if (orient !== layout.orient) out.push({ decision: `legend.keys.${key.channel}.orient`, planned: layout.orient, drawn: orient });
            const columns = encoding.legend?.columns ?? spec.config?.legend?.columns;
            if (layout.columns !== undefined && columns !== layout.columns) out.push({ decision: `legend.keys.${key.channel}.columns`, planned: layout.columns, drawn: columns });
        }
    });
    const printed = Boolean(plan.valueLabels && !('refused' in plan.valueLabels));
    if (printed !== values) out.push({ decision: 'valueLabels', planned: printed ? 'printed' : 'none', drawn: printed ? 'none' : 'printed' });
}

/** The headline and deck as the plan fitted them, and the plot it sized. */
function titleDepartures(plan: LayoutPlan, spec: any, plotAsPlanned: boolean, out: PlanDeparture[]): void {
    if (!plan.composite && !plotAsPlanned) out.push({ decision: 'plot', planned: plan.plot, drawn: 'resized after the plan' });
    const title = plan.title;
    if (!title) return;
    const drawn = typeof spec.title === 'object' ? spec.title : { text: spec.title };
    if (title.headline?.lines && !sameDecision(title.headline.lines, drawn.text)) out.push({ decision: 'title.headline.lines', planned: title.headline.lines, drawn: drawn.text });
    if (title.headline?.fontSize !== undefined && drawn.fontSize !== title.headline.fontSize) out.push({ decision: 'title.headline.fontSize', planned: title.headline.fontSize, drawn: drawn.fontSize });
    if (title.deckFit && !sameDecision(title.deckFit.lines, drawn.subtitle)) out.push({ decision: 'title.deckFit.lines', planned: title.deckFit.lines, drawn: drawn.subtitle });
}

/**
 * The decisions a Vega-Lite spec does not draw as the plan made them (`fields` spells each
 * channel's field as the spec does): the plot, each view's tick
 * labels, rulers and zero, category orders and size ranges, the facet gap, independent y and binned
 * facets, a flat y title's lift, series-end names, each key's edge and columns, value labels, and
 * the fitted headline and deck. Values the spec leaves unstated are read as Vega's defaults.
 */
export function vegaLiteDepartures(
    plan: LayoutPlan, spec: any, plotAsPlanned: boolean, fields: Partial<Record<string, string>>,
): PlanDeparture[] {
    const out: PlanDeparture[] = [];
    axisDepartures(plan, spec, out);
    encodingDepartures(plan, spec, fields, out);
    furnitureDepartures(plan, spec, out);
    legendDepartures(plan, spec, out);
    titleDepartures(plan, spec, plotAsPlanned, out);
    return out;
}
