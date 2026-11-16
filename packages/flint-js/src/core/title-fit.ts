// A title fitted to the block it sits over: set down a size, or broken over full lines with the
// height taken out of the plot. Shared by the plan and by theme realization.

/** Roughly how wide a glyph runs, as a fraction of the font size. */
const HEADLINE_CHAR_RATIO = 0.55;

/** How far the headline may be set down before it is broken instead. */
const MIN_HEADLINE_SCALE = 0.82;

const CJK_RE = /[\u3000-\u303F\u3400-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;

/** The width of a string in px at a font size, in the font the text is set in. */
export type TitleMeasure = (text: string, fontSize: number) => number;

/** Width of a string in pixels, counting a CJK glyph as a full em. */
export function textPx(s: string, fontSize: number): number {
    let em = 0;
    for (const ch of s) em += CJK_RE.test(ch) ? 1 : HEADLINE_CHAR_RATIO;
    return em * fontSize;
}

/**
 * Break a title into `count` lines as full as the words allow: none wider than `block`, and the last
 * no shorter than `shortest`. Every line but the last is charged its squared room left on the block,
 * so the room a short last line needs is taken across the lines above it, not from one of them.
 * Undefined where no such breaks exist.
 */
export function fullestLines(
    text: string, count: number, block: number, shortest: number, fontSize: number, measure: TitleMeasure,
): string[] | undefined {
    const words = text.split(/\s+/).filter(Boolean);
    const n = words.length;
    if (count < 1 || count > n) return undefined;
    const widths = new Map<string, number>();
    const widthOf = (from: number, to: number): number => {
        const key = `${from}:${to}`;
        let width = widths.get(key);
        if (width === undefined) widths.set(key, width = measure(words.slice(from, to).join(' '), fontSize));
        return width;
    };
    // cost[k][j]: the least room left by the first j words over k lines; from[k][j]: where the k-th line starts.
    const cost = Array.from({ length: count + 1 }, () => new Array<number>(n + 1).fill(Infinity));
    const from = Array.from({ length: count + 1 }, () => new Array<number>(n + 1).fill(-1));
    cost[0][0] = 0;
    for (let k = 1; k <= count; k++) {
        const last = k === count;
        for (let j = last ? n : k; j <= n - (count - k); j++) {
            for (let i = k - 1; i < j; i++) {
                if (cost[k - 1][i] === Infinity) continue;
                const width = widthOf(i, j);
                if (width > block || (last && width < shortest)) continue;
                const c = cost[k - 1][i] + (last ? 0 : (block - width) ** 2);
                if (c < cost[k][j]) { cost[k][j] = c; from[k][j] = i; }
            }
        }
    }
    if (cost[count][n] === Infinity) return undefined;
    const out: string[] = [];
    for (let k = count, j = n; k > 0; j = from[k][j], k--) out.unshift(words.slice(from[k][j], j).join(' '));
    return out;
}

/**
 * Break a title to its block: each line filled to the block, as a headline is set, the words that
 * do not fit falling to the next. Where that leaves a widow — a last line under a third of the
 * block — the same number of lines is broken again as full as they can be with no widow, so the
 * block keeps its full measure and only the lines near the end give up room.
 */
export function filledLines(text: string, block: number, fontSize: number, measure: TitleMeasure): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= 1) return [text];
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && measure(candidate, fontSize) > block) {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    }
    if (line) lines.push(line);
    const shortest = block * WIDOW_SHARE;
    if (lines.length >= 2 && measure(lines[lines.length - 1], fontSize) < shortest) {
        return fullestLines(text, lines.length, block, shortest, fontSize, measure) ?? lines;
    }
    return lines;
}

/** A last line shorter than this share of the block is a widow. */
const WIDOW_SHARE = 1 / 3;

/** The width inside the canvas the caller asked for, once the theme's padding is kept on both sides. */
export function canvasContentWidth(layout: { canvasWidth?: number; padding?: number }): number {
    return layout.canvasWidth ? Math.max(0, layout.canvasWidth - 2 * (layout.padding ?? 0)) : 0;
}

/** The shortest a plot may be squeezed to make room for a taller headline. */
const MIN_PLOT_HEIGHT = 80;

/** A plot's height once a title takes `px` from it, never below the shortest a plot may be. */
export function plotHeightAfter(height: number, px: number): number {
    return Math.max(MIN_PLOT_HEIGHT, height - px);
}

/**
 * Fit a headline that runs wider than its block: set down a size where that brings it onto one line;
 * else broken, each line filled to the block (no widow), at its own size — shrinking it and
 * breaking it too pays twice — unless a size down saves a line. The extra lines' height comes out of
 * the plot. Undefined leaves it.
 */
export function fitHeadlineText(
    text: string, block: number, fontSize: number, deckFontSize: number, measure: TitleMeasure,
): { smaller: number; fontSize?: number; lines?: string[]; taken: number } | undefined {
    if (measure(text, fontSize) <= block) return undefined;
    const smaller = Math.max(Math.round(fontSize * MIN_HEADLINE_SCALE), deckFontSize + 1);
    if (smaller < fontSize && measure(text, smaller) <= block) return { smaller, fontSize: smaller, taken: 0 };
    // Broken at its own size, unless a size down saves a line: then both, for the shorter block.
    const own = filledLines(text, block, fontSize, measure);
    const down = smaller < fontSize ? filledLines(text, block, smaller, measure) : own;
    const size = down.length < own.length ? smaller : fontSize;
    const lines = size === fontSize ? own : down;
    if (lines.length < 2) return undefined;
    return { smaller, ...(size < fontSize ? { fontSize: size } : {}), lines, taken: Math.round((lines.length - 1) * size * 1.3) };
}

/**
 * Break a deck that runs wider than its block, each line filled to the block (no widow);
 * it is never set smaller. The extra lines' height comes out of the plot. Undefined leaves it.
 */
export function fitDeckText(
    text: string, block: number, fontSize: number, measure: TitleMeasure,
): { lines: string[]; taken: number } | undefined {
    if (measure(text, fontSize) <= block) return undefined;
    const lines = filledLines(text, block, fontSize, measure);
    if (lines.length < 2) return undefined;
    return { lines, taken: Math.round((lines.length - 1) * fontSize * 1.3) };
}

/** How a theme's headline and deck measure, in the font and weight each is set in. */
export function titleMeasures(
    title: { headline: { font?: string; fontWeight?: string | number }; deck: { font?: string; fontWeight?: string | number } },
    bodyFont: string | undefined,
    measureText: (fontSize: number, font: string, weight: string | number, style: string) => (text: string) => number,
): { headline: TitleMeasure; deck: TitleMeasure } {
    const of = (font: string | undefined, weight: string | number): TitleMeasure =>
        (text, fontSize) => measureText(fontSize, font ?? bodyFont ?? 'sans-serif', weight, 'normal')(text);
    return {
        headline: of(title.headline.font, title.headline.fontWeight ?? 700),
        deck: of(title.deck.font, title.deck.fontWeight ?? 'normal'),
    };
}
