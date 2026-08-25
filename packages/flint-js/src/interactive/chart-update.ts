import type {
    AnnotationRenderPlan,
    ChartUpdate,
    ChartUpdateProcessor,
    InteractionContext,
    SemanticElement,
} from './interactions';

export function presentInteractionUpdate(
    presentAnnotation: (
        element: SemanticElement,
        context: InteractionContext,
    ) => Pick<AnnotationRenderPlan, 'anchor' | 'placement'>,
): ChartUpdateProcessor {
    return (update, context) => ({
        ops: update.ops.map((op) => op.op === 'annotate'
            ? {
                op: 'render-annotation',
                element: op.element,
                point: op.point,
                annotation: {
                    text: op.text,
                    ...presentAnnotation(op.element, context),
                },
            }
            : op),
    });
}
