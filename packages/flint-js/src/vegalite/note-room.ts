// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { noteRoomNeed, regionRoomNeed, roomPast } from '../core/annotation';
import type { AxisLabelPlan } from '../core/axis-labels';
import type { TextMeasurer } from '../core/legend-layout';
import type { AssembleOptions } from '../core/types';
import type { SemanticAnnotation } from '../core/field-semantics';
import { comparableValue, selectorRowTest } from '../core/target-selector';
import { markTypeOf } from './theme';
import { niceExtent, tickStep } from './nice';

type Notes = NonNullable<AssembleOptions['notes']>;
type Regions = NonNullable<AssembleOptions['regions']>;
type Row = Record<string, unknown>;

const AGGREGATES = new Set(['sum', 'mean', 'average', 'min', 'max']);

function sameValue(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a instanceof Date || b instanceof Date) return new Date(a as any).getTime() === new Date(b as any).getTime();
    return a !== null && b !== null && a !== undefined && b !== undefined && String(a) === String(b);
}


const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * The bins Vega cuts an extent into (its `bin` transform): a step from 1, 2 or 5 times a power of
 * ten that gives at most `maxbins` bins, the ends rounded out to it. Undefined for the options this
 * does not follow (an anchor or a list of steps).
 */
function vegaBins(options: any, extent: readonly [number, number]): { start: number; stop: number; step: number } | undefined {
    if (options.anchor !== undefined || options.steps !== undefined || options.span !== undefined) return undefined;
    const maxbins = options.maxbins ?? 10;
    const base = options.base ?? 10;
    const logb = Math.log(base);
    const divide: number[] = options.divide ?? [5, 2];
    let [min, max] = extent;
    const span = max - min || Math.abs(min) || 1;
    let step: number;
    if (finite(options.step)) step = options.step;
    else {
        const level = Math.ceil(Math.log(maxbins) / logb);
        const minstep = options.minstep ?? 0;
        step = Math.max(minstep, base ** (Math.round(Math.log(span) / logb) - level));
        while (Math.ceil(span / step) > maxbins) step *= base;
        for (const div of divide) {
            const v = step / div;
            if (v >= minstep && span / v <= maxbins) step = v;
        }
    }
    const v = Math.log(step);
    const precision = v >= 0 ? 0 : Math.floor(-v / logb) + 1;
    const eps = base ** (-precision - 1);
    if (options.nice ?? true) {
        const floor = Math.floor(min / step + eps) * step;
        min = min < floor ? floor - step : floor;
        max = Math.ceil(max / step) * step;
    }
    return { start: min, stop: max === min ? min + step : max, step };
}

function aggregate(op: string | undefined, values: readonly number[]): number {
    if (op === 'sum') return values.reduce((total, value) => total + value, 0);
    if (op === 'mean' || op === 'average') return values.reduce((total, value) => total + value, 0) / values.length;
    if (op === 'min') return Math.min(...values);
    return Math.max(...values);
}

/**
 * The rows the marks are drawn from, where the spec computes them by binning and aggregating (a
 * histogram's counts): its `bin` and `aggregate` transforms run over the data as Vega runs them.
 * Undefined where it computes them any other way.
 */
function computedRows(transforms: readonly any[], rows: readonly Row[]): Row[] | undefined {
    let out = rows.slice();
    for (const transform of transforms) {
        if (transform.bin && typeof transform.field === 'string' && transform.as) {
            const [startAs, endAs]: string[] = Array.isArray(transform.as) ? transform.as : [transform.as, `${transform.as}_end`];
            const values = out.map((row) => row[transform.field]).filter(finite);
            if (!values.length) return undefined;
            const options = transform.bin === true ? {} : transform.bin;
            const extent: [number, number] = Array.isArray(options.extent) ? options.extent : [Math.min(...values), Math.max(...values)];
            const bins = vegaBins(options, extent);
            if (!bins) return undefined;
            const { start, stop, step } = bins;
            out = out.map((row) => {
                const value = row[transform.field];
                if (!finite(value)) return { ...row, [startAs]: null, [endAs]: null };
                const at = start + step * Math.floor(1e-14 + (Math.max(start, Math.min(value, stop - step)) - start) / step);
                return { ...row, [startAs]: at, [endAs]: at + step };
            });
        } else if (Array.isArray(transform.aggregate)) {
            const groupby: string[] = transform.groupby ?? [];
            const groups = new Map<string, Row[]>();
            for (const row of out) {
                const key = JSON.stringify(groupby.map((name) => row[name]));
                const list = groups.get(key);
                if (list) list.push(row);
                else groups.set(key, [row]);
            }
            const ops: { op: string; field?: string; as: string }[] = transform.aggregate;
            if (ops.some(({ op }) => op !== 'count' && !AGGREGATES.has(op))) return undefined;
            out = [...groups.values()].map((members) => {
                const row: Row = Object.fromEntries(groupby.map((name) => [name, members[0][name]]));
                for (const { op, field, as } of ops) {
                    if (op === 'count') row[as] = members.length;
                    else {
                        const values = members.map((member) => member[field!]).filter(finite);
                        row[as] = values.length ? aggregate(op, values) : null;
                    }
                }
                return row;
            });
        } else return undefined;
    }
    return out;
}

/** The rows a unit's marks are drawn from where its spec (or the view's) bins and aggregates the data. */
function unitRows(spec: any, unit: any, data: readonly Row[]): Row[] | undefined {
    const transforms = [...(spec.transform ?? []), ...(unit !== spec ? unit.transform ?? [] : [])];
    return transforms.length ? computedRows(transforms, data) : undefined;
}

/** Whether a row's mark stands in a stretch of x: its value, or its span from x to x2, inside the bounds. */
function stretchOf(encoding: any, bounds: readonly unknown[] | undefined): ((row: Row) => boolean) | undefined {
    const enc = encoding.x;
    if (!enc?.field || !bounds?.length) return undefined;
    const field: string = enc.field;
    if (enc.type === 'quantitative' || enc.type === 'temporal') {
        if (bounds.length !== 2) return undefined;
        const number = (value: unknown): number => finite(value) ? value
            : value instanceof Date ? value.getTime()
                : enc.type === 'temporal' && value !== null && value !== undefined ? Date.parse(String(value)) : NaN;
        const ends = bounds.map((bound, at) => bound === null || bound === undefined ? (at === 0 ? -Infinity : Infinity) : number(bound));
        if (ends.some(Number.isNaN)) return undefined;
        const lo = Math.min(ends[0], ends[1]);
        const hi = Math.max(ends[0], ends[1]);
        const end: string | undefined = encoding.x2?.field;
        return (row) => {
            const x = number(row[field]);
            if (!Number.isFinite(x)) return false;
            const x2 = end ? number(row[end]) : NaN;
            // A bin stands in the stretch where any of its width does; touching an end is not standing in it.
            if (Number.isFinite(x2)) return Math.max(x, x2) > lo && Math.min(x, x2) < hi;
            return x >= lo && x <= hi;
        };
    }
    const names = new Set(bounds.map(String));
    return (row) => names.has(String(row[field]));
}

/**
 * Room for the chart's first notes past the marks they name, on a single view: a noted value at
 * the top of a vertical measure axis extends that axis to a round tick far enough for the caption
 * over it ({@link roomPast}). As in Blabber, only an upward value gets paper: a horizontal bar's
 * caption stands past its end in the paper the chart has, and a negative bar's beneath it.
 * A captioned stretch of x gets the same where its marks leave its caption no row clear of them,
 * above or (for points and lines) below. The marks' values are the data's, or the bins and counts
 * the spec computes from it (a histogram). Every layer that draws the measure gets the same end, as
 * they share its scale. An axis with a stated domain, a stated end, a scale other than linear, or
 * a stack is left as it is; Flint's own ticks are extended at their step, Vega-Lite's rounding is
 * matched.
 */
export function vlReserveNoteRoom(
    spec: any,
    room: { notes?: Notes; regions?: Regions },
    data: readonly Record<string, unknown>[],
    plot: { width: number; height: number } | undefined,
    axisLabels: Partial<Record<'x' | 'y', AxisLabelPlan>>,
    measure: TextMeasurer,
): void {
    const notes = room.notes ?? [];
    // A stretch of x captioned at its top: by the placer's choice, or asked for.
    const regions = (room.regions ?? []).filter((region) => region.text && region.x?.length && !region.y?.length
        && (region.placement === undefined || region.placement === 'top'));
    if ((!notes.length && !regions.length) || !plot || !data.length) return;
    if (spec.facet || spec.repeat || spec.vconcat || spec.hconcat || spec.concat) return;
    const units: any[] = [spec, ...(Array.isArray(spec.layer) ? spec.layer : [])].filter((unit) => unit?.encoding || unit?.mark);
    {
        const channel = 'y' as const;
        const other = 'x' as const;
        const length = plot.height;
        // The units that draw a measure on this channel, each with its own encodings merged over the view's.
        const drawn = units.flatMap((unit) => {
            const encoding = { ...(unit === spec ? {} : spec.encoding), ...unit.encoding };
            const enc = encoding[channel];
            if (!enc?.field || enc.type !== 'quantitative' || enc.bin) return [];
            return [{ unit, enc, encoding, mark: markTypeOf(unit.mark ?? spec.mark) }];
        });
        const primary = drawn.find(({ unit }) => !unit.__themeSynthetic) ?? drawn[0];
        if (!primary) return;
        const { enc, encoding, mark } = primary;
        const field: string = enc.field;
        // A measure the spec computes is read from the rows it computes, where it bins and counts.
        const rows = data.some((row) => field in row) ? data : unitRows(spec, primary.unit, data);
        if (!rows?.length) return;
        const bars = mark === 'bar';
        if (!bars && mark !== 'point' && mark !== 'circle' && mark !== 'square' && mark !== 'line' && mark !== 'tick') return;
        const stacked = bars && enc.stack !== null && enc.stack !== false
            && (encoding.color?.field || encoding.detail) && !encoding[`${other}Offset`];
        if (stacked) return;
        const encodings = drawn.filter((entry) => entry.enc.field === field).map((entry) => entry.enc);
        const scale = enc.scale ?? {};
        if (encodings.some((e) => Array.isArray(e.scale?.domain) || e.scale?.domainRaw) || (scale.type && scale.type !== 'linear')) return;
        if (scale.reverse) return;

        // The values the marks stand at, by the band they stand in where the measure is aggregated.
        const op = typeof enc.aggregate === 'string' ? enc.aggregate : undefined;
        if (op && !AGGREGATES.has(op)) return;
        const group: string | undefined = op ? encoding[other]?.field : undefined;
        if (op && !group) return;
        const numeric = (row: Record<string, unknown>) => typeof row[field] === 'number' && Number.isFinite(row[field] as number);
        const markValues = (subset: readonly Record<string, unknown>[]): number[] => {
            if (!op) return subset.filter(numeric).map((row) => row[field] as number);
            const groups = new Map<string, number[]>();
            for (const row of subset) {
                if (!numeric(row)) continue;
                const key = String(row[group!]);
                groups.set(key, [...(groups.get(key) ?? []), row[field] as number]);
            }
            return [...groups.values()].map((values) => aggregate(op, values));
        };
        const all = markValues(rows);
        if (!all.length) return;

        // The domain the axis draws: Flint's ruler where it set one, else the data's rounded as Vega-Lite rounds.
        const ruled = Array.isArray(enc.axis?.values) && scale.nice === false
            && typeof scale.domainMin === 'number' && typeof scale.domainMax === 'number';
        const zero = scale.zero ?? true;
        let lo = typeof scale.domainMin === 'number' ? scale.domainMin : zero ? Math.min(0, ...all) : Math.min(...all);
        let hi = typeof scale.domainMax === 'number' ? scale.domainMax : zero ? Math.max(0, ...all) : Math.max(...all);
        if (!ruled && scale.nice !== false) {
            const [niceLo, niceHi] = niceExtent(lo, hi);
            if (typeof scale.domainMin !== 'number') lo = niceLo;
            if (typeof scale.domainMax !== 'number') hi = niceHi;
        }

        const labels = axisLabels[channel];
        const chart = { ...(labels?.fontSize ? { fontSize: labels.fontSize } : {}), ...(labels?.font ? { font: labels.font } : {}) };
        const measureAt = (fontSize: number) => measure(fontSize, chart.font ?? 'sans-serif', 'normal', 'normal');
        let max: number | undefined;
        for (const note of notes) {
            const keyFields = Object.entries(note.key).filter(([name]) => rows.some((row) => name in row));
            if (!keyFields.length) continue;
            const matched = rows.filter((row) => keyFields.every(([name, value]) => sameValue(row[name], value)));
            // With the measure aggregated, the noted mark is the whole band its rows stand in.
            const bands = op ? new Set(matched.map((row) => String(row[group!]))) : undefined;
            const values = markValues(bands ? rows.filter((row) => bands.has(String(row[group!]))) : matched);
            if (!values.length) continue;
            const top = Math.max(...values);
            const end = roomPast(top, [lo, hi], length, noteRoomNeed(note.text, chart, measureAt), 'max');
            if (end !== undefined && (!bars || top > 0)) max = Math.max(max ?? -Infinity, end);
        }
        for (const region of regions) {
            const inStretch = stretchOf(encoding, region.x);
            if (!inStretch) continue;
            const values = markValues(rows.filter(inStretch));
            if (!values.length) continue;
            const need = regionRoomNeed(region.text!, chart, measureAt);
            const top = Math.max(...values);
            // A series that leaves a row free beneath it takes its caption there.
            const below = ((Math.min(...values) - lo) / (hi - lo)) * length;
            if (!bars && below >= need) continue;
            const end = roomPast(top, [lo, hi], length, need, 'max');
            if (end !== undefined && (!bars || top > 0)) max = Math.max(max ?? -Infinity, end);
        }
        // An end the spec states (a semantic bound) is kept; only Flint's own ruled ends move.
        if (max === undefined || (!ruled && encodings.some((e) => e.scale?.domainMax !== undefined))) return;
        if (encodings.some((e) => e !== enc && e.scale?.domainMax !== undefined && e.scale.domainMax !== scale.domainMax)) return;

        if (ruled) {
            const values: number[] = enc.axis.values;
            const step = values.length > 1 ? values[1] - values[0] : 0;
            if (!(step > 0)) return;
            const ticks = [...values];
            // The end rounds up at a fine step, not a whole tick step: an axis may end between ticks,
            // and a whole step can double the room the caption needs.
            const fine = Math.min(step / 2, tickStep(hi - lo, 20));
            const top = +(Math.ceil(max / fine - 1e-9) * fine).toPrecision(12);
            while (ticks[ticks.length - 1] + step <= top + 1e-9) ticks.push(+(ticks[ticks.length - 1] + step).toPrecision(12));
            for (const e of encodings) {
                e.scale = { ...e.scale, domainMax: top };
                if (e.axis && Array.isArray(e.axis.values)) e.axis = { ...e.axis, values: ticks, tickCount: ticks.length };
            }
        } else {
            // Rounded up at a fine step (a twentieth of the span, to a round number), not re-niced: a
            // re-niced end can jump a whole major tick (70.2 → 80) and give the caption twice its room.
            const step = tickStep(hi - lo, 20);
            const top = +(Math.ceil(max / step - 1e-9) * step).toPrecision(12);
            for (const e of encodings) e.scale = { ...e.scale, domainMax: top };
        }
    }
}

/**
 * The px an outline needs past a dot it encloses: the hull's padding (6), half its stroke and halo,
 * and the dot's own radius.
 */
const ENCLOSURE_EDGE_ROOM = 12;
const DOT_MARKS = new Set(['point', 'circle', 'square', 'line', 'trail', 'tick']);

/**
 * Room for the outlines of the enclosures a chart mounts with, where a dot they enclose sits at the
 * edge of a continuous axis: the axis is padded by the px the outline needs, so the outline is drawn
 * whole rather than cut at the plot's edge. Only dots and lines: a bar's outline is its own border.
 */
export function vlReserveEnclosureRoom(
    spec: any,
    enclosures: AssembleOptions['enclosures'],
    data: readonly Row[],
    plot: { width: number; height: number } | undefined,
    semanticTypes: Record<string, string | SemanticAnnotation> | undefined,
): void {
    if (!enclosures?.length || !plot || !data.length) return;
    if (spec.facet || spec.repeat || spec.vconcat || spec.hconcat || spec.concat) return;
    const units: any[] = [spec, ...(Array.isArray(spec.layer) ? spec.layer : [])].filter((unit) => unit?.encoding || unit?.mark);
    const drawn = units.flatMap((unit) => {
        const encoding = { ...(unit === spec ? {} : spec.encoding), ...unit.encoding };
        const mark = markTypeOf(unit.mark ?? spec.mark);
        return mark && DOT_MARKS.has(mark) ? [{ unit, encoding }] : [];
    });
    if (!drawn.length) return;
    const fields = [...new Set(data.flatMap((row) => Object.keys(row)))];
    const temporalFields = (['x', 'y'] as const).flatMap((channel) => {
        const enc = drawn[0].encoding[channel];
        return enc?.field && enc.type === 'temporal' ? [enc.field as string] : [];
    });
    const comparison = { temporalFields, semanticTypes: semanticTypes ?? {} };
    const tests = enclosures.flatMap((enclosure) => (enclosure.targets ?? []).flatMap((target: any) =>
        target && 'select' in target ? [selectorRowTest(target, fields, comparison)].filter((test): test is NonNullable<typeof test> => !!test) : []));
    if (!tests.length) return;
    const enclosed = data.filter((row) => tests.some((test) => test(row)));
    if (!enclosed.length) return;
    for (const channel of ['x', 'y'] as const) {
        const enc = drawn[0].encoding[channel];
        if (!enc?.field || (enc.type !== 'quantitative' && enc.type !== 'temporal') || enc.bin || enc.aggregate) continue;
        const scale = enc.scale ?? {};
        if (Array.isArray(scale.domain) || (scale.type && !['linear', 'utc', 'time'].includes(scale.type))) continue;
        const field: string = enc.field;
        const value = (row: Row): number => {
            const raw = comparableValue(comparison, field, row[field]);
            return typeof raw === 'number' ? raw : raw instanceof Date ? raw.getTime() : Number(raw);
        };
        const all = data.map(value).filter(Number.isFinite);
        const inside = enclosed.map(value).filter(Number.isFinite);
        if (!all.length || !inside.length) continue;
        let lo = Math.min(...all);
        let hi = Math.max(...all);
        if (enc.type === 'quantitative') {
            if (scale.zero ?? false) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
            if (scale.nice !== false && !(typeof scale.domainMin === 'number' && typeof scale.domainMax === 'number')) [lo, hi] = niceExtent(lo, hi);
        }
        if (typeof scale.domainMin === 'number') lo = scale.domainMin;
        if (typeof scale.domainMax === 'number') hi = scale.domainMax;
        if (!(hi > lo)) continue;
        const length = channel === 'x' ? plot.width : plot.height;
        // How near the plot's edge the nearest enclosed dot stands, in px, past the padding already kept.
        const edge = Math.min(...inside.map((v) => Math.min(v - lo, hi - v))) / (hi - lo) * length + (scale.padding ?? 0);
        if (edge >= ENCLOSURE_EDGE_ROOM) continue;
        for (const { encoding } of drawn) {
            const e = encoding[channel];
            if (e?.field !== field) continue;
            e.scale = { ...(e.scale ?? {}), padding: Math.max(e.scale?.padding ?? 0, ENCLOSURE_EDGE_ROOM) };
        }
        // The units carry their own copies of the encoding where they repeat it; the view's is shared.
        for (const unit of units) {
            const e = unit.encoding?.[channel];
            if (e?.field === field) e.scale = { ...(e.scale ?? {}), padding: Math.max(e.scale?.padding ?? 0, ENCLOSURE_EDGE_ROOM) };
        }
    }
}
