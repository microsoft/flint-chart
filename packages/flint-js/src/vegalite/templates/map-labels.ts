// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * A point map's labels: the `text` field written beside each point, as an atlas names its places.
 *
 * Where each point lands is worked out at compile time, through the projection Vega will draw (see
 * `planProjection`), and each label is placed beside its point — right, left, above or below,
 * whichever first clears every dot, every label placed before it and the plot's edge, and on a route
 * map its lines too where it can (a label crosses a line rather than go unplaced). A point whose label
 * fits nowhere keeps its dot unnamed. Labels are placed in priority: the largest dots first
 * where `size` sizes them, else the rows in order.
 *
 * A placed label keeps its point and its offset from it in px: drawn at the point through the live
 * projection (as a route's heads are), it stays beside its point through a pan, a zoom or a globe's
 * turn. A zoom only parts the points, so labels placed apart stay apart.
 */

import { measureIn } from '../../core/backend-frame';
import { frontFacingExpr, planProjection } from '../../chart-types/geo-frame';
import { routeStopMode, stopRadii, type Route } from '../../chart-types/map-routes';
import { GEO_ROTATE_SIGNAL } from '../interactions/geo-levels';
import { MAP_ROLE } from './map-style';
import { ROUTE_PROJECTION_TOKEN, rowFields } from './map-routes';

/** The labels' type size in px. */
export const LABEL_SIZE = 10;
/** The gap between a dot's edge and its label, in px. */
const LABEL_GAP = 2;
/** The width of the halo round a label's letters, in px. */
const LABEL_HALO = 2.5;
/** How far apart a route's line is traced for labels to keep off, and how far either side it reaches, in px. */
const LINE_STEP = 5;
const LINE_REACH = 3;
/** A dot's area where `size` does not set it (Vega-Lite's own point size). */
const DOT_AREA = 30;
/** A sized dot's area range on a point map, smallest to largest. */
const SIZED_AREA: readonly [number, number] = [9, 361];

/** The fields a label's datum carries: the point it names, and where its text starts from the point in px. */
export const LABEL_AT = 'flintLabelAt';
export const LABEL_DX = 'flintLabelDx';
export const LABEL_DY = 'flintLabelDy';
const LABEL_X = 'flintLabelX';
const LABEL_Y = 'flintLabelY';

interface Box { x0: number; y0: number; x1: number; y1: number }

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Boxes on a coarse grid, so a box finds the few it might overlap without testing every one. */
class BoxGrid {
    private cells = new Map<string, Box[]>();
    constructor(private readonly cell = 40) {}
    private keys(box: Box): string[] {
        const keys: string[] = [];
        for (let i = Math.floor(box.x0 / this.cell); i <= Math.floor(box.x1 / this.cell); i++) {
            for (let j = Math.floor(box.y0 / this.cell); j <= Math.floor(box.y1 / this.cell); j++) keys.push(`${i},${j}`);
        }
        return keys;
    }
    add(box: Box): void {
        for (const key of this.keys(box)) this.cells.set(key, [...(this.cells.get(key) ?? []), box]);
    }
    hits(box: Box, except?: Box): boolean {
        return this.keys(box).some((key) => (this.cells.get(key) ?? []).some((other) => other !== except && overlaps(box, other)));
    }
}

/**
 * Each row's dot radius in px as the map will draw it, near enough to keep labels off the dots: a
 * route's stops as `stopRadii` sizes them (a hair where they are not drawn), else a bubble's.
 */
function dotRadii(rows: readonly Record<string, any>[], resolved: Record<string, any>, chartProperties: Record<string, any> | undefined, routes: boolean): (row: number) => number {
    const sizeField = resolved.size?.field;
    if (routes) {
        if (routeStopMode(chartProperties?.stops, Boolean(sizeField)) === 'none') return () => 1.5;
        return stopRadii(chartProperties, sizeField, rows, []).radius;
    }
    if (!sizeField) return () => Math.sqrt(DOT_AREA) / 2;
    const max = Math.max(0, ...rows.map((row) => Math.abs(Number(row?.[sizeField]))).filter(Number.isFinite)) || 1;
    return (row) => {
        const value = Math.abs(Number(rows[row]?.[sizeField]));
        const share = Number.isFinite(value) ? Math.sqrt(Math.min(1, value / max)) : 0;
        return Math.sqrt(SIZED_AREA[0] + (SIZED_AREA[1] - SIZED_AREA[0]) * share) / 2;
    };
}

/**
 * Label a point map's points by its `text` field (see the module's note). Adds a halo layer and a
 * text layer over every other, and returns how many labels it placed and left out.
 */
export function addPointLabels(
    spec: any,
    options: { rows: readonly Record<string, any>[]; resolved: Record<string, any>; chartProperties?: Record<string, any>; routes: readonly Route[]; globe: boolean },
): { placed: number; dropped: number } | undefined {
    const { rows, resolved, chartProperties, routes, globe } = options;
    const textField = resolved.text?.field;
    const lonField = resolved.longitude?.field;
    const latField = resolved.latitude?.field;
    if (!textField || !lonField || !latField || !Array.isArray(spec.layer)) return undefined;
    const width = Number(spec.width);
    const height = Number(spec.height);
    const at = (row: Record<string, any>): [number, number] | undefined => {
        const lon = Number(row?.[lonField]);
        const lat = Number(row?.[latField]);
        return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lon, lat] : undefined;
    };
    const places = rows.map(at);
    const project = planProjection(spec.projection, [width, height], places.filter((place): place is [number, number] => place !== undefined));
    const radius = dotRadii(rows, resolved, chartProperties, routes.length > 0);
    const measure = measureIn({ fontSize: LABEL_SIZE, fontWeight: 500 });
    const lineHeight = LABEL_SIZE * 1.2;

    // Every dot is an obstacle, whether or not it is named.
    const grid = new BoxGrid();
    const points = rows.map((row, index) => {
        const place = places[index];
        const xy = place && project?.(place);
        if (!xy) return undefined;
        const r = radius(index);
        const dot = { x0: xy[0] - r, y0: xy[1] - r, x1: xy[0] + r, y1: xy[1] + r };
        grid.add(dot);
        return { index, place, x: xy[0], y: xy[1], r, dot };
    });
    // A route's lines, traced every few px: a label keeps off them where it can.
    const lines = new BoxGrid();
    for (const route of routes) {
        for (const leg of route.legs) {
            const drawn = leg.path.map((place) => project?.(place));
            for (let i = 1; i < drawn.length; i++) {
                const [a, b] = [drawn[i - 1], drawn[i]];
                if (!a || !b) continue;
                const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / LINE_STEP));
                for (let k = 0; k <= steps; k++) {
                    const [x, y] = [a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps];
                    lines.add({ x0: x - LINE_REACH, y0: y - LINE_REACH, x1: x + LINE_REACH, y1: y + LINE_REACH });
                }
            }
        }
    }
    // The largest dots are named first, where `size` sizes them; else the rows in their order.
    const sizeField = resolved.size?.field;
    const order = points.filter((point): point is NonNullable<typeof point> => point !== undefined)
        .filter((point) => rows[point.index]?.[textField] != null && String(rows[point.index][textField]).trim() !== '');
    if (sizeField) order.sort((a, b) => (Math.abs(Number(rows[b.index][sizeField])) || 0) - (Math.abs(Number(rows[a.index][sizeField])) || 0));

    const values: Record<string, unknown>[] = [];
    for (const point of order) {
        const text = String(rows[point.index][textField]);
        const w = measure(text);
        const reach = point.r + LABEL_GAP;
        // Where its text starts (its left edge, its middle line) from the point: right, left, above, below.
        const spots: [number, number][] = [[reach, 0], [-reach - w, 0], [-w / 2, -reach - lineHeight / 2], [-w / 2, reach + lineHeight / 2]];
        const boxes = spots.map(([dx, dy]) => ({ dx, dy, box: { x0: point.x + dx, x1: point.x + dx + w, y0: point.y + dy - lineHeight / 2, y1: point.y + dy + lineHeight / 2 } }))
            .filter(({ box }) => box.x0 >= 0 && box.y0 >= 0 && box.x1 <= width && box.y1 <= height && !grid.hits(box, point.dot));
        // Clear of the lines first; else across one.
        const spot = boxes.find(({ box }) => !lines.hits(box)) ?? boxes[0];
        if (!spot) continue;
        grid.add(spot.box);
        values.push({
            ...rowFields(rows[point.index]),
            [LABEL_AT]: { type: 'Point', coordinates: point.place },
            [LABEL_DX]: Math.round(spot.dx * 10) / 10,
            [LABEL_DY]: Math.round(spot.dy * 10) / 10,
        });
    }
    if (!values.length) return { placed: 0, dropped: order.length };

    const projected = `geoCentroid(${JSON.stringify(ROUTE_PROJECTION_TOKEN)}, datum.${LABEL_AT})`;
    const transform = [
        { calculate: `${projected}[0] + datum.${LABEL_DX}`, as: LABEL_X },
        { calculate: `${projected}[1] + datum.${LABEL_DY}`, as: LABEL_Y },
    ];
    const encoding = {
        x: { field: LABEL_X, type: 'quantitative', scale: null, axis: null },
        y: { field: LABEL_Y, type: 'quantitative', scale: null, axis: null },
        text: { field: textField, type: 'nominal' },
        // A label past a globe's horizon would show through it: it is hidden there.
        ...(globe ? { opacity: { condition: [{ test: `!(${frontFacingExpr(`datum.${LABEL_AT}.coordinates[0]`, `datum.${LABEL_AT}.coordinates[1]`, GEO_ROTATE_SIGNAL)})`, value: 0 }] } } : {}),
        tooltip: null,
    };
    const mark = { type: 'text', align: 'left', baseline: 'middle', fontSize: LABEL_SIZE, fontWeight: 500, clip: true };
    spec.layer.push(
        { [MAP_ROLE]: 'labelHalo', data: { values }, transform, mark: { ...mark, strokeWidth: LABEL_HALO, strokeJoin: 'round' }, encoding },
        { [MAP_ROLE]: 'label', data: { values }, transform, mark, encoding },
    );
    return { placed: values.length, dropped: order.length - values.length };
}

/** A region label's width in px, carried on its row so the map can tell whether its region holds it. */
export const LABEL_W = 'flintLabelW';
const LABEL_BOUNDS = 'flintLabelBounds';
const LABEL_CENTRE = 'flintLabelCentre';

/** The width of a label's text in px, as the map sets it. */
export function labelWidth(text: unknown): number {
    return text == null ? 0 : Math.round(measureIn({ fontSize: LABEL_SIZE, fontWeight: 500 })(String(text)) * 10) / 10;
}

/** The ink a region's label takes where white would not read better on its fill. */
export const REGION_LABEL_INK = '#2b2f33';

/**
 * Label a choropleth's regions by its `text` field (`textField`): each at its middle on screen,
 * through the live projection, shown only while the region is wider and taller there than its label
 * — so a small region's label appears as a zoom brings it close. A label is drawn from its region's
 * own shape: every layer that joins the rows (each level of a US map, gated as its level is) is
 * labelled by a copy of its data and its join. `spec` is layered.
 *
 * A label sits on its region's one flat colour: it takes whichever of white and a dark ink reads
 * better on that fill — the colour scale's own value for its row (`color`, the regions' colour
 * encoding), so it follows the classes, ramps and schemes the regions do. Its halo is the region's
 * own colour: unseen inside the region, it keeps the label readable where it runs past the region's
 * edge (a coast, an archipelago).
 */
export function addRegionLabels(spec: any, textField: string, color?: Record<string, any>): void {
    const colorField: string | undefined = color?.field;
    const joins = (layer: any) => (layer?.transform ?? []).some((step: any) => step?.lookup && step.from?.fields?.includes(textField));
    const regions = spec.layer.filter((layer: any) => layer?.mark && joins(layer));
    const proj = JSON.stringify(ROUTE_PROJECTION_TOKEN);
    for (const region of regions) {
        const transform = [
            ...region.transform,
            { filter: `isValid(datum[${JSON.stringify(textField)}]) && datum[${JSON.stringify(textField)}] !== ''` },
            { calculate: `geoCentroid(${proj}, datum)`, as: LABEL_CENTRE },
            { calculate: `geoBounds(${proj}, datum)`, as: LABEL_BOUNDS },
            { calculate: `datum.${LABEL_CENTRE}[0]`, as: LABEL_X },
            { calculate: `datum.${LABEL_CENTRE}[1]`, as: LABEL_Y },
        ];
        const encoding = {
            x: { field: LABEL_X, type: 'quantitative', scale: null, axis: null },
            y: { field: LABEL_Y, type: 'quantitative', scale: null, axis: null },
            text: { field: textField, type: 'nominal' },
            // Shown where the region on screen holds its label, with a little room round it.
            opacity: { condition: [{
                test: `datum.${LABEL_BOUNDS}[1][0] - datum.${LABEL_BOUNDS}[0][0] < datum.${LABEL_W} + 4 || datum.${LABEL_BOUNDS}[1][1] - datum.${LABEL_BOUNDS}[0][1] < ${LABEL_SIZE * 1.4}`,
                value: 0,
            }] },
            ...(colorField ? { color: { condition: { test: whiteReads(colorField), value: '#ffffff' }, value: REGION_LABEL_INK } } : {}),
            tooltip: null,
        };
        const mark = { type: 'text', align: 'center', baseline: 'middle', fontSize: LABEL_SIZE, fontWeight: 500, clip: true };
        const data = region.data;
        if (colorField) {
            // The halo strokes the letters in the regions' own colour scale (a text mark not filled
            // takes its colour as its stroke); the key stays the regions'.
            const { color: _ink, ...plain } = encoding;
            // One scale, so the halo takes the regions' colours; the key stays the regions' own.
            spec.resolve = { ...(spec.resolve ?? {}), legend: { ...(spec.resolve?.legend ?? {}), color: 'independent' } };
            spec.layer.push({
                ...(data ? { data } : {}), transform,
                mark: { ...mark, filled: false, strokeWidth: LABEL_HALO, strokeJoin: 'round' },
                encoding: { ...plain, color: { ...color, legend: null } },
            });
        }
        spec.layer.push({ [MAP_ROLE]: 'label', ...(data ? { data } : {}), transform, mark, encoding });
    }
}

/** Whether white contrasts more than the dark ink with the fill the colour scale gives a row's value. */
function whiteReads(colorField: string): string {
    const fill = `scale('color', datum[${JSON.stringify(colorField)}])`;
    return `isValid(${fill}) && contrast('#ffffff', ${fill}) > contrast('${REGION_LABEL_INK}', ${fill})`;
}
