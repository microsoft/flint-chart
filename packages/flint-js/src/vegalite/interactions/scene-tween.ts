import { INTERACTION_KEY } from './stores';

/** The drawn state a tween starts from: per mark name, per row key, each channel's value. */
export const SCENE_FROM_SIGNAL = '__flint_scene_from';
/** The tween's eased progress, 0 to 1; 1 when no tween runs. */
export const SCENE_T_SIGNAL = '__flint_scene_t';

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
            + `? (isNumber(datum.opacity) ? datum.opacity : 1) * ${SCENE_T_SIGNAL} : datum.opacity`,
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
        mark.encode = { ...mark.encode, update: { ...(mark.encode.update ?? {}), __flint_scene_t: { signal: SCENE_T_SIGNAL } } };
        mark.transform = [
            ...(Array.isArray(mark.transform) ? mark.transform : []),
            ...channels.map((channel) => numericFormula(from, channel)),
            ...COLOUR_CHANNELS.map((channel) => colourFormula(from, channel)),
            enterFormula(markFrom, from),
        ];
        if (GHOST_CHANNELS[mark.type]) ghostTypes.add(mark.type);
        tweened = true;
    });
    if (!tweened) return;
    vegaSpec.signals = [
        ...(Array.isArray(vegaSpec.signals) ? vegaSpec.signals : []),
        { name: SCENE_FROM_SIGNAL, value: null },
        { name: SCENE_T_SIGNAL, value: 1 },
    ];
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
                    opacity: { signal: `(isNumber(datum.opacity) ? datum.opacity : 1) * (1 - ${SCENE_T_SIGNAL})` },
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

/** Draws the items of `before` that `after` no longer has, to fade out as the tween runs; null clears them. */
export function setSceneExits(view: any, before: SceneGhosts | null, after?: SceneGhosts): void {
    for (const type of Object.keys(GHOST_CHANNELS)) {
        let rows: Record<string, unknown>[] = [];
        if (before && after) {
            rows = [...before.items].filter(([id, item]) => item.type === type && !after.items.has(id)).map(([, item]) => item.values);
        }
        try {
            view.data(exitData(type), rows);
        } catch {
            // This chart draws no mark of this type.
        }
    }
}

const AXIS_ROLES = ['axis-label', 'axis-tick'] as const;
const axisEntry = (scale: string, role: string): string => `__axis:${scale}:${role}`;

/**
 * Lets the labels and ticks of a discrete axis glide with their marks when its order changes:
 * each sits where the captured frame drew it and moves to its band's centre.
 */
export function injectAxisTween(vegaSpec: Record<string, any>, scales: readonly string[]): void {
    if (scales.length === 0 || !(vegaSpec.signals ?? []).some((signal: { name?: string }) => signal.name === SCENE_T_SIGNAL)) return;
    walkVegaScopes(vegaSpec, (scope) => {
        for (const axis of scope.axes ?? []) {
            if (!scales.includes(axis.scale)) continue;
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
            entries[key] = values;
        }
        snapshot[name] = entries;
    }
    return snapshot;
}

/** How many keyed items a snapshot holds. */
export function sceneSize(snapshot: SceneSnapshot): number {
    return Object.entries(snapshot).reduce((count, [name, entries]) => name.startsWith('__axis:')
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
