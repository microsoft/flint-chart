import { keyRowGap, keyStackGap, type KeyGapSpec } from './header-gaps';
import { applyTextCase, type TextCase } from './text-case';
import { LAYOUT_COSTS } from './layout-costs';

/** The gap between a key's title and its entries where the style states none, as Vega sets it. */
const TITLE_PADDING = 5;
/** The shortest a ramp beside the plot is drawn, in px and in lines of its labels. */
const GRADIENT_FLOOR = 60;
const GRADIENT_FLOOR_LINES = 5;
/** The gap between a key's inline title and its first entry, as a share of the gap between entries. */
const INLINE_TITLE_GAP = 1.5;

/** Measures text in px for a font: size, family, weight and style. */
export type TextMeasurer = (fontSize: number, font: string, weight: string | number, style: string) => (text: string) => number;

/** How a key is set, as the theme and the backend's defaults resolve it. */
export interface KeyStyle {
    labelFont: string;
    labelFontSize: number;
    labelFontWeight: string | number;
    labelFontStyle: string;
    titleFont: string;
    titleFontSize: number;
    titleFontWeight: string | number;
    titleFontStyle: string;
    /** The case the labels are drawn in, so they are measured and broken as drawn. */
    labelCase?: TextCase;
    symbolSize?: number;
    padding: number;
    rowPadding?: number;
    columnPadding?: number;
    labelOffset?: number;
    titlePadding?: number;
    gradientLength?: number;
    gradientThickness?: number;
    /** Stated by the template or author; a stated limit or format is left as written. */
    columns?: number;
    labelLimit?: number;
    titleLimit?: number;
    labelsStated?: boolean;
}

/** A key to lay out. */
export interface KeyToLayout {
    /** A colour ramp rather than a list of swatches. */
    gradient: boolean;
    /** A stepped ramp: its bins are drawn side by side as one bar, which never wraps onto rows. */
    bar?: boolean;
    /** The labels a key naming categories lists; wrapping only applies to these. */
    labels?: string[];
    /** What a key to values prints, for its width. */
    valueLabels?: string[];
    /** How many entries the key draws. */
    count: number;
    /** The title; null leaves the key untitled. */
    title: string | null;
    style: KeyStyle;
    /** The largest symbol a size key draws, in px². */
    largestSymbol?: number;
    /** The edge the key prefers. */
    orient: string;
    /** The other edges the key may take, best first, as the theme ranks them; unset leaves every edge open. */
    edges?: string[];
    /** Whether the edge is the author's, or not a side of the plot, so it stays. */
    fixed: boolean;
    /** The edge the layout holds the key to, off the one it prefers (a canvas-fit treatment); unset weighs every edge. */
    moveTo?: string;
    /** Whether the author set where the title sits. */
    fixedTitle: boolean;
    /** The direction and title seat the theme sets at the preferred edge. */
    direction?: string;
    titleOrient?: string;
    /** A direction and title seat stated on the key itself, which hold wherever it moves. */
    ownDirection?: string;
    ownTitleOrient?: string;
}

/** Where a key sits and how its text is set. */
export interface KeyLayout {
    orient: string;
    /** Whether the key moved off its preferred edge. */
    moved: boolean;
    /** Whether the title sits inline, left of the entries. */
    inlineTitle: boolean;
    /** The gap between an inline title and the first entry, in px. */
    titlePadding?: number;
    /** The length a ramp beside the plot is drawn at, where the plot is too short for its own. */
    gradientLength?: number;
    /** The thickness a ramp is drawn at, where the plan slims it for a small plot. */
    gradientThickness?: number;
    direction?: string;
    titleOrient?: string;
    columns?: number;
    labelFontSize: number;
    /** The width labels are cut to; 0 leaves them whole. */
    labelLimit: number;
    rowPadding: number;
    /** Labels broken over lines, where any breaks. */
    labelLines?: string[][];
    /** The title broken over lines, where it breaks. */
    titleLines?: string[];
    titleLineHeight?: number;
    /** The swatch area wrapped rows are aligned to, in px². */
    symbolSize?: number;
    /** Whether the key's labels were fitted; labels the author limits or formats are left as written. */
    labelsFitted: boolean;
    /** Whether the title was fitted; a title the author limits is left as written. */
    titleFitted: boolean;
    width: number;
    height: number;
}

/** How a theme asks its keys to stand; each holds unless the keys would overflow their edge. */
export interface KeyPreferences {
    /** Several keys above or below the plot: side by side, or one above another. */
    arrangement?: 'row' | 'stack';
    /** A key's title above its entries, or before them on their line, above or below the plot. */
    titlePosition?: 'above' | 'inline';
    /** Where keys stand along their edge: from its start, centred, at its end, or spread across it. */
    align?: 'start' | 'center' | 'end' | 'spread';
    /** The air between keys, as the theme sets it, in em of their labels (see `header-gaps`). */
    gaps?: KeyGapSpec;
    /** The share of the house's room a squeezed canvas has, which the gaps between keys are scaled by; unset is 1. */
    gapScale?: number;
    /** The widest a key beside the plot may run, in px; unset is 24 of its label size, plus its padding. */
    sideWidth?: number;
    /**
     * The drawing's width before and after the plot — its y labels and title — in px. A row of keys
     * above or below the plot, like the title, may run over them, and stands at its anchor where it
     * fits there, else the nearest anchor that keeps it within the drawing.
     */
    besidePlot?: { start: number; end: number };
}

export interface LegendLayoutPlan {
    keys: Array<KeyLayout | undefined>;
    /**
     * How keys stand at each edge that holds several, or that a theme aligns: stacked or side by
     * side, anchored at the edge's start, middle or end, this many px apart.
     */
    edges: Array<{ orient: string; direction: string; anchor: 'start' | 'middle' | 'end'; gap: number }>;
    /** The room the keys take at each edge they hold, in px. */
    footprint: Array<{ orient: string; width: number; height: number }>;
    overflow: Array<{ orient: string; width: number; height: number; widthBudget: number; heightBudget: number }>;
    plot: { width: number; height: number };
    /** The px the keys at each edge stand from the plot (see `header-gaps`); unset, the renderer's own. */
    offsets?: Record<'left' | 'right' | 'top' | 'bottom', number>;
    /** The px the title stands above keys standing over the plot: the header's inner gap. */
    headerGap?: number;
    /** Where a theme's preference gave way, and why. */
    notes: Array<{ path: string; code: string; message: string }>;
}

/** What placing and setting keys costs, on the planner's one scale (see {@link LAYOUT_COSTS}). */
const K = LAYOUT_COSTS.keys;
const E = LAYOUT_COSTS.keyEntries;
/** The height of one line of key entries, in em of their labels: a row is counted in these. */
const KEY_LINE_EM = 1.6;

/** The shares of an edge several keys are fitted to, each on its own: the whole, or a part beside another key. */
const SHARE_FRACTIONS = [1, 0.65, 0.5, 0.35];

/** The widest a key beside the plot may run, as a share of the plot's width. */
const SIDE_KEY_SHARE = 0.6;

interface Box { width: number; height: number; fontSize: number; cost: number; entryRows: number; entryLines: number; layout: KeyLayout }

const wrapLines = (text: string, width: number, maxLines: number, widthOf: (text: string) => number): string[] => {
    if (text.includes('\n')) return text.split('\n');
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (line && widthOf(next) > width && lines.length < maxLines - 1) {
            lines.push(line);
            line = word;
        } else {
            line = next;
        }
    }
    return [...lines, line];
};

/**
 * The width of a key's symbol entries as Vega sets them in a grid: each column as wide as its
 * widest entry (symbol, offset and label), columns 10 px apart unless stated. A key whose labels
 * are not known, or are rewritten by the author, takes the given label width for each entry.
 */
function symbolGridWidth(
    key: KeyToLayout, columns: number, symbol: number, labelWidthFallback: number, labelWidth: (text: string) => number,
): number {
    const s = key.style;
    const texts = s.labelsStated ? undefined : key.labels ?? key.valueLabels;
    if (!texts?.length) return columns * (labelWidthFallback + symbol + 4);
    const widths = new Array(Math.min(columns, texts.length)).fill(0);
    texts.forEach((text, index) => {
        const column = index % widths.length;
        widths[column] = Math.max(widths[column], Math.min(s.labelLimit || Infinity, labelWidth(text)));
    });
    const gap = s.columnPadding ?? 10;
    return widths.reduce((sum, width) => sum + symbol + (s.labelOffset ?? 4) + width, 0) + gap * (widths.length - 1);
}

/**
 * One key at one edge, its title wrapped to three lines over the block (or a third of it when set
 * inline, or 18 em at a side), and its category labels set in the column count, width and line
 * breaks (at most three lines) that best balance overflow, width, wrapping, imbalance and cut text.
 */
function fitKey(
    key: KeyToLayout, at: { orient: string; direction?: string; titleOrient?: string },
    block: number, plotHeight: number, measure: TextMeasurer, budget?: { width?: number; height?: number },
): Box {
    const s = key.style;
    const fontSize = s.labelFontSize;
    const titleFontSize = s.titleFontSize;
    const measureLabel = measure(fontSize, s.labelFont, s.labelFontWeight, s.labelFontStyle);
    const labelWidth = (text: string) => measureLabel(applyTextCase(text, s.labelCase));
    const measureTitle = measure(titleFontSize, s.titleFont, s.titleFontWeight, s.titleFontStyle);
    const sideWidth = fontSize * 18;
    const horizontal = ['top', 'bottom'].includes(at.orient) && at.direction !== 'vertical';
    const inlineTitle = horizontal && ['left', 'right'].includes(at.titleOrient ?? '');
    const titleWidth = horizontal ? (inlineTitle ? block / 3 : block) : sideWidth;
    const layout: KeyLayout = {
        orient: at.orient, moved: false, inlineTitle: false, labelsFitted: false, titleFitted: false,
        ...(at.direction !== undefined ? { direction: at.direction } : {}),
        ...(at.titleOrient !== undefined ? { titleOrient: at.titleOrient } : {}),
        labelFontSize: fontSize, labelLimit: s.labelLimit ?? 0, rowPadding: s.rowPadding ?? 2, width: 0, height: 0,
        ...(s.symbolSize !== undefined ? { symbolSize: s.symbolSize } : {}),
    };
    let titleLines: string[] | undefined;
    if (typeof key.title === 'string' && s.titleLimit === undefined) {
        layout.titleFitted = true;
        const lines = wrapLines(key.title, titleWidth, 3, measureTitle);
        if (lines.length > 1) {
            titleLines = lines;
            layout.titleLines = lines;
            layout.titleLineHeight = Math.ceil(titleFontSize * 1.2);
        }
    }
    const titleTexts = titleLines ?? (key.title ? [key.title] : []);
    let titleExtent = 0;
    if (inlineTitle && key.title) {
        // A title set inline stands further from its first entry than the entries stand from each
        // other, so it reads as the key's name, not as one more entry.
        const gap = s.titlePadding ?? Math.round(INLINE_TITLE_GAP * (s.columnPadding ?? 10));
        layout.titlePadding = gap;
        titleExtent = Math.min(s.titleLimit || Infinity, Math.max(...titleTexts.map(measureTitle))) + gap;
    }
    const titleCount = titleTexts.length;
    const titleHeight = inlineTitle ? 0 : titleCount * Math.ceil(titleFontSize * 1.2) + (titleCount ? s.titlePadding ?? TITLE_PADDING : 0);
    const count = key.count;
    const nativeRows = Math.ceil(count / (s.columns || (horizontal ? count : 1)));
    const nativeSymbol = Math.sqrt(s.symbolSize ?? key.largestSymbol ?? 100) + 2;
    const nativeLabelWidth = s.labelLimit ?? Math.min(sideWidth, Math.max(fontSize * 4, ...(key.labels ?? key.valueLabels ?? []).map(labelWidth)));
    let gradientLength = s.gradientLength ?? 200;
    // A ramp beside the plot runs no longer than the plot is tall, down to the length that still
    // holds a few of its values: a short plot keeps its key at its side rather than losing it to
    // another edge for want of a ramp the key could have drawn shorter.
    if (key.gradient && !horizontal) {
        const room = (budget?.height ?? plotHeight) - titleHeight - 2 * s.padding;
        const floor = Math.max(GRADIENT_FLOOR, Math.ceil(fontSize * 1.2 * GRADIENT_FLOOR_LINES));
        const fitted = Math.max(floor, Math.min(gradientLength, Math.floor(room)));
        if (fitted < gradientLength) {
            gradientLength = fitted;
            layout.gradientLength = fitted;
        }
    }
    if ((key.gradient || key.bar) && s.gradientThickness !== undefined) layout.gradientThickness = s.gradientThickness;
    const nativeColumns = s.columns || (horizontal ? count : 1);
    // A ramp, or a stepped one run across the edge as one bar, spans its length and stands its
    // thickness and a line of labels tall.
    const ramp = key.gradient || (key.bar === true && horizontal);
    let box: Box = {
        width: titleExtent + (ramp ? horizontal ? gradientLength : (s.gradientThickness ?? 16) + nativeLabelWidth + 6
            : symbolGridWidth(key, nativeColumns, nativeSymbol, nativeLabelWidth, labelWidth)) + 2 * s.padding,
        height: titleHeight + (ramp ? horizontal ? (s.gradientThickness ?? 16) + fontSize * 1.5 : gradientLength
            : nativeRows * (Math.max(fontSize * 1.2, nativeSymbol) + (s.rowPadding ?? 2))) + 2 * s.padding,
        fontSize, cost: 0, entryRows: ramp ? 1 : nativeRows, entryLines: 1, layout,
    };
    // A row of values wider than its edge wraps onto more rows, as Vega sets a key's entries in columns;
    // a stepped ramp's bins stand as one bar and never wrap.
    if (horizontal && !key.gradient && !key.bar && !key.labels?.length && s.columns === undefined) {
        const room = (budget?.width ?? block) - titleExtent - 2 * s.padding;
        const gridWidth = (columns: number) => symbolGridWidth(key, columns, nativeSymbol, nativeLabelWidth, labelWidth);
        let columns = nativeColumns;
        while (columns > 1 && gridWidth(columns) > room) columns--;
        if (columns < nativeColumns) {
            const rows = Math.ceil(count / columns);
            layout.columns = columns;
            box = {
                ...box,
                width: titleExtent + gridWidth(columns) + 2 * s.padding,
                height: titleHeight + rows * (Math.max(fontSize * 1.2, nativeSymbol) + (s.rowPadding ?? 2)) + 2 * s.padding,
                entryRows: rows,
            };
        }
    }
    const labels = key.labels ?? [];
    if (!key.gradient && labels.length && !s.labelsStated && s.labelLimit === undefined) {
        layout.labelsFitted = true;
        const gap = s.columnPadding ?? 10;
        const symbol = Math.sqrt(s.symbolSize ?? 100) + (s.labelOffset ?? 4);
        const available = Math.max(1, (budget?.width ?? (horizontal ? block : sideWidth + symbol)) - titleExtent - 2 * s.padding);
        const heightBudget = budget?.height ?? (horizontal ? Math.max(48, plotHeight * 0.4) : plotHeight);
        const rowGap = s.rowPadding ?? 6;
        let bestCost = Infinity;
        let columns = 1;
        let selectedLines: string[][] | undefined;
        let selectedLimit = 0;
        const columnCounts = typeof s.columns === 'number'
            ? [s.columns > 0 ? Math.min(s.columns, labels.length) : labels.length]
            : Array.from({ length: labels.length }, (_, index) => index + 1);
        const naturalWidth = Math.max(...labels.map(labelWidth));
        const lineHeight = Math.ceil(fontSize * 1.2);
        const headingWidth = inlineTitle || !key.title ? 0 : Math.min(s.titleLimit || Infinity, Math.max(...titleTexts.map(measureTitle)));
        const ellipsis = labelWidth('…');
        type Wrapping = { lines: string[][]; rowLines: number; heights: number[]; widths?: number[]; loss?: number; wrappingCost?: number };
        // The labels at one width and line count, and what follows from them alone, whatever the column count.
        const wrapped = new Map<string, Wrapping>();
        const wrapAll = (width: number, maxLines: number): Wrapping => {
            const at = `${width}|${maxLines}`;
            let wrapping = wrapped.get(at);
            if (!wrapping) {
                const lines = labels.map((label) => wrapLines(applyTextCase(label, s.labelCase), width, maxLines, measureLabel));
                wrapping = {
                    lines,
                    rowLines: Math.max(...lines.map((entry) => entry.length)),
                    heights: lines.map((entry) => Math.max(Math.sqrt(s.symbolSize ?? 100) + 2, lineHeight * entry.length)),
                };
                wrapped.set(at, wrapping);
            }
            return wrapping;
        };
        const settle = (wrapping: Wrapping, width: number): Required<Wrapping> => {
            if (wrapping.widths === undefined) {
                const { lines } = wrapping;
                wrapping.widths = lines.map((entry) => Math.max(...entry.map((line) => Math.min(width, labelWidth(line)))));
                wrapping.loss = lines.reduce((total, entry, index) => total + entry.reduce((lost, line) =>
                    lost + (labelWidth(line) > width ? labelWidth(line) - Math.max(0, width - ellipsis) : 0), 0)
                    / Math.max(1, labelWidth(labels[index])), 0) / labels.length;
                wrapping.wrappingCost = lines.reduce((sum, entry) => sum + (entry.length > 1 ? E.wrapped : 0) + Math.max(0, entry.length - 2) * E.extraLine, 0) / labels.length;
            }
            return wrapping as Required<Wrapping>;
        };
        for (const columnCount of columnCounts) {
            const limit = columnCount === labels.length ? available - symbol : (available - gap * (columnCount - 1)) / columnCount - symbol;
            if (limit < fontSize * 4 && columnCount > 1) continue;
            const startWidth = Math.max(Math.min(naturalWidth, fontSize * 4), Math.min(naturalWidth, limit));
            const minWidth = Math.min(startWidth, fontSize * 4);
            const steps = startWidth > minWidth ? 24 : 0;
            for (let step = 0; step <= steps; step++) {
                const textWidth = startWidth - (startWidth - minWidth) * step / Math.max(1, steps);
                let wrapping: Wrapping | undefined;
                let height = 0;
                for (let maxLines = 3; maxLines >= 1; maxLines--) {
                    wrapping = wrapAll(textWidth, maxLines);
                    const { rowLines, heights } = wrapping;
                    const rowCount = Math.ceil(labels.length / columnCount);
                    height = titleHeight + Math.max(0, rowCount - 1) * rowGap + 2 * s.padding;
                    for (let row = 0; row < rowCount; row++) {
                        height += horizontal && rowLines > 1
                            ? Math.max(fontSize + (rowLines - 1) * lineHeight, Math.sqrt(s.symbolSize ?? 100)) + 4
                            : Math.max(...heights.slice(row * columnCount, (row + 1) * columnCount));
                    }
                    if (height <= heightBudget) break;
                }
                const { lines, widths, loss, wrappingCost } = settle(wrapping!, textWidth);
                const columnWidths = Array.from({ length: columnCount }, (_, column) => Math.max(...widths.filter((_, index) => index % columnCount === column)));
                const extent = columnWidths.reduce((sum, column) => sum + column + symbol, 0) + gap * (columnCount - 1);
                const width = Math.max(extent + titleExtent, headingWidth) + 2 * s.padding;
                const widest = Math.max(...widths, 1);
                const imbalance = (widest - widths.reduce((sum, value) => sum + value, 0) / widths.length) / widest;
                const overflow = Math.max(0, height / heightBudget - 1) * E.overflowHeight + Math.max(0, extent / available - 1) * (horizontal ? E.overflowAcross : E.overflowBeside);
                const widthCost = (horizontal ? E.widthAcross : E.widthBeside) * width / (available + titleExtent + 2 * s.padding);
                const cost = overflow + widthCost + wrappingCost + E.imbalance * imbalance + E.cut * loss + (loss ? E.anyCut : 0)
                    + (horizontal ? E.rowHeight * height / heightBudget : 0) + E.column * columnCount;
                if (cost < bestCost) {
                    bestCost = cost;
                    columns = columnCount;
                    selectedLines = lines;
                    selectedLimit = loss ? textWidth : 0;
                    box = { width, height, fontSize, cost: cost - overflow - widthCost,
                        entryRows: Math.ceil(labels.length / columnCount), entryLines: Math.max(...lines.map((entry) => entry.length)), layout };
                }
            }
        }
        if (s.columns === undefined && (!horizontal || columns < labels.length)) layout.columns = columns;
        layout.labelLimit = selectedLimit;
        layout.rowPadding = rowGap;
        if (selectedLines?.some((lines) => lines.length > 1)) layout.labelLines = selectedLines;
    }
    if (key.title) {
        const measuredTitleWidth = Math.min(s.titleLimit || Infinity, Math.max(...titleTexts.map(measureTitle)));
        if (!inlineTitle) box.width = Math.max(box.width, measuredTitleWidth + 2 * s.padding);
        else box.height = Math.max(box.height, titleTexts.length * Math.ceil(titleFontSize * 1.2) + 2 * s.padding);
    }
    layout.width = box.width;
    layout.height = box.height;
    return box;
}

/**
 * Where each key sits and how its text is set. Each key tries its preferred edge, the other edges
 * its theme ranks, then right, bottom, top and left (an author's edge stays), at the full side or
 * half of it when keys share, with its title above or inline above or below the plot; a side that
 * fits rules out top and bottom rows over two entries or lines. Keys then share edges: those on one
 * edge stack one row each or stand side by side, 2.25 label sizes apart, whichever costs less
 * against the edge's budget (the plot along it, 40% of the plot's height or 48 px across a top or
 * bottom, 24 em and 14 px at a side). Moving off the preferred edge costs 0.25 (0.45 to the left),
 * or 0.75 to an edge a theme that ranks its edges did not rank; each extra edge costs 0.3, and each
 * extra row above or below the plot 0.5. A theme's arrangement and title position are preferences:
 * the other costs 0.6 and 0.3, and a stacked key's title set inline above the plot costs 0.1 where
 * the theme states none; a row where some titles stand above and others do not costs 1.2, and
 * several keys too wide to stand at the theme's anchor 0.2. A
 * theme's alignment anchors each edge's keys, and a spread shares out the room the keys leave
 * where it is at least the narrowest key's length; where a preference gives way, the plan notes why.
 */
export function planKeyLayout(
    keys: Array<KeyToLayout | undefined>, plot: { width: number; height: number }, measure: TextMeasurer,
    preferences: KeyPreferences = {},
): LegendLayoutPlan {
    const laid = keys.map((key, index) => ({ key, index })).filter((entry): entry is { key: KeyToLayout; index: number } => Boolean(entry.key));
    const out: LegendLayoutPlan = { keys: keys.map(() => undefined), edges: [], footprint: [], overflow: [], plot, notes: [] };
    if (!laid.length) return out;
    // A key beside the plot runs to 24 of its label size. On a narrow chart, a key naming phrases —
    // a name over 18 of its size, not an ordinary name of a few words — is held to a share of the
    // plot it stands beside, and its names wrap onto lines rather than take the plot's room — but only
    // as narrow as lets every name wrap whole and the keys still stand within the plot's height. A key
    // that fits is weighed as it always was.
    const labelSize = laid[0].key.style.labelFontSize;
    const nativeSide = labelSize * 24 + 14;
    const sides = laid.map(({ key }) => {
        if (key.gradient || !key.labels?.length || key.style.labelsStated || key.style.labelLimit !== undefined) return { text: 0, swatch: 0, wrapped: 0 };
        const widthOf = measure(key.style.labelFontSize, key.style.labelFont, key.style.labelFontWeight, key.style.labelFontStyle);
        const text = Math.max(...key.labels.map((label) => widthOf(applyTextCase(label, key.style.labelCase))));
        const swatch = Math.sqrt(key.style.symbolSize ?? 100) + (key.style.labelOffset ?? 4) + 2 * key.style.padding;
        // Three lines, with room for where the words break.
        return { text, swatch, wrapped: (text / 3) * 1.25 + swatch };
    });
    const phrases = sides.some((side) => side.text > labelSize * 18);
    const swatch = Math.max(0, ...sides.map((side) => side.swatch));
    const wrappedSide = Math.max(0, ...sides.map((side) => side.wrapped));
    const narrowSide = Math.max(labelSize * 12 + swatch, plot.width * SIDE_KEY_SHARE);
    // At a width, whether every name wraps whole within three lines and the keys, stacked beside the
    // plot, stand within its height: a narrower key that cut its names, or ran past the plot, is no gain.
    const standsWhole = (width: number) => {
        let height = 0;
        for (const { key } of laid) {
            const style = key.style;
            const lineHeight = Math.ceil(style.labelFontSize * 1.2);
            const symbol = Math.sqrt(style.symbolSize ?? 100) + 2;
            const titleHeight = key.title ? Math.ceil(style.titleFontSize * 1.2) + (style.titlePadding ?? TITLE_PADDING) : 0;
            if (key.gradient || !key.labels?.length || style.labelsStated || style.labelLimit !== undefined) {
                height += titleHeight + key.count * (symbol + (style.rowPadding ?? 2));
                continue;
            }
            const widthOf = measure(style.labelFontSize, style.labelFont, style.labelFontWeight, style.labelFontStyle);
            const room = width - (Math.sqrt(style.symbolSize ?? 100) + (style.labelOffset ?? 4) + 2 * style.padding);
            if (room <= 0) return false;
            for (const label of key.labels) {
                const lines = Math.ceil((widthOf(applyTextCase(label, style.labelCase)) * 1.15) / room);
                if (lines > 3) return false;
                height += Math.max(symbol, lines * lineHeight) + (style.rowPadding ?? 2);
            }
            height += titleHeight + 2 * style.padding;
        }
        return height <= plot.height;
    };
    // The narrowest width from the one asked for up to the native one at which the keys stand whole.
    const widen = (width: number) => {
        for (let at = Math.round(width); at < nativeSide; at += 8) if (standsWhole(at)) return at;
        return nativeSide;
    };
    const narrowBudget = preferences.sideWidth !== undefined
        ? widen(Math.max(preferences.sideWidth, Math.min(nativeSide, wrappedSide)))
        : phrases && narrowSide < nativeSide ? widen(Math.max(narrowSide, Math.min(nativeSide, wrappedSide))) : nativeSide;
    const layoutAt = (sideBudget: number): LegendLayoutPlan => {
        const out: LegendLayoutPlan = { keys: keys.map(() => undefined), edges: [], footprint: [], overflow: [], plot, notes: [] };
        const horizontalBudget = Math.max(48, plot.height * 0.4);
        // A row of keys spans the drawing, as the title does: the plot and what stands beside it.
        const rowWidth = plot.width + (preferences.besidePlot?.start ?? 0) + (preferences.besidePlot?.end ?? 0);
        // Keys side by side stand apart; one above another, at the header's rhythm — both in em of
        // their labels, eased with the plot.
        const plotSide = Math.min(plot.width, plot.height);
        const edgeGap = keyRowGap(laid[0].key.style.labelFontSize, plotSide, preferences.gaps, preferences.gapScale);
        const stackGap = keyStackGap(laid[0].key.style.labelFontSize, plotSide, preferences.gaps, preferences.gapScale);
        // Whether a row this wide stands at the house's anchor within the drawing, as `anchorOf` places it below.
        const houseAnchor = preferences.align === 'center' ? 'middle' : preferences.align === 'end' ? 'end' : 'start';
        const fitsAnchor = (width: number) => {
            const start = preferences.besidePlot?.start ?? 0;
            const end = preferences.besidePlot?.end ?? 0;
            return houseAnchor === 'start' ? width <= plot.width + end
                : houseAnchor === 'end' ? width <= plot.width + start
                    : (width - plot.width) / 2 <= Math.min(start, end);
        };
        type Candidate = Box & { orient: string; preference: number; titleAbove: boolean; symbolLines: number; forced: boolean };
        const candidatesOf = laid.map(({ key }) => {
            const candidates: Candidate[] = [];
            // A box depends on its edge only through whether it runs across the plot, so opposite edges share one fit.
            const fitted = new Map<string, Box>();
            // The lines a row of its symbols stands past one: none for swatches, several for a size
            // key's largest bubble.
            const symbolLines = key.largestSymbol === undefined ? 0
                : Math.max(0, Math.round(Math.sqrt(key.style.symbolSize ?? key.largestSymbol) / (key.style.labelFontSize * KEY_LINE_EM)) - 1);
            const preferred = key.orient;
            const orients = key.fixed ? [preferred] : key.moveTo ? [key.moveTo] : [...new Set([preferred, ...(key.edges ?? []), 'right', 'bottom', 'top', 'left'])];
            for (const orient of orients) {
                const horizontal = orient === 'top' || orient === 'bottom';
                // Several keys may share an edge evenly or not: one narrow, wrapped, beside one long on a line.
                for (const fraction of laid.length > 1 ? SHARE_FRACTIONS : [1]) {
                    for (const inline of horizontal && !key.fixedTitle ? [false, true] : [false]) {
                        // The theme's direction and title seat hold at its own edge; a key moved off it takes its new edge's.
                        const at = orient === preferred
                            ? { orient, direction: key.ownDirection ?? key.direction, titleOrient: key.ownTitleOrient ?? key.titleOrient }
                            : { orient, direction: key.ownDirection ?? (horizontal ? 'horizontal' : 'vertical'), titleOrient: key.ownTitleOrient ?? 'top' };
                        if (inline) at.titleOrient = 'left';
                        const budget = {
                            width: horizontal ? rowWidth * fraction : sideBudget,
                            height: horizontal ? horizontalBudget : plot.height * fraction,
                        };
                        const fit = `${horizontal}|${at.direction}|${at.titleOrient}|${budget.width}|${budget.height}`;
                        let shared = fitted.get(fit);
                        if (!shared) fitted.set(fit, shared = fitKey(key, at, horizontal ? rowWidth : plot.width, plot.height, measure, budget));
                        const box: Box = { ...shared, layout: { ...shared.layout, orient } };
                        box.layout.moved = orient !== preferred;
                        box.layout.inlineTitle = inline;
                        if (inline && (box.entryRows !== 1 || box.entryLines !== 1 || box.width > (horizontal ? rowWidth : plot.width) * fraction
                            || (box.layout.titleLines?.length ?? 1) > 1)) continue;
                        const edge = orient === preferred ? 0
                            : key.edges && !key.edges.includes(orient) ? K.unrankedEdge
                                : orient === 'left' ? K.leftEdge : K.otherEdge;
                        const seat = !horizontal || !key.title || key.fixedTitle ? 0
                            : preferences.titlePosition ? (inline === (preferences.titlePosition === 'inline') ? 0 : K.offSeat)
                                : orient === 'top' && inline ? K.quietInlineTop : 0;
                        candidates.push({ ...box, orient, preference: edge + seat, titleAbove: Boolean(key.title) && !inline && at.titleOrient !== 'left', symbolLines: symbolLines * Math.max(1, box.entryRows), forced: Boolean(key.moveTo) });
                    }
                }
            }
            const fittingSide = candidates.some((candidate) => ['left', 'right'].includes(candidate.orient)
                && candidate.width <= sideBudget && candidate.height <= plot.height);
            return !key.fixed && fittingSide
                ? candidates.filter((candidate) => !['top', 'bottom'].includes(candidate.orient) || (candidate.entryRows <= 2 && candidate.entryLines <= 2))
                : candidates;
        });
        const footprint = (choices: Candidate[]) => {
            const edges = [...new Set(choices.map((choice) => choice.orient))].map((orient) => {
                const entries = choices.filter((choice) => choice.orient === orient);
                const horizontal = orient === 'top' || orient === 'bottom';
                const widthBudget = horizontal ? rowWidth : sideBudget;
                const heightBudget = horizontal ? horizontalBudget : plot.height;
                const shared = entries.length > 1;
                const asked = horizontal && shared ? preferences.arrangement : undefined;
                const alternatives = ['vertical', 'horizontal'].map((direction) => {
                    const width = direction === 'vertical' ? Math.max(...entries.map((entry) => entry.width))
                        : entries.reduce((sum, entry) => sum + entry.width, 0) + edgeGap * (entries.length - 1);
                    const height = direction === 'horizontal' ? Math.max(...entries.map((entry) => entry.height))
                        : entries.reduce((sum, entry) => sum + entry.height, 0) + (horizontal ? stackGap : edgeGap) * (entries.length - 1);
                    const overflow = Math.max(0, width / widthBudget - 1) + Math.max(0, height / heightBudget - 1);
                    const row = direction === 'horizontal';
                    // The rows of entries the edge takes, past what the house asked for, counted alike
                    // either way: keys one above another add theirs; keys side by side take their tallest's.
                    // A row of two keys, one wrapped into a grid, is as many rows as the grid; an entry
                    // whose name breaks is as many lines as the name.
                    const rows = entries.map((entry) => Math.max(1, entry.entryRows) * Math.max(1, entry.entryLines));
                    const lines = row ? Math.max(...rows) : rows.reduce((sum, count) => sum + count, 0);
                    const natural = !row && asked === 'stack' ? entries.length : 1;
                    // And a row of large symbols — a size key's — stands as tall as its largest: a key of
                    // names in one row is one line, a row of bubbles several. (A key alone on its edge is
                    // weighed by the room it takes, below.)
                    const tall = entries.map((entry) => entry.symbolLines);
                    const taller = row ? Math.max(...tall) : tall.reduce((sum, count) => sum + count, 0);
                    const stacked = horizontal && shared ? Math.max(0, lines + taller - natural) * K.stackedRow : 0;
                    const arrangement = asked && row !== (asked === 'row') ? K.offArrangement : 0;
                    const seats = horizontal && row && shared && entries.some((entry) => entry.titleAbove) && entries.some((entry) => !entry.titleAbove) ? K.mixedSeats : 0;
                    const anchored = horizontal && shared && !fitsAnchor(width) ? K.offAnchor : 0;
                    return { orient, direction, width, height, widthBudget, heightBudget, overflow, asked, count: entries.length,
                        cost: stacked + arrangement + seats + anchored + Math.max(0, height / heightBudget - 1) * K.overflowAcross
                            + Math.max(0, width / widthBudget - 1) * (horizontal ? K.overflowAcross : K.overflowBeside)
                            + K.edgeShare * (horizontal ? height / heightBudget : width / widthBudget) };
                });
                return alternatives.sort((first, second) => first.cost - second.cost)[0];
            });
            // A canvas-fit treatment that moves a key to its own edge splits the keys on purpose.
            const split = choices.some((choice) => choice.forced) ? 0 : Math.max(0, edges.length - 1) * K.extraEdge;
            const cost = edges.reduce((sum, edge) => sum + edge.cost, 0)
                + choices.reduce((sum, choice) => sum + choice.cost + choice.preference, 0) + split;
            return { cost, edges };
        };
        let plans: Array<{ choices: Candidate[]; cost: number }> = [{ choices: [], cost: 0 }];
        for (const candidates of candidatesOf) {
            plans = plans.flatMap((plan) => candidates.map((candidate) => {
                const choices = [...plan.choices, candidate];
                return { choices, cost: footprint(choices).cost };
            })).sort((first, second) => first.cost - second.cost).slice(0, 32);
        }
        const chosen = plans[0].choices;
        const result = footprint(chosen);
        laid.forEach(({ index }, position) => { out.keys[index] = chosen[position].layout; });
        const anchor = preferences.align === 'center' ? 'middle' : preferences.align === 'end' ? 'end' : 'start';
        // A row above or below the plot stands at the theme's anchor where it stays within the
        // drawing there, else at the nearest anchor that keeps it within: keys beside the plot widen
        // the drawing past it on their side.
        const beside = (side: string) => result.edges.filter((edge) => edge.orient === side).reduce((sum, edge) => sum + edge.width + edgeGap, 0);
        const room = {
            start: (preferences.besidePlot?.start ?? 0) + beside('left'),
            end: (preferences.besidePlot?.end ?? 0) + beside('right'),
        };
        const anchorOf = (edge: (typeof result.edges)[number]): typeof anchor => {
            if (edge.orient !== 'top' && edge.orient !== 'bottom') return anchor;
            const width = edge.width;
            const fits = (at: typeof anchor) => at === 'start' ? width <= plot.width + room.end
                : at === 'end' ? width <= plot.width + room.start
                    : (width - plot.width) / 2 <= Math.min(room.start, room.end);
            if (fits(anchor)) return anchor;
            const nearest: Array<typeof anchor> = anchor === 'middle'
                ? (room.start >= room.end ? ['end', 'start'] : ['start', 'end'])
                : anchor === 'start' ? ['middle', 'end'] : ['middle', 'start'];
            const moved = nearest.find(fits);
            if (!moved) return anchor;
            out.notes.push({ path: 'legend.align', code: 'keys-anchor-moved', message: `the ${edge.orient} keys stand at the ${moved === 'middle' ? 'middle' : moved} of the plot rather than its ${anchor === 'middle' ? 'middle' : anchor} — ${Math.round(width)}px wide, they would run past the drawing's edge there` });
            return moved;
        };
        out.edges = result.edges.map((edge) => ({ edge, anchor: anchorOf(edge) })).filter(({ edge, anchor: at }) => edge.count >= 2 || at !== 'start').map(({ edge, anchor }) => {
            const horizontal = edge.orient === 'top' || edge.orient === 'bottom';
            const entries = chosen.filter((choice) => choice.orient === edge.orient);
            const along = horizontal === (edge.direction === 'horizontal');
            // Keys one above another in the header stand at its rhythm; beside the plot, each key's
            // title stands over its own entries, so keys stand as far apart as keys in a row, clearly
            // further than one entry from the next.
            let gap = edge.direction === 'vertical' && horizontal ? stackGap : edgeGap;
            if (preferences.align === 'spread' && along && entries.length > 1) {
                const extent = (entry: Candidate) => (horizontal ? entry.width : entry.height);
                const spare = (horizontal ? plot.width : plot.height) - entries.reduce((sum, entry) => sum + extent(entry), 0);
                // Spread only where the room left reads as chosen: at least the narrowest key's own length between keys.
                if (spare / (entries.length - 1) >= Math.min(...entries.map(extent))) gap = Math.floor(spare / (entries.length - 1));
                else out.notes.push({ path: 'legend.align', code: 'keys-spread-gave-way', message: `the ${edge.orient} keys stand together rather than spread — ${Math.round(spare)}px left over would read as a gap, not a spread` });
            }
            if (edge.asked && (edge.direction === 'horizontal') !== (edge.asked === 'row')) {
                out.notes.push({ path: 'legend.arrangement', code: 'keys-arrangement-gave-way', message: `the ${edge.orient} keys ${edge.direction === 'horizontal' ? 'share a row' : 'stand one above another'} — ${edge.asked === 'row' ? 'a row' : 'a stack'} would overflow the edge` });
            }
            return { orient: edge.orient, direction: edge.direction, anchor, gap };
        });
        out.footprint = result.edges.map(({ orient, width, height }) => ({ orient, width, height }));
        out.overflow = result.edges.filter((edge) => edge.overflow > 0)
            .map(({ orient, width, height, widthBudget, heightBudget }) => ({ orient, width, height, widthBudget, heightBudget }));
        return out;
    };
    // A narrower key is kept only where it cuts no name the native width would have kept whole.
    const narrowed = layoutAt(narrowBudget);
    if (narrowBudget >= nativeSide) return narrowed;
    const cuts = (planned: LegendLayoutPlan) => planned.keys.some((key) => key && (key.orient === 'left' || key.orient === 'right') && key.labelsFitted && key.labelLimit > 0);
    if (!cuts(narrowed)) return narrowed;
    const native = layoutAt(nativeSide);
    return cuts(native) ? narrowed : native;
}
