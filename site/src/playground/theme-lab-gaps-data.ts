// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Round-2 gaps: cases parked for inspection.
 *
 * The coverage round's rule (doc 05 §3) is that a fix must generalise: a change
 * that only helps one chart is not a fix, it is a gap. Such cases are not left
 * silently broken and they are not papered over with a per-chart hack — they
 * are named here, with the reason they resist a general rule, so a human can
 * look and decide whether the schema should grow to meet them.
 *
 * A gap references an R2 case by `id` (see `theme-lab-r2-data.ts`). `theme`
 * names the column the problem shows in, or is omitted when it is the shape of
 * the case itself, across houses, that is the gap.
 */

export interface GapNote {
    /** R2 case id the gap is about. */
    id: string;
    /** The column it shows in, if it is house-specific. */
    theme?: string;
    /** One line: what is wrong, and why it will not generalise. */
    note: string;
}

export const GAP_NOTES: GapNote[] = [
    {
        id: 'scatter-color-n50',
        note:
            'Fifty nominal series on colour. No house owns fifty distinct inks, so the '
            + 'colours cycle and the key stops being a key — the probe\'s own point. Two '
            + 'things go wrong and neither has a fix that stays general at this size: the '
            + 'palette overflows (colours repeat, so the legend cannot name a point by its '
            + 'ink), and the houses that prefer a top legend (nyt, economist) lay all fifty '
            + 'items in one row, blowing the width out and crushing the plot into a corner. '
            + 'A real fix is a legend that wraps or falls back by measured width, and a '
            + 'policy for "more series than inks" (suppress-and-note, or roll up to top-N + '
            + 'other) — both larger than a coverage-round patch, and easy to get wrong blind. '
            + 'Parked for a human to decide how far the schema should grow.',
    },
    {
        id: 'pie-25',
        note:
            'Twenty-five slices — a pie past legibility by construction (its probe). The '
            + 'label smear is now fixed (Iteration 2 suppresses always-labels past the marks '
            + 'floor), but the palette still overflows: past ~24 categories the qualitative '
            + 'inks exhaust and the tail of slices falls back to grey. Inherent to a '
            + '25-slice pie; the honest answer is "do not draw this pie", which no theme '
            + 'rule can assert for the author. Parked as the reference case for palette '
            + 'exhaustion on part-to-whole.',
    },
];
