import type { MorphItem, MorphScene } from '../../interactive/morph';
import type { LegendDomain } from './contracts';
import {
    drawnDataValue,
    identityKey,
    registerMotionTransform,
    trackedKey,
    drawnFieldValue,
    resetOutlineStarts,
    stackGroupMotion,
    stackKey,
    IDENTITY_FIELDS,
    WHOLE_IDENTITY,
    WHOLE_KEY_FLAG,
    type ArrivalAxis,
    type DataPosition,
    type MarkMotion,
    type StackExtent,
} from './motion-transform';
import { parseExpression } from 'vega';
import { INTERACTION_KEY, MARK_IDENTITY } from './stores';

/** The drawn state a motion starts from: per mark name, per row key, each channel's value. */
export const SCENE_FROM_SIGNAL = '__flint_scene_from';
/** The move stage's eased progress, 0 to 1; 1 when no motion runs. */
export const SCENE_T_SIGNAL = '__flint_scene_t';
/** The arrive stage's progress: rows new to the chart fade in over it. */
export const SCENE_ENTER_SIGNAL = '__flint_scene_enter';
/** The leave stage's progress: rows gone from the chart fade out over it. */
export const SCENE_EXIT_SIGNAL = '__flint_scene_exit';

/** Whether lines clip to their plot: only while a change moves a scale or adds or drops rows, so a line's ends can slide through the edge. */
export const SCENE_CLIP_SIGNAL = '__flint_scene_clip';

/** Changes for each motion that placed outline starts on its items; null when none. */
export const SCENE_OUTLINE_SIGNAL = '__flint_scene_outline';
/** How the title is placed: Vega lays it out (`top`) at rest; a motion holds it where it is told (`none`). */
export const TITLE_ORIENT_SIGNAL = '__flint_title_orient';
/** Where a held title's group stands, in the root group's coordinates. */
export const TITLE_X_SIGNAL = '__flint_title_x';
export const TITLE_Y_SIGNAL = '__flint_title_y';
/** A held subtitle's offset below the title: Vega sets a subtitle at the group's origin when it does not lay the title out. */
export const SUBTITLE_DY_SIGNAL = '__flint_subtitle_dy';

/**
 * Lets a motion hold the title where the resting layouts put it. Vega places a top title against
 * everything drawn, labels included, so an in-between frame whose top label has left the plot's
 * edge would move it; while a change runs the title is placed by position instead.
 */
export function injectTitleMotion(vegaSpec: Record<string, any>): boolean {
    const stated = vegaSpec.title;
    if (!stated) return false;
    const title = typeof stated === 'string' || Array.isArray(stated) ? { text: stated } : stated;
    if ((title.orient ?? 'top') !== 'top' || typeof title.orient === 'object') return false;
    const encode = title.encode ?? {};
    // The older form of `encode` styles the title text itself.
    const parts = 'group' in encode || 'title' in encode || 'subtitle' in encode ? encode : (title.encode ? { title: encode } : {});
    vegaSpec.signals = [
        ...(vegaSpec.signals ?? []),
        { name: TITLE_ORIENT_SIGNAL, value: 'top' },
        { name: TITLE_X_SIGNAL, value: 0 },
        { name: TITLE_Y_SIGNAL, value: 0 },
        { name: SUBTITLE_DY_SIGNAL, value: 0 },
    ];
    vegaSpec.title = {
        ...title,
        orient: { signal: TITLE_ORIENT_SIGNAL },
        encode: {
            ...parts,
            group: { ...(parts.group ?? {}), update: { ...(parts.group?.update ?? {}), x: { signal: TITLE_X_SIGNAL }, y: { signal: TITLE_Y_SIGNAL } } },
            subtitle: { ...(parts.subtitle ?? {}), update: { ...(parts.subtitle?.update ?? {}), dy: { signal: SUBTITLE_DY_SIGNAL } } },
        },
    };
    return true;
}

/** An axis whose room a motion holds: the signals bounding its extent, and the bounds Vega lays it out within at rest. */
export interface AxisExtent {
    readonly key: string;
    readonly min: string;
    readonly max: string;
    readonly restMin: number;
    readonly restMax: number;
}

const AXIS_ORIENTS = new Set(['left', 'right', 'top', 'bottom']);
const axisExtentKey = (scale: string, orient: string): string => `${scale}|${orient}`;

/**
 * An axis property as Vega resolves it (vega-parser's `axis-config`): the axis's own, then the
 * band config for an axis on a band scale, its orient's config, its x or y config, the axis config.
 */
function axisConfigValue(vegaSpec: Record<string, any>, axis: Record<string, any>, property: string, fallback: unknown): any {
    if (axis[property] !== undefined) return axis[property];
    const config = vegaSpec.config ?? {};
    const orient = String(axis.orient);
    const band = scaleTypeOf(vegaSpec, axis.scale) === 'band' ? config.axisBand : undefined;
    const orientConfig = config[`axis${orient.charAt(0).toUpperCase()}${orient.slice(1)}`];
    const xy = orient === 'top' || orient === 'bottom' ? config.axisX : config.axisY;
    for (const source of [band, orientConfig, xy, config.axis]) {
        if (source && Object.prototype.hasOwnProperty.call(source, property)) return source[property];
    }
    return fallback;
}

/** The type of the scale a name refers to, in any scope. */
function scaleTypeOf(vegaSpec: Record<string, any>, name: unknown): string | undefined {
    let type: string | undefined;
    walkVegaScopes(vegaSpec, (scope) => {
        const scale = (scope.scales ?? []).find((entry: Record<string, any>) => entry.name === name);
        if (scale && type === undefined) type = scale.type ?? 'linear';
    });
    return type;
}

/**
 * Lets a motion hold the room each axis takes for its ticks and labels, which places its title.
 * At rest the extent is bounded as the axis or its config states (Vega's 0 to 200 when neither does), so Vega lays the axis out
 * as before; while a change runs both bounds are one held value. An axis whose extent is already
 * fixed keeps it.
 */
export function injectAxisExtentMotion(vegaSpec: Record<string, any>): AxisExtent[] {
    const extents = new Map<string, AxisExtent>();
    walkVegaScopes(vegaSpec, (scope) => {
        for (const axis of scope.axes ?? []) {
            if (typeof axis.scale !== 'string' || !AXIS_ORIENTS.has(axis.orient)) continue;
            const minExtent = axisConfigValue(vegaSpec, axis, 'minExtent', 0);
            const maxExtent = axisConfigValue(vegaSpec, axis, 'maxExtent', 200);
            if (typeof minExtent !== 'number' || typeof maxExtent !== 'number' || minExtent === maxExtent) continue;
            const key = axisExtentKey(axis.scale, axis.orient);
            let entry = extents.get(key);
            if (!entry) {
                const name = `__flint_axis_extent_${key.replace(/\W/g, '_')}`;
                entry = { key, min: `${name}_min`, max: `${name}_max`, restMin: minExtent, restMax: maxExtent };
                extents.set(key, entry);
            }
            axis.minExtent = { signal: entry.min };
            axis.maxExtent = { signal: entry.max };
        }
    });
    if (extents.size === 0) return [];
    vegaSpec.signals = [
        ...(vegaSpec.signals ?? []),
        ...[...extents.values()].flatMap((entry) => [{ name: entry.min, value: entry.restMin }, { name: entry.max, value: entry.restMax }]),
    ];
    return [...extents.values()];
}

/**
 * The extent each axis takes at rest for the ticks and labels drawn now, as Vega's axis layout
 * reads it (vega-view-transforms' `axisLayout`: the bounds of the tick and label groups, found by
 * the same child order).
 */
export function axisExtentsAtRest(view: any, extents: readonly AxisExtent[]): Map<string, number> {
    const byKey = new Map(extents.map((entry) => [entry.key, entry]));
    const found = new Map<string, number>();
    const visit = (node: any): void => {
        for (const mark of node?.items ?? []) {
            for (const item of mark.items ?? []) {
                if (mark.role === 'axis' && item.datum && typeof item.datum.scale === 'string') {
                    const entry = byKey.get(axisExtentKey(item.datum.scale, item.orient));
                    if (entry) {
                        let index = +item.datum.grid;
                        const ticks = item.datum.ticks ? index++ : -1;
                        const labels = item.datum.labels ? index++ : -1;
                        const parts = [ticks, labels].filter((at) => at > -1).map((at) => item.items?.[at]?.bounds).filter(Boolean);
                        const x1 = Math.min(0, ...parts.map((b: any) => b.x1));
                        const x2 = Math.max(0, ...parts.map((b: any) => b.x2));
                        const y1 = Math.min(0, ...parts.map((b: any) => b.y1));
                        const y2 = Math.max(0, ...parts.map((b: any) => b.y2));
                        const reach = item.orient === 'left' ? -x1 : item.orient === 'right' ? x2 : item.orient === 'top' ? -y1 : y2;
                        const extent = Math.max(entry.restMin, Math.min(entry.restMax, Number.isFinite(reach) ? reach : 0));
                        found.set(entry.key, Math.max(found.get(entry.key) ?? 0, extent));
                    }
                }
                if (mark.marktype === 'group') visit(item);
            }
        }
    };
    const root = view.scenegraph?.()?.root;
    if (root) visit({ items: [root] });
    return found;
}

/** Where the title's group stands as Vega lays it out, and how far below it the subtitle sits; nothing for a chart without a top title. */
export function titlePosition(view: any): { x: number; y: number; subtitle: number } | undefined {
    const root = view.scenegraph?.()?.root?.items?.[0];
    const group = root?.items?.find((mark: any) => mark.role === 'title')?.items?.[0];
    if (!group || typeof group.x !== 'number' || typeof group.y !== 'number') return undefined;
    const subtitle = group.items?.find((mark: any) => mark.role === 'title-subtitle')?.items?.[0];
    return { x: group.x, y: group.y, subtitle: typeof subtitle?.y === 'number' ? subtitle.y : 0 };
}

/** How far a scene reaches past its plot on each side, which pad autosize gives it as room. */
export interface ViewRoom {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
}

/** The room the scene drawn now takes around its plot, as Vega's pad autosize lays it out (Vega's `viewSizeLayout`, read from the root group's bounds). */
export function viewRoom(view: any): ViewRoom | undefined {
    const root = view.scenegraph?.()?.root?.items?.[0];
    const bounds = root?.bounds;
    if (!root || !bounds) return undefined;
    const width = Math.max(0, root.width || 0);
    const height = Math.max(0, root.height || 0);
    const [left, top] = view.origin();
    return { left, top, right: Math.max(0, Math.ceil(bounds.x2 - width)), bottom: Math.max(0, Math.ceil(bounds.y2 - height)) };
}

const outlineEntry = (name: string): string => `__outline:${name}`;

const POSITION_CHANNELS: Record<string, readonly string[]> = {
    rect: ['x', 'y', 'width', 'height'],
    symbol: ['x', 'y', 'size', 'angle'],
    arc: ['x', 'y', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius', 'padAngle'],
    text: ['x', 'y', 'angle', 'radius', 'theta'],
    line: ['x', 'y'],
    area: ['x', 'y', 'x2', 'y2'],
    rule: ['x', 'y', 'x2', 'y2'],
    trail: ['x', 'y', 'size'],
    image: ['x', 'y', 'width', 'height'],
    group: ['x', 'y', 'width', 'height'],
};
const NUMERIC_STYLE_CHANNELS = ['opacity', 'fillOpacity', 'strokeOpacity', 'strokeWidth'] as const;
const COLOUR_CHANNELS = ['fill', 'stroke'] as const;

function channelsOf(marktype: string): readonly string[] {
    return [...(POSITION_CHANNELS[marktype] ?? []), ...NUMERIC_STYLE_CHANNELS];
}

const CONTINUOUS_SCALES = new Set(['linear', 'log', 'pow', 'sqrt', 'symlog', 'time', 'utc']);
/** Scales whose domain is numbers a change can move through: continuous ones, and the bins a quantize or threshold scale cuts. */
const MOVABLE_SCALES = new Set([...CONTINUOUS_SCALES, 'quantize', 'threshold']);
const SIMPLE_FIELD = /^[^.[\]\\]+$/;

/** The positions a mark draws as a continuous scale of a field or a constant: `scale(value) + offset`. */
function dataChannels(mark: Record<string, any>, continuous: ReadonlySet<string>): DataPosition[] {
    const encode = { ...(mark.encode?.enter ?? {}), ...(mark.encode?.update ?? {}) };
    return (['x', 'x2', 'y', 'y2'] as const).flatMap((channel): DataPosition[] => {
        const entry = encode[channel];
        if (!entry || Array.isArray(entry) || typeof entry !== 'object' || !continuous.has(entry.scale)) return [];
        if (Object.keys(entry).some((key) => !['scale', 'field', 'value', 'offset'].includes(key))) return [];
        if (entry.offset !== undefined && typeof entry.offset !== 'number') return [];
        const offset = entry.offset ?? 0;
        if (typeof entry.field === 'string' && SIMPLE_FIELD.test(entry.field)) return [{ channel, scale: entry.scale, field: entry.field, offset }];
        if (typeof entry.value === 'number' && entry.field === undefined) return [{ channel, scale: entry.scale, value: entry.value, offset }];
        return [];
    });
}

/** The axes an arriving item of a mark waits inside: each axis a position of the mark is placed on. */
function arrivalAxes(positions: readonly DataPosition[]): ArrivalAxis[] {
    return ([['x', 'x2', 'width'], ['y', 'y2', 'height']] as const).flatMap(([start, end, size]) => {
        const scale = positions.find((entry) => entry.channel === start || entry.channel === end)?.scale;
        return scale ? [{ start, end, size, scale }] : [];
    });
}

function walkMarks(marks: readonly Record<string, any>[] | undefined, visit: (mark: Record<string, any>) => void): void {
    for (const mark of marks ?? []) {
        visit(mark);
        if (Array.isArray(mark.marks)) walkMarks(mark.marks, visit);
    }
}

/**
 * Lets every mark drawn from data move what it draws. Each frame re-runs the mark's encoding (it reads
 * the motion signals), then a post-encoding transform mixes each item's channels from the state
 * captured before the change, matched by mark name and row key. No data transform re-runs, and at
 * rest the transform passes its items through untouched.
 */
export function injectSceneMotion(vegaSpec: Record<string, any>, identityFields: readonly string[] = []): void {
    registerMotionTransform();
    const continuous = new Set<string>((vegaSpec.scales ?? [])
        .filter((scale: Record<string, any>) => CONTINUOUS_SCALES.has(scale.type ?? 'linear'))
        .map((scale: Record<string, any>) => scale.name));
    let injected = false;
    let unnamed = 0;
    const ghostTypes = new Set<string>();
    const pathScales = new Set<string>();
    const faceted = new Set<Record<string, any>>();
    walkMarks(vegaSpec.marks, (mark) => {
        if (mark.type === 'group' && mark.from?.facet) walkMarks(mark.marks, (inner) => faceted.add(inner));
    });
    const scopes = new Map<Record<string, any>, string[]>();
    const scopeStacks = (marks: readonly Record<string, any>[] | undefined, fields: readonly string[]): void => {
        for (const mark of marks ?? []) {
            if (isStackGroup(mark)) scopes.set(mark, [...fields]);
            else if (mark.type === 'group') scopeStacks(mark.marks, [...fields, ...(mark.from?.facet?.groupby ?? [])]);
        }
    };
    scopeStacks(vegaSpec.marks, []);
    walkMarks(vegaSpec.marks, (mark) => {
        if (isStackGroup(mark)) {
            injectStackGroupMotion(mark, `__flint_stack_${unnamed++}`, continuous, scopes.get(mark) ?? []);
            return;
        }
        if (mark.type === 'group' || !mark.from || !mark.encode) return;
        if (!mark.name) mark.name = `__flint_moving_${unnamed++}`;
        const outline = Boolean(PATH_CHANNELS[mark.type]);
        const positions = dataChannels(mark, continuous);
        if (outline) {
            // While a change moves a scale or rows, a line's ends slide in and out through the plot's edges.
            // In a facet cell a clip changes the bounds the panels are laid out by, so it clips always.
            if (!mark.clip) mark.clip = faceted.has(mark) ? true : { signal: SCENE_CLIP_SIGNAL };
            const scaleOf = (axis: 'x' | 'y') => positions.find((entry) => entry.channel === axis)?.scale ?? '';
            pathScales.add(`${scaleOf('x')}|${scaleOf('y')}`);
        }
        const channels = channelsOf(mark.type);
        const arrival = arrivalAxes(positions);
        const motion: MarkMotion = {
            mark: mark.name,
            channels,
            colours: COLOUR_CHANNELS,
            data: positions,
            box: mark.type === 'rect' || mark.type === 'image',
            area: mark.type === 'area',
            arrival,
            identity: identityFields,
            outline,
            written: [...new Set([
                ...channels,
                ...COLOUR_CHANNELS,
                ...positions.map((entry) => entry.channel),
                ...arrival.flatMap((axis) => [axis.start, axis.end, axis.size]),
                ...(mark.type === 'rect' || mark.type === 'image' || mark.type === 'area' ? ['width', 'height'] : []),
                ...(mark.type === 'text' ? ['text'] : []),
                'opacity',
            ])],
        };
        // One field that reads every motion signal, so a change of any of them re-encodes the mark
        // and the transform mixes from what the encoding draws now.
        mark.encode = {
            ...mark.encode,
            update: {
                ...(mark.encode.update ?? {}),
                __flint_scene_t: { signal: `${SCENE_T_SIGNAL} + ${SCENE_ENTER_SIGNAL} + (${SCENE_OUTLINE_SIGNAL} ? 0 : 0)` },
            },
        };
        mark.transform = [
            ...(Array.isArray(mark.transform) ? mark.transform : []),
            {
                type: 'flintmotion',
                motion,
                from: { signal: SCENE_FROM_SIGNAL },
                t: { signal: SCENE_T_SIGNAL },
                enter: { signal: SCENE_ENTER_SIGNAL },
                outline: { signal: SCENE_OUTLINE_SIGNAL },
            },
        ];
        if (GHOST_CHANNELS[mark.type] || PATH_CHANNELS[mark.type]) ghostTypes.add(mark.type);
        injected = true;
    });
    if (!injected) return;
    vegaSpec.signals = [
        ...(Array.isArray(vegaSpec.signals) ? vegaSpec.signals : []),
        { name: SCENE_FROM_SIGNAL, value: null },
        { name: SCENE_T_SIGNAL, value: 1 },
        { name: SCENE_ENTER_SIGNAL, value: 1 },
        { name: SCENE_EXIT_SIGNAL, value: 1 },
        { name: SCENE_OUTLINE_SIGNAL, value: null },
        { name: SCENE_CLIP_SIGNAL, value: false },
    ];
    injectLegendMotion(vegaSpec);
    const fading = { signal: `(isNumber(datum.opacity) ? datum.opacity : 1) * (1 - ${SCENE_EXIT_SIGNAL})` };
    for (const type of ghostTypes) {
        vegaSpec.data = [...(Array.isArray(vegaSpec.data) ? vegaSpec.data : []), { name: exitData(type), values: [] }];
        const pathChannels = PATH_CHANNELS[type];
        if (pathChannels) {
            const [xScale, yScale] = pathScales.size === 1 ? [...pathScales][0]!.split('|') : ['', ''];
            const placed = (channel: string, scale: string) => (scale
                ? { signal: `isNumber(datum.__d_${channel}) ? scale(${JSON.stringify(scale)}, datum.__d_${channel}) : datum.${channel}` }
                : { field: channel });
            // A leaving series is one path drawn through its rows: one group per series draws it. A
            // segment a staying line lost slides out with the scale, at full strength, through the plot's edge.
            vegaSpec.marks = [...(vegaSpec.marks ?? []), {
                type: 'group',
                name: `${exitData(type)}_series`,
                role: 'scene-exit',
                from: { facet: { data: exitData(type), name: `${exitData(type)}_rows`, groupby: '__series' } },
                encode: { update: { width: { signal: 'width' }, height: { signal: 'height' } } },
                marks: [{
                    type,
                    name: `${exitData(type)}_marks`,
                    role: 'scene-exit',
                    from: { data: `${exitData(type)}_rows` },
                    sort: { field: 'datum.__order' },
                    clip: true,
                    interactive: false,
                    encode: {
                        update: {
                            ...Object.fromEntries(pathChannels.map((channel) => [channel, { field: channel }])),
                            x: placed('x', xScale!),
                            y: placed('y', yScale!),
                            ...(pathChannels.includes('y2') ? { y2: placed('y2', yScale!) } : {}),
                            __flint_scene_t: { signal: SCENE_T_SIGNAL },
                            opacity: { signal: `datum.__slides ? (isNumber(datum.opacity) ? datum.opacity : 1) : ${fading.signal}` },
                        },
                    },
                }],
            }];
            continue;
        }
        vegaSpec.marks = [...(vegaSpec.marks ?? []), {
            type,
            name: `${exitData(type)}_marks`,
            role: 'scene-exit',
            from: { data: exitData(type) },
            interactive: false,
            encode: {
                update: {
                    ...Object.fromEntries(GHOST_CHANNELS[type]!.map((channel) => [channel, { field: channel }])),
                    opacity: { signal: `(isNumber(datum.opacity) ? datum.opacity : 1) * (1 - ${SCENE_EXIT_SIGNAL})` },
                },
            },
        }];
    }
}

/** What a leaving item draws, so a copy of it can fade out where it stood. */
const GHOST_CHANNELS: Record<string, readonly string[]> = {
    rect: ['x', 'y', 'width', 'height', 'fill', 'stroke', 'strokeWidth', 'fillOpacity', 'strokeOpacity', 'cornerRadius'],
    symbol: ['x', 'y', 'size', 'shape', 'angle', 'fill', 'stroke', 'strokeWidth', 'fillOpacity', 'strokeOpacity'],
    arc: ['x', 'y', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius', 'padAngle', 'cornerRadius', 'fill', 'stroke', 'strokeWidth', 'fillOpacity'],
    text: ['x', 'y', 'text', 'font', 'fontSize', 'fontWeight', 'align', 'baseline', 'angle', 'dx', 'dy', 'fill', 'fillOpacity'],
};
/** What a leaving series' path draws, vertex by vertex. */
const PATH_CHANNELS: Record<string, readonly string[]> = {
    line: ['x', 'y', 'stroke', 'strokeWidth', 'strokeDash', 'strokeOpacity', 'interpolate'],
    area: ['x', 'y', 'y2', 'fill', 'fillOpacity', 'stroke', 'strokeWidth', 'interpolate'],
};
/**
 * A group drawn once per stack (Vega-Lite's around rounded bars), which clips the stack to its
 * rounded ends and draws its outline: faceted into aggregated stacks, with a group inside that
 * cancels the outer group's place so the bars are drawn through the chart's own scales.
 */
function isStackGroup(mark: Record<string, any>): boolean {
    const facet = mark.type === 'group' ? mark.from?.facet : undefined;
    if (!facet || !Array.isArray(facet.groupby) || facet.groupby.length === 0 || !facet.aggregate) return false;
    return (mark.marks ?? []).some((inner: Record<string, any>) => inner.type === 'group'
        && (['x', 'y'] as const).some((channel) => {
            const place = inner.encode?.update?.[channel];
            return place?.field?.group === channel && place.mult === -1;
        }));
}

/**
 * Moves a stack's group with its bars: the group mixes its box in screen units, keyed by its stack's
 * fields, and the groups inside it, which offset the bars back by the group's place, encode again each frame.
 */
function injectStackGroupMotion(mark: Record<string, any>, name: string, continuous: ReadonlySet<string>, scope: readonly string[]): void {
    mark.name ??= name;
    const groupby = mark.from.facet.groupby as string[];
    const channels = channelsOf('group');
    // The group spans the least to the greatest of its bars' stacked ends, which its aggregate names.
    const aggregate = mark.from.facet.aggregate as { fields?: string[]; ops?: string[]; as?: string[] };
    const outputs = (aggregate.fields ?? []).map((field, at) => ({ field, name: aggregate.as?.[at] ?? `${aggregate.ops?.[at]}_${field}` }));
    const bars: Record<string, any>[] = [];
    walkMarks(mark.marks, (inner) => { if (inner.type === 'rect') bars.push(inner); });
    const positions = bars.flatMap((bar) => dataChannels(bar, continuous));
    const extents = (([['y', 'y2', 'height'], ['x', 'x2', 'width']]) as const).flatMap(([start, end, size]): StackExtent[] => {
        const ends = positions.filter((entry) => entry.channel === start || entry.channel === end);
        const fields = outputs.filter((output) => ends.some((entry) => entry.field === output.field)).map((output) => output.name);
        const scales = new Set(ends.map((entry) => entry.scale));
        return fields.length > 0 && scales.size === 1 ? [{ start, size, scale: [...scales][0]!, fields }] : [];
    });
    const motion: MarkMotion = {
        mark: mark.name,
        channels,
        colours: COLOUR_CHANNELS,
        data: [],
        box: false,
        area: false,
        arrival: [],
        identity: groupby,
        outline: false,
        groupby,
        ...(scope.length > 0 ? { scope } : {}),
        extents,
        written: [...new Set([...channels, ...COLOUR_CHANNELS])],
    };
    const frameSignal = { signal: `${SCENE_T_SIGNAL} + ${SCENE_ENTER_SIGNAL}` };
    mark.encode = { ...(mark.encode ?? {}), update: { ...(mark.encode?.update ?? {}), __flint_scene_t: frameSignal } };
    mark.transform = [
        ...(Array.isArray(mark.transform) ? mark.transform : []),
        {
            type: 'flintmotion',
            motion,
            from: { signal: SCENE_FROM_SIGNAL },
            t: { signal: SCENE_T_SIGNAL },
            enter: { signal: SCENE_ENTER_SIGNAL },
            outline: { signal: SCENE_OUTLINE_SIGNAL },
        },
    ];
    for (const inner of mark.marks ?? []) {
        if (inner.type !== 'group') continue;
        inner.encode = { ...(inner.encode ?? {}), update: { ...(inner.encode?.update ?? {}), __flint_scene_t: frameSignal } };
    }
}

const exitData = (type: string): string => `__flint_scene_exit_${type}`;

export interface SceneGhosts {
    /** Per mark name and row key, the item's type and channels in the root group's coordinates. */
    readonly items: ReadonlyMap<string, { type: string; values: Record<string, unknown> }>;
    /** Every path drawn: its mark, its rows' keys, and its vertices in the root group's coordinates. */
    readonly paths: readonly { name: string; type: string; keys: readonly string[]; vertices: readonly Record<string, unknown>[] }[];
}

/** Every keyed item the chart draws now, placed in the root group's coordinates. */
export function captureGhosts(view: any, identityFields: readonly string[] = []): SceneGhosts {
    const byMark = new Map<string, { marktype: string; items: KeyedItem[] }>();
    const offsets = new Map<any, [number, number]>();
    const pathOf = new Map<any, { name: string; type: string; keys: string[]; vertices: Record<string, unknown>[] }>();
    // `top` is whether the mark sits in the chart's top scope, whose scales a change moves.
    const visit = (node: any, offsetX: number, offsetY: number, top: boolean): void => {
        for (const item of node?.items ?? []) {
            const mark = item.mark;
            if (mark?.marktype === 'group') {
                for (const child of item.items ?? []) visit(child, offsetX + (item.x ?? 0), offsetY + (item.y ?? 0), false);
                continue;
            }
            const pathChannels = PATH_CHANNELS[mark?.marktype];
            if (pathChannels && mark?.name) {
                const key = keyedItem(item, identityFields)?.identity;
                if (key === undefined) continue;
                const values: Record<string, unknown> = { opacity: item.opacity };
                for (const channel of pathChannels) if (item[channel] !== undefined) values[channel] = item[channel];
                if (typeof values.x === 'number') values.x += offsetX;
                if (typeof values.y === 'number') values.y += offsetY;
                if (typeof values.y2 === 'number') values.y2 += offsetY;
                if (top) {
                    for (const channel of ['x', 'y', 'y2'] as const) {
                        const value = drawnDataValue(view, item, channel);
                        if (typeof value === 'number' && Number.isFinite(value)) values[`__d_${channel}`] = value;
                    }
                }
                const path = pathOf.get(mark) ?? { name: mark.name as string, type: mark.marktype as string, keys: [] as string[], vertices: [] as Record<string, unknown>[] };
                path.keys.push(key);
                path.vertices.push(values);
                pathOf.set(mark, path);
                continue;
            }
            if (!GHOST_CHANNELS[mark?.marktype] || !mark?.name) continue;
            const keyed = keyedItem(item, identityFields);
            if (!keyed) continue;
            offsets.set(item, [offsetX, offsetY]);
            const entry = byMark.get(mark.name) ?? { marktype: mark.marktype as string, items: [] as KeyedItem[] };
            entry.items.push(keyed);
            byMark.set(mark.name, entry);
        }
    };
    const rootGroup = view.scenegraph?.()?.root?.items?.[0];
    for (const child of rootGroup?.items ?? []) visit(child, 0, 0, true);
    const items = new Map<string, { type: string; values: Record<string, unknown> }>();
    for (const [name, { marktype, items: keyed }] of byMark) {
        for (const [key, item] of keyItems(keyed, identityFields).byKey) {
            const [offsetX, offsetY] = offsets.get(item) ?? [0, 0];
            const values: Record<string, unknown> = { opacity: item.opacity };
            for (const channel of GHOST_CHANNELS[marktype]!) if (item[channel] !== undefined) values[channel] = item[channel];
            if (typeof values.x === 'number') values.x += offsetX;
            if (typeof values.y === 'number') values.y += offsetY;
            items.set(`${name}\u0000${key}`, { type: marktype, values });
        }
    }
    return { items, paths: [...pathOf.values()] };
}

/** A domain's path from one end to the other: geometric on a log scale, linear otherwise; dates stay dates. */
export function domainPath(type: string, from: readonly unknown[], to: readonly unknown[]): (t: number) => unknown[] {
    const dates = from[0] instanceof Date || to[0] instanceof Date;
    const geometric = type === 'log' && [...from, ...to].every((value) => Number(value) > 0);
    return (t) => from.map((value, index) => {
        const a = Number(value);
        const b = Number(to[index] ?? value);
        const mixed = geometric ? a * (b / a) ** t : a + (b - a) * t;
        return dates ? new Date(mixed) : mixed;
    });
}

/** Draws the items of `before` that `after` no longer has, to fade out over the leave stage; null clears them. Returns how many leave. */
export function setSceneExits(view: any, before: SceneGhosts | null, after?: SceneGhosts): number {
    let leaving = 0;
    const drawnAfter = new Map<string, Set<string>>();
    for (const path of after?.paths ?? []) {
        const keys = drawnAfter.get(path.name) ?? new Set<string>();
        for (const key of path.keys) keys.add(key);
        drawnAfter.set(path.name, keys);
    }
    for (const type of Object.keys(PATH_CHANNELS)) {
        // A series leaves when none of its rows is drawn by its mark any more.
        const gone = before && after
            ? before.paths.filter((path) => path.type === type && !path.keys.some((key) => drawnAfter.get(path.name)?.has(key)))
            : [];
        const segments = before && after
            ? before.paths.filter((path) => path.type === type && !gone.includes(path)).flatMap((path) => lostSegments(path, drawnAfter.get(path.name)))
            : [];
        const rows = [
            ...gone.map((path) => path.vertices),
            ...segments.map((segment) => segment.map((vertex) => ({ ...vertex, __slides: true }))),
        ].flatMap((vertices, series) => vertices.map((vertex, order) => ({ ...vertex, __series: series, __order: order })));
        try {
            view.data(exitData(type), rows);
            leaving += gone.length;
        } catch {
            // This chart draws no mark of this type.
        }
    }
    for (const type of Object.keys(GHOST_CHANNELS)) {
        let rows: Record<string, unknown>[] = [];
        if (before && after) {
            rows = [...before.items].filter(([id, item]) => item.type === type && !after.items.has(id)).map(([, item]) => item.values);
        }
        try {
            view.data(exitData(type), rows);
            leaving += rows.length;
        } catch {
            // This chart draws no mark of this type.
        }
    }
    return leaving;
}

/**
 * The stretches of a path whose vertices the chart no longer draws, each with the staying vertex
 * beside it, so the stretch stays joined to the line while it slides out.
 */
function lostSegments(
    path: { keys: readonly string[]; vertices: readonly Record<string, unknown>[] },
    drawn: ReadonlySet<string> | undefined,
): Record<string, unknown>[][] {
    if (!drawn) return [];
    const segments: Record<string, unknown>[][] = [];
    let run: number[] = [];
    const close = (next: number) => {
        if (run.length === 0) return;
        const first = run[0]! - 1;
        const indices = [...(first >= 0 ? [first] : []), ...run, ...(next < path.keys.length ? [next] : [])];
        segments.push(indices.map((index) => path.vertices[index]!));
        run = [];
    };
    path.keys.forEach((key, index) => {
        if (drawn.has(key)) close(index);
        else run.push(index);
    });
    close(path.keys.length);
    return segments;
}

const LEGEND_ROLES = ['legend-symbol', 'legend-label'] as const;
const legendEntry = (role: string): string => `__legend:${role}`;

/** An encoding's production rules as one expression, or undefined when one reads a field or a scale. */
function ruleExpression(entry: unknown): string | undefined {
    const rules = Array.isArray(entry) ? entry : [entry];
    let expression = 'null';
    for (const rule of [...rules].reverse()) {
        if (!rule || typeof rule !== 'object' || Object.keys(rule).some((key) => !['test', 'value', 'signal'].includes(key))) return undefined;
        const value = 'signal' in rule ? `(${rule.signal})` : JSON.stringify(rule.value ?? null);
        expression = 'test' in rule ? `((${rule.test}) ? ${value} : ${expression})` : value;
    }
    return expression;
}

/** Lets a legend entry's symbol and label fade between states, shown, dimmed or hidden, with the marks. */
function injectLegendMotion(vegaSpec: Record<string, any>): void {
    walkVegaScopes(vegaSpec, (scope) => {
        for (const legend of scope.legends ?? []) {
            for (const [part, role] of [['symbols', 'legend-symbol'], ['labels', 'legend-label']] as const) {
                const update = legend.encode?.[part]?.update;
                if (!update || !Array.isArray(update.opacity)) continue;
                const target = ruleExpression(update.opacity);
                if (!target) continue;
                const entry = `${SCENE_FROM_SIGNAL}[${JSON.stringify(legendEntry(role))}]`;
                const from = `(${SCENE_FROM_SIGNAL} && ${entry} ? ${entry}[datum.value] : null)`;
                update.opacity = { signal: `isNumber(${from}) ? ${from} + (${target} - ${from}) * ${SCENE_T_SIGNAL} : ${target}` };
            }
        }
    });
}

const AXIS_ROLES = ['axis-label', 'axis-tick'] as const;
const axisEntry = (scale: string, role: string): string => `__axis:${scale}:${role}`;

/** Where Vega places a discrete axis's ticks along a band: its band position, extra tick and offset, as Vega's `tickBand` reads them. */
function axisBand(vegaSpec: Record<string, any>, axis: Record<string, any>): { band: number; extra: boolean; offset: number } | undefined {
    const tickBand = axisConfigValue(vegaSpec, axis, 'tickBand', undefined);
    const offset = axisConfigValue(vegaSpec, axis, 'tickOffset', 0);
    if (tickBand === 'extent') return { band: 1, extra: true, offset: 0 };
    if (tickBand === 'center') return typeof offset === 'number' ? { band: 0.5, extra: false, offset } : undefined;
    if (tickBand !== undefined) return undefined;
    const band = axisConfigValue(vegaSpec, axis, 'bandPosition', 0.5);
    const extra = axisConfigValue(vegaSpec, axis, 'tickExtra', false);
    return typeof band === 'number' && typeof extra === 'boolean' && typeof offset === 'number' ? { band, extra, offset } : undefined;
}

/**
 * Lets the labels and ticks of every discrete axis glide with their marks when the order or the
 * categories change. Each keeps Vega's own placement and only offsets it: by where the captured
 * frame drew it, less its new place, shrinking to nothing as the change runs, so at rest the axis
 * draws as Vega does. An axis whose placement is stated by a signal keeps Vega's and does not glide.
 */
export function injectAxisMotion(vegaSpec: Record<string, any>): void {
    if (!compiledWithMotion(vegaSpec)) return;
    const discrete = new Set<string>((vegaSpec.scales ?? [])
        .filter((scale: Record<string, any>) => scale.type === 'band' || scale.type === 'point')
        .map((scale: Record<string, any>) => scale.name));
    walkVegaScopes(vegaSpec, (scope) => {
        for (const axis of scope.axes ?? []) {
            if (!discrete.has(axis.scale)) continue;
            const ticks = axisBand(vegaSpec, axis);
            const labelOffset = axisConfigValue(vegaSpec, axis, 'labelOffset', 0);
            const round = axisConfigValue(vegaSpec, axis, 'tickRound', undefined);
            if (!ticks || typeof labelOffset !== 'number') continue;
            const channel = axis.orient === 'left' || axis.orient === 'right' ? 'y' : 'x';
            const scale = JSON.stringify(axis.scale);
            const encode: Record<string, any> = { ...(axis.encode ?? {}) };
            for (const role of AXIS_ROLES) {
                const part = role === 'axis-label' ? 'labels' : 'ticks';
                const place = role === 'axis-label'
                    ? { band: 0.5, offset: ticks.offset + labelOffset }
                    : { band: ticks.band, offset: ticks.offset, extra: ticks.extra, ...(round !== undefined ? { round } : {}) };
                const entry = `${SCENE_FROM_SIGNAL}[${JSON.stringify(axisEntry(axis.scale, role))}]`;
                const from = `(${SCENE_FROM_SIGNAL} && ${entry} && ${entry}[datum.value] ? ${entry}[datum.value].${channel} : null)`;
                const restAt = `scale(${scale}, datum.value) + bandwidth(${scale}) * ${place.band} + ${place.offset}`;
                const { offset, ...rest } = place;
                encode[part] = {
                    ...(encode[part] ?? {}),
                    update: {
                        ...(encode[part]?.update ?? {}),
                        [channel]: {
                            scale: axis.scale,
                            field: 'value',
                            ...rest,
                            offset: { signal: `${offset} + (isNumber(${from}) ? (${from} - (${restAt})) * (1 - ${SCENE_T_SIGNAL}) : 0)` },
                        },
                    },
                };
            }
            axis.encode = encode;
        }
    });
}

/** The tick values a motion holds a continuous axis at: both sides' values, each label's text, and which side each is on. */
export interface HeldTicks {
    readonly values: readonly unknown[];
    readonly text: Readonly<Record<string, string>>;
    readonly from: Readonly<Record<string, true>>;
    readonly to: Readonly<Record<string, true>>;
}

export const axisTicksSignal = (scale: string): string => `__flint_ticks_${scale.replace(/\W/g, '_')}`;

/**
 * Lets a committed change carry each continuous axis's ticks across: while it runs, an axis draws
 * the values on both sides, placed by the moving scale. A value on both sides moves; one on a
 * single side fades with the move, out or in; each label keeps the text it shows at rest. At
 * rest the hold is null and the axis draws its own ticks.
 */
export function injectAxisTickMotion(vegaSpec: Record<string, any>): string[] {
    if (!compiledWithMotion(vegaSpec)) return [];
    const continuous = new Set<string>((vegaSpec.scales ?? [])
        .filter((scale: Record<string, any>) => CONTINUOUS_SCALES.has(scale.type ?? 'linear'))
        .map((scale: Record<string, any>) => scale.name));
    const held = new Set<string>();
    walkVegaScopes(vegaSpec, (scope) => {
        for (const axis of scope.axes ?? []) {
            if (!continuous.has(axis.scale)) continue;
            const hold = axisTicksSignal(axis.scale);
            const own = Array.isArray(axis.values) ? JSON.stringify(axis.values)
                : typeof axis.values?.signal === 'string' ? `(${axis.values.signal})` : 'null';
            axis.values = { signal: `${hold} ? ${hold}.values : ${own}` };
            const key = 'toString(toNumber(datum.value))';
            const side = `(${hold}.from[${key}] && ${hold}.to[${key}] ? 1 : ${hold}.to[${key}] ? ${SCENE_T_SIGNAL} : ${hold}.from[${key}] ? 1 - ${SCENE_T_SIGNAL} : 1)`;
            const encode: Record<string, any> = { ...(axis.encode ?? {}) };
            // The fade is laid on the fill or stroke opacity, which Vega's overlap removal leaves alone.
            for (const part of ['labels', 'ticks', 'grid'] as const) {
                const update = { ...(encode[part]?.update ?? {}) };
                const channel = part === 'labels' ? 'fillOpacity' : 'strokeOpacity';
                const base = update[channel] === undefined ? '1' : ruleExpression(update[channel]);
                if (base === undefined) continue;
                update[channel] = { signal: `(${base}) * (${hold} ? ${side} : 1)` };
                if (part === 'labels') {
                    const text = update.text === undefined ? 'datum.label' : ruleExpression(update.text);
                    if (text !== undefined) update.text = { signal: `${hold} && isString(${hold}.text[${key}]) ? ${hold}.text[${key}] : (${text})` };
                }
                encode[part] = { ...(encode[part] ?? {}), update };
            }
            axis.encode = encode;
            // While the hold fades both sides, overlap removal stands down, so it hides no label mid-motion.
            const overlap = axisConfigValue(vegaSpec, axis, 'labelOverlap', false);
            const restOverlap = typeof overlap?.signal === 'string' ? `(${overlap.signal})` : JSON.stringify(overlap);
            axis.labelOverlap = { signal: `${hold} ? false : ${restOverlap}` };
            // A tick count thins the values it is given, so it gives way to the held ones.
            const count = axis.tickCount;
            const restCount = count === undefined ? 'null' : typeof count?.signal === 'string' ? `(${count.signal})` : JSON.stringify(count);
            axis.tickCount = { signal: `${hold} ? length(${hold}.values) : ${restCount}` };
            held.add(axis.scale);
        }
    });
    vegaSpec.signals = [...(vegaSpec.signals ?? []), ...[...held].map((scale) => ({ name: axisTicksSignal(scale), value: null }))];
    return [...held];
}

/** The tick values each held axis shows at rest, with each label's text, read from the scene; a label overlap removal hid is not shown. */
export function axisTicksShown(view: any, scales: readonly string[]): Map<string, { values: Map<string, unknown>; text: Record<string, string> }> {
    const wanted = new Set(scales);
    const shown = new Map<string, { values: Map<string, unknown>; text: Record<string, string> }>();
    const visit = (item: any, scale?: string): void => {
        for (const mark of item?.items ?? []) {
            for (const child of mark.items ?? []) {
                const axisScale = mark.role === 'axis' && typeof child.datum?.scale === 'string' ? child.datum.scale : scale;
                if (axisScale && wanted.has(axisScale) && ['axis-label', 'axis-tick', 'axis-grid'].includes(mark.role) && child.datum?.value !== undefined) {
                    const opacity = typeof child.opacity === 'number' ? child.opacity : 1;
                    const text = mark.role === 'axis-label' ? (Array.isArray(child.text) ? child.text.join(' ') : String(child.text ?? '')) : undefined;
                    if (opacity > 0 && text !== '') {
                        const entry = shown.get(axisScale) ?? { values: new Map<string, unknown>(), text: {} };
                        const key = String(+child.datum.value);
                        entry.values.set(key, child.datum.value);
                        if (text !== undefined) entry.text[key] = text;
                        shown.set(axisScale, entry);
                    }
                }
                if (mark.marktype === 'group') visit(child, axisScale);
            }
        }
    };
    visit(view.scenegraph?.()?.root?.items?.[0]);
    return shown;
}

/** The signal that, while set, holds a continuous scale's domain during a transition. */
export const scaleMotionSignal = (scale: string): string => `__flint_domain_${scale.replace(/\W/g, '_')}`;

export interface MovingScale {
    readonly name: string;
    readonly signal: string;
    readonly type: string;
}

const LEGEND_SCALE_CHANNELS = ['fill', 'stroke', 'size', 'opacity', 'shape', 'strokeDash'] as const;

/**
 * Holds each continuous legend's domain in a signal, so the runtime can move it to the rows the
 * chart is given. Returns the pins with their signals; a pin whose scale is not found keeps its domain.
 */
export function bindLegendDomains(vegaSpec: Record<string, any>, pins: readonly LegendDomain[] = []): LegendDomain[] {
    const bound: LegendDomain[] = [];
    const fields = scaleFields(vegaSpec);
    const legends: Record<string, any>[] = [];
    walkVegaScopes(vegaSpec, (scope) => legends.push(...(scope.legends ?? [])));
    for (const pin of pins) {
        // The scale the channel's legend draws, found by the legend's own reference to it.
        const properties = pin.channel === 'color' ? ['fill', 'stroke'] : [pin.channel];
        const keyed = legends.flatMap((legend) => properties.map((property) => legend[property])).find((name) => typeof name === 'string');
        const scale = (vegaSpec.scales ?? []).find((entry: Record<string, any>) => entry.name === keyed);
        if (!scale || !Array.isArray(scale.domain)) continue;
        // A layer may read the same field through a scale of its own (cell labels choosing their ink
        // by the colour behind them): every scale that places one of its fields with the same pinned domain follows the rows together.
        const domain = JSON.stringify(scale.domain);
        const read = fields.get(scale.name) ?? new Set<string>();
        const shared = (vegaSpec.scales ?? []).filter((entry: Record<string, any>) => entry === scale
            || (Array.isArray(entry.domain) && JSON.stringify(entry.domain) === domain && [...(fields.get(entry.name) ?? [])].some((field) => read.has(field))));
        const signal = `__flint_legend_domain_${String(scale.name).replace(/\W/g, '_')}`;
        vegaSpec.signals = [...(vegaSpec.signals ?? []), { name: signal, value: scale.domain }];
        for (const entry of shared) entry.domain = { signal };
        bound.push({ ...pin, signal });
    }
    return bound;
}

/** The fields each scale places, read from every mark's encodings: `{ scale, field }` value references. */
export function scaleFields(vegaSpec: Record<string, any>): Map<string, Set<string>> {
    const fields = new Map<string, Set<string>>();
    const place = (entry: any): void => {
        if (!entry || typeof entry !== 'object') return;
        if (Array.isArray(entry)) {
            entry.forEach(place);
            return;
        }
        const field = typeof entry.field === 'string' ? entry.field : typeof entry.field?.field === 'string' ? entry.field.field : undefined;
        if (typeof entry.scale === 'string' && field !== undefined) {
            const set = fields.get(entry.scale) ?? new Set<string>();
            set.add(field);
            fields.set(entry.scale, set);
        }
        for (const value of Object.values(entry)) place(value);
    };
    const visit = (scope: any): void => {
        for (const mark of scope.marks ?? []) {
            place(mark.encode);
            if (mark.type === 'group') visit(mark);
        }
    };
    visit(vegaSpec);
    return fields;
}

/** A legend domain over `rows`: the field's smallest and largest values, in the scale's direction. */
export function legendDomainOf(pin: LegendDomain, rows: readonly Record<string, unknown>[]): [number, number] | undefined {
    let low = Infinity;
    let high = -Infinity;
    for (const row of rows) {
        const value = Number(row[pin.field]);
        if (row[pin.field] === null || row[pin.field] === undefined || !Number.isFinite(value)) continue;
        if (value < low) low = value;
        if (value > high) high = value;
    }
    if (!(high > low)) return undefined;
    return pin.descending ? [high, low] : [low, high];
}

/**
 * Gives every continuous scale an axis or a legend reads, or a mark is placed by, a domain the
 * runtime can hold: while its signal is set, the scale draws that domain; unset, it falls back to
 * what it drew before (a navigated viewport, else its data). A transition moves the domain from the
 * one drawn to the new one, so axes, legends, gridlines and marks read one scale on every frame.
 */
export function injectScaleMotion(vegaSpec: Record<string, any>): MovingScale[] {
    if (!compiledWithMotion(vegaSpec)) return [];
    const placing = new Set<string>();
    walkVegaScopes(vegaSpec, (scope) => { for (const axis of scope.axes ?? []) placing.add(axis.scale); });
    walkVegaScopes(vegaSpec, (scope) => {
        for (const legend of scope.legends ?? []) {
            for (const channel of LEGEND_SCALE_CHANNELS) if (typeof legend[channel] === 'string') placing.add(legend[channel]);
        }
    });
    walkMarks(vegaSpec.marks, (mark) => {
        const encode = { ...(mark.encode?.enter ?? {}), ...(mark.encode?.update ?? {}) };
        for (const channel of ['x', 'x2', 'y', 'y2']) {
            const scale = encode[channel]?.scale;
            if (typeof scale === 'string') placing.add(scale);
        }
    });
    const moving: MovingScale[] = [];
    for (const scale of vegaSpec.scales ?? []) {
        const type = scale.type ?? 'linear';
        if (!placing.has(scale.name) || !MOVABLE_SCALES.has(type)) continue;
        const signal = scaleMotionSignal(scale.name);
        vegaSpec.signals.push({ name: signal, value: null });
        const held = scale.domainRaw?.signal;
        scale.domainRaw = { signal: held ? `${signal} || ${held}` : signal };
        moving.push({ name: scale.name, signal, type });
    }
    return moving;
}

export interface MovingSize {
    readonly dimension: 'width' | 'height';
    /** The share of the size a change leads to that is drawn now; null draws it whole. */
    readonly signal: string;
}

/**
 * Lets a transition move the chart's size when its data changes it, as with a bar per category.
 * Such a size is made of a scale's steps, so the motion scales the steps and the bands, the axis
 * and the frame grow as one. A size the host's room sets changes outside transitions and jumps.
 */
export function injectSizeMotion(vegaSpec: Record<string, any>): MovingSize[] {
    const signals: Record<string, any>[] = vegaSpec.signals ?? [];
    if (!compiledWithMotion(vegaSpec)) return [];
    const sizes: MovingSize[] = [];
    for (const dimension of ['width', 'height'] as const) {
        const signal = signals.find((candidate) => candidate.name === dimension);
        if (!signal || signal.on || typeof signal.update !== 'string') continue;
        const update: string = signal.update;
        const read = signalsRead(update);
        const stepped = (vegaSpec.scales ?? []).filter((scale: Record<string, any>) => {
            const step = scale.range?.step?.signal;
            return typeof step === 'string' && read.has(step);
        });
        if (stepped.length === 0) continue;
        const share = `__flint_size_${dimension}_share`;
        const factor = `(isNumber(${share}) ? ${share} : 1)`;
        signals.push({ name: share, value: null });
        // A size laid out by its band steps is a whole number of steps, so it scales with them.
        for (const scale of stepped) scale.range = { ...scale.range, step: { signal: `${scale.range.step.signal} * ${factor}` } };
        signal.update = `(${update}) * ${factor}`;
        sizes.push({ dimension, signal: share });
    }
    return sizes;
}

/** Whether `injectSceneMotion` ran on the spec, so the motion signals the other parts read exist. */
function compiledWithMotion(vegaSpec: Record<string, any>): boolean {
    return (vegaSpec.signals ?? []).some((signal: { name?: string }) => signal.name === SCENE_T_SIGNAL);
}

/** The names an expression reads: the signals it depends on. */
function signalsRead(expression: string): Set<string> {
    const names = new Set<string>();
    const walk = (node: any): void => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'Identifier' && !node.member) names.add(node.name);
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(walk);
            else if (value && typeof value === 'object') walk(value);
        }
    };
    try {
        walk(parseExpression(expression));
    } catch {
        // An expression Vega cannot parse reads nothing the motion can follow.
    }
    return names;
}

function walkVegaScopes(scope: Record<string, any>, visit: (scope: Record<string, any>) => void): void {
    visit(scope);
    for (const mark of scope.marks ?? []) if (mark.type === 'group') walkVegaScopes(mark, visit);
}

export type SceneSnapshot = Record<string, Record<string, any>>;

interface KeyedItem {
    readonly identity: string;
    readonly whole: string;
    readonly item: any;
}

/**
 * Whether the identity names two drawn rows within one mark (points sharing a colour). It then
 * names no single element, and each row is its own.
 */
export function identityRepeats(
    items: readonly { readonly mark?: string; readonly datum: Record<string, unknown> }[],
    identityFields: readonly string[],
): boolean {
    if (identityFields.length === 0) return false;
    const seen = new Set<string>();
    for (const { mark, datum } of items) {
        const key = `${mark ?? ''}\u0000${String(identityKey(datum, identityFields))}`;
        if (seen.has(key)) return true;
        seen.add(key);
    }
    return false;
}

/**
 * Each mark's items under the keys the motion matches them by: the identity key, unless two of the
 * mark's items share one (a scatter coloured by group), and then the whole row key. A mark whose
 * items one identity field tells apart on its own (a dot at each series' end) is about that field,
 * so its items are keyed by it: the series' end moves with its new value.
 */
function keyItems(items: readonly KeyedItem[], identityFields: readonly string[]): { whole: boolean; fields: readonly string[]; byKey: Map<string, any>; byIdentity?: Map<string, any> } {
    // A mark that states what its items are is keyed by that.
    if (items.length > 0 && items.every((entry) => typeof entry.item.datum?.[MARK_IDENTITY] === 'string')) {
        return { whole: false, fields: identityFields, byKey: new Map(items.map((entry) => [entry.item.datum[MARK_IDENTITY] as string, entry.item])) };
    }
    const rows = items.map((entry) => ({ datum: entry.item.datum }));
    const whole = identityRepeats(rows, identityFields);
    const own = !whole && identityFields.length > 1 && items.length > 1
        ? identityFields.find((field) => rows.every((row) => row.datum?.[field] !== null && row.datum?.[field] !== undefined)
            && !identityRepeats(rows, [field]))
        : undefined;
    const fields = own ? [own] : identityFields;
    const keyOf = (entry: KeyedItem): string => {
        if (whole) return entry.whole;
        if (!own) return entry.identity;
        const key = identityKey(entry.item.datum, fields);
        return typeof key === 'string' ? key : entry.whole;
    };
    return {
        whole,
        fields,
        byKey: new Map(items.map((entry) => [keyOf(entry), entry.item])),
        ...(own ? { byIdentity: new Map(items.map((entry) => [entry.identity, entry.item])) } : {}),
    };
}

function keyedItem(item: any, identityFields: readonly string[]): KeyedItem | undefined {
    const whole = trackedKey(item.datum, identityFields);
    if (whole === undefined) return undefined;
    const stated = item.datum?.[MARK_IDENTITY];
    const identity = typeof stated === 'string' ? stated : identityKey(item.datum, identityFields);
    return { identity: typeof identity === 'string' ? identity : whole, whole, item };
}

/** The channels every keyed item draws now, as `injectSceneMotion` reads them back. */
export function captureScene(view: any, identityFields: readonly string[] = []): SceneSnapshot {
    const snapshot: SceneSnapshot = {};
    const outlined = new Set<any>();
    eachOutline(view, identityFields, (name, series, items) => {
        const entries = snapshot[outlineEntry(name)] ?? (snapshot[outlineEntry(name)] = {});
        entries[series] = items.map((item) => drawnValues(item, item.mark.marktype));
        for (const item of items) outlined.add(item);
    });
    const byMark = new Map<string, { marktype: string; items: KeyedItem[] }>();
    const visit = (node: any, axisScale?: string): void => {
        if (!node) return;
        const mark = node.mark;
        if (LEGEND_ROLES.includes(mark?.role) && node.datum && node.datum.value !== undefined && typeof node.opacity === 'number') {
            const byValue = snapshot[legendEntry(mark.role)] ?? (snapshot[legendEntry(mark.role)] = {});
            byValue[String(node.datum.value)] = node.opacity;
        }
        if (axisScale && AXIS_ROLES.includes(mark?.role) && node.datum && node.datum.value !== undefined) {
            const byValue = snapshot[axisEntry(axisScale, mark.role)] ?? (snapshot[axisEntry(axisScale, mark.role)] = {});
            byValue[String(node.datum.value)] = { x: node.x, y: node.y };
        }
        const stack = mark?.marktype === 'group' && mark.name ? stackGroupMotion(view, mark.name) : undefined;
        const key = stack ? stackKey(node, stack) : undefined;
        if (stack && key !== undefined) {
            const entries = snapshot[mark.name] ?? (snapshot[mark.name] = { [IDENTITY_FIELDS]: stack.groupby });
            const values = drawnValues(node, 'group');
            for (const field of (stack.extents ?? []).flatMap((extent) => extent.fields)) {
                const value = drawnFieldValue(view, node, field);
                if (value !== undefined) values[`__d_${field}`] = value;
            }
            entries[key] = values;
        }
        const keyed = mark?.name && mark.marktype !== 'group' && !outlined.has(node) ? keyedItem(node, identityFields) : undefined;
        if (keyed) {
            const entry = byMark.get(mark.name) ?? { marktype: mark.marktype as string, items: [] as KeyedItem[] };
            entry.items.push(keyed);
            byMark.set(mark.name, entry);
        }
        const scale = mark?.role === 'axis' && typeof node.datum?.scale === 'string' ? node.datum.scale : axisScale;
        for (const child of node.items ?? []) visit(child, scale);
    };
    visit(view.scenegraph?.()?.root);
    for (const [name, { marktype, items }] of byMark) {
        const { whole, fields, byKey, byIdentity } = keyItems(items, identityFields);
        const entries: Record<string, unknown> = whole ? { [WHOLE_KEY_FLAG]: true } : { [IDENTITY_FIELDS]: fields };
        const valuesOf = new Map<any, Record<string, unknown>>();
        const drawn = (item: any): Record<string, unknown> => {
            let values = valuesOf.get(item);
            if (!values) {
                values = drawnValues(item, marktype);
                for (const channel of ['x', 'x2', 'y', 'y2'] as const) {
                    const value = drawnDataValue(view, item, channel);
                    if (typeof value === 'number' && Number.isFinite(value)) values[`__d_${channel}`] = value;
                }
                valuesOf.set(item, values);
            }
            return values;
        };
        for (const [key, item] of byKey) entries[key] = drawn(item);
        if (byIdentity) {
            entries[WHOLE_IDENTITY] = { fields: identityFields, entries: Object.fromEntries([...byIdentity].map(([key, item]) => [key, drawn(item)])) };
        }
        snapshot[name] = entries;
    }
    return snapshot;
}

/** The channels an item draws that the motion mixes. */
function drawnValues(item: any, marktype: string): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const channel of [...channelsOf(marktype), ...COLOUR_CHANNELS]) {
        const value = item[channel];
        if (typeof value === 'number' || typeof value === 'string') values[channel] = value;
    }
    if (marktype === 'text' && typeof item.text === 'string') values.text = item.text;
    return values;
}

/**
 * Visits every path drawn through rows that do not tell its vertices apart: a violin's or a density's
 * curve, a regression line. Its vertices all carry one key, or none, so the path is one element and
 * its outline is its value. `series` names it by that key, or by its place among its mark's paths.
 */
function eachOutline(view: any, identityFields: readonly string[], visit: (name: string, series: string, items: readonly any[]) => void): void {
    const paths: { name: string; key: string | undefined; items: any[] }[] = [];
    const walk = (mark: any): void => {
        if (!mark) return;
        if (mark.marktype === 'group') {
            for (const item of mark.items ?? []) for (const child of item.items ?? []) walk(child);
            return;
        }
        if (!PATH_CHANNELS[mark.marktype] || !mark.name || mark.role === 'scene-exit') return;
        const items: any[] = mark.items ?? [];
        if (items.length < 2) return;
        const keys = new Set(items.map((item) => keyedItem(item, identityFields)?.identity));
        if (keys.size !== 1) return;
        const [key] = keys;
        paths.push({ name: mark.name, key, items });
    };
    walk(view.scenegraph?.()?.root);
    // A path no key names is matched only when it is its mark's one path (a regression line);
    // among several, it is no element and starts afresh.
    const counts = new Map<string, number>();
    for (const path of paths) counts.set(path.name, (counts.get(path.name) ?? 0) + 1);
    for (const path of paths) {
        if (path.key !== undefined) visit(path.name, path.key, path.items);
        else if (counts.get(path.name) === 1) visit(path.name, '#0', path.items);
    }
}

/**
 * Gives each vertex of an outline drawn now the point at the same place along the outline drawn
 * before, so the shape bends from one to the other whatever number of vertices each has. Returns
 * whether any outline has a start.
 */
export function placeOutlineStarts(view: any, snapshot: SceneSnapshot, identityFields: readonly string[] = []): boolean {
    const starts = resetOutlineStarts(view);
    let placed = false;
    eachOutline(view, identityFields, (name, series, items) => {
        const before = snapshot[outlineEntry(name)]?.[series] as Record<string, unknown>[] | undefined;
        if (!before || before.length === 0) return;
        const last = items.length - 1;
        items.forEach((item, index) => {
            const at = (last > 0 ? index / last : 0) * (before.length - 1);
            const low = Math.floor(at);
            const high = Math.min(low + 1, before.length - 1);
            const share = at - low;
            const values: Record<string, unknown> = {};
            for (const [channel, a] of Object.entries(before[low]!)) {
                const b = before[high]![channel];
                values[channel] = typeof a === 'number' && typeof b === 'number' ? a + (b - a) * share : share < 0.5 ? a : b;
            }
            starts.set(item, values);
        });
        placed = true;
    });
    return placed;
}

/** How many keyed items the chart draws, the items a capture would hold, counted without capturing them. */
export function drawnItemCount(view: any, identityFields: readonly string[] = []): number {
    let count = 0;
    const visit = (node: any): void => {
        if (!node) return;
        if (node.mark?.name && node.mark.marktype !== 'group' && trackedKey(node.datum, identityFields) !== undefined) count += 1;
        for (const child of node.items ?? []) visit(child);
    };
    visit(view.scenegraph?.()?.root);
    return count;
}

/** Whether the view was compiled with the motion signals. */
export function hasSceneMotion(view: any): boolean {
    try {
        view.signal(SCENE_T_SIGNAL);
        return true;
    } catch {
        return false;
    }
}

export const MORPH_TYPES: Record<string, readonly string[]> = {
    ...GHOST_CHANNELS,
    line: ['x', 'y', 'stroke', 'strokeWidth'],
};

/**
 * Every item of `view` that names its element, offset by where its root group sits in the
 * rendered element: by its row key, or, on a chart compiled without interactions, by the
 * identity fields its datum carries.
 */
export function captureMorphScene(view: any, fields: readonly string[], origin: { x: number; y: number }): MorphScene {
    const items: MorphItem[] = [];
    const visit = (node: any, offsetX: number, offsetY: number): void => {
        for (const item of node?.items ?? []) {
            const mark = item.mark;
            if (mark?.marktype === 'group') {
                for (const child of item.items ?? []) visit(child, offsetX + (item.x ?? 0), offsetY + (item.y ?? 0));
                continue;
            }
            const channels = MORPH_TYPES[mark?.marktype];
            const named = typeof item.datum?.[INTERACTION_KEY] === 'string'
                || (fields.length > 0 && fields.every((field) => item.datum?.[field] !== undefined && item.datum?.[field] !== null));
            if (!channels || mark?.role === 'scene-exit' || !named) continue;
            const values: Record<string, unknown> = { opacity: item.opacity };
            for (const channel of channels) if (item[channel] !== undefined) values[channel] = item[channel];
            if (typeof values.x === 'number') values.x += offsetX + origin.x;
            if (typeof values.y === 'number') values.y += offsetY + origin.y;
            items.push({ type: mark.marktype, datum: item.datum, values });
        }
    };
    const rootGroup = view.scenegraph?.()?.root?.items?.[0];
    for (const child of rootGroup?.items ?? []) visit(child, rootGroup?.x ?? 0, rootGroup?.y ?? 0);
    return { items, fields };
}
