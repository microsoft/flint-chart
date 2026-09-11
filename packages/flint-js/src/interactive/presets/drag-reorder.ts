import type { CanvasInteractionDef, DragReorderOptions, SemanticElement } from '../interactions';
import { dragTrigger } from '../triggers';

function categoryValue(element: SemanticElement | undefined, field: string): unknown {
    return element?.records?.[0]?.[field]
        ?? element?.value?.[field]
        ?? (element?.value?.field === field ? element.value.value : undefined);
}

export function reorderValues(
    values: readonly unknown[],
    source: unknown,
    destination: unknown,
): unknown[] {
    const sourceIndex = values.findIndex((value) => Object.is(value, source));
    const destinationIndex = values.findIndex((value) => Object.is(value, destination));
    if (sourceIndex < 0 || destinationIndex < 0 || sourceIndex === destinationIndex) return [...values];
    const reordered = [...values];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(destinationIndex, 0, moved);
    return reordered;
}

export function createDragReorderInteraction(options: DragReorderOptions = {}): CanvasInteractionDef {
    const id = options.id ?? 'drag-reorder';
    return {
        id,
        eventSource: dragTrigger(),
        affordances: [
            { target: 'mark', cursor: 'drag', hover: 'target' },
            { target: 'axis-label', cursor: 'drag', hover: 'target' },
        ],
        handle(event, context) {
            if (event.action !== 'drag' || (event.phase !== 'preview' && event.phase !== 'commit')
                || !event.target || !event.dropTarget) return null;
            const drag = event.geometry.plot?.kind === 'drag' ? event.geometry.plot : undefined;
            const axes = context.reorderAxes?.length
                ? context.reorderAxes
                : context.categoryField && context.categoryAxis
                    ? [{ axis: context.categoryAxis, field: context.categoryField, order: context.categoryOrder ?? [] }]
                    : [];
            const changedAxes = axes.filter(({ field }) => !Object.is(
                categoryValue(event.target?.elements[0], field),
                categoryValue(event.dropTarget?.elements[0], field),
            ));
            const preferredAxis = drag?.axis
                ?? (drag && Math.abs(drag.delta.y) > Math.abs(drag.delta.x) ? 'y' : 'x');
            const selectedAxis = drag?.axis
                ? axes.find(({ axis }) => axis === drag.axis)
                : changedAxes.find(({ axis }) => axis === preferredAxis) ?? changedAxes[0];
            if (!selectedAxis) return null;
            const { axis, field } = selectedAxis;
            const source = categoryValue(event.target.elements[0], field);
            const destination = categoryValue(event.dropTarget.elements[0], field);
            if (event.phase === 'preview') {
                const available = context.available ?? [];
                const axisValues = selectedAxis.order.length > 0
                    ? selectedAxis.order
                    : [...new Set(available.map((element) => categoryValue(element, field))
                        .filter((value) => value !== undefined))];
                const sourceMarks = available.filter((element) =>
                    Object.is(categoryValue(element, field), source));
                const otherMarks = available.filter((element) =>
                    !Object.is(categoryValue(element, field), source));
                const axisElement = (value: unknown) => ({ value: { axis, field, value } });
                const sourceTargets = [
                    ...(sourceMarks.length > 0 ? [{
                        visual: event.target.visual.kind === 'mark'
                            ? event.target.visual
                            : { kind: 'mark' as const, role: 'mark' },
                        elements: sourceMarks,
                    }] : []),
                    {
                        visual: { kind: 'axis' as const, role: 'axis-label' },
                        elements: [axisElement(source)],
                    },
                ];
                const mutedTargets = [
                    ...(otherMarks.length > 0 ? [{
                        visual: { kind: 'mark' as const, role: 'mark' },
                        elements: otherMarks,
                    }] : []),
                    {
                        visual: { kind: 'axis' as const, role: 'axis-label' },
                        elements: axisValues
                            .filter((value) => !Object.is(value, source))
                            .map(axisElement),
                    },
                ];
                const projection = event.geometry.projection?.kind === 'axis'
                    ? event.geometry.projection
                    : undefined;
                const delta = drag?.delta ?? { x: 0, y: 0 };
                const translate = axis === 'x'
                    ? { x: delta.x, y: 0 }
                    : { x: 0, y: delta.y };
                const edge = (axis === 'x' ? delta.x : delta.y) >= 0 ? 'end' : 'start';
                const guide = projection && projection.axis === axis
                    ? axis === 'x'
                        ? {
                            x1: projection.targetBounds.x
                                + (edge === 'end' ? projection.targetBounds.width : 0),
                            y1: projection.plotBounds.y,
                            x2: projection.targetBounds.x
                                + (edge === 'end' ? projection.targetBounds.width : 0),
                            y2: projection.plotBounds.y + projection.plotBounds.height,
                        }
                        : {
                            x1: projection.plotBounds.x,
                            y1: projection.targetBounds.y
                                + (edge === 'end' ? projection.targetBounds.height : 0),
                            x2: projection.plotBounds.x + projection.plotBounds.width,
                            y2: projection.targetBounds.y
                                + (edge === 'end' ? projection.targetBounds.height : 0),
                        }
                    : undefined;
                return {
                    id,
                    ops: [
                        { op: 'set-style', targets: mutedTargets, value: { state: 'muted', opacity: 0.35 } },
                        { op: 'set-style', targets: sourceTargets, value: { state: 'emphasized', opacity: 1 } },
                        {
                            op: 'set-freeform-overlay',
                            name: 'drag-reorder-preview',
                            value: {
                            coordinateSpace: 'plot',
                            body: [
                                {
                                    type: 'clone',
                                    targets: sourceTargets,
                                    transform: { translate },
                                    opacity: 0.62,
                                },
                                ...(guide ? [{
                                    type: 'svg' as const,
                                    content: `<svg xmlns="http://www.w3.org/2000/svg"><line x1="${guide.x1}" y1="${guide.y1}" x2="${guide.x2}" y2="${guide.y2}" stroke="#b85c5c" stroke-opacity="0.88" stroke-width="1.5" stroke-linecap="round"/></svg>`,
                                }] : []),
                            ],
                            },
                        },
                    ],
                };
            }
            const values = selectedAxis.order.length
                ? [...selectedAxis.order]
                : [...new Set((context.available ?? []).map((element) => categoryValue(element, field))
                    .filter((value) => value !== undefined))];
            const orderedValues = reorderValues(values, source, destination);
            // A concrete commit, even when the category did not move, replaces
            // and therefore clears the transient drag preview.
            if (orderedValues.every((value, index) => Object.is(value, values[index]))) {
                return { id, ops: [] };
            }
            const orderOps = [
                { op: 'set-order' as const, scope: 'category' as const, field, values: orderedValues },
                ...axes
                    .filter((candidate) => candidate !== selectedAxis && candidate.field !== field)
                    .map((candidate) => ({
                        op: 'set-order' as const,
                        scope: 'category' as const,
                        field: candidate.field,
                        values: [...candidate.order],
                    })),
            ];
            return {
                id,
                ops: orderOps,
            };
        },
    };
}