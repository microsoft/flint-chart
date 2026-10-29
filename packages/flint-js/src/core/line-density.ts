import type { ChannelSemantics } from './types';

/** The stroke below which a line stops reading as a line on screen, in px. */
export const MIN_DENSE_STROKE = 0.75;
/** The share of a panel's height a chart's lines may ink between them. */
export const LINE_INK_SHARE = 0.15;

/** The panels a faceted chart draws, and so the panels its rows are shared among. */
export function panelCount(rows: any[], channelSemantics: Record<string, ChannelSemantics>): number {
    let panels = 1;
    for (const field of [channelSemantics.column?.field, channelSemantics.row?.field]) {
        if (field) panels *= Math.max(1, new Set(rows.map((row) => row?.[field]).filter((value) => value != null)).size);
    }
    return panels;
}

/** How many lines one panel draws: one per series (colour, detail, dash), shared among the panels; 0 where no field splits them. */
export function linesPerPanel(rows: any[], channelSemantics: Record<string, ChannelSemantics>): number {
    const seriesFields = (['color', 'detail', 'strokeDash'] as const)
        .map((channel) => channelSemantics[channel]?.field)
        .filter((field): field is string => !!field);
    if (seriesFields.length === 0 || rows.length === 0) return 0;
    const facetFields = [channelSemantics.column?.field, channelSemantics.row?.field].filter((field): field is string => !!field);
    const keys = new Set(rows.map((row) => [...facetFields, ...seriesFields].map((field) => String(row?.[field])).join('\u0000')));
    return keys.size / panelCount(rows, channelSemantics);
}

/**
 * The width lines are drawn at once `lines` of them share a panel `plotHeight` px tall: the backend's
 * (or house's) `base` weight, thinned where the series would ink more than 15% of the panel between
 * them, to no less than 0.75 px. A line runs the panel's width, so its ink is its width against the
 * panel's height. Undefined where the base stands.
 */
export function denseLineWidth(base: number, lines: number, plotHeight: number): number | undefined {
    if (!(plotHeight > 0) || !(lines > 0)) return undefined;
    const width = Math.max(MIN_DENSE_STROKE, Math.min(base, Math.round(((plotHeight * LINE_INK_SHARE) / lines) * 100) / 100));
    return width < base ? width : undefined;
}
