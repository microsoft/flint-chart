import type { ChartState, SemanticElement, UpdateTarget } from '../core/interaction-contracts';
import { semanticElementRenderKeys } from '../core/interaction-semantics';
import type { ChartChange, ChartChangeReport, ChartStateFacet } from './types';

export const CHART_STATE_FACETS: readonly ChartStateFacet[] = [
    'selected', 'hidden', 'viewport', 'windows', 'categoryOrder', 'annotations',
];

function stableJson(value: unknown): string {
    return JSON.stringify(value, (_key, item) => {
        if (item instanceof Date) return item.toISOString();
        if (item && typeof item === 'object' && !Array.isArray(item)) {
            return Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]));
        }
        return item;
    }) ?? '';
}

function elementKey(element: SemanticElement): string {
    const renderKeys = semanticElementRenderKeys(element);
    return renderKeys.length > 0 ? [...renderKeys].sort().join('|') : stableJson(element.value);
}

function elementsKey(elements: readonly SemanticElement[]): string {
    return elements.map(elementKey).sort().join(',');
}

function targetKey(target: UpdateTarget): string {
    return 'select' in target ? stableJson(target.select) : `${target.visual.kind}:${elementsKey(target.elements)}`;
}

/** A plain copy of a state whose fields may be live getters, so it stays fixed after later changes. */
export function snapshotChartState(state: ChartState): ChartState {
    return {
        chartType: state.chartType,
        selected: [...state.selected],
        ...(state.entries ? { entries: new Map(state.entries) } : {}),
        ...(state.hidden ? { hidden: [...state.hidden] } : {}),
        ...(state.viewport ? { viewport: state.viewport } : {}),
        ...(state.windows ? { windows: { ...state.windows } } : {}),
        ...(state.categoryOrder ? { categoryOrder: [...state.categoryOrder] } : {}),
        ...(state.annotations ? { annotations: [...state.annotations] } : {}),
    };
}

/** One comparable string per facet, built from semantic identities rather than data rows. */
export function chartStateKeys(state: ChartState): Record<ChartStateFacet, string> {
    const entries = [...(state.entries ?? new Map()).entries()]
        .map(([id, entry]) => `${id}:${entry.layer}:${elementsKey(entry.elements)}`)
        .sort();
    return {
        selected: `${elementsKey(state.selected)}#${entries.join(';')}`,
        hidden: stableJson(state.hidden ?? []),
        viewport: stableJson(state.viewport ?? null),
        windows: stableJson(state.windows ?? null),
        categoryOrder: stableJson(state.categoryOrder ?? null),
        annotations: (state.annotations ?? [])
            .map((annotation) => `${annotation.id}:${targetKey(annotation.target)}:${annotation.text ?? ''}`)
            .sort()
            .join(';'),
    };
}

/**
 * Filters a renderer's change reports down to real changes. Each report is
 * compared with the last state passed on; a report that moves nothing is dropped.
 */
export function createChangeFilter(initial: ChartState): (report: ChartChangeReport) => ChartChange | null {
    let previous = snapshotChartState(initial);
    let previousKeys = chartStateKeys(previous);
    return (report) => {
        const state = snapshotChartState(report.state);
        const keys = chartStateKeys(state);
        const changed = CHART_STATE_FACETS.filter((facet) => keys[facet] !== previousKeys[facet]);
        if (changed.length === 0) return null;
        const change: ChartChange = { ...report, state, previous, changed };
        previous = state;
        previousKeys = keys;
        return change;
    };
}
