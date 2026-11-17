// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * The air around a chart's keys and within its header, in em of the keys' type — so it keeps its
 * proportion to the text it separates — eased with the plot's size, so a small tile packs a little
 * closer and a large chart breathes a little more, rather than a fixed 18 px that is nothing on a
 * large chart and a key row's worth on a small one.
 *
 * The header — the headline, its deck and any keys above the plot — is grouped by its gaps: keys one
 * above another stand closest, as one group; the title block stands clearly further over them than
 * its deck's own leading, so the keys do not read as another line of it; and the block stands
 * further again from the plot — the theme's title gap, held between a little more and a few times
 * the title's gap to the keys, so the header neither runs into the plot nor floats off it. A key
 * with no title above it keeps its own gap to the plot. A theme sets any of them (`legend.gaps`),
 * and what it sets stands as set.
 */

export type Density = 'compact' | 'normal' | 'airy';

/** The gaps a theme may set, in em of the keys' labels. */
export interface KeyGapSpec {
    /** The title block to keys standing under it. */
    title?: number;
    /** Between keys one above another. */
    stack?: number;
    /** Between keys side by side. */
    row?: number;
    /** A key to the plot. */
    plot?: number;
}

/** Between keys one above another: the closest gap in the header, in em. */
export const KEY_STACK_GAP_EM = 0.6;
/** The title block to keys under it: clearly more than a deck's leading, in em. */
export const HEADER_TITLE_GAP_EM = 1;
/** The header block to the plot, as a multiple of the title's gap to the keys: never less, never far more. */
export const HEADER_PLOT_GAP = { least: 1.25, most: 2.5 };
/**
 * Between keys side by side, and keys one above another beside the plot: wide enough to tell one key
 * from the next, about twice the air between two entries of one key, in em.
 */
export const KEY_ROW_GAP_EM = 2.25;
/** A key's gap to the plot, in em of its labels, by the house's density. */
export const KEY_GAP_EM: Record<Density, number> = { compact: 0.8, normal: 1, airy: 1.4 };

/**
 * How the gaps ease with the plot's shorter side: smoothly from 0.7 on a small tile to 1.3 on a large
 * chart, at their stated em at 300 px — no step at any size.
 */
const EASE = { from: 100, to: 500, least: 0.7, most: 1.3 };
/** The least gap, in px, at any size: between keys, the title to keys, and anything to the plot. A gap a theme sets keeps only the first. */
const GAP_FLOOR = 4;
const TITLE_GAP_FLOOR = 7;
const PLOT_GAP_FLOOR = 8;

export function gapEase(plotSide: number | undefined): number {
    if (!plotSide || !Number.isFinite(plotSide)) return 1;
    const t = Math.min(1, Math.max(0, (plotSide - EASE.from) / (EASE.to - EASE.from)));
    return EASE.least + (EASE.most - EASE.least) * t * t * (3 - 2 * t);
}

/** A gap in px: so many em of the labels, eased with the plot, and scaled with a squeezed canvas (`scale`, 1 at the house's room or more). */
export function gapPx(em: number, labelFontSize: number, plotSide?: number, floor = GAP_FLOOR, scale = 1): number {
    return Math.max(floor, Math.round(em * labelFontSize * gapEase(plotSide) * scale));
}

/**
 * The title block's gap to what stands under it where no keys stand between: the house's gap, at
 * its room or more as set, on a smaller canvas by the share of the room it has, never under the gap
 * anything keeps to the plot.
 */
export function titleGapPx(gap: number, scale = 1): number {
    return scale >= 1 ? gap : Math.max(Math.min(gap, PLOT_GAP_FLOOR), Math.round(gap * scale));
}

/** The gap between keys one above another. */
export function keyStackGap(labelFontSize: number, plotSide?: number, spec?: KeyGapSpec, scale = 1): number {
    return gapPx(spec?.stack ?? KEY_STACK_GAP_EM, labelFontSize, plotSide, GAP_FLOOR, scale);
}

/** The gap between keys side by side. */
export function keyRowGap(labelFontSize: number, plotSide?: number, spec?: KeyGapSpec, scale = 1): number {
    return gapPx(spec?.row ?? KEY_ROW_GAP_EM, labelFontSize, plotSide, GAP_FLOOR, scale);
}

/** The gap from a key to the plot. */
export function keyGap(labelFontSize: number, density: Density = 'normal', plotSide?: number, spec?: KeyGapSpec, scale = 1): number {
    return gapPx(spec?.plot ?? KEY_GAP_EM[density], labelFontSize, plotSide, spec?.plot !== undefined ? GAP_FLOOR : PLOT_GAP_FLOOR, scale);
}

/** The gap between the title block and keys standing under it. */
export function headerInnerGap(labelFontSize: number, plotSide?: number, spec?: KeyGapSpec, scale = 1): number {
    return gapPx(spec?.title ?? HEADER_TITLE_GAP_EM, labelFontSize, plotSide, spec?.title !== undefined ? GAP_FLOOR : TITLE_GAP_FLOOR, scale);
}

/**
 * The gaps the keys stand at, per edge, and the title's gap to keys under it: the key gap at every
 * edge, but where a title stands over keys above the plot, the title's own gap moves below them —
 * the block's one gap to the plot, eased as the others are and held to its share of the title's gap
 * to the keys — and the title stands its own gap over the keys.
 * `atLeast` holds an edge clear of something drawn there (a flat y title under a top key).
 */
export function keyGaps(input: {
    labelFontSize: number;
    density?: Density;
    /** The plot's shorter side, which the gaps ease with. */
    plotSide?: number;
    spec?: KeyGapSpec;
    /** Whether a title stands above the plot. */
    titled: boolean;
    /** Whether keys stand above the plot. */
    topKeys: boolean;
    /** The title's gap to what is under it, as the theme sets it. */
    titleGap: number;
    /** The share of the house's room a squeezed canvas has, which every gap is scaled by; 1 leaves them as set. */
    scale?: number;
    atLeast?: Partial<Record<string, number>>;
}): { offsets: Record<'left' | 'right' | 'top' | 'bottom', number>; headerGap?: number } {
    const scale = input.scale ?? 1;
    const gap = keyGap(input.labelFontSize, input.density, input.plotSide, input.spec, scale);
    const header = input.titled && input.topKeys;
    const headerGap = header ? headerInnerGap(input.labelFontSize, input.plotSide, input.spec, scale) : undefined;
    const below = headerGap === undefined ? gap
        : input.spec?.plot !== undefined ? gap
            : Math.max(PLOT_GAP_FLOOR, Math.round(Math.min(HEADER_PLOT_GAP.most * headerGap,
                Math.max(HEADER_PLOT_GAP.least * headerGap, input.titleGap * gapEase(input.plotSide) * scale))));
    const offsets = { left: gap, right: gap, bottom: gap, top: below };
    for (const [edge, least] of Object.entries(input.atLeast ?? {})) {
        if (least !== undefined && edge in offsets) offsets[edge as keyof typeof offsets] = Math.max(offsets[edge as keyof typeof offsets], least);
    }
    return { offsets, ...(headerGap !== undefined ? { headerGap } : {}) };
}
