// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * What layout decisions cost the reader, on one scale across the planner, so a choice in one part
 * can be weighed against one in another. One point is a change a reader notices and reads past with
 * a little effort — keys moved off the edge their house sets them on, a title two sizes down.
 *
 * The plot's own sizing — its bands, labels and stretch within the room it is given — prices its
 * choices on its own and is not read here: what is around the chart is weighed against the room
 * it leaves, not against how the plot fills it.
 */
export const LAYOUT_COSTS = {
    /**
     * The canvas fit's edits, gentlest first: what each costs the reader as a change to the chart
     * as planned. Their order is the order a reader would least notice them in.
     */
    edit: {
        /** Keys stay on the edge their house sets them on, in one row. */
        keysRowOnEdge: 0.3,
        /** Long key names wrap onto lines; the keys stay where they are. */
        names: 0.4,
        /** Long names down the y axis wrap onto a second line. */
        rowNames: 0.4,
        /** The axis labels a size down, and more the smaller they get, per share of their size given up. */
        labels: 0.3,
        labelsPerShare: 0.6,
        /** Key names held narrower still. */
        namesNarrow: 0.05,
        /** The headline and deck one size down. */
        title: 0.5,
        /** One key moved to another edge, the others where they stand. */
        keyMoved: 0.6,
        /** Keys moved to an edge their house does not set them on. */
        keysOtherEdge: 0.75,
        /** The headline and deck two sizes down. */
        titleDeep: 1,
        /** A smaller plot: this, and more the smaller it gets, per share of its size given up. */
        plot: 1,
        plotPerShare: 3,
    },
    /**
     * What a fit's result still costs in reading — how near its shape, its balance and its scale
     * stand to their limits, from 0 to 1 — weighed against its edit. No more than the smallest step
     * between two kinds of edit, so it chooses among edits alike, never a larger edit over a gentler one.
     */
    reading: 0.1,
    /** Where keys stand, and how several share an edge. */
    keys: {
        /** A key moved off its preferred edge, to the left, or to an edge its house did not rank. */
        otherEdge: 0.25,
        leftEdge: 0.45,
        unrankedEdge: 0.75,
        /**
         * A key's title set against the house's stated position. Where the house states none, either
         * seat costs nothing: the title stays on its entries' line where the row holds it, a line saved.
         */
        offSeat: 0.3,
        quietInlineTop: 0,
        /**
         * A row of keys where some titles stand above and others do not: one key reads as wrapped
         * and the other not, so a row seats its titles alike, or the keys stack.
         */
        mixedSeats: 1.2,
        /**
         * Several keys too wide to stand at the house's anchor, which moves them (`keys-anchor-moved`).
         * Less than a key moved to another edge: keys standing apart are worse than a moved anchor.
         */
        offAnchor: 0.2,
        /** Keys standing against the house's stated arrangement. */
        offArrangement: 0.6,
        /** Each extra row of keys above or below the plot, where the house did not ask for a stack. */
        stackedRow: 0.5,
        /** Each edge beyond the first that holds keys: keys split across edges are read in two places. */
        extraEdge: 0.3,
        /** Keys running past their edge's budget, per share past it: across the plot, beside it. */
        overflowAcross: 20,
        overflowBeside: 4,
        /** The share of its edge's budget the keys take. */
        edgeShare: 0.15,
    },
    /** How a key's entries are set: their columns, widths and line breaks. */
    keyEntries: {
        /** Entries running past their budget, per share past it: in height; in width across the plot, beside it. */
        overflowHeight: 10,
        overflowAcross: 10,
        overflowBeside: 2,
        /** The share of the room the entries' width takes: across the plot, beside it. */
        widthAcross: 0.12,
        widthBeside: 1,
        /** A name broken onto a second line, and each line past the second, on average over the names. */
        wrapped: 0.6,
        extraLine: 1.4,
        /** How unevenly the names fill their columns. */
        imbalance: 0.25,
        /** The share of a name cut, on average, and any cut at all. */
        cut: 4,
        anyCut: 0.25,
        /** The share of the height budget a row of entries takes above or below the plot. */
        rowHeight: 0.6,
        /** Each column, so the fewest that hold win a tie. */
        column: 0.005,
    },
} as const;

/** The width, in px, at or under which key names count as held narrower still. */
export const NARROW_KEY_NAMES = 120;
