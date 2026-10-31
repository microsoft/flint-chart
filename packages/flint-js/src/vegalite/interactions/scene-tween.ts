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
/** True while another layer draws the marks, during a morph between two charts. */
export const SCENE_HIDDEN_SIGNAL = '__flint_scene_hidden';

/** Set on a mark's snapshot whose tween keys repeat: its items are matched by their whole row key. */
const WHOLE_KEY_FLAG = '__flint_whole_key';

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
export function injectSceneTween(vegaSpec: Record<string, any>, tweenFields: readonly string[] = []): void {
    const key = tweenKeyExpression(tweenFields);
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
        const from = `(isValid(${markFrom}) && datum.datum ? ${markFrom}[${rowKey}] : null)`;
        mark.encode = {
            ...mark.encode,
            update: {
                ...(mark.encode.update ?? {}),
                __flint_scene_t: { signal: SCENE_T_SIGNAL },
                __flint_scene_enter: { signal: SCENE_ENTER_SIGNAL },
                __flint_scene_hidden: { signal: SCENE_HIDDEN_SIGNAL },
            },
        };
        mark.transform = [
            ...(Array.isArray(mark.transform) ? mark.transform : []),
            ...channels.map((channel) => numericFormula(from, channel)),
            ...dataFormulas(mark, dataChannels(mark, continuous), from),
            ...COLOUR_CHANNELS.map((channel) => colourFormula(from, channel)),
            enterFormula(markFrom, from),
            { type: 'formula', as: 'opacity', expr: `${SCENE_HIDDEN_SIGNAL} ? 0 : datum.opacity` },
        ];
        if (GHOST_CHANNELS[mark.type]) ghostTypes.add(mark.type);
        tweened = true;
    });
    if (!tweened) return;
    vegaSpec.signals = [
        ...(Array.isArray(vegaSpec.signals) ? vegaSpec.signals : []),
        { name: SCENE_FROM_SIGNAL, value: null },
        { name: SCENE_T_SIGNAL, value: 1 },
        { name: SCENE_ENTER_SIGNAL, value: 1 },
        { name: SCENE_EXIT_SIGNAL, value: 1 },
        { name: SCENE_HIDDEN_SIGNAL, value: false },
    ];
    injectLegendTween(vegaSpec);
    for (const type of ghostTypes) {
        vegaSpec.data = [...(Array.isArray(vegaSpec.data) ? vegaSpec.data : []), { name: exitData(type), values: [] }];
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
const exitData = (type: string): string => `__flint_scene_exit_${type}`;

export interface SceneGhosts {
    /** Per mark name and row key, the item's type and channels in the root group's coordinates. */
    readonly items: ReadonlyMap<string, { type: string; values: Record<string, unknown> }>;
}

/** Every keyed item the chart draws now, placed in the root group's coordinates. */
export function captureGhosts(view: any, tweenFields: readonly string[] = []): SceneGhosts {
    const byMark = new Map<string, { marktype: string; items: KeyedItem[] }>();
    const offsets = new Map<any, [number, number]>();
    const visit = (node: any, offsetX: number, offsetY: number): void => {
        for (const item of node?.items ?? []) {
            const mark = item.mark;
            if (mark?.marktype === 'group') {
                for (const child of item.items ?? []) visit(child, offsetX + (item.x ?? 0), offsetY + (item.y ?? 0));
                continue;
            }
            if (!GHOST_CHANNELS[mark?.marktype] || !mark?.name) continue;
            const keyed = keyedItem(item, tweenFields);
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
    return { items };
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
 * Gives every continuous scale an axis reads a domain the runtime can hold: while its signal is
 * set, the scale draws that domain; unset, it falls back to what it drew before (a navigated
 * viewport, else its data). A transition moves the domain from the one drawn to the new one, so
 * axes, gridlines and marks read one scale on every frame.
 */
export function injectScaleTween(vegaSpec: Record<string, any>): TweenedScale[] {
    if (!(vegaSpec.signals ?? []).some((signal: { name?: string }) => signal.name === SCENE_T_SIGNAL)) return [];
    const axisScales = new Set<string>();
    walkVegaScopes(vegaSpec, (scope) => { for (const axis of scope.axes ?? []) axisScales.add(axis.scale); });
    const tweened: TweenedScale[] = [];
    for (const scale of vegaSpec.scales ?? []) {
        const type = scale.type ?? 'linear';
        if (!axisScales.has(scale.name) || !CONTINUOUS_SCALES.has(type)) continue;
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

function keyedItem(item: any, tweenFields: readonly string[]): KeyedItem | undefined {
    const whole = item.datum?.[INTERACTION_KEY];
    if (typeof whole !== 'string') return undefined;
    const tween = tweenKey(item.datum, tweenFields);
    return { tween: typeof tween === 'string' ? tween : whole, whole, item };
}

/** The channels every keyed item draws now, as `injectSceneTween` reads them back. */
export function captureScene(view: any, tweenFields: readonly string[] = []): SceneSnapshot {
    const snapshot: SceneSnapshot = {};
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
        const keyed = mark?.name && mark.marktype !== 'group' ? keyedItem(node, tweenFields) : undefined;
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
            const values: Record<string, unknown> = {};
            for (const channel of [...channelsOf(marktype), ...COLOUR_CHANNELS]) {
                const value = item[channel];
                if (typeof value === 'number' || typeof value === 'string') values[channel] = value;
            }
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

/** How many keyed items a snapshot holds. */
export function sceneSize(snapshot: SceneSnapshot): number {
    return Object.entries(snapshot).reduce((count, [name, entries]) => name.startsWith('__axis:') || name.startsWith('__legend:')
        ? count
        : count + Object.keys(entries).filter((key) => key !== WHOLE_KEY_FLAG).length, 0);
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

const MORPH_TYPES: Record<string, readonly string[]> = {
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
