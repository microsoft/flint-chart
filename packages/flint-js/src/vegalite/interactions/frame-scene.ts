import { Bounds, renderModule } from 'vega';
import type { FramePart, FramePose, FrameScene } from '../../interactive/morph';
import { MORPH_TYPES } from './scene-tween';
import { INTERACTION_KEY } from './stores';

/** Item fields a renderer keeps on an item it drew; a copy drawn by another renderer starts without them. */
const RENDERER_FIELDS = ['_svg', 'dirty', 'mark', 'items'] as const;
const EVERYWHERE = (): any => new Bounds().set(-1e5, -1e5, 1e5, 1e5);

const AXIS_VALUE_ROLES = new Set(['axis-tick', 'axis-grid']);
const TEXT_ROLES = new Set(['axis-label', 'axis-title', 'title-text', 'title-subtitle', 'legend-label', 'legend-title']);

/** A text's words, however its lines break: a label wrapped in one chart and not the other is the same label. */
const textOf = (item: any): string => (Array.isArray(item.text) ? item.text.join(' ') : String(item.text ?? '')).replace(/\s+/g, ' ').trim();
const valueOf = (value: unknown): string => (value instanceof Date ? String(value.getTime()) : String(value));

/** What a frame item shows, by meaning: an axis label by its text, a gridline by its value, a title by its text. */
function partKey(role: string, item: any, orient: string): string | undefined {
    if (AXIS_VALUE_ROLES.has(role)) return `${role}|${orient}|${valueOf(item.datum?.value)}`;
    if (role === 'axis-domain') return `${role}|${orient}`;
    if (role === 'legend-symbol') return `${role}|${valueOf(item.datum?.value)}`;
    if (TEXT_ROLES.has(role)) return `${role}|${orient}|${textOf(item)}`;
    return undefined;
}

interface SourcePart extends FramePart {
    /** The scene node the part's items belong to. */
    readonly mark: any;
    /** The items drawn: one, or every item of a mark drawn as one shape. */
    readonly items: readonly any[];
    /** Where the part's group sits, in the coordinates of the element the chart renders into. */
    readonly gx: number;
    readonly gy: number;
}

// A part is placed by its top-left corner, so a gridline or a plot frame that grows stays on its axis.
function box(bounds: any, fallbackX: number, fallbackY: number): { x: number; y: number; width: number; height: number } {
    return bounds && Number.isFinite(bounds.x1) && bounds.x2 >= bounds.x1
        ? { x: bounds.x1, y: bounds.y1, width: bounds.x2 - bounds.x1, height: bounds.y2 - bounds.y1 }
        : { x: fallbackX, y: fallbackY, width: 0, height: 0 };
}

/**
 * Every item `view` draws, as parts placed in the element it renders into: group backgrounds,
 * axes, titles, legends and marks. A keyed item the mark morph draws is flagged `morphed`.
 */
export function captureFrameScene(
    view: any,
    origin: { x: number; y: number },
    extent: { width: number; height: number },
): FrameScene | undefined {
    const root = view.scenegraph?.()?.root;
    if (!root) return undefined;
    const parts: SourcePart[] = [];
    const visit = (mark: any, gx: number, gy: number, orient: string, path: string): void => {
        const nested = mark.marktype === 'line' || mark.marktype === 'area' || mark.marktype === 'trail';
        const items: any[] = mark.items ?? [];
        if (mark.marktype === 'group') {
            items.forEach((item, index) => {
                const itemOrient = mark.role === 'axis' ? String(item.orient ?? '') : orient;
                const groupPath = `${path}/${mark.role}:${itemOrient || index}`;
                // A group's bounds reach over its axes and legends; its own box is what it draws.
                parts.push({
                    key: `group|${groupPath}`,
                    morphed: false,
                    x: gx + (item.x ?? 0),
                    y: gy + (item.y ?? 0),
                    width: item.width ?? 0,
                    height: item.height ?? 0,
                    mark,
                    items: [item],
                    gx,
                    gy,
                });
                for (const child of item.items ?? []) visit(child, gx + (item.x ?? 0), gy + (item.y ?? 0), itemOrient, groupPath);
            });
            return;
        }
        if (items.length === 0 || mark.role === 'scene-exit') return;
        if (nested) {
            // The morph draws a line's vertices, not its path, so the path leaves or arrives.
            const drawn = box(mark.bounds, 0, 0);
            parts.push({ morphed: false, ...drawn, x: gx + drawn.x, y: gy + drawn.y, mark, items, gx, gy });
            return;
        }
        const morphed = Boolean(MORPH_TYPES[mark.marktype]) && items.some((item) => typeof item.datum?.[INTERACTION_KEY] === 'string');
        for (const item of items) {
            const drawn = box(item.bounds, item.x ?? 0, item.y ?? 0);
            const text = mark.marktype === 'text'
                ? { x: gx + (item.x ?? 0), y: gy + (item.y ?? 0), angle: item.angle ?? 0, fontSize: item.fontSize ?? 11 }
                : undefined;
            parts.push({ key: partKey(mark.role, item, orient), morphed, ...drawn, x: gx + drawn.x, y: gy + drawn.y, ...(text ? { text } : {}), mark, items: [item], gx, gy });
        }
    };
    visit(root, origin.x, origin.y, '', '');
    return {
        parts,
        ...extent,
        draw: (layer, size, withBackground) => drawParts(layer, size, view.renderer(), withBackground ? view.background() : undefined, parts),
    };
}

const ratio = (size: number, own: number): number => (own > 0 ? size / own : 1);

/** A copy of `item` that another renderer can draw, without the fields the chart's renderer keeps on it. */
function copyItem(item: any, mark: any): any {
    const copy: Record<string, any> = { ...item, mark };
    for (const field of RENDERER_FIELDS) if (field !== 'mark') delete copy[field];
    if (mark.marktype === 'group') copy.items = [];
    return copy;
}

/** Poses a copy: faded, and a rule or a box stretched to the pose's size. */
function poseItem(copy: any, item: any, part: SourcePart, pose: FramePose): void {
    copy.opacity = (typeof item.opacity === 'number' ? item.opacity : 1) * pose.opacity;
    const sx = ratio(pose.width, part.width);
    const sy = ratio(pose.height, part.height);
    if (copy.mark.marktype === 'group') {
        copy.width = (item.width ?? 0) * sx;
        copy.height = (item.height ?? 0) * sy;
    } else if (copy.mark.marktype === 'text' && pose.text) {
        // The copy is drawn inside a wrapper moved by the pose, so its anchor is set back by that move.
        copy.x = pose.text.x - part.gx - pose.dx;
        copy.y = pose.text.y - part.gy - pose.dy;
        copy.angle = pose.text.angle;
        copy.fontSize = pose.text.fontSize;
    } else if (copy.mark.marktype === 'rule') {
        const x = item.x ?? 0;
        const y = item.y ?? 0;
        if (typeof item.x2 === 'number') copy.x2 = x + (item.x2 - x) * sx;
        if (typeof item.y2 === 'number') copy.y2 = y + (item.y2 - y) * sy;
    }
}

/**
 * Draws `parts` with Vega's own renderer, so a part looks exactly as the chart drew it. The scene
 * is built once and posed in place each frame, so the renderer updates what it drew.
 */
function drawParts(
    layer: HTMLElement,
    size: { width: number; height: number },
    type: string,
    background: string | undefined,
    parts: readonly SourcePart[],
): { render(poses: readonly FramePose[]): void; destroy(): void } {
    const element = document.createElement('div');
    Object.assign(element.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' });
    layer.append(element);
    const Renderer = (renderModule as any)(type === 'svg' ? 'svg' : 'canvas').renderer;
    const renderer = new Renderer().initialize(element, size.width, size.height, [0, 0], 1);
    if (background) renderer.background(background);
    const rootMark: any = { marktype: 'group', role: 'frame', items: [] };
    const rootItem: any = { mark: rootMark, x: 0, y: 0, width: size.width, height: size.height, bounds: EVERYWHERE(), items: [] };
    rootMark.items.push(rootItem);
    const posed = parts.map((part) => {
        const wrapper: any = { marktype: 'group', role: 'frame-part', group: rootItem, items: [] };
        // A mark clips to its group's box, so the wrapper takes the size of the group it stands for.
        const wrapperItem: any = {
            mark: wrapper,
            width: part.mark.group?.width,
            height: part.mark.group?.height,
            bounds: EVERYWHERE(),
            items: [],
        };
        wrapper.items.push(wrapperItem);
        const mark: any = { ...part.mark, group: wrapperItem, zdirty: false, zitems: undefined };
        delete mark._svg;
        mark.items = part.items.map((item) => copyItem(item, mark));
        wrapperItem.items.push(mark);
        return { part, wrapper, wrapperItem, copies: mark.items as any[] };
    });
    return {
        render(poses) {
            rootItem.items = [];
            posed.forEach(({ part, wrapper, wrapperItem, copies }, index) => {
                const pose = poses[index];
                if (!pose || pose.opacity <= 0) return;
                wrapperItem.x = part.gx + pose.dx;
                wrapperItem.y = part.gy + pose.dy;
                copies.forEach((copy, at) => poseItem(copy, part.items[at], part, pose));
                rootItem.items.push(wrapper);
            });
            renderer.render(rootMark);
        },
        destroy: () => element.remove(),
    };
}
