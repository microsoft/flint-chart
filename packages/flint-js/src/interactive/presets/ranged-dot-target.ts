import type { InteractionContext, SemanticTarget } from '../interactions';

export function expandRangedDotTarget(
    target: SemanticTarget | null,
    context: InteractionContext,
): SemanticTarget | null {
    if (!target || context.chartType !== 'Ranged Dot Plot'
        || target.visual.role === 'legend-item' || !context.categoryField) return target;
    const categories = new Set(target.elements.flatMap((element) =>
        element.records?.map((record) => record[context.categoryField!]) ?? []));
    if (categories.size === 0) return target;
    const elements = context.available?.filter((element) =>
        element.records?.some((record) => categories.has(record[context.categoryField!])));
    return elements?.length ? { ...target, elements } : target;
}
