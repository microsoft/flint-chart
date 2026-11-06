// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { PlotPlanContext } from '../../core/types';
import { ChartTemplateDef, ChartPropertyDef, type ViewPlanContext } from '../../core/types';
import { distinctOf, type ViewNode } from '../../core/views';
import { resolveSeriesTarget } from '../../core/interaction-semantics';
import { annotationCandidates, presentAnnotationUpdate } from '../../interactive/presentation/annotation';

/**
 * Radar / Spider Chart
 *
 * Data model (long format):
 *   - x (nominal): the metric / axis name
 *   - y (quantitative): the value for that metric
 *   - color (nominal): the entity / group
 *
 * Supports column/row faceting.
 */

// ---------------------------------------------------------------------------
// Helper: round up to a "nice" ceiling for axis max
// ---------------------------------------------------------------------------
function niceMax(v: number): number {
    if (v <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const mantissa = v / pow;
    const nice = mantissa <= 1 ? 1
        : mantissa <= 2 ? 2
        : mantissa <= 2.5 ? 2.5
        : mantissa <= 5 ? 5
        : 10;
    return nice * pow;
}

/** A spoke's name over at most two lines no wider than `limit`, broken at the space nearest its middle. */
function nameLines(name: string, limit: number, measure: ((text: string, fontSize: number) => number) | undefined): string[] {
    const width = (text: string) => measure ? measure(text, 10) : text.length * 10 * 0.55;
    if (width(name) <= limit) return [name];
    const spaces = [...name.matchAll(/ /g)].map((match) => match.index!);
    if (!spaces.length) return [name];
    const cut = spaces.reduce((best, at) => (Math.abs(at - name.length / 2) < Math.abs(best - name.length / 2) ? at : best));
    return [name.slice(0, cut), name.slice(cut + 1)];
}

// ---------------------------------------------------------------------------
// Helper: build VL layers for a single radar from long-format rows
// ---------------------------------------------------------------------------
function buildRadarLayers(
    rows: any[],
    axisField: string,
    valueField: string,
    groupField: string | undefined,
    opts: { filled: boolean; fillOpacity: number; strokeWidth: number; domainPad: number; yDomain?: [number, number]; room?: { width: number; plot: number; measure?: (text: string, fontSize: number) => number } },
): any[] {
    const axes: string[] = [];
    const axisSet = new Set<string>();
    for (const row of rows) {
        const a = String(row[axisField]);
        if (!axisSet.has(a)) { axisSet.add(a); axes.push(a); }
    }
    if (axes.length < 2) return [];

    const groups: string[] = [];
    if (groupField) {
        const groupSet = new Set<string>();
        for (const row of rows) {
            const g = String(row[groupField]);
            if (!groupSet.has(g)) { groupSet.add(g); groups.push(g); }
        }
    } else {
        groups.push("_all");
    }

    // Normalise each axis to 0-1
    const axisMax: Record<string, number> = {};
    for (const axis of axes) {
        const vals = rows
            .filter(r => String(r[axisField]) === axis)
            .map(r => Number(r[valueField]))
            .filter(v => isFinite(v));
        const mx = vals.length > 0 ? Math.max(...vals) : 1;
        axisMax[axis] = niceMax(mx);
    }

    // Aggregate: average per (group, axis)
    const keyMap = new Map<string, { sum: number; rawSum: number; count: number }>();
    for (const row of rows) {
        const grp = groupField ? String(row[groupField]) : "_all";
        const axis = String(row[axisField]);
        const raw = Number(row[valueField]) || 0;
        const mx = axisMax[axis];
        const norm = mx > 0 ? raw / mx : 0;
        const k = `${grp}|||${axis}`;
        if (!keyMap.has(k)) keyMap.set(k, { sum: 0, rawSum: 0, count: 0 });
        const entry = keyMap.get(k)!;
        entry.sum += norm;
        entry.rawSum += raw;
        entry.count += 1;
    }

    // Compute polar coordinates
    const angleStep = 360 / axes.length;
    const finalData: any[] = [];
    for (const [k, v] of keyMap.entries()) {
        const [grp, axis] = k.split('|||');
        const axisIndex = axes.indexOf(axis);
        const angle = axisIndex * angleStep;
        const normVal = v.sum / v.count;
        const rawVal = Math.round((v.rawSum / v.count) * 100) / 100;
        const rad = (angle * Math.PI) / 180;
        finalData.push({
            [axisField]: axis,
            [valueField]: rawVal,
            ...(groupField ? { [groupField]: grp } : {}),
            __group: grp,
            __axis: axis,
            __value: normVal,
            __raw: rawVal,
            __angle: angle,
            __x: normVal * Math.sin(rad),
            __y: -normVal * Math.cos(rad),
        });
    }

    // Grid data (spokes + concentric rings)
    const gridData: any[] = [];
    for (let idx = 0; idx < axes.length; idx++) {
        const ang = (idx * angleStep * Math.PI) / 180;
        gridData.push({
            __type: "spoke",
            __x: 0, __y: 0,
            __x2: Math.sin(ang),
            __y2: -Math.cos(ang),
        });
    }
    for (const level of [0.25, 0.5, 0.75, 1.0]) {
        const points: any[] = [];
        for (let i = 0; i <= axes.length; i++) {
            const ang = ((i % axes.length) * angleStep * Math.PI) / 180;
            points.push({ __x: level * Math.sin(ang), __y: -level * Math.cos(ang) });
        }
        for (let i = 0; i < points.length - 1; i++) {
            gridData.push({
                __type: "ring", __level: level,
                __x: points[i].__x, __y: points[i].__y,
                __x2: points[i + 1].__x, __y2: points[i + 1].__y,
            });
        }
    }

    // Axis labels
    const labelData = axes.map((axis, i) => {
        const angDeg = i * angleStep;
        const ang = (angDeg * Math.PI) / 180;
        const r = 1.15;
        const mx = axisMax[axis];
        const maxStr = mx % 1 === 0 ? String(mx) : mx.toFixed(1);

        const sinA = Math.sin(ang);
        const cosA = -Math.cos(ang);
        let align: string;
        let baseline: string;
        let dx = 0;
        let dy = 0;

        if (Math.abs(sinA) < 0.15) {
            align = 'center';
            baseline = cosA < 0 ? 'bottom' : 'top';
            dy = cosA < 0 ? -4 : 4;
        } else if (sinA > 0) {
            align = 'left';
            baseline = Math.abs(cosA) < 0.3 ? 'middle' : (cosA < 0 ? 'bottom' : 'top');
            dx = 4;
        } else {
            align = 'right';
            baseline = Math.abs(cosA) < 0.3 ? 'middle' : (cosA < 0 ? 'bottom' : 'top');
            dx = -4;
        }

        // A label beside the radar runs no further than the room's edge.
        const limit = opts.room && Math.abs(sinA) >= 0.15
            ? Math.max(LABEL_MIN_LIMIT, Math.min(120, Math.floor(opts.room.width / 2 - (opts.room.plot / 2) * (r / opts.domainPad) * Math.abs(sinA) - 4)))
            : 120;
        return {
            __label: [...nameLines(axis, limit, opts.room?.measure), `(${maxStr})`],
            __limit: limit,
            __x: r * Math.sin(ang), __y: -r * Math.cos(ang),
            __align: align, __baseline: baseline, __dx: dx, __dy: dy,
        };
    });

    const { filled, fillOpacity, strokeWidth, domainPad } = opts;
    const layers: any[] = [];

    // Spokes
    layers.push({
        name: "radar-grid-spokes",
        data: { values: gridData.filter(d => d.__type === "spoke") },
        mark: { type: "rule", stroke: "#ddd", strokeWidth: 0.8 },
        encoding: {
            // The domains as stated, not rounded out: both scales keep one pixel per unit, so the
            // radar stays regular when its plot is shorter than it is wide.
            x: { field: "__x", type: "quantitative", scale: { domain: [-domainPad, domainPad], nice: false }, axis: null },
            y: { field: "__y", type: "quantitative", scale: { domain: opts.yDomain ?? [-domainPad, domainPad], nice: false }, axis: null },
            x2: { field: "__x2" }, y2: { field: "__y2" },
        },
    });

    // Rings
    layers.push({
        name: "radar-grid-rings",
        data: { values: gridData.filter(d => d.__type === "ring") },
        mark: { type: "rule", stroke: "#e0e0e0", strokeWidth: 0.6 },
        encoding: {
            x: { field: "__x", type: "quantitative", axis: null },
            y: { field: "__y", type: "quantitative", axis: null },
            x2: { field: "__x2" }, y2: { field: "__y2" },
        },
    });

    // Labels
    for (const lbl of labelData) {
        const lines: string[] = lbl.__label;
        layers.push({
            data: { values: [lbl] },
            mark: {
                type: "text", fontSize: LABEL_FONT_SIZE, fill: "#555",
                align: lbl.__align, baseline: lbl.__baseline,
                dx: lbl.__dx, dy: lbl.__dy,
                limit: lbl.__limit, lineHeight: LABEL_LINE_HEIGHT,
            },
            encoding: {
                x: { field: "__x", type: "quantitative", axis: null },
                y: { field: "__y", type: "quantitative", axis: null },
                text: { value: lines },
            },
        });
    }

    // Data polygon
    const lineLayer: any = {
        data: { values: finalData },
        mark: {
            type: "line", interpolate: "linear-closed", strokeWidth, point: false,
            ...(filled ? { fillOpacity } : {}),
        },
        encoding: {
            x: { field: "__x", type: "quantitative", axis: null },
            y: { field: "__y", type: "quantitative", axis: null },
            order: { field: "__angle", type: "quantitative" },
            tooltip: [
                { field: "__axis", type: "nominal", title: axisField },
                { field: "__raw", type: "quantitative", title: valueField },
            ],
        },
    };
    if (groups.length > 1 && groupField) {
        // Stroke, fill and point colour all carry `__group`; Vega-Lite merges
        // them into a single legend for the field. Leaving the legend off any
        // one of them (a `legend: null`) removes the key from *all* of them,
        // because the layers share the colour scale — so the series would be
        // unidentifiable. Let all three share the one merged legend.
        lineLayer.encoding.stroke = { field: "__group", type: "nominal", title: groupField };
        if (filled) {
            lineLayer.encoding.fill = { field: "__group", type: "nominal", title: groupField };
        }
    } else if (filled) {
        lineLayer.mark.fill = "#4c78a8";
    }
    layers.push(lineLayer);

    // Data points
    const pointLayer: any = {
        name: "radar-secondary-vertices",
        data: { values: finalData },
        mark: { type: "point", filled: true, size: 25 },
        encoding: {
            x: { field: "__x", type: "quantitative", axis: null },
            y: { field: "__y", type: "quantitative", axis: null },
            tooltip: [
                ...(groupField ? [{ field: "__group", type: "nominal", title: groupField }] : []),
                { field: "__axis", type: "nominal", title: axisField },
                { field: "__raw", type: "quantitative", title: valueField },
            ],
        },
    };
    if (groups.length > 1 && groupField) {
        pointLayer.encoding.color = { field: "__group", type: "nominal", title: groupField };
    }
    layers.push(pointLayer);

    return layers;
}

// ---------------------------------------------------------------------------
// Template definition
// ---------------------------------------------------------------------------
/** A radar is square, on the shorter side of the base size. */
function radarSize(canvasSize: { width: number; height: number } | undefined): number {
    return Math.min(canvasSize?.width || 400, canvasSize?.height || 400);
}

/** The share of its room a radar keeps however long its spoke labels; past it, the labels are cut to fit. */
const RADAR_KEPT_SHARE = 0.75;

/** How wide a spoke's name may run on one line before the plan counts it broken over two. */
const LABEL_WRAP_FROM = 60;

/** The narrowest a spoke label is cut to. */
const LABEL_MIN_LIMIT = 40;

/** Where the spoke labels sit, as a share of the half plot: their radius over the scale's padded domain. */
const LABEL_RADIUS = 1.15 / 1.18;

/** The scale's padded domain: the outer ring stands at 1 within ±this. */
const RADAR_DOMAIN_PAD = 1.18;
/** The reach of a dot on a ring corner past the corner, in px. */
const RADAR_DOT = 4;
/** The axis labels' type, as the labels layer draws it. */
const LABEL_FONT_SIZE = 10;
const LABEL_LINE_HEIGHT = 13;

/**
 * The square plot a radar draws in `room`, kept small enough that its spoke labels, which stand
 * outside the outer ring, stay inside the room too.
 */
function radarOverhangAt(ctx: PlotPlanContext): ((plot: number) => { left: number; right: number; top: number; bottom: number; slackTop: number; slackBottom: number }) | undefined {
    const axisField = ctx.channelSemantics.x?.field;
    const valueField = ctx.channelSemantics.y?.field;
    const rows = ctx.table ?? [];
    const axes = [...new Set(rows.map((row: any) => String(row[axisField!])))];
    if (!axes.length) return undefined;
    const measure = (text: string) => Math.min(120, ctx.measureText ? ctx.measureText(text, 10) : text.length * 10 * 0.55);
    const labels = axes.map((axis, index) => {
        const angle = (index * 360 / axes.length) * Math.PI / 180;
        const values = rows.filter((row: any) => String(row[axisField!]) === axis).map((row: any) => Number(row[valueField!])).filter(Number.isFinite);
        const max = niceMax(values.length ? Math.max(...values) : 1);
        const lines = [...nameLines(axis, LABEL_WRAP_FROM, ctx.measureText), `(${max % 1 === 0 ? max : max.toFixed(1)})`];
        return { sin: Math.sin(angle), cos: -Math.cos(angle), width: Math.max(...lines.map(measure)), lines: lines.length };
    });
    // What the radar draws, as far as it reaches from its centre each way: the outer ring's corners
    // (and the dots on them), and the labels set as the labels layer sets them.
    const extent = (plot: number) => {
        const half = plot / 2;
        const ring = half / RADAR_DOMAIN_PAD;
        const out = { left: 0, right: 0, up: 0, down: 0 };
        for (const label of labels) {
            out.up = Math.max(out.up, label.cos * ring + RADAR_DOT);
            out.down = Math.max(out.down, -label.cos * ring + RADAR_DOT);
            const across = Math.abs(label.sin) < 0.15 ? label.width / 2 : label.width + 4;
            const side = label.sin > 0.15 ? 'right' : label.sin < -0.15 ? 'left' : undefined;
            if (side) out[side] = Math.max(out[side], half * LABEL_RADIUS * Math.abs(label.sin) + across);
            else for (const edge of ['left', 'right'] as const) out[edge] = Math.max(out[edge], across);
            // y runs up, so a label's anchor stands |cos| above or below the middle; its first line
            // hangs from the anchor as its baseline says, and the lines after run down from it.
            const centred = Math.abs(label.sin) < 0.15;
            const baseline = !centred && Math.abs(label.cos) < 0.3 ? 'middle' : label.cos < 0 ? 'bottom' : 'top';
            const anchor = -label.cos * half * LABEL_RADIUS + (centred ? (label.cos < 0 ? -4 : 4) : 0);
            const top = anchor - (baseline === 'bottom' ? LABEL_FONT_SIZE : baseline === 'middle' ? LABEL_FONT_SIZE / 2 : 0);
            const bottom = top + LABEL_FONT_SIZE + (label.lines - 1) * LABEL_LINE_HEIGHT;
            out.up = Math.max(out.up, -top);
            out.down = Math.max(out.down, bottom);
        }
        return out;
    };
    return (plot: number) => {
        const half = plot / 2;
        const e = extent(plot);
        return {
            left: e.left - half, right: e.right - half, top: e.up - half, bottom: e.down - half,
            // The square's bands nothing reaches into — above a flat top edge, below a flat bottom one.
            slackTop: Math.max(0, Math.floor(half - e.up)), slackBottom: Math.max(0, Math.floor(half - e.down)),
        };
    };
}

function radarPlotFor(ctx: PlotPlanContext, room: { width: number; height: number }): number {
    const overhang = radarOverhangAt(ctx);
    if (!overhang) return Math.min(room.width, room.height);
    const whole = Math.min(room.width, room.height);
    let plot = whole;
    for (let pass = 0; pass < 2; pass++) {
        const o = overhang(plot);
        // A band the drawing leaves empty above or below is room the square can grow into: the
        // plot comes in to the drawing.
        plot = Math.max(1, Math.min(room.width - Math.max(0, o.left) - Math.max(0, o.right), room.height - o.top - o.bottom));
    }
    return Math.round(Math.max(plot, whole * RADAR_KEPT_SHARE));
}

/** The smallest panel a faceted radar draws. */
const RADAR_MIN_PANEL = 200;

/** The gap between a faceted radar's panels, and between its rows. */
const RADAR_PANEL_GAP = 5;

/**
 * A faceted radar's panels: one per column value in a row, one row per row value, each holding
 * only the groups with rows of their own, `RADAR_PANEL_GAP` apart.
 */
function radarViews(ctx: ViewPlanContext): ViewNode | undefined {
    const columnField = ctx.channelSemantics.column?.field;
    const rowField = ctx.channelSemantics.row?.field;
    const panel: ViewNode = { kind: 'view', role: 'plot', width: ctx.plot.width, height: ctx.plot.height };
    if (!ctx.table?.length || !ctx.channelSemantics.x?.field || !ctx.channelSemantics.y?.field) return undefined;
    if (!columnField && !rowField) return panel;
    const filled = (filter: (row: any) => boolean) => ctx.table.some(filter);
    const columnGroups = columnField ? distinctOf(ctx.table, columnField) : ['_all'];
    const rowGroups = rowField ? distinctOf(ctx.table, rowField) : ['_all'];
    const row = (children: ViewNode[]): ViewNode => ({ kind: 'concat', direction: 'row', gap: RADAR_PANEL_GAP, children });
    const column = (children: ViewNode[]): ViewNode => ({ kind: 'concat', direction: 'column', gap: RADAR_PANEL_GAP, children });
    if (rowField && columnField) {
        return column(rowGroups
            .map((rg) => columnGroups.filter((cg) => filled((r) => String(r[rowField]) === rg && String(r[columnField]) === cg)).map(() => panel))
            .filter((panels) => panels.length > 0)
            .map(row));
    }
    if (columnField) return row(columnGroups.filter((cg) => filled((r) => String(r[columnField]) === cg)).map(() => panel));
    return column(rowGroups.filter((rg) => filled((r) => String(r[rowField!]) === rg)).map(() => panel));
}

export const radarChartDef: ChartTemplateDef = {
    planPlot: (ctx) => {
        if (!ctx.table || ctx.table.length === 0 || !ctx.channelSemantics.x?.field || !ctx.channelSemantics.y?.field) return undefined;
        const size = radarSize(ctx.canvasSize);
        const faceted = ctx.channelSemantics.column?.field || ctx.channelSemantics.row?.field;
        if (faceted) { const panel = Math.max(RADAR_MIN_PANEL, size); return { width: panel, height: panel }; }
        const panel = radarPlotFor(ctx, { width: ctx.canvasSize?.width || size, height: ctx.canvasSize?.height || size });
        // The plot comes in to what is drawn: an odd count leaves a flat edge, and a band of the
        // square above or below it holds nothing.
        const o = radarOverhangAt(ctx)?.(panel);
        return { width: panel, height: panel - (o ? o.slackTop + o.slackBottom : 0) };
    },
    planViews: radarViews,
    // The spoke labels stand past the outer ring, outside the square plot; the polygons fill it.
    planOverhang: (ctx, plot) => {
        if (ctx.channelSemantics.column?.field || ctx.channelSemantics.row?.field) return undefined;
        const overhang = radarOverhangAt(ctx);
        if (!overhang) return undefined;
        const o = overhang(Math.min(plot.width, plot.height));
        const clear = (v: number) => Math.max(0, Math.ceil(v));
        return { left: clear(o.left), right: clear(o.right), top: clear(o.top), bottom: clear(o.bottom), fills: true };
    },
    chart: "Radar Chart",
    template: {
        description: "Radar / Spider chart",
        mark: "point",
        encoding: {},
    },
    channels: ["x", "y", "color", "column", "row"],
    interactionSupport: {
        elements: true,
        region: ['cartesian', 'angular'],
        legend: true,
    },
    markCognitiveChannel: 'position',
    semanticInteractions: ({ resolvedEncodings }) => {
        const axisField = resolvedEncodings.x?.field;
        const valueField = resolvedEncodings.y?.field;
        const groupField = resolvedEncodings.color?.field;
        return {
            fields: [axisField, valueField, groupField].filter((field): field is string => !!field),
            categoryField: axisField,
            seriesField: groupField,
            polarOrigin: { x: 0, y: 0 },
            legendFields: groupField ? { color: groupField } : undefined,
            selectableMarks: ['line', 'point'],
            renderHoverStyles: {
                line: { strokeWidth: 3 },
                symbol: { strokeWidth: 2 },
            },
            renderSelectionStyles: { line: { strokeWidthMultiplier: 1.2 } },
            resolve: (event, context) => resolveSeriesTarget(event, context, groupField),
            presentUpdate: presentAnnotationUpdate(() => annotationCandidates(
                'right', 'left', 'top', 'bottom', 'center',
            )),
        };
    },
    structure: (ctx) => {
        // Spokes, rings and polygons drawn in the radar's own coordinates; no axis is drawn.
        const { x, y, color } = ctx.channelSemantics;
        const axes = x?.field ? new Set(ctx.table.map((row) => String(row[x.field!]))).size : 0;
        if (!y?.field || axes < 2) return { marks: ['point'], stacking: 'none' };
        const groups = color?.field ? new Set(ctx.table.map((row) => String(row[color.field!]))).size : 0;
        return {
            marks: ['rule', 'text', 'line', 'point'],
            ...(groups > 1 ? { series: { field: color!.field, type: color!.type } } : {}),
            // The key is drawn through the `__group` column the polygons are split by.
            keys: groups > 1 ? [{ channel: 'color', field: color!.field, type: color!.type, via: '__group' }] : [],
            stacking: 'none',
        };
    },
    instantiate: (spec, ctx) => {
        const axisField: string | undefined = ctx.resolvedEncodings.x?.field;
        const valueField: string | undefined = ctx.resolvedEncodings.y?.field;
        const groupField: string | undefined = ctx.resolvedEncodings.color?.field;
        const columnField: string | undefined = ctx.resolvedEncodings.column?.field;
        const rowField: string | undefined = ctx.resolvedEncodings.row?.field;

        const table = ctx.table;
        const canvasSize = ctx.canvasSize;
        const config = ctx.chartProperties;

        const filled = config?.filled ?? true;
        const fillOpacity = config?.fillOpacity ?? 0.15;
        const strokeWidth = config?.strokeWidth ?? 1.5;

        if (!table || table.length === 0 || !axisField || !valueField) {
            spec.mark = "point";
            return;
        }

        const size = ctx.plot?.width ?? radarSize(canvasSize);
        // A plot shorter than it is wide is the square with its empty bands taken off: the y scale
        // keeps the x scale's pixels per unit, over the part of the square still drawn.
        const height = !columnField && !rowField ? Math.min(size, ctx.plot?.height ?? size) : size;
        let yDomain: [number, number] | undefined;
        if (height < size) {
            const o = radarOverhangAt(ctx)?.(size);
            const unit = size / 2 / RADAR_DOMAIN_PAD;
            const bottom = RADAR_DOMAIN_PAD - Math.min(o?.slackBottom ?? 0, size - height) / unit;
            yDomain = [-bottom, height / unit - bottom];
        }
        const layerOpts = {
            filled, fillOpacity, strokeWidth, domainPad: RADAR_DOMAIN_PAD, ...(yDomain ? { yDomain } : {}),
            ...(!columnField && !rowField && canvasSize?.width ? { room: { width: canvasSize.width, plot: size, measure: ctx.measureText } } : {}),
        };

        // ---- No faceting ----
        if (!columnField && !rowField) {
            const layers = buildRadarLayers(table, axisField, valueField, groupField, layerOpts);
            if (layers.length === 0) { spec.mark = "point"; return; }

            const finalSpec: any = {
                width: size, height, layer: layers,
                config: { view: { stroke: null } },
            };
            for (const key of Object.keys(spec)) delete spec[key];
            Object.assign(spec, finalSpec);
            return;
        }

        // ---- Faceting ----
        const colGroups: string[] = columnField
            ? [...new Set(table.map(r => String(r[columnField])))] as string[]
            : ["_all"];
        const rowGroups: string[] = rowField
            ? [...new Set(table.map(r => String(r[rowField])))] as string[]
            : ["_all"];

        const subplotSize = ctx.plot?.width ?? Math.max(RADAR_MIN_PANEL, size);

        let subplotIndex = 0;
        const buildSubplot = (rows: any[], title?: string) => {
            const layers = buildRadarLayers(rows, axisField, valueField, groupField, layerOpts);
            if (layers.length === 0) return null;
            // Vega-Lite binds same-named layers across concat views to one
            // dataset, so every panel would draw the last panel's vertices.
            const suffix = `--panel-${subplotIndex++}`;
            for (const layer of layers) if (layer.name) layer.name += suffix;
            return {
                width: subplotSize, height: subplotSize,
                layer: layers,
                title: title || undefined,
            };
        };

        let finalSpec: any;
        const concatSpacing = ctx.views?.kind === 'concat' ? ctx.views.gap : RADAR_PANEL_GAP;

        if (rowField && columnField) {
            const vconcat: any[] = [];
            for (const rg of rowGroups) {
                const hconcat: any[] = [];
                for (const cg of colGroups) {
                    const subset = table.filter(r => String(r[rowField]) === rg && String(r[columnField]) === cg);
                    const s = buildSubplot(subset, `${cg}`);
                    if (s) hconcat.push(s);
                }
                if (hconcat.length > 0) {
                    vconcat.push({ hconcat, spacing: concatSpacing, title: rg });
                }
            }
            finalSpec = { vconcat, spacing: concatSpacing, config: { view: { stroke: null } } };
        } else if (columnField) {
            const hconcat: any[] = [];
            for (const cg of colGroups) {
                const subset = table.filter(r => String(r[columnField]) === cg);
                const s = buildSubplot(subset, cg);
                if (s) hconcat.push(s);
            }
            finalSpec = { hconcat, spacing: concatSpacing, config: { view: { stroke: null } } };
        } else {
            const vconcat: any[] = [];
            for (const rg of rowGroups) {
                const subset = table.filter(r => String(r[rowField!]) === rg);
                const s = buildSubplot(subset, rg);
                if (s) vconcat.push(s);
            }
            finalSpec = { vconcat, spacing: concatSpacing, config: { view: { stroke: null } } };
        }

        for (const key of Object.keys(spec)) delete spec[key];
        Object.assign(spec, finalSpec);
    },
    properties: [
        { key: "filled", label: "Filled", type: "binary", defaultValue: true },
        { key: "fillOpacity", label: "Fill Opacity", type: "continuous", min: 0, max: 0.5, step: 0.1, defaultValue: 0.15 },
        { key: "strokeWidth", label: "Line Width", type: "continuous", min: 0.5, max: 4, step: 0.5, defaultValue: 1.5 },
    ] as ChartPropertyDef[],
};
