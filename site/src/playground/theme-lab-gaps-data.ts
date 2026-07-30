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
    // Populated as the coverage round finds cases too particular to generalise
    // from. Kept deliberately empty until then — a gap is a finding, not a
    // placeholder.
];
