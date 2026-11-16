// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * What a charting library does on its own with the furniture the layout plans: how it sets a key's
 * entries, how far its text stands from the axis, how tall its lines run. The layout's rules are the
 * same on every backend; a profile is how each library draws what they decide, so the room the
 * layout keeps is the room the library will take, not an estimate tuned by eye.
 *
 * Each backend states its own profile beside its renderer (`plotly/profile.ts`, …), read off the
 * library's defaults and source; the estimators here take a profile and know no library.
 */

import type { KeyStyle } from './legend-layout';

/** How a library sets a key's entries. */
export interface KeyGeometry {
    /** Px from an entry's start to its text: the symbol and the gaps either side of it. */
    lead: number;
    /** The symbol's own size, for the planner's estimate of an entry. */
    symbol: number;
    /** Px between entries set in a row. */
    gap: number;
    /** Px between rows of entries. */
    rowGap: number;
    /** Px inside the key's box: at its left and right edges, and at its top and bottom. */
    pad: { x: number; y: number };
    /** How tall an entry stands with this many lines of text at this size. */
    entryHeight: (fontSize: number, lines: number) => number;
    /** A line of key text, in ems. */
    lineHeight: number;
    /**
     * How a row of entries too long for its room wraps: `flow` keeps each entry its own width and
     * breaks where the next will not fit; `grid` sets every entry at the widest one's width.
     */
    wrap: 'flow' | 'grid';
    /**
     * A row breaks once the next entry would run past its room (`over`), reach it (`reach`), or run
     * past it with the gap after it counted too (`overWithGap`, Plotly's grouped rows).
     */
    breakAt: 'over' | 'reach' | 'overWithGap';
    /** Where a key set in rows puts its title: at the start of the rows, or above them. */
    rowTitle: 'start' | 'top';
    /** Px between a title at the start of the rows and the first entry. */
    titleGap: number;
    /** Px between a title above the entries and the first row. */
    titleRowGap: number;
    /** A key beside the plot stands in one column (scrolling past its height), or in as many as it needs. */
    sideColumns: 'one' | 'many';
}

/** What a library does with a chart's text and frame, as far as the layout needs to know it. */
export interface BackendProfile {
    id: string;
    /** The family the library's text is measured in where the chart sets none. */
    font: string;
    key: KeyGeometry;
    /** Px the drawing keeps clear of the canvas's edges. */
    edge: number;
    /** Px between an axis line and its tick labels (tick length included). */
    tickLabelGap: number;
    /** Px between tick labels and the axis title. */
    axisTitleGap: number;
    /** A line of axis text, in ems. */
    labelLineHeight: number;
    /** The height of a single line of axis text, in ems (its box, which runs shorter than a line). */
    labelBoxHeight: number;
    /** Px the library keeps past an axis's labels (or title) when it fits its margins to them. */
    axisPad: number;
}

export type WidthOf = (text: string) => number;

export interface KeyBlockInput {
    /** Each entry's text, as lines (already cut where they will be cut). */
    entries: readonly (readonly string[])[];
    fontSize: number;
    /** Width of a line of entry text. */
    widthOf: WidthOf;
    /** The key's title, as lines, and its width and size. */
    title?: { lines: readonly string[]; fontSize: number; widthOf: WidthOf };
    /** `horizontal`: entries in rows across `room`; `vertical`: a column. */
    orientation: 'horizontal' | 'vertical';
    /** The width a row may run to before it wraps. */
    room?: number;
}

export interface KeyBlock {
    width: number;
    height: number;
    rows: number;
    /** Px from the box's top edge to the top of its first line of text. */
    inset: number;
}

/**
 * The box a library draws for a key, from its profile: entries in rows that wrap as the library wraps
 * them, or a column; the title at the start of the rows or on top; the box's own padding around all.
 */
export function keyBlock(g: KeyGeometry, input: KeyBlockInput): KeyBlock {
    const { entries, fontSize, widthOf } = input;
    const titleLines = input.title?.lines ?? [];
    const titleWidth = titleLines.length ? Math.max(...titleLines.map(input.title!.widthOf)) : 0;
    const titleHeight = titleLines.length ? titleLines.length * input.title!.fontSize * g.lineHeight : 0;
    const heights = entries.map((lines) => g.entryHeight(fontSize, Math.max(1, lines.length)));
    const widths = entries.map((lines) => g.lead + Math.max(0, ...lines.map(widthOf)));
    // An entry's text stands centred in its own height, so a one-line entry sets the first row's top.
    const inset = g.pad.y + Math.max(0, (g.entryHeight(fontSize, 1) - fontSize * g.lineHeight) / 2);
    if (!entries.length) return { width: 0, height: 0, rows: 0, inset: 0 };

    if (input.orientation === 'vertical') {
        const body = heights.reduce((sum, h) => sum + h, 0) + g.rowGap * (entries.length - 1);
        const top = titleHeight ? titleHeight + g.titleRowGap : 0;
        return {
            width: Math.ceil(Math.max(Math.max(...widths), titleWidth) + 2 * g.pad.x),
            height: Math.ceil(top + body + 2 * g.pad.y),
            rows: entries.length,
            inset: titleHeight ? g.pad.y : inset,
        };
    }

    const inlineTitle = titleHeight > 0 && g.rowTitle === 'start' ? titleWidth + g.titleGap : 0;
    const room = Math.max(1, (input.room ?? Infinity) - 2 * g.pad.x);
    const oneRow = widths.reduce((sum, w) => sum + w, 0) + g.gap * (widths.length - 1) < room;
    const widest = Math.max(...widths);
    const cell = (w: number) => (g.wrap === 'grid' && !oneRow ? widest : w);
    let rows = 1;
    let run = 0;
    let rowHeight = 0;
    let height = 0;
    let rowWidth = 0;
    entries.forEach((_, i) => {
        const w = cell(widths[i]);
        const end = run + (run > 0 ? g.gap : 0) + w;
        const past = g.breakAt === 'reach' ? end >= room : g.breakAt === 'overWithGap' ? end + g.gap > room : end > room;
        if (run > 0 && past) {
            rows += 1;
            height += rowHeight + g.rowGap;
            rowWidth = Math.max(rowWidth, run);
            run = w;
            rowHeight = heights[i];
        } else {
            run = end;
            rowHeight = Math.max(rowHeight, heights[i]);
        }
    });
    height += rowHeight;
    rowWidth = Math.max(rowWidth, run);
    const top = titleHeight && g.rowTitle === 'top' ? titleHeight + g.titleRowGap : 0;
    return {
        width: Math.ceil(inlineTitle + rowWidth + 2 * g.pad.x),
        height: Math.ceil(Math.max(height, g.rowTitle === 'start' ? titleHeight : 0) + top + 2 * g.pad.y),
        rows,
        inset: top ? g.pad.y : inset,
    };
}

/** The style the layout's key planner ({@link planKeyLayout}) measures a library's key with. */
export function keyPlanStyle(g: KeyGeometry): Pick<KeyStyle, 'symbolSize' | 'labelOffset' | 'padding' | 'rowPadding' | 'columnPadding' | 'columns'> {
    return {
        symbolSize: g.symbol * g.symbol,
        labelOffset: Math.max(0, g.lead - g.symbol),
        padding: Math.max(g.pad.x, g.pad.y),
        rowPadding: g.rowGap,
        columnPadding: g.gap,
        ...(g.sideColumns === 'one' ? { columns: 1 } : {}),
    };
}
