/**
 * Live values: the layout values of a compiled Vega spec, bound to one signal so a new plan
 * for the same chart can be pushed into a mounted view without parsing it again.
 *
 * `bindLiveValues` replaces each layout-valued leaf of the spec with a reference into the
 * `LIVE_VALUES_SIGNAL` object and keeps an unbound copy. `liveValuesChange` compares that copy
 * with the next spec, shaped the same way: when the two have the same shape and differ only in
 * bound leaves, plain signal values, the view size or the canvas furniture, it returns what to
 * push; otherwise the change is structural and the chart has to be compiled again.
 *
 * Vega encodes some guide parts, such as key labels, on enter only, so a view runs a push with
 * the `enter` encoding set (`view.runAsync('enter')`) for those parts to read the new values.
 */

export const LIVE_VALUES_SIGNAL = '__flint_live_values';

type Node = Record<string, any>;
type Primitive = string | number | boolean;

/** Properties whose number is a layout value, wherever they appear outside data, signals and encodings. */
const LAYOUT_NUMBERS = new Set([
    'fontSize', 'subtitleFontSize', 'subtitlePadding', 'offset', 'limit',
    'labelFontSize', 'labelLimit', 'labelSeparation', 'labelAngle', 'labelLineHeight', 'labelPadding', 'labelOffset',
    'titleFontSize', 'titlePadding', 'titleLimit', 'tickCount', 'gradientLength', 'gradientThickness',
    'symbolSize', 'columns', 'domainMin', 'domainMax', 'domainMid', 'padding', 'row', 'column', 'size',
    'paddingInner', 'paddingOuter', 'strokeWidth', 'margin',
]);
/** Properties whose string or flag is a layout value. */
const LAYOUT_WORDS = new Set(['labelAlign', 'labelBaseline', 'nice', 'zero']);
/** Lists of plain values a plan decides: tick values, a scale's stated domain, title lines. */
const LAYOUT_LISTS: Record<string, string> = { values: 'axes', domain: 'scales', text: 'title', subtitle: 'title' };
/** Encoded channels whose constant value is a layout value. */
const ENCODED = new Set([
    'fontSize', 'limit', 'width', 'height', 'size', 'radius', 'innerRadius', 'outerRadius', 'cornerRadius',
    'cornerRadiusTopLeft', 'cornerRadiusTopRight', 'cornerRadiusBottomLeft', 'cornerRadiusBottomRight',
    'strokeWidth', 'padAngle', 'angle', 'lineHeight', 'dx', 'dy', 'x', 'y', 'x2', 'y2', 'xc', 'yc',
]);
const SKIPPED = new Set(['data', 'signals', 'usermeta', 'projections']);
/** Sections a list property is read in. */
const SECTIONS = new Set(['axes', 'scales', 'title', 'legends', 'config', 'marks']);

const isPrimitive = (value: unknown): value is Primitive =>
    typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';

/** A bound leaf: the signal key it reads, and where it sits, which decides what it may hold. */
interface BoundLeaf {
    name: string;
    key: string;
    section: string;
    inEncode: boolean;
}

export interface LiveValues {
    /** The spec as compiled, before its leaves were bound: what the next spec is compared against. */
    unbound: Node;
    /** Each bound leaf, by its path. */
    keys: Map<string, BoundLeaf>;
    /** The values the signal holds now. */
    values: Record<string, unknown>;
}

export interface LiveValuesChange {
    values: Record<string, unknown>;
    /** Signals whose initial value changed, by name. */
    signals: Record<string, unknown>;
    /** Inline datasets whose rows changed, and nothing else about them, by name: the rows the plan worked out for the room. */
    datasets: Record<string, readonly unknown[]>;
    width?: number;
    height?: number;
    /** Whether the canvas furniture the spec carries changed. */
    furniture: boolean;
}

const DATETIME = /^datetime\("([^"]+)"\)$/;
/** The path of an entry in the spec's top-level data. */
const DATASET = /^\.data\[\d+\]$/;
const isInline = (entry: unknown): entry is Node & { name: string; values: unknown[] } =>
    Boolean(entry && typeof entry === 'object' && typeof (entry as Node).name === 'string' && Array.isArray((entry as Node).values));
/** The key a rule of an encoded channel is walked under: the channel and the rule's place. */
const RULE_VALUE = /^(.+)\[(\d+)\]$/;
const NO_VALUE = Symbol('no value');

/** A tick or domain entry as a plain value: a number, word, or a `datetime("…")` signal as its time. */
function entryValue(entry: unknown): unknown {
    if (isPrimitive(entry)) return entry;
    const match = entry && typeof entry === 'object' && Object.keys(entry).length === 1
        ? DATETIME.exec(String((entry as Node).signal)) : null;
    const time = match ? Date.parse(match[1]) : NaN;
    return Number.isFinite(time) ? time : NO_VALUE;
}

/**
 * The value a bound leaf holds in the live signal, or NO_VALUE when `value` at `key` is not a
 * layout value a signal can carry there.
 */
function liveValue(key: string, value: unknown, section: string, inEncode: boolean): unknown {
    if (inEncode) {
        // A channel's constant, alone or as the value of one of its rules (`[{ test, value }, { value }]`).
        const rule = RULE_VALUE.exec(key);
        const channel = rule ? rule[1] : key;
        return ENCODED.has(channel) && value && typeof value === 'object' && !Array.isArray(value)
            && Object.keys(value).every((part) => part === 'value' || (rule !== null && part === 'test'))
            && typeof (value as Node).value === 'number'
            ? (value as Node).value : NO_VALUE;
    }
    if (typeof value === 'number' && LAYOUT_NUMBERS.has(key)) return value;
    if (isPrimitive(value) && LAYOUT_WORDS.has(key)) return value;
    if (key === 'padding' && value && typeof value === 'object' && !Array.isArray(value)
        && Object.values(value).every((side) => typeof side === 'number')) return value;
    if (Array.isArray(value) && LAYOUT_LISTS[key] === section) {
        const entries = value.map(entryValue);
        return entries.includes(NO_VALUE) ? NO_VALUE : entries;
    }
    return NO_VALUE;
}

/**
 * Visits each leaf `bindLiveValues` binds, in a fixed order: `visit(path, holder, key)` where
 * `holder[key]` is the bound value, or for an encoded constant `{ value }` object.
 */
function walk(
    node: Node, path: string, section: string, inEncode: boolean,
    visit: (path: string, holder: Node, leaf: BoundLeaf, value: unknown) => void,
): void {
    for (const key of Object.keys(node)) {
        const value = node[key];
        const at = `${path}.${key}`;
        if (SKIPPED.has(key)) continue;
        const live = liveValue(key, value, section, inEncode);
        if (live !== NO_VALUE) {
            visit(at, node, { name: '', key, section, inEncode }, live);
            continue;
        }
        if (!value || typeof value !== 'object') continue;
        const next = SECTIONS.has(key) ? key : section;
        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                const rule = inEncode ? liveValue(`${key}[${index}]`, item, next, inEncode) : NO_VALUE;
                if (rule !== NO_VALUE) visit(`${at}[${index}]`, value as unknown as Node, { name: '', key: `${key}[${index}]`, section: next, inEncode }, rule);
                else if (item && typeof item === 'object') walk(item, `${at}[${index}]`, next, inEncode, visit);
            });
        } else {
            walk(value, at, next, inEncode || key === 'encode', visit);
        }
    }
}

/** Binds the layout values of a compiled Vega spec to `LIVE_VALUES_SIGNAL`, in place. */
export function bindLiveValues(vegaSpec: Node): LiveValues {
    const unbound = structuredClone(vegaSpec);
    const keys = new Map<string, BoundLeaf>();
    const values: Record<string, unknown> = {};
    walk(vegaSpec, '', '', false, (path, holder, leaf, value) => {
        const name = `v${keys.size}`;
        keys.set(path, { ...leaf, name });
        values[name] = value;
        const rule = RULE_VALUE.exec(leaf.key);
        if (rule) {
            const { value: _value, ...test } = holder[Number(rule[2])];
            holder[Number(rule[2])] = { ...test, signal: `${LIVE_VALUES_SIGNAL}.${name}` };
        } else {
            holder[leaf.key] = { signal: `${LIVE_VALUES_SIGNAL}.${name}` };
        }
    });
    if (keys.size > 0) vegaSpec.signals = [{ name: LIVE_VALUES_SIGNAL, value: values }, ...(vegaSpec.signals ?? [])];
    return { unbound, keys, values };
}

function same(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const ak = Object.keys(a as Node);
    if (ak.length !== Object.keys(b as Node).length) return false;
    return ak.every((key) => key in (b as Node) && same((a as Node)[key], (b as Node)[key]));
}

/**
 * What to push to move a view bound by `live` to `next`, or null when `next` differs in shape
 * or in a value no binding reaches.
 */
export function liveValuesChange(live: LiveValues, next: Node): LiveValuesChange | null {
    const { unbound, keys } = live;
    const change: LiveValuesChange = { values: {}, signals: {}, datasets: {}, furniture: false };
    for (const key of new Set([...Object.keys(unbound), ...Object.keys(next)])) {
        if (key === 'signals' || key === 'usermeta' || key === 'width' || key === 'height') continue;
        if (!(key in unbound) || !(key in next)) return null;
    }
    if (!same(unbound.usermeta, next.usermeta)) change.furniture = true;
    for (const dimension of ['width', 'height'] as const) {
        if (unbound[dimension] === next[dimension]) continue;
        if (typeof next[dimension] !== 'number') return null;
        change[dimension] = next[dimension];
    }
    const before: Node[] = unbound.signals ?? [];
    const after: Node[] = next.signals ?? [];
    if (before.length !== after.length) return null;
    for (let index = 0; index < before.length; index += 1) {
        const { value: was, ...restWas } = before[index];
        const { value: now, ...restNow } = after[index];
        if (!same(restWas, restNow)) return null;
        if (same(was, now)) continue;
        if (restNow.update !== undefined || restNow.on !== undefined) return null;
        change.signals[restNow.name] = now;
    }
    let structural = false;
    const compare = (a: unknown, b: unknown, path: string): void => {
        if (structural || a === b) return;
        // A dataset that keeps its name and transforms takes its new rows in place.
        if (DATASET.test(path) && isInline(a) && isInline(b) && a.name === b.name) {
            const { values: rowsWas, ...restWas } = a;
            const { values: rowsNow, ...restNow } = b;
            if (!same(restWas, restNow)) structural = true;
            else if (!same(rowsWas, rowsNow)) change.datasets[b.name] = rowsNow;
            return;
        }
        const leaf = keys.get(path);
        if (leaf) {
            const value = liveValue(leaf.key, b, leaf.section, leaf.inEncode);
            if (value === NO_VALUE) structural = true;
            else if (!same(a, b)) change.values[leaf.name] = value;
            return;
        }
        if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) {
            structural = true;
            return;
        }
        if (Array.isArray(a)) {
            if (a.length !== (b as unknown[]).length) { structural = true; return; }
            a.forEach((item, index) => compare(item, (b as unknown[])[index], `${path}[${index}]`));
            return;
        }
        const ak = Object.keys(a as Node);
        if (ak.length !== Object.keys(b as Node).length) { structural = true; return; }
        for (const key of ak) {
            if (!(key in (b as Node))) { structural = true; return; }
            if (path === '' && (key === 'signals' || key === 'usermeta' || key === 'width' || key === 'height')) continue;
            compare((a as Node)[key], (b as Node)[key], path === '' ? `.${key}` : `${path}.${key}`);
        }
    };
    compare(unbound, next, '');
    return structural ? null : change;
}

/** The live values after `change`, with `next` as the spec they are compared against from now on. */
export function advanceLiveValues(live: LiveValues, next: Node, change: LiveValuesChange): LiveValues {
    return { unbound: next, keys: live.keys, values: { ...live.values, ...change.values } };
}
