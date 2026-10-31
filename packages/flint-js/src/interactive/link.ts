// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Charts connected by the fields they share. The charts hold one condition, a part per field in
 * the words filters use ({ in } or { range }). A selection on any chart sets the parts for the
 * fields its interaction selects by; every chart shows the condition on the fields its marks
 * carry; a reset on any chart clears it everywhere.
 */
import type { ChartAssemblyInput } from '../core/types';
import type { ChartState, ChartUpdate, SemanticElement } from '../core/interaction-contracts';
import type { ChartChange, InteractiveChartSurface } from './types';

/** One field's part of the condition. */
export type LinkPart = { in: unknown[] } | { range: [unknown, unknown] };

/** The linked charts' condition: every part must hold. */
export type LinkCondition = Record<string, LinkPart>;

export interface LinkSpec {
    /** The fields the charts connect on. */
    fields: string[];
    /** Per chart: `send: false` keeps its selections to itself, `receive: false` keeps it as drawn. */
    charts?: Record<string, { send?: boolean; receive?: boolean }>;
}

/** One interaction on a chart that selects, and the connected fields its selection is about. */
export interface LinkGesture {
    preset: string;
    /** The connected fields the gesture selects by: a mark's fields, a group's field, an axis's field. */
    fields: string[];
    /** A hover selects only while the pointer stays; it links on a passing layer. */
    hover: boolean;
}

/** What one chart does in the link. */
export interface ChartLink {
    /** The connected fields a selection on this chart can be about. */
    sends: string[];
    /** The connected fields this chart's marks carry, which it emphasizes by. */
    receives: string[];
    /** The chart's selecting interactions, by interaction id. */
    gestures: Record<string, LinkGesture>;
    /** Why a field or a direction is left out. */
    notes: string[];
}

/** The id of the layer a link writes on every chart it emphasizes. */
export const LINK_LAYER = 'linked-selection';

const MUTED_OPACITY = 0.2;

type SelectedElement = Pick<SemanticElement, 'value' | 'records'> | { value?: Record<string, unknown>; records?: readonly Record<string, unknown>[] };

/** The distinct combinations of the fields among selected marks, from the marks or the rows behind them. */
export function selectionTuples(elements: readonly SelectedElement[], fields: readonly string[]): Record<string, unknown>[] {
    const seen = new Map<string, Record<string, unknown>>();
    const add = (source: Record<string, unknown>) => {
        const tuple: Record<string, unknown> = {};
        for (const field of fields) {
            const value = source[field];
            if (value === undefined || value === null) return;
            tuple[field] = value;
        }
        seen.set(JSON.stringify(tuple), tuple);
    };
    for (const element of elements) {
        if (fields.every((field) => element.value?.[field] !== undefined)) add(element.value!);
        else for (const record of element.records ?? []) add(record);
    }
    return [...seen.values()];
}

const isBrush = (preset: string) => preset === 'brush-x' || preset === 'brush-y';

/**
 * The parts a gesture's selected marks set: a brush the span of each numeric or temporal field it
 * covers, any other gesture the values each field takes.
 */
export function selectionParts(elements: readonly SelectedElement[], gesture: LinkGesture): LinkCondition {
    const tuples = selectionTuples(elements, gesture.fields);
    const parts: LinkCondition = {};
    for (const field of gesture.fields) {
        const values = [...new Map(tuples.map((tuple) => [JSON.stringify(tuple[field]), tuple[field]])).values()];
        if (values.length === 0) continue;
        if (isBrush(gesture.preset) && values.every((value) => typeof value === 'number')) {
            const numbers = values as number[];
            parts[field] = { range: [Math.min(...numbers), Math.max(...numbers)] };
        } else {
            parts[field] = { in: values };
        }
    }
    return parts;
}

/** The fields of the condition a chart shows: those its marks carry. */
export function shownFields(link: ChartLink, condition: LinkCondition): string[] {
    return Object.keys(condition).filter((field) => link.receives.includes(field));
}

/** The layer each chart shows for the condition: emphasis on its marks that meet every part it can read. */
export function conditionUpdates(links: Record<string, ChartLink>, condition: LinkCondition): Map<string, ChartUpdate> {
    const result = new Map<string, ChartUpdate>();
    for (const [id, link] of Object.entries(links)) {
        const fields = shownFields(link, condition);
        if (fields.length === 0) continue;
        result.set(id, {
            id: LINK_LAYER,
            ops: [{
                op: 'set-style',
                targets: [{ select: { where: Object.fromEntries(fields.map((field) => [field, condition[field]])) } }],
                value: { state: 'emphasized', mutedOpacity: MUTED_OPACITY },
            }],
        } as ChartUpdate);
    }
    return result;
}

/** The parts a chart's gesture holds after the reader used it, or null when it holds no marks. */
export function gestureParts(link: ChartLink, interaction: string, state: ChartState, hover: boolean): LinkCondition | null {
    const gesture = link.gestures[interaction];
    if (!gesture || gesture.hover !== hover) return null;
    const entry = state.entries?.get(interaction);
    if (!entry || entry.elements.length === 0 || entry.layer !== (hover ? 'preview' : 'retained')) return null;
    const parts = selectionParts(entry.elements, gesture);
    return Object.keys(parts).length > 0 ? parts : null;
}

/** The condition and the chart each of its parts came from. */
export interface LinkSnapshot {
    /** The committed condition. */
    condition: LinkCondition;
    /** The chart each part was selected on. */
    from: Record<string, string>;
    /** What the charts show: the condition with a hover's parts over it while the pointer stays. */
    shown: LinkCondition;
}

/** The condition the linked charts share, read from their changes. Framework-free; `linkCharts` and `useLinkedCharts` drive it. */
export interface LinkState {
    readonly links: Record<string, ChartLink>;
    snapshot(): LinkSnapshot;
    /**
     * Reads one chart's change. A committed selection joins the condition, a field it holds taking
     * the new part, and returns the interaction whose own emphasis the chart should drop; a gesture
     * that let its marks go, or a reader's reset, clears the condition. Host changes are ignored.
     */
    read(id: string, change: ChartChange): { changed: boolean; dropOwn?: string };
    /**
     * Sets parts from outside the charts (a table row, a filter control), the way a chart's
     * selection does: each field takes the new part, other parts stay. A part of `null` lets that
     * field go. Returns whether the condition changed.
     */
    select(parts: Record<string, LinkPart | null>, from?: string): boolean;
    clear(): boolean;
}

/** The `from` a part set by the host carries when the host names no source. */
export const HOST_SOURCE = 'host';

const EMPTY: LinkCondition = {};

/** `previous` carries a condition across a new check of the charts; parts on fields no chart links any more let go. */
export function createLinkState(links: Record<string, ChartLink>, previous?: Pick<LinkSnapshot, 'condition' | 'from'>): LinkState {
    const linked = new Set(Object.values(links).flatMap((link) => [...link.sends, ...link.receives]));
    const kept = Object.keys(previous?.condition ?? {}).filter((field) => linked.has(field));
    let condition: LinkCondition = kept.length > 0 ? Object.fromEntries(kept.map((field) => [field, previous!.condition[field]])) : EMPTY;
    let from: Record<string, string> = Object.fromEntries(kept.flatMap((field) => (previous!.from[field] ? [[field, previous!.from[field]]] : [])));
    let hovered: { source: string; parts: LinkCondition } | null = null;
    let shown: LinkCondition = condition;
    const reshow = () => {
        shown = hovered ? { ...condition, ...hovered.parts } : condition;
    };
    const clear = (): boolean => {
        if (Object.keys(condition).length === 0) return false;
        condition = EMPTY;
        from = {};
        reshow();
        return true;
    };
    return {
        links,
        snapshot: () => ({ condition, from, shown }),
        clear,
        select(parts, source = HOST_SOURCE) {
            const before = JSON.stringify(condition);
            const nextCondition: LinkCondition = { ...condition };
            const nextFrom = { ...from };
            for (const [field, part] of Object.entries(parts)) {
                if (!linked.has(field)) continue;
                if (part === null) {
                    delete nextCondition[field];
                    delete nextFrom[field];
                } else {
                    nextCondition[field] = part;
                    nextFrom[field] = source;
                }
            }
            if (JSON.stringify(nextCondition) === before) return false;
            condition = Object.keys(nextCondition).length > 0 ? nextCondition : EMPTY;
            from = nextFrom;
            reshow();
            return true;
        },
        read(id, change) {
            const link = links[id];
            if (change.source === 'host' || !link) return { changed: false };
            const interaction = change.interactionId;
            if (interaction && link.gestures[interaction]?.hover) {
                const parts = change.phase === 'preview' ? gestureParts(link, interaction, change.state, true) : null;
                const before = JSON.stringify(hovered);
                if (parts) hovered = { source: id, parts };
                else if (hovered?.source === id) hovered = null;
                if (JSON.stringify(hovered) === before) return { changed: false };
                reshow();
                return { changed: true };
            }
            if (change.reset) return { changed: clear() };
            if (change.phase !== 'commit' || !interaction || !link.gestures[interaction]) return { changed: false };
            const parts = gestureParts(link, interaction, change.state, false);
            if (!parts) return { changed: clear() };
            condition = { ...condition, ...parts };
            from = { ...from, ...Object.fromEntries(Object.keys(parts).map((field) => [field, id])) };
            reshow();
            return { changed: true, dropOwn: interaction };
        },
    };
}

/** One chart to link: its input, from which the link reads what it sends and receives, and its mounted surface. */
export interface LinkedChart {
    input: ChartAssemblyInput;
    surface: InteractiveChartSurface;
}

export interface LinkChartsOptions {
    /** What each chart sends and receives, from `validateLinks`; computed when omitted. */
    links?: Record<string, ChartLink>;
}

export interface ChartsLink {
    /** Resolves once the link reads the charts' changes. */
    readonly ready: Promise<void>;
    /** What each chart sends and receives, and why anything is left out. */
    readonly links: Promise<Record<string, ChartLink>>;
    /** The committed condition, and the chart each part was selected on. */
    condition(): LinkSnapshot;
    /** Every change to the condition; returns the unsubscribe. A host that filters its own rows reads it here. */
    onCondition(listener: (snapshot: LinkSnapshot) => void): () => void;
    /**
     * Selects from outside the charts, e.g. `select({ country: { in: ['India'] } })` from a table
     * row or `select({ region: { in: ['Oceania'] } })` from a filter control. Each field takes the
     * new part and every chart that carries it shows it, as if a chart had selected it; `null`
     * lets a field go. Resolves once the link is ready.
     */
    select(parts: Record<string, LinkPart | null>, options?: { from?: string }): Promise<void>;
    clear(): void;
    destroy(): void;
}

/** What each chart sends and receives, checked against each chart's own validator. Loaded on first use. */
export async function loadLinks(inputs: Record<string, ChartAssemblyInput>, spec: LinkSpec): Promise<Record<string, ChartLink>> {
    const { validateLinks } = await import('../validate/links');
    return validateLinks(inputs, spec);
}

/**
 * The input a link checks: the chart's own, with the presets mounted in code (`mountChart(…,
 * { interactions })`) added to its `interaction_spec`, since those select too. Presets already in
 * the spec are mounted from it, so each id is listed once.
 */
export function linkInput(chart: LinkedChart): ChartAssemblyInput {
    const mounted = chart.surface.interactions ?? [];
    const spec = (chart.input.interaction_spec ?? {}) as { interactions?: readonly unknown[] };
    const listed = spec.interactions ?? [];
    const ids = new Set(listed.map((entry) => {
        const record = (typeof entry === 'string' ? { type: entry } : entry) as { type?: string; id?: string } | null;
        return record?.id ?? record?.type;
    }));
    const added = mounted.flatMap((definition) => {
        const preset = (definition as { preset?: string; presetOptions?: Record<string, unknown> }).preset;
        if (!preset || ids.has(definition.id)) return [];
        ids.add(definition.id);
        return [{ type: preset, id: definition.id, options: (definition as { presetOptions?: Record<string, unknown> }).presetOptions ?? {} }];
    });
    if (added.length === 0) return chart.input;
    return { ...chart.input, interaction_spec: { ...spec, interactions: [...listed, ...added] } } as ChartAssemblyInput;
}

/**
 * Links mounted charts on the fields they share. A selection on one chart emphasizes the marks
 * that meet it on every chart, the source included, through one `linked-selection` layer each;
 * a reset on any chart clears it everywhere. A host that replaces every layer with `setUpdates`
 * removes that layer until the condition next changes.
 */
export function linkCharts(charts: Record<string, LinkedChart>, spec: LinkSpec, options: LinkChartsOptions = {}): ChartsLink {
    const inputs = Object.fromEntries(Object.entries(charts).map(([id, chart]) => [id, linkInput(chart)]));
    const links = options.links ? Promise.resolve(options.links) : loadLinks(inputs, spec);
    const listeners = new Set<(snapshot: LinkSnapshot) => void>();
    const layered = new Set<string>();
    let state: LinkState | null = null;
    let destroyed = false;

    /** Shows the link's state on every chart; a hover follows the pointer, so what it shows jumps. */
    const show = (followsPointer = false) => {
        if (!state || destroyed) return;
        const snapshot = state.snapshot();
        const updates = conditionUpdates(state.links, snapshot.shown);
        const jump = followsPointer ? { transition: { duration: 0 } } : undefined;
        for (const [id, chart] of Object.entries(charts)) {
            const layer = updates.get(id);
            if (layer) {
                layered.add(id);
                void chart.surface.applyUpdate(layer, jump);
            } else if (layered.delete(id)) {
                if (jump) void chart.surface.applyUpdate({ id: LINK_LAYER, ops: [] }, jump);
                else void chart.surface.clearUpdate(LINK_LAYER);
            }
        }
        for (const listener of listeners) listener(snapshot);
    };

    const unsubscribers = Object.entries(charts).map(([id, chart]) => chart.surface.onChange((change) => {
        if (!state) return;
        const { changed, dropOwn } = state.read(id, change);
        if (dropOwn) void chart.surface.clearUpdate(dropOwn);
        if (changed) show(change.phase === 'preview');
    }));

    const ready = links.then((resolved) => {
        if (!destroyed) state = createLinkState(resolved);
    });

    return {
        ready,
        links,
        condition: () => state?.snapshot() ?? { condition: EMPTY, from: {}, shown: EMPTY },
        onCondition(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        async select(parts, options) {
            await ready;
            if (state?.select(parts, options?.from)) show();
        },
        clear() {
            if (state?.clear()) show();
        },
        destroy() {
            destroyed = true;
            for (const unsubscribe of unsubscribers) unsubscribe();
            for (const id of layered) void charts[id]?.surface.clearUpdate(LINK_LAYER);
            layered.clear();
            listeners.clear();
        },
    };
}
