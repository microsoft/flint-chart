import * as vega from 'vega';
import { INTERACTION_KEY } from './stores';

/** Set on a mark's snapshot whose identity keys repeat: its items are matched by their whole row key. */
export const WHOLE_KEY_FLAG = '__flint_whole_key';

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

/** The data value a position draws for a row. */
export function dataValue(datum: Record<string, unknown> | undefined, position: DataPosition): number | null {
    if (position.field === undefined) return position.value ?? null;
    const value = datum?.[position.field];
    return value === null || value === undefined || value === '' ? null : Number(value);
}

let parseColour: ((value: string) => Colour) | undefined;
const colourOf = (value: string): Colour | undefined => {
    parseColour ??= vega.expressionFunction('rgb') as unknown as (value: string) => Colour;
    const colour = parseColour(value);
    return Number.isNaN(colour?.r) ? undefined : colour;
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
    const entering = !known && typeof item.datum?.[INTERACTION_KEY] === 'string';
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
    if (known) {
        for (const channel of motion.colours) {
            const was = from[channel];
            const now = item[channel];
            if (typeof was !== 'string' || typeof now !== 'string' || was === now) continue;
            const mixed = mixColour(was, now, frame.t);
            if (mixed) item[channel] = mixed;
        }
    }
    if (entering) item.opacity = (isNumber(item.opacity) ? item.opacity : 1) * frame.enter;
    return units;
}

/** What a view's motion knows beyond its signals: each mark's description and the state of the frame on screen. */
interface ViewMotion {
    readonly marks: Map<string, MarkMotion>;
    /** Per item, the data values its positions stand at in the frame on screen; empty at rest. */
    units: WeakMap<object, Record<string, number>>;
    /** Per item of an outline, the point it starts from in the current motion. */
    outlineStarts: WeakMap<object, Record<string, unknown>>;
}

const viewMotions = new WeakMap<object, ViewMotion>();

function viewMotion(view: object): ViewMotion {
    let state = viewMotions.get(view);
    if (!state) {
        state = { marks: new Map(), units: new WeakMap(), outlineStarts: new WeakMap() };
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
            state.units = new WeakMap();
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
        const units = state.units;
        return out.visit(modified ? out.SOURCE : out.ADD_MOD, (item: Record<string, any>) => {
            const start = starts?.get(item);
            if (!start && !markFrom) return;
            const key = whole ? item.datum?.[INTERACTION_KEY] : item.datum ? identityKey(item.datum, motion.identity) : undefined;
            const from = start ?? (item.datum ? markFrom![key as string] : null);
            const mixed = mixItem(item, from, motion, frame, scales);
            if (mixed) units.set(item, mixed);
        });
    }
}

/** Lets Vega parse `{ type: 'flintmotion' }`; safe to call more than once. */
export function registerMotionTransform(): void {
    const registry = (vega as any).transforms as Record<string, unknown>;
    registry.flintmotion ??= FlintMotion;
}
