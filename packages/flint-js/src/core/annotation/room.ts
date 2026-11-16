// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { NOTE_WRAP_WIDTHS, SHORT_NOTE, balanceNote, noteSize, noteStyle, type ChartTextStyle } from './style';

/** The placer's nearest direct seat over a bar's value, in font sizes, and the leader's gap at the caption, in px. */
const NEAREST_REACH = 0.9;
const PORT_GAP = 2.5;

/**
 * Room a chart makes for the notes it is drawn with. A caption at a mark on the edge of the plot —
 * the tallest bar, the highest point — has nowhere to stand at the mark's end, so it stands off
 * with a leader or over a neighbour. The chart can make that room instead: its measure axis runs on
 * past the noted value, to a round tick, far enough for the caption. Bars keep their proportions,
 * since every bar is read from the same baseline; the plot only gives a share of its length to the
 * caption, and never more than `maxShare` (a third) of it.
 */

/**
 * The px a note needs past the top of its mark: its caption's height at the widest house wrap, as the
 * overlay prefers it, and the nearest of the placer's direct seats over a bar's value:
 * 0.9 of a font size past the face, plus the leader's gap at the caption. No more: room past what
 * the caption stands in is empty plot.
 */
export function noteRoomNeed(text: string, chart: ChartTextStyle, measureAt: (fontSize: number) => (text: string) => number): number {
    return captionHeight(text, chart, measureAt) + noteStyle(chart).fontSize * NEAREST_REACH + PORT_GAP;
}

/** The caption's height at the widest house wrap, which the overlays prefer. */
function captionHeight(text: string, chart: ChartTextStyle, measureAt: (fontSize: number) => (text: string) => number): number {
    const style = noteStyle(chart);
    const measure = measureAt(style.fontSize);
    const short = text.length <= SHORT_NOTE && !text.includes('\n');
    // The overlay prefers the fewest lines that fit, so the room is for the widest house wrap.
    const lines = balanceNote(text, short ? Infinity : NOTE_WRAP_WIDTHS[0], measure);
    return noteSize(lines, style, measure).height;
}

/** The caption's inset from the plot's top at the region placer's highest seat, and its air over the marks beneath. */
const REGION_INSET = 4;
const REGION_AIR = 8;

/**
 * The px a period's caption needs over the marks in its stretch: its height, as the overlay lays it,
 * at the placer's highest seat in the stretch (just inside the plot's top) with air beneath it, so
 * it reads over the stretch rather than over the marks.
 */
export function regionRoomNeed(text: string, chart: ChartTextStyle, measureAt: (fontSize: number) => (text: string) => number): number {
    return REGION_INSET + captionHeight(text, chart, measureAt) + REGION_AIR;
}

/**
 * The domain end that leaves `need` px between `value` and that end of an axis `length` px long, or
 * undefined where the room is already there or would take more than `maxShare` of the axis. With the
 * other end held at `fixed`, a share `s = need / length` of the axis past `value` puts the end at
 * `(value − s·fixed) / (1 − s)`.
 */
export function roomPast(
    value: number,
    domain: readonly [number, number],
    length: number,
    need: number,
    end: 'max' | 'min',
    maxShare = 1 / 3,
): number | undefined {
    const [lo, hi] = domain;
    const span = hi - lo;
    if (!(span > 0) || !(length > 0) || !(need > 0)) return undefined;
    const room = end === 'max' ? ((hi - value) / span) * length : ((value - lo) / span) * length;
    if (room >= need) return undefined;
    const share = need / length;
    if (share > maxShare) return undefined;
    return end === 'max' ? (value - share * lo) / (1 - share) : (value - share * hi) / (1 - share);
}
