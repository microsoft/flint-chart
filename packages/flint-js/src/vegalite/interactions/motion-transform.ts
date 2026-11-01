import { mixNumbersInText } from '../../interactive/transition';
import * as vega from 'vega';
import { INTERACTION_KEY, MARK_IDENTITY } from './stores';

/** Set on a mark's snapshot whose identity keys repeat: its items are matched by their whole row key. */
export const WHOLE_KEY_FLAG = '__flint_whole_key';
/** Set on a mark's snapshot: the identity fields its items were keyed by, which the new items are matched by. */
export const IDENTITY_FIELDS = '__flint_identity';
/**
 * Set on a mark's snapshot keyed by one of its identity fields, because that field alone told its
 * items apart: its items by their whole identity, which the new items are matched by when that one
 * field no longer tells them apart.
 */
export const WHOLE_IDENTITY = '__flint_whole_identity';

/** A position drawn through a continuous scale of a field or a constant: `scale(value) + offset`. */
export interface DataPosition {
    readonly channel: 'x' | 'x2' | 'y' | 'y2';
    readonly scale: string;
    readonly field?: string;
    readonly value?: number;
    readonly offset: number;
}

/** One end, the other end and the size of a box on one axis, and the scale whose range an arriving item waits inside. */
export interface ArrivalAxis {
    readonly start: 'x' | 'y';
    readonly end: 'x2' | 'y2';
    readonly size: 'width' | 'height';
    readonly scale: string;
}

/** One axis of a stack group's box: the scale it is placed through and the stacked fields its ends are the least and greatest of. */
export interface StackExtent {
    readonly start: 'x' | 'y';
    readonly size: 'width' | 'height';
    readonly scale: string;
    readonly fields: readonly string[];
}

/** What one mark mixes, fixed when the chart is compiled. */
export interface MarkMotion {
    readonly mark: string;
    /** Channels mixed in screen units. */
    readonly channels: readonly string[];
    readonly colours: readonly string[];
    /** Positions mixed in data units and placed through the scale as each frame draws it. */
    readonly data: readonly DataPosition[];
    /** A rect or image takes its box from both ends. */
    readonly box: boolean;
    /** An area draws from its start and its size, so its size follows the ends. */
    readonly area: boolean;
    readonly arrival: readonly ArrivalAxis[];
    readonly identity: readonly string[];
    readonly outline: boolean;
    /** A group drawn once per stack (a rounded bar's clip and outline): its items are keyed by these fields. */
    readonly groupby?: readonly string[];
    /** The fields of the facets a stack group is drawn in, read from its enclosing groups, so each panel's stacks keep apart. */
    readonly scope?: readonly string[];
    /** The axes a stack group spans from its rows' least to greatest stacked value, mixed in data units. */
    readonly extents?: readonly StackExtent[];
    /** Every channel the motion can write. */
    readonly written: readonly string[];
}

/** Where a frame stands: the move stage's progress and the arrive stage's. */
export interface MotionFrame {
    readonly t: number;
    readonly enter: number;
}

/** How a frame reads the chart's scales. */
export interface MotionScales {
    place(scale: string, value: number): number;
    range(scale: string): readonly [number, number];
}

type Colour = { r: number; g: number; b: number };

const PAIRS = [['x', 'x2', 'width'], ['y', 'y2', 'height']] as const;
const isNumber = (value: unknown): value is number => typeof value === 'number';
const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

/** The row's name across data changes: its identity fields joined, or its own key when one is missing. */
export function identityKey(datum: Record<string, unknown>, fields: readonly string[]): unknown {
    if (fields.length > 0 && fields.every((field) => datum[field] !== null && datum[field] !== undefined && !Number.isNaN(datum[field]))) {
        return fields.map((field) => String(datum[field])).join('|');
    }
    return datum[INTERACTION_KEY];
}

/**
 * What names a drawn item as an element a change can follow: its row's key, or for a row an
 * aggregate drew (which keeps no row key), the identity fields it kept. Nothing for an item that
 * names no element.
 */
export function trackedKey(datum: Record<string, unknown> | undefined, fields: readonly string[]): string | undefined {
    const own = datum?.[INTERACTION_KEY];
    if (typeof own === 'string') return own;
    const named = datum && fields.length > 0 ? identityKey(datum, fields) : undefined;
    return typeof named === 'string' ? named : undefined;
}

/** The data value a position draws for a row. */
export function dataValue(datum: Record<string, unknown> | undefined, position: DataPosition): number | null {
    if (position.field === undefined) return position.value ?? null;
    const value = datum?.[position.field];
    return value === null || value === undefined || value === '' ? null : Number(value);
}

let parseColour: ((value: string) => Colour) | undefined;
// A chart draws few colours, so each is parsed once rather than on every frame for every item.
const parsedColours = new Map<string, Colour | undefined>();
const colourOf = (value: string): Colour | undefined => {
    if (parsedColours.has(value)) return parsedColours.get(value);
    parseColour ??= vega.expressionFunction('rgb') as unknown as (value: string) => Colour;
    const parsed = parseColour(value);
    const colour = Number.isNaN(parsed?.r) ? undefined : { r: parsed.r, g: parsed.g, b: parsed.b } as Colour;
    if (parsedColours.size >= 1024) parsedColours.clear();
    parsedColours.set(value, colour);
    return colour;
};

function mixColour(from: string, to: string, t: number): string | undefined {
    const a = colourOf(from);
    const b = colourOf(to);
    if (!a || !b) return undefined;
    const part = (key: keyof Colour) => Math.round(a[key] + (b[key] - a[key]) * t);
    return `rgb(${part('r')},${part('g')},${part('b')})`;
}

/**
 * Mixes one item of a mark with a snapshot from what it drew before toward what it draws now, in
 * place. `from` is the item's captured state, or nothing for an item new to the chart. Returns the
 * data values its positions stand at in this frame.
 */
export function mixItem(
    item: Record<string, any>,
    from: Record<string, any> | null | undefined,
    motion: MarkMotion,
    frame: MotionFrame,
    scales: MotionScales,
    tracked: boolean = trackedKey(item.datum, motion.identity) !== undefined,
): Record<string, number> | undefined {
    const known = from !== null && from !== undefined;
    if (known) {
        for (const channel of motion.channels) {
            const was = from[channel];
            const now = item[channel];
            if (isNumber(was) && isNumber(now)) item[channel] = was + (now - was) * frame.t;
        }
    }
    let units: Record<string, number> | undefined;
    const placed: Partial<Record<DataPosition['channel'], number | null>> = {};
    for (const position of motion.data) {
        const value = dataValue(item.datum, position);
        const was = known ? from[`__d_${position.channel}`] : undefined;
        const mixed = isNumber(was) && isNumber(value) ? was + (value - was) * frame.t : value;
        if (isNumber(mixed)) (units ??= {})[position.channel] = mixed;
        placed[position.channel] = isNumber(was) && isNumber(mixed) ? scales.place(position.scale, mixed) + position.offset : null;
    }
    for (const extent of motion.extents ?? []) {
        if (!known) continue;
        const ends: number[] = [];
        for (const field of extent.fields) {
            const raw = item.datum?.[field];
            const value = raw === null || raw === undefined || raw === '' ? null : Number(raw);
            const was = from[`__d_${field}`];
            if (!isNumber(value) || !isNumber(was)) continue;
            const mixed = was + (value - was) * frame.t;
            (units ??= {})[field] = mixed;
            ends.push(scales.place(extent.scale, mixed));
        }
        if (ends.length === 0) continue;
        item[extent.start] = Math.min(...ends);
        item[extent.size] = Math.max(...ends) - Math.min(...ends);
    }
    for (const [start, end, size] of PAIRS) {
        const a = placed[start];
        const b = placed[end];
        if (motion.box && start in placed && end in placed) {
            if (isNumber(a) && isNumber(b)) {
                item[start] = Math.min(a, b);
                item[size] = Math.abs(a - b);
            }
            continue;
        }
        if (isNumber(a)) item[start] = a;
        if (!motion.box && isNumber(b)) item[end] = b;
    }
    if (motion.area) {
        for (const [start, end, size] of PAIRS) {
            if (isNumber(item[end]) && isNumber(item[size])) item[size] = item[end] - item[start];
        }
    }
    const entering = !known && (motion.groupby !== undefined || tracked);
    // An item that arrives waits at the plot's edge until it fades in, so it takes no room from the
    // title, the axes or the panels. Every item's far end follows its start and size.
    const waiting = entering && frame.enter <= 0;
    for (const { start, end, size, scale } of motion.arrival) {
        const range = waiting ? scales.range(scale) : undefined;
        const hold = (value: number): number => (range ? clamp(value, Math.min(range[0], range[1]), Math.max(range[0], range[1])) : value);
        const far = isNumber(item[size]) ? item[start] + item[size] : isNumber(item[end]) ? item[end] : null;
        if (isNumber(item[start])) item[start] = hold(item[start]);
        const reach = isNumber(far) ? hold(far) : far;
        if (isNumber(item[size]) && isNumber(reach)) item[size] = reach - item[start];
        if (isNumber(item[end]) && isNumber(reach)) item[end] = reach;
    }
    if (known && typeof from.text === 'string' && typeof item.text === 'string') {
        const counted = mixNumbersInText(from.text, item.text, frame.t);
        if (counted !== undefined) item.text = counted;
    }
    if (known) {
        for (const channel of motion.colours) {
            const was = from[channel];
            const now = item[channel];
            if (typeof was !== 'string' || typeof now !== 'string' || was === now) continue;
            const mixed = mixColour(was, now, frame.t);
            if (mixed) item[channel] = mixed;
        }
    }
    if (entering && motion.groupby) {
        // A stack group fades its own fill and outline, not the bars inside it.
        item.fillOpacity = (isNumber(item.fillOpacity) ? item.fillOpacity : 1) * frame.enter;
        item.strokeOpacity = (isNumber(item.strokeOpacity) ? item.strokeOpacity : 1) * frame.enter;
    } else if (entering) {
        item.opacity = (isNumber(item.opacity) ? item.opacity : 1) * frame.enter;
    }
    return units;
}

/** What a view's motion knows beyond its signals: each mark's description and the state of the frame on screen. */
interface ViewMotion {
    readonly marks: Map<string, MarkMotion>;
    /** Per item, the data values its positions stand at in the frame on screen; empty at rest. */
    units: WeakMap<object, Record<string, number>>;
    /** Whether `units` holds anything since it was last emptied. */
    mixed: boolean;
    /** Per mark snapshot keyed by one field, whether the new items repeat that field and so are matched whole. */
    narrowing: WeakMap<object, boolean>;
    /** Per item of an outline, the point it starts from in the current motion. */
    outlineStarts: WeakMap<object, Record<string, unknown>>;
}

const viewMotions = new WeakMap<object, ViewMotion>();

function viewMotion(view: object): ViewMotion {
    let state = viewMotions.get(view);
    if (!state) {
        state = { marks: new Map(), units: new WeakMap(), mixed: false, narrowing: new WeakMap(), outlineStarts: new WeakMap() };
        viewMotions.set(view, state);
    }
    return state;
}

/** The data value an item's position stands at on screen: mid-motion, the mixed one; at rest, its row's. */
export function drawnDataValue(view: object, item: Record<string, any>, channel: DataPosition['channel']): number | undefined {
    const state = viewMotions.get(view);
    const mixed = state?.units.get(item)?.[channel];
    if (isNumber(mixed)) return mixed;
    const position = state?.marks.get(item.mark?.name)?.data.find((entry) => entry.channel === channel);
    const value = position ? dataValue(item.datum, position) : null;
    return isNumber(value) ? value : undefined;
}

/** A stack group's key: its stack's fields, then the fields of the panel it is drawn in. */
export function stackKey(item: Record<string, any>, motion: MarkMotion): string | undefined {
    const own = item.datum ? identityKey(item.datum, motion.groupby ?? []) : undefined;
    if (typeof own !== 'string') return undefined;
    const scope = (motion.scope ?? []).map((field) => {
        for (let group = item.mark?.group; group; group = group.mark?.group) {
            const value = group.datum?.[field];
            if (value !== undefined && value !== null) return String(value);
        }
        return '';
    });
    return scope.length > 0 ? `${own}\u0000${scope.join('|')}` : own;
}

/** The motion of a stack group, once it has run; undefined for any other mark. */
export function stackGroupMotion(view: object, mark: string): MarkMotion | undefined {
    const motion = viewMotions.get(view)?.marks.get(mark);
    return motion?.groupby ? motion : undefined;
}

/** The value a stack group's field stands at on screen: mid-motion, the mixed one; at rest, its row's. */
export function drawnFieldValue(view: object, item: Record<string, any>, field: string): number | undefined {
    const mixed = viewMotions.get(view)?.units.get(item)?.[field];
    if (isNumber(mixed)) return mixed;
    const raw = item.datum?.[field];
    const value = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
    return Number.isFinite(value) ? value : undefined;
}

/** Starts a motion's outline starts afresh, so a start placed by an earlier motion never applies. */
export function resetOutlineStarts(view: object): WeakMap<object, Record<string, unknown>> {
    const state = viewMotion(view);
    state.outlineStarts = new WeakMap();
    return state.outlineStarts;
}

function scalesOf(view: any): MotionScales {
    return {
        place: (scale, value) => view.scale(scale)(value),
        range: (scale) => {
            const range = view.scale(scale).range();
            return [range[0], range[range.length - 1]];
        },
    };
}

const Transform = (vega as any).Transform as new (init: unknown, params: unknown) => any;

/**
 * A post-encoding transform that mixes a mark's items while a motion runs. At rest the snapshot is
 * null and it passes the pulse through untouched, so a chart that is not moving draws its items
 * exactly as its encoding does.
 */
class FlintMotion extends Transform {
    static Definition = {
        type: 'FlintMotion',
        metadata: { modifies: true },
        params: [
            { name: 'motion', type: 'object', required: true },
            { name: 'from', type: 'object' },
            { name: 't', type: 'number' },
            { name: 'enter', type: 'number' },
            { name: 'outline', type: 'number' },
        ],
    };

    constructor(params: unknown) {
        super(null, params);
    }

    transform(params: any, pulse: any): any {
        const motion = params.motion as MarkMotion;
        const view = pulse.dataflow;
        const state = viewMotion(view);
        state.marks.set(motion.mark, motion);
        const snapshot = params.from as Record<string, any> | null;
        if (!snapshot) {
            // At rest the mixed values are dropped once, not on every pulse.
            if (state.mixed) {
                state.units = new WeakMap();
                state.mixed = false;
            }
            return pulse;
        }
        const markFrom = snapshot[motion.mark] as Record<string, any> | null | undefined;
        const starts = motion.outline && params.outline !== null && params.outline !== undefined ? state.outlineStarts : undefined;
        // A mark the snapshot does not hold draws as it is, unless its outline has starts.
        if ((markFrom === null || markFrom === undefined) && !starts) return pulse;
        const modified = params.modified();
        const out = modified ? pulse.materialize().reflow(true) : pulse;
        out.modifies(motion.written);
        const frame: MotionFrame = { t: params.t, enter: params.enter };
        const scales = scalesOf(view);
        const whole = Boolean(markFrom?.[WHOLE_KEY_FLAG]);
        let identity = (markFrom?.[IDENTITY_FIELDS] as readonly string[] | undefined) ?? motion.identity;
        let entries = markFrom;
        const wider = markFrom?.[WHOLE_IDENTITY] as { fields: readonly string[]; entries: Record<string, any> } | undefined;
        if (wider) {
            let repeats = state.narrowing.get(markFrom!);
            if (repeats === undefined) {
                const seen = new Set<unknown>();
                repeats = ((pulse.source ?? []) as any[]).some((item: any) => {
                    const key = item.datum ? identityKey(item.datum, identity) : undefined;
                    if (seen.has(key)) return true;
                    seen.add(key);
                    return false;
                });
                state.narrowing.set(markFrom!, repeats!);
            }
            if (repeats) {
                identity = wider.fields;
                entries = wider.entries;
            }
        }
        const units = state.units;
        return out.visit(modified ? out.SOURCE : out.ADD_MOD, (item: Record<string, any>) => {
            const start = starts?.get(item);
            if (!start && !markFrom) return;
            const stated = item.datum?.[MARK_IDENTITY];
            const tracked = trackedKey(item.datum, identity);
            const key = motion.groupby ? stackKey(item, motion)
                : typeof stated === 'string' ? stated : whole ? tracked : item.datum ? identityKey(item.datum, identity) : undefined;
            const from = start ?? (item.datum ? entries![key as string] : null);
            const mixed = mixItem(item, from, motion, frame, scales, tracked !== undefined);
            if (mixed) {
                units.set(item, mixed);
                state.mixed = true;
            }
        });
    }
}

/** Lets Vega parse `{ type: 'flintmotion' }`; safe to call more than once. */
export function registerMotionTransform(): void {
    const registry = (vega as any).transforms as Record<string, unknown>;
    registry.flintmotion ??= FlintMotion;
}
