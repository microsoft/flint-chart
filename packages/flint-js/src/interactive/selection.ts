import type { ChartAssemblyInput } from '../core/types';
import type { FlintInteractionEventDetail } from './interactions';
import type { CanvasInteractionAction } from './language/events';
import type { ViewportChannel } from './types';

export interface ChartSelectionRange {
    /** The field the channel encodes, when the chart spec names one. */
    field?: string;
    start: unknown;
    end: unknown;
}

/** What one committed gesture selected: the rows under the marks, and the brushed domain range. */
export interface ChartSelection {
    chartId: string;
    interactionId: string;
    action: CanvasInteractionAction;
    range?: Partial<Record<ViewportChannel, ChartSelectionRange>>;
    rows: Record<string, unknown>[];
}

const NAVIGATION_ACTIONS: ReadonlySet<CanvasInteractionAction> = new Set([
    'pan-viewport', 'zoom-viewport', 'reset-viewport',
]);

/** Whether a committed event describes a selection rather than a viewport move. */
export function isSelectionEvent(detail: FlintInteractionEventDetail): boolean {
    return detail.event.phase === 'commit' && !NAVIGATION_ACTIONS.has(detail.event.action);
}

function encodedField(input: ChartAssemblyInput | undefined, channel: ViewportChannel): string | undefined {
    const encoding = input?.chart_spec.encodings?.[channel];
    const first = Array.isArray(encoding) ? encoding[0] : encoding;
    return typeof first === 'string' ? first : first?.field;
}

export function toChartSelection(
    detail: FlintInteractionEventDetail,
    input?: ChartAssemblyInput,
): ChartSelection {
    const { event } = detail;
    const seen = new Set<string>();
    const rows: Record<string, unknown>[] = [];
    for (const element of event.target?.elements ?? []) {
        const records = element.records?.length ? element.records : [element.value];
        for (const record of records) {
            const key = JSON.stringify(record);
            if (seen.has(key)) continue;
            seen.add(key);
            rows.push(record);
        }
    }
    const selection: ChartSelection = {
        chartId: detail.chartId,
        interactionId: detail.interactionId,
        action: event.action,
        rows,
    };
    const { domain, plot } = event.geometry;
    // A rectangle brush inverts both axes, but only its own axis is a selection.
    const axis = plot?.kind === 'rect' ? plot.axis : 'xy';
    for (const channel of ['x', 'y'] as const) {
        const coordinate = domain?.[channel];
        if (coordinate?.kind !== 'interval' || (axis !== 'xy' && axis !== channel)) continue;
        selection.range ??= {};
        selection.range[channel] = {
            field: encodedField(input, channel),
            start: coordinate.start,
            end: coordinate.end,
        };
    }
    return selection;
}
