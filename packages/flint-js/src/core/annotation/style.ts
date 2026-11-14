// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { neutralInk } from './color';

/**
 * How a note that names a mark is set: as words beside the mark, not a card over the chart. The
 * words take the chart's own label face and weight (its axis labels', not its title's) a size up,
 * in the primary text ink, with a halo of the background behind the glyphs so they read over
 * gridlines and marks; a leader, where one is drawn, is a thin line of the neutral grey.
 */
export interface NoteStyle {
    font: string;
    fontSize: number;
    fontWeight: number | string;
    color: string;
    /** Distance between baselines, in px. */
    lineHeight: number;
    /** Clear room the halo takes round the glyphs, in px; the caption's box includes it. */
    padding: number;
    halo: { color: string; width: number };
    leader: { color: string; width: number };
}

/** What the chart says about its own text, read from its axis labels and background. */
export interface ChartTextStyle {
    font?: string;
    fontSize?: number;
    fontWeight?: number | string;
    color?: string;
    background?: string;
}

/** A note this short, on one line, is set on one line; a longer one wraps at one of these widths, in px. */
export const SHORT_NOTE = 18;
export const NOTE_WRAP_WIDTHS = [180, 140] as const;
/** What each line past the first costs a placement: one line reads best where it fits as well. */
export const NOTE_LINE_COST = 15;

/**
 * The widths a note may be wrapped to, in px at the measure's size: one line for a short note;
 * else the house widths and, where the note runs to several words, about half its one-line width,
 * so a caption too wide for the gap beside its mark can stand there in two even lines.
 */
export function noteWrapWidths(text: string, measure: (text: string) => number): number[] {
    if (text.length <= SHORT_NOTE && !text.includes('\n')) return [Infinity];
    const words = text.split(/\s+/).filter(Boolean);
    const widths: number[] = [...NOTE_WRAP_WIDTHS];
    if (words.length > 1 && !text.includes('\n')) {
        const half = Math.max(Math.ceil(measure(text) * 0.55), ...words.map((word) => Math.ceil(measure(word))));
        if (widths.every((width) => Math.abs(width - half) > 8)) widths.push(half);
    }
    return widths;
}

/** What the house says of its notes: its `type.annotation` role, and the primary text ink. */
export interface NoteDesign {
    text?: { font?: string; fontSize?: number; fontWeight?: number | string; color?: string };
    ink?: string;
}

const WEIGHT_NAMES: Record<string, number> = { normal: 400, bold: 700 };

/**
 * How a note is set. A note is read beside the chart's own labels, so it keeps their face and
 * weight and is set apart by size (one up) and ink (the page's primary text ink, darker than the
 * labels' secondary grey), with a halo of the page under it. Hue is left to the data. A house's
 * `type.annotation` role, and then a note's own `style`, say otherwise where they say anything.
 */
export function noteStyle(chart: ChartTextStyle = {}, design: NoteDesign = {}): NoteStyle {
    const stated = design.text ?? {};
    const fontSize = stated.fontSize ?? Math.min(13, Math.max(10, Math.round((chart.fontSize ?? 10) + 1)));
    const labelWeight = typeof chart.fontWeight === 'number' ? chart.fontWeight : WEIGHT_NAMES[String(chart.fontWeight ?? 'normal')] ?? 400;
    const fontWeight = stated.fontWeight ?? labelWeight;
    const fallback = chart.color && chart.color !== '#000' && chart.color !== '#000000' ? chart.color : '#333333';
    const color = stated.color ?? design.ink ?? fallback;
    const background = chart.background && chart.background !== 'transparent' ? chart.background : '#ffffff';
    return {
        font: stated.font ?? chart.font ?? 'sans-serif',
        fontSize,
        fontWeight,
        color,
        lineHeight: Math.round(fontSize * 1.25),
        padding: 2,
        halo: { color: background, width: 3 },
        leader: { color: neutralInk(background), width: 1 },
    };
}

/**
 * The caption's lines at the most `maxWidth` px each, broken between words; a hard line break in the
 * text is kept. A word wider than the line stands alone on its own.
 */
export function wrapNote(text: string, maxWidth: number, measure: (text: string) => number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
        let line = '';
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            const next = line ? `${line} ${word}` : word;
            if (line && measure(next) > maxWidth) {
                lines.push(line);
                line = word;
            } else line = next;
        }
        lines.push(line);
    }
    return lines;
}

/** A line that ends a phrase — at a colon, a comma, a dash, a middle dot — breaks there at no cost. */
const PHRASE_END = /[:;,.!?—–·|-]$/;

/**
 * The caption's lines as {@link wrapNote} counts them, broken evenly instead of greedily: no line
 * wider than `maxWidth`, the lines as near one width as the words allow, and a break after a
 * phrase's end preferred to one inside it — `ford galaxie 500:` over `most power`, not `ford
 * galaxie 500: most` over a lone `power`. Each paragraph is broken on its own, into as many lines
 * as greedy wrapping gives it, by a small dynamic programme over its words.
 */
export function balanceNote(text: string, maxWidth: number, measure: (text: string) => number): string[] {
    if (!Number.isFinite(maxWidth)) return wrapNote(text, maxWidth, measure);
    return text.split('\n').flatMap((paragraph) => {
        const words = paragraph.split(/\s+/).filter(Boolean);
        const count = wrapNote(paragraph, maxWidth, measure).length;
        if (count < 2 || words.length <= count) return wrapNote(paragraph, maxWidth, measure);
        const widths = new Map<string, number>();
        const width = (from: number, to: number): number => {
            const key = `${from}:${to}`;
            let measured = widths.get(key);
            if (measured === undefined) widths.set(key, measured = measure(words.slice(from, to).join(' ')));
            return measured;
        };
        const target = width(0, words.length) / count;
        // A break inside a phrase costs as much as a line two fifths off the even width.
        const inside = (0.4 * target) ** 2;
        // cost[k][j]: the least cost of the first j words in k lines; from[k][j] where the last of them starts.
        const cost = Array.from({ length: count + 1 }, () => new Array<number>(words.length + 1).fill(Infinity));
        const from = Array.from({ length: count + 1 }, () => new Array<number>(words.length + 1).fill(0));
        cost[0][0] = 0;
        for (let k = 1; k <= count; k++) {
            for (let j = k; j <= words.length; j++) {
                for (let i = k - 1; i < j; i++) {
                    if (cost[k - 1][i] === Infinity) continue;
                    const w = width(i, j);
                    if (w > maxWidth && j - i > 1) continue;
                    const breakCost = j < words.length && !PHRASE_END.test(words[j - 1]) ? inside : 0;
                    const total = cost[k - 1][i] + (w - target) ** 2 + breakCost;
                    if (total < cost[k][j]) {
                        cost[k][j] = total;
                        from[k][j] = i;
                    }
                }
            }
        }
        if (cost[count][words.length] === Infinity) return wrapNote(paragraph, maxWidth, measure);
        const lines: string[] = [];
        for (let k = count, j = words.length; k > 0; k--) {
            const i = from[k][j];
            lines.unshift(words.slice(i, j).join(' '));
            j = i;
        }
        return lines;
    });
}

/** The caption's box size for its lines, the halo's room included. */
export function noteSize(lines: readonly string[], style: NoteStyle, measure: (text: string) => number): { width: number; height: number } {
    const width = Math.max(0, ...lines.map(measure));
    return {
        width: Math.ceil(width) + style.padding * 2,
        height: Math.ceil(style.fontSize + (lines.length - 1) * style.lineHeight + style.fontSize * 0.25) + style.padding * 2,
    };
}
