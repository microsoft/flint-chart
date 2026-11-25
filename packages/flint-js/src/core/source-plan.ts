/**
 * The source line (S1): where the chart's data comes from, drawn at the foot of the graphic in the
 * house's way. The chart gives the words (`chart_spec.source`); the theme gives the lead-in, the
 * side it sits on, a rule above it and a credit of its own. Like the header, its room comes out of
 * the plot so the canvas the caller asked for holds, and it is drawn on the canvas after render.
 *
 * Laid out bottom-up from the foot of the margin: the lines, then (above them) the rule.
 */
import type { TextMeasurer } from './legend-layout';
import type { DesignDecisions } from './theme/types';
import type { ChartCredit } from './types';
import { applyTextCase } from './text-case';

/** A run of text on a source line, in one weight and slope. */
export interface SourceRun {
    text: string;
    fontWeight?: 'normal' | 'bold' | number;
    fontStyle?: 'normal' | 'italic';
    /** px from the line's aligned edge to the run's near end (its left for `start`, its right for `end`). */
    offset: number;
    width: number;
}

export interface SourceLine {
    align: 'start' | 'end';
    runs: SourceRun[];
    /** px from the foot of the footer to the top of the line. */
    bottom: number;
    href?: string;
    /** Shown on hover: a disclaimer the line stands for. */
    title?: string;
    /** A line set smaller than the source (a map's credit): its own size and line height, in px. */
    fontSize?: number;
    lineHeight?: number;
}

export interface SourcePlan {
    /** px the footer takes: the gap, the rule and the lines. */
    room: number;
    /** The plot was sized with the footer's room already kept, so it gives none up. */
    reserved?: boolean;
    lines: SourceLine[];
    /** The credit's logo at the other end, level with the first line: px from the foot to its bottom. */
    creditImage?: { src: string; alt: string; width: number; height: number; bottom: number; align: 'start' | 'end' };
    rule?: { bottom: number; width: number; color: string; dash?: number[] };
    frame: 'content' | 'canvas';
    font?: string;
    fontSize: number;
    color?: string;
    lineHeight: number;
}

export interface SourceInputs {
    design: DesignDecisions;
    source: string | { text: string; href?: string } | undefined;
    /** The width the line may run: the title block's. */
    block: number;
    measure: TextMeasurer;
    /**
     * The credit the chart's own drawing owes, as a map owes the boundaries it draws: a line of its
     * own closing the foot, at its start, drawn whether or not the chart gives a source or the house draws it.
     */
    credit?: ChartCredit;
}

/** A credit the chart's drawing owes is set at this share of the source's size, and never under the floor (px). */
const CREDIT_SCALE = 0.8;
const CREDIT_MIN_SIZE = 9;

/** The space between words (and between runs of different weight), in em. */
const WORD_SPACE = 0.25;

/**
 * The source's words without a lead-in the author already wrote: "Source: Gapminder" under a house that
 * leads with "Source:" reads "Gapminder", so the line does not say it twice.
 */
export function withoutLeadIn(words: string | undefined, leadIn: string | undefined): string | undefined {
    const lead = leadIn?.trim().replace(/[\s:：]+$/, '');
    if (!words || !lead) return words;
    const escaped = lead.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rest = words.replace(new RegExp(`^${escaped}s?\\s*[:：]\\s*`, 'i'), '');
    return rest || words;
}

/** The source line a chart draws, or undefined when it gives no source or the house draws none. */
export function planSource(inputs: SourceInputs): SourcePlan | undefined {
    const { design, block, measure } = inputs;
    const s = design.source;
    const given = typeof inputs.source === 'string' ? { text: inputs.source } : inputs.source;
    const words = s.show ? withoutLeadIn(given?.text?.trim(), s.leadIn) : undefined;
    const owed = inputs.credit?.text.trim() ? inputs.credit : undefined;
    if (!words && !owed) return undefined;
    const t = s.text;
    const fontSize = t.fontSize ?? 10;
    const font = t.font ?? design.font ?? 'sans-serif';
    const widthAt = (size: number) => (text: string, weight?: SourceRun['fontWeight'], style?: SourceRun['fontStyle']) =>
        measure(size, font, weight ?? t.fontWeight ?? 'normal', style ?? t.fontStyle ?? 'normal')(text);
    const widthOf = widthAt(fontSize);
    const space = fontSize * WORD_SPACE;
    const cased = (text: string) => (t.textCase ? applyTextCase(text, t.textCase) : text);

    // The tokens of the line in order: the lead-in, the source's words, an inline credit.
    type Token = { text: string; fontWeight?: SourceRun['fontWeight']; fontStyle?: SourceRun['fontStyle'] };
    const tokens: Token[] = [];
    if (words && s.leadIn) {
        const lead = s.leadInCase ? applyTextCase(s.leadIn, s.leadInCase) : s.leadIn;
        tokens.push({ text: lead, ...(s.leadInWeight !== undefined ? { fontWeight: s.leadInWeight } : {}), ...(s.leadInStyle ? { fontStyle: s.leadInStyle } : {}) });
    }
    if (words) for (const word of cased(words).split(/\s+/)) tokens.push({ text: word });
    // The house credits itself beside the chart's source only.
    const credit = words ? s.credit : undefined;
    if (credit?.placement === 'inline') {
        const sep = credit.separator.trim();
        if (sep) tokens.push({ text: sep });
        for (const word of credit.text.split(/\s+/)) tokens.push({ text: word, ...(credit.weight !== undefined ? { fontWeight: credit.weight } : {}) });
    }

    // The credit at the other end takes its width out of the first line.
    const endCredit = credit?.placement === 'end'
        ? { text: credit.text, width: credit.image ? credit.image.width : widthOf(credit.text, credit.weight), fontWeight: credit.weight }
        : undefined;
    const room = (line: number) => Math.max(fontSize * 6, block - (line === 0 && endCredit ? endCredit.width + fontSize * 1.5 : 0));

    // Words, greedily, into lines no wider than the block; runs merge words of one weight and slope.
    const wrap = (words: readonly Token[], width: (line: number) => number, measureWord = widthOf, gap = space): Token[][] => {
        const wrapped: Token[][] = [[]];
        let used = 0;
        for (const token of words) {
            const w = measureWord(token.text, token.fontWeight, token.fontStyle);
            const line = wrapped[wrapped.length - 1];
            if (line.length && used + gap + w > width(wrapped.length - 1)) {
                wrapped.push([token]);
                used = w;
            } else {
                used += (line.length ? gap : 0) + w;
                line.push(token);
            }
        }
        return wrapped;
    };
    const lines = wrap(tokens, room);
    const toRuns = (line: Token[], measureRun = widthOf): Array<Omit<SourceRun, 'offset'>> => {
        const runs: Array<Omit<SourceRun, 'offset'>> = [];
        for (const token of line) {
            const last = runs[runs.length - 1];
            if (last && last.fontWeight === token.fontWeight && last.fontStyle === token.fontStyle) last.text += ` ${token.text}`;
            else runs.push({ text: token.text, fontWeight: token.fontWeight, fontStyle: token.fontStyle, width: 0 });
        }
        for (const run of runs) run.width = measureRun(run.text, run.fontWeight, run.fontStyle);
        return runs;
    };
    const place = (runs: Array<Omit<SourceRun, 'offset'>>, align: 'start' | 'end', gap = space): SourceRun[] => {
        // Offsets run from the aligned edge inward: left to right for `start`, right to left for `end`.
        const ordered = align === 'start' ? runs : [...runs].reverse();
        let at = 0;
        const placed = ordered.map((run) => {
            const out = { ...run, offset: at } as SourceRun;
            at += run.width + gap;
            return out;
        });
        return align === 'start' ? placed : placed.reverse();
    };

    const lineHeight = Math.round(fontSize * 1.3);
    const built: SourceLine[] = lines.filter((line) => line.length).map((line) => ({
        align: s.align, runs: place(toRuns(line), s.align), bottom: 0,
        ...(given?.href ? { href: given.href } : {}),
    }));
    if (credit?.placement === 'nextLine') {
        built.push({ align: s.align, runs: place([{ text: credit.text, fontWeight: credit.weight, width: widthOf(credit.text, credit.weight) }], s.align), bottom: 0 });
    }
    // The owed credit closes the foot, at its start, as a map's attribution sits in its corner: set a
    // step below the source, as map attributions are, and never under 9 px.
    if (owed) {
        const size = Math.min(fontSize, Math.max(CREDIT_MIN_SIZE, Math.round(fontSize * CREDIT_SCALE)));
        const measureCredit = widthAt(size);
        const gap = size * WORD_SPACE;
        for (const line of wrap(owed.text.split(/\s+/).map((text) => ({ text })), () => Math.max(size * 6, block), measureCredit, gap)) {
            built.push({
                align: 'start', runs: place(toRuns(line, measureCredit), 'start', gap), bottom: 0,
                ...(owed.href ? { href: owed.href } : {}), ...(owed.title ? { title: owed.title } : {}),
                ...(size !== fontSize ? { fontSize: size, lineHeight: Math.round(size * 1.3) } : {}),
            });
        }
    }
    // Bottom-up: the last line sits on the foot of the footer, each line as tall as its own type.
    let stacked = 0;
    for (let i = built.length - 1; i >= 0; i--) {
        built[i].bottom = stacked;
        stacked += built[i].lineHeight ?? lineHeight;
    }
    const other = s.align === 'start' ? 'end' : 'start';
    let creditImage: SourcePlan['creditImage'];
    if (endCredit && credit?.image) {
        // The logo is centred on the first line; one taller than the lines rests on the foot.
        const img = credit.image;
        creditImage = { src: img.src, alt: credit.text, width: img.width, height: img.height, align: other, bottom: Math.max(0, built[0].bottom + (lineHeight - img.height) / 2) };
    } else if (endCredit) {
        built.push({ align: other, runs: [{ text: endCredit.text, fontWeight: endCredit.fontWeight, offset: 0, width: endCredit.width }], bottom: built[0].bottom });
    }
    const textHeight = Math.max(stacked, creditImage ? creditImage.bottom + creditImage.height : 0);
    const rule = s.rule ? { bottom: textHeight + 6, width: s.rule.width, color: s.rule.color, ...(s.rule.dash ? { dash: s.rule.dash } : {}) } : undefined;
    const total = Math.ceil(s.gap + textHeight + (rule ? rule.width + 6 : 0));
    return {
        room: total, lines: built, ...(rule ? { rule } : {}), ...(creditImage ? { creditImage } : {}), frame: s.frame,
        ...(t.font ?? design.font ? { font: t.font ?? design.font } : {}), fontSize, ...(t.color ? { color: t.color } : {}), lineHeight,
    };
}
