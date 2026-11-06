import { easingCurve, mixNumbersInText, runMotion } from './transition';
import type { TransitionEasing } from './types';

/** One drawn item of a chart, in the coordinates of the element the chart renders into. */
export interface MorphItem {
    readonly type: string;
    readonly datum: Record<string, unknown>;
    readonly values: Record<string, unknown>;
    /** The channel the item draws its value along: a bar's length on `x` or `y`, a wedge's sweep (`theta`) or reach (`radius`). */
    readonly valueChannel?: MorphValueChannel;
    /** The scene item it was read from, so the frame leaves to the morph what the morph draws. */
    readonly source?: unknown;
    /** A scene node the item draws a share of (an area its slice belongs to), left to the morph with it. */
    readonly covers?: unknown;
    /** For a point laid out in polar coordinates (a radar's), the centre its angle and reach are read about. */
    readonly centre?: Point;
}

export type MorphValueChannel = 'x' | 'y' | 'theta' | 'radius';

export interface MorphScene {
    readonly items: readonly MorphItem[];
    /** The fields that name a row across charts. */
    readonly fields: readonly string[];
}

/** One drawn piece of a chart: a mark item, an axis label, a gridline, a title, a group's background. */
export interface FramePart {
    /** What the part shows, matched across charts by meaning; none when it has no counterpart. */
    readonly key?: string;
    /** The part's top-left corner, in the coordinates of the element the chart renders into. */
    readonly x: number;
    readonly y: number;
    /** The part's size; a rule or a box with a counterpart grows to the counterpart's. */
    readonly width: number;
    readonly height: number;
    /** The scene item it draws, when it draws one. */
    readonly item?: unknown;
    /** A text part's anchor, in the same coordinates as `x` and `y`, its angle in degrees, and its font size. */
    readonly text?: FrameText;
}

export interface FrameText {
    readonly x: number;
    readonly y: number;
    readonly angle: number;
    readonly fontSize: number;
    /** What the text says. */
    readonly content?: string;
}

/** Where a part is drawn in one frame: moved by `dx`, `dy`, sized `width` by `height`, and faded by `opacity`. */
export interface FramePose {
    readonly dx: number;
    readonly dy: number;
    readonly width: number;
    readonly height: number;
    readonly opacity: number;
    /** Where a text part's anchor stands, how far it has turned, and how large it is drawn. */
    readonly text?: FrameText;
}

/** Everything a chart draws, as parts, and a way to draw them posed on another layer. */
export interface FrameScene {
    readonly parts: readonly FramePart[];
    /** The extent the chart draws over, from the element's top-left. */
    readonly width: number;
    readonly height: number;
    draw(
        layer: HTMLElement,
        size: { width: number; height: number },
        withBackground: boolean,
    ): { render(poses: readonly FramePose[]): void; destroy(): void };
}

/** What a renderer offers a morph: its drawn items and parts, and a way to stop drawing them while a layer does. */
export interface MorphSource {
    morphScene?(): MorphScene | undefined;
    frameScene?(options?: { byPlace?: boolean }): FrameScene | undefined;
    setDrawnHidden?(hidden: boolean): void;
}

/** Past this many items or parts on either side a change of chart cross-fades. */
const MAX_MORPHED_ITEMS = 1000;
/** Points every outline is sampled at, a quarter per side of its band-by-value square. */
const OUTLINE_POINTS = 48;
const QUARTER = OUTLINE_POINTS / 4;
const SVG_NS = 'http://www.w3.org/2000/svg';

export type Point = readonly [number, number];
/** A point of a wedge, by its angle (clockwise from twelve o'clock) and its distance from the centre. */
type Polar = readonly [angle: number, radius: number];

const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const clamp = (value: number): number => Math.min(1, Math.max(0, value));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixPoint = (a: Point, b: Point, t: number): Point => [mix(a[0], b[0], t), mix(a[1], b[1], t)];

/**
 * The outline of a band-by-value square: up the side where the band starts, across the value's
 * end, down the far side, back along the base. `place(u, v)` puts a point of the square on the
 * mark, `u` across its band and `v` along its value, so two marks walked this way meet edge to
 * edge by role: a bar's length becomes a wedge's sweep, its base the wedge's starting edge.
 */
function walk<P>(place: (u: number, v: number) => P): P[] {
    const out: P[] = [];
    for (let step = 0; step < QUARTER; step += 1) out.push(place(0, step / QUARTER));
    for (let step = 0; step < QUARTER; step += 1) out.push(place(step / QUARTER, 1));
    for (let step = 0; step < QUARTER; step += 1) out.push(place(1, 1 - step / QUARTER));
    for (let step = 0; step < QUARTER; step += 1) out.push(place(1 - step / QUARTER, 0));
    return out;
}

/** How far a dot reaches from its centre: a symbol's size, a line vertex's stroke. */
const dotRadius = (item: MorphItem): number =>
    (item.type === 'line' ? Math.max(1.5, num(item.values.strokeWidth, 2)) : Math.sqrt(num(item.values.size, 64) / Math.PI));

/** The centre a polar item stands about: a wedge's own, or the one a point states. */
const centreOfItem = (item: MorphItem): Point => item.centre ?? [num(item.values.x), num(item.values.y)];

/** A wedge's point on screen. */
const onScreen = (cx: number, cy: number, [angle, radius]: Polar): Point => [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)];

/**
 * Where a wedge's band-by-value square lies, in angle and radius. Every mark's square is laid
 * with the same turn (band, then value, clockwise on screen), so no outline flips inside out.
 */
function polarPlace(item: MorphItem): ((u: number, v: number) => Polar) | undefined {
    if (item.centre && (item.type === 'symbol' || item.type === 'line')) {
        // A point is a small wedge about its own angle and reach, as wide as the dot drawn there.
        const x = num(item.values.x) - item.centre[0];
        const y = num(item.values.y) - item.centre[1];
        const reach = Math.hypot(x, y);
        const angle = (Math.atan2(x, -y) + 2 * Math.PI) % (2 * Math.PI);
        const dot = dotRadius(item);
        const half = dot / Math.max(reach, dot);
        return (across, along) => [mix(angle + half, angle - half, across), Math.max(0, mix(reach - dot, reach + dot, along))];
    }
    if (item.type !== 'arc') return undefined;
    const v = item.values;
    const start = num(v.startAngle);
    const end = num(v.endAngle);
    const inner = num(v.innerRadius);
    const outer = num(v.outerRadius);
    return item.valueChannel === 'radius'
        ? (across, along) => [mix(end, start, across), mix(inner, outer, along)]
        : (across, along) => [mix(start, end, along), mix(inner, outer, across)];
}

/** Where a mark's band-by-value square lies on screen: a bar's box, a wedge, a dot's disc. */
function place(item: MorphItem): ((u: number, v: number) => Point) | undefined {
    const v = item.values;
    const x = num(v.x);
    const y = num(v.y);
    if (item.type === 'rect') {
        const width = num(v.width);
        const height = num(v.height);
        return item.valueChannel === 'x'
            ? (across, along) => [x + along * width, y + height - across * height]
            : (across, along) => [x + width - across * width, y + height - along * height];
    }
    if (item.type === 'symbol' || item.type === 'line') {
        const radius = dotRadius(item);
        return (across, along) => {
            const dx = 1 - 2 * across;
            const dy = 1 - 2 * along;
            const length = Math.hypot(dx, dy) || 1;
            return [x + (radius * dx) / length, y + (radius * dy) / length];
        };
    }
    const polar = polarPlace(item);
    return polar && ((across, along) => onScreen(x, y, polar(across, along)));
}

function parseColour(value: unknown): [number, number, number] | undefined {
    if (typeof value !== 'string') return undefined;
    const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
    if (hex) {
        const full = hex.length === 3 ? hex.split('').map((digit) => digit + digit).join('') : hex;
        return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16)) as [number, number, number];
    }
    const rgb = value.match(/^rgba?\(([^)]+)\)$/i)?.[1]?.split(',').map((part) => Number(part.trim()));
    return rgb && rgb.length >= 3 && rgb.slice(0, 3).every(Number.isFinite) ? [rgb[0]!, rgb[1]!, rgb[2]!] : undefined;
}

function mixColour(from: unknown, to: unknown, t: number): string | undefined {
    const a = parseColour(from);
    const b = parseColour(to);
    if (!a || !b) return (t < 0.5 ? from : to) as string | undefined;
    return `rgb(${a.map((channel, index) => Math.round(channel + (b[index]! - channel) * t)).join(',')})`;
}

const keyOf = (item: MorphItem, fields: readonly string[]): string =>
    fields.map((field) => String(item.datum[field])).join('\u0000');

interface Pair {
    readonly from?: MorphItem;
    readonly to?: MorphItem;
    /**
     * A copy of the one item a key names on one side, made for each further item the key names on
     * the other: merging items leave it over the last quarter, splitting ones arrive over the first.
     */
    readonly copy?: 'merge' | 'split';
}

/**
 * Items paired by the identity both charts share. A key one item holds on each side pairs those
 * two. A key one item holds on one side and several on the other pairs that item with each of
 * them: the several merge into it, or it splits into them. A key several hold on both sides names
 * no element, so those items leave and arrive.
 */
function pairItems(from: MorphScene, to: MorphScene): Pair[] | undefined {
    const fields = from.fields.filter((field) => to.fields.includes(field));
    if (fields.length === 0) return undefined;
    const byKey = (scene: MorphScene): Map<string, MorphItem[]> => {
        const keyed = new Map<string, MorphItem[]>();
        for (const item of scene.items) {
            if (!place(item)) continue;
            const key = keyOf(item, fields);
            keyed.set(key, [...(keyed.get(key) ?? []), item]);
        }
        return keyed;
    };
    const fromKeys = byKey(from);
    const toKeys = byKey(to);
    const pairs: Pair[] = [];
    for (const [key, items] of toKeys) {
        const others = fromKeys.get(key) ?? [];
        fromKeys.delete(key);
        if (others.length === 1) {
            items.forEach((item, index) => pairs.push({ from: others[0], to: item, ...(index > 0 ? { copy: 'split' as const } : {}) }));
        } else if (items.length === 1 && others.length > 1) {
            others.forEach((item, index) => pairs.push({ from: item, to: items[0], ...(index > 0 ? { copy: 'merge' as const } : {}) }));
        } else {
            items.forEach((item) => pairs.push({ to: item }));
            others.forEach((item) => pairs.push({ from: item }));
        }
    }
    for (const items of fromKeys.values()) for (const item of items) pairs.push({ from: item });
    return pairs.some((pair) => pair.from && pair.to) ? pairs : undefined;
}

/**
 * How the items of a cartesian chart bend into those of a polar one, or back. The polar side is
 * unrolled into a straight strip where the cartesian items stand, its angle laid along the
 * cartesian axis that plays the same role (a pie's sweep along the bars' values, a rose's along
 * their bands); the strip then curls about the polar centre until it closes into the wedges.
 */
interface Bend {
    /** Where a polar point stands at bend `k`: 0 the straight strip, 1 the polar chart. */
    at(point: Polar, k: number): Point;
}

function planBend(partners: readonly { cartesian: MorphItem; polar: MorphItem }[], polar: readonly MorphItem[]): Bend | undefined {
    const wedges = polar.filter((item) => polarPlace(item));
    if (wedges.length === 0 || wedges.length !== polar.length || partners.length === 0) return undefined;
    const cartesian = partners.map((pair) => pair.cartesian);
    const [cx, cy] = centreOfItem(wedges[0]!);
    // The angle runs along the cartesian axis that plays its role: with the values, or across the bands.
    const valueAxis = cartesian.find((item) => item.valueChannel === 'x' || item.valueChannel === 'y')?.valueChannel ?? 'y';
    const angleIsValue = wedges[0]!.valueChannel !== 'radius';
    const along: Point = angleIsValue
        ? (valueAxis === 'x' ? [1, 0] : [0, -1])
        : (valueAxis === 'x' ? [0, 1] : [1, 0]);
    const outward: Point = [along[1], -along[0]];
    const outlines = cartesian.map((item) => walk(place(item)!));
    const cornersOf = (item: MorphItem): Polar[] => {
        const at = polarPlace(item)!;
        return [at(0, 0), at(1, 0), at(0, 1), at(1, 1)];
    };
    // The ring opens before the wedge paired with the first cartesian item along the strip, so the
    // items keep their order as they gather; it opens midway through the gap before that wedge, so
    // no point drawn at its angle straddles the opening.
    const position = (outline: Point[]) => Math.min(...outline.map(([x, y]) => x * along[0] + y * along[1]));
    const first = partners[outlines.reduce((best, outline, index) => (position(outline) < position(outlines[best]!) ? index : best), 0)]!;
    const opening = Math.min(...cornersOf(first.polar).map(([angle]) => angle));
    const turnOf = (angle: number) => ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const gap = Math.min(...wedges.map((item) => turnOf(opening - Math.max(...cornersOf(item).map(([angle]) => angle)))));
    const a0 = opening - gap / 2;
    const unwrap = (angle: number): number => {
        let at = angle;
        while (at < a0 - 1e-6) at += 2 * Math.PI;
        while (at > a0 + 2 * Math.PI + 1e-6) at -= 2 * Math.PI;
        return at;
    };
    const corners = wedges.flatMap(cornersOf).map(([angle, radius]): Polar => [unwrap(angle), radius]);
    const a1 = Math.max(...corners.map(([angle]) => angle));
    const outer = Math.max(...corners.map(([, radius]) => radius));
    const inner = Math.min(...corners.map(([, radius]) => radius));
    const sweep = a1 - a0;
    if (!(sweep > 0) || !(outer > 0)) return undefined;
    const xs = outlines.flat().map((point) => point[0]);
    const ys = outlines.flat().map((point) => point[1]);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const extentAlong = (direction: Point) => (direction[0] !== 0 ? Math.max(...xs) - left : Math.max(...ys) - top);
    // Dots span little along their values; the strip is at least as long as the ring is wide.
    const span = Math.max(extentAlong(along), 2 * outer);
    // The strip stands on the cartesian items, slid along its length to stay within what the two charts cover.
    const axis = along[0] !== 0 ? 0 : 1;
    const low = Math.min(axis === 0 ? left : top, (axis === 0 ? cx : cy) - outer);
    const high = Math.max(axis === 0 ? Math.max(...xs) : Math.max(...ys), (axis === 0 ? cx : cy) + outer);
    const centre: [number, number] = [(left + Math.max(...xs)) / 2, (top + Math.max(...ys)) / 2];
    if (high - low >= span) centre[axis] = Math.min(Math.max(centre[axis]!, low + span / 2), high - span / 2);
    const length = outer * sweep;
    // The strip is the unrolled ring scaled to the length the cartesian items span. Where the reach
    // carries the value (a rose, a radar), it is scaled apart, to the reach the cartesian values take.
    const scale0 = span > 0 ? span / length : 1;
    const reach0 = angleIsValue ? scale0 : Math.max(extentAlong(outward), 1) / outer;
    const depth0 = reach0 * (outer - inner);
    // The strip curls about the point of its outer edge that lands where the ring faces the way the
    // strip does, so it never turns; that point moves from the strip to the ring.
    const facing = Math.atan2(outward[0], -outward[1]);
    const anchor = clamp((unwrap(facing) - a0) / sweep);
    const anchor0: Point = [
        centre[0] + along[0] * (anchor - 0.5) * span + (outward[0] * depth0) / 2,
        centre[1] + along[1] * (anchor - 0.5) * span + (outward[1] * depth0) / 2,
    ];
    const anchor1 = onScreen(cx, cy, [a0 + anchor * sweep, outer]);
    const turn0 = Math.atan2(along[0], -along[1]);
    const turn1 = a0 + anchor * sweep + Math.PI / 2;
    const turn = ((((turn1 - turn0) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    return {
        at([angle, radius], k) {
            const scale = mix(scale0, 1, k);
            const reach = mix(reach0, 1, k);
            const share = (unwrap(angle) - a0) / sweep - anchor;
            const depth = outer - radius;
            // In the strip's own frame the anchor on its outer edge sits at the origin, its angle runs
            // up and its centre of curvature lies to the right, `outer / k` away at this bend.
            let lx: number;
            let ly: number;
            if (k < 1e-6) {
                lx = reach * depth;
                ly = -scale * share * length;
            } else {
                const curve = (scale * outer) / k;
                const r = Math.max(0, curve - reach * depth);
                const theta = -Math.PI / 2 + share * sweep * k;
                lx = curve + r * Math.sin(theta);
                ly = -r * Math.cos(theta);
            }
            const phi = turn0 + turn * k;
            return [
                lx * Math.cos(phi) - ly * Math.sin(phi) + mix(anchor0[0], anchor1[0], k),
                lx * Math.sin(phi) + ly * Math.cos(phi) + mix(anchor0[1], anchor1[1], k),
            ];
        },
    };
}

/** A bar's extents across its band and along its value, in screen coordinates. */
interface Extents {
    readonly band: readonly [number, number];
    readonly value: readonly [number, number];
}

function extentsOf(item: MorphItem): Extents {
    const x = num(item.values.x);
    const y = num(item.values.y);
    const width = num(item.values.width);
    const height = num(item.values.height);
    return item.valueChannel === 'x'
        ? { band: [y, y + height], value: [x, x + width] }
        : { band: [x, x + width], value: [y, y + height] };
}

/** A bar drawn at the given extents, oriented as `like`. */
function barAt(like: MorphItem, { band, value }: Extents): MorphItem {
    const values = like.valueChannel === 'x'
        ? { x: value[0], y: band[0], width: value[1] - value[0], height: band[1] - band[0] }
        : { x: band[0], y: value[0], width: band[1] - band[0], height: value[1] - value[0] };
    return { ...like, values: { ...like.values, ...values } };
}

const overlaps = (a: readonly [number, number], b: readonly [number, number]): boolean =>
    Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > 0.5;

/** Pairs of bars (by index) that share their band, one above the other. */
function stackedPairs(bars: readonly MorphItem[]): Set<string> {
    const extents = bars.map(extentsOf);
    const pairs = new Set<string>();
    extents.forEach((a, i) => extents.forEach((b, j) => {
        if (j > i && overlaps(a.band, b.band) && !overlaps(a.value, b.value)) pairs.add(`${i}|${j}`);
    }));
    return pairs;
}

/**
 * Between bars side by side and the same bars stacked, a bar moves one axis at a time, so none
 * sweeps through another. Bars that come to share a band rise to their places first, then slide
 * together; bars that stop sharing one slide apart first, then drop to their places. Between
 * columns and rows, the bars `turn`: the chart squashes onto its baseline, travels to the new one,
 * and grows along the new axis. Undefined when no bars join or leave a stack, or when some do each.
 */
function planAxisStages(fromBars: readonly MorphItem[], toBars: readonly MorphItem[]): 'band-first' | 'value-first' | 'turn' | undefined {
    const direction = (item: MorphItem) => (item.valueChannel === 'x' ? 'x' : 'y');
    const directions = new Set([...fromBars, ...toBars].map(direction));
    const uniform = (bars: readonly MorphItem[]) => bars.every((bar) => direction(bar) === direction(bars[0]!));
    if (directions.size > 1) return uniform(fromBars) && uniform(toBars) ? 'turn' : undefined;
    const before = stackedPairs(fromBars);
    const after = stackedPairs(toBars);
    const joining = [...after].some((pair) => !before.has(pair));
    const leaving = [...before].some((pair) => !after.has(pair));
    if (joining === leaving) return undefined;
    return joining ? 'value-first' : 'band-first';
}

const centreOf = (item: MorphItem): string => centreOfItem(item).map(Math.round).join('|');

/**
 * A bend for each ring the polar side draws (a pie per panel has one per panel), planned with the
 * cartesian items paired to that ring's wedges, keyed by the polar items it moves.
 */
function planBends(pairs: readonly Pair[], polarSide: 'from' | 'to'): Map<MorphItem, Bend> | undefined {
    const cartesianSide = polarSide === 'from' ? 'to' : 'from';
    const rings = new Map<string, { polar: MorphItem[]; partners: { cartesian: MorphItem; polar: MorphItem }[] }>();
    for (const pair of pairs) {
        const polar = pair[polarSide];
        if (!polar) continue;
        const ring = rings.get(centreOf(polar)) ?? { polar: [], partners: [] };
        ring.polar.push(polar);
        const partner = pair[cartesianSide];
        if (partner) ring.partners.push({ cartesian: partner, polar });
        rings.set(centreOf(polar), ring);
    }
    const bends = new Map<MorphItem, Bend>();
    for (const { polar, partners } of rings.values()) {
        const bend = planBend(partners, polar);
        if (bend) for (const item of polar) bends.set(item, bend);
    }
    return bends.size > 0 ? bends : undefined;
}

/** How thick a chart squashed onto its baseline is drawn, so its bars stay in sight while they travel. */
const FLAT = 2;

/**
 * A chart's bars squashed onto the baseline they share (the value-span end most bars meet at; on a
 * tie, the bottom of a column or the left of a row), scaled about it until the farthest end is
 * `FLAT` away, so each frame on the way down is the same chart on a shrinking scale.
 */
function squash(bars: readonly MorphItem[]): Map<MorphItem, MorphItem> {
    const counts = new Map<number, number>();
    for (const bar of bars) for (const end of extentsOf(bar).value) counts.set(Math.round(end), (counts.get(Math.round(end)) ?? 0) + 1);
    const across = bars[0]?.valueChannel === 'x';
    const base = [...counts.entries()].sort(([a, ca], [b, cb]) => cb - ca || (across ? a - b : b - a))[0]?.[0] ?? 0;
    const reach = Math.max(FLAT, ...bars.flatMap((bar) => extentsOf(bar).value.map((end) => Math.abs(end - base))));
    const scale = FLAT / reach;
    return new Map(bars.map((bar) => {
        const { band, value } = extentsOf(bar);
        const squashed = value.map((end) => base + (end - base) * scale) as [number, number];
        return [bar, barAt(bar, { band, value: [Math.min(...squashed), Math.max(...squashed)] })];
    }));
}

/** One paired or lone item's outline and look at progress `t`. */
interface MorphShape {
    readonly points: (t: number) => Point[];
    readonly fill: (t: number) => unknown;
    readonly opacity: (t: number) => number;
}

/**
 * Each item's outline over a change of chart. Items in one coordinate system move point by point
 * between outlines matched by role. Between a cartesian and a polar chart the change runs in two
 * stages that share the duration: the cartesian items gather into the unrolled strip of the polar
 * chart, then the strip bends into it; going back, the stages run the other way. Between two
 * polar charts about one centre the outlines move in angle and radius. `ease` shapes each stage.
 */
export function planMorph(
    from: MorphScene,
    to: MorphScene,
    ease: (t: number) => number = (t) => t,
): { shapes: MorphShape[]; drawn: ReadonlySet<unknown> } | undefined {
    if (from.items.length > MAX_MORPHED_ITEMS || to.items.length > MAX_MORPHED_ITEMS) return undefined;
    const pairs = pairItems(from, to);
    if (!pairs) return undefined;
    const isPolar = (item: MorphItem): boolean => polarPlace(item) !== undefined;
    const fromItems = pairs.flatMap((pair) => (pair.from ? [pair.from] : []));
    const toItems = pairs.flatMap((pair) => (pair.to ? [pair.to] : []));
    const fromPolar = fromItems.every(isPolar);
    const toPolar = toItems.every(isPolar);
    const fromCartesian = !fromItems.some(isPolar);
    const toCartesian = !toItems.some(isPolar);
    const backwards = fromPolar && toCartesian;
    const bends = fromCartesian && toPolar ? planBends(pairs, 'to') : backwards ? planBends(pairs, 'from') : undefined;
    const matched = pairs.filter((pair): pair is Required<Pair> => Boolean(pair.from && pair.to));
    const axisStages = !bends && matched.every((pair) => pair.from.type === 'rect' && pair.to.type === 'rect')
        ? planAxisStages(matched.map((pair) => pair.from), matched.map((pair) => pair.to))
        : undefined;
    const fromSquashed = squash(matched.map((pair) => pair.from));
    const toSquashed = squash(matched.map((pair) => pair.to));
    const sharedCentre = fromPolar && toPolar && fromItems.length > 0 && toItems.length > 0
        && fromItems.concat(toItems).every((item) => centreOf(item) === centreOf(fromItems[0]!));
    const fillOf = (item: MorphItem | undefined) => item?.values.fill ?? item?.values.stroke;
    const opacityOf = (item: MorphItem | undefined) => num(item?.values.opacity, 1) * num(item?.values.fillOpacity, 1);
    const shapes = pairs.map((pair): MorphShape => {
        const start = pair.from ? walk(place(pair.from)!) : undefined;
        const end = pair.to ? walk(place(pair.to)!) : undefined;
        let points: (t: number) => Point[];
        const polarItem = backwards ? pair.from : pair.to;
        const bend = polarItem && bends?.get(polarItem);
        if (bend && pair.from && pair.to) {
            const cartesian = backwards ? end! : start!;
            const wedge = walk(polarPlace(backwards ? pair.from : pair.to)!);
            const strip = wedge.map((point) => bend.at(point, 0));
            // Forward: gather into the strip over the first half, bend over the second.
            const forward = (t: number): Point[] => (t <= 0.5
                ? cartesian.map((point, index) => mixPoint(point, strip[index]!, ease(t * 2)))
                : wedge.map((point) => bend.at(point, ease(t * 2 - 1))));
            points = backwards ? (t) => forward(1 - t) : forward;
        } else if (axisStages === 'turn' && pair.from && pair.to) {
            const low = walk(place(fromSquashed.get(pair.from)!)!);
            const high = walk(place(toSquashed.get(pair.to)!)!);
            const between = (a: Point[], b: Point[], t: number) => a.map((point, index) => mixPoint(point, b[index]!, ease(t)));
            points = (t) => (t <= 1 / 3 ? between(start!, low, t * 3) : t <= 2 / 3 ? between(low, high, t * 3 - 1) : between(high, end!, t * 3 - 2));
        } else if (axisStages && pair.from && pair.to) {
            const a = extentsOf(pair.from);
            const b = extentsOf(pair.to);
            const middle = walk(place(barAt(pair.from, axisStages === 'band-first'
                ? { band: b.band, value: a.value }
                : { band: a.band, value: b.value }))!);
            points = (t) => (t <= 0.5
                ? start!.map((point, index) => mixPoint(point, middle[index]!, ease(t * 2)))
                : middle.map((point, index) => mixPoint(point, end![index]!, ease(t * 2 - 1))));
        } else if (sharedCentre && pair.from && pair.to) {
            const a = walk(polarPlace(pair.from)!);
            const b = walk(polarPlace(pair.to)!);
            const [cx, cy] = centreOfItem(pair.to);
            points = (t) => a.map(([angle, radius], index) =>
                onScreen(cx, cy, [mix(angle, b[index]![0], ease(t)), mix(radius, b[index]![1], ease(t))]));
        } else if (start && end) {
            points = (t) => start.map((point, index) => mixPoint(point, end[index]!, ease(t)));
        } else {
            const lone = (start ?? end)!;
            points = () => lone;
        }
        const both = Boolean(pair.from && pair.to);
        return {
            points,
            fill: (t) => (both ? mixColour(fillOf(pair.from), fillOf(pair.to), ease(t)) : fillOf(pair.from ?? pair.to)),
            // A lone item leaves in the first quarter or arrives in the last, as the frame's parts do.
            opacity: (t) => {
                if (!both) return pair.from ? opacityOf(pair.from) * (1 - clamp(t * 4)) : opacityOf(pair.to) * clamp(t * 4 - 3);
                const share = pair.copy === 'merge' ? 1 - clamp(t * 4 - 3) : pair.copy === 'split' ? clamp(t * 4) : 1;
                return mix(opacityOf(pair.from), opacityOf(pair.to), ease(t)) * share;
            },
        };
    });
    const drawn = new Set(pairs.flatMap((pair) => [pair.from?.source, pair.to?.source, pair.from?.covers, pair.to?.covers])
        .filter((item) => item !== undefined));
    return { shapes, drawn };
}

/** An SVG layer that draws `from` turning into `to`; `render(t)` draws the frame at t in [0, 1]. */
export function buildMorph(
    from: MorphScene,
    to: MorphScene,
    ease?: (t: number) => number,
): { element: SVGSVGElement; render(t: number): void; drawn: ReadonlySet<unknown> } | undefined {
    const plan = planMorph(from, to, ease);
    if (!plan) return undefined;
    const element = document.createElementNS(SVG_NS, 'svg');
    Object.assign(element.style, {
        position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none',
    });
    const drawers = plan.shapes.map((shape) => {
        const path = document.createElementNS(SVG_NS, 'path');
        element.append(path);
        return (t: number): void => {
            path.setAttribute('d', `M${shape.points(t).map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L')}Z`);
            const fill = shape.fill(t);
            path.setAttribute('fill', typeof fill === 'string' ? fill : 'currentColor');
            path.setAttribute('opacity', String(shape.opacity(t)));
        };
    });
    const render = (t: number): void => { for (const draw of drawers) draw(t); };
    render(0);
    return { element, render, drawn: plan.drawn };
}


/** Whether a text pair turns or resizes; one that only moves is drawn by one copy at a time, at full strength. */
const turns = (a: FramePart, b: FramePart): boolean =>
    Boolean(a.text && b.text && (a.text.angle !== b.text.angle || a.text.fontSize !== b.text.fontSize));

/** A text's pose part-way between two: its anchor and size mixed, its angle turned the shorter way. */
function textBetween(a: FrameText, b: FrameText, t: number): FrameText {
    const turn = ((((b.angle - a.angle) % 360) + 540) % 360) - 180;
    return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        angle: a.angle + turn * t,
        fontSize: a.fontSize + (b.fontSize - a.fontSize) * t,
        // Text that says the same but for its numbers counts from one to the other.
        ...(a.content !== undefined && b.content !== undefined ? { content: mixNumbersInText(a.content, b.content, t) ?? (t < 0.5 ? a.content : b.content) } : {}),
    };
}

/**
 * Each part's pose at `t`, on both sides. A part with a counterpart moves from where the last
 * chart drew it to where the next one draws it, drawn by the last chart until halfway and by
 * the next after. A part showing an item in `morphDraws` is left to the mark morph. One without
 * a counterpart leaves over the first quarter or arrives over the last while the marks morph;
 * when they do not, the marks are such parts too, and those cross-fade over the whole duration
 * so the plot never stands empty.
 */
export function planFrames(
    from: readonly FramePart[],
    to: readonly FramePart[],
    morphDraws?: ReadonlySet<unknown>,
): (t: number) => { from: FramePose[]; to: FramePose[] } {
    const morphed = morphDraws !== undefined;
    const drawn = (part: FramePart): boolean => part.item === undefined || !morphDraws?.has(part.item);
    const waiting = new Map<string, number[]>();
    from.forEach((part, index) => {
        if (part.key === undefined || !drawn(part)) return;
        waiting.set(part.key, [...(waiting.get(part.key) ?? []), index]);
    });
    const fromMatch = new Map<number, number>();
    const toMatch = new Map<number, number>();
    to.forEach((part, index) => {
        if (part.key === undefined || !drawn(part)) return;
        const match = waiting.get(part.key)?.shift();
        if (match === undefined) return;
        fromMatch.set(match, index);
        toMatch.set(index, match);
    });
    const leave = (t: number): number => (morphed ? 1 - clamp(t * 4) : 1 - t);
    const arrive = (t: number): number => (morphed ? clamp(t * 4 - 3) : t);
    const still = (part: FramePart, opacity: number): FramePose => ({ dx: 0, dy: 0, width: part.width, height: part.height, opacity });
    // A matched pair shares one pose, from the last chart's part at 0 to the next one's at 1. A
    // text pair also turns and resizes about its anchor, the two copies trading places as it does.
    const between = (a: FramePart, b: FramePart, t: number, origin: FramePart, opacity: number): FramePose => ({
        dx: a.x + (b.x - a.x) * t - origin.x,
        dy: a.y + (b.y - a.y) * t - origin.y,
        width: a.width + (b.width - a.width) * t,
        height: a.height + (b.height - a.height) * t,
        opacity: turns(a, b) ? (origin === a ? 1 - t : t) : opacity,
        ...(a.text && b.text ? { text: textBetween(a.text, b.text, t) } : {}),
    });
    return (t) => ({
        from: from.map((part, index) => {
            if (!drawn(part)) return still(part, 0);
            const match = fromMatch.get(index);
            if (match === undefined) return still(part, leave(t));
            return between(part, to[match]!, t, part, t < 0.5 ? 1 : 0);
        }),
        to: to.map((part, index) => {
            if (!drawn(part)) return still(part, 0);
            const match = toMatch.get(index);
            if (match === undefined) return still(part, arrive(t));
            return between(from[match]!, part, t, part, t < 0.5 ? 0 : 1);
        }),
    });
}

export interface ChartSwap {
    /** The element the outgoing chart renders into, and its renderer. */
    readonly from: { element: HTMLElement; source?: MorphSource };
    readonly to: { element: HTMLElement; source?: MorphSource };
    /** The element both sit in; the morph layer is drawn over it. */
    readonly stage: HTMLElement;
    readonly duration: number;
    /** How the swap moves over its duration; defaults to `ease-in-out`. */
    readonly easing?: TransitionEasing;
    /** Runs with each frame's progress, from 0 to 1. */
    readonly onFrame?: (t: number) => void;
    /** The same chart drawn from new rows: each part hands over to the one in its place. */
    readonly byPlace?: boolean;
}

/**
 * Moves from one mounted chart to the next, both already in place over each other. Both charts
 * stop drawing while a layer draws their parts: what the two share (an axis label, a gridline, a
 * title) moves from one place to the other, and the rest leaves or arrives. Marks that name the
 * same elements in both charts, by the identity both share, morph into each other. A chart that
 * cannot hand over its parts, or has too many, cross-fades. Resolves once the next chart shows alone.
 */
export async function transitionBetween({ from, to, stage, duration, easing, onFrame, byPlace }: ChartSwap): Promise<void> {
    const show = (element: HTMLElement, opacity: number) => { element.style.opacity = String(opacity); };
    if (duration <= 0) {
        to.element.style.opacity = '';
        return;
    }
    const fromFrame = from.source?.frameScene?.({ byPlace });
    const toFrame = to.source?.frameScene?.({ byPlace });
    if (!fromFrame || !toFrame || fromFrame.parts.length > MAX_MORPHED_ITEMS || toFrame.parts.length > MAX_MORPHED_ITEMS) {
        await runMotion(duration, (t) => {
            onFrame?.(t);
            show(to.element, Math.min(1, t * 2));
            show(from.element, Math.min(1, 2 - t * 2));
        }, easingCurve(easing)).done;
        to.element.style.opacity = '';
        return;
    }
    const fromScene = from.source?.morphScene?.();
    const toScene = to.source?.morphScene?.();
    const ease = easingCurve(easing);
    const morph = !byPlace && fromScene && toScene ? buildMorph(fromScene, toScene, ease) : undefined;
    const poses = planFrames(fromFrame.parts, toFrame.parts, morph?.drawn);
    const size = { width: Math.max(fromFrame.width, toFrame.width), height: Math.max(fromFrame.height, toFrame.height) };
    const fromLayer = fromFrame.draw(stage, size, true);
    const toLayer = toFrame.draw(stage, size, false);
    // The morph eases each of its stages itself, so it takes the clock's own progress.
    const drawFrame = (t: number): void => {
        const pose = poses(ease(t));
        fromLayer.render(pose.from);
        toLayer.render(pose.to);
        morph?.render(t);
    };
    drawFrame(0);
    if (morph) stage.append(morph.element);
    from.source?.setDrawnHidden?.(true);
    try {
        await runMotion(duration, (t) => {
            onFrame?.(ease(t));
            drawFrame(t);
        }, (t) => t).done;
        to.element.style.opacity = '';
    } finally {
        from.source?.setDrawnHidden?.(false);
        fromLayer.destroy();
        toLayer.destroy();
        morph?.element.remove();
    }
}
