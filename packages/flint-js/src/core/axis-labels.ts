import type { LayoutDeclaration, LayoutResult } from './types';
import type { LabelFitStep, ThemeLabels, TimeContext } from './theme/types';

/** Space two straight names keep between them so they never read as one, in px. */
export const STRAIGHT_LABEL_GAP = 6;

/** The characters a name cut to its band must keep, before its ellipsis, to still read as itself. */
export const CUT_LABEL_MIN_CHARS = 4;

/** The widest a turned name runs where nothing else limits it, in px. */
export const TURNED_LABEL_LIMIT = 100;

/**
 * The general rule for category names that do not fit their band: two lines, two lines cut to the
 * band, upright, upright and cut. Every name is printed; nothing is turned −45° or left out unless a
 * theme or the chart asks.
 */
export const DEFAULT_LABEL_OVERFLOW: readonly LabelFitStep[] = ['wrap', 'rotate90'];

/**
 * The general rule on a sequence axis (times, dates, months, years, ranks), where a name left out
 * reads from its neighbours: two lines, then the names on round values only (16:45, 17:00 …),
 * flat; upright only where not even those stand apart.
 */
export const DEFAULT_SEQUENCE_OVERFLOW: readonly LabelFitStep[] = ['wrap', 'skip', 'rotate90'];

/**
 * Whether a name cut to its band still reads: the band, less the gap two names keep, holds
 * {@link CUT_LABEL_MIN_CHARS} characters and an ellipsis. Narrower, a cut leaves a stub.
 */
export function cutReads(band: number, fontSize: number): boolean {
    return band - STRAIGHT_LABEL_GAP >= (CUT_LABEL_MIN_CHARS + 1) * fontSize * 0.6;
}

/** Flint's own tick-label size; a fitted size under it means the labels did not fit at the size Flint wanted. */
export const BASE_LABEL_FONT_SIZE = 10;

/** How the names along x were made to fit, where they did not fit their band whole and flat. */
export interface LabelOverflowFit {
    step: LabelFitStep;
    /** The step trims its names. */
    trimmed: boolean;
    /** The widest name as drawn, plus the gap two names keep, and the band it had, in px. */
    needed: number;
    band: number;
    /** The limit before a flat cut, restored where a pin turns the names. */
    uncutLimit?: number;
    /** `skip` (sequence axes only): the names printed, those on a round value. */
    shown?: string[];
}

/** The tick labels one axis draws. */
export interface AxisLabelPlan {
    fontSize: number;
    /** The face the labels are set in; undefined leaves the renderer's. */
    font?: string;
    /** Widest a label may run, in px; 0 means no limit. */
    limit?: number;
    /** Space kept between two neighbouring labels, in px. */
    separation?: number;
    /** Line height of two-line band labels. */
    lineHeight?: number;
    /** Rotation in degrees, and how a turned label anchors to its tick. */
    angle?: number;
    align?: string;
    baseline?: string;
    /** The theme's size, where crowded labels keep the smaller fitted size instead. */
    crowdedFrom?: number;
    /** The step of the overflow sequence that made names too wide for their band fit. */
    overflowFit?: LabelOverflowFit;
    /**
     * How a time axis along x carries its larger period: the theme's ask, then, once the plan has
     * weighed it against the panels, its choice — `inline` or `stacked`.
     */
    timeContext?: TimeContext;
    /** The height the plot gives a stacked time axis's second row. */
    timeRowRoom?: number;
}

/** What a theme states about tick labels. */
export interface AxisLabelTheme {
    fontSize: number;
    /** The theme never truncates labels. */
    noLimit: boolean;
    font?: string;
    timeContext?: TimeContext;
}

/** What the plan knows about the data along each axis. */
export interface AxisLabelFacts {
    /** Whether a field is on the axis. */
    present: Record<'x' | 'y', boolean>;
    /** The x axis is a continuous ruler (dates or numbers on a time or linear scale). */
    xRuler?: boolean;
}

/**
 * The tick labels of each axis, from the label sizing the layout fitted and the theme. Numbers
 * keep a gap of 0.6 em between labels so two never read as one; bands are spaced by their scale
 * and keep none. A theme's size holds unless the layout had to shrink the labels to fit their
 * bands. How category names along x are set — flat, wrapped, cut, turned or thinned, and at what
 * size — was decided with the layout ({@link planBandLabels}, by cost); a continuous ruler (dates,
 * numbers on a time or linear scale) is never turned, its ticks thin. Row names down y keep the
 * layout's angle.
 */
export function planAxisLabels(
    layout: LayoutResult,
    declaration: LayoutDeclaration,
    theme: AxisLabelTheme | undefined,
    facts: AxisLabelFacts = { present: { x: false, y: false } },
): Record<'x' | 'y', AxisLabelPlan> {
    const plan = (channel: 'x' | 'y'): AxisLabelPlan => {
        const sizing = channel === 'x' ? layout.xLabel : layout.yLabel;
        const discrete = (channel === 'x' ? layout.xNominalCount : layout.yNominalCount) > 0;
        const wrapped = Boolean(sizing.labelLines && sizing.labelValues);
        const fitted = sizing.fontSize;
        const fittedLimit = channel === 'x' || wrapped || sizing.labelCut ? sizing.labelLimit : undefined;
        const fittedLineHeight = wrapped ? sizing.labelLineHeight : undefined;
        const ruler = channel === 'x' && (facts.xRuler === true
            || declaration.resolvedTypes?.x === 'temporal' || declaration.resolvedTypes?.x === 'quantitative');
        const fittedAngle = ruler && sizing.labelAngle ? { angle: 0, align: 'center', baseline: 'top' }
            : sizing.labelAngle === undefined || (channel === 'y' && !wrapped) ? {}
            : { angle: sizing.labelAngle, align: sizing.labelAlign, baseline: sizing.labelBaseline };
        const decided = channel === 'x' ? sizing.overflow : undefined;
        const overflowFit = decided ? { overflowFit: { ...decided, ...(fittedLimit !== undefined ? { uncutLimit: fittedLimit } : {}) } } : {};
        if (!theme) {
            return {
                fontSize: fitted,
                ...(fittedLimit !== undefined ? { limit: fittedLimit } : {}),
                ...(discrete ? {} : { separation: Math.round(fitted * 0.6) }),
                ...(fittedLineHeight !== undefined ? { lineHeight: fittedLineHeight } : {}),
                ...fittedAngle,
                ...overflowFit,
            };
        }
        const resolved = declaration.resolvedTypes?.[channel];
        const banded = discrete || resolved === 'nominal' || resolved === 'ordinal';
        const separation = !banded ? Math.round(theme.fontSize * 0.6)
            : discrete ? undefined : Math.round(fitted * 0.6);
        // A crowded axis takes the size the layout fitted; names the band-label choice set smaller
        // than the theme's take that size.
        const bandFitted = sizing.fittedFontSize;
        const crowded = bandFitted !== undefined
            || ((fitted < BASE_LABEL_FONT_SIZE || (channel === 'y' && wrapped && Boolean(fittedLineHeight))) && theme.fontSize > fitted);
        const fontSize = bandFitted ?? (crowded ? fitted : theme.fontSize);
        const twoLines = wrapped && Boolean(fittedLineHeight) && (fittedLimit ?? 0) > 0;
        // Names the choice trimmed keep its trim; otherwise a theme that never truncates draws them whole.
        const cut = decided?.trimmed === true || sizing.labelCut === true;
        const limit = twoLines || cut ? fittedLimit : theme.noLimit ? 0 : fittedLimit;
        const lineHeight = twoLines ? Math.ceil(fontSize * 1.2) : fittedLineHeight;
        return {
            fontSize,
            ...(theme.font !== undefined ? { font: theme.font } : {}),
            ...(limit !== undefined ? { limit } : {}),
            ...(separation !== undefined ? { separation } : {}),
            ...(lineHeight !== undefined ? { lineHeight } : {}),
            ...fittedAngle,
            ...(crowded ? { crowdedFrom: theme.fontSize } : {}),
            ...overflowFit,
            ...(channel === 'x' && theme.timeContext ? { timeContext: theme.timeContext } : {}),
        };
    };
    return { x: plan('x'), y: plan('y') };
}

/**
 * The first step of a path that holds, for a renderer that refits names across a panel (Plotly):
 * `wrap` there is a trim to the band (four characters and an ellipsis must stand), `skip` holds on
 * an ordered axis, a turn needs the band to hold the turned line (its height, times √2 at −45°).
 * Past the path: upright. Any step trims where the names overrun and trimming is allowed.
 */
export function chooseLabelStep(
    steps: readonly LabelFitStep[],
    at: { band: number; widest: number; fontSize: number; turnLimit: number; noTrim?: boolean; ordered?: boolean },
): { step: LabelFitStep; trimmed: boolean } {
    const line = at.fontSize * 1.2;
    const turnTrim = !at.noTrim && at.widest > at.turnLimit;
    for (const step of steps) {
        if (step === 'wrap' && !at.noTrim && cutReads(at.band, at.fontSize)) return { step, trimmed: true };
        if (step === 'skip' && at.ordered) return { step, trimmed: false };
        if (step === 'rotate45' && at.band >= Math.ceil(line * Math.SQRT2)) return { step, trimmed: turnTrim };
        if (step === 'rotate90' && at.band >= line) return { step, trimmed: turnTrim };
    }
    return { step: 'rotate90', trimmed: turnTrim };
}

const FIT_STEPS: readonly LabelFitStep[] = ['wrap', 'skip', 'rotate45', 'rotate90'];

/** A stated path, one step or several, with anything that is not a step left out; undefined where none is stated. */
function statedSteps(stated: unknown): LabelFitStep[] | undefined {
    const list = (Array.isArray(stated) ? stated : stated != null ? [stated] : []).filter((step): step is LabelFitStep => FIT_STEPS.includes(step as LabelFitStep));
    return list.length ? list : undefined;
}

/**
 * The path a chart's x names take when they do not stand flat and whole: the chart's own
 * (`chartProperties.labelOverflow`), else the theme's `labels.overflow`, else the general path —
 * `wrap` → `rotate90` for a row of names ({@link DEFAULT_LABEL_OVERFLOW}), `wrap` → `skip` →
 * `rotate90` for a sequence ({@link DEFAULT_SEQUENCE_OVERFLOW}). Whether a step may trim is the
 * theme's `truncation`, not a step.
 */
export function resolveLabelOverflow(labels: ThemeLabels | undefined, chartOverflow?: unknown, axis: 'names' | 'sequence' = 'names'): LabelFitStep[] {
    return statedSteps(chartOverflow) ?? statedSteps(labels?.overflow)
        ?? [...(axis === 'sequence' ? DEFAULT_SEQUENCE_OVERFLOW : DEFAULT_LABEL_OVERFLOW)];
}

/** Whether a sequence keeps names flat until it runs out: no turn in it. */
export function overflowStaysFlat(sequence: readonly LabelFitStep[]): boolean {
    return !sequence.some((step) => step.startsWith('rotate'));
}
