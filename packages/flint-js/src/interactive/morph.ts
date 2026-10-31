import { CHART_TRANSITIONS } from '../core/chart-transitions';
import { runTween } from './transition';

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

/** What a renderer offers a morph: its drawn items, and a way to stop drawing its marks while another layer does. */
export interface MorphSource {
    morphScene?(): MorphScene | undefined;
    setMarksHidden?(hidden: boolean): Promise<void> | void;
}

/** Past this many items on either side a change of chart cross-fades. */
const MAX_MORPHED_ITEMS = 1500;
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

export interface ChartSwap {
    /** The element the outgoing chart renders into, and its renderer. */
    readonly from: { element: HTMLElement; source?: MorphSource; chartType: string };
    readonly to: { element: HTMLElement; source?: MorphSource; chartType: string };
    /** The element both sit in; the morph layer is drawn over it. */
    readonly stage: HTMLElement;
    readonly duration: number;
}

/**
 * Moves from one mounted chart to the next, both already in place over each other. Along a
 * listed chart transition whose two scenes share row fields, the marks morph on a layer above
 * while each chart's own marks stay hidden and their frames cross-fade; otherwise the charts
 * cross-fade. Resolves once the next chart shows alone.
 */
export async function transitionBetween({ from, to, stage, duration }: ChartSwap): Promise<void> {
    const fade = (element: HTMLElement, opacity: number) => { element.style.opacity = String(opacity); };
    if (duration <= 0) {
        to.element.style.opacity = '';
        return;
    }
    const fromScene = from.source?.morphScene?.();
    const toScene = to.source?.morphScene?.();
    const morph = isChartTransition(from.chartType, to.chartType) && fromScene && toScene
        ? buildMorph(fromScene, toScene)
        : undefined;
    if (morph) {
        await Promise.all([from.source?.setMarksHidden?.(true), to.source?.setMarksHidden?.(true)]);
        stage.append(morph.element);
    }
    fade(to.element, 0);
    await runTween(duration, (t) => {
        morph?.render(t);
        fade(from.element, 1 - Math.min(1, t * 1.6));
        fade(to.element, Math.max(0, t * 1.6 - 0.6));
    }).done;
    if (morph) {
        await to.source?.setMarksHidden?.(false);
        morph.element.remove();
    }
    to.element.style.opacity = '';
}
