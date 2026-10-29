import type { FurnitureReserve } from './furniture-reserve';
import type { CanvasTreatment } from './types';
import { LAYOUT_COSTS, NARROW_KEY_NAMES } from './layout-costs';

/**
 * Canvas fit: whether a planned chart will read well in its canvas, judged before it is drawn.
 *
 * Two trade-offs are read apart, as the canvas-squeeze page measures them on the drawn SVG:
 * - the chart area — the plot with its own axes, or for panels the whole grid with its headers and
 *   axes, read as one area — against what is set around it: the title, deck, keys and chrome;
 * - each panel against its own labels: the y labels beside it, the x labels below it.
 * Then the shape: what is set around the chart area must not stretch the drawing out of its box's
 * shape, beyond the shape the chart area takes itself. And the fit: a drawing shrunk past
 * legibility to enter its box reads as badly as a squeezed one.
 */

/** Past these a chart reads as squeezed. */
export const CANVAS_FIT_LIMITS = {
    /** The share of the drawing's height or width the title, keys and chrome may take. */
    around: 0.4,
    /** The share of a panel's width (or height) its own y (or x) labels may take. */
    labels: 0.4,
    /** How far what is around the chart may stretch the drawing's shape from its box's, as a ratio of aspects. */
    stretch: 1.35,
    /** The smallest a host may shrink the drawing to enter its box before its text is too small. */
    scale: 0.7,
    /** A single plot's widest shape either way, as a ratio of its sides. */
    aspect: 3,
    /** A single plot's shortest side, as shown. */
    minSide: 100,
};

/** What the plan says the chart draws, in px, measured from its decisions. */
export interface CanvasParts {
    /** One panel's plot, and how many there are across and down, the gap between them. */
    panel: { width: number; height: number };
    /** One panel's plot as designed, before a title or chrome takes height from it. */
    designed?: { width: number; height: number };
    /**
     * One panel's plot as the chart sized it on its own, where a refit has since grown it into the
     * room its box leaves: what is around the chart is measured against the chart's own shape, so
     * a plot that grows to balance it reads as balancing it.
     */
    ownPanel?: { width: number; height: number };
    grid: { columns: number; rows: number; gapX: number; gapY: number };
    /** The room each part takes, as the furniture reserve measures it with both dimensions asked. */
    reserve: FurnitureReserve;
    /** House chrome above and below the chart area: header bands and lines, source lines, closing rules. */
    chrome: { top: number; bottom: number };
    /** The widest row of keys above or below the chart area, which may run past it. */
    keyRowWidth?: number;
    /** The padding the house sets around the drawing, each side, in px. */
    padding?: number;
    /** The box the chart must fit, and the base size it aims for. */
    box: { width: number; height: number };
    base: { width: number; height: number };
}

export interface CanvasFitEstimate {
    drawing: { width: number; height: number };
    /** One panel's plot, as drawn. */
    panel: { width: number; height: number };
    /**
     * One panel's plot as the chart designs it, before a title or chrome takes height from it: the
     * chart's own shape, which a fit never changes. (A fit that gives the plot back the height a long
     * title took is not changing its shape.)
     */
    designed: { width: number; height: number };
    area: { width: number; height: number };
    /** The share of the drawing's height above and below the chart area, and of its width beside it. */
    around: { height: number; width: number };
    /** The share of a panel's width its y labels take, and of its height its x labels take. */
    labels: { y: number; x: number };
    /** What is around the chart area does to the drawing's shape: over 1 is wider than its box, under 1 taller. */
    stretch: number;
    /** What the host shrinks the drawing by to show it in its box. */
    scale: number;
    /** Why the chart reads as squeezed by what is around it, or shrunk past legibility; empty where it is not. */
    flags: string[];
    /** What kind of problem each flag names: height, width, y labels, x labels, taller, wider, shrunk. */
    kinds: string[];
    /**
     * Where a single plot's own shape is off — flatter or taller than the limit, or a side too short.
     * A few bands make a narrow plot by design: this alone does not call for a fit, but a fit must not
     * make it worse.
     */
    plotFlags: string[];
    plotExcess: number;
    /** How far past the limits it is, summed and normalised: 0 where it reads well. */
    excess: number;
}

/** What a house sets above and below the chart area as a matter of course, as a share of its height. */
export const HEADER_ALLOWANCE = 0.25;
/** What a house sets beside the chart area as a matter of course, as a share of its width. */
export const SIDE_ALLOWANCE = 0.33;

/** The padding the backend sets around a drawing, each side, in px, where the house names none. */
const DRAWING_PADDING = 5;

/**
 * How far above the legibility limit a treatment must leave the drawing's scale, where the chart as
 * planned was legible: the estimate runs a little small, and a fix must not trade a squeeze for text
 * too small to read.
 */
export const LEGIBILITY_MARGIN = 0.05;

const over = (value: number, limit: number) => Math.max(0, value - limit) / limit;

/**
 * How much stricter the plan's judge is than the limits: the estimate, made before anything is
 * drawn, runs a few px small, so a chart it puts just inside a limit may be drawn just past it.
 */
export const ESTIMATE_MARGIN = 0.95;

export function judgeCanvas(parts: CanvasParts): CanvasFitEstimate {
    const { panel, grid, reserve, chrome, box, base } = parts;
    const p = reserve.parts;
    const gridWidth = panel.width * grid.columns + grid.gapX * Math.max(0, grid.columns - 1);
    const gridHeight = panel.height * grid.rows + grid.gapY * Math.max(0, grid.rows - 1);
    const yOwn = (p.yLabels ?? 0) + (p.yTitle ?? 0);
    const xOwn = (p.xLabels ?? 0) + (p.xTitle ?? 0);
    const area = { width: gridWidth + yOwn, height: gridHeight + xOwn + (p.facetHeaders ?? 0) };
    const aroundWidth = (p.sideKeys ?? 0) + (p.seriesEnd ?? 0);
    const aroundHeight = (p.title ?? 0) + (p.flatYTitle ?? 0) + (p.stackedKeys ?? 0) + chrome.top + chrome.bottom;
    // The house pads the drawing on every side.
    const pad = parts.padding ?? DRAWING_PADDING;
    const drawing = {
        width: Math.max(area.width + aroundWidth, parts.keyRowWidth ?? 0) + 2 * pad,
        height: area.height + aroundHeight + 2 * pad,
    };
    const around = { height: aroundHeight / (drawing.height || 1), width: aroundWidth / (drawing.width || 1) };
    const labels = { y: yOwn / ((yOwn + panel.width) || 1), x: xOwn / ((xOwn + panel.height) || 1) };
    const aspect = (size: { width: number; height: number }) => size.width / (size.height || 1);
    // The shape: what is around the chart stretches it only past what a house sets there as a matter
    // of course — a title and a row of keys above a plot make it taller, and that is its design. The
    // allowance: a quarter of the chart area's height above and below it, a third of its width beside.
    // The padding counts: it is part of the drawing's shape in its box.
    const shaped = {
        width: area.width + Math.max(0, drawing.width - area.width - area.width * SIDE_ALLOWANCE),
        height: area.height + Math.max(0, drawing.height - area.height - area.height * HEADER_ALLOWANCE),
    };
    const own = parts.ownPanel
        ? { width: area.width - (parts.panel.width - parts.ownPanel.width), height: area.height - (parts.panel.height - parts.ownPanel.height) }
        : area;
    const stretch = (aspect(shaped) / aspect(box)) / (aspect(own) / aspect(base));
    const scale = Math.min(1, box.width / (drawing.width || 1), box.height / (drawing.height || 1));
    const strict = (limit: number) => limit * ESTIMATE_MARGIN;
    const L = {
        ...CANVAS_FIT_LIMITS,
        around: strict(CANVAS_FIT_LIMITS.around),
        labels: strict(CANVAS_FIT_LIMITS.labels),
        // The shape, padding and all, runs a little large in the estimate already: no margin on it.
        stretch: CANVAS_FIT_LIMITS.stretch,
        scale: CANVAS_FIT_LIMITS.scale / ESTIMATE_MARGIN,
    };
    const flags: string[] = [];
    const kinds: string[] = [];
    let excess = 0;
    const flag = (amount: number, message: string, kind: string) => {
        if (amount <= 0) return;
        flags.push(message);
        kinds.push(kind);
        excess += amount;
    };
    const pct = (value: number) => `${Math.round(value * 100)}%`;
    // What is around the chart area squeezes it, or bends the drawing out of shape, only where the
    // box holds it in: a drawing with room to spare in its box is shown as drawn.
    const held = scale < 0.99;
    // A title that breaks takes its lines out of the plot: the box held it in through the plot,
    // not through the host's shrink, and the plot is squeezed all the same.
    const designedHeight = (parts.designed ?? panel).height;
    const takenFromPlot = (designedHeight - panel.height) / (designedHeight || 1) > TAKEN_FROM_PLOT;
    flag(held || takenFromPlot ? over(around.height, L.around) : 0, `title, keys and chrome take ${pct(around.height)} of the height`, 'height');
    flag(held ? over(around.width, L.around) : 0, `keys take ${pct(around.width)} of the width`, 'width');
    flag(over(labels.y, L.labels), `y labels take ${pct(labels.y)} of the plot's width`, 'yLabels');
    flag(over(labels.x, L.labels), `x labels take ${pct(labels.x)} of the plot's height`, 'xLabels');
    const stretchExcess = held ? Math.max(0, Math.abs(Math.log(stretch)) - Math.log(L.stretch)) / Math.log(L.stretch) : 0;
    flag(stretchExcess, `what is around the chart stretches the drawing ${(stretch > 1 ? stretch : 1 / stretch).toFixed(1)}× ${stretch > 1 ? 'wider' : 'taller'} than its box`, stretch > 1 ? 'wider' : 'taller');
    // Text shrunk past legibility is the worst way out of a box: it weighs three times the others.
    flag(scale < L.scale ? 3 * (L.scale - scale) / L.scale : 0, `shrunk to ${pct(scale)} to fit its box`, 'shrunk');
    const plotFlags: string[] = [];
    let plotExcess = 0;
    if (grid.columns * grid.rows === 1) {
        const plotFlag = (amount: number, message: string) => {
            if (amount <= 0) return;
            plotFlags.push(message);
            plotExcess += amount;
        };
        const shape = aspect(panel);
        plotFlag(Math.max(0, Math.abs(Math.log(shape)) - Math.log(L.aspect)) / Math.log(L.aspect), `the plot is ${shape.toFixed(1)}:1`);
        const side = Math.min(panel.width, panel.height) * scale;
        plotFlag(side < L.minSide ? (L.minSide - side) / L.minSide : 0, `the plot's short side shows ${Math.round(side)}px`);
    }
    return { drawing, panel, designed: parts.designed ?? panel, area, around, labels, stretch, scale, flags, kinds, plotFlags, plotExcess, excess: excess + plotExcess };
}

/**
 * What a treatment costs the reader, on the planner's one scale ({@link LAYOUT_COSTS}): keys kept on
 * their house's edge in one row, least; long names wrapped, on keys or down the y axis; the axis labels
 * a size down; the title a size down; one key moved to another edge; every key moved; the title two
 * sizes down; a smaller plot, more the smaller it gets. `edge` is where
 * the keys stood as planned: a row on that edge is the gentler edit.
 */
/** The share of its designed height a plot may give a breaking title before the title counts as squeezing it. */
const TAKEN_FROM_PLOT = 0.1;

export function treatmentCost(treatment: CanvasTreatment, edge?: string): number {
    const C = LAYOUT_COSTS.edit;
    const onEdge = treatment.keys === 'side' ? edge === 'left' || edge === 'right' : treatment.keys === edge;
    const keys = !treatment.keys ? 0 : onEdge ? C.keysRowOnEdge : C.keysOtherEdge;
    const names = !treatment.names ? 0 : C.names + (treatment.names.keyWidth <= NARROW_KEY_NAMES ? C.namesNarrow : 0);
    const title = !treatment.titleScale ? 0 : treatment.titleScale < 0.8 ? C.titleDeep : C.title;
    const plot = treatment.plotScale ? C.plot + (1 - treatment.plotScale) * C.plotPerShare : 0;
    const oneKey = treatment.oneKey ? C.keyMoved : 0;
    const rowNames = treatment.rowNames ? C.rowNames : 0;
    const labels = treatment.labelScale ? C.labels + (1 - treatment.labelScale) * C.labelsPerShare : 0;
    return keys + oneKey + names + rowNames + labels + title + plot;
}

/**
 * What a drawing that reads well still costs in reading: how near its shape, its balance and the
 * host's shrink stand to their limits, each from 0 (none) to 1 (at the limit), averaged. Fits that
 * all clear are told apart by it.
 */
export function readingCost(estimate: CanvasFitEstimate): number {
    const L = CANVAS_FIT_LIMITS;
    const shape = Math.min(1, Math.abs(Math.log(estimate.stretch || 1)) / Math.log(L.stretch));
    const balance = Math.min(1, Math.max(estimate.around.height, estimate.around.width) / L.around);
    const shrink = Math.min(1, Math.max(0, 1 - estimate.scale) / (1 - L.scale));
    return (shape + balance + shrink) / 3;
}

export function describeTreatment(treatment: CanvasTreatment | undefined): string {
    if (!treatment) return 'as planned';
    const parts: string[] = [];
    if (treatment.keys) parts.push(treatment.keys === 'side' ? 'keys beside the plot' : `keys in a row ${treatment.keys === 'top' ? 'above' : 'below'} it`);
    if (treatment.oneKey) {
        const key = treatment.oneKey.title ? `the ${treatment.oneKey.title} key` : 'one key';
        parts.push(treatment.oneKey.to === 'side' ? `${key} beside the plot` : `${key} ${treatment.oneKey.to === 'top' ? 'above' : 'below'} it`);
    }
    if (treatment.rowNames) parts.push('row names wrapped');
    if (treatment.plotSpace) parts.push('plot laid out again in the room left');
    if (treatment.titleScale) parts.push(`title at ${Math.round(treatment.titleScale * 100)}%`);
    if (treatment.labelScale) parts.push(`axis labels at ${Math.round(treatment.labelScale * 100)}%`);
    if (treatment.names) parts.push('narrower key names');
    if (treatment.keyScale) parts.push(`key text at ${Math.round(treatment.keyScale * 100)}%`);
    if (treatment.plotScale) parts.push(`plot at ${Math.round(treatment.plotScale * 100)}%`);
    return parts.join(', ') || 'as planned';
}

/**
 * The share of its base the plot is laid out at for the drawing to enter its box, keeping its
 * shape: the room the box lacks, taken from the chart area alone. Only for a drawing the host would
 * otherwise shrink past legibility — a plot a little smaller reads; text a third smaller does not.
 * Undefined where the drawing is legible as it is.
 */
export function plotFitScale(estimate: CanvasFitEstimate, box: { width: number; height: number }): number | undefined {
    const furniture = { width: estimate.drawing.width - estimate.area.width, height: estimate.drawing.height - estimate.area.height };
    // Only where the host would shrink the drawing past legibility; with a margin, so it enters whole.
    if (estimate.scale >= CANVAS_FIT_LIMITS.scale / ESTIMATE_MARGIN) return undefined;
    const scale = Math.min((box.width - furniture.width) / estimate.area.width, (box.height - furniture.height) / estimate.area.height) * 0.93;
    if (!(scale < 0.97)) return undefined;
    return Math.max(PLOT_SCALE_FLOOR, Math.round(scale * 100) / 100);
}

/** The smallest share of its base a canvas-fit pass lays the plot out at. */
export const PLOT_SCALE_FLOOR = 0.6;

/** What a canvas-fit pass decided, carried on the plan and the spec for tools that inspect it. */
export interface CanvasFitResult {
    strategy: string;
    /** The plan as it stood, judged. */
    before: CanvasFitEstimate;
    /** The treatment taken, if any, and the plan under it, judged. */
    treatment?: CanvasTreatment;
    after?: CanvasFitEstimate;
    /** Every treatment weighed, in the order tried. */
    tried: Array<{ treatment: CanvasTreatment; label: string; excess: number; cost: number; flags: string[] }>;
}
