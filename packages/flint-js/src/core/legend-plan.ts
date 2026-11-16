import type { CategoryOrder } from './channel-decisions';
import type { KeyPreferences, KeyStyle, KeyToLayout, LegendLayoutPlan } from './legend-layout';
import type { LegendPlacementPlan } from './series-end';
import type { ChartStructure, KeyChannel } from './structure';
import type { DesignDecisions } from './theme/types';
import type { ChannelSemantics, LayoutResult } from './types';
import { format as formatNumber } from 'd3-format';
import { niceTicks } from './ruler';
import { exactFormat, printFormatted } from './sample-format';

/** A key the chart may draw, and what the plan decides about it. */
export interface PlannedKey {
    channel: KeyChannel;
    /** The data field the key names, where it names one. */
    field?: string;
    /** The working column the template draws the key through. */
    via?: string;
    type?: string;
    /** A key to values (a size or opacity scale) rather than one that names series. */
    valueKey: boolean;
    /** Whether the key is drawn. */
    show: boolean;
    /** Whether the theme drops the key's title, its labels naming themselves. */
    untitled: boolean;
    /** The values a key to values is sampled at. */
    samples?: number[];
    /** The samples as the key prints them: in the field's format, precise enough for each. */
    sampleLabels?: string[];
    /** The categories a colour key keeps by name, largest share first, and the entry the rest share. */
    fold?: { kept: unknown[]; others: string };
    /** The labels a key that names categories lists, in order. */
    entries?: string[];
}

/** The keys a chart draws and how much room they take, beside where it names its series. */
export interface LegendPlan extends LegendPlacementPlan {
    keys: PlannedKey[];
    /** Every key is untitled: the theme drops series titles and no key to values keeps one. */
    untitled: boolean;
    /** A horizontal colour ramp the theme leaves to the chart: its length and the block it spans, in px. */
    gradient?: { length: number; block: number };
    /** How much further a top key stands above the plot to clear a flat y title, in px. */
    titleClearance?: number;
    /** What each drawn key needs laid out, by key. */
    keyInputs?: Array<KeyToLayout | undefined>;
    /** Where each key sits and how its text is set, by key; a composite chart's keys are laid out against its drawn panel. */
    layout?: LegendLayoutPlan;
    /** The edge keys besides colour move to, clear of names drawn at the series' ends. */
    secondaryEdge?: 'bottom';
    /** How the theme asks several keys to stand. */
    preferences?: KeyPreferences;
}

/**
 * How many anchors a size key spends when the house has not said: enough to fix the mapping and
 * show that area, not radius, carries the value; few enough that the key stays a key.
 */
export const SIZE_KEY_SWATCHES = 3;
/** The round steps a sampled key value takes, of a power of ten. */
const NICE_STEPS = [1, 2, 2.5, 5];
/** How far apart two sampled values' symbols stand in width, as a share of the largest's. */
const SAMPLE_SEPARATION = 0.12;

/** The most entries a size key lists, however much room it has: past this a key is a table. */
export const SIZE_KEY_MAX_SWATCHES = 5;
/** The run of the plot's edge one size-key entry is given, in px. */
const SIZE_KEY_SPACING = 80;

/**
 * How many round values a size key lists: one for every 80 px of the edge it stands on — the
 * plot's height beside it, its width above or below — from three, which tell the reader the scale,
 * to five, past which the key reads as a table.
 */
export function sizeKeySwatches(orient: string | undefined, plot: { width: number; height: number }): number {
    const run = orient === 'top' || orient === 'bottom' ? plot.width : plot.height;
    return Math.min(SIZE_KEY_MAX_SWATCHES, Math.max(SIZE_KEY_SWATCHES, Math.round(run / SIZE_KEY_SPACING)));
}
const CONNECTED_MARKS = new Set(['line', 'area', 'trail']);
const NAMING_CHANNELS = new Set<KeyChannel>(['color', 'fill', 'stroke', 'shape', 'size', 'opacity']);

/** A few round numbers spanning what a field holds, spaced quadratically, largest last; none past zero or below. */
export function roundSample(rows: any[], field: string, count: number, integersOnly = false): number[] | undefined {
    let max = -Infinity;
    let min = Infinity;
    for (const row of rows ?? []) {
        const v = Number(row?.[field]);
        if (!Number.isFinite(v)) continue;
        if (v > max) max = v;
        if (v < min) min = v;
    }
    if (!Number.isFinite(max) || max <= 0) return undefined;
    // Round values a reader takes in at a glance — 1, 2, 2.5, 5 of a power of ten — up to the largest.
    const ladder: number[] = [];
    for (let exp = Math.floor(Math.log10(max)); exp >= Math.floor(Math.log10(max)) - 3; exp--) {
        for (const step of [...NICE_STEPS].reverse()) {
            // Rounded off the float the power leaves (0.1 × 3 is not 0.3), so 25 is an integer.
            const v = Number((step * 10 ** exp).toPrecision(12));
            // A field that counts (its semantic type whole numbers: a count, a rank) is keyed in whole
            // numbers: no 2.5 people, no half a ship.
            if (integersOnly && (v < 1 || !Number.isInteger(v))) continue;
            if (v <= max * 1.0001 && !ladder.includes(v)) ladder.push(v);
        }
    }
    // Targets even in a symbol's width (the square root of its area), from the largest down; each
    // takes the round value nearest it whose symbol stands clearly smaller than the last one's, so a
    // key lists fewer where the values cannot hold more apart.
    const apart = Math.sqrt(max) * SAMPLE_SEPARATION;
    const out: number[] = [];
    for (let i = count - 1; i >= 0; i--) {
        const t = count === 1 ? 1 : (i + 1) / count;
        const target = Math.max(min, 0) + (max - Math.max(min, 0)) * t * t;
        const last = out[out.length - 1];
        const options = ladder.filter((v) => last === undefined || (v < last && Math.sqrt(last) - Math.sqrt(v) >= apart));
        if (!options.length) break;
        out.push(options.reduce((best, v) => (Math.abs(Math.log(v / target)) < Math.abs(Math.log(best / target)) ? v : best)));
    }
    out.reverse();
    // The smallest value keyed just off the data's least, where that least is itself round, is the
    // least: what the reader meets in the data (a crew that dwindles to one man keys 1, not 2).
    if (out.length > 0 && min > 0 && min < out[0] && out[0] / min <= LEAST_SNAP && isRound(min, integersOnly)) out[0] = min;
    return out.length > 1 ? out : undefined;
}

/** How far above the data's least a key's smallest value may stand and still be moved onto it. */
const LEAST_SNAP = 3;

/** Whether a value is one of the round values a key lists: 1, 2, 2.5 or 5 of a power of ten. */
function isRound(value: number, integersOnly: boolean): boolean {
    if (integersOnly && !Number.isInteger(value)) return false;
    const exp = Math.floor(Math.log10(value));
    return NICE_STEPS.some((step) => Number((step * 10 ** exp).toPrecision(12)) === Number(value.toPrecision(12)));
}

/** Each sampled value as its key prints it: the field's format, raised to the precision the samples need. */
function sampleLabels(samples: number[], fmt: ChannelSemantics['format']): string[] {
    const exact = exactFormat(samples, fmt);
    return samples.map((value) => printFormatted(value, exact));
}

/** The ticks a key to a field's values lists where none are sampled: a scale's five or so, from zero for a size. */
function valueKeyTicks(rows: any[], field: string, fromZero: boolean): string[] | undefined {
    let min = Infinity;
    let max = -Infinity;
    for (const row of rows ?? []) {
        const value = Number(row?.[field]);
        if (!Number.isFinite(value)) continue;
        if (value < min) min = value;
        if (value > max) max = value;
    }
    if (!Number.isFinite(min)) return undefined;
    const ticks = niceTicks(fromZero ? Math.min(0, min) : min, fromZero ? Math.max(0, max) : max, 5);
    return ticks.length ? ticks.map((tick) => formatNumber(',')(tick)) : undefined;
}

/**
 * The labels a key naming categories lists: the fold's kept categories and its shared entry; else
 * the categories the overflow kept and its placeholder; else what the template lists; else a
 * colour's stated order; else each category in the order the rows first meet it.
 */
function keyEntries(key: PlannedKey, stated: string[] | undefined, inputs: LegendInputs): string[] | undefined {
    const discrete = key.fold || key.type === 'nominal' || key.type === 'ordinal' || stated;
    if (!discrete) return undefined;
    const label = (values: unknown[]) => [...new Set(values.filter((value) => value != null).map(String))];
    if (key.fold) return label([...key.fold.kept, key.fold.others]);
    const truncation = key.channel === 'color' ? inputs.layout.truncations.find((entry) => entry.channel === 'color') : undefined;
    if (truncation) return label([...truncation.keptValues, truncation.placeholder]);
    if (stated) return label(stated);
    const order = key.channel === 'color' ? inputs.orders.color : undefined;
    if (order?.by === 'values') return label(order.values);
    const column = key.field;
    return column ? label(inputs.rows.map((row) => row?.[column])) : undefined;
}

export interface LegendInputs {
    placement: LegendPlacementPlan;
    structure: ChartStructure;
    /** The theme's decisions; undefined where no theme is applied. */
    design?: DesignDecisions;
    channelSemantics: Record<string, ChannelSemantics>;
    orders: Partial<Record<string, CategoryOrder>>;
    rows: any[];
    layout: LayoutResult;
    plot: { width: number; height: number };
    composite: boolean;
    /** The width the views of a chart of several views span, which its keys are planned along. */
    viewsWidth?: number;
    /** Whether a flat y title sits above the plot and no facet header holds that line. */
    flatYTitle: boolean;
    /** How far above the plot the flat y title's baseline sits, in px. */
    flatYTitleLift?: number;
    /** The title each axis prints, `null` where none: a key on an axis's field whose title is printed need not repeat it. */
    axisTitles?: Record<'x' | 'y', string | null | undefined>;
}

/**
 * The categories of a colour key folded so the house's inks name the largest: where the house
 * folds an overflow tail, has an overflow ink, runs short of inks for the series, and no series is
 * a connected run (a folded line would thread through two series). Categories rank by their summed
 * share of the chart's measure (the angle, a size, then the quantitative axis), ties keeping order.
 */
function foldedColour(inputs: LegendInputs, field: string, design: DesignDecisions): PlannedKey['fold'] {
    const { structure, channelSemantics, orders, rows } = inputs;
    const s = design.series;
    if (s.mode === 'single' || s.mode === 'status' || ((s.mode === 'sequential' || s.mode === 'diverging') && s.range?.length)) return undefined;
    if (channelSemantics.color?.type === 'quantitative' || channelSemantics.color?.type === 'temporal') return undefined;
    const order = orders.color;
    const declared = order?.by === 'values' ? order.values.length : 0;
    const need = Math.max(design.bound.seriesCount || s.categorical.length || 1, declared);
    if (s.exhausted && need > s.categorical.length) return undefined;
    if (!s.overflowTail || !s.overflow || need <= s.categorical.length) return undefined;
    if (structure.marks.some((mark) => CONNECTED_MARKS.has(mark))) return undefined;
    const domain = order?.by === 'values' && order.values.length
        ? order.values.slice()
        : [...new Set(rows.map((row) => row?.[field]).filter((value) => value != null))];
    if (domain.length < 2) return undefined;
    const sizeKey = structure.keys?.find((key) => key.channel === 'size' && key.field && (key.type === 'quantitative' || key.type == null));
    const axisMeasure = (['y', 'x'] as const).map((channel) => structure[channel])
        .find((axis) => axis && !axis.derived && (axis.type === 'quantitative' || axis.type == null) && axis.fields.length);
    const measure = (structure.angle?.type === 'quantitative' ? structure.angle.fields[0] : undefined)
        ?? sizeKey?.field ?? axisMeasure?.fields[0];
    if (!measure) return undefined;
    const total = new Map<unknown, number>();
    for (const row of rows) {
        const key = row?.[field];
        if (key == null) continue;
        const value = Number(row?.[measure]);
        total.set(key, (total.get(key) ?? 0) + (Number.isFinite(value) ? Math.abs(value) : 0));
    }
    if (total.size === 0) return undefined;
    const ordered = domain
        .map((value, index) => ({ value, index, weight: total.get(value) ?? 0 }))
        .sort((a, b) => (b.weight - a.weight) || (a.index - b.index))
        .map((entry) => entry.value);
    const k = s.categorical.length;
    if (ordered.length <= k) return undefined;
    // A tail of one is still a named category: it takes the overflow ink under its own name, not
    // an "Others (1)" that hides what it is.
    const others = ordered.length - k === 1 ? String(ordered[k]) : `Others (${ordered.length - k})`;
    return { kept: ordered.slice(0, k), others };
}

/**
 * The keys a chart draws. Without a theme every key the structure states is drawn as it is. A
 * theme that names series some other way (or not at all) drops the keys that name series and keeps
 * the keys to values, which nothing else explains; a theme that leaves series titles off drops
 * those titles, while a key to values keeps its title, a number naming nothing until it says what
 * it counts, and every key keeps its title where a chart draws several. A size key is sampled at round values, one for every 80 px of the edge it stands on,
 * from three to five, never more than the house allows; an opacity key only where the house says how many. A horizontal ramp the house does not size runs 45% of the
 * block, between 80 and 200 px, and a top key clears a flat y title by its line and 12 px.
 */
export function planLegend(inputs: LegendInputs): LegendPlan {
    const { placement, structure, design, rows, layout, plot, composite, flatYTitle } = inputs;
    const named = !design || (design.legend.show && placement.placement !== 'seriesEnd' && placement.placement !== 'inline');
    const drafted: PlannedKey[] = (structure.keys ?? []).map((key) => {
        // A size, a line width, an opacity or a colour ramp lists numbers, and a number names nothing until the key says what it counts.
        const sized = key.channel === 'size' || key.channel === 'strokeWidth';
        const valueKey = (sized || INK_CHANNELS.has(key.channel)) && key.type === 'quantitative';
        const governed = Boolean(design) && NAMING_CHANNELS.has(key.channel);
        const show = !governed || named || valueKey;
        // A key the template makes itself — a waterfall's total, increase and decrease — is explained
        // by the chart it keys, so it is titled only where the house titles every key.
        const madeByChart = Boolean(key.derived) && design?.legend.titlePolicy !== 'always';
        // Nor need a key repeat the name an axis on the same field already prints.
        const printedOnAxis = Boolean(key.field) && design?.legend.titlePolicy !== 'always' && (['x', 'y'] as const).some((axis) =>
            structure[axis]?.fields.includes(key.field!) && typeof inputs.axisTitles?.[axis] === 'string' && design?.axes[axis]?.title.show !== false);
        const untitled = Boolean(design) && named && (!design!.legend.title || madeByChart || printedOnAxis) && governed && !valueKey;
        const cap = !named || !key.field || key.type !== 'quantitative' ? undefined
            : sized ? Math.min(design?.legend.maxSwatches ?? Infinity, sizeKeySwatches(placement.orient, plot))
                : key.channel === 'opacity' ? design?.legend.maxSwatches : undefined;
        const samples = cap
            ? roundSample(rows, key.field!, cap, inputs.channelSemantics[key.channel]?.tickConstraint?.integersOnly === true)
            : undefined;
        const fold = design && key.channel === 'color' && key.field && !key.via ? foldedColour(inputs, key.field, design) : undefined;
        const planned: PlannedKey = {
            channel: key.channel,
            ...(key.field ? { field: key.field } : {}),
            ...(key.via ? { via: key.via } : {}),
            ...(key.type ? { type: key.type } : {}),
            valueKey, show, untitled,
            ...(samples ? { samples, sampleLabels: sampleLabels(samples, inputs.channelSemantics[key.channel]?.format) } : {}),
            ...(fold ? { fold } : {}),
        };
        const entries = show ? keyEntries(planned, key.entries, inputs) : undefined;
        return entries ? { ...planned, entries } : planned;
    });
    // Several keys each say what they key: untitled, one key's names run on into the next's. Keys on
    // one field merge into one key, so they count once.
    const several = new Set(drafted.filter((key) => key.show).map((key) => key.field ?? key.channel)).size > 1;
    const keys = several ? drafted.map((key) => (key.untitled ? { ...key, untitled: false } : key)) : drafted;
    const valueKeys = keys.filter((key) => key.show && key.valueKey && NAMING_CHANNELS.has(key.channel)).length;
    const untitled = Boolean(design) && named && !design!.legend.title && valueKeys === 0 && !several;
    let gradient: LegendPlan['gradient'];
    if (design && named && !design.legend.gradientLength && (placement.direction ?? 'horizontal') === 'horizontal' && (!composite || inputs.viewsWidth)) {
        const field = structure.x?.derived ? undefined : structure.x?.fields[0];
        const bands = layout.xNominalCount > 0 && field ? new Set(rows.map((row) => row?.[field]).filter((v) => v != null)).size : 0;
        const block = Math.round((inputs.viewsWidth ?? (bands ? layout.xStep * bands : plot.width)) * 1.07);
        if (block) gradient = { length: Math.round(Math.min(200, Math.max(80, block * 0.45))), block };
    }
    // Names drawn at the ends of lines take the right margin, so the other keys move below the plot.
    const secondaryEdge = design && design.legend.show && (placement.placement === 'seriesEnd' || placement.placement === 'inline')
        && !structure.marks.includes('text') && structure.marks.some((mark) => mark === 'line' || mark === 'trail')
        && Boolean(structure.series?.field ?? design.bound.seriesField)
        && Boolean(structure.x && !structure.x.derived && structure.y && !structure.y.derived) ? 'bottom' as const : undefined;
    // The key's last row stands clear of the title's top: the title's lift above the plot, its own
    // line and a gap, past the key's usual 18 px offset.
    const titleSize = design?.axes.y?.title.fontSize ?? 11;
    const titleClearance = design && named && placement.orient === 'top' && flatYTitle
        ? Math.max(titleSize + 12, (inputs.flatYTitleLift ?? 0) + titleSize + 6 - 18) : undefined;
    return {
        ...placement,
        keys,
        untitled,
        ...(gradient ? { gradient } : {}),
        ...(titleClearance !== undefined ? { titleClearance } : {}),
        ...(secondaryEdge ? { secondaryEdge } : {}),
    };
}

export interface KeyLayoutInputs {
    rows: any[];
    /** The edge and title seat an author pins a channel's key to. */
    authored: Partial<Record<string, { orient?: string; titleOrient?: string }>>;
    design?: DesignDecisions;
    structure: ChartStructure;
    layout: LayoutResult;
    /** The title each key's channel prints, from its encoding. */
    /** Each channel's key title; `null` where the author asked for none. */
    titles: Partial<Record<string, string | null>>;
    /** The areas a size channel spans, in px². */
    sizes?: { range: [number, number] };
    /** Whether a theme is applied. */
    themed: boolean;
    /** The placements the theme ranks, best first; unset where it ranks none. */
    placements?: string[];
}

const INK_CHANNELS = new Set<KeyChannel>(['color', 'fill', 'stroke', 'opacity']);
const SIDES = new Set(['left', 'right', 'top', 'bottom']);
const SECONDARY_CHANNELS = new Set<KeyChannel>(['strokeDash', 'shape', 'size', 'opacity']);

/**
 * Whether a theme marks where each line lands with a dot beside a colour key: the dot would swell
 * every swatch, so the key's symbols are set to the label's size instead.
 */
function emphasisDots(design: DesignDecisions, structure: ChartStructure): boolean {
    if (!design.pointEmphasis || !design.legend.show || !structure.series?.field) return false;
    if (!structure.marks.some((mark) => mark === 'line' || mark === 'trail')) return false;
    if (design.marks.point?.show === true || structure.marks.includes('point')) return false;
    return Boolean(structure.x && !structure.x.derived && structure.y && !structure.y.derived);
}

/**
 * What each drawn key needs laid out: its labels or entry count, its title, how it is set, and the
 * edge it prefers. A theme sets keys in its label face and size, titles in its key-title role, and seats them on its
 * edge; without one, keys take the layout's legend sizes on the right. Keys over a plot's corner
 * keep 4 px of padding; a ramp is a key to values on an ink channel the theme does not step.
 */
export function keysToLayout(plan: LegendPlan, inputs: KeyLayoutInputs): Array<KeyToLayout | undefined> {
    const { design, structure, layout, titles, sizes, themed } = inputs;
    const l = design?.legend;
    const named = !design || (design.legend.show && plan.placement !== 'seriesEnd' && plan.placement !== 'inline');
    // The theme sets its keys where it draws them, or keeps a key to values while naming series otherwise.
    const styled = themed && Boolean(l) && (named || plan.keys.some((key) => key.show && key.valueKey));
    const orient = !styled ? 'right' : named ? (plan.orient ?? 'right') : (!plan.orient || plan.orient === 'none' ? 'right' : plan.orient);
    const labelFontSize = styled ? l!.label.fontSize ?? 10 : layout.legendFontSize;
    const titleFontSize = styled ? l!.titleText?.fontSize ?? l!.label.fontSize ?? 10 : layout.titleFontSize;
    const font = styled ? l!.label.font ?? 'sans-serif' : 'sans-serif';
    const titleFont = styled ? l!.titleText?.font ?? font : font;
    const symbolSize = themed && design && emphasisDots(design, structure) ? ((l!.label.fontSize ?? 10) * 0.8) ** 2 : undefined;
    const corner = themed && named && (orient === 'top-right' || orient === 'top-left');
    const stated = new Map((structure.keys ?? []).map((key) => [key.channel, key.title]));
    return plan.keys.map((key) => {
        if (!key.show) return undefined;
        const discrete = Boolean(key.entries);
        const series = design?.series;
        const stepped = key.channel === 'color' && key.type === 'quantitative' && Boolean(series?.quantize)
            && (series!.mode === 'sequential' || series!.mode === 'diverging') && Boolean(series!.range?.length);
        const gradient = !discrete && INK_CHANNELS.has(key.channel) && !stepped;
        const statedTitle = stated.get(key.channel);
        const title = plan.untitled || key.untitled ? null
            : statedTitle !== undefined ? statedTitle
                : titles[key.channel] !== undefined ? titles[key.channel] as string | null : key.via ?? key.field ?? null;
        const style: KeyStyle = {
            labelFont: font, labelFontSize,
            // Measured in the weight, slope and case the key is drawn in.
            labelFontWeight: (styled && l!.label.fontWeight) || 'normal', labelFontStyle: (styled && l!.label.fontStyle) || 'normal',
            ...(styled && l!.label.textCase ? { labelCase: l!.label.textCase } : {}),
            titleFont, titleFontSize,
            titleFontWeight: (styled && l!.titleText?.fontWeight) || 'bold', titleFontStyle: (styled && l!.titleText?.fontStyle) || 'normal',
            ...(symbolSize !== undefined ? { symbolSize } : {}),
            padding: corner ? 4 : 0,
            ...(plan.gradient ? { gradientLength: plan.gradient.length } : l?.gradientLength ? { gradientLength: l.gradientLength } : {}),
        };
        // A key to values with none sampled draws its scale's ticks, about five, as the backend does:
        // those are what it lists, not the rows' values.
        const drawnTicks = !gradient && !key.samples && !key.entries && key.field && key.type === 'quantitative'
            ? valueKeyTicks(inputs.rows, key.field, key.channel === 'size') : undefined;
        const relocated = plan.secondaryEdge && SECONDARY_CHANNELS.has(key.channel);
        const pinned = inputs.authored[key.channel];
        const edge = pinned?.orient ?? (relocated ? plan.secondaryEdge! : orient);
        const ranked = styled ? inputs.placements?.filter((placement) => SIDES.has(placement)) : undefined;
        return {
            gradient,
            ...(key.entries ? { labels: key.entries } : {}),
            ...(!key.entries && (key.samples || key.field)
                ? { valueLabels: key.sampleLabels ?? key.samples?.map(String) ?? drawnTicks ?? [...new Set(inputs.rows.map((row) => String(row?.[key.field!])))] } : {}),
            count: key.samples?.length ?? key.entries?.length ?? drawnTicks?.length ?? 5,
            title,
            style,
            ...(key.channel === 'size' ? { largestSymbol: design?.marks.sizeRange?.[1] ?? sizes?.range[1] ?? 400 } : {}),
            orient: edge,
            ...(ranked?.length ? { edges: ranked } : {}),
            fixed: pinned?.orient !== undefined || !SIDES.has(edge),
            fixedTitle: pinned?.titleOrient !== undefined,
            ...(pinned?.titleOrient !== undefined ? { titleOrient: pinned.titleOrient } : {}),
            ...(styled && named && plan.direction ? { direction: plan.direction } : {}),
        };
    });
}
