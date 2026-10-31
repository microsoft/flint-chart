import type { MorphItem, MorphScene } from '../../interactive/morph';
import { INTERACTION_KEY } from './stores';

/** The drawn state a tween starts from: per mark name, per row key, each channel's value. */
export const SCENE_FROM_SIGNAL = '__flint_scene_from';
/** The move stage's eased progress, 0 to 1; 1 when no tween runs. */
export const SCENE_T_SIGNAL = '__flint_scene_t';
/** The arrive stage's progress: rows new to the chart fade in over it. */
export const SCENE_ENTER_SIGNAL = '__flint_scene_enter';
/** The leave stage's progress: rows gone from the chart fade out over it. */
export const SCENE_EXIT_SIGNAL = '__flint_scene_exit';

/** The generation of outline starts the current tween placed on its items; null when none. */
export const SCENE_OUTLINE_SIGNAL = '__flint_scene_outline';

/** Set on a mark's snapshot whose tween keys repeat: its items are matched by their whole row key. */
const WHOLE_KEY_FLAG = '__flint_whole_key';
/** On an item of an outline: what it starts from, sampled from the outline drawn before. */
const OUTLINE_FROM = '__flint_outline_from';
/** On an item of an outline: the generation its start belongs to. */
const OUTLINE_GENERATION = '__flint_outline_generation';
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
};
const NUMERIC_STYLE_CHANNELS = ['opacity', 'fillOpacity', 'strokeOpacity', 'strokeWidth'] as const;
const COLOUR_CHANNELS = ['fill', 'stroke'] as const;

function channelsOf(marktype: string): readonly string[] {
    return [...(POSITION_CHANNELS[marktype] ?? []), ...NUMERIC_STYLE_CHANNELS];
}

function numericFormula(from: string, channel: string): Record<string, unknown> {
    const was = `${from}.${channel}`;
    return {
        type: 'formula',
        as: channel,
        expr: `isValid(${from}) && isNumber(${was}) && isNumber(datum.${channel}) `
            + `? ${was} + (datum.${channel} - ${was}) * ${SCENE_T_SIGNAL} : datum.${channel}`,
    };
}

function colourFormula(from: string, channel: string): Record<string, unknown> {
    const was = `${from}.${channel}`;
    const mix = (part: string): string =>
        `round(rgb(${was}).${part} + (rgb(datum.${channel}).${part} - rgb(${was}).${part}) * ${SCENE_T_SIGNAL})`;
    return {
        type: 'formula',
        as: channel,
        expr: `isValid(${from}) && isString(${was}) && isString(datum.${channel}) && ${was} !== datum.${channel} `
            + `&& isValid(rgb(${was}).r) && isValid(rgb(datum.${channel}).r) `
            + `? 'rgb(' + ${mix('r')} + ',' + ${mix('g')} + ',' + ${mix('b')} + ')' : datum.${channel}`,
    };
}

/** An entering item fades in over the tween, from nothing on screen. */
function enterFormula(markFrom: string, from: string): Record<string, unknown> {
    return {
        type: 'formula',
        as: 'opacity',
        expr: `isValid(${markFrom}) && datum.datum && isString(datum.datum.${INTERACTION_KEY}) && !isValid(${from}) `
            + `? (isNumber(datum.opacity) ? datum.opacity : 1) * ${SCENE_ENTER_SIGNAL} : datum.opacity`,
    };
}

/** The row's name across data changes, as an expression over a scene item. */
function tweenKeyExpression(fields: readonly string[]): string {
    const own = `datum.datum.${INTERACTION_KEY}`;
    if (fields.length === 0) return own;
    const read = (field: string): string => `datum.datum[${JSON.stringify(field)}]`;
    return `(${fields.map((field) => `isValid(${read(field)})`).join(' && ')} `
        + `? ${fields.map((field) => `toString(${read(field)})`).join(` + '|' + `)} : ${own})`;
}

/** The same name, read in code. */
function tweenKey(datum: Record<string, unknown>, fields: readonly string[]): unknown {
    if (fields.length > 0 && fields.every((field) => datum[field] !== null && datum[field] !== undefined && !Number.isNaN(datum[field]))) {
        return fields.map((field) => String(datum[field])).join('|');
    }
    return datum[INTERACTION_KEY];
}

const CONTINUOUS_SCALES = new Set(['linear', 'log', 'pow', 'sqrt', 'symlog', 'time', 'utc']);
const SIMPLE_FIELD = /^[^.[\]\\]+$/;

/** A position channel drawn as a continuous scale of a field or a constant: `scale(field) + offset`. */
interface DataChannel {
    readonly channel: 'x' | 'x2' | 'y' | 'y2';
    readonly scale: string;
    /** The channel's data value now, as an expression over a scene item. */
    readonly value: string;
    readonly offset: number;
}

function dataChannels(mark: Record<string, any>, continuous: ReadonlySet<string>): DataChannel[] {
    const encode = { ...(mark.encode?.enter ?? {}), ...(mark.encode?.update ?? {}) };
    return (['x', 'x2', 'y', 'y2'] as const).flatMap((channel) => {
        const entry = encode[channel];
        if (!entry || Array.isArray(entry) || typeof entry !== 'object' || !continuous.has(entry.scale)) return [];
        if (Object.keys(entry).some((key) => !['scale', 'field', 'value', 'offset'].includes(key))) return [];
        if (entry.offset !== undefined && typeof entry.offset !== 'number') return [];
        const value = typeof entry.field === 'string' && SIMPLE_FIELD.test(entry.field)
            ? `toNumber(datum.datum[${JSON.stringify(entry.field)}])`
            : typeof entry.value === 'number' && entry.field === undefined ? String(entry.value) : undefined;
        return value ? [{ channel, scale: entry.scale, value, offset: entry.offset ?? 0 }] : [];
    });
}

/**
 * Positions that move in data units: each frame mixes the row's captured data value toward its
 * new one and places it through the scale as that frame draws it, so a mark stays true to its
 * axis while the axis itself moves. Rects take their box from both ends.
 */
function dataFormulas(mark: Record<string, any>, channels: readonly DataChannel[], from: string): Record<string, unknown>[] {
    if (channels.length === 0) return [];
    const formulas: Record<string, unknown>[] = [];
    for (const { channel, scale, value, offset } of channels) {
        const was = `${from}.__d_${channel}`;
        formulas.push({
            type: 'formula',
            as: `__flint_d_${channel}`,
            expr: `isValid(${from}) && isNumber(${was}) && isNumber(${value}) ? ${was} + (${value} - ${was}) * ${SCENE_T_SIGNAL} : ${value}`,
        });
        formulas.push({
            type: 'formula',
            as: `__flint_p_${channel}`,
            expr: `isValid(${from}) && isNumber(${was}) && isNumber(datum.__flint_d_${channel}) `
                + `? scale(${JSON.stringify(scale)}, datum.__flint_d_${channel}) + ${offset} : null`,
        });
    }
    const has = (channel: string) => channels.some((entry) => entry.channel === channel);
    const box = mark.type === 'rect' || mark.type === 'image';
    for (const [start, end, size] of [['x', 'x2', 'width'], ['y', 'y2', 'height']] as const) {
        const a = `datum.__flint_p_${start}`;
        const b = `datum.__flint_p_${end}`;
        if (box && has(start) && has(end)) {
            formulas.push({ type: 'formula', as: start, expr: `isNumber(${a}) && isNumber(${b}) ? min(${a}, ${b}) : datum.${start}` });
            formulas.push({ type: 'formula', as: size, expr: `isNumber(${a}) && isNumber(${b}) ? abs(${a} - ${b}) : datum.${size}` });
            continue;
        }
        if (has(start)) formulas.push({ type: 'formula', as: start, expr: `isNumber(${a}) ? ${a} : datum.${start}` });
        if (has(end) && !box) formulas.push({ type: 'formula', as: end, expr: `isNumber(${b}) ? ${b} : datum.${end}` });
    }
    return formulas;
}

/** An area draws from its start and its size, so its size follows the ends the tween mixed. */
function sizeFormulas(markType: string): Record<string, unknown>[] {
    if (markType !== 'area') return [];
    return [['x', 'x2', 'width'], ['y', 'y2', 'height']].map(([start, end, size]) => ({
        type: 'formula',
        as: size,
        expr: `isNumber(datum.${end}) && isNumber(datum.${size}) ? datum.${end} - datum.${start} : datum.${size}`,
    }));
}

/**
 * An item that arrives is placed through the scale as the frame draws it, which can put it outside
 * the plot while the axes still show the old domain. Until it starts to fade in, it waits at the
 * plot's edge, so an item nobody sees takes no room from the title, the axes or the panels.
 */
function arrivalFormulas(channels: readonly DataChannel[], entering: string): Record<string, unknown>[] {
    const formulas: Record<string, unknown>[] = [];
    for (const [start, end, size] of [['x', 'x2', 'width'], ['y', 'y2', 'height']] as const) {
        const scale = channels.find((entry) => entry.channel === start || entry.channel === end)?.scale;
        if (!scale) continue;
        const range = `range(${JSON.stringify(scale)})`;
        const clamp = (value: string) => `clamp(${value}, min(${range}[0], ${range}[1]), max(${range}[0], ${range}[1]))`;
        const far = `__flint_far_${start}`;
        formulas.push(
            { type: 'formula', as: far, expr: `isNumber(datum.${size}) ? datum.${start} + datum.${size} : isNumber(datum.${end}) ? datum.${end} : null` },
            { type: 'formula', as: start, expr: `${entering} && isNumber(datum.${start}) ? ${clamp(`datum.${start}`)} : datum.${start}` },
            { type: 'formula', as: far, expr: `${entering} && isNumber(datum.${far}) ? ${clamp(`datum.${far}`)} : datum.${far}` },
            { type: 'formula', as: size, expr: `isNumber(datum.${size}) && isNumber(datum.${far}) ? datum.${far} - datum.${start} : datum.${size}` },
            { type: 'formula', as: end, expr: `isNumber(datum.${end}) && isNumber(datum.${far}) ? datum.${far} : datum.${end}` },
        );
    }
    return formulas;
}

function walkMarks(marks: readonly Record<string, any>[] | undefined, visit: (mark: Record<string, any>) => void): void {
    for (const mark of marks ?? []) {
        visit(mark);
        if (Array.isArray(mark.marks)) walkMarks(mark.marks, visit);
    }
}

/**
 * Lets every mark drawn from data tween what it draws. Each frame re-runs the mark's encoding (it reads
 * the progress signal), then post-encoding formulas mix each item's channels from the state
 * captured before the change, matched by mark name and row key. No data transform re-runs.
 */
export function injectSceneTween(vegaSpec: Record<string, any>, identityFields: readonly string[] = []): void {
    const key = tweenKeyExpression(identityFields);
    const continuous = new Set<string>((vegaSpec.scales ?? [])
        .filter((scale: Record<string, any>) => CONTINUOUS_SCALES.has(scale.type ?? 'linear'))
        .map((scale: Record<string, any>) => scale.name));
    let tweened = false;
    let unnamed = 0;
    const ghostTypes = new Set<string>();
    walkMarks(vegaSpec.marks, (mark) => {
        if (mark.type === 'group' || !mark.from || !mark.encode) return;
        const channels = channelsOf(mark.type);
        if (!mark.name) mark.name = `__flint_tweened_${unnamed++}`;
        const markFrom = `(${SCENE_FROM_SIGNAL} ? ${SCENE_FROM_SIGNAL}[${JSON.stringify(mark.name)}] : null)`;
        const rowKey = `(${markFrom}.${WHOLE_KEY_FLAG} ? datum.datum.${INTERACTION_KEY} : ${key})`;
        const keyed = `(isValid(${markFrom}) && datum.datum ? ${markFrom}[${rowKey}] : null)`;
        const outline = Boolean(PATH_CHANNELS[mark.type]);
        const from = outline
            ? `(${SCENE_OUTLINE_SIGNAL} && datum.${OUTLINE_GENERATION} === ${SCENE_OUTLINE_SIGNAL} ? datum.${OUTLINE_FROM} : ${keyed})`
            : keyed;
        const positions = dataChannels(mark, continuous);
        const entering = `(isValid(${markFrom}) && datum.datum && isString(datum.datum.${INTERACTION_KEY}) && !isValid(${from}) && ${SCENE_ENTER_SIGNAL} <= 0)`;
        mark.encode = {
            ...mark.encode,
            update: {
                ...(mark.encode.update ?? {}),
                __flint_scene_t: { signal: SCENE_T_SIGNAL },
                __flint_scene_enter: { signal: SCENE_ENTER_SIGNAL },
                ...(outline ? { __flint_scene_outline: { signal: SCENE_OUTLINE_SIGNAL } } : {}),
            },
        };
        mark.transform = [
            ...(Array.isArray(mark.transform) ? mark.transform : []),
            ...channels.map((channel) => numericFormula(from, channel)),
            ...dataFormulas(mark, positions, from),
            ...sizeFormulas(mark.type),
            ...arrivalFormulas(positions, entering),
            ...COLOUR_CHANNELS.map((channel) => colourFormula(from, channel)),
            enterFormula(markFrom, from),
        ];
        if (GHOST_CHANNELS[mark.type] || PATH_CHANNELS[mark.type]) ghostTypes.add(mark.type);
        tweened = true;
    });
    if (!tweened) return;
    vegaSpec.signals = [
        ...(Array.isArray(vegaSpec.signals) ? vegaSpec.signals : []),
        { name: SCENE_FROM_SIGNAL, value: null },
        { name: SCENE_T_SIGNAL, value: 1 },
        { name: SCENE_ENTER_SIGNAL, value: 1 },
        { name: SCENE_EXIT_SIGNAL, value: 1 },
        { name: SCENE_OUTLINE_SIGNAL, value: null },
    ];
    injectLegendTween(vegaSpec);
    const fading = { signal: `(isNumber(datum.opacity) ? datum.opacity : 1) * (1 - ${SCENE_EXIT_SIGNAL})` };
    for (const type of ghostTypes) {
        vegaSpec.data = [...(Array.isArray(vegaSpec.data) ? vegaSpec.data : []), { name: exitData(type), values: [] }];
        const pathChannels = PATH_CHANNELS[type];
        if (pathChannels) {
            // A leaving series is one path drawn through its rows: one group per series draws it.
            vegaSpec.marks = [...(vegaSpec.marks ?? []), {
                type: 'group',
                name: `${exitData(type)}_series`,
                role: 'scene-exit',
                from: { facet: { data: exitData(type), name: `${exitData(type)}_rows`, groupby: '__series' } },
                marks: [{
                    type,
                    name: `${exitData(type)}_marks`,
                    role: 'scene-exit',
                    from: { data: `${exitData(type)}_rows` },
                    sort: { field: 'datum.__order' },
                    interactive: false,
                    encode: {
                        update: {
                            ...Object.fromEntries(pathChannels.map((channel) => [channel, { field: channel }])),
                            opacity: fading,
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
    const visit = (node: any, offsetX: number, offsetY: number): void => {
        for (const item of node?.items ?? []) {
            const mark = item.mark;
            if (mark?.marktype === 'group') {
                for (const child of item.items ?? []) visit(child, offsetX + (item.x ?? 0), offsetY + (item.y ?? 0));
                continue;
            }
            const pathChannels = PATH_CHANNELS[mark?.marktype];
            if (pathChannels && mark?.name) {
                const key = keyedItem(item, identityFields)?.tween;
                if (key === undefined) continue;
                const values: Record<string, unknown> = { opacity: item.opacity };
                for (const channel of pathChannels) if (item[channel] !== undefined) values[channel] = item[channel];
                if (typeof values.x === 'number') values.x += offsetX;
                if (typeof values.y === 'number') values.y += offsetY;
                if (typeof values.y2 === 'number') values.y2 += offsetY;
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
    for (const child of rootGroup?.items ?? []) visit(child, 0, 0);
    const items = new Map<string, { type: string; values: Record<string, unknown> }>();
    for (const [name, { marktype, items: keyed }] of byMark) {
        for (const [key, item] of keyItems(keyed).byKey) {
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
        const rows = gone.flatMap((path, series) => path.vertices.map((vertex, order) => ({ ...vertex, __series: series, __order: order })));
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
function injectLegendTween(vegaSpec: Record<string, any>): void {
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

/**
 * Lets the labels and ticks of every discrete axis glide with their marks when the order or the
 * categories change: each sits where the captured frame drew it and moves to its band's centre.
 */
export function injectAxisTween(vegaSpec: Record<string, any>): void {
    if (!(vegaSpec.signals ?? []).some((signal: { name?: string }) => signal.name === SCENE_T_SIGNAL)) return;
    const discrete = new Set<string>((vegaSpec.scales ?? [])
        .filter((scale: Record<string, any>) => scale.type === 'band' || scale.type === 'point')
        .map((scale: Record<string, any>) => scale.name));
    walkVegaScopes(vegaSpec, (scope) => {
        for (const axis of scope.axes ?? []) {
            if (!discrete.has(axis.scale)) continue;
            const channel = axis.orient === 'left' || axis.orient === 'right' ? 'y' : 'x';
            const scale = JSON.stringify(axis.scale);
            const centre = `scale(${scale}, datum.value) + bandwidth(${scale}) * 0.5`;
            const encode: Record<string, any> = { ...(axis.encode ?? {}) };
            for (const role of AXIS_ROLES) {
                const part = role === 'axis-label' ? 'labels' : 'ticks';
                const entry = `${SCENE_FROM_SIGNAL}[${JSON.stringify(axisEntry(axis.scale, role))}]`;
                const from = `(${SCENE_FROM_SIGNAL} && ${entry} && ${entry}[datum.value] ? ${entry}[datum.value].${channel} : null)`;
                encode[part] = {
                    ...(encode[part] ?? {}),
                    update: {
                        ...(encode[part]?.update ?? {}),
                        [channel]: { signal: `isNumber(${from}) ? ${from} + (${centre} - ${from}) * ${SCENE_T_SIGNAL} : ${centre}` },
                    },
                };
            }
            axis.encode = encode;
        }
    });
}

/** The signal that, while set, holds a continuous scale's domain during a transition. */
export const scaleTweenSignal = (scale: string): string => `__flint_domain_${scale.replace(/\W/g, '_')}`;

export interface TweenedScale {
    readonly name: string;
    readonly signal: string;
    readonly type: string;
}

/**
 * Gives every continuous scale an axis reads or a mark is placed by a domain the runtime can hold:
 * while its signal is set, the scale draws that domain; unset, it falls back to what it drew before
 * (a navigated viewport, else its data). A transition moves the domain from the one drawn to the
 * new one, so axes, gridlines and marks read one scale on every frame.
 */
export function injectScaleTween(vegaSpec: Record<string, any>): TweenedScale[] {
    if (!(vegaSpec.signals ?? []).some((signal: { name?: string }) => signal.name === SCENE_T_SIGNAL)) return [];
    const placing = new Set<string>();
    walkVegaScopes(vegaSpec, (scope) => { for (const axis of scope.axes ?? []) placing.add(axis.scale); });
    walkMarks(vegaSpec.marks, (mark) => {
        const encode = { ...(mark.encode?.enter ?? {}), ...(mark.encode?.update ?? {}) };
        for (const channel of ['x', 'x2', 'y', 'y2']) {
            const scale = encode[channel]?.scale;
            if (typeof scale === 'string') placing.add(scale);
        }
    });
    const tweened: TweenedScale[] = [];
    for (const scale of vegaSpec.scales ?? []) {
        const type = scale.type ?? 'linear';
        if (!placing.has(scale.name) || !CONTINUOUS_SCALES.has(type)) continue;
        const signal = scaleTweenSignal(scale.name);
        vegaSpec.signals.push({ name: signal, value: null });
        const held = scale.domainRaw?.signal;
        scale.domainRaw = { signal: held ? `${signal} || ${held}` : signal };
        tweened.push({ name: scale.name, signal, type });
    }
    return tweened;
}

function walkVegaScopes(scope: Record<string, any>, visit: (scope: Record<string, any>) => void): void {
    visit(scope);
    for (const mark of scope.marks ?? []) if (mark.type === 'group') walkVegaScopes(mark, visit);
}

export type SceneSnapshot = Record<string, Record<string, any>>;

interface KeyedItem {
    readonly tween: string;
    readonly whole: string;
    readonly item: any;
}

/**
 * Each mark's items under the keys the tween matches them by: the tween key, unless two of the
 * mark's items share one (a scatter coloured by group), and then the whole row key.
 */
function keyItems(items: readonly KeyedItem[]): { whole: boolean; byKey: Map<string, any> } {
    const byTween = new Map<string, any>();
    for (const entry of items) {
        if (byTween.has(entry.tween)) {
            return { whole: true, byKey: new Map(items.map((candidate) => [candidate.whole, candidate.item])) };
        }
        byTween.set(entry.tween, entry.item);
    }
    return { whole: false, byKey: byTween };
}

function keyedItem(item: any, identityFields: readonly string[]): KeyedItem | undefined {
    const whole = item.datum?.[INTERACTION_KEY];
    if (typeof whole !== 'string') return undefined;
    const tween = tweenKey(item.datum, identityFields);
    return { tween: typeof tween === 'string' ? tween : whole, whole, item };
}

/** The channels every keyed item draws now, as `injectSceneTween` reads them back. */
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
        const { whole, byKey } = keyItems(items);
        const entries: Record<string, unknown> = whole ? { [WHOLE_KEY_FLAG]: true } : {};
        for (const [key, item] of byKey) {
            const values = drawnValues(item, marktype);
            for (const channel of ['x', 'x2', 'y', 'y2']) {
                const value = item[`__flint_d_${channel}`];
                if (typeof value === 'number' && Number.isFinite(value)) values[`__d_${channel}`] = value;
            }
            entries[key] = values;
        }
        snapshot[name] = entries;
    }
    return snapshot;
}

/** The channels an item draws that the tween mixes. */
function drawnValues(item: any, marktype: string): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const channel of [...channelsOf(marktype), ...COLOUR_CHANNELS]) {
        const value = item[channel];
        if (typeof value === 'number' || typeof value === 'string') values[channel] = value;
    }
    return values;
}

/**
 * Visits every path drawn through rows that do not tell its vertices apart: a violin's or a density's
 * curve, a regression line. Its vertices all carry one key, or none, so the path is one element and
 * its outline is its value. `series` names it by that key, or by its place among its mark's paths.
 */
function eachOutline(view: any, identityFields: readonly string[], visit: (name: string, series: string, items: readonly any[]) => void): void {
    const seen = new Map<string, number>();
    const walk = (mark: any): void => {
        if (!mark) return;
        if (mark.marktype === 'group') {
            for (const item of mark.items ?? []) for (const child of item.items ?? []) walk(child);
            return;
        }
        if (!PATH_CHANNELS[mark.marktype] || !mark.name || mark.role === 'scene-exit') return;
        const items: any[] = mark.items ?? [];
        const place = seen.get(mark.name) ?? 0;
        seen.set(mark.name, place + 1);
        if (items.length < 2) return;
        const keys = new Set(items.map((item) => keyedItem(item, identityFields)?.tween));
        if (keys.size !== 1) return;
        const [key] = keys;
        visit(mark.name, key ?? `#${place}`, items);
    };
    walk(view.scenegraph?.()?.root);
}

/**
 * Gives each vertex of an outline drawn now the point at the same place along the outline drawn
 * before, so the shape bends from one to the other whatever number of vertices each has. Returns
 * whether any outline has a start.
 */
export function placeOutlineStarts(view: any, snapshot: SceneSnapshot, identityFields: readonly string[] = [], generation = 1): boolean {
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
            item[OUTLINE_FROM] = values;
            item[OUTLINE_GENERATION] = generation;
        });
        placed = true;
    });
    return placed;
}

/** How many keyed items a snapshot holds. */
export function sceneSize(snapshot: SceneSnapshot): number {
    return Object.entries(snapshot).reduce((count, [name, entries]) => {
        if (name.startsWith('__axis:') || name.startsWith('__legend:')) return count;
        if (name.startsWith('__outline:')) return count + Object.values(entries).reduce((sum, vertices) => sum + (vertices as unknown[]).length, 0);
        return count + Object.keys(entries).filter((key) => key !== WHOLE_KEY_FLAG).length;
    }, 0);
}

/** Whether the view was compiled with the tween signals. */
export function hasSceneTween(view: any): boolean {
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

/** Every keyed item of `view`, offset by where its root group sits in the rendered element. */
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
            if (!channels || mark?.role === 'scene-exit' || typeof item.datum?.[INTERACTION_KEY] !== 'string') continue;
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
