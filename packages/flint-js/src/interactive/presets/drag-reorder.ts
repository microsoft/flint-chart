import type { CanvasInteractionDef, DragReorderOptions, SemanticElement } from '../interactions';
import { elementDragTrigger } from '../triggers';

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
        eventSource: elementDragTrigger(),
        affordances: [
            { target: 'mark', cursor: 'drag', hover: 'target' },
            { target: 'axis-label', cursor: 'drag', hover: 'target' },
        ],
        handle(event, context) {
            if (event.action !== 'drag-element' || event.phase !== 'commit'
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
            const values = selectedAxis.order.length
                ? [...selectedAxis.order]
                : [...new Set((context.available ?? []).map((element) => categoryValue(element, field))
                    .filter((value) => value !== undefined))];
            const orderedValues = reorderValues(values, source, destination);
            if (orderedValues.every((value, index) => Object.is(value, values[index]))) return null;
            return {
                id,
                ops: [
                    { op: 'set-order', scope: 'category', field, values: orderedValues },
                    ...axes
                        .filter((candidate) => candidate !== selectedAxis && candidate.field !== field)
                        .map((candidate) => ({
                            op: 'set-order' as const,
                            scope: 'category' as const,
                            field: candidate.field,
                            values: [...candidate.order],
                        })),
                ],
            };
        },
    };
}