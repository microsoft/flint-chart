import { CHART_TRANSITIONS } from '../core/chart-transitions';
import { easingCurve, runTween } from './transition';
import type { TransitionEasing } from './types';

/** One drawn item of a chart, in the coordinates of the element the chart renders into. */
export interface MorphItem {
    readonly type: string;
    readonly datum: Record<string, unknown>;
    readonly values: Record<string, unknown>;
}

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
    /** Whether the mark morph draws it, when there is one. */
    readonly morphed: boolean;
}

/** Where a part is drawn in one frame: moved by `dx`, `dy`, sized `width` by `height`, and faded by `opacity`. */
export interface FramePose {
    readonly dx: number;
    readonly dy: number;
    readonly width: number;
    readonly height: number;
    readonly opacity: number;
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
    frameScene?(): FrameScene | undefined;
    setDrawnHidden?(hidden: boolean): void;
}

/** Past this many items or parts on either side a change of chart cross-fades. */
const MAX_MORPHED_ITEMS = 1000;
/** Points every outline is resampled to, so any two shapes mix point by point. */
const OUTLINE_POINTS = 48;
const SVG_NS = 'http://www.w3.org/2000/svg';

type Point = readonly [number, number];

/** Whether Flint lists a change from one chart type to the other. */
export function isChartTransition(from: string, to: string): boolean {
    if (from === to) return true;
    return (CHART_TRANSITIONS[from] ?? []).some((edge) => edge.to === to);
}

const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** `count` points along each side, so shapes with as many sides meet corner to corner. */
function sides(corners: readonly Point[], perSide: number): Point[] {
    return corners.flatMap(([x0, y0], index) => {
        const [x1, y1] = corners[(index + 1) % corners.length]!;
        return Array.from({ length: perSide }, (_, step) => [x0 + ((x1 - x0) * step) / perSide, y0 + ((y1 - y0) * step) / perSide] as Point);
    });
}

/** An item's outline: OUTLINE_POINTS points, a quarter per side of its box, from its top-left clockwise. */
function outline(item: MorphItem): Point[] | undefined {
    const v = item.values;
    const x = num(v.x);
    const y = num(v.y);
    const quarter = OUTLINE_POINTS / 4;
    if (item.type === 'rect') {
        const width = num(v.width);
        const height = num(v.height);
        return sides([[x, y], [x + width, y], [x + width, y + height], [x, y + height]], quarter);
    }
    if (item.type === 'symbol' || item.type === 'line') {
        const radius = item.type === 'line' ? Math.max(1.5, num(v.strokeWidth, 2)) : Math.sqrt(num(v.size, 64) / Math.PI);
        return Array.from({ length: OUTLINE_POINTS }, (_, index) => {
            const angle = -Math.PI * 0.75 + (index / OUTLINE_POINTS) * Math.PI * 2;
            return [x + radius * Math.cos(angle), y + radius * Math.sin(angle)] as Point;
        });
    }
    if (item.type === 'arc') {
        const start = num(v.startAngle);
        const end = num(v.endAngle);
        const inner = num(v.innerRadius);
        const outer = num(v.outerRadius);
        const half = OUTLINE_POINTS / 2;
        const at = (radius: number, angle: number): Point => [x + radius * Math.sin(angle), y - radius * Math.cos(angle)];
        return [
            ...Array.from({ length: half }, (_, step) => at(outer, start + ((end - start) * step) / (half - 1))),
            ...Array.from({ length: half }, (_, step) => at(inner, end - ((end - start) * step) / (half - 1))),
        ];
    }
    return undefined;
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
}

function pairItems(from: MorphScene, to: MorphScene): Pair[] | undefined {
    const fields = from.fields.filter((field) => to.fields.includes(field));
    if (fields.length === 0) return undefined;
    const shaped = (item: MorphItem): boolean => outline(item) !== undefined;
    const waiting = new Map<string, MorphItem[]>();
    for (const item of from.items.filter(shaped)) {
        const key = keyOf(item, fields);
        waiting.set(key, [...(waiting.get(key) ?? []), item]);
    }
    const pairs: Pair[] = [];
    for (const item of to.items.filter(shaped)) {
        const match = waiting.get(keyOf(item, fields))?.shift();
        pairs.push({ from: match, to: item });
    }
    for (const rest of waiting.values()) for (const item of rest) pairs.push({ from: item });
    return pairs.some((pair) => pair.from && pair.to) ? pairs : undefined;
}

/** An SVG layer that draws `from` turning into `to`; `render(t)` draws the frame at t in [0, 1]. */
export function buildMorph(from: MorphScene, to: MorphScene): { element: SVGSVGElement; render(t: number): void } | undefined {
    if (from.items.length > MAX_MORPHED_ITEMS || to.items.length > MAX_MORPHED_ITEMS) return undefined;
    const pairs = pairItems(from, to);
    if (!pairs) return undefined;
    const element = document.createElementNS(SVG_NS, 'svg');
    Object.assign(element.style, {
        position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none',
    });
    const drawers = pairs.map((pair) => {
        const path = document.createElementNS(SVG_NS, 'path');
        element.append(path);
        const start = pair.from ? outline(pair.from)! : undefined;
        const end = pair.to ? outline(pair.to)! : undefined;
        const fillOf = (item: MorphItem | undefined) => item?.values.fill ?? item?.values.stroke;
        const opacityOf = (item: MorphItem | undefined) => num(item?.values.opacity, 1) * num(item?.values.fillOpacity, 1);
        return (t: number): void => {
            const shape = start && end
                ? start.map(([x, y], index) => [x + (end[index]![0] - x) * t, y + (end[index]![1] - y) * t] as Point)
                : (start ?? end)!;
            path.setAttribute('d', `M${shape.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L')}Z`);
            const fill = start && end ? mixColour(fillOf(pair.from), fillOf(pair.to), t) : fillOf(pair.from ?? pair.to);
            path.setAttribute('fill', typeof fill === 'string' ? fill : 'currentColor');
            const opacity = start && end
                ? opacityOf(pair.from) + (opacityOf(pair.to) - opacityOf(pair.from)) * t
                : start ? opacityOf(pair.from) * (1 - t) : opacityOf(pair.to) * t;
            path.setAttribute('opacity', String(opacity));
        };
    });
    const render = (t: number): void => { for (const draw of drawers) draw(t); };
    render(0);
    return { element, render };
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Each part's pose at `t`, on both sides. A part with a counterpart moves from where the last
 * chart drew it to where the next one draws it, drawn by the last chart until halfway and by
 * the next after. One without leaves over the first quarter or arrives over the last while
 * the marks morph; when they do not, the marks are such parts too, and those cross-fade over
 * the whole duration so the plot never stands empty.
 */
export function planFrames(
    from: readonly FramePart[],
    to: readonly FramePart[],
    morphed: boolean,
): (t: number) => { from: FramePose[]; to: FramePose[] } {
    const drawn = (part: FramePart): boolean => !(morphed && part.morphed);
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
    // A matched pair shares one pose, from the last chart's part at 0 to the next one's at 1.
    const between = (a: FramePart, b: FramePart, t: number, origin: FramePart, opacity: number): FramePose => ({
        dx: a.x + (b.x - a.x) * t - origin.x,
        dy: a.y + (b.y - a.y) * t - origin.y,
        width: a.width + (b.width - a.width) * t,
        height: a.height + (b.height - a.height) * t,
        opacity,
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
    readonly from: { element: HTMLElement; source?: MorphSource; chartType: string };
    readonly to: { element: HTMLElement; source?: MorphSource; chartType: string };
    /** The element both sit in; the morph layer is drawn over it. */
    readonly stage: HTMLElement;
    readonly duration: number;
    /** How the swap moves over its duration; defaults to `ease-in-out`. */
    readonly easing?: TransitionEasing;
    /** Runs with each frame's progress, from 0 to 1. */
    readonly onFrame?: (t: number) => void;
}

/**
 * Moves from one mounted chart to the next, both already in place over each other. Both charts
 * stop drawing while a layer draws their parts: what the two share (an axis label, a gridline, a
 * title) moves from one place to the other, and the rest leaves or arrives. Along a listed chart
 * transition whose two scenes share row fields, the marks morph into each other. A chart that
 * cannot hand over its parts, or has too many, cross-fades. Resolves once the next chart shows alone.
 */
export async function transitionBetween({ from, to, stage, duration, easing, onFrame }: ChartSwap): Promise<void> {
    const show = (element: HTMLElement, opacity: number) => { element.style.opacity = String(opacity); };
    if (duration <= 0) {
        to.element.style.opacity = '';
        return;
    }
    const fromFrame = from.source?.frameScene?.();
    const toFrame = to.source?.frameScene?.();
    if (!fromFrame || !toFrame || fromFrame.parts.length > MAX_MORPHED_ITEMS || toFrame.parts.length > MAX_MORPHED_ITEMS) {
        await runTween(duration, (t) => {
            onFrame?.(t);
            show(to.element, Math.min(1, t * 2));
            show(from.element, Math.min(1, 2 - t * 2));
        }, easingCurve(easing)).done;
        to.element.style.opacity = '';
        return;
    }
    const fromScene = from.source?.morphScene?.();
    const toScene = to.source?.morphScene?.();
    const morph = isChartTransition(from.chartType, to.chartType) && fromScene && toScene
        ? buildMorph(fromScene, toScene)
        : undefined;
    const poses = planFrames(fromFrame.parts, toFrame.parts, Boolean(morph));
    const size = { width: Math.max(fromFrame.width, toFrame.width), height: Math.max(fromFrame.height, toFrame.height) };
    const fromLayer = fromFrame.draw(stage, size, true);
    const toLayer = toFrame.draw(stage, size, false);
    const drawFrame = (t: number): void => {
        const pose = poses(t);
        fromLayer.render(pose.from);
        toLayer.render(pose.to);
        morph?.render(t);
    };
    drawFrame(0);
    if (morph) stage.append(morph.element);
    from.source?.setDrawnHidden?.(true);
    await runTween(duration, (t) => {
        onFrame?.(t);
        drawFrame(t);
    }, easingCurve(easing)).done;
    from.source?.setDrawnHidden?.(false);
    to.element.style.opacity = '';
    fromLayer.destroy();
    toLayer.destroy();
    morph?.element.remove();
}
