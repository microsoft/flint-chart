// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ChartAssemblyInput, ChartWarning } from '../core/types';
import type { SemanticAnnotation } from '../core/field-semantics';
import { CHART_UPDATE_OPS, type ChartOverlaySpec, type ChartUpdate, type ChartUpdateOp, type UpdateTarget } from '../core/interaction-contracts';
import { temporalFieldValue } from '../core/resolve-semantics';
import { overlayChannels } from '../vegalite/interactions/presentation/data-overlay';
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
    reorderFields: readonly string[];
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
        reorderFields: elementDrag ? (semantics.reorderAxes ?? []).map((axis) => axis.field) : [],
    };
}

/** A value as the chart compares it: temporal fields as epoch ms, the rest as given. */
function comparable(chart: Chart, field: string, value: unknown): unknown {
    return chart.semantics.temporalProvenanceFields?.includes(field)
        ? temporalFieldValue(field, value, chart.semanticTypes)
        : value;
}

/** Why a target matches no mark, or undefined when it matches some. Element targets are checked at mount. */
function targetProblem(chart: Chart, target: UpdateTarget): string | undefined {
    if (!('select' in target)) return undefined;
    const key = target.select.key;
    const entries = Object.entries(key);
    if (entries.length === 0) return 'the target key is empty.';
    const fields = chart.semantics.fields ?? [];
    const unknown = entries.map(([field]) => field).filter((field) => !fields.includes(field));
    if (unknown.length > 0) {
        return fields.length > 0
            ? `${unknown.join(', ')} ${unknown.length === 1 ? 'is not a field' : 'are not fields'} the marks carry; key on ${fields.join(', ')}.`
            : `${chart.semantics.chartType ?? 'This chart'} has no marks a key can target.`;
    }
    const wanted = entries.map(([field, value]) => [field, comparable(chart, field, value)] as const);
    const matches = chart.rows.some((row) =>
        wanted.every(([field, value]) => Object.is(comparable(chart, field, row[field]), value)));
    return matches ? undefined : `no row has ${pairs(key)}.`;
}

function targetText(target: UpdateTarget): string {
    if ('select' in target) return pairs(target.select.key);
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

function overlayProblem(chart: Chart, spec: ChartOverlaySpec): string | undefined {
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
    muted: 'mutes',
    normal: 'resets the style of',
};

function checkOp(chart: Chart, op: ChartUpdateOp): UpdateOpCheck {
    const result = (text: string, reason?: string): UpdateOpCheck =>
        reason ? { op: op.op, text, ok: false, reason } : { op: op.op, text, ok: true };
    switch (op.op) {
        case 'set-style': {
            if (op.targets.length === 0) return result('clears the style');
            const verb = (op.value.state && STATE_VERBS[op.value.state]) ?? 'styles';
            return result(`${verb} marks where ${op.targets.map(targetText).join('; ')}`, targetsCheck(chart, op.targets));
        }
        case 'set-annotation': {
            if (op.value === null) return result(`removes the note at ${targetText(op.target)}`);
            const text = op.value.text !== undefined ? `note "${op.value.text}"` : 'note';
            return result(`${text} at ${targetText(op.target)}`, targetProblem(chart, op.target));
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
const isTarget = (value: unknown): boolean =>
    isObject(value) && ((isObject(value.select) && isObject(value.select.key)) || (isObject(value.visual) && Array.isArray(value.elements)));
const isObjectOrNull = (value: unknown): boolean => value === null || isObject(value);
const isName = (value: unknown): boolean => typeof value === 'string' && value.length > 0;

type OpShape = { shape: string; fields: Record<string, (value: unknown) => boolean> };

const OP_SHAPES = {
    'set-style': {
        shape: '{ op, targets: UpdateTarget[], value: StyleSpec }',
        fields: { targets: (v: unknown) => Array.isArray(v) && v.every(isTarget), value: isObject },
    },
    'set-annotation': {
        shape: "{ op, target: UpdateTarget, value: { text, anchor?: 'segment' | 'point' } | null }",
        fields: { target: isTarget, value: isObjectOrNull },
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
        shape: '{ op, name, value: { mark, data: { values }, encodings: { x?, y?, x2?, y2? }, role } | null }',
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
            if (typeof name !== 'string' || !(CHART_UPDATE_OPS as readonly string[]).includes(name)) {
                return fail(
                    `${entry} (${id}).ops[${opIndex}]: unknown op "${String(name)}". Known ops: ${CHART_UPDATE_OPS.join(', ')}.`,
                );
            }
            const { shape, fields }: OpShape = OP_SHAPES[name as ChartUpdateOp['op']];
            const bad = Object.entries(fields).find(([field, check]) => !check((op as Record<string, unknown>)[field]));
            if (bad) {
                const targetNote = bad[0].startsWith('target') ? ' UpdateTarget is { select: { key: { field: value } } }.' : '';
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
