// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ChartAssemblyInput, ChartWarning } from '../core/types';
import type { SemanticAnnotation } from '../core/field-semantics';
import { CHART_UPDATE_OPS, DEPRECATED_UPDATE_OPS, isDeprecatedUpdateOp, type ChartOverlaySpec, type ChartUpdate, type ChartUpdateOp, type RegionAnnotationSpec, type UpdateTarget } from '../core/interaction-contracts';
import { temporalFieldValue } from '../core/resolve-semantics';
import { isWhereSelector, selectorConditions, selectorRowTest, selectorText, type RowComparison } from '../core/target-selector';
import { geoOverlayChannels, isGeoOverlay, overlayChannels } from '../vegalite/interactions/presentation/overlay-channels';
import { navigationAxesFor } from '../interactive/spec/admission';
import type { CanvasInteractionDef } from '../interactive/interactions';

type Row = Record<string, unknown>;
type Axis = 'x' | 'y';

/** One op of an update: what it does in field terms, and why it will not apply when it will not. */
export interface UpdateOpCheck {
    op: ChartUpdateOp['op'];
    /** What the op does: `note "Peak" at month = 2022-12-01`. */
    text: string;
    ok: boolean;
    /** Why the op will not apply, with the fix when there is one. */
    reason?: string;
    /** What would make the op better though it applies: a note that repeats what the chart already prints. */
    advice?: string;
    /** The op's name is an older one still read: the name to write instead. */
    deprecated?: string;
}

export interface UpdateCheck {
    id: string;
    ops: UpdateOpCheck[];
}

/** The parts of the assembled chart's interaction semantics the checks read. */
interface Semantics {
    chartType?: string;
    fields?: readonly string[];
    temporalProvenanceFields?: readonly string[];
    axisFields?: Partial<Record<Axis, { field: string; type: string }>>;
    navigationAxes?: readonly Axis[];
    geoNavigation?: boolean;
    reorderAxes?: readonly { axis: Axis; field: string }[];
}

interface Chart {
    rows: Row[];
    semantics: Semantics;
    semanticTypes: Record<string, string | SemanticAnnotation>;
    navigation: readonly Axis[];
    geoNavigation: boolean;
    /** The chart is a map: overlays and regions are placed on it by longitude and latitude. */
    projected: boolean;
    reorderFields: readonly string[];
    /** The fields the chart prints as text on its marks: its value labels. */
    printedFields: readonly string[];
}

/** The fields text marks print in an assembled Vega-Lite spec, at any depth. */
function printedFieldsOf(spec: unknown): string[] {
    const fields = new Set<string>();
    const visit = (node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        const record = node as Record<string, any>;
        const mark = typeof record.mark === 'string' ? record.mark : record.mark?.type;
        const field = record.encoding?.text?.field;
        if (mark === 'text' && typeof field === 'string') fields.add(field);
        for (const key of ['layer', 'vconcat', 'hconcat', 'concat'] as const) {
            if (Array.isArray(record[key])) record[key].forEach(visit);
        }
        if (record.spec) visit(record.spec);
    };
    visit(spec);
    return [...fields];
}

/** The numbers a note's text states, read as written ("1,250", "61", "-3.5"). */
function statedNumbers(text: string): { value: number; decimals: number }[] {
    return [...text.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map(([token]) => {
        const plain = token.replace(/,/g, '');
        return { value: Number(plain), decimals: plain.split('.')[1]?.length ?? 0 };
    }).filter(({ value }) => Number.isFinite(value));
}

/**
 * Advice for a note that restates a value the chart already prints on its mark — "Online leads: 61"
 * over a bar labelled 61. A note is for what the chart does not say: why the mark stands out, what
 * changed, how it compares.
 */
function repeatedValue(chart: Chart, op: Extract<ChartUpdateOp, { op: 'annotate-text' | 'set-annotation' }>): string | undefined {
    const text = op.value?.text;
    if (!text || !('select' in op.target) || isWhereSelector(op.target) || chart.printedFields.length === 0) return undefined;
    const matches = selectorRowTest(op.target, chart.semantics.fields ?? [], comparisonOf(chart));
    if (!matches) return undefined;
    const rows = chart.rows.filter(matches);
    if (rows.length === 0) return undefined;
    const stated = statedNumbers(text);
    for (const field of chart.printedFields) {
        const values = rows.map((row) => row[field]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
        if (values.length === 0) continue;
        // The mark prints its row's value, or the rows' total where the chart sums them.
        const printed = [...values, values.reduce((total, value) => total + value, 0)];
        const repeated = stated.find(({ value, decimals }) => printed.some((shown) => Math.abs(shown - value) < 0.5 * 10 ** -decimals));
        if (repeated) {
            return `the note repeats ${field} ${cell(repeated.value)}, which the chart already prints on the mark. `
                + 'Say what the chart does not: why the mark stands out, what changed, how it compares.';
        }
    }
    return undefined;
}

function cell(value: unknown): string {
    if (value === null || value === undefined) return String(value);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function pairs(key: Readonly<Row>): string {
    return Object.entries(key).map(([field, value]) => `${field} = ${cell(value)}`).join(', ');
}

function plural(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function chartOf(input: ChartAssemblyInput, assembled: unknown, interactions: readonly CanvasInteractionDef[]): Chart {
    const semantics = ((assembled as { _interactionSemantics?: Semantics } | undefined)?._interactionSemantics ?? {}) as Semantics;
    const navigationSource = interactions.find((interaction) => interaction.eventSource.type === 'navigation');
    const viewportRegion = interactions.some((interaction) => interaction.eventSource.viewport);
    const available = semantics.navigationAxes ?? [];
    const navigation = navigationSource
        ? navigationAxesFor(navigationSource.eventSource.axes, available).filter((axis) => available.includes(axis))
        : viewportRegion ? available : [];
    const elementDrag = interactions.some((interaction) =>
        interaction.eventSource.type === 'element' && interaction.eventSource.gesture === 'drag');
    return {
        rows: (input.data?.values ?? []) as Row[],
        semantics,
        semanticTypes: input.semantic_types ?? {},
        navigation,
        geoNavigation: !!semantics.geoNavigation && navigation.length > 0,
        projected: !!semantics.geoNavigation,
        reorderFields: elementDrag ? (semantics.reorderAxes ?? []).map((axis) => axis.field) : [],
        printedFields: printedFieldsOf(assembled),
    };
}

function comparisonOf(chart: Chart): RowComparison {
    return { temporalFields: chart.semantics.temporalProvenanceFields ?? [], semanticTypes: chart.semanticTypes };
}

/** Why a target matches no mark, or undefined when it matches some. Element targets are checked at mount. */
function targetProblem(chart: Chart, target: UpdateTarget): string | undefined {
    if (!('select' in target)) return undefined;
    const conditions = selectorConditions(target);
    const where = isWhereSelector(target);
    if (conditions.length === 0) return where ? 'the target\'s where is empty.' : 'the target key is empty.';
    const empty = conditions.find(([, condition]) => 'in' in condition && condition.in.length === 0);
    if (empty) return `the target lists no value for ${empty[0]}.`;
    const fields = chart.semantics.fields ?? [];
    const unknown = conditions.map(([field]) => field).filter((field) => !fields.includes(field));
    if (unknown.length > 0) {
        return fields.length > 0
            ? `${unknown.join(', ')} ${unknown.length === 1 ? 'is not a field' : 'are not fields'} the marks carry; ${where ? 'select' : 'key'} on ${fields.join(', ')}.`
            : `${chart.semantics.chartType ?? 'This chart'} has no marks a ${where ? 'condition' : 'key'} can target.`;
    }
    const matches = selectorRowTest(target, fields, comparisonOf(chart))!;
    const hit = chart.rows.some(matches);
    return hit ? undefined : `no row has ${selectorText(target)}.`;
}

function targetText(target: UpdateTarget): string {
    if ('select' in target) return selectorText(target);
    return plural(target.elements.length, 'mark');
}

function targetsCheck(chart: Chart, targets: readonly UpdateTarget[]): string | undefined {
    const problems = targets.map((target) => targetProblem(chart, target)).filter((problem): problem is string => !!problem);
    if (problems.length === 0) return undefined;
    return targets.length > 1 ? `${problems.length} of ${targets.length} targets match nothing: ${problems.join(' ')}` : problems[0];
}

const OVERLAY_NEEDS: Record<string, string> = {
    rule: 'x alone, y alone, or x, y, x2 and y2',
    rect: 'x and x2, y and y2, or x, y, x2 and y2',
};

/** Whether one value lands on an axis, the way the axis scale reads it. */
function onAxis(chart: Chart, axis: Axis, value: unknown): boolean {
    const field = chart.semantics.axisFields?.[axis];
    if (!field) return false;
    if (field.type === 'temporal') {
        const time = temporalFieldValue(field.field, value, chart.semanticTypes);
        return typeof time === 'number' ? Number.isFinite(time) : value instanceof Date && Number.isFinite(value.getTime());
    }
    if (field.type === 'quantitative') {
        return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value));
    }
    return chart.rows.some((row) => cell(row[field.field]) === cell(value));
}

/** Why a map overlay cannot be drawn: no map to draw it on, places missing or out of range. */
function geoOverlayProblem(chart: Chart, spec: ChartOverlaySpec): string | undefined {
    if (!chart.projected) return `${chart.semantics.chartType ?? 'This chart'} is no map: place its overlays by x and y.`;
    const channels = geoOverlayChannels(spec);
    if (!channels) {
        return spec.mark === 'rule' || spec.mark === 'rect'
            ? `a ${spec.mark} map overlay needs longitude, latitude, longitude2 and latitude2 encodings, and no x or y.`
            : `a ${spec.mark} map overlay needs longitude and latitude encodings, and no x, y, longitude2 or latitude2.`;
    }
    const rows = spec.data?.values ?? [];
    if (rows.length === 0) return 'the overlay has no rows.';
    for (const channel of channels) {
        const field = spec.encodings[channel]!.field;
        const limit = channel.startsWith('latitude') ? 90 : 360;
        const off = rows.findIndex((row) => {
            const value = row[field];
            return value === null || value === '' || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > limit;
        });
        if (off >= 0) return `overlay row ${off} has no ${channel} in degrees in "${field}" (${cell(rows[off][field])}).`;
    }
    return undefined;
}

function overlayProblem(chart: Chart, spec: ChartOverlaySpec): string | undefined {
    for (const [channel, encoding] of Object.entries(spec.encodings ?? {})) {
        if (typeof encoding === 'string') return `encodings.${channel} must be { "field": "${encoding}" }, not "${encoding}".`;
    }
    if (isGeoOverlay(spec)) return geoOverlayProblem(chart, spec);
    const axes = chart.semantics.axisFields ?? {};
    if (!axes.x || !axes.y) return `${chart.semantics.chartType ?? 'This chart'} has no x and y axes to draw an overlay on.`;
    for (const [channel, encoding] of Object.entries(spec.encodings ?? {})) {
        if (typeof encoding === 'string') return `encodings.${channel} must be { "field": "${encoding}" }, not "${encoding}".`;
        if (!encoding || typeof (encoding as { field?: unknown }).field !== 'string') {
            return `encodings.${channel} must be { "field": "<column of the overlay rows>" }.`;
        }
    }
    const channels = overlayChannels(spec);
    if (!channels) return `a ${spec.mark} overlay needs ${OVERLAY_NEEDS[spec.mark] ?? 'x and y'} encodings.`;
    const rows = spec.data?.values ?? [];
    if (rows.length === 0) return 'the overlay has no rows.';
    for (const channel of channels) {
        const field = spec.encodings[channel]!.field;
        const axis = channel[0] as Axis;
        const missing = rows.findIndex((row) => !(field in row));
        if (missing >= 0) return `overlay row ${missing} has no "${field}" for ${channel}.`;
        const off = rows.find((row) => !onAxis(chart, axis, row[field]));
        if (off) {
            const target = axes[axis]!;
            return `${field} = ${cell(off[field])} is not a value of the ${axis} axis (${target.field}, ${target.type}).`;
        }
    }
    return undefined;
}

function overlayText(name: string, spec: ChartOverlaySpec): string {
    const rows = spec.data?.values ?? [];
    return `overlay "${name}" (${spec.mark}, ${plural(rows.length, 'row')})`;
}

const STATE_VERBS: Record<string, string> = {
    emphasized: 'emphasizes',
    focused: 'focuses',
    highlighted: 'highlights',
    muted: 'mutes',
    normal: 'resets the style of',
};

function regionText(name: string, value: RegionAnnotationSpec): string {
    const span = (['x', 'y', 'longitude', 'latitude'] as const).filter((axis) => value[axis])
        .map((axis) => `${axis} ${(value[axis] as readonly unknown[]).map(cell).join(' to ')}`);
    return `region "${name}" over ${span.join(', ')}${value.text !== undefined ? `, captioned "${value.text}"` : ''}`;
}

/** Why a region cannot be shaded: an axis the chart lacks, a bound off it, a stretch of the wrong length. */
function regionProblem(chart: Chart, value: RegionAnnotationSpec): string | undefined {
    if (value.longitude !== undefined || value.latitude !== undefined) {
        if (!chart.projected) return `${chart.semantics.chartType ?? 'This chart'} is no map: shade its regions by x and y.`;
        if (value.x !== undefined || value.y !== undefined) return 'a map region is a box of longitude and latitude, with no x or y.';
        for (const [axis, limit] of [['longitude', 360], ['latitude', 90]] as const) {
            const bounds = value[axis];
            if (!Array.isArray(bounds) || bounds.length !== 2 || bounds.some((bound) => typeof bound !== 'number' || !Number.isFinite(bound) || Math.abs(bound) > limit)) {
                return `a map region needs ${axis}: [${axis === 'longitude' ? 'west, east' : 'south, north'}], two numbers in degrees.`;
            }
        }
        return undefined;
    }
    const axes = chart.semantics.axisFields ?? {};
    if (!axes.x && !axes.y) {
        return `${chart.semantics.chartType ?? 'This chart'} has no x or y scale to shade; outline its marks with annotate-enclosure instead.`;
    }
    for (const axis of ['x', 'y'] as const) {
        const bounds = value[axis];
        if (!bounds) continue;
        const field = axes[axis];
        if (!field) return `the chart has no ${axis} axis; a region spans ${(['x', 'y'] as const).filter((other) => axes[other]).join(' or ')}.`;
        const banded = field.type === 'nominal' || field.type === 'ordinal';
        if (!banded && bounds.length !== 2) return `${axis} is continuous (${field.field}): give exactly two bounds, [low, high], either of which may be null.`;
        if (banded && bounds.length === 0) return `name the ${field.field} categories the region covers on ${axis}.`;
        const off = bounds.find((bound) => bound !== null && !onAxis(chart, axis, bound));
        if (off !== undefined) return `${cell(off)} is not a value of the ${axis} axis (${field.field}, ${field.type}).`;
    }
    return undefined;
}

function checkOp(chart: Chart, op: ChartUpdateOp): UpdateOpCheck {
    const result = (text: string, reason?: string): UpdateOpCheck =>
        reason ? { op: op.op, text, ok: false, reason } : { op: op.op, text, ok: true };
    switch (op.op) {
        case 'set-style': {
            if (op.targets.length === 0) return result('clears the style');
            const emphasizing = op.value.state === 'emphasized' || op.value.state === 'focused';
            const level = op.value.emphasis && emphasizing && op.value.mutedOpacity === undefined ? ` (${op.value.emphasis})` : '';
            const verb = ((op.value.state && STATE_VERBS[op.value.state]) ?? 'styles') + level;
            return result(`${verb} marks where ${op.targets.map(targetText).join('; ')}`, targetsCheck(chart, op.targets));
        }
        case 'annotate-text':
        case 'set-annotation': {
            const renamed = isDeprecatedUpdateOp(op.op) ? { deprecated: DEPRECATED_UPDATE_OPS[op.op] } : {};
            if (op.value === null) return { ...result(`removes the note at ${targetText(op.target)}`), ...renamed };
            const text = op.value.text !== undefined ? `note "${op.value.text}"` : 'note';
            const checked = { ...result(`${text} at ${targetText(op.target)}`, targetProblem(chart, op.target)), ...renamed };
            const advice = checked.ok ? repeatedValue(chart, op) : undefined;
            return advice ? { ...checked, advice } : checked;
        }
        case 'annotate-region': {
            if (op.value === null) return result(`removes region "${op.name}"`);
            return result(regionText(op.name, op.value), regionProblem(chart, op.value));
        }
        case 'annotate-enclosure': {
            if (op.value === null) return result(`removes enclosure "${op.name}"`);
            const caption = op.value.text !== undefined ? ` "${op.value.text}"` : '';
            const text = `encloses${caption} ${op.value.targets.map(targetText).join('; ')}`;
            if (op.value.targets.length === 0) return result(text, 'the enclosure names no targets; give each group of marks as a target.');
            return result(text, targetsCheck(chart, op.value.targets));
        }
        case 'set-viewport': {
            if (op.value.region) {
                const text = 'frames a region';
                return result(text, chart.geoNavigation ? undefined : 'the chart has no map navigation; add a navigate or brush-zoom interaction to interaction_spec.');
            }
            const axes: Axis[] = op.axes === 'xy' ? ['x', 'y'] : [op.axes];
            const text = `sets the viewport to ${axes.map((axis) => {
                const domain = op.value[axis];
                return domain ? `${axis} ${cell(domain[0])} to ${cell(domain[1])}` : axis;
            }).join(', ')}`;
            const missing = axes.filter((axis) => !chart.navigation.includes(axis));
            if (missing.length === 0) return result(text);
            const offered = chart.semantics.navigationAxes ?? [];
            const reason = missing.some((axis) => !offered.includes(axis))
                ? `${chart.semantics.chartType ?? 'this chart'} cannot navigate ${missing.join(' and ')}${offered.length > 0 ? `; it navigates ${offered.join(' and ')}` : ''}.`
                : `the chart has no navigation on ${missing.join(' and ')}; add a navigate or brush-zoom interaction to interaction_spec.`;
            return result(text, reason);
        }
        case 'set-order': {
            const text = `orders ${op.field}: ${op.values.map(cell).join(', ')}`;
            if (op.scope !== 'category') return result(text, `scope "${op.scope}" is not supported; set-order takes scope "category".`);
            if (chart.reorderFields.includes(op.field)) return result(text);
            const reorderable = (chart.semantics.reorderAxes ?? []).map((axis) => axis.field);
            return result(text, reorderable.includes(op.field)
                ? `the chart has no drag-reorder interaction; add one to interaction_spec.`
                : `${op.field} is not a reorderable category axis here${reorderable.length > 0 ? `; ${reorderable.join(', ')} is` : ''}.`);
        }
        case 'set-overlay':
            if (op.value === null) return result(`removes overlay "${op.name}"`);
            return result(overlayText(op.name, op.value), overlayProblem(chart, op.value));
        case 'set-freeform-overlay': {
            if (op.value === null) return result(`removes freeform overlay "${op.name}"`);
            const targets = op.value.body.flatMap((body) => (body.type === 'clone' ? body.targets : []));
            return result(`freeform overlay "${op.name}"`, targetsCheck(chart, targets));
        }
        case 'set-data':
            return result(`replaces the data with ${plural(op.value.rows.length, 'row')}`);
    }
}

const isObject = (value: unknown): value is Record<string, any> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
const isFilterValue = (value: unknown): boolean =>
    isObject(value) && (Array.isArray(value.in) || (Array.isArray(value.range) && value.range.length === 2));
const isSelector = (select: unknown, sets: boolean): boolean =>
    isObject(select) && ('key' in select) !== ('where' in select) && (
        isObject(select.key)
        || (sets && isObject(select.where) && Object.values(select.where).every(isFilterValue)));
/** A target that names marks; `sets` admits a `where` that describes a set of them. */
const isTarget = (value: unknown, sets = false): boolean =>
    isObject(value) && (isSelector(value.select, sets) || (isObject(value.visual) && Array.isArray(value.elements)));
const isSetTarget = (value: unknown): boolean => isTarget(value, true);
const isObjectOrNull = (value: unknown): boolean => value === null || isObject(value);
const isName = (value: unknown): boolean => typeof value === 'string' && value.length > 0;

type OpShape = { shape: string; fields: Record<string, (value: unknown) => boolean> };

const TEXT_SHAPE = "{ op, target: UpdateTarget, value: { text, anchor?: 'segment' | 'point', highlight?: 'none' | 'light' | 'strong' | 'exclusive' } | null }";

const OP_SHAPES = {
    'set-style': {
        shape: '{ op, targets: UpdateTarget[], value: StyleSpec }',
        fields: { targets: (v: unknown) => Array.isArray(v) && v.every(isSetTarget), value: isObject },
    },
    'annotate-text': {
        shape: TEXT_SHAPE,
        fields: { target: isTarget, value: isObjectOrNull },
    },
    'set-annotation': {
        shape: TEXT_SHAPE,
        fields: { target: isTarget, value: isObjectOrNull },
    },
    'annotate-region': {
        shape: "{ op, name, value: { x?: [lo, hi] | categories[], y?: [lo, hi] | categories[], longitude?: [west, east], latitude?: [south, north], text?, color?, opacity?, layer?: 'under' | 'over', placement? } | null }",
        fields: {
            name: isName,
            // An x or y stretch on a chart with axes; a box of longitude and latitude on a map.
            value: (v: unknown) => v === null || (isObject(v)
                && (Array.isArray(v.x) || Array.isArray(v.y) || Array.isArray(v.longitude) || Array.isArray(v.latitude))
                && (['x', 'y', 'longitude', 'latitude'] as const).every((axis) => v[axis] === undefined || Array.isArray(v[axis]))),
        },
    },
    'annotate-enclosure': {
        shape: "{ op, name, value: { targets: UpdateTarget[], text?, shape?: 'hull' | 'rect' | 'ellipse' | 'circle', connect?: 'auto' | 'all' | 'none', color? } | null }",
        fields: {
            name: isName,
            value: (v: unknown) => v === null || (isObject(v) && Array.isArray(v.targets) && v.targets.every(isSetTarget)),
        },
    },
    'set-viewport': {
        shape: "{ op, axes: 'x' | 'y' | 'xy', value: { x?: [lo, hi], y?: [lo, hi] } }",
        fields: { axes: (v: unknown) => v === 'x' || v === 'y' || v === 'xy', value: isObject },
    },
    'set-order': {
        shape: "{ op, scope: 'category' | 'series' | 'facet', field, values: [] }",
        fields: { scope: isName, field: isName, values: Array.isArray },
    },
    'set-overlay': {
        shape: '{ op, name, value: { mark, data: { values }, encodings: { x?, y?, x2?, y2? } | { longitude, latitude, longitude2?, latitude2? }, role } | null }',
        fields: { name: isName, value: isObjectOrNull },
    },
    'set-freeform-overlay': {
        shape: "{ op, name, value: { coordinateSpace: 'plot' | 'renderer', body: [] } | null }",
        fields: { name: isName, value: isObjectOrNull },
    },
    'set-data': {
        shape: "{ op, source: 'main', value: { rows: [] } }",
        fields: { source: (v: unknown) => v === 'main', value: (v: unknown) => isObject(v) && Array.isArray(v.rows) },
    },
} satisfies Record<ChartUpdateOp['op'], OpShape>;

/** The first malformed part of a ChartUpdate list from JSON, as an error. */
export function updateShapeErrors(updates: unknown, label = 'updates'): ChartWarning[] {
    const fail = (message: string): ChartWarning[] => [{ severity: 'error', code: 'invalid_updates', message }];
    if (!Array.isArray(updates)) return fail(`${label} must be an array of { id, ops }.`);
    const owners = new Map<string, number>();
    for (const [index, update] of updates.entries()) {
        const entry = `${label}[${index}]`;
        if (!update || typeof update !== 'object' || Array.isArray(update)) {
            return fail(`${entry}: expected an object with "id" and "ops".`);
        }
        const { id, ops } = update as { id?: unknown; ops?: unknown };
        if (typeof id !== 'string' || id.length === 0) return fail(`${entry}: "id" must be a non-empty string.`);
        if (!Array.isArray(ops)) return fail(`${entry} (${id}): "ops" must be an array.`);
        for (const [opIndex, op] of ops.entries()) {
            const name = (op as { op?: unknown } | null)?.op;
            if (typeof name !== 'string' || !((CHART_UPDATE_OPS as readonly string[]).includes(name) || isDeprecatedUpdateOp(name))) {
                return fail(
                    `${entry} (${id}).ops[${opIndex}]: unknown op "${String(name)}". Known ops: ${CHART_UPDATE_OPS.join(', ')}.`,
                );
            }
            const { shape, fields }: OpShape = OP_SHAPES[name as ChartUpdateOp['op']];
            const bad = Object.entries(fields).find(([field, check]) => !check((op as Record<string, unknown>)[field]));
            if (bad) {
                const targetNote = bad[0] === 'targets'
                    ? ' A target is { select: { key: { field: value } } } for one mark, or { select: { where: { field: { in: [...] } | { range: [low, high] } } } } for a set.'
                    : bad[0] === 'target'
                        ? ' A target is { select: { key: { field: value } } }: this op acts on one mark, so it takes a key, not a where.'
                        : '';
                return fail(
                    `${entry} (${id}).ops[${opIndex}]: ${name} has a missing or malformed "${bad[0]}". Shape: ${shape}.${targetNote}`,
                );
            }
        }
        const owner = owners.get(id);
        if (owner !== undefined) {
            return fail(`${entry}: duplicate id "${id}" (also used by ${label}[${owner}]). One id holds one layer.`);
        }
        owners.set(id, index);
    }
    return [];
}

/**
 * What each well-formed update will do on the assembled Vega-Lite chart, op by op,
 * given the interactions the chart admits.
 */
export function checkUpdates(
    input: ChartAssemblyInput,
    updates: readonly ChartUpdate[],
    assembled: unknown,
    interactions: readonly CanvasInteractionDef[],
): UpdateCheck[] {
    const chart = chartOf(input, assembled, interactions);
    return updates.map((update) => ({ id: update.id, ops: update.ops.map((op) => checkOp(chart, op)) }));
}
