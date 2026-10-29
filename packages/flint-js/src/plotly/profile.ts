// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * How Plotly (2.35) sets the furniture the layout plans, read off its source
 * (`src/components/legend/draw.js`, `constants.js`; `svg_text_utils` line spacing).
 */

import type { BackendProfile } from '../core/backend-profile';

/**
 * The family Plotly's text is measured in: its default stack (`"Open Sans", verdana, arial`) draws in
 * Verdana wherever Open Sans is not installed or loaded, and Verdana runs the wider of the two.
 */
export const PLOTLY_FONT = 'Verdana, sans-serif';

/** Plotly's `constants.itemGap`: the gap around a key's symbol, between entries and inside its box. */
const ITEM_GAP = 5;
/** Plotly's default `legend.itemwidth`: the room a symbol is drawn in. */
const ITEM_WIDTH = 30;
/** How much wider Plotly's measured text box runs than the width table's advance, in px (2–3 seen). */
const TEXT_BOX_SLACK = 3;
/** `svg_text_utils.LINE_SPACING`. */
const LINE_SPACING = 1.3;

/** Gap between tick labels and the axis line (`ticklabelstandoff`), wider than Plotly's own ~2 px. */
export const TICK_LABEL_STANDOFF = 7;
/** Gap between an axis's tick labels and its title (`title.standoff`). */
export const AXIS_TITLE_STANDOFF = 16;

export const PLOTLY_PROFILE: BackendProfile = {
    id: 'plotly',
    font: PLOTLY_FONT,
    key: {
        // An entry's text starts past its symbol's room and a gap either side of it; Plotly sizes the
        // entry by its text's drawn box, a little wider than its advance.
        lead: ITEM_WIDTH + 2 * ITEM_GAP + TEXT_BOX_SLACK,
        symbol: 16,
        gap: ITEM_GAP,
        rowGap: 0,
        // `endPad`: the box keeps a gap at its top and bottom; along a row only the gap after each entry.
        pad: { x: 0, y: ITEM_GAP },
        // An entry stands its lines' height, at least 16 px, and 3 px more.
        entryHeight: (fontSize, lines) => Math.max(fontSize * LINE_SPACING * lines, 16) + 3,
        lineHeight: LINE_SPACING,
        // Plotly sets a row that will not hold every entry as a grid at the widest entry's width; the
        // frame sets each entry in a group of its own (`plFlowRowKey`), so rows flow, each entry its own width.
        wrap: 'flow',
        // Each group steps on by its width and the gap after it, and a row breaks once that would pass the room.
        breakAt: 'overWithGap',
        // A horizontal key's title stands at the start of its rows (`title.side: 'left'`), 10 px before them.
        rowTitle: 'start',
        titleGap: 2 * ITEM_GAP,
        titleRowGap: 0,
        // A key beside the plot never wraps into columns: it scrolls.
        sideColumns: 'one',
    },
    edge: 8,
    tickLabelGap: TICK_LABEL_STANDOFF,
    axisTitleGap: AXIS_TITLE_STANDOFF,
    labelLineHeight: LINE_SPACING,
    // Plotly's automargin keeps 11 px past an axis's labels; a label's box is 1.2 em tall.
    labelBoxHeight: 1.2,
    axisPad: 11,
};
