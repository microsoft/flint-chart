import type { AxisLabelPlan } from './axis-labels';
import type { ChartStructure } from './structure';
import type { DesignDecisions } from './theme/types';
import { applyTextCase } from './text-case';
import { trailingParenthetical } from './trailing-parenthetical';
import { tableTextMeasurer } from './text-width';
import { canvasContentWidth, fitDeckText, fitHeadlineText, plotHeightAfter, textPx, titleMeasures } from './title-fit';
import type { LayoutResult } from './types';

/** How a single-view chart's title is fitted to the block it sits over. */
export interface TitlePlan {
    /** The width the title is fitted to: the plot, the category labels beside it, or the canvas. */
    block: number;
    /** The headline, set down a size or broken over lines. */
    headline?: ReturnType<typeof fitHeadlineText>;
    /** The deck the theme writes: the author's, then the axis titles it moves there. */
    deck?: string;
    /** The deck broken over lines. */
    deckFit?: ReturnType<typeof fitDeckText>;
    /**
     * How far, in px, a title centred over the plot is moved along it so it stays within the drawing:
     * the nearest place to centred where it adds no width to the drawing. Unset where it is centred.
     */
    shift?: number;
}

export interface TitlePlanInputs {
    structure: ChartStructure;
    design: DesignDecisions;
    layout: LayoutResult;
    axisLabels: Record<'x' | 'y', AxisLabelPlan>;
    /** The title each axis prints. */
    axisTitles: Record<'x' | 'y', string | null | undefined>;
    plot: { width: number; height: number };
    rows: any[];
    /** The author's headline and deck. */
    title?: { text: string; subtitle?: string[] };
    /** The field the rows are faceted by, if any. */
    rowFacet?: string;
    /** Whether a theme is applied, so it moves axis titles to the deck where it keeps them there. */
    themed: boolean;
    /** The width the views of a chart of several views span, which its title sits over in place of one plot. */
    viewsWidth?: number;
    /** The width header pieces take beside the headline, at its start and end. */
    beside?: { start: number; end: number };
    /**
     * The width keys beside the plot take, with their offset: the title spans the whole drawing, so
     * it may run over them. Rules and the source close only the chart block, and do not.
     */
    keysBeside?: number;
    /**
     * Where set, the title spans the drawing rather than the canvas, overhanging it by at most
     * `overhang` (a ratio): never narrower than `floor` of the canvas nor `minWidth` px, never wider
     * than the canvas unless the drawing is.
     */
    wrap?: { floor: number; minWidth: number; overhang: number };
}

/**
 * The titles each axis prints once the chart is laid out and themed: a row-faceted chart folds its
 * y title into the row header (a band of names needs none), and a theme hides titles it does not
 * show and adds a unit once.
 */
function printedAxisTitles(inputs: TitlePlanInputs): Record<'x' | 'y', string[]> {
    const { structure, design, layout, rowFacet, themed } = inputs;
    const facetRows = layout.facet?.rows ?? 1;
    const titled = (title: string | null | undefined) => (typeof title === 'string' && title ? [title] : []);
    const out = { x: titled(inputs.axisTitles.x), y: titled(inputs.axisTitles.y) };
    if (structure.y && (rowFacet || facetRows > 1)) {
        if (structure.y.type === 'nominal' || (rowFacet && out.y.length)) out.y = [];
    }
    if (!themed) return out;
    for (const channel of ['x', 'y'] as const) {
        const axis = design.axes[channel];
        if (!axis) continue;
        if (!axis.title.show) out[channel] = [];
        else if (axis.title.unit) {
            const unit = axis.title.unit;
            out[channel] = out[channel].map((title) => (title.includes(`(${unit})`) ? title : `${title} (${unit})`));
        }
    }
    return out;
}

/**
 * Whether a headline or deck already names an axis title: its words appear in it, and so does its
 * unit in brackets, as a word that starts with it (“Population (m)” in “Population, millions, 2023”;
 * not “People (million)” in “People displaced across borders”).
 */
export function alreadyNamed(title: string, said: string, tickUnit?: string): boolean {
    const parenthetical = trailingParenthetical(title);
    const unit = parenthetical?.inner.trim().toLowerCase();
    const bare = (parenthetical ? parenthetical.before : title).trim().toLowerCase();
    const text = said.toLowerCase();
    if (!bare || !text.includes(bare)) return false;
    // A unit the ruler prints on its ticks is named there.
    if (unit && tickUnit && tickUnit.trim().toLowerCase() === unit) return true;
    return !unit || text.split(/[^\p{L}\p{N}%$€£]+/u).some((word) => word.startsWith(unit));
}

/** The unit an axis prints on its ticks, if it prints one. */
export function tickUnitOf(axis: { unit?: { text: string; where: string } } | undefined): string | undefined {
    return axis?.unit && axis.unit.where !== 'never' ? axis.unit.text : undefined;
}

/** The deck the theme writes: the author's, then each axis title it keeps in the deck, named by axis when both are. */
function deckText(inputs: TitlePlanInputs): string | undefined {
    const authored = inputs.title?.subtitle?.join(' ');
    if (!inputs.themed) return authored;
    const printed = printedAxisTitles(inputs);
    for (const channel of ['x', 'y'] as const) {
        const unlessNamed = inputs.design.axes[channel]?.title.unlessNamed;
        if (!unlessNamed) continue;
        const said = (unlessNamed === 'deck' ? [authored] : [inputs.title?.text, authored]).filter(Boolean).join(' ');
        printed[channel] = printed[channel].filter((title) => !alreadyNamed(title, said, tickUnitOf(inputs.design.axes[channel])));
    }
    const moved = (['x', 'y'] as const)
        .filter((channel) => inputs.design.axes[channel]?.title.placement === 'subtitle' && printed[channel].length > 0);
    if (!moved.length) return authored;
    const labels = moved.map((channel) => `${moved.length > 1 ? `${channel.toUpperCase()}: ` : ''}${[...new Set(printed[channel])].join(', ')}`);
    return [authored ?? '', ...labels].filter(Boolean).join('; ');
}

/** The category labels beside the plot: as wide as the longest name, its padding and its tick. */
function labelGutter(inputs: TitlePlanInputs): number {
    const { structure, design, axisLabels, layout, rows } = inputs;
    const y = structure.y;
    const field = y?.derived ? undefined : y?.fields[0];
    const axis = design.axes.y;
    if ((!field && !y?.categories) || (y!.type !== 'nominal' && y!.type !== 'ordinal')) return 0;
    if (axis?.label.show === false || (axisLabels.y.angle ?? 0) !== 0) return 0;
    const names = [
        ...(field ? rows.map((row) => row?.[field]) : y!.categories!),
        ...layout.truncations.filter((truncation) => truncation.channel === 'y').map((truncation) => truncation.placeholder),
    ];
    let width = 0;
    for (const name of names) {
        if (name == null) continue;
        for (const line of String(name).split('\n')) width = Math.max(width, textPx(line, axisLabels.y.fontSize));
    }
    const limit = axisLabels.y.limit ?? 180;
    if (limit > 0) width = Math.min(width, limit);
    const ticks = axis?.ticks.show === false ? 0 : Math.max(0, axis?.ticks.size ?? 5);
    return width + Math.max(0, axis?.label.padding ?? 2) + ticks;
}

/**
 * The width of the block a chart's title and rules span: the plot, or the views of a chart of
 * several, widened a little for their axes, plus the category labels beside them. A title spans
 * at least the canvas the theme sizes to (`toCanvas`); a rule closes only what is drawn.
 */
export function chartBlock(inputs: TitlePlanInputs, toCanvas = true): number | undefined {
    const { structure, design, layout, plot, rows } = inputs;
    const field = structure.x?.derived ? undefined : structure.x?.fields[0];
    const bands = layout.xNominalCount > 0 && field ? new Set(rows.map((row) => row?.[field]).filter((v) => v != null)).size : 0;
    const plotWidth = Math.round((inputs.viewsWidth ?? (bands ? layout.xStep * bands : plot.width)) * 1.07);
    const canvas = canvasContentWidth(design.layout);
    const drawn = plotWidth + labelGutter(inputs) + (inputs.keysBeside ?? 0);
    const wrap = toCanvas && canvas ? inputs.wrap : undefined;
    const floor = !toCanvas ? 0
        : wrap ? Math.min(canvas, Math.max(wrap.minWidth, wrap.floor * canvas, drawn * Math.max(1, wrap.overhang))) : canvas;
    const block = Math.max(drawn, floor);
    return block && Number.isFinite(block) ? block : undefined;
}

/** The width keys beside the plot take, each edge with its offset from the plot, which a title may run over. */
export function keysBesideWidth(footprint: Array<{ orient: string; width: number }> | undefined, keyOffset: number): number {
    return (footprint ?? []).filter((edge) => edge.orient === 'left' || edge.orient === 'right')
        .reduce((sum, edge) => sum + edge.width + keyOffset, 0);
}

/**
 * Fit a chart's title to the block it sits over: the plot, or the views of a chart of several,
 * widened a little for their axes, plus the category labels beside them, and never narrower than
 * the canvas the theme sizes to.
 */
export function planTitle(inputs: TitlePlanInputs): TitlePlan | undefined {
    const { structure, design } = inputs;
    const whole = chartBlock(inputs);
    if (!whole) return undefined;
    // What sits beside the headline is not the headline's to use.
    const block = Math.max(1, whole - (inputs.beside?.start ?? 0) - (inputs.beside?.end ?? 0));
    // Measured as the glyphs draw, in every environment: a title is drawn with real metrics even where
    // a chart is compiled without a canvas.
    const measure = titleMeasures(design.title, design.font, tableTextMeasurer);
    // Cased before it is fitted: an upper-case headline is wider, and is broken where it will be drawn.
    const headlineText = applyTextCase(inputs.title?.text ?? structure.title ?? '', design.title.headline.textCase) || undefined;
    const headline = headlineText && headlineText.trim()
        ? fitHeadlineText(headlineText, block, design.title.headline.fontSize ?? 14, design.title.deck.fontSize ?? 11, measure.headline)
        : undefined;
    const deckRaw = deckText(inputs);
    const deck = deckRaw ? applyTextCase(deckRaw, design.title.deck.textCase) : deckRaw;
    const deckFit = deck && deck.trim() ? fitDeckText(deck, block, design.title.deck.fontSize ?? 11, measure.deck) : undefined;
    return { block, ...(headline ? { headline } : {}), ...(deck !== undefined ? { deck } : {}), ...(deckFit ? { deckFit } : {}) };
}

/** The widest line of a fitted title, headline or deck, as drawn. */
export function fittedTitleWidth(
    title: TitlePlan, headline: string | undefined, design: DesignDecisions, drawn?: { headline: number; deck: number },
): number {
    const measure = titleMeasures(design.title, design.font, tableTextMeasurer);
    const headlineSize = title.headline?.fontSize ?? drawn?.headline ?? design.title.headline.fontSize ?? 14;
    const deckSize = drawn?.deck ?? design.title.deck.fontSize ?? 11;
    const headlines = title.headline?.lines ?? (headline ? [applyTextCase(headline, design.title.headline.textCase)] : []);
    const decks = title.deckFit?.lines ?? (title.deck ? [title.deck] : []);
    return Math.max(0, ...headlines.map((line) => measure.headline(line, headlineSize)), ...decks.map((line) => measure.deck(line, deckSize)));
}

/**
 * Where a title centred over the plot goes: centred, where that keeps it within the drawing; else
 * moved the least that does — to the drawing's edge on the side it would run past — so it adds no
 * width the drawing does not have. Wider than the drawing, it is centred on the drawing. The move,
 * in px from centred over the plot; positions run from the plot's left edge, with `left` px of the
 * drawing before it and `right` px after it.
 */
export function nearestCentredShift(width: number, span: { left: number; plot: number; right: number }): number {
    const centre = span.plot / 2;
    const low = -span.left;
    const high = span.plot + span.right;
    const half = width / 2;
    if (width >= high - low) return Math.round((low + high) / 2 - centre);
    if (centre + half > high) return Math.round(high - half - centre);
    if (centre - half < low) return Math.round(low + half - centre);
    return 0;
}

/** The plot's height once the fitted title's extra lines are taken out of it. */
export function heightAfterTitle(height: number, title: TitlePlan | undefined): number {
    let out = height;
    if (title?.headline?.lines) out = plotHeightAfter(out, title.headline.taken);
    if (title?.deckFit) out = plotHeightAfter(out, title.deckFit.taken);
    return out;
}
